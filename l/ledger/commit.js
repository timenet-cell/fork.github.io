/**
 * Compromissos com sal (`commit.rs`): commit = SHA-256("fork-commit/1" ‖ sal ‖ hash).
 * Sal e hash têm 32 bytes. O sal é segredo até o dono o querer mostrar.
 */
import { LedgerError, schema } from './error.js';
import { concat, equalBytes, parseHex32, sha256, toHex, utf8 } from './bytes.js';

export const COMMIT_DOMAIN = utf8('fork-commit/1');

export function commit(salt            , hash            )             {
  if (salt.length !== 32 || hash.length !== 32) throw new LedgerError('bad_schema', 'salt and hash are 32 bytes');
  return sha256(concat(COMMIT_DOMAIN, salt, hash));
}

                                                               

/** Sal e hash em hex minúsculo (64 cada), como se guardam fora do registo. */
export function openingFromHex(saltHex        , hashHex        )          {
  const salt = parseHex32(saltHex);
  const hash = parseHex32(hashHex);
  if (!salt) throw schema('salt is not 64 lowercase hex');
  if (!hash) throw schema('hash is not 64 lowercase hex');
  return { salt, hash };
}

/** Um sal novo, do gerador do sistema, para `hash`. */
export function newOpening(hash            )          {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return { salt, hash };
}

export const commitHex = (o         )         => toHex(commit(o.salt, o.hash));

/** Abre `commitmentHex`? Hex que não é de 32 bytes minúsculos: não abre. */
export function opensHex(o         , commitmentHex        )          {
  const c = parseHex32(commitmentHex);
  return c !== null && equalBytes(commit(o.salt, o.hash), c);
}
