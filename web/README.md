# good-bot web

The browser-hosted quiz + import flow. Runs on any device including iOS Safari and Android Chrome. 100% client-side.

## What's here

- `src/index.html` — single-page entry
- `src/main.js` — UI state machine + interactions
- `src/engine.js` — surgical re-exports of the scales + quiz scoring from the root project
- `src/import.js` — Claude / ChatGPT export parser (browser-safe)
- `src/poster.js` — 1080×1920 share poster rendered via Canvas
- `src/style.css` — small no-framework stylesheet
- `public/` — static assets (favicon, future OG image)
- `build.mjs` — esbuild bundler

## Dev

```bash
cd web
npm install
npm run dev           # http://localhost:5173/
```

## Build

```bash
cd web
npm install
npm run build         # → web/dist/
```

`dist/` is the static site you deploy.

## Deploy targets

Any static host. Recommended: **Cloudflare Pages** (free, fast, custom domain support, auto-deploys on push to `main`).

To set up Cloudflare Pages from this repo:
1. Create a Cloudflare account (free)
2. Pages → Create application → Connect to Git → pick `jgrichardson/good-bot`
3. Build settings:
   - Framework preset: **None**
   - Build command: `cd web && npm install && npm run build`
   - Build output directory: `web/dist`
4. (Optional) Add a custom domain — e.g. `goodbot.dev` pointed at Cloudflare DNS.

Alternative: **GitHub Pages**. Build locally, push `web/dist/` to the `gh-pages` branch.

## Privacy

Same invariant as the CLI: zero network requests from the page itself. The only outbound traffic happens when the user explicitly clicks a "Share to <platform>" button, which opens the platform's compose page in a new tab. Drag-and-dropped export files are parsed in-memory and never uploaded.
