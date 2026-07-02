# How polite are developers to ChatGPT? (DevGPT)

> 🚧 **Status: analysis in progress.** The corpus is downloaded and grading is
> underway; numbers land here shortly. This page documents the setup so the
> methodology is public before the results are.

## The question

Our [WildChat analysis](RESULTS.md) measured the general public:
courtesy in **1.8%** of hand-typed messages, essentially zero cursing, and a
population that mostly treats ChatGPT like a vending machine.

Developers are good-bot's home audience — and the engine's home domain (its
acronym handling and heuristics are tuned on coding chat). So: **are devs
nicer or meaner to their AI than everyone else?**

## The corpus

[DevGPT](https://zenodo.org/records/16392320) (NAIST-SE, MSR 2024 mining
challenge, CC-BY 4.0): real developer↔ChatGPT conversations, collected from
ChatGPT share-links that developers posted in GitHub commits, issues, pull
requests, discussions, and code — roughly 17k shared conversations.

## Known bias, disclosed up front

DevGPT conversations were **voluntarily shared** by their authors — a developer
pasting a ChatGPT link into a commit is usually showing off a session that
*worked*. Expect a politeness skew relative to WildChat's in-the-wild capture.
The comparison is still meaningful (same engine, same counters, same filters),
but it's "devs as they present publicly," not "devs with the door closed."

## Method

Same pipeline as WildChat: extract human turns only → grade with the shipped
`npx niceness` engine, unmodified → report raw counters (please/thanks/f-bomb
rates) alongside persona shares → audit random samples of any extreme bucket
before publishing a claim about it.
