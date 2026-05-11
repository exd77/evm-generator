import { readFileSync } from 'node:fs';

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function csvLine(values) {
  return values.map(csvEscape).join(',');
}

export function rowsToCsv(rows, headers) {
  const head = headers ?? Object.keys(rows[0] ?? {});
  const lines = [head.join(',')];
  for (const row of rows) {
    lines.push(head.map(h => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsvFile(path) {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return { headers: [], rows: [] };
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
  return { headers, rows };
}

export function loadColumn(path, column) {
  const { headers, rows } = parseCsvFile(path);
  if (!headers.includes(column)) throw new Error(`CSV ${path} does not have column "${column}"`);
  return rows.map(r => r[column]).filter(Boolean);
}
