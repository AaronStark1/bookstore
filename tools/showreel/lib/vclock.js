/**
 * Virtual time for filming the real app frame by frame.
 *
 * Copied from cook-with-me/tools/showreel/lib/vclock.js (itself from the SpecShield showreel) and
 * adapted for Bibliotheca Obscura. Injected before any page script, it replaces the page's clocks
 * (performance.now, Date, event timestamps) and schedulers (timers, setImmediate,
 * requestAnimationFrame, idle callbacks) with ones that only move when the capture calls
 * `__vt.stepTo(ms)` / `__vt.step(ms)`. CSS animations, CSS transitions and Web Animations are
 * pinned to the same clock, so every frame is a pure function of the scripted inputs.
 *
 * Kept from the sibling: the epoch, app-controlled animations (page pause / seek / play), per-
 * animation local time × playbackRate, `finish()` at the end of every animation (CSS transitions
 * too, so animationend / transitionend / onfinish fire), a seeded Math.random behind a scripted
 * queue, first-sight-from-zero, and real-time image settling. Its two Angular-era features
 * (scroll-driven timelines, view transitions) stay but are idle here.
 *
 * What this copy adds, for this app (brief §5.1):
 *  1. `setImmediate` is virtual. React's scheduler (in the production bundle) captures
 *     `setImmediate` at load and prefers it over MessageChannel, so every non-discrete React
 *     render (a fetch landing, a timer's setState, an animationend handler) runs inside
 *     advance(), at the virtual moment it was scheduled, instead of at a real-time whim.
 *  2. `stepTo(target)`: the capture steps to exact subframe times (t0 + i·1000/fps) so 270 steps
 *     of 5.555… ms land exactly on 1500 ms and the app's 1500 ms grace timer fires on subframe
 *     270, never one late from floating-point drift. Timers compare with a 1 µs tolerance.
 *  3. `starts`: every animation's first sight is logged with its virtual time, its kind (CSS
 *     animation name, transition property, or WAAPI) and its target's class, so the edit and
 *     the score can use the moment the app's own motion actually began (the curtain lift, the
 *     sheets, the folio bloom).
 *  4. Infinite animations (the boot rule: 1400 ms, infinite, alternate) are pinned at their
 *     local time every step and never finish()ed: their end time is Infinity.
 *  5. The engine's rAF `dt` comes from the virtual `now` passed to every frame callback.
 */
export const VCLOCK_SCRIPT = String.raw`
(() => {
  if (window.__vt) return;
  const EPOCH = Date.UTC(2026, 10, 26, 18, 30, 0);
  const NativeDate = Date;
  const realSetTimeout = window.setTimeout.bind(window);
  const EPS = 1e-6;
  let now = 0;
  let seq = 1;
  const timers = new Map();
  const frames = new Map();

  performance.now = () => now;
  function FakeDate(...args) {
    if (!new.target) return new NativeDate(EPOCH + now).toString();
    return args.length ? new NativeDate(...args) : new NativeDate(EPOCH + now);
  }
  FakeDate.prototype = NativeDate.prototype;
  FakeDate.now = () => EPOCH + Math.floor(now);
  FakeDate.parse = NativeDate.parse;
  FakeDate.UTC = NativeDate.UTC;
  window.Date = FakeDate;
  Object.defineProperty(Event.prototype, "timeStamp", { get: () => now, configurable: true });

  // ---- randomness: a seeded PRNG (mulberry32) behind a scripted queue
  let seed = 0x5eed1e55 >>> 0;
  const prng = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randQueue = [];
  const randLog = [];
  Math.random = () => {
    const scripted = randQueue.length > 0;
    const value = scripted ? randQueue.shift() : prng();
    randLog.push({ at: now, value, scripted });
    return value;
  };

  const schedule = (fn, ms, args, repeat) => {
    const id = seq++;
    const delay = Math.max(repeat ? 1 : 0, Number(ms) || 0);
    timers.set(id, { id, at: now + delay, every: repeat ? delay : 0, fn, args });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => schedule(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => schedule(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  // React's scheduler prefers setImmediate when it exists (captured at module load)
  window.setImmediate = (fn, ...args) => schedule(fn, 0, args, false);
  window.clearImmediate = window.clearTimeout;
  window.requestAnimationFrame = (cb) => {
    const id = seq++;
    frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => void frames.delete(id);
  window.requestIdleCallback = (cb) => schedule(() => cb({ didTimeout: false, timeRemaining: () => 40 }), 1, [], false);
  window.cancelIdleCallback = window.clearTimeout;

  const call = (fn, args) => {
    try {
      if (typeof fn === "function") fn(...args);
    } catch (error) {
      console.error(error);
    }
  };

  // A native MessageChannel, captured before any page script: a macrotask hop that lets every queued
  // microtask (promise continuations, React's root scheduling) and network continuation run.
  const hop = new MessageChannel();
  const hops = [];
  hop.port1.onmessage = () => {
    const r = hops.shift();
    if (r) r();
  };
  const yieldTask = () => new Promise((r) => {
    hops.push(r);
    hop.port2.postMessage(0);
  });

  /**
   * Runs every timer due up to target (in order, each followed by a task hop, as a browser drains
   * microtasks between tasks), then one animation frame at target. Work the frame callbacks
   * schedule (a React render after the engine's onActive) runs at the start of the next step, as
   * it would after the browser's paint.
   */
  async function advanceTo(target) {
    if (target < now) target = now;
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const t of timers.values()) if (t.at <= target + EPS && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
      if (!next) break;
      now = Math.max(now, Math.min(next.at, target));
      if (next.every) next.at += next.every;
      else timers.delete(next.id);
      call(next.fn, next.args);
      await yieldTask();
    }
    now = target;
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) call(cb, [now]);
    await yieldTask();
  }

  // ---- animations -----------------------------------------------------------------------------
  const P = Animation.prototype;
  const ct = Object.getOwnPropertyDescriptor(P, "currentTime");
  const nativePause = P.pause;
  const nativePlay = P.play;
  /** Paused by the page itself (a scrubbed timeline): never driven, never re-pinned. */
  const appPaused = new WeakSet();
  /** Local time of each animation the clock drives, and the virtual time it was last advanced at. */
  const local = new WeakMap();
  const lastAt = new WeakMap();
  /** Where a CSS-paused animation (animation-play-state: paused) stood when last seen. */
  const frozen = new WeakMap();
  const seen = new WeakSet();
  const starts = [];
  let internal = false;
  const stats = { appPaused: 0, pageSeeks: 0, pagePlays: 0, finished: 0 };

  P.pause = function () {
    if (!internal) {
      appPaused.add(this);
      stats.appPaused++;
    }
    return nativePause.call(this);
  };
  P.play = function () {
    const result = nativePlay.call(this);
    if (!internal) {
      appPaused.delete(this);
      const t = Number(ct.get.call(this)) || 0;
      local.set(this, t);
      lastAt.set(this, now);
      stats.pagePlays++;
    }
    return result;
  };
  Object.defineProperty(P, "currentTime", {
    configurable: true,
    enumerable: ct.enumerable,
    get: ct.get,
    set(value) {
      const driven = local.has(this) || this.playState !== "paused";
      if (!internal && !appPaused.has(this) && driven && value !== null && Number.isFinite(Number(value))) {
        local.set(this, Number(value));
        lastAt.set(this, now);
        stats.pageSeeks++;
      }
      ct.set.call(this, value);
    },
  });

  const isScrollDriven = (a) => a.timeline && typeof DocumentTimeline !== "undefined" && !(a.timeline instanceof DocumentTimeline);
  const describe = (a) => {
    const el = a.effect && a.effect.target;
    const cls = el ? (typeof el.className === "string" ? el.className : (el.getAttribute && el.getAttribute("class")) || el.tagName) : "";
    const kind = typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation ? "css" : typeof CSSTransition !== "undefined" && a instanceof CSSTransition ? "transition" : "waapi";
    const name = kind === "css" ? a.animationName : kind === "transition" ? a.transitionProperty : "animate";
    const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
    return { kind, name, cls: String(cls).slice(0, 80), pseudo: (a.effect && a.effect.pseudoElement) || "", dur: Number(timing.duration) || 0, delay: Number(timing.delay) || 0 };
  };

  /** Puts every clock-driven animation at its local time for the current virtual time. */
  function pinAnimations() {
    internal = true;
    try {
      for (const a of document.getAnimations()) {
        if (isScrollDriven(a)) continue;
        if (appPaused.has(a)) continue;
        if (a.playState === "finished" || a.playState === "idle") continue;
        let t;
        if (!local.has(a)) {
          if (a.playState === "paused") {
            frozen.set(a, Number(ct.get.call(a)) || 0);
            continue;
          }
          // first sight: from 0 (or where CSS had frozen it), never from real time already elapsed
          t = frozen.has(a) ? frozen.get(a) : 0;
          if (!seen.has(a)) {
            seen.add(a);
            if (starts.length < 20000) starts.push({ t: now, ...describe(a) });
          }
        } else {
          const rate = Number.isFinite(a.playbackRate) ? a.playbackRate : 1;
          t = local.get(a) + (now - (lastAt.get(a) ?? now)) * rate;
        }
        local.set(a, t);
        lastAt.set(a, now);
        if (a.playState !== "paused") nativePause.call(a);
        const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
        const end = timing ? timing.endTime : Infinity;
        if (Number.isFinite(end) && t >= end - EPS) {
          ct.set.call(a, end);
          // finish(), for CSS transitions too: animationend / transitionend / onfinish fire
          try {
            a.finish();
          } catch {}
          stats.finished++;
          local.delete(a);
          lastAt.delete(a);
        } else ct.set.call(a, Math.max(0, t));
      }
    } finally {
      internal = false;
    }
  }

  /** Waits (in real time, at most maxMs) for on-screen <img> elements that are still loading. */
  function settleImages(maxMs) {
    const pending = [...document.images].filter((i) => {
      if (!i.src || i.complete) return false;
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
    });
    if (!pending.length) return Promise.resolve();
    return Promise.race([
      Promise.all(pending.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))),
      new Promise((r) => realSetTimeout(r, maxMs)),
    ]);
  }

  async function stepTo(target) {
    // anything the page started between steps (an input, a response) starts at this moment
    pinAnimations();
    await advanceTo(target);
    pinAnimations();
    await settleImages(1500);
    // one real turn so the compositor paints what the step changed
    await new Promise((r) => realSetTimeout(r, 0));
    pinAnimations();
  }

  window.__vt = {
    get now() {
      return now;
    },
    realWait: (ms) => new Promise((r) => realSetTimeout(r, ms)),
    /** Advances virtual time by ms (a zero step runs whatever is due now, React renders included). */
    step: (ms) => stepTo(now + (Number(ms) || 0)),
    /** Advances virtual time to exactly "target" ms. */
    stepTo,
    pinAnimations,
    /** Animation first sights since 'from' (an index into the log). */
    starts: (from = 0) => starts.slice(from),
    get startCount() {
      return starts.length;
    },
    /** The next Math.random() calls return these values, in order. */
    rand(values) {
      randQueue.push(...values);
    },
    get randLog() {
      return randLog.slice();
    },
    get stats() {
      return { ...stats, timers: timers.size, frames: frames.size, now };
    },
  };
})();
`;
