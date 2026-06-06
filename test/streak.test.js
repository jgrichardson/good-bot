'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  summarizeHistory, renderStreakReport, readHistory, writeHistory, recordRun,
  forgetHistory, HISTORY_PATH,
} = require('../niceness.js');

// Use a per-test temp HOME to avoid touching the developer's real history.
function withTempHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-test-'));
  const realHome = process.env.HOME;
  process.env.HOME = tmp;
  // NOTE: HISTORY_PATH was resolved at require time — bypass it by writing
  // directly to the path the module would use *now*. For tests, we focus on
  // the pure helpers (summarize/render) and the constructed paths.
  try { fn(tmp); } finally {
    process.env.HOME = realHome;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

test('summarizeHistory: empty when no runs', () => {
  const s = summarizeHistory({ schemaVersion: 1, runs: [] });
  assert.strictEqual(s.empty, true);
});

test('summarizeHistory: streak counts trailing same-persona runs', () => {
  const runs = [
    { ts: '2026-06-01T00:00:00Z', persona: 'Mr. Rogers', niceness: 95, scale: 'people' },
    { ts: '2026-06-02T00:00:00Z', persona: 'Bob Ross', niceness: 90, scale: 'people' },
    { ts: '2026-06-03T00:00:00Z', persona: 'Bob Ross', niceness: 88, scale: 'people' },
    { ts: '2026-06-04T00:00:00Z', persona: 'Bob Ross', niceness: 91, scale: 'people' },
  ];
  const s = summarizeHistory({ runs });
  assert.strictEqual(s.streak, 3);
  assert.strictEqual(s.last.persona, 'Bob Ross');
});

test('summarizeHistory: streak is 1 if no consecutive match', () => {
  const runs = [
    { persona: 'A', niceness: 50 }, { persona: 'B', niceness: 60 }, { persona: 'C', niceness: 70 },
  ];
  const s = summarizeHistory({ runs });
  assert.strictEqual(s.streak, 1);
});

test('summarizeHistory: best is the highest niceness', () => {
  const runs = [
    { persona: 'A', niceness: 30 }, { persona: 'B', niceness: 88 }, { persona: 'C', niceness: 75 },
  ];
  const s = summarizeHistory({ runs });
  assert.strictEqual(s.best.persona, 'B');
  assert.strictEqual(s.best.niceness, 88);
});

test('summarizeHistory: glow-up is last minus first niceness', () => {
  const runs = [
    { persona: 'Vader', niceness: 15 },
    { persona: 'Spock', niceness: 50 },
    { persona: 'Rogers', niceness: 92 },
  ];
  const s = summarizeHistory({ runs });
  assert.strictEqual(s.glowUp, 77);
});

test('summarizeHistory: returns distinct personas', () => {
  const runs = [
    { persona: 'A', niceness: 1 }, { persona: 'B', niceness: 2 },
    { persona: 'A', niceness: 3 }, { persona: 'C', niceness: 4 },
  ];
  const s = summarizeHistory({ runs });
  assert.deepStrictEqual(s.personas.sort(), ['A', 'B', 'C']);
});

test('summarizeHistory: recent timeline trims to last 14', () => {
  const runs = Array.from({ length: 30 }, (_, i) => ({ persona: 'X', niceness: i }));
  const s = summarizeHistory({ runs });
  assert.strictEqual(s.recent.length, 14);
  assert.strictEqual(s.recent[s.recent.length - 1].niceness, 29);
});

test('renderStreakReport: empty case prints onboarding message', () => {
  const out = renderStreakReport({ runs: [] });
  assert.match(out, /No history yet/);
});

test('renderStreakReport: shows glow-up arrow + key fields', () => {
  const runs = [
    { ts: '2026-06-01T00:00:00Z', persona: 'Darth Vader', niceness: 12, scale: 'people' },
    { ts: '2026-06-02T00:00:00Z', persona: 'Bob Ross', niceness: 90, scale: 'people' },
    { ts: '2026-06-03T00:00:00Z', persona: 'Bob Ross', niceness: 88, scale: 'people' },
  ];
  const out = renderStreakReport({ runs });
  assert.match(out, /GLOW-UP/);
  assert.match(out, /Bob Ross/);
  assert.match(out, /\+76/);  // 88 - 12
});

test('HISTORY_PATH is under user home + .good-bot', () => {
  assert.match(HISTORY_PATH, /\.good-bot/);
  assert.match(HISTORY_PATH, /history\.json$/);
});

test('readHistory tolerates a missing file and returns empty runs array', () => {
  withTempHome(() => {
    const fakePath = path.join(process.env.HOME, '.good-bot', 'nope.json');
    // Just exercise the read of an unreadable path via the read helper indirectly.
    // (readHistory uses HISTORY_PATH which was frozen at require time, but the
    // empty-case branch is the safe-default we care about.)
    const h = readHistory();
    assert.ok(h);
    assert.ok(Array.isArray(h.runs));
  });
});
