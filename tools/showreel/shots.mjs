/**
 * The 16:9 reel's shots: what capture.mjs films in the real app at 1600 × 900 (DSF 1.5), 180
 * subframes a second. Every time comes from timeline.mjs (reel seconds) and is converted to shot
 * time with `at(segment, reel)`: nothing is typed twice. `cursor` keys glide between targets (a
 * target resolves when its glide starts; "hold" stays put), `clicks` are releases (the button went
 * down PRESS_S before), `drags` press, move on an eased path and hold still before the release,
 * `keys` and `wheels` are real input events, `gates` release held responses, and `anchors` are
 * element rects recorded every third subframe for the compositor's camera, cursor and transitions.
 *
 * Shot M (the phone) is filmed by shots-vertical.mjs and used by both cuts.
 */
import { SEGMENTS, T, CLICKS, KEYS, WHEELS, DRAGS, shotTime } from "./timeline.mjs";
import { centre, within, bracket, onCover, spine, shelfState, bootSpecimen, bootLive, coversAreSpecimens } from "./lib/shot-helpers.mjs";

const at = (id, reel) => shotTime(id, reel);
/** A segment's footage length: its reel span plus a few subframes of slack. */
const dur = (id) => Math.round((SEGMENTS[id].to - SEGMENTS[id].from + 0.06) * 90) / 90;
const ats = (id, list) => (list ?? []).map((t) => at(id, t));
const keysFor = (id) => (KEYS[id] ?? []).map((k) => ({ at: at(id, k.at), key: k.key }));

/** The presented cover's centre at 1600 × 900: (W/2, cy + 0.015 H), cy = 378, H = 432 (engine.overCover). */
const COVER = [800, 378 + 0.015 * 432];
/** Where the cursor rests on [ SEARCH ] at the end of H and the start of S (the match cut). */
const SEARCH_REST = centre(bracket("Search"), 3, 4);

const FOLIO_ANCHORS = {
  close: { sel: ".detail-close" },
  kicker: { sel: ".detail-kicker" },
  author: { sel: ".detail-author" },
  grid: { sel: ".meta-grid" },
  abstract: { sel: ".detail-abstract" },
  imprint: { sel: ".imprint" },
};

export const SHOTS = {
  /**
   * Reel 1.03–21.60: one page load in mode S. The curtain is held with its type hidden (the title is
   * drawn on it); GET /api/getBooks is left unanswered, so the app's 1500 ms grace timer mounts the
   * specimens and the curtain lifts at shot 1.500 (rush on the 3.00 downbeat); the request is refused
   * at 1.600 and the footer settles on OFFLINE under the lift. Then the shelf: two wheel notches, a
   * drag right across eleven volumes that wraps onto Cartographer of Moths, the cursor over the
   * neighbouring spines and onto the cover (it tilts); the folio opens, is read, the Acquire button
   * floods with ink on hover (never clicked in mode S), [ CLOSE ] folds it back, and the cursor
   * comes to rest on [ SEARCH ].
   */
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
    cursor: [
      { at: at("H", 3.9), to: [1180, 575] },
      { at: at("H", 5.45), to: "hold" },
      { at: at("H", 5.92), to: [292, 382] },
      { at: at("H", 8.4), to: "hold" },
      { at: at("H", 8.95), to: spine(3, 0.42) },
      { at: at("H", 9.55), to: spine(2, 0.5) },
      { at: at("H", 10.15), to: spine(1, 0.56) },
      { at: at("H", 10.75), to: onCover(0.86, 0.3) },
      { at: at("H", 11.28), to: onCover(0.62, 0.44) },
      { at: at("H", 11.75), to: "hold" },
      { at: at("H", 12.9), to: [1010, 610] },
      { at: at("H", 17.0), to: "hold" },
      { at: at("H", 17.6), to: centre((p) => p.locator(".btn-acquire"), 26, 3) },
      { at: at("H", 19.95), to: "hold" },
      { at: at("H", 20.5), to: centre((p) => p.locator(".detail-close"), 2, 3) },
      { at: at("H", 20.7), to: "hold" },
      { at: at("H", T.restOnSearch), to: SEARCH_REST },
      { at: at("H", SEGMENTS.H.to), to: "hold" },
    ],
    wheels: (WHEELS.H ?? []).map((w) => ({ at: at("H", w.at), dy: w.dy })),
    drags: DRAGS.H.map((d) => ({ at: at("H", d.at), move: d.move, hold: d.hold, dx: d.px, dy: 4, from: "hold" })),
    clicks: ats("H", CLICKS.H),
    anchors: FOLIO_ANCHORS,
    events: [
      {
        at: at("H", 8.4),
        run: async (ctx) => {
          const s = await shelfState(ctx);
          ctx.mark("afterDrag", s.title);
          if (!/^cartographer of moths$/i.test(s.title ?? "")) throw new Error(`H: the drag landed on ${s.title}`);
        },
      },
    ],
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({
        detail: !!document.querySelector(".detail"),
        title: document.querySelector(".caption-body:not(.is-out) .cap-title")?.textContent.trim(),
        status: document.querySelector(".api-status").dataset.status,
        searchHover: getComputedStyle([...document.querySelectorAll(".site-nav .bracket-btn")].find((b) => b.textContent.trim() === "Search")).color,
      }));
      if (s.detail || !/cartographer of moths/i.test(s.title) || s.status !== "offline") throw new Error(`H ended on ${JSON.stringify(s)}`);
      const lift = meta.starts.find((x) => x.name === "clip-out-up");
      if (!lift || Math.abs(lift.t - 1.5) > 1e-3) throw new Error(`H: the curtain lifted at ${lift?.t}, not 1.500`);
      meta.marks.lift = lift.t;
      meta.marks.end = s;
    },
  },

  /**
   * Reel 21.56–30.06: search, clear, catalogue, a row. `prepare` parks the shelf on Cartographer of
   * Moths with the cursor resting on [ SEARCH ], so its first frame matches H's last (the cut at
   * 21.556, where nothing moves).
   */
  S: {
    path: "/",
    mode: "S",
    duration: dur("S"),
    cursorFromStart: true,
    async prepare(ctx) {
      await bootSpecimen(ctx);
      for (let i = 0; i < 3; i++) {
        await ctx.page.keyboard.press("ArrowRight");
        await ctx.preroll(0.45);
      }
      await ctx.preroll(3.0);
      const s = await shelfState(ctx);
      if (!/^cartographer of moths$/i.test(s.title ?? "") || !s.settled) throw new Error(`S parked on ${s.title}`);
    },
    mouseStart: SEARCH_REST,
    cursor: [
      { at: 0, to: SEARCH_REST },
      { at: at("S", 23.3), to: "hold" },
      { at: at("S", 25.85), to: centre(bracket("Clear"), 2, 4) },
      { at: at("S", 26.1), to: "hold" },
      { at: at("S", 26.52), to: centre(bracket("Catalog"), 2, 4) },
      { at: at("S", 26.95), to: "hold" },
      { at: at("S", 27.4), to: within((p) => p.locator(".index-row", { hasText: "The Blue Hour" }), 0.42, 0.5) },
      { at: at("S", 27.92), to: within((p) => p.locator(".index-row", { hasText: "Winter Arithmetic" }), 0.4, 0.5) },
      { at: at("S", 28.38), to: within((p) => p.locator(".index-row", { hasText: "Night Ferry to Otaru" }), 0.38, 0.5) },
      { at: at("S", 28.62), to: "hold" },
      { at: at("S", 29.3), to: [1480, 770] },
    ],
    clicks: ats("S", CLICKS.S),
    keys: keysFor("S"),
    anchors: {
      nightFerry: { sel: ".index-row", text: "Night Ferry to Otaru", contains: true },
      rows: { sel: ".sheet-body" },
      sheetTitle: { sel: ".sheet-title" },
    },
    async verify(ctx, meta) {
      const s = await shelfState(ctx);
      if (!/^night ferry to otaru$/i.test(s.title ?? "") || s.books !== 36) throw new Error(`S ended on ${JSON.stringify(s)}`);
      const found = meta.events.find((e) => e.k === "search" && /^6 found$/i.test(e.v ?? ""));
      if (!found) throw new Error("S: the search never said 6 FOUND");
      meta.marks.found = found.t;
    },
  },

  /**
   * Reel 29.90–42.32: mode L (fixtures shaped like a seeded backend), pre-rolled to a settled shelf.
   * Sign in through the real form, step to The Blue Hour, open it, hover and click Acquire: the
   * button says OPENING STRIPE CHECKOUT… while makePayment is held; it is answered at 41.25 and the
   * page stays put (the session URL is a same-document hash on the preview origin).
   */
  A: {
    path: "/",
    mode: "L",
    duration: dur("A"),
    gates: [{ at: at("A", T.releasePayment), name: "makePayment", action: "fulfil", settle: () => location.hash === "#stripe-checkout" }],
    async prepare(ctx) {
      await bootLive(ctx);
      const cov = await coversAreSpecimens(ctx);
      if (cov.bad) throw new Error(`A: ${cov.bad} covers are not specimen covers`);
    },
    cursor: [
      { at: at("A", 30.55), to: [1250, 330] },
      { at: at("A", 30.6), to: "hold" },
      { at: at("A", 31.0), to: centre(bracket("Login"), 2, 4) },
      { at: at("A", 31.55), to: "hold" },
      { at: at("A", 31.95), to: within((p) => p.locator(".side-sheet input[type=email]"), 0.2, 0.55) },
      { at: at("A", 33.08), to: "hold" },
      { at: at("A", 33.42), to: within((p) => p.locator(".side-sheet input[type=password]"), 0.2, 0.55) },
      { at: at("A", 34.45), to: "hold" },
      { at: at("A", 34.9), to: centre((p) => p.locator(".side-sheet button[type=submit]"), -24, 3) },
      { at: at("A", 35.25), to: "hold" },
      { at: at("A", 35.85), to: [1225, 655] },
      { at: at("A", 36.5), to: "hold" },
      { at: at("A", 36.88), to: [COVER[0] + 34, COVER[1] - 24] },
      { at: at("A", 37.3), to: "hold" },
      { at: at("A", 37.95), to: [1010, 615] },
      { at: at("A", 38.5), to: "hold" },
      { at: at("A", T.hoverAcquireA), to: centre((p) => p.locator(".btn-acquire"), 34, 3) },
      { at: at("A", SEGMENTS.A.to), to: "hold" },
    ],
    clicks: ats("A", CLICKS.A),
    keys: keysFor("A"),
    events: [
      {
        // the sign-in response is consumed at the click's own virtual moment, whatever real time it took
        at: at("A", T.signIn) + 1 / 180,
        run: (ctx) => ctx.settle(() => !!document.querySelector(".side-sheet.is-closing") || !document.querySelector(".side-sheet"), "the sign-in to land"),
      },
    ],
    anchors: {
      ...FOLIO_ANCHORS,
      email: { sel: ".side-sheet input[type=email]" },
      password: { sel: ".side-sheet input[type=password]" },
      submit: { sel: ".side-sheet button[type=submit]" },
      form: { sel: ".side-sheet form" },
    },
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({
        cta: document.querySelector(".btn-acquire")?.textContent.trim(),
        title: document.querySelector(".detail-title")?.textContent.trim(),
        header: [...document.querySelectorAll(".site-nav .bracket-btn")].map((b) => b.textContent.trim()).join(" "),
        hash: location.hash,
        session: localStorage.getItem("bo:session"),
      }));
      if (!/opening stripe checkout/i.test(s.cta ?? "") || !/the blue hour/i.test(s.title ?? "") || !/logout/i.test(s.header) || s.hash !== "#stripe-checkout") throw new Error(`A ended on ${JSON.stringify(s)}`);
      const login = meta.network.find((r) => r.method === "POST" && r.path === "/api/login");
      const pay = meta.network.find((r) => r.method === "PUT" && r.path === "/api/makePayment");
      if (login?.served !== "mock" || pay?.served !== "mock" || !pay.auth) throw new Error(`A network: ${JSON.stringify(meta.network)}`);
      meta.marks.end = { ...s, session: !!s.session };
    },
  },

  /**
   * Reel 40.53–51.48: a fresh load of /payment-success?session_id=cs_test_reel, signed in, with the
   * post-purchase fixture (The Blue Hour sold to the demo collector, as makePayment writes it). The
   * real curtain is held until getBooks is answered at shot 1.000, then lifts (rush on 42.00) over
   * the ACQUISITION RECORDED slip; two steps to The Blue Hour (SOLD); [ DISMISS ]; the folio:
   * ARCHIVE FOLIO NO. 003 · SOLD and IN YOUR COLLECTION — EX LIBRIS.
   */
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
    cursor: [
      { at: at("P", 43.55), to: [1110, 330] },
      { at: at("P", 43.6), to: "hold" },
      { at: at("P", 44.12), to: centre((p) => p.locator(".notice .bracket-btn"), 0, 3) },
      { at: at("P", 44.6), to: "hold" },
      { at: at("P", 45.05), to: [1170, 560] },
      { at: at("P", 45.42), to: "hold" },
      { at: at("P", 45.86), to: [COVER[0] + 30, COVER[1] - 20] },
      { at: at("P", 46.3), to: "hold" },
      { at: at("P", 47.1), to: [1010, 640] },
      { at: at("P", SEGMENTS.P.to), to: "hold" },
    ],
    clicks: ats("P", CLICKS.P),
    keys: keysFor("P"),
    anchors: { ...FOLIO_ANCHORS, dismiss: { sel: ".notice .bracket-btn" }, sold: { sel: ".caption-body:not(.is-out) .cap-price .sold" } },
    async verify(ctx, meta) {
      const s = await ctx.js(() => ({
        kicker: document.querySelector(".detail-kicker")?.textContent.replace(/\s+/g, " ").trim(),
        cta: document.querySelector(".btn-acquire")?.textContent.trim(),
        disabled: document.querySelector(".btn-acquire")?.disabled,
        notice: !!document.querySelector(".notice"),
      }));
      if (!/no\. 003/i.test(s.kicker ?? "") || !/sold/i.test(s.kicker ?? "") || !/in your collection — ex libris/i.test(s.cta ?? "") || !s.disabled || s.notice) throw new Error(`P ended on ${JSON.stringify(s)}`);
      const lift = meta.starts.find((x) => x.name === "clip-out-up");
      if (!lift || Math.abs(lift.t - T.pGate) > 1e-3) throw new Error(`P: the curtain lifted at ${lift?.t}, not ${T.pGate}`);
      const soldCaption = meta.events.find((e) => e.k === "active" && /the blue hour/i.test(e.v ?? ""));
      meta.marks.lift = lift.t;
      meta.marks.blueHour = soldCaption?.t ?? null;
      meta.marks.end = s;
    },
  },

  /**
   * Reel 53.37–60.00: the end card's shelf. Mode S, pre-rolled, the UI hidden by injected CSS (header,
   * caption, chevrons, ruler, footer; the shelf and both monoliths stay). Three ArrowRight steps
   * knock on 55.50, 56.25 and 57.00.
   */
  E: {
    path: "/",
    mode: "S",
    duration: dur("E"),
    css: ".site-header, .caption, .nav-chevron, .timeline, .site-footer { visibility: hidden !important; }",
    prepare: (ctx) => bootSpecimen(ctx, 2.6),
    keys: keysFor("E"),
    async verify(ctx, meta) {
      const knocks = meta.events.filter((e) => e.k === "active").map((e) => [e.t, e.v]);
      if (knocks.length !== 3) throw new Error(`E: ${knocks.length} steps: ${JSON.stringify(knocks)}`);
      meta.marks.knocks = knocks;
    },
  },
};
