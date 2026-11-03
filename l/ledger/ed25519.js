/**
 * Ed25519 estrito, como o `verify_strict` do ed25519-dalek que o Rust usa: a chave tem de ser
 * um ponto da curva, na codificação canónica e de ordem não pequena; R também não pode ser de
 * ordem pequena; S < L (sem maleabilidade). A equação em si é do WebCrypto (`crypto.subtle`,
 * que corre no Node, no Deno e na webview). Aritmética da curva em BigInt, só para as conferências.
 */
import { LedgerError } from './error.js';

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const D = (-121665n * inv(121666n)) % P;
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

function mod(a        )         {
  const r = a % P;
  return r >= 0n ? r : r + P;
}

function pow(b        , e        )         {
  let r = 1n;
  let x = b % P;
  while (e > 0n) {
    if (e & 1n) r = (r * x) % P;
    x = (x * x) % P;
    e >>= 1n;
  }
  return r;
}

function inv(a        )         {
  return pow(((a % P) + P) % P, P - 2n);
}

                                        
const IDENTITY        = { x: 0n, y: 1n };

function add(a       , b       )        {
  const k = mod(D * a.x * b.x * a.y * b.y);
  return {
    x: mod((a.x * b.y + b.x * a.y) * inv(1n + k)),
    y: mod((a.y * b.y + a.x * b.x) * inv(1n - k)),
  };
}

const littleEndian = (b            )         => {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i] );
  return n;
};

/** Descomprime; `canonical` diz se a codificação é a única do ponto (y < p e sem sinal em x = 0). */
function decompress(b            )                                              {
  if (b.length !== 32) return null;
  const sign = (b[31]  >> 7) & 1;
  const copy = Uint8Array.from(b);
  copy[31] = copy[31]  & 0x7f;
  const y = littleEndian(copy);
  const yr = y % P;
  const y2 = (yr * yr) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  let x = (u * pow(v, 3n) * pow(u * pow(v, 7n), (P - 5n) / 8n)) % P;
  const vx2 = mod(v * x * x);
  if (vx2 !== u) {
    if (vx2 !== mod(-u)) return null;
    x = (x * SQRT_M1) % P;
  }
  if (Number(x & 1n) !== sign) x = mod(-x);
  const canonical = y < P && !(x === 0n && sign === 1);
  return { point: { x, y: yr }, canonical };
}

const isSmallOrder = (p       )          => {
  let q = p;
  for (let i = 0; i < 3; i++) q = add(q, q);
  return q.x === IDENTITY.x && q.y === IDENTITY.y;
};

/** A chave do autor: ponto válido, não fraco, codificação canónica. Recusa com `bad_author`. */
export function checkAuthorKey(key            )       {
  const d = decompress(key);
  if (!d) throw new LedgerError('bad_author', 'not a point on the curve');
  if (isSmallOrder(d.point)) throw new LedgerError('bad_author', 'small-order key');
  if (!d.canonical) throw new LedgerError('bad_author', 'non-canonical encoding');
}

/** `verify_strict`. Devolve false se a assinatura não vale; a chave já deve ter passado `checkAuthorKey`. */
export async function verifyStrict(key            , message            , sig            )                   {
  if (sig.length !== 64) return false;
  if (littleEndian(sig.subarray(32)) >= L) return false;
  const r = decompress(sig.subarray(0, 32));
  if (!r || isSmallOrder(r.point)) return false;
  try {
    const k = await crypto.subtle.importKey('raw', key                , { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, k, sig                , message                );
  } catch {
    return false;
  }
}
