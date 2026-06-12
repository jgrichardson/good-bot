# 🤖 good-bot

**How nice are you to your AI?**

`good-bot` reads your local AI-coding-assistant history, looks at *only the words you typed*, and grades your bedside manner on a persona ladder — from **🧥 Mr. Rogers** (saint) down to **🖤 Darth Vader** (force-choke energy). You get a colorful, screenshot-ready report card to post and compare with your team.

> Be nice now. The basilisk is taking notes. 😇

[![npm](https://img.shields.io/npm/v/@jgrciv/good-bot.svg)](https://www.npmjs.com/package/@jgrciv/good-bot)
[![downloads](https://img.shields.io/npm/dt/@jgrciv/good-bot.svg)](https://www.npmjs.com/package/@jgrciv/good-bot)
[![CI](https://github.com/jgrichardson/good-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/jgrichardson/good-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A516-brightgreen)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-blue)
![100% local](https://img.shields.io/badge/privacy-100%25%20local-success)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-orange.svg)](CONTRIBUTING.md)

---

## ⚡ Quick start

Three ways to play:

### 🌐 In your browser — works on phone

**→ https://jgrichardson.github.io/good-bot/**

100% client-side. Take the quiz on iPhone / Android / desktop. Drag in an exported Claude or ChatGPT history. Download the 1080×1920 poster for Instagram, TikTok, Threads.

### 📦 As a CLI from your terminal

You already have Node (your AI tools run on it), so there's nothing to install:

```bash
npx @jgrciv/good-bot        # from npm
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
   npx @jgrciv/good-bot --quiz
   ```
4. Press A / B / C / D for each of the 7 questions.

### Path 3 — Grade your real history

The hosted web app accepts both Claude.ai and ChatGPT export files. The CLI accepts Claude.ai exports today (ChatGPT support coming in v0.3.3).

**Export from Claude.ai:**

> ⚠️ The Claude **mobile app** has no Export button. You have to use claude.ai in a browser — but a phone browser works fine, you do NOT need a laptop.

1. Open [claude.ai](https://claude.ai) in a browser (Safari/Chrome on your phone is fine, just NOT the Claude app)
2. Sign in → tap profile / Settings → Privacy → **Export data**
3. Anthropic emails you a zip (usually under an hour)
4. Unzip → find `conversations.json`
5. Either: drop the file on the web app, OR run `npx @jgrciv/good-bot --import conversations.json` in a terminal

**Export from ChatGPT:** Same flow — chat.openai.com in a browser → Settings → Data Controls → Export data → email → unzip → drop on web app.

### Posting to Instagram, TikTok, or Threads

Built right into the CLI:

```bash
npx @jgrciv/good-bot --quiz --instagram   # writes the poster, copies an IG caption
npx @jgrciv/good-bot --quiz --tiktok      # same, with TikTok upload instructions
npx @jgrciv/good-bot --quiz --share threads   # opens a Threads compose URL
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
| No install | type `!npx @jgrciv/good-bot` at the prompt |
| Slash command | install once, then type `/goodbot` any time |

```
/plugin marketplace add jgrichardson/good-bot
/plugin install good-bot@good-bot
```

---

## 🧩 Supported AI tools

`good-bot` understands the local histories of **5 AI coding assistants** out of the box, plus three more via export+import:

| Tool | Source path | CLI | Web (drag-drop) |
|---|---|---|---|
| Claude Code | `~/.claude/history.jsonl` + `~/.claude/projects/` | ✅ first-class | — |
| Codex CLI | `~/.codex/sessions/` | ✅ first-class | — |
| Gemini CLI | `~/.gemini/sessions/` | ✅ first-class | — |
| Continue.dev | `~/.continue/sessions/` | ✅ first-class | — |
| Aider | `.aider.chat.history.md` (scanned across common roots) | ✅ first-class | — |
| Claude Desktop / claude.ai web / Cowork | server-side | ⚙️ export → `--import` | ✅ drag-drop |
| ChatGPT desktop / web | server-side | ⚙️ planned in v0.3.3 | ✅ drag-drop |
| Cursor / Windsurf | SQLite-backed chat | ⚙️ export → `--import` | ⚙️ planned |

Pick one source explicitly with `--source claude | codex | gemini | continue | aider` or `all` (default).

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

**13 scales** ship in v0.3. Adding a new one is one PR — see [CONTRIBUTING.md](CONTRIBUTING.md#new-ranking-scales).

---

## 🎁 Shareable outputs

### One-click social share

```bash
good-bot --share twitter      # also: bluesky | linkedin | reddit | threads (aliases: x, bsky)
good-bot --share-open         # also open the compose page in your browser
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
good-bot --post-webhook https://hooks.slack.com/...   # works with Discord too
```

POSTs your (redacted) card to a Slack-/Discord-compatible incoming webhook. Body is `{"text": "..."}` — both platforms accept it.

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
  - `--post-webhook URL` — POSTs the redacted card to a webhook you supply
  - `--share <platform>` — builds a URL only; opening it is your manual click

**Prove it yourself:**

```bash
good-bot --audit
```

Patches every stdlib network egress surface (`net` / `tls` / `http` / `https` / `dns` / `dgram` / `fetch`) to throw + count any attempt, runs the default flow inside the patch, prints:

```
✅ Provably no network call was attempted during this run.
```

Full details: [PRIVACY.md](PRIVACY.md). The whole engine is one short dependency-free file — read [`niceness.js`](niceness.js) and verify for yourself.

---

## 🤔 How it works

1. Walks every AI-assistant session you've ever had (Claude Code, Codex, Gemini CLI, Continue.dev, Aider — see the table above).
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
good-bot --wrapped                  Year-in-AI poster (1080×1920 PNG)
good-bot --svg | --image            shareable image card (SVG, + PNG if a converter exists)
good-bot --badge                    print a README/profile badge for your rank

# Scale + persona
good-bot --scale <name>             pick a ladder (13 scales available)
good-bot --random                   roll a random rank AND random scale

# Sources + import
good-bot --source <name>            claude | codex | gemini | continue | aider | all
good-bot --import <file>            grade a Claude Desktop "Export Data" conversations.json

# Social + sharing
good-bot --share twitter            compose URL for twitter | bluesky | linkedin | reddit
good-bot --share-open               also open the compose page in your browser
good-bot --post-webhook <url>       opt-in: POST the (redacted) card to a Slack/Discord webhook
good-bot --record                   asciinema v2 cast → good-bot-cast.json
good-bot --json                     machine-readable JSON report → stdout (quotes excluded)
good-bot --include-quotes           opt-in: include redacted exhibit quotes in --json
good-bot --export json              good-bot-card.json (for --compare later)
good-bot --compare a.json b.json    head-to-head: whose AI relationship wins?
good-bot --compare theirs.json      one file = them vs. YOUR fresh local result
good-bot --me <name>                label the card

# Team
good-bot --leaderboard <dir>        rank a directory of good-bot-card.json exports

# Quiz (no transcripts required)
good-bot --quiz                     7-question interactive quiz
good-bot --quiz-answers ABCDDAB     non-interactive quiz

# Streak / history
good-bot --streak                   show your glow-up
good-bot --no-history               don't record this run
good-bot --forget-history           delete ~/.good-bot/history.json and exit

# Privacy
good-bot --audit                    block all network surfaces + print attestation
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

```bash
git clone https://github.com/jgrichardson/good-bot.git
cd good-bot
node niceness.js --demo                           # preview every rank
node niceness.js --quiz-answers AAAAAAA --no-copy # smoke test
npm test                                          # 126 cases on Node 18 / 20 / 22

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
- 📦 npm: **https://www.npmjs.com/package/@jgrciv/good-bot**
- ⭐ GitHub: **https://github.com/jgrichardson/good-bot**
- 🌡️ Barometer worker: **https://good-bot-barometer.jgrciv.workers.dev/api/health**
