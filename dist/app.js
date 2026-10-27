import { InstrumentSource, SAMPLE_RATE as RATE, measuredMetrics } from './signal-model.js';
import { parseRecordingCsv } from './recording.js';
import { GAUGES, Gauge, compassPoint } from './gauges.js';

const $ = id => document.getElementById(id);
const CAPACITY = RATE * 120;
const channels = [
  { name: 'VOLTAGE', unit: 'V', color: '#44d5ac', paper: '#215f4b', range: 20, key: 'v', scale: 'scale-voltage' },
  { name: 'CURRENT', unit: 'A', color: '#e9bb72', paper: '#996326', range: 1, key: 'i', scale: 'scale-current' },
  { name: 'POWER', unit: 'W', color: '#b3aaff', paper: '#6a518e', range: 20, key: 'p', scale: 'scale-power' },
];
const state = { mode: 'instrument', waveform: 'sine', frequency: 2, amplitude: 12, noise: 3, drift: 35, window: 10, style: 'paper', vertical: 'auto', enabled: [true, true, true], paused: false, time: 0 };
const generator = new InstrumentSource();
const buffer = new Array(CAPACITY);
let head = 0, count = 0, total = 0, accumulator = 0, previousFrame = performance.now(), previousMetrics = 0;
let imported = null, importedCursor = 0, importRevision = 0, hoverTime = null;
const canvas = $('chart'), ctx = canvas.getContext('2d');
let width = 0, height = 0;
const cursorReading = document.createElement('output');
cursorReading.className = 'cursor-reading'; cursorReading.id = 'cursor-reading'; cursorReading.hidden = true;
canvas.parentElement.append(cursorReading);
const gauges = GAUGES.map(spec => new Gauge(document.querySelector(`[data-gauge="${spec.key}"]`), spec));
let signalLevel = null;

function sampleAt(index) { return buffer[(head - count + index + CAPACITY) % CAPACITY]; }
function append(sample) {
  buffer[head] = sample; head = (head + 1) % CAPACITY;
  count = Math.min(count + 1, CAPACITY); total++;
}
function clearRecording() { head = count = total = accumulator = 0; hoverTime = null; cursorReading.hidden = true; }
function samplesSince(start) {
  const rows = []; let preceding = null;
  for (let index = 0; index < count; index++) {
    const sample = sampleAt(index);
    if (sample.t >= start) { if (!rows.length && preceding) rows.push(preceding); rows.push(sample); }
    preceding = sample;
  }
  if (!rows.length && preceding) rows.push(preceding);
  return rows;
}
function seedSimulation() {
  clearRecording(); generator.reset();
  // Synthetic history gives an immediate view; it is never labeled as captured data.
  for (let n = 0; n < RATE * state.window; n++) { const sample = generator.step(state); append(sample); state.time = sample.t; }
}
function short(value) {
  if (!Number.isFinite(value)) return '—';
  return Number(value.toPrecision(4)).toString();
}
function notify(text, error = false) {
  $('notice').textContent = text; $('notice').classList.toggle('notice-error', error);
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}
function niceRange(peak) {
  if (peak < 1e-12) return 1;
  const exponent = 10 ** Math.floor(Math.log10(peak));
  const normalized = peak / exponent;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * exponent;
}
function resize() {
  const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
}
new ResizeObserver(resize).observe(canvas);

function draw() {
  if (!width || !height) return;
  const paper = state.style === 'paper';
  const palette = paper ? { bg: '#faf4e7', minor: '#ecdfd1', major: '#d2bdab', zero: '#b9a28d', text: '#8b7664' } : { bg: '#172620', minor: '#22372c', major: '#334b3c', zero: '#57715d', text: '#91a995' };
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, width, height);
  const left = width < 600 ? 47 : 64, right = width - (width < 500 ? 39 : 67), top = 15, bottom = height - 30;
  const plotWidth = right - left;
  const active = channels.map((ch, index) => ({ ...ch, index })).filter(ch => state.enabled[ch.index]);
  $('chart-empty').hidden = !!active.length;
  const start = state.time - state.window, tick = state.window / 5;
  const visible = samplesSince(start - 1 / RATE);
  const ranges = channels.map(ch => state.vertical === 'fixed' ? ch.range : niceRange(Math.max(0, ...visible.map(sample => Math.abs(sample[ch.key]))) * 1.1));
  channels.forEach((ch, index) => { $(ch.scale).textContent = '±' + short(ranges[index]) + ' ' + ch.unit; });
  ctx.font = '9px monospace'; ctx.lineWidth = 1;
  const firstTick = Math.ceil(start / (tick / 5));
  for (let index = 0; index <= 25; index++) {
    const t = (firstTick + index) * (tick / 5);
    if (t > state.time + 1e-6) break;
    const x = left + (t - start) / state.window * plotWidth;
    const major = Math.abs(t / tick - Math.round(t / tick)) < 0.00001;
    ctx.strokeStyle = major ? palette.major : palette.minor;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    if (major && t >= 0) { ctx.fillStyle = palette.text; ctx.textAlign = 'center'; ctx.fillText(short(t) + 's', x, height - 9); }
  }
  active.forEach((ch, row) => {
    const laneHeight = (bottom - top) / active.length;
    const yTop = top + row * laneHeight + 15, yBottom = top + (row + 1) * laneHeight - 15;
    const range = ranges[ch.index], color = paper ? ch.paper : ch.color;
    const y = value => yBottom - (value + range) / (2 * range) * (yBottom - yTop);
    ctx.textAlign = 'right'; ctx.font = '9px monospace';
    for (let j = 0; j <= 8; j++) {
      const value = -range + 2 * range * j / 8;
      ctx.strokeStyle = j === 4 ? palette.zero : j % 2 ? palette.minor : palette.major;
      ctx.lineWidth = j === 4 ? 1.2 : 0.7;
      ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(right, y(value)); ctx.stroke();
      if (j % 4 === 0) { ctx.fillStyle = palette.text; ctx.fillText(short(value), left - 8, y(value) + 3); }
    }
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.font = '8px monospace';
    ctx.fillText(ch.unit, 10, top + row * laneHeight + 11);
    ctx.save(); ctx.beginPath(); ctx.rect(left, yTop - 3, plotWidth, yBottom - yTop + 6); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = paper ? 1.05 : 1.4; ctx.lineJoin = 'round';
    ctx.beginPath(); let begun = false;
    for (const sample of visible) {
      const x = left + (sample.t - start) / state.window * plotWidth;
      if (!begun) { ctx.moveTo(x, y(sample[ch.key])); begun = true; } else ctx.lineTo(x, y(sample[ch.key]));
    }
    ctx.stroke(); ctx.restore();
    if (count) {
      const last = sampleAt(count - 1);
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.font = '8px monospace';
      ctx.fillText(short(last[ch.key]), right + 5, Math.max(yTop + 7, Math.min(yBottom, y(last[ch.key]) + 3)));
    }
  });
  ctx.lineWidth = 1; ctx.strokeStyle = palette.zero;
  ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(right, bottom); ctx.stroke(); ctx.setLineDash([]);
  if (hoverTime !== null && visible.length) {
    let nearest = visible[0];
    for (const sample of visible) if (Math.abs(sample.t - hoverTime) < Math.abs(nearest.t - hoverTime)) nearest = sample;
    const x = left + (nearest.t - start) / state.window * plotWidth;
    ctx.strokeStyle = palette.text; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
    cursorReading.hidden = false; cursorReading.textContent = short(nearest.t) + ' s · ' + short(nearest.v) + ' V · ' + short(nearest.i) + ' A · ' + short(nearest.p) + ' W'
      + (nearest.alt != null ? ' · alt ' + nearest.alt.toFixed(1) + '°' : '') + (nearest.az != null ? ' · az ' + nearest.az.toFixed(1) + '°' : '');
  }
}
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect(), left = width < 600 ? 47 : 64, right = width - (width < 500 ? 39 : 67);
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - left) / (right - left)));
  hoverTime = state.time - state.window + fraction * state.window; draw();
});
canvas.addEventListener('pointerleave', () => { hoverTime = null; cursorReading.hidden = true; draw(); });

function updateMetrics() {
  const metrics = measuredMetrics(samplesSince(state.time - 5.1));
  $('voltage').textContent = metrics ? metrics.voltage.toFixed(2) : '—';
  $('current').textContent = metrics ? metrics.current.toFixed(3) : '—';
  $('power').textContent = metrics ? metrics.power.toFixed(2) : '—';
  signalLevel = metrics ? 20 * Math.log10(Math.max(metrics.voltage, 1e-6)) : null;
  const last = count ? sampleAt(count - 1) : null;
  $('gauge-alt').textContent = last?.alt != null ? last.alt.toFixed(1) + '°' : 'No data';
  $('gauge-az').textContent = last?.az != null ? last.az.toFixed(1) + '° ' + compassPoint(last.az) : 'No data';
  $('gauge-level').textContent = signalLevel !== null ? signalLevel.toFixed(1) + ' dBV' : '—';
  $('samples').textContent = total.toLocaleString();
  const minutes = Math.floor(state.time / 60), seconds = state.time % 60;
  $('elapsed').textContent = String(minutes).padStart(2, '0') + ':' + seconds.toFixed(2).padStart(5, '0');
}
function setPaused(paused) {
  state.paused = paused;
  const atEnd = state.mode === 'csv' && importedCursor >= (imported?.samples.length || 0);
  $('pause').textContent = paused ? (atEnd ? '▶ Replay' : '▶ Resume') : 'Ⅱ Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
  $('state-badge').textContent = paused ? 'Ⅱ PAUSED' : '● RUNNING';
  $('state-badge').classList.toggle('paused', paused);
  $('stream-state').textContent = paused ? 'Recording paused' : state.mode === 'csv' ? 'CSV replay · original timing' : 'Simulated instrument stream';
  $('stream-dot').style.background = paused ? '#c19b62' : '';
  previousFrame = performance.now();
}
function showImported() {
  clearRecording(); for (const sample of imported.samples) append(sample);
  state.time = imported.samples[imported.samples.length - 1].t; importedCursor = imported.samples.length;
  setPaused(true); updateControls(); updateMetrics(); draw();
}
$('pause').addEventListener('click', () => {
  if (state.paused && state.mode === 'csv' && importedCursor >= imported.samples.length) {
    clearRecording(); importedCursor = 1; append(imported.samples[0]); state.time = imported.samples[0].t;
  }
  setPaused(!state.paused);
});
$('window').addEventListener('change', event => { state.window = Number(event.target.value); draw(); });
$('chart-style').addEventListener('change', event => { state.style = event.target.value; document.body.dataset.chartStyle = state.style; draw(); });
$('vertical-scale').addEventListener('change', event => { state.vertical = event.target.value; draw(); });
for (const name of ['frequency', 'amplitude', 'noise', 'drift']) {
  $(name).addEventListener('input', event => { state[name] = Number(event.target.value); updateControls(); });
}
document.querySelectorAll('[data-wave]').forEach(button => button.addEventListener('click', () => { state.waveform = button.dataset.wave; updateControls(); }));
document.querySelectorAll('[data-channel]').forEach(input => input.addEventListener('change', () => { state.enabled[Number(input.dataset.channel)] = input.checked; draw(); }));
$('source-mode').addEventListener('change', event => {
  importRevision++; state.mode = event.target.value;
  if (state.mode === 'csv') showImported(); else { seedSimulation(); setPaused(false); updateControls(); updateMetrics(); draw(); }
  notify(state.mode === 'csv' ? 'Opened imported samples. Replay preserves their original timestamps.' : 'Synthetic source selected. Recording contains simulated samples.');
});
$('transient').addEventListener('click', () => {
  generator.trigger(); notify(state.paused ? 'Transient armed. Resume to record its response.' : 'Transient injected into the synthetic source.');
});
function updateControls() {
  const csv = state.mode === 'csv';
  $('data-mode-label').textContent = csv ? 'LOCAL CSV RECORDING' : 'LOCAL SIMULATION';
  document.querySelector('.grid-key').textContent = csv ? 'Original file timestamps · independent scales' : '200 samples / sec · independent scales';
  $('frequency-output').textContent = state.frequency.toFixed(2) + ' Hz';
  $('frequency-value').textContent = csv ? '—' : state.frequency.toFixed(2);
  $('frequency-title').textContent = csv ? 'FREQUENCY' : 'CARRIER';
  $('frequency-kind').textContent = csv ? 'NOT ESTIMATED' : 'SETPOINT';
  $('period').textContent = csv ? 'No frequency inferred from file' : 'Carrier period ' + (1000 / state.frequency).toFixed(0) + ' ms';
  $('amplitude-output').textContent = state.amplitude.toFixed(1) + ' V';
  $('noise-output').textContent = state.noise + '%'; $('drift-output').textContent = state.drift + '%';
  $('voltage-detail').textContent = csv ? 'Local CSV · original samples' : state.mode === 'instrument' ? 'Changing envelope + transient peaks' : state.waveform[0].toUpperCase() + state.waveform.slice(1) + ' wave';
  const derived = csv ? [!imported.providedCurrent ? 'current derived as V/20 Ω' : 'current from file', !imported.providedPower ? 'power derived as V×I' : 'power from file'].join('; ') : '';
  $('current-detail').textContent = csv ? (imported.providedCurrent ? 'Current samples from CSV' : 'Derived · 20 Ω assumption') : state.mode === 'instrument' ? '20 Ω + 0.7 H RL response' : '20 Ω resistive load';
  $('recording-source').textContent = csv ? 'Imported CSV · ' + imported.name : state.mode === 'instrument' ? 'Simulated instrument trace' : 'Ideal source · simulated';
  $('source-description').textContent = csv ? 'Original numeric timestamps and voltages retained; ' + derived + '. Replay uses file timing. Imported files are not authenticated measurements.' : state.mode === 'instrument' ? 'Synthetic electrical trace: changing envelope, baseline elevation, harmonics and settling transient peaks. Current follows a 20 Ω / 0.7 H RL load; instantaneous power can go negative as stored inductive energy returns.' : 'Ideal periodic generator with a 20 Ω resistor. Every value is simulated.';
  const modelNote = document.querySelector('.channels .note');
  modelNote.textContent = csv ? 'Local file only: ' + derived + '. No instrument is connected.' : state.mode === 'instrument' ? 'Synthetic RL model: L di/dt + R i = V. Baseline drift and decaying transients are simulated; this is not a measured recording.' : 'Virtual 20 Ω resistor: I = V/R, P = V×I. No instrument is connected.';
  const currentRow = document.querySelector('[data-channel="1"]').closest('label').querySelector('small');
  currentRow.textContent = csv ? (imported.providedCurrent ? 'Original CSV values · amperes' : 'Derived I = V/20 · amperes') : state.mode === 'instrument' ? 'Lagging RL response · amperes' : 'I = V/R · amperes';
  document.querySelector('.channels .small-pill').textContent = csv ? 'IMPORTED CSV' : 'SIMULATED';
  const pointingInFile = csv && (imported.providedAltitude || imported.providedAzimuth);
  $('gauge-source').textContent = !csv ? 'SIMULATED POINTING' : pointingInFile ? 'IMPORTED CSV' : 'CSV · NO POINTING';
  document.querySelectorAll('[data-wave]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.wave === state.waveform)); b.disabled = csv; });
  for (const name of ['frequency', 'amplitude', 'noise']) $(name).disabled = csv;
  $('drift').disabled = csv || state.mode !== 'instrument'; $('transient').disabled = csv || state.mode !== 'instrument';
}
$('import-recording').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  const revision = ++importRevision;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a CSV smaller than 10 MiB.');
    const parsed = parseRecordingCsv(await file.text(), { capacity: CAPACITY });
    if (revision !== importRevision) return;
    imported = { ...parsed, name: file.name }; state.mode = 'csv';
    if (!$('source-mode').querySelector('option[value="csv"]')) {
      const option = document.createElement('option'); option.value = 'csv'; option.textContent = 'Imported CSV recording'; $('source-mode').append(option);
    }
    $('source-mode').value = 'csv'; showImported();
    notify('Imported ' + parsed.samples.length.toLocaleString() + ' original samples' + (parsed.trimmed ? ' (latest 24,000 rows retained)' : '') + '. Press Replay to stream them.');
  } catch (reason) { if (revision === importRevision) notify('CSV not opened: ' + reason.message + ' Your current recording is unchanged.', true); }
  finally { event.target.value = ''; }
});
$('reset').addEventListener('click', () => {
  importRevision++;
  Object.assign(state, { mode: 'instrument', waveform: 'sine', frequency: 2, amplitude: 12, noise: 3, drift: 35, window: 10, style: 'paper', vertical: 'auto', enabled: [true, true, true] });
  for (const name of ['frequency', 'amplitude', 'noise', 'drift', 'window']) $(name).value = state[name];
  $('source-mode').value = 'instrument'; $('chart-style').value = 'paper'; $('vertical-scale').value = 'auto'; document.body.dataset.chartStyle = 'paper';
  document.querySelectorAll('[data-channel]').forEach(input => { input.checked = true; });
  seedSimulation(); setPaused(false); updateControls(); updateMetrics(); draw(); notify('Synthetic instrument source and recording reset.');
});
$('export').addEventListener('click', () => {
  if (!count) { notify('Start recording before exporting.'); return; }
  const columns = [['time_s', 't'], ['voltage_V', 'v'], ['current_A', 'i'], ['power_W', 'p'], ['altitude_deg', 'alt'], ['azimuth_deg', 'az']]
    .filter(([, key]) => sampleAt(0)[key] != null);
  const rows = [columns.map(([header]) => header).join(',')];
  for (let j = 0; j < count; j++) { const s = sampleAt(j); rows.push(columns.map(([, key]) => s[key]).join(',')); }
  const url = URL.createObjectURL(new Blob([rows.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'signal-lab-' + (state.mode === 'csv' ? 'imported-' : 'simulated-') + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Exported ' + count.toLocaleString() + ' ' + (state.mode === 'csv' ? 'imported' : 'simulated') + ' samples with original timestamps.');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !state.paused) { setPaused(true); notify('Paused while the tab is hidden. Resume when ready.'); }
  previousFrame = performance.now();
});
function frame(now) {
  const delta = (now - previousFrame) / 1000;
  if (!state.paused) {
    if (state.mode === 'csv') {
      state.time = Math.min(imported.samples[imported.samples.length - 1].t, state.time + delta);
      while (importedCursor < imported.samples.length && imported.samples[importedCursor].t <= state.time) append(imported.samples[importedCursor++]);
      if (importedCursor === imported.samples.length) { setPaused(true); notify('CSV replay complete. Original samples retained for inspection or export.'); }
    } else {
      // The bounded simulation timeline never fabricates a measurement catch-up.
      accumulator = Math.min(120, accumulator + delta);
      while (accumulator >= 1 / RATE) { const sample = generator.step(state); append(sample); state.time = sample.t; accumulator -= 1 / RATE; }
    }
  }
  previousFrame = now; draw();
  const latest = count ? sampleAt(count - 1) : null;
  const readings = { alt: latest?.alt ?? null, az: latest?.az ?? null, level: signalLevel };
  gauges.forEach(gauge => gauge.draw(readings[gauge.spec.key], delta, state.style));
  if (now - previousMetrics > 100) { updateMetrics(); previousMetrics = now; }
  requestAnimationFrame(frame);
}
$('clock').textContent = new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
seedSimulation(); updateControls(); updateMetrics(); requestAnimationFrame(frame);
