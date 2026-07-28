(function () {
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Metric chips: count up once when scrolled into view
const countChips = document.querySelectorAll(".metric-row [data-count]");
if (countChips.length) {
  const runCount = (el) => {
    const original = el.textContent;
    const match = original.match(/(\d+(?:\.\d+)?)/);
    if (!match) return;
    const target = parseFloat(match[1]);
    const decimals = (match[1].split(".")[1] || "").length;
    const prefix = original.slice(0, match.index);
    const suffix = original.slice(match.index + match[1].length);
    el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    const duration = 1800;
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = original;
      }
    };
    requestAnimationFrame(frame);
  };
  if (!reduceMotion && "IntersectionObserver" in window) {
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    countChips.forEach((el) => countObserver.observe(el));
  }
}
// Click-to-load YouTube facade (keeps third-party JS off the critical path).
document.querySelectorAll(".video-facade[data-youtube]").forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.dataset.youtube;
    if (!id) return;
    const frame = button.closest(".video-frame");
    if (!frame) return;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
    iframe.title = (button.getAttribute("aria-label") || "Project demo video").replace(/^Play\s+/i, "");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
  frame.replaceChildren(iframe);
  });
});
})();
