/**
 * A árvore do dia (`merkle.rs`), RFC 6962 §2.1: folha = SHA-256(0x00 ‖ id), nó = SHA-256(0x01 ‖ esq ‖ dir),
 * MTH({}) = SHA-256(""). Caminho verificado como no RFC 9162 §2.1.3.2 (recusa caminhos a mais ou a menos).
 * Índice e tamanho são BigInt: o tamanho do checkpoint vai até 2^53−1 e os operadores de bits do JS são de 32.
 */
import { LedgerError, schema } from './error.js';
import { concat, equalBytes, sha256 } from './bytes.js';

/** Nenhuma árvore com tamanho ≤ 2^53−1 tem um caminho mais comprido. */
export const MAX_PATH_LEN = 53;

export const leafHash = (data            )             => sha256(concat(Uint8Array.of(0), data));
export const nodeHash = (l            , r            )             => sha256(concat(Uint8Array.of(1), l, r));

/** A maior potência de 2 estritamente menor que n (n ≥ 2). */
function split(n        )         {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

export function rootOfLeaves(leaves              )             {
  if (leaves.length === 0) return sha256(new Uint8Array());
  if (leaves.length === 1) return leaves[0] ;
  const k = split(leaves.length);
  return nodeHash(rootOfLeaves(leaves.slice(0, k)), rootOfLeaves(leaves.slice(k)));
}

/** PATH(m, D[n]) do RFC 6962 §2.1.1: os irmãos, da folha para cima. */
export function pathOfLeaves(leaves              , index        )               {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new LedgerError('bad_path');
  const out               = [];
  let lo = 0;
  let hi = leaves.length;
  let m = index;
  while (hi - lo > 1) {
    const k = split(hi - lo);
    if (m < k) {
      out.push(rootOfLeaves(leaves.slice(lo + k, hi)));
      hi = lo + k;
    } else {
      out.push(rootOfLeaves(leaves.slice(lo, lo + k)));
      lo += k;
      m -= k;
    }
  }
  return out.reverse();
}

/** A raiz a que um caminho leva, ou null se o caminho não tem o comprimento certo para (index, size). */
export function rootFromPath(leaf            , index        , size        , path              )                    {
  if (index >= size || path.length > MAX_PATH_LEN) return null;
  let fnode = index;
  let snode = size - 1n;
  let r = leaf;
  for (const p of path) {
    if (snode === 0n) return null;
    if ((fnode & 1n) === 1n || fnode === snode) {
      r = nodeHash(p, r);
      while ((fnode & 1n) === 0n && fnode !== 0n) {
        fnode >>= 1n;
        snode >>= 1n;
      }
    } else {
      r = nodeHash(r, p);
    }
    fnode >>= 1n;
    snode >>= 1n;
  }
  return snode === 0n ? r : null;
}

const compare = (a            , b            )         => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]  - b[i] ;
  return 0;
};

/** As entradas do dia na ordem do lote: por id (bytes), sem repetidos. Ordena no lugar. */
export function batchOrder(ids              )       {
  ids.sort(compare);
  for (let i = 1; i < ids.length; i++) {
    if (equalBytes(ids[i - 1] , ids[i] )) throw schema('an entry id appears twice in the batch');
  }
}

function batchLeaves(ids              )               {
  for (let i = 1; i < ids.length; i++) {
    if (compare(ids[i - 1] , ids[i] ) >= 0) throw schema('batch ids are not in strictly increasing order');
  }
  return ids.map(leafHash);
}

/** A raiz do lote (ids já em `batchOrder`). Lote vazio = SHA-256(""). */
export const batchRoot = (ids              )             => rootOfLeaves(batchLeaves(ids));

/** O caminho de inclusão do id na posição `index` do lote. */
export const batchPath = (ids              , index        )               => pathOfLeaves(batchLeaves(ids), index);

/** O id está na posição `index` da árvore de `size` folhas com esta raiz? Faz ele próprio o hash de folha. */
export function verifyInclusion(id            , index        , size        , path              , root            )       {
  const r = rootFromPath(leafHash(id), index, size, path);
  if (r === null || !equalBytes(r, root)) throw new LedgerError('bad_path');
}
