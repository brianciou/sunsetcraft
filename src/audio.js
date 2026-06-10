// Procedural ambience — no audio files. Wind swells with glide speed,
// waves fade in near sea level, everything muffles underwater.
export class Ambience {
  constructor() {
    this.ctx = null
  }

  // must be called from a user gesture (pointer-lock click)
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = (this.ctx = new AC())

    // shared looping noise buffer (white + a pinkish low component)
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = last * 0.985 + w * 0.015
      d[i] = w * 0.25 + last * 6.0
    }
    const mkNoise = () => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.playbackRate.value = 0.85 + Math.random() * 0.3
      s.start()
      return s
    }

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // wind: noise -> sweeping bandpass -> gain
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 420
    this.windFilter.Q.value = 0.6
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    mkNoise().connect(this.windFilter)
    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.master)

    // gusts: slow LFO wobbles the wind filter frequency
    const gust = ctx.createOscillator()
    gust.frequency.value = 0.13
    const gustAmt = ctx.createGain()
    gustAmt.gain.value = 110
    gust.connect(gustAmt)
    gustAmt.connect(this.windFilter.frequency)
    gust.start()

    // waves: noise -> lowpass -> gain (amplitude swells driven from update())
    this.waveFilter = ctx.createBiquadFilter()
    this.waveFilter.type = 'lowpass'
    this.waveFilter.frequency.value = 420
    this.waveGain = ctx.createGain()
    this.waveGain.gain.value = 0
    mkNoise().connect(this.waveFilter)
    this.waveFilter.connect(this.waveGain)
    this.waveGain.connect(this.master)
  }

  setPaused(paused) {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(paused ? 0 : 0.9, this.ctx.currentTime, 0.4)
  }

  update(t, { gliding, glideSpeed, y, underwater }) {
    if (!this.ctx || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime

    // wind follows glide speed; faint breeze on foot
    let wind = gliding ? Math.min(0.4, 0.05 + glideSpeed * 0.009) : 0.025
    let windFreq = 380 + (gliding ? glideSpeed * 16 : 0)

    // waves swell when near sea level, with two beating periods
    const shore = Math.max(0, 1 - Math.max(0, y - 24) / 36)
    let waves = shore * 0.22 * (0.55 + 0.32 * Math.sin(t * 0.55) + 0.18 * Math.sin(t * 1.31 + 1.7))

    if (underwater) {
      wind = 0
      waves = 0.3
      this.waveFilter.frequency.setTargetAtTime(160, now, 0.2)
    } else {
      this.waveFilter.frequency.setTargetAtTime(420, now, 0.2)
    }

    this.windGain.gain.setTargetAtTime(wind, now, 0.35)
    this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.5)
    this.waveGain.gain.setTargetAtTime(Math.max(0, waves), now, 0.3)
  }
}
