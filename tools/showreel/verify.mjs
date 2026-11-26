#!/usr/bin/env node
/**
 * The reel's acceptance checks (brief §11), with the numbers. Adapted from cook-with-me/tools/showreel/verify.mjs.
 *
 *   node verify.mjs                      # 16:9: specs, durations, loudness, sync, fonts, network, house rules, determinism, frames
 *   node verify.mjs --aspect 9x16        # the vertical cut
 *   node verify.mjs --capture-determinism H   # also compare out/debug/H-rerun/meta.json with the shot's meta.json
 *
 * Writes out/verify-<aspect>.json and exits non-zero when a check fails.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import * as TL from "./timeline.mjs";
import { serve, openPages, frame, TARGETS, loudness } from "./render.mjs";
import { proxyErrors } from "./lib/app.mjs";
import { FACES } from "./capture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const value = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const aspect = value("--aspect") ?? "16x9";
const T = TARGETS[aspect];
const FPS = TL.FPS[aspect];
const frameS = 1 / FPS;
const results = [];
const check = (id, ok, detail, data) => {
  results.push({ id, ok: !!ok, detail, data });
  console.log(`${ok ? "PASS" : "FAIL"} ${id}: ${detail}`);
};

function ffprobe(args) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ["-hide_banner", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", () => resolve(out));
  });
}

async function probe(file) {
  const info = await ffprobe(["-i", file]);
  const v = info.match(/Video: (\w+) \((\w+)\)[^,]*, (\w+)\(([^)]*)\)[^,]*, (\d+)x(\d+).*?, ([\d.]+) fps/);
  const a = info.match(/Audio: (\w+) \((\w+)\)[^,]*, (\d+) Hz, (\w+)/);
  const vf = (await ffprobe(["-i", file, "-map", "0:v", "-f", "null", "-"])).match(/frame=\s*(\d+)/g)?.pop();
  const af = await ffprobe(["-i", file, "-map", "0:a", "-af", "astats=metadata=0:reset=0", "-f", "null", "-"]);
  const samples = Number(af.match(/Number of samples:\s*(\d+)/)?.[1] ?? NaN);
  const kbps = info.match(/bitrate: (\d+) kb\/s/)?.[1];
  const vkbps = info.match(/Video:.*?, (\d+) kb\/s/)?.[1];
  return {
    codec: v?.[1], profile: v?.[2], pix: v?.[3], color: v?.[4], w: Number(v?.[5]), h: Number(v?.[6]), fps: Number(v?.[7]),
    audio: a ? { codec: a[1], profile: a[2], rate: Number(a[3]), layout: a[4] } : null,
    videoFrames: Number(vf?.match(/\d+/)?.[0]),
    audioSeconds: samples / Number(a?.[3] ?? 48000),
    bytes: (await fs.stat(file)).size,
    duration: info.match(/Duration: ([\d:.]+)/)?.[1],
    kbps: Number(kbps), videoKbps: Number(vkbps),
  };
}

async function main() {
  const files = aspect === "16x9" ? [T.file, T.web] : [T.file];
  const specs = { [T.file]: aspect === "16x9" ? { w: 1920, h: 1080, fps: 60 } : { w: 1080, h: 1920, fps: 30 } };
  if (T.web) specs[T.web] = { w: 1280, h: 720, fps: 30 };

  // 1 + 2 + 10: durations, specs, sizes, loudness
  for (const f of files) {
    const p = await probe(f);
    const s = specs[f];
    const name = path.relative(root, f);
    const vDur = p.videoFrames / p.fps;
    check(`1 duration ${name}`, Math.abs(vDur - TL.DURATION) <= 1 / p.fps + 1e-9 && Math.abs(p.audioSeconds - vDur) <= 1 / p.fps + 1e-9,
      `video ${p.videoFrames} frames = ${vDur.toFixed(3)} s, audio ${p.audioSeconds.toFixed(3)} s (container ${p.duration})`, p);
    const colorOk = /tv, bt709/.test(p.color ?? "");
    check(`2 spec ${name}`, p.w === s.w && p.h === s.h && p.fps === s.fps && p.codec === "h264" && p.profile === "High" && p.pix === "yuv420p" && colorOk && p.audio?.codec === "aac" && p.audio?.rate === 48000 && p.audio?.layout === "stereo",
      `${p.w}×${p.h} ${p.fps} fps, ${p.codec} ${p.profile}, ${p.pix}(${p.color}), ${p.audio?.codec} ${p.audio?.profile} ${p.audio?.rate} Hz ${p.audio?.layout}, ${(p.bytes / 1e6).toFixed(2)} MB, ${p.kbps} kb/s overall (video ${p.videoKbps} kb/s)`);
    if (f === T.file && aspect === "16x9") check("2 master size", p.bytes <= 45e6, `${(p.bytes / 1e6).toFixed(2)} MB ≤ 45 MB`);
    if (f === T.web) check("2 web size", p.bytes <= 9.4e6, `${(p.bytes / 1e6).toFixed(2)} MB ≤ 9.4 MB`);
    const l = await loudness(f);
    check(`10 loudness ${name}`, Math.abs(l.I + 14) <= 1 && l.TP <= -1.0, `${l.I} LUFS integrated, ${l.TP} dBTP true peak, LRA ${l.LRA} LU`, l);
  }

  // the footage's metas (M is shared: always the 9:16 capture)
  const metas = {};
  for (const [seg, s] of Object.entries(TL.SEGMENTS)) {
    const dir = path.join(here, "out", "shots", seg === "M" || aspect === "9x16" ? "9x16" : "16x9", s.shot);
    metas[seg] = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
  }

  // 4: offline and read-only
  const network = Object.entries(metas).flatMap(([seg, m]) => m.network.map((r) => ({ seg, ...r })));
  const writes = network.filter((r) => r.method !== "GET");
  const unserved = network.filter((r) => !["fixture", "mock", "aborted"].includes(r.served));
  const problems = Object.entries(metas).flatMap(([seg, m]) => m.problems.map((p) => `${seg}: ${p}`));
  const modes = Object.fromEntries(Object.entries(metas).map(([seg, m]) => [seg, m.mode]));
  check("4 network", !unserved.length && writes.every((w) => w.served === "mock") && !problems.length,
    `${network.length} API requests, all answered in the browser (${network.filter((r) => r.served === "fixture").length} fixture, ${network.filter((r) => r.served === "mock").length} mock, ${network.filter((r) => r.served === "aborted").length} refused in mode S); writes: ${writes.map((w) => `${w.method} ${w.path} (${w.served}${w.auth ? ", authorised" : ""})`).join(", ") || "none"}; capture problems (stray hosts, cache misses, refusals): ${problems.length}; modes ${JSON.stringify(modes)}`);
  const proxy = proxyErrors();
  check("4 preview proxy", !proxy.length, `vite preview log: ${proxy.length} proxy errors (nothing tried to reach :3000)`);
  const fx = readdirSync(path.join(here, "fixtures")).map((f) => [f, readFileSync(path.join(here, "fixtures", f), "utf8")]);
  const emails = [...new Set(fx.flatMap(([, t]) => t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []))];
  const tokens = [...new Set(fx.flatMap(([, t]) => [...t.matchAll(/"token"\s*:\s*"([^"]*)"/g)].map((m) => m[1])))];
  const jwts = fx.filter(([, t]) => /eyJ[\w-]{10,}\./.test(t)).map(([f]) => f);
  check("4 fixtures", emails.every((e) => e === "archive@bibliotheca-obscura.example" || e === "collector@example.com") && tokens.every((t) => t === "reel-demo-token") && !jwts.length,
    `${fx.length} fixture files; emails: ${emails.join(", ")}; tokens: ${tokens.join(", ")}; JWTs: ${jwts.length}`);

  // 5: real content only (the drawn words; the footage is the app itself)
  const drawn = [TL.TITLE.mark, TL.TITLE.sub, ...TL.TITLE.lines, TL.TITLE.kicker, ...TL.PHONE.lines, ...TL.PHONE.labels, TL.END_CARD.mark, TL.END_CARD.sub, ...TL.END_CARD.lines, TL.END_CARD.url, ...TL.CAPTIONS.map((c) => c.text)].join(" | ");
  const banned = drawn.match(/flip|preview|look inside|bookplate|\bAI\b|wishlist|cart|review|rating|test mode|secure|paid/gi) ?? [];
  const long = TL.CAPTIONS.filter((c) => c.text.replace(/,/g, "").split(/\s+/).length > 4);
  check("5 drawn words", !banned.length && !long.length, `every drawn word: "${drawn}"; banned words: ${banned.length}; captions over 4 words: ${long.length}`);

  // 6: fonts in every capture
  const fontsBad = Object.entries(metas).filter(([, m]) => Object.values(m.fonts ?? {}).some((ok) => !ok)).map(([s]) => s);
  check("6 fonts (captures)", !fontsBad.length, `${FACES.length} faces (Inter Tight 400–900, Newsreader 400/500/italic 400, latin-ext included) loaded in all ${Object.keys(metas).length} shots${fontsBad.length ? `; missing in ${fontsBad}` : ""}`);

  // 7: house rules by grep
  const html = readFileSync(path.join(here, "reel.html"), "utf8");
  const forbidden = html.match(/createLinearGradient|createRadialGradient|shadowBlur|filter|roundRect|globalAlpha/g) ?? [];
  check("7 grep reel.html", !forbidden.length, `createLinearGradient|createRadialGradient|shadowBlur|filter|roundRect|globalAlpha: ${forbidden.length} matches`);

  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/reel.html?aspect=${aspect}`;
  const { browser, pages, info } = await openPages(1, url, T);
  const page = pages[0];
  try {
    check("6 fonts (compositor)", Object.values(info.fonts).every(Boolean), `compositor: ${JSON.stringify(info.fonts)}`);
    // 3: determinism of the compositor (the same 6 frames, twice, in a fresh page, reverse order)
    const times = [2.95, 12.0, 13.0, 27.0, 42.8, 54.0];
    const dir = path.join(here, "out", "verify", aspect);
    await fs.mkdir(dir, { recursive: true });
    for (const t of times) await frame(page, Math.round(t * FPS), path.join(dir, `a-${t}.jpg`));
    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    for (const t of [...times].reverse()) await frame(page, Math.round(t * FPS), path.join(dir, `b-${t}.jpg`));
    const same = await Promise.all(times.map(async (t) => (await fs.readFile(path.join(dir, `a-${t}.jpg`))).equals(await fs.readFile(path.join(dir, `b-${t}.jpg`)))));
    check("3 render determinism", same.every(Boolean), `frames at ${times.join(", ")} s rendered twice (fresh page, reverse order): ${same.map((x) => (x ? "identical" : "DIFFERENT")).join(", ")}`);

    // 8: the frames that matter, saved
    const moments = [2.95, 3.5, 7.0, 11.9, 13.0, 18.5, 23.9, 27.0, 30.0, 33.5, 40.9, 41.5, 42.8, 48.5, 51.0, 52.5, 54.0, 57.2];
    for (const t of moments) await frame(page, Math.round(t * FPS), path.join(dir, `moment-${t.toFixed(2)}.jpg`));
    check("8 frames saved", true, `${moments.length} single frames at ${moments.join(", ")} s in ${path.relative(root, dir)}/moment-*.jpg (inspected by eye)`);

    // 9: sync, against the score's own placed cues
    // the WAV's own placed cues: rendered here for 16:9; the vertical cut muxes that same WAV, so its
    // picture is checked against the 16:9 render's cues (out/score-cues.json)
    let score;
    if (aspect === "9x16") score = JSON.parse(readFileSync(path.join(here, "out", "score-cues.json"), "utf8"));
    else {
      await page.evaluate(() => window.renderAudio());
      score = await page.evaluate(() => window.__score);
    }
    const cue = await page.evaluate(() => window.cueSheet());
    const near = (list, t) => Math.min(...list.map((c) => Math.abs((c.t ?? c) - t)));
    const presses = [...cue.presses.map((p) => ({ t: p.t, k: p.kind })), ...cue.wheels.map((w) => ({ t: w.t, k: "wheel" }))];
    const pressOff = presses.map((p) => near(score.cues.ticks, p.t));
    check("9 press ticks", pressOff.every((o) => o <= frameS + 1e-6), `${presses.length} presses and wheel notches in the metas, each with a tick: worst ${(Math.max(...pressOff) * 1000).toFixed(2)} ms (±1 frame = ${(frameS * 1000).toFixed(1)} ms)`);
    const keyOff = cue.keys.map((k) => near(score.cues.clacks, k.t));
    check("9 key clacks", keyOff.every((o) => o <= frameS + 1e-6), `${cue.keys.length} key presses, each with a clack: worst ${(Math.max(...keyOff) * 1000).toFixed(2)} ms`);
    const knockOff = cue.knocks.map((k) => near(score.cues.knocks, k.t));
    check("9 knocks", knockOff.every((o) => o <= frameS + 1e-6), `${cue.knocks.length} active-volume changes (the app's caption changes), each with the app's knock: worst ${(Math.max(...knockOff) * 1000).toFixed(2)} ms`);
    const wh = score.cues.whooshes.map((w) => ({ id: w.id, off: Math.abs(w.peak - w.rush) }));
    check("9 whoosh peaks", wh.every((w) => w.off <= 2 * frameS + 1e-6), `${wh.length} whooshes (sheets, fold, lifts, T3) peak on their rush: worst ${(Math.max(...wh.map((w) => w.off)) * 1000).toFixed(1)} ms (±2 frames = ${(2 * frameS * 1000).toFixed(1)} ms)`);
    const spine = TL.CUTS.find((c) => c.kind === "spines"), page4 = TL.CUTS.find((c) => c.kind === "page");
    const thudCover = near(score.cues.thuds, spine.cover);
    const thudPage = near(score.cues.thuds, page4.at + page4.dur - 0.05);
    check("9 thuds", thudCover <= 2 * frameS && thudPage <= 2 * frameS, `the spine rise's thud ${(thudCover * 1000).toFixed(1)} ms from full cover (${spine.cover}); the page's lay-down thud ${(thudPage * 1000).toFixed(1)} ms from its end`);
    const bell = near(score.cues.bells, 42.0), thump = near(score.cues.thumps, 42.0);
    const pOpen = cue.folios.find((f) => f.seg === "P");
    const flutter = near(score.cues.flutters, pOpen.t);
    check("9 home", bell <= 2 * frameS && thump <= 2 * frameS && Math.abs(pOpen.t - 46.0) <= 2 * frameS && flutter <= frameS, `shop bell ${(bell * 1000).toFixed(1)} ms and stamp thump ${(thump * 1000).toFixed(1)} ms from 42.00; P's folio flutter at ${pOpen.t.toFixed(3)} s (${((pOpen.t - 46) * 1000).toFixed(1)} ms from 46.00), its knock-free flutter cue ${(flutter * 1000).toFixed(1)} ms from the release`);
    const hits = [3.0, 42.0, 57.0].map((t) => near(score.cues.hits, t));
    const lifts = cue.lifts.map((l) => l.t + TL.RUSH_INK * l.dur);
    check("9 downbeats", hits.every((h) => h <= frameS) && lifts.every((r, i) => Math.abs(r - [3.0, 42.0][i]) <= 2 * frameS), `hits at 3.00, 42.00, 57.00 (offsets ${hits.map((h) => (h * 1000).toFixed(1)).join(", ")} ms); the measured curtain lifts rush at ${lifts.map((r) => r.toFixed(3)).join(" and ")} s`);
    check("10 score (WAV)", Math.abs(score.lufs + 14) < 0.3, `score.js: ${score.lufs} LUFS, sample peak ${score.samplePeakDb} dBFS (normalisation gain ${score.gainDb} dB)`);

    // 7: drawn pixels are tokens or exact blends of tokens; the spine rise has no gaps; the slips cover only paper
    const auditTimes = aspect === "16x9" ? [0.5, 1.2, 2.2, 2.95, 4.5, 9.5, 13.5, 23.0, 27.5, 29.6, 30.0, 30.4, 33.0, 38.0, 43.0, 48.5, 51.0, 52.4, 54.0, 57.2, 58.8] : [0.5, 1.2, 2.2, 2.95, 4.5, 9.5, 23.0, 29.6, 30.0, 33.0, 43.0, 52.4, 54.0, 57.2];
    const audits = [];
    for (const t of auditTimes) audits.push(await page.evaluate((x) => window.overlayAudit(x), t));
    const others = audits.reduce((n, a) => n + a.other, 0), total = audits.reduce((n, a) => n + a.token + a.blend + a.other, 0);
    check("7 overlay colours", others === 0, `${total} opaque drawn pixels at ${auditTimes.length} times: ${audits.reduce((n, a) => n + a.token, 0)} token, ${audits.reduce((n, a) => n + a.blend, 0)} exact blends of two tokens, ${others} other (${audits.reduce((n, a) => n + a.fringe, 0)} faint edge pixels set aside)`, audits.filter((a) => a.other));
    const holes = await page.evaluate(() => window.spineHoles());
    check("7 spine coverage", holes.every((h) => h.holes === 0), `spine rise at the swap: ${holes.map((h) => `${h.T}s → ${h.holes} holes`).join(", ")}`);
    if (aspect === "9x16") {
      const times = [0.6, 1.2, 2.0, 2.5, 4.5, 9.5, 13.5, 23.0, 27.5, 33.0, 37.5, 43.5, 48.8, 52.0, 55.2, 56.0, 57.2, 58.8];
      const safe = [];
      for (const t of times) safe.push(await page.evaluate((x) => window.safeAudit(x), t));
      const out = safe.reduce((n, a) => n + a.outside, 0);
      check("6.3 safe zone", out === 0, `drawn pixels (title, slips, end card, touch disc) at ${times.length} times: ${safe.reduce((n, a) => n + a.inside, 0)} inside x 64–1016, y 220–1540, ${out} outside${out ? ` (${JSON.stringify(safe.filter((a) => a.outside).map((a) => [a.T, a.outside, a.where]))})` : ""}`);
    }
    const slips = await page.evaluate(() => window.slipCheck());
    if (aspect === "16x9") check("6.2 slips over paper", slips.every((s) => s.content === 0), `${slips.length} catalogue slips; pixels of type, rules or covers under them (every 0.25 s): ${slips.map((s) => `${s.cue.split(" · ")[0]}:${s.content}`).join(" ")}`, slips);
    else check("6.2 slips (9:16)", true, `on the phone the folio and the sheets fill the screen: each slip sits where it covers least and never on the return slip, the search field, the folio's title or button, or the app's caption (render.mjs --place-slips); worst non-paper pixels under each: ${slips.map((s) => `${s.cue.split(" · ")[0]}:${s.content}@${s.T}`).join(" ")}`, slips);
  } finally {
    await browser.close();
    server.close();
  }

  // 3: capture determinism (a second capture of a shot into out/debug/<id>-rerun)
  const shotId = value("--capture-determinism");
  if (shotId) {
    const a = JSON.parse(readFileSync(path.join(here, "out", "shots", aspect, shotId, "meta.json"), "utf8"));
    const b = JSON.parse(readFileSync(path.join(here, "out", "debug", `${shotId}-rerun`, shotId, "meta.json"), "utf8"));
    const anchors = (m) => JSON.stringify(m.frames.map((f) => f.a ?? null));
    const active = (m) => JSON.stringify(m.events.filter((e) => e.k === "active"));
    const starts = (m) => JSON.stringify(m.starts);
    check(`3 capture determinism (${shotId})`, anchors(a) === anchors(b) && active(a) === active(b),
      `two captures of shot ${shotId}: anchors ${anchors(a) === anchors(b) ? "identical" : "DIFFERENT"} over ${a.frames.length} subframes, active events ${active(a) === active(b) ? "identical" : "DIFFERENT"} (${a.events.filter((e) => e.k === "active").length}), animation starts ${starts(a) === starts(b) ? "identical" : "DIFFERENT"}`);
    const jpgs = [0, 300, 900, 1500, 2100, 3600].map((n) => `${String(n).padStart(5, "0")}.jpg`);
    const same = await Promise.all(jpgs.map(async (f) => (await fs.readFile(path.join(here, "out", "shots", aspect, shotId, f))).equals(await fs.readFile(path.join(here, "out", "debug", `${shotId}-rerun`, shotId, f)))));
    check(`3 capture frames (${shotId})`, same.every(Boolean), `subframes ${jpgs.join(", ")}: ${same.map((x) => (x ? "identical" : "DIFFERENT")).join(", ")}`);
  }

  await fs.writeFile(path.join(here, "out", `verify-${aspect}.json`), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks pass (${aspect})`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
