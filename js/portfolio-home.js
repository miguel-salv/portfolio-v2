(function () {
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const headline = document.querySelector(".hero [data-animate-title]");
// Title rise, first-visit boot only
if (
  headline &&
  !reduceMotion &&
  document.documentElement.dataset.boot === "1"
) {
  const counter = { i: 0 };
  const splitWords = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment();
        (child.textContent || "").split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement("span");
          span.className = "char";
          span.style.setProperty("--i", String(counter.i++));
          span.textContent = part;
          fragment.appendChild(span);
        });
        node.replaceChild(fragment, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        splitWords(child);
      }
    });
  };
  splitWords(headline);
  headline.setAttribute("aria-label", headline.textContent);
  headline.querySelectorAll(".char").forEach(span => span.setAttribute("aria-hidden", "true"));
}
})();

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
  const spy = new IntersectionObserver((entries) => {
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
window.PortfolioAddressMap?.init({
  readoutSelector: "[data-status-readout]",
  markerSelector: ".section-head[data-address]",
  addressSelector: ".meta-status-addr",
  labelSelector: ".meta-status-label",
  progressSelector: ".meta-status-pct",
  activationRatio: 0.35,
  defaultAddress: "0x0000",
  defaultLabel: "Top",
  resolveMarker: (head) => {
    const section = head.closest("section[id]") || head;
    const raw = (head.querySelector(".mono")?.textContent || section.id || "").trim();
    return { element: section, address: head.dataset.address, label: raw.replace(/^my\s+/i, "") };
  },
});

// Boot sequence: plays once per visitor (index only), skippable
const bootEl = document.querySelector(".boot");
if (document.documentElement.dataset.boot === "1" && bootEl) {
  const finishBoot = () => {
    if (bootEl.classList.contains("done")) return;
    bootEl.classList.add("done");
    try {
      localStorage.setItem("portfolio-boot", "done");
    } catch (_) { /* Boot simply replays next visit */ }
    window.setTimeout(() => {
      bootEl.remove();
      delete document.documentElement.dataset.boot;
    }, 320);
  };
  bootEl.classList.add("run");
  window.setTimeout(finishBoot, 1100);
  bootEl.addEventListener("click", finishBoot);
  const dismissBootOnKey = (event) => {
    if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    finishBoot();
    document.removeEventListener("keydown", dismissBootOnKey);
  };
  document.addEventListener("keydown", dismissBootOnKey);
} else {
  bootEl?.remove();
  delete document.documentElement.dataset.boot;
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

  if (reduceMotion) {
    tracePath.setAttribute("d", squarePath());
  } else {
    const morph = 1900;
    let morphStart = 0; // 0 until convergence is triggered; noise-only before
    let raf = 0;

    // Noise animates from the first frame; only the morph to square is deferred
    const frame = (now) => {
      const morphT = morphStart ? Math.min((now - morphStart) / morph, 1) : 0;
      tracePath.setAttribute("d", buildPath(morphT, now));
      if (!morphStart || now - morphStart < morph) {
        raf = requestAnimationFrame(frame);
      } else {
        tracePath.setAttribute("d", squarePath());
      }
    };

    raf = requestAnimationFrame(frame);

    let bootTimer = 0;
    let scheduled = false;

    const triggerMorph = () => {
      if (!morphStart) morphStart = performance.now();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.clearTimeout(bootTimer);
      bootTimer = window.setTimeout(triggerMorph, 420);
    };

    if (document.documentElement.dataset.boot === "1") {
      const boot = document.querySelector(".boot");
      boot?.addEventListener("click", schedule, { once: true });
      document.addEventListener("keydown", schedule, { once: true });
      bootTimer = window.setTimeout(schedule, 1120);
    } else {
      window.setTimeout(triggerMorph, 1320);
    }
  }
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
    if (reduceMotion) {
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
    hoverFine.addEventListener("change", syncFxMode);
  } else {
    hoverFine.addListener(syncFxMode);
  }

}

const liveAge = document.querySelector("[data-live-age]");
if (liveAge) {
  const birth = new Date(2005, 1, 20);
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;
  let ageTimer = 0;

  const tickAge = () => {
    const age = (Date.now() - birth.getTime()) / yearMs;
    liveAge.textContent = `AGE // ${age.toFixed(9)}`;
  };

  const startAge = () => {
    tickAge();
    window.clearInterval(ageTimer);
    ageTimer = window.setInterval(tickAge, 100);
  };

  const stopAge = () => {
    window.clearInterval(ageTimer);
    ageTimer = 0;
  };

  startAge();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAge();
    else startAge();
  });
}

// Footer uptime counter (index); performance.now() stays true across tab backgrounding
const uptimeEl = document.querySelector("[data-uptime]");
if (uptimeEl) {
  const started = performance.now();
  let uptimeTimer = 0;
  const pad = (n) => String(n).padStart(2, "0");

  const renderUptime = () => {
    const total = Math.floor((performance.now() - started) / 1000);
    uptimeEl.textContent = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  };

  const startUptime = () => {
    renderUptime();
    window.clearInterval(uptimeTimer);
    uptimeTimer = window.setInterval(renderUptime, 1000);
  };

  const stopUptime = () => {
    window.clearInterval(uptimeTimer);
    uptimeTimer = 0;
  };

  startUptime();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopUptime();
    else startUptime();
  });
}
