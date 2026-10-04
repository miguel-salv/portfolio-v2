const CONTROL_NAMES = {
  download: "Download source file",
  flip: "Flip board view",
  zoom_to_selection: "Zoom to selected component",
  zoom_to_page: "Zoom to page",
};

// Keep the bundled CAD viewer intact; adapt its public, open shadow controls.
export function mountKiCanvasAccessibility(embed) {
  const observers = new Map();
  let disposed = false;

  function visit(root) {
    if (!root || disposed) return;
    if (!observers.has(root)) {
      const observer = new MutationObserver(() => visit(embed.shadowRoot || embed));
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "name", "selected", "disabled"] });
      observers.set(root, observer);
    }
    for (const host of root.querySelectorAll("*")) {
      if (host.tagName === "KC-UI-BUTTON" && host.shadowRoot) {
        const button = host.shadowRoot.querySelector("button");
        const label = CONTROL_NAMES[host.getAttribute("name")] || host.getAttribute("title");
        if (button && label) button.setAttribute("aria-label", label);
        if (!host.shadowRoot.querySelector("style[data-portfolio-controls]")) {
          const style = document.createElement("style");
          style.dataset.portfolioControls = "";
          style.textContent = `
            :host { min-width: 44px; min-height: 44px; }
            button { box-sizing: border-box; min-width: 44px !important; min-height: 44px !important; width: 44px !important; height: 44px !important; padding: 0 !important; }
            button:focus-visible { outline: 2px solid var(--brand, #315f86); outline-offset: -3px; }
            @media (forced-colors: active) { button { border: 1px solid ButtonText; } button:focus-visible { outline-color: Highlight; } }
          `;
          host.shadowRoot.appendChild(style);
        }
      }
      if (host.shadowRoot) visit(host.shadowRoot);
    }
  }

  visit(embed.shadowRoot || embed);
  return () => {
    disposed = true;
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
  };
}
