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
