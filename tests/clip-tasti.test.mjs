// suoni dei tasti. `k` nella traccia (quanti tasti dall'ultimo campione, mai quali) -> un
// evento `key` per tasto, distanziati nello stesso campione, con un tetto al secondo; `tasti: false`
// li spegne; una traccia senza `k` non ne ha. Il grafo audio va in un file (-filter_complex_script);
// il render vero (saltato senza ffmpeg) deve avere energia nella finestra dei tasti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { eventi, filtroAudio, cartellaSuoni, SUONI, TASTI } from '../tools/clip/src/suoni.mjs';
import { plan } from '../tools/clip/src/plan.mjs';
import { render, argomentiRender } from '../tools/clip/src/render.mjs';
import { tastiAccesi, parseArgs } from '../tools/clip/src/cli.mjs';

const FF = process.env.FFMPEG || 'ffmpeg';
const hasFfmpeg = spawnSync(FF, ['-version'], { encoding: 'utf8' }).status === 0;

/** Campioni a 16 ms; `tasti` = {t: k} tasti premuti nel campione a quel t (arrotondato al campione). */
function traccia(tasti, totalMs = 4000) {
  const s = [];
  for (let t = 0; t <= totalMs; t += 16) s.push({ t, x: 100, y: 100, b: 0, k: tasti[t] || 0 });
  return { width: 640, height: 360, fps: 30, durationMs: totalMs, samples: s };
}

test('key: un evento per tasto; due tasti nello stesso campione a 15 ms; file e guadagno del tipo', () => {
  const ev = eventi({ regions: [] }, traccia({ 512: 1, 1008: 2, 3008: 1 }));
  assert.deepEqual(ev.map((e) => [e.t, e.tipo]), [[512, 'key'], [1008, 'key'], [1023, 'key'], [3008, 'key']]);
  assert.ok(ev.every((e) => e.file === SUONI.key.file && e.file === 'key.wav'));
  assert.equal(SUONI.key.gain, 0.6); assert.equal(TASTI.distanzaMs, 15); assert.equal(TASTI.maxAlSecondo, 12);
  assert.ok(fs.existsSync(path.join(cartellaSuoni(), 'key.wav')), 'key.wav e\' nel repo');
});

test('tetto: al massimo 12 tasti al secondo (finestra scorrevole), i successivi saltano, poi si riparte', () => {
  const fitti = {};
  for (let t = 1008; t < 1008 + 30 * 16; t += 16) fitti[t] = 1; // 30 tasti in 480 ms
  for (let t = 2512; t < 2512 + 5 * 16; t += 16) fitti[t] = 1; // 5 tasti un secondo e mezzo dopo
  const ev = eventi({ regions: [] }, traccia(fitti));
  const primi = ev.filter((e) => e.t < 2000), dopo = ev.filter((e) => e.t >= 2000);
  assert.equal(primi.length, 12, `12 dei 30: ${primi.length}`);
  assert.deepEqual(primi.map((e) => e.t), Array.from({ length: 12 }, (_, i) => 1008 + i * 16), 'i primi 12, poi silenzio');
  assert.equal(dopo.length, 5, 'passato un secondo la finestra e\' vuota e i 5 suonano tutti');
  const uno = eventi({ regions: [] }, traccia({ 1008: 20 }));
  assert.equal(uno.length, 12, 'venti tasti in un campione: dodici suoni');
  assert.deepEqual(uno.map((e) => e.t), Array.from({ length: 12 }, (_, i) => 1008 + i * 15));
  const largo = eventi({ regions: [] }, traccia(fitti), { limiteTasti: { maxAlSecondo: 100, distanzaMs: 15 } });
  assert.equal(largo.length, 35, 'con un tetto piu\' alto passano tutti');
});

test('tasti: false li spegne; una traccia senza k (una traccia vecchia) non ne ha; click e zoom restano; ordine nel tempo', () => {
  const tr = traccia({ 1008: 1, 1024: 1, 1040: 1 });
  tr.samples.find((s) => s.t === 2000).b = 1; tr.samples.find((s) => s.t === 2016).b = 1;
  const regions = [{ start: 500, end: 3000, cx: 0.5, cy: 0.5, scale: 1.8, kind: 'typing' }];
  const con = eventi({ regions }, tr);
  assert.deepEqual(con.map((e) => e.tipo), ['zoomIn', 'key', 'key', 'key', 'click', 'zoomOut']);
  const senza = eventi({ regions }, tr, { tasti: false });
  assert.deepEqual(senza.map((e) => e.tipo), ['zoomIn', 'click', 'zoomOut']);
  const vecchia = { samples: tr.samples.map(({ t, x, y, b }) => ({ t, x, y, b })) };
  assert.deepEqual(eventi({ regions }, vecchia).map((e) => e.tipo), ['zoomIn', 'click', 'zoomOut'], 'senza k: come la 0.1.4');
  assert.deepEqual(eventi({ regions: [] }, { samples: [{ t: 1, k: 'x' }, { t: 2, k: -1 }, { t: 3, k: NaN }] }), [], 'k non numerico o negativo = niente');
  for (let i = 1; i < con.length; i += 1) assert.ok(con[i].t >= con[i - 1].t);
});

test('--suoni-tasti: 0/false/no/off spengono, assente o 1 o nudo accendono', async () => {
  assert.equal(tastiAccesi(undefined), true); assert.equal(tastiAccesi(true), true); assert.equal(tastiAccesi('1'), true);
  for (const v of ['0', 'false', 'no', 'off', 'OFF']) assert.equal(tastiAccesi(v), false, v);
  assert.equal(parseArgs(['render', 'a', 'b', '--suoni', '--suoni-tasti', '0']).flags['suoni-tasti'], '0');
});

test('argomentiRender con audioName: il grafo va nel file (-filter_complex_script), la riga resta corta anche con 1500 tasti', () => {
  const fitti = {};
  for (let t = 0; t < 120000; t += 80) fitti[t] = 1; // 1500 tasti in due minuti = 12.5/s, il tetto ne tiene 12/s
  const tr = traccia(fitti, 120000);
  const ev = eventi({ regions: [] }, tr);
  assert.ok(ev.length >= 1300 && ev.length < 1500, `il tetto scorrevole ne tiene meno di 1500: ${ev.length}`);
  const p = { width: 640, height: 360, fps: 30, durationMs: 120000, sendcmd: '', keyframes: [] };
  const { args, filtro } = argomentiRender({ input: 'in.mp4', output: 'out.mp4', plan: p, cmdName: 'c.txt', audioName: 'a.txt', suoni: { eventi: ev, volume: 1 } });
  assert.equal(filtro, filtroAudio(ev, 120000, { volume: 1 }).filtro);
  assert.ok(filtro.length > 32767, `un grafo cosi' (${filtro.length} byte) non starebbe nella riga di comando di Windows`);
  assert.ok(args.includes('-filter_complex_script') && args[args.indexOf('-filter_complex_script') + 1] === 'a.txt' && !args.includes('-filter_complex'));
  assert.ok(args.join(' ').length < 2000, 'la riga di comando resta corta');
  assert.ok(args.includes(path.join(cartellaSuoni(), 'key.wav')), 'key.wav entra come -i');
  const inline = argomentiRender({ input: 'in.mp4', output: 'out.mp4', plan: p, cmdName: 'c.txt', suoni: { eventi: ev.slice(0, 2), volume: 1 } }).args;
  assert.ok(inline.includes('-filter_complex') && !inline.includes('-filter_complex_script'), 'senza audioName il grafo sta in riga come prima');
});

/** mean_volume in dB di una finestra [da, da+dur s] del file (volumedetect); -91 = silenzio digitale. */
function volumeA(file, daS, dur = 0.2) {
  const r = spawnSync(FF, ['-hide_banner', '-ss', String(daS), '-t', String(dur), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  return m ? Number(m[1]) : NaN;
}

test('render --suoni con una raffica: i tasti si sentono nella loro finestra, silenzio fuori, il file del grafo e\' tolto', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-tasti-'));
  const input = path.join(dir, 'src.mp4');
  assert.equal(spawnSync(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-t', '4', '-pix_fmt', 'yuv420p', input], { encoding: 'utf8' }).status, 0);
  const tasti = {};
  for (let i = 0; i < 8; i += 1) tasti[1504 + i * 96] = 1; // 8 tasti da 1.5 a 2.2 s
  const tr = { ...traccia(tasti), focus: [{ t: 1504, x: 400, y: 200, w: 200, h: 24 }] };
  const p = plan(tr, { fps: 30 });
  assert.equal(p.regions.filter((r) => r.kind === 'typing').length, 1);
  const ev = eventi(p, tr);
  assert.equal(ev.filter((e) => e.tipo === 'key').length, 8);
  const out = path.join(dir, 'out.mp4');
  const r = await render({ input, output: out, plan: p, width: 320, height: 180, suoni: { eventi: ev, volume: 1, audioOriginale: false } });
  assert.equal(r.suoni, 10, '8 tasti + zoomIn + zoomOut');
  assert.ok(volumeA(out, 1.5, 0.8) > -45, `tasti udibili nella finestra 1.5-2.3 s: ${volumeA(out, 1.5, 0.8)} dB`);
  assert.ok(volumeA(out, 1.7, 0.1) > -45, `un tasto singolo (1.7 s): ${volumeA(out, 1.7, 0.1)} dB`);
  assert.ok(volumeA(out, 3.4, 0.5) < -80, `silenzio dopo la regione: ${volumeA(out, 3.4, 0.5)} dB`);
  assert.ok(volumeA(out, 0.2, 0.5) < -80, 'silenzio prima');
  assert.ok(!fs.existsSync(path.join(dir, '.out.mp4.audio.txt')) && !fs.existsSync(path.join(dir, '.out.mp4.cmds.txt')), 'i file di comando sono stati tolti');
  const muto = path.join(dir, 'muto.mp4');
  await render({ input, output: muto, plan: p, width: 320, height: 180, suoni: { eventi: eventi(p, tr, { tasti: false }), volume: 1 } });
  assert.ok(volumeA(muto, 1.9, 0.1) < -80, `con i tasti spenti a 1.9 s c'e' silenzio: ${volumeA(muto, 1.9, 0.1)} dB`);
});
