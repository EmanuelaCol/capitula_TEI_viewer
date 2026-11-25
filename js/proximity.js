/* =====================================================================
   Capitula Viewer — proximity between witnesses
   Distances computed from the apparatus, neighbour-joining tree,
   classical multidimensional scaling (map), NEXUS / Newick export.
   These are measures of proximity, not a stemma: the tree is unrooted
   and does not distinguish shared innovations from shared retentions.
   ===================================================================== */
(function () {
  "use strict";
  const M = window.CapitulaModel;
  const A = window.CapitulaAnalysis;
  const esc = M.esc;

  const mat = (n, v) => Array.from({ length: n }, () => new Array(n).fill(v || 0));

  /* ------------------------------------------------------------------
     Data: one character per apparatus entry, one taxon per witness
     (optionally a second taxon for the corrected state, "p.c.").
     opts: filter, errorWeight, layer ('first'|'final'|'both'),
           includeEdition, includeNum, minCommon
     ------------------------------------------------------------------ */
  function build(models, opts) {
    const witIds = [];
    const info = {};
    models.forEach((m) => m.witnesses.forEach((w) => {
      if (!opts.includeEdition && w.kind === "edition") return;
      if ((opts.exclude || []).includes(w.id)) return;
      if (!info[w.id]) { witIds.push(w.id); info[w.id] = { role: w.role, books: 0 }; }
      info[w.id].books++;
    }));
    const chars = [];
    const corrected = new Set();
    models.forEach((m) => {
      m.apps.forEach((app) => {
        if (!opts.includeNum && app.isNum) return;
        if (!app.readings.some((r) => A.FILTERS[opts.filter].pass(r))) return;
        const b = m.blocks[app.blockIdx];
        const row = {
          book: m.title, app: app.id, chap: b.numLabel || M.label(b), lem: app.lem.text || "",
          error: app.readings.some((r) => r.subtype === "error" && A.FILTERS[opts.filter].pass(r)),
          cells: {}
        };
        witIds.forEach((w) => {
          if (!m.witById.has(w)) return;
          ["first", "final"].forEach((layer) => {
            const k = A.keyFor(m, app, w, opts.filter, layer);
            if (!k) return;
            row.cells[w + "|" + layer] = {
              key: k.key, lem: k.lem,
              weight: !k.lem && k.reading && k.reading.subtype === "error" ? opts.errorWeight : 1
            };
          });
          const a = row.cells[w + "|first"], c = row.cells[w + "|final"];
          if (a && c && a.key !== c.key) corrected.add(w);
        });
        chars.push(row);
      });
    });

    let taxa = witIds.map((w) => ({ id: w, wit: w, layer: opts.layer === "final" ? "final" : "first", role: info[w].role }));
    if (opts.layer === "both") {
      witIds.forEach((w) => { if (corrected.has(w)) taxa.push({ id: w + " p.c.", wit: w, layer: "final", role: info[w].role, corrected: true }); });
    }
    const cellOf = (row, t) => row.cells[t.wit + "|" + t.layer] || null;
    // drop taxa without any data
    taxa = taxa.filter((t) => chars.some((row) => cellOf(row, t)));

    const n = taxa.length;
    const dis = mat(n), sumW = mat(n), common = mat(n);
    chars.forEach((row) => {
      const cs = taxa.map((t) => cellOf(row, t));
      for (let i = 0; i < n; i++) {
        const a = cs[i];
        if (!a) continue;
        for (let j = i + 1; j < n; j++) {
          const b = cs[j];
          if (!b) continue;
          const w = Math.max(a.weight, b.weight);
          sumW[i][j] += w; common[i][j]++;
          if (a.key !== b.key) dis[i][j] += w;
        }
      }
    });
    const D = mat(n);
    const weak = [];
    let maxD = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      common[j][i] = common[i][j];
      if (sumW[i][j] > 0) { D[i][j] = D[j][i] = dis[i][j] / sumW[i][j]; maxD = Math.max(maxD, D[i][j]); }
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (common[i][j] < (opts.minCommon || 1)) {
        weak.push([taxa[i].id, taxa[j].id, common[i][j]]);
        if (!sumW[i][j]) D[i][j] = D[j][i] = maxD || 1;
      }
    }
    return { taxa, chars, D, common, weak, cellOf, opts, nBooks: models.length };
  }

  /* ------------------------- neighbour joining ------------------------- */
  // returns { nodes: [{id, label|null}], adj: Map(id -> [{to, len}]), center }
  function nj(D, labels) {
    const n = labels.length;
    const nodes = labels.map((l, i) => ({ id: i, label: l }));
    const adj = new Map(nodes.map((x) => [x.id, []]));
    const link = (a, b, len) => { adj.get(a).push({ to: b, len }); adj.get(b).push({ to: a, len }); };
    const d = new Map();
    const key = (a, b) => (a < b ? a + "," + b : b + "," + a);
    const get = (a, b) => (a === b ? 0 : d.get(key(a, b)));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d.set(key(i, j), D[i][j]);
    let act = nodes.map((x) => x.id);
    if (n === 1) return { nodes, adj, center: 0 };
    if (n === 2) { link(0, 1, D[0][1]); return { nodes, adj, center: 0 }; }
    while (act.length > 2) {
      const m = act.length;
      const r = new Map(act.map((i) => [i, act.reduce((s, k) => s + get(i, k), 0)]));
      let best = null;
      for (let x = 0; x < m; x++) for (let y = x + 1; y < m; y++) {
        const i = act[x], j = act[y];
        const q = (m - 2) * get(i, j) - r.get(i) - r.get(j);
        if (!best || q < best.q - 1e-12) best = { q, i, j };
      }
      const { i, j } = best;
      const u = nodes.length;
      nodes.push({ id: u, label: null });
      adj.set(u, []);
      const dij = get(i, j);
      let li = m > 2 ? dij / 2 + (r.get(i) - r.get(j)) / (2 * (m - 2)) : dij / 2;
      li = Math.max(0, Math.min(dij, li));
      const lj = Math.max(0, dij - li);
      link(u, i, li); link(u, j, lj);
      act.forEach((k) => { if (k !== i && k !== j) d.set(key(u, k), Math.max(0, (get(i, k) + get(j, k) - dij) / 2)); });
      act = act.filter((k) => k !== i && k !== j).concat(u);
    }
    link(act[0], act[1], get(act[0], act[1]));
    return { nodes, adj, center: act[1] };
  }

  function newick(tree) {
    const q = (s) => (/^[A-Za-z0-9_.-]+$/.test(s) ? s : "'" + s.replace(/'/g, "''") + "'");
    const rec = (v, parent) => {
      const ch = tree.adj.get(v).filter((e) => e.to !== parent);
      const label = tree.nodes[v].label;
      if (!ch.length) return q(label || "");
      return "(" + ch.map((e) => rec(e.to, v) + ":" + e.len.toFixed(5)).join(",") + ")" + (label ? q(label) : "");
    };
    return rec(tree.center, -1) + ";";
  }

  // equal-angle layout of the unrooted tree
  function layout(tree) {
    let maxLen = 0;
    tree.adj.forEach((es) => es.forEach((e) => { maxLen = Math.max(maxLen, e.len); }));
    const minLen = (maxLen || 1) * 0.02;
    const leaves = new Map();
    const count = (v, parent) => {
      const ch = tree.adj.get(v).filter((e) => e.to !== parent);
      const c = ch.length ? ch.reduce((s, e) => s + count(e.to, v), 0) : 1;
      leaves.set(v, c);
      return c;
    };
    count(tree.center, -1);
    const pos = new Map([[tree.center, { x: 0, y: 0 }]]);
    const edges = [];
    const place = (v, parent, a0, a1) => {
      const ch = tree.adj.get(v).filter((e) => e.to !== parent);
      const total = ch.reduce((s, e) => s + leaves.get(e.to), 0) || 1;
      let a = a0;
      ch.forEach((e) => {
        const span = (a1 - a0) * leaves.get(e.to) / total;
        const mid = a + span / 2;
        const len = Math.max(e.len, minLen);
        const p = pos.get(v);
        const q = { x: p.x + len * Math.cos(mid), y: p.y + len * Math.sin(mid), angle: mid };
        pos.set(e.to, q);
        edges.push({ from: v, to: e.to, len: e.len });
        place(e.to, v, a, a + span);
        a += span;
      });
    };
    place(tree.center, -1, 0, 2 * Math.PI);
    return { pos, edges, maxLen };
  }

  /* ----------------------- classical MDS (2-D) ----------------------- */
  function mds(D) {
    const n = D.length;
    if (n < 3) return D.map((_, i) => [i, 0]);
    const D2 = D.map((r) => r.map((v) => v * v));
    const rm = D2.map((r) => r.reduce((s, v) => s + v, 0) / n);
    const gm = rm.reduce((s, v) => s + v, 0) / n;
    const B = D2.map((r, i) => r.map((v, j) => -0.5 * (v - rm[i] - rm[j] + gm)));
    const eig = (Bm) => {
      let v = Bm.map((_, i) => Math.sin(i + 1) + 1.5);
      let lam = 0;
      for (let it = 0; it < 500; it++) {
        const w = Bm.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
        const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
        lam = w.reduce((s, x, i) => s + x * v[i], 0);
        v = w.map((x) => x / norm);
      }
      lam = Bm.reduce((s, r, i) => s + v[i] * r.reduce((t, x, j) => t + x * v[j], 0), 0);
      return { v, lam };
    };
    const e1 = eig(B);
    const B2 = B.map((r, i) => r.map((x, j) => x - e1.lam * e1.v[i] * e1.v[j]));
    const e2 = eig(B2);
    const s1 = Math.sqrt(Math.max(e1.lam, 0)), s2 = Math.sqrt(Math.max(e2.lam, 0));
    const trace = B.reduce((s, r, i) => s + Math.max(0, r[i]), 0) || 1;
    const coords = e1.v.map((x, i) => [x * s1, e2.v[i] * s2]);
    coords.explained = (Math.max(e1.lam, 0) + Math.max(e2.lam, 0)) / trace;
    return coords;
  }

  /* ----------------------------- drawing ----------------------------- */
  // black-and-white markers: filled circle = group, open square = comparandum,
  // open triangle = printed edition, open circle = corrected state (p.c.), filled square = other ms
  function marker(t, x, y, r) {
    r = r || 4.5;
    if (t.corrected) return `<circle cx="${x}" cy="${y}" r="${r}" class="mk mk-open"/>`;
    if (t.role === "comparandum") return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" class="mk mk-open"/>`;
    if (t.role === "edition") return `<path d="M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z" class="mk mk-open"/>`;
    if (t.role === "group") return `<circle cx="${x}" cy="${y}" r="${r}" class="mk mk-fill"/>`;
    return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" class="mk mk-fill"/>`;
  }

  function legend(groupLabel, hasPc, hasEd) {
    const it = (svg, label) => `<span class="pk"><svg width="14" height="14" viewBox="0 0 14 14">${svg}</svg> ${label}</span>`;
    return `<div class="prox-key">` +
      it(marker({ role: "group" }, 7, 7, 4.5), esc(groupLabel || "group")) +
      it(marker({ role: "comparandum" }, 7, 7, 4.5), "comparandum") +
      (hasEd ? it(marker({ role: "edition" }, 7, 7, 4), "printed edition") : "") +
      (hasPc ? it(marker({ corrected: true }, 7, 7, 4.5), "corrected state (p.c.)") : "") +
      `</div>`;
  }

  function treeSVG(data, tree) {
    const L = layout(tree);
    const W = 760, H = 560, pad = 70;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    L.pos.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    const k = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxY - minY) || 1));
    const X = (x) => pad + (x - minX) * k + ((W - 2 * pad) - (maxX - minX) * k) / 2;
    const Y = (y) => pad + (y - minY) * k + ((H - 2 * pad) - (maxY - minY) * k) / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="prox-svg" role="img" aria-label="Neighbour-joining tree of the witnesses">`;
    L.edges.forEach((e) => {
      const a = L.pos.get(e.from), b = L.pos.get(e.to);
      s += `<line x1="${X(a.x).toFixed(1)}" y1="${Y(a.y).toFixed(1)}" x2="${X(b.x).toFixed(1)}" y2="${Y(b.y).toFixed(1)}" class="edge"><title>${e.len.toFixed(3)}</title></line>`;
    });
    tree.nodes.forEach((nd) => {
      if (nd.label == null) return;
      const t = data.taxa[nd.id];
      const p = L.pos.get(nd.id);
      const x = X(p.x), y = Y(p.y);
      const ang = p.angle || 0;
      const right = Math.cos(ang) >= 0;
      const lx = x + Math.cos(ang) * 10, ly = y + Math.sin(ang) * 10 + 4;
      s += `<g class="taxon" data-wit="${esc(t.wit)}">${marker(t, x, y)}<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${right ? "start" : "end"}" class="tl${t.corrected ? " pc" : ""}">${esc(t.id)}</text></g>`;
    });
    // scale bar: a round distance
    const target = (L.maxLen || 0.1) / 2;
    const steps = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
    const unit = steps.reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b), steps[0]);
    const len = unit * k;
    s += `<g class="scale"><line x1="${pad}" y1="${H - 24}" x2="${pad + len}" y2="${H - 24}"/><line x1="${pad}" y1="${H - 28}" x2="${pad}" y2="${H - 20}"/><line x1="${pad + len}" y1="${H - 28}" x2="${pad + len}" y2="${H - 20}"/><text x="${pad + len + 8}" y="${H - 20}">${Math.round(unit * 100 * 10) / 10}% weighted disagreement</text></g>`;
    return s + `</svg>`;
  }

  function mapSVG(data, coords) {
    const W = 760, H = 520, pad = 60;
    const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxY - minY) || 1));
    const X = (x) => pad + (x - minX) * k + ((W - 2 * pad) - (maxX - minX) * k) / 2;
    const Y = (y) => pad + (y - minY) * k + ((H - 2 * pad) - (maxY - minY) * k) / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="prox-svg" role="img" aria-label="Map of the distances between witnesses">`;
    s += `<line x1="${X(0)}" y1="${pad / 2}" x2="${X(0)}" y2="${H - pad / 2}" class="axis"/><line x1="${pad / 2}" y1="${Y(0)}" x2="${W - pad / 2}" y2="${Y(0)}" class="axis"/>`;
    coords.forEach((c, i) => {
      const t = data.taxa[i];
      const x = X(c[0]), y = Y(c[1]);
      s += `<g class="taxon" data-wit="${esc(t.wit)}">${marker(t, x, y)}<text x="${(x + 8).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="tl${t.corrected ? " pc" : ""}">${esc(t.id)}</text></g>`;
    });
    return s + `</svg>`;
  }

  /* ----------------------------- export ----------------------------- */
  const SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function nexus(data, meta) {
    const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const taxa = data.taxa;
    const rows = taxa.map(() => []);
    const labels = [];
    const errorChars = [];
    let maxState = 0;
    data.chars.forEach((row, ci) => {
      const states = new Map();
      const lemKey = "=" + (row.lem || "").toLowerCase().replace(/\s+/g, "");
      states.set(lemKey, 0);
      taxa.forEach((t, ti) => {
        const c = data.cellOf(row, t);
        if (!c) { rows[ti].push("?"); return; }
        const k = c.lem ? lemKey : c.key;
        if (!states.has(k)) states.set(k, states.size);
        const s = states.get(k);
        maxState = Math.max(maxState, s);
        rows[ti].push(s < SYMBOLS.length ? SYMBOLS[s] : "?");
      });
      labels.push(`[${ci + 1}: ${[row.book, row.chap, row.lem].join(" ").replace(/[[\]';]/g, "")}${row.error ? " (error)" : ""}]`);
      if (row.error) errorChars.push(ci + 1);
    });
    const width = Math.max(...taxa.map((t) => q(t.id).length)) + 2;
    const pad = (s) => s + " ".repeat(Math.max(1, width - s.length));
    let out = `#NEXUS\n[Generated by Capitula Viewer, ${new Date().toISOString().slice(0, 10)}]\n[Source: ${meta.source}]\n`;
    out += `[Characters = apparatus entries (${A.FILTERS[data.opts.filter].label}${data.opts.includeNum ? "" : ", chapter numbers excluded"}).]\n`;
    out += `[State 0 = critical text; 1, 2... = other readings; ? = lacuna or witness absent. Layer: ${data.opts.layer === "final" ? "final state" : data.opts.layer === "both" ? "first hand, plus corrected states as separate taxa" : "first hand"}.]\n`;
    out += `[A proximity analysis, not a stemma.]\n\n`;
    out += `BEGIN TAXA;\n  DIMENSIONS NTAX=${taxa.length};\n  TAXLABELS ${taxa.map((t) => q(t.id)).join(" ")};\nEND;\n\n`;
    out += `BEGIN CHARACTERS;\n  DIMENSIONS NCHAR=${data.chars.length};\n  FORMAT DATATYPE=STANDARD MISSING=? GAP=- SYMBOLS="${SYMBOLS.slice(0, Math.max(2, maxState + 1)).split("").join(" ")}";\n  MATRIX\n`;
    taxa.forEach((t, i) => { out += "  " + pad(q(t.id)) + rows[i].join("") + "\n"; });
    out += `  ;\nEND;\n\n`;
    if (data.opts.errorWeight > 1 && errorChars.length) {
      out += `[Characters containing a reading classified as error (@subtype="error") are weighted ${data.opts.errorWeight}.]\nBEGIN ASSUMPTIONS;\n  WTSET * errors = ${data.opts.errorWeight}: ${errorChars.join(" ")};\nEND;\n\n`;
    }
    out += `BEGIN DISTANCES;\n  DIMENSIONS NTAX=${taxa.length};\n  FORMAT TRIANGLE=LOWER DIAGONAL LABELS;\n  MATRIX\n`;
    taxa.forEach((t, i) => { out += "  " + pad(q(t.id)) + data.D[i].slice(0, i + 1).map((v) => v.toFixed(5)).join(" ") + "\n"; });
    out += `  ;\nEND;\n\n[Character list]\n` + labels.join("\n") + "\n";
    return out;
  }

  function distanceCSV(data) {
    const head = ["witness"].concat(data.taxa.map((t) => t.id));
    const rows = [head].concat(data.taxa.map((t, i) => [t.id].concat(data.D[i].map((v) => v.toFixed(4)))));
    return rows.map((r) => r.map((v) => (/[",;]/.test(v) ? `"${v}"` : v)).join(",")).join("\n");
  }

  window.CapitulaProximity = { build, nj, newick, layout, mds, treeSVG, mapSVG, legend, nexus, distanceCSV };
})();
