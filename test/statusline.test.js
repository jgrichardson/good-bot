'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  nicenessMeter, buildStatuslineLine, readStatuslineCache, writeStatuslineCache,
  STATUSLINE_CACHE_PATH, STATUSLINE_TTL_MS, personaForNiceness,
} = require('../niceness.js');

const CLI = path.join(__dirname, '..', 'niceness.js');
const KEY = { scale: 'people', source: 'all' };

function freshCache(over) {
  return Object.assign({
    v: 1, ts: Date.now(), scale: 'people', source: 'all',
    persona: { name: 'Mr. Rogers', emoji: '🧥' }, niceness: 92,
  }, over || {});
}

// Spawn the CLI with HOME pointed at a temp dir so neither the real cache
// nor real transcripts are ever touched.
function runStatusline(home, extraArgs) {
  return spawnSync(process.execPath, [CLI, '--statusline', '--no-color'].concat(extraArgs || []), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { HOME: home }),
    cwd: home,
    timeout: 30000,
  });
}

// ---- the meter + the line --------------------------------------------------

test('nicenessMeter: 3 segments, thirds fill green/yellow/red', () => {
  assert.strictEqual(nicenessMeter(100), '🟩🟩🟩');
  assert.strictEqual(nicenessMeter(92), '🟩🟩🟨');
  assert.strictEqual(nicenessMeter(50), '🟩🟨🟥');
  assert.strictEqual(nicenessMeter(10), '🟥🟥🟥');
  assert.strictEqual(nicenessMeter(0), '🟥🟥🟥');
});

test('nicenessMeter: degenerate input stays a 3-char meter', () => {
  for (const v of [null, undefined, -5, 250, NaN]) {
    assert.strictEqual(Array.from(nicenessMeter(v)).length, 3);
  }
});

test('buildStatuslineLine: emoji · name · score · meter, one line, no ANSI with noColor', () => {
  const line = buildStatuslineLine({ name: 'Mr. Rogers', emoji: '🧥' }, 92, { noColor: true });
  assert.strictEqual(line, '🧥 Mr. Rogers · 92/100 · 🟩🟩🟨');
  assert.ok(!line.includes('\n'));
  assert.ok(!/\x1b\[/.test(line));
});

// ---- cache read/write semantics ---------------------------------------------

test('statusline cache: fresh entry round-trips; stale, mismatched, corrupt → null', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-sl-cache-'));
  const file = path.join(tmp, 'statusline.json');
  try {
    // fresh
    assert.ok(writeStatuslineCache(freshCache(), file));
    const hit = readStatuslineCache(KEY, file);
    assert.ok(hit);
    assert.strictEqual(hit.persona.name, 'Mr. Rogers');
    assert.strictEqual(hit.niceness, 92);
    // expired (one minute past the 6h TTL)
    writeStatuslineCache(freshCache({ ts: Date.now() - STATUSLINE_TTL_MS - 60000 }), file);
    assert.strictEqual(readStatuslineCache(KEY, file), null);
    // wrong scale / wrong source are cache misses, not stale hits
    writeStatuslineCache(freshCache({ scale: 'spice' }), file);
    assert.strictEqual(readStatuslineCache(KEY, file), null);
    writeStatuslineCache(freshCache({ source: 'codex' }), file);
    assert.strictEqual(readStatuslineCache(KEY, file), null);
    // corrupt / missing / malformed shapes never throw
    fs.writeFileSync(file, '{ not json');
    assert.strictEqual(readStatuslineCache(KEY, file), null);
    assert.strictEqual(readStatuslineCache(KEY, path.join(tmp, 'nope.json')), null);
    fs.writeFileSync(file, JSON.stringify({ v: 99, ts: Date.now() }));
    assert.strictEqual(readStatuslineCache(KEY, file), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('STATUSLINE_CACHE_PATH lives in the ~/.good-bot state dir', () => {
  assert.match(STATUSLINE_CACHE_PATH, /\.good-bot/);
  assert.match(STATUSLINE_CACHE_PATH, /statusline\.json$/);
});

// ---- E2E: the fast path never scans transcripts ------------------------------

test('CLI --statusline: fresh cache → exact cached line, zero transcript reads', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-sl-fast-'));
  try {
    fs.mkdirSync(path.join(tmp, '.good-bot'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.good-bot', 'statusline.json'), JSON.stringify(freshCache()));
    const t0 = Date.now();
    const r = runStatusline(tmp);
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 0);
    // The temp HOME has NO transcripts: a recompute would print the fallback
    // line, so this exact match proves the cache fast path was taken.
    assert.strictEqual(r.stdout.trim(), '🧥 Mr. Rogers · 92/100 · 🟩🟩🟨');
    assert.strictEqual(r.stdout.trim().split('\n').length, 1, 'exactly one stdout line');
    // Generous CI bound — the real target is <150ms (node startup dominates).
    assert.ok(elapsed < 3000, `fast path took ${elapsed}ms`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI --statusline: expired cache recomputes from transcripts and re-caches', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-sl-ttl-'));
  try {
    // A stale cache with a sentinel persona we must NOT see again…
    fs.mkdirSync(path.join(tmp, '.good-bot'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.good-bot', 'statusline.json'), JSON.stringify(freshCache({
      ts: Date.now() - STATUSLINE_TTL_MS - 60000,
      persona: { name: 'Stale Cache Bot', emoji: '🪦' }, niceness: 1,
    })));
    // …and a small, very polite Claude Code history to recompute from.
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    const lines = [];
    for (let i = 0; i < 12; i++) {
      lines.push(JSON.stringify({
        display: 'thank you so much, this looks wonderful — please keep going 🙏',
        timestamp: Date.UTC(2026, 4, 1 + i, 10, 0, 0),
        project: '/tmp/demo-project',
      }));
    }
    fs.writeFileSync(path.join(tmp, '.claude', 'history.jsonl'), lines.join('\n') + '\n');

    const r = runStatusline(tmp);
    assert.strictEqual(r.status, 0);
    const line = r.stdout.trim();
    assert.ok(!line.includes('Stale Cache Bot'), 'expired cache must not be served');
    assert.match(line, /^\S+.* · \d+\/100 · (?:🟩|🟨|🟥){3}$/u);

    // The recompute re-cached: file is fresh and carries the new persona…
    const cached = JSON.parse(fs.readFileSync(path.join(tmp, '.good-bot', 'statusline.json'), 'utf8'));
    assert.notStrictEqual(cached.persona.name, 'Stale Cache Bot');
    assert.ok(Date.now() - cached.ts < 60000, 'cache timestamp was refreshed');
    // …so a second run is a cache hit producing the identical line.
    const r2 = runStatusline(tmp);
    assert.strictEqual(r2.stdout.trim(), line);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI --statusline: cold start with no cache and no transcripts stays prompt-safe', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-sl-cold-'));
  try {
    const r = runStatusline(tmp);
    assert.strictEqual(r.status, 0, 'a broken prompt segment is worse than a missing score');
    assert.strictEqual(r.stdout.trim(), '🤖 good-bot · no transcripts yet');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI --statusline --demo: canned line, no cache written', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-sl-demo-'));
  try {
    const r = runStatusline(tmp, ['--demo']);
    assert.strictEqual(r.status, 0);
    const expected = buildStatuslineLine(personaForNiceness(92), 92, { noColor: true });
    assert.strictEqual(r.stdout.trim(), expected);
    assert.ok(!fs.existsSync(path.join(tmp, '.good-bot', 'statusline.json')),
      'demo runs must not pollute the real cache');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
