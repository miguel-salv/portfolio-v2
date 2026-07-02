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

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));
  if (themeToggle) {
    themeToggle.textContent = nextTheme === "dark" ? "Light" : "Dark";
    themeToggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
}

setTheme(readStoredTheme());
document.body.classList.add("is-ready");

function setMobileMenuState(open) {
  if (!navLinks || !navToggle) return;
  navLinks.classList.toggle("open", open);
  navLinks.hidden = mobileNavQuery.matches && !open;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  navToggle.textContent = open ? "Close" : "Menu";
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

if (reduceMotion || !("IntersectionObserver" in window)) {
  document.querySelectorAll(".reveal").forEach((element) => element.classList.add("in"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
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
  document.addEventListener("keydown", finishBoot);
} else {
  bootEl?.remove();
  delete document.documentElement.dataset.boot;
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
