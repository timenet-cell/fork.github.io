/**
 * fork.ledger-proof/1 — espelho de `proof.rs`: a prova de que uma entrada está no registo,
 * verificável fora de linha menos um `getTransaction`. Checkpoint e selo são entradas
 * assinadas pela chave de checkpoint da Fork (`ledger.checkpoint_pubkey`, de `platform_settings`,
 * nunca da própria prova). Nada aqui toca na rede nem assina.
 */
import { LedgerError, schema } from './error.js';
import { equalBytes, parseHex32, toHex } from './bytes.js';
import { base58Decode, base58Encode } from './base58.js';
import { opensHex, openingFromHex,              } from './commit.js';
import {
  exactObject, signedFromValue, signedToValue, verifySigned,                  
} from './entry.js';
import { canonicalJson, newObject, parseStrict,                 } from './json.js';
import { MAX_PATH_LEN, verifyInclusion } from './merkle.js';

export const PROOF_SCHEMA = 'fork.ledger-proof/1';
/** O memo do selo começa por isto (o mesmo domínio das assinaturas, sem os dois pontos). */
export const MEMO_PREFIX = 'fork-ledger/1';
export const NETWORKS = ['devnet', 'mainnet']         ;
export const MAX_PROOF_BYTES = 1 << 20;
export const MAX_CHAIN = 550;

const PROOF_FIELDS = ['checkpoints', 'entry', 'inclusion', 'openings', 'schema', 'seal'];
const INCLUSION_FIELDS = ['index', 'path'];
const OPENING_FIELDS = ['field', 'hash', 'salt'];
const CHECKPOINT_FIELDS = ['count', 'day', 'prev_checkpoint', 'root'];
const SEAL_FIELDS = ['network', 'slot', 'tx_signature'];

const isUint = (n         )              => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

// ── Formas ─────────────────────────────────────────────────────────────────

/** AAAA-MM-DD, uma data que existe no calendário gregoriano (anos 1970–9999). */
export function checkDay(day        )       {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(day);
  const bad = ()              => schema(`day ${JSON.stringify(day)} is not a YYYY-MM-DD date`);
  if (!m) throw bad();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]                            ;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (dim === undefined || y < 1970 || d === 0 || d > dim) throw bad();
}

function checkNetwork(n        )       {
  if (!(NETWORKS                     ).includes(n)) throw schema(`network ${JSON.stringify(n)} is not one of ${NETWORKS.join(', ')}`);
}

/** Assinatura Solana: base58 de exatamente 64 bytes, na única grafia possível. */
function checkTxSignature(s        )       {
  const v = s.length <= 88 ? base58Decode(s) : null;
  if (!v || v.length !== 64 || base58Encode(v) !== s) throw schema('tx_signature is not a base58 Solana signature');
}

// ── Checkpoint ─────────────────────────────────────────────────────────────

                             
                                                                      
             
              
                
                   
                          
 

/** O body de uma entrada `checkpoint` (para quem fecha o dia, L7). */
export function checkpointBody(day        , count        , root            , prev                   )             {
  checkDay(day);
  if (!isUint(count)) throw schema('count is beyond 2^53-1');
  const m = newObject();
  m.count = count;
  m.day = day;
  m.prev_checkpoint = prev ? toHex(prev) : null;
  m.root = toHex(root);
  return m;
}

/** Lê e confere um checkpoint: entrada válida, da chave `key`, tipo e corpo certos. */
export async function checkpointFromEntry(e             , key            )                      {
  await verifySigned(e);
  if (e.entry.author !== toHex(key)) throw new LedgerError('untrusted_key');
  if (e.entry.kind !== 'checkpoint') throw schema(`a checkpoint has kind ${JSON.stringify(e.entry.kind)}`);
  const b = e.entry.body;
  const keys = Object.keys(b).filter((k) => k !== 'equivocations').sort();
  if (keys.length !== CHECKPOINT_FIELDS.length || keys.some((k, i) => k !== CHECKPOINT_FIELDS[i])) {
    throw schema(`checkpoint body fields are ${JSON.stringify(keys)}, expected ${JSON.stringify(CHECKPOINT_FIELDS)}`);
  }
  if (b.equivocations !== undefined && !Array.isArray(b.equivocations)) throw schema('checkpoint equivocations is not an array');
  const day = b.day;
  if (typeof day !== 'string') throw schema('checkpoint day is not a string');
  checkDay(day);
  const count = b.count;
  if (!isUint(count)) throw schema('checkpoint count is not a non-negative integer');
  const root = typeof b.root === 'string' ? parseHex32(b.root) : null;
  if (!root) throw schema('checkpoint root is not 64 lowercase hex');
  let prev                    = null;
  if (b.prev_checkpoint !== null) {
    if (typeof b.prev_checkpoint !== 'string') throw schema('prev_checkpoint is not a string or null');
    prev = parseHex32(b.prev_checkpoint);
    if (!prev) throw schema('prev_checkpoint is not an entry id');
  }
  return { id: e.id, day, count, root, prev };
}

/** O texto do memo que sela este checkpoint na rede `network`. */
export function sealMemo(network        , cp            )         {
  checkNetwork(network);
  const prev = cp.prev ? toHex(cp.prev) : '0'.repeat(64);
  return `${MEMO_PREFIX} ${network} ${cp.day} ${cp.count} ${toHex(cp.root)} ${prev}`;
}

// ── Selo ───────────────────────────────────────────────────────────────────

                                                                                                             

/** O body de uma entrada `seal` (para quem sela, L10). Os refs são [id do checkpoint]. */
export function sealBody(network        , txSignature        , slot        )             {
  checkNetwork(network);
  checkTxSignature(txSignature);
  if (!isUint(slot)) throw schema('slot is beyond 2^53-1');
  const m = newObject();
  m.network = network;
  m.slot = slot;
  m.tx_signature = txSignature;
  return m;
}

export async function sealFromEntry(e             , key            )                {
  await verifySigned(e);
  if (e.entry.author !== toHex(key)) throw new LedgerError('untrusted_key');
  if (e.entry.kind !== 'seal') throw new LedgerError('bad_seal', `the seal has kind ${JSON.stringify(e.entry.kind)}`);
  if (e.entry.refs.length !== 1) throw new LedgerError('bad_seal', 'a seal refers to exactly one checkpoint');
  const b = e.entry.body;
  const keys = Object.keys(b).sort();
  if (keys.length !== SEAL_FIELDS.length || keys.some((k, i) => k !== SEAL_FIELDS[i])) {
    throw schema(`seal body fields are ${JSON.stringify(keys)}, expected ${JSON.stringify(SEAL_FIELDS)}`);
  }
  if (typeof b.network !== 'string') throw schema('seal network is not a string');
  checkNetwork(b.network);
  if (typeof b.tx_signature !== 'string') throw schema('seal tx_signature is not a string');
  checkTxSignature(b.tx_signature);
  if (!isUint(b.slot)) throw schema('seal slot is not a non-negative integer');
  return { id: e.id, checkpoint: e.entry.refs[0] , network: b.network, tx_signature: b.tx_signature, slot: b.slot };
}

// ── Prova ──────────────────────────────────────────────────────────────────

                                                                 

                        
                     
                
                     
                             
                           
                           
 

/** O que a prova deixa por ver na cadeia: a transação, o slot e o memo que ela tem de levar. */
                                                                                                

                           
                   
                                                        
              
                        
                         
                                                                   
                         
                                                           
                                            
 

/** Confere tudo menos a transação na Solana, com a chave de checkpoint da Fork. */
export async function verifyProof(p       , checkpointKey            )                    {
  await verifySigned(p.entry);
  if (p.checkpoints.length === 0) throw schema("a proof needs the checkpoint of the entry's day");
  if (p.checkpoints.length > MAX_CHAIN) throw schema(`more than ${MAX_CHAIN} checkpoints`);
  if (p.path.length > MAX_PATH_LEN) throw new LedgerError('bad_path');
  const cps               = [];
  for (const c of p.checkpoints) cps.push(await checkpointFromEntry(c, checkpointKey));

  const first = cps[0] ;
  const id = parseHex32(p.entry.id);
  if (!id) throw schema('entry id is not 64 lowercase hex');
  if (!Number.isSafeInteger(p.index) || p.index < 0) throw new LedgerError('bad_path');
  verifyInclusion(id, BigInt(p.index), BigInt(first.count), p.path, first.root);

  for (let i = 1; i < cps.length; i++) {
    const a = cps[i - 1] ;
    const b = cps[i] ;
    if (b.prev === null || !equalBytes(b.prev, parseHex32(a.id) )) {
      throw new LedgerError('bad_chain', `checkpoint of ${b.day} does not point to the one of ${a.day}`);
    }
    if (b.day <= a.day) throw new LedgerError('bad_chain', `day ${b.day} does not come after ${a.day}`);
  }
  const last = cps[cps.length - 1] ;

  let seal                   = null;
  if (p.seal) {
    const s = await sealFromEntry(p.seal, checkpointKey);
    if (s.checkpoint !== last.id) throw new LedgerError('bad_seal', 'the seal is not of the last checkpoint');
    seal = { network: s.network, tx_signature: s.tx_signature, slot: s.slot, memo: sealMemo(s.network, last) };
  }

  const opened                                    = [];
  for (const o of p.openings) {
    if (opened.some((x) => x.field === o.field)) throw new LedgerError('bad_opening', `${o.field} is opened twice`);
    const c = Object.hasOwn(p.entry.entry.body, o.field) ? p.entry.entry.body[o.field] : undefined;
    if (typeof c !== 'string') throw new LedgerError('bad_opening', `the entry has no commitment ${JSON.stringify(o.field)}`);
    if (!opensHex(o.opening, c)) throw new LedgerError('bad_opening', `salt and hash do not open ${o.field}`);
    opened.push({ field: o.field, hash: toHex(o.opening.hash) });
  }

  return { entry_id: p.entry.id, day: first.day, checkpoint_id: last.id, checkpoint_day: last.day, seal, opened };
}

/** O JSON canónico da prova (o ficheiro de "Download proof"). */
export function proofToJson(p       )         {
  const inclusion = newObject();
  inclusion.index = p.index;
  inclusion.path = p.path.map(toHex);
  const m = newObject();
  m.checkpoints = p.checkpoints.map(signedToValue);
  m.entry = signedToValue(p.entry);
  m.inclusion = inclusion;
  m.openings = p.openings.map((o) => {
    const x = newObject();
    x.field = o.field;
    x.hash = toHex(o.opening.hash);
    x.salt = toHex(o.opening.salt);
    return x;
  });
  m.schema = PROOF_SCHEMA;
  m.seal = p.seal ? signedToValue(p.seal) : null;
  const s = canonicalJson(m);
  if (new TextEncoder().encode(s).length > MAX_PROOF_BYTES) throw new LedgerError('too_large', `${s.length} bytes`);
  return s;
}

/** Lê a forma da prova (cada entrada já sai verificada). Não diz que a prova vale: isso é `verifyProof`. */
export async function proofFromJson(s        )                 {
  const v = parseStrict(s, MAX_PROOF_BYTES);
  const m = exactObject(v, PROOF_FIELDS, 'proof');
  if (m.schema !== PROOF_SCHEMA) throw schema(`proof schema is not ${PROOF_SCHEMA}`);
  const inc = exactObject(m.inclusion, INCLUSION_FIELDS, 'inclusion');
  const index = inc.index;
  if (!isUint(index)) throw schema('inclusion index is not a non-negative integer');
  const rawPath = inc.path;
  if (!Array.isArray(rawPath)) throw schema('inclusion path is not an array');
  if (rawPath.length > MAX_PATH_LEN) throw new LedgerError('bad_path');
  const path = rawPath.map((x) => {
    const h = typeof x === 'string' ? parseHex32(x) : null;
    if (!h) throw schema('a path hash is not 64 lowercase hex');
    return h;
  });
  const rawCps = m.checkpoints;
  if (!Array.isArray(rawCps)) throw schema('checkpoints is not an array');
  if (rawCps.length > MAX_CHAIN) throw schema(`more than ${MAX_CHAIN} checkpoints`);
  const checkpoints                = [];
  for (const c of rawCps) checkpoints.push(await signedFromValue(c));
  const seal = m.seal === null ? null : await signedFromValue(m.seal );
  const rawOpenings = m.openings;
  if (!Array.isArray(rawOpenings)) throw schema('openings is not an array');
  const openings = rawOpenings.map((o)               => {
    const x = exactObject(o, OPENING_FIELDS, 'opening');
    const text = (k        )         => {
      const t = x[k];
      if (typeof t !== 'string') throw schema(`opening ${k} is not a string`);
      return t;
    };
    return { field: text('field'), opening: openingFromHex(text('salt'), text('hash')) };
  });
  return { entry: await signedFromValue(m.entry ), index, path, checkpoints, seal, openings };
}

/** Lê e verifica uma prova em JSON. */
export async function verifyProofJson(s        , checkpointKey            )                    {
  return verifyProof(await proofFromJson(s), checkpointKey);
}
