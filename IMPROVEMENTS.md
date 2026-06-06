# good-bot — Improvements Roadmap

Ten enhancements ranked by **viral leverage × ease of implementation × respect for the zero-dependency, 100%-local privacy contract**. Each lands on its own feature branch, tested, merged to `main`.

## Guiding constraints (non-negotiable)

- **No runtime dependencies.** Pure Node standard library.
- **Default mode stays 100% local.** No network without explicit opt-in flag.
- **All quoted content stays redacted** before any output that could be shared publicly.
- **Single screenshot-friendly card** remains the primary output.
- Style: small functions, no frameworks, comments only for non-obvious "why."

## The 10

### 1. One-click social share composers (`--share twitter|bluesky|linkedin|reddit`)
Generates a pre-filled compose URL with the user's persona + scale + hashtag + repo link. Copies URL to clipboard. Single highest-leverage viral feature: turns "I should tweet this" friction into one keystroke.
**Privacy:** URL only. No network. Output is just `xdg-open` / `open` to the compose page.

### 2. Comparison mode (`--compare`)
Two-line summary head-to-head between any two report cards: persona + niceness score + signature stats. Supports two input modes:
- `--compare <file1.json> <file2.json>` for exported cards
- `--compare --me <name1> <name2>` paired with `--export json` from another run

Generates a "🥇 Winner" image. The "who's nicer" mechanic is shareable on its own.
**Privacy:** local file comparison, nothing transmitted.

### 3. Personality quiz mode (`--quiz`)
7-question quiz that produces a persona without needing Claude Code history. Lets non-devs (and devs without enough history) participate. Removes the install barrier for the viral meme.
**Privacy:** no transcripts read. Answers stay in memory.

### 4. Cursor / Aider / Windsurf / Continue.dev source adapters
Adds four new ingestion sources to `SOURCES` in `niceness.js`. Doubles the addressable user base. Listed as a "great first contribution" in CONTRIBUTING.md — landing them ourselves bootstraps trust and signals the project takes AI tooling breadth seriously.
**Privacy:** same local-file reading discipline as Claude Code adapter.

### 5. Five new fictional-boss scales
Add to `SCALES`/`SCALE_META` in `scales.js`:
- `office` — Michael Scott → Stanley → Dwight → Pam → Jim → Andy → Toby → Robert California → Ryan
- `succession` — Cousin Greg → Tom → Connor → Roman → Shiv → Kendall → Gerri → Logan
- `swfilms` — Yoda → Leia → Obi-Wan → Han → Luke → Lando → Vader → Palpatine
- `marvel` — Cap → Spider-Man → Black Widow → Iron Man → Hulk → Loki → Thanos
- `parks` — Ann → Leslie → Ben → Ron → April → Tom → Tammy II → Jerry

Pop-culture scales = shareable scales. Each adds N personas × demo content.

### 6. Streak + glow-up tracker (`--streak`)
Persists `~/.good-bot/history.json` (single file, ≤1KB) recording persona + niceness + timestamp on each run. `--streak` reads it back and prints:
- Current streak ("14 days as Mr. Rogers")
- All-time best persona
- "Glow-up": delta vs first recorded run ("you used to be Vader, now you're Bob Ross")
**Privacy:** local only. New flag `--no-history` opts out; new flag `--forget-history` wipes the file.

### 7. Slack / Discord webhook posting (`--post-webhook URL`)
Posts the card (text format, sanitized) to a Slack/Discord-compatible webhook. Use case: team weekly leaderboard channel.
**Privacy:** opt-in via flag + warns explicitly: "⚠️ --post-webhook sends your REDACTED card to <hostname>" before sending. The card is already sanitized for public sharing.

### 8. Asciinema cast export (`--record`)
Writes an asciinema-compatible JSON cast file of the report card playback (with the animated robot face progression). Asciinema casts embed in READMEs, blog posts, and tweets. Single GIF/cast = a complete demo for anyone considering installing.
**Privacy:** local file write. No upload.

### 9. Reusable GitHub Action (`good-bot-action`)
Adds `.github/workflows/good-bot-team.yml` template + a tiny composite action that lets teams:
- Run `good-bot` against committed history exports
- Post a weekly leaderboard to PR comments or Slack
- Easy install: `uses: jgrichardson/good-bot@main`

Bootstraps team adoption. The Action only reads what users explicitly commit; it does not export private histories.

### 10. Audit / verify-privacy mode (`--audit`)
Runs in network-isolated mode via Node's `node:net` socket-creation hook + a self-test script that:
- Patches `net.createConnection`, `http.request`, `https.request`, `dns.lookup` to throw on call
- Runs the default flow
- Outputs a SHA-256 attestation file listing every syscall surface that was patched + result
- Prints "✅ Provably no network call was attempted during this run"

Builds trust for security-conscious users (enterprise + paranoid). The provable claim is itself a tweet-worthy moment.

---

## Out of scope (this pass)

- Web playground / hosted variant — breaks 100%-local invariant.
- Cloud comparison gist — requires `gh` CLI or OAuth; out of zero-dep contract.
- Custom themes (vaporwave/pixel/hacker) — fun but not viral leverage.
- AI-generated witty write-up customization — exists as `--ai` already; not a viral lever.

---

## Sequencing rationale

I'll land them in this order (each its own feature branch, tested, merged to `main`):

1. **#1 Social share composers** — smallest, highest viral leverage. Ship first.
2. **#5 Five new scales** — pure additive, no flag plumbing risk. Validates the pop-culture meme.
3. **#3 Personality quiz** — opens to non-Claude users.
4. **#4 Cursor/Aider/Windsurf/Continue adapters** — addresses #1 community ask.
5. **#6 Streak tracker** — daily-check habit.
6. **#2 Comparison mode** — depends on `--export` plumbing; lands after streak file format is stable.
7. **#7 Slack/Discord webhook** — team mechanic.
8. **#9 GitHub Action** — needs #7's webhook for full value.
9. **#8 Asciinema cast** — README hero asset; lands once the social-share narrative is tight.
10. **#10 Audit mode** — trust signal; lands last so the privacy story has every feature to attest about.

Each merge gets a Telegram ping.
