// Dev status phases: "beta" first, then "alpha" (the phase after the beta).
// Each phase is counted from its own tasks only; alpha never counts toward beta.
(function (root) {
  const PHASES = ['beta', 'alpha'];
  const phaseOf = t => (t && t.phase === 'alpha' ? 'alpha' : 'beta');
  const isDone = t => t.p >= 100;
  function split(tasks) {
    const out = { beta: [], alpha: [] };
    for (const t of tasks) out[phaseOf(t)].push(t);
    return out;
  }
  function progress(tasks) {
    const total = tasks.length;
    const done = tasks.filter(isDone).length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }
  const api = { PHASES, phaseOf, isDone, split, progress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StPhase = api;
})(typeof self !== 'undefined' ? self : this);
