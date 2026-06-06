'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildExportRecord, readCardJson, renderCompare,
} = require('../niceness.js');

function makeCard(name, niceness, stats = {}, opts = {}) {
  return {
    schemaVersion: 1,
    exportedAt: '2026-06-06T00:00:00Z',
    displayName: opts.displayName || null,
    scale: opts.scale || 'people',
    persona: { name, emoji: opts.emoji || '🤖', face: opts.face || 'happy', tag: opts.tag || null },
    niceness,
    stats: { messages: 100, pleases: 10, thanks: 8, fbombs: 0, shouts: 0, ...stats },
    span: '2026-05-01 → 2026-06-01',
  };
}

test('buildExportRecord: shape sanity', () => {
  const card = { persona: { name: 'Mr. Rogers', emoji: '🧥', face: 'happy', tag: 'hey' } };
  const stats = { messages: 50, pleases: 12, thanks: 7, fbombs: 0, shouts: 0 };
  const rec = buildExportRecord(card, 92, 'people', '2026-01 → 2026-06', stats, 'Greg');
  assert.strictEqual(rec.schemaVersion, 1);
  assert.strictEqual(rec.displayName, 'Greg');
  assert.strictEqual(rec.scale, 'people');
  assert.strictEqual(rec.persona.name, 'Mr. Rogers');
  assert.strictEqual(rec.niceness, 92);
  assert.deepStrictEqual(rec.stats, stats);
});

test('buildExportRecord: null displayName when not provided', () => {
  const card = { persona: { name: 'Spock' } };
  const rec = buildExportRecord(card, 50, 'trek', null, {});
  assert.strictEqual(rec.displayName, null);
  assert.strictEqual(rec.niceness, 50);
});

test('buildExportRecord: rounds non-integer niceness', () => {
  const rec = buildExportRecord({ persona: { name: 'A' } }, 87.6, 'people', null, {});
  assert.strictEqual(rec.niceness, 88);
});

test('readCardJson: round-trip from buildExportRecord', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-card-'));
  const file = path.join(tmp, 'card.json');
  const rec = buildExportRecord({ persona: { name: 'Rogers', emoji: '🧥' } }, 95, 'people', null, { messages: 1, pleases: 1, thanks: 1, fbombs: 0, shouts: 0 });
  fs.writeFileSync(file, JSON.stringify(rec));
  const back = readCardJson(file);
  assert.strictEqual(back.persona.name, 'Rogers');
  assert.strictEqual(back.niceness, 95);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('readCardJson: rejects file lacking persona.name', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-card-'));
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, JSON.stringify({ niceness: 50 }));
  assert.throws(() => readCardJson(file), /not a good-bot card/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('readCardJson: rejects file lacking niceness number', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-card-'));
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, JSON.stringify({ persona: { name: 'X' } }));
  assert.throws(() => readCardJson(file), /missing niceness/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('renderCompare: higher niceness wins', () => {
  const a = makeCard('Mr. Rogers', 92);
  const b = makeCard('Darth Vader', 14);
  const r = renderCompare(a, b);
  assert.strictEqual(r.aWins, true);
  assert.strictEqual(r.bWins, false);
  assert.strictEqual(r.tie, false);
  assert.strictEqual(r.winnerName, 'Mr. Rogers');
  assert.match(r.text, /WINNER: Mr\. Rogers/);
  assert.match(r.text, /by 78\/100/);
});

test('renderCompare: ties broken by pleases + thanks total', () => {
  const a = makeCard('A', 50, { pleases: 20, thanks: 5 });
  const b = makeCard('B', 50, { pleases: 10, thanks: 5 });
  const r = renderCompare(a, b);
  assert.strictEqual(r.aWins, true);
  assert.strictEqual(r.tie, false);
  assert.strictEqual(r.winnerName, 'A');
});

test('renderCompare: true tie if all tie-breakers equal', () => {
  const a = makeCard('A', 50, { pleases: 5, thanks: 5 });
  const b = makeCard('B', 50, { pleases: 5, thanks: 5 });
  const r = renderCompare(a, b);
  assert.strictEqual(r.tie, true);
  assert.strictEqual(r.winnerName, null);
  assert.match(r.text, /TIE/);
});

test('renderCompare: displayName overrides persona name in headline', () => {
  const a = makeCard('A', 50, {}, { displayName: 'Alice' });
  const b = makeCard('B', 40, {}, { displayName: 'Bob' });
  const r = renderCompare(a, b);
  assert.strictEqual(r.winnerName, 'Alice');
  assert.match(r.text, /Alice/);
  assert.match(r.text, /Bob/);
});

test('renderCompare: text includes both personas + all stats rows', () => {
  const a = makeCard('Mr. Rogers', 92);
  const b = makeCard('Darth Vader', 14);
  const r = renderCompare(a, b);
  for (const row of ['persona', 'niceness', 'messages', 'pleases', 'thank-yous', 'f-bombs']) {
    assert.match(r.text, new RegExp(row), `missing row "${row}"`);
  }
});
