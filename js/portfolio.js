const navToggle = document.querySelector(".mobile-toggle");
const navLinks = document.querySelector("#nav-links");
const themeToggle = document.querySelector("[data-theme-toggle]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileNavQuery = window.matchMedia("(max-width: 900px)");

function readStoredTheme() {
  try {
    return localStorage.getItem("portfolio-theme");
  } catch (_) {
    return null;
  }
}

function writeStoredTheme(theme) {
  try {
    localStorage.setItem("portfolio-theme", theme);
  } catch (_) {
    return;
  }
}

function resolveTheme() {
  const stored = readStoredTheme();
  if (stored === "dark" || stored === "light") return stored;
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const THEME_COLORS = { light: "#f4ead8", dark: "#141413" };

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));
  if (themeToggle) {
    themeToggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.setAttribute("content", THEME_COLORS[nextTheme]);
}

setTheme(resolveTheme());

// Cross-page section links navigate hash-less, then restore the hash after load (avoids Arc's hash-scroll snap).
function resolveHashTarget(hash = window.location.hash) {
  if (!hash || hash === "#") return null;
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!id) return null;
  try {
    const decoded = decodeURIComponent(id);
    return document.getElementById(decoded) || document.querySelector(`#${CSS.escape(decoded)}`);
  } catch (_) {
    return document.getElementById(id);
  }
}

function hashScrollY(target) {
  const top = target.getBoundingClientRect().top + window.scrollY;
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  return Math.max(0, Math.round(top - margin));
}

function scrollToHash(hash, behavior) {
  const target = resolveHashTarget(hash);
  if (!target) return;
  if (behavior === "auto") {
    window.scrollTo(0, hashScrollY(target));
    return;
  }
  target.scrollIntoView({ behavior, block: "start" });
}

function whenLayoutReadyForHash(target) {
  const fonts = document.fonts?.ready
    ? Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 500)),
      ])
    : Promise.resolve();

  const imagesAbove = Array.from(document.images).filter((img) => {
    if (!img.getAttribute("src") || img.complete) return false;
    const targetTop = target.getBoundingClientRect().top + window.scrollY;
    return img.getBoundingClientRect().top + window.scrollY < targetTop;
  });

  const images = imagesAbove.length
    ? Promise.race([
        Promise.all(
          imagesAbove.map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              })
          )
        ),
        new Promise((resolve) => window.setTimeout(resolve, 700)),
      ])
    : Promise.resolve();

  return Promise.all([fonts, images]);
}

function lockHashScrollOnLoad() {
  const pendingHash = window.__portfolioHash || "";
  delete window.__portfolioHash;
  const clearPending = () => document.documentElement.classList.remove("hash-pending");

  if (!pendingHash || pendingHash === "#") {
    clearPending();
    return;
  }

  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (_) { /* ignore */ }

  const target = resolveHashTarget(pendingHash);
  if (!target) {
    clearPending();
    try {
      history.replaceState(null, "", pendingHash);
    } catch (_) { /* ignore */ }
    return;
  }

  whenLayoutReadyForHash(target).then(() => {
    window.scrollTo(0, hashScrollY(target));
    try {
      history.replaceState(null, "", pendingHash);
    } catch (_) { /* ignore */ }
    // Re-correct in case restoring the hash nudged scroll.
    window.requestAnimationFrame(() => {
      window.scrollTo(0, hashScrollY(target));
      clearPending();
    });
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted || !window.location.hash) return;
    scrollToHash(window.location.hash, "auto");
  });
}

lockHashScrollOnLoad();

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.target && link.target !== "_self") return;

  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch (_) {
    return;
  }
  if (url.origin !== window.location.origin) return;
  if (!url.hash || url.hash === "#") return;

  if (url.pathname === window.location.pathname) {
    const target = resolveHashTarget(url.hash);
    if (!target) return;
    event.preventDefault();
    if (window.location.hash !== url.hash) {
      history.pushState(null, "", url.hash);
    }
    scrollToHash(url.hash, reduceMotion ? "auto" : "smooth");
    setMobileMenuState(false);
    return;
  }

  event.preventDefault();
  try {
    sessionStorage.setItem("portfolio-scroll", url.hash);
    window.location.assign(`${url.pathname}${url.search}`);
  } catch (_) {
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  }
});

window.addEventListener("hashchange", () => {
  if (!window.location.hash || window.location.hash === "#") return;
  if (document.documentElement.classList.contains("hash-pending")) return;
  scrollToHash(window.location.hash, reduceMotion ? "auto" : "smooth");
});

function setMobileMenuState(open) {
  if (!navLinks || !navToggle) return;
  navLinks.classList.toggle("open", open);
  navLinks.hidden = mobileNavQuery.matches && !open;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
}

function syncNavigationMode() {
  if (!navLinks || !navToggle) return;
  if (mobileNavQuery.matches) {
    setMobileMenuState(navLinks.classList.contains("open"));
  } else {
    navLinks.hidden = false;
    navLinks.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
}

syncNavigationMode();
if (mobileNavQuery.addEventListener) {
  mobileNavQuery.addEventListener("change", syncNavigationMode);
} else {
  mobileNavQuery.addListener(syncNavigationMode);
}

navToggle?.addEventListener("click", () => {
  setMobileMenuState(!navLinks?.classList.contains("open"));
});

navLinks?.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.matches("a")) {
    setMobileMenuState(false);
  }
});

document.addEventListener("click", (event) => {
  if (!mobileNavQuery.matches || !navLinks?.classList.contains("open")) return;
  if (!(event.target instanceof Node)) return;
  if (navLinks.contains(event.target) || navToggle?.contains(event.target)) return;
  setMobileMenuState(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !navLinks?.classList.contains("open")) return;
  setMobileMenuState(false);
  navToggle?.focus();
});

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  writeStoredTheme(nextTheme);
  setTheme(nextTheme);
});

// Follow the OS theme live until the visitor makes an explicit choice.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  if (readStoredTheme()) return;
  setTheme(event.matches ? "dark" : "light");
});

const headline = document.querySelector(".hero [data-animate-title]");
// Rise animation only under the first-visit boot overlay (no flash on cross-page loads).
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
}

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

// Live status readout in the meta-strip: tracks the addressed section in view
// plus overall scroll progress. Index-only (guarded by [data-status-readout]).
const statusReadout = document.querySelector("[data-status-readout]");
if (statusReadout) {
  const addrEl = statusReadout.querySelector(".meta-status-addr");
  const labelEl = statusReadout.querySelector(".meta-status-label");
  const pctEl = statusReadout.querySelector(".meta-status-pct");

  const marks = Array.from(document.querySelectorAll(".section-head[data-address]")).map((head) => {
    const section = head.closest("section[id]") || head;
    const raw = (head.querySelector(".mono")?.textContent || section.id || "").trim();
    return { section, address: head.dataset.address, label: raw.replace(/^my\s+/i, "") };
  });

  let lastAddr = null;
  let lastPct = null;

  const update = () => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.round(Math.min(1, Math.max(0, window.scrollY / scrollable)) * 100);

    // The section is "current" once its top passes an activation line ~35% down
    // the viewport, matching the nav scroll-spy's activation band.
    const line = window.innerHeight * 0.35;
    let current = { address: "0x0000", label: "Top" };
    for (const mark of marks) {
      if (mark.section.getBoundingClientRect().top <= line) current = mark;
    }

    if (addrEl && current.address !== lastAddr) {
      lastAddr = current.address;
      addrEl.textContent = current.address;
      if (labelEl) labelEl.textContent = current.label;
    }
    if (pctEl && pct !== lastPct) {
      lastPct = pct;
      pctEl.textContent = `${pct}%`;
    }
  };

  let ticking = false;
  const requestStatusUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  update();
  window.addEventListener("scroll", requestStatusUpdate, { passive: true });
  window.addEventListener("resize", requestStatusUpdate, { passive: true });
}

// Portrait probe: instrument view-modes over the hero portrait. Radiogroup
// semantics (roving tabindex + arrow keys); each mode swaps an SVG filter on
// the card and plays a one-shot scan sweep (reduced-motion safe). Index-only.
const portraitProbe = document.querySelector("[data-portrait-probe]");
const probeCard = portraitProbe ? portraitProbe.closest(".portrait-card") : null;
if (portraitProbe && probeCard) {
  const radios = Array.from(portraitProbe.querySelectorAll("[data-probe-mode]"));
  const scan = probeCard.querySelector(".portrait-scan");

  const runScan = () => {
    if (!scan || reduceMotion) return;
    scan.classList.remove("is-scanning");
    void scan.offsetWidth; // reflow so the animation restarts on every switch
    scan.classList.add("is-scanning");
  };

  const select = (mode, focus) => {
    radios.forEach((radio) => {
      const on = radio.dataset.probeMode === mode;
      radio.setAttribute("aria-checked", String(on));
      radio.tabIndex = on ? 0 : -1;
      if (on && focus) radio.focus();
    });
    if (probeCard.dataset.probe !== mode) {
      probeCard.dataset.probe = mode;
      runScan();
    }
  };

  radios.forEach((radio, i) => {
    radio.addEventListener("click", () => select(radio.dataset.probeMode, false));
    radio.addEventListener("keydown", (event) => {
      const dir = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      event.preventDefault();
      const next = radios[(i + dir + radios.length) % radios.length];
      select(next.dataset.probeMode, true);
    });
  });

  if (scan) scan.addEventListener("animationend", () => scan.classList.remove("is-scanning"));
  probeCard.dataset.probe = "photo";
}

// Boot sequence: plays once per visitor (index only), skippable, then never again.
const bootEl = document.querySelector(".boot");
if (document.documentElement.dataset.boot === "1" && bootEl) {
  const finishBoot = () => {
    if (bootEl.classList.contains("done")) return;
    bootEl.classList.add("done");
    try {
      localStorage.setItem("portfolio-boot", "done");
    } catch (_) { /* boot simply replays next visit */ }
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

// Hero scope trace: morph one SVG path from noisy analog to a square wave.
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
    const hold = 800;
    const morph = 1900;
    let start = 0;
    let raf = 0;

    const frame = (now) => {
      if (!start) start = now;
      const elapsed = now - start;
      let morphT = 0;
      if (elapsed > hold) {
        morphT = Math.min((elapsed - hold) / morph, 1);
      }
      tracePath.setAttribute("d", buildPath(morphT, now));
      if (elapsed < hold + morph) {
        raf = requestAnimationFrame(frame);
      } else {
        tracePath.setAttribute("d", squarePath());
      }
    };

    let bootTimer = 0;
    let scheduled = false;

    const begin = () => {
      cancelAnimationFrame(raf);
      start = 0;
      tracePath.setAttribute("d", buildPath(0, performance.now()));
      raf = requestAnimationFrame(frame);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.clearTimeout(bootTimer);
      bootTimer = window.setTimeout(begin, 420);
    };

    if (document.documentElement.dataset.boot === "1") {
      const boot = document.querySelector(".boot");
      boot?.addEventListener("click", schedule, { once: true });
      document.addEventListener("keydown", schedule, { once: true });
      bootTimer = window.setTimeout(schedule, 1120);
    } else {
      window.setTimeout(begin, 520);
    }
  }
}

// Project card effects: arm the overlay on hover (mouse), in-view (touch), or focus.
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
    if (reduceMotion) {
      vswrChip.textContent = "VSWR 1.2";
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
        vswrChip.textContent = t < 1 ? `VSWR ${vswr.toFixed(2)}` : "VSWR 1.2";
        setPwr(fwd, ref);
        if (t < 1) vswrRaf = requestAnimationFrame(frame);
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
      // Reset after the overlay fade-out so the swap is invisible.
      vswrTimer = window.setTimeout(() => {
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

// Live age readout on the hero portrait plate (birth: 2005-02-20, local midnight).
const liveAge = document.querySelector("[data-live-age]");
if (liveAge) {
  const birth = new Date(2005, 1, 20);
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;
  let ageTimer = 0;

  const tickAge = () => {
    const age = (Date.now() - birth.getTime()) / yearMs;
    liveAge.textContent = `Age ${age.toFixed(9)}`;
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

// Halt-log uptime counter (index footer): a shutdown bookend to the boot log.
// Uses performance.now() so the readout stays true across tab backgrounding.
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

// Metric chips: count up once when scrolled into view.
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

console.log(
  "%c[0x0000] Vectors OK\n%c[0x0001] Console attached \u2014 hi, fellow engineer.\nSource: https://github.com/miguel-salv \u00b7 Say hello: miguel@miguelsalv.com",
  "font-family: monospace; font-size: 12px; color: #4d7291; font-weight: bold;",
  "font-family: monospace; font-size: 12px; color: inherit;"
);

// ── Command palette (Cmd/Ctrl-K) ─────────────────────────────────────────────
// Site-wide launcher: jump to sections/projects/pages or run quick actions.
// Lives in portfolio.js (loaded on every page) so the chip + dialog stay in
// lockstep across pages with zero per-page markup. Navigation is delegated to
// the click handler above (synthesised anchor click) so same-page smooth
// scroll, cross-page hash restore, and external new-tab all behave identically.
(function initCommandPalette() {
  const navTools = document.querySelector(".nav-tools");
  if (!navTools) return; // legacy pages without a toolbar opt out

  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
  const inResume = /\/resume\//.test(location.pathname);
  const homeBase = inResume ? "../" : "";
  const onIndex = !!document.getElementById("top");

  function go(href, external) {
    const a = document.createElement("a");
    a.href = href;
    if (external) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const sectionHref = (hash) => (onIndex ? hash : `${homeBase}index.html${hash}`);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    writeStoredTheme(next);
    setTheme(next);
  }

  function copyEmail() {
    const email = "msalvacion@cmu.edu";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).catch(() => go(`mailto:${email}`));
    } else {
      go(`mailto:${email}`);
    }
  }

  const commands = [
    { label: "Home", tag: "Section", keywords: "top start hero", run: () => go(onIndex ? "#top" : `${homeBase}index.html`) },
    { label: "About", tag: "Section", keywords: "bio background", run: () => go(sectionHref("#about")) },
    { label: "Career", tag: "Section", keywords: "experience work timeline jobs", run: () => go(sectionHref("#career")) },
    { label: "Projects", tag: "Section", keywords: "work portfolio builds", run: () => go(sectionHref("#projects")) },
    { label: "Resume", tag: "Page", keywords: "cv resume pdf resume", run: () => go(`${homeBase}resume/`) },
    { label: "Automated Impedance Matcher", tag: "Project", keywords: "rf vswr matching hacker fab teensy", run: () => go(`${homeBase}project-impedance.html`) },
    { label: "Real-Time Embedded Vehicle", tag: "Project", keywords: "rtos stm32 scheduler pid", run: () => go(`${homeBase}project-vehicle.html`) },
    { label: "Trash Collection Robot", tag: "Project", keywords: "cv vision arduino raspberry pi", run: () => go(`${homeBase}project-robot.html`) },
    { label: "Kirby Companion", tag: "Project", keywords: "esp32 display touch smart", run: () => go(`${homeBase}project-companion.html`) },
    { label: "Kirby LED Keychain", tag: "Project", keywords: "555 pcb analog led chaser", run: () => go(`${homeBase}project-keychain.html`) },
    { label: "Toggle theme", tag: "Action", keywords: "dark light mode appearance", run: toggleTheme },
    { label: "Copy email", tag: "Action", keywords: "contact mail address", run: copyEmail },
    { label: "GitHub", tag: "External", keywords: "code source repos", run: () => go("https://github.com/miguel-salv", true) },
    { label: "LinkedIn", tag: "External", keywords: "connect network", run: () => go("https://www.linkedin.com/in/msalvacion/", true) },
  ];

  const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "cmdk-chip";
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", "false");
  chip.setAttribute("aria-label", "Open command palette");
  chip.innerHTML =
    `<span class="cmdk-chip-icon">${SEARCH_ICON}</span>` +
    '<span class="cmdk-chip-label">Search</span>' +
    `<span class="cmdk-chip-keys" aria-hidden="true"><kbd>${isMac ? "\u2318" : "Ctrl"}</kbd><kbd>K</kbd></span>`;
  navTools.insertBefore(chip, navTools.firstChild);

  const overlay = document.createElement("div");
  overlay.className = "cmdk";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="cmdk-scrim" data-cmdk-close></div>' +
    '<div class="cmdk-dialog" role="dialog" aria-modal="true" aria-label="Command palette">' +
      `<div class="cmdk-field"><span class="cmdk-field-icon">${SEARCH_ICON}</span>` +
        '<input class="cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-listbox" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Jump to a section, project, or action\u2026" />' +
        '<kbd class="cmdk-hint">Esc</kbd>' +
      '</div>' +
      '<ul class="cmdk-listbox" id="cmdk-listbox" role="listbox" aria-label="Results"></ul>' +
      '<p class="cmdk-empty" hidden>No matches found</p>' +
    '</div>';
  document.body.appendChild(overlay);

  const scrim = overlay.querySelector(".cmdk-scrim");
  const dialog = overlay.querySelector(".cmdk-dialog");
  const input = overlay.querySelector(".cmdk-input");
  const listbox = overlay.querySelector(".cmdk-listbox");
  const empty = overlay.querySelector(".cmdk-empty");

  let current = [];
  let activeIndex = 0;
  let lastFocus = null;
  let lockScrollY = 0;

  function filterCommands(query) {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice();
    const ranked = [];
    for (const cmd of commands) {
      const label = cmd.label.toLowerCase();
      const kw = `${cmd.keywords || ""} ${cmd.tag}`.toLowerCase();
      let rank = -1;
      if (label.startsWith(q)) rank = 0;
      else if (label.includes(q)) rank = 1;
      else if (kw.includes(q)) rank = 2;
      if (rank >= 0) ranked.push([rank, cmd]);
    }
    ranked.sort((a, b) => a[0] - b[0]);
    return ranked.map((entry) => entry[1]);
  }

  function render(list) {
    current = list;
    listbox.replaceChildren();
    if (!list.length) {
      empty.hidden = false;
      listbox.hidden = true;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    empty.hidden = true;
    listbox.hidden = false;
    const frag = document.createDocumentFragment();
    list.forEach((cmd, i) => {
      const li = document.createElement("li");
      li.className = "cmdk-option";
      li.id = `cmdk-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.index = String(i);
      const label = document.createElement("span");
      label.className = "cmdk-option-label";
      label.textContent = cmd.label;
      const tag = document.createElement("span");
      tag.className = "cmdk-option-tag";
      tag.textContent = cmd.tag;
      li.append(label, tag);
      frag.appendChild(li);
    });
    listbox.appendChild(frag);
  }

  function setActive(idx) {
    if (!current.length) return;
    activeIndex = Math.max(0, Math.min(current.length - 1, idx));
    const opts = listbox.children;
    for (let i = 0; i < opts.length; i++) {
      const selected = i === activeIndex;
      opts[i].setAttribute("aria-selected", String(selected));
      opts[i].classList.toggle("is-active", selected);
    }
    input.setAttribute("aria-activedescendant", `cmdk-opt-${activeIndex}`);
    const active = opts[activeIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  const isOpen = () => !overlay.hidden;

  function openPalette() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    lockScrollY = window.scrollY;
    document.documentElement.style.setProperty("--cmdk-lock-y", `-${lockScrollY}px`);
    document.documentElement.classList.add("cmdk-open");
    chip.setAttribute("aria-expanded", "true");
    input.value = "";
    render(filterCommands(""));
    setActive(0);
    requestAnimationFrame(() => input.focus());
  }

  function closePalette() {
    if (!isOpen()) return;
    overlay.hidden = true;
    document.documentElement.classList.remove("cmdk-open");
    document.documentElement.style.removeProperty("--cmdk-lock-y");
    window.scrollTo(0, lockScrollY);
    chip.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function activate(cmd) {
    if (!cmd) return;
    closePalette();
    cmd.run();
  }

  chip.addEventListener("click", openPalette);
  scrim.addEventListener("click", closePalette);
  dialog.addEventListener("click", (event) => {
    const li = event.target instanceof Element ? event.target.closest(".cmdk-option") : null;
    if (li) activate(current[Number(li.dataset.index)]);
  });
  listbox.addEventListener("pointermove", (event) => {
    const li = event.target instanceof Element ? event.target.closest(".cmdk-option") : null;
    if (li) setActive(Number(li.dataset.index));
  });

  input.addEventListener("input", () => {
    render(filterCommands(input.value));
    setActive(0);
  });

  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); setActive(activeIndex + 1); break;
      case "ArrowUp": event.preventDefault(); setActive(activeIndex - 1); break;
      case "Home": event.preventDefault(); setActive(0); break;
      case "End": event.preventDefault(); setActive(current.length - 1); break;
      case "Enter": event.preventDefault(); activate(current[activeIndex]); break;
      case "Tab": event.preventDefault(); break; // trap focus on the input
      default: break;
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (isOpen()) closePalette();
      else openPalette();
    } else if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      closePalette();
    }
  });
})();
