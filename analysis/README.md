# 🔬 The good-bot Lab

good-bot never collects user data — the CLI is 100% local by design. So when
we want population-scale answers ("how nice is humanity to its AIs?"), we run
the **exact shipped engine** (`analyze()` + `pickPersona()` from `npx niceness`,
unmodified) over **public research corpora of real human↔AI conversations**,
and publish the results here with full reproduction steps.

Ground rules for every analysis in this directory:

1. **Same engine users run.** No analysis-only tuning — if the engine is wrong,
   the analysis says so (see the Darth Vader saga below).
2. **Only the human side is graded.** Assistant turns are discarded before
   scoring.
3. **Audited before published.** Headline claims get a manual read of random
   samples; claims that fail the audit are reported as failures, not shipped.
4. **Reproducible by anyone.** Each page lists the exact commands. No auth
   tokens, no private data, no network access needed by the grader itself.

## The analyses

| Analysis | Corpus | Real users? | Scale | License | Status |
|---|---|---|---|---|---|
| [We graded 834,359 ChatGPT conversations — our tool called 1 in 8 of you Darth Vader. It was wrong, twice.](RESULTS.md) | [WildChat-1M](https://huggingface.co/datasets/allenai/WildChat-1M) (AI2) | ✅ in-the-wild | 834,359 convs · 1.94M messages | ODC-BY 1.0 | ✅ Published |
| [Developers say "please" at twice the rate of everyone else](devgpt.md) | [DevGPT](https://zenodo.org/records/16392320) (NAIST-SE, MSR 2024) | ✅ shared by devs on GitHub | 4,472 convs · 18,943 prompts | CC-BY 4.0 | ✅ Published |

## Reproduce the WildChat analysis

Requirements: Node ≥16 (the grader), [DuckDB CLI](https://duckdb.org) (parquet
→ JSONL flatten), ~10 GB free disk.

```bash
# 1. Download the corpus (14 parquet files, ~3.4 GB, no auth required)
mkdir wildchat-data && cd wildchat-data
for i in $(seq 0 13); do
  n=$(printf "%05d" $i)
  curl -L -O "https://huggingface.co/datasets/allenai/WildChat-1M/resolve/main/data/train-${n}-of-00014.parquet"
done

# 2. Flatten: one JSON line per conversation, human turns only
duckdb -c "COPY (
  SELECT conversation_hash AS id, language AS lang, country,
         list_transform(list_filter(conversation, x -> x.role = 'user'),
                        x -> x.content) AS turns
  FROM 'train-*.parquet'
) TO 'convs.jsonl' (FORMAT JSON)"

# 3. Grade every conversation with the shipped engine
node path/to/good-bot/analysis/grade-wildchat.js convs.jsonl > results.json
# 3b. Conversational subset (every human turn ≤400 chars — no pastes):
node path/to/good-bot/analysis/grade-wildchat.js convs.jsonl 400 > filtered.json
```

## Methodology notes (read before quoting numbers)

- **Headline statistics use the English-language subset** (WildChat's `language`
  field). The politeness/rudeness lexicons are English; other languages
  mis-grade toward the neutral personas.
- **The unit is a conversation, not a person.** These corpora are anonymized;
  one prolific user can contribute many conversations.
- **The ≤400-char "conversational" filter** removes pasted documents/code
  (which false-positive the caps/mean signals — see
  [#16](https://github.com/jgrichardson/good-bot/issues/16)) but also drops
  long hand-typed rants, so both extremes are likely undercounted.
- **Known engine limitations found by these analyses** are tracked in
  [#16](https://github.com/jgrichardson/good-bot/issues/16) (professional
  acronyms read as shouting),
  [#17](https://github.com/jgrichardson/good-bot/issues/17) (one-message
  conversations spike rates to 0%/100%), and
  [#18](https://github.com/jgrichardson/good-bot/issues/18) (percentile
  calibration against these corpora). When the engine improves, every analysis
  here re-runs with one command — these corpora are our regression suite.

## On deck

Corpora we've verified and plan to grade next:

- **ShareChat** (142,808 real conversations across ChatGPT, Claude, Gemini,
  Grok & Perplexity, 101 languages) — an independent replication with a
  *different* selection bias than WildChat, plus per-platform comparisons.
- **PRISM** (8,011 conversations from 1,500 paid participants in 75 countries,
  with demographics) — does politeness vary by age, country, culture?
- **WildChat-4.8M** — the same pipeline at 5.7× scale.

Deliberately excluded: datasets whose "human" side is synthetic (UltraChat,
Alpaca, Baize, Evol-Instruct, Orca-family…) or crowdworker role-play
(OASST, hh-rlhf) — those measure prompt-writers at work, not real people
talking to an AI.

## Attribution

- WildChat-1M © Allen Institute for AI, ODC-BY 1.0 — Zhao et al., *WildChat:
  1M ChatGPT Interaction Logs in the Wild* (ICLR 2024).
- DevGPT © NAIST-SE, CC-BY 4.0 — Xiao et al., *DevGPT: Studying Developer-ChatGPT
  Conversations* (MSR 2024).
