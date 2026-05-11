import { readFileSync, existsSync } from 'node:fs';
import { Wallet } from 'ethers';
import { loadColumn } from './csv.js';
import { die, readPasswordFromStdinSync } from './util.js';

function trimPk(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.startsWith('0x') || t.startsWith('0X') ? t : `0x${t}`;
}

export async function loadOnePk(args, flags) {
  if (args['pk']) return trimPk(args['pk']);

  if (args['pk-file']) {
    if (!existsSync(args['pk-file'])) die(`pk-file not found: ${args['pk-file']}`);
    return trimPk(readFileSync(args['pk-file'], 'utf8').split(/\r?\n/)[0]);
  }

  if (args['pk-env']) {
    const v = process.env[args['pk-env']];
    if (!v) die(`env var ${args['pk-env']} is empty`);
    return trimPk(v);
  }

  if (args['keystore']) {
    if (!existsSync(args['keystore'])) die(`keystore not found: ${args['keystore']}`);
    const json = readFileSync(args['keystore'], 'utf8');
    let password = args['password'] ?? '';
    if (!password && args['password-env']) password = process.env[args['password-env']] ?? '';
    if (!password) password = readPasswordFromStdinSync('Keystore password: ');
    const wallet = await Wallet.fromEncryptedJson(json, password);
    return wallet.privateKey;
  }

  if (process.env.EVM_PK) return trimPk(process.env.EVM_PK);

  die('need --pk | --pk-file | --pk-env | --keystore');
}

export async function loadManyPks(args, flags) {
  if (args['csv']) {
    return loadColumn(args['csv'], 'private_key').map(trimPk);
  }
  if (args['pk-list']) {
    if (!existsSync(args['pk-list'])) die(`pk-list not found: ${args['pk-list']}`);
    return readFileSync(args['pk-list'], 'utf8')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(trimPk);
  }
  return [await loadOnePk(args, flags)];
}
