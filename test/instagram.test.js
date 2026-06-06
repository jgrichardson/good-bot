'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  appShareCaption, printAppShareInstructions, buildShareUrl,
} = require('../niceness.js');

const PERSONA = { name: 'Mr. Rogers', emoji: '🧥', tag: "Won't you be my neighbor?" };

test('appShareCaption: includes persona + scale + hashtag', () => {
  const c = appShareCaption(PERSONA, 'people', 'instagram');
  assert.match(c, /Mr\. Rogers/);
  assert.match(c, /people/);
  assert.match(c, /#BeNiceToYourAI/);
  assert.match(c, /How nice are YOU/);
});

test('appShareCaption: includes emoji + tag when present', () => {
  const c = appShareCaption(PERSONA, 'people', 'instagram');
  assert.match(c, /🧥/);
  assert.match(c, /Won't you be my neighbor/);
});

test('appShareCaption: includes the npx CTA so viewers can play', () => {
  const c = appShareCaption(PERSONA, 'people', 'instagram');
  assert.match(c, /npx @jgrciv\/good-bot/);
  assert.match(c, /--quiz/);
});

test('appShareCaption: tiktok variant emits its own CTA', () => {
  const c = appShareCaption(PERSONA, 'people', 'tiktok');
  assert.match(c, /npx @jgrciv\/good-bot --quiz/);
});

test('printAppShareInstructions: instagram steps name the PNG path + Stories', () => {
  const out = printAppShareInstructions('instagram', '/path/to/poster.png', 'caption text');
  assert.match(out, /Instagram/);
  assert.match(out, /Stories/);
  assert.match(out, /\/path\/to\/poster\.png/);
});

test('printAppShareInstructions: tiktok steps name Upload + PNG path', () => {
  const out = printAppShareInstructions('tiktok', '/path/to/poster.png', 'caption text');
  assert.match(out, /TikTok/);
  assert.match(out, /Upload/);
  assert.match(out, /\/path\/to\/poster\.png/);
});

test('printAppShareInstructions: defaults to instagram for unknown app', () => {
  const out = printAppShareInstructions('myspace', '/p.png', '');
  assert.match(out, /Instagram/);
});

test('buildShareUrl: threads platform now resolves', () => {
  const r = buildShareUrl('threads', PERSONA, 'people');
  assert.strictEqual(r.name, 'Threads');
  assert.match(r.url, /^https:\/\/threads\.net\/intent\/post\?text=/);
  assert.match(r.url, /github\.com%2Fjgrichardson%2Fgood-bot/);
});
