# Changelog

All notable changes to `good-bot` land here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] — 2026-06-06

### Changed

- npm package name scoped to `@jgrichardson/good-bot`. npm's anti-typosquatting
  policy blocked the unscoped `good-bot` name (too similar to the existing
  `goodbot-ai`). The CLI binary is still named `good-bot`, so once installed
  the command is unchanged. Install becomes:
  `npx @jgrichardson/good-bot`.

## [0.3.0] — 2026-06-06

The v0.3 release implements the [IMPROVEMENTS.md](IMPROVEMENTS.md) roadmap
end-to-end. Every feature respects the zero-dependency, 100%-local privacy
contract.

### Added

- **Improvements roadmap** — 10-idea plan with viral-leverage sequencing and
  out-of-scope list.
  ([`6ea5af8`](https://github.com/jgrichardson/good-bot/commit/6ea5af8))
- **Social share composers** — `--share twitter|bluesky|linkedin|reddit`
  (+ aliases `x`, `bsky`) builds a pre-filled compose URL with persona,
  scale, hashtag (`#BeNiceToYourAI`), and repo link. `--share-open` launches
  it via `xdg-open` / `open` / `start`.
  ([`dae95d6`](https://github.com/jgrichardson/good-bot/commit/dae95d6))
- **Multi-tool source adapters** — was Claude Code + Codex; now also reads
  **Gemini CLI** (`~/.gemini/sessions`), **Continue.dev**
  (`~/.continue/sessions`), and **Aider** (`.aider.chat.history.md` scanned
  across common project roots).
  ([`c326c87`](https://github.com/jgrichardson/good-bot/commit/c326c87))
- **Personality quiz mode** — `--quiz` (interactive) or `--quiz-answers
  ABCDDAB` (non-interactive). 7 multiple-choice questions; weights average
  to a fractional index → persona. Removes the install barrier for the
  viral meme.
  ([`e8ec052`](https://github.com/jgrichardson/good-bot/commit/e8ec052))
- **Five pop-culture scales** — `--scale office | succession | swfilms |
  marvel | parks`. ([PR #1](https://github.com/jgrichardson/good-bot/pull/1))
- **Streak + glow-up tracker** — `--streak` shows current persona streak,
  all-time best, glow-up delta from first run, distinct personas, and a
  14-run niceness sparkline. Records to `~/.good-bot/history.json` (cap
  365). `--no-history` per-run opt-out; `--forget-history` total wipe.
  ([PR #2](https://github.com/jgrichardson/good-bot/pull/2))
- **Card export + head-to-head comparison** — `--export json` writes
  `good-bot-card.json`; `--compare a.json b.json` prints a side-by-side
  stats grid + 🥇 winner with niceness → pleases+thanks tie-break.
  `--me <name>` labels exports. ([PR #4](https://github.com/jgrichardson/good-bot/pull/4))
- **Webhook posting** — `--post-webhook <https-url>` POSTs the (already
  redacted) card to a Slack-/Discord-compatible incoming webhook. Powered
  by `node:https`. ([PR #5](https://github.com/jgrichardson/good-bot/pull/5))
- **Asciinema cast export** — `--record` writes a self-contained v2 cast
  file (`good-bot-cast.json`) with typewriter-paced playback. Embeds in
  READMEs, plays in the web player, converts to GIF via `agg`.
  ([PR #6](https://github.com/jgrichardson/good-bot/pull/6))
- **Team leaderboard + reusable workflow** — `--leaderboard <dir>` ranks
  every `good-bot-card.json` in a directory (medals on top 3, numbered
  places after). Composes with `--post-webhook` for Slack/Discord.
  `.github/workflow-templates/good-bot-weekly.yml` is a drop-in cron that
  ships the weekly leaderboard for any team repo.
  ([PR #7](https://github.com/jgrichardson/good-bot/pull/7))
- **Verifiable-no-network audit mode** — `--audit` patches every stdlib
  network egress surface (`net`/`tls`/`http`/`https`/`dns`/`dgram`/`fetch`)
  to throw + count attempts, runs the default flow inside the patch, and
  prints `✅ Provably no network call was attempted during this run`.
  ([PR #8](https://github.com/jgrichardson/good-bot/pull/8))

### Changed

- Multi-tool support means `--source` now accepts `claude | codex | gemini
  | continue | aider | all` (was `claude | codex | all`).
- README and `--help` updated with all the new flags.
- `package.json` description and keywords expanded to mention every
  supported AI tool.
- `prepublishOnly` script gates `npm publish` on `npm test && npm run
  smoke`.

### Tests

Tracked test count: **24 → 126** (24 base + 12 share + 16 sources + 13
quiz + 7 scales + 11 streak + 11 compare + 5 webhook + 7 cast + 9
leaderboard + 11 audit).

## [0.2.0] — 2026-06-02

Initial public release. See the [README](README.md) for the v0.2 feature
set: Claude Code + Codex ingestion, eight ranking scales, `--ai` opt-in,
`--timeline`, `--wrapped`, `--svg`, `--badge`, `--import`, redacted exhibits,
the Claude Code plugin (`/goodbot` slash command), and the npm `bin`
entry. ([initial commit](https://github.com/jgrichardson/good-bot/commit/bd2aeda))

[0.3.0]: https://github.com/jgrichardson/good-bot/releases/tag/v0.3.0
[0.2.0]: https://github.com/jgrichardson/good-bot/releases/tag/v0.2.0
