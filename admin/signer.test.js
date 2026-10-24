// Teste minimo das funcoes puras da aba Signer (node admin/signer.test.js). Extrai o bloco SG-PURE de index.html.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ SG-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ SG-PURE-END/);
assert(m, 'bloco SG-PURE nao encontrado');
const SG = new Function(m[1].replace(/^const SG =/, 'const SG =') + '; return SG;')();
assert.deepStrictEqual(SG.valida('hourly_cap', '60'), { ok: true, n: 60 });
assert.deepStrictEqual(SG.valida('hourly_cap', ' 0 '), { ok: true, n: 0 });
assert(SG.valida('hourly_cap', '10001').ok === false);
assert(SG.valida('daily_cap', '100000').ok && !SG.valida('daily_cap', '100001').ok);
for (const x of ['', '-1', '1.5', 'abc', '1e3', null]) assert(!SG.valida('daily_cap', x).ok, String(x));
assert.deepStrictEqual(SG.contagem([{ status: 'sent' }, { status: 'queued' }, { status: 'sent' }]), [['sent', 2], ['queued', 1]]);
assert(SG.renderJobs([], 'x').includes('No mint jobs'));
assert(SG.renderJobs([{ status: '<b>' }], 'x').includes('&lt;b&gt;'));
assert.strictEqual(SG.quem(null, []), 'unknown');
assert.strictEqual(SG.quem('abcdef123456', []), 'abcdef12');
assert.strictEqual(SG.quem('u1', [{ id: 'u1', email: 'a@b.c' }]), 'a@b.c');
// Carga (migracao 70)
assert.strictEqual(SG.pct(30, 60), 50); assert.strictEqual(SG.pct(1, 3), 33); assert.strictEqual(SG.pct(5, 0), 100);
assert.strictEqual(SG.pct(undefined, 60), null);
const base = { enabled: true, hour_used: 10, hour_cap: 60, day_used: 100, day_cap: 1000, queued: 0, blocked_by_cap: false };
assert.deepStrictEqual(SG.estadoCarga(base), { k: 'ok', cor: '', txt: 'OK' });
assert.strictEqual(SG.estadoCarga({ ...base, hour_used: 48 }).k, 'near');      // 80% exacto
assert.strictEqual(SG.estadoCarga({ ...base, hour_used: 47 }).k, 'ok');         // 78%
assert.strictEqual(SG.estadoCarga({ ...base, day_used: 800 }).cor, 'amber');
assert.deepStrictEqual(SG.estadoCarga({ ...base, hour_used: 60, queued: 4, blocked_by_cap: true }), { k: 'over', cor: 'red', txt: 'Over cap — 4 waiting' });
assert.deepStrictEqual(SG.estadoCarga({ ...base, enabled: false, queued: 2 }), { k: 'off', cor: 'red', txt: 'Signer off — 2 waiting' });
assert.strictEqual(SG.estadoCarga({ ...base, enabled: false }).k, 'ok');          // desligado sem fila: nada a avisar
assert.strictEqual(SG.estadoCarga({ ...base, enabled: false, queued: 1, blocked_by_cap: true }).k, 'off');
assert.strictEqual(SG.estadoCarga(null).k, 'none');
const T0 = Date.parse('2026-10-24T12:00:00Z');
assert.strictEqual(SG.idade('2026-10-24T11:59:50Z', T0), 'under 1 min');
assert.strictEqual(SG.idade('2026-10-24T11:15:00Z', T0), '45 min');
assert.strictEqual(SG.idade('2026-10-24T09:30:00Z', T0), '2 h 30 min');
assert.strictEqual(SG.idade('2026-10-22T10:00:00Z', T0), '2 d 2 h');
assert.strictEqual(SG.idade(null, T0), null);
const serie = Array.from({ length: 24 }, (_, i) => ({ hour: new Date(T0 - (23 - i) * 36e5).toISOString(), started: i === 23 ? 7 : 0 }));
const svg = SG.spark(serie, 5);
assert(svg.includes('<polyline') && svg.includes('stroke-dasharray') && (svg.match(/<circle/g) || []).length === 24);
assert(svg.includes('y1="18.9"'));                                               // Y(5) com maximo 7
assert.strictEqual(SG.spark([], 5), '');
const html = SG.renderCarga({ ...base, hour_used: 60, queued: 3, oldest_queued_at: '2026-10-24T11:50:00Z', blocked_by_cap: true, hourly_starts: serie }, T0);
assert(html.includes('60 / 60') && html.includes('100%') && html.includes('10 min') && html.includes('class="red"'));
assert(SG.renderCarga({ ...base, hourly_starts: serie }, T0).includes('none waiting'));
console.log('signer.test.js: ok');
