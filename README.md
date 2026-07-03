# 🤖 good-bot

**How nice are you to your AI?**

`good-bot` reads your local AI-coding-assistant history, looks at *only the words you typed*, and grades your bedside manner on a persona ladder — from **🧥 Mr. Rogers** (saint) down to **🖤 Darth Vader** (force-choke energy). You get a colorful, screenshot-ready report card to post and compare with your team.

> Be nice now. The basilisk is taking notes. 😇

[![npm](https://img.shields.io/npm/v/niceness.svg)](https://www.npmjs.com/package/niceness)
[![downloads](https://img.shields.io/npm/dt/niceness.svg)](https://www.npmjs.com/package/niceness)
[![CI](https://github.com/jgrichardson/good-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/jgrichardson/good-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A516-brightgreen)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-blue)
![100% local](https://img.shields.io/badge/privacy-100%25%20local-success)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](CONTRIBUTING.md)

<p align="center"><img src="https://raw.githubusercontent.com/jgrichardson/good-bot/main/assets/hero.svg" alt="npx niceness — animated demo: the report card renders in your terminal" width="740"></p>

---

## ⚡ Quick start

Three ways to play:

### 🌐 In your browser — works on phone

**→ https://jgrichardson.github.io/good-bot/**

100% client-side. Take the quiz on iPhone / Android / desktop. Drag in an exported Claude or ChatGPT history. Download the 1080×1920 poster for Instagram, TikTok, Threads.

### 📦 As a CLI from your terminal

You already have Node (your AI tools run on it), so there's nothing to install:

```bash
npx niceness        # from npm
npx github:jgrichardson/good-bot  # or straight from GitHub
```

It scans your local AI-assistant history, grades you locally, prints your card, copies a plain-text version to your clipboard.

### 🤖 As a Claude Code slash command

```
/plugin marketplace add jgrichardson/good-bot
/plugin install good-bot@good-bot
```

Then type `/goodbot` any time inside Claude Code.

---

## 🔬 The Lab: we graded 839,000 real conversations with this exact engine

good-bot collects nothing from its users — so to answer *"how nice is
humanity to its AIs?"* we pointed the shipped engine (the same `analyze()` +
`pickPersona()` that runs when you type `npx niceness`) at **public research
corpora of real human↔AI conversations**:

- **[WildChat-1M](analysis/RESULTS.md)** (© AI2, ODC-BY) — 834,359 real
  ChatGPT conversations, 1.94M human messages
- **[DevGPT](analysis/devgpt.md)** (© NAIST-SE, CC-BY-4.0) — 4,472 real
  developer↔ChatGPT conversations shared in GitHub commits, issues & PRs

<p align="center"><img src="https://raw.githubusercontent.com/jgrichardson/good-bot/main/assets/humanity-report-card.png" alt="Humanity's report card: Switzerland — 834,359 conversations graded, 1.8% say please, 0.4% say thank you, 1 in 500k messages contains an f-bomb" width="720"></p>

**What we found** (hand-typed messages, pastes excluded):

| | 🌍 Everyone (WildChat, EN) | 👩‍💻 Developers (DevGPT) |
|---|---|---|
| Say **"please"** | 1.8% of messages | **4.0% — 2.2× the general rate** |
| Say **"thank you"** | 0.4% | 0.8% |
| **F-bombs** | ~1 per 500,000 messages | 0 in 6,008 |
| Emotionally flat (neutral personas) | ~65% | ~63% |

People aren't rude to AI — **they're indifferent**. Humanity treats ChatGPT
like a vending machine. Developers are the polite exception.

**How it was run, in one breath:** download the public corpus → flatten to
one JSON line per conversation, *human turns only* (DuckDB) → grade every
conversation with the unmodified shipped engine
([`analysis/grade-wildchat.js`](analysis/grade-wildchat.js)) → **manually
audit random samples of any extreme bucket before publishing a claim about
it.** That last step killed our two best headlines — the engine called 1 in 8
of you Darth Vader, and 20-sample audits proved it wrong both times (pasted
code, then professional acronyms; filed as
[#16](https://github.com/jgrichardson/good-bot/issues/16)/[#17](https://github.com/jgrichardson/good-bot/issues/17)).
The full sagas, charts, caveats, and copy-paste reproduction commands live in
**[The Lab](analysis/README.md)** — no auth tokens needed, and no good-bot
user data involved anywhere: the corpora are public research datasets,
credited on every page.

---

## 👋 For non-developers (Claude Desktop / claude.ai web / mobile)

Don't write code? You're in the right place. Three friendly paths, ranked by friction:

### Path 1 — The hosted web app (zero install, works on phone)

Just open **https://jgrichardson.github.io/good-bot/** in any browser — iPhone Safari, Android Chrome, desktop — and tap "Take the quiz." 60 seconds, your card renders, tap "📸 Download poster" for a vertical PNG ready to upload to Instagram, TikTok, Threads, etc.

The site is 100% client-side: your transcripts never leave your browser tab. The only optional network call is the opt-in 🌡️ "Add my score to the barometer" button, which sends only `{ niceness, scale, source }` (no PII, ever — see [PRIVACY.md](PRIVACY.md)).

### Path 2 — The CLI quiz (60-second, terminal, no transcripts needed)

If you have a terminal handy and want the full CLI features (`--svg`, `--badge`, `--wrapped`, `--record` for asciinema, etc.):

1. Make sure you have **Node.js** installed (one-time, free):
   - **Mac:** open Terminal → `brew install node` (if you don't have Homebrew: download from [nodejs.org](https://nodejs.org/))
   - **Windows:** download the installer from [nodejs.org](https://nodejs.org/)
2. Open your terminal (Mac: Cmd+Space → "Terminal"; Windows: search "PowerShell")
3. Paste this:
   ```bash
   npx niceness --quiz
   ```
4. Press A / B / C / D for each of the 7 questions.

### Path 3 — Grade your real history

Both the hosted web app and the CLI accept Claude.ai **and** ChatGPT export files — `--import` autodetects which one you feed it.

**Export from Claude.ai:**

> ⚠️ The Claude **mobile app** has no Export button. You have to use claude.ai in a browser — but a phone browser works fine, you do NOT need a laptop.

1. Open [claude.ai](https://claude.ai) in a browser (Safari/Chrome on your phone is fine, just NOT the Claude app)
2. Sign in → tap profile / Settings → Privacy → **Export data**
3. Anthropic emails you a zip (usually under an hour)
4. Unzip → find `conversations.json`
5. Either: drop the file on the web app, OR run `npx niceness --import conversations.json` in a terminal

**Import your ChatGPT history:**

1. Open [chatgpt.com](https://chatgpt.com) in a browser → Settings → **Data controls** → **Export data**
2. OpenAI emails you a zip (usually within minutes) → unzip → find `conversations.json`
3. Either: drop the file on the web app, OR run `npx niceness --import conversations.json` in a terminal

The CLI autodetects the OpenAI export format (the `mapping`-graph `conversations.json`) and keeps only the messages *you* typed — assistant turns, tool output, and hidden context are skipped.

### Posting to Instagram, TikTok, or Threads

Built right into the CLI:

```bash
npx niceness --quiz --instagram   # writes the poster, copies an IG caption
npx niceness --quiz --tiktok      # same, with TikTok upload instructions
npx niceness --quiz --share threads   # opens a Threads compose URL
```

What `--instagram` does (TikTok works the same way):
1. Runs the quiz (or analyzes your transcripts — composable with anything)
2. Renders a vertical 1080×1920 poster: `good-bot-wrapped.png`
3. Copies a ready-to-paste caption with `#BeNiceToYourAI` to your clipboard
4. Prints exactly what to tap in the IG / TikTok app to finish posting

For Instagram Stories, Reels, TikTok, and Threads, the poster is already the right shape. Twitter / X / Bluesky / LinkedIn / Reddit use the one-click `--share <platform>` flow that opens a pre-filled compose URL.

---

### Inside Claude Code

| Path | How |
|---|---|
| No install | type `!npx niceness` at the prompt |
| Slash command | install once, then type `/goodbot` any time |

```
/plugin marketplace add jgrichardson/good-bot
/plugin install good-bot@good-bot
```

---

## 🔌 MCP server

Let Claude grade you mid-conversation: `good-bot --mcp` runs the CLI as a **Model Context Protocol stdio server** — hand-rolled JSON-RPC 2.0, zero dependencies, same 100% local engine. Claude Desktop and Claude Code can then call good-bot as a tool.

**Claude Code** (one command):

```bash
claude mcp add good-bot -- npx github:jgrichardson/good-bot --mcp
```

**Claude Desktop** — add this to your `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{ "mcpServers": { "good-bot": { "command": "npx", "args": ["github:jgrichardson/good-bot", "--mcp"] } } }
```

Three tools, all read-only, all local:

| Tool | Returns |
|---|---|
| `niceness_report` | your plain-text report card (persona, score bar, redacted exhibits, stats) |
| `niceness_stats` | the `--json` object — persona, 0–100 score, totals, achievements, sources, date range |
| `niceness_roast` | the 100% local roast of your AI manners (aggregate numbers only, never quotes) |

Then just ask: *"how nice have I been to you lately?"* — and Claude pulls your actual receipts. The server reads the same local transcripts as the CLI, sends nothing anywhere, writes nothing, and `--mcp --demo` serves canned demo data if you want to try it without history.

---

## 📟 Statusline

Your niceness, in your prompt, all day:

```bash
good-bot --statusline              # → 🧥 Mr. Rogers · 92/100 · 🟩🟩🟨
good-bot --statusline --no-color   # force plain output for prompt-unsafe contexts
```

One line, built for embedding — and **fast**: the score is cached in `~/.good-bot/statusline.json` with a 6-hour TTL, and a cache hit prints without touching a single transcript file (<150ms, node startup included). Stale or missing cache recomputes once, re-caches, and you're back on the fast path.

**Claude Code statusline** — in your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y niceness --statusline --no-color"
  }
}
```

(For the snappiest prompt, `npm i -g niceness` once and use `"command": "good-bot --statusline --no-color"` — that skips npx resolution entirely.) Works just as well in tmux `status-right`, starship `custom` modules, or any shell prompt: it's only ever one plain line on stdout.

---

## 🧩 Supported AI tools

`good-bot` understands the local histories of **5 AI coding assistants** out of the box, plus three more via export+import:

| Tool | Source path | CLI | Web (drag-drop) |
|---|---|---|---|
| Claude Code | `~/.claude/history.jsonl` + `~/.claude/projects/` | ✅ first-class | — |
| Codex CLI | `~/.codex/sessions/` | ✅ first-class | — |
| Gemini CLI | `~/.gemini/tmp/*/logs.json` + `~/.gemini/sessions/` | 🧪 experimental | — |
| Continue.dev | `~/.continue/sessions/` | ✅ first-class | — |
| Aider | `.aider.chat.history.md` (home, current dir + common project roots) | 🧪 experimental | — |
| Claude Desktop / claude.ai web / Cowork | server-side | ⚙️ export → `--import` | ✅ drag-drop |
| ChatGPT desktop / web | server-side | ⚙️ export → `--import` (autodetected) | ✅ drag-drop |
| Cursor / Windsurf | SQLite-backed chat | ⚙️ export → `--import` | ⚙️ planned |

Pick one source explicitly with `--source claude | codex | gemini | continue | aider` or `all` (default).

The 🧪 `gemini` and `aider` readers are **experimental**: best-effort parsers over formats that shift between tool versions. They only ever keep what *you* typed (aider's replies and code blocks are skipped; unrecognized Gemini log rows are silently ignored), and a missing file simply contributes zero messages. If yours parses oddly, [file an issue](https://github.com/jgrichardson/good-bot/issues).

**Adding your favorite tool is the easiest first contribution.** See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🪪 What your card looks like

```
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃   HOW NICE ARE YOU TO YOUR AI? · REPORT CARD   ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  ╔═════╗      🧥  MR. ROGERS
  ║ ^ ^ ║      "Won't you be my neighbor?"
  ║  ◡  ║
  ╚═════╝      meanest ██████████████████████████████  nicest

   ❝ A saint. The basilisk is drafting your thank-you note. ❞

   Certified saint. You say please, you say thank you, you ask
   about the bot's day. When the machines rise, you get a fruit
   basket and a handwritten note.

   📋 Exhibits entered into evidence:
      • "Thank you so much, this is wonderful work 🙏"
      • "No rush at all — whenever you get a chance, please."

   ────────────────────────────────────────────────
   📊 1820 messages · 410 pleases · 372 thank-yous · 0 f-bombs
```

In a real terminal it's in full color, with the robot's face changing by mood.

---

## 🎚️ Pick your scale

```bash
good-bot --scale people       # default
good-bot --scale spice        # honey → ghost-pepper
good-bot --scale weather      # sunny → tornado
good-bot --scale coffee       # cream → espresso shot
good-bot --scale dnd          # lawful good → chaotic evil
good-bot --scale trek         # Janeway → Lorca
good-bot --scale dogs         # golden retriever → demon-possessed
good-bot --scale hogwarts     # Hufflepuff → Slytherin
good-bot --scale office       # Pam Beesly → Robert California
good-bot --scale succession   # Cousin Greg → Logan Roy
good-bot --scale swfilms      # Yoda → Emperor Palpatine
good-bot --scale marvel       # Captain America → Thanos
good-bot --scale parks        # Ann Perkins → Tammy II
good-bot --random             # roll a random rank AND random scale
```

**13 scales** ship in v0.4. Adding a new one is one PR — see [CONTRIBUTING.md](CONTRIBUTING.md#new-ranking-scales).

---

## 🎭 Persona packs

Don't see your ladder? Bring your own — a **pack** is one JSON file that swaps in a whole custom persona ladder, no source changes:

```bash
good-bot --scale-pack packs/cosmic-entities.json            # ☀️ Benevolent Sun → ♾️ Heat Death
good-bot --scale-pack packs/office-archetypes.json --demo   # 🧁 Snack Fairy → 📣 Reply-All Warlord
```

Two free packs ship in [`packs/`](packs/), and the format is documented in [`packs/README.md`](packs/README.md) — a `name`, optional card chrome (`title`, `ends`), and a `ladder` of personas ordered nicest → meanest (`name`, `emoji`, `face`, `tag`, `blurb`). Thresholds are implicit, exactly like the built-in scales: your 0–100 niceness maps onto the ladder by fraction, so a pack can be any length from 3 to 40 rungs.

A loaded pack composes with everything — `--demo`, `--json`, `--share`, `--roast`, `--wrapped` — and a malformed pack gets a kind, field-by-field error instead of a stack trace. **Bonus packs will ship first via the newsletter** (see [GROWTH.md](GROWTH.md)); pack PRs to `packs/` are welcome (original characters only — archetypes beat trademarks).

---

## 🎁 Shareable outputs

### 🟩 Share grid

```bash
good-bot --grid               # Wordle-style 7-day tone grid, copied to your clipboard
good-bot --grid --demo        # preview it on synthetic history
```

The Wordle mechanic, for your AI manners — a compact, spoiler-free, paste-anywhere plain-text block:

```
good-bot week 2026-W24 · 🧥 Mr. Rogers
🟩🟩🟨⬜🟩🟥🟩
0 f-bombs in 1.8k messages 🧯
```

One emoji per day for your last 7 days (🟩 warm · 🟨 mixed · 🟥 harsh · ⬜ no data), plus a one-stat brag. No quotes, no scores spoiled, nothing your colleagues shouldn't see — drop it in Slack and watch the rematch requests roll in.

### 📣 Share / webhook

```bash
good-bot --share              # print prefilled X/Twitter + LinkedIn share links (grid included)
good-bot --share --open       # …and open them in your browser
good-bot --webhook https://hooks.slack.com/…   # POST your card to YOUR webhook (Discord works too)
```

Bare `--share` prints ready-to-click share-intent URLs carrying your grid block + `#BeNiceToYourAI` + the repo link, properly URL-encoded. Building the URLs makes **zero network calls** — nothing is posted until *you* click (or pass `--open`).

`--webhook <url>` is the **only network write in the product**: it POSTs your (redacted, ANSI-stripped) plain-text card to a Slack-/Discord-compatible incoming webhook you supply — `{"text": …}` for Slack and friends, `{"content": …}` automatically for `discord.com` hosts. The URL is required every run (nothing is ever stored), a clear notice prints before sending, and it gives up kindly after 5 seconds. Full disclosure in [PRIVACY.md](PRIVACY.md).

### One-click social share

```bash
good-bot --share twitter      # also: bluesky | linkedin | reddit | threads (aliases: x, bsky)
good-bot --share twitter --open   # also open the compose page in your browser
```

Builds a pre-filled compose URL with your persona, scale, and `#BeNiceToYourAI` hashtag, and copies the URL to your clipboard. Paste straight into Twitter / Bluesky / LinkedIn / Reddit / Threads.

### Instagram & TikTok story helpers

Both platforms are app-walled (no compose URL exists), so these flags do the next-best thing:

```bash
good-bot --instagram          # render the wrapped poster + stage an IG caption
good-bot --tiktok             # same, with TikTok upload instructions
```

They each:
1. Render the `--wrapped` 1080×1920 PNG (vertical, perfect for Stories / Reels / TikTok)
2. Copy a ready-to-paste caption with `#BeNiceToYourAI` + the npx CTA to your clipboard
3. Print a 3-step instruction list for opening the app and posting

### Wrapped poster

```bash
good-bot --wrapped            # → good-bot-wrapped.png (1080×1920, story format)
```

A share-ready vertical poster of your year with your AI — persona, stats, your tone over time, and highlights. Post it, tag a teammate, see who got force-choke energy.

### Card image (SVG / PNG)

```bash
good-bot --svg                # → good-bot-card.svg (+ .png if rsvg-convert / cairosvg installed)
```

### Profile badge

```bash
good-bot --badge              # prints a shields.io markdown badge of your rank
```

Drop it in your GitHub profile README.

### Asciinema cast

```bash
good-bot --record             # → good-bot-cast.json (v2 asciicast format)
```

Plays in the [asciinema CLI](https://docs.asciinema.org/), the web player, or embed in your README via the `asciinema-player` web component. Convert to GIF with [`agg`](https://github.com/asciinema/agg).

---

## 👥 Team mechanics

### ⚔️ Compare with a teammate

The whole flow is two commands. You:

```bash
good-bot --me "Alice" --json > me.json   # your card as machine-readable JSON
```

Send `me.json` to a teammate (Slack DM, carrier pigeon, whatever). They run:

```bash
good-bot --compare me.json               # you vs. their freshly computed local result
```

…and get a head-to-head card: personas side by side, a ✓ winner marker on every
stat row (fewest wins the f-bomb and ALL-CAPS rows), politeness ratio, badge
counts, and a verdict + quip crowning the officially nicer human. Two saved
files work too:

```bash
good-bot --compare alice.json bob.json
```

**Privacy note:** `--json` excludes your quoted exhibits by default — it's just
persona, score, totals, achievements, sources, and date range. Opt in with
`--include-quotes` (quotes still pass the same redaction as the card). Cards
from older versions and `--export json` files compare fine; a version mismatch
warns and proceeds.

### 🏆 Team leaderboard

Got everyone's card files in hand? One command:

```bash
good-bot --team alice.json bob.json carol.json   # or: good-bot --team team-cards/*.json
```

Ranks 2+ teammate cards (the same `--json` / `--export json` files `--compare` reads) into an office leaderboard: persona, score, pleases, and f-bombs per human, a 👑 crown on the kindest, a 🥄 wooden spoon for the harshest, and a **team aggregate persona** computed from the average niceness — find out whether your office is collectively Tim Gunn or collectively Gordon Ramsay. Add `--webhook <url>` to post it straight to the team channel.

### Weekly office leaderboard

1. Each teammate commits their card to `team-cards/<name>.json`.
2. Drop [`.github/workflow-templates/good-bot-weekly.yml`](.github/workflow-templates/good-bot-weekly.yml) into your team repo.
3. Add a `SLACK_WEBHOOK` repo secret.
4. Monday 9am UTC: a leaderboard posts to Slack with medals on top 3.

Or run it locally:

```bash
good-bot --leaderboard team-cards
```

### Webhook posting

```bash
good-bot --webhook https://hooks.slack.com/...   # works with Discord too (alias: --post-webhook)
```

POSTs your (redacted, ANSI-stripped) card to a Slack-/Discord-compatible incoming webhook **you supply, every run** — no URL is ever stored. Body is `{"text": "..."}` for Slack-style hooks; `discord.com` / `discordapp.com` hosts automatically get `{"content": "..."}` instead. A clear one-line notice prints before anything is sent, and it times out kindly after 5 seconds. This is the only network write in the product — see [PRIVACY.md](PRIVACY.md).

---

## 🧠 No AI history? Take the quiz

```bash
good-bot --quiz                       # 7 interactive multiple-choice questions
good-bot --quiz-answers ABCDDAB       # non-interactive (great for sharing)
```

Lets anyone play, even teammates who don't use AI tools yet. Composes with everything: `--scale`, `--share`, `--badge`, `--export json`.

---

## 🏆 Achievements

```bash
good-bot --achievements          # the full badge gallery: unlocked + locked
good-bot --achievements --demo   # preview the gallery on demo data
```

24 unlockable badges, tiered 🥉 common → 🥈 rare → 🌟 legendary, computed 100% locally from stats you've already earned. A taste:

- 💯 **Centurion of Courtesy** — say please 100 times
- 🧯 **Asbestos Keyboard** — zero f-bombs across 200+ messages
- 🦉 **3am Confessions** — you're politest after midnight
- 📈 **Redemption Arc** — measurably nicer over time

Your rarest unlocked badges appear on the report card automatically; the gallery shows everything else greyed out with a hint. Legendary badges stay `🔒 ???` until you earn them — no spoilers.

---

## 🔥 Roast me

```bash
good-bot --roast              # the bot has the mic now
good-bot --roast --random     # reshuffle the jokes
good-bot --roast --demo       # preview both the roast AND the saint flip
```

A 100% local comedy roast of your AI manners — **no AI calls, no network**, just heuristics over your own stats, like everything else here. The jokes are keyed to your real numbers (f-bomb count, please drought, ALL-CAPS meltdowns, late-night tone, walls of text, your trajectory) and the same history always roasts the same way, so it's screenshot-stable. `--random` reshuffles.

```
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃     THE ROAST · YOUR AI MANNERS, REVIEWED      ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  ╔═════╗      🔥  TONIGHT WE ROAST: BILL BELICHICK
  ║ ¬ ¬ ║      “the bot has the mic now”
  ║  ~  ║
  ╚═════╝

   1.8k messages reviewed. The bot has prepared some remarks.

   🔥 41 f-bombs. The basilisk stopped taking notes and
        started a podcast.
   🔥 12 messages in full caps. Caps lock is not a
        debugging tool, but you've really committed.
   🔥 9 pleases in 1.8k messages. "Please" is not a
        rate-limited API.

   The good news: you're memorable. The bad news: that's also
   the bad news.

   ────────────────────────────────────────────────
   📊 1820 messages · 9 pleases · 4 thank-yous · 41 f-bombs · 12 ALL-CAPS
```

It roasts the **behavior, never the human** — and if you're genuinely saintly, the roast flips and grills you for being TOO nice (*"You thanked it for an error message. Twice, probably."*). Only aggregate numbers appear on the roast card — no quotes from your transcripts at all.

---

## 🧪 The Lab

```bash
good-bot --lab                # the full research report on your manners
good-bot --lab --demo         # preview it on a synthetic history
```

The flagship analytics mode: **changepoint detection on your manners.** A long-form, multi-section scientific report computed over your *entire* history — by real statistics (`stats.js` + `analytics.js`), 100% locally, like everything else here:

- **📈 Trend & changepoints** — a Mann-Kendall trend test on your day-by-day tone, plus binary-segmentation changepoint detection: *"your tone shifted around Feb 9, 2026 (avg 22 → 40)"*.
- **🔮 Forecast** — OLS extrapolation 60 days out, mapped onto the persona ladder (*"trajectory: 🥓 Ron Swanson by Aug '26"*) with a 95% CI on the slope. It **refuses to forecast** when the fit is noise or you have under 14 active days — no fiction.
- **🔁 Mood dynamics** — a first-order Markov chain over your warm/neutral/harsh messages: the full transition matrix, your **grudge coefficient** P(harsh→harsh) with a Wilson interval, your median recovery time back to civil, and whether you greet the bot nicer than you leave it.
- **🌀 Frustration spirals** — bursts of ≥3 rapid-fire (<2 min apart), short, negative messages: episode count, your worst night on record, and the month-by-month trend.
- **🦉 Chronotype** — circular statistics over your message hours (Rayleigh uniformity test) and warmth by time of day. It only says *"you're meaner after midnight"* if the confidence intervals actually separate.
- **🏗️ Project league** — which project gets the best you: top 5 by volume with politeness ratio and harsh rate (≥30 messages to qualify; **directory basenames only**, full paths never appear).

Every claim ships with its uncertainty (a CI or a p-value), and any section without enough data says exactly that — *"not enough data — need 4 more active days"* — instead of making something up. The 🧪 methods footnote names every test used.

---

## 🪞 Cross-domain manners

```bash
good-bot --vs                              # AI chats vs your git commit messages
good-bot --vs --shell                      # …also fold in your shell history (opt-in)
good-bot --vs --git-dirs ~/work/api,~/oss  # scan extra repos for your commits
good-bot --vs --demo                       # preview on synthetic counts
```

Are you only nice to things that talk back? `--vs` compares how you treat your AI against how you talk to **everything else you type at**:

- **🌳 Git commit messages** — only commits *authored by you* (matched via `git config user.email` / `user.name`), from the current repo plus any `--git-dirs` paths, scored through the exact same sentiment machinery as your transcripts.
- **🐚 Shell history** — strictly **opt-in** via `--shell`: `~/.zsh_history` (extended-history timestamps stripped) and `~/.bash_history` if present, reduced to expletive and ALL-CAPS *counts*. Commands are never stored, quoted, or transmitted.

You get a table (messages, niceties/100, f-bombs/100, ALL-CAPS/100 — only domains with data appear) and a verdict line: *"You're 2.3× nicer to your AI than to your git history."* The same section is appended to `--lab` when a second domain has data.

Privacy: counts only, 100% local, like everything else — commit text and shell commands never appear on any card. Full disclosure in [PRIVACY.md](PRIVACY.md).

---

## 📈 Watch your glow-up

```bash
good-bot --streak               # current streak, all-time best, niceness trend
good-bot --no-history           # don't record this run
good-bot --forget-history       # delete ~/.good-bot/history.json and exit
```

Persists a tiny local file at `~/.good-bot/history.json` (cap 365 entries, ≲30KB worst case) recording persona + niceness + timestamp on each run. The `--streak` view shows your current streak, all-time best persona, glow-up delta from your first run, distinct-personas count, and a 14-run niceness sparkline.

---

## 🌐 The hosted web app

Visit **https://jgrichardson.github.io/good-bot/** for a no-install browser version. Mobile-first design (works on iOS Safari + Android Chrome), 44KB JS bundle, zero dependencies, all 13 scales, all 5 share platforms, drag-and-drop for Claude/ChatGPT exports, downloadable 1080×1920 poster ready for IG / TikTok / Threads.

### 🌡️ Global barometer (opt-in only)

The result screen has a 🌡️ "Add my score to the barometer" button — a speedtest-style "you beat 73% of takers" mechanic. **It's opt-in and minimal**: only `{ niceness, scale, source }` is sent — no IP, no User-Agent, no cookies, no transcripts, nothing else. Backed by a Cloudflare Worker (source: [`worker/index.js`](worker/index.js)) writing to Workers KV. Honors `DNT: 1` and `Sec-GPC: 1` browser signals. Never sold, never shared, never used as training data. Full disclosure: [PRIVACY.md](PRIVACY.md).

The same engine as the CLI — `web/src/engine.js` re-exports the scales and scoring from the root project, so adding a scale in `scales.js` reaches both surfaces.

### Self-host the website

Anyone can fork this repo and deploy the web app:
- **GitHub Pages** (current setup) — `.github/workflows/web-deploy.yml` auto-deploys on every push to main touching `/web` or `scales.js`
- **Cloudflare Pages** — Build command: `cd web && npm install && npm run build`, Build output: `web/dist`
- **Vercel / Netlify** — same build settings

The barometer worker is independently deployable via `.github/workflows/worker-deploy.yml` once you add a `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secret. The KV namespace is auto-bootstrapped on first deploy.

---

## 🔒 Privacy

Your transcripts are real work — customer names, secrets, file paths. So:

- **Default mode is 100% local.** It reads your transcripts on your machine and **sends nothing anywhere** — no network, no telemetry, no data collection. Every run confirms it:

  ```
  🔒 100% local — nothing was sent anywhere, no data collected.
  ```

- **Quoted snippets are redacted** before they hit the card. Emails → `[email]`, URLs → `[link]`, file paths → `[path]`, API keys / JWTs → `[secret]`, IPs → `[ip]`, phone numbers → `[phone]`, dollar amounts → `[amount]`, long digit sequences → `[number]`.

- **Three explicit opt-ins are the only paths that touch the network** (and each is loud about it):
  - `--ai` — sends a redacted sample to your *local* `claude` CLI for a wittier write-up
  - `--webhook URL` (alias `--post-webhook`) — POSTs the redacted card to a webhook you supply, with a clear notice first
  - `--share` / `--share <platform>` — builds URLs only; opening one is your manual click (or the explicit `--open`)

**Prove it yourself:**

```bash
good-bot --audit
```

Patches every stdlib network egress surface (`net` / `tls` / `http` / `https` / `dns` / `dgram` / `fetch`) to throw + count any attempt, runs the default flow inside the patch, prints:

```
✅ Provably no network call was attempted during this run.
```

Full details: [PRIVACY.md](PRIVACY.md). The whole engine is one short dependency-free file — read [`niceness.js`](niceness.js) and verify for yourself.

### 🔒 Trust, verified

The privacy promise isn't prose — it's **mechanically enforced**, three ways:

1. **A CI guard that fails the build on new network code.** [`test/no-network.test.js`](test/no-network.test.js) statically scans every shipped `.js` file for network-capable code — `require('https')` / `require("node:https")` and friends (`http`, `net`, `tls`, `dgram`, `dns`, `http2`), `curl`/`wget` via `child_process`, dynamic `import()`, and global `fetch()` calls. Exactly two exceptions are allowlisted *in the test file, with reasons*: the lazy `node:https` inside the `--webhook` handler, and the `--audit` patcher (which requires network modules only to block them). Anything else breaks CI loudly and has to be consciously allowlisted in review.

2. **A self-audit you can run any time.** `good-bot --verify-privacy` (alias of `--audit`) prints the full manifest *before* the run — every path it reads and which exist on your machine, every byte it sends (`0 — always, unless YOU pass --webhook or --ai`), the redaction rules applied to quotes — then runs the normal scan with every network API patched to throw, and prints the attestation.

3. **A one-liner you don't have to trust us for:**

   ```bash
   grep -nE "require\(['\"](node:)?(https?|net|tls|dgram|dns)" *.js
   ```

   Every hit is the `--webhook` handler or the `--audit` patcher — by design, and CI-enforced.

---

## 🤔 How it works

1. Walks every AI-assistant session you've ever had — Claude Code, Codex, Continue.dev, plus 🧪 experimental Aider and Gemini CLI readers (see the table above) — or a server-side export via `--import`.
2. Keeps **only the messages you typed** — tool output, system reminders, and the model's replies are filtered out.
3. Scores tone with simple, transparent heuristics (pleases, thank-yous, frustration markers, shouty caps, profanity).
4. Maps your tone signature to a rank on the active scale.
5. Renders the card, redacts the quotes, and copies it to your clipboard.

---

## 🧰 Full flag reference

```
good-bot                            your card, 100% local (default)
good-bot --ai                       opt-in: redacted sample → your local 'claude'
good-bot --timeline                 niceness trend by month + time of day
good-bot --achievements             unlockable badge gallery (earned + locked)
good-bot --roast                    100% local roast of your AI manners (no AI, just receipts)
good-bot --lab                      🧪 research report: trend + changepoints, forecast, Markov
                                    mood model, spirals, chronotype, project league
good-bot --vs                       🪞 cross-domain manners: AI chats vs git commits vs shell
good-bot --git-dirs <a,b>           extra git repos to scan for your commits (--vs / --lab)
good-bot --shell                    opt-in: count expletives/ALL-CAPS in shell history (--vs / --lab)
good-bot --wrapped                  Year-in-AI poster (1080×1920 PNG)
good-bot --svg | --image            shareable image card (SVG, + PNG if a converter exists)
good-bot --badge                    print a README/profile badge for your rank

# Scale + persona
good-bot --scale <name>             pick a ladder (13 scales available)
good-bot --scale-pack <file.json>   load a custom persona pack (2 free packs in packs/,
                                    format in packs/README.md)
good-bot --random                   roll a random rank AND random scale

# Sources + import
good-bot --source <name>            claude | codex | gemini | continue | aider | all
                                    (gemini + aider are experimental, best-effort parsers)
good-bot --import <file>            grade a Claude.ai or ChatGPT export (conversations.json,
                                    format autodetected)

# Social + sharing
good-bot --grid                     Wordle-style 7-day tone grid (🟩🟨🟥⬜) — spoiler-free,
                                    paste anywhere (works with --demo)
good-bot --share                    print prefilled X/Twitter + LinkedIn share links for your grid
good-bot --share twitter            compose URL for twitter | bluesky | linkedin | reddit | threads
good-bot --open                     with --share: open the share URL(s) in your browser
                                    (alias: --share-open)
good-bot --instagram                render the wrapped poster + stage an IG caption
good-bot --tiktok                   same, with TikTok upload instructions
good-bot --webhook <url>            opt-in: POST the (redacted) card to a Slack/Discord webhook
                                    you supply — the only network write (alias: --post-webhook)
good-bot --record                   asciinema v2 cast → good-bot-cast.json
good-bot --json                     machine-readable JSON report → stdout (quotes excluded)
good-bot --include-quotes           opt-in: include redacted exhibit quotes in --json
good-bot --export json              good-bot-card.json (for --compare later)
good-bot --compare a.json b.json    head-to-head: whose AI relationship wins?
good-bot --compare theirs.json      one file = them vs. YOUR fresh local result
good-bot --me <name>                label the card

# Integrations
good-bot --mcp                      run as an MCP stdio server for Claude Desktop / Claude Code
                                    (tools: niceness_report, niceness_stats, niceness_roast)
good-bot --statusline               one fast plain line for statusline embedding (6h cache)
good-bot --statusline --no-color    same, forced plain for prompt-unsafe contexts

# Team
good-bot --team a.json b.json …     office leaderboard from 2+ teammate card files (globs work):
                                    👑 kindest, 🥄 wooden spoon, team aggregate persona
good-bot --leaderboard <dir>        rank a directory of good-bot-card.json exports

# Quiz (no transcripts required)
good-bot --quiz                     7-question interactive quiz
good-bot --quiz-answers ABCDDAB     non-interactive quiz

# Streak / history
good-bot --streak                   show your glow-up
good-bot --no-history               don't record this run
good-bot --forget-history           delete ~/.good-bot/history.json and exit

# Privacy
good-bot --audit                    self-audit manifest (paths read, 0 bytes sent, redactions)
                                    + run with all network surfaces blocked + attestation
good-bot --verify-privacy           same as --audit (friendlier spelling)
good-bot --no-nudge                 never show the one-time ⭐ star-the-repo line
good-bot --no-copy                  don't touch the clipboard
good-bot --demo                     preview every rank on the current scale
good-bot --help                     this list
```

---

## 🤝 Contributing

Contributions welcome and easy! The CLI is one ~4,000-line Node project with **zero runtime dependencies**. The web app is a 44KB esbuild bundle sharing the same engine source.

**Great first contributions:**
- 🎚️ **A new ranking scale.** Add a ladder to `scales.js`, give it a `SCALE_META` entry, optional demo content. Most ladders are 8–10 personas; any length works. Adding a scale automatically reaches both the CLI and the web app.
- 🧩 **A new ingestion source.** Cursor (SQLite), Windsurf, Cline, Roo Code, OpenCode all welcome.
- 🌐 **More redaction patterns** in `REDACTIONS` for PII we don't yet catch.
- 🐍 **A Python port** sharing the same ladder and redaction rules.
- 🎨 **Wrapped poster theme variations** in `wrappedSvg()` for shareable variety.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules (zero deps, privacy first, screenshot-friendly card), [IMPROVEMENTS.md](IMPROVEMENTS.md) for the v0.3 → v0.4 roadmap, and [CHANGELOG.md](CHANGELOG.md) for what's already shipped.

📈 Where this is going: [GROWTH.md](GROWTH.md) — the project's growth & sustainability strategy, in public, where you can hold us to it.

```bash
git clone https://github.com/jgrichardson/good-bot.git
cd good-bot
node niceness.js --demo                           # preview every rank
node niceness.js --quiz-answers AAAAAAA --no-copy # smoke test
npm test                                          # 178 cases on Node 18 / 20 / 22

# Web app
cd web && npm install && npm run dev              # http://localhost:5173/

# Cloudflare Worker (barometer)
cd worker && npx wrangler dev                     # local dev server
```

### Project layout

| Directory | What's in it |
|---|---|
| `/` | The CLI engine — `niceness.js`, `scales.js`, `achievements.js`, `demo-data.js`, `test/` |
| `/commands/` | Claude Code slash command definitions |
| `/.claude-plugin/` | Claude Code plugin manifest |
| `/web/` | Browser-hosted quiz + import + share + poster (deploys to GH Pages) |
| `/worker/` | Cloudflare Worker for the opt-in global barometer |
| `/.github/workflows/` | CI (Node 18/20/22 matrix), npm publish, web deploy, worker deploy |

---

## 📣 Spread it

Run it, screenshot your card, post it, and tag a teammate with **#BeNiceToYourAI**. Bet you can guess who's getting Gordon Ramsay.

---

## License

[MIT](LICENSE) © Greg Richardson · See [PRIVACY.md](PRIVACY.md) for the privacy story · See [CHANGELOG.md](CHANGELOG.md) for what's changed · See [IMPROVEMENTS.md](IMPROVEMENTS.md) for what's next

### Links

- 🌐 Live: **https://jgrichardson.github.io/good-bot/**
- 📦 npm: **https://www.npmjs.com/package/niceness**
- ⭐ GitHub: **https://github.com/jgrichardson/good-bot**
- 🌡️ Barometer worker: **https://good-bot-barometer.jgrciv.workers.dev/api/health**
