'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  extractGemini, extractContinue, extractAiderMarkdown, SOURCES,
} = require('../niceness.js');

// ---- Gemini CLI ---------------------------------------------------------

test('Gemini: extracts plain-string content from user role', () => {
  const out = extractGemini({ role: 'user', content: 'please refactor this' });
  assert.deepStrictEqual(out, ['please refactor this']);
});

test('Gemini: extracts the ~/.gemini/tmp/*/logs.json row shape', () => {
  const row = { sessionId: 'abc', messageId: 3, type: 'user', message: 'thanks, now add tests please', timestamp: '2026-06-01T10:00:00.000Z' };
  assert.deepStrictEqual(extractGemini(row), ['thanks, now add tests please']);
});

test('Gemini: skips non-user logs.json rows (tool output, model turns)', () => {
  assert.deepStrictEqual(extractGemini({ type: 'gemini', message: 'here is the diff' }), []);
  assert.deepStrictEqual(extractGemini({ type: 'tool', message: 'exit 0' }), []);
});

test('Gemini: typed @file mentions survive (they are user-typed)', () => {
  const out = extractGemini({ type: 'user', message: 'please review @src/app.js' });
  assert.deepStrictEqual(out, ['please review @src/app.js']);
});

test('Gemini: unknown/malformed shapes are skipped silently, never throw', () => {
  for (const bad of [null, undefined, 42, 'a string', [], {}, { type: 'user' }, { type: 'user', message: { weird: true } }, { role: 'user', content: { nested: 'object' } }]) {
    assert.deepStrictEqual(extractGemini(bad), []);
  }
});

test('Gemini: extracts parts[].text shape (Google native)', () => {
  const out = extractGemini({ role: 'user', parts: [{ text: 'rewrite this' }, { text: 'in TypeScript' }] });
  assert.deepStrictEqual(out, ['rewrite this in TypeScript']);
});

test('Gemini: extracts content as array of parts', () => {
  const out = extractGemini({ role: 'user', content: [{ text: 'thanks!' }] });
  assert.deepStrictEqual(out, ['thanks!']);
});

test('Gemini: ignores assistant role', () => {
  const out = extractGemini({ role: 'assistant', content: 'sure, here you go' });
  assert.deepStrictEqual(out, []);
});

test('Gemini: ignores empty/whitespace text', () => {
  assert.deepStrictEqual(extractGemini({ role: 'user', content: '' }), []);
  assert.deepStrictEqual(extractGemini({ role: 'user', content: '   ' }), []);
});

test('Gemini: supports nested message.role/content shape', () => {
  const out = extractGemini({ message: { role: 'user', content: 'go' } });
  assert.deepStrictEqual(out, ['go']);
});

// ---- Continue.dev -------------------------------------------------------

test('Continue: extracts string content from user role', () => {
  const out = extractContinue({ role: 'user', content: 'hello there' });
  assert.deepStrictEqual(out, ['hello there']);
});

test('Continue: extracts content array (parts) for user role', () => {
  const out = extractContinue({ role: 'user', content: [{ text: 'pls fix' }, { text: 'the tests' }] });
  assert.deepStrictEqual(out, ['pls fix the tests']);
});

test('Continue: ignores assistant role', () => {
  const out = extractContinue({ role: 'assistant', content: 'done!' });
  assert.deepStrictEqual(out, []);
});

// ---- Aider --------------------------------------------------------------

test('Aider: extracts a single `####` prompt', () => {
  const md = '#### please add tests for the cli\n\n> diff goes here\n';
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, ['please add tests for the cli']);
});

test('Aider: extracts multiple prompts, skipping aider\'s own unprefixed output', () => {
  const md = [
    '#### first prompt',
    'this unprefixed line is aider talking, not the human',
    '#### second prompt',
    '',
    '> response from aider',
    '#### third prompt',
  ].join('\n');
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, [
    'first prompt',
    'second prompt',
    'third prompt',
  ]);
});

test('Aider: consecutive #### lines join into one multi-line prompt', () => {
  const md = '#### first line of my prompt\n#### second line of my prompt\n\nAider replied here.\n#### a later prompt\n';
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, [
    'first line of my prompt\nsecond line of my prompt',
    'a later prompt',
  ]);
});

test('Aider: stops a prompt at blockquote response marker', () => {
  const md = '#### nice work, ship it\n> response\nmore response\n#### thanks!\n';
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, ['nice work, ship it', 'thanks!']);
});

test('Aider: ignores #### lines inside fenced code blocks', () => {
  const md = [
    '#### please fix the heading parser',
    '```markdown',
    '#### this is sample data inside a fence, not a prompt',
    '```',
    '#### thanks!',
  ].join('\n');
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, ['please fix the heading parser', 'thanks!']);
});

test('Aider: skips session headers and malformed input without throwing', () => {
  const md = '# aider chat started at 2026-06-01 10:00:00\n\nModel: something\n#### hello there\n';
  assert.deepStrictEqual(extractAiderMarkdown(md), ['hello there']);
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.deepStrictEqual(extractAiderMarkdown(bad), []);
  }
});

test('Aider: empty input returns empty array', () => {
  assert.deepStrictEqual(extractAiderMarkdown(''), []);
  assert.deepStrictEqual(extractAiderMarkdown(null), []);
});

test('Aider: filters obvious system-noise prompts via isNoise', () => {
  // Empty after #### is correctly excluded (no buf to push)
  const md = '####    \n#### real prompt\n';
  const out = extractAiderMarkdown(md);
  assert.deepStrictEqual(out, ['real prompt']);
});

// ---- SOURCES registry shape --------------------------------------------

test('SOURCES: registers all five adapters', () => {
  assert.ok(SOURCES.claude);
  assert.ok(SOURCES.codex);
  assert.ok(SOURCES.gemini);
  assert.ok(SOURCES.continue);
  assert.ok(SOURCES.aider);
});

test('SOURCES: each adapter has either collect or root+extract', () => {
  for (const [name, src] of Object.entries(SOURCES)) {
    const hasCollect = typeof src.collect === 'function';
    const hasRootExtract = typeof src.root === 'string' && typeof src.extract === 'function';
    assert.ok(hasCollect || hasRootExtract, `${name} is neither callable-collect nor root+extract`);
    assert.strictEqual(typeof src.label, 'string', `${name} missing label`);
  }
});
