'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { installNetworkAudit, renderAuditReport } = require('../niceness.js');

test('installNetworkAudit: returns ctx with calls + restore', () => {
  const ctx = installNetworkAudit();
  try {
    assert.ok(ctx);
    assert.ok(typeof ctx.calls === 'object');
    assert.ok(typeof ctx.restore === 'function');
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks https.request', () => {
  const ctx = installNetworkAudit();
  try {
    const https = require('node:https');
    assert.throws(() => https.request({ host: 'example.com' }), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['https.request'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks https.get', () => {
  const ctx = installNetworkAudit();
  try {
    const https = require('node:https');
    assert.throws(() => https.get('https://example.com'), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['https.get'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks http.request', () => {
  const ctx = installNetworkAudit();
  try {
    const http = require('node:http');
    assert.throws(() => http.request({ host: 'example.com' }), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['http.request'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks dns.lookup', () => {
  const ctx = installNetworkAudit();
  try {
    const dns = require('node:dns');
    assert.throws(() => dns.lookup('example.com', () => {}), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['dns.lookup'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks net.createConnection', () => {
  const ctx = installNetworkAudit();
  try {
    const net = require('node:net');
    assert.throws(() => net.createConnection(80, 'example.com'), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['net.createConnection'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks tls.connect', () => {
  const ctx = installNetworkAudit();
  try {
    const tls = require('node:tls');
    assert.throws(() => tls.connect(443, 'example.com'), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls['tls.connect'], 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: blocks global fetch (Node 18+)', () => {
  if (typeof globalThis.fetch !== 'function') {
    // Skip in <18 where fetch is undefined
    return;
  }
  const ctx = installNetworkAudit();
  try {
    assert.throws(() => globalThis.fetch('https://example.com'), /AUDIT_BLOCKED|audit:/);
    assert.strictEqual(ctx.calls.fetch, 1);
  } finally { ctx.restore(); }
});

test('installNetworkAudit: restore brings back the originals', () => {
  const https = require('node:https');
  const orig = https.request;
  const ctx = installNetworkAudit();
  ctx.restore();
  assert.strictEqual(https.request, orig);
});

test('renderAuditReport: clean run prints provable-no-network message', () => {
  const calls = { 'https.request': 0, 'http.request': 0, 'dns.lookup': 0 };
  const out = renderAuditReport(calls);
  assert.match(out, /Provably no network call/);
  assert.match(out, /never called/);
});

test('renderAuditReport: dirty run prints attempt count + name', () => {
  const calls = { 'https.request': 3, 'http.request': 0, 'dns.lookup': 1 };
  const out = renderAuditReport(calls);
  assert.match(out, /4 network call attempt/);
  assert.match(out, /blocked 3×/);
  assert.match(out, /blocked 1×/);
});
