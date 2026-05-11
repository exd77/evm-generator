import { Contract, formatEther, formatUnits, isAddress, Wallet, verifyMessage } from 'ethers';
import { buildProvider } from './provider.js';
import { loadOnePk } from './pk.js';
import { parseCsvFile, rowsToCsv } from './csv.js';
import { explorerAddress, explorerTx, listChains } from './chains.js';
import { die, out, pLimit, writeFileSecure } from './util.js';

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

export async function chainsCmd() {
  out({ chains: listChains() });
}

export async function balance(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const tokens = (args['tokens'] ?? '').split(',').map(s => s.trim()).filter(Boolean);

  let addresses = [];
  if (args['address']) addresses = [args['address']];
  else if (args['addresses']) addresses = String(args['addresses']).split(',').map(s => s.trim()).filter(Boolean);
  else if (args['csv']) {
    const { headers, rows } = parseCsvFile(args['csv']);
    if (!headers.includes('address')) die('CSV needs column: address');
    addresses = rows.map(r => r.address).filter(Boolean);
  } else die('need --address | --addresses | --csv');

  for (const a of addresses) {
    if (!isAddress(a) && !a.endsWith('.eth')) die(`address invalid: ${a}`);
  }

  const tokenInfos = [];
  for (const t of tokens) {
    if (!isAddress(t)) die(`token address invalid: ${t}`);
    const c = new Contract(t, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([
      c.symbol().catch(() => 'TOKEN'),
      c.decimals().catch(() => 18),
    ]);
    tokenInfos.push({ token: t, symbol, decimals: Number(decimals), contract: c });
  }

  const concurrency = Number(args['concurrency'] ?? '5');
  const results = await pLimit(addresses, concurrency, async (raw) => {
    const addr = raw.endsWith('.eth') ? await provider.resolveName(raw) : raw;
    if (!addr) return { input: raw, error: 'failed to resolve' };
    const native = await provider.getBalance(addr);
    const balances = { input: raw, address: addr, native: formatEther(native) };
    for (const t of tokenInfos) {
      const b = await t.contract.balanceOf(addr).catch(() => null);
      balances[t.symbol] = b == null ? 'ERR' : formatUnits(b, t.decimals);
    }
    if (chain) balances.explorer = explorerAddress(chain, addr);
    return balances;
  });

  const flat = results.map(r => r.ok ? r.value : { error: r.error?.message });
  if (args['out']) {
    const p = writeFileSecure(args['out'], rowsToCsv(flat));
    out({ ok: true, out: p, count: flat.length });
  } else {
    out({ ok: true, count: flat.length, results: flat });
  }
}

export async function tokenInfo(args, flags) {
  const { provider } = await buildProvider(args, flags);
  const token = args['token'];
  if (!token || !isAddress(token)) die('need --token (address)');
  const c = new Contract(token, ERC20_ABI, provider);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    c.name().catch(() => null),
    c.symbol().catch(() => null),
    c.decimals().catch(() => null),
    c.totalSupply().catch(() => null),
  ]);
  out({
    ok: true,
    token,
    name,
    symbol,
    decimals: decimals != null ? Number(decimals) : null,
    totalSupply: totalSupply != null && decimals != null ? formatUnits(totalSupply, Number(decimals)) : null,
  });
}

export async function txStatus(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const hash = args['tx'];
  if (!hash) die('need --tx');
  const tx = await provider.getTransaction(hash);
  if (!tx) die('transaction not found');
  const receipt = await provider.getTransactionReceipt(hash);
  out({
    ok: true,
    hash,
    from: tx.from,
    to: tx.to,
    value: formatEther(tx.value),
    nonce: tx.nonce,
    gasLimit: String(tx.gasLimit),
    type: tx.type,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status ?? null,
    confirmations: tx.confirmations ? await tx.confirmations() : null,
    explorer: explorerTx(chain, hash),
  });
}

export async function gasNow(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const fee = await provider.getFeeData();
  const gwei = (v) => v == null ? null : Number(v) / 1e9;
  out({
    ok: true,
    chain: chain?.name ?? null,
    chainId: chain?.chainId ?? null,
    gasPrice: gwei(fee.gasPrice),
    maxFeePerGas: gwei(fee.maxFeePerGas),
    maxPriorityFeePerGas: gwei(fee.maxPriorityFeePerGas),
    unit: 'gwei',
  });
}

export async function ens(args, flags) {
  const { provider } = await buildProvider(args, flags);
  if (args['name']) {
    const a = await provider.resolveName(args['name']);
    out({ ok: true, name: args['name'], address: a });
    return;
  }
  if (args['address']) {
    const n = await provider.lookupAddress(args['address']);
    out({ ok: true, address: args['address'], name: n });
    return;
  }
  die('need --name (ens -> address) or --address (address -> ens)');
}

export async function nonceCmd(args, flags) {
  const { provider } = await buildProvider(args, flags);
  const addr = args['address'];
  if (!addr) die('need --address');
  const [pending, confirmed] = await Promise.all([
    provider.getTransactionCount(addr, 'pending'),
    provider.getTransactionCount(addr, 'latest'),
  ]);
  out({ ok: true, address: addr, pending, confirmed, gap: pending - confirmed });
}

export async function signMessage(args, flags) {
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk);
  const message = args['message'];
  if (!message) die('need --message');
  const sig = await wallet.signMessage(message);
  out({ ok: true, address: wallet.address, message, signature: sig });
}

export async function verifyMessageCmd(args, flags) {
  const message = args['message'];
  const sig = args['signature'];
  if (!message || !sig) die('need --message --signature');
  const recovered = verifyMessage(message, sig);
  out({ ok: true, recovered, expected: args['address'] ?? null, match: args['address'] ? recovered.toLowerCase() === args['address'].toLowerCase() : null });
}
