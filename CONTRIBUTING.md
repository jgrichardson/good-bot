# Contributing to good-bot

This is a fun, lightweight tool. Contributions that keep it fun and **dependency-free** are very welcome.

## Ground rules

- **No runtime dependencies.** The whole point is that it runs anywhere Claude Code runs, with zero install. `niceness.js` must stay pure Node standard library.
- **Privacy is non-negotiable.** The default path is 100% local and must never make a network call. Any code that could send text off-machine must go through `sanitize()` and only run under an explicit opt-in flag (like `--ai`).
- Keep the output a single, screenshot-friendly card.

## Layout

- `niceness.js` — CLI, ingestion, scoring, rendering (text + SVG), trends.
- `scales.js` — the ranking ladders (`SCALES`) + per-scale display metadata.
- `demo-data.js` — optional canned content for `--demo` (missing entries fall back gracefully).
- `test/` — `node:test` suite (`npm test`).

## Great first contributions

- **New ranking scales.** Add a ladder to `SCALES` in `scales.js` (nicest → meanest), give it a `SCALE_META` entry (title + bar endpoints), and optionally demo content in `demo-data.js`. Ladders can be any length.
- **New ingestion sources.** Add an adapter to `SOURCES` in `niceness.js` (a `root` dir + an `extract(obj)` that returns the human-typed strings). Cursor, Aider, Windsurf welcome.
- **A Python port** for folks who have Python but not Node, sharing the same ladder and redaction rules.
- **More redaction patterns** in `REDACTIONS` for PII we don't yet catch.

## Releasing

Publishing is automated by `.github/workflows/release.yml`. One-time: add an npm **Automation** token as the repo secret `NPM_TOKEN`. Then:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The workflow runs the tests and `npm publish`. After the first publish, anyone can `npx good-bot`.

## Running locally

```bash
node niceness.js --demo            # preview every rank
node niceness.js                   # grade yourself (local)
node niceness.js --scale spice     # alternate scale
npm test                           # syntax + demo smoke test
```

## Style

Match the existing style: small functions, no frameworks, comments only where the "why" isn't obvious.
