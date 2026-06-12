'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadScalePack, validateScalePack, normalizeScalePack } = require('../niceness.js');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'niceness.js');
const PACKS_DIR = path.join(ROOT, 'packs');

function tmpPack(content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-pack-')), 'pack.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

function goodPack(over) {
  return Object.assign({
    name: 'test-pack',
    title: 'TEST PACK · CARD',
    ends: ['  bad', ' good'],
    ladder: [
      { name: 'Saint', emoji: '😇', face: 'happy', tag: 'so nice', blurb: 'Genuinely kind to every machine it has ever met.' },
      { name: 'Citizen', emoji: '🙂', face: 'neutral', tag: 'fine', blurb: 'Perfectly civil, perfectly forgettable, perfectly fine.' },
      { name: 'Villain', emoji: '😈', face: 'mean', tag: 'so mean', blurb: 'The bot has filed several complaints, all ignored.' },
    ],
  }, over || {});
}

// ---- the two shipped packs --------------------------------------------------
test('both shipped packs in packs/ load and validate', () => {
  const files = fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= 2, `expected ≥2 shipped packs, found: ${files.join(', ')}`);
  for (const f of files) {
    const p = loadScalePack(path.join(PACKS_DIR, f));
    assert.ok(p.name, `${f}: pack name`);
    assert.ok(p.ladder.length >= 3, `${f}: ladder size`);
    assert.ok(p.meta.title.length > 10, `${f}: title`);
    assert.strictEqual(p.meta.ends.length, 2, `${f}: ends`);
    for (const persona of p.ladder) {
      assert.ok(persona.name, `${f}: persona name`);
      assert.ok(['happy', 'neutral', 'mean'].includes(persona.face), `${f}: face on ${persona.name}`);
      assert.ok(persona.blurb.length > 30, `${f}: thin blurb on ${persona.name}`);
    }
    // ladder reads nicest → meanest: faces never zigzag back to happy
    const order = { happy: 0, neutral: 1, mean: 2 };
    let prev = 0;
    for (const persona of p.ladder) {
      assert.ok(order[persona.face] >= prev, `${f}: face zigzag at ${persona.name}`);
      prev = order[persona.face];
    }
  }
});

// ---- loader + validation -----------------------------------------------------
test('loadScalePack: a good pack loads and normalizes', () => {
  const p = loadScalePack(tmpPack(goodPack()));
  assert.strictEqual(p.name, 'test-pack');
  assert.strictEqual(p.ladder.length, 3);
  assert.strictEqual(p.ladder[0].name, 'Saint');
  assert.strictEqual(p.meta.title, 'TEST PACK · CARD');
  assert.deepStrictEqual(p.meta.ends, ['  bad', ' good']);
});

test('loadScalePack: missing file errors kindly (no stack trace, points at packs/)', () => {
  assert.throws(() => loadScalePack('/nope/missing-pack.json'),
    e => /could not read scale pack/.test(e.message) && /packs\//.test(e.message));
});

test('loadScalePack: broken JSON errors kindly and points at packs/README.md', () => {
  assert.throws(() => loadScalePack(tmpPack('{ not json !!!')),
    e => /not valid JSON/.test(e.message) && /packs\/README\.md/.test(e.message));
});

test('loadScalePack: invalid pack lists every problem by field name', () => {
  const bad = goodPack({ name: 'Bad Name!', ladder: [{ emoji: 3 }, { name: 'Ok', face: 'grumpy' }] });
  assert.throws(() => loadScalePack(tmpPack(bad)), e =>
    /problems/.test(e.message) &&
    /"name" must be a lowercase slug/.test(e.message) &&
    /needs at least 3 personas/.test(e.message) &&
    /packs\/README\.md/.test(e.message));
});

test('validateScalePack: non-object, missing ladder, bad face, long name', () => {
  assert.ok(validateScalePack(null).length === 1);
  assert.ok(validateScalePack([]).length === 1);
  assert.ok(validateScalePack({ name: 'x' }).some(e => /"ladder" is required/.test(e)));
  const badFace = goodPack();
  badFace.ladder[1] = { name: 'Grump', face: 'grumpy' };
  assert.ok(validateScalePack(badFace).some(e => /ladder\[1\] \("Grump"\): "face" must be one of happy \| neutral \| mean/.test(e)));
  const longName = goodPack();
  longName.ladder[0].name = 'X'.repeat(41);
  assert.ok(validateScalePack(longName).some(e => /too long/.test(e)));
  assert.deepStrictEqual(validateScalePack(goodPack()), []);
});

test('validateScalePack: ends must be exactly 2 strings; title must be a string', () => {
  assert.ok(validateScalePack(goodPack({ ends: ['only-one'] })).some(e => /"ends"/.test(e)));
  assert.ok(validateScalePack(goodPack({ ends: ['a', 2] })).some(e => /"ends"/.test(e)));
  assert.ok(validateScalePack(goodPack({ title: 42 })).some(e => /"title"/.test(e)));
});

test('normalizeScalePack: fills emoji, face-by-position, tag, and blurb defaults', () => {
  const p = normalizeScalePack({
    name: 'mini',
    ladder: [{ name: 'Top' }, { name: 'Mid', tag: 'meh' }, { name: 'Low' }],
  });
  assert.strictEqual(p.ladder[0].emoji, '🤖');
  assert.strictEqual(p.ladder[0].face, 'happy');         // top of the ladder smiles
  assert.strictEqual(p.ladder[1].face, 'neutral');
  assert.strictEqual(p.ladder[2].face, 'mean');           // bottom scowls
  assert.strictEqual(p.ladder[1].blurb, 'meh');            // blurb falls back to tag
  assert.ok(p.ladder[2].blurb.length > 0);                  // …or a generic line
  assert.strictEqual(p.meta.title, 'HOW NICE ARE YOU TO YOUR AI? · CUSTOM CARD');
  assert.deepStrictEqual(p.meta.ends, ['meanest', ' nicest']);
});

// ---- CLI integration ----------------------------------------------------------
test('CLI: --scale-pack <pack> --demo renders every rank of the custom ladder', () => {
  const r = spawnSync(process.execPath, [CLI, '--scale-pack', path.join(PACKS_DIR, 'cosmic-entities.json'), '--demo', '--no-copy'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /The Benevolent Sun/i);     // card uppercases names
  assert.match(r.stdout, /Heat Death of the Universe/i);
  assert.match(r.stdout, /WHAT COSMIC ENTITY ARE YOU TO YOUR AI\?/);
});

test('CLI: a bad pack exits 1 with the kind error on stderr', () => {
  const file = tmpPack({ name: 'broken', ladder: [{ name: 'Solo' }] });
  const r = spawnSync(process.execPath, [CLI, '--scale-pack', file, '--demo', '--no-copy'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /needs at least 3 personas/);
  assert.match(r.stderr, /packs\/README\.md/);
  assert.doesNotMatch(r.stderr, /at Object|at Module/); // kind error, not a stack trace
});

test('CLI: --scale-pack with no file exits 1 with usage help', () => {
  const r = spawnSync(process.execPath, [CLI, '--scale-pack', '--demo'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--scale-pack needs a JSON pack file/);
});
