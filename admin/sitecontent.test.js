// Testes do separador "Site tabs" (admin) e da leitura de site_content no site (node --test admin/*.test.js).
const fs = require('fs'), assert = require('assert'), test = require('node:test');
const adm = fs.readFileSync(__dirname + '/index.html', 'utf8'), site = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const bloco = (src, a, b) => { const m = src.match(new RegExp('// ' + a + '[^\\n]*\\n([\\s\\S]*?)// ' + b)); assert(m, a + ' nao encontrado'); return m[1]; };
const SC = new Function(bloco(adm, 'SC-PURE-BEGIN', 'SC-PURE-END') + '; return SC;')();
const S = new Function(bloco(site, 'SITE-CONTENT-BEGIN', 'SITE-CONTENT-END') + '; return { DEFAULT_TABS, limpaItens, conteudoSite };')();

test('no ticket anywhere on the site or admin pages', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') || e.name === 'node_modules' ? [] :
    e.isDirectory() ? walk(d + '/' + e.name) : /\.(html|js|json|svg|md)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [d + '/' + e.name] : []);
  for (const f of walk(__dirname + '/..')) assert(!/ticket/i.test(fs.readFileSync(f, 'utf8')), f);
});
test('admin: first tab is Beta submission, defaults match the site', () => {
  const m = SC.modelo(null);
  assert.strictEqual(m[0].nome, 'Beta submission');
  assert.deepStrictEqual(m.filter(x => x.app).map(x => x.items), S.DEFAULT_TABS.filter(t => t[2]).map(t => t[2]));
});
test('admin: rows from the database set visibility, order and items', () => {
  const m = SC.modelo([{ tab: 'beta', visible: false, sort: 5, items: [] }, { tab: 'music', visible: true, sort: 0, items: [' Listen ', '', 7, 'Play'] }]);
  assert.strictEqual(m[0].tab, 'music'); assert.deepStrictEqual(m[0].items, ['Listen', 'Play']);
  assert.strictEqual(m.find(x => x.tab === 'beta').visible, false);
});
test('admin: move and reorder features', () => {
  const m = SC.modelo(null);
  SC.move(m, 0, 1); assert.strictEqual(m[1].tab, 'beta'); assert.deepStrictEqual(m.map(x => x.sort), [0, 1, 2, 3, 4, 5]);
  SC.move(m, 0, -1); assert.strictEqual(m[0].sort, 0);                       // out of range: unchanged
  assert.deepStrictEqual(SC.itensMove(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepStrictEqual(SC.itensMove(['a', 'b'], 1, 1), ['a', 'b']);
});
test('admin: save payload is validated and numbered', () => {
  const m = SC.modelo(null); m[1].items.push('  New  ');
  const p = SC.paraGravar(m);
  assert.strictEqual(p.rows.length, 6); assert.deepStrictEqual(p.rows.map(r => r.sort), [0, 1, 2, 3, 4, 5]);
  assert(p.rows.find(r => r.tab === m[1].tab).items.includes('New'));
  assert.deepStrictEqual(p.rows.find(r => r.tab === 'beta').items, []);
  m[1].items.push('   '); assert(SC.paraGravar(m).erro);                       // empty feature refused
  m[1].items.pop(); m[1].items.push('x'.repeat(41)); assert(SC.paraGravar(m).erro);
});
test('site: falls back to built-in content when the database gives nothing', () => {
  for (const r of [null, undefined, [], 'x']) {
    const c = S.conteudoSite(r); assert.strictEqual(c.beta, true); assert.strictEqual(c.apps.length, 5);
    assert.deepStrictEqual(c.apps[2], ['ForkEvents', ['Events', 'Line-ups', 'Planning', 'Team Management', 'Social']]);
  }
});
test('site: hidden tabs, order and edited features come from the database', () => {
  const c = S.conteudoSite([{ tab: 'beta', visible: false, sort: 0, items: [] }, { tab: 'music', visible: true, sort: -1, items: ['A', 'B'] },
    { tab: 'studio', visible: false, sort: 1, items: ['X'] }, { tab: 'labels', visible: true, sort: 2, items: [] }]);
  assert.strictEqual(c.beta, false);
  assert.strictEqual(c.apps[0][0], 'ForkMusic'); assert.deepStrictEqual(c.apps[0][1], ['A', 'B']);
  assert(!c.apps.some(a => a[0] === 'ForkStudio'));
  assert.strictEqual(c.apps.find(a => a[0] === 'ForkLabels')[1].length, 7);    // empty list keeps the built-in one
});
