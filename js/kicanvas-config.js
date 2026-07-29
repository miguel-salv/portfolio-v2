const _kcState = new WeakMap();

// KiCanvas alpha logs large parser-warning floods for safely ignored fields in
// newer KiCad files. Preserve all unrelated warnings.
const _kcConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("kicanvas:parser")) return;
  _kcConsoleWarn(...args);
};

const LAYER_PRESETS = {
  front(layer) {
    return layer.name.startsWith("F.") || layer.name === "Edge.Cuts";
  },
  back(layer) {
    return ["B.Cu", "B.Mask", "B.SilkS", "F.SilkS", "Edge.Cuts"].includes(layer.name);
  },
  copper(layer) {
    return layer.name.includes(".Cu") || layer.name === "Edge.Cuts";
  },
};

const BACK_DISPLAY_ORDER = [
  "B.Fab",
  "B.CrtYd",
  "B.Adhes",
  ":B.Cu:Zones",
  "B.Cu",
  "B.Mask",
  ":Pads:Back",
  "B.Paste",
  "B.SilkS",
  "F.SilkS",
  "Edge.Cuts",
  ":B.Cu:BBViaHoleWalls",
  ":B.Cu:BBViaHoles",
  ":Pads:Back:NetName",
];

function applyBoardDisplayOrder(viewer, preset) {
  if (preset !== "back" || viewer.layers.__portfolioDisplayOrder) return;

  const original = viewer.layers.in_display_order.bind(viewer.layers);
  viewer.layers.in_display_order = function* () {
    const layers = Array.from(original());
    const byName = new Map(layers.map((layer) => [layer.name, layer]));
    const reordered = new Set();

    for (const name of BACK_DISPLAY_ORDER) {
      const layer = byName.get(name);
      if (!layer) continue;
      reordered.add(layer);
      yield layer;
    }

    for (const layer of layers) {
      if (!reordered.has(layer)) yield layer;
    }
  };
  viewer.layers.__portfolioDisplayOrder = true;
}

/**
 * KiCanvas stores prefs under `kc:prefs:*` and defaults to witchhazel. The embed
 * `theme` attribute isn't forwarded to inner viewers, so set the global pref early
 * and push theme onto viewers when they mount.
 */
function preferKicadTheme() {
  try {
    const key = "kc:prefs:theme";
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.val === "kicad") return;
    }
    localStorage.setItem(key, JSON.stringify({ val: "kicad" }));
  } catch (_) {
    /* Ignore quota / private mode */
  }
}

preferKicadTheme();

function getBoardViewerEl(embed) {
  const boardApp = embed.shadowRoot?.querySelector("kc-board-app");
  return boardApp?.shadowRoot?.querySelector("kc-board-viewer") ?? null;
}

function getSchematicViewerEl(embed) {
  const schApp = embed.shadowRoot?.querySelector("kc-schematic-app");
  return schApp?.shadowRoot?.querySelector("kc-schematic-viewer") ?? null;
}

function getBoardViewer(embed) {
  return getBoardViewerEl(embed)?.viewer;
}

function getSchematicViewer(embed) {
  return getSchematicViewerEl(embed)?.viewer;
}

function isViewerReady(viewer) {
  return Boolean(viewer?.loaded?.isOpen ?? viewer?.loaded);
}

function applyEmbedTheme(embed) {
  const themeName = embed.getAttribute("theme") || "kicad";
  const viewerEls = [getSchematicViewerEl(embed), getBoardViewerEl(embed)].filter(Boolean);

  for (const viewerEl of viewerEls) {
    if (viewerEl.theme !== themeName) viewerEl.theme = themeName;
    if (viewerEl.getAttribute("theme") !== themeName) viewerEl.setAttribute("theme", themeName);
    if (typeof viewerEl.update_theme === "function") viewerEl.update_theme();

    const viewer = viewerEl.viewer;
    if (!viewer) continue;
    if (typeof viewer.paint === "function") viewer.paint();
    if (embed.hasAttribute("data-hide-page") && viewer.layers) {
      for (const name of [":DrawingSheet", "drawing_sheet"]) {
        const page = viewer.layers.by_name?.(name);
        if (page) page.visible = false;
      }
    }
    if (typeof viewer.draw === "function") viewer.draw();
  }

  return viewerEls.length > 0;
}

function configureBoardViewer(viewer, embed) {
  applyEmbedTheme(embed);

  const preset = embed.dataset.layerPreset;
  applyBoardDisplayOrder(viewer, preset);
  if (preset && LAYER_PRESETS[preset]) {
    for (const layer of viewer.layers.in_ui_order()) {
      layer.visible = LAYER_PRESETS[preset](layer);
    }
  }

  if (embed.hasAttribute("data-hide-page")) {
    const page = viewer.layers.by_name(":DrawingSheet");
    if (page) page.visible = false;
  }

  const zoom = embed.dataset.zoom ?? "board";
  if (zoom === "board" && typeof viewer.zoom_to_board === "function") {
    viewer.zoom_to_board();
  } else if (zoom === "page" && typeof viewer.zoom_to_page === "function") {
    viewer.zoom_to_page();
  }

  viewer.draw();
}

function schematicContentBounds(viewer) {
  const ignored = new Set([":DrawingSheet", "drawing_sheet", ":Grid", "grid", ":Marks"]);
  const boxes = Array.from(viewer.layers.in_order?.() ?? [])
    .filter((layer) => layer.visible && !ignored.has(layer.name) && layer.bbox?.valid)
    .map((layer) => layer.bbox);

  if (!boxes.length) return null;

  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x2));
  const y2 = Math.max(...boxes.map((box) => box.y2));
  const bounds = boxes[0].copy();
  bounds.x = x;
  bounds.y = y;
  bounds.w = x2 - x;
  bounds.h = y2 - y;
  return bounds;
}

function configureSchematicViewer(viewer, embed) {
  applyEmbedTheme(embed);

  if (embed.hasAttribute("data-hide-page") && viewer.layers) {
    for (const name of [":DrawingSheet", "drawing_sheet"]) {
      const page = viewer.layers.by_name?.(name);
      if (page) page.visible = false;
    }
  }

  const bounds = schematicContentBounds(viewer);
  if (bounds && viewer.viewport?.camera) {
    const fitted = bounds.grow(Math.max(bounds.w, bounds.h) * 0.04);
    // KiCanvas reserves controls on the bottom-right, so bias the content
    // slightly up and left within the visible canvas.
    fitted.x += bounds.w * 0.03;
    fitted.y += bounds.h * 0.02;
    viewer.viewport.camera.bbox = fitted;
  } else if (typeof viewer.zoom_to_page === "function") {
    viewer.zoom_to_page();
  }

  if (typeof viewer.draw === "function") viewer.draw();
  window.dispatchEvent(new Event("resize"));
}

function whenViewerReady(embed, getViewer, callback) {
  const start = performance.now();
  const tick = () => {
    const viewer = getViewer(embed);
    if (isViewerReady(viewer)) {
      callback(viewer);
    } else if (performance.now() - start < 30000) {
      requestAnimationFrame(tick);
    }
  };
  tick();
}

function watchEmbedTheme(embed) {
  if (_kcState.has(embed)) return;
  _kcState.set(embed, { watching: true, observer: null });

  const start = performance.now();
  let applied = false;

  const ensureObserver = () => {
    const s = _kcState.get(embed);
    if (s.observer) return;
    const root = embed.shadowRoot;
    if (!root) return;
    const obs = new MutationObserver(() => {
      if (applyEmbedTheme(embed)) applied = true;
    });
    obs.observe(root, { childList: true, subtree: true });
    s.observer = obs;
  };

  const tick = () => {
    ensureObserver();
    if (applyEmbedTheme(embed)) {
      applied = true;
      // First paint can still land on witchhazel; nudge a few times after mount.
      setTimeout(() => applyEmbedTheme(embed), 50);
      setTimeout(() => applyEmbedTheme(embed), 250);
      setTimeout(() => applyEmbedTheme(embed), 800);
    }
    if (!applied && performance.now() - start < 30000) {
      requestAnimationFrame(tick);
    }
  };

  tick();
}

function refreshEmbed(embed) {
  applyEmbedTheme(embed);

  if (embed.hasAttribute("data-layer-preset") || embed.hasAttribute("data-zoom")) {
    whenViewerReady(embed, getBoardViewer, (viewer) => {
      if (viewer.layers) configureBoardViewer(viewer, embed);
    });
    return;
  }

  whenViewerReady(embed, getSchematicViewer, (viewer) => {
    configureSchematicViewer(viewer, embed);
  });
}

function initKiCanvasEmbeds() {
  for (const embed of document.querySelectorAll("kicanvas-embed")) {
    watchEmbedTheme(embed);

    whenViewerReady(embed, getBoardViewer, (viewer) => {
      if (viewer.layers && (embed.hasAttribute("data-layer-preset") || embed.hasAttribute("data-zoom"))) {
        configureBoardViewer(viewer, embed);
      } else {
        applyEmbedTheme(embed);
      }
    });

    whenViewerReady(embed, getSchematicViewer, (viewer) => {
      configureSchematicViewer(viewer, embed);
    });
  }
}

/* Layout / schematic toggle */
function initPcbViewerToggle() {
  for (const group of document.querySelectorAll(".pcb-viewer-toggle")) {
    const figure = group.closest(".pcb-viewer");
    if (!figure) continue;

    const frame = figure.querySelector(".pcb-viewer-frame");
    const views = frame.querySelectorAll("kicanvas-embed.pcb-view");
    const buttons = group.querySelectorAll(".pcb-toggle-btn");

    buttons.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        const previous = frame.querySelector("kicanvas-embed.pcb-view.active");
        buttons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
        views.forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        views[i].classList.add("active");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          previous?.classList.add("is-switching-out");
          views[i].classList.add("is-switching-in");
          window.setTimeout(() => {
            previous?.classList.remove("is-switching-out");
            views[i].classList.remove("is-switching-in");
          }, 180);
        }

        const embed = views[i];
        requestAnimationFrame(() => {
          setTimeout(() => refreshEmbed(embed), 150);
        });
      });
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPcbViewerToggle);
} else {
  initPcbViewerToggle();
}

/* Load status: loading indicator + offline fallback */
const KICANVAS_STATUS_TIMEOUT = 12000;

function createPcbStatus() {
  const status = document.createElement("div");
  status.className = "pcb-viewer-status";

  const msg = document.createElement("p");
  msg.className = "pcb-viewer-status-msg";
  msg.textContent = "Loading schematic…";

  const caret = document.createElement("span");
  caret.className = "pcb-viewer-caret";
  caret.setAttribute("aria-hidden", "true");
  msg.appendChild(caret);

  status.appendChild(msg);
  return status;
}

function getSourceLink(frame) {
  const figure = frame.closest(".pcb-viewer");
  return figure?.querySelector("figcaption a[href]") ?? null;
}

function removePcbStatus(frame) {
  const status = frame.querySelector(".pcb-viewer-status");
  if (status) status.remove();
}

function showPcbFailure(frame) {
  let status = frame.querySelector(".pcb-viewer-status");
  if (!status) {
    status = createPcbStatus();
    frame.appendChild(status);
  }

  status.classList.add("pcb-viewer-status--error");
  status.setAttribute("role", "alert");
  status.replaceChildren();

  const msg = document.createElement("p");
  msg.className = "pcb-viewer-status-msg";
  msg.textContent = "Interactive viewer could not load. ";

  const source = getSourceLink(frame);
  if (source) {
    const link = document.createElement("a");
    link.href = source.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "View the source files on GitHub";
    msg.appendChild(link);
    msg.appendChild(document.createTextNode("."));
  } else {
    msg.appendChild(document.createTextNode("Try reloading the page."));
  }

  status.appendChild(msg);

  // Prefer the static PCB photo already on the page when KiCanvas fails.
  const section = frame.closest(".writeup-section");
  const staticPcb = section?.querySelector(".pcb-figure, .visual.pcb-figure, figure.visual img[src*='pcb']");
  if (staticPcb) {
    const figure = staticPcb.closest("figure") || staticPcb;
    figure.scrollIntoView?.({ block: "nearest" });
  }
}

function clearPcbStatusWhenReady(frame) {
  const embed =
    frame.querySelector("kicanvas-embed.pcb-view.active") ||
    frame.querySelector("kicanvas-embed");
  if (!embed) {
    removePcbStatus(frame);
    return;
  }

  const isBoard = embed.hasAttribute("data-layer-preset") || embed.hasAttribute("data-zoom");
  const getViewer = isBoard ? getBoardViewer : getSchematicViewer;
  const start = performance.now();

  const tick = () => {
    const viewer = getViewer(embed);
    if (isViewerReady(viewer)) {
      removePcbStatus(frame);
      return;
    }
    if (performance.now() - start < 8000) {
      requestAnimationFrame(tick);
      return;
    }
    removePcbStatus(frame);
  };

  tick();
}

function loadKiCanvasScript() {
  if (window.__kicanvasLoading || customElements.get("kicanvas-embed")) {
    return Promise.resolve();
  }
  window.__kicanvasLoading = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "assets/vendor/kicanvas/kicanvas.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("KiCanvas failed to load"));
    document.head.appendChild(script);
  });
}

function initKiCanvasStatus() {
  const frames = document.querySelectorAll(".pcb-viewer-frame");
  if (!frames.length) return;

  frames.forEach((frame) => frame.appendChild(createPcbStatus()));

  const boot = () => {
    loadKiCanvasScript()
      .then(() => {
        initKiCanvasEmbeds();
        if (!("customElements" in window) || typeof customElements.whenDefined !== "function") {
          frames.forEach(showPcbFailure);
          return;
        }

        let defined = false;
        customElements.whenDefined("kicanvas-embed").then(() => {
          defined = true;
          frames.forEach(clearPcbStatusWhenReady);
        });

        setTimeout(() => {
          if (!defined && !customElements.get("kicanvas-embed")) {
            frames.forEach(showPcbFailure);
          }
        }, KICANVAS_STATUS_TIMEOUT);
      })
      .catch(() => {
        frames.forEach(showPcbFailure);
      });
  };

  const viewer = document.querySelector(".pcb-viewer");
  if (!viewer || !("IntersectionObserver" in window)) {
    boot();
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      obs.disconnect();
      boot();
    },
    { rootMargin: "240px 0px" }
  );
  observer.observe(viewer);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKiCanvasStatus);
} else {
  initKiCanvasStatus();
}
