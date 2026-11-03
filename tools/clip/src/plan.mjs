// plan — from a cursor trace to a camera path to ffmpeg crop keyframes. Pure functions, no I/O.
//
// Logic written from the behaviour of OpenScreen (github.com/siddharthvaddem/openscreen, MIT,
// (c) 2025 Siddharth Vaddem): the dwell detector and the suggestion spacing follow
// `timeline/zoomSuggestionUtils.ts`; the distance-adaptive, frame-rate-independent follow factor
// follows `videoPlayback/cursorFollowUtils.ts`; the per-axis spring chase with the overshoot snap
// follows `videoPlayback/zoomSpring.ts` + `motionSmoothing.ts` (stiffness 320, damping 40, mass
// 0.92), here integrated with a plain semi-implicit Euler step instead of the `motion` library.
// Nothing is copied verbatim; the numbers are theirs because they are tuned.

export const DWELL = { minMs: 450, maxMs: 2600, moveThreshold: 0.02, spacingMs: 1800 };
export const FOLLOW = { minFactor: 0.05, maxFactor: 0.35, rampDistance: 0.15, referenceMs: 1000 / 60 };
export const SPRING = { stiffness: 320, damping: 40, mass: 0.92, restDelta: 0.0005, restSpeed: 0.015 };
/** The two camera knobs exposed to the user, with their defaults (= the tuned behaviour) and bounds. */
export const CAMERA = { damping: 1, dampingMin: 0.1, dampingMax: 1, stiffness: SPRING.stiffness, stiffnessMin: 10, stiffnessMax: 2000 };
/**
 * Typing regions: a burst is at least `minKeys` key presses with no two consecutive ones
 * farther apart than `windowMs`; the region starts `leadMs` before the first key (the plan knows
 * the future), lasts while the keys keep coming and `tailMs` after the last; the camera is on the
 * focus rectangle, scaled so the rectangle fills at least `fillMin` of the frame width, never
 * beyond `maxScale`.
 */
export const TYPING = { minKeys: 3, windowMs: 1500, tailMs: 900, leadMs: 300, fillMin: 0.6, maxScale: 3 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Raw samples {t (ms), x, y (pixels)} -> sorted, normalised {t, cx, cy} in [0,1]. A sample off the
 * recorded screen (the cursor on another monitor: negative x, or beyond width/height) is dropped,
 * not clamped: clamping turned a cursor parked on a second monitor into a "rest" on the edge, and
 * the camera zoomed on an empty corner.
 */
export function normalize(samples, width, height, totalMs) {
  return samples
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= 0 && s.y >= 0 && s.x <= width && s.y <= height)
    .map((s) => ({ t: clamp(s.t, 0, totalMs), cx: s.x / width, cy: s.y / height }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Focus rectangles {t, x, y, w, h (pixels)} -> sorted {t, cx, cy, w, h} in [0,1]: the centre and the
 * size as fractions of the screen. A rectangle entirely off the recorded screen (a field on another
 * monitor) is dropped; one that crosses the edge is cut to the screen.
 */
export function normalizeFocus(focus, width, height, totalMs) {
  return (focus || [])
    .filter((f) => [f.t, f.x, f.y, f.w, f.h].every(Number.isFinite) && f.h > 0 && f.w >= 0 && f.x < width && f.y < height && f.x + f.w > 0 && f.y + f.h > 0)
    .map((f) => {
      const x0 = clamp(f.x, 0, width), y0 = clamp(f.y, 0, height), x1 = clamp(f.x + Math.max(1, f.w), 0, width), y1 = clamp(f.y + f.h, 0, height);
      return { t: clamp(f.t, 0, totalMs), cx: (x0 + x1) / 2 / width, cy: (y0 + y1) / 2 / height, w: Math.max(1, x1 - x0) / width, h: Math.max(1, y1 - y0) / height };
    })
    .sort((a, b) => a.t - b.t);
}

/**
 * Bursts of typing from the raw samples' `k` (keys pressed since the previous sample): key times,
 * grouped while consecutive keys are at most `windowMs` apart; a group counts when at least
 * `minKeys` of its keys fall inside one `windowMs` window. A trace without `k` has no bursts.
 * @returns {Array<{first:number, last:number, keys:number}>}
 */
export function keyBursts(samples, { minKeys = TYPING.minKeys, windowMs = TYPING.windowMs } = {}) {
  const times = [];
  for (const s of samples || []) if (Number.isFinite(s.t) && Number.isFinite(s.k) && s.k > 0) for (let i = 0; i < s.k; i += 1) times.push(s.t);
  times.sort((a, b) => a - b);
  const out = [];
  let group = [];
  const flush = () => {
    if (group.length >= minKeys && group.some((t, i) => i + minKeys - 1 < group.length && group[i + minKeys - 1] - t <= windowMs)) out.push({ first: group[0], last: group[group.length - 1], keys: group.length });
    group = [];
  };
  for (const t of times) { if (group.length && t - group[group.length - 1] > windowMs) flush(); group.push(t); }
  flush();
  return out;
}

/**
 * Zoom regions where the user types: one per burst, centred on the most recent focus rectangle
 * (the one read at or just before the first key; without any rectangle the burst makes no region:
 * better no zoom than a zoom on the mouse while the text appears elsewhere). The scale is at least
 * `scale`, raised until the rectangle fills `fillMin` of the frame width, capped at `maxScale` and at
 * what keeps the whole rectangle inside the frame. `kind: 'typing'`.
 * @param samples raw trace samples with `k`; @param focus the output of normalizeFocus
 */
export function suggestTypingRegions(samples, focus, totalMs, { scale = 1.8, maxScale = TYPING.maxScale, fillMin = TYPING.fillMin, leadMs = TYPING.leadMs, tailMs = TYPING.tailMs, minKeys, windowMs } = {}) {
  if (!(totalMs > 0) || !focus || !focus.length) return [];
  const regions = [];
  for (const b of keyBursts(samples, { minKeys, windowMs })) {
    let f = null;
    for (const r of focus) { if (r.t <= b.first + 50) f = r; else break; }
    if (!f) continue;
    const s = Math.max(1, Math.min(maxScale, 1 / f.w, 1 / f.h, Math.max(scale, fillMin / f.w)));
    const start = clamp(Math.round(b.first - leadMs), 0, totalMs), end = clamp(Math.round(b.last + tailMs), 0, totalMs);
    if (end - start < 100) continue;
    regions.push({ start, end, cx: f.cx, cy: f.cy, scale: +s.toFixed(3), kind: 'typing', keys: b.keys });
  }
  return regions;
}

/** Runs where the cursor barely moves, between minMs and maxMs long: where the viewer looks. */
export function dwellCandidates(samples, opt = DWELL) {
  if (samples.length < 2) return [];
  const out = [];
  let runStart = 0;
  const push = (a, b) => {
    if (b - a < 2) return;
    const dur = samples[b - 1].t - samples[a].t;
    if (dur < opt.minMs || dur > opt.maxMs) return;
    const run = samples.slice(a, b);
    out.push({ centerMs: Math.round((samples[a].t + samples[b - 1].t) / 2), cx: run.reduce((s, p) => s + p.cx, 0) / run.length, cy: run.reduce((s, p) => s + p.cy, 0) / run.length, strength: dur });
  };
  for (let i = 1; i < samples.length; i += 1) {
    if (Math.hypot(samples[i].cx - samples[i - 1].cx, samples[i].cy - samples[i - 1].cy) > opt.moveThreshold) { push(runStart, i); runStart = i; }
  }
  push(runStart, samples.length);
  return out;
}

/** Non-overlapping zoom regions {start, end, cx, cy, scale}, strongest dwell first, spaced apart. */
export function suggestRegions(samples, totalMs, { durationMs = 2400, scale = 1.8, existing = [] } = {}) {
  if (totalMs <= 0 || samples.length < 2) return [];
  const dur = Math.min(durationMs, totalMs);
  const reserved = existing.map((r) => ({ start: r.start, end: r.end }));
  const centers = [];
  const regions = [];
  for (const c of [...dwellCandidates(samples)].sort((a, b) => b.strength - a.strength)) {
    if (centers.some((m) => Math.abs(m - c.centerMs) < DWELL.spacingMs)) continue;
    const start = clamp(Math.round(c.centerMs - dur / 2), 0, totalMs - dur);
    const end = start + dur;
    if (reserved.some((r) => end > r.start && start < r.end)) continue;
    reserved.push({ start, end }); centers.push(c.centerMs);
    regions.push({ start, end, cx: c.cx, cy: c.cy, scale, kind: 'dwell' });
  }
  return regions.sort((a, b) => a.start - b.start);
}

/** Cursor position at time t, linearly interpolated between the two nearest samples. */
export function cursorAt(samples, t) {
  if (!samples.length) return null;
  if (t <= samples[0].t) return { cx: samples[0].cx, cy: samples[0].cy };
  const last = samples[samples.length - 1];
  if (t >= last.t) return { cx: last.cx, cy: last.cy };
  let lo = 0, hi = samples.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >>> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi]; const span = b.t - a.t; const k = span > 0 ? (t - a.t) / span : 0;
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k };
}

/** Move `prev` toward `raw`: faster when far, slower when close, the same speed at any frame rate. */
export function followStep(prev, raw, dtMs, p = FOLLOW) {
  if (!(dtMs > 0)) return prev;
  const d = Math.hypot(raw.cx - prev.cx, raw.cy - prev.cy);
  const base = p.minFactor + (p.maxFactor - p.minFactor) * Math.min(1, d / p.rampDistance);
  const f = 1 - (1 - base) ** (dtMs / p.referenceMs);
  return { cx: prev.cx + (raw.cx - prev.cx) * f, cy: prev.cy + (raw.cy - prev.cy) * f };
}

/** One spring axis chasing a moving target; a step that crosses the target snaps to it (no wobble). */
export function springStep(s, target, dtMs, c = SPRING) {
  const dt = clamp(dtMs, 1, 80) / 1000;
  if (!s.init) { s.v = target; s.vel = 0; s.init = true; return target; }
  if (Math.abs(target - s.v) <= c.restDelta && Math.abs(s.vel) <= c.restSpeed) { s.v = target; s.vel = 0; return target; }
  const before = s.v;
  const acc = (-c.stiffness * (s.v - target) - c.damping * s.vel) / c.mass;
  s.vel += acc * dt; s.v += s.vel * dt;
  if ((before <= target && s.v > target) || (before >= target && s.v < target)) { s.v = target; s.vel = 0; }
  return s.v;
}

/** Eased zoom progress 0..1 inside a region: ease in over easeMs, hold, ease out over easeMs. */
export function regionProgress(r, t, easeMs) {
  if (t < r.start || t > r.end) return 0;
  const e = Math.min(easeMs, (r.end - r.start) / 2);
  const smooth = (k) => k * k * (3 - 2 * k);
  if (t < r.start + e) return smooth((t - r.start) / e);
  if (t > r.end - e) return smooth((r.end - t) / e);
  return 1;
}

/**
 * The user's two knobs -> the follow and spring parameters. `damping` (0.1..1, default 1) scales
 * how much of the gap to the cursor the follow closes per frame: 1 is the tuned behaviour, lower
 * makes the camera lag more. `stiffness` (10..2000, default 320) is the spring constant that chases
 * every axis: higher snaps sooner, lower glides. Out-of-range values are clamped, so the planner
 * stays total and deterministic.
 */
export function cameraParams({ damping = CAMERA.damping, stiffness = CAMERA.stiffness } = {}) {
  const d = clamp(Number.isFinite(damping) ? damping : CAMERA.damping, CAMERA.dampingMin, CAMERA.dampingMax);
  const k = clamp(Number.isFinite(stiffness) ? stiffness : CAMERA.stiffness, CAMERA.stiffnessMin, CAMERA.stiffnessMax);
  return { follow: { ...FOLLOW, minFactor: FOLLOW.minFactor * d, maxFactor: FOLLOW.maxFactor * d }, spring: { ...SPRING, stiffness: k } };
}

/**
 * The camera, frame by frame: target scale from the regions' eased progress, target focus from the
 * region centre pulled toward the live cursor (follow), then every axis chased by a spring.
 * Returns [{t, scale, cx, cy}], one per output frame.
 */
export function cameraPath(regions, samples, totalMs, fps, { easeMs = 350, follow = true, damping, stiffness } = {}) {
  const dtMs = 1000 / fps;
  const n = Math.max(1, Math.round(totalMs / dtMs));
  const { follow: fp, spring: sp } = cameraParams({ damping, stiffness });
  const sx = {}, sy = {}, ss = {};
  let focus = { cx: 0.5, cy: 0.5 };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const t = i * dtMs;
    let targetScale = 1, raw = focus;
    for (const r of regions) {
      const p = regionProgress(r, t, easeMs);
      // a typing region frames the text field, not the mouse: no pull toward the live cursor
      if (p > 0) { targetScale = 1 + (r.scale - 1) * p; const live = follow && r.kind !== 'typing' ? cursorAt(samples, t) : null; raw = live ? { cx: (r.cx + live.cx) / 2, cy: (r.cy + live.cy) / 2 } : { cx: r.cx, cy: r.cy }; break; }
    }
    focus = followStep(focus, raw, dtMs, fp);
    out.push({ t, scale: springStep(ss, targetScale, dtMs, sp), cx: springStep(sx, focus.cx, dtMs, sp), cy: springStep(sy, focus.cy, dtMs, sp) });
  }
  return out;
}

/** Camera -> integer crop rectangles that stay inside the frame and keep the source aspect. */
export function cropKeyframes(path, width, height) {
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return path.map((f) => {
    const s = Math.max(1, f.scale);
    const w = even(width / s), h = even(height / s);
    const x = even(clamp(f.cx * width - w / 2, 0, width - w)), y = even(clamp(f.cy * height - h / 2, 0, height - h));
    return { t: f.t, w, h, x: Math.min(x, width - w), y: Math.min(y, height - h) };
  });
}

/** The ffmpeg `sendcmd` file: one line per frame that changes the crop (unchanged frames are skipped). */
export function sendcmd(keys) {
  const lines = [];
  let last = null;
  for (const k of keys) {
    if (last && last.w === k.w && last.h === k.h && last.x === k.x && last.y === k.y) continue;
    lines.push(`${(k.t / 1000).toFixed(3)} crop w ${k.w}, crop h ${k.h}, crop x ${k.x}, crop y ${k.y};`);
    last = k;
  }
  return lines.join('\n') + '\n';
}

/**
 * The whole plan for one recording: regions, path and keyframes, from the raw cursor trace. Typing
 * regions (from `k` and `focus`) are placed first and win over the dwell regions they
 * overlap; a trace without `k`/`focus` plans exactly as before.
 */
export function plan(trace, { fps = 30, scale = 1.8, durationMs = 2400, easeMs = 350, follow = true, damping, stiffness, regions } = {}) {
  const totalMs = trace.durationMs;
  const samples = normalize(trace.samples || [], trace.width, trace.height, totalMs);
  const typing = regions ? [] : suggestTypingRegions(trace.samples || [], normalizeFocus(trace.focus, trace.width, trace.height, totalMs), totalMs, { scale });
  const regs = regions || [...typing, ...suggestRegions(samples, totalMs, { durationMs, scale, existing: typing })].sort((a, b) => a.start - b.start);
  const path = cameraPath(regs, samples, totalMs, fps, { easeMs, follow, damping, stiffness });
  const keys = cropKeyframes(path, trace.width, trace.height);
  return { width: trace.width, height: trace.height, fps, durationMs: totalMs, regions: regs, keyframes: keys, sendcmd: sendcmd(keys) };
}
