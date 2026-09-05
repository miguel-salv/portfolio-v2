import { navigate } from "astro:transitions/client";

let navToggle = document.querySelector(".mobile-toggle");
let navLinks = document.querySelector("#nav-links");
let themeToggle = document.querySelector("[data-theme-toggle]");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = () => motionQuery.matches;
const mobileNavQuery = window.matchMedia("(max-width: 900px)");
const HEADER_SOLID_AT = 12;
const RESTORE_MIN = 64;
let restoreInFlight = false;

function writePageScroll(y) {
  try {
    sessionStorage.setItem("portfolio-scroll-y", JSON.stringify({
      path: location.pathname,
      y,
      t: Date.now(),
    }));
  } catch (_) { /* Ignore */ }
}

function astroHistoryState(y) {
  const current = history.state && typeof history.state === "object" ? history.state : {};
  return {
    index: typeof current.index === "number" ? current.index : 0,
    ...current,
    scrollX: 0,
    scrollY: y,
  };
}

function writeHistoryScroll(y, stripHash = false) {
  const url = stripHash && location.hash && location.hash !== "#"
    ? `${location.pathname}${location.search}`
    : location.href;
  try {
    history.replaceState(astroHistoryState(y), "", url);
  } catch (_) { /* Ignore */ }
}

function clearAtTopLeftovers() {
  try {
    sessionStorage.removeItem("portfolio-scroll");
  } catch (_) { /* Ignore */ }
  writeHistoryScroll(0, true);
}

function pageScrollY() {
  const root = document.documentElement;
  if (root.classList.contains("cmdk-open")) {
    const locked = Number.parseFloat(root.style.getPropertyValue("--cmdk-lock-y"));
    if (Number.isFinite(locked)) return Math.abs(locked);
  }
  return window.scrollY;
}

function persistPageScroll(options = {}) {
  if (!options.force && (restoreInFlight || document.documentElement.classList.contains("hash-pending") || document.documentElement.classList.contains("cmdk-open"))) {
    return;
  }
  const y = Math.round(pageScrollY());
  if (y <= HEADER_SOLID_AT) {
    writePageScroll(0);
    clearAtTopLeftovers();
    return;
  }
  writePageScroll(y);
}

document.addEventListener("astro:after-swap", () => {
  document.documentElement.classList.add("js");
  setTheme(resolveTheme());
});

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

const DEFAULT_THEME_COLORS = { light: "#ece1cd", dark: "#181817" };

function themeColorsForSurface() {
  return document.body.classList.contains("home-story") ? { light: "#f5f5f1", dark: "#171d1c" } : DEFAULT_THEME_COLORS;
}

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  const previousTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = nextTheme;
  themeToggle?.setAttribute("aria-pressed", String(nextTheme === "dark"));
  if (themeToggle) {
    themeToggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  const themeColors = themeColorsForSurface();
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const darkMedia = meta.media?.includes("dark");
    meta.setAttribute("content", darkMedia ? themeColors.dark : themeColors.light);
  });
  if (previousTheme && previousTheme !== nextTheme) {
    window.dispatchEvent(new CustomEvent("portfolio:theme-change", {
      detail: { theme: nextTheme },
    }));
  }
}

setTheme(resolveTheme());

// Navigate hash-less, then restore the hash after load (avoids Arc's hash-scroll snap)
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
  const y = hashScrollY(target);
  if (behavior === "auto") {
    window.scrollTo(0, y);
    syncHeaderSolid();
    return;
  }
  target.scrollIntoView({ behavior, block: "start" });
}

function focusHashTarget(hash) {
  const target = resolveHashTarget(hash);
  if (!target) return;
  target.focus({ preventScroll: true });
}

function whenLayoutReady(offsetY) {
  const fonts = document.fonts?.ready
    ? Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 500)),
      ])
    : Promise.resolve();

  const imagesAbove = Array.from(document.images).filter((img) => {
    if (!img.getAttribute("src") || img.complete) return false;
    if (img.closest("#project-flip-stage")) return false;
    return img.getBoundingClientRect().top + window.scrollY < offsetY;
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

function restoreHashOnUrl(hash) {
  if (!hash || hash === "#") return;
  const nextHash = hash.charAt(0) === "#" ? hash : `#${hash}`;
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}${nextHash}`);
  } catch (_) { /* Ignore */ }
}

function pinScrollRestoration() {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (_) { /* Ignore */ }
}

function pinTop() {
  window.scrollTo(0, 0);
  syncHeaderSolid();
}

function revealRestoredScroll() {
  window.requestAnimationFrame(() => {
    syncHeaderSolid();
    document.documentElement.classList.remove("hash-pending");
    restoreInFlight = false;
    pinScrollRestoration();
    schedulePageReveals();
  });
}

function finishRestoreTo(y, hash) {
  window.scrollTo(0, y);
  restoreHashOnUrl(hash);
  window.requestAnimationFrame(() => {
    window.scrollTo(0, y);
    persistPageScroll({ force: true });
    revealRestoredScroll();
  });
}

function readStoredScrollRecord() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("portfolio-scroll-y") || "null");
    if (saved && saved.path === location.pathname && typeof saved.y === "number") {
      return saved;
    }
  } catch (_) { /* Ignore */ }
  return null;
}

function readStoredScrollY() {
  return readStoredScrollRecord()?.y ?? 0;
}

function holdPinTop() {
  const pin = () => {
    if (restoreInFlight || document.documentElement.classList.contains("hash-pending")) return;
    if (readStoredScrollRecord() && readStoredScrollY() > RESTORE_MIN) return;
    if (window.scrollY > RESTORE_MIN) return;
    pinTop();
  };
  pin();
  window.requestAnimationFrame(() => {
    pin();
    window.requestAnimationFrame(() => {
      pin();
      schedulePageReveals();
    });
  });
}

function lockHashScrollOnLoad() {
  if (restoreInFlight) return;

  let pendingHash = window.__portfolioHash || "";
  delete window.__portfolioHash;
  let pendingY = Number(window.__portfolioScrollY) || 0;
  delete window.__portfolioScrollY;
  if (!pendingHash) {
    try {
      pendingHash = sessionStorage.getItem("portfolio-scroll") || "";
      sessionStorage.removeItem("portfolio-scroll");
    } catch (_) { /* Ignore */ }
  }

  const hasCover = document.documentElement.classList.contains("hash-pending");
  if (!pendingY && hasCover) pendingY = readStoredScrollY();

  const flipPending = document.documentElement.classList.contains("project-flip-pending");
  const stored = readStoredScrollRecord();
  const storedAtTop = stored !== null && stored.y <= RESTORE_MIN;
  const usableY = pendingY > RESTORE_MIN && !flipPending;
  const usableHash = Boolean(pendingHash && pendingHash !== "#" && (hasCover || !storedAtTop));

  pinScrollRestoration();

  if (usableY) {
    restoreInFlight = true;
    whenLayoutReady(pendingY).then(() => finishRestoreTo(pendingY, pendingHash && pendingHash !== "#" ? pendingHash : ""));
    return;
  }

  if (usableHash) {
    const target = resolveHashTarget(pendingHash);
    if (!target) {
      restoreHashOnUrl(pendingHash);
      document.documentElement.classList.remove("hash-pending");
      holdPinTop();
      return;
    }

    restoreInFlight = true;
    whenLayoutReady(hashScrollY(target)).then(() => finishRestoreTo(hashScrollY(target), pendingHash));
    return;
  }

  document.documentElement.classList.remove("hash-pending");
  if (!stored || stored.y <= RESTORE_MIN) {
    holdPinTop();
  } else {
    schedulePageReveals();
  }
}

lockHashScrollOnLoad();
document.addEventListener("astro:page-load", lockHashScrollOnLoad);
window.addEventListener("pageshow", (event) => {
  pinScrollRestoration();
  if (event.persisted) {
    restoreInFlight = false;
    document.documentElement.classList.remove("hash-pending");
  }
  const stored = readStoredScrollRecord();
  if ((!stored || stored.y <= RESTORE_MIN) && !window.__portfolioHash) {
    holdPinTop();
    return;
  }
  if (event.persisted && window.location.hash) scrollToHash(window.location.hash, "auto");
  schedulePageReveals();
});

// Deterministic image-only FLIP handoff. Source image + framed bounds survive
// navigation through sessionStorage; a document-relative clone and shadow then
// travel into the real hero image/frame. Back navigation remains ordinary.
// The source clone lives in an Astro-persisted stage so it survives the
// client-router body swap; the destination animation starts after that swap.
const initializedProjectCards = new WeakSet();

const setupProjectCards = () => {
  if (prefersReducedMotion()) return;
  document.querySelectorAll("a.project-card[href^='project-']").forEach((card) => {
    if (initializedProjectCards.has(card)) return;
    initializedProjectCards.add(card);
    let prefetched = false;
    let prefetchTimer = 0;
    const prefetch = () => {
      if (prefetched) return;
      prefetched = true;
      const href = new URL(card.href, location.href).pathname;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = href;
      link.as = "document";
      document.head.appendChild(link);
    };
    card.addEventListener("pointerenter", () => {
      prefetchTimer = window.setTimeout(prefetch, 120);
    }, { passive: true });
    card.addEventListener("pointerleave", () => window.clearTimeout(prefetchTimer), { passive: true });
    card.addEventListener("focusin", prefetch, { once: true });
    card.addEventListener("touchstart", prefetch, { once: true, passive: true });

    card.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const picture = card.querySelector("picture[data-project-cover]");
      const image = picture?.querySelector("img");
      if (!picture || !image) return;
      if (!image.complete || !image.naturalWidth) return;
      const imageBox = image.getBoundingClientRect();
      const imageRect = { left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height };
      // Evidence border lives on the featured wrap (impedance) or the card itself.
      // Inflate the image box so the flying shadow starts as a real framed unit.
      const frameSource = card.closest(".project-card-wrap.featured") || card;
      const frameStyle = getComputedStyle(frameSource);
      const borderTop = parseFloat(frameStyle.borderTopWidth) || 0;
      const borderRight = parseFloat(frameStyle.borderRightWidth) || 0;
      const borderBottom = parseFloat(frameStyle.borderBottomWidth) || 0;
      const borderLeft = parseFloat(frameStyle.borderLeftWidth) || 0;
      const frameRect = {
        left: imageRect.left - borderLeft,
        top: imageRect.top - borderTop,
        width: imageRect.width + borderLeft + borderRight,
        height: imageRect.height + borderTop + borderBottom,
      };
      const style = getComputedStyle(image);
      const handoff = {
        path: new URL(card.href, location.href).pathname,
        src: image.currentSrc || image.src,
        alt: image.alt,
        rect: imageRect,
        frameRect,
        objectPosition: style.objectPosition,
        time: Date.now(),
      };
      try {
        sessionStorage.setItem("project-image-handoff", JSON.stringify(handoff));
      } catch (_) { return; }

      const stage = document.getElementById("project-flip-stage") || document.body;
      stage.querySelector(".project-flip-clone")?.remove();
      stage.querySelector(".project-flip-shadow")?.remove();
      const clone = document.createElement("img");
      clone.className = "project-flip-clone";
      clone.src = handoff.src;
      clone.alt = "";
      clone.setAttribute("aria-hidden", "true");
      clone.width = Math.max(1, Math.round(imageRect.width));
      clone.height = Math.max(1, Math.round(imageRect.height));
      clone.style.objectPosition = handoff.objectPosition || "50% 50%";
      clone.style.left = `${window.scrollX + imageRect.left}px`;
      clone.style.top = `${window.scrollY + imageRect.top}px`;
      clone.style.width = `${imageRect.width}px`;
      clone.style.height = `${imageRect.height}px`;
      const shadow = document.createElement("span");
      shadow.className = "project-flip-shadow";
      shadow.setAttribute("aria-hidden", "true");
      shadow.style.left = `${window.scrollX + frameRect.left}px`;
      shadow.style.top = `${window.scrollY + frameRect.top}px`;
      shadow.style.width = `${frameRect.width}px`;
      shadow.style.height = `${frameRect.height}px`;
      stage.append(shadow, clone);
    });
  });
};

const runProjectFlipDestination = () => {
  if (prefersReducedMotion()) return;
  if (document.body.classList.contains("project-page")) {
    const target = document.querySelector(".project-hero-media");
    const targetImage = target?.querySelector("img");
    let handoff = null;
    try {
      handoff = JSON.parse(sessionStorage.getItem("project-image-handoff") || "null");
      sessionStorage.removeItem("project-image-handoff");
    } catch (_) { /* Normal arrival */ }
    const valid = target && targetImage && handoff?.path === location.pathname && Date.now() - handoff.time < 5000;
    if (!valid) {
      document.documentElement.classList.remove("project-flip-pending");
    } else {
    document.documentElement.classList.add("project-flip-pending");
    const imageStart = handoff.rect;
    const frameStart = handoff.frameRect || handoff.rect;
    let clone = document.querySelector(".project-flip-clone");
    let shadow = document.querySelector(".project-flip-shadow");
    if (!clone) {
      clone = document.createElement("img");
      clone.className = "project-flip-clone";
      clone.src = handoff.src;
      clone.alt = "";
      clone.setAttribute("aria-hidden", "true");
      clone.width = Math.max(1, Math.round(imageStart.width));
      clone.height = Math.max(1, Math.round(imageStart.height));
      clone.style.objectPosition = handoff.objectPosition || "50% 50%";
      clone.style.left = `${window.scrollX + imageStart.left}px`;
      clone.style.top = `${window.scrollY + imageStart.top}px`;
      clone.style.width = `${imageStart.width}px`;
      clone.style.height = `${imageStart.height}px`;
      (document.getElementById("project-flip-stage") || document.body).appendChild(clone);
    }
    if (!shadow) {
      shadow = document.createElement("span");
      shadow.className = "project-flip-shadow";
      shadow.setAttribute("aria-hidden", "true");
      shadow.style.left = `${window.scrollX + frameStart.left}px`;
      shadow.style.top = `${window.scrollY + frameStart.top}px`;
      shadow.style.width = `${frameStart.width}px`;
      shadow.style.height = `${frameStart.height}px`;
      clone.parentNode?.insertBefore(shadow, clone);
    }

    // Solve the y for progress x on the flip's cubic-bezier so keyframes can be
    // pre-eased. Both wrapper and counter-scaled image sample the same eased
    // values, keeping them in sync (WAAPI easing can't invert a scale).
    const easeAt = (x) => {
      const [x1, y1, x2, y2] = [.16, 1, .3, 1];
      const bx = (t) => 3 * t * (1 - t) * ((1 - t) * x1 + t * x2) + t * t * t;
      const by = (t) => 3 * t * (1 - t) * ((1 - t) * y1 + t * y2) + t * t * t;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) {
        if (bx(t) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return by(t);
    };

    const parsePosition = (value) => {
      const parts = String(value || "50% 50%").trim().split(/\s+/);
      const toFrac = (part) => {
        if (part === "left" || part === "top") return 0;
        if (part === "right" || part === "bottom") return 1;
        if (part === "center" || part === undefined) return .5;
        const n = parseFloat(part);
        return part.endsWith("%") && Number.isFinite(n) ? n / 100 : .5;
      };
      return [toFrac(parts[0]), toFrac(parts[1])];
    };

    // object-fit: cover geometry for a box: uniform scale + object-position offset.
    const coverFit = (natW, natH, box, position) => {
      const k = Math.max(box.width / natW, box.height / natH);
      const [fx, fy] = parsePosition(position);
      return { k, ox: (box.width - natW * k) * fx, oy: (box.height - natH * k) * fy };
    };

    const reveal = () => {
      const sx = window.scrollX;
      const sy = window.scrollY;
      const imageEnd = targetImage.getBoundingClientRect();
      const frameEnd = target.getBoundingClientRect();
      const startObjectPosition = handoff.objectPosition || "50% 50%";
      const endObjectPosition = getComputedStyle(targetImage).objectPosition;
      document.documentElement.classList.remove("project-flip-pending");
      document.documentElement.classList.add("project-flip-running");
      // The head-script abort net only guards against a flip that never starts;
      // once the animation is running it must not yank the clone mid-flight.
      window.clearTimeout(window.__projectFlipAbort);
      if (typeof clone.animate !== "function") {
        target.classList.add("project-flip-complete");
        clone.remove();
        shadow.remove();
        document.documentElement.classList.remove("project-flip-running");
        window.clearTimeout(window.__projectFlipAbort);
        return;
      }
      // Compositor-only FLIP: a clipping wrapper scales from the card box into the
      // hero box while the inner image counter-scales, so the object-fit crop
      // interpolates without stretching and survives main-thread long tasks.
      const natW = clone.naturalWidth || imageEnd.width;
      const natH = clone.naturalHeight || imageEnd.height;
      const startFit = coverFit(natW, natH, imageStart, startObjectPosition);
      const endFit = coverFit(natW, natH, imageEnd, endObjectPosition);
      const wrap = document.createElement("span");
      wrap.className = "project-flip-wrap";
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.left = `${sx + imageEnd.left}px`;
      wrap.style.top = `${sy + imageEnd.top}px`;
      wrap.style.width = `${imageEnd.width}px`;
      wrap.style.height = `${imageEnd.height}px`;
      clone.style.left = "0";
      clone.style.top = "0";
      clone.style.width = `${natW * endFit.k}px`;
      clone.style.height = `${natH * endFit.k}px`;
      clone.style.objectPosition = "0 0";
      clone.parentNode?.insertBefore(wrap, clone);
      wrap.appendChild(clone);

      const scaleXStart = imageStart.width / imageEnd.width;
      const scaleYStart = imageStart.height / imageEnd.height;
      const frames = 30;
      const wrapFrames = [];
      const imgFrames = [];
      const shadowFrames = [];
      for (let i = 0; i <= frames; i++) {
        const e = easeAt(i / frames);
        const lerp = (a, b) => a + (b - a) * e;
        const gx = lerp(scaleXStart, 1);
        const gy = lerp(scaleYStart, 1);
        wrapFrames.push({
          offset: i / frames,
          transform: `translate(${lerp(imageStart.left - imageEnd.left, 0)}px, ${lerp(imageStart.top - imageEnd.top, 0)}px) scale(${gx}, ${gy})`,
        });
        const k = lerp(startFit.k, endFit.k) / endFit.k;
        imgFrames.push({
          offset: i / frames,
          transform: `translate(${lerp(startFit.ox, endFit.ox) / gx}px, ${lerp(startFit.oy, endFit.oy) / gy}px) scale(${k / gx}, ${k / gy})`,
        });
        shadowFrames.push({
          offset: i / frames,
          transform: `translate(${lerp(frameStart.left - frameEnd.left, 0)}px, ${lerp(frameStart.top - frameEnd.top, 0)}px) scale(${lerp(frameStart.width / frameEnd.width, 1)}, ${lerp(frameStart.height / frameEnd.height, 1)})`,
        });
      }
      shadow.style.left = `${sx + frameEnd.left}px`;
      shadow.style.top = `${sy + frameEnd.top}px`;
      shadow.style.width = `${frameEnd.width}px`;
      shadow.style.height = `${frameEnd.height}px`;
      const timing = { duration: 560, easing: "linear", fill: "forwards" };
      const animation = wrap.animate(wrapFrames, timing);
      const imageAnimation = clone.animate(imgFrames, timing);
      const shadowAnimation = shadow.animate(shadowFrames, timing);
      shadow.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 180, easing: "ease-out", fill: "forwards" }
      );
      let settled = false;
      const cleanup = async () => {
        if (settled) return;
        settled = true;
        await (targetImage.decode?.().catch(() => undefined) || Promise.resolve());
        target.classList.add("project-flip-complete");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        wrap.remove();
        clone.remove();
        shadow.remove();
        document.documentElement.classList.remove("project-flip-running");
        window.clearTimeout(window.__projectFlipAbort);
        window.removeEventListener("resize", finishEarly);
        window.removeEventListener("orientationchange", finishEarly);
      };
      const finishEarly = () => {
        if (settled) return;
        animation.finish();
        imageAnimation.finish();
        shadowAnimation.finish();
      };

      window.addEventListener("resize", finishEarly, { passive: true });
      window.addEventListener("orientationchange", finishEarly, { passive: true });
      animation.finished.finally(cleanup);
    };

    const decodeClone = clone.decode?.().catch(() => undefined) || Promise.resolve();
    decodeClone.then(() => {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
    }
  }
};

setupProjectCards();
runProjectFlipDestination();
document.addEventListener("astro:page-load", setupProjectCards);
document.addEventListener("astro:after-swap", runProjectFlipDestination);

motionQuery.addEventListener?.("change", (event) => {
  if (!event.matches) return;
  try { sessionStorage.removeItem("project-image-handoff"); } catch (_) { /* Ignore */ }
  document.documentElement.classList.remove("project-flip-pending", "project-flip-running");
  document.querySelector(".project-hero-media")?.classList.add("project-flip-complete");
  document.querySelector(".project-flip-clone")?.remove();
  document.querySelector(".project-flip-wrap")?.remove();
  document.querySelector(".project-flip-shadow")?.remove();
  window.clearTimeout(window.__projectFlipAbort);
});

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
      const prev = history.state && typeof history.state === "object" ? history.state : { index: 0 };
      history.pushState({
        ...prev,
        index: (typeof prev.index === "number" ? prev.index : 0) + 1,
        scrollX: 0,
        scrollY: 0,
      }, "", url.hash);
    }
    scrollToHash(url.hash, prefersReducedMotion() ? "auto" : "smooth");
    if (link.classList.contains("skip-link")) focusHashTarget(url.hash);
    setMobileMenuState(false);
    return;
  }

  event.preventDefault();
  try {
    sessionStorage.setItem("portfolio-scroll", url.hash);
    void navigate(`${url.pathname}${url.search}`);
  } catch (_) {
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  }
});

window.addEventListener("hashchange", () => {
  if (!window.location.hash || window.location.hash === "#") return;
  if (document.documentElement.classList.contains("hash-pending")) return;
  scrollToHash(window.location.hash, prefersReducedMotion() ? "auto" : "smooth");
});

let mobileMenuCloseTimer = 0;
function setMobileMenuState(open) {
  if (!navLinks || !navToggle) return;
  if (!open && navLinks.classList.contains("is-closing")) return;
  window.clearTimeout(mobileMenuCloseTimer);
  if (mobileNavQuery.matches && !prefersReducedMotion()) {
    if (open) {
      navLinks.hidden = false;
      navLinks.classList.remove("is-closing");
      requestAnimationFrame(() => navLinks.classList.add("open"));
    } else if (navLinks.classList.contains("open")) {
      navLinks.classList.remove("open");
      navLinks.classList.add("is-closing");
      mobileMenuCloseTimer = window.setTimeout(() => {
        navLinks.hidden = true;
        navLinks.classList.remove("is-closing");
      }, 170);
    } else {
      navLinks.hidden = true;
    }
  } else {
    navLinks.classList.toggle("open", open);
    navLinks.hidden = mobileNavQuery.matches && !open;
  }
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  document.querySelectorAll("body > main, body > footer, body > noscript").forEach((element) => {
    element.inert = mobileNavQuery.matches && open;
  });
  document.querySelectorAll(".brand, .cmdk-chip, [data-theme-toggle]").forEach((element) => {
    element.inert = mobileNavQuery.matches && open;
  });
}

function syncNavigationMode() {
  if (!navLinks || !navToggle) return;
  if (mobileNavQuery.matches) {
    setMobileMenuState(navLinks.classList.contains("open"));
  } else {
    window.clearTimeout(mobileMenuCloseTimer);
    navLinks.hidden = false;
    navLinks.classList.remove("open", "is-closing");
    setMobileMenuState(false);
  }
}

if (mobileNavQuery.addEventListener) {
  mobileNavQuery.addEventListener("change", syncNavigationMode);
} else {
  mobileNavQuery.addListener(syncNavigationMode);
}

const initializedNavToggles = new WeakSet();
const initializedNavLists = new WeakSet();
const initializedThemeToggles = new WeakSet();

let headerSolidRaf = 0;

function syncHeaderSolid() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  header.classList.toggle("is-solid", pageScrollY() > HEADER_SOLID_AT);
}

function onHeaderScroll() {
  if (pageScrollY() <= HEADER_SOLID_AT) persistPageScroll();
  if (headerSolidRaf) return;
  headerSolidRaf = requestAnimationFrame(() => {
    headerSolidRaf = 0;
    syncHeaderSolid();
    persistPageScroll();
  });
}

window.addEventListener("pagehide", () => persistPageScroll({ force: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistPageScroll({ force: true });
});

window.addEventListener("scroll", onHeaderScroll, { passive: true });

function setupPageChrome() {
  navToggle = document.querySelector(".mobile-toggle");
  navLinks = document.querySelector("#nav-links");
  themeToggle = document.querySelector("[data-theme-toggle]");
  syncNavigationMode();
  setTheme(resolveTheme());
  syncHeaderSolid();

  if (navToggle && !initializedNavToggles.has(navToggle)) {
    initializedNavToggles.add(navToggle);
    navToggle.addEventListener("click", () => {
      const open = !navLinks?.classList.contains("open");
      setMobileMenuState(open);
      if (open) navLinks?.querySelector("a[href]")?.focus();
    });
  }

  if (navLinks && !initializedNavLists.has(navLinks)) {
    initializedNavLists.add(navLinks);
    navLinks.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.matches("a")) {
        setMobileMenuState(false);
      }
    });
  }

  if (themeToggle && !initializedThemeToggles.has(themeToggle)) {
    initializedThemeToggles.add(themeToggle);
    themeToggle.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      writeStoredTheme(nextTheme);
      setTheme(nextTheme);
    });
  }
}

setupPageChrome();
document.addEventListener("astro:page-load", setupPageChrome);

document.addEventListener("click", (event) => {
  if (!mobileNavQuery.matches || !navLinks?.classList.contains("open")) return;
  if (!(event.target instanceof Node)) return;
  if (navLinks.contains(event.target) || navToggle?.contains(event.target)) return;
  setMobileMenuState(false);
});

document.addEventListener("keydown", (event) => {
  if (!navLinks?.classList.contains("open")) return;
  if (event.key === "Escape") {
    setMobileMenuState(false);
    navToggle?.focus();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...navLinks.querySelectorAll("a[href]:not([tabindex='-1'])"),
    navToggle,
  ].filter(Boolean);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Follow the OS theme until an explicit choice is made
const darkThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const syncSystemTheme = (event) => {
  if (readStoredTheme() || document.body.classList.contains("home-story")) return;
  setTheme(event.matches ? "dark" : "light");
};
if (darkThemeQuery.addEventListener) {
  darkThemeQuery.addEventListener("change", syncSystemTheme);
} else {
  darkThemeQuery.addListener(syncSystemTheme);
}

console.log(
  "%c[0x0000] Vectors OK\n%c[0x0001] Console attached \u2014 hi, fellow engineer.\nSource: https://github.com/miguel-salv \u00b7 Say hello: msalvacion@cmu.edu",
  "font-family: monospace; font-size: 12px; color: #4d789d; font-weight: bold;",
  "font-family: monospace; font-size: 12px; color: inherit;"
);

// Command palette (Cmd/Ctrl-K): site-wide launcher, loaded on every page
let commandPaletteAbort = null;
function initCommandPalette() {
  commandPaletteAbort?.abort();
  commandPaletteAbort = new AbortController();
  const { signal } = commandPaletteAbort;
  document.querySelectorAll(".cmdk").forEach((overlay) => overlay.remove());
  const navTools = document.querySelector(".nav-tools");
  if (!navTools) return; // Legacy pages without a toolbar opt out

  const isMac = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.userAgent || "");
  const inResume = /\/resume\//.test(location.pathname);
  const homeBase = inResume ? "../" : "/";
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

  const sectionHref = (hash) => (onIndex ? hash : `${homeBase}${hash}`);

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    writeStoredTheme(next);
    setTheme(next);
  }

  function copyEmail() {
    const email = "msalvacion@cmu.edu";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email)
        .then(() => showCopyStatus(`Email copied · ${email}`))
        .catch(() => {
          showCopyStatus("Clipboard unavailable · opening email client");
          go(`mailto:${email}`);
        });
    } else {
      showCopyStatus("Clipboard unavailable · opening email client");
      go(`mailto:${email}`);
    }
  }

  let copyStatus = null;
  let copyStatusTimer = 0;
  function showCopyStatus(message) {
    if (!copyStatus) {
      copyStatus = document.createElement("div");
      copyStatus.className = "copy-status";
      copyStatus.setAttribute("role", "status");
      copyStatus.setAttribute("aria-live", "polite");
      document.body.appendChild(copyStatus);
    }
    window.clearTimeout(copyStatusTimer);
    copyStatus.textContent = message;
    copyStatus.classList.remove("is-visible");
    void copyStatus.offsetWidth;
    copyStatus.classList.add("is-visible");
    copyStatusTimer = window.setTimeout(() => copyStatus?.classList.remove("is-visible"), 2600);
  }

  const projectCommands = (window.__portfolioProjects || []).map((project) => ({
    label: project.title,
    tag: "Project",
    keywords: project.keywords,
    run: () => go(`${homeBase}${project.route.replace(/^\//, "")}`),
  }));

  const commands = [
    { label: "Home", tag: "Section", keywords: "top start hero", run: () => go(onIndex ? "#top" : homeBase) },
    { label: "About", tag: "Section", keywords: "bio background", run: () => go(sectionHref("#about")) },
    { label: "Career", tag: "Section", keywords: "experience work timeline jobs", run: () => go(sectionHref("#career")) },
    { label: "Projects", tag: "Section", keywords: "work portfolio builds", run: () => go(sectionHref("#projects")) },
    { label: "Resume", tag: "Page", keywords: "cv resume pdf resume", run: () => go(`${homeBase}resume/`) },
    ...projectCommands,
    { label: "Toggle theme", tag: "Action", keywords: "dark light mode appearance", run: toggleTheme },
    { label: "Copy email", tag: "Action", keywords: "contact mail address", run: copyEmail },
    { label: "GitHub", tag: "External", keywords: "code source repos", run: () => go("https://github.com/miguel-salv", true) },
    { label: "LinkedIn", tag: "External", keywords: "connect network", run: () => go("https://www.linkedin.com/in/msalvacion/", true) },
  ];

  const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const chip = navTools.querySelector("[data-cmdk-trigger]");
  if (!chip) return;
  const modKey = chip.querySelector("[data-cmdk-mod]");
  if (modKey) modKey.textContent = isMac ? "\u2318" : "Ctrl";

  const overlay = document.createElement("div");
  overlay.className = "cmdk";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="cmdk-scrim" data-cmdk-close></div>' +
    '<div class="cmdk-dialog" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<span class="glass-frost" aria-hidden="true"></span>' +
      `<div class="cmdk-field"><span class="cmdk-field-icon">${SEARCH_ICON}</span>` +
        '<input class="cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-listbox" aria-autocomplete="list" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Jump to a section, project, or action\u2026" />' +
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
    if (!active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < listbox.scrollTop) listbox.scrollTop = top;
    else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight;
  }

  const isOpen = () => !overlay.hidden;
  let focusToken = 0;

  function rememberFocus() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body || overlay.contains(active)) {
      lastFocus = chip;
      return;
    }
    lastFocus = active;
  }

  function focusInput() {
    const token = ++focusToken;
    const tryFocus = () => {
      if (token !== focusToken || !isOpen() || overlay.classList.contains("is-closing")) return;
      if (document.activeElement === input) return;
      input.focus({ preventScroll: true });
    };
    tryFocus();
    queueMicrotask(tryFocus);
    requestAnimationFrame(() => {
      tryFocus();
      requestAnimationFrame(tryFocus);
    });
  }

  function releaseInputFocus() {
    focusToken += 1;
    if (document.activeElement === input) input.blur();
  }

  function pinHeaderForPalette() {
    const header = document.querySelector(".site-header");
    if (!header || document.querySelector(".cmdk-header-spacer")) return;
    const spacer = document.createElement("div");
    spacer.className = "cmdk-header-spacer";
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = `${Math.round(header.getBoundingClientRect().height)}px`;
    header.after(spacer);
  }

  function unpinHeaderForPalette() {
    document.querySelector(".cmdk-header-spacer")?.remove();
  }

  let closeResolve = null;
  let closeTimer = 0;
  let openedAt = 0;

  function cancelClosePalette() {
    if (!overlay.classList.contains("is-closing") && !closeTimer) return false;
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    overlay.classList.remove("is-closing");
    closeResolve?.();
    closeResolve = null;
    return true;
  }

  function lockPageBehindPalette() {
    overlay.inert = false;
    Array.from(document.body.children).forEach((element) => {
      if (element !== overlay) element.inert = true;
    });
  }

  function restoreLastFocus() {
    const target = lastFocus instanceof HTMLElement ? lastFocus : chip;
    lastFocus = null;
    if (!target.isConnected || overlay.contains(target) || target.closest("[inert]")) {
      chip.focus({ preventScroll: true });
      return;
    }
    target.focus({ preventScroll: true });
  }

  function openPalette() {
    if (cancelClosePalette()) {
      openedAt = performance.now();
      chip.setAttribute("aria-expanded", "true");
      overlay.inert = false;
      focusInput();
      return;
    }
    if (isOpen()) return;
    lockScrollY = window.scrollY;
    rememberFocus();
    pinHeaderForPalette();
    document.documentElement.classList.add("cmdk-open");
    setMobileMenuState(false);
    overlay.hidden = false;
    overlay.inert = false;
    chip.setAttribute("aria-expanded", "true");
    input.value = "";
    render(filterCommands(""));
    setActive(0);
    openedAt = performance.now();
    lockPageBehindPalette();
    focusInput();
  }

  function finishClosePalette() {
    closeTimer = 0;
    overlay.classList.add("is-closing");
    releaseInputFocus();
    overlay.hidden = true;
    overlay.classList.remove("is-closing");
    overlay.inert = false;
    Array.from(document.body.children).forEach((element) => {
      if (element !== overlay) element.inert = false;
    });
    document.documentElement.classList.remove("cmdk-open");
    unpinHeaderForPalette();
    if (Math.round(window.scrollY) !== Math.round(lockScrollY)) {
      window.scrollTo(0, lockScrollY);
    }
    chip.setAttribute("aria-expanded", "false");
    restoreLastFocus();
    closeResolve?.();
    closeResolve = null;
  }

  function closePalette() {
    if (!isOpen()) return Promise.resolve();
    if (overlay.classList.contains("is-closing")) {
      return new Promise((resolve) => { closeResolve = resolve; });
    }
    const closed = new Promise((resolve) => { closeResolve = resolve; });
    if (prefersReducedMotion()) {
      finishClosePalette();
      return closed;
    }
    overlay.classList.add("is-closing");
    closeTimer = window.setTimeout(finishClosePalette, 150);
    return closed;
  }

  async function activate(cmd) {
    if (!cmd) return;
    await closePalette();
    cmd.run();
  }

  const stopBackgroundScroll = (event) => {
    if (!isOpen()) return;
    if (event.target instanceof Element && listbox.contains(event.target)) return;
    event.preventDefault();
  };
  const holdLockedScroll = () => {
    if (!isOpen() || performance.now() - openedAt < 200) return;
    if (Math.round(window.scrollY) !== Math.round(lockScrollY)) {
      window.scrollTo(0, lockScrollY);
    }
  };
  document.addEventListener("wheel", stopBackgroundScroll, { passive: false, signal });
  document.addEventListener("touchmove", stopBackgroundScroll, { passive: false, signal });
  window.addEventListener("scroll", holdLockedScroll, { passive: true, signal });
  document.addEventListener("focusin", (event) => {
    if (!isOpen() || overlay.classList.contains("is-closing")) return;
    if (overlay.contains(event.target)) return;
    focusInput();
  }, { signal });

  chip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
  }, { signal });
  chip.addEventListener("click", () => {
    if (isOpen()) closePalette();
    else openPalette();
  }, { signal });
  scrim.addEventListener("click", () => {
    if (performance.now() - openedAt < 320) return;
    closePalette();
  }, { signal });
  dialog.addEventListener("click", (event) => {
    const li = event.target instanceof Element ? event.target.closest(".cmdk-option") : null;
    if (li) activate(current[Number(li.dataset.index)]);
  }, { signal });
  listbox.addEventListener("pointermove", (event) => {
    const li = event.target instanceof Element ? event.target.closest(".cmdk-option") : null;
    if (li) setActive(Number(li.dataset.index));
  }, { signal });
  listbox.addEventListener("pointerdown", (event) => {
    const li = event.target instanceof Element ? event.target.closest(".cmdk-option") : null;
    if (li) setActive(Number(li.dataset.index));
  }, { signal });

  input.addEventListener("input", () => {
    render(filterCommands(input.value));
    setActive(0);
  }, { signal });

  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); setActive(activeIndex + 1); break;
      case "ArrowUp": event.preventDefault(); setActive(activeIndex - 1); break;
      case "Home": event.preventDefault(); setActive(0); break;
      case "End": event.preventDefault(); setActive(current.length - 1); break;
      case "Enter": event.preventDefault(); activate(current[activeIndex]); break;
      case "Tab": event.preventDefault(); break;
      default: break;
    }
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (isOpen()) closePalette();
      else openPalette();
    } else if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      closePalette();
    }
  }, { signal });
  signal.addEventListener("abort", () => window.clearTimeout(closeTimer));
}

document.addEventListener("astro:page-load", initCommandPalette);

function markImageDecoded(img) {
  img.classList.remove("is-decoding");
  img.classList.add("is-decoded");
}

function imageInViewport(img) {
  const rect = img.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function revealDecodedImages() {
  document.querySelectorAll("img").forEach((img) => {
    if (img.closest("#project-flip-stage")) return;
    if (img.classList.contains("is-decoded")) return;
    if ((img.complete && img.naturalWidth) || imageInViewport(img)) {
      markImageDecoded(img);
      return;
    }
    img.classList.add("is-decoding");
    const done = () => markImageDecoded(img);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

revealDecodedImages();
document.addEventListener("astro:page-load", revealDecodedImages);

let revealObserver = null;

function sectionNeedsReveal(el) {
  return el.getBoundingClientRect().top >= window.innerHeight - 48;
}

function armPageReveals() {
  revealObserver?.disconnect();
  revealObserver = null;

  const nodes = document.querySelectorAll("[data-reveal]");
  if (!nodes.length) return;

  if (prefersReducedMotion()) {
    nodes.forEach((el) => {
      el.classList.remove("is-pending");
      el.classList.add("is-in");
    });
    return;
  }

  const pending = [];
  nodes.forEach((el) => {
    if (!sectionNeedsReveal(el)) {
      el.classList.remove("is-pending");
      el.classList.add("is-in");
      return;
    }
    el.classList.remove("is-in");
    el.classList.add("is-pending");
    pending.push(el);
  });

  if (!pending.length) return;

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove("is-pending");
      entry.target.classList.add("is-in");
      revealObserver?.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });

  pending.forEach((el) => revealObserver.observe(el));
}

function schedulePageReveals() {
  if (restoreInFlight || document.documentElement.classList.contains("hash-pending")) return;
  if (document.documentElement.classList.contains("project-flip-pending")) {
    window.setTimeout(schedulePageReveals, 120);
    return;
  }
  window.requestAnimationFrame(armPageReveals);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", schedulePageReveals, { once: true });
} else {
  schedulePageReveals();
}
document.addEventListener("astro:page-load", schedulePageReveals);

/* ── Print: force lazy images to load ── */
window.addEventListener("beforeprint", () => {
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
    img.loading = "eager";
  });
});
