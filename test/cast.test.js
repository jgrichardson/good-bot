'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAsciinemaCast, writeCast } = require('../niceness.js');

const SAMPLE = 'line 1\nline 2\nline 3\n  ╔═════╗\n  ║ ^ ^ ║\n  ╚═════╝';

test('buildAsciinemaCast: produces v2 header on line 1', () => {
  const cast = buildAsciinemaCast(SAMPLE, { timestamp: 1700000000 });
  const lines = cast.split('\n');
  const header = JSON.parse(lines[0]);
  assert.strictEqual(header.version, 2);
  assert.strictEqual(header.timestamp, 1700000000);
  assert.ok(header.width > 0);
  assert.ok(header.height > 0);
  assert.strictEqual(typeof header.title, 'string');
});

test('buildAsciinemaCast: each event is a [time, "o", data] triple', () => {
  const cast = buildAsciinemaCast(SAMPLE, { timestamp: 1700000000 });
  const lines = cast.split('\n').filter(l => l.length);
  // header + N event rows
  assert.ok(lines.length >= 5);
  for (let i = 1; i < lines.length; i++) {
    const ev = JSON.parse(lines[i]);
    assert.ok(Array.isArray(ev));
    assert.strictEqual(ev.length, 3);
    assert.strictEqual(typeof ev[0], 'number');
    assert.strictEqual(ev[1], 'o');
    assert.strictEqual(typeof ev[2], 'string');
  }
});

test('buildAsciinemaCast: event times are monotonically increasing', () => {
  const cast = buildAsciinemaCast(SAMPLE, { timestamp: 1700000000 });
  const lines = cast.split('\n').filter(l => l.length);
  let prev = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = JSON.parse(lines[i])[0];
    assert.ok(t > prev, `time ${t} not > ${prev}`);
    prev = t;
  }
});

test('buildAsciinemaCast: every text line becomes an event', () => {
  const text = 'a\nb\nc';
  const cast = buildAsciinemaCast(text, { timestamp: 1, finalPause: 0 });
  const events = cast.split('\n').filter(l => l.length).slice(1);
  // 3 text events + 1 final hold event
  assert.strictEqual(events.length, 4);
  assert.match(JSON.parse(events[0])[2], /a/);
  assert.match(JSON.parse(events[1])[2], /b/);
  assert.match(JSON.parse(events[2])[2], /c/);
});

test('buildAsciinemaCast: output ends each line with CRLF for asciinema players', () => {
  const cast = buildAsciinemaCast('hello', { timestamp: 1, finalPause: 0 });
  const events = cast.split('\n').filter(l => l.length).slice(1);
  assert.match(JSON.parse(events[0])[2], /\r\n$/);
});

test('buildAsciinemaCast: lineDelay option controls pacing', () => {
  const a = buildAsciinemaCast('x\ny', { lineDelay: 0.1, initialPause: 0, finalPause: 0, timestamp: 1 });
  const b = buildAsciinemaCast('x\ny', { lineDelay: 0.5, initialPause: 0, finalPause: 0, timestamp: 1 });
  const aT = JSON.parse(a.split('\n').filter(l => l.length).slice(1)[1])[0];
  const bT = JSON.parse(b.split('\n').filter(l => l.length).slice(1)[1])[0];
  assert.ok(bT > aT * 4, `expected 5x pacing, got ${aT} vs ${bT}`);
});

test('writeCast: writes a parseable cast file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-cast-'));
  const dest = path.join(tmp, 'card.cast.json');
  writeCast(SAMPLE, dest, { timestamp: 1700000000 });
  const text = fs.readFileSync(dest, 'utf8');
  const header = JSON.parse(text.split('\n')[0]);
  assert.strictEqual(header.version, 2);
  fs.rmSync(tmp, { recursive: true, force: true });
});
