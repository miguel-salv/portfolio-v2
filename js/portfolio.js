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

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));
  if (themeToggle) {
    themeToggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}

setTheme(resolveTheme());

// Cross-page section links: stash target in sessionStorage, navigate without a
// hash, land once under a cover on index, then restore the hash. Avoids Arc's
// native hash-scroll snap.
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
    // One more pass under the cover in case restoring the hash nudged scroll.
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

const headline = document.querySelector(".hero [data-animate-title]");
// Rise animation only under the first-visit boot overlay. Cross-page loads
// keep titles static so navigation never flashes blank → animate.
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

// Hero scope trace: one SVG path morphs from a noisy analog waveform into
// a square wave — each sample point lerps so the shape actually transforms.
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

// Project card effects: one overlay per card, armed once per hover entry
// (mouse), when scrolled into view (touch), or on keyboard focus. Reduced
// motion jumps straight to the final readout.
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

// Metric readouts: opted-in chips count up once when they enter the viewport.
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
  if (reduceMotion || !("IntersectionObserver" in window)) {
    // leave original text untouched
  } else {
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

// A small readout for anyone who came looking under the hood.
console.log(
  "%c[0x0000] Vectors OK\n%c[0x0001] Console attached \u2014 hi, fellow engineer.\nSource: https://github.com/miguel-salv \u00b7 Say hello: miguel@miguelsalv.com",
  "font-family: monospace; font-size: 12px; color: #4d7291; font-weight: bold;",
  "font-family: monospace; font-size: 12px; color: inherit;"
);
