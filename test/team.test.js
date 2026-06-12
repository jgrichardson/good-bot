'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderTeamCard, normalizeCardRecord } = require('../niceness.js');

function makeCard(opts) {
  return normalizeCardRecord({
    schemaVersion: 1,
    displayName: opts.displayName || null,
    scale: 'people',
    persona: { name: opts.persona || opts.displayName, emoji: opts.emoji || '🤖', face: 'happy', tag: null },
    niceness: opts.niceness,
    stats: {
      messages: opts.messages || 100,
      pleases: opts.pleases || 0,
      thanks: opts.thanks || 0,
      fbombs: opts.fbombs || 0,
      shouts: 0,
    },
    span: null,
  }, opts.displayName || 'card');
}

const TEAM = [
  makeCard({ displayName: 'Bob', persona: 'Darth Vader', niceness: 12, fbombs: 41 }),
  makeCard({ displayName: 'Alice', persona: 'Mr. Rogers', niceness: 92, pleases: 410, thanks: 372 }),
  makeCard({ displayName: 'Carol', persona: 'Switzerland', niceness: 55, pleases: 40 }),
];

test('renderTeamCard: ranks nicest first, harshest last', () => {
  const out = renderTeamCard(TEAM);
  const alice = out.indexOf('Alice'), carol = out.indexOf('Carol'), bob = out.indexOf('Bob');
  assert.ok(alice >= 0 && carol >= 0 && bob >= 0);
  assert.ok(alice < carol && carol < bob, 'rows ordered by niceness descending');
});

test('renderTeamCard: crowns the kindest and spoons the harshest', () => {
  const out = renderTeamCard(TEAM);
  assert.match(out, /👑 kindest: Alice/);
  assert.match(out, /🥄 wooden spoon: Bob/);
  // the crown sits on Alice's row, the spoon on Bob's
  const rows = out.split('\n');
  assert.ok(rows.find(l => l.includes('👑') && l.includes('Alice')));
  assert.ok(rows.find(l => l.includes('🥄') && l.includes('Bob')));
});

test('renderTeamCard: ties broken by pleases+thanks', () => {
  const out = renderTeamCard([
    makeCard({ displayName: 'Quiet', persona: 'A', niceness: 50, pleases: 2, thanks: 2 }),
    makeCard({ displayName: 'Grateful', persona: 'B', niceness: 50, pleases: 10, thanks: 5 }),
  ]);
  assert.match(out, /👑 kindest: Grateful/);
  assert.match(out, /🥄 wooden spoon: Quiet/);
});

test('renderTeamCard: shows score, pleases, and f-bombs columns', () => {
  const out = renderTeamCard(TEAM);
  assert.match(out, /pleases/);
  assert.match(out, /f-bombs/);
  assert.match(out, /92\/100/);
  assert.match(out, /410/);
  assert.match(out, /41/);
});

test('renderTeamCard: team aggregate persona from the average niceness', () => {
  const out = renderTeamCard(TEAM);
  // (12 + 92 + 55) / 3 = 53
  assert.match(out, /Team persona: .+ \(avg 53\/100 across 3 humans\)/);
});

test('renderTeamCard: includes the hashtag and no transcript quotes', () => {
  const out = renderTeamCard(TEAM);
  assert.match(out, /#BeNiceToYourAI/);
  assert.doesNotMatch(out, /❝|❞|"/);
});
