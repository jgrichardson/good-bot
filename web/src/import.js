// Parses Claude Desktop / claude.ai web / ChatGPT desktop / web export
// conversations.json files into an array of { text, ts } items.
// All parsing happens in the browser — the file is never uploaded.

export function parseImport(jsonText) {
  let raw;
  try { raw = JSON.parse(jsonText); }
  catch (e) { throw new Error(`not valid JSON: ${e.message}`); }

  // Try ChatGPT shape first (top-level array with mapping objects)
  if (Array.isArray(raw) && raw[0] && raw[0].mapping) {
    return { shape: 'ChatGPT export', items: parseChatGPT(raw) };
  }

  // Claude Desktop / claude.ai web export shape
  const convos = Array.isArray(raw) ? raw : (raw.conversations || []);
  if (convos.length && (convos[0].chat_messages || convos[0].messages)) {
    return { shape: 'Claude export', items: parseClaudeStyle(convos) };
  }

  // Try ChatGPT new shape — { "title": ..., "mapping": ... } at top
  if (raw && raw.mapping) {
    return { shape: 'ChatGPT export (single conversation)', items: parseChatGPT([raw]) };
  }

  return { shape: 'unrecognized', items: [] };
}

// Claude Desktop / claude.ai shape: each conversation has chat_messages or
// messages, each message has sender/role 'human' or 'user'.
function parseClaudeStyle(convos) {
  const items = [];
  for (const c of convos) {
    const msgs = c.chat_messages || c.messages || [];
    for (const m of msgs) {
      const who = m.sender || m.role || (m.author && m.author.role);
      if (who !== 'human' && who !== 'user') continue;
      let text = typeof m.text === 'string' ? m.text : '';
      if (!text && Array.isArray(m.content)) {
        text = m.content.filter((b) => b && (b.type === 'text' || b.text)).map((b) => b.text || '').join(' ');
      }
      text = String(text || '').trim();
      if (text) items.push({ text, ts: m.created_at || m.create_time || c.created_at || null });
    }
  }
  return items;
}

// ChatGPT shape: conversation.mapping is { uuid: { message: {...} } }. We
// walk the values, filter to author.role === 'user', and concat parts.
function parseChatGPT(convos) {
  const items = [];
  for (const c of convos) {
    const map = c.mapping || {};
    for (const k of Object.keys(map)) {
      const m = map[k] && map[k].message;
      if (!m) continue;
      const role = m.author && m.author.role;
      if (role !== 'user') continue;
      const parts = (m.content && m.content.parts) || [];
      const text = parts
        .map((p) => (typeof p === 'string' ? p : (p && p.text) || ''))
        .join(' ')
        .trim();
      if (!text) continue;
      const ts = m.create_time ? new Date(m.create_time * 1000).toISOString() : null;
      items.push({ text, ts });
    }
  }
  return items;
}
