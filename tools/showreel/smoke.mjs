#!/usr/bin/env node
/**
 * Proves the virtual clock and the data layer on this app before any real shot is filmed
 * (brief §5.1, §12.1–2).
 *
 *   npm run smoke              # every case → out/smoke/<case>/ + <case>-sheet.jpg, then a verdict per case
 *   node smoke.mjs a d         # only these cases
 *
 * Each case films ~3 s (16:9: 1600×900, DSF 1.5, 180 subframes/s; g: 432×768 touch) and checks the page:
 *   a  shelf step: one ArrowRight; 1 s later exactly one .caption-body and a settled shelf
 *   b  boot: the curtain lifts, .boot is gone 2.5 s later, the shelf has spooled, the footer says OFFLINE
 *   c  folio: click the settled cover → full screen, blots at r 720, nine blocks up; [ CLOSE ] → .detail gone
 *   d  sheets: [ CATALOG ] opens, a row click closes it, the shelf lands on that book, .side-sheet gone
 *   e  search: "the" → 6 FOUND, 6 nodes, settled finite shelf; [ CLEAR ] → 36 nodes and the year ruler
 *   f  determinism: the same 2 s shot twice; 6 chosen subframes are byte-identical JPEGs
 *   g  touch (9:16): a CDP touch drag moves the shelf; a CDP tap on the cover opens the folio
 *   h  mode L: the fixture shelf is ONLINE, an authorised PUT /api/makePayment is answered (and the
 *      page stays put on its hash), an unauthorised one is refused with the real 401 body
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, captureShot, sheet, fixtures, ORIGIN } from "./capture.mjs";
import { startPreview, stopPreview } from "./lib/app.mjs";
import { bracket, centre, onCover, shelfState, bootSpecimen, bootLive, coversAreSpecimens } from "./lib/shot-helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", "smoke");
const results = {};
const check = (name, ok, detail) => {
  (results[name] ??= []).push({ ok: !!ok, detail });
  return ok;
};

const CASES = {
  a: {
    path: "/",
    duration: 1.6,
    prepare: (ctx) => bootSpecimen(ctx),
    keys: [{ at: 0.3, key: "ArrowRight" }],
    async verify(ctx) {
      const s = await shelfState(ctx);
      check("a", s.captions === 1, `.caption-body nodes 1.3 s after the step: ${s.captions}`);
      check("a", s.settled && /^an atlas of lost weather$/i.test(s.title ?? ""), `settled=${s.settled} (centre volume at ${s.minRot}°), active: ${s.title}`);
    },
  },

  b: {
    path: "/",
    duration: 3.2,
    async prepare(ctx) {
      await ctx.settle(() => !!document.querySelector(".boot"), "the curtain");
      await ctx.ready("boot");
    },
    async verify(ctx, meta) {
      const lift = meta.events.find((e) => e.k === "lifting" && e.v === true);
      const gone = meta.events.find((e) => e.k === "boot" && e.v === false);
      const s = await shelfState(ctx);
      const footer = await ctx.js(() => document.querySelector(".api-status").textContent.trim());
      check("b", lift, `curtain is-lifting at shot ${lift?.t} s; .boot unmounted at ${gone?.t} s (lift 950 ms)`);
      check("b", gone && gone.t - lift.t <= 2.5, `.boot gone ${(gone?.t - lift?.t).toFixed(3)} s after the lift began`);
      check("b", s.books === 36 && s.settled, `36 nodes, spooled and settled: ${s.books}, ${s.settled}`);
      check("b", /Offline — Specimen catalogue/i.test(footer), `footer: ${footer}`);
      const curtain = meta.starts.find((x) => x.name === "clip-out-up");
      check("b", curtain && Math.abs(curtain.t - lift.t) < 0.006, `clip-out-up animation first seen at ${curtain?.t} s (${curtain?.dur} ms)`);
    },
  },

  c: {
    path: "/",
    duration: 4.4,
    prepare: (ctx) => bootSpecimen(ctx),
    cursor: [
      { at: 0, to: [800, 760] },
      { at: 0.25, to: onCover(0.55, 0.45) },
      { at: 2.7, to: "hold" },
      { at: 3.15, to: centre((p) => p.locator(".detail-close")) },
    ],
    clicks: [0.5, 3.25],
    events: [
      {
        at: 0.5 + 2.1,
        run: async (ctx) => {
          const s = await ctx.js(() => ({
            clip: getComputedStyle(document.querySelector(".detail")).clipPath,
            blots: [...document.querySelectorAll(".ink-blot")].map((c) => Number(c.getAttribute("r"))),
            up: [...document.querySelectorAll(".detail .rv > *")].map((el) => getComputedStyle(el).transform),
            title: document.querySelector(".detail-title")?.textContent.trim(),
          }));
          check("c", /inset\(0px( 0px)*( round 0px)?\)|inset\(0px\)|none/.test(s.clip), `sheet clip 2.1 s after the release: ${s.clip}`);
          check("c", s.blots.length === 7 && s.blots.every((r) => r === 720), `ink blots: ${s.blots.join(", ")}`);
          // eight reveal blocks: the gallery block (the ninth .rv) only exists for books with photos
          check("c", s.up.length === 8 && s.up.every((tf) => tf === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(tf)), `text blocks up: ${s.up.filter((tf) => tf === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(tf)).length}/${s.up.length} (${s.title})`);
        },
      },
    ],
    async verify(ctx, meta) {
      const detail = await ctx.js(() => !!document.querySelector(".detail"));
      const closed = meta.events.find((e) => e.k === "detail" && e.v === false);
      check("c", !detail && closed, `.detail unmounted at ${closed?.t} s (fold 780 ms from 3.25 s)`);
      const bloom = meta.starts.find((x) => x.kind === "waapi" && /detail/.test(x.cls) && x.dur === 1050);
      check("c", bloom && Math.abs(bloom.t - 0.5) < 0.006, `bloom (WAAPI 1050 ms) first seen at ${bloom?.t} s, the release at 0.5 s`);
    },
  },

  d: {
    path: "/",
    duration: 3.0,
    prepare: (ctx) => bootSpecimen(ctx),
    cursor: [
      { at: 0, to: [1100, 140] },
      { at: 0.2, to: centre(bracket("Catalog")) },
      { at: 1.2, to: "hold" },
      { at: 1.5, to: centre((p) => p.locator(".index-row", { hasText: "Night Ferry to Otaru" }), -40, 0) },
    ],
    clicks: [0.35, 1.6],
    async verify(ctx, meta) {
      const s = await shelfState(ctx);
      const sheetGone = await ctx.js(() => !document.querySelector(".side-sheet"));
      check("d", sheetGone, `.side-sheet gone: ${sheetGone}`);
      check("d", /night ferry to otaru/i.test(s.title ?? "") && s.settled, `landed on ${s.title}, settled=${s.settled}`);
      const knocks = meta.events.filter((e) => e.k === "active" && e.t > 1.6).map((e) => e.v);
      check("d", knocks.length === 4, `the glide passed ${knocks.length} volumes the short way: ${knocks.join(" → ")}`);
    },
  },

  e: {
    path: "/",
    duration: 4.4,
    prepare: (ctx) => bootSpecimen(ctx),
    cursor: [
      { at: 0, to: [1300, 140] },
      { at: 0.15, to: centre(bracket("Search")) },
      { at: 2.6, to: "hold" },
    ],
    clicks: [0.25, 2.8],
    keys: [{ at: 0.75, key: "t" }, { at: 1.0, key: "h" }, { at: 1.25, key: "e" }],
    events: [
      {
        at: 2.75,
        run: async (ctx) => {
          const s = await shelfState(ctx);
          const status = await ctx.js(() => document.querySelector(".search-status").textContent.trim());
          const found = (await ctx.events()).find((e) => e.k === "search" && /found/i.test(e.v ?? ""));
          check("e", /^6 found$/i.test(status), `search status: ${status} (appeared at virtual ${found?.t} ms)`);
          check("e", s.books === 6 && s.settled, `${s.books} nodes, settled=${s.settled}, active ${s.title}`);
        },
      },
    ],
    async verify(ctx) {
      await ctx.preroll(1.2);
      const s = await shelfState(ctx);
      check("e", s.books === 36 && s.ruler.join(" ") === "1955 1960 1965 1970 1975 1980", `after [ CLEAR ]: ${s.books} nodes, ruler ${s.ruler.join(" ")}`);
    },
  },

  f: {
    path: "/",
    duration: 2.0,
    prepare: (ctx) => bootSpecimen(ctx),
    cursor: [
      { at: 0, to: [400, 700] },
      { at: 0.4, to: onCover(0.6, 0.4) },
      { at: 1.9, to: "hold" },
    ],
    wheels: [{ at: 0.2, dy: 100 }],
    keys: [{ at: 1.0, key: "ArrowLeft" }],
  },

  g: {
    path: "/",
    duration: 3.6,
    viewportAspect: "9x16",
    fps: 180,
    prepare: (ctx) => bootSpecimen(ctx),
    swipes: [{ at: 0.2, move: 0.42, hold: 0.12, dx: -128, from: [300, 330] }],
    cursor: [
      { at: 0.95, to: [300, 520] },
      { at: 1.3, to: onCover(0.5, 0.5) },
      { at: 3.5, to: "hold" },
    ],
    clicks: [1.55],
    events: [
      {
        at: 1.2,
        run: async (ctx) => {
          const s = await shelfState(ctx);
          check("g", /the blue hour/i.test(s.title ?? "") && s.settled, `after a 128 px touch swipe: ${s.title}, settled=${s.settled}`);
        },
      },
    ],
    async verify(ctx, meta) {
      const pe = meta.swipes.length;
      check("g", pe === 1, `swipes recorded: ${pe} (CDP Input.dispatchTouchEvent start / move / end)`);
      const open = await ctx.js(() => ({ detail: !!document.querySelector(".detail"), title: document.querySelector(".detail-title")?.textContent.trim(), tilt: document.querySelector(".shelf-stage").classList.contains("is-over-cover") }));
      check("g", open.detail && /blue hour/i.test(open.title ?? ""), `tap on the cover opened: ${open.title}`);
      check("g", !open.tilt, `no mouse hover state on touch: ${!open.tilt}`);
      const opened = meta.events.find((e) => e.k === "detail" && e.v === true);
      check("g", opened && Math.abs(opened.t - 1.55) < 0.012, `the folio mounted at ${opened?.t} s, the tap released at 1.55 s`);
    },
  },

  h: {
    path: "/",
    duration: 0.6,
    mode: "L",
    async prepare(ctx) {
      await bootLive(ctx);
      const s = await shelfState(ctx);
      const info = await ctx.js(() => ({ footer: document.querySelector(".api-status").textContent.trim(), ruler: [...document.querySelectorAll(".tick-label")].map((l) => l.textContent.trim()) }));
      check("h", /REST API: Online$/i.test(info.footer) && s.books === 36, `mode L: ${info.footer}, ${s.books} nodes, active ${s.title}, ruler ${info.ruler.join(" ")}`);
      const cov = await coversAreSpecimens(ctx);
      check("h", cov.bad === 0, `covers on the live shelf: ${cov.distinct} distinct, ${cov.bad} not a specimen cover (no title-hash fallback)`);
      // an unauthorised and an authorised PUT, from the page (the app's own client does the same)
      const fx = fixtures();
      const book = fx.books[2];
      const r = await ctx.js(
        async ([book, token]) => {
          const put = (headers, body) => fetch("/api/makePayment", { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (res) => ({ status: res.status, body: await res.json() }));
          return {
            none: await put({}, { bookDetails: book }),
            missing: await put({ authorization: "Bearer " + token }, {}),
            ok: await put({ authorization: "Bearer " + token }, { bookDetails: book }),
          };
        },
        [book, fx.session.session.token],
      );
      check("h", r.none.status === 401 && r.none.body === "Authorization Error: No token provided", `unauthorised PUT → ${r.none.status} ${JSON.stringify(r.none.body)}`);
      check("h", r.missing.status === 400 && r.missing.body === "Book details are required", `PUT without bookDetails → ${r.missing.status} ${JSON.stringify(r.missing.body)}`);
      check("h", r.ok.status === 200 && r.ok.body.session.url === `${ORIGIN}/#stripe-checkout`, `authorised PUT → ${r.ok.status}, session ${r.ok.body.session.id}`);
      // the app's own redirect target is a same-document navigation: the page stays put
      const before = await ctx.js(() => (window.__marker = Math.random(), window.__marker));
      await ctx.js((url) => window.location.assign(url), r.ok.body.session.url);
      await new Promise((res) => setTimeout(res, 300));
      const after = await ctx.js(() => ({ marker: window.__marker, hash: location.hash, books: document.querySelectorAll(".book-box").length }));
      check("h", after.marker === before && after.hash === "#stripe-checkout" && after.books === 36, `location.assign(session.url): same document=${after.marker === before}, hash ${after.hash}`);
      const sold = await ctx.js(async () => (await (await fetch("/api/getBooks")).json()).find((b) => b.title === "The Blue Hour"));
      check("h", sold.status === "sold" && sold.brought === "collector@example.com", `after the PUT, getBooks serves The Blue Hour as ${sold.status}, brought by the demo collector`);
    },
    async verify(ctx, meta) {
      const puts = meta.network.filter((r) => r.method === "PUT");
      check("h", puts.length === 3 && puts.every((p) => p.served === "mock"), `PUTs seen by the mock: ${JSON.stringify(puts)}`);
    },
  },
};

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ids = only.length ? only : Object.keys(CASES);
await fs.mkdir(OUT, { recursive: true });
const preview = await startPreview();
const browser = await launch();
try {
  for (const id of ids) {
    const shot = CASES[id];
    const started = Date.now();
    try {
      if (id === "f") {
        // the same shot twice: identical JPEGs at 6 chosen subframes, identical anchors and events
        const a = await captureShot(browser, "f1", shot, { aspect: "16x9", outDir: OUT, quiet: true });
        const b = await captureShot(browser, "f2", shot, { aspect: "16x9", outDir: OUT, quiet: true });
        const picks = [0, 45, 90, 180, 270, 359];
        const same = await Promise.all(picks.map(async (n) => {
          const f = `${String(n).padStart(5, "0")}.jpg`;
          return (await fs.readFile(path.join(OUT, "f1", f))).equals(await fs.readFile(path.join(OUT, "f2", f)));
        }));
        check("f", same.every(Boolean), `subframes ${picks.join(", ")}: ${same.map((x) => (x ? "identical" : "DIFFERENT")).join(", ")}`);
        const anchors = (m) => JSON.stringify(m.frames.map((x) => x.a ?? null));
        check("f", anchors(a.meta) === anchors(b.meta), `anchors over ${a.meta.frames.length} subframes: ${anchors(a.meta) === anchors(b.meta) ? "identical" : "DIFFERENT"}`);
        check("f", JSON.stringify(a.meta.events) === JSON.stringify(b.meta.events), `app events: ${a.meta.events.length} and ${b.meta.events.length}, ${JSON.stringify(a.meta.events) === JSON.stringify(b.meta.events) ? "identical" : "DIFFERENT"}`);
        console.log(`case f: filmed twice in ${((Date.now() - started) / 1000).toFixed(0)}s; sheet ${await sheet("f1", { outDir: OUT })}`);
        continue;
      }
      const { meta } = await captureShot(browser, id, shot, { aspect: "16x9", outDir: OUT, quiet: true });
      if (meta.errors.length) check(id, true, `page errors (informational): ${meta.errors.slice(0, 3).join(" | ")}`);
      console.log(`case ${id}: filmed in ${((Date.now() - started) / 1000).toFixed(0)}s; sheet ${await sheet(id, { outDir: OUT })}`);
    } catch (e) {
      check(id, false, `capture failed: ${e.message}`);
    }
  }
} finally {
  await browser.close();
  if (!preview.reused) await stopPreview();
}
let failed = 0;
for (const id of ids) {
  const list = results[id] ?? [{ ok: false, detail: "no checks ran" }];
  const ok = list.every((r) => r.ok);
  if (!ok) failed++;
  console.log(`\n${ok ? "PASS" : "FAIL"} ${id}`);
  for (const r of list) console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.detail}`);
}
await fs.writeFile(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
