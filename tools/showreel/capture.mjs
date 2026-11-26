#!/usr/bin/env node
/**
 * Films the reel's shots from the running Bibliotheca Obscura app, frame by frame, under virtual time.
 *
 *   node capture.mjs                         # every 16:9 shot (shots.mjs) → out/shots/16x9/<id>/
 *   node capture.mjs H S --sheet             # only these shots, plus a contact sheet each (1 frame / 0.25 s)
 *   node capture.mjs --aspect 9x16           # the vertical cut's shots (shots-vertical.mjs)
 *   node capture.mjs --workers 2             # shots filmed in parallel (default 3)
 *   node capture.mjs --sheet-only H          # just rebuild a contact sheet
 *
 * The app is a production build (out/app-dist) served by `vite preview` on :5180 (lib/app.mjs),
 * never the user's dev server on :5173. Two data modes, both real (brief §2, §4):
 *   S  specimen: every /api and /uploads request is aborted (connection refused), so the app falls
 *      back to its twelve built-in specimen folios and says so in its footer.
 *   L  live fixtures: GET /api/getBooks, POST /api/login and PUT /api/makePayment are answered
 *      from fixtures/ (shaped like a seeded backend); any other /api or /uploads request, and any
 *      write without a mock, is refused and fails the shot.
 * A shot may hold a response and release it at a virtual time (`gates`). The Google Fonts host
 * names are answered from out/cache/fonts (a miss fails the shot); every other host fails the shot,
 * and Chrome's resolver is mapped to NOTFOUND for everything but localhost, so nothing can leave
 * the machine. backend/ is never started; nothing ever reaches :3000.
 *
 * Each shot runs in its own browser context with lib/vclock.js installed: 16:9 films 180 subframes
 * a second (3 per 60 fps frame, averaged into motion blur by the compositor), 9:16 films 90. Pointer
 * glides, presses, drags, wheel notches, keys, taps, swipes and element scrolls are applied per
 * subframe from the shot list. meta.json keeps the pointer path, every press, the anchors' rects,
 * the app's own events (active volume changes, the curtain lift, sheets mounting) and the virtual
 * start of every animation, for the compositor's cursor, camera and transitions and for the score.
 */
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import ffmpegPath from "ffmpeg-static";
import { VCLOCK_SCRIPT } from "./lib/vclock.js";
import { ORIGIN, startPreview, stopPreview, proxyErrors } from "./lib/app.mjs";
import { FIXTURES, CACHE, FONT_CACHE, fontKey, fontManifest, DEMO } from "./fixtures.mjs";
import { PRESS_S } from "./timeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(here, "out", "shots");
export { ORIGIN, PRESS_S };

/** Per-aspect filming setup. Segment offsets in timeline.mjs are multiples of 1/90 s, so both rates work. */
export const ASPECTS = {
  "16x9": { viewport: { width: 1600, height: 900 }, dsf: 1.5, subFps: 180, touch: false },
  "9x16": { viewport: { width: 432, height: 768 }, dsf: 3, subFps: 90, touch: true },
};

/** System Chrome (brief §5.2), with the sibling's flags, muted, and a resolver that only knows localhost. */
export const BROWSER = { channel: "chrome" };
export const BROWSER_ARGS = [
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--force-color-profile=srgb",
  "--hide-scrollbars",
  "--mute-audio",
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const round1 = (v) => Math.round(v * 10) / 10;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-600)}`))));
  });
}

// ------------------------------------------------------------------------------------------ data

let FX = null;
/** The fixtures (read once): the twelve documents, the post-purchase list, the session, the covers. */
export function fixtures() {
  if (FX) return FX;
  const file = path.join(FIXTURES, "books.json");
  if (!existsSync(file)) throw new Error("No fixtures: run `npm run fixtures` first.");
  const books = JSON.parse(readFileSync(file, "utf8"));
  const session = JSON.parse(readFileSync(path.join(FIXTURES, "session.json"), "utf8"));
  const covers = JSON.parse(readFileSync(path.join(CACHE, "covers.json"), "utf8"));
  // what the real makePayment writes before it creates the Stripe session (bookController.buyBook)
  const afterPurchase = books.map((b) => (b.title === "The Blue Hour" ? { ...b, status: "sold", brought: DEMO.user.email } : b));
  FX = { books, afterPurchase, session, covers, byTitle: (t) => books.find((b) => b.title === t) };
  return FX;
}

const isApi = (u) => u.host === new URL(ORIGIN).host && (u.pathname.startsWith("/api/") || u.pathname.startsWith("/uploads/"));
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * Installs the shot's data layer on a browser context. Returns the request log, the failures (a
 * refused write, a cache miss, a stray host) and the gate table for held responses.
 */
async function installData(context, shot) {
  const fx = fixtures();
  const fonts = fontManifest();
  const mode = shot.mode ?? "S";
  const log = [];
  const failures = [];
  const held = new Map(); // gate name → { route, entry } (first request of that name only)
  const gated = new Set(shot.gates?.map((g) => g.name) ?? []);
  const state = { paid: false, afterPurchase: !!shot.afterPurchase };
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });

  const respond = {
    getBooks(route, url) {
      const list = state.afterPurchase || state.paid ? fx.afterPurchase : fx.books;
      const q = url.searchParams.get("search");
      // the backend's case-insensitive $regex on title (the client escapes regex characters)
      const body = q ? list.filter((b) => new RegExp(q, "i").test(b.title)) : list;
      return json(route, 200, body);
    },
    login(route) {
      return json(route, 200, fx.session.login);
    },
    makePayment(route, url, req) {
      const auth = req.headers()["authorization"];
      if (!auth) return json(route, 401, fx.session.unauthorised.body);
      if (auth !== `Bearer ${fx.session.session.token}`) return json(route, 401, "Authorization Error: invalid token");
      let body = null;
      try {
        body = JSON.parse(req.postData() ?? "null");
      } catch {}
      if (!body?.bookDetails?._id) return json(route, 400, fx.session.missingBook.body);
      state.paid = true;
      return json(route, 200, fx.session.makePayment);
    },
  };

  await context.route(
    () => true,
    async (route) => {
      const req = route.request();
      const method = req.method();
      const url = new URL(req.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      // fonts: replayed from the cache, never forwarded
      if (FONT_HOSTS.has(url.host)) {
        const hit = fonts.entries[fontKey(url.href)];
        if (!hit || !existsSync(path.join(FONT_CACHE, hit.file))) {
          failures.push(`font cache miss: ${url.href}`);
          return route.abort("failed");
        }
        return route.fulfill({ status: 200, contentType: hit.type, body: readFileSync(path.join(FONT_CACHE, hit.file)), headers: { "access-control-allow-origin": "*", "cache-control": "max-age=31536000" } });
      }
      if (url.origin !== ORIGIN) {
        failures.push(`stray host: ${method} ${url.href}`);
        return route.abort("blockedbyclient");
      }
      if (!isApi(url)) {
        if (method !== "GET" && method !== "HEAD") {
          failures.push(`${method} ${url.pathname} has no mock: refusing it`);
          return route.abort("blockedbyclient");
        }
        return route.continue();
      }
      // the app's API: one entry per request (whether it carried the bearer token, never its value)
      const entry = { method, path: url.pathname + url.search, auth: !!req.headers()["authorization"], at: null };
      log.push(entry);
      const name = method === "GET" && url.pathname === "/api/getBooks" ? "getBooks" : method === "POST" && url.pathname === "/api/login" ? "login" : method === "PUT" && url.pathname === "/api/makePayment" ? "makePayment" : null;
      if (gated.has(name) && !held.has(name)) {
        entry.served = "held";
        held.set(name, { route, url, req, entry });
        return;
      }
      return serve(route, url, req, entry, name);
    },
  );

  function serve(route, url, req, entry, name, action) {
    if (mode === "S" || action === "abort") {
      entry.served = "aborted";
      return route.abort("connectionrefused");
    }
    if (!name || !respond[name]) {
      entry.served = "refused";
      failures.push(`${entry.method} ${entry.path} has no fixture or mock in mode L`);
      return route.abort("blockedbyclient");
    }
    entry.served = name === "getBooks" ? "fixture" : "mock";
    return respond[name](route, url, req);
  }

  /** Releases a held response (waits in real time for the request if it has not been made yet). */
  async function release(name, action, at) {
    const started = Date.now();
    while (!held.has(name)) {
      if (Date.now() - started > 15000) throw new Error(`gate ${name}: the request never came`);
      await sleep(5);
    }
    const h = held.get(name);
    h.entry.at = at;
    h.entry.gate = action;
    await serve(h.route, h.url, h.req, h.entry, name, action);
  }
  return { log, failures, release, held };
}

// ------------------------------------------------------------------------------------- browser

export async function launch() {
  return chromium.launch({ channel: BROWSER.channel, headless: true, args: BROWSER_ARGS });
}

/** Polls from Node in real time, leaving virtual time where it is. */
export async function poll(check, what, timeout = 20000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** The faces the app and the reel use (brief §5.1.6), with text that pulls in every subset needed. */
export const FACES = [
  ['400 12px "Inter Tight"', "Kōseisha ₹1,450 Éditions"],
  ['500 12px "Inter Tight"', "Kōseisha ₹1,450"],
  ['600 11px "Inter Tight"', "Kōseisha ₹1,450 BIBLIOTHECA"],
  ['700 12px "Inter Tight"', "₹1,450 Kōseisha"],
  ['900 12px "Inter Tight"', "ED ARCHIVE"],
  ["400 20px Newsreader", "Kōseisha Éditions Valparaíso"],
  ["500 40px Newsreader", "Kōseisha The Silent Valley"],
  ["italic 400 20px Newsreader", "First Edition Kōseisha"],
];

/** In-page observer: the app's own events, in virtual time (brief §5.3 `active`). */
const OBSERVER_SCRIPT = String.raw`
(() => {
  const ev = (window.__reelEvents = []);
  let last = {};
  const snap = () => {
    const cap = document.querySelector(".caption-body:not(.is-out) .cap-title");
    const sheet = document.querySelector(".side-sheet");
    return {
      active: cap ? cap.textContent.trim() : null,
      boot: !!document.querySelector(".boot"),
      lifting: !!document.querySelector(".boot.is-lifting"),
      sheet: sheet ? (sheet.classList.contains("is-auth") ? "auth" : "index") + (sheet.classList.contains("is-closing") ? ":closing" : "") : null,
      detail: !!document.querySelector(".detail"),
      notice: !!document.querySelector(".notice"),
      status: document.querySelector(".api-status")?.getAttribute("data-status") ?? null,
      search: document.querySelector(".search-status")?.textContent.trim() || null,
      books: document.querySelectorAll(".book-box").length,
      header: [...document.querySelectorAll(".site-nav .bracket-btn")].map((b) => b.textContent.trim()).join("|"),
      cta: document.querySelector(".btn-acquire")?.textContent.trim() ?? null,
    };
  };
  const check = () => {
    const s = snap();
    const t = window.__vt ? window.__vt.now : 0;
    for (const k of Object.keys(s)) if (s[k] !== last[k]) ev.push({ t, k, v: s[k], was: last[k] ?? null });
    last = s;
  };
  const start = () => {
    check();
    new MutationObserver(check).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-status"], characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
`;

/** Rects of the anchors (page CSS px), plus the active cover: the .cv face nearest the viewport centre. */
const ANCHOR_FN = (specs) => {
  const out = {};
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
  };
  for (const [name, s] of Object.entries(specs)) {
    if (s.cover) {
      let best = null, bd = Infinity;
      for (const box of document.querySelectorAll(".book-box")) {
        if (box.style.display !== "block") continue;
        const cv = box.querySelector(".cv");
        const r = cv.getBoundingClientRect();
        if (r.width < 4) continue;
        const d = Math.hypot(r.x + r.width / 2 - innerWidth / 2, r.y + r.height / 2 - innerHeight * 0.42);
        if (d < bd) { bd = d; best = cv; }
      }
      out[name] = best ? rect(best) : null;
      continue;
    }
    let els = [...document.querySelectorAll(s.sel)];
    if (s.text) els = els.filter((e) => (e.textContent ?? "").trim() === s.text || (s.contains && (e.textContent ?? "").includes(s.text)));
    const el = els[s.nth ?? 0];
    out[name] = el ? rect(el) : null;
  }
  return out;
};

/** The anchors every shot records (brief §5.3), extended per shot. */
export const BASE_ANCHORS = {
  cover: { cover: true },
  caption: { sel: ".caption-body:not(.is-out)" },
  captionTitle: { sel: ".caption-body:not(.is-out) .cap-title" },
  captionPrice: { sel: ".caption-body:not(.is-out) .cap-price" },
  timeline: { sel: ".timeline" },
  header: { sel: ".site-header" },
  searchField: { sel: ".search-field" },
  searchBtn: { sel: ".site-nav .bracket-btn", text: "Search" },
  clearBtn: { sel: ".site-nav .bracket-btn", text: "Clear" },
  catalogBtn: { sel: ".site-nav .bracket-btn", text: "Catalog" },
  loginBtn: { sel: ".site-nav .bracket-btn", text: "Login" },
  logoutBtn: { sel: ".site-nav .bracket-btn", text: "Logout" },
  sheet: { sel: ".side-sheet" },
  detail: { sel: ".detail" },
  detailText: { sel: ".detail-inner" },
  detailTitle: { sel: ".detail-title" },
  acquire: { sel: ".btn-acquire" },
  price: { sel: ".acquire" },
  poster: { sel: ".detail-poster" },
  notice: { sel: ".notice" },
  boot: { sel: ".boot" },
  footer: { sel: ".site-footer" },
};

/** Helpers a shot's prepare/events receive. */
/**
 * Waits (real time) until no request is in flight except held ones, and 15 ms after the last one
 * ended, so a response (or a refusal) is always consumed by the page before the same virtual step.
 */
async function settleNetwork(net, timeout = 15000) {
  const started = Date.now();
  const heldReqs = () => new Set([...net.held.values()].map((h) => h.req));
  for (;;) {
    const held = heldReqs();
    const busy = [...net.inflight].filter((r) => !held.has(r));
    if (!busy.length) break;
    if (Date.now() - started > timeout) throw new Error(`requests still in flight: ${busy.map((r) => r.url()).join(", ")}`);
    await sleep(3);
  }
  const since = Date.now() - net.lastDone;
  if (since < 15) await sleep(15 - since);
}

function makeContext(page, aspect, subFps, data, net) {
  const stepMs = 1000 / subFps;
  const ctx = {
    settleNetwork: () => settleNetwork(net),
    fixtures: fixtures(),
    page,
    aspect,
    vars: {},
    stepMs,
    subFps,
    data,
    js: (fn, arg) => page.evaluate(fn, arg),
    poll,
    /** One virtual step of ms. */
    async step(ms = stepMs) {
      await settleNetwork(net);
      await page.evaluate((m) => window.__vt.step(m), ms);
    },
    /** Advances virtual time without filming, one subframe at a time. */
    async preroll(seconds) {
      const target = (await page.evaluate(() => window.__vt.now)) + seconds * 1000;
      let now = await page.evaluate(() => window.__vt.now);
      while (now < target - 1e-6) {
        now = Math.min(target, now + stepMs);
        await settleNetwork(net);
        await page.evaluate((t) => window.__vt.stepTo(t), now);
      }
    },
    /** Steps virtual time until the page predicate holds. */
    async until(predicate, what, maxSeconds = 6, arg) {
      for (let i = 0; i < maxSeconds * subFps; i++) {
        if (await page.evaluate(predicate, arg)) return;
        await ctx.step();
      }
      throw new Error(`timed out waiting for ${what}`);
    },
    /** Waits until the predicate holds without moving virtual time (zero-length steps let React render what landed). */
    async settle(predicate, what, timeout = 15000, arg) {
      const started = Date.now();
      for (;;) {
        if (await page.evaluate(predicate, arg)) return;
        if (Date.now() - started > timeout) throw new Error(`timed out (settle) waiting for ${what}`);
        await settleNetwork(net);
        await page.evaluate(() => window.__vt.step(0));
        await sleep(4);
      }
    },
    /**
     * Real-time readiness (brief §5.1.6): every face loaded and checked, every cover pre-decoded,
     * and `books` .book-box nodes on the shelf (null: don't check). Never moves virtual time.
     */
    async ready(what, { books = null, timeout = 30000 } = {}) {
      const started = Date.now();
      const covers = fixtures().covers;
      for (;;) {
        const s = await page.evaluate(
          async ([faces, covers, books]) => {
            await Promise.all(faces.map(([f, t]) => document.fonts.load(f, t).catch(() => null)));
            const fonts = document.fonts.status === "loaded" && faces.every(([f, t]) => document.fonts.check(f, t));
            if (!window.__covers) {
              window.__covers = "pending";
              Promise.all(covers.map((u) => { const i = new Image(); i.src = u; return i.decode().then(() => i); }))
                .then((imgs) => (window.__covers = imgs))
                .catch((e) => (window.__covers = "failed: " + e));
            }
            const count = document.querySelectorAll(".book-box").length;
            return { fonts, covers: Array.isArray(window.__covers) ? window.__covers.length : window.__covers, count, ok: books === null || count === books };
          },
          [FACES, covers, books],
        );
        if (s.fonts && s.covers === covers.length && s.ok) return s;
        if (Date.now() - started > timeout) throw new Error(`timed out waiting for fonts/covers/shelf on ${what}: ${JSON.stringify(s)}`);
        await sleep(25);
      }
    },
    /** Viewport rect of a locator, with its centre. */
    async box(locator) {
      const b = await locator.boundingBox();
      if (!b) throw new Error(`not visible: ${locator}`);
      return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    },
    /** The app's events so far (from the in-page observer). */
    events: () => page.evaluate(() => window.__reelEvents.slice()),
  };
  return ctx;
}

/** Resolves a pointer target to viewport coordinates. */
async function resolveTarget(ctx, to, current) {
  if (to === "off") return null;
  if (to === "hold") return current ? { ...current } : null;
  if (Array.isArray(to)) return { x: to[0], y: to[1] };
  const p = await to(ctx, current);
  return Array.isArray(p) ? { x: p[0], y: p[1] } : p;
}

/**
 * The pointer at shot time t: cursor keys glide between targets on an eased, gently bowed path
 * (targets resolve when their glide starts; "hold" stays where the pointer is), and a drag or a
 * swipe overrides the keys while it runs.
 */
function makePointer(ctx, cursorKeys = [], gestures = []) {
  const keys = [...cursorKeys, ...gestures.map((d) => ({ at: d.at + d.move + d.hold, to: { gestureEnd: d } }))].sort((a, b) => a.at - b.at);
  const resolved = new Map();
  let current = null;
  // "hold" is where the previous key left the pointer (resolved through it, never through whatever the
  // pointer happened to be when the glide before it began); a gesture's end is where the gesture let go
  const target = async (i) => {
    if (!resolved.has(i)) {
      const to = keys[i].to;
      let v;
      if (to && to.gestureEnd) {
        // a gesture's end is only known once the gesture has run: never cache it before then
        if (!to.gestureEnd.b) return current ? { ...current } : null;
        v = { ...to.gestureEnd.b };
      } else if (to === "hold") v = i > 0 ? await target(i - 1) : current ? { ...current } : null;
      else v = await resolveTarget(ctx, to, current);
      if (v === null && to !== "off") throw new Error(`cursor key ${i} (at ${keys[i].at}) resolved to no position`);
      resolved.set(i, v);
    }
    return resolved.get(i);
  };
  return async (t) => {
    for (const d of gestures) {
      if (t >= d.at - 1e-6 && t <= d.at + d.move + d.hold + 1e-6) {
        d.a ??= await resolveTarget(ctx, d.from ?? "hold", current);
        // eased in and out over `ease` (default: the whole move), then held still before the release
        // (no fling: the engine only flings if the pointer moved within the last 60 ms). A flick sets
        // ease > move and hold 0: it lets go mid-stroke, still moving, and the engine's fling carries on.
        const span = d.ease ?? d.move;
        const at = (tt) => easeInOut(clamp01((tt - d.at) / span));
        d.b ??= { x: d.a.x + d.dx * at(d.at + d.move), y: d.a.y + (d.dy ?? 0) * at(d.at + d.move) };
        const u = at(Math.min(t, d.at + d.move));
        current = { x: d.a.x + d.dx * u, y: d.a.y + (d.dy ?? 0) * u };
        return current;
      }
    }
    if (!keys.length || t < keys[0].at) return (current = null);
    let i = 0;
    while (i + 1 < keys.length && t >= keys[i + 1].at) i++;
    const a = await target(i);
    if (i + 1 >= keys.length || !a) return (current = a);
    const b = await target(i + 1);
    if (!b) return (current = a);
    const u = easeInOut(clamp01((t - keys[i].at) / (keys[i + 1].at - keys[i].at)));
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, bow = Math.min(40, len * 0.08) * Math.sin(Math.PI * u);
    current = { x: a.x + dx * u - (dy / len) * bow, y: a.y + dy * u + (dx / len) * bow };
    return current;
  };
}

/** Storage the shot starts with, written before any page script (the signed-in session). */
function initScript() {
  return ({ local }) => {
    try {
      if (local) for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
    } catch {}
  };
}

/** A touch point (CDP), so taps are real touch input with a real click. */
async function touch(cdp, type, p) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x: p.x, y: p.y, radiusX: 11, radiusY: 11, force: 1, id: 1 }] });
}

/**
 * The brief's §5.1 (g) fallback, kept for a Chrome that cancels emulated touch moves: a touch-pointer
 * gesture dispatched from the page (pointerdown / move / up, pointerType "touch"). Not used by
 * default: the smoke run proved CDP touch drags drive the shelf in this Chrome (`touchVia: "page"`
 * on a shot switches to it).
 */
const TOUCH_POINTER = ([type, x, y]) => {
  const target = (window.__touchTarget && type !== "pointerdown") ? window.__touchTarget : document.elementFromPoint(x, y);
  if (type === "pointerdown") window.__touchTarget = target;
  const ev = new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, buttons: type === "pointerup" ? 0 : 1, width: 22, height: 22, pressure: type === "pointerup" ? 0 : 0.5 });
  target.dispatchEvent(ev);
  if (type === "pointerup") window.__touchTarget = null;
};

/**
 * Films one shot. `shot` fields: path, duration, mode ("S" | "L"), afterPurchase, signedIn, css,
 * prepare(ctx), cursor [{at, to}], clicks [t] (release), keys [{at, key}], wheels [{at, dx, dy}],
 * drags / swipes [{at, move, hold, dx, from}], taps [t] (release), scrolls [{sel, at, dur, by}],
 * gates [{at, name, action}], events [{at, run}], anchors, fps (override), verify(ctx, meta).
 */
export async function captureShot(browser, id, shot, { aspect = "16x9", outDir = path.join(OUT, aspect), quiet = false, shotEvery = 1 } = {}) {
  const A = ASPECTS[shot.viewportAspect ?? aspect];
  const subFps = shot.fps ?? A.subFps;
  const stepMs = 1000 / subFps;
  const dir = path.join(outDir, id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: A.viewport,
    deviceScaleFactor: A.dsf,
    isMobile: A.touch,
    hasTouch: A.touch,
    reducedMotion: "no-preference",
    colorScheme: "light",
    serviceWorkers: "block",
    locale: "en-IN",
  });
  await context.addInitScript(VCLOCK_SCRIPT);
  await context.addInitScript(OBSERVER_SCRIPT);
  await context.addInitScript(initScript(), { local: shot.signedIn ? { "bo:session": JSON.stringify(fixtures().session.session) } : null });
  const data = await installData(context, shot);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|net::ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  const cdp = A.touch ? await context.newCDPSession(page) : null;
  // requests in flight (a held response is not in flight: it waits for its gate)
  const net = { inflight: new Set(), lastDone: 0, held: data.held };
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) net.inflight.add(r);
  });
  const done = (r) => {
    net.inflight.delete(r);
    net.lastDone = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);

  const started = Date.now();
  await page.goto(ORIGIN + shot.path, { waitUntil: "domcontentloaded" });
  const ctx = makeContext(page, aspect, subFps, data, net);
  ctx.id = id;
  ctx.shot = shot;
  // React's first render is scheduled through the (virtual) setImmediate: run it at virtual 0
  await ctx.settle(() => !!document.querySelector(".app"), "the app to render");
  const caret = "input, textarea { caret-color: transparent !important; }";
  await page.addStyleTag({ content: caret + (shot.css ?? "") });
  await shot.prepare?.(ctx);
  if (!A.touch) {
    const start = typeof shot.mouseStart === "function" ? await shot.mouseStart(ctx) : shot.mouseStart;
    await page.mouse.move(start?.[0] ?? A.viewport.width / 2, start?.[1] ?? A.viewport.height + 60);
    if (start) await ctx.step(0);
  }

  const gestures = [...(shot.drags ?? []).map((d) => ({ ...d, kind: "drag" })), ...(shot.swipes ?? []).map((d) => ({ ...d, kind: "swipe" }))].map((d) => ({ hold: 0.12, ...d, state: 0 }));
  const pointerAt = makePointer(ctx, shot.cursor, gestures);
  const clicks = (shot.clicks ?? []).map((c) => ({ down: c - PRESS_S, up: c, state: 0, kind: A.touch ? "tap" : "click" }));
  const keys = (shot.keys ?? []).map((k) => ({ ...k, done: false }));
  const wheels = (shot.wheels ?? []).map((w) => ({ dx: 0, ...w, done: false }));
  const gates = (shot.gates ?? []).map((g) => ({ ...g, done: false }));
  const events = (shot.events ?? []).map((e) => ({ ...e, done: false }));
  const scrolls = (shot.scrolls ?? []).map((s) => ({ ...s, start: null }));
  const total = Math.round(shot.duration * subFps);
  const meta = {
    id, aspect, viewportAspect: shot.viewportAspect ?? aspect, fps: subFps, dsf: A.dsf, width: A.viewport.width, height: A.viewport.height,
    input: A.touch ? "touch" : "mouse", mode: shot.mode ?? "S", browser: `${BROWSER.channel} ${browser.version()}`, cursorFromStart: !!shot.cursorFromStart,
    presses: [], drags: [], swipes: [], scrolls: [], marks: {}, frames: [],
  };
  ctx.mark = (name, value) => (meta.marks[name] = value ?? r4(ctx.t ?? 0));
  let pressed = false;
  let last = null;
  const failures = [];
  meta.t0 = await page.evaluate(() => window.__vt.now);
  const startIndex = await page.evaluate(() => window.__vt.startCount);
  const eventIndex = await page.evaluate(() => window.__reelEvents.length);

  for (let i = 0; i < total; i++) {
    const t = i / subFps;
    ctx.t = t;
    // 1. scripted hooks due now (they may wait in real time, never move virtual time)
    for (const e of events) {
      if (!e.done && t >= e.at - 1e-6) {
        e.done = true;
        await e.run(ctx);
      }
    }
    // 2. element scrolls, then advance virtual time to exactly t0 + i steps
    const scrollTops = [];
    for (const s of scrolls) {
      if (t < s.at - 1e-6) continue;
      if (s.start === null) {
        s.start = await page.evaluate((sel) => document.querySelector(sel)?.scrollTop ?? 0, s.sel);
        if (typeof s.by === "function") s.by = Math.round(await s.by(ctx));
      }
      const u = easeInOut(clamp01((t - s.at) / s.dur));
      scrollTops.push([s.sel, s.start + s.by * u]);
    }
    await settleNetwork(net);
    await page.evaluate(
      async ([tops, target]) => {
        for (const [sel, top] of tops) {
          const el = document.querySelector(sel);
          if (el) el.scrollTop = top;
        }
        await window.__vt.stepTo(target);
      },
      [scrollTops, meta.t0 + i * stepMs],
    );
    // 3. gates and input at t: whatever they start begins at local time 0 at t, and its first effects
    //    are in this frame (a released response is consumed at exactly t: zero-length steps)
    for (const g of gates) {
      if (!g.done && t >= g.at - 1e-6) {
        g.done = true;
        await data.release(g.name, g.action ?? "fulfil", r4(t));
        if (g.settle) await ctx.settle(g.settle, `gate ${g.name} to land`);
      }
    }
    const m = await pointerAt(t);
    const active = gestures.find((d) => d.state === 1);
    if (m && (!last || m.x !== last.x || m.y !== last.y)) {
      if (!A.touch) await page.mouse.move(m.x, m.y);
      else if (active && shot.touchVia === "page") await page.evaluate(TOUCH_POINTER, ["pointermove", m.x, m.y]);
      else if (active) await touch(cdp, "touchMove", m);
    }
    last = m;
    for (const w of wheels) {
      if (!w.done && t >= w.at - 1e-6) {
        w.done = true;
        if (m && !A.touch) await page.mouse.move(m.x, m.y);
        await page.mouse.wheel(w.dx, w.dy);
        meta.presses.push({ down: r4(t), up: r4(t), x: m ? round1(m.x) : null, y: m ? round1(m.y) : null, kind: "wheel" });
      }
    }
    for (const k of keys) {
      if (!k.done && t >= k.at - 1e-6) {
        k.done = true;
        await page.keyboard.press(k.key);
        meta.presses.push({ down: r4(t), up: r4(t), kind: "key", key: k.key });
      }
    }
    for (const c of clicks) {
      if (c.state === 0 && t >= c.down - 1e-6) {
        if (!m) throw new Error(`[${id}] press at ${c.down}s with no pointer on screen`);
        if (A.touch) await touch(cdp, "touchStart", m);
        else await page.mouse.down();
        c.state = 1;
        pressed = true;
        c.at = { x: round1(m.x), y: round1(m.y) };
      } else if (c.state === 1 && t >= c.up - 1e-6) {
        if (A.touch) await touch(cdp, "touchEnd", m);
        else await page.mouse.up();
        c.state = 2;
        pressed = false;
        meta.presses.push({ down: r4(c.down), up: r4(c.up), x: c.at.x, y: c.at.y, kind: c.kind });
      }
    }
    for (const d of gestures) {
      if (d.state === 0 && t >= d.at - 1e-6) {
        if (A.touch && shot.touchVia === "page") await page.evaluate(TOUCH_POINTER, ["pointerdown", m.x, m.y]);
        else if (A.touch) await touch(cdp, "touchStart", m);
        else {
          await page.mouse.move(m.x, m.y);
          await page.mouse.down();
        }
        d.state = 1;
        pressed = true;
      } else if (d.state === 1 && t >= d.at + d.move + d.hold - 1e-6) {
        if (A.touch && shot.touchVia === "page") await page.evaluate(TOUCH_POINTER, ["pointerup", m.x, m.y]);
        else if (A.touch) await touch(cdp, "touchEnd", m);
        else await page.mouse.up();
        d.state = 2;
        pressed = false;
        (d.kind === "drag" ? meta.drags : meta.swipes).push({ at: r4(d.at), move: d.move, hold: d.hold, from: [round1(d.a.x), round1(d.a.y)], to: [round1(d.b.x), round1(d.b.y)] });
      }
    }
    // anything the input started is pinned at local time 0 now, before the photograph
    await page.evaluate(() => window.__vt.pinAnimations());
    // 4. record and photograph
    const frame = { m: m ? [round1(m.x), round1(m.y), pressed ? 1 : 0] : null };
    if (i % 3 === 0) frame.a = await page.evaluate(ANCHOR_FN, { ...BASE_ANCHORS, ...(shot.anchors ?? {}) });
    meta.frames.push(frame);
    if (i % shotEvery === 0) await page.screenshot({ path: path.join(dir, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (!quiet && (i + 1) % (subFps * 2) === 0) console.log(`  [${aspect} ${id}] ${i + 1}/${total} subframes, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  for (const s of scrolls) meta.scrolls.push({ sel: s.sel, at: s.at, dur: s.dur, by: s.by, start: s.start, finger: s.finger ?? null });
  // frame i must be exactly t0 + i steps of virtual time
  const elapsed = (await page.evaluate(() => window.__vt.now)) - meta.t0;
  const expected = (total - 1) * stepMs;
  if (Math.abs(elapsed - expected) > 0.01) failures.push(`virtual time drifted: ${elapsed.toFixed(3)} ms elapsed over ${total} frames, expected ${expected.toFixed(3)}`);

  // the app's own events and animation starts, in shot seconds
  const toShot = (vt) => r4((vt - meta.t0) / 1000);
  meta.events = (await page.evaluate((n) => window.__reelEvents.slice(n), eventIndex)).map((e) => ({ ...e, t: toShot(e.t) }));
  meta.eventsBefore = (await page.evaluate((n) => window.__reelEvents.slice(0, n), eventIndex)).map((e) => ({ ...e, t: toShot(e.t) }));
  meta.starts = (await page.evaluate((n) => window.__vt.starts(n), startIndex)).map((s) => ({ ...s, t: toShot(s.t) }));
  meta.network = data.log;
  meta.rand = await page.evaluate(() => window.__vt.randLog.length);
  meta.vtStats = await page.evaluate(() => window.__vt.stats);
  meta.fonts = await page.evaluate((faces) => Object.fromEntries(faces.map(([f, t]) => [f, document.fonts.check(f, t)])), FACES);
  meta.captureSeconds = Math.round((Date.now() - started) / 100) / 10;
  if (shot.verify) {
    try {
      await shot.verify(ctx, meta);
    } catch (e) {
      failures.push(`verify: ${e.message ?? e}`);
    }
  }
  await context.close();

  const problems = [...data.failures, ...failures];
  if (Object.values(meta.fonts).some((ok) => !ok)) problems.push(`fonts not loaded: ${JSON.stringify(meta.fonts)}`);
  const writes = data.log.filter((r) => r.method !== "GET");
  if (writes.some((r) => r.served !== "mock")) problems.push(`a write was not mocked: ${JSON.stringify(writes)}`);
  const unanswered = data.log.filter((r) => r.served === "held");
  if (unanswered.length) problems.push(`held requests never released: ${JSON.stringify(unanswered)}`);
  meta.errors = errors;
  meta.problems = problems;
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  if (problems.length) throw new Error(`[${aspect} ${id}] ${problems.join("; ")}`);
  if (!quiet) console.log(`  [${aspect} ${id}] done: ${total} subframes in ${meta.captureSeconds}s${errors.length ? ` (page errors: ${errors.length}: ${errors.slice(0, 2).join(" | ")})` : ""}`);
  return { dir, meta };
}

/** One frame every `every` s of a captured shot, tiled for review. */
export async function sheet(id, { aspect = "16x9", outDir = path.join(OUT, aspect), every = 0.25, cols, from = 0, to = Infinity } = {}) {
  const dir = path.join(outDir, id);
  const meta = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  const stride = Math.max(1, Math.round(every * meta.fps));
  const pick = files.filter((f) => {
    const n = Number(f.slice(0, 5));
    return n % stride === 0 && n / meta.fps >= from - 1e-6 && n / meta.fps <= to + 1e-6;
  });
  const tmp = path.join(outDir, `${id}-sheet-src`);
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp);
  await Promise.all(pick.map((f, i) => fs.copyFile(path.join(dir, f), path.join(tmp, `${String(i).padStart(3, "0")}.jpg`))));
  const portrait = meta.height > meta.width;
  const c = cols ?? (portrait ? 8 : 5);
  const rows = Math.ceil(pick.length / c);
  const scale = portrait ? "216:384" : "480:270";
  const file = path.join(outDir, `${id}-sheet${from || to !== Infinity ? `-${from}-${to}` : ""}.jpg`);
  await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "%03d.jpg"), "-vf", `scale=${scale},tile=${c}x${rows}:padding=6:margin=6:color=0x141414`, "-frames:v", "1", file]);
  await fs.rm(tmp, { recursive: true, force: true });
  return file;
}

export async function captureShots(SHOTS, ids, { aspect = "16x9", workers = 3, sheets = false } = {}) {
  const outDir = path.join(OUT, aspect);
  await fs.mkdir(outDir, { recursive: true });
  const preview = await startPreview();
  const browser = await launch();
  const results = [];
  const failures = [];
  try {
    const queue = [...ids];
    await Promise.all(
      [...Array(Math.min(workers, queue.length))].map(async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          console.log(`shot ${aspect} ${id}: ${SHOTS[id].duration}s`);
          try {
            results.push(await captureShot(browser, id, SHOTS[id], { aspect, outDir }));
          } catch (e) {
            failures.push(e.message ?? String(e));
            console.error(`  FAILED ${e.message ?? e}`);
            continue;
          }
          if (sheets) console.log(`  sheet: ${await sheet(id, { aspect, outDir })}`);
        }
      }),
    );
  } finally {
    await browser.close();
    if (!preview.reused) await stopPreview();
  }
  const proxy = proxyErrors();
  if (proxy.length) failures.push(`the preview server tried to proxy: ${proxy.slice(0, 3).join(" | ")}`);
  if (failures.length) throw new Error(`${failures.length} shot(s) failed:\n${failures.join("\n")}`);
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const value = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const aspect = value("--aspect") ?? "16x9";
  if (!ASPECTS[aspect]) throw new Error(`--aspect must be ${Object.keys(ASPECTS).join(" or ")}`);
  const { SHOTS } = await import(aspect === "9x16" ? "./shots-vertical.mjs" : "./shots.mjs");
  const flagValues = new Set([value("--aspect"), value("--workers")].filter(Boolean));
  const ids = argv.filter((a) => !a.startsWith("--") && !flagValues.has(a));
  for (const id of ids) if (!SHOTS[id]) throw new Error(`unknown shot ${id}; choose from ${Object.keys(SHOTS).join(", ")}`);
  if (argv.includes("--sheet-only")) {
    for (const id of ids.length ? ids : Object.keys(SHOTS)) console.log(await sheet(id, { aspect }));
  } else {
    const t = Date.now();
    await captureShots(SHOTS, ids.length ? ids : Object.keys(SHOTS), {
      aspect,
      workers: value("--workers") ? Number(value("--workers")) : 3,
      sheets: argv.includes("--sheet"),
    }).catch((e) => {
      console.error(e.message ?? e);
      process.exit(1);
    });
    console.log(`capture finished in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  }
}
