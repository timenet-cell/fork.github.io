// Testes do interruptor da beta (admin, Platform settings; migracao 101) (node --test admin/*.test.js).
const fs = require('fs'), assert = require('assert'), test = require('node:test');
const adm = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = adm.match(/\/\/ BS-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ BS-PURE-END/); assert(m);
const BS = new Function(m[1] + '; return BS;')();
test('open beta: says every account has Pro, offers to end it', () => {
  const e = BS.estado(true); assert.match(e.nm, /open/); assert.match(e.ds, /Every account has Pro/); assert.match(e.btn, /End the beta/);
});
test('closed beta: says Pro only for Pro plan, offers to reopen', () => {
  const e = BS.estado(false); assert.match(e.nm, /closed/); assert.match(e.ds, /Pro plan/); assert.match(e.btn, /Reopen/);
});
test('typed confirmation: only the exact words flip it', () => {
  assert(BS.confirmado(true, 'END BETA')); assert(BS.confirmado(true, ' end beta ')); assert(!BS.confirmado(true, 'yes'));
  assert(!BS.confirmado(true, 'REOPEN BETA')); assert(!BS.confirmado(true, null)); assert(BS.confirmado(false, 'REOPEN BETA'));
});
test('the question says what happens to every account and that data stays', () => {
  assert.match(BS.pergunta(true), /every Fork app already installed/); assert.match(BS.pergunta(true), /keep their projects and data/);
});
test('no long dashes in the beta texts', () => { assert(!/[–—]/.test(m[1])); });
