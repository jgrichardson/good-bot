# Developers say "please" to ChatGPT at twice the rate of everyone else

*(Analysis run with good-bot v0.4.1 — the same `npx niceness` engine, unmodified.
Data: [DevGPT](https://zenodo.org/records/16392320) © NAIST-SE, CC-BY 4.0 —
Xiao et al., MSR 2024. Reproduction: see below.)*

Our [WildChat analysis](RESULTS.md) graded the general public: courtesy in
1.8% of hand-typed messages, essentially zero cursing, a population that
mostly treats ChatGPT like a vending machine.

Developers are good-bot's home audience. So: **are devs nicer or meaner to
their AI than everyone else?** Nicer. Measurably.

## The numbers

DevGPT collects real developer↔ChatGPT conversations from share-links that
developers posted publicly in GitHub commits, issues, PRs, discussions, and
Hacker News threads. From the latest snapshot (2024-05-14), after
deduplicating by share URL and keeping successfully-archived conversations:
**4,472 conversations, 18,943 developer-typed prompts.**

Applying the same hand-typed filter as WildChat (every turn ≤ 400 characters
— developers paste even more than everyone else; 56% of conversations
contained a paste-scale turn vs ~41% for the general corpus):

| Metric (hand-typed subset) | 👩‍💻 Developers (DevGPT) | 🌍 Everyone (WildChat, English) |
|---|---|---|
| Conversations | 1,970 | 220,607 |
| Messages | 6,008 | 1,185,942 |
| **"Please" rate** | **3.98%** | **1.80%** |
| **"Thank you" rate** | **0.82%** | **0.43%** |
| F-bombs | 0 | ~1 per 500k messages |
| Neutral personas (Switzerland + Ron Swanson) | 63.0% | 64.9% |

**Developers say "please" at 2.2× the general rate, and "thank you" at
1.9×.** The emotional flatness is the same — about two-thirds of both
populations grade into the two neutral personas — but when developers do
show a tone, it skews courteous.

A guess at why, beyond self-selection (see caveats): developers talk to AI
*iteratively*. Multi-turn debugging is a collaboration, and collaboration
norms ("could you", "please try again", "thanks, that worked") come along
for the ride. Vending-machine users issue one command and leave.

## The persona ladder — same honesty rule as WildChat

The filtered distribution puts 8.3% of dev conversations in the Darth Vader
bucket. Per our own methodology we audited a random sample before quoting
that — and once again the "Vaders" were civil technical questions ("What is
CSRF", "OAuth 2.0 vs PAT", SQL practice) convicted by their own acronyms
(IELTS, OAuth, CSRF, SQL, LTL…). Same failure modes as the general corpus,
already filed as [#16](https://github.com/jgrichardson/good-bot/issues/16)
and [#17](https://github.com/jgrichardson/good-bot/issues/17). **So no
"% of devs are Vader" claim from us.** The counter stats above are literal
string counts and survive scrutiny; the persona extremes on this corpus do
not.

## Caveats, disclosed

1. **Sharing bias, and it matters here:** every DevGPT conversation was
   *voluntarily shared* by its author in a public GitHub artifact. People
   showcase sessions that went well; a politeness skew upward is plausible.
   WildChat has no such bias — treat the 2.2× as an upper-bound-flavored
   estimate, not a precision measurement.
2. **No language labels.** DevGPT is predominantly English (GitHub context)
   but not exclusively — we graded all conversations, while the WildChat
   column is its English subset. This nudges the dev numbers *down* if
   anything (the lexicons are English), which makes the 2.2× more
   conservative, not less.
3. **Smaller n.** 6,008 hand-typed messages vs 1.19M. The please-rate gap
   (3.98% vs 1.80%) is far outside sampling noise at this n; the f-bomb zero
   is consistent with the general rate, not evidence of dev sainthood.
4. **Era:** DevGPT snapshots are Jul 2023–May 2024 ChatGPT; WildChat is
   Apr 2023–early 2024. Comparable eras, but manners may have drifted since.

## Reproduce it

```bash
# 1. Download (927 MB zip, no auth) and unpack
curl -L -o DevGPT.zip "https://zenodo.org/api/records/16392320/files/DevGPT.zip/content"
unzip DevGPT.zip

# 2. Flatten the newest snapshot: dedupe by share URL, human prompts only
#    (script inline in this repo's history; ~20 lines of python: walk
#    Sources[].ChatgptSharing[].Conversations[].Prompt, Status==200 only)

# 3. Grade with the shipped engine — raw and hand-typed subsets
node analysis/grade-wildchat.js devgpt-convs.jsonl > devgpt-raw.json
node analysis/grade-wildchat.js devgpt-convs.jsonl 400 > devgpt-filtered.json
```

Be nice out there — you're apparently already better at it than most:

```
npx niceness
```
