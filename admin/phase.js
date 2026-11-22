// Dev status phases (owner 22-11): "beta", then "beta2" (Beta V2: DJ, Live Companion, Network Evo), then "alpha",
// then "owner" (the owner's own disks and photos, not product). Each phase is counted from its own tasks only.
(function (root) {
  const PHASES = ['beta', 'beta2', 'alpha', 'owner'];
  const phaseOf = t => (t && PHASES.includes(t.phase) ? t.phase : 'beta');
  const isDone = t => t.p >= 100;
  function split(tasks) {
    const out = Object.fromEntries(PHASES.map(k => [k, []]));
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
