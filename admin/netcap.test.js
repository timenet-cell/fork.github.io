// Teste do Network capacity real (node --test admin/netcap.test.js). Extrai o bloco NC-PURE de index.html.
const fs = require('fs'), assert = require('assert'), test = require('node:test');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ NC-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ NC-PURE-END/);
assert(m, 'bloco NC-PURE nao encontrado');
const NC = new Function(m[1] + '; return NC;')();
const q = { 'network.bootstrap_nodes': 7, 'network.bootstrap_node_gb': 20, 'network.cloud_ratio_free': 10, 'network.cloud_ratio_pro': 5,
            'network.seed_min_gb': 10, 'network.seed_max_gb': 1000 };
const base = { total_users: 9, pro_users: 1, window_days: 30, online_minutes: 10,
               hosts_recent: 0, hosts_reported: 0, hosts_old: 0, seed_bytes_reported: 0, free_bytes_old: 0, contrib_bytes_free: 0, contrib_bytes_pro: 0 };
// os casos dizem o que esta online agora (campos online_* da migracao 106)
const on = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [{ hosts_recent: 'online_hosts', hosts_reported: 'online_hosts_reported',
  hosts_old: 'online_hosts_old', seed_bytes_reported: 'online_seed_bytes_reported', free_bytes_old: 'online_free_bytes_old',
  contrib_bytes_free: 'online_contrib_bytes_free', contrib_bytes_pro: 'online_contrib_bytes_pro' }[k] || k, v]));

test('soma o seed real, nao contas x minimo: quem da 100 GB conta 100', () => {
  const a = { ...base, ...on({ hosts_recent: 1, hosts_reported: 1, hosts_old: 0, seed_bytes_reported: 100e9, free_bytes_old: 0,
              contrib_bytes_free: 100e9, contrib_bytes_pro: 0 }) };
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 100);                    // so os 100 GB reportados; nem as 9 contas nem os fundadores das definicoes
  assert.strictEqual(c.D, 10);                     // 100 / racio Free 10
  assert.strictEqual(c.reportado, 100);
  assert(NC.origem(c).includes('1 machine with a heartbeat in the last 10 minutes: 100 GB'));
  assert(NC.origem(c).includes('Accounts without a machine add nothing'));
  assert(!NC.origem(c).includes('older build'), 'sem maquinas antigas nao fala delas');
  assert(!src.includes("doesn't report each desktop's chosen seed yet"), 'a frase antiga saiu');
});

test('build antiga conta pelo free_bytes e o ecra diz quantas', () => {
  const a = { ...base, ...on({ hosts_recent: 3, hosts_reported: 1, hosts_old: 2, seed_bytes_reported: 20e9, free_bytes_old: 7e9,
              contrib_bytes_free: 27e9, contrib_bytes_pro: 0 }) };
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 27);
  assert.strictEqual(c.antigas, 2);
  assert(NC.origem(c).includes('2 machines run an older build') && NC.origem(c).includes('(7 GB)'));
});

test('Pro usa o racio Pro fora da beta, o Free na beta', () => {
  const a = { ...base, ...on({ hosts_recent: 1, hosts_reported: 1, hosts_old: 0, seed_bytes_reported: 50e9, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 50e9 }) };
  assert.strictEqual(NC.real(a, q, true).D, 5);
  assert.strictEqual(NC.real(a, q, false).D, 10);
});

test('rede vazia: 0 GB; base sem a 105 nao se mostra', () => {
  const a = { ...base, ...on({ hosts_recent: 0, hosts_reported: 0, hosts_old: 0, seed_bytes_reported: 0, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 0 }) };
  assert(NC.temReal(a));
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 0); assert.strictEqual(c.D, 0);
  assert(!NC.temReal({ total_users: 3, pro_users: 0, hosts_total: 1, hosts_online: 1, free_bytes_online: 5 }), 'so os campos da 64');
  const so105 = { ...base }; for (const k of Object.keys(so105)) if (k.startsWith('online_')) delete so105[k];
  assert(!NC.temReal(so105), 'base so com a 105 (sem online now) nao se mostra');
});

test('0 maquinas a reportar: total real 0 GB mesmo com fundadores nas definicoes', () => {
  const a = { ...base, ...on({ hosts_recent: 0, hosts_reported: 0, hosts_old: 0, seed_bytes_reported: 0, free_bytes_old: 0,
              contrib_bytes_free: 0, contrib_bytes_pro: 0 }) };
  const qf = { ...q, 'network.bootstrap_nodes': 7, 'network.bootstrap_node_gb': 20 };   // 140 GB so de definicao
  const c = NC.real(a, qf, true);
  assert.strictEqual(c.S, 0);
  assert.strictEqual(c.R, 0);
  assert.strictEqual(c.estado[0], 'Critical');
  assert(!('fundadores' in c), 'o real nao traz fundadores das definicoes');
  assert(!/founder nodes \(/.test(NC.origem(c)), 'a origem nao soma fundadores');
  assert(!/n1\(c\.fundadores\)/.test(src), 'os cartoes reais nao mostram fundadores');
});

test('o caso real: o mesmo PC reinstalado (2 chaves) conta 107 GB online, os 214 dos 30 dias so no historico', () => {
  const a = { ...base, hosts_recent: 2, hosts_reported: 2, seed_bytes_reported: 214e9, contrib_bytes_free: 214e9,
              ...on({ hosts_recent: 1, hosts_reported: 1, hosts_old: 0, seed_bytes_reported: 107e9, free_bytes_old: 0,
                      contrib_bytes_free: 107e9, contrib_bytes_pro: 0 }) };
  const c = NC.real(a, q, true);
  assert.strictEqual(c.S, 107);
  assert.strictEqual(c.maquinas, 1);
  const hist = NC.historico(a);
  assert(hist.startsWith('History, not live:') && hist.includes('2 machine keys seen in the last 30 days, 214 GB'));
  assert(!NC.origem(c).includes('214'));
  assert(src.includes('id="nc-hist"') && src.includes('machines online now'));
});
