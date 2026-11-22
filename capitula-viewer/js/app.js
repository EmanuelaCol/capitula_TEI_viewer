/* =====================================================================
   Capitula Viewer — user interface
   ===================================================================== */
(function () {
  "use strict";
  const C = window.CAPITULA_CONFIG || { editions: [] };
  const M = window.CapitulaModel;
  const A = window.CapitulaAnalysis;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = M.esc;

  const S = {
    model: null, edition: null, imageBase: "", source: "",
    view: "edition", sub: "profile", mode: "critical", wit: "", layer: "first",
    block: 0, app: null, search: "",
    opts: { rel: true, heat: false, pb: false, bib: true, cause: "", hlWit: "", hideMinor: false },
    agree: { filter: "noOrth", measure: "shared", includeEdition: true, includeNum: false, cell: null },
    viewer: { wit: "", page: 0, zoom: 1, x: 0, y: 0, fit: true }
  };

  /* ============================== boot ============================== */
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    $("#siteTitle").textContent = C.siteTitle || "Capitula Viewer";
    document.title = C.siteTitle || "Capitula Viewer";
    const sel = $("#editionSelect");
    (C.editions || []).forEach((e) => sel.insertAdjacentHTML("beforeend", `<option value="${esc(e.id)}">${esc(e.label)}</option>`));
    bindUI();
    const params = new URLSearchParams(location.search);
    readHash();
    if (params.get("xml")) {
      loadFromUrl(params.get("xml"), params.get("images") || "", null);
    } else {
      const id = params.get("edition") || C.defaultEdition || (C.editions[0] && C.editions[0].id);
      const ed = (C.editions || []).find((e) => e.id === id) || C.editions[0];
      if (ed) { sel.value = ed.id; loadFromUrl(ed.file, ed.imageBase || "", ed); }
      else status("No edition configured: open a TEI file with “Open XML…”.", "info");
    }
  }

  function status(msg, kind) {
    const el = $("#status");
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.className = "status " + (kind || "info");
    el.innerHTML = msg;
  }

  async function loadFromUrl(url, imageBase, ed) {
    status(`Loading <code>${esc(url)}</code>…`, "info");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const txt = await res.text();
      S.edition = ed;
      loadText(txt, url, imageBase);
    } catch (e) {
      const local = location.protocol === "file:";
      status(`Could not load <code>${esc(url)}</code>: ${esc(e.message)}.` +
        (local ? " Browsers block loading files when the page is opened from disk: use a local server (e.g. VS Code “Live Server”) or GitHub Pages, or open the XML with “Open XML…”." : ""), "error");
    }
  }

  function loadText(txt, source, imageBase) {
    try {
      const model = M.parse(txt, { comparanda: C.comparanda || [], group: C.group });
      if (VIEW) VIEW.reset();
      S.model = model; S.source = source; S.imageBase = imageBase || "";
      S.app = null;
      if (S.block >= model.blocks.length) S.block = 0;
      if (S.wit && !model.witById.has(S.wit)) S.wit = "";
      status("");
      buildAll();
    } catch (e) {
      console.error(e);
      status(esc(e.message), "error");
    }
  }

  /* ============================== UI wiring ============================== */
  function bindUI() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => setView(t.dataset.view)));
    $$(".subtab").forEach((t) => t.addEventListener("click", () => { S.sub = t.dataset.sub; renderAnalysis(); }));
    $("#editionSelect").addEventListener("change", (e) => {
      const ed = C.editions.find((x) => x.id === e.target.value);
      if (ed) { S.block = 0; S.app = null; loadFromUrl(ed.file, ed.imageBase || "", ed); updateUrlParam("edition", ed.id); }
    });
    $("#filePicker").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { S.edition = null; S.block = 0; loadText(rd.result, f.name, S.imageBase); };
      rd.readAsText(f, "UTF-8");
    });
    // drag & drop of XML anywhere
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { S.edition = null; S.block = 0; loadText(rd.result, f.name, S.imageBase); };
      rd.readAsText(f, "UTF-8");
    });

    $$(".segbtn[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $$(".segbtn[data-layer]").forEach((b) => b.addEventListener("click", () => {
      S.layer = b.dataset.layer;
      $$(".segbtn[data-layer]").forEach((x) => x.classList.toggle("active", x === b));
      renderText(); writeHash();
    }));
    $("#witnessSelect").addEventListener("change", (e) => { S.wit = e.target.value; renderText(); writeHash(); });

    const opt = (id, key, rerender) => $(id).addEventListener("change", (e) => {
      S.opts[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      rerender();
    });
    opt("#optRel", "rel", applyDecor);
    opt("#optHeat", "heat", applyDecor);
    opt("#optPb", "pb", applyDecor);
    opt("#optBib", "bib", applyDecor);
    opt("#optCause", "cause", applyDecor);
    opt("#optWit", "hlWit", applyDecor);
    opt("#optHideMinor", "hideMinor", () => renderApparatus());

    $("#search").addEventListener("input", (e) => { S.search = e.target.value.trim(); renderTOC(); });
    $("#prevBlock").addEventListener("click", () => stepBlock(-1));
    $("#nextBlock").addEventListener("click", () => stepBlock(1));

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "Escape") { closeViewer(); hideTip(); }
      if (S.view !== "edition") return;
      if (e.key === "ArrowRight" || e.key === "j") { stepBlock(1); e.preventDefault(); }
      if (e.key === "ArrowLeft" || e.key === "k") { stepBlock(-1); e.preventDefault(); }
    });

    // text panel interactions (event delegation)
    const text = $("#text");
    text.addEventListener("click", (e) => {
      const a = e.target.closest("[data-app]");
      const blk = e.target.closest(".block");
      if (a) { selectApp(a.dataset.app, true); e.stopPropagation(); return; }
      if (blk) selectBlock(+blk.dataset.b, false);
    });
    text.addEventListener("mouseover", (e) => {
      const a = e.target.closest("[data-app]");
      if (a) showAppTip(a, a.dataset.app);
      const r = e.target.closest(".relmark");
      if (r && !a) showTip(r, esc(r.getAttribute("title") || ""));
    });
    text.addEventListener("mouseout", (e) => { if (e.target.closest("[data-app], .relmark")) hideTip(); });

    document.addEventListener("mouseover", (e) => {
      const s = e.target.closest(".sig");
      if (s && S.model) {
        const w = S.model.witById.get(s.dataset.wit);
        if (w) showTip(s, witTip(w));
      }
    });
    document.addEventListener("mouseout", (e) => { if (e.target.closest(".sig")) hideTip(); });

    // apparatus interactions
    $("#apparatus").addEventListener("click", (e) => {
      const p = e.target.closest("[data-page]");
      if (p) { openViewer(p.dataset.wit, p.dataset.page); return; }
      const ent = e.target.closest(".entry");
      if (ent) selectApp(ent.dataset.app, false, true);
    });

    window.addEventListener("hashchange", () => { if (readHash()) { if (S.model) { syncControls(); renderText(); selectBlock(S.block, true); } } });
  }

  function setView(v) {
    S.view = v;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    $$(".view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
    if (v !== "edition") closeViewer();
    writeHash();
  }

  function setMode(m) {
    S.mode = m;
    if (m === "witness" && !S.wit) S.wit = (S.model.witnesses.find((w) => w.role === "group") || S.model.witnesses[0]).id;
    syncControls();
    renderText();
    writeHash();
  }

  function syncControls() {
    $$(".segbtn[data-mode]").forEach((x) => x.classList.toggle("active", x.dataset.mode === S.mode));
    $$(".segbtn[data-layer]").forEach((x) => x.classList.toggle("active", x.dataset.layer === S.layer));
    $("#witnessSelect").hidden = S.mode !== "witness";
    $("#layerSeg").hidden = S.mode !== "witness";
    if (S.wit) $("#witnessSelect").value = S.wit;
  }

  /* ============================== hash state ============================== */
  function writeHash() {
    if (!S.model) return;
    const p = new URLSearchParams();
    if (S.view !== "edition") p.set("view", S.view);
    p.set("c", S.block);
    if (S.app) p.set("app", S.app);
    if (S.mode === "witness") { p.set("wit", S.wit); if (S.layer !== "first") p.set("layer", S.layer); }
    history.replaceState(null, "", "#" + p.toString());
  }
  function readHash() {
    if (!location.hash) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has("c")) S.block = +p.get("c") || 0;
    S.app = p.get("app") || null;
    if (p.get("wit")) { S.mode = "witness"; S.wit = p.get("wit"); }
    if (p.get("layer")) S.layer = p.get("layer");
    if (p.get("view")) S.view = p.get("view");
    return true;
  }
  function updateUrlParam(k, v) {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    u.searchParams.delete("xml");
    history.replaceState(null, "", u.pathname + u.search + location.hash);
  }

  /* ============================== build ============================== */
  function buildAll() {
    const m = S.model;
    $("#editionTitle").textContent = [m.title, m.editor ? "ed. " + m.editor : ""].filter(Boolean).join(" · ");
    const ws = $("#witnessSelect");
    ws.innerHTML = m.witnesses.map((w) => `<option value="${esc(w.id)}">${esc(w.id)} — ${esc(shortShelf(w))}</option>`).join("");
    $("#optWit").innerHTML = `<option value="">—</option>` + m.witnesses.map((w) => `<option value="${esc(w.id)}">${esc(w.id)}</option>`).join("");
    const causes = Object.entries(m.stats.causes).sort((a, b) => b[1] - a[1]);
    $("#optCause").innerHTML = `<option value="">—</option>` + causes.map(([c, n]) => `<option value="${esc(c)}">${esc(M.causeLabel(c))} (${n})</option>`).join("");
    S.opts.cause = ""; S.opts.hlWit = "";
    const ic = m.issueCounts || {};
    const nWarn = (ic.error || 0) + (ic.warning || 0);
    $("#issueBadge").textContent = nWarn ? String(nWarn) : "";
    syncControls();
    renderLegend();
    renderTOC();
    renderText();
    selectBlock(Math.min(S.block, m.blocks.length - 1), true);
    if (S.app && m.appById.has(S.app)) selectApp(S.app, true);
    renderWitnesses();
    renderAnalysis();
    renderIntro();
    renderCheck();
    renderData();
    setView(S.view);
  }

  function renderLegend() {
    const g = S.model.groups[0];
    $("#legend").innerHTML = g
      ? `<b class="emph-adiaph">bold</b> = ${esc(g.label)} adiaphoron · <i class="emph-error">italic</i> = ${esc(g.label)} error · <span class="addmark">⁺</span> = addition in some witnesses`
      : `<span class="addmark">⁺</span> = addition in some witnesses`;
  }

  /* ============================== TOC ============================== */
  function blockMatches(b, q) {
    if (!q) return true;
    const m = S.model;
    const ql = q.toLowerCase();
    if (b.plain.toLowerCase().includes(ql) || b.numLabel.toLowerCase() === ql) return true;
    return b.apps.some((id) => {
      const a = m.appById.get(id);
      return a.readings.some((r) => r.text.toLowerCase().includes(ql) || (r.cause || "").toLowerCase() === ql) ||
        a.notes.some((n) => n.html.toLowerCase().includes(ql));
    }) || b.notes.some((n) => n.html.toLowerCase().includes(ql)) || b.relNotes.some((r) => r.text.toLowerCase().includes(ql));
  }

  function renderTOC() {
    const m = S.model;
    const q = S.search;
    let html = "", count = 0;
    m.blocks.forEach((b) => {
      if (!blockMatches(b, q)) return;
      count++;
      const marks = (b.relNotes.length ? `<span class="tmark" title="${b.relNotes.length} Φ annotation(s)">${esc((m.groups[0] || {}).label || "Φ")}</span>` : "") +
        (b.notes.length || b.apps.some((id) => m.appById.get(id).notes.length) ? `<span class="tmark" title="critical note">*</span>` : "");
      if (b.kind === "section") html += `<li class="toc-section" data-b="${b.idx}">${esc(b.plain)}</li>`;
      else if (b.kind === "head") html += `<li class="toc-frame" data-b="${b.idx}">${esc(b.plain || "Incipit")}</li>`;
      else if (b.kind === "trailer") html += `<li class="toc-frame" data-b="${b.idx}">${esc(b.plain || "Explicit")}</li>`;
      else if (b.kind === "added") html += `<li class="toc-item added" data-b="${b.idx}"><span class="tn">⁺</span><span class="tt">added in ${esc((b.addedBy || []).join(" "))}</span></li>`;
      else html += `<li class="toc-item${b.isSubSeries ? " sub" : ""}" data-b="${b.idx}"><span class="tn">${esc(b.numLabel)}</span><span class="tt">${esc(firstWords(b.plain, 5))}</span>${marks}</li>`;
    });
    $("#toc").innerHTML = html || `<li class="empty">No match</li>`;
    if (q) $("#toc").insertAdjacentHTML("afterbegin", `<li class="toc-count">${count} block(s) match “${esc(q)}”</li>`);
    $$("#toc [data-b]").forEach((li) => li.addEventListener("click", () => selectBlock(+li.dataset.b, true)));
    markTOC();
  }

  function markTOC() {
    $$("#toc [data-b]").forEach((li) => li.classList.toggle("current", +li.dataset.b === S.block));
  }

  /* ============================== TEXT ============================== */
  function renderText() {
    const m = S.model;
    const box = $("#text");
    let html = "";
    if (S.mode === "witness") {
      const w = m.witById.get(S.wit);
      html += `<div class="wit-banner">${witBanner(w)}</div>`;
    }
    m.blocks.forEach((b) => {
      const bib = b.bibRefs.length ? `<span class="bibref">${b.bibRefs.map((r) => bibLink(r.ref, r.incipit)).join(" ")}</span>` : "";
      if (S.mode === "critical") {
        if (b.kind === "section") html += `<div class="block section" data-b="${b.idx}"><div class="txt">${b.html}</div></div>`;
        else if (b.kind === "head" || b.kind === "trailer") html += `<div class="block frame ${b.kind}" data-b="${b.idx}"><div class="txt">${b.html}</div></div>`;
        else if (b.kind === "added") {
          const a = b.apps[0] ? m.appById.get(b.apps[0]) : null;
          const r = a && a.readings[0];
          html += `<div class="block added" data-b="${b.idx}"><div class="num">⁺</div><div class="txt"><span class="added-note" data-app="${a ? a.id : ""}">capitulum added in ${witSpans(b.addedBy || [])}${r ? `: <span class="lat">${r.html}</span>` : ""}</span></div></div>`;
        } else html += `<div class="block item${b.isSubSeries ? " sub" : ""}" data-b="${b.idx}"><div class="num">${b.numHTML}</div><div class="txt">${b.html}${bib}</div></div>`;
      } else {
        const w = S.wit;
        const r = M.witnessHTML(m, b, w, S.layer);
        if (b.kind === "added" && r.absent) return;
        const cls = b.kind === "item" || b.kind === "added" ? "item" : b.kind === "section" ? "section" : "frame " + b.kind;
        const content = r.absent ? `<span class="w-lacuna">[lacuna]</span>` : r.html || `<span class="w-om">∅</span>`;
        html += `<div class="block ${cls}${b.isSubSeries ? " sub" : ""}" data-b="${b.idx}">${cls === "item" ? `<div class="num">${r.numHTML || ""}</div>` : ""}<div class="txt">${content}${cls === "item" ? bib : ""}</div></div>`;
      }
    });
    box.innerHTML = html;
    applyDecor();
    markSelection();
  }

  function applyDecor() {
    const m = S.model;
    const box = $("#text");
    box.classList.toggle("show-rel", S.opts.rel);
    box.classList.toggle("show-pb", S.opts.pb);
    box.classList.toggle("show-bib", S.opts.bib);
    box.classList.toggle("heat", S.opts.heat);
    $$("[data-app]", box).forEach((el) => {
      const a = m.appById.get(el.dataset.app);
      if (!a) return;
      el.classList.remove("hl-cause", "hl-wit");
      el.style.removeProperty("--h");
      if (S.opts.heat && S.mode === "critical") {
        const present = m.witnesses.filter((w) => !a.absent.has(w.id) && w.kind !== "edition").length || 1;
        let dev = 0;
        a.byWit.forEach((arr, w) => { if (!a.absent.has(w) && M.isSignificant(arr[0]) && !m.editionWits.includes(w)) dev++; });
        el.style.setProperty("--h", Math.min(1, dev / present).toFixed(2));
      }
      if (S.opts.cause && a.readings.some((r) => r.cause === S.opts.cause)) el.classList.add("hl-cause");
      if (S.opts.hlWit && S.mode === "critical") {
        const arr = a.byWit.get(S.opts.hlWit);
        if (arr && !a.absent.has(S.opts.hlWit)) el.classList.add("hl-wit");
      }
    });
    // page-break markers labels
    $$(".pbmark", box).forEach((el) => {
      const p = m.pages[+el.dataset.page];
      if (p) { el.textContent = "‖" + p.wit; el.title = `${p.wit} ${p.label}`; }
    });
  }

  function markSelection() {
    $$("#text .block").forEach((el) => el.classList.toggle("selected", +el.dataset.b === S.block));
    $$("#text [data-app]").forEach((el) => el.classList.toggle("sel", el.dataset.app === S.app));
  }

  function selectBlock(idx, scroll) {
    const m = S.model;
    if (!m) return;
    idx = Math.max(0, Math.min(m.blocks.length - 1, idx));
    if (S.block !== idx) S.app = null;
    S.block = idx;
    markSelection();
    markTOC();
    renderApparatus();
    if (VIEW) VIEW.followBlock();
    if (scroll) {
      const el = $(`#text .block[data-b="${idx}"]`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      const li = $(`#toc [data-b="${idx}"]`);
      if (li) li.scrollIntoView({ block: "nearest" });
    }
    writeHash();
  }

  function selectApp(id, scrollApparatus, fromApparatus) {
    const m = S.model;
    const a = m.appById.get(id);
    if (!a) return;
    if (S.block !== a.blockIdx) { S.block = a.blockIdx; renderApparatus(); markTOC(); if (VIEW) VIEW.followBlock(); }
    S.app = id;
    markSelection();
    $$("#apparatus .entry").forEach((e) => e.classList.toggle("sel", e.dataset.app === id));
    const ent = $(`#apparatus .entry[data-app="${id}"]`);
    if (ent && scrollApparatus) ent.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (fromApparatus) {
      const t = $(`#text [data-app="${id}"]`);
      if (t) t.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    writeHash();
  }

  function stepBlock(d) {
    const m = S.model;
    let i = S.block + d;
    while (i >= 0 && i < m.blocks.length && !blockMatches(m.blocks[i], S.search)) i += d;
    if (i >= 0 && i < m.blocks.length) selectBlock(i, true);
  }

  /* ============================== APPARATUS ============================== */
  function renderApparatus() {
    const m = S.model;
    const b = m.blocks[S.block];
    const box = $("#apparatus");
    if (!b) { box.innerHTML = ""; return; }
    $("#appTitle").innerHTML = blockTitle(b);
    let html = "";

    // critical text of the block
    if (b.kind !== "added") html += `<div class="ap-text lat">${b.numHTML ? `<span class="num">${b.numHTML}</span> ` : ""}${b.html}</div>`;
    if (b.bibRefs.length) html += `<div class="ap-bib">${b.bibRefs.map((r) => bibLink(r.ref, r.incipit) + (r.incipit ? ` <span class="lat muted">${esc(r.incipit)}</span>` : "")).join("<br>")}</div>`;

    // Φ annotations
    b.relNotes.forEach((rel) => {
      const a = rel.appId ? m.appById.get(rel.appId) : null;
      html += `<div class="ap-rel cat-${rel.category}" ${a ? `data-app="${a.id}"` : ""}><span class="rel-tag">${relCatLabel(rel)}</span> ${esc(rel.text)}${a ? ` <span class="muted">— on <span class="lat">${esc(a.lem.text || "⁺")}</span></span>` : ""}</div>`;
    });

    // pages
    const pageChips = pagesForBlock(b);
    if (pageChips.length) {
      html += `<div class="ap-pages"><span class="ap-label">Images</span>${pageChips.map((p) =>
        `<button class="chip" data-wit="${esc(p.wit)}" data-page="${esc(p.id)}" title="${esc(p.wit)} ${esc(p.label)}">${esc(p.wit)} <span class="muted">${esc(p.label)}</span></button>`).join("")}</div>`;
    }

    // entries
    const apps = b.apps.map((id) => m.appById.get(id));
    let hidden = 0;
    const entries = apps.map((a) => {
      const visibleReadings = a.readings.filter((r) => !(S.opts.hideMinor && (r.cause === "orthographic")));
      if (!visibleReadings.length && a.readings.length) { hidden++; return ""; }
      if (!a.readings.length && !a.notes.length && !a.witDetails.length) return "";
      return entryHTML(a, visibleReadings);
    }).join("");
    html += entries ? `<div class="entries">${entries}</div>` : `<p class="muted">No variants recorded for this block.</p>`;
    if (hidden) html += `<p class="muted small">${hidden} entr${hidden > 1 ? "ies" : "y"} with orthographic variants only hidden.</p>`;

    // block-level notes and witDetails
    b.notes.forEach((n) => { html += `<div class="cnote"><span class="ap-label">Note</span> ${n.html}</div>`; });
    b.witDetails.forEach((d) => { html += `<div class="witdetail">${witSpans(d.wit)}: ${d.html}</div>`; });

    box.innerHTML = html;
    linkifyBible(box);
    $$(".entry", box).forEach((e) => e.classList.toggle("sel", e.dataset.app === S.app));
    box.scrollTop = 0;
  }

  function entryHTML(a, readings) {
    const m = S.model;
    const present = new Set(m.witnesses.map((w) => w.id).filter((w) => !a.absent.has(w)));
    const lemText = a.lem.text ? `<span class="lem lat">${a.lem.html}</span>` : `<span class="lem add">⁺</span>`;
    const lemWits = a.lem.text || a.lemWits.length ? `<span class="wits">${witList(a.lemWits, present)}${a.lemWitsExplicit ? "" : ""}</span>` : "";
    const lemTags = tagsHTML({ type: a.lem.type, subtype: a.lem.subtype, cause: a.lem.cause }, true);
    let html = `<div class="entry depth${Math.min(a.depth, 3)}${a.isNum ? " numapp" : ""}" data-app="${a.id}">`;
    html += `<div class="lemline">${lemText}<span class="br">]</span> ${lemWits} ${lemTags}${a.lem.emph ? `<span class="emph-flag">${a.lem.emph === "adiaph" ? "adiaph." : "error"}</span>` : ""}</div>`;

    // layered witnesses (corrections) vs simple readings
    const layered = new Set();
    a.byWit.forEach((arr, w) => { if (arr.length > 1) layered.add(w); });
    const simple = readings.filter((r) => !r.wits.every((w) => layered.has(w)));
    let lastGrp = null;
    simple.forEach((r) => {
      const ws = r.wits.filter((w) => !layered.has(w) && !(r.dupWits || []).includes(w));
      if (!ws.length) return;
      const txt = r.isLacuna ? `<span class="muted">lac.</span>` : r.text ? `<span class="rtext lat">${a.lem.text ? "" : "add. "}${r.html}</span>` : `<span class="rtext om">om.</span>`;
      const newGrp = r.grp && r.grp !== lastGrp;
      lastGrp = r.grp;
      html += `<div class="rdg${newGrp ? " grp-start" : ""}"${r.grp ? ` title="reading group ${r.grp}"` : ""}>${txt} <span class="wits">${witList(ws, present)}</span> ${tagsHTML(r)}</div>`;
    });
    // genesis chains (grouped by identical chains)
    const chains = new Map();
    layered.forEach((w) => {
      const arr = a.byWit.get(w);
      const key = arr.map((r) => r.idx).join(",");
      if (!chains.has(key)) chains.set(key, { wits: [], arr });
      chains.get(key).wits.push(w);
    });
    chains.forEach(({ wits, arr }) => {
      const steps = arr.map((r, i) => {
        const t = r.type === "lem" ? (r.text ? `<span class="lat">${r.html}</span>` : `<span class="lat">${a.lem.html || "="}</span>`) + ` <span class="muted">(= lem.)</span>` : r.text ? `<span class="lat">${r.html}</span>` : `<span class="om">om.</span>`;
        const meta = [i === 0 ? "a.c." : i === arr.length - 1 ? "p.c." : "layer " + (i + 1)];
        if (r.hand) meta.push(handLabel(r.hand));
        if (r.rend) meta.push(r.rend.split(/[_\s]/).map((x) => M.REND_LABELS[x] || M.REND_LABELS[r.rend] || x).filter((v, j, s) => s.indexOf(v) === j).join(" + "));
        return `<span class="step">${t} <span class="meta">${esc(meta.join(", "))}</span>${tagsHTML(r)}</span>`;
      }).join(`<span class="arrow">→</span>`);
      html += `<div class="rdg chain"><span class="wits">${witSpans(M.sortWits(m, wits))}</span> ${steps}</div>`;
    });

    a.witDetails.forEach((d) => { html += `<div class="witdetail">${witSpans(d.wit)}: ${d.html}</div>`; });
    a.notes.forEach((n) => { html += `<div class="cnote"><span class="ap-label">Critical note${n.on ? ` <span class="muted">(${esc(n.on)})</span>` : ""}</span> ${n.html}</div>`; });
    html += `</div>`;
    return html;
  }

  function tagsHTML(r, isLem) {
    const t = [];
    if (r.type && r.type !== "lem") t.push(`<span class="tag t-type">${esc(r.type)}</span>`);
    if (r.subtype) t.push(`<span class="tag t-sub">${esc(r.subtype)}</span>`);
    if (r.cause) t.push(`<span class="tag t-cause${["Vulgate", "VetusLatina"].includes(r.cause) ? " t-version" : ""}">${esc(M.causeLabel(r.cause))}</span>`);
    if (!isLem && r.cert) t.push(`<span class="tag t-cert" title="certainty">cert. ${esc(r.cert)}</span>`);
    if (!isLem && r.ana) t.push(`<span class="tag">${esc(r.ana)}</span>`);
    if (!isLem && r.rendition && r.rendition.length) t.push(`<span class="tag t-rend" title="${esc(r.rendition.map((x) => S.model.renditions[x] || x).join("; "))}">${esc(r.rendition.join(" "))}</span>`);
    if (!isLem && r.hand && r.varSeq == null) t.push(`<span class="tag">${esc(handLabel(r.hand))}</span>`);
    return t.length ? `<span class="tags">${t.join("")}</span>` : "";
  }

  function handLabel(h) {
    const m = S.model;
    const map = { m: "first hand", l: "later hand", u: "hand uncertain", "?": "hand not recorded", unknown: "hand uncertain" };
    return map[h] || (m.hands[h] ? m.hands[h] : "hand " + h);
  }

  function relCatLabel(rel) {
    const g = (S.model.groups[0] || {}).label || "Φ";
    return `${esc(g)} ${rel.category === "error" ? "error" : rel.category === "adiaphoric" ? "adiaph." : "note"}${rel.uncertain ? "?" : ""}`;
  }

  function witSpans(list) {
    return list.map((w) => `<span class="sig" data-wit="${esc(w)}">${esc(w)}</span>`).join(" ");
  }

  // compress witness lists with the group siglum ("Φ praeter Sg1")
  function witList(wits, present) {
    const m = S.model;
    const g = m.groups[0];
    if (!wits.length) return "";
    if (g) {
      const members = g.members.filter((x) => present.has(x));
      const inSet = members.filter((x) => wits.includes(x));
      const missing = members.filter((x) => !wits.includes(x));
      if (members.length >= 4 && inSet.length >= 3 && missing.length <= 3 && inSet.length > missing.length) {
        const others = wits.filter((x) => !g.members.includes(x));
        return `<span class="grp-sig" title="${esc(g.name || g.label)}: ${esc(inSet.join(" "))}">${esc(g.label)}</span>` +
          (missing.length ? ` <span class="praeter">praeter</span> ${witSpans(missing)}` : "") +
          (others.length ? (missing.length ? " + " : " ") + witSpans(others) : "");
      }
    }
    return witSpans(wits);
  }

  function pagesForBlock(b) {
    const m = S.model;
    const out = [];
    const seen = new Set();
    m.witnesses.forEach((w) => {
      if (b.absent.has(w.id)) return;
      const pid = b.pageStarts[w.id];
      if (pid && !seen.has(pid)) { seen.add(pid); out.push(m.pages.find((p) => p.id === pid)); }
    });
    b.pageBreaks.forEach((pid) => { if (!seen.has(pid)) { seen.add(pid); out.push(m.pages.find((p) => p.id === pid)); } });
    return out.filter(Boolean);
  }

  /* ============================== tooltips ============================== */
  function showTip(anchor, html) {
    const t = $("#tooltip");
    t.innerHTML = html;
    t.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = Math.min(420, window.innerWidth - 20);
    t.style.maxWidth = tw + "px";
    let left = r.left;
    if (left + tw > window.innerWidth - 10) left = window.innerWidth - tw - 10;
    t.style.left = Math.max(10, left) + "px";
    const below = r.bottom + 8;
    t.style.top = below + "px";
    const th = t.offsetHeight;
    if (below + th > window.innerHeight - 10) t.style.top = Math.max(10, r.top - th - 8) + "px";
  }
  function hideTip() { $("#tooltip").hidden = true; }

  function showAppTip(el, id) {
    const m = S.model;
    const a = m.appById.get(id);
    if (!a) return;
    if (S.mode === "witness") {
      const res = M.witnessReading(m, a, S.wit, S.layer);
      const lines = [`<div><b>text:</b> <span class="lat">${esc(a.lem.text || "⁺")}</span></div>`];
      if (res.layers.length) res.layers.forEach((r, i) => lines.push(`<div>${esc(S.wit)} ${res.layers.length > 1 ? (i === 0 ? "a.c." : "p.c.") : ""}: <span class="lat">${r.text ? esc(r.text) : r.type === "lem" ? "= lem." : "om."}</span> <span class="muted">${esc([r.type, M.causeLabel(r.cause), r.hand ? handLabel(r.hand) : ""].filter(Boolean).join(" · "))}</span></div>`));
      showTip(el, lines.join(""));
      return;
    }
    const nR = a.readings.filter((r) => !r.isLacuna).length;
    const list = a.readings.filter((r) => !r.isLacuna).slice(0, 6).map((r) => `<div><span class="lat">${r.text ? esc(r.text) : "om."}</span> <span class="muted">${esc(r.wits.join(" "))}</span></div>`).join("");
    showTip(el, `<div class="tip-lem"><span class="lat">${esc(a.lem.text || "⁺ addition")}</span>]</div>${list}${nR > 6 ? `<div class="muted">… ${nR - 6} more</div>` : ""}${a.notes.length ? `<div class="muted">* critical note</div>` : ""}`);
  }

  function witTip(w) {
    return `<b>${esc(w.id)}</b> ${esc(shortShelf(w))}<br><span class="muted">${esc([w.dateText, w.place].filter(Boolean).join(" · "))}</span>`;
  }

  /* ============================== helpers ============================== */
  function shortShelf(w) {
    if (w.kind === "edition") return w.head || "printed edition";
    return [w.settlement, w.repository && w.repository.replace(/\s*\[.*?\]\s*/g, " ").trim(), w.idno].filter(Boolean).join(", ");
  }
  function firstWords(s, n) { const p = s.split(" "); return p.slice(0, n).join(" ") + (p.length > n ? " …" : ""); }
  function blockTitle(b) {
    if (b.kind === "head") return "Incipit";
    if (b.kind === "trailer") return "Explicit";
    if (b.kind === "section") return esc(b.plain);
    if (b.kind === "added") return "Added capitulum";
    const sec = b.isSubSeries && b.section != null ? S.model.blocks[b.section].plain + " · " : "";
    return `${esc(sec)}Capitulum <span class="num">${esc(b.numLabel)}</span>`;
  }
  function witBanner(w) {
    if (!w) return "";
    return `<b>${esc(w.id)}</b> · ${esc(shortShelf(w))}${w.dateText ? " · " + esc(w.dateText) : ""}${w.place ? " · " + esc(w.place) : ""}
      <span class="muted"> — ${S.layer === "first" ? "first hand (ante correctionem)" : "final state (post correctionem)"}. Underlined: deviations from the critical text; dotted: corrected passages.</span>`;
  }
  function bibUrl(ref) {
    if (!C.bibleLink) return "";
    const m = ref.match(/^([1-4]?\s?[A-Za-z]+)\.?\s*(.*)$/);
    const book = m ? ((C.bookNames || {})[m[1].replace(/\s/g, "")] || m[1]) : ref;
    const rest = m ? m[2].replace(",", ":").replace(".", ":") : "";
    return C.bibleLink.replace("{ref}", encodeURIComponent((book + " " + rest).trim()));
  }
  function bibLink(ref, incipit) {
    const u = bibUrl(ref);
    return u ? `<a class="bib" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(incipit || "")} — open the Vulgate text">${esc(ref)}</a>` : `<span class="bib">${esc(ref)}</span>`;
  }
  function linkifyBible(root) {
    if (!C.bibleLink) return;
    const books = Object.keys(C.bookNames || {}).join("|");
    const re = new RegExp(`\\b(${books})\\.?\\s+(\\d+)[:.,](\\d+)(?:\\s*[-–]\\s*\\d+)?`, "g");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.parentElement.closest("a, .bib")) continue;
      if (re.test(n.textContent)) nodes.push(n);
      re.lastIndex = 0;
    }
    nodes.forEach((n) => {
      const span = document.createElement("span");
      span.innerHTML = esc(n.textContent).replace(re, (mm) => `<a class="bib" href="${esc(bibUrl(mm))}" target="_blank" rel="noopener">${mm}</a>`);
      n.replaceWith(...span.childNodes);
    });
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function edSlug() { return (S.edition && S.edition.id) || (S.source || "edition").split("/").pop().replace(/\.[a-z]+$/i, ""); }
  function goToApp(id) { setView("edition"); if (S.mode !== "critical") setMode("critical"); selectApp(id, true, true); }
  function goToBlock(i) { setView("edition"); selectBlock(i, true); }

  /* ============================== IMAGES ============================== */
  function pagesOf(w) { return (S.model.pagesByWit.get(w) || []); }
  function imageUrl(p, fallback) {
    if (/^https?:\/\//.test(p.facs)) return p.facs;
    const base = S.imageBase || "";
    return fallback ? base + p.file : base + p.facs;
  }

  let VIEW = null;
  function viewer() {
    if (!VIEW) VIEW = window.CapitulaViewer.create({
      model: () => S.model,
      pagesOf,
      page: (id) => S.model.pages.find((x) => x.id === id),
      imageUrl,
      block: () => S.model.blocks[S.block],
      blockLabel: (b) => b.kind === "item" ? "Cap. " + b.numLabel : b.kind === "head" ? "Incipit" : b.kind === "trailer" ? "Explicit" : (b.plain || "").slice(0, 30)
    });
    return VIEW;
  }
  function openViewer(wit, pageId) { viewer().openAt(wit, pageId); }
  function closeViewer() { if (VIEW) VIEW.close(); }

  /* ============================== WITNESSES ============================== */
  function renderWitnesses() {
    const m = S.model;
    const prof = A.witnessProfiles(m, "noOrth");
    const pById = new Map(prof.map((p) => [p.id, p]));
    const g = m.groups[0];
    $("#witLead").innerHTML = `${m.witnesses.filter((w) => w.kind === "ms").length} manuscripts` +
      (g ? ` — group ${esc(g.label)}${g.name ? ` (${esc(g.name)})` : ""}: ${witSpans(g.members)}` : "") +
      (m.comparanda.length ? `; collated for comparison: ${witSpans(m.comparanda)}` : "") +
      (m.editionWits.length ? `; printed edition(s) encoded as witness: ${witSpans(m.editionWits)}` : "") + ".";
    $("#timeline").innerHTML = timelineSVG(m);
    $$("#timeline [data-wit]").forEach((el) => el.addEventListener("click", () => {
      const c = $(`#card-${CSS.escape(el.dataset.wit)}`);
      if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.add("flash"); setTimeout(() => c.classList.remove("flash"), 1200); }
    }));
    $("#witCards").innerHTML = m.witnesses.map((w) => {
      const p = pById.get(w.id);
      const pages = pagesOf(w.id);
      const ids = w.ids.map((i) => i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.type)}</a>` : `<span>${esc(i.value)}</span>`).join(" · ");
      const links = w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.type)}</a>`);
      const man = w.links.find((l) => /IIIF/i.test(l.type) && /manifest/i.test(l.url) && !/[#?]manifest=/.test(l.url));
      if (man) links.push(`<a href="https://projectmirador.org/embed/?iiif-content=${encodeURIComponent(man.url)}" target="_blank" rel="noopener">open in Mirador</a>`);
      const role = { edition: "printed edition", comparandum: "comparandum", group: g ? g.label : "group", ms: "manuscript" }[w.role];
      return `<article class="card role-${w.role}" id="card-${esc(w.id)}">
        <header><span class="siglum">${esc(w.id)}</span><span class="role">${esc(role)}</span></header>
        <div class="shelf">${esc(shortShelf(w))}</div>
        ${w.head ? `<div class="whead">${esc(w.head)}${w.itemNote && w.kind === "ms" ? "" : ""}</div>` : ""}
        ${w.kind === "ms" ? `<dl>
          <dt>Date</dt><dd>${esc(w.dateText || "—")}</dd>
          <dt>Origin</dt><dd>${esc(w.place || "—")}${w.placeCert ? ` <span class="muted">(cert. ${esc(w.placeCert)})</span>` : ""}</dd>
          ${w.periodNote ? `<dt>Period</dt><dd>${esc(w.periodNote)}</dd>` : ""}
          <dt>Capitula</dt><dd>${esc(w.locus || "—")}</dd>
          <dt>Codex</dt><dd>${esc([w.extent, w.height && w.width ? `${w.height} × ${w.width} mm` : "", w.columns ? w.columns + " cols." : ""].filter(Boolean).join(" · "))}</dd>
          ${w.script ? `<dt>Script</dt><dd>${esc(w.script)}</dd>` : ""}
          ${w.itemNote ? `<dt>Note</dt><dd>${esc(w.itemNote)}</dd>` : ""}
          ${ids ? `<dt>IDs</dt><dd>${ids}</dd>` : ""}
          ${links.length ? `<dt>Online</dt><dd>${links.join(" · ")}</dd>` : ""}
        </dl>` : `<div class="wdesc">${w.descriptionHTML}</div>`}
        <div class="wstats">${p ? `<span title="first-hand deviations from the critical text (orthography, slips and corrections excluded)"><b>${p.deviations}</b> deviations</span> · <span title="readings attested by this witness alone"><b>${p.singular}</b> singular</span> · <span title="passages with corrective layers"><b>${p.layers}</b> corrected</span>${p.absent ? ` · <span><b>${p.absent}</b> lacunose entries</span>` : ""}` : ""}</div>
        <div class="wbtns"><button class="btn small" data-read="${esc(w.id)}">Read this witness</button>${pages.length ? `<button class="btn small" data-img="${esc(w.id)}">Images (${pages.length})</button>` : ""}</div>
      </article>`;
    }).join("");
    $$("#witCards [data-read]").forEach((b) => b.addEventListener("click", () => { S.wit = b.dataset.read; setView("edition"); setMode("witness"); }));
    $$("#witCards [data-img]").forEach((b) => b.addEventListener("click", () => { setView("edition"); openViewer(b.dataset.img, pagesOf(b.dataset.img)[0].id); }));
  }

  function timelineSVG(m) {
    const ws = m.witnesses.filter((w) => w.kind === "ms" && !isNaN(w.from));
    if (!ws.length) return "";
    const min = Math.floor((Math.min(...ws.map((w) => w.from)) - 5) / 10) * 10;
    const max = Math.ceil((Math.max(...ws.map((w) => w.to || w.from)) + 5) / 10) * 10;
    const W = 900, rowH = 22, padL = 56, padR = 190, top = 26;
    const H = top + ws.length * rowH + 10;
    const x = (y) => padL + (y - min) / (max - min) * (W - padL - padR);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chronology of the witnesses" class="tl">`;
    for (let y = min; y <= max; y += 10) {
      s += `<line x1="${x(y)}" x2="${x(y)}" y1="${top - 6}" y2="${H - 6}" class="tl-grid"/><text x="${x(y)}" y="${top - 12}" class="tl-year">${y}</text>`;
    }
    ws.forEach((w, i) => {
      const y = top + i * rowH;
      const x1 = x(w.from), x2 = Math.max(x(w.to || w.from), x1 + 4);
      s += `<g data-wit="${esc(w.id)}" class="tl-row role-${w.role}" style="cursor:pointer">
        <text x="${padL - 8}" y="${y + 14}" class="tl-sig">${esc(w.id)}</text>
        <rect x="${x1}" y="${y + 4}" width="${x2 - x1}" height="13" rx="2" class="tl-bar"/>
        <text x="${x2 + 6}" y="${y + 14}" class="tl-lab">${esc(w.dateText.replace(/\s*\(.*$/, ""))} · ${esc((w.place || "").replace(/^Tours,\s*/, "Tours, "))}</text>
        <title>${esc(w.id)}: ${esc(shortShelf(w))} — ${esc(w.dateText)}${w.periodNote ? " — " + esc(w.periodNote) : ""}</title></g>`;
    });
    s += `</svg><div class="tl-key"><span class="k k-group"></span> ${esc((m.groups[0] || {}).label || "group")} <span class="k k-comp"></span> comparanda</div>`;
    return s;
  }

  /* ============================== ANALYSIS ============================== */
  function renderAnalysis() {
    if (!S.model) return;
    $$(".subtab").forEach((t) => t.classList.toggle("active", t.dataset.sub === S.sub));
    const box = $("#analysis");
    const fn = { profile: anProfile, agreements: anAgreements, witstats: anWitStats, numbering: anNumbering, layers: anLayers }[S.sub];
    box.innerHTML = fn ? fn() : "";
    $$("[data-goapp]", box).forEach((el) => el.addEventListener("click", () => goToApp(el.dataset.goapp)));
    $$("[data-gob]", box).forEach((el) => el.addEventListener("click", () => goToBlock(+el.dataset.gob)));
    if (S.sub === "agreements") bindAgreements();
  }

  function anProfile() {
    const m = S.model;
    const { rows, summary } = A.phiProfile(m);
    const g = (m.groups[0] || {}).label || "Φ";
    if (!rows.length) return `<p class="muted">This edition contains no relation annotations (notes such as “${esc(g)} (adiaph.) vs Am1 Tu”).</p>`;
    const cols = Array.from(new Set(rows.map((r) => r.rel.exclusive ? "exclusive" : r.rel.shared.slice().sort().join("+"))));
    cols.sort((a, b) => (a === "exclusive" ? -1 : b === "exclusive" ? 1 : a.localeCompare(b)));
    const cats = ["adiaphoric", "error", "other"].filter((c) => summary[c]);
    const colLabel = (c) => c === "exclusive" ? `${esc(g)} only` : `${esc(g)} + ${esc(c.replace(/\+/g, " + "))}`;
    let html = `<h2>${esc(g)} profile</h2><p class="lead">Readings that the editor marks as characteristic of ${esc(g)} — in the critical text in <b>bold</b> (adiaphora) or <i>italics</i> (errors) — with the readings of the comparanda. The table is generated from the relation notes in the encoding, so it reproduces the argument of the introduction from the data.</p>`;
    html += `<table class="mini"><thead><tr><th></th>${cols.map((c) => `<th>${colLabel(c)}</th>`).join("")}<th>total</th></tr></thead><tbody>` +
      cats.map((cat) => `<tr><th>${cat === "adiaphoric" ? "adiaphora" : cat === "error" ? "errors" : "other"}</th>${cols.map((c) => `<td class="n">${(summary[cat] || {})[c] || ""}</td>`).join("")}<td class="n"><b>${Object.values(summary[cat]).reduce((x, y) => x + y, 0)}</b></td></tr>`).join("") +
      `</tbody></table>`;
    const comp = m.comparanda.concat(m.editionWits);
    html += `<table class="data synoptic"><thead><tr><th>cap.</th><th>${esc(g)} (critical text)</th><th>annotation</th>${comp.map((w) => `<th>${witSpans([w])}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach(({ block, rel, app }) => {
      const cells = comp.map((w) => {
        if (!app) return `<td></td>`;
        const res = M.witnessReading(m, app, w, "first");
        if (res.kind === "absent") return `<td class="muted">lac.</td>`;
        if (res.kind === "lem") return `<td class="muted">= </td>`;
        const r = res.reading;
        const fin = res.layers.length > 1 ? res.layers[res.layers.length - 1] : null;
        return `<td class="lat">${r.text ? esc(r.text) : "om."}${fin ? ` <span class="muted">→ ${fin.text ? esc(fin.text) : "om."}</span>` : ""}</td>`;
      }).join("");
      const lem = app ? `<span class="lat ${app.lem.emph ? "emph-" + (app.lem.emph === "adiaph" ? "adiaph" : "error") : ""}">${app.lem.emph === "adiaph" ? `<b>${esc(app.lem.text || "⁺")}</b>` : app.lem.emph === "error" ? `<i>${esc(app.lem.text || "⁺")}</i>` : esc(app.lem.text || "⁺")}</span>` : "";
      html += `<tr class="clickable" ${app ? `data-goapp="${app.id}"` : `data-gob="${block.idx}"`}><td class="num">${esc(block.numLabel || M.label(block))}</td><td>${lem}</td><td class="small">${esc(rel.text)}</td>${cells}</tr>`;
    });
    html += `</tbody></table><p class="muted small">“=” agrees with the critical text; a.c. → p.c. readings are shown with an arrow. Click a row to open it in the edition.</p>`;
    return html;
  }

  function anAgreements() {
    const m = S.model;
    const o = S.agree;
    const res = A.agreements(m, o);
    S._agree = res;
    const n = res.wits.length;
    let maxShared = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) maxShared = Math.max(maxShared, res.shared[i][j]);
    let html = `<h2>Agreements between witnesses</h2>
      <p class="lead">${o.measure === "shared"
        ? "Number of passages in which two witnesses share the <b>same reading diverging from the critical text</b> (first hand). Shared innovations are the classic evidence for genealogical relationships."
        : "Percentage of passages in which two witnesses have the <b>same reading</b> (first hand), out of the passages where both are extant."} Computed over ${res.used} apparatus entries (${esc(A.FILTERS[o.filter].label)}).</p>
      <div class="controls">
        <label>Measure <select id="agMeasure"><option value="shared">shared deviations (count)</option><option value="pct">overall agreement (%)</option></select></label>
        <label>Variants <select id="agFilter">${Object.entries(A.FILTERS).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("")}</select></label>
        <label><input type="checkbox" id="agEd"> include printed edition</label>
        <label><input type="checkbox" id="agNum"> include chapter numbers</label>
      </div>`;
    html += `<div class="matrix-wrap"><table class="matrix"><thead><tr><th></th>${res.wits.map((w) => `<th>${witSpans([w])}</th>`).join("")}</tr></thead><tbody>`;
    let pmin = 100;
    if (o.measure === "pct") for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && res.both[i][j]) pmin = Math.min(pmin, 100 * res.same[i][j] / res.both[i][j]);
    res.wits.forEach((w, i) => {
      html += `<tr><th>${witSpans([w])}</th>`;
      res.wits.forEach((v, j) => {
        if (i === j) { html += `<td class="diag"></td>`; return; }
        let val, shade, title;
        if (o.measure === "shared") {
          val = res.shared[i][j];
          shade = val / maxShared;
          title = `${w} & ${v}: ${val} shared deviations (both extant in ${res.both[i][j]} entries)`;
        } else {
          const p = res.both[i][j] ? 100 * res.same[i][j] / res.both[i][j] : 0;
          val = res.both[i][j] ? p.toFixed(0) : "–";
          shade = res.both[i][j] ? (p - pmin) / Math.max(1, 100 - pmin) : 0;
          title = `${w} & ${v}: ${res.same[i][j]}/${res.both[i][j]} identical readings`;
        }
        const sel = o.cell && o.cell[0] === i && o.cell[1] === j ? " cellsel" : "";
        html += `<td class="cell${sel}${shade > 0.5 ? " inv" : ""}" data-i="${i}" data-j="${j}" style="--s:${shade.toFixed(2)}" title="${esc(title)}">${val}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div><p class="muted small">Darker = more agreement. Click a cell to list the shared readings.</p><div id="agList"></div>`;
    return html;
  }

  function bindAgreements() {
    const o = S.agree;
    $("#agMeasure").value = o.measure;
    $("#agFilter").value = o.filter;
    $("#agEd").checked = o.includeEdition;
    $("#agNum").checked = o.includeNum;
    $("#agMeasure").addEventListener("change", (e) => { o.measure = e.target.value; renderAnalysis(); });
    $("#agFilter").addEventListener("change", (e) => { o.filter = e.target.value; o.cell = null; renderAnalysis(); });
    $("#agEd").addEventListener("change", (e) => { o.includeEdition = e.target.checked; o.cell = null; renderAnalysis(); });
    $("#agNum").addEventListener("change", (e) => { o.includeNum = e.target.checked; o.cell = null; renderAnalysis(); });
    $$(".matrix .cell").forEach((c) => c.addEventListener("click", () => { o.cell = [+c.dataset.i, +c.dataset.j]; showAgreeList(); $$(".matrix .cell").forEach((x) => x.classList.toggle("cellsel", x === c)); }));
    if (o.cell) showAgreeList();
  }

  function showAgreeList() {
    const m = S.model;
    const res = S._agree;
    const [i, j] = S.agree.cell;
    const w = res.wits[i], v = res.wits[j];
    const ids = res.sharedApps[i][j];
    const rows = ids.map((id) => {
      const a = m.appById.get(id);
      const b = m.blocks[a.blockIdx];
      const k = A.keyFor(m, a, w, S.agree.filter);
      const r = k && k.reading;
      return `<tr class="clickable" data-goapp="${id}"><td class="num">${esc(b.numLabel || M.label(b))}</td><td class="lat">${esc(a.lem.text || "⁺")}</td><td class="lat">${r ? (r.text ? esc(r.text) : "om.") : ""}</td><td>${r ? esc([r.type, M.causeLabel(r.cause)].filter(Boolean).join(" · ")) : ""}</td><td>${r ? witSpans(r.wits) : ""}</td></tr>`;
    }).join("");
    $("#agList").innerHTML = `<h3>${witSpans([w])} and ${witSpans([v])}: ${ids.length} shared deviation${ids.length === 1 ? "" : "s"}</h3>` +
      (ids.length ? `<table class="data"><thead><tr><th>cap.</th><th>critical text</th><th>shared reading</th><th>classification</th><th>attested in</th></tr></thead><tbody>${rows}</tbody></table>` : "");
    $$("#agList [data-goapp]").forEach((el) => el.addEventListener("click", () => goToApp(el.dataset.goapp)));
  }

  function anWitStats() {
    const m = S.model;
    const prof = A.witnessProfiles(m, "all");
    const causes = {};
    prof.forEach((p) => Object.entries(p.byCause).forEach(([c, n]) => { causes[c] = (causes[c] || 0) + n; }));
    const sorted = Object.entries(causes).sort((a, b) => b[1] - a[1]);
    const top = sorted.filter(([, n], i) => i < 12 && n >= 2).map(([c]) => c);
    const rest = sorted.map(([c]) => c).filter((c) => !top.includes(c));
    prof.forEach((p) => { p.byCause.__other = rest.reduce((n, c) => n + (p.byCause[c] || 0), 0); });
    if (rest.length) top.push("__other");
    const maxDev = Math.max(1, ...prof.map((p) => p.deviations));
    let html = `<h2>Witness profiles</h2><p class="lead">First-hand deviations from the critical text, classified by <code>@cause</code> as encoded. Useful to see, for instance, which witnesses normalise to the Vulgate, or where corrections concentrate. Chapter numbers are excluded (see “Numbering”).</p>`;
    html += `<div class="matrix-wrap"><table class="data stats"><thead><tr><th>witness</th><th>deviations</th><th>singular</th><th>corrected</th>${top.map((c) => `<th class="rot"${c === "__other" ? ` title="${esc(rest.join(", "))}"` : ""}><span>${esc(c === "__other" ? "other" : M.causeLabel(c))}</span></th>`).join("")}</tr></thead><tbody>`;
    prof.forEach((p) => {
      html += `<tr><th>${witSpans([p.id])}</th><td><div class="bar" style="--w:${(p.deviations / maxDev).toFixed(3)}"><span>${p.deviations}</span></div></td><td class="n">${p.singular}</td><td class="n">${p.layers}</td>${top.map((c) => `<td class="n${p.byCause[c] ? "" : " zero"}">${p.byCause[c] || "·"}</td>`).join("")}</tr>`;
    });
    html += `</tbody></table></div><p class="muted small">“Singular” = reading attested by no other manuscript (printed editions excluded). “Corrected” = entries where the witness has more than one layer (<code>@varSeq</code>).</p>`;
    return html;
  }

  function anNumbering() {
    const m = S.model;
    const { rows, wits } = A.numbering(m);
    if (!wits.length) return `<p class="muted">No numbering variants recorded.</p>`;
    let html = `<h2>Chapter numbering</h2><p class="lead">Chapter numbers of the critical text compared with the witnesses that diverge (and their corrections). Differences show how the series were counted — e.g. sub-series such as the plagues and the Decalogue numbered separately or continuously.</p>`;
    const shown = rows.filter((r) => r.block.kind === "added" || Object.keys(r.cells).length);
    html += `<p class="muted small">${shown.length} of ${rows.length} capitula have numbering variants; “=” = same number as the text.</p>`;
    html += `<div class="matrix-wrap"><table class="data numbering"><thead><tr><th>text</th>${wits.map((w) => `<th>${witSpans([w])}</th>`).join("")}</tr></thead><tbody>`;
    shown.forEach(({ block, cells }) => {
      if (block.kind === "added") {
        html += `<tr class="added"><td class="num">⁺</td>${wits.map((w) => `<td>${(block.addedBy || []).includes(w) ? "added cap." : ""}</td>`).join("")}</tr>`;
        return;
      }
      const base = M.romanToInt(block.numLabel);
      html += `<tr class="clickable" data-gob="${block.idx}"><td class="num">${esc(block.numLabel)}</td>${wits.map((w) => {
        const c = cells[w];
        if (!c) return `<td class="muted">=</td>`;
        const txt = c.map((r) => r.type === "omission" || !r.text ? "om." : r.text).join(" → ");
        const lastNum = M.romanToInt(c[0].text);
        const delta = !isNaN(lastNum) && !isNaN(base) && !block.isSubSeries && /^[IVXLC]+$/.test(block.numLabel) ? lastNum - base : NaN;
        return `<td>${esc(txt)}${!isNaN(delta) && delta ? ` <span class="delta">${delta > 0 ? "+" : ""}${delta}</span>` : ""}</td>`;
      }).join("")}</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  function anLayers() {
    const m = S.model;
    const { list, summary } = A.corrections(m);
    if (!list.length) return `<p class="muted">No corrective layers (<code>@varSeq</code>) recorded.</p>`;
    const hands = Array.from(new Set(Object.values(summary).flatMap((s) => Object.keys(s.byHand))));
    let html = `<h2>Corrections and textual layers</h2><p class="lead">Every passage where a witness has more than one textual layer (<code>@varSeq</code>), with the hand responsible and the way the correction was made (<code>@rend</code>). In EVT these layers were visible only one by one; here they can be read in sequence.</p>`;
    html += `<table class="mini"><thead><tr><th>witness</th><th>passages</th>${hands.map((h) => `<th>${esc(handLabel(h))}</th>`).join("")}<th>restore the text</th><th>false emendations</th></tr></thead><tbody>` +
      M.sortWits(m, Object.keys(summary)).map((w) => { const s = summary[w]; return `<tr><th>${witSpans([w])}</th><td class="n"><b>${s.total}</b></td>${hands.map((h) => `<td class="n">${s.byHand[h] || ""}</td>`).join("")}<td class="n">${s.restores || ""}</td><td class="n">${s.falseEm || ""}</td></tr>`; }).join("") + `</tbody></table>`;
    html += `<table class="data"><thead><tr><th>cap.</th><th>critical text</th><th>witness</th><th>layers</th></tr></thead><tbody>`;
    list.forEach(({ app, wit, layers }) => {
      const b = m.blocks[app.blockIdx];
      const chain = layers.map((r, i) => `<span class="lat">${r.type === "lem" ? esc(r.text || app.lem.text || "=") : r.text ? esc(r.text) : "om."}</span> <span class="muted">${esc([i === 0 ? "a.c." : "p.c.", r.hand ? handLabel(r.hand) : "", r.rend].filter(Boolean).join(", "))}</span>`).join(" → ");
      html += `<tr class="clickable" data-goapp="${app.id}"><td class="num">${esc(b.numLabel || M.label(b))}</td><td class="lat">${esc(app.lem.text || "⁺")}</td><td>${witSpans([wit])}</td><td>${chain}</td></tr>`;
    });
    html += `</tbody></table>`;
    return html;
  }

  /* ============================== INTRO ============================== */
  function renderIntro() {
    const m = S.model;
    const s = m.stats;
    const g = m.groups[0];
    const causes = Object.entries(s.causes).sort((a, b) => b[1] - a[1]);
    const types = Object.entries(s.types).sort((a, b) => b[1] - a[1]);
    $("#intro").innerHTML = `
      <h1>${esc(m.title)}</h1>
      ${m.edition ? `<p class="subtitle">${esc(m.edition)}${m.editor ? ` — edited by ${esc(m.editor)}` : ""}</p>` : ""}
      <div class="facts">
        <div><b>${s.chapters}</b><span>capitula</span></div>
        <div><b>${m.witnesses.length}</b><span>witnesses</span></div>
        <div><b>${s.apps}</b><span>apparatus entries</span></div>
        <div><b>${s.readings}</b><span>readings</span></div>
        <div><b>${s.layers}</b><span>correction layers</span></div>
        <div><b>${s.notes}</b><span>critical notes</span></div>
      </div>
      ${m.publicationHTML ? `<section>${m.publicationHTML}</section>` : ""}
      ${m.frontHTML ? `<h2>Introduction</h2><section>${m.frontHTML}</section>` : ""}
      <h2>How to read this edition</h2>
      <ul>
        <li><b>Critical text.</b> ${g ? `It reconstructs the form of the capitula at the origin of ${esc(g.name || g.label)} (${esc(g.label)}). <b class="emph-adiaph">Bold</b> marks adiaphoric readings characteristic of ${esc(g.label)}, <i class="emph-error">italics</i> errors; the small grey labels after them give the editor’s annotation (e.g. “${esc(g.label)} (adiaph.) vs Am1 Tu”).` : "The text shows the lemma of each apparatus entry."} A raised <span class="addmark">⁺</span> marks a point where some witnesses add text; <sup class="nmark">*</sup> a critical note.</li>
        <li><b>Apparatus.</b> Click any word: the right-hand panel lists all witnesses, the lemma included (positive apparatus). Witnesses that are lacunose at that point, or that have a different reading of a larger enclosing passage, are excluded from the lemma automatically. Groups are abbreviated (“${esc(g ? g.label : "Φ")} praeter …”).</li>
        <li><b>Corrections.</b> When a witness has several textual layers (<code>@varSeq</code>) they are shown as a sequence: <span class="lat">induo</span> <span class="muted">a.c.</span> → <span class="lat">induco</span> <span class="muted">p.c., hand uncertain, s.l.</span></li>
        <li><b>Witness view.</b> Choose “Witness” above the text to read any manuscript as first written or after correction, with deviations from the critical text underlined.</li>
        <li><b>Images.</b> Each capitulum lists the folios on which it is found in each witness; click to open the image beside the text.</li>
        <li><b>Analysis.</b> Profiles, agreement matrices, numbering and corrections are computed live from the encoding, so they update with the XML.</li>
      </ul>
      <h2>Classification of variants in this file</h2>
      <p>Following the working paper (<a href="https://zenodo.org/records/16761174" target="_blank" rel="noopener">Zenodo 16761174</a>), <code>@type</code> records the formal nature and extent of a variant, <code>@cause</code> its probable origin, <code>@subtype</code> the editor’s assessment (error / adiaphoric).</p>
      <div class="two">
        <table class="mini"><thead><tr><th>@type</th><th>n</th></tr></thead><tbody>${types.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`).join("")}</tbody></table>
        <table class="mini"><thead><tr><th>@cause</th><th>n</th></tr></thead><tbody>${causes.map(([k, n]) => `<tr><td>${esc(M.causeLabel(k))}</td><td class="n">${n}</td></tr>`).join("")}</tbody></table>
      </div>
      <h2>Bibliography</h2>
      <ul class="bibl">${Object.entries(m.bibl).map(([id, b]) => `<li><b>${esc(id.replace(/_/g, " "))}</b>: ${esc(b.author)}, <i>${esc(b.title)}</i>, ${esc(b.place)} ${esc(b.date)}</li>`).join("")}</ul>
      <h2>About this viewer</h2>
      <p>A dependency-free, client-side application (HTML, CSS and JavaScript only) designed for the capitula editions of the DOBiPS project and reusable for any TEI parallel-segmentation edition of capitula. It reads the TEI file directly — nothing is converted or stored on a server — and can be published on GitHub Pages together with the XML. It addresses some limits met with EVT 2 in critical-edition mode: corrective layers, positive apparatus with lacunose witnesses, text–image alignment by capitulum, and access to the classification of variants.</p>`;
    linkifyBible($("#intro"));
  }

  /* ============================== CHECK ============================== */
  function renderCheck() {
    const m = S.model;
    const order = { error: 0, warning: 1, info: 2 };
    const issues = m.issues.slice().sort((a, b) => order[a.level] - order[b.level]);
    const ic = m.issueCounts || {};
    let html = `<h2>Encoding check</h2>
      <p class="lead">Automatic consistency checks on <code>${esc(S.source)}</code>: references to witnesses and hands, vocabulary of <code>@type</code>/<code>@cause</code> against the working paper, explicit <code>lem/@wit</code> lists against the witnesses implied by the apparatus, correction layers, page breaks and dates. Nothing is changed in the file.</p>
      <div class="facts small"><div><b>${ic.error || 0}</b><span>errors</span></div><div><b>${ic.warning || 0}</b><span>warnings</span></div><div><b>${ic.info || 0}</b><span>notes</span></div></div>
      <p><button class="btn" id="checkImages">Check that all images load</button> <span id="imgResult" class="muted"></span></p>`;
    if (!issues.length) html += `<p>No problems found.</p>`;
    else {
      html += `<table class="data issues"><thead><tr><th>level</th><th>issue</th><th>where</th></tr></thead><tbody>`;
      issues.forEach((i) => {
        const b = findBlockFromWhere(i.where);
        html += `<tr class="lvl-${i.level}${b != null ? " clickable" : ""}" ${b != null ? `data-gob="${b}"` : ""}><td><span class="lvl">${i.level}</span></td><td>${esc(i.msg)}</td><td class="small">${esc(i.where)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
    $("#check").innerHTML = html;
    $$("#check [data-gob]").forEach((el) => el.addEventListener("click", () => goToBlock(+el.dataset.gob)));
    $("#checkImages").addEventListener("click", checkImages);
  }

  function findBlockFromWhere(where) {
    const m = S.model;
    const mm = String(where).match(/^(ch\. ([^\s—;]+)|incipit|explicit)/);
    if (!mm) return null;
    if (mm[0] === "incipit") return m.blocks.findIndex((b) => b.kind === "head");
    if (mm[0] === "explicit") return m.blocks.findIndex((b) => b.kind === "trailer");
    const i = m.blocks.findIndex((b) => b.numLabel === mm[2]);
    return i >= 0 ? i : null;
  }

  function checkImages() {
    const m = S.model;
    const out = $("#imgResult");
    const pages = m.pages;
    let done = 0;
    const bad = [];
    out.textContent = `checking ${pages.length} images…`;
    pages.forEach((p) => {
      const img = new Image();
      let fellBack = false;
      img.onload = () => { done++; finish(); };
      img.onerror = () => {
        if (!fellBack && p.facs !== p.file) { fellBack = true; img.src = imageUrl(p, true); bad.push({ p, fixed: true }); return; }
        if (fellBack) { const x = bad.find((b) => b.p === p); x.fixed = false; } else bad.push({ p, fixed: false });
        done++; finish();
      };
      img.src = imageUrl(p, false);
    });
    function finish() {
      if (done < pages.length) { out.textContent = `checked ${done}/${pages.length}…`; return; }
      const broken = bad.filter((b) => !b.fixed), moved = bad.filter((b) => b.fixed);
      out.innerHTML = broken.length || moved.length
        ? `${broken.length ? `<b>${broken.length} not found</b>: ${broken.map((b) => esc(b.p.file)).join(", ")}. ` : ""}${moved.length ? `${moved.length} found only at the base folder (not at the @facs path): ${moved.map((b) => esc(b.p.file)).join(", ")}.` : ""}`
        : `all ${pages.length} images load correctly.`;
    }
  }

  /* ============================== DATA ============================== */
  function renderData() {
    const m = S.model;
    $("#data").innerHTML = `
      <h2>Data and citation</h2>
      <p class="lead">Everything shown in the viewer is derived from the TEI file. These exports make the apparatus reusable in spreadsheets, R/Python or other tools.</p>
      <div class="exports">
        <button class="btn" id="exCsv">Apparatus as CSV</button>
        <button class="btn" id="exWit">Witness texts (TXT)</button>
        <button class="btn" id="exJson">Edition model (JSON)</button>
        <button class="btn" id="exIssues">Encoding report (TXT)</button>
        <button class="btn" id="exPrint">Print edition (text + apparatus)</button>
        <a class="btn" id="exXml" href="${esc(S.source)}" download>Source TEI/XML</a>
      </div>
      <h3>Source</h3>
      <p><code>${esc(S.source)}</code>${S.imageBase ? ` · images from <code>${esc(S.imageBase)}</code>` : ""}</p>
      <h3>Links to a passage</h3>
      <p>The address bar always points to the current capitulum, entry and witness (e.g. <code>#c=40&amp;app=a120</code>); copy it to cite or to put a link on a slide.</p>
      <h3>Reuse with another edition</h3>
      <p>Add the TEI file to <code>tei/</code> and an entry to <code>js/config.js</code>, or open any file with “Open XML…”, or pass it in the address: <code>?xml=tei/myfile.xml&amp;images=https://…/</code>.</p>`;
    $("#exCsv").addEventListener("click", exportCSV);
    $("#exWit").addEventListener("click", exportWitnesses);
    $("#exJson").addEventListener("click", exportJSON);
    $("#exIssues").addEventListener("click", () => download(edSlug() + "-encoding-report.txt", m.issues.map((i) => `[${i.level}] ${i.msg}${i.where ? "  — " + i.where : ""}`).join("\n")));
    $("#exPrint").addEventListener("click", printEdition);
    if (!S.edition) $("#exXml").removeAttribute("href");
  }

  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

  function exportCSV() {
    const m = S.model;
    const head = ["block", "chapter", "app_id", "depth", "lemma", "lemma_witnesses", "lemma_wit_explicit", "reading", "witnesses", "type", "subtype", "cause", "hand", "rend", "varSeq", "cert", "ana", "relation_note", "critical_note"];
    const rows = [head];
    m.apps.forEach((a) => {
      const b = m.blocks[a.blockIdx];
      const base = [b.idx, b.numLabel || M.label(b), a.id, a.depth, a.lem.text, a.lemWits.join(" "), a.lemWitsExplicit ? "yes" : "no"];
      const rel = a.rel ? a.rel.text : "";
      const note = a.notes.map((n) => n.html.replace(/<[^>]+>/g, "")).join(" | ");
      if (!a.readings.length) rows.push(base.concat(["", "", "", "", "", "", "", "", "", "", rel, note]));
      a.readings.forEach((r) => rows.push(base.concat([r.text, r.wits.join(" "), r.type, r.subtype, r.cause, r.hand, r.rend, r.varSeq ?? "", r.cert, r.ana, rel, note])));
    });
    download(edSlug() + "-apparatus.csv", "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportWitnesses() {
    const m = S.model;
    const strip = (h) => h.replace(/<span class="w-lacuna[^>]*>.*?<\/span>/g, "[lac.]").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    let out = `${m.title}\nWitness texts reconstructed from the apparatus (first hand / final state)\n`;
    m.witnesses.forEach((w) => {
      ["first", "final"].forEach((layer) => {
        out += `\n\n==== ${w.id} — ${shortShelf(w)} — ${layer === "first" ? "first hand" : "final state"} ====\n`;
        m.blocks.forEach((b) => {
          const r = M.witnessHTML(m, b, w.id, layer);
          if (b.kind === "added" && r.absent) return;
          out += `${strip(r.numHTML || "")}\t${r.absent ? "[lac.]" : strip(r.html)}\n`;
        });
      });
    });
    download(edSlug() + "-witnesses.txt", out);
  }

  function exportJSON() {
    const m = S.model;
    const data = {
      title: m.title, edition: m.edition, editor: m.editor, source: S.source,
      witnesses: m.witnesses.map((w) => { const o = Object.assign({}, w); delete o.descriptionHTML; return o; }),
      groups: m.groups, comparanda: m.comparanda,
      blocks: m.blocks.map((b) => ({ idx: b.idx, kind: b.kind, num: b.numLabel, text: b.plain, bibRefs: b.bibRefs, relNotes: b.relNotes.map((r) => ({ text: r.text, category: r.category, shared: r.shared, app: r.appId })), apps: b.apps })),
      apps: m.apps.map((a) => ({ id: a.id, block: a.blockIdx, parent: a.parentId, lemma: a.lem.text, lemmaWitnesses: a.lemWits, explicit: a.lemWitsExplicit, absent: Array.from(a.absent), readings: a.readings.map((r) => ({ text: r.text, wits: r.wits, type: r.type, subtype: r.subtype, cause: r.cause, hand: r.hand, rend: r.rend, varSeq: r.varSeq, cert: r.cert })) })),
      pages: m.pages, issues: m.issues
    };
    download(edSlug() + "-model.json", JSON.stringify(data, null, 1), "application/json");
  }

  function printEdition() {
    const m = S.model;
    const neg = (a) => {
      const parts = a.readings.filter((r) => !r.isLacuna).map((r) => `${r.text ? `<span class="lat">${r.html}</span>` : "om."} ${r.wits.join(" ")}${r.varSeq ? ` (${r.varSeq === 1 ? "a.c." : "p.c."})` : ""}`);
      if (!parts.length) return "";
      return `<span class="lat">${esc(a.lem.text || "add.")}</span>] ${parts.join("; ")}`;
    };
    let html = `<h1>${esc(m.title)}</h1><p>${esc(m.edition)}${m.editor ? " — ed. " + esc(m.editor) : ""}</p>`;
    m.blocks.forEach((b) => {
      const ents = b.apps.map((id) => neg(m.appById.get(id))).filter(Boolean);
      html += `<div class="pblock"><p class="ptext"><b>${esc(b.numLabel)}</b> ${b.kind === "added" ? "[capitulum added in " + esc((b.addedBy || []).join(" ")) + "]" : b.html.replace(/<span class="relmark[^>]*>.*?<\/span>/g, "").replace(/<sup[^>]*>.*?<\/sup>/g, "")}</p>${ents.length ? `<p class="papp">${ents.join(" &nbsp;‖&nbsp; ")}</p>` : ""}</div>`;
    });
    $("#printArea").innerHTML = html;
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => document.body.classList.remove("printing"), 500);
  }
})();
