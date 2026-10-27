// Analog dial gauges drawn on canvas. Dial angles are degrees clockwise from 12 o'clock.
export const GAUGES = [
  { key: 'alt', title: 'ALTITUDE', unit: 'deg', min: 0, max: 90, from: -135, to: 135, major: 10, minor: 2 },
  { key: 'az', title: 'AZIMUTH', unit: 'deg', min: 0, max: 360, from: 0, to: 360, major: 30, minor: 5, wrap: true },
  { key: 'level', title: 'SIGNAL', unit: 'dBV', min: -10, max: 30, from: -135, to: 135, major: 10, minor: 2, danger: 23 },
];

const PALETTES = {
  paper: { bezelHi: '#ece5d6', bezelLo: '#9a917f', face: '#fbf6ea', tick: '#4d4a40', minor: '#aa9f8b', text: '#3c3a33', needle: '#b23a2a', cap: '#2e3b35', danger: '#dc8a70', muted: '#8b7664', glass: 'rgba(255,255,255,0.38)' },
  dark: { bezelHi: '#3d5447', bezelLo: '#0d1612', face: '#172620', tick: '#c6d6c9', minor: '#58705f', text: '#c0d5c4', needle: '#f08a5d', cap: '#91a995', danger: '#9c4c36', muted: '#748c7d', glass: 'rgba(255,255,255,0.07)' },
};
const COMPASS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const toRadians = degrees => (degrees - 90) * Math.PI / 180;
const wrap360 = degrees => ((degrees % 360) + 360) % 360;

export class Gauge {
  constructor(canvas, spec) {
    this.canvas = canvas; this.spec = spec; this.ctx = canvas.getContext('2d');
    this.width = 0; this.height = 0; this.shown = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.width = rect.width; this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr); this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  angleOf(value) {
    const { min, max, from, to, wrap } = this.spec;
    if (wrap) return wrap360(value);
    const clamped = Math.max(min, Math.min(max, value));
    return from + (to - from) * (clamped - min) / (max - min);
  }
  // Needle follows the reading with a short damping constant; azimuth turns the short way round.
  ease(target, seconds) {
    if (target === null || !Number.isFinite(target)) { this.shown = null; return; }
    if (this.shown === null) { this.shown = target; return; }
    let delta = target - this.shown;
    if (this.spec.wrap) delta = wrap360(delta + 180) - 180;
    this.shown += delta * (1 - Math.exp(-Math.max(0, seconds) / 0.12));
    if (this.spec.wrap) this.shown = wrap360(this.shown);
  }
  draw(target, seconds, style) {
    this.ease(target, seconds);
    const { ctx, spec, width, height } = this;
    if (!width || !height) return;
    const palette = PALETTES[style] || PALETTES.paper;
    const cx = width / 2, cy = height / 2, outer = Math.min(width, height) / 2 - 3, r = outer * 0.88;
    ctx.clearRect(0, 0, width, height);
    const bezel = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
    bezel.addColorStop(0, palette.bezelHi); bezel.addColorStop(1, palette.bezelLo);
    ctx.fillStyle = bezel; ctx.beginPath(); ctx.arc(cx, cy, outer, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = palette.face; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (spec.danger !== undefined) {
      ctx.strokeStyle = palette.danger; ctx.lineWidth = r * 0.07;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.83, toRadians(this.angleOf(spec.danger)), toRadians(this.angleOf(spec.max))); ctx.stroke();
    }
    const steps = Math.round((spec.max - spec.min) / spec.minor);
    const fontSize = Math.max(8, Math.round(r * (spec.wrap ? 0.12 : 0.14)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Small dials label every k-th major tick so numbers never collide; a compass keeps N/E/S/W.
    const majorGap = r * 0.58 * Math.abs(spec.to - spec.from) / (spec.max - spec.min) * spec.major * Math.PI / 180;
    let stride = 1;
    while (majorGap * stride < fontSize * 2.6 || (spec.wrap && 90 % (spec.major * stride))) stride++;
    for (let step = 0; step <= steps; step++) {
      const value = spec.min + step * spec.minor;
      if (spec.wrap && value >= spec.max) break;
      const major = Math.abs(value / spec.major - Math.round(value / spec.major)) < 1e-9;
      const angle = toRadians(this.angleOf(value)), cos = Math.cos(angle), sin = Math.sin(angle);
      const inner = r * (major ? 0.72 : 0.8);
      ctx.strokeStyle = major ? palette.tick : palette.minor; ctx.lineWidth = major ? Math.max(1.2, r * 0.02) : 0.8;
      ctx.beginPath(); ctx.moveTo(cx + cos * inner, cy + sin * inner); ctx.lineTo(cx + cos * r * 0.88, cy + sin * r * 0.88); ctx.stroke();
      if (major && Math.round((value - spec.min) / spec.major) % stride === 0) {
        const label = spec.wrap && COMPASS[value] ? COMPASS[value] : String(value);
        ctx.fillStyle = palette.text; ctx.font = (spec.wrap && COMPASS[value] ? '600 ' : '') + fontSize + 'px monospace';
        ctx.fillText(label, cx + cos * r * 0.58, cy + sin * r * 0.58);
      }
    }
    ctx.fillStyle = palette.muted; ctx.font = Math.max(7, Math.round(r * 0.09)) + 'px monospace';
    // The caption under each dial names it; tiny faces skip the printed title and unit.
    if (r >= 70) { ctx.fillText(spec.title, cx, cy - r * 0.27); if (!spec.wrap) ctx.fillText(spec.unit, cx, cy + r * 0.4); }
    if (this.shown === null) {
      ctx.fillStyle = palette.muted; ctx.fillText('NO DATA', cx, cy + r * 0.14);
    } else {
      const angle = toRadians(this.angleOf(this.shown)), cos = Math.cos(angle), sin = Math.sin(angle);
      const base = r * 0.035, tip = r * 0.8, tail = r * 0.2;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = r * 0.04; ctx.shadowOffsetY = r * 0.015;
      ctx.fillStyle = palette.needle; ctx.beginPath();
      ctx.moveTo(cx + cos * tip, cy + sin * tip);
      ctx.lineTo(cx - sin * base, cy + cos * base);
      ctx.lineTo(cx - cos * tail, cy - sin * tail);
      ctx.lineTo(cx + sin * base, cy - cos * base);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = palette.cap; ctx.beginPath(); ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2); ctx.fill();
    const glass = ctx.createLinearGradient(cx, cy - r * 0.9, cx, cy - r * 0.45);
    glass.addColorStop(0, palette.glass); glass.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glass; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.45, r * 0.75, r * 0.45, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(degrees) { return POINTS[Math.round(wrap360(degrees) / 45) % 8]; }
