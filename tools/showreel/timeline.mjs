/**
 * THE edit decision list for the 60-second Bibliotheca Obscura reel. One source of truth,
 * imported by the shot lists (shots.mjs, shots-vertical.mjs), the compositor (reel.html) and the
 * score (lib/score.js): every beat, segment, cut, click, key, drag, wheel, caption and sound cue
 * lives here, in reel seconds. It imports only lib/ease.js, so Node and the page load the same file.
 *
 * The grid is 80 BPM, 4/4: a beat is 0.75 s, a bar 3.0 s, downbeats on multiples of 3 s (20 bars).
 * An in-app motion that should land on a beat starts at beat − RUSH × duration, where RUSH is the
 * point its easing crosses 0.55 (ink 0.488, spring 0.146; re-derived in lib/ease.js). A click is a
 * press, then a release PRESS_S later; the app acts on the release, the score ticks on the press.
 *
 * Every event time is rounded to a 180 fps subframe (sf), and every segment `from` is a multiple of
 * 1/90 s, so both cuts (180 and 90 subframes a second) land on captured subframes.
 */
import { RUSH_INK, RUSH_SPRING } from "./lib/ease.js";

export const DURATION = 60.0;
export const BPM = 80;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const FPS = { "16x9": 60, "9x16": 30 };
export const SUB_FPS = { "16x9": 180, "9x16": 90 };
/** A click: down PRESS_S before up (10 subframes at 180/s, 5 at 90/s: "0.06 s"). */
export const PRESS_S = 1 / 18;
export { RUSH_INK, RUSH_SPRING };

/** Round a reel time to the nearest 180 fps subframe. */
export const sf = (t) => Math.round(t * 180) / 180;
const r6 = (t) => Math.round(t * 1e6) / 1e6;

/** The app's own motion durations (index.css, DetailSheet.tsx, engine.ts), in seconds. */
export const D = {
  open: 1.05, close: 0.78, sheetIn: 0.72, sheetOut: 0.52, lift: 0.95, notice: 0.62,
  field: 0.52, caption: 0.6, text: 0.82, flood: 0.42, spoolIn: 0.95, spoolOut: 0.42, blot: 1.25,
};
/** Seconds from a motion's start to its rush. */
export const rushAfter = (dur, ease = "ink") => (ease === "ink" ? RUSH_INK : RUSH_SPRING) * dur;
/** The engine's spring (K_IDLE 5.2/s) crosses half a volume 0.133 s after a key step: a step that
 *  should knock on a beat is pressed this long before it. */
export const STEP_LEAD = Math.log(2) / 5.2;

// ------------------------------------------------------------------------------- picture events
/** Reel seconds. Clicks are the release (the app acts then); keys are the key-down. */
export const T = {
  // TITLE (drawn on H's held curtain, the app's own paper)
  spines: [0.0, 0.09, 0.18], // the three spines of the brand mark rise (820 ms spring each)
  wordmark: 0.15, // BIBLIOTHECA OBSCURA / — COLLECTOR ARCHIVE
  headline: [0.45, 0.62], // "The shelf turns" / "to face you.", words 70 ms apart
  rule: 1.6, // a 1 px rule draws left to right
  kicker: 1.75, // [ A WALKTHROUGH IN SIX PLATES ]

  // H: the curtain lifts (rush on the 3.00 downbeat), the shelf, the folio
  liftRush: 3.0,
  wheels: [4.5, 5.25], // one 100 px notch each: The Silent Valley → An Atlas of Lost Weather → The Blue Hour
  drag: { at: 6.0, move: 1.4, hold: 0.15, px: 1018 }, // right across ≈ 11 volumes, wrapping onto Cartographer of Moths
  hoverSpines: [8.4, 10.3], // the cursor drifts over neighbouring spines (they lift)
  hoverCover: [10.3, 11.3], // onto the settled cover (it tilts toward the pointer)
  openH: sf(12.0 - rushAfter(D.open)), // release on the cover: the bloom rushes on 12.00
  hoverAcquireH: 17.6, // the ink floods up the Acquire button (never clicked in mode S)
  closeH: sf(21.0 - rushAfter(D.close)), // [ CLOSE ]: the fold rushes on 21.00
  restOnSearch: 21.45, // the cursor is resting on [ SEARCH ]
  matchCut: 1940 / 90, // 21.5556: H → S, nothing moves

  // S: search, clear, catalogue
  searchOpen: 21.75,
  typeThe: [22.5, 22.75, 23.0],
  clear: 26.0,
  catalog: sf(27.0 - rushAfter(D.sheetIn)), // the sheet unrolls, rush 27.00
  rowPick: 28.5, // Night Ferry to Otaru: the sheet rolls back, the shelf glides four volumes back

  // A: sign in, step to The Blue Hour, open it, acquire
  login: sf(31.5 - rushAfter(D.sheetIn)),
  emailField: 32.0,
  typeEmail: { at: 32.2, every: 0.06 }, // collector@example.com: 21 keys, the last at 33.40
  passwordField: 33.5,
  typePassword: { at: 33.7, every: 0.0875 }, // 9 keys, the last at 34.40
  signIn: 35.0,
  stepsA: [35.7, 36.2], // → An Atlas of Lost Weather → The Blue Hour
  openA: sf(37.5 - rushAfter(D.open)),
  hoverAcquireA: 39.0,
  acquire: 40.5, // OPENING STRIPE CHECKOUT…
  releasePayment: 41.25, // makePayment answers; the page stays put (a same-document hash navigation)

  // P: the page reloads at /payment-success (the real return from Stripe Checkout)
  pGate: 1.0, // shot seconds: getBooks answers, the catalogue mounts, the curtain lifts (rush 42.00)
  liftRushP: 42.0,
  stepsP: [sf(42.75 - Math.log(2) / 5.2), sf(43.5 - Math.log(2) / 5.2)], // two steps, knocking on 42.75 and 43.50
  dismiss: 44.25,
  openP: sf(46.5 - rushAfter(D.open)), // the folio: … NO. 003 · SOLD, IN YOUR COLLECTION — EX LIBRIS

  // M: the phone (432 × 768, touch)
  swipeM: { at: 51.3, move: 0.42, hold: 0.12, px: -128 }, // two volumes: The Silent Valley → The Blue Hour
  tapM: sf(52.5 - rushAfter(D.open)), // the cover: the folio rises, rush 52.50
  scrollM: [53.05, 53.85], // the folio's text sheet scrolls up under the finger
  scrollMPx: 300,

  // E: the end card
  endLockup: 54.75,
  endLines: [55.5, 56.25, 57.0], // "Scroll the spines." / "Pull a volume." / "Acquire it."
  endUrl: 57.75,
  finalHit: 57.0,
};
/** The end card's shelf steps knock exactly on its three lines. */
T.stepsE = T.endLines.map((b) => sf(b - STEP_LEAD));

/** Key strokes typed into the sign-in form. */
export const TYPED = { email: "collector@example.com", password: "folio1955" };

/** Every click per segment (release times). */
export const CLICKS = {
  H: [T.openH, T.closeH],
  S: [T.searchOpen, T.clear, T.catalog, T.rowPick],
  A: [T.login, T.emailField, T.passwordField, T.signIn, T.openA, T.acquire],
  P: [T.dismiss, T.openP],
  M: [T.tapM],
};
/** Key-downs per segment ({at, key}). Typed text is expanded into one key per character. */
export const KEYS = {
  S: T.typeThe.map((at, i) => ({ at, key: "the"[i] })),
  A: [
    ...[...TYPED.email].map((key, i) => ({ at: sf(T.typeEmail.at + i * T.typeEmail.every), key })),
    ...[...TYPED.password].map((key, i) => ({ at: sf(T.typePassword.at + i * T.typePassword.every), key })),
    ...T.stepsA.map((at) => ({ at, key: "ArrowRight" })),
  ],
  P: T.stepsP.map((at) => ({ at, key: "ArrowRight" })),
  E: T.stepsE.map((at) => ({ at, key: "ArrowRight" })),
};
export const WHEELS = { H: T.wheels.map((at) => ({ at, dy: 100 })) };
export const DRAGS = { H: [T.drag] };
export const SWIPES = { M: [T.swipeM] };

// --------------------------------------------------------------------------------------- the edit
/**
 * Reel time → shot time (shot t = reel t − from). `to` is the last reel second the segment is used.
 * H.from: the curtain's lift is measured at shot 1.500 s (the app's 1500 ms boot grace), so the
 * lift starts at 1.0333 + 1.5 = 2.5333 and rushes at 2.997 (the 3.00 downbeat). P.from: the
 * curtain lifts at P's shot 1.000 s (getBooks answered then), rushing at 40.5333 + 1.0 + 0.464 =
 * 41.997 (the 42.00 downbeat). See MEASURED and validateTimeline().
 */
export const SEGMENTS = {
  H: { shot: "H", from: 93 / 90, to: 21.6 },
  S: { shot: "S", from: T.matchCut, to: 30.06 },
  A: { shot: "A", from: 29.9, to: 42.32 },
  P: { shot: "P", from: 3648 / 90, to: 51.48 },
  M: { shot: "M", from: 4550 / 90, to: 54.7 },
  E: { shot: "E", from: 4803 / 90, to: DURATION },
};

/** What the capture must measure for the edit to hold (shot seconds), checked by verify.mjs. */
export const MEASURED = {
  H: { lift: 1.5 },
  P: { lift: T.pGate },
};

/**
 * Transitions (brief §7):
 *   cut     a hard match cut (H → S, nothing moves)
 *   spines  §7.2 cloth-bound spines rise from the floor, centre first; swap under full cover
 *   ink     §7.3 the folio's ink blots at frame scale, from the Acquire button
 *   sheet   §7.1 a paper sheet slides in from the right behind a 1 px ink rule
 *   page    §7.4 a page turns from the right edge to the left
 */
export const CUTS = [
  { id: "C1", kind: "cut", at: T.matchCut, dur: 0, a: "H", b: "S" },
  { id: "T1", kind: "spines", at: 29.15, dur: 1.4, a: "S", b: "A", cover: 30.0, rise: 0.8, hold: 0.1 },
  { id: "T2", kind: "ink", at: 40.5, dur: 1.8, a: "A", b: "P", origin: ["A", "acquire"] },
  { id: "T3", kind: "sheet", at: sf(51.0 - rushAfter(0.9)), dur: 0.9, a: "P", b: "M", dir: 1 },
  { id: "T4", kind: "page", at: sf(54.0 - rushAfter(1.3)), dur: 1.3, a: "M", b: "E" },
];

/**
 * Catalogue slips (captions): on in both cuts. ≤ 4 words in the instruction, all true. `at` places
 * each one clear of the UI the camera is on (brief §6.2): "top" centre (the default, empty paper
 * between the brand and the nav), "high" (just under the header row: the search field is in the
 * top band then), "high-left" (the catalogue sheet fills the right), "low" (bottom left above the
 * ruler: the return slip sits top centre in plate V, and the folio's title fills the top band once
 * the camera pushes onto its button). `v` is the 9:16 slip's top in output px, chosen by
 * render.mjs --aspect 9x16 --place-slips inside the safe zone (y 220–1540) to cover the least,
 * never an essential rect (the return slip, the search field, the folio title and button, the
 * app's caption). render.mjs --slips checks every cue's pixels.
 */
export const CAPTIONS = [
  { n: "I", text: "SCROLL, DRAG, ARROW KEYS", from: 3.75, to: 8.25, at: "top", v: 248 },
  { n: "I", text: "CLICK THE COVER", from: 9.0, to: 11.85, at: "top", v: 248 },
  { n: "II", text: "THE FULL ARCHIVAL RECORD", from: 12.75, to: 16.6, at: "top", v: 1148 },
  { n: "III", text: "SEARCH BY TITLE", from: 21.75, to: 25.7, at: "high", v: 248 },
  { n: "III", text: "THE CATALOGUE", from: 26.65, to: 28.95, at: "high-left", v: 290 },
  { n: "IV", text: "SIGN IN", from: 31.3, to: 34.95, at: "top", v: 248 },
  { n: "IV", text: "THEN ACQUIRE VIA STRIPE", from: 35.6, to: 40.2, at: "low", v: 1190 },
  { n: "V", text: "BACK FROM CHECKOUT", from: 42.6, to: 44.5, at: "low", v: 1436 },
  { n: "V", text: "IN YOUR COLLECTION", from: 47.9, to: 50.35, at: "low", v: 1436 },
  { n: "VI", text: "SWIPE, TAP, SCROLL", from: 51.2, to: 53.2, at: "top", v: 1424 },
];
/** A slip slides in and out with the app's caption motion: 600 ms --ease-spring. */
export const SLIP_MS = 0.6;

export const TITLE = { mark: "BIBLIOTHECA OBSCURA", sub: "— COLLECTOR ARCHIVE", lines: ["The shelf turns", "to face you."], kicker: "A WALKTHROUGH IN SIX PLATES" };
export const PHONE = { lines: ["The same shelf,", "in your hand."], labels: ["SWIPE", "TAP", "SCROLL"] };
export const END_CARD = {
  mark: "BIBLIOTHECA OBSCURA",
  sub: "— COLLECTOR ARCHIVE —",
  lines: ["Scroll the spines.", "Pull a volume.", "Acquire it."],
  url: "github.com/AaronStark1/bookstore",
};

/** Shot time for a reel time in a segment, and back. */
export const shotTime = (segment, reel) => r6(reel - SEGMENTS[segment].from);
export const reelTime = (segment, shot) => r6(shot + SEGMENTS[segment].from);

/** Checks the edit's own rules (run by render.mjs before anything is drawn). */
export function validateTimeline() {
  const problems = [];
  for (const [id, s] of Object.entries(SEGMENTS)) {
    if (Math.abs(s.from * 90 - Math.round(s.from * 90)) > 1e-6) problems.push(`segment ${id} starts at ${s.from}, not a multiple of 1/90 s`);
  }
  for (const c of CUTS) {
    const a = SEGMENTS[c.a], b = SEGMENTS[c.b];
    if (!a || !b) {
      problems.push(`cut ${c.id} names a missing segment`);
      continue;
    }
    const swap = c.kind === "spines" ? c.cover : c.at;
    if (a.to < c.at + (c.kind === "cut" ? 0 : c.kind === "spines" ? c.cover - c.at : c.dur) - 1e-6) problems.push(`cut ${c.id}: ${c.a} ends at ${a.to}, before the cut needs it`);
    // B may start up to 0.1 s after the cut's first frame: its footage clamps to its (static) first frame
    if (b.from > swap + 0.1 + 1e-6 && c.kind !== "cut") problems.push(`cut ${c.id}: ${c.b} starts at ${b.from}, after the cut needs it`);
  }
  for (let i = 1; i < CAPTIONS.length; i++) if (CAPTIONS[i].from < CAPTIONS[i - 1].to + SLIP_MS - 1e-6) problems.push(`caption ${i} enters before caption ${i - 1} has left`);
  for (const c of CAPTIONS) {
    const words = c.text.replace(/,/g, "").split(/\s+/).length;
    if (words > 4) problems.push(`caption "${c.text}" has ${words} words`);
  }
  // the curtain lifts rush on their downbeats (±1 subframe at 180/s)
  const liftH = SEGMENTS.H.from + MEASURED.H.lift + rushAfter(D.lift);
  const liftP = SEGMENTS.P.from + MEASURED.P.lift + rushAfter(D.lift);
  if (Math.abs(liftH - T.liftRush) > 1 / 180) problems.push(`H's lift rushes at ${liftH.toFixed(4)}, not ${T.liftRush}`);
  if (Math.abs(liftP - T.liftRushP) > 1 / 180) problems.push(`P's lift rushes at ${liftP.toFixed(4)}, not ${T.liftRushP}`);
  return problems;
}
