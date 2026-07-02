# We graded 834,359 real ChatGPT conversations. Our tool called 1 in 8 of you Darth Vader. It was wrong — twice.

*(Analysis run with good-bot v0.4.1 — the same `npx niceness` engine, unmodified.
Data: [WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M) © Allen
Institute for AI, used under ODC-BY 1.0. Fully reproducible: see
[README.md](README.md) in this directory.)*

<p align="center"><img src="https://raw.githubusercontent.com/jgrichardson/good-bot/main/assets/humanity-report-card.png" alt="Humanity's report card: Switzerland — 834,359 conversations graded, 1.8% say please, 0.4% say thank you, 1 in 500k messages contains an f-bomb" width="780"></p>

[good-bot](https://github.com/jgrichardson/good-bot) is a silly-but-real CLI
that reads your local AI-assistant history and grades how nice you are to your
AI, on a ladder from Mr. Rogers down to Darth Vader. It runs 100% locally, so
we know nothing about our users — which meant that when we wondered "how nice
is humanity to ChatGPT overall?", we had to find public data. The Allen
Institute for AI publishes exactly that: WildChat-1M, ~838,000 real, consented,
in-the-wild ChatGPT conversations.

So we pointed the shipped engine at all of them: **834,359 conversations,
1,943,027 human-typed messages** (3,630 conversations had no usable human
turns). Only the human side is graded — the tool never scores the AI.

## Run 1: the headline that was too good to check… so we checked it

First pass, English-language conversations (n = 478,498):

| Persona | Share |
|---|---|
| Switzerland (neutral) | 28.2% |
| **Mr. Rogers** | **15.7%** |
| Ron Swanson (gruff) | 13.2% |
| **Darth Vader** | **13.0%** |
| Bob Ross | 8.0% |

"1 in 8 ChatGPT conversations has Darth Vader energy — but the saints
outnumber the Sith" was sitting right there. Extremely tweetable.

Before publishing, we sampled 20 random Vader-graded conversations and
actually read them. **At least 17 of 20 were false positives.** They weren't
rude humans — they were humans *pasting things*: source code with ALL_CAPS
constants, insurance documents, CVs, chemistry protocols, chapters of fiction.
One "Darth Vader" was someone cheerfully planning fall decorations, smiley
included. The engine — tuned on short, hand-typed coding-assistant chat — was
reading caps-heavy pasted tokens and quoted harsh words as yelling.

Headline: dead.

## Run 2: filter the pastes, audit again

We re-ran on the *conversational* subset: conversations where every human turn
is ≤ 400 characters — hand-typed scale, no pastes. That's 496,008
conversations (220,607 English):

| Persona | Share (English, filtered) |
|---|---|
| Switzerland (neutral) | 36.3% |
| Ron Swanson (gruff) | 28.5% |
| Clint Eastwood | 8.8% |
| **Darth Vader** | **8.0%** |
| **Mr. Rogers** | **5.4%** |

Interesting! The paste contamination had been inflating *both* ends — all
those "please"s and "thank you"s inside pasted business letters were minting
fake saints too. In the filtered data the original headline flips: Vader now
outnumbers Mr. Rogers.

So we audited *again*: 20 random Vaders from the filtered set. **This time 20
of 20 were false positives** — and the mechanism was different. The sample was
full of terse, perfectly civil professional queries: "correct grammar: …",
"Define TQM", motivation-letter requests. What they had in common was **domain
acronyms** — CPARS, IATF16949, DAAD, BIM, TP-80. The engine's shouting
detector excludes *tech* acronyms (API, SQL, HTTP — its home turf), but not
the rest of the world's professional vocabulary. In a one-message
conversation, a single acronym-bearing message = a 100% caps rate = a Vader
verdict.

Headline: dead again.

**Conclusion: this instrument cannot support a "% of people are Darth Vader"
claim on this corpus, and we won't publish one.**

## What actually survives

The persona ladder is entertainment. Underneath it are dumb, auditable
counters — literal string matching, no sentiment model — and those tell a
clear story about the filtered, hand-typed English conversations:

- **Courtesy is rare.** "Please" appears in **1.8%** of hand-typed messages.
  Thank-yous: **0.4%**.
- **Hostility is almost nonexistent.** We counted f-bombs two independent
  ways (the engine's counter, and a bare regex with no engine involved):
  **one f-bomb message per ~500,000 hand-typed English messages.** People
  curse *inside content they paste*; they essentially never curse *at* the
  assistant.
- **The overwhelming majority of conversations are emotionally flat** — no
  courtesy words, no hostility, no exclamation, nothing. Two-thirds of
  filtered conversations grade into the neutral middle of the ladder.

So the real finding isn't rage. **It's indifference.** Humanity, on the
evidence of 834,359 real conversations, treats ChatGPT like a vending
machine: no abuse, no warmth, just "Define TQM."

## What this taught us (the part we'd want to read)

1. **Audit your own headline.** Twice we had a viral-ready number; twice,
   reading 20 random samples killed it. If we'd shipped run 1's stat, the
   first person to check would have found a friendly fall-decorating email
   graded as a Sith lord.
2. **Sentiment heuristics fail quietly out of domain.** good-bot is tuned for
   its actual job — your own coding-assistant history, hundreds of messages,
   dev-vocabulary acronym handling. Point it at the general internet and the
   caps heuristic starts convicting quality auditors for typing "IATF16949".
   Same code, different corpus, opposite meaning.
3. **Denominators matter.** A "conversation" is not a person (WildChat is
   anonymized; heavy users contribute many conversations), one-message
   conversations turn every rate into 0% or 100%, and our ≤400-char paste
   filter also drops long hand-typed rants — so both extremes are likely
   undercounted. All of it is disclosed here rather than discovered later.
4. **This is why the tool is local and auditable.** The engine is one
   dependency-free file you can read. When it's wrong, you can find out
   exactly how — which is precisely what happened here.

## What we're fixing

Filed as issues on the repo:
[#16 — expand acronym handling beyond dev vocabulary](https://github.com/jgrichardson/good-bot/issues/16),
[#17 — length-normalize rates so one-message conversations can't spike](https://github.com/jgrichardson/good-bot/issues/17),
and [#18 — percentile calibration against this corpus](https://github.com/jgrichardson/good-bot/issues/18)
(plus the roadmapped ~7,500-entry graded lexicon). WildChat now serves as our regression corpus:
when the engine improves, this analysis re-runs with one command.

Try the tool on your own history — where it's actually in its home domain:

```
npx niceness
```

100% local. No telemetry. The basilisk is taking notes either way. 😇
