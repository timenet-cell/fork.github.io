/**
 * O lote de um dia em ficheiro (`.fkl`) — espelho de `batch.rs` (onda L8): texto UTF-8, uma linha JSON canónica por linha,
 * cada uma terminada em `\n`: cabeçalho `{count, day, schema}`, as N entradas assinadas por id crescente, e o rodapé
 * `{checkpoint, entry_day, equivocations}`. A entrada `checkpoint` do dia D cai num dia posterior (`entry_day`), por isso o
 * rodapé leva-a inteira. Os mesmos dados dão sempre os mesmos bytes. Vetores: ../testdata/ledger_batch_vectors.json.
 */
import { LedgerError, schema } from './error.js';
import { parseHex32 } from './bytes.js';
import {
  exactObject, signedFromCanonical, signedFromValue, signedToValue, verifySigned,                  
} from './entry.js';
import { canonicalJson, parseStrict, newObject, MAX_SAFE_INTEGER,                                 } from './json.js';
import { batchRoot } from './merkle.js';
import { checkDay, checkpointFromEntry,                 } from './proof.js';
import { equalBytes, toHex } from './bytes.js';

export const BATCH_SCHEMA = 'fork.ledger-batch/1';
export const MAX_BATCH_ENTRIES = 1_000_000;
const MAX_LINE = 16 * 1024;
const HEADER_FIELDS = ['count', 'day', 'schema'];
const TRAILER_FIELDS = ['checkpoint', 'entry_day', 'equivocations'];

/** Um dia fechado: as suas entradas, por id, e o checkpoint que o fechou. */
                        
              
                                         
                         
                                                                                      
                          
                                                                                              
                        
                                                                    
                             
 

/** Ordena as entradas por id e confere o lote inteiro contra a chave de checkpoint. */
export async function newBatch(
  day        , entries               , checkpoint             , checkpointDay        , equivocations             ,
  checkpointKey            ,
)                 {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const b        = { day, entries: sorted, checkpoint, checkpointDay, equivocations };
  await verifyBatch(b, checkpointKey);
  return b;
}

/** O checkpoint do dia, já lido e conferido contra a chave. */
export const batchCheckpoint = (b       , checkpointKey            )                      => checkpointFromEntry(b.checkpoint, checkpointKey);

/** Entradas válidas e assinadas, por id estritamente crescente, contagem e raiz iguais às do checkpoint (da chave certa, deste dia, posterior). */
export async function verifyBatch(b       , checkpointKey            )                {
  checkDay(b.day);
  checkDay(b.checkpointDay);
  if (b.checkpointDay <= b.day) throw new LedgerError('bad_chain', 'the checkpoint entry cannot predate the end of its day');
  if (b.entries.length > MAX_BATCH_ENTRIES) throw schema('batch has too many entries');
  const cp = await batchCheckpoint(b, checkpointKey);
  if (cp.day !== b.day) throw new LedgerError('bad_chain', `checkpoint is for ${cp.day} but the batch is ${b.day}`);
  const ids               = [];
  for (const e of b.entries) {
    await verifySigned(e);
    const id = parseHex32(e.id);
    if (!id) throw schema('id is not 64 lowercase hex');
    ids.push(id);
  }
  const root = batchRoot(ids); // recusa ids fora de ordem ou repetidos
  if (cp.count !== ids.length) throw new LedgerError('bad_chain', `checkpoint counts ${cp.count} entries, the batch has ${ids.length}`);
  if (!equalBytes(cp.root, root)) throw new LedgerError('bad_chain', 'checkpoint root differs from the root of the batch');
}

/** Os bytes do ficheiro (o `Batch` vem de `newBatch` ou `batchFromFkl`, já conferido). */
export function batchToFkl(b       )         {
  const head = newObject();
  head.count = b.entries.length;
  head.day = b.day;
  head.schema = BATCH_SCHEMA;
  const tail = newObject();
  tail.checkpoint = signedToValue(b.checkpoint);
  tail.entry_day = b.checkpointDay;
  tail.equivocations = b.equivocations;
  let out = `${canonicalJson(head)}\n`;
  for (const e of b.entries) out += `${canonicalJson(signedToValue(e))}\n`;
  return `${out}${canonicalJson(tail)}\n`;
}

function lineValue(line        )            {
  const v = parseStrict(line, MAX_LINE);
  if (canonicalJson(v) !== line) throw new LedgerError('not_canonical');
  return v;
}

/** Lê um `.fkl`: bytes exatamente canónicos, uma linha de cada vez, tudo conferido. */
export async function batchFromFkl(text        , checkpointKey            )                 {
  if (!text.endsWith('\n')) throw new LedgerError('not_canonical');
  const lines = text.slice(0, -1).split('\n');
  const m = exactObject(lineValue(lines[0] ), HEADER_FIELDS, 'batch header');
  if (m.schema !== BATCH_SCHEMA) throw schema(`batch schema is not ${BATCH_SCHEMA}`);
  const count = m.count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw schema('batch count is not a non-negative integer');
  if (count > MAX_BATCH_ENTRIES || count > MAX_SAFE_INTEGER) throw schema('batch has too many entries');
  if (typeof m.day !== 'string') throw schema('batch day is not a string');
  const rest = lines.slice(1);
  if (rest.length !== count + 1) throw schema(`batch header counts ${count} entries but the file has ${rest.length} lines after it`);
  const entries                = [];
  for (const l of rest.slice(0, -1)) entries.push(await signedFromCanonical(l));
  const t = exactObject(lineValue(rest[rest.length - 1] ), TRAILER_FIELDS, 'batch trailer');
  const checkpoint = await signedFromValue(t.checkpoint );
  if (typeof t.entry_day !== 'string') throw schema('entry_day is not a string');
  if (!Array.isArray(t.equivocations)) throw schema('equivocations is not an array');
  const b        = { day: m.day, entries, checkpoint, checkpointDay: t.entry_day, equivocations: t.equivocations };
  await verifyBatch(b, checkpointKey);
  if (batchToFkl(b) !== text) throw new LedgerError('not_canonical');
  return b;
}

/** Dias desde 1970-01-01 (calendário gregoriano), para saber se dois dias são seguidos. */
export function dayNumber(day        )         {
  checkDay(day);
  let y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  if (m <= 2) y -= 1;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Uma sequência de lotes, do mais antigo ao mais recente, que reconstrói o registo: cada um conferido, dias seguidos, checkpoints
 * encadeados, e cada entrada de checkpoint que cai noutro lote da sequência está lá. `prev` é o id do checkpoint que antecede
 * o primeiro lote (`null` = o registo começa aqui).
 */
export async function checkSequence(prev               , batches         , checkpointKey            )                {
  let lastId = prev;
  let lastDay                = null;
  for (const b of batches) {
    await verifyBatch(b, checkpointKey);
    const cp = await batchCheckpoint(b, checkpointKey);
    const n = dayNumber(b.day);
    if (lastDay !== null && lastDay + 1 !== n) throw new LedgerError('bad_chain', `batch ${b.day} does not follow the previous day`);
    if ((cp.prev ? toHex(cp.prev) : null) !== lastId) {
      throw new LedgerError('bad_chain', `checkpoint of ${b.day} does not chain to the previous one`);
    }
    lastDay = n;
    lastId = cp.id;
  }
  for (const b of batches) {
    const host = batches.find((o) => o.day === b.checkpointDay);
    if (host && !host.entries.some((e) => e.id === b.checkpoint.id)) {
      throw new LedgerError('bad_chain', `batch ${host.day} lacks the checkpoint entry of ${b.day}`);
    }
  }
}

                           
