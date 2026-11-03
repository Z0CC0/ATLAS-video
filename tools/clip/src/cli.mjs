#!/usr/bin/env node
// clip — record the screen with the cursor, plan the camera, render the zoomed video.
//   clip record <out.mp4> --seconds N [--fps 30] [--hz 60]
//   clip plan   <in.mp4>  [--scale 1.8] [--duration 2400] [--no-follow] [--damping 1] [--stiffness 320] [--fps 30]   -> <in.mp4>.plan.json
//   clip render <in.mp4> <out.mp4> [--plan <file>] [--width W] [--height H] [--crf 18] [--suoni] [--suoni-volume 1] [--suoni-tasti 0]
//   clip make   <out.mp4> --seconds N [--countdown 3] [--scale 1.8] [--damping 1] [--stiffness 320] [--width W] [--height H] [--suoni] [--suoni-volume 1] [--suoni-tasti 0]   (record + plan + render)
import fs from 'node:fs';
import { record } from './record.mjs';
import { plan, CAMERA } from './plan.mjs';
import { render, probe } from './render.mjs';
import { eventi } from './suoni.mjs';

export function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith('--')) { flags[k] = v; i += 1; } else flags[k] = true; }
    else pos.push(a);
  }
  return { pos, flags };
}

const num = (v, d) => (v === undefined ? d : Number(v));

export async function planFor(input, flags) {
  const tracePath = flags.trace || input + '.cursor.json';
  if (!fs.existsSync(tracePath)) throw new Error(`no cursor trace at ${tracePath}: record with clip, or pass --trace`);
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  if (!trace.durationMs) trace.durationMs = (await probe(input)).durationMs;
  return plan(trace, { fps: num(flags.fps, trace.fps || 30), scale: num(flags.scale, 1.8), durationMs: num(flags.duration, 2400), follow: !flags['no-follow'], damping: num(flags.damping, CAMERA.damping), stiffness: num(flags.stiffness, CAMERA.stiffness) });
}

/** `--suoni-tasti 0|false|no|off` spegne i suoni dei tasti; assente, `--suoni-tasti` o `1` = accesi. */
export function tastiAccesi(v) { return !(v !== undefined && /^(0|false|no|off)$/i.test(String(v))); }

/**
 * Le opzioni `suoni` per render: nulla senza --suoni; altrimenti gli eventi (click e tasti dalla
 * traccia, zoom dal piano), il volume e se l'ingresso ha gia' audio da tenere sotto. Una traccia
 * assente o senza `b`/`k` da' solo gli zoom; `--suoni-tasti 0` toglie i tasti.
 */
export async function suoniFor(input, p, flags) {
  if (!flags.suoni) return undefined;
  const tracePath = flags.trace || input + '.cursor.json';
  const trace = fs.existsSync(tracePath) ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : { samples: [] };
  const ev = eventi(p, trace, { tasti: tastiAccesi(flags['suoni-tasti']) });
  const volume = flags['suoni-volume'] === undefined ? 1 : Number(flags['suoni-volume']);
  if (!(volume >= 0 && volume <= 1)) throw new Error('--suoni-volume must be between 0 and 1');
  return { eventi: ev, volume, audioOriginale: (await probe(input)).audio };
}

export async function main(argv) {
  const { pos, flags } = parseArgs(argv);
  const [cmd, a, b] = pos;
  if (cmd === 'record') {
    if (!a || !flags.seconds) throw new Error('usage: clip record <out.mp4> --seconds N');
    return record({ out: a, seconds: num(flags.seconds), fps: num(flags.fps, 30), hz: num(flags.hz, 60), countdown: num(flags.countdown, 3) });
  }
  if (cmd === 'plan') {
    if (!a) throw new Error('usage: clip plan <in.mp4>');
    const p = await planFor(a, flags);
    const file = flags.out || a + '.plan.json';
    fs.writeFileSync(file, JSON.stringify(p));
    return { plan: file, regions: p.regions.length, typing: p.regions.filter((r) => r.kind === 'typing').length, frames: p.keyframes.length };
  }
  if (cmd === 'render') {
    if (!a || !b) throw new Error('usage: clip render <in.mp4> <out.mp4>');
    const p = flags.plan ? JSON.parse(fs.readFileSync(flags.plan, 'utf8')) : await planFor(a, flags);
    return render({ input: a, output: b, plan: p, width: flags.width ? num(flags.width) : undefined, height: flags.height ? num(flags.height) : undefined, crf: num(flags.crf, 18), suoni: await suoniFor(a, p, flags) });
  }
  if (cmd === 'make') {
    if (!a || !flags.seconds) throw new Error('usage: clip make <out.mp4> --seconds N');
    const raw = a.replace(/\.mp4$/i, '') + '.raw.mp4';
    const rec = await record({ out: raw, seconds: num(flags.seconds), fps: num(flags.fps, 30), hz: num(flags.hz, 60), countdown: num(flags.countdown, 3) });
    const p = await planFor(raw, flags);
    fs.writeFileSync(raw + '.plan.json', JSON.stringify(p)); // come `plan`: le regioni restano leggibili dopo
    const out = await render({ input: raw, output: a, plan: p, width: flags.width ? num(flags.width) : undefined, height: flags.height ? num(flags.height) : undefined, crf: num(flags.crf, 18), suoni: await suoniFor(raw, p, flags) });
    return { raw: rec.out, trace: rec.trace, keys: rec.keys, plan: raw + '.plan.json', regions: p.regions.length, typing: p.regions.filter((r) => r.kind === 'typing').length, ...out };
  }
  throw new Error('usage: clip record|plan|render|make … (see src/cli.mjs)');
}

if (process.argv[1] && /cli\.mjs$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then((r) => { process.stdout.write(JSON.stringify(r) + '\n'); }, (e) => { process.stderr.write(`clip: ${e.message}\n`); process.exit(1); });
}
