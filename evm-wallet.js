#!/usr/bin/env node
import { getArgs, die } from './lib/util.js';
import {
  generateRandom,
  generateHd,
  importWallet,
  generateVanity,
  exportKeystore,
  importKeystore,
  batchExportKeystore,
} from './lib/wallet.js';
import {
  sendNative,
  sendToken,
  sweepNative,
  sweepToken,
  approveToken,
  disperse,
  speedUpTx,
} from './lib/send.js';
import {
  chainsCmd,
  balance,
  tokenInfo,
  txStatus,
  gasNow,
  ens,
  nonceCmd,
  signMessage,
  verifyMessageCmd,
} from './lib/inspect.js';
import { batchSend, consolidate, balanceBatch } from './lib/batch.js';

const HELP = `EVM Wallet Toolkit

Usage:
  evm-wallet.js <command> [options]

Wallet:
  generate                Generate N random wallets (CSV/JSON)
  generate-hd             Generate N HD wallets from a single mnemonic + derivation path
  import                  Import a wallet from --mnemonic or --pk, outputs address + pk
  vanity                  Generate wallets matching a custom prefix/suffix
  keystore-export         Export a PK to an encrypted keystore JSON v3 file
  keystore-import         Decrypt a keystore file (requires password)
  keystore-batch          Convert a CSV of PKs into a folder of keystore JSON files

Send (single wallet):
  send-native             Send native token (ETH / BNB / POL / ...)
  send-token              Send an ERC20 token by contract address
  sweep-native            Send all native balance to one address (auto-deducts gas)
  sweep-token             Send all ERC20 balance to one address
  approve                 ERC20 approve a spender (use --max for infinite approval)
  disperse                One wallet -> many recipients (CSV: address,amount)
  speedup                 Replace a pending tx with a higher gas one (or --cancel it)

Batch (many wallets):
  batch-send              Send from many wallets to one recipient (same amount each)
  consolidate             Sweep from many wallets into one collector (auto gas)
  balance-batch           Check native + token balances for many wallets

Inspect / Read:
  chains                  List preset chains
  balance                 Check native + token balance for one or many addresses
  token-info              ERC20 contract info (name, symbol, decimals, totalSupply)
  tx-status               Transaction status by hash
  gas-now                 Current gas price on the chain
  ens                     Resolve ENS name <-> address
  nonce                   Pending & confirmed nonce
  sign-message            Sign an EIP-191 message
  verify-message          Verify an EIP-191 signature

Common options:
  --chain <key>           Preset chain: ethereum, base, bsc, polygon, arbitrum, optimism,
                          avalanche, linea, scroll, zksync, sepolia, base-sepolia
  --rpc <url[,url2,...]>  Override RPC (multiple = fallback). One of --chain/--rpc is required
  --skip-chain-check      Skip chainId verification

Private key sources (for commands that need a PK):
  --pk <hex>              Raw private key (not recommended — shows up in process list)
  --pk-file <path>        Read PK from a file (first line)
  --pk-env <NAME>         Read PK from an env var
  --keystore <path>       Load from an encrypted keystore (--password or interactive prompt)
  EVM_PK env              Default fallback if env var is set

Output:
  --out <path>            Write output to a file (mode 0600)
  --json                  Output JSON instead of CSV
  --log <path>            Append a per-step log file (useful for batch ops)

Gas / fee:
  --gas-price <gwei>      Legacy gasPrice (type 0)
  --max-fee <gwei>        EIP-1559 maxFeePerGas (type 2)
  --priority-fee <gwei>   EIP-1559 maxPriorityFeePerGas (type 2)
  --gas-limit <n>         Override gas limit
  --nonce <n>             Override nonce
  --auto-gas              Use provider.getFeeData() to set fees automatically
  --gas-multiplier <n>    Multiply auto-gas fees (default 1.0; speed-up default 1.2)

Tx control:
  --wait                  Wait for confirmation
  --dry-run               Simulate without broadcasting
  --concurrency <n>       Parallel limit for batch ops (default 1 for send, 5 for reads)
  --retries <n>           Retry on failure with exponential backoff

Run "evm-wallet.js <command> --help" for per-command details (TODO).
`;

const cmd = process.argv[2];
const rest = process.argv.slice(3);
const { args, flags } = getArgs(rest);

if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help' || flags.has('help')) {
  process.stdout.write(HELP);
  process.exit(0);
}

const COMMANDS = {
  generate: generateRandom,
  'generate-hd': generateHd,
  import: importWallet,
  vanity: generateVanity,
  'keystore-export': exportKeystore,
  'keystore-import': importKeystore,
  'keystore-batch': batchExportKeystore,

  'send-native': sendNative,
  'send-token': sendToken,
  'sweep-native': sweepNative,
  'sweep-token': sweepToken,
  approve: approveToken,
  disperse,
  speedup: speedUpTx,

  'batch-send': batchSend,
  consolidate,
  'balance-batch': balanceBatch,

  chains: chainsCmd,
  balance,
  'token-info': tokenInfo,
  'tx-status': txStatus,
  'gas-now': gasNow,
  ens,
  nonce: nonceCmd,
  'sign-message': signMessage,
  'verify-message': verifyMessageCmd,
};

const fn = COMMANDS[cmd];
if (!fn) die(`unknown command: ${cmd}. run without arguments to see help.`);

try {
  await fn(args, flags);
} catch (e) {
  die(e.shortMessage || e.message || String(e));
}
