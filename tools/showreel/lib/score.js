/* global OfflineAudioContext, btoa -- a browser module, imported by reel.html */
/**
 * The reel's score, synthesised offline (OfflineAudioContext, 48 kHz stereo, a fixed seed), so it is
 * identical on every render. Same approach as the Cook With Me score (cook-with-me/tools/showreel/
 * lib/score.js: buses, ducking, a room, BS.1770 loudness, the limiter and the WAV encoder are its);
 * the sound design is new: warm, quiet, paper and wood.
 *
 * Music: 80 BPM, D minor, one chord a bar (Dm9 – B♭maj7 – Gm7 – A7sus4), 20 bars. Felt piano, a soft
 * sine kick, a brushed shaker on swung eighths, pizzicato bass (root and fifth), celesta plucks for
 * the shelf and the search, cello and string pads under the folio and the return, a building cello
 * pulse under the sign-in, a harp glissando into 42.00, where the harmony brightens to D major; it
 * resolves on D (add 9) with the final hit at 57.00 and is silent by 60.00.
 *
 * Sound design, all on picture events: the cue sheet (reel.html cueSheet()) is the app's own measured
 * events (meta.json: every active-volume change, press, key, wheel notch, sheet, folio, fold, flood
 * and lift, in reel seconds) plus the edit's drawn events (timeline.mjs). The spine knock and the
 * paper flutter are the app's own recipes (frontend/src/lib/audio.ts tick() and flutter()).
 *
 * renderScore(cues) resolves to a base64 16-bit stereo WAV, normalised to −14 LUFS integrated
 * (ITU-R BS.1770, measured here) under a −4.5 dBFS brickwall, faded to silence by 60.0 s.
 */
import * as TL from "../timeline.mjs";
import { easeInk, easeRate, spoolRise } from "./ease.js";

const SR = 48000;
const LEN = TL.DURATION;
const BEAT = TL.BEAT;
const BAR = TL.BAR;
const TARGET_LUFS = -14;
const CEILING_DB = -4.5;

const N = (semitonesFromA4) => 440 * Math.pow(2, semitonesFromA4 / 12);
// voicings around middle C; root and fifth for the pizzicato bass
const CHORDS = {
  Dm9: { root: N(-31), fifth: N(-24), keys: [N(-16), N(-12), N(-9), N(-5)], pad: [N(-19), N(-16), N(-12), N(-5)], arp: [N(-7), N(-4), N(0), N(3), N(7)] },
  Bb: { root: N(-35), fifth: N(-28), keys: [N(-16), N(-12), N(-11), N(-7)], pad: [N(-23), N(-16), N(-12), N(-7)], arp: [N(-11), N(-7), N(-4), N(0), N(5)] },
  Gm7: { root: N(-26), fifth: N(-19), keys: [N(-16), N(-11), N(-7), N(-2)], pad: [N(-26), N(-14), N(-11), N(-7)], arp: [N(-14), N(-11), N(-7), N(-2), N(1)] },
  A7sus: { root: N(-24), fifth: N(-17), keys: [N(-14), N(-12), N(-7), N(-5)], pad: [N(-24), N(-14), N(-7), N(-5)], arp: [N(-12), N(-7), N(-5), N(-2), N(0)] },
  D: { root: N(-31), fifth: N(-24), keys: [N(-15), N(-12), N(-7), N(-5)], pad: [N(-19), N(-15), N(-12), N(-5)], arp: [N(-7), N(-3), N(0), N(5), N(7)] },
  Bm7: { root: N(-34), fifth: N(-27), keys: [N(-15), N(-12), N(-10), N(-7)], pad: [N(-22), N(-15), N(-12), N(-7)], arp: [N(-10), N(-7), N(-3), N(0), N(2)] },
  Gmaj7: { root: N(-26), fifth: N(-19), keys: [N(-15), N(-10), N(-7), N(-2)], pad: [N(-26), N(-15), N(-10), N(-7)], arp: [N(-14), N(-10), N(-7), N(-3), N(2)] },
  Em7: { root: N(-29), fifth: N(-22), keys: [N(-14), N(-10), N(-7), N(-5)], pad: [N(-17), N(-14), N(-10), N(-7)], arp: [N(-10), N(-7), N(-5), N(-2), N(2)] },
};
/** One chord a bar: i – ♭VI – iv – V in D minor; from 42.00 (bar 14) D major, resolving on 57.00. */
const BARS = ["Dm9", "Bb", "Gm7", "A7sus", "Dm9", "Bb", "Gm7", "A7sus", "Dm9", "Bb", "Gm7", "A7sus", "Dm9", "Bb", "D", "Bm7", "Gmaj7", "Em7", "A7sus", "D"];

/** Every placed event, for the sync checks (verify.mjs). */
export const CUES = { ticks: [], clacks: [], knocks: [], whooshes: [], flutters: [], thuds: [], thumps: [], bells: [], hits: [], swells: [], rustles: [], glissando: [] };

export async function renderScore(cue) {
  for (const k of Object.keys(CUES)) CUES[k] = [];
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(SR * LEN), sampleRate: SR });
  let seed = 0xb1b10;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

  const noise = ctx.createBuffer(2, SR * 4, SR);
  for (let c = 0; c < 2; c++) {
    const d = noise.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  }

  // ── buses ──
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const soft = ctx.createWaveShaper();
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.15 * x) / Math.tanh(1.15);
  }
  soft.curve = curve;
  soft.oversample = "4x";
  master.connect(soft).connect(ctx.destination);
  // a small room: a 1.0 s noise impulse response, early and soft
  const room = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.round(SR * 1.0), SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 2.2) * Math.exp(-i / (SR * 0.22));
  }
  room.buffer = ir;
  const roomOut = ctx.createGain();
  roomOut.gain.value = 0.2;
  room.connect(roomOut).connect(master);
  const music = ctx.createGain(); // piano, bass, plucks, strings: ducked under kicks and every effect
  music.connect(master);
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(master);
  const fx = ctx.createGain();
  fx.gain.value = 1.0;
  fx.connect(master);

  const send = (node, amount) => {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(room);
  };
  const noiseAt = (t, dur, dest) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.connect(dest);
    s.start(Math.max(0, t), rnd() * 3, dur);
    return s;
  };
  const filter = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  const env = (t, attack, peak, decay, hold = 0) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, Math.max(0, t));
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.setTargetAtTime(0, t + attack + hold, decay);
    return g;
  };
  const panner = (p) => {
    const s = ctx.createStereoPanner();
    s.pan.value = Math.max(-1, Math.min(1, p));
    return s;
  };
  const sfxTimes = [];
  const kicks = [];
  const fxAt = (t) => sfxTimes.push(t);

  // ── instruments ──
  /** Felt piano: sine partials through a dark low-pass, a soft hammer thump. */
  function piano(t, f, v = 1, dur = 1.8, pan = 0) {
    const lp = filter("lowpass", Math.min(2600, 900 + f * 2.2), 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * v, t + 0.014);
    g.gain.setTargetAtTime(0.025 * v, t + 0.014, 0.18);
    g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.25);
    for (const [mult, amp, det] of [[1, 1, 0], [2, 0.34, 3], [3, 0.12, -3], [4, 0.05, 5]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      o.detune.value = det;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(lp);
      o.start(t);
      o.stop(t + dur * 1.6);
    }
    const p = panner(pan);
    lp.connect(g).connect(p).connect(music);
    send(g, 0.32);
    const th = filter("lowpass", 420, 0.7);
    noiseAt(t, 0.03, th);
    th.connect(env(t, 0.002, 0.03 * v, 0.012)).connect(p);
  }
  function chordPiano(t, name, v = 1, dur = 2.2, spread = 0.018) {
    CHORDS[name].keys.forEach((f, i) => piano(t + i * spread, f, v * (i === 0 ? 1 : 0.85), dur, (i - 1.5) * 0.18));
  }
  /** A felt kick: a soft sine, no click. */
  function kick(t, v = 1) {
    kicks.push(t);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(104, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    o.connect(env(t, 0.004, 0.62 * v, 0.11)).connect(drums);
    o.start(t);
    o.stop(t + 0.9);
  }
  /** Brushed shaker. */
  function shaker(t, v = 1) {
    const hp = filter("highpass", 5200, 0.6);
    const bp = filter("bandpass", 8200, 0.9);
    noiseAt(t, 0.09, hp);
    hp.connect(bp).connect(env(t, 0.012, 0.055 * v, 0.03)).connect(panner(0.22 + (rnd() - 0.5) * 0.2)).connect(drums);
  }
  /** Pizzicato bass: a plucked triangle and sine, dark. */
  function pizz(t, f, v = 1) {
    const lp = filter("lowpass", 650, 0.8);
    const g = env(t, 0.004, 0.3 * v, 0.16);
    for (const [type, amp] of [["triangle", 0.7], ["sine", 1]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(lp);
      o.start(t);
      o.stop(t + 1.0);
    }
    lp.connect(g).connect(music);
    send(g, 0.12);
  }
  /** Celesta: a sine and its bell partials, a quick decay. */
  function celesta(t, f, v = 1, pan = 0) {
    const p = panner(pan);
    for (const [mult, amp, dec] of [[1, 1, 0.42], [4, 0.22, 0.12], [2.76, 0.12, 0.08]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      o.connect(env(t, 0.002, 0.045 * v * amp, dec)).connect(p);
      o.start(t);
      o.stop(t + 1.6);
    }
    p.connect(music);
    send(p, 0.45);
  }
  /** A string or cello pad: detuned saws, dark, a slow bow and a gentle vibrato. */
  function strings(t0, t1, freqs, v = 1, bright = 900) {
    const lp = filter("lowpass", bright, 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.022 * v, t0 + 0.9);
    g.gain.setValueAtTime(0.022 * v, Math.max(t0 + 0.9, t1 - 0.6));
    g.gain.linearRampToValueAtTime(0, t1);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vd = ctx.createGain();
    vd.gain.value = 7;
    vib.connect(vd);
    vib.start(t0);
    vib.stop(t1 + 0.1);
    freqs.forEach((f, i) => {
      for (const d of [-6, 5]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = d + i;
        vd.connect(o.detune);
        o.connect(panner((d < 0 ? -0.35 : 0.35) * (i % 2 ? 1 : 0.6))).connect(lp);
        o.start(t0);
        o.stop(t1 + 0.1);
      }
    });
    lp.connect(g).connect(music);
    send(g, 0.55);
  }
  /** A bowed cello note (the pulse under the sign-in, the low string on the downbeat). */
  function cello(t, f, dur, v = 1) {
    const lp = filter("lowpass", 700, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * v, t + 0.035);
    g.gain.setTargetAtTime(0.03 * v, t + 0.035, 0.12);
    g.gain.setTargetAtTime(0, t + dur, 0.08);
    for (const d of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    lp.connect(g).connect(music);
    send(g, 0.3);
  }
  /** A harp string: a plucked sine with a soft octave. */
  function harp(t, f, v = 1, pan = 0) {
    const p = panner(pan);
    for (const [mult, amp] of [[1, 1], [2, 0.25]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mult;
      o.connect(env(t, 0.003, 0.04 * v * amp, 0.5)).connect(p);
      o.start(t);
      o.stop(t + 2.5);
    }
    p.connect(music);
    send(p, 0.5);
  }

  // ── sound design ──
  let lastKnock = -1;
  /** The app's spine knock (lib/audio.ts tick()): a triangle 1500 → 420 Hz in 28 ms and a sine body 190 → 95 Hz. */
  function knock(t, v = 1, pan = 0, list = CUES.knocks) {
    if (t - lastKnock < 0.035) return;
    lastKnock = t;
    const jitter = 0.92 + rnd() * 0.16;
    const p = panner(pan);
    const k = ctx.createOscillator();
    k.type = "triangle";
    k.frequency.setValueAtTime(1500 * jitter, t);
    k.frequency.exponentialRampToValueAtTime(420 * jitter, t + 0.028);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.exponentialRampToValueAtTime(0.11 * 1.6 * v, t + 0.002);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    k.connect(kg).connect(p);
    k.start(t);
    k.stop(t + 0.06);
    const b = ctx.createOscillator();
    b.frequency.setValueAtTime(190 * jitter, t);
    b.frequency.exponentialRampToValueAtTime(95, t + 0.06);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.09 * 1.6 * v, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    b.connect(bg).connect(p);
    b.start(t);
    b.stop(t + 0.1);
    p.connect(fx);
    send(p, 0.12);
    list.push(t);
    fxAt(t);
  }
  /** The app's paper flutter (lib/audio.ts flutter()): three triangles gliding down, low-passed, a slowing tremolo. */
  function flutter(t, v = 1) {
    const dur = 0.5;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.09 * 1.8 * v, t + 0.06);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(31, t);
    lfo.frequency.exponentialRampToValueAtTime(11, t + dur);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const lp = filter("lowpass", 900, 0.7);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + dur);
    for (const f of [86, 131, 197]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(f, t + dur);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(trem).connect(e).connect(fx);
    send(e, 0.25);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    CUES.flutters.push(t);
    fxAt(t);
  }
  /**
   * A whoosh shaped by the motion itself: band-passed noise whose gain follows the derivative of
   * easeInk(u) (so it swells exactly in the rush), its centre rising with the coverage, its pan
   * following the edge (dir +1: right → left, as a sheet unrolls from the right).
   */
  function whoosh(t0, dur, dir = 1, v = 1, band = [380, 3000], list = CUES.whooshes, id = "") {
    const n = 200;
    const gain = new Float32Array(n), freq = new Float32Array(n), pan = new Float32Array(n);
    let peak = 0, peakU = 0;
    for (let i = 0; i < n; i++) {
      const r = easeRate(easeInk, i / (n - 1));
      if (r > peak) { peak = r; peakU = i / (n - 1); }
    }
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      gain[i] = (0.16 * v * easeRate(easeInk, u)) / peak;
      freq[i] = band[0] + (band[1] - band[0]) * easeInk(u);
      pan[i] = 0.6 * dir * (1 - 2 * easeInk(u));
    }
    const bp = filter("bandpass", band[0], 0.9);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(gain, t0, dur);
    bp.frequency.setValueCurveAtTime(freq, t0, dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueCurveAtTime(pan, t0, dur);
    noiseAt(t0, dur + 0.05, bp);
    bp.connect(g).connect(p).connect(fx);
    send(g, 0.25);
    list.push({ id, start: t0, dur, peak: t0 + peakU * dur, rush: t0 + TL.RUSH_INK * dur });
    fxAt(t0 + peakU * dur);
  }
  /** A soft tick on a press. */
  function tick(t, v = 1, pan = 0) {
    const p = panner(pan);
    const o = ctx.createOscillator();
    o.frequency.value = 3100;
    o.connect(env(t, 0.0006, 0.03 * v, 0.004)).connect(p);
    o.start(t);
    o.stop(t + 0.05);
    const hp = filter("highpass", 5200);
    noiseAt(t, 0.012, hp);
    hp.connect(env(t, 0.0003, 0.022 * v, 0.002)).connect(p);
    p.connect(fx);
    CUES.ticks.push(t);
  }
  /** A key clack: a 2.4 kHz click and a 180 Hz thock, 20 ms. */
  function clack(t, v = 1, deep = false) {
    const p = panner(0.12);
    const c = ctx.createOscillator();
    c.frequency.value = deep ? 1900 : 2400;
    c.connect(env(t, 0.0005, 0.035 * v, 0.004)).connect(p);
    c.start(t);
    c.stop(t + 0.03);
    const th = ctx.createOscillator();
    th.frequency.value = deep ? 140 : 180;
    th.connect(env(t, 0.001, 0.12 * v, 0.007)).connect(p);
    th.start(t);
    th.stop(t + 0.05);
    const bp = filter("bandpass", 3500, 1.4);
    noiseAt(t, 0.015, bp);
    bp.connect(env(t, 0.0004, 0.03 * v, 0.003)).connect(p);
    p.connect(fx);
    CUES.clacks.push(t);
  }
  /** A stamp thump: a sine dropping from 90 Hz and a low-passed slap. */
  function thump(t, v = 1, list = CUES.thumps) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(env(t, 0.002, 0.5 * v, 0.08)).connect(fx);
    o.start(t);
    o.stop(t + 0.7);
    const lp = filter("lowpass", 800, 0.7);
    noiseAt(t, 0.05, lp);
    const g = env(t, 0.001, 0.24 * v, 0.016);
    lp.connect(g).connect(fx);
    send(g, 0.3);
    list.push(t);
    fxAt(t);
  }
  /** A small brass shop bell: inharmonic partials over 2.6 kHz. No register, no coins. */
  function bell(t, v = 1) {
    const p = panner(-0.18);
    [[1, 1, 1.2], [2.4, 0.5, 0.6], [3.9, 0.3, 0.35], [5.7, 0.2, 0.2]].forEach(([r, a, d]) => {
      const o = ctx.createOscillator();
      o.frequency.value = 2600 * r;
      o.connect(env(t, 0.0015, 0.04 * a * v, d / 3)).connect(p);
      o.start(t);
      o.stop(t + d * 3);
    });
    p.connect(fx);
    send(p, 0.45);
    CUES.bells.push(t);
    fxAt(t);
  }
  /** A downbeat hit: a felt kick and a low bowed string. */
  function hit(t, v = 1, root = CHORDS.Dm9.root) {
    kick(t, 1.05 * v);
    cello(t, root, 1.1, 1.2 * v);
    cello(t, root * 2, 0.9, 0.5 * v);
    CUES.hits.push(t);
    fxAt(t);
  }
  /** A low thud (full coverage, a page laid down). */
  function thud(t, v = 1, list = CUES.thuds) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    o.connect(env(t, 0.003, 0.55 * v, 0.12)).connect(fx);
    o.start(t);
    o.stop(t + 0.9);
    const lp = filter("lowpass", 300, 0.7);
    noiseAt(t, 0.08, lp);
    lp.connect(env(t, 0.002, 0.18 * v, 0.03)).connect(fx);
    kicks.push(t);
    list.push(t);
    fxAt(t);
  }
  /** Low-passed noise swelling over `dur` along easeInk' (the ink flood), with an optional faint crackle. */
  function inkSwell(t0, dur, v = 1, crackle = false) {
    const n = 120;
    const curveG = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, easeRate(easeInk, i / (n - 1)));
    for (let i = 0; i < n; i++) curveG[i] = (0.11 * v * (0.25 + 0.75 * easeRate(easeInk, i / (n - 1)) / peak)) * Math.min(1, (1 - i / (n - 1)) * 6);
    const lp = filter("lowpass", 520, 0.7);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(curveG, t0, dur);
    noiseAt(t0, dur + 0.05, lp);
    lp.connect(g).connect(panner(-0.1)).connect(fx);
    send(g, 0.4);
    if (crackle) for (let t = t0 + 0.05; t < t0 + dur - 0.05; t += 0.04 + rnd() * 0.16) tickNoise(t, 0.25 + rnd() * 0.3, (rnd() - 0.5) * 0.8);
    CUES.swells.push({ start: t0, dur });
  }
  function tickNoise(t, v, pan) {
    const hp = filter("highpass", 3800, 0.8);
    noiseAt(t, 0.01, hp);
    hp.connect(env(t, 0.0004, 0.025 * v, 0.003)).connect(panner(pan)).connect(fx);
  }
  /** Air under a hand-made motion: band-passed noise whose gain follows the motion's speed. */
  function air(t0, dur, v = 1, f = 700) {
    const n = 100;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      c[i] = 0.07 * v * Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
    }
    const bp = filter("bandpass", f, 0.7);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(c, t0, dur);
    noiseAt(t0, dur + 0.05, bp);
    bp.connect(g).connect(fx);
    send(g, 0.2);
  }
  /** A page's rustle: 2–7 kHz band-passed noise following the curl's speed. */
  function rustle(t0, dur, v = 1) {
    const n = 160;
    const c = new Float32Array(n), fr = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, easeRate(easeInk, i / (n - 1)));
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      c[i] = (0.09 * v * easeRate(easeInk, u)) / peak;
      fr[i] = 2000 + 5000 * easeInk(u);
    }
    const bp = filter("bandpass", 2000, 1.1);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(c, t0, dur);
    bp.frequency.setValueCurveAtTime(fr, t0, dur);
    noiseAt(t0, dur + 0.05, bp);
    bp.connect(g).connect(panner(0.1)).connect(fx);
    send(g, 0.3);
    CUES.rustles.push({ start: t0, dur });
  }

  // ── the music ──
  const section = (t) =>
    t < 3 ? "intro" : t < 12 ? "shelf" : t < 21 ? "folio" : t < 30 ? "find" : t < 42 ? "collect" : t < 51 ? "home" : t < 54 ? "phone" : "end";
  // room tone under the intro
  {
    const lp = filter("lowpass", 380, 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.012, 0.6);
    g.gain.setValueAtTime(0.012, 2.4);
    g.gain.linearRampToValueAtTime(0.004, 3.4);
    g.gain.setValueAtTime(0.004, LEN - 2);
    g.gain.linearRampToValueAtTime(0, LEN - 0.5);
    for (let t = 0; t < LEN; t += 3.9) noiseAt(t, 4, lp);
    lp.connect(g).connect(master);
  }
  for (let bar = 0; bar < 20; bar++) {
    const t0 = bar * BAR;
    const name = BARS[bar];
    const ch = CHORDS[name];
    const sec = section(t0 + 0.01);
    // felt piano: the chord on the downbeat, a softer answer on beat 3
    if (bar === 19) continue; // the final chord is placed with the final hit
    const pv = { intro: 0.9, shelf: 0.85, folio: 0.95, find: 0.75, collect: 0.8, home: 1.0, phone: 0.8, end: 0.85 }[sec];
    chordPiano(t0 + (bar === 0 ? 0.0 : 0.0), name, pv, 2.4);
    if (sec !== "intro") chordPiano(t0 + 2 * BEAT + 0.375, name, pv * 0.55, 1.4, 0.03);
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BEAT;
      // the groove: a felt kick on 1 and 3, brushed shaker on swung eighths, pizzicato root–fifth
      const groove = sec === "shelf" || sec === "find" || sec === "collect" || sec === "home";
      if (groove && (b === 0 || b === 2) && !(sec === "find" && b === 2)) kick(t, b === 0 ? 0.9 : 0.7);
      if (sec !== "intro" && sec !== "end") {
        shaker(t, b === 0 ? 0.9 : 0.75);
        shaker(t + BEAT * (2 / 3), 0.55); // swung: the off-beat eighth lands two thirds into the beat
      }
      if (sec === "end" && t < 57) shaker(t, 0.5);
      if (groove || sec === "folio") pizz(t + 0.004, b % 2 ? ch.fifth : ch.root, sec === "folio" ? 0.7 : 0.95);
    }
    // celesta plucks for the shelf and the search: a broken chord on the eighths
    if (sec === "shelf" || sec === "find") for (let k = 0; k < 8; k++) celesta(t0 + k * (BAR / 8), ch.arp[[0, 2, 4, 2, 1, 3, 4, 3][k]], k % 4 === 0 ? 0.85 : 0.55, k % 2 ? 0.3 : -0.3);
    // the cello pulse under the sign-in builds bar by bar (30–42)
    if (sec === "collect") {
      const build = 0.45 + 0.55 * ((bar - 10) / 3);
      for (let k = 0; k < 8; k++) cello(t0 + k * (BAR / 8), ch.root * 2, 0.28, build * (k % 2 ? 0.6 : 0.9));
    }
  }
  // strings under the folio (12–21) and the return (42–51), the ending's pad (54–60)
  strings(12, 21.4, CHORDS.Dm9.pad, 0.85, 850);
  strings(15, 18.2, CHORDS.Bb.pad, 0.5, 800);
  strings(18, 21.4, CHORDS.Gm7.pad, 0.6, 800);
  strings(42, 45.2, CHORDS.D.pad, 1.1, 1100);
  strings(45, 48.2, CHORDS.Bm7.pad, 1.0, 1100);
  strings(48, 51.3, CHORDS.Gmaj7.pad, 0.9, 1000);
  strings(54, 57.2, CHORDS.A7sus.pad, 0.8, 900);
  strings(57, 59.6, CHORDS.D.pad, 1.0, 1000);

  // ── the title (0–2.54) and the curtain (T0) ──
  TL.T.spines.forEach((t, i) => knock(t + 0.3, 0.55, -0.5 + i * 0.1, CUES.knocks));
  {
    // paper rustle as the wordmark rises
    const hp = filter("bandpass", 4200, 0.9);
    noiseAt(TL.T.wordmark, 0.35, hp);
    hp.connect(env(TL.T.wordmark, 0.05, 0.035, 0.09)).connect(panner(-0.3)).connect(fx);
  }
  {
    // a reversed swell into the downbeat: the Dm9 chord, its envelope run backwards (no pitch rise)
    const g = ctx.createGain();
    const n = 64;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = 0.05 * Math.pow(i / (n - 1), 3);
    g.gain.setValueAtTime(0, 1.5);
    g.gain.setValueCurveAtTime(c, 1.5, 1.48);
    g.gain.setValueAtTime(0, 2.985);
    const lp = filter("lowpass", 1400, 0.6);
    CHORDS.Dm9.keys.forEach((f) => {
      for (const m of [1, 2]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * m;
        const a = ctx.createGain();
        a.gain.value = m === 1 ? 1 : 0.3;
        o.connect(a).connect(lp);
        o.start(1.5);
        o.stop(3.0);
      }
    });
    lp.connect(g).connect(music);
    send(g, 0.6);
    CUES.swells.push({ start: 1.5, dur: 1.5, reversed: true });
  }
  hit(3.0, 1, CHORDS.Bb.root);
  for (const l of cue.lifts) if (l.t < 10) whoosh(l.t, l.dur, -1, 0.5, [300, 1800], CUES.whooshes, "lift-H");

  // ── the app's own events ──
  for (const p of cue.presses) {
    tick(p.t, p.kind === "drag" ? 0.8 : 1, 0);
    fxAt(p.t);
  }
  for (const w of cue.wheels) tick(w.t, 0.7, 0.2);
  for (const k of cue.keys) clack(k.t, k.key === "Enter" ? 1 : /^Arrow/.test(k.key) ? 0.75 : 0.9, k.key === "Enter");
  for (const k of cue.knocks) knock(k.t, 0.95, 0);
  for (const f of cue.folios) flutter(f.t, 1);
  for (const s of cue.sheets) whoosh(s.t, s.dur, s.dir, s.dir > 0 ? 1 : 0.8, [380, 3000], CUES.whooshes, `sheet-${s.seg}-${s.dir > 0 ? "in" : "out"}`);
  for (const f of cue.folds) whoosh(f.t, TL.D.close, -1, 0.85, [320, 2400], CUES.whooshes, "fold");
  for (const f of cue.fields) knock(f.t + 0.08, 0.6, 0.35);
  for (const f of cue.floods) if (f.in) inkSwell(f.t, f.dur, 0.85);
  for (const d of cue.presses.filter((p) => p.kind === "drag")) air(d.t, d.up - d.t, 1.1, 650);
  for (const s of cue.swipes) air(s.t, s.move + s.hold, 0.7, 900);
  for (const s of cue.scrolls) air(s.t, s.dur, 0.45, 1600);
  // the re-spools: the shelf sinks (a thud as it goes), then the volumes rise centre first (knocks)
  for (const r of cue.respools) {
    thud(r.t - 0.02, 0.6, CUES.thuds);
    const n = Math.min(r.to, 7);
    for (let k = 0; k < n; k++) {
      const delay = 0.45 * Math.min(1, k / 11);
      knock(r.t + 0.95 * (delay + 0.55 * 0.632), r.to <= 6 ? 0.8 : 0.55, (k % 2 ? 1 : -1) * Math.min(0.7, k * 0.12), CUES.knocks);
    }
  }

  // ── T1: the spine rise — a knock per strip as it lands (rolling outward), a thud at full cover ──
  {
    const c = cue.spines.cut, n = cue.spines.n, ic = (n - 1) / 2;
    const landed = [];
    for (let i = 0; i < n; i++) {
      const d = 0.45 * Math.min(1, Math.abs(i - ic) / 11);
      // e reaches 0.95 at t = 0.632 of its 0.55 span: spool = d + 0.348, over the 0.8 s rise
      landed.push({ t: c.at + c.rise * (d + 0.55 * 0.632), x: (i + 0.5) / n });
    }
    landed.sort((a, b) => a.t - b.t);
    landed.forEach((l, k) => {
      lastKnock = -1; // strips land together: the 35 ms guard is the app's, for one shelf's ticks
      if (k > 0 && l.t - landed[k - 1].t < 0.012) return;
      knock(l.t, 0.75, (l.x - 0.5) * 1.6, CUES.knocks);
    });
    thud(c.cover, 1.1, CUES.thuds);
    // the sink: the same in reverse, quieter
    const sinkStart = c.at + c.rise + c.hold, sinkDur = c.dur - c.rise - c.hold;
    for (let i = 0; i < n; i += 2) {
      const d = 0.45 * Math.min(1, Math.abs(i - ic) / 11);
      const t = sinkStart + sinkDur * (1 - (d + 0.55 * 0.4));
      if (t > sinkStart && t < c.at + c.dur) {
        lastKnock = -1;
        knock(t, 0.35, ((i + 0.5) / n - 0.5) * 1.6, CUES.knocks);
      }
    }
  }

  // ── T2: the ink bleed — a low swell with a faint crackle, paper under it, a harp glissando into 42.00 ──
  {
    const c = TL.CUTS.find((x) => x.kind === "ink");
    inkSwell(c.at, c.dur, 1.2, true);
    const bp = filter("bandpass", 1800, 0.8);
    noiseAt(c.at, c.dur, bp);
    bp.connect(env(c.at, 0.6, 0.02, 0.4, 0.6)).connect(fx);
    const notes = [N(-19), N(-15), N(-12), N(-7), N(-5), N(-3), N(0), N(5), N(7), N(9), N(12), N(17), N(19), N(21)];
    const g0 = 41.62;
    notes.forEach((f, i) => {
      harp(g0 + i * 0.026, f, 0.9, -0.5 + i * 0.07);
      CUES.glissando.push(g0 + i * 0.026);
    });
  }
  // 42.00: home. A small brass shop bell and a stamp thump on the return slip, and the downbeat
  bell(TL.T.liftRushP, 1);
  thump(TL.T.liftRushP, 1);
  hit(TL.T.liftRushP, 0.9, CHORDS.D.root);
  for (const l of cue.lifts) if (l.t > 40) whoosh(l.t, l.dur, -1, 0.45, [300, 1800], CUES.whooshes, "lift-P");
  // the folio's last block, IN YOUR COLLECTION — EX LIBRIS, rises (9th block: 380 + 65·8 ms, + its spring rush)
  {
    const open = cue.folios.find((f) => f.seg === "P");
    if (open) thump(open.t + 0.38 + 0.065 * 8 + 0.82 * TL.RUSH_SPRING, 0.55);
  }

  // ── T3: the sheet wipe; T4: the page turn ──
  {
    const c = TL.CUTS.find((x) => x.kind === "sheet");
    whoosh(c.at, c.dur, 1, 0.9, [380, 3200], CUES.whooshes, "T3");
    const p = TL.CUTS.find((x) => x.kind === "page");
    rustle(p.at, p.dur, 1);
    thud(p.at + p.dur - 0.05, 0.45, CUES.thuds);
  }

  // ── E: the final chord and hit at 57.00, a reverb tail, silence by 60.00 ──
  {
    const t = TL.T.finalHit;
    kick(t, 1.0);
    cello(t, CHORDS.D.root, 2.2, 1.2);
    CHORDS.D.keys.concat([CHORDS.D.keys[2] * 2, N(7)]).forEach((f, i) => piano(t + i * 0.02, f, 1.05, 3.4, (i - 2.5) * 0.15));
    pizz(t, CHORDS.D.root, 1);
    CUES.hits.push(t);
    fxAt(t);
  }

  // ── the mix: the music bus ducks under every kick, and dips 4 dB for 120 ms under each effect ──
  const dips = [];
  for (const k of kicks) dips.push([k, 0.6, 0.11]);
  for (const s of sfxTimes) dips.push([s, 0.63, 0.12]);
  dips.sort((a, b) => a[0] - b[0]);
  music.gain.setValueAtTime(1, 0);
  for (const [t, depth, len] of dips) {
    music.gain.setValueAtTime(1, Math.max(0, t - 0.003));
    music.gain.linearRampToValueAtTime(depth, t + 0.01);
    music.gain.setTargetAtTime(1, t + 0.01, len / 2.5);
  }
  // silence by 60.0: the tail fades over the last 2 s, so the file loops clean
  master.gain.setValueAtTime(0.8, LEN - 2.2);
  master.gain.linearRampToValueAtTime(0, LEN - 0.12);

  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const stats = normalise(L, R);
  window.__score = { cues: CUES, ...stats };
  return toWav(L, R);
}

// ── loudness: ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, gating) ──
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}
function kWeight(x) {
  const s = biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585);
  return biquad(s, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
}
export function integratedLoudness(L, R) {
  const kl = kWeight(L), kr = kWeight(R);
  const block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const powers = [];
  for (let s = 0; s + block <= kl.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += kl[i] * kl[i] + kr[i] * kr[i];
    powers.push(sum / block);
  }
  const lufs = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lufs(p) > -70);
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  return lufs(mean(gated));
}
/** −14 LUFS under a −4.5 dBFS brickwall (2 ms look-ahead, 60 ms release), measured and applied in place. */
function normalise(L, R) {
  let gain = 1;
  let lufs = integratedLoudness(L, R);
  const ceiling = Math.pow(10, CEILING_DB / 20);
  for (let pass = 0; pass < 5; pass++) {
    const g = Math.pow(10, (TARGET_LUFS - lufs) / 20);
    gain *= g;
    for (let i = 0; i < L.length; i++) {
      L[i] *= g;
      R[i] *= g;
    }
    limit(L, R, ceiling);
    lufs = integratedLoudness(L, R);
    if (Math.abs(lufs - TARGET_LUFS) < 0.05) break;
  }
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  return { lufs: Math.round(lufs * 100) / 100, samplePeakDb: Math.round(20 * Math.log10(peak) * 100) / 100, gainDb: Math.round(20 * Math.log10(gain) * 100) / 100 };
}
function limit(L, R, ceiling) {
  const n = L.length;
  const look = Math.round(0.002 * SR), release = Math.exp(-1 / (0.06 * SR));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  const g1 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = need[i];
    for (let k = 1; k <= look && i + k < n; k++) if (need[i + k] < m) m = need[i + k];
    g1[i] = m;
  }
  let sum = 0;
  let e = 1;
  for (let i = 0; i < n; i++) {
    sum += g1[i];
    if (i >= look) sum -= g1[i - look];
    const g2 = sum / Math.min(i + 1, look);
    e = Math.min(g2, 1 - (1 - e) * release);
    L[i] *= e;
    R[i] *= e;
  }
}
function toWav(L, R) {
  const frames = L.length, bytes = 44 + frames * 4;
  const dv = new DataView(new ArrayBuffer(bytes));
  const str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, frames * 4, true);
  for (let i = 0, o = 44; i < frames; i++, o += 4) {
    dv.setInt16(o, Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), true);
    dv.setInt16(o + 2, Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), true);
  }
  const u8 = new Uint8Array(dv.buffer);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
