// Teste do separador Seeders (node --test admin/seeders.test.js). Extrai o bloco SD-PURE de index.html.
const fs = require('fs'), assert = require('assert'), test = require('node:test');
// a unidade da app e do painel: 1 GB = 1024^3 bytes (decisao do dono, 24-11)
const GiB = 1024 ** 3;
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ SD-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ SD-PURE-END/);
assert(m, 'bloco SD-PURE nao encontrado');
const SD = new Function(m[1] + '; return SD;')();
const agora = Date.parse('2026-11-20T12:00:00Z'), s = agora / 1000;

test('a barra: verde < 70 %, ambar 70-90 %, vermelho >= 90 %', () => {
  assert.strictEqual(SD.nivel(69.9), ''); assert.strictEqual(SD.nivel(70), 'amber');
  assert.strictEqual(SD.nivel(89.9), 'amber'); assert.strictEqual(SD.nivel(90), 'red');
  assert(SD.barra(5 * GiB, 20 * GiB).includes('width:25.0%') && SD.barra(5 * GiB, 20 * GiB).includes('class=""'));
  assert(SD.barra(15 * GiB, 20 * GiB).includes('class="amber"'));
  assert(SD.barra(19 * GiB, 20 * GiB).includes('class="red"'));
  assert(SD.barra(null, 20 * GiB).includes('Not reported') && SD.barra(1, null).includes('Not reported'));
});

test('vazio diz que nao ha maquinas', () => {
  assert(SD.render([], new Set(), agora).includes('No machines on the network yet'));
  assert.strictEqual(SD.conta([]), 'online now: 0 users · 0 machines · 0.0 GB seed');
});

const lista = [
  { user_id: 'b', username: '<bia>', machines: 2, machines_online: 1, reported: 1, seed_bytes: 20 * GiB, used_bytes: 5 * GiB, last_seen: s - 120, online: true, online_secs: 900,
    devices: [{ peer_id: 'S'.repeat(40), seed_bytes: 20 * GiB, used_bytes: 5 * GiB, last_seen: s - 120, online: true, online_secs: 600 },
              { peer_id: 'T'.repeat(40), seed_bytes: null, used_bytes: null, last_seen: s - 3600, online: false, online_secs: 300 }] },
  { user_id: 'o', username: 'old', machines: 1, machines_online: 0, reported: 0, seed_bytes: null, used_bytes: null, last_seen: s - 86400 * 3, online: false, online_secs: 7200,
    devices: [{ peer_id: 'U'.repeat(40), seed_bytes: null, used_bytes: null, last_seen: s - 86400 * 3, online: false, online_secs: 7200 }] },
];

test('em cima so quem esta online; as maquinas paradas em baixo, a cinzento, fora dos totais', () => {
  const html = SD.render(lista, new Set(), agora);
  assert.strictEqual((html.match(/class="sd-row"/g) || []).length, 1, 'so a bia esta online');
  assert(!html.includes('sd-dev'), 'fechadas: sem maquinas');
  assert(html.includes('&lt;bia&gt;'), 'escapa HTML');
  assert(html.includes('20.0 GB') && html.includes('5.0 GB'));
  assert(html.includes('2 min ago') && html.includes('0.3 h'));
  const off = html.slice(html.indexOf('sd-off-h'));
  assert(off.includes('Offline · not counted in the totals (2)'));
  assert.strictEqual((off.match(/class="sd-off"/g) || []).length, 2);
  assert(off.includes('last seen ') && off.includes('2026'), 'last seen <data>');
  assert(off.indexOf('TTTT') < off.indexOf('UUUU'), 'a mais recente primeiro');
  assert(!html.slice(0, html.indexOf('sd-off-h')).includes('TTTT'), 'a parada da bia nao fica em cima');
  assert.strictEqual(SD.conta(lista), 'online now: 1 user · 1 machine · 20.0 GB seed · 2 offline');
});

test('o mesmo PC reinstalado: a chave velha parada nao soma', () => {
  const dig = [{ user_id: 'd', username: 'digger909', machines: 2, machines_online: 1, reported: 1, seed_bytes: 107 * GiB, used_bytes: 1 * GiB,
    last_seen: s - 60, online: true, online_secs: 100,
    devices: [{ peer_id: 'A'.repeat(40), seed_bytes: 107 * GiB, used_bytes: 1 * GiB, last_seen: s - 60, online: true, online_secs: 50 },
              { peer_id: 'B'.repeat(40), seed_bytes: 107 * GiB, used_bytes: 2 * GiB, last_seen: s - 86400 * 2, online: false, online_secs: 50 }] }];
  const html = SD.render(dig, new Set(['d']), agora);
  assert.strictEqual((html.match(/class="sd-dev"/g) || []).length, 1, 'aberto: so a maquina online');
  assert.strictEqual(SD.conta(dig), 'online now: 1 user · 1 machine · 107.0 GB seed · 1 offline');
  assert(!html.includes('214'));
});

test('ninguem online: diz-o, e as paradas continuam em baixo', () => {
  const html = SD.render([lista[1]], new Set(), agora);
  assert(html.includes('No machines online now') && html.includes('sd-off'));
  assert(SD.temOnline(lista) && !SD.temOnline([{ machines: 1 }]));
});

test('abrir a linha mostra cada maquina online com a sua barra', () => {
  const html = SD.render(lista, new Set(['b']), agora);
  assert.strictEqual((html.match(/class="sd-dev"/g) || []).length, 1);
  assert(html.includes('aria-expanded="true"'));
  const dev = html.slice(html.indexOf('class="sd-dev"'));
  assert(dev.includes('SSSSSSSSSSSSSSSS…') && dev.includes('width:25.0%'));
});
