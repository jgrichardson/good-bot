'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { SCALES, SCALE_META, FACES } = require('../scales.js');

const NEW_SCALES = ['office', 'succession', 'swfilms', 'marvel', 'parks'];

test('all 5 new pop-culture scales are registered', () => {
  for (const name of NEW_SCALES) {
    assert.ok(SCALES[name], `SCALES missing ${name}`);
    assert.ok(SCALE_META[name], `SCALE_META missing ${name}`);
  }
});

test('each new scale has at least 7 personas (granularity for fractional indexing)', () => {
  for (const name of NEW_SCALES) {
    assert.ok(SCALES[name].length >= 7, `${name} has only ${SCALES[name].length} personas`);
  }
});

test('each persona has the required shape', () => {
  for (const name of NEW_SCALES) {
    for (const persona of SCALES[name]) {
      assert.strictEqual(typeof persona.name, 'string', `${name}: bad name`);
      assert.ok(persona.name.length > 0, `${name}: empty name`);
      assert.strictEqual(typeof persona.emoji, 'string', `${name}: bad emoji on ${persona.name}`);
      assert.ok(['happy', 'neutral', 'mean'].includes(persona.face),
        `${name}: bad face "${persona.face}" on ${persona.name}`);
      assert.strictEqual(typeof persona.tag, 'string', `${name}: bad tag on ${persona.name}`);
      assert.strictEqual(typeof persona.blurb, 'string', `${name}: bad blurb on ${persona.name}`);
      assert.ok(persona.blurb.length > 30, `${name}: thin blurb on ${persona.name}`);
    }
  }
});

test('each new scale has SCALE_META title + endpoint labels', () => {
  for (const name of NEW_SCALES) {
    const meta = SCALE_META[name];
    assert.strictEqual(typeof meta.title, 'string');
    assert.ok(meta.title.length > 10);
    assert.ok(Array.isArray(meta.ends));
    assert.strictEqual(meta.ends.length, 2);
    assert.ok(meta.ends.every(e => typeof e === 'string'));
  }
});

test('faces are monotonic: happy precedes neutral precedes mean', () => {
  // Each scale lists nicest→meanest; faces should track that ordering
  // (i.e. no `mean` then `happy` then `mean` zigzag).
  const order = { happy: 0, neutral: 1, mean: 2 };
  for (const name of NEW_SCALES) {
    let last = -1;
    for (const persona of SCALES[name]) {
      const v = order[persona.face];
      assert.ok(v >= last, `${name}: ${persona.name} (${persona.face}) regresses from ${last}`);
      last = v;
    }
  }
});

test('no duplicate persona names within a scale', () => {
  for (const name of NEW_SCALES) {
    const seen = new Set();
    for (const persona of SCALES[name]) {
      assert.ok(!seen.has(persona.name), `${name}: duplicate ${persona.name}`);
      seen.add(persona.name);
    }
  }
});

test('FACES export shape unchanged', () => {
  assert.ok(FACES.happy && FACES.neutral && FACES.mean);
  for (const k of Object.keys(FACES)) assert.strictEqual(FACES[k].length, 4);
});
