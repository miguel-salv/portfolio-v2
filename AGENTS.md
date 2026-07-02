# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **zero-dependency, no-build static website** — a personal
portfolio (HTML/CSS/vanilla JS). There is no package manager, bundler, backend,
or database, so there are no dependencies to install and no build step.

### Services

Only one thing is needed to develop/test: a static file server rooted at the
repo root so relative paths (`css/`, `js/`, `assets/`) resolve.

- Run: `python3 -m http.server 8000` from the repo root, then open
  `http://localhost:8000/index.html`.
- Entry point: `index.html`. Other pages: `project-*.html`,
  `reference-site.html` (large design reference export), `miguel-portfolio.html`
  (redirects to `index.html`).

### Notes / caveats

- Opening the HTML files via `file://` mostly works, but prefer the static
  server for correct relative-path/behavior fidelity.
- Core interactive behavior lives in `js/portfolio.js`: theme toggle (persisted
  in `localStorage` under `portfolio-theme`), mobile nav toggle, and
  `IntersectionObserver` scroll reveals. Client-side only; no network calls.
- There is **no lint/test/build tooling** in this repo. "Testing" means loading
  the pages in a browser and exercising the theme toggle and navigation.
