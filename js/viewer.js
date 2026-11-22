/* =====================================================================
   Capitula Viewer — manuscript image viewer
   Docked beside the text; one or two panes (comparison); follows the
   selected capitulum; zoom/pan/rotate; image adjustments for faded
   rubrics; filmstrip; full screen; resizable.
   ===================================================================== */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("capv." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("capv." + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  function create(ctx) {
    const root = $("#viewer");
    const V = {
      open: false, follow: store.get("follow", true), compare: false,
      adj: { brightness: 100, contrast: 100, gray: false, invert: false },
      panes: []
    };

    root.innerHTML = `
      <div class="vresize" title="Drag to resize"></div>
      <div class="vtop">
        <span class="vtitle">Images</span>
        <label class="vtoggle" title="Turn the page automatically when you move to another capitulum"><input type="checkbox" id="vFollow"> follow the text</label>
        <label class="vtoggle" title="Show two witnesses side by side"><input type="checkbox" id="vCompare"> compare</label>
        <details class="vadj"><summary title="Brightness, contrast…">adjust</summary>
          <div class="vadj-body">
            <label>brightness <input type="range" id="vBright" min="40" max="220" value="100"></label>
            <label>contrast <input type="range" id="vContr" min="40" max="300" value="100"></label>
            <label><input type="checkbox" id="vGray"> greyscale</label>
            <label><input type="checkbox" id="vInv"> invert (negative)</label>
            <button class="vbtn" id="vReset">reset</button>
          </div></details>
        <span class="vspacer"></span>
        <button class="vbtn icon" id="vFull" title="Full screen">⛶</button>
        <button class="vbtn icon" id="vClose" title="Close (Esc)">×</button>
      </div>
      <div class="vpanes" id="vPanes"></div>`;

    const panesBox = $("#vPanes", root);
    V.panes = [makePane(0), makePane(1)];
    V.panes[1].el.hidden = true;

    $("#vFollow", root).checked = V.follow;
    $("#vFollow", root).addEventListener("change", (e) => { V.follow = e.target.checked; store.set("follow", V.follow); if (V.follow) followBlock(); });
    $("#vCompare", root).addEventListener("change", (e) => setCompare(e.target.checked));
    const adj = () => {
      V.adj.brightness = +$("#vBright", root).value; V.adj.contrast = +$("#vContr", root).value;
      V.adj.gray = $("#vGray", root).checked; V.adj.invert = $("#vInv", root).checked;
      V.panes.forEach(applyFilter);
    };
    ["#vBright", "#vContr", "#vGray", "#vInv"].forEach((id) => $(id, root).addEventListener("input", adj));
    $("#vReset", root).addEventListener("click", () => { $("#vBright", root).value = 100; $("#vContr", root).value = 100; $("#vGray", root).checked = false; $("#vInv", root).checked = false; adj(); });
    $("#vClose", root).addEventListener("click", close);
    $("#vFull", root).addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    });
    document.addEventListener("fullscreenchange", () => setTimeout(() => V.panes.forEach((p) => p.wit && fit(p)), 120));

    // resizable width
    const w0 = store.get("width", 0);
    if (w0) root.style.width = w0 + "px";
    const handle = $(".vresize", root);
    handle.addEventListener("pointerdown", (e) => {
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const w = Math.max(320, Math.min(window.innerWidth - 240, window.innerWidth - ev.clientX));
        root.style.width = w + "px";
        syncWidth();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up);
        store.set("width", root.offsetWidth); syncWidth(); V.panes.forEach((p) => p.wit && fit(p));
      };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
    });
    window.addEventListener("resize", () => { if (V.open) syncWidth(); if (V.open) V.panes.forEach((p) => p.wit && !p.el.hidden && fit(p)); });

    root.addEventListener("keydown", (e) => {
      if (e.target.matches("select, input")) return;
      const p = V.active || V.panes[0];
      const k = e.key;
      if (k === "+" || k === "=") zoom(p, 1.25);
      else if (k === "-") zoom(p, 0.8);
      else if (k === "0") fit(p);
      else if (k === "PageDown" || k === "]") stepPage(p, 1);
      else if (k === "PageUp" || k === "[") stepPage(p, -1);
      else if (k === "r") { p.rot = (p.rot + 90) % 360; fit(p); }
      else if (k === "Escape") close();
      else return; // arrows etc. go on to the edition (chapter navigation)
      e.preventDefault();
      e.stopPropagation();
    });

    /* ---------------------------- panes ---------------------------- */
    function makePane(i) {
      const el = document.createElement("section");
      el.className = "vpane";
      el.tabIndex = 0;
      el.innerHTML = `
        <div class="vbar">
          <select class="vwit" aria-label="Witness"></select>
          <button class="vbtn icon vprev" title="Previous page ([)">‹</button>
          <select class="vpage" aria-label="Page"></select>
          <button class="vbtn icon vnext" title="Next page (])">›</button>
          <span class="vspacer"></span>
          <button class="vbtn icon vzo" title="Zoom out (−)">−</button>
          <button class="vbtn vfit" title="Fit (0)">fit</button>
          <button class="vbtn icon vzi" title="Zoom in (+)">+</button>
          <button class="vbtn icon vrot" title="Rotate (r)">↻</button>
        </div>
        <div class="vstage">
          <img alt="" draggable="false">
          <div class="vspin" hidden></div>
          <div class="vmsg" hidden></div>
          <div class="vcap"></div>
          <div class="vzoom"></div>
        </div>
        <div class="vfoot"><div class="vstrip"></div><div class="vlinks"></div></div>`;
      panesBox.appendChild(el);
      const p = { i, el, wit: "", page: "", zoom: 1, x: 0, y: 0, rot: 0, triedFallback: false,
        img: $("img", el), stage: $(".vstage", el) };
      $(".vwit", el).addEventListener("change", (e) => showWitness(p, e.target.value));
      $(".vpage", el).addEventListener("change", (e) => show(p, p.wit, e.target.value));
      $(".vprev", el).addEventListener("click", () => stepPage(p, -1));
      $(".vnext", el).addEventListener("click", () => stepPage(p, 1));
      $(".vzi", el).addEventListener("click", () => zoom(p, 1.25));
      $(".vzo", el).addEventListener("click", () => zoom(p, 0.8));
      $(".vfit", el).addEventListener("click", () => fit(p));
      $(".vrot", el).addEventListener("click", () => { p.rot = (p.rot + 90) % 360; fit(p); });
      el.addEventListener("pointerdown", () => { V.active = p; });
      p.stage.addEventListener("wheel", (e) => { e.preventDefault(); zoom(p, e.deltaY < 0 ? 1.12 : 0.89, e); }, { passive: false });
      p.stage.addEventListener("dblclick", (e) => zoom(p, 2, e));
      let drag = null;
      p.stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, ox: p.x, oy: p.y }; p.stage.setPointerCapture(e.pointerId); p.stage.classList.add("dragging"); });
      p.stage.addEventListener("pointermove", (e) => { if (!drag) return; p.x = drag.ox + e.clientX - drag.x; p.y = drag.oy + e.clientY - drag.y; transform(p); });
      const end = () => { drag = null; p.stage.classList.remove("dragging"); };
      p.stage.addEventListener("pointerup", end);
      p.stage.addEventListener("pointercancel", end);
      p.img.addEventListener("load", () => { $(".vspin", el).hidden = true; $(".vmsg", el).hidden = true; fit(p); });
      p.img.addEventListener("error", () => onError(p));
      $(".vstrip", el).addEventListener("click", (e) => { const t = e.target.closest("[data-page]"); if (t) show(p, p.wit, t.dataset.page); });
      return p;
    }

    function witsWithPages() {
      const m = ctx.model();
      return m.witnesses.filter((w) => ctx.pagesOf(w.id).length);
    }

    function showWitness(p, wit) {
      const b = ctx.block();
      const pid = b ? pageForBlock(wit, b) : null;
      show(p, wit, pid || (ctx.pagesOf(wit)[0] || {}).id);
    }

    function pageForBlock(wit, b) {
      if (!b) return null;
      if (b.absent && b.absent.has(wit)) return null;
      const inner = b.pageBreaks.map((id) => ctx.page(id)).find((pg) => pg && pg.wit === wit);
      return b.pageStarts[wit] || (inner && inner.id) || null;
    }

    function show(p, wit, pageId) {
      const m = ctx.model();
      const pages = ctx.pagesOf(wit);
      const pg = pages.find((x) => x.id === pageId) || pages[0];
      if (!pg) return;
      const sameImage = p.wit === wit && p.page === pg.id;
      p.wit = wit; p.page = pg.id; p.triedFallback = false;
      $(".vwit", p.el).innerHTML = witsWithPages().map((w) => `<option value="${esc(w.id)}"${w.id === wit ? " selected" : ""}>${esc(w.id)}</option>`).join("");
      $(".vpage", p.el).innerHTML = pages.map((x) => `<option value="${esc(x.id)}"${x.id === pg.id ? " selected" : ""}>${esc(x.label || x.file)}</option>`).join("");
      const idx = pages.indexOf(pg);
      $(".vprev", p.el).disabled = idx <= 0;
      $(".vnext", p.el).disabled = idx >= pages.length - 1;
      // filmstrip
      $(".vstrip", p.el).innerHTML = pages.map((x) => `<button class="vthumb${x.id === pg.id ? " cur" : ""}" data-page="${esc(x.id)}" title="${esc(x.label)}"><img loading="lazy" src="${esc(ctx.imageUrl(x, false))}" alt="" onerror="this.onerror=null;this.src='${esc(ctx.imageUrl(x, true))}'"><span>${esc(x.label)}</span></button>`).join("");
      // external links
      const w = m.witById.get(wit);
      const links = (w && w.links) || [];
      const fac = links.find((l) => /facsimile/i.test(l.type));
      const man = links.find((l) => /IIIF/i.test(l.type));
      const manUrl = man && /manifest/i.test(man.url) && !/[#?]manifest=/.test(man.url) ? man.url : "";
      $(".vlinks", p.el).innerHTML = [
        fac ? `<a href="${esc(fac.url)}" target="_blank" rel="noopener">full facsimile ↗</a>` : "",
        manUrl ? `<a href="https://projectmirador.org/embed/?iiif-content=${encodeURIComponent(manUrl)}" target="_blank" rel="noopener" title="Open the whole codex in Mirador (IIIF)">Mirador ↗</a>` : "",
        man ? `<a href="${esc(man.url)}" target="_blank" rel="noopener">IIIF</a>` : ""
      ].filter(Boolean).join(" · ");
      caption(p);
      if (sameImage && p.img.naturalWidth) return;
      p.rot = 0;
      $(".vmsg", p.el).hidden = true;
      $(".vspin", p.el).hidden = false;
      p.img.alt = `${wit} ${pg.label}`;
      p.img.src = ctx.imageUrl(pg, false);
    }

    function caption(p) {
      const m = ctx.model();
      const pg = ctx.page(p.page);
      const w = m.witById.get(p.wit);
      const b = ctx.block();
      let txt = `<b>${esc(p.wit)}</b> ${esc(pg ? pg.label : "")}`;
      if (w && w.kind === "ms") txt += ` <span>· ${esc([w.settlement, w.idno].filter(Boolean).join(", "))}</span>`;
      if (b) {
        const here = pageForBlock(p.wit, b);
        const lab = ctx.blockLabel(b);
        if (b.absent && b.absent.has(p.wit)) txt += `<br><span class="vwarn">${esc(lab)}: lacuna in ${esc(p.wit)}</span>`;
        else if (here === p.page) txt += `<br><span>${esc(lab)} is on this page</span>`;
        else if (here) txt += `<br><span class="vwarn">${esc(lab)} is on ${esc((ctx.page(here) || {}).label || "another page")}</span>`;
      }
      $(".vcap", p.el).innerHTML = txt;
    }

    function onError(p) {
      const m = ctx.model();
      const pg = ctx.page(p.page);
      if (!pg) return;
      if (!p.triedFallback && pg.facs !== pg.file) { p.triedFallback = true; p.img.src = ctx.imageUrl(pg, true); return; }
      $(".vspin", p.el).hidden = true;
      const w = m.witById.get(pg.wit);
      const fac = ((w && w.links) || []).find((l) => /facsimile/i.test(l.type));
      const msg = $(".vmsg", p.el);
      msg.hidden = false;
      msg.innerHTML = `Image not available: <code>${esc(ctx.imageUrl(pg, false))}</code>` +
        (fac ? `<br>Open the <a href="${esc(fac.url)}" target="_blank" rel="noopener">digital facsimile</a> at ${esc(pg.label)}.` : "");
    }

    function stepPage(p, d) {
      const pages = ctx.pagesOf(p.wit);
      const i = pages.findIndex((x) => x.id === p.page);
      if (pages[i + d]) show(p, p.wit, pages[i + d].id);
    }

    /* ------------------------- geometry ------------------------- */
    function dims(p) {
      const r = p.rot % 180 !== 0;
      return { w: r ? p.img.naturalHeight : p.img.naturalWidth, h: r ? p.img.naturalWidth : p.img.naturalHeight };
    }
    function fit(p) {
      if (!p.img.naturalWidth) return;
      const d = dims(p);
      const sw = p.stage.clientWidth, sh = p.stage.clientHeight;
      p.zoom = Math.min(sw / d.w, sh / d.h) * 0.98;
      p.x = (sw - d.w * p.zoom) / 2;
      p.y = (sh - d.h * p.zoom) / 2;
      transform(p);
    }
    function zoom(p, f, e) {
      if (!p.img.naturalWidth) return;
      const r = p.stage.getBoundingClientRect();
      const cx = e ? e.clientX - r.left : p.stage.clientWidth / 2;
      const cy = e ? e.clientY - r.top : p.stage.clientHeight / 2;
      const z = Math.max(0.03, Math.min(10, p.zoom * f));
      const k = z / p.zoom;
      p.x = cx - (cx - p.x) * k; p.y = cy - (cy - p.y) * k; p.zoom = z;
      transform(p);
    }
    function transform(p) {
      const nw = p.img.naturalWidth, nh = p.img.naturalHeight;
      // rotate around the image centre, then place the rotated bounding box at (x, y)
      const d = dims(p);
      const tx = p.x + (d.w * p.zoom) / 2, ty = p.y + (d.h * p.zoom) / 2;
      p.img.style.transform = `translate(${tx}px, ${ty}px) rotate(${p.rot}deg) scale(${p.zoom}) translate(${-nw / 2}px, ${-nh / 2}px)`;
      const zl = $(".vzoom", p.el);
      zl.textContent = Math.round(p.zoom * 100) + "%";
      applyFilter(p);
    }
    function applyFilter(p) {
      const a = V.adj;
      p.img.style.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%)${a.gray ? " grayscale(1)" : ""}${a.invert ? " invert(1)" : ""}`;
    }

    /* --------------------------- public --------------------------- */
    function setCompare(on) {
      V.compare = on;
      $("#vCompare", root).checked = on;
      root.classList.toggle("comparing", on);
      V.panes[1].el.hidden = !on;
      if (on && !V.panes[1].wit) {
        const m = ctx.model();
        const first = V.panes[0].wit;
        const cand = witsWithPages().map((w) => w.id).filter((w) => w !== first);
        const b = ctx.block();
        const pref = (m.comparanda.includes(first) ? cand.filter((w) => !m.comparanda.includes(w)) : cand.filter((w) => m.comparanda.includes(w)))
          .concat(cand).find((w) => !b || pageForBlock(w, b));
        if (pref) showWitness(V.panes[1], pref);
      }
      setTimeout(() => V.panes.forEach((p) => p.wit && !p.el.hidden && fit(p)), 50);
    }

    function syncWidth() { document.documentElement.style.setProperty("--vw", root.offsetWidth + "px"); }

    function openAt(wit, pageId) {
      V.open = true;
      root.hidden = false;
      syncWidth();
      document.body.classList.add("viewer-open");
      show(V.panes[0], wit, pageId);
      V.active = V.panes[0];
      setTimeout(() => V.panes.forEach((p) => p.wit && !p.el.hidden && fit(p)), 30);
      V.panes[0].el.focus({ preventScroll: true });
    }

    function followBlock() {
      if (!V.open) return;
      const b = ctx.block();
      V.panes.forEach((p) => {
        if (!p.wit || p.el.hidden) return;
        const pid = V.follow ? pageForBlock(p.wit, b) : null;
        if (pid && pid !== p.page) show(p, p.wit, pid);
        else caption(p);
      });
    }

    function close() {
      V.open = false;
      root.hidden = true;
      document.body.classList.remove("viewer-open");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }

    function reset() { V.panes.forEach((p) => { p.wit = ""; p.page = ""; p.img.removeAttribute("src"); }); setCompare(false); close(); }

    return { openAt, followBlock, close, reset, isOpen: () => V.open, setCompare };
  }

  window.CapitulaViewer = { create };
})();
