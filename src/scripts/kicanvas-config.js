const _kcState = new WeakMap();

function getEmbedState(embed) {
  let state = _kcState.get(embed);
  if (!state) {
    state = { observer: null, viewer: null, originalPaint: null, readyPromise: null, generation: 0 };
    _kcState.set(embed, state);
  }
  return state;
}

const LAYER_PRESETS = {
  front(layer) {
    return layer.name.startsWith("F.") || layer.name === "Edge.Cuts";
  },
  "front-with-back"(layer) {
    return layer.name.startsWith("F.") || layer.name === "B.Cu" || layer.name === "Edge.Cuts";
  },
  back(layer) {
    return ["B.Cu", "B.Mask", "B.SilkS", "Edge.Cuts"].includes(layer.name);
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

const BACK_COPPER_UNDERLAY_ORDER = [
  ":B.Cu:Zones",
  "B.Cu",
  ":Pads:Back",
  ":B.Cu:BBViaHoleWalls",
  ":B.Cu:BBViaHoles",
  ":Pads:Back:NetName",
];

function applyBoardDisplayOrder(viewer, preset) {
  const displayOrder = preset === "back"
    ? BACK_DISPLAY_ORDER
    : preset === "front-with-back"
      ? BACK_COPPER_UNDERLAY_ORDER
      : null;
  if (!displayOrder || viewer.layers.__portfolioDisplayOrder === preset) return;

  const original = viewer.layers.in_display_order.bind(viewer.layers);
  viewer.layers.in_display_order = function* () {
    const layers = Array.from(original());
    const byName = new Map(layers.map((layer) => [layer.name, layer]));
    const reordered = new Set();

    for (const name of displayOrder) {
      const layer = byName.get(name);
      if (!layer) continue;
      reordered.add(layer);
      yield layer;
    }

    for (const layer of layers) {
      if (!reordered.has(layer)) yield layer;
    }
  };
  viewer.layers.__portfolioDisplayOrder = preset;
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
    const changed = viewerEl.theme !== themeName || viewerEl.getAttribute("theme") !== themeName;
    if (viewerEl.theme !== themeName) viewerEl.theme = themeName;
    if (viewerEl.getAttribute("theme") !== themeName) viewerEl.setAttribute("theme", themeName);
    if (changed && typeof viewerEl.update_theme === "function") viewerEl.update_theme();

    const viewer = viewerEl.viewer;
    if (!viewer) continue;
    if (changed && typeof viewer.paint === "function") viewer.paint();
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
  const state = getEmbedState(embed);
  if (state.viewer !== viewer) {
    state.viewer = viewer;
    state.originalPaint = typeof viewer.paint === "function" ? viewer.paint.bind(viewer) : null;
    if (state.originalPaint) {
      viewer.paint = (...args) => {
        const result = state.originalPaint(...args);
        reconcileBoardState(viewer, embed);
        return result;
      };
    }
  }

  applyEmbedTheme(embed);
  reconcileBoardState(viewer, embed);

  if (!state.zoomed) {
    const zoom = embed.dataset.zoom ?? "board";
    if (zoom === "board" && typeof viewer.zoom_to_board === "function") viewer.zoom_to_board();
    else if (zoom === "page" && typeof viewer.zoom_to_page === "function") viewer.zoom_to_page();
    state.zoomed = true;
  }

  void ensureBoardReady(embed);
}

function reconcileBoardState(viewer, embed) {
  if (!viewer?.layers) return false;
  const preset = embed.dataset.layerPreset;
  applyBoardDisplayOrder(viewer, preset);
  if (preset && LAYER_PRESETS[preset]) {
    for (const layer of viewer.layers.in_ui_order()) {
      layer.visible = LAYER_PRESETS[preset](layer);
    }
  }
  if (embed.hasAttribute("data-hide-page")) {
    for (const name of [":DrawingSheet", "drawing_sheet"]) {
      const page = viewer.layers.by_name?.(name);
      if (page) page.visible = false;
    }
  }
  return boardStateMatches(viewer, preset);
}

function boardStateMatches(viewer, preset) {
  if (!viewer?.layers || !preset) return false;
  const front = viewer.layers.by_name?.("F.Cu");
  const back = viewer.layers.by_name?.("B.Cu");
  if (preset === "back") return front?.visible === false && back?.visible === true;
  if (preset === "front") return front?.visible === true && back?.visible === false;
  if (preset === "front-with-back") return front?.visible === true && back?.visible === true;
  return true;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function ensureBoardReady(embed) {
  const state = getEmbedState(embed);
  if (state.readyPromise) return state.readyPromise;

  const generation = ++state.generation;
  embed.dataset.configured = "false";
  embed.classList.add("is-gated");
  state.readyPromise = (async () => {
    let stableFrames = 0;
    const deadline = performance.now() + KICANVAS_STATUS_TIMEOUT;
    while (performance.now() < deadline && embed.isConnected && generation === state.generation) {
      const current = getBoardViewer(embed);
      if (!isViewerReady(current) || !current?.layers) {
        await nextFrame();
        continue;
      }
      if (state.viewer !== current) configureBoardViewer(current, embed);
      reconcileBoardState(current, embed);
      current.draw?.();
      await nextFrame();
      const verified = getBoardViewer(embed);
      if (verified === current && boardStateMatches(verified, embed.dataset.layerPreset)) stableFrames++;
      else stableFrames = 0;
      if (stableFrames >= 2) {
        embed.dataset.configured = "true";
        embed.classList.remove("is-gated");
        embed.dispatchEvent(new CustomEvent("pcb-view-ready"));
        return true;
      }
    }
    return false;
  })().finally(() => {
    if (generation === state.generation) state.readyPromise = null;
  });
  return state.readyPromise;
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

/** Tuned per project so the live schematic matches the poster thumbnail. */
const SCHEMATIC_FIT = {
  impedance: { zoomMult: 1.08, offsetX: -23, offsetY: -21, pad: 0.05, band: 48 },
  keychain: { zoomMult: 1.12, offsetX: -40, offsetY: -27, pad: 0.05, band: 48 },
};
const SCHEMATIC_FIT_FALLBACK = { zoomMult: 1, offsetX: 0, offsetY: 0, pad: 0.05, band: 48 };

function schematicFitForPage() {
  const path = location.pathname;
  if (path.includes("keychain")) return SCHEMATIC_FIT.keychain;
  if (path.includes("impedance")) return SCHEMATIC_FIT.impedance;
  return SCHEMATIC_FIT_FALLBACK;
}

function fitSchematicCamera(viewer, embed) {
  const camera = viewer.viewport?.camera;
  if (!camera) return false;

  const canvas = viewer.canvas ?? viewer.renderer?.canvas;
  const width = canvas?.clientWidth || 0;
  const height = canvas?.clientHeight || 0;
  if (width < 2 || height < 2) return false;

  camera.viewport_size?.set?.(width, height);

  const bounds = schematicContentBounds(viewer);
  if (!bounds) {
    if (typeof viewer.zoom_to_page === "function") viewer.zoom_to_page();
    return true;
  }

  const fit = schematicFitForPage();
  const frame = embed.closest?.(".pcb-viewer-frame");
  if (frame) frame.style.setProperty("--pcb-toolbar-band", `${fit.band}px`);

  const content = bounds.grow(Math.max(bounds.w, bounds.h) * fit.pad);
  const usableH = Math.max(height - fit.band, 1);
  const baseZoom = Math.min(width / content.w, usableH / content.h);
  if (!Number.isFinite(baseZoom) || baseZoom <= 0) return false;

  const zoom = baseZoom * fit.zoomMult;
  const contentCX = content.x + content.w / 2;
  const contentCY = content.y + content.h / 2;
  // Sit content in the strip above the toolbar, then apply screen-pixel nudges.
  const stripCY = contentCY + ((height - usableH) / 2) / zoom;
  camera.zoom = zoom;
  camera.center.set(
    contentCX - fit.offsetX / zoom,
    stripCY - fit.offsetY / zoom,
  );
  return true;
}

function configureSchematicViewer(viewer, embed) {
  applyEmbedTheme(embed);

  if (embed.hasAttribute("data-hide-page") && viewer.layers) {
    for (const name of [":DrawingSheet", "drawing_sheet"]) {
      const page = viewer.layers.by_name?.(name);
      if (page) page.visible = false;
    }
  }

  const apply = () => {
    if (fitSchematicCamera(viewer, embed) && typeof viewer.draw === "function") {
      viewer.draw();
    }
  };

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 50);
  window.setTimeout(apply, 200);
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
  const state = getEmbedState(embed);
  if (state.watching) return;
  state.watching = true;

  const start = performance.now();
  let applied = false;

  const ensureObserver = () => {
    const s = getEmbedState(embed);
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
    if (group.dataset.toggleMounted === "true") continue;
    group.dataset.toggleMounted = "true";
    const figure = group.closest(".pcb-viewer");
    if (!figure) continue;

    const frame = figure.querySelector(".pcb-viewer-frame");
    const buttons = group.querySelectorAll(".pcb-toggle-btn");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const requestedView = btn.dataset.pcbView;
        frame.dispatchEvent(new CustomEvent("pcb-view-request", { detail: { view: requestedView } }));
        requestAnimationFrame(() => {
          const next = frame.querySelector(`kicanvas-embed[data-view="${requestedView}"]`);
          if (!next) return;

          const activate = () => {
            const views = frame.querySelectorAll("kicanvas-embed.pcb-view");
            const previous = frame.querySelector("kicanvas-embed.pcb-view.active");
            if (previous === next) return;
            buttons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduced || !previous) {
              views.forEach((v) => v.classList.remove("active", "is-switching-in", "is-switching-out"));
              next.classList.add("active");
            } else {
              next.classList.add("active", "is-switching-in");
              previous.classList.add("is-switching-out");
              window.setTimeout(() => {
                previous.classList.remove("active", "is-switching-out");
                next.classList.remove("is-switching-in");
              }, 170);
            }

            if (requestedView === "schematic") {
              requestAnimationFrame(() => {
                setTimeout(() => refreshEmbed(next), 150);
              });
            }
          };

          if (requestedView === "layout") {
            btn.disabled = true;
            btn.setAttribute("aria-busy", "true");
            void ensureBoardReady(next).then((ready) => {
              if (ready) {
                activate();
              } else {
                showPcbFailure(frame);
              }
            }).finally(() => {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
            });
          } else activate();
        });
      });
    });
  }
}

/* Load status: loading indicator + offline fallback */
const KICANVAS_STATUS_TIMEOUT = 12000;

function createPcbStatus() {
  const status = document.createElement("div");
  status.className = "pcb-viewer-status";
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

function getStaticPcbFigure(frame) {
  const writeup = frame.closest(".project-writeup");
  const staticPcb = writeup?.querySelector(".pcb-figure, .visual.pcb-figure, figure.visual img[src*='pcb']");
  return staticPcb?.closest("figure") || staticPcb || null;
}

function showPcbFailure(frame) {
  frame.querySelector(".pcb-load-facade")?.remove();
  frame.removeAttribute("aria-busy");

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
  msg.textContent = "Interactive viewer could not load.";
  status.appendChild(msg);

  const actions = document.createElement("div");
  actions.className = "pcb-viewer-status-actions";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button secondary";
  retry.textContent = "Retry viewer";
  retry.addEventListener("click", () => {
    status.remove();
    frame.dispatchEvent(new CustomEvent("pcb-retry-request"));
  });
  actions.appendChild(retry);

  const staticFigure = getStaticPcbFigure(frame);
  if (staticFigure) {
    const staticId = `pcb-static-${location.pathname.split("/").pop()?.replace(/\.html$/, "") || "project"}`;
    const staticLink = document.createElement("a");
    staticLink.className = "button secondary";
    staticLink.href = `#${staticFigure.id || staticId}`;
    if (!staticFigure.id) staticFigure.id = staticId;
    staticLink.textContent = "View static board image";
    actions.appendChild(staticLink);
  }

  const source = getSourceLink(frame);
  if (source) {
    const link = document.createElement("a");
    link.className = "button secondary";
    link.href = source.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open source";
    actions.appendChild(link);
  }
  status.appendChild(actions);
}

function clearPcbStatusWhenReady(frame) {
  const embed =
    frame.querySelector("kicanvas-embed.pcb-view.active") ||
    frame.querySelector("kicanvas-embed");
  if (!embed) {
    showPcbFailure(frame);
    return;
  }

  const isBoard = embed.hasAttribute("data-layer-preset") || embed.hasAttribute("data-zoom");
  const getViewer = isBoard ? getBoardViewer : getSchematicViewer;
  const start = performance.now();

  const reveal = () => {
    removePcbStatus(frame);
    frame.querySelector(".pcb-load-facade")?.remove();
    frame.removeAttribute("aria-busy");
  };

  const tick = () => {
    const viewer = getViewer(embed);
    if (isViewerReady(viewer)) {
      if (isBoard) {
        reveal();
        return;
      }

      // Fit against the real canvas + toolbar before tearing down the poster,
      // so the last facade frame matches the first live frame.
      (async () => {
        configureSchematicViewer(viewer, embed);
        const deadline = performance.now() + 600;
        while (performance.now() < deadline) {
          const canvas = viewer.canvas ?? viewer.renderer?.canvas;
          const schApp = embed.shadowRoot?.querySelector("kc-schematic-app");
          const toolbarHost = schApp?.shadowRoot?.querySelector("kc-viewer-bottom-toolbar");
          const sized = (canvas?.clientWidth || 0) > 2 && (canvas?.clientHeight || 0) > 2;
          const toolbarReady = Boolean(toolbarHost);
          if (sized && toolbarReady && fitSchematicCamera(viewer, embed)) {
            viewer.draw?.();
            break;
          }
          await nextFrame();
        }
        await nextFrame();
        reveal();
      })();
      return;
    }
    if (performance.now() - start < 8000) {
      requestAnimationFrame(tick);
      return;
    }
    showPcbFailure(frame);
  };

  tick();
}

function loadKiCanvasScript() {
  if (!("customElements" in window)) {
    return Promise.reject(new Error("Custom elements are unavailable"));
  }
  if (customElements.get("kicanvas-embed")) {
    return Promise.resolve();
  }
  if (window.__kicanvasPromise) return window.__kicanvasPromise;
  window.__kicanvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/assets/vendor/kicanvas/kicanvas.js";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      window.__kicanvasPromise = null;
      reject(new Error("KiCanvas failed to load"));
    };
    document.head.appendChild(script);
  });
  return window.__kicanvasPromise;
}

function initKiCanvasStatus() {
  const frames = document.querySelectorAll(".pcb-viewer-frame");
  if (!frames.length) return;

  const mountView = (frame, view) => {
    if (frame.querySelector(`kicanvas-embed[data-view="${view}"]`)) return;
    const embed = document.createElement("kicanvas-embed");
    embed.className = `pcb-view${view === "schematic" ? " active" : ""}`;
    embed.dataset.view = view;
    embed.setAttribute("controls", "basic");
    embed.setAttribute("controlslist", "nooverlay");
    embed.setAttribute("theme", "kicad");
    embed.setAttribute("data-hide-page", "");
    if (view === "layout") {
      embed.setAttribute("data-layer-preset", frame.dataset.layerPreset || "front");
      embed.setAttribute("data-zoom", "board");
      embed.dataset.configured = "false";
      embed.classList.add("is-gated");
    }
    const source = document.createElement("kicanvas-source");
    source.setAttribute("src", view === "schematic" ? frame.dataset.schematicSrc : frame.dataset.pcbSrc);
    embed.appendChild(source);
    frame.appendChild(embed);
  };

  const boot = (frame) => {
    const loadButton = frame.querySelector("button[data-pcb-load]");
    if (loadButton) {
      loadButton.hidden = true;
      loadButton.disabled = true;
    }
    frame.setAttribute("aria-busy", "true");
    mountView(frame, "schematic");
    mountView(frame, "layout");
    loadKiCanvasScript()
      .then(() => {
        initKiCanvasEmbeds();
        if (!("customElements" in window) || typeof customElements.whenDefined !== "function") {
          showPcbFailure(frame);
          return;
        }

        let defined = false;
        customElements.whenDefined("kicanvas-embed").then(() => {
          defined = true;
          clearPcbStatusWhenReady(frame);
        });

        setTimeout(() => {
          if (!defined && !customElements.get("kicanvas-embed")) {
            showPcbFailure(frame);
          }
        }, KICANVAS_STATUS_TIMEOUT);
      })
      .catch((error) => {
        console.error("[kicanvas] viewer failed to load", error);
        showPcbFailure(frame);
      });
  };

  frames.forEach((frame) => {
    if (frame.dataset.statusMounted === "true") return;
    frame.dataset.statusMounted = "true";
    frame.closest(".pcb-viewer")?.querySelector("[data-pcb-load]")?.addEventListener("click", () => boot(frame), { once: true });
    frame.addEventListener("pcb-retry-request", () => boot(frame));
    frame.addEventListener("pcb-view-request", (event) => {
      const view = event.detail?.view || "schematic";
      if (!frame.querySelector("kicanvas-embed")) boot(frame);
      mountView(frame, view);
      if ("customElements" in window && customElements.get("kicanvas-embed")) initKiCanvasEmbeds();
    });
  });
}

function initKiCanvasPage() {
  initPcbViewerToggle();
  initKiCanvasStatus();
}

document.addEventListener("astro:page-load", initKiCanvasPage);
