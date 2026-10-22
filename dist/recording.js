/** Parse CSV records without evaluating cells. Locations are physical line numbers. */
function* csvRecords(text) {
  let cells = [], cell = '', quoted = false, closed = false;
  let line = 1, rowLine = 1, touched = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else {
        if (character === '\n') line++;
        cell += character;
      }
      continue;
    }
    if (closed && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error(`Row ${line}: unexpected text after a closing quote.`);
    }
    if (character === '"') {
      if (cell.length || closed) throw new Error(`Row ${line}: a quote must begin a CSV cell.`);
      quoted = true; touched = true;
    } else if (character === ',') {
      cells.push(cell); cell = ''; closed = false; touched = true;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r') {
        if (text[index + 1] !== '\n') throw new Error(`Row ${line}: use LF or CRLF line endings.`);
        index++;
      }
      cells.push(cell);
      yield { cells, line: rowLine };
      line++; rowLine = line; cells = []; cell = ''; closed = false; touched = false;
    } else {
      cell += character; touched = true;
    }
  }
  if (quoted) throw new Error(`Row ${rowLine}: quoted cell was not closed.`);
  if (touched || cells.length || cell.length || closed) {
    cells.push(cell);
    yield { cells, line: rowLine };
  }
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function numberCell(value, header, line) {
  const text = value.trim();
  if (!text || !DECIMAL.test(text)) throw new Error(`Row ${line}: ${header} must contain a numeric value.`);
  const result = Number(text);
  if (!Number.isFinite(result)) throw new Error(`Row ${line}: ${header} must be finite.`);
  if (Math.abs(result) > 1e100) throw new Error(`Row ${line}: ${header} exceeds the recorder's numeric range.`);
  return result;
}

/**
 * Original timestamps are retained. Missing current uses a 20-ohm load;
 * missing power is derived from voltage times current. These are explicit
 * derived values, not claims about the source recording or its instrumentation.
 */
export function parseRecordingCsv(text, { capacity = 24000 } = {}) {
  if (typeof text !== 'string') throw new Error('Recording CSV must be text.');
  if (!Number.isSafeInteger(capacity) || capacity < 2) throw new Error('Recording capacity must be an integer of at least 2.');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  const allowed = new Set(['time_s', 'voltage_V', 'current_A', 'power_W']);
  let headers, timeIndex, voltageIndex, currentIndex, powerIndex;
  let sourceRows = 0, previousTime = -Infinity;
  const retained = [];
  for (const record of csvRecords(text)) {
    const { cells, line } = record;
    if (!headers) {
      headers = cells;
      if (new Set(headers).size !== headers.length) throw new Error(`Row ${line}: duplicate CSV headers are not allowed.`);
      for (const header of headers) {
        if (!allowed.has(header)) throw new Error(`Row ${line}: unsupported header ${JSON.stringify(header)}. Use time_s, voltage_V, and optionally current_A or power_W.`);
      }
      timeIndex = headers.indexOf('time_s'); voltageIndex = headers.indexOf('voltage_V');
      currentIndex = headers.indexOf('current_A'); powerIndex = headers.indexOf('power_W');
      if (timeIndex < 0 || voltageIndex < 0) throw new Error(`Row ${line}: time_s and voltage_V headers are required.`);
      continue;
    }
    if (cells.length !== headers.length) throw new Error(`Row ${line}: expected ${headers.length} cells, received ${cells.length}.`);
    const t = numberCell(cells[timeIndex], 'time_s', line);
    const v = numberCell(cells[voltageIndex], 'voltage_V', line);
    if (t < 0) throw new Error(`Row ${line}: time_s must be nonnegative.`);
    if (t > 1e12) throw new Error(`Row ${line}: time_s exceeds the supported timestamp range (0–1e12 seconds).`);
    if (t <= previousTime) throw new Error(`Row ${line}: time_s must strictly increase; duplicate or decreasing timestamps are not allowed.`);
    const i = currentIndex >= 0 ? numberCell(cells[currentIndex], 'current_A', line) : v / 20;
    const p = powerIndex >= 0 ? numberCell(cells[powerIndex], 'power_W', line) : v * i;
    if (!Number.isFinite(i) || !Number.isFinite(p)) throw new Error(`Row ${line}: derived current or power is outside the finite numeric range.`);
    retained[sourceRows % capacity] = { t, v, i, p };
    sourceRows++; previousTime = t;
  }
  if (!headers) throw new Error('Row 1: the CSV header is missing.');
  if (sourceRows < 2) throw new Error('Row 2: a recording must contain at least two data samples.');
  const trimmed = sourceRows > capacity;
  const offset = trimmed ? sourceRows % capacity : 0;
  const samples = offset ? retained.slice(offset).concat(retained.slice(0, offset)) : retained;
  return { samples, providedCurrent: currentIndex >= 0, providedPower: powerIndex >= 0, sourceRows, trimmed };
}
