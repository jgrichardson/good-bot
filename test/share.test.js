'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  SHARE_PLATFORMS, resolveSharePlatform, shareText, buildShareUrl,
} = require('../niceness.js');

const PERSONA = { name: 'Mr. Rogers', emoji: '🧥', tag: "Won't you be my neighbor?" };

test('resolveSharePlatform: canonical keys resolve', () => {
  assert.ok(resolveSharePlatform('twitter'));
  assert.ok(resolveSharePlatform('bluesky'));
  assert.ok(resolveSharePlatform('linkedin'));
  assert.ok(resolveSharePlatform('reddit'));
});

test('resolveSharePlatform: aliases resolve to canonical', () => {
  assert.strictEqual(resolveSharePlatform('x'), SHARE_PLATFORMS.twitter);
  assert.strictEqual(resolveSharePlatform('bsky'), SHARE_PLATFORMS.bluesky);
});

test('resolveSharePlatform: case-insensitive', () => {
  assert.ok(resolveSharePlatform('Twitter'));
  assert.ok(resolveSharePlatform('  BSKY  '));
});

test('resolveSharePlatform: unknown returns null', () => {
  assert.strictEqual(resolveSharePlatform('myspace'), null);
  assert.strictEqual(resolveSharePlatform(''), null);
  assert.strictEqual(resolveSharePlatform(null), null);
  assert.strictEqual(resolveSharePlatform(undefined), null);
});

test('shareText: contains persona name + scale + hashtag', () => {
  const t = shareText(PERSONA, 'people');
  assert.match(t, /Mr\. Rogers/);
  assert.match(t, /people/);
  assert.match(t, /#BeNiceToYourAI/);
  assert.match(t, /How nice are YOU/);
});

test('shareText: includes emoji when present', () => {
  const t = shareText(PERSONA, 'people');
  assert.match(t, /🧥/);
});

test('shareText: works without emoji or tag', () => {
  const t = shareText({ name: 'Spock' }, 'trek');
  assert.match(t, /Spock/);
  assert.match(t, /trek/);
  assert.doesNotMatch(t, /undefined/);
});

test('buildShareUrl: Twitter URL encodes text and url', () => {
  const r = buildShareUrl('twitter', PERSONA, 'people');
  assert.strictEqual(r.name, 'Twitter / X');
  assert.match(r.url, /^https:\/\/twitter\.com\/intent\/tweet\?/);
  assert.match(r.url, /text=/);
  assert.match(r.url, /url=/);
  assert.match(r.url, /Mr\.%20Rogers/);
  // URL itself is encoded — github.com appears in encoded form
  assert.match(r.url, /github\.com%2Fjgrichardson%2Fgood-bot/);
});

test('buildShareUrl: Bluesky uses compose intent + inline url', () => {
  const r = buildShareUrl('bluesky', PERSONA, 'people');
  assert.strictEqual(r.name, 'Bluesky');
  assert.match(r.url, /^https:\/\/bsky\.app\/intent\/compose\?text=/);
  // Bluesky doesn't have a separate url param; URL is inside the text
  assert.match(r.url, /github\.com%2Fjgrichardson%2Fgood-bot/);
});

test('buildShareUrl: LinkedIn share-offsite shape', () => {
  const r = buildShareUrl('linkedin', PERSONA, 'people');
  assert.strictEqual(r.name, 'LinkedIn');
  assert.match(r.url, /^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?/);
  assert.match(r.url, /url=/);
  assert.match(r.url, /summary=/);
});

test('buildShareUrl: Reddit submit shape', () => {
  const r = buildShareUrl('reddit', PERSONA, 'people');
  assert.strictEqual(r.name, 'Reddit');
  assert.match(r.url, /^https:\/\/www\.reddit\.com\/submit\?/);
  assert.match(r.url, /title=/);
  assert.match(r.url, /url=/);
});

test('buildShareUrl: unknown platform returns null', () => {
  assert.strictEqual(buildShareUrl('myspace', PERSONA, 'people'), null);
});

test('buildShareUrl: alias x resolves to Twitter builder', () => {
  const r = buildShareUrl('x', PERSONA, 'people');
  assert.strictEqual(r.name, 'Twitter / X');
});

test('buildShareUrl: URL-encoded payload is round-trip safe', () => {
  const persona = { name: 'M+R&G', emoji: '🧥', tag: 'special chars: ? & = / # %' };
  const r = buildShareUrl('twitter', persona, 'people');
  // text param contains the original characters (URL-encoded)
  const m = r.url.match(/text=([^&]+)/);
  assert.ok(m);
  const decoded = decodeURIComponent(m[1]);
  assert.match(decoded, /M\+R&G/);
  assert.match(decoded, /special chars: \? & = \/ # %/);
});
