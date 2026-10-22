// Deterministic synthetic instrument response. These are not measured samples.
export const SAMPLE_RATE = 200;
export const RESISTANCE = 20;
export const INDUCTANCE = 0.7;

export class InstrumentSource {
  constructor() { this.reset(); }
  reset() {
    this.time = 0; this.phase = 0; this.current = 0; this.coloredNoise = 0;
    this.seed = 0x243f6a88; this.events = []; this.nextEvent = 1.4;
  }
  random() {
    let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0; return this.seed / 4294967296;
  }
  trigger() { this.events.push({ at: this.time, strength: 0.72 }); }
  step(settings) {
    const dt = 1 / SAMPLE_RATE;
    this.time += dt;
    const instrument = settings.mode === 'instrument';
    const wander = instrument ? 1 + 0.025 * Math.sin(this.time * 0.7) + 0.012 * Math.sin(this.time * 0.19) : 1;
    this.phase = (this.phase + settings.frequency * wander * dt) % 1;
    const angle = this.phase * 2 * Math.PI;
    let wave;
    switch (settings.waveform) {
      case 'square': wave = this.phase < 0.5 ? 1 : -1; break;
      case 'triangle': wave = 1 - 4 * Math.abs(this.phase - 0.5); break;
      case 'sawtooth': wave = this.phase * 2 - 1; break;
      default: wave = Math.sin(angle);
    }
    let offset = 0, transient = 0;
    if (instrument) {
      const envelope = 0.64 + 0.2 * Math.sin(this.time * 0.51) + 0.12 * Math.sin(this.time * 0.13 + 0.5);
      wave = envelope * (0.83 * wave + 0.12 * Math.sin(3 * angle + 0.4) + 0.05 * Math.sin(7 * angle));
      offset = settings.drift / 100 * (0.16 * Math.sin(this.time * 0.29) + 0.08 * Math.sin(this.time * 0.083 + 0.9));
      if (this.time >= this.nextEvent) {
        this.events.push({ at: this.time, strength: (this.random() < 0.5 ? -1 : 1) * (0.25 + 0.3 * this.random()) });
        this.nextEvent = this.time + 3.4 + 4.2 * this.random();
      }
      this.events = this.events.filter(event => this.time - event.at < 15);
      for (const event of this.events) {
        const age = this.time - event.at;
        const rise = 1 - Math.exp(-age / 0.025);
        transient += event.strength * rise * (Math.exp(-age / 0.75) + 0.6 * Math.exp(-age / 1.2) * Math.sin(2 * Math.PI * (settings.frequency * 2.8 + 1) * age));
      }
    }
    const white = this.random() * 2 - 1;
    const retention = Math.exp(-dt / 0.035);
    this.coloredNoise = retention * this.coloredNoise + (1 - retention) * white;
    const noise = settings.noise / 100 * (instrument ? 0.65 * this.coloredNoise + 0.35 * white : white);
    const unclipped = settings.amplitude * (wave + offset + transient + noise);
    const v = Math.max(-20, Math.min(20, unclipped));
    // Exact RL update for a held voltage over dt; ideal mode retains a resistor.
    const decay = Math.exp(-RESISTANCE * dt / INDUCTANCE);
    this.current = instrument ? decay * this.current + (1 - decay) * v / RESISTANCE : v / RESISTANCE;
    return { t: this.time, v, i: this.current, p: v * this.current };
  }
}

// Trapezoidal integration of recorded measurements, preserving nonuniform times.
export function measuredMetrics(samples, seconds = 5) {
  if (!samples.length) return null;
  const end = samples[samples.length - 1].t;
  const start = Math.max(samples[0].t, end - seconds);
  let duration = 0, v2 = 0, i2 = 0, power = 0;
  for (let index = 1; index < samples.length; index++) {
    const a = samples[index - 1], b = samples[index];
    if (b.t <= start) continue;
    const from = Math.max(start, a.t), dt = b.t - from;
    if (dt <= 0) continue;
    const f = (from - a.t) / (b.t - a.t);
    const v = a.v + (b.v - a.v) * f, i = a.i + (b.i - a.i) * f, p = a.p + (b.p - a.p) * f;
    v2 += (v * v + b.v * b.v) * dt / 2;
    i2 += (i * i + b.i * b.i) * dt / 2;
    power += (p + b.p) * dt / 2; duration += dt;
  }
  if (!duration) { const s = samples[samples.length - 1]; return { voltage: Math.abs(s.v), current: Math.abs(s.i), power: s.p }; }
  return { voltage: Math.sqrt(v2 / duration), current: Math.sqrt(i2 / duration), power: power / duration };
}
