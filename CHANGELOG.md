# Changelog

All notable changes to `good-bot` land here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — v0.3 push (in progress)

The v0.3 burst implements the [IMPROVEMENTS.md](IMPROVEMENTS.md) roadmap.
Each feature targets virality (more reasons to screenshot + share) and reach
(more AI tools supported) without touching the zero-dependency, 100%-local
privacy contract.

- **Improvements roadmap** — 10-idea plan with viral-leverage sequencing and
  out-of-scope list.
  ([`6ea5af8`](https://github.com/jgrichardson/good-bot/commit/6ea5af8))
- **Social share composers** — `--share twitter|bluesky|linkedin|reddit`
  (+ aliases `x`, `bsky`) builds a pre-filled compose URL with persona,
  scale, hashtag (`#BeNiceToYourAI`), and repo link. `--share-open` launches
  the URL via `xdg-open` / `open` / `start`.
  ([`dae95d6`](https://github.com/jgrichardson/good-bot/commit/dae95d6))
- **Multi-tool source adapters** — was Claude Code + Codex; now also reads
  **Gemini CLI** (`~/.gemini/sessions`), **Continue.dev**
  (`~/.continue/sessions`), and **Aider** (`.aider.chat.history.md` across
  common project roots: `~`, `~/Projects`, `~/code`, `~/src`, `~/dev`,
  `~/work`, `~/workspace`). Cursor / Windsurf use SQLite-stored chat —
  documented in the no-sources error as "export + `--import` (JSON)" (same
  pattern as Claude Desktop).
  ([`c326c87`](https://github.com/jgrichardson/good-bot/commit/c326c87))
- **Personality quiz mode** — `--quiz` (interactive) or `--quiz-answers
  ABCDDAB` (non-interactive). 7 multiple-choice questions; weights
  averaged → fractional index in the active scale → persona. Removes the
  install barrier for the viral meme — anyone can play, render their card,
  and tweet it, even with no Claude Code history. Composes with `--scale`,
  `--share`, `--badge`, `--no-copy`.
  ([`e8ec052`](https://github.com/jgrichardson/good-bot/commit/e8ec052))
- **Five pop-culture scales** — `--scale office | succession | swfilms |
  marvel | parks`. From Pam Beesly to Robert California, Cousin Greg to
  Logan Roy, Yoda to Emperor Palpatine, Captain America to Thanos, Ann
  Perkins to Tammy II. Each ladder ships 8–10 personas with face/tag/blurb
  and a paired `SCALE_META`. ([PR #1](https://github.com/jgrichardson/good-bot/pull/1))
- **Streak + glow-up tracker** — `--streak` shows current persona streak,
  all-time best, glow-up delta from first run, distinct-personas count, and
  a 14-run niceness sparkline. Recorded automatically on transcript + quiz
  flows at `~/.good-bot/history.json` (cap 365 entries, ~30KB worst case).
  `--no-history` is the per-run opt-out; `--forget-history` is the total
  wipe. ([PR #2](https://github.com/jgrichardson/good-bot/pull/2))

### Tests

Tracked test count: **24 → 83** (24 base + 12 share + 16 sources + 13 quiz +
7 scales + 11 streak).

## [0.2.0] — 2026-06-02

Initial public release. See the [README](README.md) for the v0.2 feature
set: Claude Code + Codex ingestion, eight ranking scales, `--ai` opt-in,
`--timeline`, `--wrapped`, `--svg`, `--badge`, `--import`, redacted exhibits,
the Claude Code plugin (`/goodbot` slash command), and the npm `bin`
entry. ([initial commit](https://github.com/jgrichardson/good-bot/commit/bd2aeda))

[Unreleased]: https://github.com/jgrichardson/good-bot/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jgrichardson/good-bot/releases/tag/v0.2.0
