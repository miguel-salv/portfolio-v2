let disposeComparison;

function initSiteEvolution() {
  disposeComparison?.();
  disposeComparison = undefined;
  const root = document.querySelector("[data-site-comparison]");
  const range = root?.querySelector('input[type="range"]');
  const controls = root?.querySelector(".evolution-compare-controls");
  const picture = root?.querySelector(".evolution-comparison-images");
  const images = root?.querySelectorAll("img");
  if (!root || !range || !controls || !picture || images?.length !== 2) return;

  // Both screenshots remain in document flow until they are ready to compare.
  let disposed = false;
  const reveal = () => {
    const amount = Math.max(0, Math.min(100, Number(range.value)));
    root.style.setProperty("--reveal", `${amount}%`);
    range.setAttribute("aria-valuetext", amount === 0 ? "Current version only" : amount === 100 ? "Early version only" : `${amount}% early version, ${100 - amount}% current version`);
  };
  const ready = [...images].map((image) => image.decode());
  Promise.all(ready).then(() => {
    if (disposed) return;
    reveal();
    controls.hidden = false;
    root.classList.add("is-comparing");
  }).catch(() => {
    // Preserve the labeled, static figures if either screenshot cannot load.
  });
  range.addEventListener("input", reveal);
  let activePointer;
  const revealAt = (event) => {
    const bounds = picture.getBoundingClientRect();
    if (!bounds.width) return;
    range.value = String(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100));
    reveal();
  };
  const startDrag = (event) => {
    if (!root.classList.contains("is-comparing") || !event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    picture.setPointerCapture(activePointer);
    revealAt(event);
    if (event.pointerType === "mouse") event.preventDefault();
  };
  const drag = (event) => {
    if (event.pointerId === activePointer) revealAt(event);
  };
  const stopDrag = (event) => {
    if (event.pointerId !== activePointer) return;
    if (picture.hasPointerCapture(activePointer)) picture.releasePointerCapture(activePointer);
    activePointer = undefined;
  };
  picture.addEventListener("pointerdown", startDrag);
  picture.addEventListener("pointermove", drag);
  picture.addEventListener("pointerup", stopDrag);
  picture.addEventListener("pointercancel", stopDrag);
  picture.addEventListener("lostpointercapture", stopDrag);
  disposeComparison = () => {
    disposed = true;
    range.removeEventListener("input", reveal);
    if (activePointer !== undefined && picture.hasPointerCapture(activePointer)) picture.releasePointerCapture(activePointer);
    picture.removeEventListener("pointerdown", startDrag);
    picture.removeEventListener("pointermove", drag);
    picture.removeEventListener("pointerup", stopDrag);
    picture.removeEventListener("pointercancel", stopDrag);
    picture.removeEventListener("lostpointercapture", stopDrag);
  };
}

document.addEventListener("astro:page-load", initSiteEvolution);
document.addEventListener("astro:before-swap", () => disposeComparison?.());
