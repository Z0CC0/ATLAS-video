// render — apply a plan to a recording with ffmpeg alone: a `sendcmd` file drives the `crop`
// filter frame by frame (w, h, x, y are crop's command targets), then `scale` brings every crop
// back to the output size. Audio, when present, is copied. The command file is written next to
// the output and removed afterwards. Con `suoni` (eventi da `suoni.mjs`) lo stesso passaggio mixa
// anche gli effetti sonori: i WAV entrano come input, il filtergraph audio sta in un file accanto
// all'uscita (-filter_complex_script, tolto dopo) e il video resta su -vf; se l'ingresso ha gia' una
// traccia audio, i suoni le si sommano sopra.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegPath } from './record.mjs';
import { filtroAudio, cartellaSuoni } from './suoni.mjs';

/** Probe the input with ffmpeg itself (no ffprobe needed): width, height, duration in ms. */
export function probe(input) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-i', input], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', () => {
      const dim = /Video:.*?\s(\d{2,5})x(\d{2,5})/.exec(err);
      const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      if (!dim) return reject(new Error(`probe: no video stream in ${input}`));
      const ms = dur ? Math.round(((+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3])) * 1000) : 0;
      resolve({ width: +dim[1], height: +dim[2], durationMs: ms, audio: /Audio:/.test(err) });
    });
  });
}

/**
 * Gli argomenti ffmpeg del render, puri: niente I/O, cosi' sono verificabili. `cmdName` e' il nome
 * (relativo) del file sendcmd; `suoni` = {eventi, volume, audioOriginale, cartella} o nulla. Con
 * `audioName` il grafo audio va in quel file (relativo, `-filter_complex_script`) e torna in
 * `filtro`: una raffica di tasti fa centinaia di eventi e il grafo supererebbe il limite di riga
 * di comando di Windows (32 K); senza, il grafo sta in riga (`-filter_complex`).
 */
export function argomentiRender({ input, output, plan, width, height, crf = 18, cmdName, audioName, suoni }) {
  const outW = width || plan.width, outH = height || plan.height;
  // relative command-file name, cwd = output folder: no drive letters or colons inside the filtergraph
  const vf = `sendcmd=f=${cmdName},crop=w=iw:h=ih:x=0:y=0,scale=${outW}:${outH}:flags=lanczos,setsar=1`;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.resolve(input)];
  const video = ['-vf', vf, '-r', String(plan.fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
  let filtro = null;
  if (suoni && suoni.eventi && suoni.eventi.length) {
    const grafo = filtroAudio(suoni.eventi, plan.durationMs, { volume: suoni.volume, audioOriginale: !!suoni.audioOriginale });
    filtro = grafo.filtro;
    const base = cartellaSuoni(suoni.cartella);
    for (const f of grafo.inputs) args.push('-i', path.join(base, f));
    args.push(...(audioName ? ['-filter_complex_script', audioName] : ['-filter_complex', filtro]), '-map', '0:v', '-map', grafo.uscita, ...video, '-c:a', 'aac', '-b:a', '160k');
  } else {
    args.push(...video, '-c:a', 'copy');
  }
  args.push(path.resolve(output));
  return { args, outW, outH, filtro };
}

/**
 * @param {{input:string, output:string, plan:{fps:number, durationMs:number, sendcmd:string}, width?:number, height?:number, crf?:number, suoni?:{eventi:Array, volume?:number, audioOriginale?:boolean, cartella?:string}}} o
 */
export function render({ input, output, plan, width, height, crf = 18, suoni }) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(path.resolve(output));
    const cmdFile = path.join(dir, `.${path.basename(output)}.cmds.txt`);
    const audioFile = path.join(dir, `.${path.basename(output)}.audio.txt`);
    fs.writeFileSync(cmdFile, plan.sendcmd);
    const { args, outW, outH, filtro } = argomentiRender({ input, output, plan, width, height, crf, cmdName: path.basename(cmdFile), audioName: path.basename(audioFile), suoni });
    if (filtro) fs.writeFileSync(audioFile, filtro);
    const pulisci = () => { for (const f of [cmdFile, audioFile]) { try { fs.unlinkSync(f); } catch { /* */ } } };
    const p = spawn(ffmpegPath(), args, { cwd: dir, windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { pulisci(); reject(e); });
    p.on('close', (code) => {
      pulisci();
      if (code !== 0 || !fs.existsSync(output)) return reject(new Error(`ffmpeg exited ${code}: ${err.trim().split('\n').pop() || 'no output'}`));
      resolve({ output, width: outW, height: outH, frames: plan.keyframes ? plan.keyframes.length : null, suoni: suoni && suoni.eventi ? suoni.eventi.length : 0 });
    });
  });
}
