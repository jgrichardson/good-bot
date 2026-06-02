'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  sanitize, extractTexts, scoreMessage, shouty, analyze,
  scaleIndex, parseLabeled, matchPersona, cleanExhibit, PERSONAS, SPICE,
} = require('../niceness.js');

// ---- redaction: the privacy guarantee ----------------------------------
test('sanitize redacts emails, links, paths, secrets, ips, phones, numbers', () => {
  const cases = [
    ['ping me at jane.doe@acme.com', '[email]'],
    ['see https://internal.acme.com/x?token=1', '[link]'],
    ['open /Users/greg/secret/plan.md now', '[path]'],
    ['key sk-abcdef0123456789abcdef', '[secret]'],
    ['token ghp_ABCDEFGHIJKLMNOPQRST012345', '[secret]'],
    ['server at 10.0.12.34 is down', '[ip]'],
    ['call 415-555-1234 today', '[phone]'],
    ['the fund did $4,200,000 last year', '[amount]'],
    ['invoice 1234567 is overdue', '[number]'],
  ];
  for (const [input, marker] of cases) {
    assert.ok(sanitize(input).includes(marker), `expected ${marker} in: ${input}`);
  }
});

test('sanitize never leaks the original secret value', () => {
  const out = sanitize('my key is sk-abcdef0123456789abcdef and email a@b.com');
  assert.ok(!out.includes('sk-abcdef0123456789abcdef'));
  assert.ok(!out.includes('a@b.com'));
});

// ---- message extraction: only the human's words -------------------------
test('extractTexts keeps plain user strings', () => {
  assert.deepStrictEqual(
    extractTexts({ type: 'user', message: { content: 'please fix the bug' } }),
    ['please fix the bug'],
  );
});

test('extractTexts drops tool results, meta, and non-user entries', () => {
  assert.deepStrictEqual(extractTexts({ type: 'assistant', message: { content: 'hi' } }), []);
  assert.deepStrictEqual(extractTexts({ type: 'user', isMeta: true, message: { content: 'x' } }), []);
  assert.deepStrictEqual(
    extractTexts({ type: 'user', message: { content: [{ type: 'tool_result', content: 'big output' }] } }),
    [],
  );
});

test('extractTexts strips system-reminders and command/tool wrappers', () => {
  assert.deepStrictEqual(
    extractTexts({ type: 'user', message: { content: '<bash-stdout>noise</bash-stdout>' } }),
    [],
  );
  assert.deepStrictEqual(
    extractTexts({ type: 'user', message: { content: 'do the thing <system-reminder>ignore me</system-reminder>' } }),
    ['do the thing'],
  );
});

test('extractTexts ignores the tool\'s own logged output', () => {
  const selfText = "You are grading how kindly a software engineer treats their AI coding\nassistant, judging ONLY from the engineer's own typed messages below.";
  assert.deepStrictEqual(extractTexts({ type: 'user', message: { content: selfText } }), []);
});

// ---- scoring ------------------------------------------------------------
test('scoreMessage detects niceness and meanness', () => {
  assert.ok(scoreMessage('thank you so much, please').nice > 0);
  assert.ok(scoreMessage('this is stupid and useless garbage').mean > 0);
});

test('shouty flags all-caps yelling, not short words', () => {
  assert.equal(shouty('WHY IS THIS NOT WORKING'), true);
  assert.equal(shouty('ok'), false);
});

test('analyze aggregates counts across messages', () => {
  const a = analyze(['please do it', 'thanks!', 'this is fucking broken']);
  assert.equal(a.stats.messages, 3);
  assert.equal(a.stats.pleases, 1);
  assert.equal(a.stats.thanks, 1);
  assert.equal(a.stats.fbombs, 1);
  assert.ok(a.niceness >= 0 && a.niceness <= 100);
});

// ---- rank selection -----------------------------------------------------
test('scaleIndex puts saints near the nice end and tyrants near the mean end', () => {
  const saint = { niceness: 95, fbombRate: 0, capsRate: 0, meanRate: 0, apologyRate: 0.1, thanksRate: 0.3, pleaseRate: 0.3, hash: 0 };
  const tyrant = { niceness: 5, fbombRate: 0.2, capsRate: 0.2, meanRate: 0.8, apologyRate: 0, thanksRate: 0, pleaseRate: 0, hash: 0 };
  assert.ok(scaleIndex(saint, PERSONAS.length) <= 3);
  assert.ok(scaleIndex(tyrant, PERSONAS.length) >= PERSONAS.length - 3);
});

test('scaleIndex stays in bounds for both scales', () => {
  for (const size of [PERSONAS.length, SPICE.length]) {
    for (const niceness of [0, 50, 100]) {
      const idx = scaleIndex({ niceness, fbombRate: 0, capsRate: 0, meanRate: 0, apologyRate: 0, thanksRate: 0, pleaseRate: 0, hash: 7 }, size);
      assert.ok(idx >= 0 && idx < size);
    }
  }
});

// ---- LLM response parsing (only used by opt-in --ai) --------------------
test('parseLabeled parses a well-formed response and rejects garbage', () => {
  const ok = parseLabeled('PERSONA: Switzerland\nVERDICT: All business.\nASSESSMENT: Neutral and efficient.\nEXHIBIT: do it\nEXHIBIT: fix it');
  assert.equal(ok.persona, 'Switzerland');
  assert.equal(ok.exhibits.length, 2);
  assert.equal(parseLabeled('totally unrelated text'), null);
});

test('matchPersona maps a name back to a rank on the active scale', () => {
  assert.equal(matchPersona('Darth Vader').name, 'Darth Vader');
  assert.equal(matchPersona('not a persona'), null);
});

// ---- exhibit tidying (fixes off-screen + double-quoted quotes) ----------
test('cleanExhibit strips wrapping quotes so the card never doubles them', () => {
  assert.equal(cleanExhibit('"CONTINUE"'), 'CONTINUE');
  assert.equal(cleanExhibit('“do the thing”'), 'do the thing');
});

test('cleanExhibit caps width and collapses whitespace', () => {
  const long = 'a'.repeat(200);
  const out = cleanExhibit(long);
  assert.ok(out.length <= 52);
  assert.ok(out.endsWith('…'));
  assert.equal(cleanExhibit('lots   of\n\nspace'), 'lots of space');
});

// ---- ladders ------------------------------------------------------------
test('both ladders are non-empty and well-formed', () => {
  for (const scale of [PERSONAS, SPICE]) {
    assert.ok(scale.length >= 20);
    for (const p of scale) {
      assert.ok(p.name && p.emoji && p.tag && p.blurb && p.face);
    }
  }
});
