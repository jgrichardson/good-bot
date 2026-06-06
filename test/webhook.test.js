'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { postWebhook } = require('../niceness.js');

// We test the rejection paths and URL handling without ever touching the
// network. postWebhook enforces https:// — that's an architectural decision
// users rely on, so verify it explicitly.

test('postWebhook: rejects http:// URLs', async () => {
  const r = await postWebhook('http://example.com/hook', 'card text');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /https/);
});

test('postWebhook: rejects malformed URLs', async () => {
  const r = await postWebhook('not-a-url-at-all', 'card text');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /URL|bad URL/i);
});

test('postWebhook: rejects empty URL', async () => {
  const r = await postWebhook('', 'card text');
  assert.strictEqual(r.ok, false);
});

test('postWebhook: rejects ftp:// URLs', async () => {
  const r = await postWebhook('ftp://example.com/hook', 'card text');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /https/);
});

test('postWebhook: returns a promise', () => {
  const p = postWebhook('http://nope', 'x');
  assert.ok(p && typeof p.then === 'function');
  return p;
});
