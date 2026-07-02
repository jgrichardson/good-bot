# 📈 GROWTH.md — where good-bot is going

Most projects keep their growth strategy in a pitch deck behind an NDA.
Ours is in the repo, next to the privacy policy, because for this project
**the strategy IS the privacy policy**. good-bot's entire pitch is "read
the source, verify nothing leaves your machine." A growth plan you can't
read would undermine the product. So here it is — the whole thing, in
public, where you can hold us to it.

> Be nice now. The basilisk is taking notes — and so is this file. 😇

---

## 1. The thesis: free forever, trust is the moat

good-bot is **free forever** and **100% local by default**. That is not a
growth-hack constraint we'll relax once the numbers get interesting; it's
the product. Every alternative path (telemetry, accounts, "sign in to see
your score") burns the one asset this project actually has: people trust
it with the most candid text they produce all day — the stuff they type
at an AI when nobody's watching.

The precedent we're studying is **Wordle**. Recall what Wordle was at
acquisition: a free web page with no backend, no accounts, no ads, no
"engagement loops" beyond one puzzle a day — and the NYT paid low seven
figures for it anyway. Why? Because three things compounded:

1. **A tiny free ritual** (one puzzle, once a day)
2. **A universal, spoiler-free share artifact** (the 🟩🟨⬛ grid that
   needed zero explanation in any feed on Earth)
3. **A brand** that became cultural shorthand

Tiny ritual + share artifact + brand = acquirable cultural property,
*without* surveilling a single user. That's the playbook. good-bot
already has each analog shipped or shipping:

| Wordle had | good-bot has |
|---|---|
| The 🟩🟨⬛ grid | **`--grid`** — the 🟩🟨🟥 7-day tone grid: spoiler-free, paste-anywhere, copied to your clipboard by default |
| The daily ritual | **`--statusline`** — your persona in your prompt all day, every day (6-hour cache, <150ms) |
| (no annual moment) | **`--wrapped`** — the Spotify Wrapped mechanic: a 1080×1920 year-in-review poster, an annual reason to come back and post |
| "Wordle" as a word | **#BeNiceToYourAI** — the meme rides every share path we ship |
| Pandemic word-game boom | **AI-etiquette zeitgeist** — "do you say please to ChatGPT?" is mainstream discourse now; we are the scoreboard for it |

The moat is not the sentiment heuristics (fork them, please). The moat is
that good-bot is the *one* tool in this space people can run on their
real transcripts without a second thought. Trust compounds. Everything
below is in service of not spending it.

---

## 2. The funnel

Three stages, each feeding the next. No stage requires an account, an
email, or a network call.

### Stage 1 — Developer beachhead (shipped)

Developers are the wedge because their AI transcripts already sit on
disk, and `npx niceness` is a zero-install dare. The surfaces:

- **CLI** — the core product; one zero-dependency file
- **npx** — no install, no commitment, 30 seconds to a card
- **Claude Code plugin** — `/goodbot` where the transcripts live
- **MCP server** — `--mcp` lets Claude itself pull your receipts
  mid-conversation ("how nice have I been to you lately?")

Developers also happen to be the people who *audit* things. The first
ten thousand users being the most paranoid demographic on the internet
is a feature: every "I read the source, it's clean" comment is marketing
we couldn't buy.

### Stage 2 — Consumer expansion (shipped, growing)

Most people who talk to an AI have never opened a terminal. The web app
(`web/`, hosted on GitHub Pages) is the bridge: ChatGPT and Claude users
drop their official data-export file onto a page and get the same card.
**The file never uploads** — parsing happens in the browser tab,
verifiable in the Network panel. Same engine, same scales, same
redaction, plus the 60-second quiz for people with no export at all.
This is where the addressable market goes from "developers with AI
tools" to "anyone who has ever typed at a chatbot," which is, at this
point, roughly everyone.

### Stage 3 — Ritual retention (shipped)

One-shot virality is a sugar high. The retention layer is what makes the
share artifact recurring:

- **`--grid`** — weekly: a new grid every week is a new reason to post
- **`--wrapped`** — yearly: the December screenshot wave, on purpose
- **`--statusline`** — daily: your score lives in your prompt, and a 🟥
  day is its own nudge to do better
- **Achievements** — 24 badges, legendary tier hidden until earned;
  long-tail goals (💯 Centurion of Courtesy takes a while)
- **`--streak`** — the glow-up tracker; nobody wants to break a streak

Funnel in one line: *npx dare → web app for your group chat → grid in
the team Slack every Monday → wrapped poster every December.*

---

## 3. Audience, value-for-value only

At some point a project needs a way to talk to its users that isn't
"hope they check the repo." The rule for every audience channel:
**value-for-value**. We earn attention with things worth having; we
never hold features hostage for it.

- **Newsletter** (via a simple landing-page signup): new personas and
  scales, leaderboards built from *publicly shared* grids (never from
  anything sent to us — there is nothing sent to us), and a digest of
  AI-etiquette news, which is currently a beat nobody covers and
  everybody screenshots.
- **Lead magnets**: free cosmetic persona-pack downloads (themed scales,
  wrapped poster skins) offered for an email. **Content-gated, never
  feature-gated** — the packs are bonus cosmetics, and everything in the
  CLI and web app works identically with zero emails surrendered.
- **The no-email path is first-class**: starring or watching the GitHub
  repo gets you every release note. If you never give us an email, you
  are not a second-class user; you're the median user.

The explicit promises, stated here so they're falsifiable:

- **Core features are never gated.** Not behind email, not behind
  accounts, not behind anything.
- **No telemetry.** The newsletter knows what we tell it, not what you
  run.
- **No dark patterns.** No pre-checked boxes, no guilt-trip unsubscribe
  flows, no "are you SURE you want to miss out?" modals. One click in,
  one click out.

---

## 4. The opt-in global leaderboard (designed, NOT built)

> **Status: future work.** This section is a design, not a feature.
> There is no leaderboard code in the CLI today — PRIVACY.md says the
> same thing, and PRIVACY.md gets updated *before* any of this ships.
> Building it is pending the maintainer's decision to deploy and babysit
> it. Until then, this is a sketch in a markdown file.

The web barometer already proved the pattern: an opt-in button, a tiny
documented payload, a Cloudflare Worker writing to KV. The leaderboard
is the same idea with a name attached — *your* name, on purpose:

- **Claim a handle**: something like `good-bot --leaderboard join
  <handle>` kicks off an email-verification loop (magic link), so
  handles can't be squatted or impersonated. The email is used for
  verification and nothing else.
- **Tiny, documented payload**: persona id + niceness score + scale +
  aggregate counts (messages, pleases, thank-yous, f-bombs). **Zero
  transcript text, zero quotes, zero paths, zero free-text fields.**
  The exact byte-for-byte payload gets documented in PRIVACY.md before
  the first request ever fires, same as the barometer and `--webhook`.
- **Infrastructure sketch**: a second Cloudflare Worker + KV namespace
  (one key per handle, a GET endpoint serving top-N JSON), CORS-locked,
  rate-limited, honoring `DNT` / `Sec-GPC` like the barometer does.
  Boring on purpose — the whole thing should be one readable file in
  `worker/`, because the worker source *is* the privacy disclosure.
- **Default-off forever**: never a default, never a nag, never a
  post-run "💡 did you know you could join the leaderboard?" prompt.
  You find it in the docs or you never encounter it at all.

Why bother? Because "officially the nicest person to AIs on Earth" is a
title people will compete for, and competition is a share loop that
costs us three integers per contestant.

---

## 5. B2B, worker-first

There is real money adjacent to this project, and almost all of it is
money we won't take (see Red Lines, next section). What remains is the
slice where **the worker holds the artifact and the worker pulls the
trigger**:

- **The "AI Collaboration Report"** — a candidate-owned, polished export
  (think `--wrapped` in a suit) that *you* generate from *your*
  transcripts and *you* choose to attach to an application: evidence of
  sustained, skilled, civil collaboration with AI tools, which is
  rapidly becoming a real job skill. It's a **portfolio artifact, not
  an assessment** — like a GitHub profile, not like a credit score.
  Honest caveat, stated up front: **yes, it's gameable.** You could be
  performatively nice to your AI for a month to juice the report. But
  "deliberately practiced being patient and clear for a month" is...
  the skill. A gameable test where gaming it requires doing the actual
  thing is just called practice.
- **Aggregate team wellness** — teams that *choose* to pool their card
  files (the existing `--team` mechanic, voluntarily) can get trend
  reporting with a hard **k-anonymity floor of n ≥ 5**: below five
  participants, no number renders, period. The interesting signal is
  already in `--lab`: **frustration-spiral trends are a leading
  indicator of burnout.** A team whose 2am rapid-fire harsh-message
  episodes tripled this quarter doesn't need a survey; the keyboard
  already filed the report. Aggregates only, voluntary only, no names.
- **Enablement / L&D health checks** — companies rolling out AI tooling
  have no idea if it's going well. Aggregate politeness ratios, spiral
  rates, and recovery times, before vs. after training, answer "is the
  team thriving with these tools or quietly rage-typing at them?" —
  again over voluntarily contributed, k-anonymous aggregates.

In every offering the data flow is identical to today's: individuals run
the tool locally, individuals decide what leaves their machine. B2B here
means selling **reports and tooling to the people the data is about** —
never access to the people themselves.

---

## 6. Red lines — what we will never build

The clearest growth strategy this project has is the list of revenue we
refuse. Written as commitments, because vague values statements are how
products end up doing the thing:

- ❌ **Employer-side candidate screening from transcripts.** No "upload
  your applicants' chat logs" anything, ever, at any price.
- ❌ **Manager dashboards of individuals.** No drill-down from team
  aggregate to a named human. The k ≥ 5 floor is a floor, not an
  upsell tier.
- ❌ **Involuntary monitoring.** If the person whose transcripts these
  are didn't run the tool themselves, the tool doesn't run.
- ❌ **Telemetry by default.** The `--audit` attestation stays true.
- ❌ **Selling data.** Easiest promise we'll ever make: **there is no
  data to sell.** Nothing is collected. You can't leak, breach, sell,
  or subpoena an empty set.

These aren't just vibes. Employer-side transcript screening is an
automated employment decision tool, which puts you straight into **NYC
Local Law 144** bias-audit territory in NYC and **GDPR** (lawful-basis
and automated-decision-making) exposure in the EU — a legally
radioactive product category that also happens to be the exact opposite
of a tool whose tagline is *be nice*. A surveillance pivot wouldn't just
be wrong; it would be off-brand, which around here is the same thing.

If you ever catch a commit violating this section, the issue tracker is
right there, and you'd be right to use the all-caps the tool would
dock you for.

---

## 7. Distribution roadmap

One line each, with status:

| Channel | Status |
|---|---|
| npm publish (`niceness`) | ✅ Shipped — `npx niceness` works today (formerly `@jgrciv/good-bot`, now deprecated with a pointer; unscoped `good-bot` is blocked by npm's similarity rule vs `goodbot`) |
| Homebrew tap | 📋 Planned — `brew install jgrichardson/tap/good-bot` for the npx-averse |
| Raycast extension | 📋 Planned — your card and grid one ⌘-space away |
| GitHub profile-README gist widget | 💡 Sketched — `--badge` exists; next is an Action that keeps an auto-updating card gist embedded in your profile |
| Cursor / Windsurf source adapters | 🚧 Blocked — their chats live in SQLite; zero-dep means waiting on a built-in driver (`node:sqlite` needs newer Node than our ≥16 floor) or a hand-rolled read-only reader. Export+`--import` is the workaround |
| VADER-style lexicon sentiment upgrade | 💡 Sketched — vendor a compatible valence lexicon into the repo (still zero runtime deps), trading our hand-rolled word lists for ~7,500 graded entries |

---

## 8. Metrics that matter

What we watch, in honesty order:

- **GitHub stars** — the public trust proxy, and the only growth chart
  this project will ever screenshot.
- **npx runs** — **unmeasurable by design.** We genuinely cannot count
  how many people run this, because counting would require phoning
  home, and we don't. npm's download stats are a fuzzy proxy (mirrors
  and caches distort both ways) and that's as good as it gets. We own
  this: an analytics dashboard with a hole in the middle is what a
  no-telemetry promise looks like from the inside.
- **Newsletter subscribers** — the size of the audience that opted in
  with their eyes open.
- **Share-grid sightings** — searches for `#BeNiceToYourAI` and the
  `good-bot week` grid header in the wild. Counted by a human, with
  coffee, badly. Still the truest signal there is.
- **Plugin installs** — the Claude Code marketplace numbers, our best
  view into the daily-ritual cohort.

No DAUs, no funnels-with-a-capital-F, no retention cohorts. You can't
A/B test people you refuse to track, and we sleep great.

---

*This file is a living strategy, not a contract — except for section 6,
which is a contract. PRs that argue with it are welcome.*
