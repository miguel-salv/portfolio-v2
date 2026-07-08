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

function configureBoardViewer(viewer, embed) {
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

function whenBoardViewerReady(embed, callback) {
  const start = performance.now();

  const tick = () => {
    const boardApp = embed.shadowRoot?.querySelector("kc-board-app");
    const boardViewerEl = boardApp?.shadowRoot?.querySelector("kc-board-viewer");
    const viewer = boardViewerEl?.viewer;

    if (viewer?.loaded && viewer.layers) {
      callback(viewer);
      return;
    }

    if (performance.now() - start < 30000) {
      requestAnimationFrame(tick);
    }
  };

  tick();
}

function initKiCanvasEmbeds() {
  for (const embed of document.querySelectorAll("kicanvas-embed[data-hide-page], kicanvas-embed[data-layer-preset]")) {
    whenBoardViewerReady(embed, (viewer) => configureBoardViewer(viewer, embed));
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initKiCanvasEmbeds);
} else {
  initKiCanvasEmbeds();
}

/* --- Layout / Schematic toggle --- */
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

        // Re-apply board zoom when the layout embed becomes visible.
        // Defer so the embed has time to lay out after display changes.
        const embed = views[i];
        if (embed.hasAttribute("data-zoom")) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              whenBoardViewerReady(embed, (viewer) => configureBoardViewer(viewer, embed));
            }, 150);
          });
        }
      });
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPcbViewerToggle);
} else {
  initPcbViewerToggle();
}
