import {
  Wallet,
  Contract,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  isAddress,
} from 'ethers';
import { buildProvider, buildFeeOverrides } from './provider.js';
import { loadManyPks } from './pk.js';
import { explorerTx } from './chains.js';
import { rowsToCsv } from './csv.js';
import { die, out, pLimit, withRetry, writeFileSecure } from './util.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
];

function logProgress(stream, line) {
  if (stream) stream.write(`${line}\n`);
  console.error(line);
}

async function openLog(args) {
  if (!args['log']) return null;
  const fs = await import('node:fs');
  const path = await import('node:path');
  const abs = path.resolve(args['log']);
  if (path.dirname(abs) && !fs.existsSync(path.dirname(abs))) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
  }
  const stream = fs.createWriteStream(abs, { flags: 'a', mode: 0o600 });
  return { stream, abs };
}

export async function batchSend(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pks = await loadManyPks(args, flags);
  if (!pks.length) die('no private keys provided');

  const type = args['type'] ?? 'native';
  let to = args['to'];
  const amount = args['amount'];
  if (!to) die('need --to (address or ENS)');
  if (!isAddress(to)) {
    if (typeof to === 'string' && to.endsWith('.eth')) {
      const resolved = await provider.resolveName(to);
      if (!resolved) die(`failed to resolve ENS ${to}`);
      to = resolved;
    } else die('--to address invalid');
  }
  if (!amount) die('need --amount');

  let token = null;
  let decimals = 18;
  let symbol = chain?.symbol ?? 'NATIVE';
  if (type === 'token') {
    if (!args['token'] || !isAddress(args['token'])) die('--type token requires --token');
    const c = new Contract(args['token'], ERC20_ABI, provider);
    decimals = args['decimals'] ? Number(args['decimals']) : Number(await c.decimals());
    symbol = await c.symbol().catch(() => 'TOKEN');
    token = args['token'];
  }

  const value = type === 'token' ? parseUnits(String(amount), decimals) : parseEther(String(amount));

  const concurrency = Number(args['concurrency'] ?? '1');
  const retries = Number(args['retries'] ?? '0');
  const log = await openLog(args);
  const stream = log?.stream ?? null;

  if (flags.has('dry-run')) {
    const checks = await pLimit(pks, Math.max(concurrency, 5), async (pk, i) => {
      const w = new Wallet(pk, provider);
      let bal;
      if (type === 'token') {
        const c = new Contract(token, ERC20_ABI, provider);
        bal = await c.balanceOf(w.address);
      } else {
        bal = await provider.getBalance(w.address);
      }
      const enough = bal >= value;
      return { index: i + 1, address: w.address, balance: type === 'token' ? formatUnits(bal, decimals) : formatEther(bal), enough };
    });
    out({
      ok: true,
      dryRun: true,
      type: `batch-${type}`,
      symbol,
      to,
      amount,
      count: pks.length,
      check: checks.map(c => c.value),
    });
    return;
  }

  const results = await pLimit(pks, concurrency, async (pk, i) => {
    return withRetry(async () => {
      const w = new Wallet(pk, provider);
      const overrides = await buildFeeOverrides(provider, args, flags);
      let txHash;
      if (type === 'token') {
        const c = new Contract(token, ERC20_ABI, w);
        const tx = await c.transfer(to, value, overrides);
        txHash = tx.hash;
        if (flags.has('wait')) await tx.wait();
      } else {
        const tx = await w.sendTransaction({ to, value, ...overrides });
        txHash = tx.hash;
        if (flags.has('wait')) await tx.wait();
      }
      logProgress(stream, JSON.stringify({ index: i + 1, address: w.address, txHash, explorer: explorerTx(chain, txHash) }));
      return { index: i + 1, address: w.address, txHash, explorer: explorerTx(chain, txHash) };
    }, { retries, baseMs: 1500, label: `batch[${i + 1}]` });
  });

  const okList = results.filter(r => r.ok).map(r => r.value);
  const errList = results.map((r, i) => r.ok ? null : { index: i + 1, error: r.error?.shortMessage || r.error?.message }).filter(Boolean);

  for (const e of errList) logProgress(stream, JSON.stringify({ ...e, ok: false }));

  if (stream) stream.end();
  out({ ok: true, total: results.length, success: okList.length, failed: errList.length, log: log?.abs ?? null, results: okList, errors: errList });
}

export async function consolidate(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pks = await loadManyPks(args, flags);
  if (!pks.length) die('no private keys provided');
  let to = args['to'];
  if (!to) die('need --to (collector address or ENS)');
  if (!isAddress(to)) {
    if (typeof to === 'string' && to.endsWith('.eth')) {
      const resolved = await provider.resolveName(to);
      if (!resolved) die(`failed to resolve ENS ${to}`);
      to = resolved;
    } else die('--to address invalid');
  }
  const type = args['type'] ?? 'native';
  const minLeave = args['leave'] ? parseEther(String(args['leave'])) : 0n;

  let token = null;
  let decimals = 18;
  let symbol = chain?.symbol ?? 'NATIVE';
  let tokenContract = null;
  if (type === 'token') {
    if (!args['token'] || !isAddress(args['token'])) die('--type token requires --token');
    token = args['token'];
    tokenContract = new Contract(token, ERC20_ABI, provider);
    decimals = args['decimals'] ? Number(args['decimals']) : Number(await tokenContract.decimals());
    symbol = await tokenContract.symbol().catch(() => 'TOKEN');
  }

  const concurrency = Number(args['concurrency'] ?? '1');
  const retries = Number(args['retries'] ?? '0');
  const minSend = args['min-send']
    ? (type === 'token' ? parseUnits(String(args['min-send']), decimals) : parseEther(String(args['min-send'])))
    : 0n;
  const log = await openLog(args);
  const stream = log?.stream ?? null;

  if (flags.has('dry-run')) {
    const items = await pLimit(pks, Math.max(concurrency, 5), async (pk, i) => {
      const w = new Wallet(pk, provider);
      if (type === 'token') {
        const bal = await tokenContract.balanceOf(w.address);
        const willSend = bal > 0n && bal >= minSend;
        return {
          index: i + 1,
          address: w.address,
          balance: formatUnits(bal, decimals),
          willSend,
          ...(willSend ? {} : { skipReason: bal === 0n ? 'zero balance' : `< min-send ${args['min-send'] ?? '0'}` }),
        };
      } else {
        const bal = await provider.getBalance(w.address);
        return { index: i + 1, address: w.address, balance: formatEther(bal), note: bal === 0n ? 'zero balance, will be skipped' : 'gas will be deducted' };
      }
    });
    out({ ok: true, dryRun: true, type: `consolidate-${type}`, to, symbol, count: pks.length, items: items.map(x => x.value) });
    return;
  }

  const results = await pLimit(pks, concurrency, async (pk, i) => {
    return withRetry(async () => {
      const w = new Wallet(pk, provider);
      const overrides = await buildFeeOverrides(provider, args, flags);

      if (type === 'token') {
        const bal = await tokenContract.balanceOf(w.address);
        if (bal < minSend || bal === 0n) {
          logProgress(stream, JSON.stringify({ index: i + 1, address: w.address, skip: true, balance: formatUnits(bal, decimals) }));
          return { index: i + 1, address: w.address, skip: true, balance: formatUnits(bal, decimals) };
        }
        const c = new Contract(token, ERC20_ABI, w);
        const tx = await c.transfer(to, bal, overrides);
        if (flags.has('wait')) await tx.wait();
        const r = { index: i + 1, address: w.address, sent: formatUnits(bal, decimals), txHash: tx.hash, explorer: explorerTx(chain, tx.hash) };
        logProgress(stream, JSON.stringify(r));
        return r;
      }

      const bal = await provider.getBalance(w.address);
      if (bal === 0n) {
        logProgress(stream, JSON.stringify({ index: i + 1, address: w.address, skip: true, balance: '0' }));
        return { index: i + 1, address: w.address, skip: true, balance: '0' };
      }
      if (!overrides.gasLimit) overrides.gasLimit = 21000n;
      let feeMax;
      if (overrides.maxFeePerGas) feeMax = BigInt(overrides.maxFeePerGas) * BigInt(overrides.gasLimit);
      else if (overrides.gasPrice) feeMax = BigInt(overrides.gasPrice) * BigInt(overrides.gasLimit);
      else {
        const fee = await provider.getFeeData();
        const gp = fee.maxFeePerGas ?? fee.gasPrice;
        if (!gp) throw new Error('failed to estimate gas');
        overrides.maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice;
        overrides.maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? fee.gasPrice;
        overrides.type = 2;
        feeMax = BigInt(overrides.maxFeePerGas) * BigInt(overrides.gasLimit);
      }
      const value = bal - feeMax - minLeave;
      if (value <= 0n || value < minSend) {
        logProgress(stream, JSON.stringify({ index: i + 1, address: w.address, skip: true, balance: formatEther(bal), reason: 'insufficient after gas/leave' }));
        return { index: i + 1, address: w.address, skip: true, balance: formatEther(bal) };
      }
      const tx = await w.sendTransaction({ to, value, ...overrides });
      if (flags.has('wait')) await tx.wait();
      const r = { index: i + 1, address: w.address, sent: formatEther(value), txHash: tx.hash, explorer: explorerTx(chain, tx.hash) };
      logProgress(stream, JSON.stringify(r));
      return r;
    }, { retries, baseMs: 1500, label: `consolidate[${i + 1}]` });
  });

  const okList = results.filter(r => r.ok).map(r => r.value);
  const errList = results.map((r, i) => r.ok ? null : { index: i + 1, error: r.error?.shortMessage || r.error?.message }).filter(Boolean);
  for (const e of errList) logProgress(stream, JSON.stringify({ ...e, ok: false }));
  if (stream) stream.end();

  out({
    ok: true,
    type: `consolidate-${type}`,
    to,
    total: results.length,
    success: okList.filter(x => !x.skip).length,
    skipped: okList.filter(x => x.skip).length,
    failed: errList.length,
    log: log?.abs ?? null,
    results: okList,
    errors: errList,
  });
}

export async function balanceBatch(args, flags) {
  const { provider } = await buildProvider(args, flags);
  const pks = await loadManyPks(args, flags);
  const tokens = (args['tokens'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const tokenInfos = [];
  for (const t of tokens) {
    if (!isAddress(t)) die(`invalid token address: ${t}`);
    const c = new Contract(t, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([
      c.symbol().catch(() => 'TOKEN'),
      c.decimals().catch(() => 18),
    ]);
    tokenInfos.push({ token: t, symbol, decimals: Number(decimals), contract: c });
  }
  const concurrency = Number(args['concurrency'] ?? '5');
  const results = await pLimit(pks, concurrency, async (pk, i) => {
    const w = new Wallet(pk, provider);
    const native = await provider.getBalance(w.address);
    const row = { index: i + 1, address: w.address, native: formatEther(native) };
    for (const t of tokenInfos) {
      const b = await t.contract.balanceOf(w.address).catch(() => null);
      row[t.symbol] = b == null ? 'ERR' : formatUnits(b, t.decimals);
    }
    return row;
  });
  const flat = results.map(r => r.ok ? r.value : { error: r.error?.message });
  if (args['out']) {
    const p = writeFileSecure(args['out'], rowsToCsv(flat));
    out({ ok: true, out: p, count: flat.length });
  } else {
    out({ ok: true, count: flat.length, results: flat });
  }
}
