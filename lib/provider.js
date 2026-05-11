import { JsonRpcProvider, FallbackProvider, Network } from 'ethers';
import { resolveChain } from './chains.js';
import { die } from './util.js';

export async function buildProvider(args, flags) {
  const chain = args['chain'] ? resolveChain(args['chain']) : null;
  let rpcs = [];
  if (args['rpc']) {
    rpcs = String(args['rpc']).split(',').map(s => s.trim()).filter(Boolean);
  } else if (chain) {
    rpcs = chain.rpc.slice();
  } else {
    die('need --rpc or --chain (preset). Run the "chains" command to see available chains.');
  }

  let provider;
  if (rpcs.length === 1) {
    provider = new JsonRpcProvider(rpcs[0], chain ? Network.from(chain.chainId) : undefined, {
      staticNetwork: chain ? Network.from(chain.chainId) : undefined,
    });
  } else {
    const subs = rpcs.map((url, i) => ({
      provider: new JsonRpcProvider(url, chain ? Network.from(chain.chainId) : undefined, {
        staticNetwork: chain ? Network.from(chain.chainId) : undefined,
      }),
      priority: i + 1,
      stallTimeout: 2000,
      weight: 1,
    }));
    provider = new FallbackProvider(subs, chain ? Network.from(chain.chainId) : undefined, {
      quorum: 1,
    });
  }

  if (!flags.has('skip-chain-check')) {
    try {
      const net = await provider.getNetwork();
      if (chain && Number(net.chainId) !== chain.chainId) {
        die(`chainId mismatch: RPC=${net.chainId} preset=${chain.chainId} (${chain.key})`);
      }
    } catch (e) {
      die(`failed to connect to RPC: ${e.shortMessage || e.message}`);
    }
  }

  return { provider, chain, rpcs };
}

export async function buildFeeOverrides(provider, args, flags) {
  const overrides = {};
  if (args['gas-limit']) overrides.gasLimit = BigInt(args['gas-limit']);
  if (args['nonce']) overrides.nonce = Number(args['nonce']);

  const { parseUnits } = await import('ethers');

  if (args['gas-price']) {
    overrides.gasPrice = parseUnits(String(args['gas-price']), 'gwei');
    overrides.type = 0;
    return overrides;
  }

  if (args['max-fee'] || args['priority-fee']) {
    if (args['max-fee']) overrides.maxFeePerGas = parseUnits(String(args['max-fee']), 'gwei');
    if (args['priority-fee']) overrides.maxPriorityFeePerGas = parseUnits(String(args['priority-fee']), 'gwei');
    overrides.type = 2;
    return overrides;
  }

  if (flags.has('auto-gas')) {
    const fee = await provider.getFeeData();
    if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
      const mult = Number(args['gas-multiplier'] ?? '1');
      overrides.maxFeePerGas = (fee.maxFeePerGas * BigInt(Math.round(mult * 100))) / 100n;
      overrides.maxPriorityFeePerGas = (fee.maxPriorityFeePerGas * BigInt(Math.round(mult * 100))) / 100n;
      overrides.type = 2;
    } else if (fee.gasPrice) {
      overrides.gasPrice = fee.gasPrice;
      overrides.type = 0;
    }
  }

  return overrides;
}
