const LAYER_PRESETS = {
  front(layer) {
    return layer.name.startsWith("F.") || layer.name === "Edge.Cuts";
  },
  back(layer) {
    return layer.name.startsWith("B.") || layer.name === "Edge.Cuts";
  },
  copper(layer) {
    return layer.name.includes(".Cu") || layer.name === "Edge.Cuts";
  },
};

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
    if (typeof viewer.draw === "function") viewer.draw();
  }

  return viewerEls.length > 0;
}

function configureBoardViewer(viewer, embed) {
  applyEmbedTheme(embed);

  const preset = embed.dataset.layerPreset;
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

function whenViewerReady(embed, getViewer, callback) {
  const start = performance.now();

  const tick = () => {
    const viewer = getViewer(embed);

    if (viewer?.loaded) {
      callback(viewer);
      return;
    }

    if (performance.now() - start < 30000) {
      requestAnimationFrame(tick);
    }
  };

  tick();
}

function watchEmbedTheme(embed) {
  if (embed._kcThemeWatching) return;
  embed._kcThemeWatching = true;

  const start = performance.now();
  let applied = false;

  const ensureObserver = () => {
    if (embed._kcThemeObserver) return;
    const root = embed.shadowRoot;
    if (!root) return;
    const obs = new MutationObserver(() => {
      if (applyEmbedTheme(embed)) applied = true;
    });
    obs.observe(root, { childList: true, subtree: true });
    embed._kcThemeObserver = obs;
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
    applyEmbedTheme(embed);
    if (embed.hasAttribute("data-hide-page") && viewer.layers) {
      const page = viewer.layers.by_name?.(":DrawingSheet");
      if (page) page.visible = false;
    }
    if (typeof viewer.zoom_to_page === "function") viewer.zoom_to_page();
    else if (typeof viewer.zoom_fit === "function") viewer.zoom_fit();
    if (typeof viewer.draw === "function") viewer.draw();
    window.dispatchEvent(new Event("resize"));
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
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKiCanvasEmbeds);
} else {
  initKiCanvasEmbeds();
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
        buttons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
        views.forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        views[i].classList.add("active");

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
    if (viewer?.loaded) {
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

function initKiCanvasStatus() {
  const frames = document.querySelectorAll(".pcb-viewer-frame");
  if (!frames.length) return;

  frames.forEach((frame) => frame.appendChild(createPcbStatus()));

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKiCanvasStatus);
} else {
  initKiCanvasStatus();
}
