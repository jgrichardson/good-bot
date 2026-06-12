'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  postWebhook, buildWebhookPayload, sendWebhook, webhookNotice, WEBHOOK_TIMEOUT_MS,
} = require('../niceness.js');

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

// ---- payload builder (pure — never touches the network) ------------------

test('buildWebhookPayload: Slack hosts get {"text": ...}', () => {
  const p = buildWebhookPayload('https://hooks.slack.com/services/T0/B0/XX', 'my card');
  assert.strictEqual(p.key, 'text');
  assert.strictEqual(p.host, 'hooks.slack.com');
  assert.deepStrictEqual(JSON.parse(p.body), { text: 'my card' });
});

test('buildWebhookPayload: Discord hosts get {"content": ...}', () => {
  for (const url of [
    'https://discord.com/api/webhooks/1/abc',
    'https://discordapp.com/api/webhooks/1/abc',
    'https://ptb.discord.com/api/webhooks/1/abc',
    'https://canary.discordapp.com/api/webhooks/1/abc',
  ]) {
    const p = buildWebhookPayload(url, 'my card');
    assert.strictEqual(p.key, 'content', url);
    assert.deepStrictEqual(JSON.parse(p.body), { content: 'my card' });
  }
});

test('buildWebhookPayload: lookalike hosts stay on the Slack key', () => {
  assert.strictEqual(buildWebhookPayload('https://notdiscord.com/hook', 'x').key, 'text');
  assert.strictEqual(buildWebhookPayload('https://discord.com.evil.example/hook', 'x').key, 'text');
});

test('webhookNotice: names the host, the payload, and whose webhook it is', () => {
  const n = webhookNotice('https://hooks.slack.com/services/T0/B0/XX', 'card');
  assert.match(n, /Sending your card \(text only, no transcripts\) to hooks\.slack\.com — your own webhook/);
});

// ---- sendWebhook with an injected fake transport (no network, ever) ------

function fakeTransport(capture, statusCode) {
  return {
    request(opts, cb) {
      capture.opts = opts;
      return {
        on() { return this; },
        write(d) { capture.body = d.toString('utf8'); },
        end() {
          const handlers = {};
          cb({ statusCode: statusCode || 200, on(ev, fn) { handlers[ev] = fn; return this; } });
          handlers.data(Buffer.from('ok'));
          handlers.end();
        },
      };
    },
  };
}

test('sendWebhook: POSTs the Slack payload with JSON headers + 5s timeout', async () => {
  const capture = {};
  const r = await sendWebhook('https://hooks.slack.com/services/T0/B0/XX', 'card text', { transport: fakeTransport(capture) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.host, 'hooks.slack.com');
  assert.strictEqual(capture.opts.method, 'POST');
  assert.strictEqual(capture.opts.hostname, 'hooks.slack.com');
  assert.strictEqual(capture.opts.headers['Content-Type'], 'application/json');
  assert.strictEqual(capture.opts.timeout, WEBHOOK_TIMEOUT_MS);
  assert.strictEqual(WEBHOOK_TIMEOUT_MS, 5000);
  assert.deepStrictEqual(JSON.parse(capture.body), { text: 'card text' });
});

test('sendWebhook: Discord URL ships {"content": ...}', async () => {
  const capture = {};
  const r = await sendWebhook('https://discord.com/api/webhooks/1/abc', 'card text', { transport: fakeTransport(capture) });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(JSON.parse(capture.body), { content: 'card text' });
});

test('sendWebhook: non-2xx resolves ok:false with the status', async () => {
  const capture = {};
  const r = await sendWebhook('https://hooks.slack.com/x', 'card', { transport: fakeTransport(capture, 404) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 404);
});

test('sendWebhook: rejects http:// before the transport is ever touched', async () => {
  const capture = {};
  const r = await sendWebhook('http://example.com/hook', 'card', { transport: fakeTransport(capture) });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /https/);
  assert.strictEqual(capture.opts, undefined);
});
