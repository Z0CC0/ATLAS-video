// record — the primary screen to an mp4 with ffmpeg (gdigrab), and the cursor to a JSON trace from
// ONE persistent PowerShell process that samples the position for the whole recording (never a
// process per sample). Windows only in this version. Nothing is uploaded; two files next to each
// other: `<out>` and `<out>.cursor.json`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

/**
 * The poller: first line `screen W H`, then `t x y b k` every ~1000/hz ms, until `ms` have passed,
 * and `f x y w h` on its own line whenever the focus rectangle was read.
 * `b` e' il pulsante sinistro del mouse (1 premuto, 0 no), letto da `Control::MouseButtons`: nessun
 * hook, nessuna DLL, la stessa assembly gia' caricata per il cursore.
 * `k` e' QUANTI tasti sono stati premuti dall'ultimo campione: `GetAsyncKeyState` su
 * ogni codice 0x08..0xFE, contando il bit 0 ("premuto dall'ultima chiamata", cosi' un tasto battuto
 * e rilasciato fra due campioni non si perde) oppure il fronte di discesa rispetto al campione
 * precedente (se un altro programma ha gia' consumato il bit 0). Mouse (0x01..0x06, fuori dal
 * ciclo) e modificatori da soli (Shift, Ctrl, Alt, Win) non contano. PRIVACY: viene scritto solo
 * il numero, mai quale tasto; il codice non conserva ne' emette i codici dei tasti.
 * `f x y w h` e' il rettangolo dell'elemento con il fuoco di tastiera, letto solo
 * quando k > 0 e sono passati almeno 250 ms dall'ultima lettura: prima UI Automation
 * (FocusedElement.BoundingRectangle); se vuoto o piu' grande del 70% dello schermo (un editor o
 * una pagina che e' un unico Document) la riga del caret dal TextPattern dello stesso elemento;
 * poi il caret Win32 di GetGUIThreadInfo (rcCaret di hwndCaret portato in coordinate schermo);
 * se nemmeno quello, nessuna riga. Coordinate relative al monitor primario come `x y`.
 * Le tracce vecchie senza `b`/`k`/focus restano valide: il piano le legge, i suoni non trovano click
 * ne' tasti, nessuna regione di digitazione.
 */
export const POLLER = (hz, ms, countdown) => `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClipKeys {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO info);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  static bool[] down = new bool[256];
  static bool Modifier(int k) { return k == 0x10 || k == 0x11 || k == 0x12 || k == 0x5B || k == 0x5C || (k >= 0xA0 && k <= 0xA5); }
  // how many keys went down since the last call: only a count, never which ones
  public static int KeysPressed() {
    int n = 0;
    for (int k = 0x08; k <= 0xFE; k++) {
      if (Modifier(k)) continue;
      int s = GetAsyncKeyState(k);
      bool now = (s & 0x8000) != 0;
      if ((s & 1) != 0 || (now && !down[k])) n++;
      down[k] = now;
    }
    return n;
  }
  // the caret of the foreground window in screen coordinates, or null
  public static int[] Caret() {
    GUITHREADINFO g = new GUITHREADINFO(); g.cbSize = Marshal.SizeOf(g);
    if (!GetGUIThreadInfo(0, ref g) || g.hwndCaret == IntPtr.Zero) return null;
    POINT p = new POINT(); p.X = g.rcCaret.L; p.Y = g.rcCaret.T;
    if (!ClientToScreen(g.hwndCaret, ref p)) return null;
    return new int[] { p.X, p.Y, g.rcCaret.R - g.rcCaret.L, g.rcCaret.B - g.rcCaret.T };
  }
}
'@
$uia = $true
try { Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes } catch { $uia = $false }
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$left = [System.Windows.Forms.MouseButtons]::Left
$areaMax = 0.7 * $b.Width * $b.Height
# il rettangolo con il fuoco: l'elemento UIA; se vuoto o enorme la riga del caret (TextPattern,
# per editor e pagine che sono un unico Document); poi il caret Win32; $null se niente
function Fuoco {
  if ($uia) {
    try {
      $e = [System.Windows.Automation.AutomationElement]::FocusedElement
      $r = $e.Current.BoundingRectangle
      if (-not $r.IsEmpty -and $r.Width -gt 0 -and $r.Height -gt 0 -and ($r.Width * $r.Height) -le $areaMax) { return @([int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height) }
      $tp = $e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
      $sel = $tp.GetSelection()
      if ($sel.Count -gt 0) {
        $rects = $sel[0].GetBoundingRectangles()
        if ($rects.Count -eq 0) { $riga = $sel[0].Clone(); $riga.ExpandToEnclosingUnit([System.Windows.Automation.Text.TextUnit]::Line); $rects = $riga.GetBoundingRectangles() }
        if ($rects.Count -gt 0) {
          $x0 = [double]::MaxValue; $y0 = [double]::MaxValue; $x1 = -[double]::MaxValue; $y1 = -[double]::MaxValue
          foreach ($q in $rects) { if ($q.X -lt $x0) { $x0 = $q.X }; if ($q.Y -lt $y0) { $y0 = $q.Y }; if (($q.X + $q.Width) -gt $x1) { $x1 = $q.X + $q.Width }; if (($q.Y + $q.Height) -gt $y1) { $y1 = $q.Y + $q.Height } }
          if (($y1 - $y0) -gt 0) { return @([int]$x0, [int]$y0, [int][Math]::Max(1, $x1 - $x0), [int]($y1 - $y0)) }
        }
      }
    } catch { }
  }
  try { $c = [ClipKeys]::Caret(); if ($c -and $c[2] -ge 0 -and $c[3] -gt 0) { return $c } } catch { }
  return $null
}
[void][ClipKeys]::KeysPressed()
# conto alla rovescia prima di partire: una riga su stderr e un beep per secondo, poi un beep piu'
# acuto all'avvio (chi registra deve accorgersene: la prima prova vera e' passata inosservata)
for ($i = ${countdown}; $i -gt 0; $i--) { [Console]::Error.WriteLine("$i"); [Console]::Beep(660, 120); Start-Sleep -Milliseconds 880 }
if (${countdown} -gt 0) { [Console]::Error.WriteLine("REC"); [Console]::Beep(1046, 220) }
[void][ClipKeys]::KeysPressed()
[Console]::Out.WriteLine("screen $($b.Width) $($b.Height)")
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$step = [int](1000 / ${hz})
$fuocoA = -1000
while ($sw.ElapsedMilliseconds -lt ${ms}) {
  $p = [System.Windows.Forms.Cursor]::Position
  $down = if (([System.Windows.Forms.Control]::MouseButtons -band $left) -ne 0) { 1 } else { 0 }
  $k = [ClipKeys]::KeysPressed()
  $t = $sw.ElapsedMilliseconds
  $f = $null
  if ($k -gt 0 -and ($t - $fuocoA) -ge 250) { $fuocoA = $t; $f = Fuoco }
  [Console]::Out.WriteLine("$t $($p.X - $b.X) $($p.Y - $b.Y) $down $k")
  if ($f) { [Console]::Out.WriteLine("f $($f[0] - $b.X) $($f[1] - $b.Y) $($f[2]) $($f[3])") }
  Start-Sleep -Milliseconds $step
}
# fine: due beep discendenti
if (${countdown} -gt 0) { [Console]::Beep(784, 150); [Console]::Beep(523, 250); [Console]::Error.WriteLine("STOP") }
`.trim();

export function ffmpegPath() { return process.env.FFMPEG || 'ffmpeg'; }

/**
 * @param {{out:string, seconds:number, fps?:number, hz?:number, countdown?:number}} o  countdown: secondi di conto alla rovescia con beep prima di registrare (0 = parte subito, muto)
 * @returns {Promise<{out:string, trace:string, width:number, height:number, durationMs:number, samples:number, keys:number, focus:number}>}
 */
export function record({ out, seconds, fps = 30, hz = 60, countdown = 3 }) {
  if (process.platform !== 'win32') return Promise.reject(new Error('record: Windows only in this version (gdigrab + System.Windows.Forms)'));
  if (!(seconds > 0)) return Promise.reject(new Error('record: seconds must be > 0'));
  return new Promise((resolve, reject) => {
    const ms = Math.round(seconds * 1000);
    const samples = [], focus = [];
    let width = 0, height = 0, ffStartMs = null, done = false;
    const cd = Math.max(0, Math.min(10, Math.round(Number(countdown) || 0)));
    const poller = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POLLER(hz, ms + 1500, cd)], { windowsHide: true });
    poller.stderr.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) process.stderr.write(`[clip] ${l.trim()}\n`); });
    const t0 = Date.now();
    let buf = '', ff = null, ffErr = '';
    const fail = (e) => { if (done) return; done = true; try { poller.kill(); } catch { /* gone */ } try { ff && ff.kill(); } catch { /* gone */ } reject(e); };
    poller.on('error', fail);
    poller.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        if (line.startsWith('screen ')) {
          [width, height] = line.split(' ').slice(1).map(Number);
          if (!(width > 0 && height > 0)) return fail(new Error(`record: bad screen bounds "${line}"`));
          // the screen is known: start the capture now. The poller's stopwatch started just before
          // this line was written (after PowerShell loaded Forms), so the two clocks are aligned on
          // the arrival of this line, not on the process spawn: offset = ffmpeg spawn - line arrival
          const screenAt = Date.now() - t0;
          ffStartMs = (Date.now() - t0) - screenAt;
          ff = spawn(ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', String(fps), '-offset_x', '0', '-offset_y', '0', '-video_size', `${width}x${height}`, '-draw_mouse', '1', '-i', 'desktop', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', out], { windowsHide: true });
          ff.stderr.on('data', (e) => { ffErr += e; });
          ff.on('error', fail);
          ff.on('close', (code) => {
            if (done) return;
            try { poller.kill(); } catch { /* gone */ }
            if (code !== 0 || !fs.existsSync(out)) return fail(new Error(`ffmpeg exited ${code}: ${ffErr.trim().split('\n').pop() || 'no output'}`));
            done = true;
            const inside = (s) => s.t >= 0 && s.t <= ms;
            const trace = { width, height, fps, durationMs: ms, samples: samples.map((s) => ({ t: s.t - ffStartMs, x: s.x, y: s.y, b: s.b, k: s.k })).filter(inside), focus: focus.map((f) => ({ ...f, t: f.t - ffStartMs })).filter(inside) };
            const tracePath = out + '.cursor.json';
            fs.writeFileSync(tracePath, JSON.stringify(trace));
            resolve({ out, trace: tracePath, width, height, durationMs: ms, samples: trace.samples.length, keys: trace.samples.reduce((n, s) => n + s.k, 0), focus: trace.focus.length });
          });
          continue;
        }
        if (line.startsWith('f ')) { // the focus rectangle, read together with the sample just before it
          const [x, y, w, h] = line.split(' ').slice(1).map(Number);
          const last = samples[samples.length - 1];
          if (last && [x, y, w, h].every(Number.isFinite) && w >= 0 && h > 0) focus.push({ t: last.t, x, y, w, h });
          continue;
        }
        const [t, x, y, b, k] = line.split(' ').map(Number);
        if (Number.isFinite(t) && Number.isFinite(x) && Number.isFinite(y)) samples.push({ t, x, y, b: b === 1 ? 1 : 0, k: Number.isFinite(k) && k > 0 ? Math.round(k) : 0 });
      }
    });
    poller.on('close', () => { if (!ff && !done) fail(new Error('record: the cursor poller ended before reporting the screen')); });
  });
}
