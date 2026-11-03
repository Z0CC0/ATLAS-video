// suoni e' puro, quindi si prova intero su piani e tracce sintetici; il mix vero passa da ffmpeg
// su un test pattern (saltato senza ffmpeg): una traccia audio lunga quanto il video, energia
// nelle finestre degli eventi e silenzio digitale fuori, e la somma sopra un audio gia' presente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { eventi, filtroAudio, comandoMix, fileDistinti, cartellaSuoni, SUONI, DEBOUNCE_MS } from '../tools/clip/src/suoni.mjs';
import { plan } from '../tools/clip/src/plan.mjs';
import { render, argomentiRender } from '../tools/clip/src/render.mjs';

const FF = process.env.FFMPEG || 'ffmpeg';
const hasFfmpeg = spawnSync(FF, ['-version'], { encoding: 'utf8' }).status === 0;

/** Campioni a 16 ms con `b` = 1 negli intervalli [giu', su) dati. */
function traccia(premute, totalMs = 4000) {
  const s = [];
  for (let t = 0; t <= totalMs; t += 16) s.push({ t, x: 100, y: 100, b: premute.some(([g, u]) => t >= g && t < u) ? 1 : 0 });
  return { width: 640, height: 360, fps: 30, durationMs: totalMs, samples: s };
}

test('click: un fronte di salita per pressione, i rimbalzi entro il debounce sono uno solo', () => {
  const tr = traccia([[500, 560], [576, 600], [1000, 1100], [1060, 1200], [3000, 3016]]);
  const ev = eventi({ regions: [] }, tr);
  assert.deepEqual(ev.map((e) => e.tipo), ['click', 'click', 'click']);
  assert.deepEqual(ev.map((e) => e.t), [512, 1008, 3008], 'il rimbalzo a 576 (64 ms dopo 512) sparisce; 1060 e\' dentro una pressione gia\' aperta');
  assert.ok(ev.every((e) => e.file === SUONI.click.file));
  assert.equal(DEBOUNCE_MS, 80);
  const lenti = eventi({ regions: [] }, traccia([[500, 520], [700, 720]]), { debounceMs: 500 });
  assert.equal(lenti.length, 1, 'un debounce piu\' largo fonde anche due click distinti');
});

test('zoom: un zoomIn all\'inizio di ogni regione, un zoomOut a fine - easeMs, mai prima dell\'inizio', () => {
  const regions = [{ start: 1000, end: 3400, cx: 0.5, cy: 0.5, scale: 1.8 }, { start: 5000, end: 5200, cx: 0.5, cy: 0.5, scale: 1.8 }];
  const ev = eventi({ regions }, { samples: [] });
  assert.deepEqual(ev.map((e) => [e.t, e.tipo]), [[1000, 'zoomIn'], [3050, 'zoomOut'], [5000, 'zoomIn'], [5000, 'zoomOut']]);
  assert.equal(ev[0].file, SUONI.zoomIn.file); assert.equal(ev[1].file, SUONI.zoomOut.file);
  const corto = eventi({ regions }, { samples: [] }, { easeMs: 100 });
  assert.equal(corto[1].t, 3300);
  assert.deepEqual(eventi({ regions: [{ start: 5, end: 5 }, { start: 'x', end: 9 }] }, { samples: [] }), [], 'regioni degeneri ignorate');
});

test('una traccia senza `b` (una traccia vecchia) da\' zero click e nessun errore; gli eventi sono ordinati', () => {
  const vecchia = { width: 640, height: 360, fps: 30, durationMs: 4000, samples: [{ t: 0, x: 1, y: 1 }, { t: 16, x: 2, y: 2 }, { t: 32, x: 3, y: 3 }] };
  assert.deepEqual(eventi({ regions: [] }, vecchia), []);
  assert.deepEqual(eventi({ regions: [] }, { samples: [] }), []);
  assert.deepEqual(eventi({}, {}), []);
  assert.deepEqual(eventi(null, null), []);
  const misto = eventi({ regions: [{ start: 1000, end: 3400 }] }, traccia([[200, 300], [2000, 2100]]));
  assert.deepEqual(misto.map((e) => e.tipo), ['click', 'zoomIn', 'click', 'zoomOut']);
  for (let i = 1; i < misto.length; i += 1) assert.ok(misto[i].t >= misto[i - 1].t);
});

test('dal piano vero: ogni regione produce la sua coppia di zoom, i click vengono dalla traccia', () => {
  const tr = traccia([[1200, 1300]]);
  for (let i = 0; i < tr.samples.length; i += 1) { const t = tr.samples[i].t; if (t > 1600 && t < 2200) { tr.samples[i].x = 100 + (t - 1600); tr.samples[i].y = 100 + (t - 1600) / 2; } else if (t >= 2200) { tr.samples[i].x = 500; tr.samples[i].y = 300; } }
  const p = plan(tr, { fps: 30, durationMs: 1200 });
  assert.ok(p.regions.length >= 1);
  const ev = eventi(p, tr);
  assert.equal(ev.filter((e) => e.tipo === 'zoomIn').length, p.regions.length);
  assert.equal(ev.filter((e) => e.tipo === 'zoomOut').length, p.regions.length);
  assert.equal(ev.filter((e) => e.tipo === 'click').length, 1);
});

test('il filtro ffmpeg contiene solo numeri, etichette e nomi di filtro: i percorsi restano fuori', () => {
  const ev = eventi({ regions: [{ start: 1000, end: 3400 }] }, traccia([[500, 560]]));
  const { filtro, inputs, uscita } = filtroAudio(ev, 4000, { volume: 0.5 });
  assert.match(filtro, /^[A-Za-z0-9_\[\]=:|<+,;.\s-]+$/, filtro);
  assert.ok(!/[\\/'"$`&>()]/.test(filtro), 'niente separatori di percorso, apici o shell');
  assert.deepEqual(inputs, ['click.wav', 'zoom-in.wav', 'zoom-out.wav']);
  assert.deepEqual(fileDistinti(ev), inputs);
  assert.equal(uscita, '[mix]');
  assert.match(filtro, /^anullsrc=r=48000:cl=stereo,atrim=duration=4\.000\[sil\];/);
  assert.match(filtro, /\[1:a\][^;]*asplit=1\[s0\];\[s0\]adelay=512\|512,volume=0\.450\[e0\]/, 'click al 90% del volume 0.5');
  assert.match(filtro, /adelay=1000\|1000,volume=0\.350/, 'zoomIn al 70%');
  assert.match(filtro, /adelay=3050\|3050,volume=0\.275/, 'zoomOut al 55%');
  assert.match(filtro, /\[sil\]\[e0\]\[e1\]\[e2\]amix=inputs=4:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0\.95:level=0\[mix\]$/);
  assert.ok(!filtro.includes('[0:a]'), 'senza audio originale il video non entra nel mix');
  const sopra = filtroAudio(ev, 4000, { audioOriginale: true }).filtro;
  assert.match(sopra, /\[0:a\]aresample=48000,pan=stereo\|FL<FC\+FL\|FR<FC\+FR,[^;]*\[orig\];/); assert.match(sopra, /\[sil\]\[orig\]\[e0\]/); assert.match(sopra, /amix=inputs=5:/);
  assert.ok(!/[\\/'"$`&>()]/.test(sopra), 'anche con l\'audio originale: niente percorsi o apici');
  assert.match(filtroAudio(ev, 4000, { volume: 7 }).filtro, /volume=0\.900\[e0\]/, 'volume sopra 1 e\' bloccato a 1');
  assert.match(filtroAudio(ev, 4000, { volume: -1 }).filtro, /volume=0\.000\[e0\]/, 'volume sotto 0 e\' bloccato a 0');
  const vuoto = filtroAudio([], 4000);
  assert.deepEqual(vuoto.inputs, []); assert.match(vuoto.filtro, /\[sil\]amix=inputs=1:/);
});

test('comandoMix e argomentiRender: i WAV entrano come -i dalla cartella spedita, il grafo e\' quello di filtroAudio', () => {
  const ev = eventi({ regions: [{ start: 1000, end: 3400 }] }, traccia([[500, 560]]));
  const { args, inputs } = comandoMix('in.mp4', 'out.mp4', ev, { durataMs: 4000 });
  const base = cartellaSuoni();
  assert.ok(fs.existsSync(path.join(base, 'click.wav')) && fs.existsSync(path.join(base, 'zoom-in.wav')) && fs.existsSync(path.join(base, 'zoom-out.wav')), 'i tre WAV sono nel repo');
  assert.equal(inputs.length, 3);
  for (const f of inputs) assert.ok(args.includes(path.join(base, f).replace(/\\/g, '/')) || args.includes(path.join(base, f)) || args.includes(base + '/' + f), `input ${f}`);
  assert.deepEqual(args.slice(-11), ['-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', 'out.mp4']);
  assert.equal(args[args.indexOf('-filter_complex') + 1], filtroAudio(ev, 4000).filtro);
  const p = { width: 640, height: 360, fps: 30, durationMs: 4000, sendcmd: '', keyframes: [] };
  const con = argomentiRender({ input: 'in.mp4', output: 'out.mp4', plan: p, cmdName: 'c.txt', suoni: { eventi: ev, volume: 0.5 } }).args;
  assert.ok(con.includes('-filter_complex') && con.includes('aac') && con.filter((a) => a === '-i').length === 4);
  const senza = argomentiRender({ input: 'in.mp4', output: 'out.mp4', plan: p, cmdName: 'c.txt' }).args;
  assert.ok(!senza.includes('-filter_complex') && senza.includes('copy') && senza.filter((a) => a === '-i').length === 1, 'senza suoni il comando e\' quello di prima');
  assert.deepEqual(argomentiRender({ input: 'in.mp4', output: 'out.mp4', plan: p, cmdName: 'c.txt', suoni: { eventi: [] } }).args, senza, 'zero eventi = nessun mix');
});


/** mean_volume in dB di una finestra [da, da+0.2 s] del file (volumedetect); -91 = silenzio digitale. */
function volumeA(file, daS) {
  const r = spawnSync(FF, ['-hide_banner', '-ss', String(daS), '-t', '0.2', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  return m ? Number(m[1]) : NaN;
}
function probeAudio(file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const a = /Audio: (\w+).*?(\d+) Hz/.exec(r.stderr); const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
  return { codec: a && a[1], hz: a && +a[2], durationMs: d ? Math.round(((+d[1]) * 3600 + (+d[2]) * 60 + (+d[3])) * 1000) : 0 };
}

test('render --suoni: traccia audio lunga quanto il video, energia agli eventi, silenzio altrove', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-suoni-'));
  const input = path.join(dir, 'src.mp4');
  assert.equal(spawnSync(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-t', '4', '-pix_fmt', 'yuv420p', input], { encoding: 'utf8' }).status, 0);
  const tr = traccia([[2500, 2600]]);
  const p = plan({ ...tr, samples: [] }, { regions: [{ start: 400, end: 1600, cx: 0.3, cy: 0.3, scale: 2 }] });
  const ev = eventi(p, tr);
  assert.deepEqual(ev.map((e) => [e.t, e.tipo]), [[400, 'zoomIn'], [1250, 'zoomOut'], [2512, 'click']]);
  const out = path.join(dir, 'out.mp4');
  const r = await render({ input, output: out, plan: p, width: 320, height: 180, suoni: { eventi: ev, volume: 1, audioOriginale: false } });
  assert.equal(r.suoni, 3);
  const a = probeAudio(out);
  assert.equal(a.codec, 'aac'); assert.equal(a.hz, 48000); assert.ok(Math.abs(a.durationMs - 4000) <= 60, `durata ${a.durationMs}`);
  assert.ok(volumeA(out, 0.4) > -40, 'zoomIn udibile'); assert.ok(volumeA(out, 1.25) > -50, 'zoomOut udibile'); assert.ok(volumeA(out, 2.512) > -40, 'click udibile');
  assert.ok(volumeA(out, 3.2) < -80, 'silenzio dopo l\'ultimo evento'); assert.ok(volumeA(out, 0.0) < -80 || ev[0].t < 200, 'silenzio prima del primo');
  assert.ok(!fs.existsSync(path.join(dir, '.out.mp4.cmds.txt')), 'il file sendcmd e\' stato tolto');
});

test('render --suoni sopra un video che ha gia\' audio: i suoni si sommano, l\'audio originale resta', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-suoni-mix-'));
  const input = path.join(dir, 'src.mp4');
  // 4 s di test pattern con un tono continuo a 440 Hz a -20 dB
  assert.equal(spawnSync(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '4', '-af', 'volume=0.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input], { encoding: 'utf8' }).status, 0);
  const tr = traccia([[2500, 2600]]);
  const p = plan({ ...tr, samples: [] }, { regions: [] });
  const out = path.join(dir, 'out.mp4');
  await render({ input, output: out, plan: p, width: 320, height: 180, suoni: { eventi: eventi(p, tr), volume: 1, audioOriginale: true } });
  const a = probeAudio(out);
  assert.equal(a.hz, 48000); assert.ok(Math.abs(a.durationMs - 4000) <= 60);
  const fondo = volumeA(out, 1.0), evento = volumeA(out, 2.512), ingresso = volumeA(input, 1.0);
  assert.ok(Math.abs(fondo - ingresso) < 1, `il tono originale c\'e\' ancora, allo stesso livello (${fondo} dB in uscita, ${ingresso} dB nell\'ingresso mono)`);
  assert.ok(evento > fondo + 1, `al click c\'e\' piu\' energia che nel solo tono (${evento} vs ${fondo} dB)`);
});
