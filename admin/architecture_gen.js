#!/usr/bin/env node
'use strict';

// Draws the three architecture diagrams from architecture.json.
// Plain Node, no dependencies, deterministic output.

const fs = require('node:fs');
const path = require('node:path');

const DATA = path.join(__dirname, 'architecture.json');
const OUT = {
  overview: path.join(__dirname, 'arch-overview.svg'),
  studio: path.join(__dirname, 'arch-studio.svg'),
  music: path.join(__dirname, 'arch-music.svg'),
};

const W = 1200;
const MARGIN = 70;
const CONTENT = W - 2 * MARGIN;
const CARD_W = 150;
const CARD_H = 64;
const CARD_GAP = 20;
const GROUP_GAP = 48;
const BAND_H = 98;
const CARD_TOP = 28;
const HEADER_H = 96;
const FOOTER_H = 40;
const LANE_GAP = 11;
const LABEL_FONT = 9.2;
const LABEL_H = 11.5;
const NODE_FONT = 13.2;
const LINE_H = 15.5;

const BG = '#EEF3F8';
const CARD = '#F8FAFC';
const LINE = '#DCE5EE';
const TEXT = '#141A22';
const MUTED = '#5B6675';
const FAINT = '#8A96A5';
const ACCENT = '#E5342B';
const EDGE = '#93A1B1';

const FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif';
const MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace';

const STATUS = {
  built: { label: 'Built', color: '#1E8E3E', dash: null },
  building: { label: 'Building', color: '#C77700', dash: null },
  planned: { label: 'Planned', color: '#8A96A5', dash: '4 3' },
  'after-beta': { label: 'After beta', color: '#5B6675', dash: null },
};

function r1(n) {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function fmt(n) {
  return String(r1(n));
}

function xesc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function charW(ch, size) {
  if (ch === ' ') return 0.28 * size;
  if ("ilI.,'|:;!".includes(ch)) return 0.28 * size;
  if ('mwMW'.includes(ch)) return 0.86 * size;
  if (ch >= 'A' && ch <= 'Z') return 0.66 * size;
  if (ch >= '0' && ch <= '9') return 0.58 * size;
  if ('·—–'.includes(ch)) return 0.42 * size;
  return 0.54 * size;
}

function textWidth(s, size) {
  let w = 0;
  for (const ch of s) w += charW(ch, size);
  return w;
}

function textWidthBold(s, size) {
  return textWidth(s, size) * 1.05;
}

function wrapLines(text, maxW, size, bold) {
  const measure = bold ? textWidthBold : textWidth;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (!cur || measure(test, size) <= maxW) {
      cur = test;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitLabel(text) {
  for (const size of [13.2, 12.6, 12.0, 11.4, 10.8]) {
    const lines = wrapLines(text, CARD_W - 22, size, true);
    if (lines.length <= 2) return { size, lines };
  }
  const lines = wrapLines(text, CARD_W - 22, 10.8, true).slice(0, 2);
  if (lines.length === 2) lines[1] = lines[1].replace(/\s+\S*$/, '') + '…';
  return { size: 10.8, lines };
}

function statusOf(node) {
  const s = STATUS[node.status];
  if (!s) throw new Error('Unknown status "' + node.status + '" on ' + node.id);
  return s;
}

function layout(data, viewId) {
  const view = data.views[viewId];
  if (!view) throw new Error('Unknown view ' + viewId);
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const rows = view.rows.map((row, index) => ({
    id: row.id,
    index,
    groups: row.groups.map(g => ({
      id: g.id,
      title: g.title,
      nodes: g.nodes.map(id => {
        const n = byId.get(id);
        if (!n) throw new Error('View ' + viewId + ' names missing node ' + id);
        return n;
      }),
    })),
  }));

  const rowOf = new Map();
  for (const row of rows) {
    for (const g of row.groups) {
      for (const n of g.nodes) {
        if (rowOf.has(n.id)) throw new Error('Node ' + n.id + ' appears twice in ' + viewId);
        rowOf.set(n.id, row.index);
      }
    }
  }

  // A tiny per-row shift keeps cards in different rows from sharing the same
  // vertical attachment x, so two flows never run on top of each other.
  const ROW_SHIFT = [0, 4, -3, 6, -5, 2, -6, 5, -2, 3, -4, 1, -1];
  const nodes = new Map();
  for (const row of rows) {
    const widths = row.groups.map(g => g.nodes.length * CARD_W + Math.max(0, g.nodes.length - 1) * CARD_GAP);
    const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, row.groups.length - 1) * GROUP_GAP;
    let x = MARGIN + (CONTENT - total) / 2 + ROW_SHIFT[row.index % ROW_SHIFT.length];
    for (let gi = 0; gi < row.groups.length; gi++) {
      for (const n of row.groups[gi].nodes) {
        nodes.set(n.id, { node: n, x, y: 0, w: CARD_W, h: CARD_H, row: row.index, cx: x + CARD_W / 2 });
        x += CARD_W + CARD_GAP;
      }
      x -= CARD_GAP;
      if (gi < row.groups.length - 1) x += GROUP_GAP;
    }
  }

  const edges = data.edges
    .filter(e => e.views.includes(viewId))
    .map((e, index) => ({ ...e, index }));

  for (const e of edges) {
    if (!nodes.has(e.from)) throw new Error('Edge from missing node ' + e.from + ' in ' + viewId);
    if (!nodes.has(e.to)) throw new Error('Edge to missing node ' + e.to + ' in ' + viewId);
    e.s = nodes.get(e.from);
    e.t = nodes.get(e.to);
    e.sr = rowOf.get(e.from);
    e.tr = rowOf.get(e.to);
  }

  const last = rows.length - 1;
  const gapItems = Array.from({ length: rows.length }, () => []);
  const skips = [];

  for (const e of edges) {
    if (e.sr === e.tr) {
      const down = e.sr < last;
      const gap = down ? e.sr : Math.max(0, e.sr - 1);
      e.dir = down ? 'down' : 'up';
      e.exitSide = down ? 'bottom' : 'top';
      e.entrySide = e.exitSide;
      e.gap = gap;
      gapItems[gap].push({ e, kind: 'A', x: e.s.cx });
    } else if (e.tr === e.sr + 1) {
      e.dir = 'down';
      e.exitSide = 'bottom';
      e.entrySide = 'top';
      e.gap = e.sr;
      gapItems[e.sr].push({ e, kind: 'A', x: e.s.cx });
    } else if (e.tr === e.sr - 1) {
      e.dir = 'up';
      e.exitSide = 'top';
      e.entrySide = 'bottom';
      e.gap = e.tr;
      gapItems[e.tr].push({ e, kind: 'A', x: e.t.cx });
    } else {
      e.dir = e.tr > e.sr ? 'down' : 'up';
      e.exitSide = e.dir === 'down' ? 'bottom' : 'top';
      e.entrySide = e.dir === 'down' ? 'top' : 'bottom';
      e.gapS = e.dir === 'down' ? e.sr : e.sr - 1;
      e.gapT = e.dir === 'down' ? e.tr - 1 : e.tr;
      gapItems[e.gapS].push({ e, kind: 'S', x: e.s.cx });
      gapItems[e.gapT].push({ e, kind: 'T', x: e.t.cx });
      skips.push(e);
    }
  }

  const laneInfo = gapItems.map(items => {
    const sorted = items.slice().sort((a, b) => (a.x - b.x) || (a.e.index - b.e.index) || (a.kind < b.kind ? -1 : 1));
    sorted.forEach((it, i) => {
      it.lane = i;
      if (it.kind === 'S') it.e.laneS = i;
      else if (it.kind === 'T') it.e.laneT = i;
      else it.e.lane = i;
    });
    return sorted;
  });

  const gapH = laneInfo.map((items, g) => {
    if (g === last) return items.length ? Math.max(30, items.length * LANE_GAP + 24) : 26;
    return items.length ? Math.max(52, items.length * LANE_GAP + 26) : 52;
  });

  const bandTop = [];
  let cursor = HEADER_H;
  for (let i = 0; i < rows.length; i++) {
    bandTop.push(cursor);
    cursor += BAND_H + gapH[i];
  }
  const height = Math.ceil(cursor + FOOTER_H);

  for (const n of nodes.values()) n.y = bandTop[n.row] + CARD_TOP;

  const laneY = laneInfo.map((items, g) => {
    if (!items.length) return [];
    const top = bandTop[g] + BAND_H + 9;
    const bottom = (g < last ? bandTop[g + 1] : bandTop[g] + BAND_H + gapH[g]) - 8;
    const span = Math.max(0, bottom - top);
    return items.map((_, i) => top + span * (i + 0.5) / items.length);
  });

  const attachments = new Map();
  for (const n of nodes.values()) attachments.set(n.node.id, { top: [], bottom: [] });
  for (const e of edges) {
    attachments.get(e.from)[e.exitSide].push({ e, role: 'out' });
    attachments.get(e.to)[e.entrySide].push({ e, role: 'in' });
  }
  for (const [id, a] of attachments) {
    for (const side of ['top', 'bottom']) {
      const list = a[side];
      list.forEach((it, i) => {
        const x = nodes.get(id).x + 12 + (CARD_W - 24) * (i + 0.5) / list.length;
        if (it.role === 'out') it.e.exitX = x;
        else it.e.entryX = x;
      });
    }
  }

  skips.sort((a, b) => ((a.s.cx + a.t.cx) - (b.s.cx + b.t.cx)) || (a.index - b.index));
  const sides = { left: [], right: [] };
  skips.forEach((e, i) => {
    const mid = (e.s.cx + e.t.cx) / 2;
    let side = i % 2 === 0 ? (mid < W / 2 ? 'left' : 'right') : (mid < W / 2 ? 'right' : 'left');
    if (sides.left.length - sides.right.length >= 3 && side === 'left') side = 'right';
    if (sides.right.length - sides.left.length >= 3 && side === 'right') side = 'left';
    e.marginSide = side;
    sides[side].push(e);
  });
  const spacingL = sides.left.length > 1 ? Math.min(8.5, (MARGIN - 22) / (sides.left.length - 1)) : 8.5;
  const spacingR = sides.right.length > 1 ? Math.min(8.5, (MARGIN - 22) / (sides.right.length - 1)) : 8.5;
  sides.left.forEach((e, i) => { e.marginX = MARGIN - 12 - i * spacingL; });
  sides.right.forEach((e, i) => { e.marginX = W - MARGIN + 12 + i * spacingR; });

  for (const e of edges) {
    const s = e.s;
    const t = e.t;
    const sx = e.exitX;
    const tx = e.entryX;
    const sEdge = e.exitSide === 'bottom' ? s.y + s.h : s.y;
    const tEdge = e.entrySide === 'top' ? t.y : t.y + t.h;
    let pts;
    if (e.gapS === undefined) {
      const ly = laneY[e.gap][e.lane];
      pts = [[sx, sEdge], [sx, ly], [tx, ly], [tx, tEdge]];
    } else {
      const lyS = laneY[e.gapS][e.laneS];
      const lyT = laneY[e.gapT][e.laneT];
      pts = [[sx, sEdge], [sx, lyS], [e.marginX, lyS], [e.marginX, lyT], [tx, lyT], [tx, tEdge]];
    }
    e.points = pts;
    e.segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
      e.segments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
    }
    e.d = pts.map((p, i) => (i ? 'L' : 'M') + fmt(p[0]) + ' ' + fmt(p[1])).join(' ');
  }

  return { view, rows, nodes, edges, bandTop, gapH, laneInfo, laneY, height, last };
}

function renderView(data, viewId) {
  const L = layout(data, viewId);
  const { view, rows, nodes, edges, bandTop, height, last } = L;
  const texts = [];
  const nodeBoxes = [];
  const out = [];

  function text(x, y, str, opts = {}) {
    const size = opts.size || 12;
    const weight = opts.weight || 400;
    const anchor = opts.anchor || 'start';
    const fill = opts.fill || TEXT;
    const family = opts.mono ? MONO : FONT;
    const w = (opts.bold ? textWidthBold(str, size) : textWidth(str, size)) + (opts.letterSpacing || 0) * Math.max(0, str.length - 1);
    let x0 = x;
    if (anchor === 'middle') x0 = x - w / 2;
    if (anchor === 'end') x0 = x - w;
    const h = size * 1.05;
    texts.push({ str, x: x0, y: y - size * 0.8, w, h, kind: opts.kind || 'text' });
    const attrs = [
      'x="' + fmt(x) + '"',
      'y="' + fmt(y) + '"',
      'font-family="' + xesc(family) + '"',
      'font-size="' + fmt(size) + '"',
      'font-weight="' + weight + '"',
      'fill="' + fill + '"',
    ];
    if (anchor !== 'start') attrs.push('text-anchor="' + anchor + '"');
    if (opts.letterSpacing) attrs.push('letter-spacing="' + fmt(opts.letterSpacing) + '"');
    out.push('<text ' + attrs.join(' ') + '>' + xesc(str) + '</text>');
  }

  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + height + '" viewBox="0 0 ' + W + ' ' + height + '" role="img" aria-labelledby="ar-title ar-desc">');
  out.push('<title id="ar-title">' + xesc(view.title) + '</title>');
  out.push('<desc id="ar-desc">' + xesc(view.subtitle + '. ' + nodes.size + ' components and ' + edges.length + ' flows.') + '</desc>');
  out.push('<defs>');
  out.push('<marker id="ar-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" fill="' + FAINT + '"/></marker>');
  out.push('</defs>');
  out.push('<rect width="' + W + '" height="' + height + '" fill="' + BG + '"/>');

  // Header
  out.push('<rect x="' + MARGIN + '" y="23" width="4" height="23" rx="2" fill="' + ACCENT + '"/>');
  text(MARGIN + 14, 42, view.title, { size: 21, weight: 700, bold: true, kind: 'title' });
  text(MARGIN + 14, 61, view.subtitle, { size: 11.5, fill: MUTED, kind: 'subtitle' });

  // Legend
  const legend = Object.values(STATUS);
  const itemW = s => 17 + textWidth(s.label, 10.5);
  const legendW = legend.reduce((a, s) => a + itemW(s), 0) + 14 * (legend.length - 1);
  let lx = W - MARGIN - legendW;
  for (const s of legend) {
    if (s.dash) {
      out.push('<line x1="' + fmt(lx) + '" y1="39" x2="' + fmt(lx + 12) + '" y2="39" stroke="' + s.color + '" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + s.dash + '"/>');
    } else {
      out.push('<rect x="' + fmt(lx) + '" y="37.5" width="12" height="3" rx="1.5" fill="' + s.color + '"/>');
    }
    text(lx + 17, 42, s.label, { size: 10.5, fill: MUTED, kind: 'legend' });
    lx += itemW(s) + 14;
  }
  text(W - MARGIN, 61, 'Updated ' + data.updated, { size: 9.5, fill: FAINT, anchor: 'end', mono: true, kind: 'meta' });

  // Bands and nodes. Titles are drawn last, on an opaque strip, so a line
  // entering a card never runs through the lettering.
  const bandTitles = [];
  for (const row of rows) {
    const y = bandTop[row.index];
    out.push('<rect x="' + MARGIN + '" y="' + fmt(y) + '" width="' + CONTENT + '" height="' + BAND_H + '" rx="10" fill="' + CARD + '" stroke="' + LINE + '"/>');
    const bandTitle = row.groups.map(g => g.title).join('  ·  ').toUpperCase();
    bandTitles.push({ y, text: bandTitle, width: textWidth(bandTitle, 10.5) + 1.1 * Math.max(0, bandTitle.length - 1) });

    for (const g of row.groups) {
      for (const n of g.nodes) {
        const p = nodes.get(n.id);
        const st = statusOf(n);
        nodeBoxes.push({ id: n.id, x: p.x, y: p.y, w: p.w, h: p.h });
        out.push('<g>');
        out.push('<title>' + xesc(n.label + ' — ' + st.label + ' — ' + n.description) + '</title>');
        out.push('<rect x="' + fmt(p.x) + '" y="' + fmt(p.y) + '" width="' + CARD_W + '" height="' + CARD_H + '" rx="8" fill="#FFFFFF" stroke="' + LINE + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : '') + '/>');
        out.push('<rect x="' + fmt(p.x + 1) + '" y="' + fmt(p.y + 10) + '" width="3" height="' + (CARD_H - 20) + '" rx="1.5" fill="' + st.color + '"/>');
        const fit = fitLabel(n.label);
        const total = fit.lines.length * LINE_H;
        const first = p.y + (CARD_H - 12 - total) / 2 + fit.size * 0.82;
        fit.lines.forEach((line, i) => {
          text(p.cx, first + i * LINE_H, line, { size: fit.size, weight: 600, bold: true, anchor: 'middle', fill: TEXT, kind: 'node' });
        });
        text(p.cx, p.y + CARD_H - 10, st.label.toUpperCase(), { size: 8.4, weight: 600, anchor: 'middle', fill: st.color, letterSpacing: 0.5, kind: 'status' });
        out.push('</g>');
      }
    }
  }

  // Edges, then their labels so the label background sits above the lines.
  for (const e of edges) {
    out.push('<path d="' + e.d + '" fill="none" stroke="' + EDGE + '" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#ar-arrow)"/>');
  }

  for (const e of edges) {
    let x1, x2, ly;
    if (e.gapS === undefined) {
      x1 = e.exitX;
      x2 = e.entryX;
      ly = L.laneY[e.gap][e.lane];
    } else {
      x1 = e.marginX;
      x2 = e.entryX;
      ly = L.laneY[e.gapT][e.laneT];
    }
    const label = String(e.label || '');
    if (!label) continue;
    const tw = textWidth(label, LABEL_FONT);
    const lw = tw + 8;
    const mid = (x1 + x2) / 2;
    let lx = mid - lw / 2;
    lx = Math.max(6, Math.min(W - 6 - lw, lx));
    out.push('<rect x="' + fmt(lx) + '" y="' + fmt(ly - LABEL_H / 2) + '" width="' + fmt(lw) + '" height="' + LABEL_H + '" rx="3" fill="' + BG + '" opacity="0.96"/>');
    text(lx + lw / 2, ly + LABEL_FONT * 0.34, label, { size: LABEL_FONT, anchor: 'middle', fill: MUTED, kind: 'edge' });
  }

  // Band titles, on an opaque strip above the cards.
  for (const t of bandTitles) {
    out.push('<rect x="' + (MARGIN + 9) + '" y="' + fmt(t.y + 5) + '" width="' + fmt(t.width + 22) + '" height="18" rx="4" fill="' + CARD + '"/>');
    out.push('<rect x="' + (MARGIN + 14) + '" y="' + fmt(t.y + 13) + '" width="4" height="4" rx="1" fill="' + ACCENT + '"/>');
    text(MARGIN + 24, t.y + 18, t.text, { size: 10.5, weight: 600, fill: MUTED, letterSpacing: 1.1, kind: 'band' });
  }

  // Footer
  const footY = height - FOOTER_H + 12;
  out.push('<line x1="' + MARGIN + '" y1="' + fmt(footY) + '" x2="' + (W - MARGIN) + '" y2="' + fmt(footY) + '" stroke="' + LINE + '"/>');
  text(MARGIN, footY + 17, 'Generated from admin/architecture.json · ' + data.updated, { size: 9, fill: FAINT, mono: true, kind: 'footer' });
  text(W - MARGIN, footY + 17, nodes.size + ' components · ' + edges.length + ' flows', { size: 9, fill: FAINT, mono: true, anchor: 'end', kind: 'footer' });

  out.push('</svg>');
  return { svg: out.join('\n') + '\n', texts, nodeBoxes, edges, height, width: W };
}

function buildAll(data) {
  const out = {};
  for (const viewId of Object.keys(data.views)) out[viewId] = renderView(data, viewId).svg;
  return out;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const svgs = buildAll(data);
  for (const [viewId, svg] of Object.entries(svgs)) {
    if (!OUT[viewId]) throw new Error('No output path for view ' + viewId);
    fs.writeFileSync(OUT[viewId], svg);
    console.log('wrote ' + path.relative(process.cwd(), OUT[viewId]) + ' (' + svg.length + ' bytes)');
  }
}

if (require.main === module) main();

module.exports = { layout, renderView, buildAll, DATA, OUT, W };
