# 🤖 good-bot

**How nice are you to your AI?**

`good-bot` reads your local Claude Code history, looks at *only the words you typed*, and grades your bedside manner on a persona ladder — from **🧥 Mr. Rogers** (saint) down to **🖤 Darth Vader** (force-choke energy). You get a colorful, screenshot-ready report card to post and compare with your team.

> Be nice now. The basilisk is taking notes. 😇

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Node](https://img.shields.io/badge/node-%E2%89%A516-brightgreen) ![Zero dependencies](https://img.shields.io/badge/dependencies-0-blue) ![100% local](https://img.shields.io/badge/privacy-100%25%20local-success)

---

## ⚡ Run it (zero install)

You already have Node (Claude Code runs on it), so there's nothing to install:

```bash
npx github:jgrichardson/good-bot
```

It scans `~/.claude/projects`, grades you locally, prints your card, and copies a plain-text version to your clipboard.

### Inside a Claude Code session

- **No install:** type `!npx github:jgrichardson/good-bot` at the prompt.
- **As a slash command:** install once, then type `/goodbot` any time:
  ```
  /plugin marketplace add jgrichardson/good-bot
  /plugin install good-bot@good-bot
  ```

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

## 🔒 Privacy

Your transcripts are real work — customer names, secrets, file paths. So:

- **Default mode is 100% local.** It reads your transcripts on your machine and **sends nothing anywhere** — no network, no telemetry, no data collection. Every run confirms it: `🔒 100% local — nothing was sent anywhere`.
- **Quoted snippets are redacted** before they hit the card (emails, URLs, file paths, API keys, IPs, phone numbers, numbers) — because you might post it publicly.
- The only thing that ever leaves your machine is an explicit, clearly-warned opt-in that sends a *redacted* sample to *your own* local `claude`.

Full details in [PRIVACY.md](PRIVACY.md). It's one short, dependency-free file — read [`niceness.js`](niceness.js) and verify for yourself.

---

## 🎭 The ladder

Where will you land? Nicest → meanest:

🧥 Mr. Rogers · 🎨 Bob Ross · 🦋 Dolly Parton · 🕶️ Keanu Reeves · ⚽ Ted Lasso · 📣 Oprah · 🐶 Golden Retriever · 🍿 Tom Hanks · 🍁 The Canadian · ✂️ Tim Gunn · 🧊 Switzerland · 🖖 Spock · 🥓 Ron Swanson · 🤠 Clint Eastwood · 🍎 Steve Jobs · 🎤 Simon Cowell · 🧛 Miranda Priestly · 🔥 Gordon Ramsay · 🏈 Bill Belichick · 🪖 Drill Sergeant · 💍 Gollum · 🖤 Darth Vader

---

## 🤔 How it works

1. Walks every Claude Code session you've ever had (`~/.claude/projects/**/*.jsonl`).
2. Keeps **only the messages you typed** — tool output, system reminders, and the model's replies are filtered out.
3. Scores tone with simple, transparent heuristics and maps your style to a rank.
4. Renders the card, redacts the quotes, and copies it to your clipboard.

---

## 📣 Spread it

Run it, screenshot your card, post it, and tag a teammate with **#BeNiceToYourAI**. Bet you can guess who's getting Gordon Ramsay.

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Greg Richardson
