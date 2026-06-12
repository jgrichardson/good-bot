# Privacy

`good-bot` is built privacy-first. Here is exactly what it does and does not do — for both the CLI and the hosted web app.

## What it does

- **CLI:** reads your **local** AI-coding-assistant transcripts, from exactly these places: Claude Code (`~/.claude/history.jsonl` + `~/.claude/projects/`), Codex (`~/.codex/sessions/`), Gemini CLI (`~/.gemini/tmp/*/logs.json` + `~/.gemini/sessions/`), Continue.dev (`~/.continue/sessions/`), and Aider (`.aider.chat.history.md` in your home directory, the current directory, and one level under common project roots like `~/Projects`, `~/code`, `~/src`). With `--import <file>` it additionally reads the one Claude.ai or ChatGPT export file you explicitly point it at. With `--vs` / `--lab` it additionally runs `git log` locally (your own commit messages only — see the cross-domain section below), and with the **opt-in** `--shell` flag it reads `~/.zsh_history` + `~/.bash_history`. Nothing else on your disk is read.
- **Web app:** runs entirely in your browser. The quiz path needs no input beyond your taps. The import path parses your dropped-in `conversations.json` *in the browser tab* — the file is never uploaded.
- Looks at **only the messages you typed**. Tool results, system reminders, command output, and the model's replies are filtered out and never scored.
- Computes a tone score with simple local heuristics and prints/displays a report card.

## What it does NOT do (default mode — CLI + web)

- ❌ No network requests. It does not phone home, ping a server, or call any API or LLM.
- ❌ No telemetry, no analytics, no tracking pixels, no Google Analytics, no Plausible, no anything.
- ❌ No data collection. Nothing is uploaded, stored remotely, or shared.
- The only file the CLI writes is `my-niceness-card.txt` in your current directory (your finished card), plus optionally the `--svg`, `--wrapped`, `--record`, and `--export json` outputs you explicitly asked for. Two small local state files live under `~/.good-bot/`: `history.json` (your own past run scores, for `--streak`) and `statusline.json` (a 6-hour cache of persona + score so `--statusline` is fast). Both contain only aggregate numbers and persona names — never transcript text — and both stay on your machine.
- The `--mcp` mode is equally local: it speaks the Model Context Protocol over **stdio only** (stdin/stdout with the MCP client on your machine, e.g. Claude Desktop or Claude Code). It opens no sockets, makes no network calls, writes no files, and its three tools (`niceness_report`, `niceness_stats`, `niceness_roast`) are strictly read-only over the same local transcripts listed above.

By default, **your messages never leave your machine.** The CLI confirms this at the end of every local run:

```
🔒 100% local — nothing was sent anywhere, no data collected.
```

You can prove this yourself: run the CLI with `--audit` to patch every stdlib network surface and print a verified-no-network attestation.

## Cross-domain sources (`--vs`, `--git-dirs`, `--shell`)

The `--vs` card (and the matching `--lab` section) compares your AI manners against two other **strictly local** sources. Here is exactly what is read and what survives:

- **Git commit messages** — read by running `git log` locally in the current directory, plus any repos you pass via `--git-dirs <comma,separated,paths>`. Only commits **authored by you** are considered, matched against `git config user.email` / `user.name`. Commit text is scored in memory and reduced to aggregate counts (messages, pleases, thank-yous, f-bombs, ALL-CAPS); it is **never quoted** on any card, never written to disk, and never transmitted. Project labels are directory basenames only — full paths never appear.
- **Shell history** — **opt-in only**, via the `--shell` flag; nothing shell-related is read without it. When enabled, the CLI reads `~/.zsh_history` (zsh extended-history timestamps are stripped) and `~/.bash_history` if present, and counts **only** expletives and ALL-CAPS lines. Commands are never stored, never quoted, never transmitted, and never appear in any output — only the counts do. A missing history file simply contributes zero.

Both sources follow the same rule as everything else here: 100% local, counts only, nothing leaves your machine. Neither involves any network call, so the `--audit` attestation covers them too.

## The exceptions: explicit, named opt-ins

There are exactly **four** code paths that ever touch the network, all opt-in by an explicit flag or button, all named here so they cannot hide:

### 1. CLI `--ai` flag

Sends a **small, redacted sample** of your messages to **your own local `claude` CLI** (the same Claude you're already logged into) for a wittier write-up. Before it does, it prints:

```
⚠️  --ai sends a REDACTED sample of your own messages to your local `claude`.
```

### 2. CLI `--post-webhook URL` flag

POSTs the (already-redacted) plain-text card to a Slack-/Discord-compatible webhook URL **that you supply**. Before it does, it prints:

```
⚠️  --post-webhook sends your REDACTED card to <host>
```

### 3. CLI / Web `--share <platform>` flag / Share button

Builds a pre-filled compose URL for Twitter / Bluesky / Threads / LinkedIn / Reddit. The URL **is built locally**. The only network call is when **you** click the share button, which opens the platform's compose page in a new browser tab.

### 4. Web "🌡️ Add my score to the barometer" button (web app only — opt-in)

This is the global niceness aggregator (see next section).

There is no fifth code path. Read the source — it's one short, dependency-free file ([`niceness.js`](niceness.js)) plus the web bundle ([`web/`](web/)) and the worker ([`worker/`](worker/)). Everything is open source and self-evident.

## The web barometer (opt-in only)

The web app at https://jgrichardson.github.io/good-bot/ offers an **opt-in** global statistics aggregator. The default state is OFF — you have to tap the **"🌡️ Add my score to the barometer"** button on the result screen for any network call to fire.

### What we send when you tap the button

Three fields. That's it:

| Field | Type | Example |
|---|---|---|
| `niceness` | integer 0–100 | `78` |
| `scale` | enum string | `"people"` |
| `source` | enum string | `"quiz"` or `"import"` or `"shared-link"` |

We echo this payload back to your browser so you can verify it. The button is honest about what it sent.

### What we explicitly do NOT collect

- ❌ IP address
- ❌ User-Agent
- ❌ Cookies (we set none, we read none)
- ❌ Referer
- ❌ Geolocation
- ❌ Browser fingerprint of any kind
- ❌ Session ID
- ❌ Any portion of your transcripts
- ❌ Your name, persona name, exhibits, or any other free-text field

### What we do with it

- Compute the global histogram per scale (a count per niceness-bucket)
- Serve that aggregate back to the result screen so you see "you beat X% of N people"

### What we NEVER do with it

- 🚫 Sell it to anyone, for any price, ever
- 🚫 Share it with third parties for any purpose
- 🚫 Use it as training data for AI or ML models
- 🚫 Use it for advertising, retargeting, or any marketing purpose
- 🚫 Cross-reference it with anything else
- 🚫 Reconstruct individual users from the aggregate

### Honoring browser privacy signals

If your browser sends `DNT: 1` (Do Not Track) or `Sec-GPC: 1` (Global Privacy Control), the barometer endpoint receives the request and **returns success without writing anything**. The button shows "added" but nothing is recorded. This is intentional privacy-preserving behavior — the response shape is identical so a network observer can't tell whether your submission was honored.

### Retention

- Aggregate bucket counts persist indefinitely (these are just numbers like "73 people scored 60–69 on the people scale")
- No raw individual submissions are kept past the request that wrote them

### Sub-processors

- **Cloudflare**, as the host of the worker + the Workers KV store that holds the aggregate counters
- Nothing else. No analytics vendors, no third-party services.

### Verification

The worker source is in the repo at [`worker/index.js`](worker/index.js). Read it. It IS the privacy disclosure. CORS allows requests from `https://jgrichardson.github.io` only. The entire data flow is two HTTP endpoints, both open source.

## Redaction (CLI + web sharing)

Any quoted snippet that appears on the card — or in the `--ai` sample, or any `--share` / `--post-webhook` output — is run through `sanitize()` first, which masks:

- email addresses → `[email]`
- URLs → `[link]`
- file paths → `[path]`
- API keys / tokens / JWTs → `[secret]` / `[token]`
- IP addresses → `[ip]`
- phone numbers → `[phone]`
- dollar amounts → `[amount]`
- long digit sequences → `[number]`

This exists because you may post your card publicly. **Note:** regex redaction cannot catch *semantic* PII (e.g. a client or fund name written in plain prose). That is the deliberate reason the default mode transmits nothing at all — and you should glance at your card before sharing it publicly.

## Machine-readable output (`--json`)

`--json` prints your results as a single JSON object on stdout so teammates can swap cards and run `--compare`. By default it contains **no quotes from your transcripts** — only your persona, score, aggregate counts (messages, pleases, thank-yous, …), achievement ids, source names, and date range. Passing `--include-quotes` opts in to embedding your exhibit quotes, and even then they go through the same `sanitize()` redaction described above. Nothing is transmitted: the JSON goes to your terminal, and sending the file to a teammate is your own manual act.

## Verify it yourself

```bash
# CLI: prove the default path makes no network calls
node niceness.js --audit         # patches every network surface + prints attestation

# CLI: or just run it with networking off
node niceness.js                 # works completely offline

# Web: open DevTools → Network tab → take the quiz
# You should see ZERO requests until you tap a share button or the barometer button.
```

## Commitments

These are the commitments we will not break. If we ever need to change them, we will do so via a publicly-announced change in this file, in the CHANGELOG, and on the website, *before* any new behavior ships.

- **The default path is 100% local.** No network requests fire unless you explicitly opt in.
- **No data is ever sold or shared with third parties.**
- **No data is ever used to train AI or ML models.**
- **No data is ever used for advertising, retargeting, or marketing.**
- **All opt-in paths are named in this document.** If we add a new one, we update this file first.

## Contact

Open a GitHub issue at https://github.com/jgrichardson/good-bot/issues for privacy questions, concerns, or to suggest improvements.
