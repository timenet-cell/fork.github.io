// Teste minimo das funcoes de render da aba QA (node admin/qa.test.js). Extrai o bloco QA-PURE de index.html.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = src.match(/\/\/ QA-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ QA-PURE-END/);
assert(m, 'bloco QA-PURE nao encontrado');
const QA = new Function(m[1] + '; return QA;')();
const agora = Date.parse('2026-10-24T12:00:00Z'), h = n => new Date(agora - n * 36e5).toISOString();
const runs = [{ id: 'a', started_at: h(1), status: 'pass', tokens: 100 }, { id: 'b', started_at: h(2), status: 'fail', tokens: 50 },
  { id: 'c', started_at: h(30), status: 'pass', tokens: 999 }];
const bugs = [{ id: 'x', severity: 'low', status: 'open', count: 9, first_seen: h(30), last_seen: h(1), title: '<b>x</b>', app: 'studio', scenario: 's' },
  { id: 'y', severity: 'critical', status: 'open', count: 1, first_seen: h(3), last_seen: h(3), title: 'y', app: 'studio', scenario: 's', steps: 's1', error: 'boom' },
  { id: 'z', severity: 'critical', status: 'fixed', count: 5, first_seen: h(40), last_seen: h(40), title: 'z', app: 'studio', scenario: 's' }];
const s = QA.resumo(runs, bugs, agora);
assert.deepStrictEqual(s, { runs: 2, taxa: 50, tokens: 150, novos: 1 });
assert.strictEqual(QA.resumo([], [], agora).taxa, null);                       // sem corridas nao ha taxa
assert(QA.renderResumo(QA.resumo([], [], agora)).includes('—'));
assert.deepStrictEqual(QA.ordena(bugs).map(b => b.id), ['y', 'x', 'z']);      // abertos primeiro, gravidade depois
assert(QA.renderBugs(bugs, null).includes('&lt;b&gt;x'));                       // escapa HTML
const det = QA.renderBugs(bugs, 'y');
assert(det.includes('boom') && det.includes('Mark fixed') && det.includes('Ignore'));
assert(QA.renderBugs(bugs, 'z').includes('Reopen'));
assert(QA.renderRuns(runs, 'a').includes('data-id="a"'));
const e = QA.renderEff([{ scenario: 's', app: 'a', runs: 4, pass_runs: 3, avg_duration_ms: null, avg_tokens: 10, total_tokens: 40, avg_bugs_per_run: 0.5 }]);
assert(e.includes('75%') && e.includes('—') && e.includes('0.5'));
console.log('qa.test.js: ok');
