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

You already have Node (your AI tools run on it), so there's nothing to install:

```bash
npx @jgrciv/good-bot        # from npm
npx github:jgrichardson/good-bot  # or straight from GitHub
```

That's it. It scans your local AI-assistant history, grades you locally, prints your card, and copies a plain-text version to your clipboard.

> On **Claude Desktop, web, or Cowork**? Those keep history server-side, so export it (claude.ai → Settings → *Export data*) and run with `--import conversations.json`.

---

## 👋 For non-developers (Claude Desktop / claude.ai web / mobile)

Don't write code? You're in the right place. Three friendly paths:

### Path 1 — The 60-second quiz (no transcripts, no export, no waiting)

This is the easiest path. You don't need to export anything; you just answer 7 questions.

1. Make sure you have **Node.js** installed (one-time, free):
   - **Mac:** open Terminal → `brew install node` (if you don't have Homebrew: download from [nodejs.org](https://nodejs.org/))
   - **Windows:** download the installer from [nodejs.org](https://nodejs.org/)
2. Open your terminal (Mac: Cmd+Space → "Terminal"; Windows: search "PowerShell")
3. Paste this:
   ```bash
   npx @jgrciv/good-bot --quiz
   ```
4. Press A / B / C / D for each of the 7 questions. Your card prints + lands on your clipboard.

### Path 2 — Grade your real Claude.ai history (5 minutes)

1. Go to [claude.ai](https://claude.ai) → settings → **Export data**. Wait for the email (usually under an hour).
2. Unzip the file Anthropic emails you — you want `conversations.json`.
3. Open your terminal in the folder where that file is and run:
   ```bash
   npx @jgrciv/good-bot --import conversations.json
   ```

### Path 3 — Mobile only? Borrow a laptop for 60 seconds.

`good-bot` is a tiny Node.js program, and **the Claude mobile app doesn't run Node** — there's no terminal inside the app. The pragmatic workaround:

- Borrow any laptop / desktop with a terminal (yours, a friend's, your kid's school laptop)
- Run the 60-second quiz above (Path 1)
- AirDrop / iMessage / email yourself the resulting `good-bot-wrapped.png` poster
- Post from your phone

We're tracking a hosted web-quiz version for fully mobile users — see [IMPROVEMENTS.md](IMPROVEMENTS.md) and [open an issue](https://github.com/jgrichardson/good-bot/issues) if you want it sooner.

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

`good-bot` understands the local histories of **5 AI coding assistants** out of the box:

| Tool | Source path | Status |
|---|---|---|
| Claude Code | `~/.claude/history.jsonl` + `~/.claude/projects/` | ✅ first-class |
| Codex CLI | `~/.codex/sessions/` | ✅ first-class |
| Gemini CLI | `~/.gemini/sessions/` | ✅ first-class |
| Continue.dev | `~/.continue/sessions/` | ✅ first-class |
| Aider | `.aider.chat.history.md` (scanned across common roots) | ✅ first-class |
| Cursor / Windsurf | SQLite-backed chat | ⚙️ export your chat history → `--import` |
| Claude Desktop / web / Cowork | server-side | ⚙️ export → `--import conversations.json` |

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

### Head-to-head

Two teammates each run:

```bash
good-bot --me "Alice" --export json    # writes good-bot-card.json
```

Then either of them runs:

```bash
good-bot --compare alice.json bob.json
```

Outputs a side-by-side stats grid + 🥇 winner with niceness → pleases+thanks tie-break.

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

## 📈 Watch your glow-up

```bash
good-bot --streak               # current streak, all-time best, niceness trend
good-bot --no-history           # don't record this run
good-bot --forget-history       # delete ~/.good-bot/history.json and exit
```

Persists a tiny local file at `~/.good-bot/history.json` (cap 365 entries, ≲30KB worst case) recording persona + niceness + timestamp on each run. The `--streak` view shows your current streak, all-time best persona, glow-up delta from your first run, distinct-personas count, and a 14-run niceness sparkline.

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
good-bot --export json              good-bot-card.json (for --compare later)
good-bot --compare a.json b.json    head-to-head: whose AI relationship wins?
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

Contributions welcome and easy! The whole codebase is one ~3,400-line Node project with **zero runtime dependencies**.

**Great first contributions:**
- 🎚️ **A new ranking scale.** Add a ladder to `scales.js`, give it a `SCALE_META` entry, optional demo content. Most ladders are 8–10 personas; any length works.
- 🧩 **A new ingestion source.** Cursor (SQLite), Windsurf, Cline, Roo Code, OpenCode all welcome.
- 🌐 **More redaction patterns** in `REDACTIONS` for PII we don't yet catch.
- 🐍 **A Python port** sharing the same ladder and redaction rules.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules (zero deps, privacy first, screenshot-friendly card), [IMPROVEMENTS.md](IMPROVEMENTS.md) for the v0.3 → v0.4 roadmap, and [CHANGELOG.md](CHANGELOG.md) for what's already shipped.

```bash
git clone https://github.com/jgrichardson/good-bot.git
cd good-bot
node niceness.js --demo            # preview every rank
node niceness.js --quiz-answers AAAAAAA --no-copy   # smoke test
npm test                           # 126 cases on Node 18 / 20 / 22
```

---

## 📣 Spread it

Run it, screenshot your card, post it, and tag a teammate with **#BeNiceToYourAI**. Bet you can guess who's getting Gordon Ramsay.

---

## License

[MIT](LICENSE) © Greg Richardson · See [PRIVACY.md](PRIVACY.md) for the privacy story · See [CHANGELOG.md](CHANGELOG.md) for what's changed
