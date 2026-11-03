/**
 * fork.ledger/1 — espelho de `entry.rs`. Entrada com campos
 * { schema, kind, author, seq, prev, refs, body, claimed_at }; id = SHA-256(canónico);
 * assinatura Ed25519 do autor sobre "fork-ledger/1:" ‖ id (hex). Mesmos bytes, mesmos ids e
 * os mesmos códigos de recusa que o Rust (vetores em ../testdata/ledger_vectors.json).
 * Não guarda chaves: quem assina passa uma função (`signEntry`).
 */
import { LedgerError, schema } from './error.js';
import { isHex32, parseHex32, fromHex, sha256, toHex, utf8 } from './bytes.js';
import { checkAuthorKey, verifyStrict } from './ed25519.js';
import {
  canonicalJson, isObject, MAX_SAFE_INTEGER, newObject, parseStrict,                                 
} from './json.js';

export const LEDGER_SCHEMA = 'fork.ledger/1';
/** Prefixo da mensagem assinada (texto ASCII, antes do id em hex). */
export const SIG_DOMAIN = 'fork-ledger/1:';
export const MAX_ENTRY_BYTES = 4096;
const MAX_BODY_DEPTH = 8;
const ENTRY_FIELDS = ['author', 'body', 'claimed_at', 'kind', 'prev', 'refs', 'schema', 'seq'];
const SIGNED_FIELDS = ['entry', 'id', 'sig'];

export { MAX_SAFE_INTEGER };

export const KINDS = [
  'key_bind', 'key_rotate', 'creation', 'publication', 'credit_claim', 'credit_confirm', 'credit_dispute',
  'credit_withdraw', 'credit_resolve', 'agreement', 'agreement_sign', 'sale', 'transfer', 'revocation',
  'tombstone', 'checkpoint', 'seal', 'timestamp',
]         ;
                                          
const isKind = (s        )            => (KINDS                     ).includes(s);

                        
                 
             
                                                           
                 
                                           
              
                                                                 
                      
                 
                   
                                                       
                     
 

                                                                      

export function newEntry(
  kind      , author            , seq        , prev               , refs          , body            , claimedAt        ,
)        {
  return { schema: LEDGER_SCHEMA, kind, author: toHex(author), seq, prev, refs, body, claimed_at: claimedAt };
}

export function entryToValue(e       )             {
  const m = newObject();
  m.author = e.author;
  m.body = e.body;
  m.claimed_at = e.claimed_at;
  m.kind = e.kind;
  m.prev = e.prev;
  m.refs = e.refs;
  m.schema = e.schema;
  m.seq = e.seq;
  return m;
}

export function signedToValue(s             )             {
  const m = newObject();
  m.entry = entryToValue(s.entry);
  m.id = s.id;
  m.sig = s.sig;
  return m;
}

const isUint = (n         )              => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

function checkBody(m            , depth        )       {
  for (const [k, v] of Object.entries(m)) {
    if (!/^[a-z0-9_]{1,64}$/.test(k)) throw schema(`body key ${JSON.stringify(k)} is not [a-z0-9_]{1,64}`);
    checkBodyValue(v, depth);
  }
}

function checkBodyValue(v           , depth        )       {
  if (depth > MAX_BODY_DEPTH) throw schema('body is nested too deep');
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new LedgerError('bad_json', `${v} is not an integer within ±(2^53-1)`);
    return;
  }
  if (typeof v === 'string') {
    if (!/^[\x20-\x7e]*$/.test(v)) throw schema('body text must be printable ASCII');
    return;
  }
  if (Array.isArray(v)) { v.forEach((x) => checkBodyValue(x, depth + 1)); return; }
  checkBody(v, depth + 1);
}

function checkShape(e       )       {
  if (e.schema !== LEDGER_SCHEMA) throw schema(`schema ${JSON.stringify(e.schema)} is not ${LEDGER_SCHEMA}`);
  if (!isHex32(e.author)) throw schema('author is not 64 lowercase hex');
  if (!Number.isSafeInteger(e.seq) || e.seq < 1) throw schema('seq must be from 1 to 2^53-1');
  if (!isUint(e.claimed_at)) throw schema('claimed_at must be an integer from 0 to 2^53-1');
  if (e.prev === null) {
    if (e.seq !== 1) throw schema('prev is required after the first entry');
  } else if (e.seq === 1) throw schema('the first entry of an author has no prev');
  else if (!isHex32(e.prev)) throw schema('prev is not an entry id');
  const seen = new Set        ();
  for (const r of e.refs) {
    if (!isHex32(r)) throw schema('a ref is not an entry id');
    if (seen.has(r)) throw schema('a ref appears twice');
    seen.add(r);
  }
  checkBody(e.body, 1);
}

/** Forma da §1.1, tamanho e chave do autor. Não sabe nada do resto do registo. */
export function validateEntry(e       )       {
  checkShape(e);
  const n = utf8(canonicalJson(entryToValue(e))).length;
  if (n > MAX_ENTRY_BYTES) throw new LedgerError('too_large', `${n} bytes`);
  checkAuthorKey(parseHex32(e.author) );
}

/** O JSON canónico, depois de validar a entrada. */
export function entryCanonical(e       )         {
  validateEntry(e);
  return canonicalJson(entryToValue(e));
}

/** SHA-256(canónico) em hex minúsculo. */
export const entryId = (e       )         => toHex(sha256(utf8(entryCanonical(e))));

/** A mensagem que o autor assina: "fork-ledger/1:" ‖ id em hex minúsculo. */
export const signingMessage = (idHex        )             => utf8(SIG_DOMAIN + idHex);

/**
 * Forma, tamanho, id = SHA-256 do canónico, e a assinatura do autor (estrita).
 * Não precisa de nada além da própria entrada.
 */
export async function verifySigned(s             )                {
  validateEntry(s.entry);
  if (!isHex32(s.id)) throw schema('id is not 64 lowercase hex');
  if (entryId(s.entry) !== s.id) throw new LedgerError('bad_id');
  const sig = s.sig.length === 128 ? fromHex(s.sig) : null;
  if (!sig) throw schema('sig is not 128 lowercase hex');
  const ok = await verifyStrict(parseHex32(s.entry.author) , signingMessage(s.id), sig);
  if (!ok) throw new LedgerError('bad_signature');
}

/** Assina com a chave do autor: `sign` recebe a mensagem e devolve 64 bytes. Outra chave: recusado. */
export async function signEntry(e       , sign                                                           )                       {
  const id = entryId(e);
  const s              = { id, entry: e, sig: toHex(await sign(signingMessage(id))) };
  await verifySigned(s);
  return s;
}

export function exactObject(v                       , fields                   , what        )             {
  if (v === undefined || !isObject(v)) throw schema(`${what} is not an object`);
  const keys = Object.keys(v).sort();
  if (keys.length !== fields.length || keys.some((k, i) => k !== fields[i])) {
    throw schema(`${what} fields are ${JSON.stringify(keys)}, expected ${JSON.stringify(fields)}`);
  }
  return v;
}

function entryFromValue(v           )        {
  const m = exactObject(v, ENTRY_FIELDS, 'entry');
  const text = (k        )         => {
    const x = m[k];
    if (typeof x !== 'string') throw schema(`${k} is not a string`);
    return x;
  };
  const int = (k        )         => {
    const x = m[k];
    if (!isUint(x)) throw schema(`${k} is not a non-negative integer`);
    return x;
  };
  const kindS = text('kind');
  if (!isKind(kindS)) throw schema(`unknown kind ${JSON.stringify(kindS)}`);
  const prevV = m.prev;
  if (prevV !== null && typeof prevV !== 'string') throw schema('prev is not a string or null');
  const refsV = m.refs;
  if (!Array.isArray(refsV)) throw schema('refs is not an array');
  const refs = refsV.map((r) => {
    if (typeof r !== 'string') throw schema('a ref is not a string');
    return r;
  });
  const body = m.body;
  if (body === undefined || !isObject(body)) throw schema('body is not an object');
  return { schema: text('schema'), kind: kindS, author: text('author'), seq: int('seq'), prev: prevV ?? null, refs, body, claimed_at: int('claimed_at') };
}

/** Como `SignedEntry::from_value`: forma exata e verificação completa. */
export async function signedFromValue(v           )                       {
  const m = exactObject(v, SIGNED_FIELDS, 'signed entry');
  const text = (k        )         => {
    const x = m[k];
    if (typeof x !== 'string') throw schema(`${k} is not a string`);
    return x;
  };
  const id = text('id');
  const entry = entryFromValue(m.entry );
  const s              = { id, entry, sig: text('sig') };
  await verifySigned(s);
  return s;
}

/** Lê e verifica uma entrada assinada em JSON com qualquer ordem e espaços. */
export async function signedFromJson(s        )                       {
  return signedFromValue(parseStrict(s));
}

/** {"entry":…,"id":…,"sig":…} canónico (a forma dos lotes .fkl), depois de verificar. */
export async function signedCanonical(s             )                  {
  await verifySigned(s);
  return canonicalJson(signedToValue(s));
}

/** Como `signedFromJson`, mas os bytes têm de ser exatamente os canónicos (lotes, réplicas). */
export async function signedFromCanonical(s        )                       {
  const e = await signedFromJson(s);
  if (canonicalJson(signedToValue(e)) !== s) throw new LedgerError('not_canonical');
  return e;
}
