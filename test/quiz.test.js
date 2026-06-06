'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  QUIZ_QUESTIONS, scoreQuizAnswers, personaFromQuizFrac, SCALES, SCALE,
} = require('../niceness.js');

test('quiz has 7 questions, each with 4 options', () => {
  assert.strictEqual(QUIZ_QUESTIONS.length, 7);
  for (const q of QUIZ_QUESTIONS) {
    assert.strictEqual(typeof q.q, 'string');
    assert.ok(q.q.length > 5);
    assert.strictEqual(q.options.length, 4);
    for (const [label, weight] of q.options) {
      assert.strictEqual(typeof label, 'string');
      assert.ok(label.length > 0);
      assert.strictEqual(typeof weight, 'number');
      assert.ok(weight >= 0 && weight <= 1);
    }
  }
});

test('option weights monotonically increase nicest→meanest', () => {
  for (const q of QUIZ_QUESTIONS) {
    const weights = q.options.map(o => o[1]);
    for (let i = 1; i < weights.length; i++) {
      assert.ok(weights[i] >= weights[i - 1], `non-monotonic on "${q.q}": ${weights.join(',')}`);
    }
  }
});

test('all-A answers score very nice (low frac)', () => {
  const r = scoreQuizAnswers('AAAAAAA');
  assert.ok(r.frac < 0.2, `expected low frac, got ${r.frac}`);
  assert.ok(r.niceness > 80, `expected niceness > 80, got ${r.niceness}`);
  assert.strictEqual(r.letters, 'AAAAAAA');
  assert.strictEqual(r.detail.length, 7);
});

test('all-D answers score very mean (high frac)', () => {
  const r = scoreQuizAnswers('DDDDDDD');
  assert.ok(r.frac > 0.85, `expected high frac, got ${r.frac}`);
  assert.ok(r.niceness < 15, `expected niceness < 15, got ${r.niceness}`);
});

test('mixed answers land in the middle', () => {
  const r = scoreQuizAnswers('ABCDABC');
  assert.ok(r.frac > 0.25 && r.frac < 0.75, `expected middle, got ${r.frac}`);
});

test('case-insensitive and tolerates whitespace/punctuation', () => {
  const a = scoreQuizAnswers('a-b c,D A B C');
  assert.strictEqual(a.letters, 'ABCDABC');
  assert.ok(!a.error);
});

test('rejects wrong-length input', () => {
  const r = scoreQuizAnswers('ABC');
  assert.ok(r.error);
  assert.match(r.error, /7 answers/);
});

test('rejects out-of-set letters', () => {
  const r = scoreQuizAnswers('ABCDEFG');
  assert.ok(r.error, `expected error on E/F/G`);
});

test('accepts array-of-numeric-indices form', () => {
  const r = scoreQuizAnswers([0, 0, 0, 0, 0, 0, 0]);
  assert.ok(!r.error);
  assert.strictEqual(r.letters, 'AAAAAAA');
});

test('accepts array-of-letter form', () => {
  const r = scoreQuizAnswers(['a', 'B', 'c', 'D', 'A', 'B', 'C']);
  assert.ok(!r.error);
  assert.strictEqual(r.letters, 'ABCDABC');
});

test('personaFromQuizFrac maps fraction to scale index', () => {
  const nice = personaFromQuizFrac(0.0);
  assert.strictEqual(nice.idx, 0);
  assert.strictEqual(nice.persona.name, SCALE[0].name);

  const mean = personaFromQuizFrac(0.99);
  assert.strictEqual(mean.idx, SCALE.length - 1);

  const mid = personaFromQuizFrac(0.5);
  assert.ok(mid.idx >= 0 && mid.idx < SCALE.length);
});

test('quiz scoring round-trip: nicest answers → nicest persona', () => {
  const { frac } = scoreQuizAnswers('AAAAAAA');
  const { persona } = personaFromQuizFrac(frac);
  // Should be in the upper-nice half (front of the scale)
  const idx = SCALE.findIndex(p => p.name === persona.name);
  assert.ok(idx < SCALE.length / 2, `expected nice-half persona, got idx ${idx} (${persona.name})`);
});

test('quiz scoring round-trip: meanest answers → meanest persona', () => {
  const { frac } = scoreQuizAnswers('DDDDDDD');
  const { persona } = personaFromQuizFrac(frac);
  const idx = SCALE.findIndex(p => p.name === persona.name);
  assert.ok(idx >= SCALE.length / 2, `expected mean-half persona, got idx ${idx} (${persona.name})`);
});
