/* =====================================================================
   Capitula Viewer — analyses computed from the encoding
   ===================================================================== */
(function () {
  "use strict";
  const M = window.CapitulaModel;

  const FILTERS = {
    all: { label: "all variants", pass: (r) => !r.isLacuna && r.type !== "lem" && r.type !== "unclear" },
    noOrth: {
      label: "without orthographic variants, slips and corrections",
      pass: (r) => !r.isLacuna && r.type !== "lem" && r.type !== "unclear" &&
        !["orthographic", "slip", "correction", "rubrication", "abbreviation", "digitisation", "damage"].includes(r.cause)
    },
    substantive: {
      label: "substantive variants only (substantive, maior, transpositions, additions, omissions)",
      pass: (r) => !r.isLacuna && ["substantive", "maior", "medium", "transposition", "addition", "omission"].includes(r.type) &&
        !["orthographic", "space", "numbering", "rubrication"].includes(r.cause)
    }
  };

  // the editor's own classification: @type="substantive" (more than 50% of the lemma
  // changed, see the working paper) and @subtype="error"
  FILTERS.substantiveOnly = {
    label: "only readings classified as substantive (@type=\"substantive\")",
    pass: (r) => !r.isLacuna && r.type === "substantive"
  };
  FILTERS.substantiveErrors = {
    label: "only substantive readings classified as errors (@type=\"substantive\" + @subtype=\"error\")",
    pass: (r) => !r.isLacuna && r.type === "substantive" && r.subtype === "error"
  };
  FILTERS.errors = {
    label: "only readings classified as errors (@subtype=\"error\")",
    pass: (r) => !r.isLacuna && r.subtype === "error"
  };

  // key of the reading of witness w at app, after filtering
  function keyFor(model, app, w, filter, layer) {
    const res = M.witnessReading(model, app, w, layer || "first");
    if (res.kind === "absent") return null;
    const lemKey = "=" + (app.lem.text || "").toLowerCase().replace(/\s+/g, "");
    if (res.kind === "lem") return { key: lemKey, lem: true };
    const r = res.reading;
    if (!FILTERS[filter].pass(r)) return { key: lemKey, lem: true };
    return { key: (r.text || "∅").toLowerCase().replace(/\s+/g, ""), lem: false, reading: r };
  }

  function agreements(model, opts) {
    const filter = opts.filter || "noOrth";
    const wits = model.witnesses.filter((w) => opts.includeEdition || w.kind !== "edition").map((w) => w.id);
    const n = wits.length;
    const mk = () => wits.map(() => wits.map(() => 0));
    const shared = mk(), same = mk(), both = mk();
    const sharedApps = mk().map((row) => row.map(() => []));
    let used = 0;
    model.apps.forEach((app) => {
      if (!opts.includeNum && app.isNum) return;
      if (!app.readings.some((r) => FILTERS[filter].pass(r))) return;
      used++;
      const keys = wits.map((w) => keyFor(model, app, w, filter));
      for (let i = 0; i < n; i++) {
        if (!keys[i]) continue;
        for (let j = 0; j < n; j++) {
          if (!keys[j]) continue;
          both[i][j]++;
          if (keys[i].key === keys[j].key) {
            same[i][j]++;
            if (!keys[i].lem) { shared[i][j]++; if (i < j) sharedApps[i][j].push(app.id); }
          }
        }
      }
    });
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) sharedApps[i][j] = sharedApps[j][i];
    return { wits, shared, same, both, sharedApps, used, filter };
  }

  function witnessProfiles(model, filter, includeNum) {
    filter = filter || "all";
    const rows = model.witnesses.map((w) => ({
      id: w.id, deviations: 0, singular: 0, singularApps: [], byCause: {}, byType: {},
      layers: 0, byHand: {}, absent: 0, present: 0
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    model.apps.forEach((app) => {
      if (!includeNum && app.isNum) return;
      const keys = new Map();
      model.witnesses.forEach((w) => {
        const k = keyFor(model, app, w.id, filter);
        keys.set(w.id, k);
        const row = byId.get(w.id);
        if (!k) { row.absent++; return; }
        row.present++;
        if (!k.lem) {
          row.deviations++;
          const c = k.reading.cause || "unspecified";
          row.byCause[c] = (row.byCause[c] || 0) + 1;
          const t = k.reading.type || "unspecified";
          row.byType[t] = (row.byType[t] || 0) + 1;
        }
        const arr = app.byWit.get(w.id);
        if (arr && arr.length > 1) {
          row.layers++;
          arr.slice(1).forEach((r) => { const h = r.hand || "?"; row.byHand[h] = (row.byHand[h] || 0) + 1; });
        }
      });
      // singular readings (shared by no other witness, editions excluded)
      const counts = {};
      keys.forEach((k, w) => {
        if (!k || k.lem || model.editionWits.includes(w)) return;
        counts[k.key] = (counts[k.key] || 0) + 1;
      });
      keys.forEach((k, w) => {
        if (!k || k.lem || model.editionWits.includes(w)) return;
        if (counts[k.key] === 1) { byId.get(w).singular++; byId.get(w).singularApps.push(app.id); }
      });
    });
    return rows;
  }

  function phiProfile(model) {
    const rows = [];
    model.blocks.forEach((b) => b.relNotes.forEach((rel) => rows.push({ block: b, rel, app: rel.appId ? model.appById.get(rel.appId) : null })));
    const summary = {};
    rows.forEach(({ rel }) => {
      const col = rel.exclusive ? "exclusive" : rel.shared.slice().sort().join("+");
      const row = rel.category;
      summary[row] = summary[row] || {};
      summary[row][col] = (summary[row][col] || 0) + 1;
    });
    return { rows, summary };
  }

  function numbering(model) {
    const blocks = model.blocks.filter((b) => b.kind === "item" || b.kind === "added");
    const witSet = new Set();
    const rows = blocks.map((b) => {
      const app = b.apps.map((id) => model.appById.get(id)).find((a) => a.isNum && a.depth === 0);
      const cells = {};
      if (app) {
        app.byWit.forEach((arr, w) => {
          if (arr.every((r) => r.isLacuna)) return;
          witSet.add(w);
          cells[w] = arr.map((r) => ({ text: r.text, type: r.type, cause: r.cause, hand: r.hand, varSeq: r.varSeq, rend: r.rend }));
        });
      }
      if (b.kind === "added") (b.addedBy || []).forEach((w) => { witSet.add(w); });
      return { block: b, app, cells };
    });
    const wits = M.sortWits(model, Array.from(witSet));
    return { rows, wits };
  }

  function corrections(model) {
    const list = [];
    const summary = {};
    model.apps.forEach((app) => {
      app.byWit.forEach((arr, w) => {
        if (arr.length < 2) return;
        list.push({ app, wit: w, layers: arr });
        summary[w] = summary[w] || { total: 0, byHand: {}, restores: 0, falseEm: 0 };
        summary[w].total++;
        const last = arr[arr.length - 1];
        const h = last.hand || "?";
        summary[w].byHand[h] = (summary[w].byHand[h] || 0) + 1;
        if (last.type === "lem" || last.cause === "correction") summary[w].restores++;
        if (last.cause === "falseEmendation") summary[w].falseEm++;
      });
    });
    return { list, summary };
  }

  window.CapitulaAnalysis = { FILTERS, agreements, witnessProfiles, phiProfile, numbering, corrections, keyFor };
})();
