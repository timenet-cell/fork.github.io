/**
 * @fork/core-ledger — espelho TypeScript de packages/core-ledger (ondas L1–L2).
 * Mesmos bytes, ids, raízes, memos e códigos de recusa que o Rust; vetores partilhados em
 * packages/core-ledger/testdata/. Não guarda chaves nem assina por si: quem assina passa uma função.
 */
export { LedgerError,                 } from './error.js';
export { fromHex, toHex, sha256 } from './bytes.js';
export { canonicalJson, parseStrict,                                 } from './json.js';
export {
  commit, commitHex, newOpening, openingFromHex, opensHex, COMMIT_DOMAIN,              
} from './commit.js';
export {
  entryCanonical, entryId, KINDS, LEDGER_SCHEMA, MAX_ENTRY_BYTES, newEntry, signedCanonical, signedFromCanonical,
  signedFromJson, signEntry, signingMessage, SIG_DOMAIN, validateEntry, verifySigned,                                         
} from './entry.js';
export {
  batchOrder, batchPath, batchRoot, leafHash, MAX_PATH_LEN, nodeHash, pathOfLeaves, rootFromPath, rootOfLeaves, verifyInclusion,
} from './merkle.js';
export {
  checkpointBody, checkpointFromEntry, MAX_CHAIN, MAX_PROOF_BYTES, PROOF_SCHEMA, proofFromJson, proofToJson, sealBody,
  sealFromEntry, sealMemo, verifyProof, verifyProofJson,                                                           
                                
} from './proof.js';
export {
  BATCH_SCHEMA, batchCheckpoint, batchFromFkl, batchToFkl, checkSequence, dayNumber, MAX_BATCH_ENTRIES, newBatch, verifyBatch,
             
} from './batch.js';
