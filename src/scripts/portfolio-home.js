const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = () => motionQuery.matches;
let cleanupPortfolioHome = () => {};

function initPortfolioHome() {
cleanupPortfolioHome();
if (!document.getElementById("top")) return;
const listenerController = new AbortController();
let spy = null;
let cleanupCardFx = () => {};

const spySections = new Map();
document.querySelectorAll('.nav-links a[href^="#"]').forEach((link) => {
  const section = document.querySelector(link.getAttribute("href"));
  if (!section) return;
  if (!spySections.has(section)) spySections.set(section, []);
  spySections.get(section).push(link);
});
if (spySections.size && "IntersectionObserver" in window) {
  const inView = new Set();
  const setCurrent = (section) => {
    spySections.forEach((links, candidate) => {
      links.forEach((link) => {
        if (candidate === section) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    });
  };
  spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        inView.add(entry.target);
      } else {
        inView.delete(entry.target);
      }
    });
    const topmost = Array.from(inView).sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
    )[0];
    setCurrent(topmost || null);
  }, { rootMargin: "-30% 0px -55% 0px", threshold: [0, .1, .25, .5] });
  spySections.forEach((_, section) => spy.observe(section));
}
// Project card effects: arm the overlay on hover (mouse) or keyboard focus.
// Touch keeps the hardware photo visible — overlays must not replace it.
const fxCards = document.querySelectorAll(".project-card[data-fx]");
if (fxCards.length) {
  const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const vswrChip = document.querySelector("[data-fx-vswr]");
  const fwdFill = document.querySelector("[data-fx-fwd]");
  const refFill = document.querySelector("[data-fx-ref]");
  const fwdVal = document.querySelector("[data-fx-fwd-val]");
  const refVal = document.querySelector("[data-fx-ref-val]");
  const vswrIdle = "Tuning\u2026";
  let vswrRaf = 0;
  let vswrTimer = 0;

  const setPwr = (fwd, ref) => {
    if (fwdFill) fwdFill.style.transform = `scaleX(${fwd / 100})`;
    if (refFill) refFill.style.transform = `scaleX(${ref / 100})`;
    if (fwdVal) fwdVal.textContent = `${Math.round(fwd)}W`;
    if (refVal) refVal.textContent = `${Math.round(ref)}W`;
  };

  const resetPwr = () => {
    if (fwdFill) fwdFill.style.transform = "scaleX(0)";
    if (refFill) refFill.style.transform = "scaleX(0)";
    if (fwdVal) fwdVal.textContent = "0 W";
    if (refVal) refVal.textContent = "0 W";
  };

  const stopVswr = () => {
    cancelAnimationFrame(vswrRaf);
    window.clearTimeout(vswrTimer);
  };

  const runVswr = () => {
    if (!vswrChip) return;
    stopVswr();
    vswrChip.classList.remove("is-matched");
    if (prefersReducedMotion()) {
      vswrChip.textContent = "VSWR 1.20";
      vswrChip.classList.add("is-matched");
      setPwr(95, 2);
      return;
    }
    vswrChip.textContent = vswrIdle;
    setPwr(0, 0);
    vswrTimer = window.setTimeout(() => {
      const duration = 1600;
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const vswr = 2.4 - 1.2 * eased;
        const fwd = 55 + 40 * eased;
        const ref = 38 - 36 * eased;
        vswrChip.textContent = t < 1 ? `VSWR ${vswr.toFixed(2)}` : "VSWR 1.20";
        setPwr(fwd, ref);
        if (t < 1) {
          vswrRaf = requestAnimationFrame(frame);
        } else {
          vswrChip.classList.add("is-matched");
        }
      };
      vswrRaf = requestAnimationFrame(frame);
    }, 500);
  };

  const enterCard = (card) => {
    if (card.classList.contains("fx-on")) return;
    card.classList.add("fx-on");
    if (card.dataset.fx === "vswr") runVswr();
  };

  const leaveCard = (card) => {
    if (!card.classList.contains("fx-on")) return;
    card.classList.remove("fx-on");
    if (card.dataset.fx === "vswr") {
      stopVswr();
      // Reset after the fade-out so the swap is invisible
      vswrTimer = window.setTimeout(() => {
        vswrChip?.classList.remove("is-matched");
        if (vswrChip) vswrChip.textContent = vswrIdle;
        resetPwr();
      }, 240);
    }
  };

  fxCards.forEach((card) => {
    card.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && hoverFine.matches) enterCard(card);
    }, { signal: listenerController.signal });
    card.addEventListener("pointerleave", () => {
      if (hoverFine.matches) leaveCard(card);
    }, { signal: listenerController.signal });
    card.addEventListener("focus", () => {
      if (card.matches(":focus-visible")) enterCard(card);
    }, { signal: listenerController.signal });
    card.addEventListener("blur", () => leaveCard(card), { signal: listenerController.signal });
  });

  cleanupCardFx = () => {
    stopVswr();
  };
}

cleanupPortfolioHome = () => {
  listenerController.abort();
  spy?.disconnect();
  cleanupCardFx();
};
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPortfolioHome, { once: true });
} else {
  initPortfolioHome();
}
document.addEventListener("astro:page-load", initPortfolioHome);
document.addEventListener("astro:before-preparation", () => cleanupPortfolioHome());

