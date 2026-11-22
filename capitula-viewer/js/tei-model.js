/* =====================================================================
   Capitula Viewer — TEI model
   Parses a TEI critical edition of biblical capitula into a plain JS
   model: witnesses, blocks (incipit / capitula / section headings /
   explicit), apparatus entries with reading layers, page breaks and
   an encoding-check report.
   No dependencies; works in any modern browser.
   ===================================================================== */
(function () {
  "use strict";

  const XML_NS = "http://www.w3.org/XML/1998/namespace";

  // Vocabularies documented in the DOBiPS working paper (Zenodo 16761174)
  const VOCAB = {
    type: ["omission", "addition", "transposition", "minor", "maior", "substantive", "lem", "unclear"],
    typeSynonyms: { medium: "maior" },
    subtype: ["error", "adiaphoric", "substantive"],
    cause: [
      "slip", "misspelling", "orthographic", "correction", "falseEmendation", "grammatical",
      "space", "numbering", "paleographicConfusion", "diplography", "haplography",
      "homeoteleuton", "homoeoteleuton", "homeoarchy", "homoeoarchy", "rubrication", "VetusLatina", "Vulgate", "unknown",
      "digitisation", "damage", "lacuna", "abbreviation", "transposition", "substitution"
    ]
  };

  const CAUSE_LABELS = {
    slip: "slip", misspelling: "misspelling", orthographic: "orthographic",
    correction: "correction", falseEmendation: "false emendation", grammatical: "grammatical",
    space: "lack of space", numbering: "numbering", paleographicConfusion: "palaeographic confusion",
    diplography: "dittography", haplography: "haplography", homeoteleuton: "homoeoteleuton",
    homoeoteleuton: "homoeoteleuton", homeoarchy: "homoeoarchy", rubrication: "rubrication",
    VetusLatina: "Vetus Latina", Vulgate: "Vulgate", unknown: "unknown cause",
    digitisation: "digitisation", damage: "damage", lacuna: "lacuna", abbreviation: "abbreviation",
    substitution: "substitution", transposition: "transposition"
  };

  const REND_LABELS = {
    above: "s.l.", below: "below", marginal: "in mg.", intercolumnar: "intercol.",
    erasure: "eras.", subpunctuated: "subpunct.", expunctuated: "expunct.",
    strikethrough: "struck through", overstrike: "overwritten", underlined: "underlined",
    transpMarks: "transp. marks", transp_marks: "transp. marks",
    subpunctuated_erasure: "subpunct. + eras."
  };

  function causeLabel(c) {
    if (!c) return "";
    return String(c).split("_").map((x) => CAUSE_LABELS[x] || x).join(" + ");
  }

  /* ------------------------------ helpers ------------------------------ */
  const kids = (el) => (el ? Array.from(el.children) : []);
  const ln = (el) => (el && el.localName) || "";
  const first = (el, name) => kids(el).find((c) => ln(c) === name) || null;
  const desc = (el, name) => (el ? Array.from(el.getElementsByTagNameNS("*", name)) : []);
  const descFirst = (el, name) => desc(el, name)[0] || null;
  const xmlId = (el) => (el && (el.getAttributeNS(XML_NS, "id") || el.getAttribute("xml:id"))) || "";
  const attr = (el, name) => (el && el.getAttribute(name)) || "";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const squash = (s) => String(s || "").replace(/\s+/g, " ");
  const textOf = (el) => squash(el ? el.textContent : "").trim();
  const basename = (p) => String(p || "").split("/").pop();

  // TEI files often have no whitespace between adjacent <app> elements
  // (e.g. "Venit<app>…"): insert a space at word boundaries between pieces.
  function joinSmart(parts) {
    let out = "", prevChar = "", prevEl = false;
    for (const p of parts) {
      if (!p.html) continue;
      const t = p.html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "x");
      if (!t.length) { out += p.html; continue; }
      const c = t[0];
      if (out && prevChar && !/\s/.test(prevChar) && !/\s/.test(c) && (p.el || prevEl) &&
          c !== "*" && c !== "⁺" && !/[,.;:)\]]/.test(c) && prevChar !== "(" && prevChar !== "[") out += " ";
      out += p.html;
      prevChar = t[t.length - 1];
      prevEl = p.el;
    }
    return out;
  }
  const piece = (node, html) => ({ html, el: node.nodeType === 1 });

  function romanToInt(s) {
    if (!s) return NaN;
    const t = String(s).trim().toUpperCase().replace(/[^IVXLCDM]/g, "");
    if (!t) return NaN;
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < t.length; i++) {
      const cur = v[t[i]], nxt = v[t[i + 1]] || 0;
      total += cur < nxt ? -cur : cur;
    }
    return total;
  }

  function pageLabel(rest) {
    if (!rest) return "";
    const parts = rest.split("_");
    const isFol = (p) => /^\d+[rv]$/i.test(p) || /^[IVXLC]+[rv]$/i.test(p);
    if (parts.every(isFol)) return (parts.length > 1 ? "ff. " : "f. ") + parts.join("–");
    if (parts.every((p) => /^\d+$/.test(p))) return (parts.length > 1 ? "pp. " : "p. ") + parts.join("–");
    return rest;
  }

  /* --------------------------- main parser ----------------------------- */
  function parse(xmlText, options) {
    options = options || {};
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err) throw new Error("XML parsing error: " + textOf(err).slice(0, 300));

    const tei = doc.documentElement;
    const header = descFirst(tei, "teiHeader");
    const model = {
      title: "", edition: "", editor: "", publicationHTML: "", frontHTML: "",
      bibl: {}, witnesses: [], witById: new Map(), hands: {}, renditions: {},
      groups: [], comparanda: [], editionWits: [],
      blocks: [], apps: [], appById: new Map(), pages: [], pagesByWit: new Map(),
      issues: [], stats: {}, vocab: VOCAB, causeLabels: CAUSE_LABELS, rendLabels: REND_LABELS
    };
    const issue = (level, msg, where) => model.issues.push({ level, msg, where: where || "" });

    /* ---------- header ---------- */
    model.title = textOf(descFirst(descFirst(header, "titleStmt"), "title"));
    const edStmt = descFirst(header, "editionStmt");
    model.edition = textOf(descFirst(edStmt, "edition"));
    model.editor = desc(edStmt, "name").map(textOf).join(", ");

    desc(header, "bibl").forEach((b) => {
      const id = xmlId(b);
      if (!id) return;
      model.bibl[id] = {
        author: textOf(first(b, "author")), title: textOf(first(b, "title")),
        place: textOf(first(b, "pubPlace")), date: textOf(first(b, "date"))
      };
    });

    desc(header, "rendition").forEach((r) => {
      const id = xmlId(r);
      if (id) model.renditions[id] = textOf(r);
    });
    // hands: renditions m / l / u (DOBiPS convention), fall back to handNote ids
    ["m", "l", "u"].forEach((h) => { if (model.renditions[h]) model.hands[h] = model.renditions[h]; });
    if (!Object.keys(model.hands).length) model.hands = { m: "main hand (scribe)", l: "later hand", u: "unknown hand" };

    /* ---------- witnesses ---------- */
    const listWit = descFirst(header, "listWit");
    desc(listWit, "witness").forEach((w, idx) => model.witnesses.push(parseWitness(w, idx, model, issue)));
    model.witnesses.forEach((w) => model.witById.set(w.id, w));
    model.witOrder = new Map(model.witnesses.map((w, i) => [w.id, i]));

    // groups: nested <listWit xml:id> in the TEI win; otherwise config
    const nested = desc(listWit, "listWit").filter((l) => xmlId(l));
    if (nested.length) {
      nested.forEach((l) => model.groups.push({
        id: xmlId(l), label: textOf(first(l, "head")) || xmlId(l), name: textOf(first(l, "head")),
        members: desc(l, "witness").map(xmlId)
      }));
    }
    const comparanda = (options.comparanda || []).filter((s) => model.witById.has(s));
    model.comparanda = comparanda;
    model.editionWits = model.witnesses.filter((w) => w.kind === "edition").map((w) => w.id);
    if (!model.groups.length && options.group) {
      const g = options.group;
      const members = model.witnesses
        .filter((w) => w.kind === "ms" && !comparanda.includes(w.id) && !(g.exclude || []).includes(w.id))
        .map((w) => w.id);
      if (members.length) model.groups.push({ id: g.id || "Phi", label: g.label || "Φ", name: g.name || "", members });
    }
    model.witnesses.forEach((w) => {
      w.role = model.editionWits.includes(w.id) ? "edition"
        : comparanda.includes(w.id) ? "comparandum"
        : model.groups.some((g) => g.members.includes(w.id)) ? "group" : "ms";
    });

    /* ---------- publication + front (introduction) ---------- */
    const pub = descFirst(header, "publicationStmt");
    model.publicationHTML = kids(pub).map((c) => blockHTML(c, model)).join("");
    const front = descFirst(tei, "front");
    model.frontHTML = kids(front).map((c) => blockHTML(c, model)).join("");

    /* ---------- body ---------- */
    const body = descFirst(tei, "body");
    if (!body) throw new Error("No <body> found in the TEI file.");
    const ctx = { model, issue, appSeq: 0, currentPage: {}, block: null };

    const pushBlock = (kind, el) => {
      const b = {
        idx: model.blocks.length, id: "b" + model.blocks.length, kind, el,
        numLabel: "", numHTML: "", html: "", plain: "", apps: [], relNotes: [], notes: [],
        witDetails: [], bibRefs: [], absent: new Set(), pageStarts: {}, pageBreaks: [], sectionTitle: ""
      };
      b.pageStarts = Object.assign({}, ctx.currentPage);
      model.blocks.push(b);
      ctx.block = b;
      return b;
    };

    const walkBody = (el) => {
      kids(el).forEach((c) => {
        const n = ln(c);
        if (n === "pb") { registerPb(c, ctx); return; }
        if (n === "lb") return;
        if (n === "head" && el === body) { buildBlock(pushBlock("head", c), c, ctx); return; }
        if (n === "trailer") { buildBlock(pushBlock("trailer", c), c, ctx); return; }
        if (n === "list" || n === "div") { walkBody(c); return; }
        if (n === "item") { buildItem(c, ctx, pushBlock); return; }
        if (n === "p" || n === "ab") { buildBlock(pushBlock("section", c), c, ctx); return; }
      });
    };
    walkBody(body);

    // chapter numbering context (sub-series such as plagues or the Decalogue)
    let section = null;
    model.blocks.forEach((b) => {
      if (b.kind === "section") { section = b; b.sectionTitle = b.plain; return; }
      if (b.kind === "item") {
        b.isSubSeries = /^[ivxlc]+$/.test(b.numLabel);
        if (b.isSubSeries && section) b.section = section.idx;
        else if (!b.isSubSeries) section = null;
        b.numValue = romanToInt(b.numLabel);
      }
    });

    finalizeApps(model, issue);
    validate(model, issue, doc);
    computeStats(model);
    return model;
  }

  /* ------------------------------ witnesses ------------------------------ */
  function parseWitness(w, idx, model, issue) {
    const id = xmlId(w);
    const ms = first(w, "msDesc") || descFirst(w, "msDesc");
    const wit = {
      id, idx, kind: ms ? "ms" : "edition", label: id,
      settlement: "", repository: "", idno: "", head: "", locus: "", itemNote: "",
      extent: "", height: "", width: "", columns: "", script: "",
      dateText: "", from: NaN, to: NaN, place: "", placeCert: "", periodNote: "",
      ids: [], links: [], descriptionHTML: ""
    };
    if (!ms) {
      wit.descriptionHTML = inlineHTML(w, model);
      wit.head = textOf(w);
      return wit;
    }
    const msId = descFirst(ms, "msIdentifier");
    wit.settlement = textOf(descFirst(msId, "settlement"));
    wit.repository = textOf(descFirst(msId, "repository"));
    wit.idno = textOf(first(msId, "idno"));
    desc(msId, "altIdentifier").forEach((a) => {
      const i = descFirst(a, "idno");
      if (!i) return;
      const v = textOf(i);
      const type = attr(i, "type") || (attr(i, "source") || attr(a, "source") ? "Bischoff" : attr(a, "type"));
      let url = /^https?:\/\//.test(v) ? v : /^www\./.test(v) ? "https://" + v : "";
      wit.ids.push({ type: type || "id", value: v, url });
    });
    const head = first(ms, "head");
    if (head) {
      const h = head.cloneNode(true);
      desc(h, "note").forEach((n) => { wit.itemNote += (wit.itemNote ? " " : "") + textOf(n); n.remove(); });
      wit.head = textOf(h);
    }
    const item = descFirst(ms, "msItem");
    wit.locus = textOf(descFirst(item, "locus"));
    const inote = descFirst(item, "note");
    if (inote) wit.itemNote += (wit.itemNote ? " " : "") + textOf(inote);
    const extent = descFirst(ms, "extent");
    if (extent) {
      const e = extent.cloneNode(true);
      desc(e, "dimensions").forEach((d) => d.remove());
      wit.extent = textOf(e);
    }
    wit.height = attr(descFirst(ms, "height"), "quantity");
    wit.width = attr(descFirst(ms, "width"), "quantity");
    wit.columns = attr(descFirst(ms, "layout"), "columns");
    wit.script = textOf(descFirst(ms, "handNote"));
    const od = descFirst(ms, "origDate");
    if (od) {
      wit.dateText = textOf(od);
      const f = attr(od, "from-custom") || attr(od, "notBefore") || attr(od, "from") || attr(od, "when");
      const t = attr(od, "to-custom") || attr(od, "notAfter") || attr(od, "to") || attr(od, "when");
      wit.from = /^\d{3,4}$/.test(f) ? +f : NaN;
      wit.to = /^\d{3,4}$/.test(t) ? +t : NaN;
      if (f && !/^\d{3,4}$/.test(f)) issue("warning", `${id}: origDate/@from-custom "${f}" is not a valid year`, "teiHeader/listWit");
      if (t && !/^\d{3,4}$/.test(t)) issue("warning", `${id}: origDate/@to-custom "${t}" is not a valid year`, "teiHeader/listWit");
      const yrs = (wit.dateText.match(/\d{3,4}/g) || []).map(Number);
      if (isNaN(wit.from) && yrs.length) wit.from = yrs[0];
      if (isNaN(wit.to)) wit.to = yrs.length > 1 && yrs[1] >= wit.from ? yrs[1] : wit.from;
    }
    const op = descFirst(ms, "origPlace");
    wit.place = textOf(op);
    wit.placeCert = attr(op, "cert");
    const src = descFirst(descFirst(ms, "recordHist"), "source");
    wit.periodNote = textOf(src);
    desc(descFirst(ms, "surrogates"), "bibl").forEach((b) => {
      const r = descFirst(b, "ref");
      const url = attr(r, "target");
      if (!url) return;
      wit.links.push({ type: attr(b, "type") || "link", label: textOf(r) || attr(b, "type"), url });
    });
    wit.label = id;
    return wit;
  }

  /* ------------------------------ page breaks ------------------------------ */
  function registerPb(pb, ctx) {
    const model = ctx.model;
    const facs = attr(pb, "facs");
    const n = attr(pb, "n");
    const file = basename(facs) || n;
    const stem = file.replace(/\.[a-z0-9]+$/i, "");
    const us = stem.indexOf("_");
    const wit = us > 0 ? stem.slice(0, us) : stem;
    const rest = us > 0 ? stem.slice(us + 1) : "";
    if (n && facs && n !== stem) ctx.issue("warning", `<pb> @n="${n}" does not match its @facs "${file}"`, "body/pb");
    if (!model.witById.has(wit)) ctx.issue("info", `<pb> for unknown siglum "${wit}" (${file})`, "body/pb");
    const page = {
      id: "p" + model.pages.length, wit, facs, file, label: pageLabel(rest), n,
      blockIdx: ctx.block ? ctx.block.idx + (ctx.inBlock ? 0 : 1) : 0
    };
    model.pages.push(page);
    if (!model.pagesByWit.has(wit)) model.pagesByWit.set(wit, []);
    model.pagesByWit.get(wit).push(page);
    ctx.currentPage[wit] = page.id;
    if (ctx.inBlock && ctx.block) ctx.block.pageBreaks.push(page.id);
  }

  /* ------------------------------ blocks ------------------------------ */
  function buildItem(item, ctx, pushBlock) {
    // decide kind: chapter (has a lemma <num>), added chapter (only readings), section heading
    const lemNum = desc(item, "num").find((n) => !hasAncestor(n, "rdg", item));
    const hasLemmaText = hasOwnLemmaText(item);
    let kind = lemNum ? "item" : hasLemmaText ? "section" : "added";
    const b = pushBlock(kind, item);
    b.n = attr(item, "n");
    if (lemNum) b.numLabel = lemmaText(lemNum).replace(/\s+/g, "");
    // the top-level child that carries the number
    let numTop = null;
    if (lemNum) {
      numTop = lemNum;
      while (numTop.parentNode !== item) numTop = numTop.parentNode;
    }
    ctx.inBlock = true;
    let numHTML = "";
    const parts = [];
    // single pass (text nodes directly inside <item> are kept: some capitula have no <title>)
    item.childNodes.forEach((node) => {
      if (node === numTop) numHTML += renderCrit(node, ctx, { numMode: true });
      else parts.push(piece(node, renderCrit(node, ctx, {})));
    });
    let html = joinSmart(parts);
    ctx.inBlock = false;
    b.numHTML = numHTML.trim();
    b.numLabel = lemNum ? plainFromHTML(b.numHTML).replace(/[\s⁺*]+/g, "") : "";
    b.html = html.replace(/\s+/g, " ").trim();
    b.plain = plainFromHTML(b.html);
    if (kind === "added") {
      const r = desc(item, "rdg")[0];
      b.addedBy = r ? splitWit(attr(r, "wit"), ctx, "item") : [];
      b.numLabel = "";
    }
  }

  function buildBlock(b, el, ctx) {
    ctx.inBlock = true;
    const parts = [];
    el.childNodes.forEach((node) => parts.push(piece(node, renderCrit(node, ctx, {}))));
    const html = joinSmart(parts);
    ctx.inBlock = false;
    b.html = html.replace(/\s+/g, " ").trim();
    b.plain = plainFromHTML(b.html);
  }

  function lemmaText(el) {
    let s = "";
    const walk = (n) => {
      if (n.nodeType === 3) { s += n.textContent; return; }
      if (n.nodeType !== 1 || ["rdg", "rdgGrp", "note", "witDetail", "bibl"].includes(ln(n))) return;
      n.childNodes.forEach(walk);
    };
    walk(el);
    return squash(s).trim();
  }

  function hasAncestor(node, name, stop) {
    let p = node.parentNode;
    while (p && p !== stop) { if (ln(p) === name) return true; p = p.parentNode; }
    return false;
  }

  function hasOwnLemmaText(item) {
    // true if some text is visible in the critical text (outside rdg / note / witDetail)
    let found = false;
    const walk = (node) => {
      if (found) return;
      if (node.nodeType === 3) { if (node.textContent.trim()) found = true; return; }
      if (node.nodeType !== 1) return;
      const n = ln(node);
      if (["rdg", "rdgGrp", "note", "witDetail", "pb", "lb", "bibl"].includes(n)) return;
      node.childNodes.forEach(walk);
    };
    item.childNodes.forEach(walk);
    return found;
  }

  function plainFromHTML(html) {
    return html.replace(/<sup[^>]*>.*?<\/sup>/g, "").replace(/<span class="relmark[^>]*>.*?<\/span>/g, "").replace(/<span class="app[^"]*app-empty[^>]*>⁺<\/span>/g, "")
      .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  }

  /* ---------------------- critical-text renderer ---------------------- */
  function renderCrit(node, ctx, opts) {
    if (node.nodeType === 3) return esc(squash(node.textContent));
    if (node.nodeType !== 1) return "";
    const n = ln(node);
    const b = ctx.block;
    switch (n) {
      case "app": return renderApp(node, ctx, opts);
      case "pb": registerPb(node, ctx); return `<span class="pbmark" data-page="${ctx.model.pages.length - 1}" aria-hidden="true"></span>`;
      case "lb": return "";
      case "note": {
        const txt = textOf(node);
        if (isRelNote(txt)) {
          const rel = parseRelNote(txt, ctx.model);
          rel.appId = ctx.lastAppId || null;
          rel.idx = b.relNotes.length;
          b.relNotes.push(rel);
          if (rel.appId) {
            const a = ctx.model.appById.get(rel.appId);
            if (a) a.rel = rel;
          } else ctx.issue("info", `Relation note "${txt}" is not preceded by an <app>`, label(b));
          return `<span class="relmark" data-rel="${rel.idx}" data-cat="${rel.category}" title="${esc(txt)}">${esc(rel.short)}</span>`;
        }
        const note = { html: inlineHTML(node, ctx.model), appId: null, kind: "block" };
        b.notes.push(note);
        return `<sup class="nmark" data-bnote="${b.notes.length - 1}">*</sup>`;
      }
      case "witDetail": {
        b.witDetails.push({ wit: splitWit(attr(node, "wit"), ctx, label(b)), html: inlineHTML(node, ctx.model) });
        return "";
      }
      case "ref":
        if (attr(node, "type") === "parallelPassage") {
          // biblical anchor: <ref type="parallelPassage"><bibl>Gn 1:1 incipit</bibl>…</ref>
          const bibl = first(node, "bibl");
          const t = bibl ? textOf(bibl) : textOf(node);
          const m = t.match(/^([1-4]?\s?[A-Z][a-z]+\.?\s*\d+[:.,]\d+(?:\s*[-–]\s*\d+(?:[:.,]\d+)?)?)\s*(.*)$/);
          if (t) b.bibRefs.push({ ref: m ? m[1] : t, incipit: m ? m[2] : "" });
          // anything else inside the ref (e.g. <num>) belongs to the text
          const parts = [];
          node.childNodes.forEach((c) => { if (c !== bibl) parts.push(piece(c, renderCrit(c, ctx, opts))); });
          return joinSmart(parts);
        }
        return wrapChildren(node, ctx, opts);
      case "hi": {
        const rend = attr(node, "rend");
        const inner = wrapChildren(node, ctx, opts);
        if (/bold/.test(rend)) return `<b class="emph-adiaph">${inner}</b>`;
        if (/italic/.test(rend)) return `<i class="emph-error">${inner}</i>`;
        if (/sup/.test(rend)) return `<sup>${inner}</sup>`;
        return `<span class="hi-${esc(rend)}">${inner}</span>`;
      }
      case "num": return opts.numMode ? wrapChildren(node, ctx, opts) : `<span class="num-inline">${wrapChildren(node, ctx, opts)}</span>`;
      case "rdg": case "rdgGrp": return "";
      case "damage": return `<span class="damage">${wrapChildren(node, ctx, opts)}</span>`;
      case "gap": return `<span class="gap">[…]</span>`;
      default: return wrapChildren(node, ctx, opts);
    }
  }

  function wrapChildren(node, ctx, opts) {
    const parts = [];
    node.childNodes.forEach((c) => parts.push(piece(c, renderCrit(c, ctx, opts))));
    return joinSmart(parts);
  }

  function label(b) {
    if (!b) return "";
    if (b.kind === "head") return "incipit";
    if (b.kind === "trailer") return "explicit";
    return b.numLabel ? "ch. " + b.numLabel : "block " + b.idx;
  }

  function renderApp(appEl, ctx, opts) {
    const model = ctx.model;
    const b = ctx.block;
    const id = "a" + (++ctx.appSeq);
    const parent = ctx.parentAppId || null;
    const lemEl = first(appEl, "lem");
    const app = {
      id, blockIdx: b.idx, parentId: parent, depth: parent ? model.appById.get(parent).depth + 1 : 0,
      children: [], lem: null, readings: [], notes: [], witDetails: [], rel: null, isNum: !!opts.numMode, el: appEl
    };
    model.apps.push(app);
    model.appById.set(id, app);
    b.apps.push(id);
    if (parent) model.appById.get(parent).children.push(id);

    // lemma
    app.lem = {
      el: lemEl,
      wit: lemEl && attr(lemEl, "wit") ? splitWit(attr(lemEl, "wit"), ctx, label(b)) : null,
      type: attr(lemEl, "type"), subtype: attr(lemEl, "subtype"), cause: attr(lemEl, "cause"),
      emph: lemEl ? (descFirst(lemEl, "hi") && /bold/.test(attr(descFirst(lemEl, "hi"), "rend")) ? "adiaph"
        : descFirst(lemEl, "hi") && /italic/.test(attr(descFirst(lemEl, "hi"), "rend")) ? "error" : "") : "",
      text: "", html: ""
    };

    // readings (direct rdg + rdg inside rdgGrp)
    let grp = 0;
    kids(appEl).forEach((c) => {
      const n = ln(c);
      if (n === "rdg") app.readings.push(parseReading(c, ctx, app, null));
      else if (n === "rdgGrp") { grp++; kids(c).filter((r) => ln(r) === "rdg").forEach((r) => app.readings.push(parseReading(r, ctx, app, grp))); }
      else if (n === "note") {
        const txt = textOf(c);
        if (isRelNote(txt)) {
          const rel = parseRelNote(txt, model);
          rel.appId = id; rel.idx = b.relNotes.length; b.relNotes.push(rel); app.rel = rel;
        } else app.notes.push({ html: inlineHTML(c, model), on: "" });
      } else if (n === "witDetail") {
        app.witDetails.push({ wit: splitWit(attr(c, "wit"), ctx, label(b)), html: inlineHTML(c, model) });
      }
    });

    // render lemma content (nested apps register themselves)
    const saveParent = ctx.parentAppId;
    ctx.parentAppId = id;
    const lparts = [];
    if (lemEl) lemEl.childNodes.forEach((c) => lparts.push(piece(c, renderCrit(c, ctx, opts))));
    const inner = joinSmart(lparts);
    ctx.parentAppId = saveParent;
    ctx.lastAppId = id;
    app.lem.html = inner.trim();
    app.lem.text = plainFromHTML(inner);

    const cls = ["app"];
    if (app.lem.emph) cls.push("app-" + app.lem.emph);
    const noteMark = app.notes.length ? `<sup class="nmark" data-app="${id}">*</sup>` : "";
    if (!app.lem.text) {
      if (!app.readings.length) return "";
      // lemma is empty: some witnesses add text here
      return `<span class="${cls.join(" ")} app-empty" data-app="${id}" title="addition in some witnesses">⁺</span>${noteMark}`;
    }
    return `<span class="${cls.join(" ")}" data-app="${id}">${inner}</span>${noteMark}`;
  }

  function parseReading(r, ctx, app, grp) {
    const model = ctx.model;
    const b = ctx.block;
    const notes = [];
    const clone = r.cloneNode(true);
    desc(clone, "note").forEach((n) => { notes.push(inlineHTML(n, model)); n.remove(); });
    desc(clone, "witDetail").forEach((n) => n.remove());
    const html = inlineHTML(clone, model).trim();
    const vs = attr(r, "varSeq");
    const rd = {
      wits: splitWit(attr(r, "wit"), ctx, label(b)),
      rawWit: attr(r, "wit"),
      html, text: plainFromHTML(html),
      type: attr(r, "type"), subtype: attr(r, "subtype"), cause: attr(r, "cause"),
      hand: attr(r, "hand").replace(/^#/, ""), rawHand: attr(r, "hand"),
      rend: attr(r, "rend"), varSeq: vs ? parseInt(vs, 10) : null, cert: attr(r, "cert"),
      ana: attr(r, "ana").replace(/^#/, ""), rendition: attr(r, "rendition").split(/\s+/).filter(Boolean).map((x) => x.replace(/^#/, "")),
      grp, notes, idx: app.readings.length
    };
    notes.forEach((h) => app.notes.push({ html: h, on: rd.wits.join(" ") }));
    rd.isLacuna = rd.cause === "lacuna" || ((rd.cause === "damage" || rd.cause === "digitisation") && rd.type === "omission");
    if (rd.isLacuna) rd.wits.forEach((w) => b.absent.add(w));
    return rd;
  }

  function splitWit(s, ctx, where) {
    if (!s) return [];
    return s.trim().split(/\s+/).map((t) => {
      if (!t.startsWith("#")) ctx.issue("warning", `@wit value "${t}" lacks the leading "#"`, where);
      const id = t.replace(/^#/, "");
      if (!ctx.model.witById.has(id)) ctx.issue("error", `@wit refers to unknown witness "${id}"`, where);
      return id;
    }).filter((x) => x);
  }

  /* --------------------- relation notes (Φ vs …) --------------------- */
  function isRelNote(txt) {
    return txt.length < 140 && (/^\s*Φ/.test(txt) || (/\bvs\.?\b/.test(txt) && txt.length < 80));
  }

  function parseRelNote(txt, model) {
    const lower = txt.toLowerCase();
    const category = /error|err\./.test(lower) ? "error" : /adiaph/.test(lower) ? "adiaphoric" : "other";
    const uncertain = /\?/.test(txt);
    const [left] = txt.split(/\bvs\.?\b/);
    const sigla = Array.from(model.witById.keys());
    const tok = (s) => (s.match(/[A-Za-z]+\d*/g) || []).filter((x) => sigla.includes(x));
    const praeterM = left.match(/praeter\s+([^+(]+)/);
    const praeter = praeterM ? tok(praeterM[1]) : [];
    const leftSigla = tok(left).filter((x) => !praeter.includes(x));
    const shared = leftSigla.filter((x) => model.comparanda.includes(x));
    const opposed = tok(txt.split(/\bvs\.?\b/).slice(1).join(" "));
    const short = txt.replace(/\s+/g, " ").replace(/\(adiaph\.\?\)/, "(adiaph.?)");
    return { text: txt, short, category, uncertain, shared, praeter, opposed, exclusive: shared.length === 0 };
  }

  /* ------------------------ inline/block HTML ------------------------ */
  function inlineHTML(node, model) {
    let s = "";
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) { s += esc(squash(c.textContent)); return; }
      if (c.nodeType !== 1) return;
      const n = ln(c);
      const inner = () => inlineHTML(c, model);
      switch (n) {
        case "lb": s += "<br>"; break;
        case "pb": break;
        case "hi": {
          const r = attr(c, "rend");
          s += /bold/.test(r) ? `<b>${inner()}</b>` : /italic/.test(r) ? `<i>${inner()}</i>` : `<span class="hi-${esc(r)}">${inner()}</span>`;
          break;
        }
        case "q": s += `<q>${inner()}</q>`; break;
        case "title": s += `<i>${inner()}</i>`; break;
        case "ref": {
          const t = attr(c, "target");
          const body = inner().trim();
          if (t.startsWith("#")) {
            const bb = model.bibl[t.slice(1)];
            const tip = bb ? `${bb.author}, ${bb.title}, ${bb.place} ${bb.date}` : t.slice(1);
            s += `<span class="biblref" title="${esc(tip)}">${body || esc(bb ? bb.author.split(",")[0] : t.slice(1))}</span>`;
          } else if (t) {
            s += `<a href="${esc(t)}" target="_blank" rel="noopener">${body || "↗"}</a>`;
          } else s += body;
          break;
        }
        case "list": s += `<ul>${kids(c).filter((i) => ln(i) === "item").map((i) => `<li>${inlineHTML(i, model)}</li>`).join("")}</ul>`; break;
        case "app": {
          const lem = first(c, "lem");
          s += lem ? inlineHTML(lem, model) : "";
          break;
        }
        case "rdg": case "rdgGrp": case "witDetail": break;
        case "note": s += ` <span class="inner-note">(${inner()})</span>`; break;
        default: s += inner();
      }
    });
    return s;
  }

  function blockHTML(el, model) {
    const n = ln(el);
    if (n === "p" || n === "ab") return `<p>${inlineHTML(el, model).replace(/(<br>\s*){2,}/g, "</p><p>")}</p>`;
    if (n === "head") return `<h3>${inlineHTML(el, model)}</h3>`;
    if (n === "list") return inlineHTML({ childNodes: [el] }, model);
    if (n === "div") return kids(el).map((c) => blockHTML(c, model)).join("");
    return `<p>${inlineHTML(el, model)}</p>`;
  }

  /* -------------------- per-app derived witness data -------------------- */
  const norm = (t) => String(t || "").toLowerCase().replace(/[\s.,;:·!?]+/g, "");
  // a reading marked type="lem" really repeats the lemma only if its text is empty or identical
  function isLemLike(r, app) { return r.type === "lem" && (!r.text || norm(r.text) === norm(app.lem.text)); }

  function layerOrder(r) {
    if (r.varSeq != null) return r.varSeq;
    if (r.cause === "correction" || r.cause === "falseEmendation") return 50;
    return 0;
  }

  function finalizeApps(model, issue) {
    const all = model.witnesses.map((w) => w.id);
    model.apps.forEach((app) => {
      const b = model.blocks[app.blockIdx];
      // witnesses with a reading, per layer
      const byWit = new Map();
      app.readings.forEach((r) => r.wits.forEach((w) => {
        if (!byWit.has(w)) byWit.set(w, []);
        const arr = byWit.get(w);
        const dup = arr.find((x) => x.text === r.text && (x.varSeq ?? -1) === (r.varSeq ?? -1) && x.type === r.type);
        if (dup) { (r.dupWits = r.dupWits || []).push(w); issue("warning", `${w} has the same reading twice (“${r.text || "∅"}”${r.isLacuna ? ", lacuna" : ""})`, label(b) + ` — “${app.lem.text || "∅"}”`); return; }
        arr.push(r);
      }));
      byWit.forEach((arr) => arr.sort((x, y) => layerOrder(x) - layerOrder(y)));
      app.byWit = byWit;

      // witnesses absent at this point: lacuna anywhere in the block, or
      // a non-lemma first-layer reading in an ancestor app (EVT's nested-app problem)
      const absent = new Set(b.absent);
      let p = app.parentId ? model.appById.get(app.parentId) : null;
      while (p) {
        p.byWit.forEach((arr, w) => {
          const f = arr[0];
          if (f && !isLemLike(f, p) && !f.isLacuna) absent.add(w);
        });
        p = p.parentId ? model.appById.get(p.parentId) : null;
      }
      app.absent = absent;

      const computed = all.filter((w) => !absent.has(w) && !byWit.has(w));
      // witnesses whose first layer is "lem" also attest the lemma (first hand)
      const lemByLayer = [];
      byWit.forEach((arr, w) => { if (isLemLike(arr[0], app) && !absent.has(w)) lemByLayer.push(w); });
      app.readings.forEach((r) => {
        if (r.type === "lem" && r.text && !isLemLike(r, app))
          issue("info", `reading “${r.text}” (${r.wits.join(" ")}) has type="lem" but differs from the lemma “${app.lem.text || "∅"}” (correction towards a reading other than the critical text?)`, label(b) + ` — “${app.lem.text || "∅"}”`);
      });
      app.computedLemWits = sortWits(model, computed.concat(lemByLayer));
      if (app.lem.wit) {
        app.lemWits = sortWits(model, app.lem.wit);
        app.lemWitsExplicit = true;
        const msOnly = (arr) => arr.filter((w) => !model.editionWits.includes(w));
        const exp = new Set(msOnly(app.lemWits));
        const com = new Set(msOnly(app.computedLemWits));
        const missing = [...com].filter((w) => !exp.has(w));
        const extra = [...exp].filter((w) => !com.has(w));
        const contradictory = app.lemWits.filter((w) => byWit.has(w) && !isLemLike(byWit.get(w)[0], app) && !byWit.get(w)[0].isLacuna);
        if (contradictory.length) issue("warning", `lem/@wit lists ${contradictory.join(" ")}, which also ha${contradictory.length > 1 ? "ve" : "s"} a different reading`, label(b) + ` — “${app.lem.text || "∅"}”`);
        else if (missing.length || extra.length) {
          issue("info", `lem/@wit differs from the witnesses implied by the apparatus` +
            (missing.length ? `; not listed: ${missing.join(" ")}` : "") + (extra.length ? `; listed but absent: ${extra.join(" ")}` : ""),
            label(b) + ` — “${app.lem.text || "∅"}”`);
        }
      } else {
        app.lemWits = app.computedLemWits;
        app.lemWitsExplicit = false;
      }
      app.significant = app.readings.some((r) => isSignificant(r));
    });
  }

  function isSignificant(r) {
    if (r.isLacuna || (r.type === "lem" && !r.text)) return false;
    if (["orthographic", "correction", "rubrication", "digitisation", "damage"].includes(r.cause)) return false;
    if (r.type === "unclear") return false;
    return true;
  }

  function sortWits(model, arr) {
    return Array.from(new Set(arr)).sort((a, b) => (model.witOrder.get(a) ?? 999) - (model.witOrder.get(b) ?? 999));
  }

  /* -------------------- witness reading resolution -------------------- */
  // returns {kind:'lem'|'rdg'|'absent', reading, layers}
  function witnessReading(model, app, w, layer) {
    if (app.absent.has(w)) {
      const arr = app.byWit.get(w);
      return { kind: "absent", reading: arr ? arr[0] : null, layers: arr || [] };
    }
    const arr = app.byWit.get(w);
    if (!arr || !arr.length) return { kind: "lem", reading: null, layers: [] };
    const r = layer === "final" ? arr[arr.length - 1] : arr[0];
    if (isLemLike(r, app)) return { kind: "lem", reading: r, layers: arr };
    return { kind: "rdg", reading: r, layers: arr };
  }

  // Reconstruct a witness's text for a block as HTML with markers.
  function witnessHTML(model, block, w, layer) {
    const el = block.el;
    if (block.kind === "added" && !(block.addedBy || []).includes(w)) return { html: "", absent: true };
    let lacunaShown = false;
    let isAbsentAll = true;
    const render = (node) => {
      if (node.nodeType === 3) { const t = squash(node.textContent); if (t.trim()) isAbsentAll = false; return esc(t); }
      if (node.nodeType !== 1) return "";
      const n = ln(node);
      if (["note", "witDetail", "pb", "lb", "rdgGrp"].includes(n)) return "";
      if (n === "bibl" && node.parentNode && attr(node.parentNode, "type") === "parallelPassage") return "";
      if (n === "rdg") return "";
      if (n === "hi") return joinSmart(Array.from(node.childNodes).map((c) => piece(c, render(c))));
      if (n === "app") {
        const app = findAppByEl(model, block, node);
        if (!app) return "";
        const res = witnessReading(model, app, w, layer);
        const corrected = res.layers.length > 1;
        if (res.kind === "absent") {
          if (lacunaShown) return "";
          lacunaShown = true;
          return `<span class="w-lacuna" data-app="${app.id}">[lacuna]</span>`;
        }
        if (res.kind === "lem") {
          isAbsentAll = false;
          const lemEl = first(node, "lem");
          const inner = lemEl ? joinSmart(Array.from(lemEl.childNodes).map((c) => piece(c, render(c)))) : "";
          if (corrected) return `<span class="w-corr" data-app="${app.id}" title="corrected reading">${inner || "⁺"}</span>`;
          return inner;
        }
        const r = res.reading;
        isAbsentAll = false;
        const cls = ["w-dev"];
        if (!isSignificant(r)) cls.push("w-minor");
        if (corrected) cls.push("w-corr");
        if (!r.text) return `<span class="${cls.join(" ")} w-om" data-app="${app.id}" title="omission">∅</span>`;
        return `<span class="${cls.join(" ")}" data-app="${app.id}">${r.html}</span>`;
      }
      return joinSmart(Array.from(node.childNodes).map((c) => piece(c, render(c))));
    };
    let numHTML = "", html = "";
    if (block.kind === "item" || block.kind === "added") {
      const numEl = block.kind === "added" ? null : desc(el, "num").find((nn) => !hasAncestor(nn, "rdg", el));
      let numTop = numEl;
      while (numTop && numTop.parentNode !== el) numTop = numTop.parentNode;
      const parts = [];
      el.childNodes.forEach((c) => {
        if (c === numTop) numHTML = render(c);
        else parts.push(piece(c, render(c)));
      });
      html = joinSmart(parts);
      if (block.kind === "added") {
        const r = desc(el, "rdg").find((x) => splitWitSilent(attr(x, "wit")).includes(w));
        if (r) {
          const nn = descFirst(r, "num"); const tt = descFirst(r, "title");
          numHTML = nn ? esc(textOf(nn)) : "";
          html = `<span class="w-dev">${tt ? esc(textOf(tt)) : esc(textOf(r))}</span>`;
          isAbsentAll = false;
        }
      }
    } else {
      html = joinSmart(Array.from(el.childNodes).map((c) => piece(c, render(c))));
    }
    return { numHTML: numHTML.replace(/\s+/g, " ").trim(), html: html.replace(/\s+/g, " ").trim(), absent: isAbsentAll && lacunaShown };
  }

  function splitWitSilent(s) { return String(s || "").trim().split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean); }

  function findAppByEl(model, block, el) {
    for (const id of block.apps) { const a = model.appById.get(id); if (a.el === el) return a; }
    return null;
  }

  /* ------------------------------ validation ------------------------------ */
  function validate(model, issue, doc) {
    const handIds = new Set(Object.keys(model.hands));
    const typeSet = new Set(VOCAB.type.concat(Object.keys(VOCAB.typeSynonyms)));
    const causeSet = new Set(VOCAB.cause);
    const seenType = {}, seenCause = {};
    model.apps.forEach((app) => {
      const b = model.blocks[app.blockIdx];
      const where = label(b) + ` — “${app.lem.text || "∅"}”`;
      const chk = (r, isLem) => {
        if (r.type && !typeSet.has(r.type)) seenType[r.type] = (seenType[r.type] || []).concat(where);
        if (r.cause && !causeSet.has(r.cause)) seenCause[r.cause] = (seenCause[r.cause] || []).concat(where);
        if (!isLem && r.rawHand) {
          if (r.rawHand === "unknown") { issue("info", `@hand="unknown": the hand declared for uncertain attributions is "#u" (treated as such)`, where); r.hand = "u"; return; }
          if (!r.rawHand.startsWith("#")) issue("warning", `@hand="${r.rawHand}" lacks the leading "#"`, where);
          if (!handIds.has(r.hand) && r.hand !== "unknown") issue("warning", `@hand="${r.rawHand}" is not declared in tagsDecl`, where);
        }
      };
      chk(app.lem, true);
      app.readings.forEach((r) => {
        chk(r, false);
        if (!r.wits.length) issue("warning", `<rdg> without @wit (“${r.text || "∅"}”)`, where);
        if (r.subtype && !VOCAB.subtype.includes(r.subtype)) issue("info", `unexpected @subtype="${r.subtype}"`, where);
      });
      // same witness in two readings without layer distinction
      app.byWit.forEach((arr, w) => {
        if (arr.length < 2) return;
        const noVs = arr.filter((r) => r.varSeq == null);
        if (noVs.length > 1 && !noVs.every((r) => r.isLacuna)) issue("warning", `${w} appears in ${noVs.length} readings without @varSeq`, where);
        const vs = arr.filter((r) => r.varSeq != null).map((r) => r.varSeq).sort();
        vs.forEach((v, i) => { if (v !== i + 1 && noVs.length === 0) issue("info", `${w}: @varSeq sequence ${vs.join(",")} has a gap`, where); });
      });
    });
    Object.entries(seenType).forEach(([v, ws]) => {
      const syn = VOCAB.typeSynonyms[v];
      issue(syn ? "info" : "warning", syn ? `@type="${v}" used ${ws.length}× (the working paper documents "${syn}")`
        : `@type="${v}" is not in the documented vocabulary (${ws.length}×)`, ws.slice(0, 4).join("; ") + (ws.length > 4 ? "; …" : ""));
    });
    Object.entries(seenCause).forEach(([v, ws]) => {
      const parts = v.split("_");
      const compound = parts.length > 1 && parts.every((x) => causeSet.has(x));
      issue(compound ? "info" : "warning", compound
        ? `compound @cause="${v}" (${ws.length}×): shown as “${causeLabel(v)}”; the working paper documents single values`
        : `@cause="${v}" is not in the documented vocabulary (${ws.length}×)`, ws.slice(0, 4).join("; ") + (ws.length > 4 ? "; …" : ""));
    });
    // xml:id used in facs vs pages
    const counts = {};
    model.issues.forEach((i) => { counts[i.level] = (counts[i.level] || 0) + 1; });
    model.issueCounts = counts;
  }

  /* ------------------------------ statistics ------------------------------ */
  function computeStats(model) {
    const s = model.stats;
    s.chapters = model.blocks.filter((b) => b.kind === "item").length;
    s.apps = model.apps.length;
    s.readings = model.apps.reduce((n, a) => n + a.readings.length, 0);
    s.layers = model.apps.reduce((n, a) => n + a.readings.filter((r) => r.varSeq != null && r.varSeq > 1).length, 0);
    s.notes = model.apps.reduce((n, a) => n + a.notes.length, 0) + model.blocks.reduce((n, b) => n + b.notes.length, 0);
    s.relNotes = model.blocks.reduce((n, b) => n + b.relNotes.length, 0);
    const causes = {}, types = {};
    model.apps.forEach((a) => a.readings.forEach((r) => {
      if (r.cause) causes[r.cause] = (causes[r.cause] || 0) + 1;
      if (r.type) types[r.type] = (types[r.type] || 0) + 1;
    }));
    s.causes = causes; s.types = types;
  }

  /* ----------------------- reading keys for analysis ----------------------- */
  function readingKey(model, app, w, opts) {
    const res = witnessReading(model, app, w, opts.layer || "first");
    if (res.kind === "absent") return null;
    if (res.kind === "lem") return { key: "=" + app.lem.text.toLowerCase().replace(/\s+/g, ""), lem: true, reading: null };
    const r = res.reading;
    return { key: (r.text || "∅").toLowerCase().replace(/\s+/g, ""), lem: false, reading: r };
  }

  window.CapitulaModel = {
    parse, causeLabel, witnessReading, witnessHTML, readingKey, isSignificant, romanToInt, sortWits,
    layerOrder, label, esc, VOCAB, CAUSE_LABELS, REND_LABELS
  };
})();
