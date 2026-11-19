/**
 * Acoustic tactile feedback — FRONTEND_PROMPT.md §9.1.
 *
 * Everything is synthesised with native AudioContext oscillators; there are no
 * audio files. The context is created lazily and only resumes after a real
 * user gesture (browser autoplay policy), so wheel-only scrubbing stays silent
 * until the first click, tap or key press.
 */
const STORAGE_KEY = 'bo:sound'

type AudioCtor = typeof AudioContext

class TactileAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private lastTick = 0
  enabled = true

  constructor() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off'
    } catch {
      /* storage unavailable — keep the default */
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
    } catch {
      /* storage unavailable */
    }
  }

  /** Call from a user-gesture handler (pointerdown / keydown). */
  unlock = () => {
    if (!this.enabled) return
    if (!this.ctx) {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      if (!Ctor) return
      try {
        this.ctx = new Ctor()
        this.master = this.ctx.createGain()
        this.master.gain.value = 0.5
        this.master.connect(this.ctx.destination)
      } catch {
        this.ctx = null
        return
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null
    return { ctx: this.ctx, out: this.master }
  }

  /** A spine sliding past polished oak: a short woody knock with a bright edge. */
  tick() {
    const a = this.ready()
    if (!a) return
    const now = a.ctx.currentTime
    if (now - this.lastTick < 0.035) return
    this.lastTick = now
    const jitter = 0.92 + Math.random() * 0.16

    const knock = a.ctx.createOscillator()
    const knockGain = a.ctx.createGain()
    knock.type = 'triangle'
    knock.frequency.setValueAtTime(1500 * jitter, now)
    knock.frequency.exponentialRampToValueAtTime(420 * jitter, now + 0.028)
    knockGain.gain.setValueAtTime(0.0001, now)
    knockGain.gain.exponentialRampToValueAtTime(0.11, now + 0.002)
    knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
    knock.connect(knockGain).connect(a.out)
    knock.start(now)
    knock.stop(now + 0.06)

    const body = a.ctx.createOscillator()
    const bodyGain = a.ctx.createGain()
    body.type = 'sine'
    body.frequency.setValueAtTime(190 * jitter, now)
    body.frequency.exponentialRampToValueAtTime(95, now + 0.06)
    bodyGain.gain.setValueAtTime(0.0001, now)
    bodyGain.gain.exponentialRampToValueAtTime(0.09, now + 0.004)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    body.connect(bodyGain).connect(a.out)
    body.start(now)
    body.stop(now + 0.1)
  }

  /** A soft, low paper flutter for the folio sheet unfolding. */
  flutter() {
    const a = this.ready()
    if (!a) return
    const now = a.ctx.currentTime
    const dur = 0.5

    const env = a.ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(0.09, now + 0.06)
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    // Tremolo: a slowing LFO chops the tone into a handful of soft "flaps".
    const tremolo = a.ctx.createGain()
    tremolo.gain.value = 0.5
    const lfo = a.ctx.createOscillator()
    const lfoDepth = a.ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(31, now)
    lfo.frequency.exponentialRampToValueAtTime(11, now + dur)
    lfoDepth.gain.value = 0.5
    lfo.connect(lfoDepth).connect(tremolo.gain)

    const lowpass = a.ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.setValueAtTime(900, now)
    lowpass.frequency.exponentialRampToValueAtTime(240, now + dur)

    for (const freq of [86, 131, 197]) {
      const osc = a.ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq * 1.25, now)
      osc.frequency.exponentialRampToValueAtTime(freq, now + dur)
      osc.connect(lowpass)
      osc.start(now)
      osc.stop(now + dur + 0.05)
    }
    lowpass.connect(tremolo).connect(env).connect(a.out)
    lfo.start(now)
    lfo.stop(now + dur + 0.05)
  }
}

export const tactileAudio = new TactileAudio()
