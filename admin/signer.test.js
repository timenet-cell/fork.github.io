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
console.log('signer.test.js: ok');
