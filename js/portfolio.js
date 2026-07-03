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
document.body.classList.add("is-ready");

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

const headline = document.querySelector("[data-animate-title]");
if (headline && !reduceMotion) {
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
document.querySelectorAll('.nav-links a[href^="#"], .address-rail a[href^="#"]').forEach((link) => {
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
  window.setTimeout(finishBoot, 1700);
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
    const hold = 800  ;
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
      bootTimer = window.setTimeout(schedule, 1720);
    } else {
      window.setTimeout(begin, 520);
    }
  }
}

// Project card effects: one overlay per card, armed once per hover entry
// (mouse) or keyboard focus. Touch devices skip them; reduced motion jumps
// straight to the final readout.
const fxCards = document.querySelectorAll(".project-card[data-fx]");
if (fxCards.length) {
  const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const vswrChip = document.querySelector("[data-fx-vswr]");
  const vswrIdle = "Tuning\u2026";
  let vswrRaf = 0;
  let vswrTimer = 0;

  const stopVswr = () => {
    cancelAnimationFrame(vswrRaf);
    window.clearTimeout(vswrTimer);
  };

  const runVswr = () => {
    if (!vswrChip) return;
    stopVswr();
    if (reduceMotion) {
      vswrChip.textContent = "VSWR 1.2";
      return;
    }
    vswrChip.textContent = vswrIdle;
    vswrTimer = window.setTimeout(() => {
      const duration = 1000;
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = 2.4 - 1.2 * eased;
        vswrChip.textContent = t < 1 ? `VSWR ${value.toFixed(2)}` : "VSWR 1.2";
        if (t < 1) vswrRaf = requestAnimationFrame(frame);
      };
      vswrRaf = requestAnimationFrame(frame);
    }, 600);
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
      }, 240);
    }
  };

  fxCards.forEach((card) => {
    card.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && hoverFine.matches) enterCard(card);
    });
    card.addEventListener("pointerleave", () => leaveCard(card));
    card.addEventListener("focus", () => {
      if (card.matches(":focus-visible")) enterCard(card);
    });
    card.addEventListener("blur", () => leaveCard(card));
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
