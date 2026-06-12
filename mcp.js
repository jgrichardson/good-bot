'use strict';

// Minimal, hand-rolled MCP (Model Context Protocol) stdio server core —
// newline-delimited JSON-RPC 2.0 frames over stdin/stdout, zero dependencies.
// Same contract as scales.js / stats.js: this module is pure protocol — it
// knows nothing about transcripts or niceness. niceness.js wires the actual
// tool implementations in via `server.tools` and starts the loop with
// `startMcpStdioServer()` when invoked as `good-bot --mcp`.
//
// Protocol surface (the minimum a Claude Desktop / Claude Code client needs):
//   initialize                → protocolVersion echo, capabilities {tools:{}},
//                               serverInfo
//   notifications/*           → ignored (notifications get no response)
//   ping                      → {}
//   tools/list                → the wired tool descriptors
//   tools/call                → runs the tool; tool failures come back as an
//                               in-band result with isError:true (the server
//                               never crashes on a bad call)
//   anything else             → JSON-RPC -32601 Method not found
//
// Privacy: this file performs no I/O beyond the stdio streams handed to it.
// stdout carries protocol frames ONLY; diagnostics go to stderr.

// The protocol revision we speak. Clients send theirs in initialize; we echo
// it back (the shapes we use are identical across revisions), falling back to
// this when the client doesn't say.
const MCP_PROTOCOL_VERSION = '2024-11-05';

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } };
}

// Dispatch one parsed JSON-RPC message against a server descriptor
// ({ serverInfo, tools: [{ name, description, inputSchema, run(args) }] }).
// Returns the response object to write, or null for notifications (which
// must never be answered). Pure: no I/O — testable without a process.
function handleMcpMessage(msg, server) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return rpcError(null, -32600, 'Invalid Request');
  }
  const hasId = msg.id !== undefined && msg.id !== null;
  const id = msg.id;
  const method = msg.method;
  if (typeof method !== 'string') {
    return hasId ? rpcError(id, -32600, 'Invalid Request') : null;
  }
  if (method === 'initialize') {
    const params = msg.params || {};
    const pv = typeof params.protocolVersion === 'string' && params.protocolVersion
      ? params.protocolVersion : MCP_PROTOCOL_VERSION;
    return rpcResult(id, {
      protocolVersion: pv,
      capabilities: { tools: {} },
      serverInfo: server.serverInfo,
    });
  }
  // Notifications (initialized, cancelled, …) are acknowledged by silence.
  if (method.startsWith('notifications/')) return null;
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: server.tools.map(t => ({
        name: t.name, description: t.description, inputSchema: t.inputSchema,
      })),
    });
  }
  if (method === 'tools/call') {
    const params = msg.params || {};
    const tool = server.tools.find(t => t.name === params.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
    try {
      const text = tool.run(params.arguments || {});
      return rpcResult(id, { content: [{ type: 'text', text: String(text) }] });
    } catch (e) {
      // Tool-level failures are data, not protocol errors: the model gets a
      // readable explanation instead of the session falling over.
      return rpcResult(id, {
        content: [{ type: 'text', text: `Error: ${e && e.message ? e.message : e}` }],
        isError: true,
      });
    }
  }
  // Unknown request → error; unknown notification → silence (per JSON-RPC 2.0).
  return hasId ? rpcError(id, -32601, `Method not found: ${method}`) : null;
}

// Run the newline-delimited JSON-RPC loop over stdio. `io` is injectable for
// tests ({ input, output, errlog }); defaults to the process streams. The
// process exits naturally when the client closes stdin.
function startMcpStdioServer(server, io) {
  io = io || {};
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  const errlog = io.errlog || process.stderr;
  const send = obj => output.write(JSON.stringify(obj) + '\n');
  let buf = '';
  input.setEncoding('utf8');
  input.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '').trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); }
      catch (_) { send(rpcError(null, -32700, 'Parse error')); continue; }
      let resp;
      try { resp = handleMcpMessage(msg, server); }
      catch (e) {
        // A bug in dispatch must never kill the server mid-session.
        try { errlog.write(`good-bot --mcp internal error: ${e && e.stack || e}\n`); } catch (_) {}
        resp = (msg && msg.id !== undefined && msg.id !== null)
          ? rpcError(msg.id, -32603, `Internal error: ${e && e.message ? e.message : e}`)
          : null;
      }
      if (resp) send(resp);
    }
  });
}

module.exports = {
  MCP_PROTOCOL_VERSION, rpcResult, rpcError, handleMcpMessage, startMcpStdioServer,
};
