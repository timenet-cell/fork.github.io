// Teste do separador Seeders (node --test admin/seeders.test.js). Extrai o bloco SD-PURE de index.html.
const fs = require('fs'), assert = require('assert'), test = require('node:test');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ SD-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ SD-PURE-END/);
assert(m, 'bloco SD-PURE nao encontrado');
const SD = new Function(m[1] + '; return SD;')();
const agora = Date.parse('2026-11-20T12:00:00Z'), s = agora / 1000;

test('a barra: verde < 70 %, ambar 70-90 %, vermelho >= 90 %', () => {
  assert.strictEqual(SD.nivel(69.9), ''); assert.strictEqual(SD.nivel(70), 'amber');
  assert.strictEqual(SD.nivel(89.9), 'amber'); assert.strictEqual(SD.nivel(90), 'red');
  assert(SD.barra(5e9, 20e9).includes('width:25.0%') && SD.barra(5e9, 20e9).includes('class=""'));
  assert(SD.barra(15e9, 20e9).includes('class="amber"'));
  assert(SD.barra(19e9, 20e9).includes('class="red"'));
  assert(SD.barra(null, 20e9).includes('Not reported') && SD.barra(1, null).includes('Not reported'));
});

test('vazio diz que nao ha maquinas', () => {
  assert(SD.render([], new Set(), agora).includes('No machines on the network yet'));
  assert.strictEqual(SD.conta([]), '0 users · 0 machines · 0 online');
});

const lista = [
  { user_id: 'b', username: '<bia>', machines: 2, reported: 1, seed_bytes: 20e9, used_bytes: 5e9, last_seen: s - 120, online: true, online_secs: 900,
    devices: [{ peer_id: 'S'.repeat(40), seed_bytes: 20e9, used_bytes: 5e9, last_seen: s - 120, online: true, online_secs: 600 },
              { peer_id: 'T'.repeat(40), seed_bytes: null, used_bytes: null, last_seen: s - 3600, online: false, online_secs: 300 }] },
  { user_id: 'o', username: 'old', machines: 1, reported: 0, seed_bytes: null, used_bytes: null, last_seen: s - 86400 * 3, online: false, online_secs: 7200,
    devices: [{ peer_id: 'U'.repeat(40), seed_bytes: null, used_bytes: null, last_seen: s - 86400 * 3, online: false, online_secs: 7200 }] },
];

test('uma linha por utilizador; build antiga = Not reported, nunca 0', () => {
  const html = SD.render(lista, new Set(), agora);
  assert.strictEqual((html.match(/class="sd-row"/g) || []).length, 2);
  assert(!html.includes('sd-dev'), 'fechadas: sem maquinas');
  assert(html.includes('&lt;bia&gt;'), 'escapa HTML');
  assert(html.includes('20.0 GB') && html.includes('5.0 GB') && html.includes('(1 of 2 reporting)'));
  assert(html.includes('2 min ago') && html.includes('0.3 h'));
  const old = html.slice(html.indexOf('data-u="o"'));
  assert(old.includes('Not reported') && !old.includes('0.0 GB'));
  assert.strictEqual(SD.conta(lista), '2 users · 3 machines · 1 online');
});

test('abrir a linha mostra cada maquina com a sua barra', () => {
  const html = SD.render(lista, new Set(['b']), agora);
  assert.strictEqual((html.match(/class="sd-dev"/g) || []).length, 2);
  assert(html.includes('aria-expanded="true"'));
  const dev = html.slice(html.indexOf('class="sd-dev"'));
  assert(dev.includes('SSSSSSSSSSSSSSSS…') && dev.includes('width:25.0%'));
  assert(dev.slice(dev.indexOf('TTTT')).includes('Not reported') && dev.includes('1 h ago'));
});
