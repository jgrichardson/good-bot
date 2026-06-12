'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  GRID_TONE_EMOJI, isoWeekLabel, gridDayTone, buildGridDays, gridBrag, buildGridBlock,
} = require('../niceness.js');

const PERSONA = { name: 'Mr. Rogers', emoji: '🧥' };

// Synthetic record helper: a message at local (y, m, d, hour) with a mood.
function rec(y, m, d, hour, mood) {
  return { ts: new Date(y, m - 1, d, hour, 0, 0).toISOString(), mood };
}

test('isoWeekLabel: mid-year date lands in the right ISO week', () => {
  assert.strictEqual(isoWeekLabel(new Date(2026, 5, 12)), '2026-W24');
});

test('isoWeekLabel: Jan 1 of a Thursday-start year is week 1', () => {
  assert.strictEqual(isoWeekLabel(new Date(2026, 0, 1)), '2026-W01');
});

test('isoWeekLabel: year boundary belongs to the previous ISO year', () => {
  // Jan 1 2027 is a Friday → still ISO week 53 of 2026.
  assert.strictEqual(isoWeekLabel(new Date(2027, 0, 1)), '2026-W53');
});

test('gridDayTone: no records is none (⬜)', () => {
  assert.strictEqual(gridDayTone([]), 'none');
  assert.strictEqual(gridDayTone(null), 'none');
});

test('gridDayTone: all-positive day is warm', () => {
  assert.strictEqual(gridDayTone([{ mood: 1 }, { mood: 2 }, { mood: 1 }]), 'warm');
});

test('gridDayTone: negative-majority day is harsh', () => {
  assert.strictEqual(gridDayTone([{ mood: -1 }, { mood: -2 }, { mood: 1 }]), 'harsh');
});

test('gridDayTone: warm day with too much harshness reads mixed', () => {
  // 3 warm + 1 harsh = 25% harsh > the 15% warm bar → mixed.
  assert.strictEqual(gridDayTone([{ mood: 1 }, { mood: 1 }, { mood: 1 }, { mood: -1 }]), 'mixed');
});

test('gridDayTone: all-neutral day reads mixed, not warm', () => {
  assert.strictEqual(gridDayTone([{ mood: 0 }, { mood: 0 }]), 'mixed');
});

test('buildGridDays: maps the last 7 calendar days oldest → newest with ⬜ gaps', () => {
  const records = [
    rec(2026, 6, 8, 12, 1), rec(2026, 6, 8, 13, 2),     // Jun 8: warm
    rec(2026, 6, 10, 12, -1), rec(2026, 6, 10, 13, -2), // Jun 10: harsh
    rec(2026, 6, 12, 12, 1), rec(2026, 6, 12, 13, -1),  // Jun 12: mixed
  ];
  const { tones, anchor } = buildGridDays(records);
  assert.strictEqual(tones.length, 7);
  // Window: Jun 6 … Jun 12 (anchored at the most recent active day).
  assert.deepStrictEqual(tones, ['none', 'none', 'warm', 'none', 'harsh', 'none', 'mixed']);
  assert.strictEqual(anchor.getDate(), 12);
  assert.strictEqual(anchor.getMonth(), 5);
});

test('buildGridDays: timestamp-free history is a full ⬜ row with no anchor', () => {
  const { tones, anchor } = buildGridDays([{ mood: 1 }, { ts: 'not-a-date', mood: -1 }]);
  assert.deepStrictEqual(tones, new Array(7).fill('none'));
  assert.strictEqual(anchor, null);
});

test('buildGridDays: honors a custom day count', () => {
  const { tones } = buildGridDays([rec(2026, 6, 12, 12, 1)], 3);
  assert.deepStrictEqual(tones, ['none', 'none', 'warm']);
});

test('gridBrag: clean record brags about zero f-bombs', () => {
  const b = gridBrag({ messages: 1820, pleases: 410, thanks: 372, fbombs: 0 });
  assert.match(b, /0 f-bombs/);
  assert.match(b, /1\.8k messages/);
});

test('gridBrag: spicy record falls back to niceties, then messages', () => {
  assert.match(gridBrag({ messages: 500, pleases: 9, thanks: 4, fbombs: 41 }), /13 niceties/);
  assert.match(gridBrag({ messages: 50, pleases: 0, thanks: 0, fbombs: 2 }), /50 messages/);
  assert.strictEqual(gridBrag({ messages: 0 }), null);
  assert.strictEqual(gridBrag(null), null);
});

test('buildGridBlock: header + emoji row + brag, plain text only', () => {
  const records = [rec(2026, 6, 12, 12, 1), rec(2026, 6, 12, 13, 2)];
  const block = buildGridBlock(PERSONA, records, { messages: 200, pleases: 40, thanks: 30, fbombs: 0 });
  const lines = block.split('\n');
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[0], 'good-bot week 2026-W24 · 🧥 Mr. Rogers');
  assert.strictEqual(lines[1], '⬜⬜⬜⬜⬜⬜🟩');
  assert.match(lines[2], /0 f-bombs/);
  assert.doesNotMatch(block, /\x1b\[/);            // spoiler-free AND ANSI-free
});

test('buildGridBlock: emoji row uses only the four grid glyphs', () => {
  const records = [
    rec(2026, 6, 9, 12, -1), rec(2026, 6, 11, 12, 1), rec(2026, 6, 12, 12, 0),
  ];
  const row = buildGridBlock(PERSONA, records, null).split('\n')[1];
  assert.strictEqual(row, '⬜⬜⬜🟥⬜🟩🟨');
  for (const g of ['🟩', '🟨', '🟥', '⬜']) assert.ok(Object.values(GRID_TONE_EMOJI).includes(g));
});

test('buildGridBlock: persona without emoji renders cleanly', () => {
  const block = buildGridBlock({ name: 'Spock' }, [], null);
  assert.match(block.split('\n')[0], /good-bot week \d{4}-W\d{2} · Spock$/);
  assert.doesNotMatch(block, /undefined/);
});
