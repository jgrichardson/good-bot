'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { shouty, shoutyWordCount, scoreMessage, analyze } = require('../niceness.js');

// ---- shouty (whole-message) ----------------------------------------------

test('shouty: detects whole-message yelling', () => {
  assert.strictEqual(shouty('WHY IS THIS NOT WORKING'), true);
  assert.strictEqual(shouty('FIX IT RIGHT NOW PLEASE'), true);
});

test('shouty: ignores short words / one-letter messages', () => {
  assert.strictEqual(shouty('ok'), false);
  assert.strictEqual(shouty('OK'), false);
  assert.strictEqual(shouty('A'), false);
});

test('shouty: ignores mostly-lower messages with one CAPS word', () => {
  assert.strictEqual(shouty('please fix this NOW'), false);
});

// ---- shoutyWordCount (per-word) -----------------------------------------

test('shoutyWordCount: counts standalone CAPS words ≥3 letters', () => {
  assert.strictEqual(shoutyWordCount('fix this NOW please'), 1);
  assert.strictEqual(shoutyWordCount('please STOP IGNORING me'), 2);
  assert.strictEqual(shoutyWordCount('WHY are you doing it like THAT'), 2);
});

test('shoutyWordCount: excludes common tech acronyms', () => {
  assert.strictEqual(shoutyWordCount('hit the API endpoint'), 0);
  assert.strictEqual(shoutyWordCount('the URL is wrong'), 0);
  assert.strictEqual(shoutyWordCount('parse the JSON and pipe to SQL'), 0);
  assert.strictEqual(shoutyWordCount('use CSS, HTML, JSON, XML'), 0);
  assert.strictEqual(shoutyWordCount('OK, LGTM'), 0);
});

test('shoutyWordCount: caps at 5 even for runaway messages', () => {
  const angry = 'STOP STOP STOP STOP STOP STOP STOP STOP STOP STOP STOP STOP';
  assert.strictEqual(shoutyWordCount(angry), 5);
});

test('shoutyWordCount: ignores 2-letter words (too short to be shouting)', () => {
  assert.strictEqual(shoutyWordCount('go GO go'), 0);
});

test('shoutyWordCount: handles empty / null input gracefully', () => {
  assert.strictEqual(shoutyWordCount(''), 0);
  assert.strictEqual(shoutyWordCount(null), 0);
  assert.strictEqual(shoutyWordCount(undefined), 0);
});

// ---- scoring weight ------------------------------------------------------

test('scoreMessage: whole-message shouting contributes +3 mean', () => {
  const calm = scoreMessage('fix this please');
  const yelling = scoreMessage('FIX THIS PLEASE NOW');
  assert.ok(yelling.mean >= calm.mean + 3, `expected +3 mean, calm=${calm.mean} yelling=${yelling.mean}`);
});

test('scoreMessage: standalone CAPS word contributes +1 mean each', () => {
  const calm = scoreMessage('please fix this bug');
  const oneCaps = scoreMessage('please fix this BUG');
  assert.strictEqual(oneCaps.mean, calm.mean + 1, `expected +1 mean for one CAPS word`);
  const twoCaps = scoreMessage('please FIX this BUG');
  assert.strictEqual(twoCaps.mean, calm.mean + 2, `expected +2 mean for two CAPS words`);
});

test('scoreMessage: tech acronym does NOT contribute', () => {
  const baseline = scoreMessage('please check this');
  const withAcronym = scoreMessage('please check the API');
  assert.strictEqual(withAcronym.mean, baseline.mean, `API shouldn't count as shouting`);
});

test('scoreMessage: shoutWords field is exposed', () => {
  const r = scoreMessage('please STOP doing THAT NOW');
  assert.strictEqual(r.shoutWords, 3);
});

// ---- aggregation surfaces shouts in stats -------------------------------

test('analyze: aggregates shouts + shoutWords across messages', () => {
  const items = [
    { text: 'thanks for the help', ts: '2026-01-01T00:00:00Z' },          // 0 / 0
    { text: 'WHY ARE YOU DOING IT LIKE THIS', ts: '2026-01-02T00:00:00Z' }, // 1 / 5 (capped)
    { text: 'please FIX this NOW', ts: '2026-01-03T00:00:00Z' },           // 0 / 2
  ];
  const a = analyze(items);
  assert.strictEqual(a.stats.shouts, 1, 'one whole-message shout');
  // shoutWords aggregates across all messages: 5 (capped) + 2 = 7
  assert.strictEqual(a.stats.shoutWords, 7, 'expected 5 + 2 = 7 CAPS words');
});

// ---- regression: legacy shouty test still passes ------------------------

test('regression: pre-existing shouty test still works', () => {
  assert.equal(shouty('WHY IS THIS NOT WORKING'), true);
  assert.equal(shouty('ok'), false);
});
