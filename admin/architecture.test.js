// Test the architecture inventory and the three generated diagrams (node admin/architecture.test.js).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const gen = require('./architecture_gen.js');

const dir = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(dir, 'architecture.json'), 'utf8'));
const VIEWS = ['overview', 'studio', 'music'];
const STATUS = new Set(['built', 'building', 'planned', 'after-beta']);

// ── inventory ─────────────────────────────────────────────────────────────────────────────────────────────────────────
assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/, 'updated must be a date');
assert.deepEqual(Object.keys(data.views), VIEWS, 'exactly the three views');
assert.equal(data.brand.background, '#EEF3F8');
assert.equal(data.brand.card, '#F8FAFC');
assert.equal(data.brand.line, '#DCE5EE');
assert.equal(data.brand.text, '#141A22');
assert.equal(data.brand.muted, '#5B6675');
assert.equal(data.brand.accent, '#E5342B');

const ids = new Set();
const byId = new Map();
for (const n of data.nodes) {
  for (const k of ['id', 'label', 'area', 'status', 'description', 'source']) {
    assert.ok(typeof n[k] === 'string' && n[k].trim(), `${n.id || '?'}: ${k} is required`);
  }
  assert.ok(!ids.has(n.id), 'duplicate node id ' + n.id);
  ids.add(n.id);
  byId.set(n.id, n);
  assert.ok(STATUS.has(n.status), `${n.id}: unknown status ${n.status}`);
  assert.ok(Array.isArray(n.views) && n.views.length, `${n.id}: needs at least one view`);
  for (const v of n.views) assert.ok(VIEWS.includes(v), `${n.id}: unknown view ${v}`);
}

const layoutIds = {};
for (const v of VIEWS) {
  const view = data.views[v];
  assert.ok(view.title && view.subtitle, `${v}: title and subtitle`);
  const layout = view.rows.flatMap(r => r.groups.flatMap(g => g.nodes));
  layoutIds[v] = layout;
  assert.equal(new Set(layout).size, layout.length, `${v}: a node appears twice`);
  for (const id of layout) assert.ok(ids.has(id), `${v}: unknown node ${id}`);
  const claimed = data.nodes.filter(n => n.views.includes(v)).map(n => n.id).sort();
  assert.deepEqual([...layout].sort(), claimed, `${v}: layout and node.views disagree`);
  assert.ok(layout.length >= 10, `${v}: too few nodes`);
}

const seenEdges = new Set();
for (const e of data.edges) {
  assert.ok(ids.has(e.from), 'edge from unknown node ' + e.from);
  assert.ok(ids.has(e.to), 'edge to unknown node ' + e.to);
  assert.notEqual(e.from, e.to, 'self edge ' + e.from);
  assert.ok(typeof e.label === 'string' && e.label.trim(), 'edge without label ' + e.from + ' -> ' + e.to);
  assert.ok(Array.isArray(e.views) && e.views.length, 'edge without view ' + e.from + ' -> ' + e.to);
  for (const v of e.views) {
    assert.ok(VIEWS.includes(v), 'edge with unknown view ' + v);
    assert.ok(layoutIds[v].includes(e.from) && layoutIds[v].includes(e.to), `${v}: edge outside the view ${e.from} -> ${e.to}`);
  }
  const key = e.from + '\0' + e.to + '\0' + e.label + '\0' + e.views.join(',');
  assert.ok(!seenEdges.has(key), 'duplicate edge ' + e.from + ' -> ' + e.to);
  seenEdges.add(key);
}

// The status must match the plan: these four are held for after the beta.
for (const id of ['studio-dj', 'studio-live', 'studio-rooms', 'studio-windows']) {
  assert.equal(byId.get(id) && byId.get(id).status, 'after-beta', `${id} must be after-beta`);
}

// UI prose never calls the computer a Mac.
const prose = [
  ...VIEWS.flatMap(v => [data.views[v].title, data.views[v].subtitle]),
  ...data.nodes.flatMap(n => [n.label, n.area, n.description]),
  ...data.edges.map(e => e.label),
].join(' ');
assert.ok(!/Mac/.test(prose), 'architecture prose must say computer, not Mac');

// ── generator ────────────────────────────────────────────────────────────────────────────────────────────────────────
const fresh = gen.buildAll(data);
assert.deepEqual(gen.buildAll(data), fresh, 'generator must be deterministic');

function overlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0.5 && oy > 0.5;
}

function collinear(a, b) {
  const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b;
  const ah = Math.abs(y1 - y2) < 0.01 && Math.abs(y3 - y4) < 0.01;
  const av = Math.abs(x1 - x2) < 0.01 && Math.abs(x3 - x4) < 0.01;
  if (ah && Math.abs(y1 - y3) < 0.01) {
    return Math.min(Math.max(x1, x2), Math.max(x3, x4)) - Math.max(Math.min(x1, x2), Math.min(x3, x4)) > 0.5;
  }
  if (av && Math.abs(x1 - x3) < 0.01) {
    return Math.min(Math.max(y1, y2), Math.max(y3, y4)) - Math.max(Math.min(y1, y2), Math.min(y3, y4)) > 0.5;
  }
  return false;
}

for (const v of VIEWS) {
  const r = gen.renderView(data, v);
  assert.equal(fresh[v], r.svg, v + ': renderView and buildAll disagree');
  const repo = fs.readFileSync(gen.OUT[v], 'utf8');
  assert.equal(repo, fresh[v], v + ': the committed SVG is stale; run node admin/architecture_gen.js');
  assert.ok(repo.length > 1000, v + ': SVG is empty');
  for (const color of ['#EEF3F8', '#F8FAFC', '#DCE5EE', '#141A22', '#5B6675', '#E5342B']) {
    assert.ok(repo.includes(color), `${v}: missing brand colour ${color}`);
  }
  for (const label of ['Built', 'Building', 'Planned', 'After beta']) {
    assert.ok(repo.includes('>' + label + '</text>'), `${v}: missing legend ${label}`);
  }
  assert.ok(repo.includes('>' + data.views[v].title + '</text>'), v + ': missing title');
  assert.ok(!/Mac/.test(repo.replace(/<[^>]+>/g, ' ')), v + ': SVG says Mac');
  for (const e of data.edges.filter(e => e.views.includes(v))) {
    assert.ok(repo.includes('>' + e.label + '</text>'), `${v}: edge label not drawn: ${e.label}`);
  }

  // No two text boxes may overlap.
  for (let i = 0; i < r.texts.length; i++) {
    for (let j = i + 1; j < r.texts.length; j++) {
      assert.ok(!overlap(r.texts[i], r.texts[j]), `${v}: text overlaps: "${r.texts[i].str}" / "${r.texts[j].str}"`);
    }
  }
  // No two cards may overlap, and every text box stays inside the canvas.
  for (let i = 0; i < r.nodeBoxes.length; i++) {
    for (let j = i + 1; j < r.nodeBoxes.length; j++) {
      assert.ok(!overlap(r.nodeBoxes[i], r.nodeBoxes[j]), `${v}: cards overlap: ${r.nodeBoxes[i].id} / ${r.nodeBoxes[j].id}`);
    }
  }
  for (const t of r.texts) {
    assert.ok(t.x >= -0.5 && t.x + t.w <= r.width + 0.5, `${v}: text outside the canvas: ${t.str}`);
    assert.ok(t.y >= -0.5 && t.y + t.h <= r.height + 0.5, `${v}: text outside the canvas: ${t.str}`);
  }
  // No two edge segments may run on top of each other.
  const segs = r.edges.flatMap(e => e.segments);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      assert.ok(!collinear(segs[i], segs[j]), `${v}: edge segments overlap`);
    }
  }
}

// ── the admin page uses the new files ────────────────────────────────────────────────────────────────────────────────
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
assert.ok(html.includes('architecture.json'), 'admin page must load architecture.json');
assert.ok(html.includes("arch-' + esc(arView) + '.svg"), 'admin page must switch between the three SVGs');
assert.ok(html.includes('id="ar-stage"') && html.includes('id="ar-q"') && html.includes('id="ar-rows"'), 'admin page needs diagram, search and table');
assert.ok(!html.includes('architecture.svg'), 'admin page must not reference the old diagram');
assert.ok(!fs.existsSync(path.join(dir, 'architecture.svg')), 'old architecture.svg must be gone');

for (const v of VIEWS) {
  console.log(`${v}: ${layoutIds[v].length} components, ${data.edges.filter(e => e.views.includes(v)).length} flows`);
}
console.log('architecture.test.js: ok');
