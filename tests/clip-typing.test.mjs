// typing regions from `k` (how many keys per sample, never which) and `focus`. Pure, so the
// planner is tested whole on synthetic traces: a burst makes a region on the focus rectangle, the
// rectangle sets the scale, typing beats an overlapping dwell, and a trace without k/focus plans as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, keyBursts, normalizeFocus, suggestTypingRegions, TYPING } from '../tools/clip/src/plan.mjs';

const W = 640, H = 360, T = 6000;
/**
 * A 6 s trace: the mouse rests at (100,100) in [1000, 2600] and at (500,300) in [4000, 5000], and
 * sweeps round a circle 60 px a sample elsewhere (never a rest); a burst of `keys` presses, one per
 * sample every `stepMs` from `from` (default inside the first rest).
 */
function typingTrace(keys, from = 1500, stepMs = 100, focus = [{ t: from, x: 400, y: 200, w: 200, h: 24 }]) {
  const s = [];
  for (let t = 0; t <= T; t += 16) {
    const a = (t / 16) * (60 / 150);
    const p = t >= 1000 && t <= 2600 ? { x: 100 + (t % 32 ? 1 : 0), y: 100 } : t >= 4000 && t <= 5000 ? { x: 500, y: 300 + (t % 32 ? 1 : 0) } : { x: 320 + 150 * Math.cos(a), y: 180 + 150 * Math.sin(a) };
    s.push({ t, x: Math.round(p.x), y: Math.round(p.y), b: 0, k: 0 });
  }
  let pressed = 0, next = from;
  for (const x of s) if (x.t >= next && pressed < keys) { x.k = 1; pressed += 1; next += stepMs; }
  assert.equal(pressed, keys);
  return { width: W, height: H, fps: 30, durationMs: T, samples: s, focus, lastKey: s.filter((x) => x.k).pop().t };
}
/** still at (100,100) for 1 s, a sweep, still at (500,300) for 1.2 s, then a sweep out: the 0.1.0 trace, no b, no k. */
function oldTrace() {
  const s = [];
  for (let t = 0; t <= 1000; t += 16) s.push({ t, x: 100 + (t % 32 ? 1 : 0), y: 100 });
  for (let t = 1016; t < 1600; t += 16) s.push({ t, x: 100 + ((t - 1000) / 600) * 400, y: 100 + ((t - 1000) / 600) * 200 });
  for (let t = 1600; t <= 2800; t += 16) s.push({ t, x: 500, y: 300 + (t % 32 ? 1 : 0) });
  for (let t = 2816; t <= 4000; t += 16) s.push({ t, x: 500 - ((t - 2800) / 1200) * 400, y: 300 });
  return { width: W, height: H, fps: 30, durationMs: 4000, samples: s };
}

test('keyBursts: at least 3 keys within 1.5 s make a burst; 2 keys, or 3 keys 2 s apart, do not; k > 1 counts every key', () => {
  assert.deepEqual(keyBursts([{ t: 100, k: 1 }, { t: 300, k: 1 }, { t: 500, k: 1 }]), [{ first: 100, last: 500, keys: 3 }]);
  assert.deepEqual(keyBursts([{ t: 100, k: 1 }, { t: 300, k: 1 }]), [], 'two keys are not a burst');
  assert.deepEqual(keyBursts([{ t: 100, k: 1 }, { t: 2100, k: 1 }, { t: 4100, k: 1 }]), [], 'keys 2 s apart never group');
  assert.deepEqual(keyBursts([{ t: 100, k: 3 }]), [{ first: 100, last: 100, keys: 3 }], 'three keys in one sample are a burst');
  assert.deepEqual(keyBursts([{ t: 100, k: 1 }, { t: 200, k: 1 }, { t: 300, k: 1 }, { t: 3000, k: 1 }, { t: 3100, k: 1 }, { t: 3200, k: 1 }]).map((b) => b.first), [100, 3000], 'a gap over 1.5 s splits two bursts');
  assert.deepEqual(keyBursts([{ t: 1, x: 2, y: 3 }, { t: 2 }]), [], 'a trace without k has no bursts');
  assert.deepEqual(keyBursts([]), []); assert.deepEqual(keyBursts(undefined), []);
  assert.equal(TYPING.minKeys, 3); assert.equal(TYPING.windowMs, 1500); assert.equal(TYPING.tailMs, 900);
});

test('normalizeFocus: fractions of the screen, off-screen rectangles dropped, edge-crossing ones cut, sorted by t', () => {
  const f = normalizeFocus([{ t: 900, x: 320, y: 180, w: 64, h: 36 }, { t: 100, x: -500, y: 100, w: 100, h: 20 }, { t: 500, x: 600, y: 340, w: 100, h: 50 }, { t: 1, x: 'a', y: 1, w: 1, h: 1 }], W, H, T);
  assert.deepEqual(f.map((r) => r.t), [500, 900], 'the one on another monitor and the bad one are gone');
  assert.deepEqual(f[1], { t: 900, cx: 0.55, cy: 0.55, w: 0.1, h: 0.1 });
  assert.ok(f[0].cx < 1 && f[0].cy < 1 && Math.abs(f[0].w - 40 / W) < 1e-9 && Math.abs(f[0].h - 20 / H) < 1e-9, `cut to the screen: ${JSON.stringify(f[0])}`);
  assert.deepEqual(normalizeFocus(undefined, W, H, T), []);
  const caret = normalizeFocus([{ t: 0, x: 10, y: 10, w: 0, h: 18 }], W, H, T);
  assert.equal(caret.length, 1); assert.ok(caret[0].w > 0, 'a zero-width caret keeps one pixel of width');
});

test('a burst of 8 keys makes one typing region centred on the focus rectangle, scaled so it fills 60% of the frame, that outlives the keys by 900 ms', () => {
  const tr = typingTrace(8, 1500, 100);
  const p = plan(tr, { fps: 30, scale: 1.8 });
  const typing = p.regions.filter((r) => r.kind === 'typing');
  assert.equal(typing.length, 1, JSON.stringify(p.regions));
  const r = typing[0];
  assert.equal(r.start, 1504 - TYPING.leadMs, 'starts leadMs before the first key sample'); assert.equal(r.end, tr.lastKey + TYPING.tailMs); assert.equal(r.keys, 8);
  assert.ok(Math.abs(r.cx - 500 / W) < 1e-9 && Math.abs(r.cy - 212 / H) < 1e-9, 'centred on the field, not on the mouse at (100,100)');
  // the field is 200 px wide on a 640 px screen: 60% of the frame width needs a crop of 333 px = scale 1.92
  assert.ok(Math.abs(r.scale - (0.6 * W) / 200) < 0.01, `scale ${r.scale}`);
  // the camera is on the field while typing (the mouse rests at (100,100)), never pulled toward the mouse;
  // a crop centred at x=500 would cross the right edge, so it is clamped there and the field is still inside
  const mid = p.keyframes[Math.round(2200 / (1000 / 30))];
  assert.ok(Math.abs(mid.w - W / r.scale) < 4, 'zoomed at the region scale');
  assert.ok(Math.abs((mid.x + mid.w / 2) - Math.min(500, W - mid.w / 2)) < 12 && Math.abs((mid.y + mid.h / 2) - 212) < 12, `crop on the field: ${JSON.stringify(mid)}`);
  assert.ok(mid.x <= 400 && mid.x + mid.w >= 600 && mid.y <= 200 && mid.y + mid.h >= 224, 'the whole field is in the crop');
  assert.ok(mid.x > 100, 'the mouse at x=100 is out of the crop: the camera did not go to it');
  assert.ok(r.end > r.start && r.start >= 0 && r.end <= T);
});

test('a caret-sized rectangle zooms to the maximum scale; a huge field zooms only as far as it fits; no rectangle = no region', () => {
  const caret = plan(typingTrace(5, 1500, 100, [{ t: 1500, x: 300, y: 150, w: 2, h: 18 }]), { scale: 1.8 }).regions.find((r) => r.kind === 'typing');
  assert.equal(caret.scale, TYPING.maxScale, `caret -> max scale, got ${caret.scale}`);
  assert.ok(Math.abs(caret.cx - 301 / W) < 1e-6 && Math.abs(caret.cy - 159 / H) < 1e-6);
  const wide = plan(typingTrace(5, 1500, 100, [{ t: 1500, x: 20, y: 20, w: 600, h: 300 }]), { scale: 1.8 }).regions.find((r) => r.kind === 'typing');
  assert.ok(Math.abs(wide.scale - W / 600) < 0.01, `a 600 px field on a 640 px screen fits only at scale 1.067, got ${wide.scale}`);
  const none = plan(typingTrace(5, 1500, 100, []), { scale: 1.8 }).regions;
  assert.ok(!none.some((r) => r.kind === 'typing'), 'no focus rectangle: the mouse is not framed as a field');
  const late = plan(typingTrace(5, 1500, 100, [{ t: 3000, x: 300, y: 150, w: 2, h: 18 }]), { scale: 1.8 }).regions;
  assert.ok(!late.some((r) => r.kind === 'typing'), 'a rectangle read only after the burst does not count for it');
});

test('typing wins over an overlapping dwell: that dwell is skipped, the others survive as kind dwell; explicit regions bypass both', () => {
  const tr = typingTrace(8, 1500, 100); // the burst sits inside the first rest: without keys that rest is a dwell region
  const senza = plan({ ...tr, samples: tr.samples.map((s) => ({ ...s, k: 0 })), focus: [] }, { fps: 30, durationMs: 1500 });
  assert.equal(senza.regions.length, 2, JSON.stringify(senza.regions));
  assert.ok(senza.regions.every((r) => r.kind === 'dwell') && senza.regions[0].start < 2200 && senza.regions[1].start > 3000);
  const con = plan(tr, { fps: 30, durationMs: 1500 });
  const typing = con.regions.filter((r) => r.kind === 'typing'), dwell = con.regions.filter((r) => r.kind === 'dwell');
  assert.equal(typing.length, 1);
  assert.equal(dwell.length, 1, `the dwell under the burst is gone, the one at 4 s stays: ${JSON.stringify(con.regions)}`);
  assert.ok(dwell[0].start > 3000 && Math.abs(dwell[0].cx - 500 / W) < 0.01);
  for (const d of dwell) assert.ok(d.end <= typing[0].start || d.start >= typing[0].end, `dwell ${JSON.stringify(d)} overlaps typing ${JSON.stringify(typing[0])}`);
  for (let i = 1; i < con.regions.length; i += 1) assert.ok(con.regions[i].start >= con.regions[i - 1].end, 'regions sorted and disjoint');
  assert.deepEqual(plan(tr, { regions: [{ start: 0, end: 1000, cx: 0.5, cy: 0.5, scale: 2 }] }).regions, [{ start: 0, end: 1000, cx: 0.5, cy: 0.5, scale: 2 }]);
});

test('a trace without k and focus (recorded before 0.1.5) plans exactly as before: dwell regions only, same keyframes', () => {
  const old = oldTrace();
  const p = plan(old, { fps: 30, scale: 1.8, durationMs: 1500 });
  assert.ok(p.regions.length >= 1 && p.regions.every((r) => r.kind === 'dwell'));
  const zeroKeys = plan({ ...old, samples: old.samples.map((s) => ({ ...s, k: 0 })), focus: [] }, { fps: 30, scale: 1.8, durationMs: 1500 });
  assert.deepEqual(zeroKeys.keyframes, p.keyframes);
  assert.deepEqual(suggestTypingRegions(old.samples, [], T), []);
  assert.deepEqual(suggestTypingRegions(old.samples, normalizeFocus([{ t: 0, x: 1, y: 1, w: 10, h: 10 }], W, H, T), T), [], 'a rectangle without keys makes nothing');
});
