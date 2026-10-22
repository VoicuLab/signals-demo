'use strict';

// Every displayed reading and exported row comes from the same simulated samples.
const $ = id => document.getElementById(id);
const RATE = 200;
const CAPACITY = RATE * 120;
const channels = [
  { name: 'VOLTAGE', unit: 'V', color: '#44d5ac', max: 20, min: -20, key: 'v' },
  { name: 'CURRENT', unit: 'A', color: '#e9bb72', max: 1, min: -1, key: 'i' },
  { name: 'POWER', unit: 'W', color: '#b3aaff', max: 20, min: 0, key: 'p' },
];
const state = { waveform: 'sine', frequency: 2, amplitude: 12, noise: 0, window: 10, enabled: [true, true, true], paused: false, time: 0, phase: 0 };
const buffer = new Array(CAPACITY);
let head = 0, count = 0, total = 0, accumulator = 0, previousFrame = performance.now(), previousMetrics = 0;
const canvas = $('chart');
const ctx = canvas.getContext('2d');
let width = 0, height = 0;

function sampleAt(index) { return buffer[(head - count + index + CAPACITY) % CAPACITY]; }
function appendSample() {
  state.time += 1 / RATE;
  state.phase = (state.phase + state.frequency / RATE) % 1;
  const phase = state.phase;
  let wave;
  switch (state.waveform) {
    case 'square': wave = phase < .5 ? 1 : -1; break;
    case 'triangle': wave = 1 - 4 * Math.abs(phase - .5); break;
    case 'sawtooth': wave = phase * 2 - 1; break;
    default: wave = Math.sin(phase * 2 * Math.PI);
  }
  // The source is limited to the recorder's stated ±20 V range.
  const v = Math.max(-20, Math.min(20, state.amplitude * (wave + (Math.random() * 2 - 1) * state.noise / 100)));
  const i = v / 20;
  buffer[head] = { t: state.time, v, i, p: v * i };
  head = (head + 1) % CAPACITY;
  count = Math.min(count + 1, CAPACITY);
  total++;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width; height = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
new ResizeObserver(resize).observe(canvas);

function draw() {
  if (!width || !height) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#172620'; ctx.fillRect(0, 0, width, height);
  const left = width < 600 ? 51 : 65, right = width - 20, top = 12, bottom = height - 28;
  const plotWidth = right - left;
  const active = channels.map((ch, index) => ({ ...ch, index })).filter(ch => state.enabled[ch.index]);
  $('chart-empty').hidden = !!active.length;
  const start = state.time - state.window;
  const tick = state.window / 5;
  ctx.font = '9px monospace';
  for (let t = Math.ceil(start / (tick / 5)) * (tick / 5); t <= state.time + 1e-6; t += tick / 5) {
    const x = left + (t - start) / state.window * plotWidth;
    const major = Math.abs(t / tick - Math.round(t / tick)) < .00001;
    ctx.strokeStyle = major ? '#33453a' : '#22372c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    if (major && t >= 0) { ctx.fillStyle = '#708b79'; ctx.textAlign = 'center'; ctx.fillText(`${t.toFixed(tick < 1 ? 1 : 0)}s`, x, height - 9); }
  }
  active.forEach((ch, row) => {
    const laneHeight = (bottom - top) / active.length;
    const yTop = top + row * laneHeight + 14;
    const yBottom = top + (row + 1) * laneHeight - 14;
    const y = value => yBottom - (value - ch.min) / (ch.max - ch.min) * (yBottom - yTop);
    ctx.textAlign = 'right'; ctx.font = '9px monospace';
    for (let j = 0; j <= 4; j++) {
      const value = ch.min + (ch.max - ch.min) * j / 4;
      ctx.strokeStyle = j === 2 ? '#344a3b' : '#253b2e';
      ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(right, y(value)); ctx.stroke();
      if (j % 2 === 0) { ctx.fillStyle = '#789381'; ctx.fillText(`${Number(value.toFixed(2))}`, left - 9, y(value) + 3); }
    }
    ctx.fillStyle = ch.color; ctx.textAlign = 'left'; ctx.font = '8px monospace';
    ctx.fillText(ch.unit, 12, top + row * laneHeight + 12);
    ctx.save(); ctx.beginPath(); ctx.rect(left, yTop - 3, plotWidth, yBottom - yTop + 6); ctx.clip();
    ctx.strokeStyle = ch.color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.shadowColor = ch.color; ctx.shadowBlur = 3;
    ctx.beginPath(); let begun = false;
    const first = Math.max(0, count - Math.ceil(state.window * RATE) - 1);
    for (let j = first; j < count; j++) {
      const sample = sampleAt(j);
      const x = left + (sample.t - start) / state.window * plotWidth;
      if (!begun) { ctx.moveTo(x, y(sample[ch.key])); begun = true; }
      else ctx.lineTo(x, y(sample[ch.key]));
    }
    ctx.stroke(); ctx.restore();
  });
  ctx.strokeStyle = '#55735e'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(right, bottom); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#9ab79e'; ctx.beginPath(); ctx.moveTo(right - 3, 3); ctx.lineTo(right + 3, 3); ctx.lineTo(right, 8); ctx.fill();
}

function updateMetrics() {
  let sumV2 = 0, sumI2 = 0, sumPower = 0;
  // Use complete periods where possible; measurements are taken over at most five seconds.
  const desired = Math.max(1, Math.round(Math.min(5, Math.ceil(state.frequency) / state.frequency) * RATE));
  const measured = Math.min(count, desired);
  for (let j = count - measured; j < count; j++) {
    const s = sampleAt(j); sumV2 += s.v * s.v; sumI2 += s.i * s.i; sumPower += s.p;
  }
  $('voltage').textContent = measured ? Math.sqrt(sumV2 / measured).toFixed(2) : '—';
  $('current').textContent = measured ? Math.sqrt(sumI2 / measured).toFixed(3) : '—';
  $('power').textContent = measured ? (sumPower / measured).toFixed(2) : '—';
  $('samples').textContent = total.toLocaleString();
  const minutes = Math.floor(state.time / 60), seconds = state.time % 60;
  $('elapsed').textContent = `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function setPaused(paused) {
  state.paused = paused;
  $('pause').textContent = paused ? '▶ Resume' : 'Ⅱ Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
  $('state-badge').textContent = paused ? 'Ⅱ PAUSED' : '● RUNNING';
  $('state-badge').classList.toggle('paused', paused);
  $('stream-state').textContent = paused ? 'Recording paused' : 'Simulated stream';
  $('stream-dot').style.background = paused ? '#c19b62' : '';
  previousFrame = performance.now();
}
$('pause').addEventListener('click', () => setPaused(!state.paused));
$('window').addEventListener('change', event => { state.window = Number(event.target.value); draw(); });
for (const name of ['frequency', 'amplitude', 'noise']) {
  $(name).addEventListener('input', event => { state[name] = Number(event.target.value); updateControls(); });
}
document.querySelectorAll('[data-wave]').forEach(button => button.addEventListener('click', () => {
  state.waveform = button.dataset.wave; updateControls();
}));
document.querySelectorAll('[data-channel]').forEach(input => input.addEventListener('change', () => {
  state.enabled[Number(input.dataset.channel)] = input.checked; draw();
}));
function updateControls() {
  $('frequency-output').textContent = `${state.frequency.toFixed(2)} Hz`;
  $('frequency-value').textContent = state.frequency.toFixed(2);
  $('period').textContent = `Period ${(1000 / state.frequency).toFixed(0)} ms`;
  $('amplitude-output').textContent = `${state.amplitude.toFixed(1)} V`;
  $('noise-output').textContent = `${state.noise}%`;
  $('voltage-detail').textContent = `${state.waveform[0].toUpperCase() + state.waveform.slice(1)} wave`;
  document.querySelectorAll('[data-wave]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wave === state.waveform)));
}
$('reset').addEventListener('click', () => {
  Object.assign(state, { waveform: 'sine', frequency: 2, amplitude: 12, noise: 0, window: 10, enabled: [true, true, true], time: 0, phase: 0 });
  head = count = total = accumulator = 0;
  for (const name of ['frequency', 'amplitude', 'noise', 'window']) $(name).value = state[name];
  document.querySelectorAll('[data-channel]').forEach(input => { input.checked = true; });
  setPaused(false); updateControls(); updateMetrics(); draw();
  $('notice').textContent = 'Source and recording reset.';
});
$('export').addEventListener('click', () => {
  if (!count) { $('notice').textContent = 'Start recording before exporting.'; return; }
  const rows = ['time_s,voltage_V,current_A,power_W'];
  for (let j = 0; j < count; j++) { const s = sampleAt(j); rows.push([s.t, s.v, s.i, s.p].map(n => n.toFixed(6)).join(',')); }
  const url = URL.createObjectURL(new Blob([rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `signal-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('notice').textContent = `Exported ${count.toLocaleString()} samples · ${(count / RATE).toFixed(1)} s (latest 120 s retained).`;
});

// Hidden tabs pause sampling, preventing a fabricated catch-up recording on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !state.paused) { setPaused(true); $('notice').textContent = 'Paused while the tab is hidden. Resume when ready.'; }
  previousFrame = performance.now();
});
function frame(now) {
  if (!state.paused) {
    accumulator += (now - previousFrame) / 1000;
    // Large rendering gaps preserve only the bounded recording buffer.
    if (accumulator > 120) { const skipped = Math.floor((accumulator - 120) * RATE); state.time += skipped / RATE; state.phase = (state.phase + skipped * state.frequency / RATE) % 1; total += skipped; accumulator -= skipped / RATE; }
    while (accumulator >= 1 / RATE) { appendSample(); accumulator -= 1 / RATE; }
  }
  previousFrame = now;
  draw();
  if (now - previousMetrics > 100) { updateMetrics(); previousMetrics = now; }
  requestAnimationFrame(frame);
}
$('clock').textContent = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
updateControls(); requestAnimationFrame(frame);
