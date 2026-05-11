import {
  Wallet,
  Contract,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  isAddress,
} from 'ethers';
import { explorerTx } from './chains.js';
import { buildProvider, buildFeeOverrides } from './provider.js';
import { loadOnePk } from './pk.js';
import { parseCsvFile } from './csv.js';
import { die, out, err } from './util.js';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
];

async function resolveTo(provider, to) {
  if (isAddress(to)) return to;
  if (typeof to === 'string' && to.endsWith('.eth')) {
    const addr = await provider.resolveName(to);
    if (!addr) throw new Error(`failed to resolve ENS ${to}`);
    return addr;
  }
  throw new Error(`recipient address invalid: ${to}`);
}

function feeSummary(o) {
  const summary = {};
  if (o.gasPrice) summary.gasPrice = `${Number(o.gasPrice) / 1e9} gwei`;
  if (o.maxFeePerGas) summary.maxFeePerGas = `${Number(o.maxFeePerGas) / 1e9} gwei`;
  if (o.maxPriorityFeePerGas) summary.maxPriorityFeePerGas = `${Number(o.maxPriorityFeePerGas) / 1e9} gwei`;
  if (o.gasLimit) summary.gasLimit = String(o.gasLimit);
  if (o.nonce !== undefined) summary.nonce = o.nonce;
  if (o.type !== undefined) summary.type = o.type;
  return summary;
}

export async function sendNative(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const to = await resolveTo(provider, args['to']);
  const amount = args['amount'];
  if (!amount) die('need --amount');
  const value = parseEther(String(amount));

  const balance = await provider.getBalance(wallet.address);
  const overrides = await buildFeeOverrides(provider, args, flags);
  if (!overrides.gasLimit) {
    overrides.gasLimit = await provider.estimateGas({ from: wallet.address, to, value }).catch(() => 21000n);
  }

  let gasFeeMax = computeFeeCeiling(overrides);
  if (gasFeeMax === 0n) {
    // No explicit fee override: estimate from provider so the pre-check is meaningful
    const feeData = await provider.getFeeData();
    const gp = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    gasFeeMax = BigInt(gp) * BigInt(overrides.gasLimit ?? 21000n);
  }
  if (balance < value + gasFeeMax) {
    die(`not enough balance. balance=${formatEther(balance)}, amount=${amount}, gas_max=${formatEther(gasFeeMax)}`);
  }

  if (flags.has('dry-run')) {
    out({
      ok: true,
      dryRun: true,
      type: 'native',
      from: wallet.address,
      to,
      amount,
      balance: formatEther(balance),
      gasFeeMax: formatEther(gasFeeMax),
      fee: feeSummary(overrides),
    });
    return;
  }

  const tx = await wallet.sendTransaction({ to, value, ...overrides });
  out({
    ok: true,
    type: 'native',
    from: wallet.address,
    to,
    amount,
    txHash: tx.hash,
    explorer: explorerTx(chain, tx.hash),
    fee: feeSummary(overrides),
  });
  if (flags.has('wait')) {
    const r = await tx.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status, gasUsed: String(r.gasUsed) });
  }
}

function computeFeeCeiling(o) {
  const limit = o.gasLimit ?? 21000n;
  if (o.maxFeePerGas) return BigInt(o.maxFeePerGas) * BigInt(limit);
  if (o.gasPrice) return BigInt(o.gasPrice) * BigInt(limit);
  return 0n;
}

export async function sendToken(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const to = await resolveTo(provider, args['to']);
  const token = args['token'];
  const amount = args['amount'];
  if (!token || !amount) die('need --token --amount');
  if (!isAddress(token)) die('token contract address invalid');

  const contract = new Contract(token, ERC20_ABI, wallet);
  const decimals = args['decimals'] ? Number(args['decimals']) : await contract.decimals();
  const symbol = await contract.symbol().catch(() => 'TOKEN');
  const tokenBalance = await contract.balanceOf(wallet.address);
  const value = parseUnits(String(amount), decimals);

  if (tokenBalance < value) {
    die(`not enough token balance. balance=${formatUnits(tokenBalance, decimals)} ${symbol}, amount=${amount}`);
  }

  const overrides = await buildFeeOverrides(provider, args, flags);

  if (flags.has('dry-run')) {
    const gasEst = await contract.transfer.estimateGas(to, value).catch(() => null);
    out({
      ok: true,
      dryRun: true,
      type: 'erc20',
      symbol,
      decimals,
      token,
      from: wallet.address,
      to,
      amount,
      balance: formatUnits(tokenBalance, decimals),
      gasEstimate: gasEst ? String(gasEst) : null,
      fee: feeSummary(overrides),
    });
    return;
  }

  const tx = await contract.transfer(to, value, overrides);
  out({
    ok: true,
    type: 'erc20',
    symbol,
    token,
    from: wallet.address,
    to,
    amount,
    txHash: tx.hash,
    explorer: explorerTx(chain, tx.hash),
    fee: feeSummary(overrides),
  });
  if (flags.has('wait')) {
    const r = await tx.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status, gasUsed: String(r.gasUsed) });
  }
}

export async function sweepNative(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const to = await resolveTo(provider, args['to']);
  const minLeave = args['leave'] ? parseEther(String(args['leave'])) : 0n;

  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) die('balance is zero');

  const overrides = await buildFeeOverrides(provider, args, flags);
  if (!overrides.gasLimit) overrides.gasLimit = 21000n;
  const gasFeeMax = computeFeeCeiling(overrides);
  if (gasFeeMax === 0n) {
    const fee = await provider.getFeeData();
    const gp = fee.maxFeePerGas ?? fee.gasPrice;
    if (!gp) die('failed to estimate gas, set --gas-price or --max-fee');
    overrides.maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice;
    overrides.maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? fee.gasPrice;
    overrides.type = 2;
  }
  const gasMax = computeFeeCeiling(overrides);
  const value = balance - gasMax - minLeave;
  if (value <= 0n) die(`balance ${formatEther(balance)} not enough after gas max ${formatEther(gasMax)} + leave ${formatEther(minLeave)}`);

  if (flags.has('dry-run')) {
    out({
      ok: true,
      dryRun: true,
      type: 'sweep-native',
      from: wallet.address,
      to,
      balance: formatEther(balance),
      gasMax: formatEther(gasMax),
      sendAmount: formatEther(value),
      fee: feeSummary(overrides),
    });
    return;
  }

  const tx = await wallet.sendTransaction({ to, value, ...overrides });
  out({
    ok: true,
    type: 'sweep-native',
    from: wallet.address,
    to,
    sendAmount: formatEther(value),
    txHash: tx.hash,
    explorer: explorerTx(chain, tx.hash),
  });
  if (flags.has('wait')) {
    const r = await tx.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status });
  }
}

export async function sweepToken(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const to = await resolveTo(provider, args['to']);
  const token = args['token'];
  if (!token || !isAddress(token)) die('need --token (address)');
  const contract = new Contract(token, ERC20_ABI, wallet);
  const [decimals, symbol, bal] = await Promise.all([
    args['decimals'] ? Number(args['decimals']) : contract.decimals(),
    contract.symbol().catch(() => 'TOKEN'),
    contract.balanceOf(wallet.address),
  ]);
  if (bal === 0n) die('token balance is zero');

  const overrides = await buildFeeOverrides(provider, args, flags);

  if (flags.has('dry-run')) {
    out({
      ok: true,
      dryRun: true,
      type: 'sweep-token',
      symbol,
      token,
      from: wallet.address,
      to,
      sendAmount: formatUnits(bal, decimals),
      fee: feeSummary(overrides),
    });
    return;
  }

  const tx = await contract.transfer(to, bal, overrides);
  out({
    ok: true,
    type: 'sweep-token',
    symbol,
    token,
    from: wallet.address,
    to,
    sendAmount: formatUnits(bal, decimals),
    txHash: tx.hash,
    explorer: explorerTx(chain, tx.hash),
  });
  if (flags.has('wait')) {
    const r = await tx.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status });
  }
}

export async function approveToken(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const token = args['token'];
  const spender = args['spender'];
  if (!token || !spender) die('need --token --spender');
  if (!isAddress(token) || !isAddress(spender)) die('token/spender address invalid');
  const contract = new Contract(token, ERC20_ABI, wallet);
  const decimals = args['decimals'] ? Number(args['decimals']) : await contract.decimals();
  const symbol = await contract.symbol().catch(() => 'TOKEN');

  const MAX_UINT = (1n << 256n) - 1n;
  let value;
  if (flags.has('max') || args['amount'] === 'max') {
    value = MAX_UINT;
  } else {
    if (!args['amount']) die('need --amount or --max');
    value = parseUnits(String(args['amount']), decimals);
  }

  const overrides = await buildFeeOverrides(provider, args, flags);
  if (flags.has('dry-run')) {
    out({ ok: true, dryRun: true, type: 'approve', symbol, token, spender, amount: value === MAX_UINT ? 'max' : args['amount'] });
    return;
  }

  const tx = await contract.approve(spender, value, overrides);
  out({
    ok: true,
    type: 'approve',
    symbol,
    token,
    spender,
    amount: value === MAX_UINT ? 'max' : args['amount'],
    txHash: tx.hash,
    explorer: explorerTx(chain, tx.hash),
  });
  if (flags.has('wait')) {
    const r = await tx.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status });
  }
}

export async function disperse(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const csv = args['csv'];
  if (!csv) die('need --csv (columns: address,amount)');
  const { headers, rows } = parseCsvFile(csv);
  if (!headers.includes('address') || !headers.includes('amount')) {
    die('CSV needs columns: address,amount');
  }

  const type = args['type'] ?? 'native';
  const token = args['token'];
  if (type === 'token' && !token) die('--type token requires --token');

  let decimals = 18;
  let symbol = chain?.symbol ?? 'NATIVE';
  let contract = null;
  if (type === 'token') {
    contract = new Contract(token, ERC20_ABI, wallet);
    decimals = args['decimals'] ? Number(args['decimals']) : await contract.decimals();
    symbol = await contract.symbol().catch(() => 'TOKEN');
  }

  const recipients = [];
  for (const r of rows) {
    if (!r.address || !r.amount) continue;
    const to = await resolveTo(provider, r.address);
    const value = type === 'token' ? parseUnits(String(r.amount), decimals) : parseEther(String(r.amount));
    recipients.push({ to, amount: r.amount, value });
  }

  if (!recipients.length) die('no valid recipients found in CSV');

  const total = recipients.reduce((s, x) => s + x.value, 0n);
  console.error(`[disperse] ${recipients.length} recipients, total=${type === 'token' ? formatUnits(total, decimals) : formatEther(total)} ${symbol}`);

  if (flags.has('dry-run')) {
    out({
      ok: true,
      dryRun: true,
      type: `disperse-${type}`,
      from: wallet.address,
      symbol,
      total: type === 'token' ? formatUnits(total, decimals) : formatEther(total),
      recipients: recipients.map(r => ({ to: r.to, amount: r.amount })),
    });
    return;
  }

  const results = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      const overrides = await buildFeeOverrides(provider, args, flags);
      const tx = type === 'token'
        ? await contract.transfer(r.to, r.value, overrides)
        : await wallet.sendTransaction({ to: r.to, value: r.value, ...overrides });
      console.error(`[${i + 1}/${recipients.length}] ${r.to} ${r.amount} ${symbol} -> ${tx.hash}`);
      results.push({ index: i + 1, to: r.to, amount: r.amount, txHash: tx.hash, explorer: explorerTx(chain, tx.hash) });
      if (flags.has('wait')) await tx.wait();
    } catch (e) {
      console.error(`[${i + 1}/${recipients.length}] FAILED ${r.to}: ${e.shortMessage || e.message}`);
      results.push({ index: i + 1, to: r.to, amount: r.amount, error: e.shortMessage || e.message });
    }
  }
  out({ ok: true, count: results.length, results });
}

export async function speedUpTx(args, flags) {
  const { provider, chain } = await buildProvider(args, flags);
  const pk = await loadOnePk(args, flags);
  const wallet = new Wallet(pk, provider);
  const txHash = args['tx'];
  if (!txHash) die('need --tx (hash of the transaction to speed up)');
  const tx = await provider.getTransaction(txHash);
  if (!tx) die('transaction not found');
  if (tx.from.toLowerCase() !== wallet.address.toLowerCase()) {
    die(`tx belongs to a different address: ${tx.from} (wallet: ${wallet.address})`);
  }
  const cancel = flags.has('cancel');
  const newTx = {
    to: cancel ? wallet.address : tx.to,
    value: cancel ? 0n : tx.value,
    data: cancel ? '0x' : tx.data,
    nonce: tx.nonce,
  };
  const overrides = await buildFeeOverrides(provider, args, flags);
  if (!overrides.maxFeePerGas && !overrides.gasPrice) {
    const baseMult = Number(args['gas-multiplier'] ?? '1.2');
    if (tx.maxFeePerGas) {
      newTx.maxFeePerGas = (BigInt(tx.maxFeePerGas) * BigInt(Math.round(baseMult * 100))) / 100n;
      newTx.maxPriorityFeePerGas = (BigInt(tx.maxPriorityFeePerGas ?? tx.maxFeePerGas) * BigInt(Math.round(baseMult * 100))) / 100n;
      newTx.type = 2;
    } else {
      newTx.gasPrice = (BigInt(tx.gasPrice) * BigInt(Math.round(baseMult * 100))) / 100n;
      newTx.type = 0;
    }
  } else {
    Object.assign(newTx, overrides);
  }
  if (flags.has('dry-run')) {
    out({ ok: true, dryRun: true, action: cancel ? 'cancel' : 'speed-up', original: txHash, newTx: feeSummary(newTx), nonce: tx.nonce });
    return;
  }
  const sent = await wallet.sendTransaction(newTx);
  out({
    ok: true,
    action: cancel ? 'cancel' : 'speed-up',
    original: txHash,
    replacement: sent.hash,
    explorer: explorerTx(chain, sent.hash),
    nonce: tx.nonce,
  });
  if (flags.has('wait')) {
    const r = await sent.wait();
    out({ confirmed: true, blockNumber: r.blockNumber, status: r.status });
  }
}
