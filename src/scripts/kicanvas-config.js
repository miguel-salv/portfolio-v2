import { mountKiCanvasAccessibility } from "./kicanvas-accessibility.js";
import { createPcbViewSelection } from "./pcb-view-selection.js";

const _kcState = new WeakMap();
const embedCleanups = new Map();
const frameCleanups = new Map();

function embedActive(embed) {
  return embed.isConnected && !getEmbedState(embed).disposed;
}

function protectEmbed(embed) {
  if (embedCleanups.has(embed)) return;
  const state = getEmbedState(embed);
  embedCleanups.set(embed, () => {
    state.disposed = true;
    state.generation++;
    state.observer?.disconnect();
    state.accessibility?.();
    if (state.viewer && state.originalPaint) state.viewer.paint = state.originalPaint;
    embedCleanups.delete(embed);
  });
}

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
  if (!embedActive(embed)) return false;
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
  if (!embedActive(embed)) return;
  protectEmbed(embed);
  state.accessibility ??= mountKiCanvasAccessibility(embed);
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
    while (performance.now() < deadline && embedActive(embed) && generation === state.generation) {
      const current = getBoardViewer(embed);
      if (!isViewerReady(current) || !current?.layers) {
        await nextFrame();
        continue;
      }
      if (state.viewer !== current) configureBoardViewer(current, embed);
      reconcileBoardState(current, embed);
      current.draw?.();
      await nextFrame();
      if (!embedActive(embed) || generation !== state.generation) return false;
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
  impedance: { zoomMult: 1.08, offsetX: -23, offsetY: -21, pad: 0.05, band: 60 },
  keychain: { zoomMult: 1.12, offsetX: -40, offsetY: -27, pad: 0.05, band: 60 },
};
const SCHEMATIC_FIT_FALLBACK = { zoomMult: 1, offsetX: 0, offsetY: 0, pad: 0.05, band: 60 };

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
  if (!embedActive(embed)) return;
  protectEmbed(embed);
  getEmbedState(embed).accessibility ??= mountKiCanvasAccessibility(embed);
  applyEmbedTheme(embed);

  if (embed.hasAttribute("data-hide-page") && viewer.layers) {
    for (const name of [":DrawingSheet", "drawing_sheet"]) {
      const page = viewer.layers.by_name?.(name);
      if (page) page.visible = false;
    }
  }

  const apply = () => {
    if (embedActive(embed) && fitSchematicCamera(viewer, embed) && typeof viewer.draw === "function") {
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
    if (!embedActive(embed)) return;
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
  protectEmbed(embed);
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
    if (!embedActive(embed)) return;
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

function initKiCanvasEmbeds(embeds = document.querySelectorAll("kicanvas-embed")) {
  for (const embed of embeds) {
    watchEmbedTheme(embed);
    if (embed.hasAttribute("data-layer-preset") || embed.hasAttribute("data-zoom")) {
      whenViewerReady(embed, getBoardViewer, viewer => configureBoardViewer(viewer, embed));
    } else {
      whenViewerReady(embed, getSchematicViewer, viewer => configureSchematicViewer(viewer, embed));
    }
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
  const facade = frame.querySelector(".pcb-load-facade");
  if (facade) facade.inert = true;
  const loadButton = frame.querySelector("button[data-pcb-load]");
  if (loadButton) {
    loadButton.disabled = false;
    loadButton.removeAttribute("aria-busy");
    loadButton.querySelector("span").textContent = "Load interactive viewer";
  }
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

  if (frame.querySelector(".pcb-load-facade")) {
    const staticView = document.createElement("button");
    staticView.type = "button";
    staticView.className = "button secondary";
    staticView.textContent = "View static schematic";
    staticView.addEventListener("click", () => {
      facade.inert = false;
      facade.classList.add("is-static-preview");
      status.remove();
      const figure = frame.closest(".pcb-viewer");
      figure.querySelectorAll(".pcb-toggle-btn").forEach(button => {
        const active = button.dataset.pcbView === "schematic";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      const message = figure.querySelector("[data-pcb-status-message]");
      if (message) message.textContent = "Static schematic shown.";
      loadButton?.focus({ preventScroll: true });
    });
    actions.appendChild(staticView);
  }

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
    const attempt = window.__portfolioKiCanvasAttempt || 0;
    script.src = `/assets/vendor/kicanvas/kicanvas.js${attempt ? `?retry=${attempt}` : ""}`;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.remove();
      window.__kicanvasPromise = null;
      window.__portfolioKiCanvasAttempt = attempt + 1;
      reject(new Error("KiCanvas failed to load"));
    };
    const timeout = window.setTimeout(fail, KICANVAS_STATUS_TIMEOUT);
    script.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return window.__kicanvasPromise;
}

async function prepareSchematic(embed) {
  const deadline = performance.now() + 8000;
  while (embedActive(embed) && performance.now() < deadline) {
    const viewer = getSchematicViewer(embed);
    if (isViewerReady(viewer)) {
      configureSchematicViewer(viewer, embed);
      await nextFrame();
      if (!embedActive(embed)) return false;
      if (fitSchematicCamera(viewer, embed)) {
        viewer.draw?.();
        return true;
      }
    }
    await nextFrame();
  }
  return false;
}

function mountPcbFrame(frame) {
  if (frameCleanups.has(frame)) return;
  const figure = frame.closest(".pcb-viewer");
  const buttons = Array.from(figure.querySelectorAll(".pcb-toggle-btn"));
  const statusMessage = figure.querySelector("[data-pcb-status-message]");
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let disposed = false;
  let loadPromise = null;
  let loadTicket = 0;
  let resizeFrame = 0;
  let focusOrigin = null;

  const mountView = (name) => {
    const existing = frame.querySelector(`kicanvas-embed[data-view="${name}"]`);
    if (existing) return existing;
    const embed = document.createElement("kicanvas-embed");
    embed.className = `pcb-view${name === "schematic" ? " active" : ""}`;
    embed.dataset.view = name;
    embed.inert = name !== "schematic";
    embed.setAttribute("aria-hidden", String(name !== "schematic"));
    embed.setAttribute("controls", "basic");
    embed.setAttribute("controlslist", "nooverlay");
    embed.setAttribute("theme", "kicad");
    embed.setAttribute("data-hide-page", "");
    if (name === "layout") {
      embed.setAttribute("data-layer-preset", frame.dataset.layerPreset || "front");
      embed.setAttribute("data-zoom", "board");
      embed.dataset.configured = "false";
      embed.classList.add("is-gated");
    }
    const source = document.createElement("kicanvas-source");
    source.setAttribute("src", name === "schematic" ? frame.dataset.schematicSrc : frame.dataset.pcbSrc);
    embed.appendChild(source);
    frame.appendChild(embed);
    protectEmbed(embed);
    return embed;
  };

  const ensureLoaded = () => {
    if (loadPromise) return loadPromise;
    const ticket = ++loadTicket;
    const facade = frame.querySelector(".pcb-load-facade");
    if (facade) { facade.inert = false; facade.classList.remove("is-static-preview"); }
    const loadButton = frame.querySelector("button[data-pcb-load]");
    if (loadButton) {
      loadButton.disabled = true;
      loadButton.setAttribute("aria-busy", "true");
      loadButton.querySelector("span").textContent = "Loading viewer…";
    }
    if (statusMessage) statusMessage.textContent = "Loading interactive viewer…";
    frame.setAttribute("aria-busy", "true");
    mountView("schematic");
    mountView("layout");
    loadPromise = loadKiCanvasScript().then(() => {
      if (disposed || ticket !== loadTicket || !frame.isConnected) return false;
      if (!customElements.get("kicanvas-embed")) return false;
      initKiCanvasEmbeds(frame.querySelectorAll("kicanvas-embed"));
      return true;
    }).catch(() => false);
    return loadPromise;
  };

  const selection = createPcbViewSelection(frame, buttons, {
    async prepare(name) {
      if (!(await ensureLoaded()) || disposed) return false;
      const embed = frame.querySelector(`kicanvas-embed[data-view="${name}"]`);
      if (!embed) return false;
      return name === "layout" ? ensureBoardReady(embed) : prepareSchematic(embed);
    },
    reveal(next) {
      removePcbStatus(frame);
      frame.querySelector(".pcb-load-facade")?.remove();
      frame.removeAttribute("aria-busy");
      if (statusMessage) statusMessage.textContent = `${next.dataset.view === "layout" ? "Board layout" : "Schematic"} viewer ready.`;
      if (focusOrigin && (document.activeElement === focusOrigin || (!focusOrigin.isConnected && document.activeElement === document.body))) {
        buttons.find(button => button.dataset.pcbView === next.dataset.view)?.focus({ preventScroll: true });
      }
      focusOrigin = null;
    },
    fail() {
      if (statusMessage) statusMessage.textContent = "";
      loadTicket++;
      loadPromise = null;
      for (const embed of frame.querySelectorAll("kicanvas-embed")) {
        embedCleanups.get(embed)?.();
        embed.remove();
      }
      const restoreFocus = focusOrigin && (document.activeElement === focusOrigin || (!focusOrigin.isConnected && document.activeElement === document.body));
      showPcbFailure(frame);
      if (restoreFocus) {
        frame.querySelector(".pcb-viewer-status button")?.focus({ preventScroll: true });
      }
      focusOrigin = null;
    },
  });

  figure.querySelector("[data-pcb-load]")?.addEventListener("click", () => {
    focusOrigin = document.activeElement;
    void selection.request("schematic");
  }, options);
  buttons.forEach(button => button.addEventListener("click", () => void selection.request(button.dataset.pcbView), options));
  frame.addEventListener("pcb-retry-request", () => {
    focusOrigin = document.activeElement;
    loadTicket++;
    loadPromise = null;
    for (const embed of frame.querySelectorAll("kicanvas-embed")) {
      embedCleanups.get(embed)?.();
      embed.remove();
    }
    void selection.request("schematic");
  }, options);

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (resizeFrame || disposed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (disposed || !frame.isConnected) return;
      const embed = frame.querySelector('kicanvas-embed[data-view="schematic"].active');
      const viewer = embed && getSchematicViewer(embed);
      if (isViewerReady(viewer) && fitSchematicCamera(viewer, embed)) viewer.draw?.();
    });
  }) : null;
  resizeObserver?.observe(frame);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    loadTicket++;
    controller.abort();
    selection.destroy();
    resizeObserver?.disconnect();
    cancelAnimationFrame(resizeFrame);
    for (const embed of frame.querySelectorAll("kicanvas-embed")) embedCleanups.get(embed)?.();
    frameCleanups.delete(frame);
  };
  frameCleanups.set(frame, cleanup);
}

function initKiCanvasPage() {
  document.querySelectorAll(".pcb-viewer-frame").forEach(mountPcbFrame);
}

function destroyKiCanvasPage() {
  for (const cleanup of Array.from(frameCleanups.values())) cleanup();
}

document.addEventListener("astro:page-load", initKiCanvasPage);
document.addEventListener("astro:before-preparation", destroyKiCanvasPage);
window.addEventListener("pagehide", event => { if (!event.persisted) destroyKiCanvasPage(); });
