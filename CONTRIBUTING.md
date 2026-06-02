# Contributing to good-bot

This is a fun, lightweight tool. Contributions that keep it fun and **dependency-free** are very welcome.

## Ground rules

- **No runtime dependencies.** The whole point is that it runs anywhere Claude Code runs, with zero install. `niceness.js` must stay pure Node standard library.
- **Privacy is non-negotiable.** The default path is 100% local and must never make a network call. Any code that could send text off-machine must go through `sanitize()` and only run under an explicit opt-in flag (like `--ai`).
- Keep the output a single, screenshot-friendly card.

## Great first contributions

- **New ranking scales.** Add a 22-rank ladder to `SCALES` in `niceness.js` (nicest → meanest) plus demo content in `demo-data.js`. Ideas: weather, coffee, D&D alignment, Star Trek captains.
- **A Python port** (`niceness.py`) for folks who have Python but not Node, sharing the same persona ladder and redaction rules.
- **More redaction patterns** in `REDACTIONS` for PII we don't yet catch.
- **Better tone heuristics** in `scoreMessage` / `scaleIndex`.

## Running locally

```bash
node niceness.js --demo            # preview every rank
node niceness.js                   # grade yourself (local)
node niceness.js --scale spice     # alternate scale
npm test                           # syntax + demo smoke test
```

## Style

Match the existing style: small functions, no frameworks, comments only where the "why" isn't obvious.
