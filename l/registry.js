// Pagina publica do registo (forkgate.io/l/<release>): publicacao, creditos e marcos de criacao do Fork Ledger, "Download proof"
// e a conferencia de uma prova no proprio browser. Tudo o que se mostra vem da Fork (funcoes ledger_registry/ledger_proof) ou
// da Solana; sem dados diz que nao ha. Nada se escreve com innerHTML: so texto.
import { fromHex } from './ledger/bytes.js';
import { verifyProofJson } from './ledger/proof.js';
import { checkSealTx, creditText, explorerTx, milestoneText, milestonesHeading, verifiedText } from './lib.js';

const $ = (id) => document.getElementById(id);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

let cfg = null;

async function json(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch { /* o corpo nao e JSON */ }
  if (!r.ok) throw new Error((body && body.error) || `The service answered ${r.status}.`);
  return body;
}

async function setting(key) {
  const rows = await json(`${cfg.rest_url}/platform_settings?key=eq.${encodeURIComponent(key)}&select=value`, { headers: { apikey: cfg.anon_key } });
  const v = rows && rows[0] && rows[0].value;
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

function say(kind, text, extra) {
  const r = $('result');
  r.replaceChildren(el('p', text, kind));
  if (extra) r.append(...extra);
}

/** Confere uma prova (texto JSON): assinaturas, caminho, cadeia de checkpoints e, se houver, o selo na Solana. */
export async function checkProof(text) {
  let v;
  try {
    const key = fromHex(await setting('ledger.checkpoint_pubkey') ?? '');
    if (!key) throw new Error('Fork has not published its checkpoint key yet, so no proof can be checked.');
    v = await verifyProofJson(text, key);
  } catch (e) {
    say('bad', `Not verified: ${e.code ? `${e.code} — ` : ''}${e.message}`);
    return false;
  }
  const extra = [];
  let line = verifiedText(v);
  if (v.seal) {
    const rpc = cfg.solana_rpc && cfg.solana_rpc[v.seal.network];
    const a = el('a', 'See the seal transaction on Solana', 'btn line');
    a.href = explorerTx(v.seal); a.target = '_blank'; a.rel = 'noopener';
    let chain = 'The Solana lookup was not made (no RPC configured for this page).';
    if (rpc) {
      try {
        const tx = (await json(rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [v.seal.tx_signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }) })).result;
        const c = checkSealTx(v.seal, tx, await setting('ledger.sealer_pubkey'));
        if (!c.ok) { say('bad', `Not verified: ${c.reason}`, [a]); return false; }
        chain = c.reason;
      } catch (e) { chain = `The Solana lookup failed (${e.message}); open the transaction below to check it yourself.`; }
    }
    line = `${line} ${chain}`;
    extra.push(a);
  }
  say('ok', `Verified. ${line}`, extra);
  return true;
}

async function downloadProof(entryId) {
  say('muted', 'Fetching the proof…');
  let text;
  try {
    const r = await fetch(`${cfg.functions_url}/ledger_proof?entry=${entryId}`);
    text = await r.text();
    if (!r.ok) { let m = `The service answered ${r.status}.`; try { m = JSON.parse(text).error || m; } catch { /* sem JSON */ } throw new Error(m); }
  } catch (e) { say('bad', `No proof to download: ${e.message}`); return; }
  const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `fork-ledger-proof-${entryId.slice(0, 12)}.json`; a.click(); URL.revokeObjectURL(a.href);
  await checkProof(text);
}

function proofButton(entryId, label = 'Download proof') {
  const b = el('button', label, 'btn line'); b.type = 'button'; b.addEventListener('click', () => downloadProof(entryId)); return b;
}

function show(reg) {
  $('title').textContent = reg.title;
  $('note').textContent = reg.withdrawn ? 'This release was withdrawn from sale. The record below stays.' : '';
  if (reg.publication) {
    $('pub').hidden = false;
    $('pubBody').replaceChildren(el('p', `Published in the Fork Ledger on ${reg.publication.day}.`), el('code', reg.publication.entry_id), el('p'), proofButton(reg.publication.entry_id));
  }
  const credits = (reg.credits || []).map(creditText).filter(Boolean);
  $('credits').hidden = false;
  if (!credits.length) $('creditList').replaceChildren(el('li', 'No credits recorded yet.'));
  else $('creditList').replaceChildren(...credits.map((c) => { const li = el('li', c.text); li.append(el('span', c.label, 'tag')); return li; }));
  const head = milestonesHeading(reg.milestones);
  $('ms').hidden = false;
  $('msHead').textContent = head || 'Creation milestones';
  if (!head) $('msList').replaceChildren(el('li', 'No creation milestones recorded.'));
  else $('msList').replaceChildren(...(reg.milestones.items || []).map((m) => {
    const t = milestoneText(m); if (!t) return null;
    const li = el('li', t + ' '); li.append(proofButton(m.entry_id, 'Proof')); return li;
  }).filter(Boolean));
}

async function main() {
  try { cfg = await json('config.json'); } catch { cfg = null; }
  if (!cfg || !cfg.functions_url || !cfg.rest_url || !cfg.anon_key) {
    $('note').textContent = 'This page is not configured yet: it has no registry address.';
    $('check').hidden = true;
    return;
  }
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) await checkProof(await f.text());
  });
  const q = new URLSearchParams(location.search);
  const proofUrl = q.get('proof');
  const release = (q.get('r') || location.pathname).match(UUID);
  if (!release && !proofUrl) { $('note').textContent = 'Open a release link to see its record.'; return; }
  if (release) {
    try { show(await json(`${cfg.functions_url}/ledger_registry?release=${release[0]}`)); }
    catch (e) { $('note').textContent = `The registry has nothing to show: ${e.message}`; }
  }
  if (proofUrl) {
    try { await checkProof(await (await fetch(proofUrl)).text()); } catch (e) { say('bad', `Could not load the proof: ${e.message}`); }
  }
}

main();
