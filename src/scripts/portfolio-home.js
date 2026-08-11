const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = () => motionQuery.matches;
let cleanupPortfolioHome = () => {};

function initPortfolioHome() {
cleanupPortfolioHome();
if (!document.getElementById("top")) return;
const listenerController = new AbortController();
let spy = null;
let morphRaf = 0;
let morphTimer = 0;
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
// Hero scope trace: morph an SVG path from noisy analog to a square wave
const tracePath = document.querySelector(".trace-path");
if (tracePath) {
  const xMin = 2;
  const xMax = 86;
  const steps = 48;
  const xs = Array.from({ length: steps + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / steps);

  const squareY = (x) => {
    const period = 24;
    const pos = ((x - xMin) % period + period) % period;
    return pos < 12 ? 15 : 5;
  };

  const noisyY = (x, time) =>
    10 +
    3.1 * Math.sin(x * 0.38 + 0.55) +
    1.7 * Math.sin(x * 0.93 + 2.05) +
    0.85 * Math.sin(x * 1.62 + 0.15) +
    0.35 * Math.sin(time * 0.022 + x * 0.21);

  const buildPath = (t, time) => {
    const eased = 1 - Math.pow(1 - t, 3);
    const jitter = (1 - eased) * 0.45;
    let d = "";
    xs.forEach((x, i) => {
      const n = noisyY(x, time);
      const s = squareY(x);
      const y = n + (s - n) * eased + jitter * Math.sin(x * 0.47 + time * 0.019);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)} `;
    });
    return d.trim();
  };

  const squarePath = () => {
    let d = "";
    xs.forEach((x, i) => {
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${squareY(x).toFixed(2)} `;
    });
    return d.trim();
  };

  if (prefersReducedMotion()) {
    tracePath.setAttribute("d", squarePath());
  } else {
    const morph = 1900;
    let morphStart = 0; // 0 until convergence is triggered; noise-only before

    // Noise animates from the first frame; only the morph to square is deferred
    const frame = (now) => {
      const morphT = morphStart ? Math.min((now - morphStart) / morph, 1) : 0;
      tracePath.setAttribute("d", buildPath(morphT, now));
      if (!morphStart || now - morphStart < morph) {
        morphRaf = requestAnimationFrame(frame);
      } else {
        tracePath.setAttribute("d", squarePath());
      }
    };

    morphRaf = requestAnimationFrame(frame);

    const triggerMorph = () => {
      if (!morphStart) morphStart = performance.now();
    };

    morphTimer = window.setTimeout(triggerMorph, 1320);
  }

  motionQuery.addEventListener?.("change", (event) => {
    if (!event.matches) return;
    cancelAnimationFrame(morphRaf);
    tracePath.setAttribute("d", squarePath());
  }, { signal: listenerController.signal });
}

// Project card effects: arm the overlay on hover (mouse), in-view (touch), or focus
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
  let inViewObserver = null;

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

  const enableInViewFx = () => {
    if (inViewObserver || !("IntersectionObserver" in window)) return;
    inViewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) enterCard(entry.target);
        else leaveCard(entry.target);
      });
    }, { threshold: 0.35, rootMargin: "-10% 0px -15% 0px" });
    fxCards.forEach((card) => inViewObserver.observe(card));
  };

  const disableInViewFx = () => {
    inViewObserver?.disconnect();
    inViewObserver = null;
    fxCards.forEach((card) => leaveCard(card));
  };

  const syncFxMode = () => {
    if (hoverFine.matches) disableInViewFx();
    else enableInViewFx();
  };

  fxCards.forEach((card) => {
    card.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && hoverFine.matches) enterCard(card);
    });
    card.addEventListener("pointerleave", () => {
      if (hoverFine.matches) leaveCard(card);
    });
    card.addEventListener("focus", () => {
      if (card.matches(":focus-visible")) enterCard(card);
    });
    card.addEventListener("blur", () => leaveCard(card));
  });

  syncFxMode();
  if (hoverFine.addEventListener) {
    hoverFine.addEventListener("change", syncFxMode, { signal: listenerController.signal });
  } else {
    hoverFine.addListener(syncFxMode);
  }

  cleanupCardFx = () => {
    inViewObserver?.disconnect();
    stopVswr();
    if (!hoverFine.removeEventListener) hoverFine.removeListener(syncFxMode);
  };
}

cleanupPortfolioHome = () => {
  listenerController.abort();
  spy?.disconnect();
  cancelAnimationFrame(morphRaf);
  window.clearTimeout(morphTimer);
  cleanupCardFx();
};
}

document.addEventListener("astro:page-load", initPortfolioHome);
document.addEventListener("astro:before-preparation", () => cleanupPortfolioHome());

