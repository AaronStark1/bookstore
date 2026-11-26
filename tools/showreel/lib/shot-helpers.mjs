/**
 * Helpers shared by the shot lists (shots.mjs, shots-vertical.mjs) and the smoke run (smoke.mjs).
 * The `centre` / `within` pattern is the sibling's (cook-with-me/tools/showreel/lib/shot-helpers.mjs);
 * the rest is this app's: its header buttons, its shelf and its boot.
 */

/** Centre of a Playwright locator, nudged by (dx, dy): a cursor target resolved when its glide starts. */
export const centre = (locate, dx = 0, dy = 0) => async (ctx) => {
  const b = await ctx.box(locate(ctx.page));
  return [b.cx + dx, b.cy + dy];
};

/** A point inside a locator's box, as fractions of its width and height. */
export const within = (locate, fx, fy) => async (ctx) => {
  const b = await ctx.box(locate(ctx.page));
  return [b.x + b.w * fx, b.y + b.h * fy];
};

/**
 * A header button by its label. Their accessible names include the CSS brackets ("[ Catalog ]"),
 * so they are found by the button's own text, never by an anchored role name (brief §2).
 */
export const bracket = (label) => (p) => p.locator(".site-nav .bracket-btn", { hasText: new RegExp(`^${label}$`, "i") });

/** The active (centred) cover's rect, from the engine's own transforms. */
export const activeCover = (ctx) =>
  ctx.js(() => {
    let best = null, bd = Infinity;
    for (const box of document.querySelectorAll(".book-box")) {
      if (box.style.display !== "block") continue;
      const r = box.querySelector(".cv").getBoundingClientRect();
      if (r.width < 4) continue;
      const d = Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight * 0.42);
      if (d < bd) {
        bd = d;
        best = { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }
    }
    return best;
  });

/** A point on the active cover, as fractions of its rect (the engine hit-tests the cover analytically). */
export const onCover = (fx = 0.5, fy = 0.5) => async (ctx) => {
  const r = await activeCover(ctx);
  if (!r) throw new Error("no active cover on screen");
  return [r.x + r.w * fx, r.y + r.h * fy];
};

/** The centre of the n-th visible spine to the left (−) or right (+) of the active cover, by screen x. */
export const spine = (offset, fy = 0.5) => async (ctx) =>
  ctx.js(
    ([k, fy]) => {
      const boxes = [...document.querySelectorAll(".book-box")]
        .filter((b) => b.style.display === "block")
        .map((b) => ({ r: b.querySelector(".sp").getBoundingClientRect(), b }))
        .filter((o) => o.r.width > 2);
      const centreX = innerWidth / 2;
      const side = boxes.filter((o) => (k < 0 ? o.r.x + o.r.width / 2 < centreX - 40 : o.r.x + o.r.width / 2 > centreX + 40));
      side.sort((a, b) => Math.abs(a.r.x + a.r.width / 2 - centreX) - Math.abs(b.r.x + b.r.width / 2 - centreX));
      const o = side[Math.abs(k) - 1];
      if (!o) throw new Error(`no spine at offset ${k}`);
      return [o.r.x + o.r.width / 2, o.r.y + o.r.height * fy];
    },
    [offset, fy],
  );

/**
 * The shelf's state: the active title, how many volumes are on it, and whether it has settled. The
 * engine calls a volume settled at |T − s| < 0.25; this asks for |T − s| < ~0.03 (the centre volume
 * turned at least 89.5° to face the camera) and a ruler dot that moves less than 0.2 px per subframe.
 */
export async function shelfState(ctx) {
  const read = () =>
    ctx.js(() => {
      let minRot = 0;
      for (const b of document.querySelectorAll(".book-box")) {
        if (b.style.display !== "block") continue;
        const m = b.style.transform.match(/rotateY\((-?[\d.]+)deg\)/);
        if (m) minRot = Math.min(minRot, Number(m[1]));
      }
      const dot = document.querySelector(".timeline-dot")?.style.transform ?? "";
      return {
        title: document.querySelector(".caption-body:not(.is-out) .cap-title")?.textContent.trim() ?? null,
        captions: document.querySelectorAll(".caption-body").length,
        books: document.querySelectorAll(".book-box").length,
        minRot,
        dotX: Number(dot.match(/translate3d\((-?[\d.]+)px/)?.[1] ?? NaN),
        ruler: [...document.querySelectorAll(".tick-label")].map((l) => l.textContent.trim()),
      };
    });
  const a = await read();
  await ctx.step();
  const b = await read();
  const dotStill = !(Math.abs(b.dotX - a.dotX) >= 0.2);
  return { title: b.title, captions: b.captions, books: b.books, settled: b.minRot <= -89.5 && dotStill, minRot: b.minRot, ruler: b.ruler };
}

/**
 * Mode S boot for a pre-rolled shot: the specimens mount at once (every /api request is refused),
 * the curtain lifts and the shelf spools in; then wait out the caption's mask-slide.
 */
export async function bootSpecimen(ctx, preroll = 2.2) {
  await ctx.settle(() => document.querySelectorAll(".book-box").length === 36, "the specimen shelf");
  await ctx.ready("the specimen shelf", { books: 36 });
  await ctx.preroll(preroll);
}

/**
 * Mode L boot: poll in real time, without moving virtual time, until the fixture catalogue is on
 * the shelf (36 nodes, footer ONLINE): the specimen shelf must never mount first (brief §5.1.4).
 */
export async function bootLive(ctx, preroll = 2.2) {
  await ctx.settle(() => document.querySelectorAll(".book-box").length === 36 && document.querySelector(".api-status")?.dataset.status === "online", "the live (fixture) shelf");
  await ctx.ready("the live shelf", { books: 36 });
  const first = await ctx.js(() => window.__reelEvents.find((e) => e.k === "status" && e.v === "offline"));
  if (first) throw new Error("the specimen shelf mounted before the fixtures landed");
  await ctx.preroll(preroll);
}

/** Every cover on the shelf is one of the twelve specimen covers (never the title-hash fallback). */
export async function coversAreSpecimens(ctx) {
  // (the fixtures come through ctx: importing capture.mjs here would wait on its own top-level await)
  const covers = new Set(ctx.fixtures.covers);
  const used = await ctx.js(() => [...new Set([...document.querySelectorAll(".cover-artwork")].map((d) => d.style.backgroundImage))]);
  const urls = used.map((bg) => {
    const m = bg.match(/^url\("(.*)"\)$/);
    return m ? decodeURIComponent(m[1]) === m[1] ? m[1] : m[1] : bg;
  });
  const bad = urls.filter((u) => !covers.has(u) && !covers.has(decodeURI(u)));
  return { distinct: urls.length, bad: bad.length };
}
