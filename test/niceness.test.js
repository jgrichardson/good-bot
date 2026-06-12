'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  sanitize, extractTexts, extractCodex, extractGemini, extractAiderMarkdown,
  importExport, scoreMessage, shouty, analyze,
  scaleIndex, pickPersona, parseLabeled, matchPersona, cleanExhibit, sparkline,
  computeWrapped, wrappedSvg, personaFor, SCALES,
} = require('../niceness.js');
const PERSONAS = SCALES.people;
const SPICE = SCALES.spice;

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

test('scoreMessage handles negation (not just keyword counting)', () => {
  // a negated positive should NOT read as gratitude
  assert.equal(scoreMessage('no thanks, that is wrong').nice, 0);
  assert.equal(scoreMessage('not great, this is broken').nice, 0);
  assert.ok(scoreMessage('no thanks, that is wrong').mean > 0);
  // genuine gratitude still counts
  assert.ok(scoreMessage('that is great, thank you!').nice > 0);
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

test('pickPersona returns a real persona and respects the extremes', () => {
  const saint = { niceness: 96, fbombRate: 0, capsRate: 0, meanRate: 0, apologyRate: 0.1, thanksRate: 0.3, pleaseRate: 0.3, avgLen: 200, exclaimRate: 0.1, hash: 0 };
  const tyrant = { niceness: 3, fbombRate: 0.2, capsRate: 0.2, meanRate: 0.8, apologyRate: 0, thanksRate: 0, pleaseRate: 0, avgLen: 20, exclaimRate: 0.1, hash: 0 };
  assert.ok(SCALES.people.includes(pickPersona(saint)));
  assert.equal(pickPersona(tyrant).name, 'Darth Vader');
  // a terse, neutral style should read as Ron Swanson, not generic Switzerland
  const terse = { niceness: 50, fbombRate: 0, capsRate: 0, meanRate: 0.05, apologyRate: 0, thanksRate: 0.01, pleaseRate: 0.05, avgLen: 45, exclaimRate: 0.05, hash: 0 };
  assert.equal(pickPersona(terse).name, 'Ron Swanson');
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

// ---- multi-source ingestion ---------------------------------------------
test('extractCodex pulls human user_message events and strips injected wrappers', () => {
  assert.deepStrictEqual(
    extractCodex({ type: 'event_msg', payload: { type: 'user_message', message: '<system_instruction>be good</system_instruction>\n\nFix the auth bug' } }),
    ['Fix the auth bug'],
  );
  assert.deepStrictEqual(extractCodex({ type: 'event_msg', payload: { type: 'exec_command_end' } }), []);
  assert.deepStrictEqual(extractCodex({ type: 'response_item', payload: {} }), []);
});

test('extractGemini reads the ~/.gemini/tmp/*/logs.json row shape and skips junk (experimental)', () => {
  assert.deepStrictEqual(
    extractGemini({ sessionId: 's', messageId: 1, type: 'user', message: 'please add a test', timestamp: '2026-06-01T10:00:00.000Z' }),
    ['please add a test'],
  );
  assert.deepStrictEqual(extractGemini({ type: 'gemini', message: 'model reply' }), []);
  for (const bad of [null, 7, 'str', {}, { type: 'user' }]) assert.deepStrictEqual(extractGemini(bad), []);
});

test('extractAiderMarkdown keeps only #### user lines; aider output and fences are skipped (experimental)', () => {
  const md = [
    '# aider chat started at 2026-06-01 10:00:00',
    '#### please refactor this',
    '#### and add tests',
    'Sure! Here is the plan (aider talking).',
    '```python',
    '#### not a prompt, just code',
    '```',
    '#### thanks!',
  ].join('\n');
  assert.deepStrictEqual(extractAiderMarkdown(md), ['please refactor this\nand add tests', 'thanks!']);
  assert.deepStrictEqual(extractAiderMarkdown(''), []);
  assert.deepStrictEqual(extractAiderMarkdown(null), []);
});

test('importExport parses a Claude data-export shape (human turns only)', () => {
  const data = [{
    name: 'chat', created_at: '2026-01-01T00:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'please refactor this', created_at: '2026-01-01T00:00:00Z' },
      { sender: 'assistant', text: 'sure' },
      { sender: 'human', content: [{ type: 'text', text: 'thanks!' }] },
    ],
  }];
  const tmp = require('node:path').join(require('node:os').tmpdir(), `gb-export-${process.pid}.json`);
  require('node:fs').writeFileSync(tmp, JSON.stringify(data));
  const items = importExport(tmp);
  require('node:fs').unlinkSync(tmp);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, 'please refactor this');
});

// ---- wrapped poster -----------------------------------------------------
test('wrappedSvg renders a valid SVG poster from analysis', () => {
  const items = [];
  for (let i = 0; i < 60; i++) {
    items.push({ text: i % 3 === 0 ? 'thanks, this is perfect!' : 'fix the bug', ts: `2026-0${1 + (i % 6)}-15T0${i % 9}:00:00Z`, project: i % 2 ? '/Users/x/repo-a' : '/Users/x/repo-b' });
  }
  const a = analyze(items);
  const d = computeWrapped(a);
  assert.ok(Array.isArray(d.periods));
  const svg = wrappedSvg(personaFor(a.sig), a.stats, 'Jan 2026 → Jun 2026', a.niceness, d);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('WRAPPED'));
  assert.ok(svg.trim().endsWith('</svg>'));
});

// ---- trends -------------------------------------------------------------
test('sparkline maps a series into block glyphs of equal length', () => {
  const s = sparkline([0, 25, 50, 75, 100]);
  assert.equal(s.length, 5);
  assert.equal(s[0], '▁');
  assert.equal(s[4], '█');
});

// ---- achievements ---------------------------------------------------------
const {
  ACHIEVEMENTS, evaluateAchievements, computeAchievementStats, topUnlocked,
  DEMO_ACHIEVEMENT_STATS,
} = require('../achievements.js');
const { renderAchievementGallery } = require('../niceness.js');

// Synthetic stats snapshot with everything locked; override per test.
function fakeStats(over) {
  return Object.assign({
    messages: 0, pleases: 0, thanks: 0, fbombs: 0, shouts: 0, apologies: 0,
    niceness: 50, avgLen: 100,
    nightMessages: 0, nightNiceness: 50, weekendMessages: 0,
    daysActive: 0, dayStreak: 0, maxDayMessages: 0,
    spanDays: 0, timestamped: 0,
    firstHalfNiceness: 50, secondHalfNiceness: 50,
    sources: 1,
  }, over || {});
}
const byId = id => ACHIEVEMENTS.find(a => a.id === id);
const has = (stats, id) => evaluateAchievements(stats).unlocked.some(a => a.id === id);

test('every achievement is well-formed with a unique id', () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && a.emoji && a.name && a.desc && a.hint, `missing fields on ${a.id}`);
    assert.ok(['common', 'rare', 'legendary'].includes(a.tier), `bad tier on ${a.id}`);
    assert.equal(typeof a.unlock, 'function');
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
  }
  assert.ok(ACHIEVEMENTS.length >= 16 && ACHIEVEMENTS.length <= 24);
});

test('unlock predicates respect their boundaries', () => {
  // centurion: exactly 100 pleases is in; 99 is out
  assert.equal(has(fakeStats({ pleases: 99 }), 'centurion'), false);
  assert.equal(has(fakeStats({ pleases: 100 }), 'centurion'), true);
  // asbestos: clean mouth AND enough history
  assert.equal(has(fakeStats({ fbombs: 0, messages: 200 }), 'asbestos'), true);
  assert.equal(has(fakeStats({ fbombs: 0, messages: 199 }), 'asbestos'), false);
  assert.equal(has(fakeStats({ fbombs: 1, messages: 500 }), 'asbestos'), false);
  // owl: politest after midnight needs volume + a real margin
  assert.equal(has(fakeStats({ nightMessages: 25, nightNiceness: 55, niceness: 50 }), 'owl'), true);
  assert.equal(has(fakeStats({ nightMessages: 25, nightNiceness: 54, niceness: 50 }), 'owl'), false);
  assert.equal(has(fakeStats({ nightMessages: 24, nightNiceness: 90, niceness: 50 }), 'owl'), false);
  // redemption / villain arcs are mirror images
  assert.equal(has(fakeStats({ timestamped: 100, firstHalfNiceness: 50, secondHalfNiceness: 56 }), 'redemption'), true);
  assert.equal(has(fakeStats({ timestamped: 100, firstHalfNiceness: 50, secondHalfNiceness: 55 }), 'redemption'), false);
  assert.equal(has(fakeStats({ timestamped: 100, firstHalfNiceness: 50, secondHalfNiceness: 44 }), 'villain-arc'), true);
  assert.equal(has(fakeStats({ timestamped: 99, firstHalfNiceness: 50, secondHalfNiceness: 44 }), 'villain-arc'), false);
  // polyglot needs >1 tool AND actual niceness
  assert.equal(has(fakeStats({ sources: 2, niceness: 60 }), 'polyglot'), true);
  assert.equal(has(fakeStats({ sources: 1, niceness: 99 }), 'polyglot'), false);
  assert.equal(has(fakeStats({ sources: 2, niceness: 59 }), 'polyglot'), false);
  // saint is legendary-hard
  assert.equal(has(fakeStats({ niceness: 90, messages: 500 }), 'saint'), true);
  assert.equal(has(fakeStats({ niceness: 89, messages: 5000 }), 'saint'), false);
});

test('evaluateAchievements partitions every badge into unlocked or locked', () => {
  const r = evaluateAchievements(fakeStats({ messages: 1, pleases: 1 }));
  assert.equal(r.unlocked.length + r.locked.length, r.total);
  assert.equal(r.total, ACHIEVEMENTS.length);
  assert.ok(r.unlocked.some(a => a.id === 'first-contact'));
});

test('topUnlocked ranks legendary above rare above common', () => {
  const picks = topUnlocked([byId('first-contact'), byId('centurion'), byId('saint')], 2);
  assert.equal(picks[0].id, 'saint');
  assert.equal(picks[1].id, 'centurion');
});

test('computeAchievementStats derives calendar shape from scored records', () => {
  const items = [];
  // 3 consecutive days, with a 3am Saturday burst
  for (let i = 0; i < 30; i++) items.push({ text: 'thanks, please keep going!', ts: '2026-06-05T10:00:00', project: null });   // Friday
  for (let i = 0; i < 30; i++) items.push({ text: 'thank you so much!', ts: '2026-06-06T03:00:00', project: null });           // Saturday 3am
  for (let i = 0; i < 30; i++) items.push({ text: 'please fix the test', ts: '2026-06-07T15:00:00', project: null });          // Sunday
  const s = computeAchievementStats(analyze(items), { sources: 2 });
  assert.equal(s.messages, 90);
  assert.equal(s.nightMessages, 30);
  assert.equal(s.weekendMessages, 60);
  assert.equal(s.daysActive, 3);
  assert.equal(s.dayStreak, 3);
  assert.equal(s.maxDayMessages, 30);
  assert.equal(s.sources, 2);
  assert.ok(s.spanDays >= 2 && s.spanDays < 3);
});

test('demo stats unlock a fun handful including the teaser badges', () => {
  const r = evaluateAchievements(DEMO_ACHIEVEMENT_STATS);
  assert.ok(r.unlocked.length >= 8);
  assert.ok(r.unlocked.some(a => a.id === 'centurion'));
  assert.ok(r.unlocked.some(a => a.id === 'asbestos'));
  assert.ok(r.locked.length >= 3, 'demo should leave something to chase');
});

test('gallery hides locked legendaries behind ??? but names locked rares', () => {
  const r = evaluateAchievements(fakeStats());   // everything locked
  const out = renderAchievementGallery(r);
  assert.match(out, /\?\?\? — a legend awaits/);
  assert.ok(!out.includes('Certified Saint'), 'locked legendary name must not leak');
  assert.ok(out.includes('Centurion of Courtesy'), 'locked rare shows name + hint');
  assert.match(out, /0 of \d+ unlocked/);
});

// ---- local comedy roast (--roast) ----------------------------------------
const {
  computeRoastStats, roastBucketIds, isSaintly, buildRoast, renderRoastCard,
  DEMO_ROAST_STATS,
} = require('../niceness.js');

// Synthetic roast-stats snapshot: a quiet, neutral history; override per test.
function fakeRoastStats(over) {
  return Object.assign({
    messages: 500, pleases: 25, thanks: 20, fbombs: 0, shouts: 0, apologies: 0,
    niceness: 50, avgLen: 120, walls: 0, presRate: 0,
    nightMessages: 0, nightNiceness: 50, timestamped: 0,
    firstHalfNiceness: 50, secondHalfNiceness: 50,
  }, over || {});
}

test('roastBucketIds keys jabs to the right stat buckets', () => {
  assert.ok(roastBucketIds(fakeRoastStats({ fbombs: 41 })).includes('fbomb-heavy'));
  assert.ok(!roastBucketIds(fakeRoastStats({ fbombs: 41 })).includes('fbomb-mid'));
  assert.ok(roastBucketIds(fakeRoastStats({ fbombs: 12 })).includes('fbomb-mid'));
  assert.ok(roastBucketIds(fakeRoastStats({ fbombs: 2 })).includes('fbomb-light'));
  assert.ok(roastBucketIds(fakeRoastStats({ shouts: 9 })).includes('caps'));
  assert.ok(roastBucketIds(fakeRoastStats({ pleases: 3 })).includes('please-drought'));
  assert.ok(roastBucketIds(fakeRoastStats({ thanks: 3 })).includes('thanks-drought'));
  assert.ok(roastBucketIds(fakeRoastStats({ presRate: 0.06 })).includes('demand-ratio'));
  assert.ok(roastBucketIds(fakeRoastStats({ walls: 15 })).includes('wall-of-text'));
  assert.ok(roastBucketIds(fakeRoastStats({ avgLen: 320 })).includes('novelist'));
  assert.ok(roastBucketIds(fakeRoastStats({ avgLen: 30 })).includes('minimalist'));
  assert.ok(roastBucketIds(fakeRoastStats({ nightMessages: 30, nightNiceness: 40 })).includes('late-night'));
  assert.ok(roastBucketIds(fakeRoastStats({ timestamped: 120, secondHalfNiceness: 40 })).includes('villain-arc'));
  assert.ok(roastBucketIds(fakeRoastStats({ timestamped: 120, secondHalfNiceness: 60 })).includes('redemption'));
  // the quiet neutral baseline trips none of them
  assert.deepStrictEqual(roastBucketIds(fakeRoastStats()), []);
});

test('buildRoast is deterministic: same stats, same roast', () => {
  const s = fakeRoastStats({ fbombs: 41, shouts: 12, pleases: 3 });
  assert.deepStrictEqual(buildRoast(s).lines, buildRoast(s).lines);
  // an explicit seed (the --random path) can pick a different set
  assert.ok(Array.isArray(buildRoast(s, { seed: 12345 }).lines));
});

test('buildRoast lands 4-6 lines and cites the real numbers', () => {
  const r = buildRoast(fakeRoastStats({ fbombs: 41 }));
  assert.equal(r.saintly, false);
  assert.ok(r.lines.length >= 4 && r.lines.length <= 6);
  assert.ok(r.lines.some(l => l.includes('41')), 'jab must cite the actual f-bomb count');
});

test('buildRoast pads quiet histories with generic jabs (still 4+ lines)', () => {
  const r = buildRoast(fakeRoastStats());
  assert.ok(r.lines.length >= 4 && r.lines.length <= 6);
});

test('a genuinely saintly history flips the roast', () => {
  const saint = fakeRoastStats({ niceness: 92, pleases: 410, thanks: 372, apologies: 48, messages: 1820 });
  assert.equal(isSaintly(saint), true);
  // one f-bomb disqualifies sainthood; so does a cold politeness ratio
  assert.equal(isSaintly(fakeRoastStats({ niceness: 92, pleases: 410, thanks: 372, fbombs: 1, messages: 1820 })), false);
  assert.equal(isSaintly(fakeRoastStats({ niceness: 92, pleases: 2, thanks: 2 })), false);
  const r = buildRoast(saint);
  assert.equal(r.saintly, true);
  assert.ok(r.lines.length >= 4 && r.lines.length <= 6);
  assert.ok(roastBucketIds(saint).includes('saint-pleases'));
  assert.ok(roastBucketIds(saint).includes('saint-thanks'));
});

test('computeRoastStats derives walls + presRate from an analysis', () => {
  const items = [
    { text: 'just fix it asap', ts: '2026-06-01T10:00:00Z', project: null },
    { text: 'w'.repeat(700), ts: '2026-06-01T11:00:00Z', project: null },
    { text: 'thanks!', ts: '2026-06-01T12:00:00Z', project: null },
  ];
  const s = computeRoastStats(analyze(items));
  assert.equal(s.messages, 3);
  assert.equal(s.walls, 1);
  assert.ok(s.presRate > 0);
});

test('renderRoastCard renders a card with jabs and the stats line', () => {
  const stats = DEMO_ROAST_STATS.spicy;
  const text = renderRoastCard(personaFor({ niceness: 20, fbombRate: 0.02, capsRate: 0.01, meanRate: 0.3, apologyRate: 0, thanksRate: 0, pleaseRate: 0, hash: 1 }), buildRoast(stats), stats, 'Apr 21, 2026 → Jun 2, 2026');
  assert.ok(text.includes('THE ROAST'));
  assert.ok(text.includes('🔥'));
  assert.ok(text.includes('41 f-bombs'));
  assert.ok(text.includes('#BeNiceToYourAI'));
});

// ---- ladders ------------------------------------------------------------
test('every scale is non-empty and well-formed', () => {
  for (const scale of Object.values(SCALES)) {
    assert.ok(scale.length >= 4);
    for (const p of scale) {
      assert.ok(p.name && p.emoji && p.tag && p.blurb && p.face);
      assert.ok(['happy', 'neutral', 'mean'].includes(p.face));
    }
  }
});
