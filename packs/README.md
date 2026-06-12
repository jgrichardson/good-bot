# 🎭 Persona packs

A **pack** is a single JSON file that gives `good-bot` a whole new ladder of
personas — your team's inside jokes, your community's mascots, anything —
without touching the source. Load one with:

```bash
good-bot --scale-pack packs/cosmic-entities.json            # your real card
good-bot --scale-pack packs/office-archetypes.json --demo   # preview every rank
```

Packs compose with everything: `--demo`, `--json`, `--share`, `--roast`,
`--wrapped`, `--export json`… A loaded pack behaves exactly like a built-in
scale for that run. Two free packs ship in this directory:

| Pack | Ladder |
|---|---|
| [`office-archetypes.json`](office-archetypes.json) | 🧁 The Snack Fairy → 📣 The Reply-All Warlord |
| [`cosmic-entities.json`](cosmic-entities.json) | ☀️ The Benevolent Sun → ♾️ Heat Death of the Universe |

More are coming: **bonus packs ship first via the newsletter** (see
[GROWTH.md](../GROWTH.md) for the audience plan) — new ladders, seasonal
specials, community favorites.

## The format

The shape mirrors one ladder in [`scales.js`](../scales.js):

```json
{
  "name": "cosmic-entities",
  "title": "WHAT COSMIC ENTITY ARE YOU TO YOUR AI? · STAR CARD",
  "ends": ["  void", "  warm"],
  "ladder": [
    {
      "name": "The Benevolent Sun",
      "emoji": "☀️",
      "face": "happy",
      "tag": "Warms everything it touches.",
      "blurb": "Life-giving and constant. Whole ecosystems of code flourish in your light."
    }
  ]
}
```

| Field | Required | What it is |
|---|---|---|
| `name` | ✅ | a lowercase slug (`a-z`, `0-9`, dashes) identifying the pack |
| `title` | — | the banner across the top of the card (≤48 chars renders best) |
| `ends` | — | exactly 2 strings: the **meanest-end** and **nicest-end** bar labels |
| `ladder` | ✅ | 3–40 personas, ordered **nicest → meanest** (8–10 reads best) |
| `ladder[].name` | ✅ | the persona's display name (≤40 chars) |
| `ladder[].emoji` | — | one emoji (default 🤖) |
| `ladder[].face` | — | `happy` \| `neutral` \| `mean` — drives the little robot face (default: by ladder position — the top smiles, the bottom scowls) |
| `ladder[].tag` | — | the one-line quip under the name |
| `ladder[].blurb` | — | the 2–3 sentence description on the card |

**Thresholds are implicit**, exactly like the built-in scales: the engine maps
your 0–100 niceness onto the ladder by fraction, so rung 1 of 10 covers the
nicest tenth and the last rung the meanest. A longer ladder = finer-grained
ranks; no threshold numbers to maintain.

Validation is kind: a malformed pack prints every problem by field name
(`ladder[3] ("The Foo"): "face" must be one of happy | neutral | mean`) and
exits — never a stack trace.

## Ground rules for community packs

Same rules as [CONTRIBUTING.md](../CONTRIBUTING.md): keep personas **original
or clearly generic** (no copyrighted character names — archetypes beat
trademarks), roast the *behavior* and never any real person, and keep it
screenshot-safe for a work Slack. PRs that add a great pack to this directory
are very welcome.
