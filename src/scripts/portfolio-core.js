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

const DEFAULT_THEME_COLORS = { light: "#ece1cd", dark: "#181817" };

function themeColorsForSurface() {
  return DEFAULT_THEME_COLORS;
}

function setTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
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
  if (behavior === "auto") {
    window.scrollTo(0, hashScrollY(target));
    return;
  }
  target.scrollIntoView({ behavior, block: "start" });
}

function focusHashTarget(hash) {
  const target = resolveHashTarget(hash);
  if (!target) return;
  target.focus({ preventScroll: true });
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
  } catch (_) { /* Ignore */ }

  const target = resolveHashTarget(pendingHash);
  if (!target) {
    clearPending();
    try {
      history.replaceState(null, "", pendingHash);
    } catch (_) { /* Ignore */ }
    return;
  }

  whenLayoutReadyForHash(target).then(() => {
    window.scrollTo(0, hashScrollY(target));
    try {
      history.replaceState(null, "", pendingHash);
    } catch (_) { /* Ignore */ }
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

// Deterministic image-only FLIP handoff. The source image bounds survive the
// navigation through sessionStorage, then a document-relative clone travels into the real
// destination image frame. Back navigation remains completely ordinary.
if (!reduceMotion) {
  document.querySelectorAll("a.project-card[href^='project-']").forEach((card) => {
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
      const rect = picture.getBoundingClientRect();
      const style = getComputedStyle(image);
      try {
        sessionStorage.setItem("project-image-handoff", JSON.stringify({
          path: new URL(card.href, location.href).pathname,
          src: image.currentSrc || image.src,
          alt: image.alt,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          objectPosition: style.objectPosition,
          time: Date.now(),
        }));
      } catch (_) { return; }
    });
  });

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
    let clone = document.querySelector(".project-flip-clone");
    if (!clone) {
      clone = document.createElement("img");
      clone.className = "project-flip-clone";
      clone.src = handoff.src;
      clone.alt = "";
      clone.style.objectPosition = handoff.objectPosition || "50% 50%";
      clone.style.left = `${window.scrollX + handoff.rect.left}px`;
      clone.style.top = `${window.scrollY + handoff.rect.top}px`;
      clone.style.width = `${handoff.rect.width}px`;
      clone.style.height = `${handoff.rect.height}px`;
      document.body.appendChild(clone);
    }

    const reveal = () => {
      const end = target.getBoundingClientRect();
      const startLeft = handoff.rect.left;
      const startTop = handoff.rect.top;
      const scaleX = handoff.rect.width / end.width;
      const scaleY = handoff.rect.height / end.height;
      clone.style.left = `${window.scrollX + end.left}px`;
      clone.style.top = `${window.scrollY + end.top}px`;
      clone.style.width = `${end.width}px`;
      clone.style.height = `${end.height}px`;
      clone.style.transform = `translate(${startLeft - end.left}px, ${startTop - end.top}px) scale(${scaleX}, ${scaleY})`;
      document.documentElement.classList.remove("project-flip-pending");
      document.documentElement.classList.add("project-flip-running");
      if (typeof clone.animate !== "function") {
        target.classList.add("project-flip-complete");
        clone.remove();
        document.documentElement.classList.remove("project-flip-running");
        window.clearTimeout(window.__projectFlipAbort);
        return;
      }
      const animation = clone.animate([
        {
          transform: `translate(${startLeft - end.left}px, ${startTop - end.top}px) scale(${scaleX}, ${scaleY})`,
          boxShadow: "0 0 0 rgba(0,0,0,0)"
        },
        {
          transform: "translate(0, 0) scale(1, 1)",
          boxShadow: "12px 12px 0 rgba(120, 112, 96, .42)"
        },
      ], { duration: 560, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "forwards" });
      let settled = false;
      const cleanup = async () => {
        if (settled) return;
        settled = true;
        await (targetImage.decode?.().catch(() => undefined) || Promise.resolve());
        target.classList.add("project-flip-complete");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        clone.remove();
        document.documentElement.classList.remove("project-flip-running");
        window.clearTimeout(window.__projectFlipAbort);
        window.removeEventListener("resize", finishEarly);
        window.removeEventListener("orientationchange", finishEarly);
      };
      const finishEarly = () => {
        if (settled) return;
        animation.finish();
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
}

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
    if (link.classList.contains("skip-link")) focusHashTarget(url.hash);
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

let mobileMenuCloseTimer = 0;
function setMobileMenuState(open) {
  if (!navLinks || !navToggle) return;
  if (!open && navLinks.classList.contains("is-closing")) return;
  window.clearTimeout(mobileMenuCloseTimer);
  if (mobileNavQuery.matches && !reduceMotion) {
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

syncNavigationMode();
if (mobileNavQuery.addEventListener) {
  mobileNavQuery.addEventListener("change", syncNavigationMode);
} else {
  mobileNavQuery.addListener(syncNavigationMode);
}

navToggle?.addEventListener("click", () => {
  const open = !navLinks?.classList.contains("open");
  setMobileMenuState(open);
  if (open) navLinks?.querySelector("a[href]")?.focus();
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

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  writeStoredTheme(nextTheme);
  setTheme(nextTheme);
});

// Follow the OS theme until an explicit choice is made
const darkThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const syncSystemTheme = (event) => {
  if (readStoredTheme()) return;
  setTheme(event.matches ? "dark" : "light");
};
if (darkThemeQuery.addEventListener) {
  darkThemeQuery.addEventListener("change", syncSystemTheme);
} else {
  darkThemeQuery.addListener(syncSystemTheme);
}

function initAddressReadout({
  readoutSelector,
  markerSelector,
  addressSelector,
  labelSelector,
  progressSelector,
  activationRatio,
  defaultAddress,
  defaultLabel,
  resolveMarker,
}) {
  const readout = document.querySelector(readoutSelector);
  if (!readout) return;
  const addressEl = readout.querySelector(addressSelector);
  const labelEl = readout.querySelector(labelSelector);
  const progressEl = readout.querySelector(progressSelector);
  const baseAddress = defaultAddress || addressEl?.textContent || "0x0000";
  const baseLabel = defaultLabel || labelEl?.textContent.trim() || "Top";
  const markers = Array.from(document.querySelectorAll(markerSelector)).map((marker) => resolveMarker(marker));

  let ticking = false;
  const update = () => {
    ticking = false;
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.round(Math.min(1, Math.max(0, window.scrollY / scrollable)) * 100);
    const activationLine = window.innerHeight * activationRatio;
    let current = { address: baseAddress, label: baseLabel };
    for (const marker of markers) {
      if (marker.element.getBoundingClientRect().top <= activationLine) current = marker;
    }
    if (addressEl) addressEl.textContent = current.address;
    if (labelEl) labelEl.textContent = current.label;
    if ((addressEl || labelEl) && current.address !== readout.dataset.activeAddress) {
      readout.dataset.activeAddress = current.address;
      readout.classList.remove("is-changing");
      if (!reduceMotion) {
        void readout.offsetWidth;
        readout.classList.add("is-changing");
      }
    }
    if (progressEl) progressEl.textContent = `${progress}%`;
  };
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
}

window.PortfolioAddressMap = { init: initAddressReadout };

initAddressReadout({
  readoutSelector: "[data-project-address-readout]",
  markerSelector: ".writeup-section[data-address]",
  addressSelector: ".project-map-address",
  labelSelector: ".project-map-label",
  progressSelector: ".project-map-progress",
  activationRatio: 0.32,
  resolveMarker: (section) => ({
    element: section,
    address: section.dataset.address,
    label: section.querySelector("h2")?.textContent.trim() || "Section",
  }),
});

console.log(
  "%c[0x0000] Vectors OK\n%c[0x0001] Console attached \u2014 hi, fellow engineer.\nSource: https://github.com/miguel-salv \u00b7 Say hello: msalvacion@cmu.edu",
  "font-family: monospace; font-size: 12px; color: #4d789d; font-weight: bold;",
  "font-family: monospace; font-size: 12px; color: inherit;"
);

// Command palette (Cmd/Ctrl-K): site-wide launcher, loaded on every page
(function initCommandPalette() {
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
    setMobileMenuState(false);
    lastFocus = document.activeElement;
    overlay.hidden = false;
    Array.from(document.body.children).forEach((element) => {
      if (element !== overlay) element.inert = true;
    });
    lockScrollY = window.scrollY;
    document.documentElement.style.setProperty("--cmdk-lock-y", `-${lockScrollY}px`);
    document.documentElement.classList.add("cmdk-open");
    chip.setAttribute("aria-expanded", "true");
    input.value = "";
    render(filterCommands(""));
    setActive(0);
    requestAnimationFrame(() => input.focus());
  }

  let closeResolve = null;
  function finishClosePalette() {
    overlay.hidden = true;
    overlay.classList.remove("is-closing");
    Array.from(document.body.children).forEach((element) => {
      if (element !== overlay) element.inert = false;
    });
    document.documentElement.classList.remove("cmdk-open");
    document.documentElement.style.removeProperty("--cmdk-lock-y");
    window.scrollTo(0, lockScrollY);
    chip.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    closeResolve?.();
    closeResolve = null;
  }

  function closePalette() {
    if (!isOpen()) return Promise.resolve();
    if (overlay.classList.contains("is-closing")) {
      return new Promise((resolve) => { closeResolve = resolve; });
    }
    const closed = new Promise((resolve) => { closeResolve = resolve; });
    if (reduceMotion) {
      finishClosePalette();
      return closed;
    }
    overlay.classList.add("is-closing");
    window.setTimeout(finishClosePalette, 150);
    return closed;
  }

  async function activate(cmd) {
    if (!cmd) return;
    await closePalette();
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
      case "Tab": event.preventDefault(); break; // Trap focus on the input
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
/* ── Print: force lazy images to load ── */
window.addEventListener("beforeprint", () => {
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
    img.loading = "eager";
  });
});
