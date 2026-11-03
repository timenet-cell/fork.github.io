// Pura (sem DOM): o texto que a pagina do registo mostra e a conferencia do selo na Solana. Regra Zero: so o que veio do registo
// ou da cadeia; sem dados diz que nao ha. A prova em si confere-a `verifyProofJson` (ledger/index.js).
import { base58Encode } from './ledger/base58.js';
import { fromHex } from './ledger/bytes.js';

const MARCO = { wip: 'Work in progress', mixdown: 'Mixdown', master: 'Master' };
const PLURAL = [['project', 'project file'], ['audio', 'audio file'], ['midi', 'MIDI file'], ['other', 'other file']];

const n = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

/** "Mixdown · 2026-02-01 · 12 audio files, 3 MIDI files" — datas e contagens, nunca nomes de ficheiros. */
export function milestoneText(m) {
  const nome = MARCO[m.milestone] ?? null;
  if (!nome || typeof m.day !== 'string') return null;
  const c = m.counts && typeof m.counts === 'object' ? m.counts : {};
  const partes = PLURAL.map(([k, rotulo]) => [n(c[k]), rotulo]).filter(([v]) => v).map(([v, r]) => `${v} ${r}${v === 1 ? '' : 's'}`);
  return [nome, m.day, ...(partes.length ? [partes.join(', ')] : [])].join(' · ');
}

/** O titulo da zona dos marcos, ou o aviso de privado; null se o registo nao tem nenhum. */
export function milestonesHeading(ms) {
  if (!ms || !n(ms.recorded)) return null;
  if (!ms.public) return `${ms.recorded} creation milestone${ms.recorded === 1 ? '' : 's'} recorded (private)`;
  return `${ms.recorded} creation milestone${ms.recorded === 1 ? '' : 's'}`;
}

/** Uma linha de credito: confirmados sem rotulo, os outros rotulados. O nome so se a pessoa o escreveu. */
export function creditText(c) {
  if (typeof c.role_name !== 'string') return null;
  const quem = typeof c.name === 'string' && c.name ? c.name : 'Name not published';
  return { text: `${c.role_name} — ${quem}`, confirmed: c.status === 'confirmed', label: c.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed' };
}

/** O que a prova ja verificada diz, e nada mais (§2: nao prova autoria nem que `claimed_at` seja verdade). */
export function verifiedText(v) {
  const base = `This entry is in the Fork Ledger. It was accepted on ${v.day} (UTC) and fixed by the checkpoint of ${v.checkpoint_day}.`;
  if (!v.seal) return `${base} That day is not sealed on Solana yet, so the proof stops at Fork's signed checkpoint.`;
  return `${base} The checkpoint is sealed on Solana ${v.seal.network} (slot ${v.seal.slot}): it existed no later than that block. `
    + 'This does not prove who made the music, that the declared time is true, or that it is original.';
}

/** Confere uma transacao `getTransaction` (jsonParsed) contra o selo da prova: sem erro, mesmo slot, pagador = a chave do selo
 *  publicada pela Fork (`ledger.sealer_pubkey`, 32 bytes hex) e UM memo igual ao refeito. */
export function checkSealTx(seal, tx, sealerHex) {
  if (!tx || !tx.transaction || !tx.meta) return { ok: false, reason: 'The transaction was not found on Solana.' };
  if (tx.meta.err) return { ok: false, reason: 'The transaction failed on Solana.' };
  if (tx.slot !== seal.slot) return { ok: false, reason: 'The transaction is in another slot than the proof says.' };
  const keys = tx.transaction.message?.accountKeys ?? [];
  const pagador = typeof keys[0] === 'string' ? keys[0] : keys[0]?.pubkey;
  const esperado = sealerHex && fromHex(sealerHex) ? base58Encode(fromHex(sealerHex)) : null;
  if (!esperado) return { ok: false, reason: 'Fork has not published the seal key, so the payer cannot be checked.' };
  if (pagador !== esperado) return { ok: false, reason: 'The transaction was not paid by the Fork seal key.' };
  const memos = (tx.transaction.message?.instructions ?? []).filter((i) => i.program === 'spl-memo' || i.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  if (memos.length !== 1) return { ok: false, reason: 'The transaction does not hold exactly one memo.' };
  const texto = typeof memos[0].parsed === 'string' ? memos[0].parsed : null;
  if (texto !== seal.memo) return { ok: false, reason: 'The memo on Solana is not the one this proof needs.' };
  return { ok: true, reason: 'Confirmed on Solana: same memo, same slot, paid by the Fork seal key.' };
}

export const explorerTx = (seal) => `https://explorer.solana.com/tx/${seal.tx_signature}${seal.network === 'mainnet' ? '' : '?cluster=devnet'}`;
