# 🤖 good-bot

**How nice are you to your AI?**

`good-bot` reads your local Claude Code history, looks at *only the words you typed*, and grades your bedside manner on a 22-rank persona ladder — from **🧥 Mr. Rogers** (saint) all the way down to **🖤 Darth Vader** (force-choke energy). You get a colorful, screenshot-ready report card to post and compare with your team.

> Be nice now. The basilisk is taking notes. 😇

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A516-brightgreen) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-blue) ![100% local](https://img.shields.io/badge/privacy-100%25%20local-success)

---

## ⚡ Try it (zero install)

You already have Node (Claude Code runs on it), so there's nothing to install:

```bash
npx github:jgrichardson/good-bot
```

That's it. It scans `~/.claude/projects`, grades you locally, prints your card, and copies a plain-text version to your clipboard.

### Or type it right inside a Claude Code session

- **No install:** type `!npx github:jgrichardson/good-bot` at the prompt (the `!` runs it in your session).
- **As a slash command:** install the plugin once (below) and just type `/goodbot`.

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

In a real terminal it's in full color with the robot's face changing by tier. Run `npx github:jgrichardson/good-bot --demo` to see all 22 ranks.

---

## 🔒 Privacy (the important part)

Your transcripts contain real work — customer names, secrets, file paths. So:

- **The default mode is 100% local.** It reads your transcripts on your machine and **sends nothing anywhere** — no network, no LLM, no telemetry.
- **Quoted snippets are redacted** before they ever appear on the card (emails, URLs, file paths, API keys / JWTs, IPs, phone numbers, dollar amounts, long numbers) — because you might post the card publicly.
- The **only** path that ever leaves your machine is the explicit opt-in `--ai` flag, and even then it sends just a small **redacted** sample to *your own* local `claude` CLI, after printing a warning.

Regex redaction can't catch *semantic* PII (a client or fund name in prose), which is exactly why the safe default never transmits anything. Glance at your card before posting it publicly.

Full details: [PRIVACY.md](PRIVACY.md). It's one short, dependency-free file — read [`niceness.js`](niceness.js) and verify for yourself.

---

## 🎭 The ladder (people scale)

Nicest → meanest:

🧥 Mr. Rogers · 🎨 Bob Ross · 🦋 Dolly Parton · 🕶️ Keanu Reeves · ⚽ Ted Lasso · 📣 Oprah · 🐶 Golden Retriever · 🍿 Tom Hanks · 🍁 The Canadian · ✂️ Tim Gunn · 🧊 Switzerland · 🖖 Spock · 🥓 Ron Swanson · 🤠 Clint Eastwood · 🍎 Steve Jobs · 🎤 Simon Cowell · 🧛 Miranda Priestly · 🔥 Gordon Ramsay · 🏈 Bill Belichick · 🪖 Drill Sergeant · 💍 Gollum · 🖤 Darth Vader

### 🌶️ Bonus scale: Scoville heat

Prefer peppers to people? `--scale spice` grades you from **🍯 Honey** to **☢️ Pure Capsaicin (16,000,000 SHU)**.

```bash
npx github:jgrichardson/good-bot --scale spice
```

---

## 🧑‍🍳 Usage

```bash
good-bot                 # your card, 100% local (default)
good-bot --demo          # preview every rank on the ladder
good-bot --scale spice   # use the Scoville heat scale
good-bot --ai            # opt-in: sharper roast via your local `claude` (redacted sample)
good-bot --sample        # print a redacted sample (for in-session grading)
good-bot --help
```

| Flag | What it does |
|------|--------------|
| *(none)* | 100% local heuristic grade. Nothing leaves your machine. |
| `--demo` | Render a sample card for all 22 ranks. |
| `--scale spice` | Switch to the Scoville heat ladder. |
| `--ai` | Opt-in. Sends a **redacted** sample to your local `claude` for a funnier, more personalized roast (~13k tokens, free on a Claude subscription). |
| `--sample` | Emit a redacted stats + sample block (used by the `/goodbot` plugin). |

---

## 🔌 Install as a Claude Code plugin (`/goodbot`)

Inside Claude Code:

```
/plugin marketplace add jgrichardson/good-bot
/plugin install good-bot@good-bot
```

Then type `/goodbot` any time (or `/goodbot --scale spice`). The slash command runs the bundled script **locally** and shows your card — it never sends your messages anywhere.

---

## 🤔 How it works

1. Walks `~/.claude/projects/**/*.jsonl` (every Claude Code session you've ever had).
2. Keeps **only the messages you typed** — tool results, system reminders, command output, and the model's replies are all filtered out.
3. Scores tone with simple, transparent heuristics (politeness markers, gratitude, apologies, profanity, ALL-CAPS shouting, verbosity) and maps your style to a rank.
4. Renders the card, redacts any quoted snippets, and copies it to your clipboard.

No model is required for the default grade. `--ai` just adds a wittier write-up.

---

## 🗺️ Roadmap

- **Claude Desktop / Cowork support** via the account *Export Data* file (`conversations.json`) — a `--import <file>` mode that reuses the same ladder and redaction. (Those products keep history server-side, so there's no local `.jsonl` to scan; an export is the path.)
- More scales (weather, coffee, D&D alignment).
- A Python port for folks who have Python but not Node.

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📣 Spread it

Run it, screenshot your card, post it, and tag a teammate with **#BeNiceToYourAI**. Bet you can guess who's getting Gordon Ramsay.

## License

[MIT](LICENSE) © Greg Richardson
