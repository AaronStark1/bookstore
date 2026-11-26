/**
 * The app's easing maths, ported verbatim from frontend/src/lib/math.ts for the reel's edit
 * (timeline.mjs), compositor (reel.html) and score (lib/score.js). A plain ES module with no
 * imports: Node and the page load the same file.
 *
 *   --ease-ink     cubic-bezier(0.76, 0, 0.18, 1)   sheets, folio bloom and fold, curtain, ink blots
 *   --ease-spring  cubic-bezier(0.2, 0.8, 0.2, 1)   caption and folio-text mask slides, search field
 *
 * A motion "rushes" where its coverage crosses 0.55: an in-app motion that should land on a beat
 * starts at beat − RUSH × duration (brief §6).
 */

/** CSS cubic-bezier(x1, y1, x2, y2), solved as math.ts does (Newton, then bisection). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) break;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const easeInk = cubicBezier(0.76, 0, 0.18, 1);
export const easeSpring = cubicBezier(0.2, 0.8, 0.2, 1);
/** §7.1 the sheet wipe's parallax arrival. */
export const easeArrive = cubicBezier(0.5, 1, 0.89, 1);

/** Time (0–1) at which an increasing easing reaches `progress` (bisection). */
export function invertEasing(ease, progress) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < progress) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** d ease / du (central difference, per unit of u). The whooshes' gain follows this. */
export function easeRate(ease, u, h = 1e-4) {
  const a = Math.max(0, u - h), b = Math.min(1, u + h);
  return (ease(b) - ease(a)) / (b - a);
}

/** Where an easing crosses coverage 0.55 (the rush), re-derived here rather than typed in. */
export const RUSH_INK = Math.round(invertEasing(easeInk, 0.55) * 1e4) / 1e4;
export const RUSH_SPRING = Math.round(invertEasing(easeSpring, 0.55) * 1e4) / 1e4;

/** u of the fastest point of an easing (where its derivative peaks). */
export function peakRate(ease, n = 4000) {
  let best = 0, at = 0;
  for (let i = 1; i < n; i++) {
    const r = easeRate(ease, i / n);
    if (r > best) {
      best = r;
      at = i / n;
    }
  }
  return at;
}

/** The engine's spool rise for one volume (shelf/engine.ts): delay by distance, then 1 − (1 − t)³. */
export function spoolRise(spool, absRel) {
  const delay = 0.45 * Math.min(1, absRel / 11);
  const t = Math.min(1, Math.max(0, (spool - delay) / 0.55));
  return 1 - Math.pow(1 - t, 3);
}
