// suoni — effetti sonori sintetici sui click del mouse e sugli zoom della camera. Funzioni pure,
// nessun I/O: da un piano e da una traccia escono gli eventi, dagli eventi esce il filtro ffmpeg.
// I WAV stanno in `assets/suoni/` (fatti con earshot, MIT, vedi `assets/suoni/NOTICE.md`): il
// prodotto spedisce i WAV, non earshot. I percorsi dei WAV passano a ffmpeg come input (`-i`),
// mai dentro il filtergraph: li' finiscono solo numeri, etichette e nomi di filtro.
import { fileURLToPath } from 'node:url';

/** I quattro tipi di evento, il WAV di ciascuno e il guadagno relativo (0..1) con cui entra nel mix. */
export const SUONI = {
  click: { file: 'click.wav', gain: 0.9 },
  key: { file: 'key.wav', gain: 0.6 },
  zoomIn: { file: 'zoom-in.wav', gain: 0.7 },
  zoomOut: { file: 'zoom-out.wav', gain: 0.55 },
};
/** Debounce dei click (ms): due pressioni piu' vicine di cosi' sono un rimbalzo, non due click. */
export const DEBOUNCE_MS = 80;
/**
 * Tasti: piu' tasti nello stesso campione suonano a `distanzaMs` l'uno dall'altro; oltre
 * `maxAlSecondo` tasti accettati in una finestra scorrevole di un secondo, i successivi non suonano
 * (una raffica vera a 12 suoni al secondo e' gia' un tappeto; di piu' si impasta).
 */
export const TASTI = { maxAlSecondo: 12, distanzaMs: 15 };
/** La cartella dei WAV spediti, risolta rispetto a questo file. */
export const CARTELLA_SUONI = new URL('../assets/suoni/', import.meta.url);
/** La stessa cartella (o un'altra, URL o stringa) come percorso di sistema per ffmpeg. */
export function cartellaSuoni(c = CARTELLA_SUONI) { return typeof c === 'string' ? c : fileURLToPath(c); }

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Gli eventi sonori di una registrazione, ordinati nel tempo.
 * - click: fronte di salita di `b` (0 -> 1) nei campioni della traccia, con debounce; una traccia
 *   senza `b` (una traccia vecchia) non produce click e non e' un errore;
 * - key: uno per ogni tasto contato in `k` (quanti tasti dall'ultimo campione: mai quali), i tasti
 *   dello stesso campione a `TASTI.distanzaMs` l'uno dall'altro, al massimo `TASTI.maxAlSecondo`
 *   in ogni secondo scorrevole (i successivi saltano); `tasti: false` li spegne; una traccia
 *   senza `k` (una traccia vecchia) non ne produce;
 * - zoomIn: l'inizio di ogni regione del piano (di sosta o di digitazione); zoomOut: la fine meno
 *   `easeMs` (dove la camera comincia a tornare indietro), mai prima dell'inizio.
 * `file` e' il nome del WAV (relativo a CARTELLA_SUONI), non un percorso: lo risolve chi mixa.
 * @param {{regions?:Array<{start:number,end:number}>}} plan
 * @param {{samples?:Array<{t:number,b?:number,k?:number}>}} trace
 * @param {{easeMs?:number, debounceMs?:number, tasti?:boolean, suoni?:typeof SUONI, limiteTasti?:typeof TASTI}} [opzioni]
 * @returns {Array<{t:number, tipo:'click'|'key'|'zoomIn'|'zoomOut', file:string}>}
 */
export function eventi(plan, trace, { easeMs = 350, debounceMs = DEBOUNCE_MS, tasti = true, suoni = SUONI, limiteTasti = TASTI } = {}) {
  const out = [];
  const tutti = [...((trace && trace.samples) || [])].filter((s) => s && Number.isFinite(s.t)).sort((a, b) => a.t - b.t);
  const samples = tutti.filter((s) => s.b === 0 || s.b === 1);
  let prev = 0, ultimo = -Infinity;
  for (const s of samples) {
    if (prev === 0 && s.b === 1 && s.t - ultimo >= debounceMs) { out.push({ t: s.t, tipo: 'click', file: suoni.click.file }); ultimo = s.t; }
    prev = s.b;
  }
  if (tasti && suoni.key) {
    const accettati = []; // tempi dei tasti che suonano, per il tetto al secondo
    for (const s of tutti) {
      if (!(Number.isFinite(s.k) && s.k > 0)) continue;
      for (let i = 0; i < s.k; i += 1) {
        const t = s.t + i * limiteTasti.distanzaMs;
        while (accettati.length && accettati[0] <= t - 1000) accettati.shift();
        if (accettati.length >= limiteTasti.maxAlSecondo) continue;
        accettati.push(t);
        out.push({ t, tipo: 'key', file: suoni.key.file });
      }
    }
  }
  for (const r of (plan && plan.regions) || []) {
    if (!(Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)) continue;
    out.push({ t: r.start, tipo: 'zoomIn', file: suoni.zoomIn.file });
    out.push({ t: Math.max(r.start, r.end - easeMs), tipo: 'zoomOut', file: suoni.zoomOut.file });
  }
  return out.sort((a, b) => a.t - b.t || a.tipo.localeCompare(b.tipo));
}

/** I WAV distinti usati dagli eventi, nell'ordine in cui vanno passati a ffmpeg come input. */
export function fileDistinti(ev) {
  return [...new Set(ev.map((e) => e.file))];
}

/**
 * Il filtergraph ffmpeg che mixa gli eventi su una traccia lunga `durataMs`. Convenzione sugli
 * input: 0 = il video, 1..n = i WAV di `fileDistinti(eventi)` nello stesso ordine (`primoInput`
 * sposta la base se il chiamante ha altri input prima). Ogni WAV viene sdoppiato (asplit) una
 * copia per evento, ritardato (adelay) e pesato (volume = gain del tipo x volume globale); tutto
 * entra in un amix con un silenzio lungo quanto il video (anullsrc) messo per primo, cosi' la
 * traccia dura esattamente quanto il video; se il video ha gia' audio (`audioOriginale`), `[0:a]`
 * entra nel mix a guadagno 1 invece di essere sostituito. amix non normalizza (normalize=0): i
 * pesi sono gia' sotto 1 e gli eventi di rado si sovrappongono; un alimiter in coda garantisce
 * che la somma non superi `limite` quando capita. Nel grafo entrano solo numeri ed etichette.
 * @returns {{filtro:string, inputs:string[], uscita:string}} filtro, i WAV da passare come -i, l'etichetta di uscita
 */
export function filtroAudio(ev, durataMs, { volume = 1, audioOriginale = false, primoInput = 1, suoni = SUONI, rate = 48000, limite = 0.95 } = {}) {
  const inputs = fileDistinti(ev);
  const vol = clamp(Number.isFinite(volume) ? volume : 1, 0, 1);
  const righe = [];
  const etichette = [];
  const d = (Math.max(0, durataMs) / 1000).toFixed(3);
  righe.push(`anullsrc=r=${rate}:cl=stereo,atrim=duration=${d}[sil]`);
  // pan: un ingresso mono (microfono) va su entrambi i canali a guadagno 1; l'upmix di default di
  // swresample lo metterebbe a -3 dB. Su un ingresso stereo FC non esiste e L/R restano separati.
  if (audioOriginale) { righe.push(`[0:a]aresample=${rate},pan=stereo|FL<FC+FL|FR<FC+FR,aformat=sample_fmts=fltp:channel_layouts=stereo[orig]`); etichette.push('[orig]'); }
  inputs.forEach((file, i) => {
    const miei = ev.map((e, k) => ({ e, k })).filter(({ e }) => e.file === file);
    const src = `[${primoInput + i}:a]`;
    const copie = miei.map(({ k }) => `[s${k}]`);
    righe.push(`${src}aresample=${rate},aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=${miei.length}${copie.join('')}`);
    for (const { e, k } of miei) {
      const gain = (((suoni[e.tipo] && suoni[e.tipo].gain) || 1) * vol).toFixed(3);
      const ms = Math.max(0, Math.round(e.t));
      righe.push(`[s${k}]adelay=${ms}|${ms},volume=${gain}[e${k}]`);
      etichette.push(`[e${k}]`);
    }
  });
  const n = etichette.length + 1;
  righe.push(`[sil]${etichette.join('')}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=${limite}:level=0[mix]`);
  return { filtro: righe.join(';'), inputs, uscita: '[mix]' };
}

/**
 * Il comando ffmpeg completo (argv, senza l'eseguibile) che prende un video gia' renderizzato e
 * gli aggiunge i suoni: video copiato, audio AAC. `cartella` e' dove stanno i WAV (default quelli
 * spediti). Puro: non lancia nulla, non legge il disco.
 * @returns {{args:string[], inputs:string[]}}
 */
export function comandoMix(videoIn, videoOut, ev, { durataMs, volume = 1, audioOriginale = false, cartella = CARTELLA_SUONI } = {}) {
  const base = cartellaSuoni(cartella);
  const { filtro, inputs, uscita } = filtroAudio(ev, durataMs, { volume, audioOriginale });
  const sep = /[\\/]$/.test(base) ? '' : '/';
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoIn];
  for (const f of inputs) args.push('-i', base + sep + f);
  args.push('-filter_complex', filtro, '-map', '0:v', '-map', uscita, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', videoOut);
  return { args, inputs };
}
