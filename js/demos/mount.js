import { applyDemoHint } from "./platform.js";

const DEMO_LOADERS = {
  "impedance-matcher": () => import("./impedance-matcher/index.js"),
  "kirby-companion": () => import("./kirby/index.js"),
};

function mountDemo(figure) {
  const name = figure.dataset.demo;
  const frame = figure.querySelector(".hardware-demo-frame");
  const loader = DEMO_LOADERS[name];
  if (!frame || !loader) return;

  applyDemoHint(figure);

  frame.tabIndex = 0;
  frame.setAttribute("role", "application");

  loader()
    .then((mod) => mod.mount(frame))
    .catch((err) => {
      console.error(`[hardware-demo] failed to load ${name}`, err);
      frame.textContent = "Demo failed to load.";
    });
}

document.querySelectorAll(".hardware-demo[data-demo]").forEach(mountDemo);
