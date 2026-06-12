'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  importExport, analyze,
  gitAuthorIdentity, collectGitCommits, resolveGitDirs,
  stripZshHistoryLine, shellCountsFromText, shellHistoryCounts,
  buildVsReport, vsVerdicts, renderVs, DEMO_VS_INPUT, renderLab,
} = require('../niceness.js');
const { buildLabReport } = require('../analytics.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'chatgpt-conversations.json');

// ---- ChatGPT export autodetect (--import) --------------------------------

test('ChatGPT import: walks multi-node mappings, keeps only typed user text', () => {
  const items = importExport(FIXTURE);
  const texts = items.map(i => i.text);
  assert.deepStrictEqual(texts, [
    'please refactor this function',
    'thanks, that looks great',
    'wonderful, ship it',
  ]);
  // system, assistant, tool, and hidden-context turns must never leak in.
  assert.ok(!texts.some(t => t.includes('must never be scored')));
});

test('ChatGPT import: epoch-seconds create_time becomes an ISO timestamp', () => {
  const items = importExport(FIXTURE);
  assert.strictEqual(items[0].ts, new Date(1717250100.5 * 1000).toISOString());
  // node without its own create_time falls back to the conversation's.
  assert.strictEqual(items[2].ts, null); // "Weird shapes" convo has no create_time at all
});

test('ChatGPT import: conversation title becomes the project label', () => {
  const items = importExport(FIXTURE);
  assert.strictEqual(items[0].project, 'Refactor help');
});

test('ChatGPT import: image parts are skipped, string parts joined', () => {
  const items = importExport(FIXTURE);
  assert.strictEqual(items[1].text, 'thanks, that looks great');
});

test('ChatGPT import: scored through the existing sentiment machinery', () => {
  const a = analyze(importExport(FIXTURE));
  assert.strictEqual(a.stats.messages, 3);
  assert.strictEqual(a.stats.pleases, 1);
  assert.strictEqual(a.stats.thanks, 1);
  assert.strictEqual(a.stats.fbombs, 0);
});

test('ChatGPT import: unknown shapes never crash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbot-import-'));
  const write = (name, data) => {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, JSON.stringify(data));
    return f;
  };
  assert.deepStrictEqual(importExport(write('a.json', [])), []);
  assert.deepStrictEqual(importExport(write('b.json', { conversations: 42 })), []);
  assert.deepStrictEqual(importExport(write('c.json', [null, 'x', 7, { mapping: { n: { message: { author: {} } } } }])), []);
  assert.deepStrictEqual(importExport(write('d.json', [{ mapping: [] }, { chat_messages: 'nope' }])), []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Claude import shape still works alongside the ChatGPT one', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbot-import-'));
  const f = path.join(tmp, 'claude.json');
  fs.writeFileSync(f, JSON.stringify([{
    name: 'My chat',
    chat_messages: [
      { sender: 'human', text: 'thank you so much', created_at: '2026-01-02T03:04:05Z' },
      { sender: 'assistant', text: 'you are welcome' },
    ],
  }]));
  const items = importExport(f);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].text, 'thank you so much');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- git commit tone ------------------------------------------------------

test('git: collects + scores only YOUR commits from a synthetic repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbot-git-'));
  const env = Object.assign({}, process.env, {
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_DATE: '2026-06-01T10:00:00Z', GIT_COMMITTER_DATE: '2026-06-01T10:00:00Z',
  });
  const run = (...args) => execFileSync('git', ['-C', dir].concat(args), { encoding: 'utf8', env });
  run('init', '-q');
  run('config', 'user.email', 'tester@example.com');
  run('config', 'user.name', 'Test Er');
  run('commit', '--allow-empty', '-q', '-m', 'please fix the flaky test, thanks');
  run('commit', '--allow-empty', '-q', '-m', 'fucking build is broken AGAIN');
  run('-c', 'user.email=other@example.com', '-c', 'user.name=Somebody Else',
    'commit', '--allow-empty', '-q', '-m', 'a teammate commit that is not yours');

  const identity = gitAuthorIdentity(dir);
  assert.strictEqual(identity.email, 'tester@example.com');

  const r = collectGitCommits(dir, identity);
  assert.strictEqual(r.items.length, 2);
  const texts = r.items.map(i => i.text);
  assert.ok(texts.includes('please fix the flaky test, thanks'));
  assert.ok(!texts.some(t => t.includes('teammate')));
  assert.ok(r.items.every(i => i.ts && !isNaN(new Date(i.ts))));
  // project label is the directory basename only — never a full path.
  assert.ok(r.items.every(i => i.project === path.basename(dir)));

  // Scored through the existing sentiment machinery:
  const a = analyze(r.items);
  assert.strictEqual(a.stats.pleases, 1);
  assert.strictEqual(a.stats.thanks, 1);
  assert.strictEqual(a.stats.fbombs, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('git: non-repo dirs and missing identity contribute zero items, never throw', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbot-notarepo-'));
  assert.deepStrictEqual(collectGitCommits(dir, { email: 'x@y.z' }).items, []);
  assert.deepStrictEqual(collectGitCommits(dir, null).items, []);
  assert.deepStrictEqual(collectGitCommits(dir, {}).items, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('git: resolveGitDirs always includes cwd, expands ~, dedupes', () => {
  const dirs = resolveGitDirs('~/work/api, .  ,,');
  assert.ok(dirs.includes(path.resolve(process.cwd())));
  assert.ok(dirs.includes(path.join(os.homedir(), 'work/api')));
  assert.strictEqual(new Set(dirs).size, dirs.length);
});

// ---- shell history (--shell) ----------------------------------------------

test('shell: strips zsh extended-history timestamp prefixes', () => {
  assert.strictEqual(stripZshHistoryLine(': 1465576081:0;ls -la'), 'ls -la');
  assert.strictEqual(stripZshHistoryLine(': 1465576081:12;git push --force'), 'git push --force');
  assert.strictEqual(stripZshHistoryLine('plain bash line'), 'plain bash line');
  assert.strictEqual(stripZshHistoryLine(': 1465576081:0;'), '');
  // a command that merely STARTS with a colon is untouched
  assert.strictEqual(stripZshHistoryLine(':wq not a timestamp'), ':wq not a timestamp');
});

test('shell: counts expletives + ALL-CAPS only — no command text retained', () => {
  const text = [
    ': 1717250000:0;echo hello',
    ': 1717250001:5;git commit -m "fucking finally"',
    'plain bash style line',
    '#1717250002',
    ': 1717250003:0;REALLY ANGRY COMMAND',
    '   ',
    '',
  ].join('\n');
  const c = shellCountsFromText(text);
  assert.strictEqual(c.commands, 4);     // stamp + blank lines don't count
  assert.strictEqual(c.fbombs, 1);
  assert.strictEqual(c.expletives, 1);
  assert.strictEqual(c.shouts, 1);       // REALLY ANGRY COMMAND
  // counts only: every value is a number, nothing string-shaped escapes.
  for (const v of Object.values(c)) assert.strictEqual(typeof v, 'number');
});

test('shell: shellHistoryCounts reads given files, skips missing ones silently', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goodbot-shell-'));
  const zsh = path.join(tmp, '.zsh_history');
  fs.writeFileSync(zsh, ': 1717250000:0;rm -rf node_modules # fuck this\n: 1717250001:0;npm install\n');
  const c = shellHistoryCounts([zsh, path.join(tmp, '.bash_history_that_does_not_exist')]);
  assert.strictEqual(c.files, 1);
  assert.strictEqual(c.commands, 2);
  assert.strictEqual(c.fbombs, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('shell: degenerate input never throws', () => {
  for (const bad of [null, undefined, '']) {
    assert.strictEqual(shellCountsFromText(bad).commands, 0);
  }
  assert.doesNotThrow(() => shellCountsFromText(42)); // stringified, counted, harmless
});

// ---- the --vs report --------------------------------------------------------

test('vs: only domains with data appear; shell has no politeness column', () => {
  const rep = buildVsReport({
    ai: { messages: 100, pleases: 20, thanks: 10, fbombs: 1, shouts: 0 },
    git: { messages: 50, pleases: 2, thanks: 1, fbombs: 3, shouts: 1 },
    shell: null,
  });
  assert.deepStrictEqual(rep.domains.map(d => d.id), ['ai', 'git']);
  const rep2 = buildVsReport({ ai: null, git: null, shell: { commands: 10, fbombs: 2, shouts: 0 } });
  assert.strictEqual(rep2.domains.length, 1);
  assert.strictEqual(rep2.domains[0].pol, null);
});

test('vs: verdict crowns the AI-side politeness gap with a ratio', () => {
  const rep = buildVsReport({
    ai: { messages: 100, pleases: 20, thanks: 10, fbombs: 1, shouts: 0 },
    git: { messages: 50, pleases: 2, thanks: 1, fbombs: 3, shouts: 1 },
  });
  // ai 30/100 vs git 6/100 → 5.0×
  assert.match(rep.verdicts[0], /5\.0× nicer to your AI than to your git history/);
});

test('vs: verdict flips when the git log is the politer one', () => {
  const rep = buildVsReport({
    ai: { messages: 100, pleases: 1, thanks: 0, fbombs: 0, shouts: 0 },
    git: { messages: 100, pleases: 5, thanks: 0, fbombs: 0, shouts: 0 },
  });
  assert.match(rep.verdicts[0], /nicer to your git history than to your AI/);
});

test('vs: a please-free git log gets the dedicated verdict', () => {
  const rep = buildVsReport({
    ai: { messages: 200, pleases: 30, thanks: 14, fbombs: 0, shouts: 0 },
    git: { messages: 80, pleases: 0, thanks: 0, fbombs: 2, shouts: 0 },
  });
  assert.match(rep.verdicts[0], /never heard a please/);
});

test('vs: shell verdict compares f-bomb rates per 100', () => {
  const verdicts = vsVerdicts(buildVsReport(DEMO_VS_INPUT).domains);
  assert.ok(verdicts.some(v => /shell hears .* f-bombs per 100 commands/.test(v)));
});

test('vs: renderVs prints the table, the verdict, and the counts-only promise', () => {
  const text = renderVs(buildVsReport(DEMO_VS_INPUT), {});
  assert.match(text, /CROSS-DOMAIN MANNERS/);
  assert.match(text, /git commits/);
  assert.match(text, /shell history/);
  assert.match(text, /nicer to your AI/);
  assert.match(text, /never quoted/);
});

test('vs: single-domain render nudges instead of fabricating a face-off', () => {
  const rep = buildVsReport({ ai: { messages: 10, pleases: 1, thanks: 1, fbombs: 0, shouts: 0 } });
  const text = renderVs(rep, {});
  assert.match(text, /only one domain had data/);
  assert.ok(!text.includes('🐚'));
});

test('vs: --lab appends the cross-domain section only when a second domain has data', () => {
  const recs = [];
  for (let i = 0; i < 40; i++) {
    recs.push({ text: i % 2 ? 'please fix this, thanks!' : 'now update the docs', ts: new Date(Date.UTC(2026, 0, 1 + i, 12)).toISOString(), project: null });
  }
  const report = buildLabReport(analyze(recs).scored);
  const vs = buildVsReport(DEMO_VS_INPUT);
  const withVs = renderLab(report, { vs });
  assert.match(withVs, /Cross-domain manners/);
  const oneDomain = buildVsReport({ ai: DEMO_VS_INPUT.ai });
  assert.ok(!/Cross-domain manners/.test(renderLab(report, { vs: oneDomain })));
  assert.ok(!/Cross-domain manners/.test(renderLab(report, {})));
});
