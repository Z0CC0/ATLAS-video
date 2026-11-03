// the plan is pure, so it is tested whole on a synthetic trace; render is tested on an ffmpeg
// test pattern when ffmpeg is on the PATH; record is opt-in (CLIP_TEST_RECORD=1): it captures
// the real screen for one second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalize, dwellCandidates, suggestRegions, cameraPath, cropKeyframes, sendcmd, springStep, followStep, cameraParams, plan, CAMERA, SPRING } from '../tools/clip/src/plan.mjs';
import { render } from '../tools/clip/src/render.mjs';

const W = 640, H = 360, T = 4000;
/** still at (100,100) for 1 s, a sweep, still at (500,300) for 1.2 s, then a sweep out. */
function trace() {
  const s = [];
  for (let t = 0; t <= 1000; t += 16) s.push({ t, x: 100 + (t % 32 ? 1 : 0), y: 100 });
  for (let t = 1016; t < 1600; t += 16) s.push({ t, x: 100 + ((t - 1000) / 600) * 400, y: 100 + ((t - 1000) / 600) * 200 });
  for (let t = 1600; t <= 2800; t += 16) s.push({ t, x: 500, y: 300 + (t % 32 ? 1 : 0) });
  for (let t = 2816; t <= T; t += 16) s.push({ t, x: 500 - ((t - 2800) / 1200) * 400, y: 300 });
  return { width: W, height: H, fps: 30, durationMs: T, samples: s };
}

test('dwells are found where the cursor rests, and become spaced zoom regions', () => {
  const n = normalize(trace().samples, W, H, T);
  const d = dwellCandidates(n);
  assert.equal(d.length, 2, 'two rests');
  assert.ok(Math.abs(d[0].cx - 100 / W) < 0.01 && Math.abs(d[1].cy - 300 / H) < 0.01);
  const r = suggestRegions(n, T, { durationMs: 1500, scale: 1.8 });
  assert.ok(r.length >= 1 && r.length <= 2);
  for (let i = 1; i < r.length; i += 1) assert.ok(r[i].start >= r[i - 1].end, 'regions do not overlap');
  assert.ok(r.every((x) => x.start >= 0 && x.end <= T && x.scale === 1.8));
});

test('a cursor parked on another monitor is dropped, not turned into a rest on the edge', () => {
  const off = [];
  for (let t = 0; t <= 2000; t += 16) off.push({ t, x: -450, y: 1238 }); // second monitor, left of the primary
  for (let t = 2016; t <= 4000; t += 16) off.push({ t, x: 1700 + (t % 32 ? 1 : 0), y: 800 });
  const n = normalize(off, 3440, 1440, 4000);
  assert.ok(n.every((s) => s.cx >= 0 && s.cx <= 1 && s.t >= 2016), 'off-screen samples gone');
  const r = suggestRegions(n, 4000, { durationMs: 2400 });
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0].cx - 1700 / 3440) < 0.01, 'the one region is the real rest, not the edge');
});

test('the camera path is one entry per frame, eases in and out, and never leaves scale 1 outside regions', () => {
  const n = normalize(trace().samples, W, H, T);
  const regions = [{ start: 1000, end: 3000, cx: 0.78, cy: 0.83, scale: 2 }];
  const p = cameraPath(regions, n, T, 30);
  assert.equal(p.length, 120);
  assert.ok(p[0].scale === 1 && Math.abs(p[0].cx - 0.5) < 1e-9, 'starts at rest, centred');
  const mid = p[Math.round(2000 / (1000 / 30))];
  assert.ok(mid.scale > 1.9, `zoomed in the middle, got ${mid.scale}`);
  const tail = p[p.length - 1];
  assert.ok(tail.scale < 1.1, `back out at the end, got ${tail.scale}`);
  for (let i = 1; i < p.length; i += 1) assert.ok(Math.abs(p[i].scale - p[i - 1].scale) < 0.2, 'no jump between frames');
});

test('crop keyframes stay inside the frame, even, aspect-true; sendcmd skips unchanged frames', () => {
  const p = plan(trace(), { fps: 30, scale: 1.8, durationMs: 1500 });
  assert.equal(p.keyframes.length, 120);
  for (const k of p.keyframes) {
    assert.ok(k.w % 2 === 0 && k.h % 2 === 0 && k.x % 2 === 0 && k.y % 2 === 0);
    assert.ok(k.x >= 0 && k.y >= 0 && k.x + k.w <= W && k.y + k.h <= H, `inside: ${JSON.stringify(k)}`);
    assert.ok(Math.abs(k.w / k.h - W / H) < 0.02, 'aspect kept');
  }
  const lines = p.sendcmd.trim().split('\n');
  assert.match(lines[0], /^0\.000 crop w \d+, crop h \d+, crop x \d+, crop y \d+;$/);
  assert.ok(lines.length < p.keyframes.length, 'resting frames emit no command');
});

test('the spring snaps when it would cross its target; the follow factor is frame-rate independent', () => {
  const s = {};
  let v = 0; for (let i = 0; i < 60; i += 1) v = springStep(s, 1, 1000 / 30);
  assert.ok(Math.abs(v - 1) < 0.01 && v <= 1, 'reaches the target without overshoot');
  const one = followStep({ cx: 0, cy: 0 }, { cx: 1, cy: 1 }, 16);
  const two = followStep(followStep({ cx: 0, cy: 0 }, { cx: 1, cy: 1 }, 8), { cx: 1, cy: 1 }, 8);
  assert.ok(Math.abs(one.cx - two.cx) < 0.03, `two half steps ≈ one step: ${one.cx} vs ${two.cx}`);
});

/** Gap between the camera and a cursor parked at (0.8, 0.8) after `frames` frames, for the given knobs. */
function gapAfter(frames, knobs) {
  const still = [];
  for (let t = 0; t <= T; t += 16) still.push({ t, x: 0.8 * W, y: 0.8 * H });
  const n = normalize(still, W, H, T);
  const p = cameraPath([{ start: 0, end: T, cx: 0.8, cy: 0.8, scale: 2 }], n, T, 30, knobs);
  return Math.hypot(p[frames].cx - 0.8, p[frames].cy - 0.8);
}

test('--damping: lower = the camera is slower to reach the cursor, higher = faster; 1 = the tuned follow', () => {
  const N = 20;
  const low = gapAfter(N, { damping: 0.1 }), mid = gapAfter(N, { damping: 0.5 }), full = gapAfter(N, { damping: 1 });
  assert.ok(low > mid && mid > full, `gap after ${N} frames must fall as damping rises: 0.1 -> ${low.toFixed(4)}, 0.5 -> ${mid.toFixed(4)}, 1 -> ${full.toFixed(4)}`);
  assert.ok(low > 2 * full, `0.1 lags far more than 1 (${low.toFixed(4)} vs ${full.toFixed(4)})`);
  assert.equal(gapAfter(N, {}), full, 'no knob = damping 1');
  assert.equal(gapAfter(N, { damping: 5 }), full, 'above 1 is clamped to 1');
  assert.equal(gapAfter(N, { damping: 0 }), low, 'below 0.1 is clamped to 0.1');
  assert.deepEqual(cameraParams({}).follow, cameraParams({ damping: 1 }).follow);
});

test('--stiffness: a stiffer spring reaches its target in fewer steps; 320 = the tuned spring', () => {
  const stepsToReach = (stiffness) => {
    const s = {}; let v = springStep(s, 0, 1000 / 30);
    for (let i = 1; i <= 400; i += 1) { v = springStep(s, 1, 1000 / 30, { ...SPRING, stiffness }); if (Math.abs(v - 1) < 1e-6) return i; }
    return Infinity;
  };
  const soft = stepsToReach(40), tuned = stepsToReach(320), hard = stepsToReach(1500);
  assert.ok(soft > tuned && tuned > hard, `steps to reach: 40 -> ${soft}, 320 -> ${tuned}, 1500 -> ${hard}`);
  assert.equal(cameraParams({}).spring.stiffness, SPRING.stiffness, 'no knob = the tuned stiffness');
  assert.equal(cameraParams({ stiffness: 1e9 }).spring.stiffness, CAMERA.stiffnessMax, 'clamped above');
  assert.equal(cameraParams({ stiffness: -3 }).spring.stiffness, CAMERA.stiffnessMin, 'clamped below');
  assert.equal(cameraParams({ stiffness: NaN }).spring.stiffness, SPRING.stiffness, 'NaN = default');
  const N = 20;
  assert.ok(gapAfter(N, { stiffness: 40 }) > gapAfter(N, { stiffness: 1500 }), 'in the full camera too, soft lags more than hard');
});

test('the defaults reproduce the plan exactly: explicit damping 1 / stiffness 320 == no knobs', () => {
  const a = plan(trace(), { fps: 30, scale: 1.8, durationMs: 1500 });
  const b = plan(trace(), { fps: 30, scale: 1.8, durationMs: 1500, damping: CAMERA.damping, stiffness: CAMERA.stiffness });
  assert.deepEqual(a, b);
  assert.equal(CAMERA.damping, 1); assert.equal(CAMERA.stiffness, 320);
  assert.notDeepEqual(a.keyframes, plan(trace(), { fps: 30, scale: 1.8, durationMs: 1500, damping: 0.3 }).keyframes, 'a different damping changes the crop');
});


const hasFfmpeg = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

test('render: a test pattern goes through the plan and comes out at the requested size', { skip: !hasFfmpeg && 'ffmpeg not on PATH' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-'));
  const input = path.join(dir, 'src.mp4');
  const gen = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=${W}x${H}:rate=30`, '-t', '2', '-pix_fmt', 'yuv420p', input], { encoding: 'utf8' });
  assert.equal(gen.status, 0, gen.stderr);
  const p = plan({ width: W, height: H, fps: 30, durationMs: 2000, samples: [] }, { regions: [{ start: 400, end: 1600, cx: 0.3, cy: 0.3, scale: 2 }] });
  const out = path.join(dir, 'out.mp4');
  const r = await render({ input, output: out, plan: p, width: 320, height: 180 });
  assert.ok(fs.statSync(out).size > 1000);
  assert.equal(r.width, 320);
  const probe = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-i', out], { encoding: 'utf8' });
  assert.match(probe.stderr, /320x180/);
});

test('record: one second of the real screen (opt-in: CLIP_TEST_RECORD=1)', { skip: !(process.env.CLIP_TEST_RECORD === '1' && hasFfmpeg && process.platform === 'win32') && 'opt-in only' }, async () => {
  const { record } = await import('../tools/clip/src/record.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-rec-'));
  const r = await record({ out: path.join(dir, 'rec.mp4'), seconds: 1, fps: 30 });
  assert.ok(fs.statSync(r.out).size > 1000 && r.width > 0 && r.samples > 10, JSON.stringify(r));
  const trace = JSON.parse(fs.readFileSync(r.trace, 'utf8'));
  assert.ok(trace.samples.every((s) => s.t >= 0 && s.t <= 1000));
});
