// Teste do Network capacity real (node --test admin/netcap.test.js). Extrai o bloco NC-PURE de index.html.
const fs = require('fs'), assert = require('assert'), test = require('node:test');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ NC-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ NC-PURE-END/);
assert(m, 'bloco NC-PURE nao encontrado');
const NC = new Function(m[1] + '; return NC;')();
const q = { 'network.bootstrap_nodes': 7, 'network.bootstrap_node_gb': 20, 'network.cloud_ratio_free': 10, 'network.cloud_ratio_pro': 5,
            'network.seed_min_gb': 10, 'network.seed_max_gb': 1000 };
const base = { total_users: 9, pro_users: 1, window_days: 30 };

test('soma o seed real, nao contas x minimo: quem da 100 GB conta 100', () => {
  const a = { ...base, hosts_recent: 1, hosts_reported: 1, hosts_old: 0, seed_bytes_reported: 100e9, free_bytes_old: 0,
              contrib_bytes_free: 100e9, contrib_bytes_pro: 0 };
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 100);                    // so os 100 GB reportados; nem as 9 contas nem os fundadores das definicoes
  assert.strictEqual(c.D, 10);                     // 100 / racio Free 10
  assert.strictEqual(c.reportado, 100);
  assert(NC.origem(c).includes('1 machine seen in the last 30 days: 100 GB'));
  assert(NC.origem(c).includes('Accounts without a machine add nothing'));
  assert(!NC.origem(c).includes('older build'), 'sem maquinas antigas nao fala delas');
  assert(!src.includes("doesn't report each desktop's chosen seed yet"), 'a frase antiga saiu');
});

test('build antiga conta pelo free_bytes e o ecra diz quantas', () => {
  const a = { ...base, hosts_recent: 3, hosts_reported: 1, hosts_old: 2, seed_bytes_reported: 20e9, free_bytes_old: 7e9,
              contrib_bytes_free: 27e9, contrib_bytes_pro: 0 };
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 27);
  assert.strictEqual(c.antigas, 2);
  assert(NC.origem(c).includes('2 machines run an older build') && NC.origem(c).includes('(7 GB)'));
});

test('Pro usa o racio Pro fora da beta, o Free na beta', () => {
  const a = { ...base, hosts_recent: 1, hosts_reported: 1, hosts_old: 0, seed_bytes_reported: 50e9, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 50e9 };
  assert.strictEqual(NC.real(a, q, true).D, 5);
  assert.strictEqual(NC.real(a, q, false).D, 10);
});

test('rede vazia: 0 GB; base sem a 105 nao se mostra', () => {
  const a = { ...base, hosts_recent: 0, hosts_reported: 0, hosts_old: 0, seed_bytes_reported: 0, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 0 };
  assert(NC.temReal(a));
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 0); assert.strictEqual(c.D, 0);
  assert(!NC.temReal({ total_users: 3, pro_users: 0, hosts_total: 1, hosts_online: 1, free_bytes_online: 5 }), 'so os campos da 64');
});

test('0 maquinas a reportar: total real 0 GB mesmo com fundadores nas definicoes', () => {
  const a = { ...base, hosts_recent: 0, hosts_reported: 0, hosts_old: 0, seed_bytes_reported: 0, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 0 };
  const qf = { ...q, 'network.bootstrap_nodes': 7, 'network.bootstrap_node_gb': 20 };   // 140 GB so de definicao
  const c = NC.real(a, qf, true);
  assert.strictEqual(c.S, 0);
  assert.strictEqual(c.R, 0);
  assert.strictEqual(c.estado[0], 'Critical');
  assert(!('fundadores' in c), 'o real nao traz fundadores das definicoes');
  assert(!/founder nodes \(/.test(NC.origem(c)), 'a origem nao soma fundadores');
  assert(!/n1\(c\.fundadores\)/.test(src), 'os cartoes reais nao mostram fundadores');
});
