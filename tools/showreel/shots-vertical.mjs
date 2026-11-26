/**
 * The 9:16 cut's shots: the same timeline.mjs (and the same WAV) filmed on the app's own phone
 * layout, 432 × 768 at DSF 3 with touch input (isMobile, hasTouch), 90 subframes a second. Only
 * the framing differs from shots.mjs (brief §6.3).
 *
 * Touch is real input: taps and swipes are CDP Input.dispatchTouchEvent (start / move / end), which
 * this Chrome turns into touch pointer events and a click, as a finger would; the smoke run proved
 * they drive the shelf and open the folio. Hover lift, cover tilt and the Acquire hover flood do not
 * exist on touch, so they are not filmed. The folio's scroll is the sheet's own scrollTop, driven per
 * subframe under the finger's travel (a real touch scroll would fling on real time). Typing stays
 * real key events (no on-screen keyboard is rendered).
 *
 * The score is shared, so every gesture that replaces a 16:9 input is timed to make the app's own
 * knock land where the 16:9 one did (the knock times are read from the 16:9 shots' meta.json):
 *  - a wheel notch or an ArrowRight step becomes a one-volume swipe (64 px in 0.3 s), which the
 *    engine's drag spring turns into a step 0.200 s after the finger starts (simulated, then measured);
 *  - the drag across eleven volumes becomes a flick: 11 × 61 px is wider than the phone, so the finger
 *    travels 381 px and lets go mid-stroke, and the engine's own fling carries the shelf the rest of
 *    the way onto Cartographer of Moths (ten of its eleven knocks within a 30 fps frame of the 16:9
 *    cascade, the eleventh 38.9 ms off);
 *  - the hover beat becomes a nudge that springs back (no step, no knock) and a settle.
 *
 * M is filmed here first, at 180 subframes a second: the 16:9 master uses it too (as a phone card).
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEGMENTS, T, CLICKS, SWIPES, KEYS, shotTime, sf } from "./timeline.mjs";
import { centre, within, bracket, onCover, shelfState, bootSpecimen, bootLive, coversAreSpecimens } from "./lib/shot-helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const at = (id, reel) => shotTime(id, reel);
/** A segment's footage length: its reel span plus a few subframes of slack. */
const dur = (id) => Math.round((SEGMENTS[id].to - SEGMENTS[id].from + 0.06) * 90) / 90;
const ats = (id, list) => (list ?? []).map((t) => at(id, t));
/** Typed keys only (ArrowRight steps become swipes on the phone). */
const typed = (id) => (KEYS[id] ?? []).filter((k) => !/^Arrow/.test(k.key)).map((k) => ({ at: at(id, k.at), key: k.key }));

/** The phone shelf's geometry (H = min(66vw, 42svh) = 285 px, centre y = 44 % of 768). */
const PHONE = { w: 432, h: 768, cy: 0.44 * 768 };
const COVER = [216, PHONE.cy + 0.015 * 285];

/** The 16:9 shots' measured knocks (active-volume changes) in reel seconds: the WAV's knocks. */
function knocks16(id) {
  const file = path.join(here, "out", "shots", "16x9", id, "meta.json");
  if (!existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, "utf8"));
  return m.events.filter((e) => e.k === "active" && e.was && e.v).map((e) => e.t + SEGMENTS[id].from);
}
/** A one-volume swipe whose step (knock) lands at reel time `knock`: it starts 0.200 s before. */
const SWIPE_LEAD = 0.2 + 1 / 90; // simulated 0.200 s; the engine starts its drag one 90 Hz subframe later (the 6 px slop)
const stepSwipe = (id, knock, dir = -1) => ({ at: at(id, sf(knock - SWIPE_LEAD)), move: 0.3, hold: 0.12, dx: 64 * dir, dy: 1, from: [dir < 0 ? 300 : 132, PHONE.cy - 4] });
const fallbackKnocks = {
  H: [T.wheels[0] + 0.228, T.wheels[1] + 0.233],
  A: T.stepsA.map((t) => t + 0.1333),
  P: T.stepsP.map((t) => t + 0.1333),
  E: T.stepsE.map((t) => t + 0.1333),
};
const stepKnocks = (id, n) => (knocks16(id) ?? fallbackKnocks[id]).slice(0, n);

/** The folio's reveal blocks: measure the untransformed .rv wrappers (their child is mask-rising). */
const BLOCK = (n) => `.detail-inner > span.rv:nth-of-type(${n})`;
const LAST_BLOCK = ".detail-inner > span.rv:last-of-type";
/** Scroll the folio sheet so an element's bottom sits at page y `bottom` (computed when the scroll starts). */
/**
 * Finger positions for taps: each target resolves 0.3 s before its tap (a "hold" key first), so an
 * element that appears on screen shortly before (the CLEAR button, the sign-in fields) exists by then.
 */
const taps = (id, list) =>
  list.flatMap(([release, to], i) => [...(i ? [{ at: at(id, release - 0.3), to: "hold" }] : []), { at: at(id, release - 0.12), to }]);
const scrollTo = (sel, bottom) => async (ctx) =>
  ctx.js(
    ([s, b]) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      return Math.max(0, r.bottom - b);
    },
    [sel, bottom],
  );

export const SHOTS = {
  /** Reel 50.56–54.70 (both cuts): swipe the shelf two volumes, tap the cover, scroll the folio. */
  M: {
    path: "/",
    mode: "S",
    fps: 180,
    duration: dur("M"),
    prepare: (ctx) => bootSpecimen(ctx),
    swipes: SWIPES.M.map((s) => ({ at: at("M", s.at), move: s.move, hold: s.hold, dx: s.px, dy: 2, from: [328, PHONE.cy - 6] })),
    cursor: [
      { at: at("M", T.tapM - 0.11), to: onCover(0.52, 0.56) },
      { at: at("M", T.scrollM[0] - 0.12), to: [300, 600] },
      { at: at("M", SEGMENTS.M.to), to: "hold" },
    ],
    clicks: ats("M", CLICKS.M),
    scrolls: [{ sel: ".detail", at: at("M", T.scrollM[0]), dur: T.scrollM[1] - T.scrollM[0], by: T.scrollMPx, finger: [300, 600] }],
    events: [
      {
        at: at("M", T.tapM - 0.2),
        run: async (ctx) => {
          const s = await shelfState(ctx);
          ctx.mark("afterSwipe", s.title);
          if (!/^the blue hour$/i.test(s.title ?? "")) throw new Error(`M: the swipe landed on ${s.title}`);
        },
      },
    ],
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({ title: document.querySelector(".detail-title")?.textContent.trim(), top: document.querySelector(".detail")?.scrollTop }));
      if (!/blue hour/i.test(s.title ?? "") || Math.abs(s.top - 300) > 1) throw new Error(`M ended on ${JSON.stringify(s)}`);
      meta.marks.folio = s;
    },
  },

  /** Reel 1.03–21.60: the curtain and the lift (as 16:9); swipes for the wheel; the flick; a nudge; the folio, scrolled; close. */
  H: {
    path: "/",
    mode: "S",
    duration: dur("H"),
    css: ".boot > div { visibility: hidden !important; }",
    gates: [{ at: 1.6, name: "getBooks", action: "abort", settle: () => document.querySelector(".api-status")?.dataset.status === "offline" }],
    async prepare(ctx) {
      await ctx.settle(() => !!document.querySelector(".boot"), "the curtain");
      await ctx.ready("the curtain");
    },
    swipes: [
      ...stepKnocks("H", 2).map((k) => stepSwipe("H", k)),
      // the flick: 381 px of a 600 px stroke, let go mid-stroke; the engine's fling carries the shelf on to
      // eleven volumes (simulated 11.07 before rounding; filmed twice, identical, landing on Cartographer).
      // Its knocks fall within 28 ms of the shared WAV's cascade but one (38.9 ms): a phone cannot drag
      // eleven volumes in one stroke, so the flick's spacing differs a little from the 16:9 drag's.
      { at: at("H", 6.0778 - 1 / 90), move: 0.627, ease: 1.14, hold: 0, dx: 600, dy: 3, from: [16, PHONE.cy] },
      // the hover beat becomes a nudge that springs back and settles: 0.39 of a volume, no step
      { at: at("H", 9.3), move: 0.36, hold: 0.18, dx: -24, dy: 1, from: [292, PHONE.cy + 10] },
    ],
    cursor: taps("H", [
      [T.openH, [COVER[0] + 10, COVER[1] + 6]],
      [T.closeH, centre((p) => p.locator(".detail-close"), 0, 2)],
    ]),
    clicks: ats("H", CLICKS.H),
    scrolls: [
      // read: the title and the facts, then the abstract, the imprint and the price come up under the finger
      { sel: ".detail", at: at("H", 13.5), dur: 1.9, by: scrollTo(BLOCK(5), 600), finger: [300, 640] },
      { sel: ".detail", at: at("H", 15.7), dur: 1.7, by: scrollTo(LAST_BLOCK, 610), finger: [300, 640] },
    ],
    events: [
      {
        at: at("H", 8.3),
        run: async (ctx) => {
          const s = await shelfState(ctx);
          ctx.mark("afterFlick", s.title);
          if (!/^cartographer of moths$/i.test(s.title ?? "")) throw new Error(`H(9:16): the flick landed on ${s.title}`);
        },
      },
    ],
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({ detail: !!document.querySelector(".detail"), title: document.querySelector(".caption-body:not(.is-out) .cap-title")?.textContent.trim() }));
      if (s.detail || !/cartographer of moths/i.test(s.title)) throw new Error(`H(9:16) ended on ${JSON.stringify(s)}`);
      const lift = meta.starts.find((x) => x.name === "clip-out-up");
      if (!lift || Math.abs(lift.t - 1.5) > 1e-3) throw new Error(`H(9:16): the curtain lifted at ${lift?.t}`);
      meta.marks.lift = lift.t;
    },
  },

  /** Reel 21.56–30.06: search, clear, catalogue, a row: taps; the typing is real key events. */
  S: {
    path: "/",
    mode: "S",
    duration: dur("S"),
    async prepare(ctx) {
      await bootSpecimen(ctx);
      for (let i = 0; i < 3; i++) {
        await ctx.page.keyboard.press("ArrowRight");
        await ctx.preroll(0.45);
      }
      await ctx.preroll(3.0);
      const s = await shelfState(ctx);
      if (!/^cartographer of moths$/i.test(s.title ?? "") || !s.settled) throw new Error(`S(9:16) parked on ${s.title}`);
    },
    cursor: taps("S", [
      [T.searchOpen, centre(bracket("Search"), 0, 2)],
      [T.clear, centre(bracket("Clear"), 0, 2)],
      [T.catalog, centre(bracket("Catalog"), 0, 2)],
      [T.rowPick, within((p) => p.locator(".index-row", { hasText: "Night Ferry to Otaru" }), 0.4, 0.5)],
    ]),
    clicks: ats("S", CLICKS.S),
    keys: typed("S"),
    // the catalogue lists Night Ferry below the fold on a phone: the finger scrolls the sheet up to it
    scrolls: [
      {
        sel: ".side-sheet .sheet-body",
        at: at("S", 27.45),
        dur: 0.7,
        by: (ctx) => ctx.js(() => {
          const row = [...document.querySelectorAll(".index-row")].find((r) => r.textContent.includes("Night Ferry to Otaru"));
          const r = row.getBoundingClientRect();
          return Math.max(0, r.top + r.height / 2 - 500);
        }),
        finger: [300, 640],
      },
    ],
    async verify(ctx, meta) {
      const s = await shelfState(ctx);
      if (!/^night ferry to otaru$/i.test(s.title ?? "") || s.books !== 36) throw new Error(`S(9:16) ended on ${JSON.stringify(s)}`);
      const found = meta.events.find((e) => e.k === "search" && /^6 found$/i.test(e.v ?? ""));
      if (!found) throw new Error("S(9:16): no 6 FOUND");
    },
  },

  /** Reel 29.90–42.32: mode L. Sign in, swipe to The Blue Hour, open it, scroll to the button, tap Acquire. */
  A: {
    path: "/",
    mode: "L",
    duration: dur("A"),
    gates: [{ at: at("A", T.releasePayment), name: "makePayment", action: "fulfil", settle: () => location.hash === "#stripe-checkout" }],
    async prepare(ctx) {
      await bootLive(ctx);
      const cov = await coversAreSpecimens(ctx);
      if (cov.bad) throw new Error(`A(9:16): ${cov.bad} covers are not specimen covers`);
    },
    swipes: stepKnocks("A", 2).map((k) => stepSwipe("A", k)),
    cursor: taps("A", [
      [T.login, centre(bracket("Login"), 0, 2)],
      [T.emailField, within((p) => p.locator(".side-sheet input[type=email]"), 0.25, 0.55)],
      [T.passwordField, within((p) => p.locator(".side-sheet input[type=password]"), 0.25, 0.55)],
      [T.signIn, centre((p) => p.locator(".side-sheet button[type=submit]"), 0, 2)],
      [T.openA, [COVER[0] + 8, COVER[1] + 4]],
      [T.acquire, centre((p) => p.locator(".btn-acquire"), 0, 2)],
    ]),
    clicks: ats("A", CLICKS.A),
    keys: typed("A"),
    events: [
      {
        at: at("A", T.signIn) + 1 / 90,
        run: (ctx) => ctx.settle(() => !!document.querySelector(".side-sheet.is-closing") || !document.querySelector(".side-sheet"), "the sign-in to land"),
      },
    ],
    // the button is below the fold on a phone: the finger scrolls the folio up to it
    scrolls: [{ sel: ".detail", at: at("A", 38.0), dur: 1.6, by: scrollTo(LAST_BLOCK, 600), finger: [300, 640] }],
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({
        cta: document.querySelector(".btn-acquire")?.textContent.trim(),
        title: document.querySelector(".detail-title")?.textContent.trim(),
        header: [...document.querySelectorAll(".site-nav .bracket-btn")].map((b) => b.textContent.trim()).join(" "),
        hash: location.hash,
      }));
      if (!/opening stripe checkout/i.test(s.cta ?? "") || !/the blue hour/i.test(s.title ?? "") || !/logout/i.test(s.header) || s.hash !== "#stripe-checkout") throw new Error(`A(9:16) ended on ${JSON.stringify(s)}`);
      const pay = meta.network.find((r) => r.method === "PUT" && r.path === "/api/makePayment");
      if (pay?.served !== "mock" || !pay.auth) throw new Error(`A(9:16) network: ${JSON.stringify(meta.network)}`);
    },
  },

  /** Reel 40.53–51.48: the return, as 16:9; swipes to The Blue Hour; DISMISS; the folio, scrolled to its button. */
  P: {
    path: "/payment-success?session_id=cs_test_reel",
    mode: "L",
    afterPurchase: true,
    signedIn: true,
    duration: dur("P"),
    gates: [{ at: T.pGate, name: "getBooks", action: "fulfil", settle: () => document.querySelectorAll(".book-box").length === 36 }],
    async prepare(ctx) {
      await ctx.settle(() => !!document.querySelector(".boot") && !!document.querySelector(".notice"), "the curtain over the return slip");
      await ctx.ready("the curtain");
    },
    swipes: stepKnocks("P", 2).map((k) => stepSwipe("P", k)),
    cursor: taps("P", [
      [T.dismiss, centre((p) => p.locator(".notice .bracket-btn"), 0, 2)],
      [T.openP, [COVER[0] + 8, COVER[1] + 4]],
    ]),
    clicks: ats("P", CLICKS.P),
    scrolls: [{ sel: ".detail", at: at("P", 47.75), dur: 1.6, by: scrollTo(LAST_BLOCK, 600), finger: [300, 640] }],
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({
        kicker: document.querySelector(".detail-kicker")?.textContent.replace(/\s+/g, " ").trim(),
        cta: document.querySelector(".btn-acquire")?.textContent.trim(),
        notice: !!document.querySelector(".notice"),
      }));
      if (!/no\. 003/i.test(s.kicker ?? "") || !/in your collection — ex libris/i.test(s.cta ?? "") || s.notice) throw new Error(`P(9:16) ended on ${JSON.stringify(s)}`);
      const lift = meta.starts.find((x) => x.name === "clip-out-up");
      if (!lift || Math.abs(lift.t - T.pGate) > 1e-3) throw new Error(`P(9:16): the curtain lifted at ${lift?.t}`);
    },
  },

  /** Reel 53.37–60.00: the end card's shelf, UI hidden; three swipes knock on 55.50, 56.25 and 57.00. */
  E: {
    path: "/",
    mode: "S",
    duration: dur("E"),
    css: ".site-header, .caption, .nav-chevron, .timeline, .site-footer { visibility: hidden !important; }",
    prepare: (ctx) => bootSpecimen(ctx, 2.6),
    swipes: stepKnocks("E", 3).map((k) => stepSwipe("E", k)),
    async verify(ctx, meta) {
      const knocks = meta.events.filter((e) => e.k === "active").map((e) => [e.t, e.v]);
      if (knocks.length !== 3) throw new Error(`E(9:16): ${knocks.length} steps: ${JSON.stringify(knocks)}`);
      meta.marks.knocks = knocks;
    },
  },
};
