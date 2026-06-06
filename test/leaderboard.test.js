'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTeamCards, rankTeamCards, renderLeaderboard } = require('../niceness.js');

function makeCard(opts) {
  return {
    schemaVersion: 1,
    displayName: opts.displayName || null,
    scale: 'people',
    persona: { name: opts.persona, emoji: opts.emoji || '🤖', face: 'happy', tag: null },
    niceness: opts.niceness,
    stats: { messages: 100, pleases: opts.pleases || 0, thanks: opts.thanks || 0, fbombs: 0, shouts: 0 },
    span: null,
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-lb-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('loadTeamCards: reads valid .json card files in a directory', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'alice.json'), JSON.stringify(makeCard({ displayName: 'Alice', persona: 'Mr. Rogers', niceness: 92 })));
    fs.writeFileSync(path.join(dir, 'bob.json'), JSON.stringify(makeCard({ displayName: 'Bob', persona: 'Darth Vader', niceness: 12 })));
    const cards = loadTeamCards(dir);
    assert.strictEqual(cards.length, 2);
  });
});

test('loadTeamCards: ignores non-.json files', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'alice.json'), JSON.stringify(makeCard({ displayName: 'Alice', persona: 'Rogers', niceness: 80 })));
    fs.writeFileSync(path.join(dir, 'README.md'), 'not a card');
    const cards = loadTeamCards(dir);
    assert.strictEqual(cards.length, 1);
  });
});

test('loadTeamCards: skips malformed card files but keeps valid ones', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(makeCard({ displayName: 'G', persona: 'OK', niceness: 50 })));
    fs.writeFileSync(path.join(dir, 'bad.json'), '{"not": "a card"}');
    const cards = loadTeamCards(dir);
    assert.strictEqual(cards.length, 1);
    assert.strictEqual(cards[0].displayName, 'G');
  });
});

test('loadTeamCards: throws when directory does not exist', () => {
  assert.throws(() => loadTeamCards('/nonexistent-' + Date.now()), /cannot read/);
});

test('rankTeamCards: sorts by niceness descending', () => {
  const cards = [
    makeCard({ displayName: 'A', persona: 'A', niceness: 30 }),
    makeCard({ displayName: 'B', persona: 'B', niceness: 90 }),
    makeCard({ displayName: 'C', persona: 'C', niceness: 60 }),
  ];
  const r = rankTeamCards(cards);
  assert.deepStrictEqual(r.map(c => c.displayName), ['B', 'C', 'A']);
});

test('rankTeamCards: tie-breaks on pleases+thanks', () => {
  const cards = [
    makeCard({ displayName: 'A', persona: 'A', niceness: 50, pleases: 10, thanks: 5 }),
    makeCard({ displayName: 'B', persona: 'B', niceness: 50, pleases: 2, thanks: 2 }),
  ];
  const r = rankTeamCards(cards);
  assert.strictEqual(r[0].displayName, 'A');
});

test('renderLeaderboard: empty input shows onboarding message', () => {
  const out = renderLeaderboard([]);
  assert.match(out, /no cards found/);
});

test('renderLeaderboard: medals on top 3, indices on the rest', () => {
  const cards = ['A', 'B', 'C', 'D', 'E'].map((n, i) => makeCard({ displayName: n, persona: n, niceness: 100 - i * 10 }));
  const out = renderLeaderboard(cards);
  assert.match(out, /🥇/);
  assert.match(out, /🥈/);
  assert.match(out, /🥉/);
  assert.match(out, / 4\. /);
  assert.match(out, / 5\. /);
});

test('renderLeaderboard: includes hashtag tagline', () => {
  const cards = [makeCard({ displayName: 'A', persona: 'A', niceness: 50 })];
  const out = renderLeaderboard(cards);
  assert.match(out, /#BeNiceToYourAI/);
});
