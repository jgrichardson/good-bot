'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  MCP_PROTOCOL_VERSION, handleMcpMessage, rpcError,
} = require('../mcp.js');
const { buildMcpTools, PKG_VERSION } = require('../niceness.js');

const CLI = path.join(__dirname, '..', 'niceness.js');

// A tiny fake server for the pure dispatch tests.
function fakeServer(over) {
  return Object.assign({
    serverInfo: { name: 'good-bot', version: PKG_VERSION },
    tools: [
      { name: 'echo', description: 'echoes', inputSchema: { type: 'object', properties: {} },
        run: args => `echo:${JSON.stringify(args)}` },
      { name: 'boom', description: 'throws', inputSchema: { type: 'object', properties: {} },
        run: () => { throw new Error('kaboom'); } },
    ],
  }, over || {});
}

// ---- handleMcpMessage: pure protocol dispatch ------------------------------

test('initialize: echoes the client protocolVersion + advertises tools', () => {
  const r = handleMcpMessage({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }, fakeServer());
  assert.strictEqual(r.jsonrpc, '2.0');
  assert.strictEqual(r.id, 1);
  assert.strictEqual(r.result.protocolVersion, '2025-06-18');
  assert.deepStrictEqual(r.result.capabilities, { tools: {} });
  assert.strictEqual(r.result.serverInfo.name, 'good-bot');
  assert.strictEqual(r.result.serverInfo.version, PKG_VERSION);
});

test('initialize: falls back to our protocol version when the client omits one', () => {
  const r = handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, fakeServer());
  assert.strictEqual(r.result.protocolVersion, MCP_PROTOCOL_VERSION);
});

test('notifications get NO response (initialized, cancelled, unknown)', () => {
  const srv = fakeServer();
  assert.strictEqual(handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, srv), null);
  assert.strictEqual(handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/cancelled' }, srv), null);
  assert.strictEqual(handleMcpMessage({ jsonrpc: '2.0', method: 'no/such/notification' }, srv), null);
});

test('tools/list: returns name + description + inputSchema per tool', () => {
  const r = handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, fakeServer());
  assert.strictEqual(r.result.tools.length, 2);
  for (const t of r.result.tools) {
    assert.strictEqual(typeof t.name, 'string');
    assert.strictEqual(typeof t.description, 'string');
    assert.strictEqual(t.inputSchema.type, 'object');
    assert.ok(!('run' in t), 'implementation must not leak over the wire');
  }
});

test('tools/call: runs the tool and wraps the result in a text content block', () => {
  const r = handleMcpMessage({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { a: 1 } },
  }, fakeServer());
  assert.deepStrictEqual(r.result.content, [{ type: 'text', text: 'echo:{"a":1}' }]);
  assert.ok(!r.result.isError);
});

test('tools/call: a throwing tool becomes an in-band isError result, not a crash', () => {
  const r = handleMcpMessage({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'boom' },
  }, fakeServer());
  assert.strictEqual(r.result.isError, true);
  assert.match(r.result.content[0].text, /kaboom/);
});

test('tools/call: unknown tool → JSON-RPC -32602', () => {
  const r = handleMcpMessage({
    jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' },
  }, fakeServer());
  assert.strictEqual(r.error.code, -32602);
  assert.match(r.error.message, /nope/);
});

test('unknown method → -32601; ping → {}; malformed → -32600', () => {
  const srv = fakeServer();
  assert.strictEqual(handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'bogus/method' }, srv).error.code, -32601);
  assert.deepStrictEqual(handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'ping' }, srv).result, {});
  assert.strictEqual(handleMcpMessage(null, srv).error.code, -32600);
  assert.strictEqual(handleMcpMessage([1, 2], srv).error.code, -32600);
  assert.strictEqual(handleMcpMessage({ jsonrpc: '2.0', id: 8 }, srv).error.code, -32600);
});

test('rpcError: undefined id normalizes to null (parse-error shape)', () => {
  assert.strictEqual(rpcError(undefined, -32700, 'Parse error').id, null);
});

// ---- buildMcpTools: the three good-bot tools -------------------------------

test('buildMcpTools: exposes exactly the three read-only tools', () => {
  const tools = buildMcpTools({ demo: true });
  assert.deepStrictEqual(tools.map(t => t.name), ['niceness_report', 'niceness_stats', 'niceness_roast']);
});

test('buildMcpTools demo: report is an ANSI-free card, stats is parseable JSON, roast roasts', () => {
  const tools = buildMcpTools({ demo: true });
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  const card = byName.niceness_report.run({});
  assert.match(card, /REPORT CARD/);
  assert.match(card, /1820 messages/);
  assert.ok(!/\x1b\[/.test(card), 'card must be ANSI-stripped');
  const rep = JSON.parse(byName.niceness_stats.run({}));
  assert.strictEqual(rep.generated_with, 'good-bot');
  assert.strictEqual(rep.score.niceness, 92);
  assert.ok(!('exhibits' in rep), 'stats tool never includes quotes');
  const roast = byName.niceness_roast.run({});
  assert.match(roast, /THE ROAST/);
  assert.ok(!/\x1b\[/.test(roast), 'roast must be ANSI-stripped');
});

// ---- end-to-end: spawn the real server, speak real frames ------------------

function mcpSession(frames, opts) {
  opts = opts || {};
  const r = spawnSync(process.execPath, [CLI, '--mcp'].concat(opts.args || ['--demo']), {
    input: frames.map(f => (typeof f === 'string' ? f : JSON.stringify(f))).join('\n') + '\n',
    encoding: 'utf8',
    env: opts.env || process.env,
    cwd: opts.cwd || process.cwd(),
    timeout: 30000,
  });
  assert.strictEqual(r.status, 0, `server exited ${r.status}: ${r.stderr}`);
  const lines = r.stdout.split('\n').filter(l => l.trim());
  // The privacy contract for --mcp: stdout is protocol frames ONLY.
  const parsed = lines.map(l => JSON.parse(l));
  return { parsed, byId: new Map(parsed.map(p => [p.id, p])), stderr: r.stderr };
}

test('E2E --mcp --demo: initialize + tools/list + tools/call round-trip as valid JSON-RPC', () => {
  const { parsed, byId } = mcpSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'niceness_report', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'niceness_stats', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'niceness_roast', arguments: {} } },
  ]);
  assert.strictEqual(parsed.length, 5, 'five requests → five responses, notification → none');
  for (const p of parsed) assert.strictEqual(p.jsonrpc, '2.0');

  const init = byId.get(1).result;
  assert.strictEqual(init.protocolVersion, '2025-06-18');         // echo, not ours
  assert.deepStrictEqual(init.capabilities, { tools: {} });
  assert.strictEqual(init.serverInfo.name, 'good-bot');
  assert.strictEqual(init.serverInfo.version, PKG_VERSION);

  const tools = byId.get(2).result.tools;
  assert.deepStrictEqual(tools.map(t => t.name), ['niceness_report', 'niceness_stats', 'niceness_roast']);

  const card = byId.get(3).result;
  assert.strictEqual(card.content[0].type, 'text');
  assert.match(card.content[0].text, /REPORT CARD/);
  assert.match(card.content[0].text, /1820 messages/);
  assert.ok(!/\x1b\[/.test(card.content[0].text), 'no ANSI over the wire');

  const stats = JSON.parse(byId.get(4).result.content[0].text);
  assert.strictEqual(stats.generated_with, 'good-bot');
  assert.strictEqual(stats.score.niceness, 92);

  assert.match(byId.get(5).result.content[0].text, /THE ROAST/);
});

test('E2E --mcp: unknown methods, unknown tools, and broken JSON answer with errors, not crashes', () => {
  const { parsed, byId } = mcpSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { jsonrpc: '2.0', id: 2, method: 'resources/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'no_such_tool' } },
    'this is not json {{{',
    { jsonrpc: '2.0', id: 4, method: 'ping' },
  ]);
  assert.strictEqual(parsed.length, 5);
  assert.strictEqual(byId.get(2).error.code, -32601);
  assert.strictEqual(byId.get(3).error.code, -32602);
  const parseErr = parsed.find(p => p.error && p.error.code === -32700);
  assert.ok(parseErr, 'broken JSON → -32700');
  assert.strictEqual(parseErr.id, null);
  // …and the server kept serving afterwards:
  assert.deepStrictEqual(byId.get(4).result, {});
});

test('E2E --mcp without transcripts: tools/call returns an in-band isError result', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-mcp-empty-'));
  try {
    const { byId } = mcpSession([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'niceness_report' } },
    ], { args: [], env: Object.assign({}, process.env, { HOME: tmp }), cwd: tmp });
    assert.ok(byId.get(1).result, 'initialize still succeeds');
    const r = byId.get(2).result;
    assert.strictEqual(r.isError, true);
    assert.match(r.content[0].text, /No local AI-assistant transcripts/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
