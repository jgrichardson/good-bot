# Changelog

All notable changes to `good-bot` land here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] — 2026-06-12

### Added

- **The privacy promise is now mechanically verifiable** — three layers,
  all in the repo:
  - **`test/no-network.test.js` — a CI-enforced no-network guard** that
    statically scans every shipped `.js` file (package.json `files` + `bin`)
    for network-capable code: `require` / dynamic `import` of
    `http`/`https`/`http2`/`net`/`tls`/`dgram`/`dns` in both spellings
    (`require('https')` and `require("node:https")`, `/promises` variants
    included), `curl`/`wget` shelled out through `child_process`, and global
    `fetch()` calls. The only exceptions are enumerated IN the test file with
    a written reason each — the lazy `node:https` inside the `--webhook`
    handler, and the `--audit` patcher whose requires exist solely to
    monkey-patch the modules shut (`--ai` needs no entry: it spawns the local
    `claude` binary and never touches node's network stack). Any new network
    code fails CI loudly until it is consciously allowlisted in review; a
    violation fixture proves the scanner actually catches top-level requires,
    lazy requires in the wrong function, curl, dynamic import, and fetch.
  - **`--verify-privacy` — the self-audit flag** (alias of the extended
    `--audit`): prints a friendly manifest card BEFORE the run — every
    path/glob the tool would read and which exist on your machine, every
    byte it sends over the network ("0 — always, unless YOU pass --webhook
    or --ai"), the redaction rules applied to quotes, and how to verify it
    all yourself (the grep one-liner + pointers to test/no-network.test.js
    and PRIVACY.md) — then runs the normal scan with every stdlib network
    surface patched to throw and prints the existing attestation.
  - PRIVACY.md gained a "Mechanical guarantees" section tying the prose
    promise to the code that enforces it, and README a "🔒 Trust, verified"
    subsection with the grep one-liner.
- **`--scale-pack <file.json>` — persona packs** — load a whole custom
  persona ladder from one JSON file, no source changes: a `name` slug,
  optional `title` + `ends` card chrome, and a `ladder` of personas ordered
  nicest → meanest (`name`, `emoji`, `face`, `tag`, `blurb` — thresholds are
  implicit by fraction, exactly like the built-in scales, so a pack can be
  3–40 rungs). Missing fields get sensible defaults (the top of the ladder
  smiles, the bottom scowls) and a malformed pack errors kindly, listing
  every problem by field name instead of a stack trace. A loaded pack
  composes with everything (`--demo`, `--json`, `--share`, `--roast`,
  `--wrapped`) and `--random` never clobbers it. Two free, trademark-safe
  packs ship in the new `packs/` dir — **office-archetypes** (🧁 The Snack
  Fairy → 📣 The Reply-All Warlord) and **cosmic-entities** (☀️ The
  Benevolent Sun → ♾️ Heat Death of the Universe) — with the format
  documented in `packs/README.md`; bonus packs will ship first via the
  newsletter (see GROWTH.md).
- **A one-time ⭐ nudge (+ `--no-nudge`)** — after your 3rd lifetime real
  run, good-bot prints ONE line, once, ever: an ask to star the repo + a
  newsletter teaser. The run counter and shown flag persist in
  `~/.good-bot/state.json` (aggregate numbers only, like every other state
  file — disclosed in PRIVACY.md). Suppressed by `--no-nudge`, `--json`,
  `--mcp`, `--statusline`, `--webhook`, and any non-TTY stdout so it can
  never contaminate piped or machine output; a suppressed third run defers
  the nudge to the next eligible run instead of silently burning it.
- **`GROWTH.md` — the open growth & sustainability strategy** — the
  whole plan, in public, in the project's voice: the Wordle→NYT thesis
  (tiny free ritual + universal share artifact + brand = acquirable
  cultural property, with `--grid` / `--wrapped` / `--statusline` /
  `#BeNiceToYourAI` as the analogs), the dev→consumer→ritual funnel,
  value-for-value audience rules (core features never gated, no
  telemetry, no dark patterns), the designed-but-NOT-built opt-in
  global leaderboard sketch, worker-first B2B (candidate-owned AI
  Collaboration Reports, k-anonymous n≥5 team wellness aggregates),
  an explicit will-never-build red-lines section (no employer-side
  screening, no manager dashboards of individuals, no involuntary
  monitoring, no telemetry-by-default, no data sales — there is no
  data), a one-line-per-channel distribution roadmap, and the metrics
  we actually watch (including owning that npx runs are unmeasurable
  by design). README links to it from the Contributing section.
- **`--grid` — the Wordle-style share grid** — a compact, spoiler-free,
  paste-anywhere plain-text block: a `good-bot week 2026-W24 · 🧥 Mr.
  Rogers` header, one emoji per day for the last 7 calendar days ending
  at your most recent active day (🟩 warm / 🟨 mixed / 🟥 harsh / ⬜ no
  data, classified from each day's warm-vs-harsh message share), and a
  one-stat brag line ("0 f-bombs in 1.8k messages 🧯"). Plain text only
  — never ANSI codes, never quotes, never spoiled scores — and copied
  to your clipboard by default like the main card. `--grid --demo`
  previews it on the same deterministic synthetic history `--lab --demo`
  uses.
- **`--team a.json b.json …` — the office leaderboard card** — hand it
  2+ teammate card files (shell globs like `team-cards/*.json` expand
  fine) and get a ranked office card built on the same
  `normalizeCardRecord` wire formats `--compare` reads: persona, score,
  pleases, and f-bombs per human, a 👑 crown on the kindest, a 🥄
  wooden spoon for the harshest, and a team aggregate persona computed
  from the average niceness. Ties break on pleases+thank-yous, kind
  errors match `--compare` (missing/invalid/foreign files name the
  problem and exit), and `--webhook` rides along to post the card to
  the team channel.
- **Bare `--share` — prefilled share-intent links** — `--share` with no
  platform prints ready-to-click X/Twitter and LinkedIn share URLs
  carrying your grid block + `#BeNiceToYourAI` + the repo link,
  properly URL-encoded. Building the URLs makes zero network calls;
  nothing is posted until you click — or pass the new `--open` flag
  (which `--share <platform>` also honors, alongside the older
  `--share-open` spelling). Composes with `--grid` and works with
  `--demo`.
- **`--webhook <url>` — the one deliberate network write, leveled up** —
  the canonical spelling of `--post-webhook` (which stays as an alias).
  POSTs the redacted, ANSI-stripped card as Slack-compatible
  `{"text": …}` JSON — or `{"content": …}` automatically when the host
  is `discord.com` / `discordapp.com` — to an incoming-webhook URL you
  must supply explicitly every run (no stored default, ever). A clear
  one-line notice ("Sending your card (text only, no transcripts) to
  <host> — your own webhook") prints before sending, the timeout
  tightened from 8s to 5s, connection errors come back human-readable
  (including Node's empty-message `AggregateError` case), and
  `node:https` stays lazy-required inside this single handler so no
  other code path can reach the network stack. The payload builder is
  pure and the transport injectable, so the tests verify the exact
  request shape without a socket. PRIVACY.md gained a "Network features
  (opt-in only)" section documenting the payload byte-for-byte and
  noting the future opt-in leaderboard as not-yet-built.

- **`--mcp` — good-bot as an MCP server** — run the CLI as a Model
  Context Protocol stdio server so Claude Desktop / Claude Code can call
  it as a tool mid-conversation ("how nice have I been to you lately?").
  The protocol is implemented by hand in the new zero-dependency `mcp.js`
  (newline-delimited JSON-RPC 2.0 over stdio): `initialize` echoes the
  client's protocolVersion (falling back to `2024-11-05`), advertises
  `capabilities: {tools:{}}` + serverInfo, `notifications/*` are ignored,
  `tools/list` / `tools/call` / `ping` are served, and unknown methods,
  unknown tools, and unparseable frames answer with proper JSON-RPC
  errors instead of crashing the session (a throwing tool comes back as
  an in-band `isError: true` result). Three tools, all read-only, all
  100% local: `niceness_report` (the plain-text card, ANSI stripped),
  `niceness_stats` (the `--json` object as JSON text — never any
  quotes), and `niceness_roast` (the local roast). stdout carries
  protocol frames ONLY (diagnostics go to stderr), the transcript scan
  is shared across calls with a 5-minute cache, and `--mcp --demo`
  serves the canned demo stats — which is also how the protocol tests
  drive a real spawned server. README has the `claude mcp add` one-liner
  and the `claude_desktop_config.json` snippet.
- **`--statusline` — niceness in your prompt** — prints exactly ONE
  plain line built for statusline embedding ("🧥 Mr. Rogers · 92/100 ·
  🟩🟩🟨", with a 3-segment 🟩🟨🟥 meter of your score) and nothing
  else: no clipboard, no card file, no history entry. Built to be FAST:
  the computed result is cached in `~/.good-bot/statusline.json` with a
  6-hour TTL, and a cache hit prints without reading a single transcript
  (<150ms including node startup); stale/missing/mismatched (the cache
  is keyed by scale + source) recomputes once and re-caches. Add
  `--no-color` for prompt-unsafe contexts; missing transcripts degrade
  to a friendly one-liner with exit 0 (a broken prompt segment is worse
  than a missing score); `--statusline --demo` previews the line on
  canned stats without touching the cache. README shows the Claude Code
  `settings.json` statusLine config plus tmux/starship notes.
- **`--vs` — Cross-domain manners** — are you only nice to things that
  talk back? A new comparison card grades the same you across domains:
  your AI transcripts vs your **git commit messages** vs — strictly
  opt-in via `--shell` — your **shell history**. Git commits are read
  by running `git log` locally in the current repo plus any
  `--git-dirs <comma,paths>` repos, keeping only commits authored by
  you (matched via `git config user.email` / `user.name`) and scoring
  them through the exact same sentiment machinery as your transcripts.
  Shell history reads `~/.zsh_history` (extended-history `: ts:0;`
  prefixes stripped) + `~/.bash_history` and reduces them to expletive
  and ALL-CAPS **counts** — commands are never stored, quoted, or
  transmitted. The card shows a per-domain table (messages,
  niceties/100, f-bombs/100, ALL-CAPS/100 — only domains with data
  appear) and a verdict line ("You're 2.3× nicer to your AI than to
  your git history."). The same section is appended to `--lab` when a
  second domain has data, and `--vs --demo` previews the card on
  synthetic counts. PRIVACY.md documents the exact paths read and the
  counts-only guarantee.
- **ChatGPT export import** — `--import` now autodetects OpenAI's
  ChatGPT "Export data" format (`conversations.json` whose
  conversations carry a `mapping` graph of nodes) alongside the
  existing Claude.ai shape, keeping only `author.role === 'user'`
  messages and only the string entries of their `parts` arrays.
  Parsing is defensive: assistant/system/tool turns, hidden context
  messages, image parts, and unknown node shapes are skipped silently —
  a weird export can never crash a run. Epoch-second timestamps are
  normalized to ISO. README has the walkthrough (ChatGPT → Settings →
  Data controls → Export data).

- **`--lab` — The Lab, a research report on your manners** — the flagship
  analytics mode: a long-form, multi-section scientific report card
  computed by the new pure `analytics.js` engine on top of `stats.js`,
  100% locally. Sections: 📈 trend & changepoints (Mann-Kendall trend
  test + binary-segmentation changepoints — "your tone shifted around
  Feb 9"), 🔮 forecast (OLS extrapolation 60 days out, mapped onto the
  persona ladder with a 95% CI on the slope; it *refuses* to forecast
  when r² is noise or the history has under 14 active days), 🔁 mood
  dynamics (first-order Markov chain over per-message warm/neutral/harsh
  states: full transition matrix, grudge coefficient P(harsh→harsh) with
  a Wilson interval, median recovery time back to civil, and an
  opening-vs-closing-warmth verdict), 🌀 frustration spirals (bursts of
  ≥3 rapid-fire (<2 min) short negative messages: episode count, worst
  date, month-by-month trend), 🦉 chronotype (circular statistics +
  Rayleigh test; "meaner after midnight" is only claimed when the Wilson
  intervals separate), 🏗️ project league (top-5 table with politeness
  ratio + harsh rate, ≥30 messages to qualify, directory basenames only
  so paths stay private), and a 🧪 methods footnote naming every test.
  Honesty rules are baked in: every claim carries a CI or a p-value, and
  thin sections say "not enough data — need N more active days" instead
  of fabricating. `--lab --demo` previews the report on a deterministic
  synthetic history with a real changepoint, a real warming trend, and
  front-loaded late-night spirals.
- **`stats.js` statistical core** — a pure, zero-dependency statistics
  module (peer of `scales.js` / `achievements.js`) laying the mathematical
  foundation for the upcoming `--lab` analytics mode. Ships six documented,
  referenced, deterministic functions — `wilsonInterval` (Wilson 1927 score
  interval for proportions), `mannKendall` (tie-corrected trend test with
  normal-approximation p-values), `changepoints` (binary segmentation on
  mean-shift cost with a BIC-style default penalty), `circularStats`
  (24h-clock mean direction + Rayleigh uniformity test, Wilkie 1983),
  `spearman` (rank correlation with mid-rank tie handling and
  t-approximation p-values), and `linreg` (OLS with a 95% CI on the slope) —
  plus `mean`/`variance`/`median`/`ranks` helpers and self-implemented
  erf / normal CDF / Student-t special functions. Every function is NaN-free
  on degenerate input (empty, length-1, constant series) and verified
  against textbook / scipy-known values in `test/stats.test.js`. `--lab`
  (above) is its CLI surface.
- **`--roast`** — a 100% local comedy roast of your AI manners. No
  network, no AI calls: a roast-line library keyed to your real stat
  buckets (f-bomb tiers, please/thanks droughts, ALL-CAPS, demand
  pressure, late-night tone, walls of text, niceness trajectory)
  assembles 4–6 lines — an opener, 2–4 stat-grounded jabs citing your
  actual numbers ("41 f-bombs. The bot has a lawyer now."), and a
  backhanded-compliment closer. Deterministic by default (seeded from
  the stats, so the same history always roasts the same way);
  `--random` reshuffles the jokes. Genuinely saintly histories flip
  the roast and get grilled for being TOO nice ("You thanked it for an
  error message. Twice, probably."). `--roast --demo` previews both a
  spicy roast and the saint flip on canned stats. Privacy: the roast
  card shows aggregate numbers only — no quoted transcript text at
  all, nothing sent anywhere.
- **Machine-readable output** — `--json` prints a single self-describing
  JSON object to stdout (no card, no color codes, no clipboard, no files
  written, no history entry): package version, `generated_with`, persona
  (id + name + emoji), score + scale position, aggregate totals (messages,
  pleases, thank-yous, f-bombs, ALL-CAPS, apologies), unlocked
  achievements, sources, and date range. Privacy: exhibit quotes are
  **excluded by default**; `--include-quotes` opts in, and even then the
  quotes pass through the same `sanitize()` redaction as the card.
- **Head-to-head, leveled up** — `--compare` now accepts a single file
  (`good-bot --compare theirs.json` pits the teammate's card against your
  freshly computed local result), reads both the new `--json` format and
  legacy `--export json` cards (so does `--leaderboard`), marks a ✓ winner
  on every stat row (fewest wins the f-bomb and ALL-CAPS rows), adds
  politeness-ratio and achievements-count rows, warns on a version
  mismatch instead of refusing, errors kindly on missing / invalid /
  foreign files (checks `generated_with`), and closes with a verdict +
  deterministic quip crowning the officially nicer human.

- **Achievements system** — `--achievements` opens a gallery of 24
  unlockable badges (new `achievements.js` module) computed 100% locally
  from stats the engine already produces: 💯 Centurion of Courtesy,
  🧯 Asbestos Keyboard, 🦉 3am Confessions, 📈 Redemption Arc, and more,
  tiered 🥉 common → 🥈 rare → 🌟 legendary (legendary stays `🔒 ???`
  until earned — no spoilers). The report card shows your three rarest
  unlocked badges with a `+N more` teaser, and `--achievements --demo`
  previews the gallery on canned demo stats.

- **Hosted web app** — browser-based quiz + drag-drop import + share +
  1080×1920 poster at **https://jgrichardson.github.io/good-bot/**. Works on
  iPhone / Android / desktop with no Node.js or terminal required. 100%
  client-side (44KB vanilla-JS bundle); `web/src/engine.js` re-exports the
  scales + scoring from the root project so a new scale reaches both
  surfaces. Parses both the Claude.ai and ChatGPT export shapes. Auto-deploys
  to GitHub Pages via `.github/workflows/web-deploy.yml`.
  ([PR #12](https://github.com/jgrichardson/good-bot/pull/12))
- **Global niceness barometer (opt-in only)** — speedtest-style "you beat
  73% of takers" percentile on the web app's result screen. Off by default;
  fires only on an explicit tap, sends only `{ niceness, scale, source }`,
  honors `DNT` / `Sec-GPC`. Backed by a Cloudflare Worker + Workers KV
  histogram (`worker/`), CORS-locked to the GH Pages origin, with an
  auto-bootstrapping deploy workflow. PRIVACY.md rewritten to disclose it
  fully. ([PR #13](https://github.com/jgrichardson/good-bot/pull/13))
- **Community health files** — `CODE_OF_CONDUCT.md` (Contributor Covenant
  v2.1), `SECURITY.md` (private reporting via GitHub Security Advisories),
  GitHub issue forms + PR template, a refreshed `CONTRIBUTING.md`, and this
  changelog backfilled to v0.1.0.

### Changed

- **Aider + Gemini CLI readers rebuilt (experimental)** — the Gemini CLI
  adapter now parses the prompt logs current builds actually write
  (`~/.gemini/tmp/<hash>/logs.json`, JSON rows of
  `{ type: 'user', message, timestamp }`) alongside the legacy
  `~/.gemini/sessions` JSONL; unknown row shapes are skipped silently so
  a weird log can never crash a run. The Aider adapter now also checks
  `~/.aider.chat.history.md` and the current directory (not just one
  level under common project roots), and the markdown parser keeps ONLY
  the human's `#### ` heading lines — consecutive `#### ` lines join
  into one multi-line prompt, while aider's own replies and fenced code
  blocks are skipped, so the model's output can no longer leak into your
  score. Both readers are best-effort and marked experimental in
  `--help` and the README; missing files contribute zero messages, same
  as an absent Codex dir.
- **ALL-CAPS shouting is now a real signal** — `shoutyWordCount()` counts
  standalone ALL-CAPS words (50+ tech acronyms like JSON/API/SQL excluded),
  whole-message shouts score +3 mean (was +1), per-word +1 capped at +5,
  and the card's stats line surfaces the total (`· 12 ALL-CAPS`). The web
  import path shares the same logic.
  ([PR #15](https://github.com/jgrichardson/good-bot/pull/15))
- README rewritten web-first: quick-start tiers, a "For non-developers"
  walkthrough, and a supported-tools matrix.

### Fixed

- Web app works under the GH Pages `/good-bot/` subpath (relative asset
  paths). ([PR #14](https://github.com/jgrichardson/good-bot/pull/14))
- Web footer repo link no longer bounces through a 301 redirect.

## [0.3.2] — 2026-06-06

### Added

- **Threads** added to social share composers: `--share threads`. Uses
  `threads.net/intent/post`.
- **Instagram + TikTok story helpers**: `--instagram` and `--tiktok`. Both
  platforms are app-walled (no public compose URL), so these flags render the
  `--wrapped` 1080×1920 PNG, copy a ready-to-paste caption with
  `#BeNiceToYourAI` to the clipboard, and print step-by-step instructions
  for opening the app and posting.
- **README "For non-developers"** section with a dead-simple walkthrough for
  Claude Desktop / claude.ai web users (export → import → share) and a clear
  note that Node.js can't run inside Claude's mobile app, so the practical
  path for mobile users is a laptop or desktop.

### Changed

- npm package name scoped to `@jgrciv/good-bot` (npm anti-typosquatting
  blocked unscoped `good-bot`). CLI binary is still named `good-bot`. Install:
  `npx @jgrciv/good-bot`.

## [0.3.1] — superseded

Unpublished placeholder — the scope was set to `@jgrichardson` (GitHub handle)
rather than the actual npm handle `@jgrciv`. 0.3.2 is the first version that
reached the registry.

## [0.3.0] — 2026-06-06

The v0.3 release implements the [IMPROVEMENTS.md](IMPROVEMENTS.md) roadmap
end-to-end. Every feature respects the zero-dependency, 100%-local privacy
contract. It also rolls up everything that landed on `main` after the
v0.2.0 commit — `--wrapped`, `--random`, all-time history, the
baseline-relative timeline, and the negation-aware scorer (bullets below).

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
- **`--wrapped`** — a "Your AI Relationship, Wrapped" 1080×1920 share
  poster: vector robot hero, persona + niceness bar, stat grid,
  tone-over-time chart, highlights, and your nicest + spiciest redacted
  moments. All glyphs are vector so the PNG rasterizes cleanly everywhere.
  ([`bd2aeda`](https://github.com/jgrichardson/good-bot/commit/bd2aeda))
- **`--random`** — roll a random scale *and* rank for a different card each
  run. ([`8d070d3`](https://github.com/jgrichardson/good-bot/commit/8d070d3))
- **All-time Claude history** — reads `~/.claude/history.jsonl` (the prompt
  log, not pruned by transcript retention) for full coverage with
  timestamps, falling back to the projects dir when absent.
  ([`8d070d3`](https://github.com/jgrichardson/good-bot/commit/8d070d3))
- **Baseline-relative, multi-dimensional `--timeline`** — periods scored
  against *your own* baseline (σ moves, EMA smoothing), tone axes (warmth,
  frustration, terseness, enthusiasm, pressure), plus time-of-day,
  day-of-week, per-project, and within-session-patience dimensions with
  volatility and warmest/coolest superlatives.
  ([`3f2b73b`](https://github.com/jgrichardson/good-bot/commit/3f2b73b))

### Changed

- Multi-tool support means `--source` now accepts `claude | codex | gemini
  | continue | aider | all` (was `claude | codex | all`).
- README and `--help` updated with all the new flags.
- `package.json` description and keywords expanded to mention every
  supported AI tool.
- `prepublishOnly` script gates `npm publish` on `npm test && npm run
  smoke`.
- **Smarter sentiment** — `scoreMessage` is negation-aware ("no thanks"
  no longer reads as gratitude), and `analyze()` scores niceness from the
  net *share* of warm vs. harsh messages so one gushing or one cruel
  message can't dominate the whole history.
  ([`67b5a4a`](https://github.com/jgrichardson/good-bot/commit/67b5a4a))
- **Timeline redesign** — labeled, tier-colored bar charts with
  eighth-block precision instead of cramped sparklines; hours bucketed
  into night/morning/afternoon/evening so low-sample hours can't mislead.
  ([`e209e54`](https://github.com/jgrichardson/good-bot/commit/e209e54))
- **Characterful persona pick** — within your niceness band, the dominant
  style nudges the persona (terse → Ron Swanson, apologetic → The
  Canadian, CAPS → Drill Sergeant) so results have personality instead of
  clumping on neutral.
  ([`8d070d3`](https://github.com/jgrichardson/good-bot/commit/8d070d3))

### Tests

Tracked test count: **24 → 126** (24 base + 12 share + 16 sources + 13
quiz + 7 scales + 11 streak + 11 compare + 5 webhook + 7 cast + 9
leaderboard + 11 audit).

## [0.2.0] — 2026-06-02

The first share-everywhere release. Never tagged on its own (npm publishing
arrived with 0.3.x) — this was the
[`d52bc50`](https://github.com/jgrichardson/good-bot/commit/d52bc50) era of
`npx github:jgrichardson/good-bot`.

### Added

- **Codex CLI ingestion** alongside Claude Code (both auto-detected), a
  `--source` picker, and `--import` for Claude Desktop / claude.ai web /
  Cowork "Export data" files (`conversations.json`).
- **Six new scales** — weather, coffee, D&D alignment, Star Trek, dog
  breeds, and Hogwarts — joining people + spice; all ladders moved into
  `scales.js`.
- **`--timeline`** — niceness sparkline by month and by hour of day, with
  nicest/meanest callouts.
- **`--svg` / `--image`** — polished shareable card (SVG, plus PNG when a
  rasterizer like `rsvg-convert` is available), and **`--badge`** — a
  Shields-style profile badge.
- npm-publish plumbing (`publishConfig`, `files`) and the tag-triggered
  release workflow.

### Tests

Tracked test count: **14 → 19** (Codex extraction, export import,
sparkline, all scales).

## [0.1.0] — 2026-06-02

The original release
([`01d444a`](https://github.com/jgrichardson/good-bot/commit/01d444a)).
GitHub-only — never tagged or published to npm.

### Added

- The core idea: read your local Claude Code transcripts, keep **only the
  messages you typed**, and grade your tone on a 22-rank persona ladder
  (Mr. Rogers → Darth Vader) plus the Scoville spice scale.
- 100%-local default with PII redaction (emails, links, paths, secrets,
  IPs, phones, amounts) and an optional `--ai` roast via your own local
  `claude` CLI.
- `npx` entry point and the `/goodbot` Claude Code plugin.
- `node:test` suite (14 tests, zero deps), `PRIVACY.md`, the runtime
  "🔒 100% local" confirmation line, and CI on Node 18/20/22.
  ([`1768a4c`](https://github.com/jgrichardson/good-bot/commit/1768a4c))

### Fixed

- Exhibit quotes capped to the card width and stripped of doubled wrapping
  quotes. ([`9de55ca`](https://github.com/jgrichardson/good-bot/commit/9de55ca))

[Unreleased]: https://github.com/jgrichardson/good-bot/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/jgrichardson/good-bot/releases/tag/v0.3.2
[0.3.1]: https://github.com/jgrichardson/good-bot/releases/tag/v0.3.1
[0.3.0]: https://github.com/jgrichardson/good-bot/releases/tag/v0.3.0
[0.2.0]: https://github.com/jgrichardson/good-bot/commit/d52bc50
[0.1.0]: https://github.com/jgrichardson/good-bot/commit/01d444a
