# Privacy

`good-bot` is built privacy-first. Here is exactly what it does and does not do.

## What it does

- Reads your **local** Claude Code transcripts under `~/.claude/projects/**/*.jsonl`.
- Looks at **only the messages you typed**. Tool results, system reminders, command output, and the model's replies are filtered out and never scored.
- Computes a tone score with simple local heuristics and prints a report card.

## What it does NOT do (default mode)

- ❌ No network requests. It does not phone home, ping a server, or call any API or LLM.
- ❌ No telemetry, no analytics, no tracking.
- ❌ No data collection. Nothing is uploaded, stored remotely, or shared.
- The only file it writes is `my-niceness-card.txt` in your current directory (your finished card), plus copying that card to your clipboard.

By default, **your messages never leave your machine.** The CLI confirms this at the end of every local run:

```
🔒 100% local — nothing was sent anywhere, no data collected.
```

## The one exception: `--ai` (opt-in)

If — and only if — you pass `--ai`, the tool sends a **small, redacted sample** of your messages to **your own local `claude` CLI** (the same Claude you're already logged into) for a wittier write-up. Before it does, it prints:

```
⚠️  --ai sends a REDACTED sample of your own messages to your local `claude`.
```

There is no other code path that transmits your text anywhere.

## Redaction

Any quoted snippet that appears on the card — or in the `--ai` sample — is run through `sanitize()` first, which masks:

- email addresses → `[email]`
- URLs → `[link]`
- file paths → `[path]`
- API keys / tokens / JWTs → `[secret]` / `[token]`
- IP addresses → `[ip]`
- phone numbers → `[phone]`
- dollar amounts → `[amount]`
- long digit sequences → `[number]`

This exists because you may post your card publicly. **Note:** regex redaction cannot catch *semantic* PII (e.g. a client or fund name written in plain prose). That is the deliberate reason the default mode transmits nothing at all — and you should glance at your card before sharing it publicly.

## Verify it yourself

It's one short, dependency-free file. Read [`niceness.js`](niceness.js), or:

```bash
# prove the default path makes no network calls — run it with networking off
node niceness.js   # works completely offline
```
