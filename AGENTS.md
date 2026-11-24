# Portfolio project guidance

Start with `git status --short --branch`. Preserve existing edits, including untracked assets, and keep changes scoped to the request.

- Read [PRODUCT.md](PRODUCT.md) for the audience, project claims, and product constraints. Read [DESIGN.md](DESIGN.md) for the site's visual and interaction patterns.
- Read [docs/HANDOFF.md](docs/HANDOFF.md) for ongoing work, verified results, and the next step. Update it when work reaches a meaningful checkpoint or another chat needs to pick up unfinished work. Keep durable guidance here.
- Use the [reel handoff](reel/world/HANDOFF.md) for reel-specific work. Keep real bench evidence distinct from simulations and CAD renders. Preserve keyboard access, reduced-motion behavior, and static fallbacks.

## Verification

Use Node 22.22.0 or newer as specified in [package.json](package.json). GitHub Pages CI uses Node 22 and runs the following in order. [Deploy workflow](.github/workflows/deploy-pages.yml)

```sh
npm ci           # Install from the lockfile
npm run check    # Astro type and template checks
npm test         # Node test suite
npm run build    # Generate the static site in dist/
npm run verify   # Check the built HTML and local references
```

Use `npm run dev` for local development or `npm run preview` to review the built site. Run `npm run verify` after a fresh build.
