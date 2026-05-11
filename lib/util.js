import { existsSync, mkdirSync, writeFileSync, readSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

export function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

export function err(obj) {
  console.error(JSON.stringify(obj, null, 2));
}

export function getArgs(argv) {
  const args = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    // Support both --key value and --key=value forms
    const eqIdx = tok.indexOf('=');
    if (eqIdx !== -1) {
      args[tok.slice(2, eqIdx)] = tok.slice(eqIdx + 1);
      continue;
    }
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags.add(key);
    } else {
      args[key] = next;
      i++;
    }
  }
  return { args, flags };
}

export function pickArg(args, flags, key, fallback = undefined) {
  if (key in args) return args[key];
  if (flags.has(key)) return true;
  return fallback;
}

export function requireArg(args, key, ctx) {
  if (!(key in args) || args[key] === '' || args[key] === undefined) {
    die(`${ctx} butuh --${key}`);
  }
  return args[key];
}

export function writeFileSecure(path, data, mode = 0o600) {
  const abs = resolve(path);
  const dir = dirname(abs);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(abs, data, { mode });
  return abs;
}

export function shortHash(s, n = 6) {
  if (!s) return '';
  return `${s.slice(0, n)}...${s.slice(-4)}`;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function withRetry(fn, { retries = 0, baseMs = 1000, label = 'op' } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === retries) break;
      const wait = baseMs * 2 ** i;
      console.error(`[${label}] retry ${i + 1}/${retries} in ${wait}ms: ${e.shortMessage || e.message}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function pLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function readPasswordFromStdinSync(prompt = 'Password: ') {
  process.stderr.write(prompt);
  const buf = Buffer.alloc(1);
  let pwd = '';
  const fd = 0;
  while (true) {
    let n;
    try {
      n = readSync(fd, buf, 0, 1, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      throw e;
    }
    if (n === 0) break;
    const ch = buf.toString('utf8', 0, 1);
    if (ch === '\n' || ch === '\r') break;
    pwd += ch;
  }
  process.stderr.write('\n');
  return pwd;
}
