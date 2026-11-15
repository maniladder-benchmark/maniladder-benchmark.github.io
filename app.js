(function () {
  "use strict";

  const TASKS = Array.isArray(window.MANILADDER_TASKS) ? window.MANILADDER_TASKS : [];
  const VIDEO_STATUS = window.MANILADDER_VIDEO_STATUS || {};
  const TASK_SCORES = window.MANILADDER_TASK_SCORES || {};
  const LEADERBOARD = window.MANILADDER_LEADERBOARD || { models: [] };
  const EXPERIMENTS = window.MANILADDER_EXPERIMENTS || {};

  const SVGNS = "http://www.w3.org/2000/svg";
  const LEVEL_NAMES = { 1: "Easy", 2: "Medium", 3: "Hard", 4: "Unsolved" };
  const LEVEL_VARS = { 1: "var(--l1)", 2: "var(--l2)", 3: "var(--l3)", 4: "var(--l4)" };
  const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const EMBODIMENT_SHORT = {
    single_arm_gripper: "SG", single_arm_dex: "SX", dual_arm_gripper: "DG", dual_arm_dex: "DX",
  };
  const EMBODIMENT_LONG = {
    single_arm_gripper: "Single-arm gripper", single_arm_dex: "Single-arm dex hand",
    dual_arm_gripper: "Dual-arm gripper", dual_arm_dex: "Dual-arm dex hand",
  };
  const EMBODIMENT_ORDER = ["single_arm_gripper", "single_arm_dex", "dual_arm_gripper", "dual_arm_dex"];

  /* ───────────── helpers ───────────── */
  function setStyle(node, styles) {
    for (const [k, v] of Object.entries(styles)) {
      if (k.startsWith("--")) node.style.setProperty(k, v);
      else node.style[k] = v;
    }
  }
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") setStyle(node, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
    return node;
  }
  function svg(tag, attrs, ...children) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined) continue;
      if (k === "text") node.textContent = v;
      else if (k === "style" && typeof v === "object") setStyle(node, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c) node.append(c);
    return node;
  }
  const pct = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(d)}%`);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ───────────── tooltip ───────────── */
  const tip = document.getElementById("tooltip");
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    if (tip.hidden || !evt) return;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  function hideTip() { tip.hidden = true; }
  document.addEventListener("scroll", hideTip, { passive: true });

  /* ───────────── reveal on scroll ───────────── */
  const revealer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        e.target.dispatchEvent(new CustomEvent("revealed"));
        revealer.unobserve(e.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((n) => revealer.observe(n));

  /* ───────────── hero wall: a periodic grid of task clips drifting to the bottom-right ─────────────
     videos/hero/wall.mp4 is a 12 x 9 grid whose right edge continues into its left edge and whose
     bottom continues into its top, so copies tiled edge to edge form an endless wall. */
  function initHeroWall() {
    const hero = document.querySelector(".hero");
    const video = document.getElementById("wall-video");
    const canvas = document.getElementById("wall-canvas");
    const ctx = canvas.getContext && canvas.getContext("2d", { alpha: false });
    if (!hero || !video || !ctx) return;

    const COLS = 12;                 // tiles per wall row (see tools/build_media.py)
    const TILT = (-5 * Math.PI) / 180;
    const DRIFT = { x: 0.12, y: 0.07 }; // tiles per second
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const poster = new Image();
    poster.src = "assets/hero/wall.jpg";

    let w = 0, h = 0, dpr = 1, cell = 200, wallW = 1, wallH = 1;
    let visible = true, raf = 0;
    const t0 = performance.now() - 40000; // start mid-drift rather than at the wall's corner

    function resize() {
      const r = hero.getBoundingClientRect();
      w = r.width; h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cell = Math.min(240, Math.max(112, w / 7.5));
      wallW = cell * COLS;
      wallH = wallW * ((video.videoHeight || 1386) / (video.videoWidth || 2448));
      draw(performance.now());
    }

    function source() {
      if (video.readyState >= 2) return video;
      if (poster.complete && poster.naturalWidth) return poster;
      return null;
    }

    function draw(now) {
      const src = source();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05060b";
      ctx.fillRect(0, 0, w, h);
      if (!src) return;
      const t = reduceMotion ? 0 : (now - t0) / 1000;
      const ox = (t * DRIFT.x * cell) % wallW;
      const oy = (t * DRIFT.y * cell) % wallH;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(TILT);
      const R = Math.hypot(w, h) / 2 + 2; // radius that still covers the hero after the tilt
      const x0 = ox - wallW * Math.ceil((ox + R) / wallW);
      const y0 = oy - wallH * Math.ceil((oy + R) / wallH);
      for (let y = y0; y < R; y += wallH) {
        for (let x = x0; x < R; x += wallW) ctx.drawImage(src, x, y, wallW + 0.6, wallH + 0.6);
      }
      if (!canvas.classList.contains("live")) canvas.classList.add("live");
    }

    function loop(now) {
      draw(now);
      raf = visible && !reduceMotion ? requestAnimationFrame(loop) : 0;
    }
    function start() {
      if (!reduceMotion) video.play().catch(() => {});
      if (!raf) raf = requestAnimationFrame(loop);
    }

    video.muted = true;
    video.addEventListener("loadedmetadata", resize);
    video.addEventListener("loadeddata", () => draw(performance.now()));
    poster.addEventListener("load", () => draw(performance.now()));
    new ResizeObserver(resize).observe(hero);
    new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (visible) start();
        else video.pause();
      }
    }).observe(hero);
    resize();
  }

  /* "Watch overview" scrolls to the video and starts it (the click counts as a user gesture) */
  const intro = document.getElementById("intro-video");
  document.getElementById("watch-overview")?.addEventListener("click", () => {
    if (intro && intro.paused) intro.play().catch(() => {});
  });

  function toItem(t) {
    const emb = t.embodiment || "";
    return {
      ...t,
      robot: emb.startsWith("dual") ? "dual" : "single",
      hand: emb.endsWith("dex") ? "dex" : "gripper",
      object: t.domain === "deformable" ? "deformable" : "rigid",
      name: shortName(t),
      video: videoFor(t),
      scores: TASK_SCORES[t.env_id] || null, // { fm, pi05, astra }, paper Fig. 4
    };
  }
  const TASK_ITEMS = TASKS.map(toItem);

  /* ───────────── overview: a 3D task matrix — level × suite × task ───────────── */
  // Rows are difficulty levels, columns the eight suites (embodiment × object, as in the paper's Fig. 1),
  // and the depth axis is the suite's own tasks: each suite is a deck of task cards receding up and to the right.
  // Hovering (or tapping) a suite fans its deck out into a tray; a card opens that task's rollout.
  function initMatrix() {
    const host = document.getElementById("mx");
    if (!host) return;
    const EMB = [
      { key: "single_arm_gripper", arm: "single", ee: "gripper", top: "Single-arm", name: "Gripper", icons: ["ee-gripper"] },
      { key: "single_arm_dex", arm: "single", ee: "dex", top: "Single-arm", name: "Dexterous hand", icons: ["ee-dex"] },
      { key: "dual_arm_gripper", arm: "dual", ee: "gripper", top: "Dual-arm", name: "Grippers", icons: ["ee-gripper", "ee-gripper"] },
      { key: "dual_arm_dex", arm: "dual", ee: "dex", top: "Dual-arm", name: "Dexterous hands", icons: ["ee-dex", "ee-dex"] },
    ];
    const OBJ = [{ key: "rigid", name: "Rigid", icon: "obj-rigid" }, { key: "deformable", name: "Deformable", icon: "obj-deform" }];
    // calibrated difficulty bands (paper, Sec. III-B): best success rate of the reference flow-matching
    // policy (20 demos, 40k steps, 50 eval episodes) on every task of the level
    const TARGET = { 1: "60–100%", 2: "24–58%", 3: "6–22%", 4: "0–4%" };
    const COLS = EMB.flatMap((emb) => OBJ.map((obj) => ({ emb, obj })));
    const suiteKey = (level, emb, obj) => `${level}|${emb}|${obj}`;
    const suites = new Map();
    for (const t of TASK_ITEMS) {
      const k = suiteKey(t.level, t.embodiment, t.object);
      if (!suites.has(k)) suites.set(k, []);
      suites.get(k).push(t);
    }
    for (const list of suites.values()) list.sort((a, b) => (!!b.video - !!a.video) || a.name.localeCompare(b.name));
    host.style.setProperty("--nmax", String(Math.max(1, ...[...suites.values()].map((l) => l.length))));

    const ico = (name, cls) => el("img", { class: cls, src: `assets/icons/${name}.png`, alt: "", width: 192, height: 192, decoding: "async" });
    const nodes = [];   // everything that takes part in focus highlighting
    const cells = [];
    const add = (node, keys) => { Object.assign(node.dataset, keys); nodes.push(node); host.append(node); return node; };

    // corner: the three axes of the matrix
    const g = svg("linearGradient", { id: "mx-lv-grad", gradientUnits: "userSpaceOnUse", x1: "14", y1: "80", x2: "14", y2: "12" },
      svg("stop", { offset: "0", "stop-color": "#2ee6c8" }), svg("stop", { offset: "0.4", "stop-color": "#5ca0ff" }),
      svg("stop", { offset: "0.7", "stop-color": "#a47dff" }), svg("stop", { offset: "1", "stop-color": "#ff7a3d" }));
    const head = (x, y, ang, color) => svg("path", { d: "M0 0 L-7 -3.6 L-7 3.6 Z", fill: color, transform: `translate(${x} ${y}) rotate(${ang})` });
    const label = (x, y, text, anchor, color) => svg("text", { x, y, "text-anchor": anchor, fill: color, class: "mx-ax-t", text });
    host.append(el("div", { class: "mx-axes", style: { gridRow: "1 / 3", gridColumn: "1" }, "aria-hidden": "true" },
      svg("svg", { viewBox: "0 0 112 96", width: "112", height: "96" }, svg("defs", {}, g),
        svg("line", { x1: 14, y1: 80, x2: 14, y2: 16, stroke: "url(#mx-lv-grad)", "stroke-width": 2 }), head(14, 12, -90, "#ff7a3d"),
        svg("line", { x1: 14, y1: 80, x2: 92, y2: 80, stroke: "#5ca0ff", "stroke-width": 2 }), head(97, 80, 0, "#5ca0ff"),
        svg("line", { x1: 14, y1: 80, x2: 44, y2: 55, stroke: "#ff8038", "stroke-width": 2 }), head(48, 51.7, -39.8, "#ff8038"),
        svg("circle", { cx: 14, cy: 80, r: 3, fill: "#e8ecff" }),
        label(21, 15, "Level", "start", "#c9d0ea"), label(104, 94, "Suite", "end", "#c9d0ea"), label(52, 49, "Tasks", "start", "#c9d0ea"))));

    // header tier 1: embodiment, with one or two end-effectors as its logo
    EMB.forEach((e, i) => add(el("div", {
      class: "mx-g", tabindex: 0, title: `${e.top} ${e.name.toLowerCase()}: show these tasks in the gallery`,
      style: { gridRow: "1", gridColumn: `${2 + i * 2} / span 2` },
    }, el("span", { class: `mx-g-ico ${e.arm}` }, e.icons.map((n, k) => ico(n, k ? "flip" : ""))),
      el("strong", { text: `${e.top} ${e.name.toLowerCase()}` })), { emb: e.key }));
    // header tier 2: object type
    COLS.forEach((c, k) => add(el("div", {
      class: "mx-o", tabindex: 0, title: `${c.emb.top} ${c.emb.name.toLowerCase()} · ${c.obj.name}`,
      style: { gridRow: "2", gridColumn: `${2 + k}` },
    }, ico(c.obj.icon, ""), el("span", { text: c.obj.name })), { emb: c.emb.key, obj: c.obj.key }));

    // rows: ladder rungs + one deck per suite
    [4, 3, 2, 1].forEach((level, r) => {
      add(el("div", { class: "mx-rung", tabindex: 0, title: `Level ${level}: the reference policy's success rate on each task lies in ${TARGET[level]}`, style: { gridRow: `${3 + r}`, gridColumn: "1", "--lv": LEVEL_VARS[level] } },
        el("b", { text: `L${level}` }), el("span", { text: LEVEL_NAMES[level] }), el("i", { text: TARGET[level] })), { level: String(level) });
      COLS.forEach((c, k) => {
        const list = suites.get(suiteKey(level, c.emb.key, c.obj.key)) || [];
        const cards = list.map((t, j) => el("button", {
          class: "mx-card", type: "button", tabindex: -1,
          style: { "--k": String(j), "--d": `${(3 - r) * 90 + k * 34 + j * 75}ms` },
          "aria-label": t.video ? `${t.display_name}: watch the rollout` : `${t.display_name} (no video yet)`,
        }, t.video
          ? el("img", { src: `assets/thumbs/${t.env_id}.webp`, alt: "", loading: "lazy", decoding: "async", width: 320, height: 240 })
          : el("i", { class: "mx-card-none" }),
        el("span", { text: t.name })));
        const cell = el("div", {
          class: "mx-cell", tabindex: 0, role: "group", "aria-expanded": "false",
          style: { gridRow: `${3 + r}`, gridColumn: `${2 + k}`, "--lv": LEVEL_VARS[level] },
          "aria-label": `Level ${level} (${LEVEL_NAMES[level]}), ${EMBODIMENT_LONG[c.emb.key]}, ${c.obj.name.toLowerCase()} objects: ${list.length} tasks`,
        }, el("div", { class: "mx-deck" }, cards));
        Object.assign(cell, { _tasks: list, _cards: cards, _deck: cell.firstChild, _suite: { level, emb: c.emb, obj: c.obj } });
        add(cell, { level: String(level), emb: c.emb.key, obj: c.obj.key });
        cells.push(cell);
      });
    });

    // ── focus: a partial {level, emb, obj}; elements that agree light up, the rest dim ──
    const KEYS = ["level", "emb", "obj"];
    function setFocus(f) {
      host.classList.toggle("has-focus", !!f);
      for (const n of nodes) {
        let shared = 0, clash = false;
        for (const k of KEYS) {
          if (!f || !f[k] || !n.dataset[k]) continue;
          shared++;
          if (n.dataset[k] !== String(f[k])) clash = true;
        }
        n.classList.toggle("on", shared > 0 && !clash);
        n.classList.toggle("off", clash);
      }
    }
    function openSuite(f) {
      const e = EMB.find((x) => x.key === f.emb);
      document.dispatchEvent(new CustomEvent("ml:filter", { detail: {
        level: f.level ? String(f.level) : "all", robot: e ? e.arm : "all", hand: e ? e.ee : "all", object: f.obj || "all" } }));
    }

    // ── the fan-out tray ──
    const trayHead = el("div", { class: "mx-tray-head" });
    const tray = el("div", { class: "mx-tray", "aria-hidden": "true" }, trayHead);
    let openCell = null;
    function layoutFan(cell) {
      const cards = cell._cards, n = cards.length;
      if (!n) return;
      const hostR = host.getBoundingClientRect(), cellR = cell.getBoundingClientRect();
      const cw = cards[0].offsetWidth;
      const pad = 12, gap = 10, top = 34;
      const avail = Math.min(hostR.width + 8, window.innerWidth - 16);
      let perRow = n, fw;
      for (;;) {
        fw = Math.min(176, (avail - 2 * pad - (perRow - 1) * gap) / perRow);
        if (fw >= 104 || perRow <= 2) break;
        perRow = Math.ceil(perRow / 2);
      }
      const rows = Math.ceil(n / perRow), fh = fw * 0.75, s = fw / cw;
      const w = perRow * fw + (perRow - 1) * gap + 2 * pad;
      const h = top + rows * fh + (rows - 1) * gap + pad;
      const minL = Math.max(hostR.left - 4, 8), maxL = Math.min(hostR.right + 4, window.innerWidth - 8) - w;
      const left = Math.max(minL, Math.min(maxL, cellR.left + cellR.width / 2 - w / 2));
      const tTop = Math.max(hostR.top - 36, Math.min(hostR.bottom + 24 - h, cellR.top + cellR.height / 2 - h / 2));
      const tx = left - cellR.left, ty = tTop - cellR.top;
      Object.assign(tray.style, { left: `${tx}px`, top: `${ty}px`, width: `${w}px`, height: `${h}px` });
      const deck = cell._deck;
      cards.forEach((card, i) => {
        const bx = deck.offsetLeft + card.offsetLeft, by = deck.offsetTop + card.offsetTop;
        const col = i % perRow, row = Math.floor(i / perRow);
        card.style.setProperty("--fx", `${tx + pad + col * (fw + gap) - bx}px`);
        card.style.setProperty("--fy", `${ty + top + row * (fh + gap) - by}px`);
        card.style.setProperty("--fs", s.toFixed(4));
      });
    }
    function open(cell) {
      if (openCell === cell) return;
      close();
      if (!cell._tasks.length) return;
      openCell = cell;
      const { level, emb, obj } = cell._suite;
      trayHead.replaceChildren(
        el("b", { class: "mx-tray-lv", text: `L${level} · ${LEVEL_NAMES[level]}` }),
        el("strong", { text: `${EMBODIMENT_LONG[emb.key]} · ${obj.name}` }),
        el("span", { class: "mx-tray-n", text: `${cell._tasks.length} tasks` }),
        el("button", { class: "mx-tray-go", type: "button", text: "Gallery →",
          onclick: (e) => { e.stopPropagation(); openSuite({ level, emb: emb.key, obj: obj.key }); } }));
      cell.prepend(tray);
      layoutFan(cell);
      tray.getBoundingClientRect(); // commit the start state before animating
      cell.classList.add("open");
      cell.setAttribute("aria-expanded", "true");
      cell._cards.forEach((c) => c.setAttribute("tabindex", "0"));
      setFocus({ level: String(level), emb: emb.key, obj: obj.key });
    }
    function close() {
      if (!openCell) return;
      openCell.classList.remove("open");
      openCell.setAttribute("aria-expanded", "false");
      openCell._cards.forEach((c) => c.setAttribute("tabindex", "-1"));
      openCell = null;
      setFocus(null);
    }

    // ── interaction ──
    let interacted = false, openT = 0, closeT = 0;
    const touch = window.matchMedia("(hover: none)").matches;
    host.addEventListener("pointerenter", () => { interacted = true; });
    for (const cell of cells) {
      cell.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(closeT); clearTimeout(openT);
        openT = setTimeout(() => open(cell), openCell ? 0 : 70);
      });
      cell.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(openT);
        closeT = setTimeout(() => { if (openCell === cell) close(); }, 160);
      });
      cell.addEventListener("click", (e) => {
        interacted = true;
        if (openCell !== cell) { open(cell); return; }      // first tap on touch screens opens the deck
        const card = e.target.closest(".mx-card");
        if (!card) return;
        const t = cell._tasks[cell._cards.indexOf(card)];
        if (t.video) openViewer(t);
        else openSuite({ level: cell._suite.level, emb: cell._suite.emb.key, obj: cell._suite.obj.key });
      });
      cell.addEventListener("focusin", () => { if (!touch) open(cell); });
      cell.addEventListener("focusout", (e) => { if (!cell.contains(e.relatedTarget) && openCell === cell) close(); });
    }
    document.addEventListener("click", (e) => { if (openCell && !openCell.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openCell) { const c = openCell; close(); c.focus({ preventScroll: true }); } });
    window.addEventListener("resize", () => { if (openCell) layoutFan(openCell); });

    // headers and rungs: highlight a slice of the matrix, click to open it in the gallery
    for (const n of nodes) {
      if (n.classList.contains("mx-cell")) continue;
      const f = Object.fromEntries(KEYS.filter((k) => n.dataset[k]).map((k) => [k, n.dataset[k]]));
      const on = () => { if (!openCell) setFocus(f); };
      const off = () => { if (!openCell) setFocus(null); };
      n.addEventListener("pointerenter", on);
      n.addEventListener("pointerleave", off);
      n.addEventListener("focus", on);
      n.addEventListener("blur", off);
      n.addEventListener("click", () => openSuite(f));
      n.addEventListener("keydown", (e) => { if (e.key === "Enter") openSuite(f); });
    }

    // idle hint: now and then one deck spreads along the depth axis, until someone interacts
    if (!reduceMotion) {
      let inView = false;
      new IntersectionObserver((es) => { inView = es[0].isIntersecting; }).observe(host);
      const peek = () => {
        if (interacted || !inView || openCell || document.hidden) return;
        const c = cells[Math.floor(Math.random() * cells.length)];
        c.classList.add("peek");
        setTimeout(() => c.classList.remove("peek"), 1500);
      };
      setInterval(peek, 2600);
    }
  }

  /* ───────────── leaderboard: Attained Level ─────────────
     data/leaderboard.js holds per-task success rates only. Everything shown in the leaderboard
     (coverage, Attained Level, level means, the analysis charts) is derived here. */
  const EPS = 1e-9;
  const LB = (() => {
    const models = (LEADERBOARD.models || []).map((m, i) => ({ ...m, i, color: m.color || SERIES[i % SERIES.length] }));
    const tasks = (LEADERBOARD.tasks || []).map((t) => ({
      ...t, sr: models.map((_, i) => (t.sr && t.sr[i] !== null && t.sr[i] !== undefined ? Number(t.sr[i]) : null)),
    }));
    const rho = (LEADERBOARD.al && LEADERBOARD.al.rho) || 0.8;
    const taus = (LEADERBOARD.al && LEADERBOARD.al.taus) || [0.5, 0.8];
    const byLevel = [1, 2, 3, 4].map((k) => tasks.filter((t) => t.level === k));
    const mean = (vals) => {
      const v = vals.filter((x) => x !== null && x !== undefined);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    models.forEach((m) => {
      m.levelMean = byLevel.map((ts) => mean(ts.map((t) => t.sr[m.i])));
      m.avg = mean(tasks.map((t) => t.sr[m.i]));
      m.evaluated = tasks.filter((t) => t.sr[m.i] !== null).length;
      m.cov = {};
      m.al = {};
      taus.forEach((tau) => {
        // a task without a result does not meet tau; the denominator is every task of the level
        m.cov[tau] = byLevel.map((ts) => {
          const n = ts.length, q = ts.filter((t) => t.sr[m.i] !== null && t.sr[m.i] >= tau - EPS).length;
          return { n, q, need: Math.ceil(rho * n - EPS), pass: n > 0 && q / n >= rho - EPS };
        });
        let al = 0;
        while (al < 4 && m.cov[tau][al].pass) al++;
        m.al[tau] = al;
      });
    });
    const [t0, t1] = taus;
    const ranked = models.slice().sort((a, b) =>
      (b.al[t0] - a.al[t0]) || (b.al[t1] - a.al[t1]) || ((b.avg ?? -1) - (a.avg ?? -1)));
    ranked.forEach((m, r) => { m.rank = r + 1; });
    const taskMean = (t) => mean(t.sr) ?? -1;
    return { models, tasks, rho, taus, byLevel, ranked, mean, taskMean };
  })();
  const alName = (tau) => `AL@${Math.round(tau * 100)}`;
  const TASK_BY_ID = Object.fromEntries(TASK_ITEMS.map((t) => [t.env_id, t]));
  const OBJECT_LONG = { rigid_body: "Rigid body", deformable: "Deformable" };
  const taskLabel = (t) => (TASK_BY_ID[t.id] ? TASK_BY_ID[t.id].display_name : t.id.replace(/-v\d+$/, ""));
  const taskSuite = (t) => `L${t.level} · ${OBJECT_LONG[t.object] || t.object} · ${EMBODIMENT_LONG[t.embodiment] || t.embodiment}`;
  function tween(ms, fn) {
    if (reduceMotion) { fn(1); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      fn(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function initLeaderboard() {
    const card = document.getElementById("lb-card");
    const list = document.getElementById("lb-list");
    const hosts = Array.from(document.querySelectorAll("svg.ladder[data-tau]"));
    if (!hosts.length || !card || !list || !LB.models.length) return;
    const { models, ranked, rho, taus } = LB;
    let selected = ranked[0].id;

    // geometry: rung k sits at y(k); the zone between rungs k-1 and k is Level k
    const W = 560, Y0 = 630, Y4 = 70, RAIL_L = 176, RAIL_R = 372, PAD = 24;
    const ZH = (Y0 - Y4) / 4, BAR_W = 16, BAR_MAX = ZH - 2 * PAD;
    const y = (s) => Y0 - (s / 4) * (Y0 - Y4);
    const STEP = (RAIL_R - RAIL_L) / (models.length + 1);
    const colX = (i) => RAIL_L + (i + 1) * STEP;
    const barBottom = (k) => y(k - 1) - PAD; // k = 1..4
    const LABEL_X = RAIL_R + 30, MIN_GAP = 44;

    // one ladder per threshold: AL@50 and AL@80 side by side
    function drawLadder(ladder, tau) {
      const uid = Math.round(tau * 100);
      const ref = (name) => `url(#${name}-${uid})`;
      ladder.append(svg("defs", {},
        svg("linearGradient", { id: `railGrad-${uid}`, gradientUnits: "userSpaceOnUse", x1: 0, y1: Y0, x2: 0, y2: Y4 },
          svg("stop", { offset: "0%", "stop-color": "#2ee6c8" }),
          svg("stop", { offset: "33%", "stop-color": "#5ca0ff" }),
          svg("stop", { offset: "66%", "stop-color": "#a47dff" }),
          svg("stop", { offset: "100%", "stop-color": "#ff7a3d" })),
        svg("radialGradient", { id: `groundGlow-${uid}` },
          svg("stop", { offset: "0%", "stop-color": "#2ee6c8", "stop-opacity": "0.35" }),
          svg("stop", { offset: "100%", "stop-color": "#2ee6c8", "stop-opacity": "0" })),
        svg("filter", { id: `softGlow-${uid}`, x: "-50%", y: "-50%", width: "200%", height: "200%" },
          svg("feGaussianBlur", { stdDeviation: "6" }))));

      for (let k = 1; k <= 4; k++) {
        const top = y(k), bot = y(k - 1);
        ladder.append(
          svg("rect", { x: RAIL_L, y: top, width: RAIL_R - RAIL_L, height: bot - top, fill: ref("railGrad"), opacity: 0.035 }),
          svg("text", { x: 134, y: (top + bot) / 2 - 2, "text-anchor": "end", class: "zone-label", fill: ["", "#2ee6c8", "#5ca0ff", "#a47dff", "#ff7a3d"][k], text: `Level ${k}` }),
          svg("text", { x: 134, y: (top + bot) / 2 + 16, "text-anchor": "end", class: "zone-sub", text: LEVEL_NAMES[k] }),
        );
      }
      ladder.append(
        svg("ellipse", { cx: (RAIL_L + RAIL_R) / 2, cy: Y0 + 22, rx: 190, ry: 26, fill: ref("groundGlow") }),
        svg("line", { x1: 40, y1: Y0 + 22, x2: W - 20, y2: Y0 + 22, stroke: "rgba(130,150,255,0.18)", "stroke-width": 1 }));
      for (let k = 0; k <= 4; k++) {
        ladder.append(
          svg("line", { class: "rung-glow", x1: RAIL_L, x2: RAIL_R, y1: y(k), y2: y(k), stroke: ref("railGrad") }),
          svg("line", { class: "rung", x1: RAIL_L, x2: RAIL_R, y1: y(k), y2: y(k), stroke: ref("railGrad") }),
          svg("text", { x: RAIL_L - 16, y: y(k) + 4, "text-anchor": "end", class: "tick", text: String(k) }));
      }
      ladder.append(
        svg("line", { x1: RAIL_L, x2: RAIL_L, y1: Y4 - 34, y2: Y0 + 22, stroke: ref("railGrad"), "stroke-width": 16, opacity: 0.16, filter: ref("softGlow") }),
        svg("line", { x1: RAIL_R, x2: RAIL_R, y1: Y4 - 34, y2: Y0 + 22, stroke: ref("railGrad"), "stroke-width": 16, opacity: 0.16, filter: ref("softGlow") }),
        svg("line", { class: "rail", x1: RAIL_L, x2: RAIL_L, y1: Y4 - 34, y2: Y0 + 22, stroke: ref("railGrad") }),
        svg("line", { class: "rail", x1: RAIL_R, x2: RAIL_R, y1: Y4 - 34, y2: Y0 + 22, stroke: ref("railGrad") }),
        svg("text", { x: (RAIL_L + RAIL_R) / 2, y: Y4 - 46, "text-anchor": "middle", class: "ladder-cap", text: alName(tau) }));

      // coverage bars: in each level zone, one bar per policy = share of the level's tasks with success >= tau
      const barsLayer = svg("g", {});
      for (let k = 1; k <= 4; k++) {
        const ty = barBottom(k) - rho * BAR_MAX;
        barsLayer.append(svg("line", { class: "al-thr", x1: RAIL_L + 8, x2: RAIL_R - 8, y1: ty, y2: ty }));
      }
      barsLayer.append(
        svg("text", { class: "al-thr-label", x: RAIL_L + 7, y: barBottom(1) - rho * BAR_MAX - 5, text: `${Math.round(rho * 100)}%` }));
      const hitLayer = svg("g", {});
      const nodesLayer = svg("g", {});
      const labelsLayer = svg("g", { class: "labels" });

      const parts = models.map((m) => {
        const p = { m, x: colX(m.i), ty: y(m.al[tau]), ly: 0, bars: [] };
        for (let k = 1; k <= 4; k++) {
          const x = p.x - BAR_W / 2, b = barBottom(k), c = m.cov[tau][k - 1];
          const fill = svg("rect", { x, y: b, width: BAR_W, height: 0, rx: 3, fill: m.color, "fill-opacity": c.pass ? 1 : 0.4 });
          hitLayer.append(svg("rect", {
            class: "al-hit", x: p.x - STEP / 2, y: y(k), width: STEP, height: ZH,
            onmouseenter: (evt) => showTip(`<div class="tt-title">${m.name} · ${m.variant}</div>` +
              `<div class="tt-row"><span>Level ${k} tasks ≥ ${Math.round(tau * 100)}%</span><b>${c.q} / ${c.n}</b></div>` +
              `<div class="tt-row"><span>Coverage C<sub>${k}</sub></span><b>${pct(c.q / c.n, 0)}</b></div>` +
              `<div class="tt-row"><span>Needed (ρ = ${rho})</span><b>${c.need} / ${c.n}</b></div>` +
              `<div class="tt-row"><span>Level ${k} criterion</span><b>${c.pass ? "✓ met" : "✗ not met"}</b></div>`, evt),
            onmousemove: moveTip, onmouseleave: hideTip,
            onclick: () => select(m.id),
          }));
          barsLayer.append(svg("rect", { class: "al-track", x, y: b - BAR_MAX, width: BAR_W, height: BAR_MAX, rx: 3 }), fill);
          p.bars.push({ fill, base: b, to: (c.q / c.n) * BAR_MAX });
        }
        p.node = svg("g", {
          class: "node", tabindex: 0, role: "button",
          "aria-label": `${m.name}, ${m.variant}: ${alName(tau)} ${m.al[tau]}`,
          style: { transform: `translate(${p.x}px, ${Y0}px)` },
          onclick: () => select(m.id),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(m.id); } },
          onmouseenter: (e) => showTip(`<div class="tt-title">${m.name} · ${m.variant}</div>` +
            taus.map((t) => `<div class="tt-row"><span>${alName(t)}</span><b>${m.al[t]}</b></div>`).join("") +
            `<div class="tt-row"><span>Mean success</span><b>${pct(m.avg)}</b></div>`, e),
          onmousemove: moveTip, onmouseleave: hideTip,
        },
          svg("circle", { class: "node-halo", r: 30, fill: m.color, opacity: 0.25, filter: ref("softGlow") }),
          svg("circle", { r: 24, fill: "transparent" }),
          svg("circle", { class: "node-ring", r: 15, fill: "#0b0f1c", stroke: m.color, "stroke-width": 2.5 }),
          svg("circle", { r: 6, fill: m.color }));
        nodesLayer.append(p.node);
        p.leader = svg("path", { class: "leader", d: "" });
        p.labelName = svg("text", { x: LABEL_X, class: "node-label", text: m.name });
        p.labelSub = svg("text", { x: LABEL_X, class: "node-sub", text: `${m.variant.replace(/\s*\(.*\)$/, "")} · AL ${m.al[tau]}` });
        p.label = svg("g", { style: { opacity: 0, transition: "opacity .6s ease .9s" } }, p.leader, p.labelName, p.labelSub);
        labelsLayer.append(p.label);
        return p;
      });
      ladder.append(barsLayer, labelsLayer, hitLayer, nodesLayer);

      // labels right of the ladder, dodged, in node order
      const byY = parts.slice().sort((a, b) => a.ty - b.ty || a.m.i - b.m.i);
      byY.forEach((p, i) => { p.ly = Math.min(p.ty, Y0 - 8); if (i > 0) p.ly = Math.max(p.ly, byY[i - 1].ly + MIN_GAP); });
      const overflow = byY.length ? byY[byY.length - 1].ly - (Y0 + 8) : 0;
      if (overflow > 0) byY.forEach((p) => { p.ly -= overflow; });
      parts.forEach((p) => {
        p.labelName.setAttribute("y", p.ly - 2);
        p.labelSub.setAttribute("y", p.ly + 14);
        p.leader.setAttribute("d", `M${p.x + 16},${p.ty} L${RAIL_R + 12},${p.ty} L${LABEL_X - 6},${p.ly - 4}`);
      });

      let climbed = false;
      function climb() {
        if (climbed) return;
        climbed = true;
        parts.forEach((p) => p.bars.forEach((b) => tween(900, (t) => {
          const h = b.to * t;
          b.fill.setAttribute("height", Math.max(0, h));
          b.fill.setAttribute("y", b.base - h);
        })));
        parts.forEach((p, i) => setTimeout(() => {
          p.node.style.transition = "transform 1.4s cubic-bezier(.22,1,.36,1)";
          p.node.style.transform = `translate(${p.x}px, ${p.ty}px)`;
          p.label.style.opacity = 1;
        }, reduceMotion ? 0 : 150 + i * 200));
      }
      const wrap = ladder.closest(".reveal");
      if (wrap && !wrap.classList.contains("in")) wrap.addEventListener("revealed", climb, { once: true });
      else climb();

      return { setActive: (id) => parts.forEach((p) => p.node.classList.toggle("active", p.m.id === id)) };
    }
    const ladders = hosts.map((host) => drawLadder(host, Number(host.dataset.tau)));

    // ranked list
    const [ta, tb] = taus;
    list.replaceChildren(...ranked.map((m) => el("li", {},
      el("button", {
        class: "lb-row", type: "button", "data-id": m.id, style: { "--model-color": m.color },
        onclick: () => select(m.id),
      },
        el("span", { class: "lb-rank", text: `#${m.rank}` }),
        el("span", { class: "lb-dot" }),
        el("span", { class: "lb-name" }, m.name, el("small", { text: m.variant })),
        el("span", { class: "lb-num lb-al" }, String(m.al[ta]), el("small", { text: alName(ta) })),
        el("span", { class: "lb-num" }, String(m.al[tb]), el("small", { text: alName(tb) })),
        el("span", { class: "lb-num" }, pct(m.avg), el("small", { text: "mean" })),
      ))));

    // detail card: both thresholds per level
    function select(id) {
      const m = models.find((x) => x.id === id);
      if (!m) return;
      selected = id;
      ladders.forEach((l) => l.setActive(id));
      list.querySelectorAll(".lb-row").forEach((r) => r.classList.toggle("active", r.dataset.id === id));
      card.style.setProperty("--model-color", m.color);
      const cell = (c) => [
        el("div", { class: `track${c.pass ? " pass" : ""}`, style: { "--thr": `${rho * 100}%` } }, el("div", { class: "fill", "data-w": c.q / c.n })),
        el("span", { class: `lb-cov${c.pass ? " pass" : ""}`, title: c.pass ? "criterion met" : `needs ${c.need}` }, `${c.q}/${c.n}`, el("i", { text: c.pass ? "✓" : "✗" })),
      ];
      card.replaceChildren(
        el("div", { class: "lb-card-head" },
          el("div", {},
            el("h3", {}, m.name, el("small", { text: m.variant })),
            el("span", { class: "lb-kind", text: m.kind || "" })),
          el("div", { class: "lb-scores" },
            taus.map((t) => el("div", { class: "lb-score" }, el("span", { text: alName(t) }), el("b", { text: String(m.al[t]) }))),
            el("div", { class: "lb-score" }, el("span", { text: "mean" }), el("b", { text: pct(m.avg) })))),
        el("div", { class: "lb-bars" },
          el("div", { class: "lb-bar lb-bar-head" },
            el("span"),
            taus.map((t) => el("span", { class: "lb-bar-th", text: `tasks ≥ ${Math.round(t * 100)}%` })),
            el("span", { text: "mean" })),
          [0, 1, 2, 3].map((k) => el("div", { class: "lb-bar", style: { "--lv": LEVEL_VARS[k + 1] } },
            el("b", { text: `L${k + 1}` }),
            taus.flatMap((t) => cell(m.cov[t][k])),
            el("span", { text: pct(m.levelMean[k]) })))),
        el("div", { class: "lb-meta" },
          m.protocol ? el("span", {}, el("b", { text: "Protocol " }), m.protocol) : null,
          m.source ? el("span", {}, el("b", { text: "Source " }), m.source) : null),
      );
      requestAnimationFrame(() => requestAnimationFrame(() => {
        card.querySelectorAll(".fill").forEach((f) => { f.style.width = `${Number(f.dataset.w) * 100}%`; });
      }));
    }
    select(selected);
  }

  /* ───────────── leaderboard analysis: where the policies succeed and fail ───────────── */
  const legendFor = (items) => el("ul", { class: "legend" },
    items.map((it) => el("li", {}, el("i", { class: it.cls || null, style: { "--c": it.color } }), it.label)));
  // vertical bar with rounded top, anchored to the baseline
  function vbar(x, yTop, w, h, r = 4) {
    if (h <= 0) return "";
    r = Math.min(r, w / 2, h);
    return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
  }
  // horizontal bar growing right from x (or left when dir = -1), rounded at its data end
  function hbar(x, yTop, len, h, dir = 1, r = 4) {
    if (len <= 0) return "";
    r = Math.min(r, h / 2, len);
    const e = x + dir * len;
    return `M${x},${yTop}H${e - dir * r}Q${e},${yTop} ${e},${yTop + r}V${yTop + h - r}Q${e},${yTop + h} ${e - dir * r},${yTop + h}H${x}Z`;
  }
  const BUCKETS = [
    { label: "≥ 80%", color: "#d6ecff", ink: "#06070c", test: (v) => v >= 0.8 - EPS },
    { label: "50–79%", color: "#73b0ff", ink: "#06070c", test: (v) => v >= 0.5 - EPS && v < 0.8 - EPS },
    { label: "1–49%", color: "#3070d0", ink: "#eef1fb", test: (v) => v > EPS && v < 0.5 - EPS },
    { label: "0%", color: "#3b4f7c", ink: "#eef1fb", test: (v) => v <= EPS },
  ];
  function hatchDefs(id) {
    return svg("defs", {}, svg("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
      svg("rect", { width: 6, height: 6, fill: "rgba(130,150,255,0.06)" }),
      svg("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "rgba(176,183,207,0.45)", "stroke-width": 1.5 })));
  }
  const SRC_PAPER = "paper Fig. 4 per-task results (single-task policies); HF Linslab/ManiLadder_PI05_Models multi_task/results.csv (π0.5 MT-L)";

  function lbLevelsChart() {
    const host = document.getElementById("lb-chart-levels");
    if (!host) return;
    const { models } = LB;
    const W = 560, H = 300, L = 44, R = 6, T = 16, B = 44;
    const ymax = Math.max(0.2, Math.ceil(Math.max(...models.flatMap((m) => m.levelMean.map((v) => v || 0))) * 10 - EPS) / 10);
    const yy = (v) => T + (1 - v / ymax) * (H - T - B);
    const GW = (W - L - R) / 4, BW = 22, GAP = 2, span = models.length * BW + (models.length - 1) * GAP;
    host.append(legendFor(models.map((m) => ({ color: m.color, label: m.short }))));
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Mean success rate per level for each policy" });
    for (let v = 0; v <= ymax + EPS; v += 0.2) {
      s.append(svg("line", { class: v < EPS ? "baseline" : "grid", x1: L, x2: W - R, y1: yy(v), y2: yy(v) }),
        svg("text", { class: "axis-label", x: L - 8, y: yy(v) + 4, "text-anchor": "end", text: `${Math.round(v * 100)}%` }));
    }
    for (let k = 0; k < 4; k++) {
      const gx = L + GW * k + GW / 2;
      const g = svg("g", { class: "mark" });
      const vals = models.map((m) => m.levelMean[k]);
      const best = Math.max(...vals.map((v) => v ?? -1));
      models.forEach((m, i) => {
        const v = vals[i];
        if (v === null) return;
        const x = gx - span / 2 + i * (BW + GAP);
        g.append(svg("path", { d: vbar(x, yy(v), BW, yy(0) - yy(v)), fill: m.color }));
        if (v === best) g.append(svg("text", { class: "val", x: x + BW / 2, y: yy(v) - 6, "text-anchor": "middle", text: pct(v, 0) }));
      });
      g.append(
        svg("text", { class: "cat", x: gx, y: H - B + 18, "text-anchor": "middle", text: `Level ${k + 1}` }),
        svg("text", { class: "axis-label", x: gx, y: H - B + 33, "text-anchor": "middle", text: LEVEL_NAMES[k + 1] }),
        svg("rect", {
          class: "hit", x: gx - GW / 2, y: T, width: GW, height: H - T - B + 36,
          onmouseenter: (evt) => {
            host.classList.add("dim"); g.classList.add("on");
            showTip(`<div class="tt-title">Level ${k + 1} · mean success</div>` +
              models.map((m) => `<div class="tt-row"><span><i style="--c:${m.color}"></i>${m.short}</span><b>${pct(m.levelMean[k])}</b></div>`).join(""), evt);
          },
          onmousemove: moveTip,
          onmouseleave: () => { host.classList.remove("dim"); g.classList.remove("on"); hideTip(); },
        }));
      s.append(g);
    }
    host.append(s);
    addTable(host, ["Policy", "Level 1", "Level 2", "Level 3", "Level 4", "All"],
      models.map((m) => [`${m.name} ${m.variant}`, ...m.levelMean.map((v) => pct(v)), pct(m.avg)]), SRC_PAPER);
  }

  function lbBucketsChart() {
    const host = document.getElementById("lb-chart-buckets");
    if (!host) return;
    const { models, byLevel, rho } = LB;
    const W = 560, LW = 92, R = 8, ROW = 21, BH = 15, HEAD = 26, BLOCK_GAP = 10;
    const H = byLevel.length * (HEAD + models.length * ROW) + (byLevel.length - 1) * BLOCK_GAP + 4;
    host.append(legendFor([...BUCKETS.map((b) => ({ color: b.color, label: b.label })), { color: "transparent", cls: "hatch", label: "not run" }]));
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Number of tasks per success bucket, by level and policy" });
    s.append(hatchDefs("lbHatchB"));
    let y0 = 0;
    byLevel.forEach((ts, k) => {
      const n = ts.length, unit = (W - LW - R) / n, need = Math.ceil(rho * n - EPS);
      const tx = LW + need * unit;
      s.append(
        svg("text", { class: "cat", x: 0, y: y0 + 16, text: `Level ${k + 1}` }),
        svg("text", { class: "axis-label", x: tx - 6, y: y0 + 16, "text-anchor": "end", text: `${need} of ${n} needed for ${alName(0.5)}` }));
      models.forEach((m, r) => {
        const yr = y0 + HEAD + r * ROW;
        const counts = BUCKETS.map((b) => ts.filter((t) => t.sr[m.i] !== null && b.test(t.sr[m.i])).length);
        const missing = ts.filter((t) => t.sr[m.i] === null).length;
        const g = svg("g", { class: "mark" });
        g.append(svg("text", { class: "axis-label lb-rowlab", x: 0, y: yr + BH - 3, text: m.short }));
        let x = LW;
        [...counts, missing].forEach((c, j) => {
          if (!c) return;
          const w = c * unit, isNA = j === BUCKETS.length;
          g.append(svg("rect", { x: x + 1, y: yr, width: Math.max(1, w - 2), height: BH, rx: 2, fill: isNA ? "url(#lbHatchB)" : BUCKETS[j].color }));
          if (w >= 18 && !isNA) g.append(svg("text", { class: "seg-val", x: x + w / 2, y: yr + BH - 4, "text-anchor": "middle", style: { fill: BUCKETS[j].ink }, text: String(c) }));
          x += w;
        });
        g.append(svg("rect", {
          class: "hit", x: 0, y: yr - 3, width: W, height: ROW,
          onmouseenter: (evt) => {
            host.classList.add("dim"); g.classList.add("on");
            const q = counts[0] + counts[1];
            showTip(`<div class="tt-title">${m.short} · Level ${k + 1}</div>` +
              BUCKETS.map((b, j) => `<div class="tt-row"><span><i style="--c:${b.color}"></i>${b.label}</span><b>${counts[j]}</b></div>`).join("") +
              (missing ? `<div class="tt-row"><span>not run</span><b>${missing}</b></div>` : "") +
              `<div class="tt-row"><span>≥ 50% (needs ${need})</span><b>${q} ${q >= need ? "✓" : "✗"}</b></div>`, evt);
          },
          onmousemove: moveTip,
          onmouseleave: () => { host.classList.remove("dim"); g.classList.remove("on"); hideTip(); },
        }));
        s.append(g);
      });
      s.append(svg("line", { class: "al-thr", x1: tx, x2: tx, y1: y0 + 21, y2: y0 + HEAD + models.length * ROW - 4 }));
      y0 += HEAD + models.length * ROW + BLOCK_GAP;
    });
    host.append(s);
    const rows = [];
    byLevel.forEach((ts, k) => models.forEach((m) => {
      rows.push([`L${k + 1} ${m.short}`, ...BUCKETS.map((b) => String(ts.filter((t) => t.sr[m.i] !== null && b.test(t.sr[m.i])).length)), String(ts.filter((t) => t.sr[m.i] === null).length)]);
    }));
    addTable(host, ["Level · policy", ...BUCKETS.map((b) => b.label), "not run"], rows, SRC_PAPER);
  }

  function lbTasksChart() {
    const host = document.getElementById("lb-chart-tasks");
    if (!host) return;
    const { models, byLevel, taskMean } = LB;
    const grid = el("div", { class: "th-grid" });
    byLevel.forEach((ts, k) => {
      const sorted = ts.slice().sort((a, b) => taskMean(b) - taskMean(a) || a.id.localeCompare(b.id));
      const cells = el("div", { class: "th-cells", style: { "--n": sorted.length } });
      models.forEach((m) => {
        cells.append(el("span", { class: "th-lab", text: m.short }));
        sorted.forEach((t, j) => {
          const v = t.sr[m.i];
          cells.append(el("i", {
            class: v === null ? "th-c na" : `th-c${v > 0.62 ? " light" : ""}`, "data-j": j,
            style: v === null ? null : { background: rampColor(v) },
          }));
        });
      });
      const columnOf = (evt) => {
        const c = evt.target.closest && evt.target.closest(".th-c");
        return c ? Number(c.dataset.j) : -1;
      };
      let on = -1;
      const mark = (j) => {
        if (j === on) return;
        cells.querySelectorAll(".th-c.on").forEach((c) => c.classList.remove("on"));
        if (j >= 0) cells.querySelectorAll(`.th-c[data-j="${j}"]`).forEach((c) => c.classList.add("on"));
        on = j;
      };
      cells.addEventListener("mouseover", (evt) => {
        const j = columnOf(evt);
        if (j < 0) return;
        mark(j);
        const t = sorted[j], item = TASK_BY_ID[t.id];
        showTip(`<div class="tt-title">${taskLabel(t)}</div><div class="tt-sub">${t.id} · ${taskSuite(t)}</div>` +
          models.map((m) => `<div class="tt-row"><span><i style="--c:${m.color}"></i>${m.short}</span><b>${t.sr[m.i] === null ? "not run" : pct(t.sr[m.i], 0)}</b></div>`).join("") +
          (item && item.video ? `<div class="tt-sub">Click to watch the scripted rollout</div>` : ""), evt);
      });
      cells.addEventListener("mousemove", moveTip);
      cells.addEventListener("mouseleave", () => { mark(-1); hideTip(); });
      cells.addEventListener("click", (evt) => {
        const j = columnOf(evt);
        const item = j >= 0 && TASK_BY_ID[sorted[j].id];
        if (item && item.video) { hideTip(); openViewer(item); }
      });
      grid.append(el("div", { class: "th-block" },
        el("div", { class: "th-head" },
          el("b", { style: { "--lv": LEVEL_VARS[k + 1] }, text: `Level ${k + 1}` }),
          el("span", { text: `${LEVEL_NAMES[k + 1]} · ${sorted.length} tasks · best → worst` })),
        cells));
    });
    host.append(grid, el("div", { class: "heat-scale" }, "0%", el("i"), "100%",
      el("span", { class: "th-na-key" }, el("em"), "not run")));
    addTable(host, ["Task", "Level", ...models.map((m) => m.short)],
      LB.tasks.slice().sort((a, b) => a.level - b.level || taskMean(b) - taskMean(a))
        .map((t) => [t.id, String(t.level), ...models.map((m) => (t.sr[m.i] === null ? "—" : pct(t.sr[m.i], 0)))]), SRC_PAPER);
  }

  function lbWinsChart() {
    const host = document.getElementById("lb-chart-wins");
    if (!host) return;
    const { models, byLevel, tasks } = LB;
    const st = models.filter((m) => /single/i.test(m.variant));
    const cats = [
      ...st.map((m) => ({ label: `${m.short} best`, color: m.color })),
      { label: "Tie", color: "var(--s-base)", ink: "var(--text)" },
      { label: "All 0%", color: "url(#lbHatchW)", legend: "transparent", cls: "hatch", ink: "var(--text)" },
    ];
    const tally = (ts) => {
      const c = cats.map(() => 0);
      ts.forEach((t) => {
        const vals = st.map((m) => t.sr[m.i] ?? -1);
        const mx = Math.max(...vals), win = vals.map((v, i) => (Math.abs(v - mx) < EPS ? i : -1)).filter((i) => i >= 0);
        if (mx <= EPS) c[st.length + 1]++;
        else if (win.length > 1) c[st.length]++;
        else c[win[0]]++;
      });
      return c;
    };
    const rows = [...byLevel.map((ts, k) => ({ label: `Level ${k + 1}`, ts })), { label: "All tasks", ts: tasks }];
    const W = 560, LW = 80, R = 8, ROW = 40, BH = 22, T = 4;
    const H = T + rows.length * ROW + 4;
    host.append(legendFor(cats.map((c) => ({ color: c.legend || c.color, cls: c.cls, label: c.label }))));
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Which single-task policy has the highest success on each task, by level" });
    s.append(hatchDefs("lbHatchW"));
    const table = [];
    rows.forEach((row, r) => {
      const c = tally(row.ts), n = row.ts.length, unit = (W - LW - R) / n, yr = T + r * ROW + (r === rows.length - 1 ? 8 : 0);
      const g = svg("g", { class: "mark" });
      g.append(svg("text", { class: "cat", x: 0, y: yr + BH / 2 + 4, text: row.label }),
        svg("text", { class: "axis-label", x: 0, y: yr + BH / 2 + 18, text: `${n} tasks` }));
      let x = LW;
      c.forEach((v, j) => {
        if (!v) return;
        const w = v * unit;
        g.append(svg("rect", { x: x + 1, y: yr, width: Math.max(1, w - 2), height: BH, rx: 3, fill: cats[j].color }));
        if (w >= 18) g.append(svg("text", { class: "seg-val", x: x + w / 2, y: yr + BH / 2 + 4, "text-anchor": "middle", style: { fill: cats[j].ink || "#06070c" }, text: String(v) }));
        x += w;
      });
      g.append(svg("rect", {
        class: "hit", x: 0, y: yr - 4, width: W, height: ROW,
        onmouseenter: (evt) => {
          host.classList.add("dim"); g.classList.add("on");
          showTip(`<div class="tt-title">${row.label} · highest single-task success</div>` +
            cats.map((ct, j) => `<div class="tt-row"><span>${ct.label}</span><b>${c[j]}</b></div>`).join(""), evt);
        },
        onmousemove: moveTip,
        onmouseleave: () => { host.classList.remove("dim"); g.classList.remove("on"); hideTip(); },
      }));
      s.append(g);
      table.push([row.label, ...c.map(String)]);
    });
    s.insertBefore(svg("line", { class: "grid", x1: 0, x2: W, y1: T + (rows.length - 1) * ROW + 2, y2: T + (rows.length - 1) * ROW + 2 }), s.firstChild.nextSibling);
    host.append(s);
    addTable(host, ["Rows", ...cats.map((c) => c.label)], table, "same per-task results; π0.5 MT-L is left out (different training setting)");
  }

  function lbGroupsChart() {
    const host = document.getElementById("lb-chart-groups");
    if (!host) return;
    const { models, tasks, mean } = LB;
    const groups = [
      { head: "Embodiment", items: EMBODIMENT_ORDER.map((e) => ({ label: EMBODIMENT_LONG[e], f: (t) => t.embodiment === e })) },
      { head: "Object", items: [{ label: "Rigid body", f: (t) => t.object === "rigid_body" }, { label: "Deformable", f: (t) => t.object === "deformable" }] },
    ];
    groups.forEach((g) => g.items.forEach((it) => {
      it.n = tasks.filter(it.f).length;
      it.vals = models.map((m) => mean(tasks.filter(it.f).map((t) => t.sr[m.i])));
    }));
    const vmax = Math.max(0.2, Math.ceil(Math.max(...groups.flatMap((g) => g.items.flatMap((it) => it.vals.map((v) => v || 0)))) * 10 - EPS) / 10);
    const W = 560, LW = 150, R = 44, BH = 7, GAP = 2, IT = models.length * (BH + GAP) + 12, HEAD = 22, T = 2;
    const H = T + groups.reduce((a, g) => a + HEAD + g.items.length * IT, 0) + 22;
    const x = (v) => LW + (v / vmax) * (W - LW - R);
    host.append(legendFor(models.map((m) => ({ color: m.color, label: m.short }))));
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Mean success by embodiment and object type for each policy" });
    for (let v = 0; v <= vmax + EPS; v += 0.1) {
      s.append(svg("line", { class: v < EPS ? "baseline" : "grid", x1: x(v), x2: x(v), y1: T, y2: H - 18 }),
        svg("text", { class: "axis-label", x: x(v), y: H - 4, "text-anchor": "middle", text: `${Math.round(v * 100)}%` }));
    }
    let y0 = T;
    const table = [];
    groups.forEach((g) => {
      s.append(svg("text", { class: "axis-label lb-grouphead", x: 0, y: y0 + 14, text: g.head.toUpperCase() }));
      y0 += HEAD;
      g.items.forEach((it) => {
        const mk = svg("g", { class: "mark" });
        mk.append(svg("text", { class: "cat", x: 0, y: y0 + 13, text: it.label }),
          svg("text", { class: "axis-label", x: 0, y: y0 + 28, text: `${it.n} tasks` }));
        const best = Math.max(...it.vals.map((v) => v ?? -1));
        it.vals.forEach((v, i) => {
          if (v === null) return;
          const yb = y0 + i * (BH + GAP);
          mk.append(svg("path", { d: hbar(x(0), yb, x(v) - x(0), BH, 1, 3), fill: models[i].color }));
          if (v === best) mk.append(svg("text", { class: "val", x: x(v) + 6, y: yb + BH, text: pct(v, 0) }));
        });
        mk.append(svg("rect", {
          class: "hit", x: 0, y: y0 - 4, width: W, height: IT,
          onmouseenter: (evt) => {
            host.classList.add("dim"); mk.classList.add("on");
            showTip(`<div class="tt-title">${it.label} · ${it.n} tasks</div>` +
              models.map((m, i) => `<div class="tt-row"><span><i style="--c:${m.color}"></i>${m.short}</span><b>${pct(it.vals[i])}</b></div>`).join(""), evt);
          },
          onmousemove: moveTip,
          onmouseleave: () => { host.classList.remove("dim"); mk.classList.remove("on"); hideTip(); },
        }));
        s.append(mk);
        table.push([it.label, String(it.n), ...it.vals.map((v) => pct(v))]);
        y0 += IT;
      });
    });
    host.append(s);
    addTable(host, ["Group", "Tasks", ...models.map((m) => m.short)], table, SRC_PAPER);
  }

  function lbGapsChart() {
    const host = document.getElementById("lb-chart-gaps");
    if (!host) return;
    const { models, tasks } = LB;
    const agent = models.find((m) => /astra/i.test(m.id));
    const il = models.filter((m) => /single/i.test(m.variant) && m !== agent);
    if (!agent || il.length < 1) return;
    const rows = tasks.filter((t) => t.sr[agent.i] !== null && il.every((m) => t.sr[m.i] !== null)).map((t) => {
      const best = il.reduce((a, m) => (t.sr[m.i] > t.sr[a.i] ? m : a), il[0]);
      return { t, best, d: t.sr[agent.i] - t.sr[best.i] };
    });
    const N = 8;
    const ahead = rows.filter((r) => r.d > EPS).sort((a, b) => b.d - a.d).slice(0, N);
    const behind = rows.filter((r) => r.d < -EPS).sort((a, b) => a.d - b.d).slice(0, N);
    const W = 560, LW = 176, ROW = 21, BH = 13, HEAD = 26, T = 0;
    const H = T + 2 * HEAD + (ahead.length + behind.length) * ROW + 8;
    const C = LW + (W - LW) / 2, HALF = (W - LW) / 2 - 42;
    const xd = (d) => C + d * HALF;
    host.append(legendFor([{ color: agent.color, label: `${agent.short} ahead` }, ...il.map((m) => ({ color: m.color, label: `${m.short} ahead` }))]));
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Tasks with the largest success gap between GPT6-Astra and the best imitation-learning policy" });
    let y0 = T;
    const block = (title, list) => {
      s.append(svg("text", { class: "axis-label lb-grouphead", x: 0, y: y0 + 16, text: title }));
      y0 += HEAD;
      list.forEach((r) => {
        const g = svg("g", { class: "mark" });
        const pos = r.d > 0, len = Math.abs(r.d) * HALF;
        g.append(
          svg("text", { class: "cat", x: 0, y: y0 + BH - 2, text: taskLabel(r.t).replace(/^Dual Arm /, "DA ") }),
          svg("path", { d: hbar(C, y0, len, BH, pos ? 1 : -1, 3), fill: pos ? agent.color : r.best.color }),
          svg("text", { class: "val", x: xd(r.d) + (pos ? 6 : -6), y: y0 + BH - 2, "text-anchor": pos ? "start" : "end", text: `${pos ? "+" : "−"}${Math.round(Math.abs(r.d) * 100)}` }),
          svg("rect", {
            class: "hit", x: 0, y: y0 - 4, width: W, height: ROW,
            onmouseenter: (evt) => {
              host.classList.add("dim"); g.classList.add("on");
              showTip(`<div class="tt-title">${taskLabel(r.t)}</div><div class="tt-sub">${taskSuite(r.t)}</div>` +
                [agent, ...il].map((m) => `<div class="tt-row"><span><i style="--c:${m.color}"></i>${m.short}</span><b>${pct(r.t.sr[m.i], 0)}</b></div>`).join("") +
                `<div class="tt-row"><span>Gap vs best imitation</span><b>${r.d > 0 ? "+" : "−"}${Math.round(Math.abs(r.d) * 100)} pp</b></div>`, evt);
            },
            onmousemove: moveTip,
            onmouseleave: () => { host.classList.remove("dim"); g.classList.remove("on"); hideTip(); },
          }));
        s.append(g);
        y0 += ROW;
      });
    };
    block(`${agent.short.toUpperCase()} AHEAD (PP OVER THE BEST IMITATION POLICY)`, ahead);
    block("IMITATION LEARNING AHEAD", behind);
    s.insertBefore(svg("line", { class: "baseline", x1: C, x2: C, y1: T + HEAD - 6, y2: H - 4 }), s.firstChild);
    host.append(s);
    addTable(host, ["Task", "Level", agent.short, ...il.map((m) => m.short), "Gap (pp)"],
      [...ahead, ...behind].map((r) => [r.t.id, String(r.t.level), pct(r.t.sr[agent.i], 0), ...il.map((m) => pct(r.t.sr[m.i], 0)), String(Math.round(r.d * 100))]), SRC_PAPER);
  }

  function lbMultiTaskChart() {
    const host = document.getElementById("lb-chart-mt");
    if (!host) return;
    const { models, byLevel } = LB;
    const stM = models.find((m) => m.id === "pi05-st"), mtM = models.find((m) => m.id === "pi05-mt");
    if (!stM || !mtM) return;
    const W = 560, PW = 226, PH = 200, GX = 60, GY = 80, L = 40, T = 44;
    const H = T + 2 * PH + GY + 46;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "π0.5 multi-task vs. single-task success per task, one panel per level" });
    const table = [];
    byLevel.forEach((ts, k) => {
      const px = L + (k % 2) * (PW + GX), py = T + Math.floor(k / 2) * (PH + GY);
      const sx = (v) => px + v * PW, sy = (v) => py + (1 - v) * PH;
      const pts = ts.filter((t) => t.sr[stM.i] !== null && t.sr[mtM.i] !== null);
      const lower = pts.filter((t) => t.sr[mtM.i] < t.sr[stM.i] - EPS).length;
      const higher = pts.filter((t) => t.sr[mtM.i] > t.sr[stM.i] + EPS).length;
      const dm = pts.length ? pts.reduce((a, t) => a + t.sr[mtM.i] - t.sr[stM.i], 0) / pts.length : 0;
      const p = svg("g", {});
      p.append(svg("text", { class: "cat", x: px, y: py - 26, text: `Level ${k + 1}` }),
        svg("text", { class: "axis-label", x: px, y: py - 10, text: `MT lower on ${lower}/${pts.length} · mean ${dm >= 0 ? "+" : "−"}${Math.abs(dm * 100).toFixed(1)} pp` }));
      [0, 0.5, 1].forEach((v) => {
        p.append(svg("line", { class: v === 0 ? "baseline" : "grid", x1: px, x2: px + PW, y1: sy(v), y2: sy(v) }),
          svg("line", { class: v === 0 ? "baseline" : "grid", x1: sx(v), x2: sx(v), y1: py, y2: py + PH }),
          svg("text", { class: "axis-label", x: px - 6, y: sy(v) + 4, "text-anchor": "end", text: `${v * 100}%` }),
          svg("text", { class: "axis-label", x: sx(v), y: py + PH + 15, "text-anchor": "middle", text: `${v * 100}%` }));
      });
      p.append(svg("line", { class: "lb-diag", x1: sx(0), y1: sy(0), x2: sx(1), y2: sy(1) }));
      const dots = pts.map((t) => {
        const c = svg("circle", { cx: sx(t.sr[stM.i]), cy: sy(t.sr[mtM.i]), r: 4.5, fill: mtM.color, stroke: "#0e1324", "stroke-width": 2 });
        p.append(c);
        return { t, c, x: sx(t.sr[stM.i]), y: sy(t.sr[mtM.i]) };
      });
      const hit = svg("rect", { class: "hit", x: px - 6, y: py - 6, width: PW + 12, height: PH + 12 });
      let cur = null;
      hit.addEventListener("mousemove", (evt) => {
        const pt = s.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
        const loc = pt.matrixTransform(s.getScreenCTM().inverse());
        let best = null, bd = 18 * 18;
        dots.forEach((d) => { const dd = (d.x - loc.x) ** 2 + (d.y - loc.y) ** 2; if (dd < bd) { bd = dd; best = d; } });
        if (cur && cur !== best) cur.c.setAttribute("r", 4.5);
        cur = best;
        if (!best) { hideTip(); return; }
        best.c.setAttribute("r", 7);
        showTip(`<div class="tt-title">${taskLabel(best.t)}</div><div class="tt-sub">${taskSuite(best.t)}</div>` +
          `<div class="tt-row"><span><i style="--c:${stM.color}"></i>π0.5 single-task</span><b>${pct(best.t.sr[stM.i], 0)}</b></div>` +
          `<div class="tt-row"><span><i style="--c:${mtM.color}"></i>π0.5 multi-task</span><b>${pct(best.t.sr[mtM.i], 0)}</b></div>`, evt);
      });
      hit.addEventListener("mouseleave", () => { if (cur) cur.c.setAttribute("r", 4.5); cur = null; hideTip(); });
      p.append(hit);
      s.append(p);
      table.push([`Level ${k + 1}`, String(pts.length), String(lower), String(higher), String(pts.length - lower - higher), `${(dm * 100).toFixed(1)}`]);
    });
    s.append(
      svg("text", { class: "axis-label", x: L + PW + GX / 2, y: H - 2, "text-anchor": "middle", text: "π0.5 single-task success (x)  ·  π0.5 multi-task success (y)  ·  dashed line: equal" }));
    host.append(legendFor([{ color: mtM.color, label: "one task" }]), s);
    addTable(host, ["Level", "Tasks", "MT lower", "MT higher", "Equal", "Mean Δ (pp)"], table, SRC_PAPER);
  }

  function initLeaderboardAnalysis() {
    if (!LB.tasks.length) return;
    lbLevelsChart();
    lbBucketsChart();
    lbTasksChart();
    lbWinsChart();
    lbGroupsChart();
    lbGapsChart();
    lbMultiTaskChart();
  }

  /* ───────────── task gallery ───────────── */
  // Laid out like the overview matrix: one band per level, one column per suite (embodiment × object),
  // each column holding that suite's 3–4 tasks. Every tile carries the paper's single-task success rates.
  function initGallery() {
    const section = document.getElementById("tasks");
    const gallery = document.getElementById("gallery");
    const top = document.getElementById("gallery-top");
    const head = document.getElementById("gallery-head");
    const empty = document.getElementById("gallery-empty");
    const count = document.getElementById("result-count");
    const search = document.getElementById("task-search");
    if (!gallery) return;

    const SUITES = EMBODIMENT_ORDER.flatMap((emb) => ["rigid", "deformable"].map((obj) => ({ emb, obj })));
    const EMB_HEAD = {
      single_arm_gripper: { name: "Single-arm gripper", icons: ["ee-gripper"] },
      single_arm_dex: { name: "Single-arm dex hand", icons: ["ee-dex"] },
      dual_arm_gripper: { name: "Dual-arm grippers", icons: ["ee-gripper", "ee-gripper"] },
      dual_arm_dex: { name: "Dual-arm dex hands", icons: ["ee-dex", "ee-dex"] },
    };
    const POLICIES = [
      { key: "fm", short: "FM", name: "Small flow matching", color: "var(--s1)" },
      { key: "pi05", short: "π0.5", name: "π0.5", color: "var(--s2)" },
      { key: "astra", short: "Astra", name: "GPT6-Astra", color: "var(--s3)" },
    ];
    const items = [...TASK_ITEMS].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

    // one chip per value; clicking the pressed chip clears that filter
    const GROUPS = {
      level: [["1", "L1 · Easy"], ["2", "L2 · Medium"], ["3", "L3 · Hard"], ["4", "L4 · Unsolved"]],
      robot: [["single", "Single-arm"], ["dual", "Dual-arm"]],
      hand: [["gripper", "Gripper"], ["dex", "Dex hand"]],
      object: [["rigid", "Rigid"], ["deformable", "Deformable"]],
    };
    const state = { level: "all", robot: "all", hand: "all", object: "all", q: "" };

    document.querySelectorAll("#filters .chips").forEach((group) => {
      const key = group.dataset.key;
      group.replaceChildren(...GROUPS[key].map(([value, label]) => el("button", {
        class: "chip", type: "button", "aria-pressed": "false", "data-value": value,
        style: key === "level" ? { "--chip-color": LEVEL_VARS[value] } : null,
        onclick: () => { state[key] = state[key] === value ? "all" : value; syncChips(); render(); },
        text: label,
      })));
    });
    function syncChips() {
      document.querySelectorAll("#filters .chips").forEach((group) => {
        const key = group.dataset.key;
        group.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.value === state[key])));
      });
    }
    // the sticky toolbar's height positions the level labels below it
    new ResizeObserver(() => section.style.setProperty("--top-h", `${top.offsetHeight}px`)).observe(top);
    search.addEventListener("input", () => { state.q = search.value.trim().toLowerCase(); render(); });
    document.getElementById("filter-reset").addEventListener("click", () => {
      Object.assign(state, { level: "all", robot: "all", hand: "all", object: "all", q: "" });
      search.value = "";
      syncChips();
      render();
    });

    // the overview matrix opens a suite here
    document.addEventListener("ml:filter", (e) => {
      Object.assign(state, e.detail, { q: "" });
      search.value = "";
      syncChips();
      render();
      document.getElementById("tasks").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // lazy video playback
    const playObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting) {
          if (!v.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      }
    }, { rootMargin: "200px 0px" });

    const cards = new Map();
    function card(t) {
      if (cards.has(t.env_id)) return cards.get(t.env_id);
      const media = el("div", { class: "task-media" });
      if (t.video) {
        const img = el("img", { class: "poster", src: `assets/posters/${t.env_id}.jpg`, alt: "", loading: "lazy", decoding: "async" });
        const v = el("video", { muted: true, loop: true, playsinline: true, preload: "none", "data-src": t.video.small, "aria-hidden": "true" });
        v.muted = true;
        v.addEventListener("playing", () => v.classList.add("ready"), { once: true });
        media.append(img, v);
      } else {
        media.append(el("div", { class: "empty", text: "Video coming soon" }));
      }
      const scores = POLICIES.map((p) => {
        const v = t.scores ? t.scores[p.key] : null;
        return { ...p, v: typeof v === "number" ? v : null };
      });
      media.append(
        el("h3", { class: "task-name", text: t.name }),
        el("div", { class: "task-scores" }, scores.map((s) => el("span", {
          class: s.v === null ? "ts na" : "ts", style: { "--c": s.color, "--v": String(s.v || 0) },
        }, el("i", { text: s.short }), el("b", { text: s.v === null ? "–" : `${Math.round(s.v * 100)}%` })))));
      const node = el("article", {
        class: "task", tabindex: 0, title: t.env_id, style: { "--lv": LEVEL_VARS[t.level] },
        "aria-label": `${t.display_name}, level ${t.level}, ${EMBODIMENT_LONG[t.embodiment] || ""}, ${t.object}. ` +
          scores.map((s) => `${s.name} ${s.v === null ? "not evaluated" : pct(s.v, 0)}`).join(", "),
        onmouseenter: () => zoomIn(node),
        onfocus: () => zoomIn(node),
        onmouseleave: zoomOut,
        onblur: zoomOut,
        onclick: () => openViewer(t),
        onkeydown: (e) => { if (e.key === "Enter") openViewer(t); },
      }, media);
      cards.set(t.env_id, node);
      return node;
    }

    function zoomIn(node) {
      if (window.matchMedia("(hover: none), (max-width: 760px)").matches) return;
      const g = (node.closest(".g-cols") || gallery).getBoundingClientRect(); // keep the level label uncovered
      const r = node.getBoundingClientRect();
      const zoom = r.width < 200 ? 1.95 : r.width < 260 ? 1.7 : 1.5;
      const grow = (r.width * (zoom - 1)) / 2;
      const growY = (r.height * (zoom - 1)) / 2;
      const ceiling = top.getBoundingClientRect().bottom + 8; // stay clear of the sticky toolbar
      let ox = "50%", oy = "50%";
      if (r.left - grow < g.left) ox = "0%";
      else if (r.right + grow > g.right) ox = "100%";
      if (r.top - growY < ceiling) oy = "0%";
      else if (r.bottom + growY > window.innerHeight - 8) oy = "100%";
      node.style.setProperty("--ox", ox);
      node.style.setProperty("--oy", oy);
      node.style.setProperty("--zoom", zoom);
      gallery.classList.add("zooming");
      const v = node.querySelector("video");
      if (v) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); }
    }
    function zoomOut() { gallery.classList.remove("zooming"); }

    function render() {
      const q = state.q;
      const shown = items.filter((t) =>
        (state.level === "all" || String(t.level) === state.level) &&
        (state.robot === "all" || t.robot === state.robot) &&
        (state.hand === "all" || t.hand === state.hand) &&
        (state.object === "all" || t.object === state.object) &&
        (!q || `${t.env_id} ${t.display_name} ${t.embodiment} ${t.domain}`.toLowerCase().includes(q)));
      playObs.disconnect();
      const inSuite = (t, s) => t.embodiment === s.emb && t.object === s.obj;
      const cols = SUITES.filter((s) => shown.some((t) => inSuite(t, s)));
      const levels = [1, 2, 3, 4].filter((l) => shown.some((t) => t.level === l));
      section.style.setProperty("--n", String(Math.max(1, cols.length)));
      renderHead(cols);
      let i = 0;
      gallery.replaceChildren(...levels.map((level) => el("div", { class: "g-row", style: { "--lv": LEVEL_VARS[level] } },
        el("div", { class: "g-rail" }, el("div", { class: "g-rail-in" }, el("b", { text: `L${level}` }), el("span", { text: LEVEL_NAMES[level] }))),
        el("div", { class: "g-cols" }, cols.map((s) => el("div", { class: "g-col" },
          shown.filter((t) => t.level === level && inSuite(t, s)).map((t) => {
            const c = card(t);
            c.style.animationDelay = `${Math.min(i++, 40) * 12}ms`;
            return c;
          })))))));
      gallery.querySelectorAll(".task").forEach((n) => playObs.observe(n));
      count.textContent = shown.length === items.length ? `${items.length} tasks` : `${shown.length} / ${items.length} tasks`;
      empty.hidden = shown.length > 0;
      head.hidden = shown.length === 0;
    }

    // column headers, aligned with the suite columns: embodiment (spanning its columns), then object type
    function renderHead(cols) {
      const ico = (name, flip) => el("img", { class: flip ? "flip" : null, src: `assets/icons/${name}.png`, alt: "", width: 192, height: 192, decoding: "async" });
      const groups = [];
      cols.forEach((s, k) => {
        const g = groups[groups.length - 1];
        if (g && g.emb === s.emb) g.n++;
        else groups.push({ emb: s.emb, start: k, n: 1 });
      });
      head.replaceChildren(el("div", { class: "g-corner" }), el("div", { class: "g-head-cols" },
        groups.map((g) => el("div", { class: "g-emb", style: { gridColumn: `${g.start + 1} / span ${g.n}` } },
          el("span", { class: "g-emb-ico" }, EMB_HEAD[g.emb].icons.map((n, k) => ico(n, k > 0))),
          el("span", { class: "g-emb-name", text: EMB_HEAD[g.emb].name }))),
        cols.map((s, k) => el("div", { class: "g-obj", style: { gridColumn: String(k + 1) } },
          ico(s.obj === "rigid" ? "obj-rigid" : "obj-deform"), el("span", { text: s.obj === "rigid" ? "Rigid" : "Deformable" })))));
    }
    render();
  }

  function shortName(t) {
    return String(t.display_name || t.env_id)
      .replace(/^Dual Arm\s+/, "")
      .replace(/\s+Env$/, "")
      .replace(/-v\d+$/, "");
  }
  function videoFor(t) {
    const s = VIDEO_STATUS[t.env_id];
    if (!s || !s.success) return null;
    return { small: `videos/tasks_sm/${t.env_id}.mp4`, full: s.video || `videos/tasks/${t.env_id}.mp4` };
  }

  /* ───────────── viewer ───────────── */
  const viewer = document.getElementById("viewer");
  const viewerVideo = document.getElementById("viewer-video");
  function openViewer(t) {
    if (!t.video || !viewer.showModal) return;
    document.getElementById("viewer-title").textContent = t.display_name;
    document.getElementById("viewer-meta").replaceChildren(
      el("span", { text: t.env_id }),
      el("span", { text: `Level ${t.level} · ${LEVEL_NAMES[t.level]}` }),
      el("span", { text: EMBODIMENT_LONG[t.embodiment] || t.embodiment }),
      el("span", { text: t.object === "deformable" ? "Deformable" : "Rigid body" }),
      ...(t.scores ? [["fm", "Small FM", "var(--s1)"], ["pi05", "π0.5", "var(--s2)"], ["astra", "GPT6-Astra", "var(--s3)"]]
        .filter(([k]) => typeof t.scores[k] === "number")
        .map(([k, label, c]) => el("span", { class: "viewer-score", style: { "--c": c }, text: `${label} ${Math.round(t.scores[k] * 100)}%` })) : []),
    );
    viewerVideo.src = t.video.full;
    viewer.showModal();
    viewerVideo.play().catch(() => {});
  }
  function closeViewer() { viewerVideo.pause(); viewerVideo.removeAttribute("src"); viewerVideo.load(); viewer.close(); }
  document.getElementById("viewer-close").addEventListener("click", closeViewer);
  viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
  viewer.addEventListener("cancel", (e) => { e.preventDefault(); closeViewer(); });

  /* ───────────── charts ───────────── */
  function addTable(container, headers, rows, source) {
    const table = el("table", { class: "data-table", hidden: true },
      el("thead", {}, el("tr", {}, headers.map((h) => el("th", { text: h })))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", { text: c }))))));
    const btn = el("button", {
      class: "table-toggle", type: "button", text: "Show table",
      onclick: () => { table.hidden = !table.hidden; btn.textContent = table.hidden ? "Show table" : "Hide table"; },
    });
    container.after(btn, table, source ? el("p", { class: "data-src", text: `Data: ${source}` }) : "");
  }

  // sequential blue ramp for magnitude
  const RAMP = ["#0f1a33", "#1d3f7a", "#2f6fd0", "#6fb0ff", "#d6ecff"];
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    const p = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(p)), f = p - i;
    const a = hex2rgb(RAMP[i]), b = hex2rgb(RAMP[i + 1]);
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
  }

  /* ───────────── experiments (paper Sec. V) ─────────────
     Five questions, one card each: the paper's finding as the headline, big numbers, and charts.
     Every number comes from data/experiments.js (copied from the paper's tables). One shared motion
     language: big numbers count up, bars grow, lines and arrows draw in, all once, when scrolled into view. */
  function initExperiments() {
    const XP = EXPERIMENTS;
    if (!XP || !XP.suites) return;
    const METHODS = [
      { key: "fm", name: "Small FM", c: "var(--s1)" },
      { key: "pi05", name: "π0.5", c: "var(--s2)" },
      { key: "astra", name: "GPT6-Astra", c: "var(--s3)" },
    ];
    const EMB_ICONS = { SG: ["ee-gripper"], SX: ["ee-dex"], DG: ["ee-gripper", "ee-gripper"], DX: ["ee-dex", "ee-dex"] };
    const EMB_NAME = { SG: "Single-arm gripper", SX: "Single-arm dex hand", DG: "Dual-arm grippers", DX: "Dual-arm dex hands" };
    const SUITE_C = { SG: "#3d8bff", SX: "#94c8ff", DG: "#e8622a", DX: "#ffb366" };
    const UP = [63, 207, 142], DOWN = [255, 107, 107];
    const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const sgn = (d) => (Math.abs(d) < 0.05 ? "0.0" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`);
    const arrowOf = (d) => (d > 0.05 ? "▲" : d < -0.05 ? "▼" : "■");
    const signC = (d) => (d > 0.05 ? "var(--up)" : d < -0.05 ? "var(--down)" : "var(--muted)");
    const tint = (d, full) => { const c = d >= 0 ? UP : DOWN; return `rgba(${c.join(",")},${(0.08 + Math.min(1, Math.abs(d) / full) * 0.5).toFixed(3)})`; };
    const suiteLabel = (lv, s) => `L${lv} · ${s.object === "deformable" ? "Deformable" : "Rigid"} · ${EMB_NAME[s.short]}`;

    // phones get compact drawings of the two wide SVG charts (re-drawn when crossing the breakpoint)
    const narrow = matchMedia("(max-width: 600px)");
    const afterFrame = (node) => requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("seen")));

    // once, when a node scrolls into view
    const seen = new Map();
    const seenObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seenObs.unobserve(e.target);
        e.target.classList.add("seen");
        (seen.get(e.target) || []).forEach((fn) => fn());
        seen.delete(e.target);
      }
    }, { threshold: 0.2 });
    function whenSeen(node, fn) {
      if (!seen.has(node)) { seen.set(node, []); seenObs.observe(node); }
      if (fn) seen.get(node).push(fn);
    }

    // lazy video loops, as in the gallery
    const playObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting && !reduceMotion) {
          if (!v.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else v.pause();
      }
    }, { rootMargin: "120px 0px" });
    function clip(id, poster, cls) {
      const box = el("span", { class: `xp-clip ${cls || ""}` },
        el("img", { src: poster || `assets/posters/${id}.jpg`, alt: "", loading: "lazy", decoding: "async" }));
      if (VIDEO_STATUS[id] && VIDEO_STATUS[id].success) {
        const v = el("video", { muted: true, loop: true, playsinline: true, preload: "none", "data-src": `videos/tasks_sm/${id}.mp4`, "aria-hidden": "true" });
        v.muted = true;
        v.addEventListener("playing", () => v.classList.add("ready"), { once: true });
        box.append(v);
      }
      playObs.observe(box);
      return box;
    }

    // big numbers. tiles: [{ parts: [{ v, d, s, c } | "glyph"], label, c }]
    function countTo(node, to, d, s) {
      const fmt = (v) => `${v.toFixed(d)}${s}`;
      if (reduceMotion) { node.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 1300;
      node.textContent = fmt(0);
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        node.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    function stats(id, tiles) {
      const host = document.getElementById(id);
      if (!host) return;
      const nums = [];
      host.replaceChildren(...tiles.map((t) => el("div", { class: "xp-stat", style: { "--c": t.c || "var(--text)" } },
        el("b", {}, t.parts.map((p) => {
          if (typeof p === "string") return el("i", { text: p });
          const n = el("span", { text: `${p.v.toFixed(p.d ?? 1)}${p.s ?? "%"}`, style: p.c ? { "--c": p.c } : null });
          nums.push([n, p]);
          return n;
        })),
        el("span", { class: "xp-stat-k", text: t.label }))));
      whenSeen(host, () => nums.forEach(([n, p]) => countTo(n, p.v, p.d ?? 1, p.s ?? "%")));
    }

    function legend(items) {
      return el("ul", { class: "legend xp-legend" }, items.map(([label, c, cls]) =>
        el("li", {}, el("i", { class: cls || null, style: { "--c": c } }), label)));
    }
    function hover(node, html) {
      node.addEventListener("mouseenter", (e) => showTip(html(), e));
      node.addEventListener("mousemove", moveTip);
      node.addEventListener("mouseleave", hideTip);
    }
    const tipRow = (label, value, c) => `<div class="tt-row"><span>${c ? `<i style="--c:${c}"></i>` : ""}${label}</span><b>${value}</b></div>`;

    // the benchmark's 4 × 8 suite grid (levels × object/embodiment), shared by Q1 and Q3
    function suiteGrid(host, cell) {
      const grid = el("div", { class: "xp-sg", role: "table", "aria-label": "Suites: level by object type and embodiment" });
      const ico = (n, flip) => el("img", { src: `assets/icons/${n}.png`, alt: "", class: flip ? "flip" : null, width: 192, height: 192, decoding: "async" });
      grid.append(el("div", { class: "xp-sg-corner" }),
        el("div", { class: "xp-sg-obj", style: { gridColumn: "2 / span 4" } }, ico("obj-rigid"), "Rigid"),
        el("div", { class: "xp-sg-obj g2", style: { gridColumn: "6 / span 4" } }, ico("obj-deform"), "Deformable"));
      grid.append(el("div", { class: "xp-sg-corner" }), ...XP.suites.map((s, j) => el("div", { class: `xp-sg-emb${j === 4 ? " g2" : ""}`, title: EMB_NAME[s.short] },
        el("span", { class: "xp-ico" }, EMB_ICONS[s.short].map((n, k) => ico(n, k > 0))), el("b", { text: s.short }))));
      const cells = [];
      for (const lv of [4, 3, 2, 1]) {
        grid.append(el("div", { class: "xp-sg-lv", style: { "--lv": LEVEL_VARS[lv] } }, `L${lv}`));
        XP.suites.forEach((s, j) => {
          const node = el("div", { class: `xp-sg-cell${j === 4 ? " g2" : ""}`, role: "cell", style: { "--dl": `${(lv - 1) * 150 + j * 40}ms` } });
          cell(node, lv - 1, j, s);
          grid.append(node);
          cells.push({ node, i: lv - 1, j, s });
        });
      }
      host.append(grid);
      whenSeen(grid);
      return { grid, cells };
    }

    function seg(host, options, onPick) {
      host.replaceChildren(...options.map(([key, label], k) => el("button", {
        type: "button", role: "tab", "aria-selected": String(k === 0), "data-k": key, text: label,
        onclick: (e) => {
          host.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget)));
          onPick(key);
        },
      })));
    }

    /* ── Q1 · Tables IV + V: the best method per suite ── */
    (function q1() {
      const host = document.getElementById("xp-chart-q1");
      const D = XP.q1;
      if (!host || !D) return;
      const val = (k, i, j) => (k === "pi05" ? D.pi05[i][j] : k === "astra" ? D.astra[i][j] : D.pi05[i][j] - D.pi05VsFm[i][j]);
      const wins = { fm: 0, pi05: 0, astra: 0 };
      const bar = el("div", { class: "xp-bar" });
      const seg1 = el("div", { class: "seg", role: "tablist", "aria-label": "View" });
      const keyBox = el("div", { class: "xp-key" });
      bar.append(seg1, keyBox);
      host.append(bar);
      const { grid, cells } = suiteGrid(host, (node, i, j, s) => {
        const vs = METHODS.map((m) => val(m.key, i, j));
        const best = Math.max(...vs), wi = vs.indexOf(best);
        wins[METHODS[wi].key]++;
        node.style.setProperty("--w", METHODS[wi].c);
        node.append(
          el("div", { class: "c-best" },
            el("b", { class: "c-num", text: f1(best) }),
            el("div", { class: "c-bars" }, METHODS.map((m, k) => el("i", { class: k === wi ? "win" : null, style: { "--h": `${Math.max(vs[k], 1)}%`, "--c": m.c } })))),
          el("div", { class: "c-delta" }, el("b", { class: "c-num" })));
        hover(node, () => `<div class="tt-title">${suiteLabel(i + 1, s)}</div>` +
          METHODS.map((m, k) => tipRow(m.name, `${f1(vs[k])}%`, m.c)).join("") +
          `<div class="tt-sub">π0.5 vs Small FM ${sgn(D.pi05VsFm[i][j])} · GPT6-Astra vs π0.5 ${sgn(D.astraVsPi05[i][j])}</div>`);
      });
      grid.dataset.view = "best";
      const KEYS = {
        best: legend(METHODS.map((m) => [m.name, m.c])),
        d: legend([["gain", "var(--up)"], ["loss", "var(--down)"]]),
      };
      keyBox.append(KEYS.best);
      seg(seg1, [["best", "Best of three"], ["pf", "π0.5 vs Small FM"], ["ap", "GPT6-Astra vs π0.5"]], (view) => {
        grid.dataset.view = view;
        keyBox.replaceChildren(view === "best" ? KEYS.best : KEYS.d);
        if (view === "best") return;
        for (const { node, i, j } of cells) {
          const d = view === "pf" ? D.pi05VsFm[i][j] : D.astraVsPi05[i][j];
          const box = node.querySelector(".c-delta");
          box.firstChild.textContent = sgn(d);
          box.style.setProperty("--dc", signC(d));
          box.style.background = tint(d, 40);
        }
      });
      stats("xp-stats-q1", METHODS.map((m) => ({ parts: [{ v: wins[m.key], d: 0, s: "" }, `/ ${cells.length}`], label: m.name, c: m.c })));
    })();

    /* ── Q2a · Table VI: transfer across levels (arrows from the source level into the target level) ── */
    function levelTransfer(host, key, animate) {
      const D = XP.q2.levels[key];
      const compact = narrow.matches, W = compact ? 420 : 560, H = 420, X0 = compact ? 70 : 84, X1 = W - 20, VMAX = 70, BW = compact ? 52 : 60;
      const X = (v) => X0 + (v / VMAX) * (X1 - X0);
      const ROW = { 3: 62, 2: 206, 1: 350 }, BH = { 3: 28, 2: 36, 1: 28 };
      // where each arrow leaves its source bar (as a success value), and which side its label sits on
      const START = { "2>1": 30, "1>2": 54, "3>2": 13, "2>3": 5 };
      // label spots in the empty space between rows: [x, anchor] (x may depend on where the arrow lands)
      const LAB = {
        "2>1": () => [W, "end"],
        "1>2": (ex, w) => [Math.min(X(18), ex - w / 2 - 8), "end"],
        "3>2": (ex, w) => [Math.max(X(22), ex + w / 2 + 8), "start"],
        "2>3": () => [X0 - 8, "end"],
      };
      const s = svg("svg", { class: "xp-lt", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Transfer across difficulty levels" });
      for (const t of [0, 20, 40, 60]) {
        s.append(svg("line", { class: t ? "grid" : "baseline", x1: X(t), x2: X(t), y1: 22, y2: H - 34 }),
          svg("text", { class: "axis-label", x: X(t), y: H - 12, "text-anchor": "middle", text: `${t}%` }));
      }
      for (const lv of [3, 2, 1]) {
        const y = ROW[lv], h = BH[lv], iso = D.iso[lv], top = y - h / 2;
        s.append(
          svg("rect", { class: "lt-badge", x: 0, y: y - 21, width: BW, height: 42, rx: 11, style: { "--lv": LEVEL_VARS[lv] } }),
          svg("text", { class: "lt-badge-t", x: BW / 2, y: y + 7, "text-anchor": "middle", style: { "--lv": LEVEL_VARS[lv] }, text: `L${lv}` }),
          svg("rect", { class: "lt-track", x: X0, y: top, width: X1 - X0, height: h, rx: 6 }),
          svg("rect", { class: "lt-iso grow", x: X0, y: top, width: Math.max(2, X(iso) - X0), height: h, rx: 6, style: { "--lv": LEVEL_VARS[lv] } }));
        const into = D.xfer.filter((x) => x.to === lv);
        into.forEach((x) => {
          const half = into.length > 1 ? (x.from > lv ? 0 : 1) : -1; // L2: from above → top half, from below → bottom half
          const yy = half < 0 ? top : top + (half * h) / 2, hh = half < 0 ? h : h / 2;
          const lo = Math.min(iso, x.v), hi = Math.max(iso, x.v);
          s.append(svg("rect", { class: "lt-delta late", x: X(lo), y: yy, width: Math.max(2, X(hi) - X(lo)), height: hh, fill: signC(x.d) }));
        });
        // the level-alone score: inside the bar, left of any change; outside when the bar is too short
        const vs = [iso, ...into.map((x) => x.v)], inner = X(Math.min(...vs)) - 8;
        s.append(inner > X0 + 44
          ? svg("text", { class: "lt-iso-v in", x: inner, y: y + 5, "text-anchor": "end", text: f1(iso) })
          : svg("text", { class: "lt-iso-v", x: X(Math.max(...vs)) + 10, y: y + 5, text: f1(iso) }));
      }
      D.xfer.forEach((x, k) => {
        const id = `${x.from}>${x.to}`, down = x.from > x.to; // rows run L3 (top) → L1 (bottom): a higher source sits above
        const sy = down ? ROW[x.from] + BH[x.from] / 2 + 3 : ROW[x.from] - BH[x.from] / 2 - 3;
        const ey = down ? ROW[x.to] - BH[x.to] / 2 - 3 : ROW[x.to] + BH[x.to] / 2 + 3;
        const sx = X(START[id]), ex = Math.max(X(x.v), X0 + 6);
        const w = 2.5 + Math.abs(x.d) * 1.5, hl = 9 + w * 0.55, hw = w / 2 + 5;
        const dir = down ? 1 : -1, ey2 = ey - dir * hl, dy = ey2 - sy;
        const d = `M${sx},${sy} C${sx},${sy + dy * 0.55} ${ex},${ey2 - dy * 0.55} ${ex},${ey2}`;
        const c = signC(x.d), dl = `${0.5 + k * 0.18}s`;
        const g = svg("g", { class: "lt-arrow", style: { "--dl": dl } });
        g.append(
          svg("path", { class: "arr", d, pathLength: 1, stroke: c, "stroke-width": w, fill: "none" }),
          svg("path", { class: "head", d: `M${ex - hw},${ey2} L${ex + hw},${ey2} L${ex},${ey} Z`, fill: c }));
        // the score after transfer, beside the arrowhead (right of it when there is no room on the left)
        const vx = x.d < 0 && ex - hw - 40 > X0 ? ex - hw - 5 : ex + hw + 5;
        g.append(svg("text", { class: "lt-val late", x: vx, y: down ? ey - 7 : ey + 19, "text-anchor": vx < ex ? "end" : "start", style: { fill: c }, text: f1(x.v) }));
        const gap = Math.min(ROW[x.from], ROW[x.to]), my = (gap + Math.max(ROW[x.from], ROW[x.to])) / 2;
        const [lx, anchor] = LAB[id](ex, w);
        g.append(
          svg("text", { class: "lt-d", x: lx, y: my - 2, "text-anchor": anchor, style: { fill: c }, text: `${arrowOf(x.d)} ${Math.abs(x.d).toFixed(1)}` }),
          svg("text", { class: "lt-k", x: lx, y: my + 17, "text-anchor": anchor, text: `L${x.from} → L${x.to}` }),
          svg("path", { class: "hit", d, "stroke-width": Math.max(18, w + 10), fill: "none", stroke: "transparent" }));
        hover(g, () => `<div class="tt-title">Level ${x.from} → Level ${x.to}</div>` +
          tipRow(`Level ${x.to} only`, `${f1(D.iso[x.to])}%`) + tipRow(`after Level ${x.from}`, `${f1(x.v)}%`) +
          `<div class="tt-row"><span>change</span><b style="color:${c}">${sgn(x.d)} pp</b></div>`);
        s.append(g);
      });
      host.replaceChildren(s);
      if (animate) afterFrame(s);
      else whenSeen(s);
    }

    /* ── Q2b · Table VII: complementary Level-2 suites, transfer both ways ── */
    function suitePairs(host) {
      const VMAX = 30;
      const wrap = el("div", { class: "xp-pairs" });
      XP.q2.pairs.forEach((p, k) => {
        const side = (cls, iso, x, from, to) => {
          const lo = Math.min(iso, x.v), hi = Math.max(iso, x.v);
          const node = el("div", { class: `xp-pbar ${cls}`, style: { "--dl": `${0.2 + k * 0.15}s` } },
            el("b", { class: "xp-pval", style: { "--c": signC(x.d) }, text: f1(x.v) }),
            el("span", { class: "xp-ptrack" },
              el("i", { class: "iso", style: { "--w": `${(iso / VMAX) * 100}%` } }),
              el("i", { class: "dl", style: { "--a": `${(lo / VMAX) * 100}%`, "--w": `${((hi - lo) / VMAX) * 100}%`, "--c": signC(x.d) } }),
              el("em", { text: f1(iso) })));
          hover(node, () => `<div class="tt-title">${from} → ${to}</div>` + tipRow(`${to} only`, `${f1(iso)}%`) +
            tipRow(`after ${from}`, `${f1(x.v)}%`) + `<div class="tt-row"><span>change</span><b style="color:${signC(x.d)}">${sgn(x.d)} pp</b></div>`);
          return node;
        };
        const arrow = (x, rtl) => {
          const w = 2 + Math.abs(x.d) * 1.15, hl = 8 + w * 0.5, hw = w / 2 + 5, y = 14;
          const a = rtl ? 96 : 4, b = rtl ? 4 : 96, tip = rtl ? b + hl : b - hl;
          return el("span", { class: `xp-parr ${rtl ? "rtl" : ""}`, style: { "--c": signC(x.d), "--dl": `${0.45 + k * 0.15 + (rtl ? 0.12 : 0)}s` } },
            el("b", { text: `${arrowOf(x.d)} ${Math.abs(x.d).toFixed(1)}` }),
            svg("svg", { viewBox: "0 0 100 28", preserveAspectRatio: "none", "aria-hidden": "true" },
              svg("path", { class: "arr", d: `M${a},${y} L${tip},${y}`, pathLength: 1, "stroke-width": w, stroke: "currentColor", fill: "none" }),
              svg("path", { class: "head", d: `M${tip},${y - hw} L${b},${y} L${tip},${y + hw} Z`, fill: "currentColor" })));
        };
        wrap.append(el("div", { class: "xp-pair" },
          el("span", { class: "xp-pair-k", text: p.axis }),
          side("l", p.isoA, p.bToA, p.b, p.a),
          el("figure", { class: "xp-pm" }, clip(p.aTask), el("figcaption", { text: p.a })),
          el("span", { class: "xp-parrs" }, arrow(p.aToB, false), arrow(p.bToA, true)),
          el("figure", { class: "xp-pm" }, clip(p.bTask), el("figcaption", { text: p.b })),
          side("r", p.isoB, p.aToB, p.a, p.b)));
      });
      host.append(wrap, legend([["target suite alone", "color-mix(in srgb, var(--l2) 55%, transparent)"], ["gain", "var(--up)"], ["loss", "var(--down)"]]));
      whenSeen(wrap);
    }

    (function q2() {
      const a = document.getElementById("xp-chart-q2a"), b = document.getElementById("xp-chart-q2b");
      if (!a || !b || !XP.q2) return;
      let set = "all";
      levelTransfer(a, set, false);
      narrow.addEventListener("change", () => levelTransfer(a, set, true));
      a.after(legend([["level alone", "color-mix(in srgb, var(--l2) 55%, transparent)"], ["gain", "var(--up)"], ["loss", "var(--down)"]]));
      seg(document.getElementById("xp-q2-set"), [["all", "All"], ["rigid", "Rigid"], ["deformable", "Deformable"]], (k) => levelTransfer(a, (set = k), true));
      suitePairs(b);
      const lv = XP.q2.levels.all.xfer, pr = XP.q2.pairs.flatMap((p) => [p.aToB, p.bToA]);
      stats("xp-stats-q2", [
        { parts: [{ v: lv.filter((x) => x.d > 0).length, d: 0, s: "" }, "/", { v: lv.length, d: 0, s: "" }], label: "level transfers help", c: "var(--down)" },
        { parts: [{ v: pr.filter((x) => x.d > 0).length, d: 0, s: "" }, "/", { v: pr.length, d: 0, s: "" }], label: "suite transfers help", c: "var(--up)" },
      ]);
    })();

    /* ── Q3 · Tables IV, VI, VIII: success falls as more tasks share one policy ── */
    (function q3() {
      const a = document.getElementById("xp-chart-q3a"), b = document.getElementById("xp-chart-q3b");
      const D = XP.q3;
      if (!a || !b || !D) return;
      const st = D.perLevel.st, mta = D.perLevel.mta;
      // slope chart: 1 task → 28 (one level) → 112 (all) tasks per policy
      const W = 460, H = 540, L = 64, R = 64, T = 26, B = 64, VMAX = 80;
      const XS = [L, (L + W - R) / 2, W - R];
      const Y = (v) => T + (1 - v / VMAX) * (H - T - B);
      const s = svg("svg", { class: "xp-slope", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Mean success per level for one policy per task, per level and for all tasks" });
      for (const t of [0, 20, 40, 60, 80]) s.append(svg("line", { class: t ? "grid" : "baseline", x1: L - 10, x2: W - R + 10, y1: Y(t), y2: Y(t) }));
      [["1 task", "ST"], ["28 tasks", "MT-L"], ["112 tasks", "MT-A"]].forEach(([n, k], i) => s.append(
        svg("text", { class: "sl-x", x: XS[i], y: H - B + 26, "text-anchor": "middle", text: n }),
        svg("text", { class: "axis-label", x: XS[i], y: H - B + 44, "text-anchor": "middle", text: k })));
      const ends = { l: [], r: [] };
      [1, 2, 3, 4].forEach((lv) => {
        const pts = [[XS[0], st[lv - 1]], ...(D.mtl[lv] !== undefined ? [[XS[1], D.mtl[lv]]] : []), [XS[2], mta[lv - 1]]];
        const g = svg("g", { class: "sl-line", style: { "--lv": LEVEL_VARS[lv], "--dl": `${0.2 + (lv - 1) * 0.15}s` } });
        g.append(svg("path", { class: "arr", d: `M${pts.map(([x, v]) => `${x},${Y(v)}`).join(" L")}`, pathLength: 1 }));
        pts.forEach(([x, v], k) => {
          g.append(svg("circle", { class: "late", cx: x, cy: Y(v), r: k === 0 || k === pts.length - 1 ? 6 : 4.5 }));
          if (x === XS[1]) g.append(svg("text", { class: "sl-mid late", x, y: Y(v) - 11, "text-anchor": "middle", text: f1(v) }));
        });
        ends.l.push({ lv, v: st[lv - 1], y: Y(st[lv - 1]), g });
        ends.r.push({ lv, v: mta[lv - 1], y: Y(mta[lv - 1]), g });
        hover(g, () => `<div class="tt-title">Level ${lv}</div>` + tipRow("ST · one per task", `${f1(st[lv - 1])}%`) +
          (D.mtl[lv] !== undefined ? tipRow("MT-L · one per level", `${f1(D.mtl[lv])}%`) : "") + tipRow("MT-A · one for all", `${f1(mta[lv - 1])}%`));
        s.append(g);
      });
      // end labels, dodged so close values do not overlap
      for (const [side, list] of Object.entries(ends)) {
        list.sort((p, q) => q.y - p.y).forEach((e, k, arr) => { if (k) e.y = Math.min(e.y, arr[k - 1].y - 17); });
        list.forEach((e) => e.g.append(svg("text", {
          class: "sl-end late", x: side === "l" ? XS[0] - 12 : XS[2] + 12, y: e.y + 5, "text-anchor": side === "l" ? "end" : "start", text: f1(e.v),
        })));
      }
      a.append(s, legend([1, 2, 3, 4].map((lv) => [`Level ${lv}`, LEVEL_VARS[lv], "line"])));
      whenSeen(s);

      // every suite: ST (outline) vs MT-A (solid), with the drop
      const { cells } = suiteGrid(b, (node, i, j, s2) => {
        const stv = XP.q1.pi05[i][j], m = D.mta[i][j], d = D.mtaVsSt[i][j];
        node.style.background = tint(d, 70);
        node.append(el("div", { class: "c-best c-drop" },
          el("b", { class: "c-num", style: { "--w": "var(--down)" }, text: sgn(d) }),
          el("div", { class: "c-bars two" },
            el("i", { class: "ghost", style: { "--h": `${Math.max(stv, 1)}%`, "--c": "var(--s2)" } }),
            el("i", { class: "win", style: { "--h": `${Math.max(m, 1)}%`, "--c": "var(--s2)" } }))));
        hover(node, () => `<div class="tt-title">${suiteLabel(i + 1, s2)}</div>` + tipRow("ST", `${f1(stv)}%`) + tipRow("MT-A", `${f1(m)}%`, "var(--s2)") +
          `<div class="tt-row"><span>change</span><b style="color:var(--down)">${sgn(d)} pp</b></div>`);
      });
      b.append(legend([["ST · one policy per task", "var(--s2)", "ghost"], ["MT-A · one policy, 112 tasks", "var(--s2)"]]));
      const drops = cells.filter(({ i, j }) => D.mtaVsSt[i][j] < 0).length;
      stats("xp-stats-q3", [
        { parts: [{ v: D.overall.st, c: "var(--s2)" }, "→", { v: D.overall.mta, c: "var(--down)" }], label: "ST → MT-A, all tasks", c: "var(--text)" },
        { parts: [{ v: drops, d: 0, s: "" }, "/", { v: cells.length, d: 0, s: "" }], label: "suites drop", c: "var(--down)" },
      ]);
    })();

    /* ── Q4 · Fig. 8: data scaling ── */
    (function q4() {
      const host = document.getElementById("xp-chart-q4");
      const D = XP.q4;
      if (!host || !D) return;
      const series = [...D.series.map((x) => ({ ...x, c: SUITE_C[x.key] })), { key: "all", name: "All 16 tasks", values: D.all, c: "var(--text)", main: true }];
      function draw(animate) {
        const compact = narrow.matches;
        const W = compact ? 420 : 760, H = compact ? 340 : 380, L = 54, R = compact ? 70 : 210, T = 18, B = 50, VMAX = 60;
        const lx = (n) => L + ((Math.log(n) - Math.log(D.demos[0])) / (Math.log(D.demos[D.demos.length - 1]) - Math.log(D.demos[0]))) * (W - L - R);
        const Y = (v) => T + (1 - v / VMAX) * (H - T - B);
        const s = svg("svg", { class: "xp-scale", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Success rate vs. demonstrations per task" });
        for (const t of [0, 20, 40, 60]) s.append(
          svg("line", { class: t ? "grid" : "baseline", x1: L, x2: W - R + 14, y1: Y(t), y2: Y(t) }),
          svg("text", { class: "axis-label", x: L - 10, y: Y(t) + 4, "text-anchor": "end", text: `${t}%` }));
        D.demos.forEach((n) => s.append(svg("text", { class: "sc-x", x: lx(n), y: H - B + 24, "text-anchor": "middle", text: String(n) })));
        s.append(svg("text", { class: "axis-label", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle", text: "demonstrations per task" }));
        const cross = svg("line", { class: "sc-cross", x1: 0, x2: 0, y1: T, y2: H - B });
        s.append(cross);
        const ends = [];
        series.forEach((sr, k) => {
          const pts = sr.values.map((v, i) => [lx(D.demos[i]), Y(v)]);
          const g = svg("g", { class: `sc-line${sr.main ? " main" : ""}`, style: { "--c": sr.c, "--dl": `${sr.main ? 0.15 : 0.35 + k * 0.12}s` } });
          g.append(svg("path", { class: "arr", d: `M${pts.map((p) => p.join(",")).join(" L")}`, pathLength: 1 }));
          pts.forEach(([x, y], i) => g.append(svg("circle", { class: "late", cx: x, cy: y, r: sr.main ? 6 : 4.5, style: { "--dl2": `${0.9 + i * 0.08}s` } })));
          s.append(g);
          ends.push({ sr, y: Y(sr.values[sr.values.length - 1]), g });
        });
        ends.sort((p, q) => p.y - q.y).forEach((e, k, arr) => { if (k) e.y = Math.max(e.y, arr[k - 1].y + 22); });
        ends.forEach(({ sr, y, g }) => g.append(svg("text", { class: `sc-end late${sr.main ? " main" : ""}`, x: lx(D.demos[D.demos.length - 1]) + 16, y: y + 6 },
          svg("tspan", { class: "v", text: f1(sr.values[sr.values.length - 1]) }), compact ? null : svg("tspan", { class: "n", dx: 8, text: sr.name }))));
        const hit = svg("rect", { class: "hit", x: L - 20, y: T, width: W - L - R + 40, height: H - T - B });
        hit.addEventListener("mousemove", (evt) => {
          const pt = s.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
          const loc = pt.matrixTransform(s.getScreenCTM().inverse());
          let i = 0;
          D.demos.forEach((n, k) => { if (Math.abs(lx(n) - loc.x) < Math.abs(lx(D.demos[i]) - loc.x)) i = k; });
          cross.setAttribute("x1", lx(D.demos[i])); cross.setAttribute("x2", lx(D.demos[i])); cross.classList.add("on");
          showTip(`<div class="tt-title">${D.demos[i]} demos per task</div>` +
            [...series].sort((p, q) => q.values[i] - p.values[i]).map((sr) => tipRow(sr.name, `${f1(sr.values[i])}%`, sr.c)).join(""), evt);
        });
        hit.addEventListener("mouseleave", () => { cross.classList.remove("on"); hideTip(); });
        s.append(hit);
        host.replaceChildren(s, ...(compact ? [legend([...series].reverse().map((sr) => [sr.name, sr.c, "line"]))] : []));
        if (animate) afterFrame(s);
        else whenSeen(s);
      }
      draw(false);
      narrow.addEventListener("change", () => draw(true));
      const gain = D.all[D.all.length - 1] - D.all[0];
      stats("xp-stats-q4", [
        { parts: [{ v: D.demos[D.demos.length - 1] / D.demos[0], d: 0, s: "×" }], label: "more demos", c: "var(--text)" },
        { parts: [{ v: D.all[0] }, "→", { v: D.all[D.all.length - 1] }], label: `mean success, +${gain.toFixed(1)} pp`, c: "var(--text)" },
      ]);
    })();

    /* ── Q5 · Table IX + Fig. 7: real vs. simulation, level by level ── */
    (function q5() {
      const host = document.getElementById("xp-chart-q5");
      const D = XP.q5;
      if (!host || !D) return;
      const wrap = el("div", { class: "xp-real" });
      const byLevel = [1, 2, 3, 4].map((lv) => D.tasks.filter((t) => t.level === lv));
      byLevel.forEach((tasks, li) => {
        const lv = li + 1;
        wrap.append(el("div", { class: "xp-real-g", style: { "--lv": LEVEL_VARS[lv] } },
          el("h4", {}, `L${lv}`, el("small", { text: LEVEL_NAMES[lv] })),
          el("div", { class: "xp-real-tasks" }, tasks.map((t, k) => {
            const bars = el("div", { class: "xp-rt-bars", style: { "--dl": `${0.15 + li * 0.18 + k * 0.08}s` } },
              [["real", t.real, "var(--real)"], ["sim", t.sim, "var(--s1)"]].map(([kk, v, c]) => el("span", { class: kk, style: { "--c": c } },
                el("b", { text: `${v}` }), el("i", { style: { "--h": `${Math.max(v, 1.5)}%` } }))));
            const node = el("figure", { class: "xp-rt" },
              bars,
              el("span", { class: "xp-rt-m real" }, el("img", { src: `assets/real/${t.name}-real.jpg`, alt: `${t.name}, real-world setup`, loading: "lazy", decoding: "async" }), el("em", { text: "Real" })),
              el("span", { class: "xp-rt-m sim" }, clip(t.id, `assets/real/${t.name}-sim.jpg`), el("em", { text: "Sim" })),
              el("figcaption", { text: t.name.replace(/([a-z])([A-Z])/g, "$1\u200b$2") }));
            hover(bars, () => `<div class="tt-title">${t.name} · Level ${lv}</div>` + tipRow("real world", `${t.real}%`, "var(--real)") + tipRow("simulation", `${t.sim}%`, "var(--s1)"));
            return node;
          }))));
      });
      host.append(wrap, legend([["real world", "var(--real)"], ["simulation", "var(--s1)"]]));
      whenSeen(wrap);
      stats("xp-stats-q5", byLevel.map((tasks, li) => ({
        parts: [{ v: tasks.reduce((a, t) => a + t.real, 0) / tasks.length, d: 0 }],
        label: `L${li + 1} real`, c: LEVEL_VARS[li + 1],
      })));
    })();
  }

  /* ───────────── citation ───────────── */
  const copyBtn = document.getElementById("copy-bib");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById("bib").innerText);
      copyBtn.textContent = "Copied";
    } catch (e) {
      copyBtn.textContent = "Select & copy";
    }
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  });

  /* ───────────── overview: how a task earns its level (the calibration loop, animated) ───────────── */
  // One real example, HangMug with a Level-2 target. The three design rounds and their best success rates
  // (75% -> 60% -> 46%) are the authors' own, from the ManiLadder talk (media in assets/calib/).
  // The per-checkpoint curve is schematic: only its peak, the best success rate, is a measured value.
  function initLevelFlow() {
    const root = document.getElementById("lf");
    if (!root) return;
    const ROUNDS = [
      { cap: "mug left, rack right", val: 75, verdict: "too easy", ok: false, clip: 3300, curve: [0.3, 0.56, 0.78, 0.91, 1, 0.94, 0.9, 0.95] },
      { cap: "+ random mug rotation, 360°", val: 60, verdict: "still too easy", ok: false, clip: 3500, curve: [0.26, 0.5, 0.74, 0.86, 0.93, 1, 0.92, 0.95] },
      { cap: "random sector, 180° rotation", val: 46, verdict: "in range", ok: true, clip: 4700, curve: [0.2, 0.44, 0.63, 0.8, 0.9, 0.86, 1, 0.93] },
    ];
    const DUR = [1900, 0, 2100, 2700, 2700];   // design, collect (= clip length), train, evaluate, check
    const steps = [...root.querySelectorAll(".lf-step")];
    const imgs = [...root.querySelectorAll(".lf-scene img")];
    const vids = [...root.querySelectorAll(".lf-demo video")];
    const roundBtns = [...root.querySelectorAll(".lf-rounds button")];
    const $ = (id) => document.getElementById(id);
    const cap = $("lf-cap"), count = $("lf-count"), prog = $("lf-prog"), stepsLab = $("lf-steps");
    const chart = $("lf-chart"), best = $("lf-best"), mark = $("lf-mark"), val = $("lf-val"), verdict = $("lf-verdict");
    const playBtn = $("lf-play");
    const ease = (p) => 1 - Math.pow(1 - p, 3);

    // the policy glyph: three layers of nodes, pulsing layer by layer while training
    const net = $("lf-net");
    const layers = [[30, 58, 86], [20, 44, 68, 92], [30, 58, 86]].map((ys, k) => ys.map((y) => [48 + k * 52, y]));
    for (let k = 0; k < 2; k++) for (const a of layers[k]) for (const b of layers[k + 1]) net.append(svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: { "--d": `${k * 0.3}s` } }));
    layers.forEach((nodes, k) => nodes.forEach(([x, y]) => net.append(svg("circle", { cx: x, cy: y, r: 5.5, style: { "--d": `${k * 0.3}s` } }))));

    // the eight evaluation checkpoints of the current round
    let pts = [], line = null, ring = null, lineLen = 0, drawn = -1;
    function drawChart(r) {
      if (drawn === r) return;
      drawn = r;
      const R = ROUNDS[r];
      const xy = R.curve.map((c, i) => [26 + i * 21.2, 122 - R.val * c * 0.8]);
      const bi = R.curve.indexOf(1);
      line = svg("path", { class: "ln", d: "M" + xy.map((q) => q.map((n) => n.toFixed(1)).join(" ")).join("L") });
      ring = svg("circle", { class: "ring", cx: xy[bi][0], cy: xy[bi][1], r: 7.5 });
      pts = xy.map(([x, y]) => svg("circle", { class: "pt", cx: x, cy: y, r: 4 }));
      chart.replaceChildren(
        svg("line", { class: "ax", x1: 16, y1: 126.5, x2: 184, y2: 126.5 }),
        svg("text", { class: "tk", x: xy[0][0], y: 140, "text-anchor": "middle", text: "5k" }),
        svg("text", { class: "tk", x: xy[7][0], y: 140, "text-anchor": "middle", text: "40k steps" , dx: -12 }),
        line, ring, ...pts);
      lineLen = line.getTotalLength();
      line.style.strokeDasharray = `${lineLen}`;
    }

    // each step's picture at progress p (0 = not started, 1 = finished) of round r
    const PAINT = [
      () => {},
      (p) => { count.textContent = Math.round(p * 20); },
      (p) => { prog.style.setProperty("--p", p.toFixed(3)); stepsLab.textContent = `${Math.round(p * 40)}k`; },
      (p, r) => {
        drawChart(r);
        const q = Math.min(1, p / 0.7);
        const n = p >= 1 ? 8 : Math.floor(q * 8);
        pts.forEach((c, i) => c.classList.toggle("show", i < n));
        line.style.strokeDashoffset = `${lineLen * (1 - (n <= 1 ? 0 : (n - 1) / 7))}`;
        ring.classList.toggle("show", p >= 0.74);
        best.textContent = p < 0.74 ? "–" : `${Math.round(ROUNDS[r].val * ease(Math.min(1, (p - 0.74) / 0.2)))}%`;
      },
      (p, r) => {
        const R = ROUNDS[r], from = r ? ROUNDS[r - 1].val : 0;
        const v = from + (R.val - from) * ease(Math.min(1, p / 0.5));
        mark.style.setProperty("--v", v.toFixed(2));
        val.textContent = `${Math.round(v)}%`;
        mark.classList.toggle("show", p > 0);
        mark.classList.toggle("ghost", p === 0 && r > 0);   // the last round's result waits there until this round is measured
        const judged = p >= 0.62;
        verdict.textContent = judged ? R.verdict : "";
        verdict.classList.toggle("show", judged);
        mark.classList.toggle("ok", judged && R.ok);
        mark.classList.toggle("bad", judged && !R.ok);
      },
    ];

    let round = 0, step = 0, token = 0, timer = 0, running = false, visible = false, playing = !reduceMotion;

    // put round r on screen with steps before s finished and the rest untouched
    function show(r, s) {
      round = r; step = s;
      root.classList.remove("redo", "final");
      roundBtns.forEach((b, i) => { b.classList.toggle("on", i === r); b.classList.toggle("past", i < r); b.setAttribute("aria-pressed", i === r ? "true" : "false"); });
      imgs.forEach((n, i) => n.classList.toggle("on", i === r));
      vids.forEach((v, i) => {
        v.classList.toggle("on", i === r);
        if (i !== r || s < 1) { v.pause(); try { v.currentTime = 0; } catch { /* not loaded yet */ } }
      });
      cap.replaceChildren(el("b", { text: `v${r + 1}` }), ROUNDS[r].cap);
      steps.forEach((n, i) => { n.classList.toggle("is-done", i < s); n.classList.toggle("is-on", i === s); PAINT[i](i < s ? 1 : 0, r); });
    }
    function showEnd(r) {   // the finished round, with no motion
      show(r, 5);
      if (ROUNDS[r].ok) root.classList.add("final");
    }
    function go(r, s) {
      halt();
      running = true;
      show(r, s);
      const tk = token, ms = s === 1 ? ROUNDS[r].clip : DUR[s], t0 = performance.now();
      if (s === 1) vids[r].play().catch(() => {});
      (function frame(now) {
        if (tk !== token) return;
        const p = Math.min(1, Math.max(0, (now - t0) / ms));
        PAINT[s](p, r);
        if (p < 1) requestAnimationFrame(frame);
      })(t0);
      timer = setTimeout(next, ms + 320);
    }
    function next() {
      if (step < 4) return go(round, step + 1);
      show(round, 5);
      running = true;
      if (ROUNDS[round].ok) {
        root.classList.add("final");
        timer = setTimeout(() => go(0, 0), 6500);
      } else {
        root.classList.add("redo");
        timer = setTimeout(() => go(round + 1, 0), 2100);
      }
    }
    function halt() { token++; clearTimeout(timer); running = false; vids.forEach((v) => v.pause()); }
    function resume() {
      if (running || !playing || !visible) return;
      if (root.classList.contains("final")) go(0, 0);
      else if (root.classList.contains("redo")) go(round + 1, 0);
      else go(round, Math.min(step, 4));
    }
    function setPlaying(v) {
      playing = v;
      root.classList.toggle("paused", !v);
      playBtn.setAttribute("aria-label", v ? "Pause the animation" : "Play the animation");
      if (v) resume(); else halt();
    }

    roundBtns.forEach((b, i) => b.addEventListener("click", () => { if (playing && visible) go(i, 0); else { halt(); showEnd(i); } }));
    playBtn.addEventListener("click", () => setPlaying(!playing));
    root.classList.toggle("paused", !playing);
    if (!playing) playBtn.setAttribute("aria-label", "Play the animation");
    if (playing) show(0, 0); else showEnd(2);
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) resume(); else halt();
    }, { threshold: 0.3 }).observe(root);
  }

  /* ───────────── overview: what one suite holds ───────────── */
  // One example suite per object type. The skill labels follow the paper's Fig. 3 and the talk deck.
  function initSuiteInside() {
    const EXAMPLES = {
      rigid: [["HangMug-v1", "Pick & place"], ["KitAssembly-v1", "Assembly"], ["OpenBoxRetrieval-v1", "Articulated"], ["PivotBook-v1", "Non-prehensile"]],
      deformable: [["StraightenRope-v1", "1D", "rope"], ["UnfoldShirt-v1", "2D", "cloth"], ["ShapeTToI-v1", "3D", "clay"]],
    };
    const GLYPH = {
      "1D": "M3 15c3-7 6-7 9 0s6 7 9 0",
      "2D": "M3 17 8 7h13l-5 10z",
      "3D": "M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
    };
    const byId = new Map(TASK_ITEMS.map((t) => [t.env_id, t]));
    const playObs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting && !reduceMotion) {
          if (!v.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      }
    }, { rootMargin: "100px 0px" });
    document.querySelectorAll(".si-tiles").forEach((host) => {
      for (const [id, tag, sub] of EXAMPLES[host.dataset.kind] || []) {
        const t = byId.get(id);
        if (!t) continue;
        const media = el("span", { class: "si-media" }, el("img", { src: `assets/posters/${id}.jpg`, alt: "", loading: "lazy", decoding: "async" }));
        if (t.video) {
          const v = el("video", { muted: true, loop: true, playsinline: true, preload: "none", "data-src": t.video.small, "aria-hidden": "true" });
          v.muted = true;
          v.addEventListener("playing", () => v.classList.add("ready"), { once: true });
          media.append(v);
        }
        const tile = el("button", { type: "button", class: "si-tile", "aria-label": `${tag}${sub ? " " + sub : ""}: ${t.display_name}. Watch the rollout`, onclick: () => openViewer(t) },
          media,
          el("span", { class: "si-lab" },
            el("span", { class: "si-tag" }, GLYPH[tag] ? svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, svg("path", { d: GLYPH[tag] })) : null, tag, sub ? el("small", { text: sub }) : null),
            el("span", { class: "si-name", text: t.name })));
        host.append(tile);
        playObs.observe(tile);
      }
    });
  }

  initHeroWall();
  initMatrix();
  initLevelFlow();
  initSuiteInside();
  initLeaderboard();
  initLeaderboardAnalysis();
  initGallery();
  initExperiments();
})();
