import {
  Wallet,
  HDNodeWallet,
  Mnemonic,
  computeAddress,
  encryptKeystoreJson,
} from 'ethers';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { rowsToCsv } from './csv.js';
import { die, out, readPasswordFromStdinSync, writeFileSecure } from './util.js';

const DEFAULT_PATH_BASE = "m/44'/60'/0'/0";

function buildRows(items, withMnemonic, withPath) {
  return items.map((w, i) => {
    const row = { index: i + 1, address: w.address, private_key: w.privateKey };
    if (withMnemonic) row.mnemonic = w.mnemonic ?? '';
    if (withPath) row.path = w.path ?? '';
    return row;
  });
}

function emit(rows, args, flags, headersOverride) {
  const json = flags.has('json');
  const headers = headersOverride ?? Object.keys(rows[0] ?? {});
  let payload;
  if (json) {
    payload = `${JSON.stringify(rows, null, 2)}\n`;
  } else {
    payload = rowsToCsv(rows, headers);
  }
  if (args['out']) {
    const path = writeFileSecure(args['out'], payload, 0o600);
    out({ ok: true, generated: rows.length, out: path });
  } else {
    process.stdout.write(payload);
  }
}

export async function generateRandom(args, flags) {
  const count = Number(args['count'] ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 100000) die('--count must be an integer between 1 and 100000');
  const noMnemonic = flags.has('no-mnemonic');
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const w = Wallet.createRandom();
    wallets.push({
      address: w.address,
      privateKey: w.privateKey,
      mnemonic: w.mnemonic?.phrase ?? '',
      path: w.path ?? '',
    });
  }
  const rows = buildRows(wallets, !noMnemonic, false);
  const headers = noMnemonic ? ['index', 'address', 'private_key'] : ['index', 'address', 'private_key', 'mnemonic'];
  emit(rows, args, flags, headers);
}

export async function generateHd(args, flags) {
  const count = Number(args['count'] ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 100000) die('--count must be an integer between 1 and 100000');
  const start = Number(args['start'] ?? '0');
  const pathBase = args['path-base'] ?? DEFAULT_PATH_BASE;

  let phrase = args['mnemonic'];
  if (!phrase && args['mnemonic-file']) {
    if (!existsSync(args['mnemonic-file'])) die(`mnemonic-file not found: ${args['mnemonic-file']}`);
    phrase = readFileSync(args['mnemonic-file'], 'utf8').trim();
  }
  if (!phrase && process.env.EVM_MNEMONIC) phrase = process.env.EVM_MNEMONIC;
  if (!phrase) {
    phrase = Wallet.createRandom().mnemonic.phrase;
  }

  const mnemonic = Mnemonic.fromPhrase(phrase);
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    const node = HDNodeWallet.fromMnemonic(mnemonic, `${pathBase}/${idx}`);
    wallets.push({
      address: node.address,
      privateKey: node.privateKey,
      mnemonic: '',
      path: `${pathBase}/${idx}`,
    });
  }

  const rows = buildRows(wallets, false, true);
  const headers = ['index', 'address', 'private_key', 'path'];
  emit(rows, args, flags, headers);

  if (args['mnemonic-out']) {
    const p = writeFileSecure(args['mnemonic-out'], `${phrase}\n`, 0o600);
    console.error(`Master mnemonic saved to: ${p}`);
  } else if (!args['mnemonic'] && !args['mnemonic-file'] && !process.env.EVM_MNEMONIC) {
    console.error('--- MASTER MNEMONIC (save this somewhere safe, do not share it) ---');
    console.error(phrase);
    console.error('--------------------------------------------------------------------');
  }
}

export async function importWallet(args, flags) {
  const phrase = args['mnemonic'];
  const pk = args['pk'];
  if (!phrase && !pk) die('need --mnemonic or --pk');
  let wallet;
  if (phrase) {
    const path = args['path'] ?? `${DEFAULT_PATH_BASE}/0`;
    wallet = HDNodeWallet.fromPhrase(phrase, undefined, path);
  } else {
    wallet = new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`);
  }
  out({
    ok: true,
    address: wallet.address,
    private_key: wallet.privateKey,
    path: wallet.path ?? null,
  });
}

export async function generateVanity(args, flags) {
  const prefixRaw = (args['prefix'] ?? '').replace(/^0x/i, '');
  const suffix = args['suffix'] ?? '';
  const count = Number(args['count'] ?? '1');
  const caseSensitive = flags.has('checksum');
  const reportEvery = Number(args['report-every'] ?? '5000');

  if (!prefixRaw && !suffix) die('need --prefix or --suffix (hex)');
  if (!/^[0-9a-fA-F]*$/.test(prefixRaw)) die('--prefix must be hex');
  if (!/^[0-9a-fA-F]*$/.test(suffix)) die('--suffix must be hex');
  const totalChars = prefixRaw.length + suffix.length;
  if (totalChars > 8 && !caseSensitive) {
    const expected = 16 ** totalChars;
    console.error(`NOTE: pattern ${totalChars} hex chars, expected ~${expected.toLocaleString()} tries per hit`);
  }

  const matchPrefix = caseSensitive ? prefixRaw : prefixRaw.toLowerCase();
  const matchSuffix = caseSensitive ? suffix : suffix.toLowerCase();
  const wallets = [];
  let tries = 0;
  const t0 = Date.now();

  while (wallets.length < count) {
    const pkBytes = randomBytes(32);
    const pkHex = `0x${pkBytes.toString('hex')}`;
    const addrChecksum = computeAddress(pkHex);
    tries++;
    const addr = caseSensitive ? addrChecksum.slice(2) : addrChecksum.slice(2).toLowerCase();
    if (addr.startsWith(matchPrefix) && addr.endsWith(matchSuffix)) {
      const w = new Wallet(pkHex);
      wallets.push({
        address: w.address,
        privateKey: w.privateKey,
        mnemonic: '',
        path: '',
      });
      const elapsed = (Date.now() - t0) / 1000;
      console.error(`[hit ${wallets.length}/${count}] ${w.address} after ${tries} tries in ${elapsed.toFixed(1)}s`);
    } else if (tries % reportEvery === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = tries / elapsed;
      console.error(`[progress] ${tries} tries, ${rate.toFixed(0)}/s, hits=${wallets.length}/${count}`);
    }
  }

  const rows = buildRows(wallets, false, false);
  const headers = ['index', 'address', 'private_key'];
  emit(rows, args, flags, headers);
}

export async function exportKeystore(args, flags) {
  const pk = args['pk'];
  if (!pk) die('need --pk');
  const password = args['password'] ?? readPasswordFromStdinSync('Keystore password: ');
  if (!password) die('password is empty');
  const wallet = new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`);
  const scryptN = Number(args['scrypt-n'] ?? (1 << 17));
  const json = await encryptKeystoreJson(
    { address: wallet.address, privateKey: wallet.privateKey },
    password,
    { scrypt: { N: scryptN } }
  );
  if (args['out']) {
    const p = writeFileSecure(args['out'], `${json}\n`, 0o600);
    out({ ok: true, address: wallet.address, out: p });
  } else {
    out({ ok: true, address: wallet.address, keystore: JSON.parse(json) });
  }
}

export async function importKeystore(args, flags) {
  if (!args['keystore']) die('need --keystore');
  if (!existsSync(args['keystore'])) die(`keystore not found: ${args['keystore']}`);
  const json = readFileSync(args['keystore'], 'utf8');
  const password = args['password'] ?? readPasswordFromStdinSync('Keystore password: ');
  const wallet = await Wallet.fromEncryptedJson(json, password);
  out({
    ok: true,
    address: wallet.address,
    private_key: flags.has('reveal') ? wallet.privateKey : '[hidden, use --reveal to show]',
  });
}

export async function batchExportKeystore(args, flags) {
  const csv = args['csv'];
  if (!csv) die('need --csv');
  const outDir = args['out-dir'] ?? './keystores';
  const password = args['password'] ?? readPasswordFromStdinSync('Keystore password (used for all): ');
  if (!password) die('password is empty');
  const { loadColumn } = await import('./csv.js');
  const pks = loadColumn(csv, 'private_key');
  if (!pks.length) die('CSV is empty');
  const scryptN = Number(args['scrypt-n'] ?? (1 << 15));
  const results = [];
  for (let i = 0; i < pks.length; i++) {
    const w = new Wallet(pks[i].startsWith('0x') ? pks[i] : `0x${pks[i]}`);
    const json = await encryptKeystoreJson(
      { address: w.address, privateKey: w.privateKey },
      password,
      { scrypt: { N: scryptN } }
    );
    const file = `${outDir}/${i + 1}-${w.address}.json`;
    writeFileSecure(file, json, 0o600);
    results.push({ index: i + 1, address: w.address, file });
    console.error(`[${i + 1}/${pks.length}] ${w.address} -> ${file}`);
  }
  out({ ok: true, count: results.length, out_dir: outDir });
}
