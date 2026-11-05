const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('./phase.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'status.json'), 'utf8'));

test('every task has phase beta or alpha, and no "after beta" labels remain', () => {
  for (const t of data.tasks) assert.ok(['beta', 'alpha'].includes(t.phase), `${t.t}: phase`);
  for (const f of ['status.json', 'architecture.json']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, f), 'utf8'), /after[ -]?beta|post-beta/i, f);
  }
});

test('phase split: beta and alpha are disjoint and cover every task', () => {
  const s = P.split(data.tasks);
  assert.equal(s.beta.length + s.alpha.length, data.tasks.length);
  assert.ok(s.beta.every(t => t.phase === 'beta') && s.alpha.every(t => t.phase === 'alpha'));
  assert.ok(s.alpha.length > 0);
});

test('beta percentage ignores alpha tasks completely', () => {
  const mk = (phase, p) => ({ t: 'x', p, phase });
  const tasks = [mk('beta', 100), mk('beta', 100), mk('beta', 40), mk('beta', 0), mk('alpha', 100), mk('alpha', 100), mk('alpha', 100)];
  const s = P.split(tasks);
  assert.deepEqual(P.progress(s.beta), { done: 2, total: 4, pct: 50 });
  assert.deepEqual(P.progress(s.alpha), { done: 3, total: 3, pct: 100 });
  assert.deepEqual(P.progress([]), { done: 0, total: 0, pct: 0 });
});

test('the four new beta tasks exist, in progress', () => {
  for (const n of ['Projects always open complete (Relinked version)', 'Samples vs project-audio storage rule', 'Optimize for playback', 'Admin Site tabs']) {
    const t = data.tasks.find(x => x.t === n);
    assert.ok(t, n);
    assert.equal(t.phase, 'beta');
    assert.ok(t.p > 0 && t.p < 100);
  }
});
