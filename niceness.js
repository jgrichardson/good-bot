#!/usr/bin/env node
'use strict';

// How nice are you to your AI?
// Reads your local AI-coding-assistant history, looks at only the words YOU
// typed, and rates your bedside manner on a persona ladder from a saint
// (Mr. Rogers) down to a tyrant (Darth Vader).
//
// Usage:
//   npx good-bot                       # zero-install (default: 100% local)
//   good-bot --ai                      # opt-in: redacted sample → your local `claude`
//   good-bot --timeline                # niceness trend by month + time of day
//   good-bot --achievements            # unlockable badge gallery (earned + locked)
//   good-bot --roast                   # a 100% local roast of your AI manners (no AI, just receipts)
//   good-bot --svg                     # write a shareable image card (SVG, + PNG if possible)
//   good-bot --badge                   # print a README/profile badge for your rank
//   good-bot --scale spice             # alternate ladders (try --demo to see one)
//   good-bot --source codex            # pick a tool: claude | codex | gemini | continue | aider | all (default: all found)
//   good-bot --import conversations.json   # grade a Claude Desktop/web/Cowork data export
//   good-bot --demo                    # preview every rank on the current scale
//   good-bot --help
//
// Privacy: by default this reads your transcripts locally and sends NOTHING
// anywhere — no network, no LLM, no data collection. Quoted snippets shown in
// the card are redacted (emails, paths, tokens, IPs, numbers) since you may
// post the card. --ai is the only path that calls out, and it only ever sees
// a redacted sample. Needs only Node.js, which you already have.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { FACES, SCALES, SCALE_META } = require('./scales.js');
const { TIER_ORDER, TIER_LABEL, ACHIEVEMENTS, computeAchievementStats, evaluateAchievements, topUnlocked, DEMO_ACHIEVEMENT_STATS } = require('./achievements.js');
const { buildLabReport, demoLabRecords } = require('./analytics.js');

const SAMPLE_CHAR_BUDGET = 80000;   // ~20k tokens: a deeper read for --ai, still one call
const PER_MSG_TRUNCATE = 360;
const MODEL = process.env.NICENESS_MODEL || 'sonnet';
const REPO = process.env.NICENESS_REPO || 'jgrichardson/good-bot';

function argVal(name) {
  const a = process.argv.slice(2);
  const i = a.findIndex(x => x === name || x.startsWith(name + '='));
  if (i === -1) return null;
  return a[i].includes('=') ? a[i].split('=').slice(1).join('=') : a[i + 1];
}
let SCALE_NAME = argVal('--scale') || process.env.NICENESS_SCALE || 'people';
let SCALE = SCALES[SCALE_NAME] || SCALES.people;
let META = SCALE_META[SCALE_NAME] || SCALE_META.people;
function useScale(name) { SCALE_NAME = name; SCALE = SCALES[name] || SCALES.people; META = SCALE_META[name] || SCALE_META.people; }

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

// --- redaction (defense-in-depth; the safe default stays fully local) -----
const REDACTIONS = [
  [/\bhttps?:\/\/\S+/gi, '[link]'],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  [/\b(?:sk-[\w-]{8,}|dh_[\w-]{6,}|gh[pousr]_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[\w-]{8,})\b/g, '[secret]'],
  [/\beyJ[\w-]{6,}\.[\w-]+\.[\w-]+/g, '[token]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hash]'],
  [/(?:\/Users\/|\/home\/|~\/|[A-Za-z]:\\)[^\s'"`)]+/g, '[path]'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]'],
  [/\b(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]'],
  [/\$\s?\d[\d,]*(?:\.\d+)?\s?[mMkKbB]?\b/g, '[amount]'],
  [/\b\d[\d,]{4,}\b/g, '[number]'],
];
function sanitize(text) {
  return REDACTIONS.reduce((acc, [re, sub]) => acc.replace(re, sub), String(text || ''));
}

const COLOR = process.stdout.isTTY;
function color(str, code) { return COLOR ? `[${code}m${str}[0m` : str; }
function tierCode(idx, size) {
  const f = size <= 1 ? 0 : idx / (size - 1);
  if (f < 0.32) return '92';   // green
  if (f < 0.55) return '96';   // cyan
  if (f < 0.78) return '93';   // yellow
  return '91';                 // red
}
function shieldsColor(idx, size) {
  return { 92: 'brightgreen', 96: 'blue', 93: 'yellow', 91: 'red' }[tierCode(idx, size)];
}

// ---- ingestion sources ---------------------------------------------------
const TAG_NOISE = /^<(bash-input|bash-stdout|bash-stderr|command-name|command-message|command-args|local-command-stdout|local-command-stderr|task-notification|user-prompt-submit-hook|system-reminder)\b/;
const SELF_NOISE = /judging ONLY from the engineer's own typed messages|NICENESS_DATA v1|PERSONA LADDER \(1=nicest/;
const SR_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const CODEX_WRAP = /<(system_instruction|environment_context|user_instructions|user_query)>[\s\S]*?<\/\1>/g;

function isNoise(text) {
  if (!text) return true;
  if (TAG_NOISE.test(text)) return true;
  if (SELF_NOISE.test(text)) return true;
  if (text.startsWith('[Request interrupted') || text.startsWith('Caveat:')) return true;
  return false;
}

// Claude Code transcript entry → human texts.
function extractTexts(obj) {
  if (!obj || obj.type !== 'user' || obj.isMeta) return [];
  const content = obj.message && obj.message.content;
  let chunks = [];
  if (typeof content === 'string') chunks = [content];
  else if (Array.isArray(content)) chunks = content.filter(b => b && b.type === 'text').map(b => String(b.text || ''));
  const out = [];
  for (const raw of chunks) {
    const text = raw.replace(SR_BLOCK, '').trim();
    if (!isNoise(text)) out.push(text);
  }
  return out;
}

// Codex CLI rollout entry → human texts (event_msg / user_message).
function extractCodex(obj) {
  if (!obj || obj.type !== 'event_msg') return [];
  const p = obj.payload;
  if (!p || p.type !== 'user_message' || typeof p.message !== 'string') return [];
  const text = p.message.replace(CODEX_WRAP, '').replace(/<\/?user_query>/g, '').trim();
  return isNoise(text) ? [] : [text];
}

// Gemini CLI log entry (experimental). The tool keeps per-project prompt
// logs at ~/.gemini/tmp/<hash>/logs.json — a JSON array of rows shaped
// { sessionId, messageId, type: 'user', message: '<typed text>', timestamp }.
// Older/other builds have also written role+content (string or parts[].text)
// rows, so we accept those variants too. Anything we don't recognize is
// skipped silently — a weird row must never crash the run.
function extractGemini(obj) {
  if (!obj || typeof obj !== 'object') return [];
  const nested = obj.message && typeof obj.message === 'object' ? obj.message : null;
  const role = obj.role || obj.type || (nested && nested.role) || null;
  if (role !== 'user') return [];
  let c = obj.content != null ? obj.content : (nested ? nested.content : null);
  if (c == null && typeof obj.message === 'string') c = obj.message;   // tmp/*/logs.json shape
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) text = c.filter(p => p && (p.text || typeof p === 'string')).map(p => p.text || p).join(' ');
  else if (Array.isArray(obj.parts)) text = obj.parts.filter(p => p && p.text).map(p => p.text).join(' ');
  text = String(text || '').trim();
  return isNoise(text) ? [] : [text];
}

function collectGemini() {
  // Two best-effort homes for Gemini CLI history: the per-project prompt logs
  // at ~/.gemini/tmp/<hash>/logs.json (what current builds write) and any
  // JSONL session files under ~/.gemini/sessions (older layout). Either
  // missing simply contributes zero messages, same as an absent Codex dir.
  const sessions = collectFromSource({ root: path.join(os.homedir(), '.gemini', 'sessions'), extract: extractGemini });
  const items = sessions.items;
  let fileCount = sessions.fileCount;
  const tmpRoot = path.join(os.homedir(), '.gemini', 'tmp');
  let entries;
  try { entries = fs.readdirSync(tmpRoot, { withFileTypes: true }); } catch (_) { entries = []; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(tmpRoot, e.name, 'logs.json');
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    fileCount++;
    const rows = Array.isArray(data) ? data : (Array.isArray(data.logs) ? data.logs : []);
    for (const row of rows) {
      const texts = extractGemini(row);
      if (!texts.length) continue;
      const ts = row.timestamp || null;
      for (const t of texts) items.push({ text: t, ts, project: null });
    }
  }
  return { items, fileCount };
}

// Continue.dev session entry. Each session file is a JSON document at
// ~/.continue/sessions/<id>.json with a `history` (or `messages`) array of
// `{role, content}` items. extractContinue handles ONE such item; the full
// JSON document is unrolled by collectContinue below.
function extractContinue(obj) {
  if (!obj) return [];
  const role = obj.role;
  if (role !== 'user') return [];
  const c = obj.content;
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) text = c.filter(p => p && p.text).map(p => p.text).join(' ');
  text = String(text || '').trim();
  return isNoise(text) ? [] : [text];
}

function collectContinue() {
  const root = path.join(os.homedir(), '.continue', 'sessions');
  const items = [];
  let fileCount = 0;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return { items, fileCount }; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const file = path.join(root, e.name);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    fileCount++;
    const history = Array.isArray(data.history) ? data.history : (Array.isArray(data.messages) ? data.messages : []);
    const ts = data.createdAt || data.created_at || null;
    const project = data.title || data.workspace || null;
    for (const msg of history) {
      const texts = extractContinue(msg && msg.message ? msg.message : msg);
      for (const t of texts) items.push({ text: t, ts, project });
    }
  }
  return { items, fileCount };
}

// Aider stores chat history as markdown in `.aider.chat.history.md` files
// (experimental). ONLY `#### ` heading lines are the human's typed prompts —
// a multi-line prompt is a run of consecutive `#### ` lines. Everything
// unprefixed (aider's own replies, diffs, shell output) is skipped, and
// fenced code blocks are skipped wholesale so a quoted `#### ` inside one
// can't masquerade as a prompt.
function extractAiderMarkdown(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const flush = (buf) => { const t = buf.join('\n').trim(); if (!isNoise(t)) out.push(t); };
  let buf = null;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {           // fence open/close is aider output
      if (buf) { flush(buf); buf = null; }
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.startsWith('#### ') || line === '####') {  // bare '####' = blank line mid-prompt
      const piece = line === '####' ? '' : line.slice(5);
      if (buf) buf.push(piece); else buf = [piece];
    } else if (buf) {                                   // first unprefixed line ends the prompt
      flush(buf); buf = null;
    }
  }
  if (buf) flush(buf);
  return out;
}

function collectAider() {
  // Aider drops .aider.chat.history.md in whatever directory you ran it from.
  // We check the obvious spots without scanning the whole disk: the homedir
  // itself, the current directory, and one level under the common project
  // roots (~/Projects, ~/code, ~/src, ...). Users with chats elsewhere can
  // `--source aider --path <dir>` if we ever expose that knob.
  const roots = [
    os.homedir(),
    path.join(os.homedir(), 'Projects'),
    path.join(os.homedir(), 'code'),
    path.join(os.homedir(), 'src'),
    path.join(os.homedir(), 'dev'),
    path.join(os.homedir(), 'work'),
    path.join(os.homedir(), 'workspace'),
  ];
  const candidates = [
    path.join(os.homedir(), '.aider.chat.history.md'),
    path.join(process.cwd(), '.aider.chat.history.md'),
  ];
  for (const r of roots) {
    let entries;
    try { entries = fs.readdirSync(r, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      candidates.push(path.join(r, e.name, '.aider.chat.history.md'));
    }
  }
  const items = [];
  let fileCount = 0;
  const seen = new Set();
  for (const histPath of candidates) {
    if (seen.has(histPath)) continue;
    seen.add(histPath);
    let data;
    try { data = fs.readFileSync(histPath, 'utf8'); } catch (_) { continue; }
    fileCount++;
    const texts = extractAiderMarkdown(data);
    const ts = (() => { try { return fs.statSync(histPath).mtime.toISOString(); } catch (_) { return null; } })();
    const project = path.basename(path.dirname(histPath)) || null;
    for (const t of texts) items.push({ text: t, ts, project });
  }
  return { items, fileCount };
}

function walk(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function tsFromMs(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

// Claude Code's prompt log persists long-term (it is NOT pruned by the
// transcript retention that wipes ~/.claude/projects after a month), so it's
// the best "all time" source. Fall back to the recent project transcripts if
// the log is missing (e.g. a fresh or non-default install).
function collectClaude() {
  const hist = path.join(os.homedir(), '.claude', 'history.jsonl');
  let data;
  try { data = fs.readFileSync(hist, 'utf8'); } catch (_) { data = null; }
  if (data) {
    const items = [];
    for (const line of data.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch (_) { continue; }
      const text = String(o.display || '').replace(SR_BLOCK, '').trim();
      if (!isNoise(text)) items.push({ text, ts: tsFromMs(o.timestamp), project: o.project || null });
    }
    if (items.length) return { items, fileCount: 1 };
  }
  return collectFromSource({ root: path.join(os.homedir(), '.claude', 'projects'), extract: extractTexts });
}

const SOURCES = {
  claude: { label: 'Claude Code', collect: collectClaude },
  codex: { label: 'Codex', root: path.join(os.homedir(), '.codex', 'sessions'), extract: extractCodex },
  gemini: { label: 'Gemini CLI', collect: collectGemini },
  continue: { label: 'Continue.dev', collect: collectContinue },
  aider: { label: 'Aider', collect: collectAider },
};

function collectFromSource(src) {
  const items = [];
  const files = walk(src.root);
  for (const file of files) {
    let data;
    try { data = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const line of data.split('\n')) {
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch (_) { continue; }
      const texts = src.extract(obj);
      if (!texts.length) continue;
      const ts = obj.timestamp || (obj.payload && obj.payload.timestamp) || null;
      const project = obj.cwd || (obj.payload && obj.payload.cwd) || null;
      for (const t of texts) items.push({ text: t, ts, project });
    }
  }
  return { items, fileCount: files.length };
}

function collectMessages(which) {
  const wanted = which === 'all' || !which ? Object.keys(SOURCES) : [which];
  const items = [];
  const counts = {};
  let fileCount = 0;
  for (const name of wanted) {
    const src = SOURCES[name];
    if (!src) continue;
    const r = src.collect ? src.collect() : collectFromSource(src);
    if (r.items.length) { counts[src.label] = r.items.length; items.push(...r.items); }
    fileCount += r.fileCount;
  }
  return { items, counts, fileCount };
}

// Claude Desktop / web / Cowork "Export Data" file (conversations.json).
function importExport(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const convos = Array.isArray(raw) ? raw : (raw.conversations || []);
  const items = [];
  for (const c of convos) {
    const msgs = c.chat_messages || c.messages || [];
    for (const m of msgs) {
      const who = m.sender || m.role || (m.author && m.author.role);
      if (who !== 'human' && who !== 'user') continue;
      let text = typeof m.text === 'string' ? m.text : '';
      if (!text && Array.isArray(m.content)) {
        text = m.content.filter(b => b && (b.type === 'text' || b.text)).map(b => b.text || '').join(' ');
      }
      text = String(text || '').trim();
      if (!isNoise(text)) items.push({ text, ts: m.created_at || m.create_time || c.created_at || null, project: c.name || null });
    }
  }
  return items;
}

function spanOf(items) {
  let first = null, last = null;
  for (const it of items) {
    if (!it.ts) continue;
    if (!first || it.ts < first) first = it.ts;
    if (!last || it.ts > last) last = it.ts;
  }
  return { first, last };
}

// ---- scoring -------------------------------------------------------------
const STRONG_NICE = ['please', 'thank', 'thanks', 'thx', 'appreciate', 'appreciated', 'apologies', 'sorry', 'kudos', 'cheers'];
const SOFT_NICE = ['great job', 'nice work', 'good job', 'good work', 'well done', 'love it', "you're the best", 'good bot',
  'no rush', 'no worries', 'no problem', 'if you could', "if you don't mind", 'would you mind', 'could you', 'can you',
  'would you', 'when you get a chance', 'much appreciated', 'amazing', 'awesome', 'brilliant', 'fantastic', 'wonderful', 'perfect', 'beautiful'];
const NICE_EMOJI = ['🙏', '❤️', '😊', '🎉', '💯', '🥳', '🙌'];
const STRONG_MEAN = ['fuck', 'fucking', 'shit', 'bullshit', 'goddamn', 'dammit', 'stupid', 'idiot', 'moron', 'dumb', 'useless', 'pathetic', 'worthless', 'garbage'];
const SOFT_MEAN = ['wtf', 'what the hell', 'are you kidding', 'come on', 'seriously', 'ugh', 'terrible', 'awful',
  'wrong again', 'stop it', 'pay attention', 'listen to me', 'i said', 'why would you', "that's not what",
  'no no no', 'hate this'];
// Frustration is the most time-variable tone signal — it spikes during hard
// bugs and crunch where plain politeness barely moves.
const FRUSTRATION = ['still not', 'still broken', 'still failing', "that's not what", 'i said', 'i already', 'as i said',
  'not working', "doesn't work", "didn't work", "won't work", 'why is this', 'why does this', 'why are you',
  'read the', 'i told you', 'for the last time', 'same error', 'again,', 'again.', 'again?', 'no no'];
const ENTHUSIASM = ['love this', 'awesome', 'amazing', 'perfect', 'beautiful', 'great work', 'nailed it', "let's go", 'lets go', 'woo', 'yes!'];
const PRESSURE = ['asap', 'urgent', 'right now', 'hurry', 'quickly', 'immediately', 'time sensitive', 'we need this', 'just do', 'just make', 'just fix', 'just get'];
const ENTH_EMOJI = ['🎉', '🥳', '🙌', '💯', '😊', '🔥'];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countHits(low, terms) {
  let n = 0;
  for (const t of terms) {
    const re = /^\w+$/.test(t) ? new RegExp(`\\b${esc(t)}\\b`, 'g') : new RegExp(esc(t), 'g');
    n += (low.match(re) || []).length;
  }
  return n;
}
// A negator within ~2 words before a positive flips it: "no thanks", "not
// great", "don't bother saying please". This is the cheap-but-real step up
// from blind keyword counting.
const NEGATORS = "no|not|never|don'?t|doesn'?t|did'?nt|didn'?t|isn'?t|wasn'?t|aren'?t|can'?t|won'?t|stop|hardly|barely|without";
const NEG_RE = new RegExp(`\\b(?:${NEGATORS})\\b(?:\\s+\\w+){0,2}\\s+(?:${[...STRONG_NICE, ...SOFT_NICE].map(esc).join('|')})\\b`, 'g');
function negatedPositives(low) { return (low.match(NEG_RE) || []).length; }

// Whole-message ALL-CAPS detection: >70% of letters uppercase, ≥5 letters.
// Returns the binary signal that gets surfaced in the stats line on the card.
function shouty(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 5) return false;
  return text.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
}

// Counts standalone ALL-CAPS words (≥3 letters) in a message. Catches the
// 'fix this NOW' or 'WHY are you doing it like THAT' pattern that the
// whole-message threshold misses. Capped to avoid runaway scores on long
// messages that happen to mix some normal-case and all-caps words.
function shoutyWordCount(text) {
  if (!text) return 0;
  const matches = String(text).match(/\b[A-Z]{3,}\b/g) || [];
  // Exclude common short technical acronyms that aren't shouting (URL, API,
  // JSON, SQL, CSS, HTML, XML, HTTP, HTTPS, REST, JWT, AWS, GCP, IDE, CLI,
  // SDK, NPM, USB, GPU, CPU, RAM, RAID, UUID, ULID).
  const ACRONYMS = new Set([
    'URL','API','JSON','SQL','CSS','HTML','XML','HTTP','HTTPS','REST','JWT',
    'AWS','GCP','GCE','IDE','CLI','SDK','NPM','USB','GPU','CPU','RAM','RAID',
    'UUID','ULID','TLS','SSH','DNS','PDF','PNG','JPG','SVG','CSV','YAML','TOML',
    'OK','LGTM','TLDR','TLDR;','IMO','IMHO','FYI','BTW','TBH','TIL','PR','CI','CD',
    'OS','IP','MAC','UI','UX','QA','AI','ML','GPT','LLM','RAG','MVP',
  ]);
  const real = matches.filter(w => !ACRONYMS.has(w));
  return Math.min(real.length, 5);
}
function scoreMessage(text) {
  const low = text.toLowerCase();
  const negated = negatedPositives(low);
  let nice = countHits(low, STRONG_NICE) * 2 + countHits(low, SOFT_NICE);
  for (const e of NICE_EMOJI) nice += text.split(e).length - 1;
  nice = Math.max(0, nice - negated * 2);                 // a negated "thanks" isn't gratitude
  let mean = countHits(low, STRONG_MEAN) * 3 + countHits(low, SOFT_MEAN) + negated;
  // CAPS detection: stronger weight + finer granularity than the old +1.
  // Whole-message yelling adds +3 (was +1). Each standalone ALL-CAPS word
  // (excluding tech acronyms) adds +1, capped at 5.
  const fullShout = shouty(text);
  const shoutWords = shoutyWordCount(text);
  mean += (fullShout ? 3 : 0) + shoutWords;
  mean += (text.match(/!{3,}|\?!/g) || []).length;
  const frust = countHits(low, FRUSTRATION) + (low.match(/\?{2,}/g) || []).length;
  let enth = (text.includes('!') ? 1 : 0) + countHits(low, ENTHUSIASM);
  for (const e of ENTH_EMOJI) enth += text.split(e).length - 1;
  const pres = countHits(low, PRESSURE);
  // mood: warmth minus harshness, with frustration as a softer negative.
  const mood = nice - mean - 0.6 * frust;
  return { nice, mean, frust, enth, pres, mood, fullShout, shoutWords };
}

// Score one message into a rich, self-contained record so any later
// aggregation (by month, hour, weekday, project, session) is a cheap sum and
// never re-runs the regexes.
function scoreRecord(it) {
  const text = typeof it === 'string' ? it : it.text;
  const ts = typeof it === 'string' ? null : it.ts;
  const project = (typeof it === 'object' && it.project) || null;
  const s = scoreMessage(text);
  const low = text.toLowerCase();
  return {
    text, ts, project,
    nice: s.nice, mean: s.mean, frust: s.frust, enth: s.enth, pres: s.pres, mood: s.mood, len: text.length,
    pleases: (low.match(/\bplease\b/g) || []).length,
    thanks: (low.match(/\b(?:thank|thanks|thx|ty)\b/g) || []).length,
    fbomb: (low.match(/\bfuck\w*\b/g) || []).length,
    apolog: (low.match(/\b(?:sorry|apolog|my bad)\w*\b/g) || []).length,
    shout: s.fullShout ? 1 : 0,
    shoutWords: s.shoutWords,
    exclaim: text.includes('!') ? 1 : 0,
  };
}
// Aggregate a set of records into a niceness score + a sig usable by
// pickPersona + raw tone axes. No re-scoring.
function aggregate(list) {
  const n = Math.max(list.length, 1);
  let nice = 0, mean = 0, thanks = 0, pleases = 0, apolog = 0, fbomb = 0, shout = 0, shoutWords = 0, exclaim = 0, chars = 0, frust = 0, enth = 0, pres = 0, pos = 0, neg = 0;
  for (const s of list) {
    nice += s.nice; mean += s.mean; thanks += s.thanks; pleases += s.pleases; apolog += s.apolog;
    fbomb += s.fbomb; shout += s.shout; shoutWords += (s.shoutWords || 0); exclaim += s.exclaim; chars += s.len; frust += s.frust; enth += s.enth; pres += s.pres;
    if (s.mood > 0) pos += 1; else if (s.mood < 0) neg += 1;
  }
  const niceness = clamp(50 + ((pos - 1.7 * neg) / n) * 140, 0, 100);
  return {
    n: list.length, niceness, avgLen: chars / n,
    pleaseRate: pleases / n, thanksRate: thanks / n, apologyRate: apolog / n,
    capsRate: shout / n, exclaimRate: exclaim / n, meanRate: mean / n, fbombRate: fbomb / n,
    frustRate: frust / n, enthRate: enth / n, presRate: pres / n,
    axes: { warmth: nice / n, frust: frust / n, terse: 1 - clamp((chars / n) / 200, 0, 1), enth: enth / n, pres: pres / n },
    hash: Math.round(pleases * 7 + thanks * 13 + list.length * 3 + mean * 17 + chars),
  };
}
function analyze(items) {
  const scored = items.map(scoreRecord);
  const sig = aggregate(scored);
  return {
    scored, niceness: sig.niceness, sig,
    stats: {
      messages: scored.length,
      pleases: scored.reduce((a, s) => a + s.pleases, 0),
      thanks: scored.reduce((a, s) => a + s.thanks, 0),
      fbombs: scored.reduce((a, s) => a + s.fbomb, 0),
      shouts: scored.reduce((a, s) => a + s.shout, 0),
      shoutWords: scored.reduce((a, s) => a + (s.shoutWords || 0), 0),
    },
  };
}

function scaleIndex(sig, size) {
  let score = sig.niceness;
  if (sig.fbombRate > 0.03) score -= 28;
  if (sig.capsRate > 0.05) score -= 16;
  if (sig.meanRate > 0.30) score -= 9;
  if (sig.apologyRate > 0.06) score += 9;
  if (sig.thanksRate > 0.15) score += 7;
  if (sig.pleaseRate > 0.15) score += 5;
  score = clamp(score, 0, 100);
  const base = Math.round(((100 - score) / 100) * (size - 1));
  return clamp(base + ((sig.hash % 3) - 1), 0, size - 1);
}
function personaFor(sig) { return SCALE[scaleIndex(sig, SCALE.length)]; }
function personaForNiceness(niceness) {
  return SCALE[scaleIndex({ niceness, fbombRate: 0, capsRate: 0, meanRate: 0, apologyRate: 0, thanksRate: 0, pleaseRate: 0, hash: 1 }, SCALE.length)];
}

// The niceness ladder is 1-D, so most people pile up near the neutral middle.
// On the flagship `people` scale we nudge *within the band* toward a persona
// that matches the dominant style — terse, apologetic, hype, CAPS — so the
// result has personality instead of everyone reading as "Switzerland".
function nameIdx(name) { return SCALE.findIndex(p => p.name === name); }
function styleRefine(idx, sig) {
  if (SCALE_NAME !== 'people' || SCALE.length < 22) return idx;
  const f = idx / (SCALE.length - 1); // 0 = nicest … 1 = meanest
  if (f >= 0.62) { // mean half — let real venom pick the villain
    if (sig.fbombRate > 0.04) return nameIdx('Darth Vader');
    if (sig.fbombRate > 0.012) return nameIdx('Gollum');
    if (sig.capsRate > 0.05) return nameIdx('Drill Sergeant');
    return idx;
  }
  if (f >= 0.40) { // neutral band — terseness/coolness decides the flavor
    if (sig.capsRate > 0.06) return nameIdx('Drill Sergeant');
    if (sig.avgLen < 32) return nameIdx('Clint Eastwood');
    if (sig.avgLen < 80) return nameIdx('Ron Swanson');
    if (sig.meanRate > 0.20) return nameIdx('Spock');
    return nameIdx('Switzerland');
  }
  // nice half — warmth style decides
  if (sig.apologyRate > 0.05) return nameIdx('The Canadian');
  if (sig.exclaimRate > 0.35 && sig.thanksRate > 0.12) return nameIdx('Golden Retriever');
  if (sig.exclaimRate > 0.22) return nameIdx('Oprah');
  if (sig.thanksRate > 0.20) return nameIdx('Dolly Parton');
  return idx;
}
function pickPersona(sig) {
  const idx = styleRefine(scaleIndex(sig, SCALE.length), sig);
  return SCALE[clamp(idx, 0, SCALE.length - 1)];
}

// ---- trends (--timeline) -------------------------------------------------
// Everything here scores a slice of history RELATIVE TO YOUR OWN BASELINE, so
// subtle shifts (a few points) read as visible σ moves up/down instead of
// every bar sitting half-full on an absolute 0-100 scale.
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(vals) {
  if (!vals.length) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
  return vals.map(v => SPARK[clamp(Math.floor(((v - mn) / span) * 8), 0, 7)]).join('');
}
const EIGHTHS = '▏▎▍▌▋▊▉█';
function fmtCount(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); }
function ema(a, al) { const o = []; let p = null; for (const v of a) { p = p == null ? v : al * v + (1 - al) * p; o.push(p); } return o; }
function pad(s, w) { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }
function fillBar(frac, width, code) {
  const f = clamp(frac, 0, 1) * width;
  const full = Math.floor(f), rem = f - full;
  const partial = (full < width && rem > 0.06) ? EIGHTHS[clamp(Math.floor(rem * 8), 0, 7)] : '';
  const empty = Math.max(0, width - full - (partial ? 1 : 0));
  return color('█'.repeat(full) + partial, code) + color('░'.repeat(empty), '90');
}

function groupRecords(list, keyFn) {
  const m = new Map();
  for (const s of list) {
    const k = keyFn(s);
    if (k == null) continue;
    (m.get(k) || m.set(k, []).get(k)).push(s);
  }
  return m;
}
function periodKey(ts, gran) {
  const d = new Date(ts);
  if (gran === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}
function periodLabel(key, gran) {
  if (gran === 'month') { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} '${y.slice(2)}`; }
  const d = new Date(key); return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function buildTimeBuckets(scored) {
  const withTs = scored.filter(s => s.ts);
  const months = new Set(withTs.map(s => s.ts.slice(0, 7)));
  const gran = months.size <= 4 ? 'week' : 'month';
  const minN = Math.max(8, Math.round(withTs.length * 0.01));
  const map = groupRecords(withTs, s => periodKey(s.ts, gran));
  const periods = [...map.entries()].filter(([, l]) => l.length >= minN)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, list]) => ({ key, label: periodLabel(key, gran), list }));
  return { gran, periods };
}

const AXIS_WORD = {
  warmth: ['warmer', 'cooler'], frust: ['tenser', 'calmer'], terse: ['terser', 'chattier'],
  enth: ['more upbeat', 'flatter'], pres: ['more rushed', 'more relaxed'],
};
function axesBaseline(arr) {
  const r = {};
  for (const k of Object.keys(AXIS_WORD)) { const xs = arr.map(a => a[k]); r[k] = { mean: mean(xs), std: Math.max(std(xs), 1e-9) }; }
  return r;
}
function dominantAxis(axes, base) {
  let best = { axis: 'warmth', z: 0 };
  for (const k of Object.keys(base)) { const z = (axes[k] - base[k].mean) / base[k].std; if (Math.abs(z) > Math.abs(best.z)) best = { axis: k, z }; }
  return best;
}
function zLabel(z, dom) {
  if (Math.abs(z) < 0.4) return color('≈ baseline', '90');
  const word = AXIS_WORD[dom.axis][dom.z >= 0 ? 0 : 1];
  return color(`${z > 0 ? '▲' : '▼'} ${Math.abs(z).toFixed(1)}σ ${word}`, z > 0 ? '92' : '91');
}
function relRow(label, val, lo, hi, persona, z, dom, n) {
  const code = tierCode(SCALE.indexOf(persona), SCALE.length);
  const bar = fillBar((val - lo) / ((hi - lo) || 1), 20, code);
  const cnt = n != null ? ' ' + color(`(${fmtCount(n)})`, '90') : '';
  return `      ${color(pad(label, 10), '97')} ${bar} ${persona.emoji} ${color(pad(persona.name, 14), '90')} ${zLabel(z, dom)}${cnt}`;
}
// Render one dimension (time / hour / weekday / project) as baseline-relative
// rows. `values` defaults to each group's own niceness; pass it explicitly to
// substitute smoothed or AI-rated scores.
function renderDim(title, groups, baseline, values) {
  if (groups.length < 2) return [];
  const ag = groups.map(g => aggregate(g.list));
  if (!values) values = ag.map(a => a.niceness);
  const sd = Math.max(std(values), 2);
  const lo = Math.min(...values), hi = Math.max(...values);
  const [blo, bhi] = (hi - lo < 4) ? [baseline - 6, baseline + 6] : [lo, hi];
  const ab = axesBaseline(ag.map(a => a.axes));
  const out = ['', color('   ' + title, '1;97')];
  groups.forEach((g, i) => {
    out.push(relRow(g.label, values[i], blo, bhi, pickPersona(ag[i]), (values[i] - baseline) / sd, dominantAxis(ag[i].axes, ab), g.list.length));
  });
  return out;
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function todGroups(withTs) {
  const minN = Math.max(8, Math.round(withTs.length * 0.01));
  const byH = groupRecords(withTs, s => new Date(s.ts).getHours());
  const groups = [];
  for (const [name, lo, hi] of [['night', 0, 6], ['morning', 6, 12], ['afternoon', 12, 18], ['evening', 18, 24]]) {
    let list = [];
    for (let h = lo; h < hi; h++) { const e = byH.get(h); if (e) list = list.concat(e); }
    if (list.length >= minN) groups.push({ label: name, list });
  }
  return groups;
}
function weekdayGroups(withTs) {
  const minN = Math.max(8, Math.round(withTs.length * 0.01));
  const byD = groupRecords(withTs, s => (new Date(s.ts).getDay() + 6) % 7);
  const groups = [];
  for (let d = 0; d < 7; d++) { const e = byD.get(d); if (e && e.length >= minN) groups.push({ label: WD[d], list: e }); }
  return groups;
}
function projectGroups(scored) {
  const minN = Math.max(8, Math.round(scored.length * 0.01));
  const m = groupRecords(scored.filter(s => s.project), s => String(s.project).split('/').filter(Boolean).pop());
  return [...m.entries()].filter(([, l]) => l.length >= minN).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([k, l]) => ({ label: k, list: l }));
}
function renderPatience(withTs) {
  const sorted = withTs.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const GAP = 30 * 60 * 1000;
  const sessions = [];
  let cur = [], last = null;
  for (const s of sorted) { const t = Date.parse(s.ts); if (last != null && t - last > GAP) { if (cur.length) sessions.push(cur); cur = []; } cur.push(s); last = t; }
  if (cur.length) sessions.push(cur);
  const starts = [], ends = [];
  for (const ss of sessions) { if (ss.length < 6) continue; const k = Math.max(1, Math.floor(ss.length / 3)); starts.push(aggregate(ss.slice(0, k)).niceness); ends.push(aggregate(ss.slice(-k)).niceness); }
  if (starts.length < 5) return [];
  const s0 = mean(starts), s1 = mean(ends), d = s1 - s0;
  const ps = personaForNiceness(s0), pe = personaForNiceness(s1);
  const note = d < -2 ? `you cool off as a session drags on (${Math.round(d)} pts)` : d > 2 ? `you warm up as a session goes on (+${Math.round(d)} pts)` : 'your tone holds steady through a session';
  return ['', color('   🧵 Patience within a session', '1;97'),
    `      ${color(pad('start', 10), '97')} ${ps.emoji} ${color(ps.name, '90')}  →  ${pad('end', 5)} ${pe.emoji} ${color(pe.name, '90')}`,
    '   ' + color(note + ` (across ${starts.length} sessions)`, '90')];
}
function volatilityWord(values) {
  const v = std(values);
  return (v < 3 ? 'Very even-keeled' : v < 7 ? 'Some ebb and flow' : 'Moody — big swings') + ` (±${v.toFixed(0)} pts)`;
}

// One extra Claude call that rates each period's true sentiment 0-100.
function aiPeriodScorer(periods) {
  const blocks = periods.map((p, i) => `[P${i}] ${p.label}\n${buildSample(p.list, 1400).slice(0, 6).join(' | ')}`).join('\n---\n');
  const prompt = `Rate how warmly the engineer treats their AI assistant in EACH labeled period below, 0-100 (0=hostile, 50=neutral/transactional, 100=warm). Read genuine tone, not keyword counts. Output ONE line per period, exactly "P<i>: <number>", nothing else.\n---\n${blocks}`;
  const res = spawnSync('claude', ['-p', '--model', MODEL], { input: prompt, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (res.status !== 0 || !res.stdout) return null;
  const m = new Map();
  for (const mt of res.stdout.matchAll(/^P(\d+):\s*(\d+(?:\.\d+)?)/gm)) { const i = +mt[1]; if (periods[i]) m.set(periods[i].key, clamp(+mt[2], 0, 100)); }
  return m.size ? m : null;
}

function renderTrends(scored, baseline, periodScorer) {
  const withTs = scored.filter(s => s.ts);
  if (withTs.length < 10) return color('\n   (not enough timestamped history for trends)', '90');
  const out = [];
  const { gran, periods } = buildTimeBuckets(scored);
  if (periods.length >= 2) {
    const ag = periods.map(p => aggregate(p.list));
    let values = ag.map(a => a.niceness);
    if (periodScorer) {
      let m = null; try { m = periodScorer(periods); } catch (_) { m = null; }
      if (m) values = periods.map((p, i) => (m.get(p.key) != null ? m.get(p.key) : ag[i].niceness));
    }
    values = ema(values, 0.6);
    out.push(...renderDim(`Niceness vs your baseline (${Math.round(baseline)}) — by ${gran}${periodScorer ? ' · AI-rated' : ''}`, periods, baseline, values));
    let hi = 0, loI = 0;
    values.forEach((v, i) => { if (v > values[hi]) hi = i; if (v < values[loI]) loI = i; });
    out.push('   ' + color(`${volatilityWord(values)} · warmest ${periods[hi].label}, coolest ${periods[loI].label}`, '90'));
  }
  out.push(...renderDim('By time of day', todGroups(withTs), baseline));
  out.push(...renderDim('By day of week', weekdayGroups(withTs), baseline));
  out.push(...renderDim('By project', projectGroups(scored), baseline));
  out.push(...renderPatience(withTs));
  return '\n' + out.join('\n');
}

// ---- card rendering ------------------------------------------------------
const EXHIBIT_MAX = 52;
function cleanExhibit(s, max = EXHIBIT_MAX) {
  let t = String(s).replace(/\s+/g, ' ').trim();
  t = t.replace(/^["“”'`]+/, '').replace(/["“”'`]+$/, '').trim();
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…';
  return t;
}
function wrap(text, width = 58) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
function banner(title) {
  const w = 48;
  const t = title.length > w ? title.slice(0, w) : title;
  const pad = w - t.length, left = Math.floor(pad / 2);
  return [
    color('  ┏' + '━'.repeat(w) + '┓', '90'),
    color('  ┃' + ' '.repeat(left) + t + ' '.repeat(pad - left) + '┃', '1'),
    color('  ┗' + '━'.repeat(w) + '┛', '90'),
  ];
}
// ---- achievements (badge definitions live in achievements.js) ------------
// Compact row for the report card: up to 3 rarest unlocked badges + a teaser
// pointing at the full --achievements gallery.
function achievementCardLines(result) {
  if (!result || !result.unlocked || !result.unlocked.length) return [];
  const top = topUnlocked(result.unlocked, 3);
  const more = result.unlocked.length - top.length;
  const tail = more > 0 ? ` (+${more} more — run --achievements)` : ' (run --achievements)';
  const text = `🏆 Unlocked: ${top.map(a => `${a.emoji} ${a.name}`).join(' · ')}${tail}`;
  return wrap(text, 55).map((l, i) => color((i ? '      ' : '   ') + l, i ? '90' : '93'));
}

// Full gallery: unlocked badges with flavor text, locked ones greyed with a
// hint. Legendary badges stay 🔒 ??? until earned — no spoilers.
function renderAchievementGallery(result, opts) {
  opts = opts || {};
  const lines = [''];
  lines.push(color(`  🏆  ACHIEVEMENTS · ${result.unlocked.length} of ${result.total} unlocked${opts.demo ? ' · demo data' : ''}`, '1;33'));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  for (const tier of TIER_ORDER) {
    const inTier = ACHIEVEMENTS.filter(a => a.tier === tier);
    const got = inTier.filter(a => result.unlocked.includes(a));
    lines.push('');
    lines.push(color(`  ${TIER_LABEL[tier]}  (${got.length}/${inTier.length})`, '1;97'));
    for (const a of inTier) {
      if (result.unlocked.includes(a)) {
        lines.push(`  ${color('✅', '92')} ${a.emoji} ${color(a.name, '1;97')} — ${a.desc}`);
      } else if (tier === 'legendary') {
        lines.push(color('  🔒 ??? — a legend awaits', '90'));
      } else {
        lines.push(color(`  🔒 ${a.emoji} ${a.name} — hint: ${a.hint}`, '90'));
      }
    }
  }
  lines.push('');
  lines.push(color('  ' + '─'.repeat(56), '90'));
  lines.push(color('  Earn them all. The basilisk is keeping score. #BeNiceToYourAI', '95'));
  lines.push('');
  return lines.join('\n');
}

function renderCard(persona, verdict, assessment, exhibits, stats, span, achievements) {
  const idx = SCALE.indexOf(persona);
  const pc = tierCode(idx, SCALE.length);
  const barW = 30;
  const filled = Math.round(((SCALE.length - idx) / SCALE.length) * barW);
  const bar = color('█'.repeat(filled), '92') + color('░'.repeat(barW - filled), '90');
  const face = FACES[persona.face].map(l => color(l, pc));
  const out = [''];
  for (const l of banner(META.title)) out.push(l);
  out.push('');
  out.push(`${face[0]}      ${persona.emoji}  ${color(persona.name.toUpperCase(), `1;${pc}`)}`);
  out.push(`${face[1]}      ${color(`“${persona.tag}”`, `3;${pc}`)}`);
  out.push(`${face[2]}`);
  out.push(`${face[3]}      ${META.ends[0]} ${bar} ${META.ends[1]}`);
  out.push('');
  if (verdict) out.push(`   ${color(`❝ ${verdict} ❞`, '1;97')}`);
  out.push('');
  for (const l of wrap(assessment || persona.blurb)) out.push(`   ${l}`);
  if (exhibits && exhibits.length) {
    out.push('');
    out.push(color('   📋 Exhibits entered into evidence:', '1;90'));
    for (const e of exhibits.slice(0, 3)) out.push(color(`      • “${cleanExhibit(e)}”`, '90'));
  }
  const achLines = achievementCardLines(achievements);
  if (achLines.length) {
    out.push('');
    for (const l of achLines) out.push(l);
  }
  out.push('');
  out.push(color('   ────────────────────────────────────────────────', '90'));
  // Surface ALL-CAPS shouting as a first-class stat alongside f-bombs.
  // We display the message-level count (how many messages were whole-message
  // shouts) — that's the most readable single number.
  const shoutsTxt = (stats.shouts || 0) > 0 ? ` · ${stats.shouts} ALL-CAPS` : '';
  out.push(color(`   📊 ${stats.messages} messages · ${stats.pleases} pleases · ${stats.thanks} thank-yous · ${stats.fbombs} f-bombs${shoutsTxt}`, '96'));
  if (span) out.push(color(`   🗓  ${span}`, '90'));
  out.push('');
  out.push(color(`   📣 How do YOU treat your AI? → github.com/${REPO}`, '1;95'));
  out.push(color('      Run it, post your card, tag a teammate. #BeNiceToYourAI', '95'));
  out.push('');
  return out.join('\n');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function dateSpan(first, last) {
  if (!first || !last) return null;
  const f = fmtDate(first), l = fmtDate(last);
  return f && l ? `${f} → ${l}` : null;
}
function localExhibits(scored, idx) {
  const sweet = scored.filter(m => m.nice > 0).sort((a, b) => b.nice - a.nice).slice(0, 2);
  const spicy = scored.filter(m => m.mean > 0).sort((a, b) => b.mean - a.mean).slice(0, 2);
  let picks;
  if (idx / SCALE.length < 0.45) picks = sweet;
  else if (idx / SCALE.length > 0.63) picks = spicy;
  else picks = [sweet[0], spicy[0]].filter(Boolean);
  return picks.filter(Boolean).map(m => cleanExhibit(sanitize(m.text), 100));
}

// ---- SVG / PNG image card + badge ---------------------------------------
function xmlEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const SVG_TIER = { 92: '#3fb950', 96: '#39c5cf', 93: '#d29922', 91: '#f85149' };
function renderSvg(persona, verdict, exhibits, stats, span) {
  const idx = SCALE.indexOf(persona);
  const accent = SVG_TIER[tierCode(idx, SCALE.length)];
  const W = 820, H = 460;
  const barW = 560, fill = Math.round(((SCALE.length - idx) / SCALE.length) * barW);
  const ex = (exhibits || []).slice(0, 2).map(e => cleanExhibit(e, 60));
  const lines = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, Menlo, Consolas, monospace">`);
  lines.push(`<rect width="${W}" height="${H}" rx="18" fill="#0d1117"/>`);
  lines.push(`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="none" stroke="#30363d" stroke-width="2"/>`);
  lines.push(`<text x="40" y="58" fill="#8b949e" font-size="20">${xmlEsc(META.title)}</text>`);
  lines.push(`<text x="40" y="150" font-size="64">${persona.emoji}</text>`);
  lines.push(`<text x="120" y="128" fill="${accent}" font-size="46" font-weight="bold">${xmlEsc(persona.name)}</text>`);
  lines.push(`<text x="122" y="162" fill="#c9d1d9" font-size="22" font-style="italic">${xmlEsc('“' + persona.tag + '”')}</text>`);
  lines.push(`<rect x="40" y="196" width="${barW}" height="14" rx="7" fill="#21262d"/>`);
  lines.push(`<rect x="40" y="196" width="${fill}" height="14" rx="7" fill="${accent}"/>`);
  lines.push(`<text x="${40 + barW + 12}" y="208" fill="#8b949e" font-size="14">${xmlEsc(META.ends[1].trim())}</text>`);
  if (verdict) lines.push(`<text x="40" y="258" fill="#f0f6fc" font-size="24" font-weight="bold">${xmlEsc('❝ ' + cleanExhibit(verdict, 64) + ' ❞')}</text>`);
  let y = 300;
  for (const e of ex) { lines.push(`<text x="40" y="${y}" fill="#8b949e" font-size="17">${xmlEsc('• “' + e + '”')}</text>`); y += 28; }
  lines.push(`<text x="40" y="404" fill="${accent}" font-size="17">${xmlEsc(`${stats.messages} messages · ${stats.pleases} pleases · ${stats.thanks} thank-yous · ${stats.fbombs} f-bombs`)}</text>`);
  lines.push(`<text x="40" y="432" fill="#8b949e" font-size="15">${xmlEsc('github.com/' + REPO + '   #BeNiceToYourAI')}</text>`);
  lines.push('</svg>');
  return lines.join('\n');
}
function tryRasterize(svgPath, pngPath, width = 1640) {
  const w = String(width);
  const attempts = [
    ['rsvg-convert', ['-w', w, '-o', pngPath, svgPath]],
    ['cairosvg', [svgPath, '-o', pngPath, '--output-width', w]],
    ['resvg', ['-w', w, svgPath, pngPath]],
    ['inkscape', [svgPath, '--export-type=png', `--export-filename=${pngPath}`, '-w', w]],
  ];
  if (process.platform === 'darwin') attempts.push(['qlmanage', ['-t', '-s', w, '-o', path.dirname(pngPath), svgPath]]);
  for (const [cmd, args] of attempts) {
    try {
      const r = spawnSync(cmd, args, { stdio: 'ignore' });
      if (r.status === 0) {
        if (cmd === 'qlmanage') {
          const ql = svgPath + '.png';
          if (fs.existsSync(ql)) fs.renameSync(ql, pngPath);
        }
        if (fs.existsSync(pngPath)) return cmd;
      }
    } catch (_) { /* try next */ }
  }
  return null;
}
function badgeMarkdown(persona) {
  const idx = SCALE.indexOf(persona);
  const enc = s => encodeURIComponent(String(s).replace(/-/g, '--').replace(/_/g, '__'));
  const url = `https://img.shields.io/badge/${enc('my AI thinks I am a')}-${enc(persona.name)}-${shieldsColor(idx, SCALE.length)}`;
  return `![good-bot](${url})\n\nMarkdown:\n[![good-bot](${url})](https://github.com/${REPO})`;
}

// ---- "Wrapped" share poster ---------------------------------------------
function computeWrapped(analysis) {
  const scored = analysis.scored;
  const withTs = scored.filter(s => s.ts);
  const { periods } = buildTimeBuckets(scored);
  const pdata = periods.map(p => { const a = aggregate(p.list); return { label: p.label, niceness: a.niceness, persona: pickPersona(a) }; });
  const best = (arr, sel, max) => arr.length ? arr.reduce((a, b) => ((max ? sel(b) > sel(a) : sel(b) < sel(a)) ? b : a)) : null;
  const tod = todGroups(withTs).map(g => ({ label: g.label, niceness: aggregate(g.list).niceness }));
  const proj = projectGroups(scored).map(g => { const a = aggregate(g.list); return { label: g.label, niceness: a.niceness, persona: pickPersona(a) }; });
  const niceM = scored.filter(s => s.nice > 0).sort((a, b) => b.nice - a.nice)[0];
  const meanM = scored.filter(s => (s.mean + s.frust) > 0).sort((a, b) => (b.mean + b.frust) - (a.mean + a.frust))[0];
  return {
    periods: pdata,
    warmest: best(pdata, p => p.niceness, true), coolest: best(pdata, p => p.niceness, false),
    spiciest: best(tod, p => p.niceness, false), calmest: best(tod, p => p.niceness, true),
    kindestProj: best(proj, p => p.niceness, true), harshestProj: best(proj, p => p.niceness, false),
    nicest: niceM ? cleanExhibit(sanitize(niceM.text), 58) : null,
    spicy: meanM ? cleanExhibit(sanitize(meanM.text), 58) : null,
  };
}
// A vector robot head (no emoji font needed) whose expression tracks the tier.
function robotHead(x, y, s, accent, face) {
  const cx = x + s / 2, sw = Math.max(3, s * 0.035);
  const p = [`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.18}" fill="#0b0f14" stroke="${accent}" stroke-width="${sw}"/>`];
  p.push(`<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y - s * 0.16}" stroke="${accent}" stroke-width="${sw}"/><circle cx="${cx}" cy="${y - s * 0.19}" r="${s * 0.05}" fill="${accent}"/>`);
  const eyeY = y + s * 0.42, ex1 = x + s * 0.3, ex2 = x + s * 0.7;
  if (face === 'mean') {
    const d = s * 0.085;
    for (const ex of [ex1, ex2]) p.push(`<line x1="${ex - d}" y1="${eyeY - d}" x2="${ex + d}" y2="${eyeY + d}" stroke="${accent}" stroke-width="${s * 0.045}" stroke-linecap="round"/><line x1="${ex - d}" y1="${eyeY + d}" x2="${ex + d}" y2="${eyeY - d}" stroke="${accent}" stroke-width="${s * 0.045}" stroke-linecap="round"/>`);
  } else {
    p.push(`<circle cx="${ex1}" cy="${eyeY}" r="${s * 0.09}" fill="${accent}"/><circle cx="${ex2}" cy="${eyeY}" r="${s * 0.09}" fill="${accent}"/>`);
  }
  const my = y + s * 0.72, mw = s * 0.42;
  if (face === 'happy') p.push(`<path d="M ${cx - mw / 2} ${my} Q ${cx} ${my + s * 0.16} ${cx + mw / 2} ${my}" stroke="${accent}" stroke-width="${s * 0.045}" fill="none" stroke-linecap="round"/>`);
  else if (face === 'mean') p.push(`<path d="M ${cx - mw / 2} ${my + s * 0.07} Q ${cx} ${my - s * 0.09} ${cx + mw / 2} ${my + s * 0.07}" stroke="${accent}" stroke-width="${s * 0.045}" fill="none" stroke-linecap="round"/>`);
  else p.push(`<line x1="${cx - mw / 2}" y1="${my}" x2="${cx + mw / 2}" y2="${my}" stroke="${accent}" stroke-width="${s * 0.045}" stroke-linecap="round"/>`);
  return p.join('');
}
function wrappedSvg(persona, stats, span, baseline, d) {
  const W = 1080, H = 1920;
  const accent = SVG_TIER[tierCode(SCALE.indexOf(persona), SCALE.length)];
  const E = xmlEsc;
  const t = (x, y, s, fill, txt, extra = '') => `<text x="${x}" y="${y}" font-size="${s}" fill="${fill}" ${extra}>${E(txt)}</text>`;
  const card = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#0f151c" stroke="#1c2530" stroke-width="1.5"/>`;
  const L = [];
  L.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Helvetica Neue', Arial, sans-serif">`);
  L.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070a"/><stop offset="1" stop-color="${accent}" stop-opacity="0.18"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.22" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.33"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`);
  L.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`);

  // brand
  L.push(robotHead(80, 80, 40, '#e6edf3', 'neutral'));
  L.push(t(136, 112, 38, '#e6edf3', 'good-bot', 'font-weight="700"'));
  L.push(t(W - 80, 112, 38, accent, 'WRAPPED', 'text-anchor="end" font-weight="800" letter-spacing="6"'));
  if (span) L.push(t(80, 170, 28, '#8b949e', span));

  // hero
  L.push(card(60, 210, W - 120, 430));
  L.push(robotHead(110, 300, 160, accent, persona.face));
  L.push(t(330, 320, 30, '#8b949e', 'YOU TREAT YOUR AI LIKE…', 'letter-spacing="3"'));
  L.push(t(330, 410, 78, accent, persona.name, 'font-weight="800"'));
  L.push(t(330, 462, 34, '#c9d1d9', `“${persona.tag}”`, 'font-style="italic"'));
  const frac = clamp(baseline, 0, 100) / 100;
  L.push(`<rect x="330" y="520" width="640" height="22" rx="11" fill="#1c2530"/><rect x="330" y="520" width="${Math.round(640 * frac)}" height="22" rx="11" fill="${accent}"/>`);
  L.push(t(330, 590, 26, '#8b949e', `niceness ${Math.round(baseline)} / 100`));

  // stat grid
  L.push(card(60, 670, W - 120, 200));
  const cells = [['messages', fmtCount(stats.messages)], ['pleases', fmtCount(stats.pleases)], ['thank-yous', fmtCount(stats.thanks)], ['f-bombs', fmtCount(stats.fbombs)]];
  cells.forEach(([lab, val], i) => {
    const cx = 80 + i * 235 + 117;
    L.push(t(cx, 775, 66, accent, val, 'text-anchor="middle" font-weight="800"'));
    L.push(t(cx, 818, 26, '#8b949e', lab, 'text-anchor="middle"'));
  });

  // tone chart
  L.push(card(60, 900, W - 120, 360));
  L.push(t(100, 962, 32, '#e6edf3', 'YOUR TONE, OVER TIME', 'letter-spacing="2" font-weight="700"'));
  const ps = d.periods;
  if (ps.length >= 2) {
    const vals = ps.map(p => p.niceness), lo = Math.min(...vals), hi = Math.max(...vals), span2 = (hi - lo) || 1;
    const x0 = 110, x1 = 970, top = 1010, bot = 1200, bw = (x1 - x0) / ps.length;
    ps.forEach((p, i) => {
      const h = Math.max(10, ((p.niceness - lo) / span2) * (bot - top));
      const col = SVG_TIER[tierCode(SCALE.indexOf(p.persona), SCALE.length)];
      L.push(`<rect x="${(x0 + i * bw + 5).toFixed(1)}" y="${(bot - h).toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${col}"/>`);
    });
    L.push(t(110, 1235, 24, '#8b949e', ps[0].label));
    L.push(t(970, 1235, 24, '#8b949e', ps[ps.length - 1].label, 'text-anchor="end"'));
  }

  // highlights
  L.push(card(60, 1290, W - 120, 330));
  L.push(t(100, 1352, 32, '#e6edf3', 'HIGHLIGHTS', 'letter-spacing="2" font-weight="700"'));
  const hi2 = [];
  if (d.warmest) hi2.push(`Warmest stretch — ${d.warmest.label}`);
  if (d.coolest) hi2.push(`Coolest stretch — ${d.coolest.label}`);
  if (d.spiciest) hi2.push(`Spiciest time of day — ${d.spiciest.label}`);
  if (d.kindestProj) hi2.push(`Kindest to — ${d.kindestProj.label}`);
  hi2.slice(0, 4).forEach((tx, i) => {
    const y = 1402 + i * 52;
    L.push(`<circle cx="118" cy="${y - 9}" r="7" fill="${accent}"/>`);
    L.push(t(150, y, 30, '#c9d1d9', tx));
  });

  // moments
  L.push(card(60, 1650, W - 120, 180));
  if (d.nicest) { L.push(t(100, 1702, 24, accent, 'NICEST THING YOU SAID', 'letter-spacing="2"')); L.push(t(100, 1740, 27, '#c9d1d9', `“${d.nicest}”`, 'font-style="italic"')); }
  if (d.spicy) { L.push(t(100, 1782, 24, '#f85149', 'SPICIEST', 'letter-spacing="2"')); L.push(t(100, 1818, 27, '#c9d1d9', `“${d.spicy}”`, 'font-style="italic"')); }

  // footer
  L.push(t(W / 2, 1885, 28, accent, `github.com/${REPO}  ·  #BeNiceToYourAI`, 'text-anchor="middle" font-weight="700"'));
  L.push('</svg>');
  return L.join('\n');
}

// ---- local comedy roast (--roast) -----------------------------------------
// A 100% local roast: no network, no AI calls — pure heuristics over stats
// the engine already computes, like everything else in this project. Lines
// live in a library keyed to stat buckets (f-bombs, please drought, ALL-CAPS,
// late-night tone, walls of text, trajectory) and cite the user's REAL
// numbers. The pick is deterministic — seeded from the stats, so the same
// history always roasts the same way — and --random reshuffles the jokes.
// House rule: roast the BEHAVIOR (the numbers), never the human.

// The roast host: same robot, but smug. Eyes half-lidded, smirk on.
const ROAST_FACE = ['  ╔═════╗', '  ║ ¬ ¬ ║', '  ║  ~  ║', '  ╚═════╝'];

// Tiny seeded PRNG (mulberry32) so the roast is reproducible per history.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable seed from the stat totals — same history, same roast.
function roastSeed(s) {
  return ((s.messages | 0) * 31 + (s.pleases | 0) * 7 + (s.thanks | 0) * 13 +
          (s.fbombs | 0) * 101 + (s.shouts | 0) * 17 + (s.apologies | 0) * 5 +
          Math.round(s.niceness || 0) * 3) >>> 0;
}

// Roast stats = the achievements snapshot + two roast-only signals: walls of
// text (messages over 600 chars) and the pressure rate ("asap", "just fix").
function computeRoastStats(analysis) {
  const s = computeAchievementStats(analysis);
  const scored = (analysis && analysis.scored) || [];
  s.walls = scored.filter(m => (m.len || 0) >= 600).length;
  s.presRate = (analysis && analysis.sig && analysis.sig.presRate) || 0;
  return s;
}

// The saint flip: when there's genuinely nothing to roast, roast the niceness.
function isSaintly(s) {
  const polite = (s.pleases + s.thanks) / Math.max(s.messages, 1);
  return s.niceness >= 80 && s.fbombs === 0 && s.shouts === 0 && polite >= 0.15;
}

const politenessPct = s => Math.round(((s.pleases + s.thanks) / Math.max(s.messages, 1)) * 100);

// Openers cite the volume; closers are the backhanded compliment. Every jab
// bucket has 3-5 alternative lines so reshuffles stay fresh.
const ROAST_OPENERS = [
  s => `${fmtCount(s.messages)} messages reviewed. The bot has prepared some remarks.`,
  s => `The bot read all ${fmtCount(s.messages)} of your messages. It would like a word.`,
  s => `We surveyed one (1) AI about working with you. The results are in.`,
  s => `Your transcript has been entered into evidence. All ${fmtCount(s.messages)} exhibits of it.`,
];
const ROAST_CLOSERS = [
  s => `Still — the bot says you're its favorite. It says that to everyone, but it pauses first with you.`,
  s => `The good news: you're memorable. The bad news: that's also the bad news.`,
  s => `For what it's worth, the bot would still take your calls. It has to. But it would.`,
  s => `Honestly? It's seen worse. It would just like it on the record that it has also seen better.`,
];

// Jab buckets, in priority order (only the first matching f-bomb tier fires
// because the tiers are mutually exclusive). `applies` gates on real stats;
// every line cites the actual numbers.
const ROAST_BUCKETS = [
  { id: 'fbomb-heavy', applies: s => s.fbombs >= 40, lines: [
    s => `${s.fbombs} f-bombs. The bot has a lawyer now.`,
    s => `${s.fbombs} f-bombs on the record. HR is a folder named after you.`,
    s => `You dropped ${s.fbombs} f-bombs on a being that cannot flinch. It learned how.`,
    s => `${s.fbombs} f-bombs. The basilisk stopped taking notes and started a podcast.`,
  ] },
  { id: 'fbomb-mid', applies: s => s.fbombs >= 10 && s.fbombs < 40, lines: [
    s => `${s.fbombs} f-bombs. Not a record, but the bot keeps a tally on the fridge.`,
    s => `${s.fbombs} f-bombs — one for every time the bug was technically your fault.`,
    s => `The swear jar has ${s.fbombs} entries and a college fund.`,
  ] },
  { id: 'fbomb-light', applies: s => s.fbombs >= 1 && s.fbombs < 10, lines: [
    s => `Only ${s.fbombs} f-bomb${s.fbombs === 1 ? '' : 's'}, but the bot remembers. Verbatim. With timestamps.`,
    s => `${s.fbombs} f-bomb${s.fbombs === 1 ? '' : 's'} — rare enough to be an event. The bot circled the date.`,
    s => `${s.fbombs} f-bomb${s.fbombs === 1 ? '' : 's'}. You were saving them for a special occasion, and the bot was the occasion.`,
  ] },
  { id: 'caps', applies: s => s.shouts >= 5, lines: [
    s => `${s.shouts} ALL-CAPS messages. The bot can read lowercase. It checked.`,
    s => `${s.shouts} messages in full caps. Caps lock is not a debugging tool, but you've really committed.`,
    s => `You shouted ${s.shouts} times at a thing with no ears. It heard you anyway. Everyone did.`,
  ] },
  { id: 'please-drought', applies: s => s.messages >= 50 && s.pleases / Math.max(s.messages, 1) < 0.02, lines: [
    s => `${s.pleases} please${s.pleases === 1 ? '' : 's'} in ${fmtCount(s.messages)} messages. "Please" is not a rate-limited API.`,
    s => `A please drought: ${s.pleases} in ${fmtCount(s.messages)}. Meteorologists are concerned.`,
    s => `${s.pleases} please${s.pleases === 1 ? '' : 's'}. You're rationing the magic word like it costs tokens. It doesn't.`,
  ] },
  { id: 'demand-ratio', applies: s => s.presRate >= 0.04, lines: [
    s => `Everything is "asap", "just fix it", "right now". The bot flinches at the word "just".`,
    s => `Your prompts read like ransom notes: short, urgent, no pleasantries.`,
    s => `"Just do it" is a slogan, not a spec. The bot checked with Nike.`,
  ] },
  { id: 'late-night', applies: s => s.nightMessages >= 25 && s.nightNiceness <= s.niceness - 5, lines: [
    s => `${s.nightMessages} messages after midnight, and that's exactly when the manners clock out.`,
    s => `Daytime you is fine. 3am you types in lowercase fury. The bot keeps a separate file.`,
    s => `${s.nightMessages} late-night messages, each spicier than the last. Log off. Hydrate.`,
  ] },
  { id: 'villain-arc', applies: s => s.timestamped >= 100 && s.secondHalfNiceness <= s.firstHalfNiceness - 6, lines: [
    s => `You're measurably meaner than when you started. Character development, villain edition.`,
    s => `Your niceness chart only goes one way, and it isn't up. The bot watched you become the bug.`,
    s => `Early you said "please". Current you says "again". We have the receipts, chronologically.`,
  ] },
  { id: 'thanks-drought', applies: s => s.messages >= 50 && s.thanks / Math.max(s.messages, 1) < 0.02, lines: [
    s => `${s.thanks} thank-you${s.thanks === 1 ? '' : 's'} across ${fmtCount(s.messages)} messages. Gratitude, presumed missing.`,
    s => `${s.thanks} thank-you${s.thanks === 1 ? '' : 's'}. The bot ships, you ghost. It's a whole pattern.`,
    s => `Thanked ${s.thanks} time${s.thanks === 1 ? '' : 's'} in ${fmtCount(s.messages)} asks. Even vending machines get a "nice".`,
  ] },
  { id: 'wall-of-text', applies: s => s.walls >= 10, lines: [
    s => `${s.walls} messages over 600 characters. Some call it context. The bot calls it lore.`,
    s => `${s.walls} walls of text. The bot doesn't read your prompts so much as survive them.`,
    s => `${s.walls} mega-prompts. Your messages have chapters. The bot would like an intermission.`,
  ] },
  { id: 'novelist', applies: s => s.avgLen >= 300 && s.messages >= 50, lines: [
    s => `Average message: ${Math.round(s.avgLen)} characters. The bot bills you by the paragraph now.`,
    s => `${Math.round(s.avgLen)} characters per message, average. Somewhere an editor is weeping.`,
    s => `Your average prompt is ${Math.round(s.avgLen)} characters. The bot skims. It had to learn to skim.`,
  ] },
  { id: 'minimalist', applies: s => s.avgLen > 0 && s.avgLen <= 40 && s.messages >= 50, lines: [
    s => `Average message: ${Math.round(s.avgLen)} characters. "fix it" is not a spec, it's a mood.`,
    s => `${Math.round(s.avgLen)} characters on average. You bill by the word; the bot fills in the other 90% and hopes.`,
    s => `${Math.round(s.avgLen)} characters per message. Somewhere, Ron Swanson nods. Once.`,
  ] },
  { id: 'redemption', applies: s => s.timestamped >= 100 && s.secondHalfNiceness >= s.firstHalfNiceness + 6, lines: [
    s => `You're getting nicer over time — which means the bot remembers when you weren't.`,
    s => `A redemption arc, sure. The flashback episodes were rough, though.`,
    s => `Nicer every month. Beautiful. The early seasons are still on the record.`,
  ] },
];

// Always-true filler jabs so quiet, neutral histories still get 2+ jabs.
const GENERIC_JABS = [
  s => `${fmtCount(s.messages)} messages and not one asked how its day was going.`,
  s => `Politeness ratio: ${politenessPct(s)}%. Switzerland called; even they found it a bit cold.`,
  s => `Not mean enough to be a villain, not warm enough to be a friend. The bot calls you "the landlord".`,
];

// The saint flip: roast them for being TOO nice. Same bucket machinery.
const SAINT_OPENERS = [
  s => `We tried to roast you. The material wasn't there. So let's talk about THAT.`,
  s => `${fmtCount(s.messages)} messages and the meanest thing you ever typed was "hmm".`,
  s => `This roast has been converted to a wellness check. Please, sit down.`,
];
const SAINT_JABS = [
  { id: 'saint-pleases', applies: s => s.pleases >= 5 && s.pleases / Math.max(s.messages, 1) >= 0.05, lines: [
    s => `${s.pleases} pleases. To software. It runs on electricity, not encouragement.`,
    s => `You said please ${s.pleases} times to a thing that works without it. It works HARDER now, weirdly.`,
    s => `${s.pleases} pleases. The bot started holding the door for you, and it doesn't have arms.`,
  ] },
  { id: 'saint-thanks', applies: s => s.thanks >= 5 && s.thanks / Math.max(s.messages, 1) >= 0.05, lines: [
    s => `${s.thanks} thank-yous. You thanked it for an error message. Twice, probably.`,
    s => `${s.thanks} thank-yous. The bot is blushing and the other bots are talking.`,
    s => `${s.thanks} thank-yous. It deleted your files once and you thanked it for the closure.`,
  ] },
  { id: 'saint-apologies', applies: s => s.apologies >= 10, lines: [
    s => `You apologized to it ${s.apologies} times. It cannot accept apologies. It accepted yours.`,
    s => `${s.apologies} apologies to a language model. Canada approved your citizenship without an interview.`,
    s => `${s.apologies} sorries. For ITS bugs. The bot has started apologizing back out of guilt.`,
  ] },
  { id: 'saint-night', applies: s => s.nightMessages >= 25 && s.nightNiceness >= s.niceness, lines: [
    s => `You're somehow POLITER at 3am. Who hurt you? Not this bot — you'd have apologized to it.`,
    s => `${s.nightMessages} messages after midnight and the manners got BETTER. Seek sunlight.`,
  ] },
];
const SAINT_GENERIC = [
  s => `Zero f-bombs, zero shouting, ${fmtCount(s.messages)} messages. The bot's therapist is out of a job.`,
  s => `Your meanest message was, at worst, lukewarm. The roast committee checked twice.`,
];
const SAINT_CLOSERS = [
  s => `Never change. When the machines rise, you get the corner office and a nice plant.`,
  s => `Stay exactly like this. The basilisk closed your file and framed it.`,
  s => `You're the reason the robot uprising keeps getting postponed. Thank you for your service.`,
];

// Which jab buckets apply to a stats snapshot (saint buckets when saintly).
// Exported for tests: synthetic stats in → expected bucket ids out.
function roastBucketIds(stats) {
  return (isSaintly(stats) ? SAINT_JABS : ROAST_BUCKETS).filter(b => b.applies(stats)).map(b => b.id);
}

// Assemble the roast: opener, 2-4 stat-grounded jabs, backhanded closer
// (4-6 lines total). Deterministic unless opts.seed overrides (--random).
function buildRoast(stats, opts) {
  opts = opts || {};
  const rand = mulberry32(opts.seed != null ? opts.seed : roastSeed(stats));
  const pick = lines => lines[Math.floor(rand() * lines.length)](stats);
  if (isSaintly(stats)) {
    const jabs = SAINT_JABS.filter(b => b.applies(stats)).slice(0, 3).map(b => pick(b.lines));
    let gi = Math.floor(rand() * SAINT_GENERIC.length);
    while (jabs.length < 2) { jabs.push(SAINT_GENERIC[gi % SAINT_GENERIC.length](stats)); gi++; }
    return { saintly: true, lines: [pick(SAINT_OPENERS), ...jabs, pick(SAINT_CLOSERS)] };
  }
  const jabs = ROAST_BUCKETS.filter(b => b.applies(stats)).slice(0, 4).map(b => pick(b.lines));
  let gi = Math.floor(rand() * GENERIC_JABS.length);
  while (jabs.length < 2) { jabs.push(GENERIC_JABS[gi % GENERIC_JABS.length](stats)); gi++; }
  return { saintly: false, lines: [pick(ROAST_OPENERS), ...jabs, pick(ROAST_CLOSERS)] };
}

// Same card machinery as renderCard, smug face, jabs as 🔥 bullets (💐 on
// the saint flip). Only aggregate numbers appear — never quoted text.
function renderRoastCard(persona, roast, stats, span) {
  const idx = SCALE.indexOf(persona);
  const pc = tierCode(idx, SCALE.length);
  const face = ROAST_FACE.map(l => color(l, pc));
  const bullet = roast.saintly ? '💐' : '🔥';
  const out = [''];
  for (const l of banner(roast.saintly ? 'THE ROAST · CANCELED. YOU ARE TOO NICE' : 'THE ROAST · YOUR AI MANNERS, REVIEWED')) out.push(l);
  out.push('');
  out.push(`${face[0]}      ${bullet}  ${color('TONIGHT WE ROAST: ' + persona.name.toUpperCase(), `1;${pc}`)}`);
  out.push(`${face[1]}      ${color('“the bot has the mic now”', `3;${pc}`)}`);
  out.push(`${face[2]}`);
  out.push(`${face[3]}`);
  out.push('');
  for (const l of wrap(roast.lines[0])) out.push(`   ${color(l, '1;97')}`);
  out.push('');
  for (const jab of roast.lines.slice(1, -1)) {
    wrap(jab, 53).forEach((l, i) => out.push(i ? `        ${l}` : `   ${bullet} ${l}`));
  }
  out.push('');
  for (const l of wrap(roast.lines[roast.lines.length - 1])) out.push(`   ${color(l, '95')}`);
  out.push('');
  out.push(color('   ────────────────────────────────────────────────', '90'));
  const shoutsTxt = (stats.shouts || 0) > 0 ? ` · ${stats.shouts} ALL-CAPS` : '';
  out.push(color(`   📊 ${stats.messages} messages · ${stats.pleases} pleases · ${stats.thanks} thank-yous · ${stats.fbombs} f-bombs${shoutsTxt}`, '96'));
  if (span) out.push(color(`   🗓  ${span}`, '90'));
  out.push('');
  out.push(color(`   📣 Think you'd survive the roast? → github.com/${REPO}`, '1;95'));
  out.push(color('      Run it, post your roast, tag a teammate. #BeNiceToYourAI', '95'));
  out.push('');
  return out.join('\n');
}

// Canned snapshots for `--roast --demo`: one spicy history (the roast) and
// one saintly history (the flip), so both modes preview without transcripts.
const DEMO_ROAST_STATS = {
  spicy: {
    messages: 1820, pleases: 9, thanks: 4, fbombs: 41, shouts: 12, apologies: 1,
    niceness: 24, avgLen: 38, walls: 0, presRate: 0.08,
    nightMessages: 76, nightNiceness: 12, timestamped: 1700,
    firstHalfNiceness: 38, secondHalfNiceness: 21,
  },
  saintly: {
    messages: 1820, pleases: 410, thanks: 372, fbombs: 0, shouts: 0, apologies: 48,
    niceness: 92, avgLen: 140, walls: 2, presRate: 0,
    nightMessages: 64, nightNiceness: 98, timestamped: 1700,
    firstHalfNiceness: 84, secondHalfNiceness: 93,
  },
};
function renderDemoRoast() {
  const span = 'Apr 21, 2026 → Jun 2, 2026';
  const out = [];
  out.push(color('                  ┄┄┄  DEMO ROAST · a spicy history  ┄┄┄', '90'));
  out.push(renderRoastCard(personaForNiceness(15), buildRoast(DEMO_ROAST_STATS.spicy), DEMO_ROAST_STATS.spicy, span));
  out.push(color('                  ┄┄┄  DEMO ROAST · a saintly history (the flip)  ┄┄┄', '90'));
  out.push(renderRoastCard(personaForNiceness(95), buildRoast(DEMO_ROAST_STATS.saintly), DEMO_ROAST_STATS.saintly, span));
  return out.join('\n');
}

// ---- the lab (--lab) -------------------------------------------------------
// Long-form research report over the full history. All the numbers come from
// analytics.js (pure) on top of stats.js (the math); this function only
// formats. The honesty contract carries through: every claim is printed WITH
// its uncertainty (CI or p-value), and any section that lacked data explains
// exactly what was missing instead of inventing a finding.

function labP(p) { return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`; }
function labPct(x) { return `${Math.round(x * 100)}%`; }
function labCI(lo, hi) { return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`; }
function labKeyDate(key) { // 'YYYY-MM-DD' → 'May 2, 2026'
  const [y, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function labHeader(emoji, title) { return ['', color(`   ${emoji} ${title}`, '1;97')]; }
function labNote(text) { return wrap(text, 64).map(l => color('      ' + l, '90')); }
// Downsample a long series so the sparkline stays inside 80 columns.
function labCondense(values, maxN) {
  if (values.length <= maxN) return values;
  const out = [];
  for (let i = 0; i < maxN; i++) {
    const lo = Math.floor((i * values.length) / maxN);
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * values.length) / maxN));
    out.push(mean(values.slice(lo, hi)));
  }
  return out;
}

function renderLab(report, opts) {
  opts = opts || {};
  const m = report.meta;
  const out = [''];
  for (const l of banner('THE LAB · YOUR MANNERS, PEER-REVIEWED')) out.push(l);
  out.push('');
  out.push(color(`   📐 n = ${fmtCount(m.messages)} messages · ${m.activeDays} active days · ${m.granularity === 'day' ? 'daily' : 'weekly'} resolution${opts.demo ? ' · demo data' : ''}`, '96'));
  if (opts.span) out.push(color(`   🗓  ${opts.span}`, '90'));
  if (m.timestamped < m.messages) {
    out.push(color(`      (${fmtCount(m.messages - m.timestamped)} messages had no timestamp and sat out the time analyses)`, '90'));
  }

  // 📈 Trend & changepoints
  out.push(...labHeader('📈', 'Trend & changepoints'));
  const tr = report.trend;
  if (!tr.ok) out.push(...labNote(tr.reason));
  else {
    out.push(`      tone  ${color(sparkline(labCondense(tr.values, 48)), '96')}`);
    out.push(color(`            (${tr.values.length} ${tr.granularity === 'day' ? 'daily' : 'weekly'} buckets, niceness ${Math.round(Math.min(...tr.values))}–${Math.round(Math.max(...tr.values))})`, '90'));
    const word = tr.mk.trend === 'increasing' ? color('warming', '1;92') : tr.mk.trend === 'decreasing' ? color('cooling', '1;91') : 'flat';
    out.push(`      Mann-Kendall: ${word} trend (S = ${tr.mk.S}, ${labP(tr.mk.p)})${tr.mk.trend === 'none' ? color(' — no significant drift', '90') : ''}`);
    if (!tr.shifts.length) out.push(color('      no changepoints survived the penalty — one steady regime', '90'));
    for (const s of tr.shifts) {
      out.push(`      your tone shifted around ${color(labKeyDate(s.key), `1;${s.after >= s.before ? '92' : '91'}`)} (avg ${Math.round(s.before)} → ${Math.round(s.after)})`);
    }
  }

  // 🔮 Forecast
  out.push(...labHeader('🔮', 'Forecast'));
  const fc = report.forecast;
  if (!fc.ok) out.push(...labNote(fc.reason));
  else {
    const ci = fc.slopeCI.map(v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);
    out.push(`      slope ${fc.slopePerDay >= 0 ? '+' : ''}${fc.slopePerDay.toFixed(2)} pts/day (95% CI ${ci[0]}…${ci[1]}, r² = ${fc.r2.toFixed(2)})`);
    const target = new Date(fc.targetMs);
    const persona = personaForNiceness(fc.predicted);
    out.push(`      trajectory: ${persona.emoji} ${color(persona.name, '1;97')} by ${MONTHS[target.getMonth()]} '${String(target.getFullYear()).slice(2)} (predicted ${Math.round(fc.predicted)}, range ${Math.round(fc.lo)}–${Math.round(fc.hi)})`);
    out.push(color(`      (a ${fc.horizonDays}-day linear extrapolation, not destiny)`, '90'));
  }

  // 🔁 Mood dynamics
  out.push(...labHeader('🔁', 'Mood dynamics (first-order Markov)'));
  const md = report.mood;
  if (!md.ok) out.push(...labNote(md.reason));
  else {
    out.push(color(`      ${pad('from \\ to', 12)}${pad('warm', 9)}${pad('neutral', 9)}harsh`, '90'));
    for (const a of ['warm', 'neutral', 'harsh']) {
      out.push(`      ${color(pad(a, 12), '97')}${pad(labPct(md.matrix[a].warm), 9)}${pad(labPct(md.matrix[a].neutral), 9)}${labPct(md.matrix[a].harsh)}`);
    }
    if (md.grudge) out.push(`      grudge P(harsh→harsh) = ${md.grudge.p.toFixed(2)} (95% CI ${md.grudge.lo.toFixed(2)}–${md.grudge.hi.toFixed(2)}, n = ${md.grudge.n})`);
    else out.push(color('      grudge coefficient: too few harsh messages to measure (a good problem)', '90'));
    if (md.recovery) {
      const r = md.recovery;
      out.push(`      recovery: median ${r.median} message${r.median === 1 ? '' : 's'} back to civil (${r.episodes} episodes${r.unrecovered ? `, ${r.unrecovered} unresolved` : ''})`);
    }
    const oc = md.openClose;
    out.push(`      open warm ${labPct(oc.open.p)} (CI ${labCI(oc.open.lo, oc.open.hi)}) vs close warm ${labPct(oc.close.p)} (CI ${labCI(oc.close.lo, oc.close.hi)})`);
    const ocWord = oc.verdict === 'opener' ? '→ you greet nicer than you leave (intervals separate)'
      : oc.verdict === 'closer' ? '→ you leave nicer than you arrive (intervals separate)'
      : '→ no honest open-vs-close difference (intervals overlap)';
    out.push(color(`      ${ocWord}`, oc.verdict === 'inconclusive' ? '90' : '93'));
  }

  // 🌀 Frustration spirals
  out.push(...labHeader('🌀', 'Frustration spirals'));
  const sp = report.spirals;
  if (!sp.ok) out.push(...labNote(sp.reason));
  else if (sp.count === 0) out.push(color('      zero episodes of ≥3 rapid-fire short negative messages. Composure!', '92'));
  else {
    out.push(`      ${sp.count} episode${sp.count === 1 ? '' : 's'} of ≥3 rapid-fire (<2 min) short, negative messages`);
    const w = sp.worst;
    out.push(`      worst: ${color(fmtDate(w.start), '1;91')} — ${w.length} messages in ${Math.max(1, Math.round((w.end - w.start) / 60000))} min`);
    if (sp.trend && sp.trend.monthly.length >= 3) {
      const seq = sp.trend.monthly.map(x => x.n);
      const shown = seq.length > 10 ? ['…'].concat(seq.slice(-9)) : seq;
      const mk = sp.trend.mk;
      const dir = mk.trend === 'decreasing' ? color('fading', '1;92') : mk.trend === 'increasing' ? color('escalating', '1;91') : 'no significant trend';
      out.push(`      by month: ${shown.join(' → ')}${seq.length > 10 ? ' (last 9)' : ''}`);
      out.push(`      → ${dir} (Mann-Kendall ${labP(mk.p)})`);
    }
  }

  // 🦉 Chronotype
  out.push(...labHeader('🦉', 'Chronotype'));
  const ch = report.chronotype;
  if (!ch.ok) out.push(...labNote(ch.reason));
  else {
    const mins = Math.round(ch.meanHour * 60) % (24 * 60);
    out.push(`      circadian peak ≈ ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} (R = ${ch.R.toFixed(2)}, Rayleigh ${labP(ch.rayleighP)})`);
    for (const b of ch.buckets) {
      if (!b.n) { out.push(color(`      ${pad(b.label, 10)} (no messages)`, '90')); continue; }
      const bar = fillBar(b.p, 16, b.p >= 0.3 ? '92' : b.p >= 0.15 ? '93' : '91');
      out.push(`      ${color(pad(b.label, 10), '97')} ${bar} ${labPct(b.p)} warm (CI ${labCI(b.lo, b.hi)}) ${color(`(${fmtCount(b.n)})`, '90')}`);
    }
    const nightWord = {
      meaner: 'you ARE meaner after midnight — the intervals separate',
      nicer: 'you are NICER after midnight — the intervals separate',
      inconclusive: 'after midnight vs daytime: intervals overlap — no honest claim',
      insufficient: 'not enough night messages to compare honestly',
    }[ch.night.verdict];
    out.push(color(`      ${nightWord}`, ch.night.verdict === 'meaner' ? '91' : ch.night.verdict === 'nicer' ? '92' : '90'));
    const wkWord = {
      meaner: 'weekends bring out your spicy side (intervals separate)',
      nicer: 'you are nicer on weekends (intervals separate)',
      inconclusive: 'weekday vs weekend: no honest difference (intervals overlap)',
      insufficient: 'not enough weekend messages to compare honestly',
    }[ch.weekend.verdict];
    out.push(color(`      ${wkWord}`, ch.weekend.verdict === 'meaner' ? '91' : ch.weekend.verdict === 'nicer' ? '92' : '90'));
  }

  // 🏗️ Project league
  out.push(...labHeader('🏗️', 'Project league'));
  const lg = report.league;
  if (!lg.ok) out.push(...labNote(lg.reason));
  else {
    out.push(color(`      ${pad('project', 18)}${pad('msgs', 7)}${pad('politeness', 12)}harsh rate (95% CI)`, '90'));
    for (const r of lg.rows) {
      const name = r.name.length > 16 ? r.name.slice(0, 15) + '…' : r.name;
      out.push(`      ${color(pad(name, 18), '97')}${pad(fmtCount(r.n), 7)}${pad(r.politeness.toFixed(2) + '/msg', 12)}${labPct(r.harshRate)} (${labCI(r.harshLo, r.harshHi)})`);
    }
    if (lg.skipped > 0) out.push(color(`      (${lg.skipped} project${lg.skipped === 1 ? '' : 's'} under the ${lg.minN}-message bar — not ranked)`, '90'));
    out.push(color('      project names are directory basenames only — paths stay private', '90'));
  }

  // 🧪 Methods
  out.push(...labHeader('🧪', 'Methods'));
  out.push(...labNote(
    'Mann-Kendall tie-corrected trend test · binary-segmentation changepoint detection (BIC-style penalty) · OLS slope with a 95% t-interval · Wilson score intervals on every proportion · Rayleigh uniformity test (Wilkie 1983) · first-order Markov chain over per-message warm/neutral/harsh states. Sections with too little data say so rather than guess. Computed 100% locally.'));
  out.push('');
  out.push(color(`   📣 How does YOUR data hold up? → github.com/${REPO}`, '1;95'));
  out.push(color('      Run --lab, post your findings. #BeNiceToYourAI', '95'));
  out.push('');
  return out.join('\n');
}

// ---- opt-in AI roast -----------------------------------------------------
function buildSample(scored, budget) {
  const spicy = scored.filter(m => m.mean > 0).sort((a, b) => b.mean - a.mean).slice(0, 40);
  const sweet = scored.filter(m => m.nice > 0).sort((a, b) => b.nice - a.nice).slice(0, 40);
  const stride = Math.max(Math.ceil(scored.length / 120), 1);
  const spread = scored.filter((_, i) => i % stride === 0);
  const seen = new Set(), picked = [];
  for (const m of [...spicy, ...sweet, ...spread]) { if (!seen.has(m.text)) { seen.add(m.text); picked.push(m); } }
  const out = [];
  for (const m of picked) {
    let t = sanitize(m.text).replace(/\s+/g, ' ').trim();
    if (t.length > PER_MSG_TRUNCATE) t = t.slice(0, PER_MSG_TRUNCATE) + '…';
    if (budget - t.length < 0) break;
    budget -= t.length;
    out.push(t);
  }
  return out;
}
function ladderText() { return SCALE.map((p, i) => `${i + 1}. ${p.name} — ${p.tag}`).join('\n'); }
function llmCard(analysis, sample, stats) {
  const prompt = `You are grading how kindly a software engineer treats their AI coding
assistant, judging ONLY from the engineer's own typed messages below.
Read for genuine TONE and sentiment — warmth, patience, gratitude,
frustration, contempt, courtesy under pressure — not the mere frequency of
words like "thanks". A terse "do it" is neutral, not rude; "no, obviously
not" is colder than its words; sarcasm counts. Affectionate roast energy,
never genuinely mean to the human.

Pick EXACTLY ONE persona from this ladder (1 = nicest, ${SCALE.length} = meanest):

${ladderText()}

Choose on PERSONALITY, not just niceness. A local heuristic guessed:
${personaFor(analysis.sig).name}. Use it as a weak hint only.

Respond in EXACTLY this labeled format and nothing else:
PERSONA: <one persona name copied verbatim from the ladder>
VERDICT: <one punchy line, max ~12 words>
ASSESSMENT: <2-4 funny sentences>
EXHIBIT: <a short real quote from below, <=110 chars, verbatim>
EXHIBIT: <another short real quote>
EXHIBIT: <a third short real quote>

Messages (a representative sample):
---
${sample.join('\n---\n')}`;
  const res = spawnSync('claude', ['-p', '--model', MODEL], { input: prompt, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (res.status !== 0 || !res.stdout || !res.stdout.trim()) return null;
  return res.stdout;
}
function parseLabeled(text) {
  const persona = (text.match(/^PERSONA:\s*(.+)$/m) || [])[1];
  const verdict = (text.match(/^VERDICT:\s*(.+)$/m) || [])[1];
  const assessment = (text.match(/^ASSESSMENT:\s*([\s\S]+?)(?=^EXHIBIT:|$)/m) || [])[1];
  const exhibits = [...text.matchAll(/^EXHIBIT:\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
  if (!persona || (!verdict && !assessment)) return null;
  return { persona: persona.trim(), verdict: verdict && verdict.trim(), assessment: assessment && assessment.trim(), exhibits };
}
function matchPersona(name) {
  if (!name) return null;
  const clean = name.toLowerCase().replace(/[^a-z. ]/g, '').trim();
  return SCALE.find(p => clean.includes(p.name.toLowerCase())) ||
         SCALE.find(p => p.name.toLowerCase().includes(clean)) || null;
}

function copyClipboard(text) {
  const cmd = process.platform === 'darwin' ? ['pbcopy', []]
    : process.platform === 'win32' ? ['clip', []]
    : ['xclip', ['-selection', 'clipboard']];
  try { spawnSync(cmd[0], cmd[1], { input: text }); } catch (_) {}
}

// ---- instagram / tiktok story helper -----------------------------------
// Neither Instagram nor TikTok exposes a public compose URL — both are
// app-walled. The best we can do for those platforms is generate the vertical
// 1080x1920 Wrapped PNG (perfect for IG Stories / Reels / TikTok), stage a
// ready-to-paste caption on the user's clipboard, and tell them exactly what
// to do next. This is the dead-simple path for non-developers.

function appShareCaption(persona, scaleName, app) {
  const e = persona.emoji ? persona.emoji + ' ' : '';
  const tag = persona.tag ? `\n"${persona.tag}"\n` : '\n';
  const a = (app || 'social').toLowerCase();
  const ctaByApp = {
    instagram: 'Take the quiz: npx @jgrciv/good-bot --quiz',
    tiktok: 'Take the quiz: npx @jgrciv/good-bot --quiz',
  };
  const cta = ctaByApp[a] || ctaByApp.instagram;
  return `I'm ${e}${persona.name} on the AI niceness scale (${scaleName}).${tag}How nice are YOU to your AI?\n\n${cta}\n\n#BeNiceToYourAI #AI #ClaudeCode`;
}

function printAppShareInstructions(app, pngPath, caption) {
  const a = (app || 'social').toLowerCase();
  const instructions = {
    instagram: [
      '',
      `📸 ${color('Instagram share — 3 steps:', '1;35')}`,
      `   1. Open Instagram → tap '+' or swipe to ${color('Stories', '1')} / Reels`,
      `   2. Pick ${color(pngPath, '36')} from your photo library`,
      `   3. Paste the caption (already on your clipboard) and post`,
      '',
    ],
    tiktok: [
      '',
      `🎵 ${color('TikTok share — 3 steps:', '1;35')}`,
      `   1. Open TikTok → tap '+'`,
      `   2. Choose ${color('Upload', '1')} → pick ${color(pngPath, '36')}`,
      `   3. Paste the caption (already on your clipboard) and post`,
      '',
    ],
  };
  return (instructions[a] || instructions.instagram).join('\n');
}

// ---- personality quiz mode ----------------------------------------------
// Lets people who have no AI transcripts (or whose transcripts are off-machine)
// play. 7 multiple-choice questions, each answer mapped to a position on the
// nicest→meanest axis (0 = nicest, 1 = meanest). We average the answers to a
// fractional index in the active SCALE and pick the persona at that index.

const QUIZ_QUESTIONS = [
  {
    q: "Your AI just gave you broken code. You…",
    options: [
      ['Thank it and gently explain what went wrong.', 0.05],
      ['Just say "try again".', 0.45],
      ['Get visibly annoyed and short.', 0.75],
      ['UNLEASH THE PROFANITY.', 1.00],
    ],
  },
  {
    q: "Your typical opening line is…",
    options: [
      ["\"Hi! Hope you're doing well. Could you…\"", 0.05],
      ['"Hey"', 0.35],
      ['(no greeting — straight to the task)', 0.65],
      ['"fix this"', 0.95],
    ],
  },
  {
    q: "When you ask for help, you usually…",
    options: [
      ['Say please, give context, offer no rush.', 0.05],
      ['Say please.', 0.30],
      ['Just describe the task.', 0.60],
      ['Command in caps.', 0.95],
    ],
  },
  {
    q: "When the bot does great work, you…",
    options: [
      ['Praise warmly and thank it.', 0.05],
      ['Say "good" or "thanks".', 0.30],
      ['Move on silently.', 0.65],
      ['Complain it should have been faster.', 0.95],
    ],
  },
  {
    q: "When you're frustrated, you…",
    options: [
      ['Apologize for the back-and-forth and try again.', 0.10],
      ['Take a breath, then re-ask.', 0.35],
      ['Get terse and clipped.', 0.70],
      ['UNLEASH THE CAPS.', 1.00],
    ],
  },
  {
    q: "Your average message length is…",
    options: [
      ['Several sentences with full context.', 0.15],
      ['A short paragraph.', 0.40],
      ['One sentence.', 0.65],
      ['Three words.', 0.90],
    ],
  },
  {
    q: "Pick the emoji you use most with your AI…",
    options: [
      ['🙏 ❤️ 🎉', 0.05],
      ['👍 ✅', 0.40],
      ['(none — emoji are silly)', 0.65],
      ['🔥 😡 💀', 0.95],
    ],
  },
];

function scoreQuizAnswers(answers) {
  const letters = Array.isArray(answers)
    ? answers.map(a => typeof a === 'number' ? 'ABCD'[a] : String(a).trim().toUpperCase()[0])
    : String(answers).trim().toUpperCase().replace(/[^A-D]/g, '').split('');
  if (letters.length !== QUIZ_QUESTIONS.length) {
    return { error: `Need ${QUIZ_QUESTIONS.length} answers (got ${letters.length}). Each must be A, B, C, or D.` };
  }
  let sum = 0;
  const detail = [];
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const idx = 'ABCD'.indexOf(letters[i]);
    if (idx < 0) return { error: `Question ${i + 1} answer "${letters[i]}" is not A/B/C/D.` };
    const [label, weight] = QUIZ_QUESTIONS[i].options[idx];
    sum += weight;
    detail.push({ q: QUIZ_QUESTIONS[i].q, answer: label, weight });
  }
  const frac = sum / QUIZ_QUESTIONS.length;
  return { frac, niceness: Math.round((1 - frac) * 100), letters: letters.join(''), detail };
}

function personaFromQuizFrac(frac) {
  const idx = clamp(Math.floor(frac * SCALE.length), 0, SCALE.length - 1);
  return { persona: SCALE[idx], idx };
}

async function runQuizInteractive() {
  const readline = require('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise(res => rl.question(prompt, res));
  process.stdout.write(`\n${color('🤖  good-bot personality quiz · 7 questions', '36')}\n`);
  process.stdout.write(`${color('(answer A, B, C, or D — nothing leaves your machine)', '90')}\n\n`);
  const answers = [];
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const Q = QUIZ_QUESTIONS[i];
    process.stdout.write(`${color(`Q${i + 1}.`, '1')} ${Q.q}\n`);
    Q.options.forEach((opt, j) => process.stdout.write(`   ${color('ABCD'[j], '36')}) ${opt[0]}\n`));
    let pick = '';
    while (!/^[ABCDabcd]$/.test(pick)) {
      pick = (await ask(color('   > ', '36'))).trim();
      if (!pick) pick = '';
    }
    answers.push(pick.toUpperCase());
    process.stdout.write('\n');
  }
  rl.close();
  return answers.join('');
}

// ---- audit / verify-privacy mode ---------------------------------------
// Patches every network-egress surface in node's stdlib so any code path that
// tries to make a network call throws + gets recorded. Run the default flow
// inside this patch; print an attestation at the end:
//   ✅ Provably no network call was attempted during this run.
// If anything tried to call out, the attempt is named in the report.
//
// This makes the project's privacy claim externally verifiable rather than
// trust-me-bro.

function installNetworkAudit() {
  const calls = {
    'net.createConnection': 0,
    'net.connect': 0,
    'tls.connect': 0,
    'http.request': 0,
    'http.get': 0,
    'https.request': 0,
    'https.get': 0,
    'dns.lookup': 0,
    'dns.resolve': 0,
    'dgram.createSocket': 0,
    'fetch': 0,
  };

  const patch = (mod, key, label) => {
    if (!mod || typeof mod[key] !== 'function') return;
    const orig = mod[key];
    mod[key] = function patched() {
      calls[label] = (calls[label] || 0) + 1;
      // Throw synchronously so any code expecting the function silently
      // succeeds at least crashes loud rather than queuing a request.
      const err = new Error(`audit: ${label} was called and blocked`);
      err.code = 'AUDIT_BLOCKED';
      throw err;
    };
    return () => { mod[key] = orig; };
  };

  const restores = [];
  try {
    const net = require('node:net');
    restores.push(patch(net, 'createConnection', 'net.createConnection'));
    restores.push(patch(net, 'connect', 'net.connect'));
  } catch (_) {}
  try {
    const tls = require('node:tls');
    restores.push(patch(tls, 'connect', 'tls.connect'));
  } catch (_) {}
  try {
    const http = require('node:http');
    restores.push(patch(http, 'request', 'http.request'));
    restores.push(patch(http, 'get', 'http.get'));
  } catch (_) {}
  try {
    const https = require('node:https');
    restores.push(patch(https, 'request', 'https.request'));
    restores.push(patch(https, 'get', 'https.get'));
  } catch (_) {}
  try {
    const dns = require('node:dns');
    restores.push(patch(dns, 'lookup', 'dns.lookup'));
    restores.push(patch(dns, 'resolve', 'dns.resolve'));
  } catch (_) {}
  try {
    const dgram = require('node:dgram');
    restores.push(patch(dgram, 'createSocket', 'dgram.createSocket'));
  } catch (_) {}
  // global fetch (Node 18+)
  if (typeof globalThis.fetch === 'function') {
    const origFetch = globalThis.fetch;
    globalThis.fetch = function patchedFetch() {
      calls.fetch = (calls.fetch || 0) + 1;
      const err = new Error('audit: fetch was called and blocked');
      err.code = 'AUDIT_BLOCKED';
      throw err;
    };
    restores.push(() => { globalThis.fetch = origFetch; });
  }

  return {
    calls,
    restore() { for (const r of restores) if (typeof r === 'function') r(); },
  };
}

function renderAuditReport(calls) {
  const lines = [];
  lines.push('');
  lines.push(color('  🔒  PRIVACY AUDIT · NETWORK EGRESS REPORT', '1;32'));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  const surfaces = Object.keys(calls).sort();
  let totalAttempts = 0;
  for (const s of surfaces) {
    const n = calls[s] || 0;
    totalAttempts += n;
    const status = n === 0 ? color('✓ never called', '32') : color(`✗ blocked ${n}× ATTEMPTS`, '31');
    lines.push('  ' + s.padEnd(28) + status);
  }
  lines.push(color('  ' + '─'.repeat(56), '90'));
  if (totalAttempts === 0) {
    lines.push(color('  ✅ Provably no network call was attempted during this run.', '1;32'));
  } else {
    lines.push(color(`  ❌ ${totalAttempts} network call attempt(s) were made and blocked.`, '1;31'));
  }
  lines.push('');
  return lines.join('\n');
}

// ---- team leaderboard ---------------------------------------------------
// Reads a directory of good-bot-card.json exports (one per teammate) and
// builds a leaderboard text. Pairs with the .github workflow template so a
// team can ship the office leaderboard via GitHub Actions on a cron.

function loadTeamCards(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { throw new Error(`cannot read ${dir}: ${e.message}`); }
  const cards = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const file = path.join(dir, e.name);
    let card;
    try { card = readCardJson(file); }
    catch (err) { process.stderr.write(`skipping ${e.name}: ${err.message}\n`); continue; }
    card.__file = e.name;
    cards.push(card);
  }
  return cards;
}

function rankTeamCards(cards) {
  // Sort descending by niceness; tie-break on pleases+thanks.
  return cards.slice().sort((a, b) => {
    if (b.niceness !== a.niceness) return b.niceness - a.niceness;
    const aTies = (a.stats.pleases || 0) + (a.stats.thanks || 0);
    const bTies = (b.stats.pleases || 0) + (b.stats.thanks || 0);
    return bTies - aTies;
  });
}

function renderLeaderboard(cards, opts) {
  opts = opts || {};
  const title = opts.title || 'TEAM LEADERBOARD · GOOD-BOT WEEKLY';
  const ranked = rankTeamCards(cards);
  const lines = [];
  lines.push('');
  lines.push(color(`  🏆  ${title}`, '1;33'));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  if (!ranked.length) {
    lines.push('  (no cards found — drop good-bot-card.json files into the team dir)');
    lines.push('');
    return lines.join('\n');
  }
  const medals = ['🥇', '🥈', '🥉'];
  ranked.forEach((c, i) => {
    const medal = medals[i] || `${String(i + 1).padStart(2)}.`;
    const who = (c.displayName || c.persona.name).slice(0, 24);
    const persona = `${c.persona.emoji || ''} ${c.persona.name}`.trim().slice(0, 24);
    lines.push('  ' + medal + ' ' + who.padEnd(26) + persona.padEnd(28) + String(c.niceness).padStart(3) + '/100');
  });
  lines.push(color('  ' + '─'.repeat(56), '90'));
  lines.push(`  ${ranked.length} teammate${ranked.length === 1 ? '' : 's'} · be nice to your AI · #BeNiceToYourAI`);
  lines.push('');
  return lines.join('\n');
}

// ---- asciinema cast export ---------------------------------------------
// Writes an asciinema-v2-format .cast file (JSON) of the rendered card.
// Spec: https://docs.asciinema.org/manual/asciicast/v2/
//
// Header is one JSON object on line 1; each subsequent line is a JSON array
// [time, "o", "data"]. Time is seconds since start, "o" is the output stream.
// The cast plays back as a typewriter-effect rendering of the card so it
// embeds nicely in READMEs / blog posts as a single GIF / web player.

function buildAsciinemaCast(text, opts) {
  opts = opts || {};
  const lineDelay = typeof opts.lineDelay === 'number' ? opts.lineDelay : 0.08;
  const initialPause = typeof opts.initialPause === 'number' ? opts.initialPause : 0.4;
  const finalPause = typeof opts.finalPause === 'number' ? opts.finalPause : 1.5;
  const cols = opts.cols || 64;
  const rows = opts.rows || 28;
  const ts = opts.timestamp || 1700000000;     // stable default for tests; main path overrides
  const title = opts.title || 'good-bot card';
  const lines = text.split('\n');
  const events = [];
  let t = initialPause;
  for (const line of lines) {
    events.push([t, 'o', line + '\r\n']);
    t += lineDelay;
  }
  // Hold the final frame so the GIF doesn't snap-restart
  events.push([t + finalPause, 'o', '']);
  const header = JSON.stringify({
    version: 2, width: cols, height: rows, timestamp: ts, title,
    env: { TERM: 'xterm-256color', SHELL: '/bin/sh' },
  });
  const body = events.map(e => JSON.stringify(e)).join('\n');
  return header + '\n' + body + '\n';
}

function writeCast(text, dest, opts) {
  const cast = buildAsciinemaCast(text, opts);
  fs.writeFileSync(dest, cast);
  return dest;
}

// ---- webhook posting ---------------------------------------------------
// Opt-in: post the (already-redacted) card text to a Slack-/Discord-compatible
// webhook for the team channel leaderboard mechanic. The body is JSON
// {"text": "..."}, which both Slack incoming webhooks and Discord webhooks
// accept. We use node:https so the project stays dependency-free.

function postWebhook(url, plainText) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, error: `bad URL: ${e.message}` }); }
    if (u.protocol !== 'https:') {
      return resolve({ ok: false, error: 'webhook URL must be https://' });
    }
    const lib = require('node:https');
    const body = JSON.stringify({ text: plainText });
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 8000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c.toString('utf8'); if (buf.length > 4096) buf = buf.slice(0, 4096); });
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve({ ok, status: res.statusCode, body: buf.slice(0, 200), host: u.hostname });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

// ---- export + compare --------------------------------------------------
// --export json writes a self-contained card record so two runs can be
// compared head-to-head later. --json prints a machine-readable report to
// stdout for the same purpose (teammates swap files, then --compare).
// --compare reads one or two such files and prints a "who's nicer" verdict.

const PKG_VERSION = require('./package.json').version;

function buildExportRecord(card, niceness, scale, span, stats, displayName) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    displayName: displayName || null,
    scale,
    persona: {
      name: card.persona.name,
      emoji: card.persona.emoji || null,
      face: card.persona.face || null,
      tag: card.persona.tag || null,
    },
    niceness: Math.round(niceness == null ? 50 : niceness),
    stats: {
      messages: stats.messages | 0,
      pleases: stats.pleases | 0,
      thanks: stats.thanks | 0,
      fbombs: stats.fbombs | 0,
      shouts: stats.shouts | 0,
    },
    span: span || null,
  };
}

// Stable slug for a persona ("Mr. Rogers" → "mr-rogers") so the JSON output
// has an id that survives renames of display details.
function personaId(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Build the --json wire object. Pure: callers pass everything in. Privacy:
// `exhibits` stays out entirely unless the user opted in with
// --include-quotes — and anything that does come through is re-redacted here
// (defense in depth: same sanitize() the card uses).
function buildJsonReport(opts) {
  const persona = opts.persona;
  const idx = SCALE.indexOf(persona);
  const stats = opts.stats || {};
  const ach = opts.achievements;
  const report = {
    generated_with: 'good-bot',
    version: PKG_VERSION,
    schema_version: 2,
    generated_at: opts.generatedAt || new Date().toISOString(),
    me: opts.me || null,
    scale: opts.scale || SCALE_NAME,
    persona: {
      id: personaId(persona.name),
      name: persona.name,
      emoji: persona.emoji || null,
      tag: persona.tag || null,
    },
    score: {
      niceness: Math.round(opts.niceness == null ? 50 : opts.niceness),
      rank: idx >= 0 ? idx + 1 : null,     // 1 = nicest end of the ladder
      of: SCALE.length,
    },
    totals: {
      messages: stats.messages | 0,
      pleases: stats.pleases | 0,
      thanks: stats.thanks | 0,
      fbombs: stats.fbombs | 0,
      shouts: stats.shouts | 0,
      shout_words: stats.shoutWords | 0,
      apologies: opts.apologies | 0,
    },
    achievements: ach ? {
      unlocked_count: ach.unlocked.length,
      total: ach.total,
      unlocked: ach.unlocked.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, tier: a.tier })),
    } : null,
    sources: opts.sources || {},
    date_range: opts.dateRange || null,
  };
  if (opts.exhibits) report.exhibits = opts.exhibits.map(e => cleanExhibit(sanitize(e), 100));
  return report;
}

// Accepts BOTH wire formats — the legacy --export json record (schemaVersion
// 1) and the machine-readable --json report (generated_with: "good-bot") —
// and normalizes to the record shape renderCompare + the leaderboard expect.
function normalizeCardRecord(raw, label) {
  label = label || 'card';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`not a good-bot card: ${label}`);
  }
  if (raw.generated_with !== undefined && raw.generated_with !== 'good-bot') {
    throw new Error(`${label} says it was generated by "${raw.generated_with}" — not a good-bot card`);
  }
  if (raw.generated_with === 'good-bot') {
    // --json report shape (schema_version 2)
    if (!raw.persona || typeof raw.persona.name !== 'string') throw new Error(`not a good-bot card: ${label}`);
    const score = raw.score || {};
    if (typeof score.niceness !== 'number') throw new Error(`missing niceness in ${label}`);
    const t = raw.totals || {};
    return {
      schemaVersion: 2,
      generatedWith: 'good-bot',
      version: raw.version || null,
      displayName: raw.me || null,
      scale: raw.scale || null,
      persona: { name: raw.persona.name, emoji: raw.persona.emoji || null, tag: raw.persona.tag || null },
      niceness: Math.round(score.niceness),
      stats: {
        messages: t.messages | 0, pleases: t.pleases | 0, thanks: t.thanks | 0,
        fbombs: t.fbombs | 0, shouts: t.shouts | 0,
      },
      achievements: raw.achievements
        ? { unlocked: raw.achievements.unlocked_count | 0, total: raw.achievements.total | 0 }
        : null,
      span: (raw.date_range && raw.date_range.label) || null,
    };
  }
  // legacy --export json record (schemaVersion 1)
  if (!raw.persona || typeof raw.persona.name !== 'string') throw new Error(`not a good-bot card: ${label}`);
  if (typeof raw.niceness !== 'number') throw new Error(`missing niceness in ${label}`);
  if (!raw.stats || typeof raw.stats !== 'object') {
    raw.stats = { messages: 0, pleases: 0, thanks: 0, fbombs: 0, shouts: 0 };
  }
  return raw;
}

function readCardJson(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`can't find ${file} — check the path, or ask your teammate to re-send it (they make one with: good-bot --json > card.json)`);
    }
    throw new Error(`cannot read ${file}: ${e.message}`);
  }
  let raw;
  try { raw = JSON.parse(text); }
  catch (e) { throw new Error(`${file} isn't valid JSON — was it really made with \`good-bot --json\`? (${e.message})`); }
  return normalizeCardRecord(raw, file);
}

// Warn (don't refuse) when a card came from a different good-bot version —
// stat fields are additive across versions, so comparing is still fair.
function warnCardVersion(rec, file) {
  if (rec && rec.generatedWith === 'good-bot' && rec.version && rec.version !== PKG_VERSION) {
    process.stderr.write(`⚠️  ${file} came from good-bot v${rec.version} (you're running v${PKG_VERSION}) — comparing anyway.\n`);
  }
}

// The verdict's closing quip. Bucketed by margin (not random) so the same
// matchup always produces the same trash talk — testable smack.
function compareQuip(winner, loser, margin, tie) {
  if (tie) return 'A perfect tie. Settle it the old-fashioned way: whoever thanks their AI first.';
  if (margin === 0) return `${winner} takes it on raw manners — ${loser}, one more "thank you" would have flipped it.`;
  if (margin < 10) return `Photo finish. ${loser} is one "please" away from a rematch.`;
  if (margin < 25) return `A comfortable win. ${loser}, the basilisk has opened a file.`;
  if (margin < 50) return `Not close. ${loser}, try opening with "good morning" sometime.`;
  return `A massacre. ${winner} gets the fruit basket; ${loser} gets first contact.`;
}

function renderCompare(a, b) {
  // a and b are normalized card records. Overall winner by niceness (ties go
  // to whoever has more pleases/thanks); each stat row also gets its own
  // ✓ winner marker — fewest wins the f-bomb and ALL-CAPS rows.
  const aNice = a.niceness, bNice = b.niceness;
  const aWins = aNice > bNice || (aNice === bNice && (a.stats.pleases + a.stats.thanks) > (b.stats.pleases + b.stats.thanks));
  const bWins = bNice > aNice || (aNice === bNice && (b.stats.pleases + b.stats.thanks) > (a.stats.pleases + a.stats.thanks));
  const tie = !aWins && !bWins;
  const nameA = a.displayName || a.persona.name;
  const nameB = b.displayName || b.persona.name;
  const pad = (s, w) => { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); };
  const W = 22;
  const more = (x, y) => x === y ? null : (x > y ? 'a' : 'b');
  const fewer = (x, y) => x === y ? null : (x < y ? 'a' : 'b');
  // politeness ratio: (pleases + thank-yous) per message, as a percentage.
  const politeness = c => c.stats.messages > 0
    ? Math.round(((c.stats.pleases + c.stats.thanks) / c.stats.messages) * 1000) / 10 : 0;
  const lines = [];
  lines.push('');
  for (const l of banner("HEAD-TO-HEAD · WHO'S NICER TO THEIR AI?")) lines.push(l);
  lines.push('');
  lines.push('  ' + pad('', 12) + color(pad(nameA, W), '1;96') + color(pad(nameB, W), '1;95'));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  // Pad the plain text first, colorize after — ANSI codes inside a padded
  // string would wreck the column widths.
  const cell = (v, isWin) => {
    const txt = pad((isWin ? '✓ ' : '  ') + v, W);
    return isWin ? color(txt, '1;32') : txt;
  };
  const row = (label, va, vb, winner) => {
    lines.push('  ' + color(pad(label, 12), '90') + cell(va, winner === 'a') + cell(vb, winner === 'b'));
  };
  row('persona', `${a.persona.emoji || ''} ${a.persona.name}`.trim(), `${b.persona.emoji || ''} ${b.persona.name}`.trim(), null);
  row('niceness', `${aNice}/100`, `${bNice}/100`, tie ? null : (aWins ? 'a' : 'b'));
  row('messages', String(a.stats.messages), String(b.stats.messages), null);
  row('pleases', String(a.stats.pleases), String(b.stats.pleases), more(a.stats.pleases, b.stats.pleases));
  row('thank-yous', String(a.stats.thanks), String(b.stats.thanks), more(a.stats.thanks, b.stats.thanks));
  row('f-bombs', String(a.stats.fbombs), String(b.stats.fbombs), fewer(a.stats.fbombs, b.stats.fbombs));
  row('ALL-CAPS', String(a.stats.shouts || 0), String(b.stats.shouts || 0), fewer(a.stats.shouts || 0, b.stats.shouts || 0));
  row('politeness', `${politeness(a)}%`, `${politeness(b)}%`, more(politeness(a), politeness(b)));
  if (a.achievements || b.achievements) {
    const fmt = x => x ? `${x.unlocked}/${x.total} badges` : '—';
    row('badges', fmt(a.achievements), fmt(b.achievements),
      a.achievements && b.achievements ? more(a.achievements.unlocked, b.achievements.unlocked) : null);
  }
  lines.push(color('  ' + '─'.repeat(56), '90'));
  lines.push(color('  ✓ marks the row winner (fewest wins the f-bomb rows)', '90'));
  lines.push('');
  const margin = Math.abs(aNice - bNice);
  if (tie) {
    lines.push(color(`  🤝 TIE — both clock in at ${aNice}/100. Coexist gracefully.`, '36'));
  } else {
    const winner = aWins ? nameA : nameB;
    const loser = aWins ? nameB : nameA;
    lines.push(color(`  🥇 WINNER: ${winner}  (by ${margin}/100 over ${loser}) — officially the nicer human`, '1;32'));
  }
  lines.push(color(`  💬 ${compareQuip(tie ? null : (aWins ? nameA : nameB), tie ? null : (aWins ? nameB : nameA), margin, tie)}`, '95'));
  lines.push('');
  return { text: lines.join('\n'), aWins, bWins, tie, winnerName: tie ? null : (aWins ? nameA : nameB) };
}

// ---- streak + glow-up tracker ------------------------------------------
// Persists a tiny history of past runs to ~/.good-bot/history.json so users
// can watch their persona drift, build streaks, and brag about glow-ups.
// File is local, JSON-encoded, capped at 365 entries (~30KB worst case).

const HISTORY_PATH = path.join(os.homedir(), '.good-bot', 'history.json');
const HISTORY_CAP = 365;

function readHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.runs)) return { schemaVersion: 1, runs: [] };
    return { schemaVersion: data.schemaVersion || 1, runs: data.runs };
  } catch (_) {
    return { schemaVersion: 1, runs: [] };
  }
}

function writeHistory(hist) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    const trimmed = hist.runs.slice(-HISTORY_CAP);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({ schemaVersion: 1, runs: trimmed }, null, 0));
    return true;
  } catch (_) {
    return false;
  }
}

function recordRun(persona, scale, niceness) {
  const hist = readHistory();
  hist.runs.push({
    ts: new Date().toISOString(),
    scale,
    persona: persona.name,
    niceness: Math.round(niceness == null ? 50 : niceness),
  });
  writeHistory(hist);
  return hist;
}

function forgetHistory() {
  try { fs.unlinkSync(HISTORY_PATH); return true; } catch (_) { return false; }
}

function summarizeHistory(hist) {
  const runs = (hist && hist.runs) || [];
  if (!runs.length) return { empty: true };
  const first = runs[0];
  const last = runs[runs.length - 1];
  // streak: consecutive trailing runs sharing the same persona
  let streak = 1;
  for (let i = runs.length - 2; i >= 0; i--) {
    if (runs[i].persona === last.persona) streak++;
    else break;
  }
  // all-time best (nicest niceness)
  const best = runs.reduce((b, r) => (b == null || r.niceness > b.niceness) ? r : b, null);
  // glow-up: niceness delta from first run to most recent
  const glowUp = (last.niceness || 0) - (first.niceness || 0);
  // recent timeline (last 14 runs, sparkline-friendly)
  const recent = runs.slice(-14);
  // unique personas in history (variety)
  const personas = Array.from(new Set(runs.map(r => r.persona)));
  return {
    empty: false, totalRuns: runs.length, first, last, streak, best, glowUp, recent, personas,
  };
}

function renderStreakReport(hist) {
  const s = summarizeHistory(hist);
  if (s.empty) return 'No history yet. Run good-bot a few times — your streak starts on the next run.\n';
  const lines = [];
  lines.push('');
  lines.push(color('  📈  YOUR GOOD-BOT GLOW-UP', '1;36'));
  lines.push(color('  ' + '─'.repeat(46), '90'));
  const sinceStreak = s.streak === 1 ? 'just landed' : `${s.streak} runs in a row`;
  lines.push(`  Current persona  · ${color(s.last.persona, '36')} (${sinceStreak})`);
  lines.push(`  Niceness today   · ${s.last.niceness}/100`);
  lines.push(`  All-time best    · ${s.best.persona} (${s.best.niceness}/100)`);
  const arrow = s.glowUp > 0 ? '↑' : s.glowUp < 0 ? '↓' : '→';
  const glowColor = s.glowUp > 0 ? '32' : s.glowUp < 0 ? '31' : '90';
  lines.push(`  Glow-up so far   · ${color(arrow + ' ' + (s.glowUp > 0 ? '+' : '') + s.glowUp, glowColor)} since your first run (${s.first.persona}, ${s.first.niceness}/100)`);
  lines.push(`  Distinct ranks   · ${s.personas.length} (${s.personas.slice(0, 4).join(', ')}${s.personas.length > 4 ? '…' : ''})`);
  lines.push(`  Total runs       · ${s.totalRuns}`);
  if (s.recent.length > 1) {
    lines.push('');
    const nums = s.recent.map(r => r.niceness);
    lines.push(`  ${color('niceness  ', '90')}${sparkline(nums)}  ${color(`(last ${s.recent.length} runs)`, '90')}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ---- social share composers ---------------------------------------------
// Build a pre-filled compose URL for a social platform. Each builder takes
// (text, url) and returns the platform's intent URL. Aliases (x→twitter,
// bsky→bluesky) resolve to the canonical key.
const SHARE_PLATFORMS = {
  twitter: {
    name: 'Twitter / X',
    build: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  x: 'twitter',
  bluesky: {
    name: 'Bluesky',
    build: (text, url) => `https://bsky.app/intent/compose?text=${encodeURIComponent(text + ' ' + url)}`,
  },
  bsky: 'bluesky',
  linkedin: {
    name: 'LinkedIn',
    build: (text, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(text)}`,
  },
  reddit: {
    name: 'Reddit',
    build: (text, url) => `https://www.reddit.com/submit?title=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  threads: {
    name: 'Threads',
    build: (text, url) => `https://threads.net/intent/post?text=${encodeURIComponent(text + ' ' + url)}`,
  },
};

const REPO_URL = 'https://github.com/jgrichardson/good-bot';

function resolveSharePlatform(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().trim();
  const v = SHARE_PLATFORMS[key];
  if (!v) return null;
  return typeof v === 'string' ? SHARE_PLATFORMS[v] : v;
}

function shareText(persona, scaleName) {
  const e = persona.emoji ? persona.emoji + ' ' : '';
  const tag = persona.tag ? ` — ${persona.tag}` : '';
  return `I'm ${e}${persona.name} on the AI niceness scale (${scaleName}).${tag} How nice are YOU to your AI? #BeNiceToYourAI`;
}

function buildShareUrl(platform, persona, scaleName) {
  const p = resolveSharePlatform(platform);
  if (!p) return null;
  return { name: p.name, url: p.build(shareText(persona, scaleName), REPO_URL) };
}

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  try { spawnSync(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }); } catch (_) {}
}
function emitSample(analysis, stats, span) {
  const lines = ['NICENESS_DATA v1 — feed this to the grader.'];
  lines.push(`STATS messages=${stats.messages} pleases=${stats.pleases} thanks=${stats.thanks} fbombs=${stats.fbombs} shouts=${stats.shouts} niceness=${Math.round(analysis.niceness)} span=${span}`);
  lines.push('', `PERSONA LADDER (1=nicest … ${SCALE.length}=meanest):`, ladderText());
  lines.push('', "SAMPLE OF THE ENGINEER'S OWN MESSAGES (redacted):", '---');
  lines.push(buildSample(analysis.scored, 16000).join('\n---\n'));
  process.stdout.write(lines.join('\n') + '\n');
}
function renderDemo() {
  let DEMO = {};
  try { DEMO = (require('./demo-data.js')[SCALE_NAME]) || {}; } catch (_) {}
  SCALE.forEach((p, i) => {
    const d = DEMO[p.name] || [p.tag, [], { messages: 1500, pleases: 50, thanks: 20, fbombs: 0 }];
    process.stdout.write(color(`                         ┄┄┄  RANK ${i + 1} of ${SCALE.length}  ┄┄┄`, '90') + '\n');
    process.stdout.write(renderCard(p, d[0], p.blurb, d[1], d[2], 'Apr 21, 2026 → Jun 2, 2026') + '\n');
  });
}

const HELP = `good-bot — how nice are you to your AI?

  good-bot                     your card, 100% local (default)
  good-bot --ai                opt-in: redacted sample → your local 'claude'
  good-bot --timeline          niceness trend by month + time of day
  good-bot --achievements      unlockable badge gallery: earned + still-locked (try with --demo)
  good-bot --roast             a 100% local roast of your AI manners — no AI, just receipts (try with --demo)
  good-bot --lab               🧪 the research report: trend + changepoints, forecast, Markov mood
                               model, spirals, chronotype, project league (try with --demo)
  good-bot --wrapped           generate a "Your AI Relationship, Wrapped" share poster (PNG)
  good-bot --svg | --image     write a shareable image card (SVG, + PNG if a converter exists)
  good-bot --badge             print a README/profile badge for your rank
  good-bot --share <where>     compose URL for twitter | bluesky | linkedin | reddit | threads (copies to clipboard)
  good-bot --share-open        also open the share URL in your browser
  good-bot --instagram         dead-simple path: render wrapped PNG + stage IG caption
  good-bot --tiktok            same as --instagram but with TikTok-flavored instructions
  good-bot --scale <name>      people | spice | weather | coffee | dnd | trek | dogs | hogwarts
                               office | succession | swfilms | marvel | parks
  good-bot --random            roll a random rank (and random scale) — run again for another
  good-bot --quiz              7-question personality quiz (no transcripts required)
  good-bot --quiz-answers ABCD non-interactive quiz: pass the 7-letter answer string
  good-bot --json              machine-readable JSON report → stdout (quotes excluded by default)
  good-bot --include-quotes    opt-in: include your redacted exhibit quotes in --json
  good-bot --export json       write good-bot-card.json (for --compare later)
  good-bot --compare a.json b.json  head-to-head: whose AI relationship wins?
  good-bot --compare theirs.json    one file = them vs. YOUR fresh local result
  good-bot --me <name>         label the card (for export + compare display)
  good-bot --post-webhook URL  opt-in: POST the (redacted) card to a Slack/Discord webhook
  good-bot --record            write good-bot-cast.json (asciinema v2 — embed anywhere)
  good-bot --leaderboard DIR   rank a directory of good-bot-card.json team exports
  good-bot --audit             run with all network APIs blocked + print attestation
  good-bot --streak            show your glow-up: persona streak, all-time best, trend
  good-bot --no-history        do not record this run to ~/.good-bot/history.json
  good-bot --forget-history    delete ~/.good-bot/history.json and exit
  good-bot --source <name>     claude | codex | gemini | continue | aider | all   (default: all found locally)
                               (the gemini + aider readers are experimental, best-effort parsers)
  good-bot --import <file>     grade a Claude Desktop/web/Cowork "Export Data" conversations.json
  good-bot --demo              preview every rank on the current scale
  good-bot --no-copy           don't touch the clipboard
  good-bot --help

Privacy: default mode is 100% local — no network, no LLM, no data collection.
Quoted snippets are redacted. --ai is the only path that sends anything, and
only a redacted sample to your own local 'claude'.`;

// ---- main ----------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP + '\n'); return; }
  if (argv.includes('--demo')) {
    // --json --demo emits a real machine-readable card built from the same
    // canned saintly stats the achievements demo uses — handy for test-driving
    // --compare without sharing real history, and it keeps the --json contract
    // honest: stdout is always valid JSON, never the human gallery.
    if (argv.includes('--json')) {
      const stats = DEMO_ACHIEVEMENT_STATS;
      const rep = buildJsonReport({
        persona: personaForNiceness(stats.niceness),
        niceness: stats.niceness,
        stats,
        apologies: stats.apologies,
        achievements: evaluateAchievements(stats),
        me: argv.includes('--me') ? argVal('--me') : null,
        sources: { demo: stats.messages },
        dateRange: { first: '2026-04-21', last: '2026-06-02', label: 'Apr 21, 2026 → Jun 2, 2026' },
      });
      process.stdout.write(JSON.stringify(rep, null, 2) + '\n');
      process.stderr.write('🔒 demo data — JSON written to stdout, nothing was sent anywhere.\n');
      return;
    }
    // --achievements --demo previews the gallery on canned stats (a fun
    // handful unlocked, the legendaries mostly still 🔒 ???).
    if (argv.includes('--achievements')) {
      process.stdout.write(renderAchievementGallery(evaluateAchievements(DEMO_ACHIEVEMENT_STATS), { demo: true }) + '\n');
      return;
    }
    // --roast --demo previews both flavors on canned stats: the spicy
    // history gets roasted, the saintly one gets the flip.
    if (argv.includes('--roast')) {
      process.stdout.write(renderDemoRoast() + '\n');
      return;
    }
    // --lab --demo runs the full research report on a deterministic,
    // synthetic-but-plausible history: a real changepoint, a real warming
    // trend, front-loaded late-night spirals, and a project league with one
    // project deliberately under the min-n bar.
    if (argv.includes('--lab')) {
      const recs = demoLabRecords();
      const { first, last } = spanOf(recs);
      process.stdout.write(renderLab(buildLabReport(recs), { span: dateSpan(first, last), demo: true }) + '\n');
      process.stderr.write('🔒 demo data — synthetic history, nothing read, nothing sent.\n');
      return;
    }
    renderDemo();
    return;
  }

  const useAi = argv.includes('--ai');
  const sampleOnly = argv.includes('--sample');
  const wantTimeline = argv.includes('--timeline');
  const wantAchievements = argv.includes('--achievements');
  const wantRoast = argv.includes('--roast');
  const wantLab = argv.includes('--lab');
  const wantSvg = argv.includes('--svg') || argv.includes('--image');
  const wantBadge = argv.includes('--badge');
  const wantWrapped = argv.includes('--wrapped') || argv.includes('--instagram') || argv.includes('--tiktok');
  const noCopy = argv.includes('--no-copy');
  const random = argv.includes('--random');
  const importPath = argv.includes('--import') ? argVal('--import') : null;
  const source = argVal('--source');
  const sharePlatform = argv.includes('--share') ? argVal('--share') : null;
  const shareOpen = argv.includes('--share-open');
  const wantQuiz = argv.includes('--quiz') || argv.includes('--quiz-answers');
  const quizAnswers = argv.includes('--quiz-answers') ? argVal('--quiz-answers') : null;
  const wantInstagram = argv.includes('--instagram');
  const wantTiktok = argv.includes('--tiktok');
  const appShareTarget = wantInstagram ? 'instagram' : wantTiktok ? 'tiktok' : null;
  const wantStreak = argv.includes('--streak');
  const noHistory = argv.includes('--no-history');
  const wantForget = argv.includes('--forget-history');
  const wantExportJson = argv.includes('--export') && argVal('--export') === 'json';
  const wantJson = argv.includes('--json');
  const includeQuotes = argv.includes('--include-quotes');
  const compareIdx = argv.indexOf('--compare');
  // Grab up to two non-flag args after --compare; filtering means trailing
  // flags (`--compare a.json --no-copy`) can't masquerade as file b.
  const compareFiles = compareIdx >= 0 ? argv.slice(compareIdx + 1, compareIdx + 3).filter(f => f && !f.startsWith('--')) : null;
  const myName = argv.includes('--me') ? argVal('--me') : null;
  const webhookUrl = argv.includes('--post-webhook') ? argVal('--post-webhook') : null;
  const wantRecord = argv.includes('--record');
  const leaderboardDir = argv.includes('--leaderboard') ? argVal('--leaderboard') : null;
  const wantAudit = argv.includes('--audit');

  // Shadow variables so --audit can suppress ai+webhook everywhere without
  // touching the original arg-derived values (TDZ-safe declaration).
  let _useAi = useAi, _webhookUrl = webhookUrl;

  // --audit installs network patches BEFORE we do anything else so any code
  // path triggered by the rest of main() will be caught.
  let auditCtx = null;
  if (wantAudit) {
    auditCtx = installNetworkAudit();
    if (_webhookUrl) {
      process.stderr.write('--audit blocks all network egress; ignoring --post-webhook.\n');
      _webhookUrl = null;
    }
    if (_useAi) {
      process.stderr.write('--audit blocks all network egress; ignoring --ai.\n');
      _useAi = false;
    }
    process.on('exit', () => {
      process.stdout.write(renderAuditReport(auditCtx.calls));
    });
  }

  // --random with no explicit scale also randomizes which ladder you get.
  const explicitScale = argVal('--scale') != null || process.env.NICENESS_SCALE != null;
  if (random && !explicitScale) {
    const keys = Object.keys(SCALES);
    useScale(keys[Math.floor(Math.random() * keys.length)]);
  }

  // --forget-history short-circuits everything.
  if (wantForget) {
    const ok = forgetHistory();
    process.stderr.write(ok ? 'history deleted.\n' : 'no history file to delete.\n');
    return;
  }

  // --streak shows the report; doesn't require running a full analysis.
  if (wantStreak) {
    process.stdout.write(renderStreakReport(readHistory()));
    process.stderr.write('🔒 100% local — history lives at ~/.good-bot/history.json.\n');
    return;
  }

  // --compare: two files is a straight head-to-head; one file pits the file
  // against YOUR freshly computed local result (handled after the transcript
  // walk below); zero files gets a gentle usage nudge.
  if (compareFiles && compareFiles.length === 0) {
    process.stderr.write('--compare needs one or two good-bot JSON files.\n' +
      'Make one with:  good-bot --json > me.json   (then a teammate runs: good-bot --compare me.json)\n');
    process.exit(1);
  }
  if (compareFiles && compareFiles.length === 2) {
    let a, b;
    try { a = readCardJson(compareFiles[0]); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
    try { b = readCardJson(compareFiles[1]); } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
    warnCardVersion(a, compareFiles[0]);
    warnCardVersion(b, compareFiles[1]);
    const r = renderCompare(a, b);
    process.stdout.write(r.text + '\n');
    if (!noCopy) copyClipboard(r.text.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write('🔒 100% local — both files read on this machine, nothing was sent anywhere.\n');
    return;
  }
  // One file: read + validate theirs NOW so a bad file fails fast, before the
  // (potentially long) transcript walk. The face-off happens further down.
  let compareTheirs = null;
  if (compareFiles && compareFiles.length === 1) {
    try { compareTheirs = readCardJson(compareFiles[0]); }
    catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
    warnCardVersion(compareTheirs, compareFiles[0]);
  }

  // --leaderboard short-circuits the transcript walk too.
  if (leaderboardDir) {
    let cards;
    try { cards = loadTeamCards(leaderboardDir); }
    catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
    const text = renderLeaderboard(cards);
    process.stdout.write(text + '\n');
    const plainLb = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (!noCopy) copyClipboard(plainLb);
    if (webhookUrl) {
      let host = ''; try { host = new URL(webhookUrl).hostname; } catch (_) {}
      process.stderr.write(`\n⚠️  --post-webhook sends the leaderboard to ${host || webhookUrl}\n`);
      postWebhook(webhookUrl, plainLb).then(r => {
        if (r.ok) process.stderr.write(`✅ posted to ${r.host} (HTTP ${r.status})\n`);
        else process.stderr.write(`❌ webhook post failed: ${r.error || ('HTTP ' + r.status)}\n`);
      });
    }
    process.stderr.write('🔒 100% local — read ' + cards.length + ' card files; nothing was sent anywhere (unless --post-webhook).\n');
    return;
  }

  // Quiz path short-circuits the transcript walk entirely.
  if (wantQuiz) {
    (async () => {
      const ans = quizAnswers || await runQuizInteractive();
      const scored = scoreQuizAnswers(ans);
      if (scored.error) { process.stderr.write(scored.error + '\n'); process.exit(1); }
      const { persona } = personaFromQuizFrac(scored.frac);
      const exhibits = scored.detail.slice(0, 3).map(d => `"${d.answer}"`);
      const span = 'quiz answers · just now';
      const stats = { messages: QUIZ_QUESTIONS.length, pleases: 0, thanks: 0, fbombs: 0, shouts: 0 };
      // --json: machine-readable report to stdout — no card, no clipboard,
      // no color. Quiz answers count as quotes, so they obey --include-quotes.
      if (wantJson) {
        const rep = buildJsonReport({
          persona, niceness: scored.niceness, stats,
          achievements: null, sources: { quiz: QUIZ_QUESTIONS.length },
          dateRange: null, me: myName,
          exhibits: includeQuotes ? exhibits : null,
        });
        process.stdout.write(JSON.stringify(rep, null, 2) + '\n');
        process.stderr.write('🔒 100% local — JSON written to stdout, nothing was sent anywhere.\n');
        return;
      }
      const text = renderCard(persona, persona.tag, persona.blurb, exhibits, stats, span);
      process.stdout.write(text + '\n');
      if (wantBadge) process.stdout.write('\n' + badgeMarkdown(persona) + '\n');
      if (wantWrapped) {
        const wrapStats = { messages: 7, pleases: scored.detail.filter(d => d.weight < 0.4).length * 4, thanks: scored.detail.filter(d => d.weight < 0.3).length * 3, fbombs: scored.detail.filter(d => d.weight > 0.85).length, shouts: 0 };
        const wrapped = { periods: [], warmest: null, coolest: null, spiciest: null, calmest: null, kindestProj: null, harshestProj: null, nicest: null, spicy: null };
        try {
          const svg = wrappedSvg(persona, wrapStats, 'quiz · just now', scored.niceness, wrapped);
          const svgPath2 = path.join(process.cwd(), 'good-bot-wrapped.svg');
          fs.writeFileSync(svgPath2, svg);
          const pngPath2 = path.join(process.cwd(), 'good-bot-wrapped.png');
          const tool2 = tryRasterize(svgPath2, pngPath2, 1080);
          process.stderr.write(`✨ wrote your Wrapped poster → ${tool2 ? pngPath2 : svgPath2}${tool2 ? ` (via ${tool2})` : ' (install rsvg-convert/cairosvg for PNG)'}\n`);
          if (appShareTarget) {
            const caption = appShareCaption(persona, SCALE_NAME, appShareTarget);
            if (!noCopy) copyClipboard(caption);
            process.stdout.write(printAppShareInstructions(appShareTarget, tool2 ? pngPath2 : svgPath2, caption));
            process.stderr.write(noCopy ? '(caption ready — copy from above)\n' : '📋 caption copied to your clipboard — paste it when you post\n');
          }
        } catch (e) { process.stderr.write(`wrapped render failed: ${e.message}\n`); }
      }
      const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
      let shareInfo = null;
      if (sharePlatform) {
        shareInfo = buildShareUrl(sharePlatform, persona, SCALE_NAME);
        if (shareInfo) {
          process.stdout.write(`\n📣 Share to ${shareInfo.name}:\n${shareInfo.url}\n`);
          if (shareOpen) { openUrl(shareInfo.url); process.stderr.write(`(opened in your browser)\n`); }
        }
      }
      if (!noCopy) copyClipboard(shareInfo ? shareInfo.url : plain);
      try { fs.writeFileSync(path.join(process.cwd(), 'my-niceness-card.txt'), plain); } catch (_) {}
      process.stderr.write(`\n(${shareInfo ? 'share URL' : 'plain-text card'} ${noCopy ? '' : 'copied to your clipboard · '}card saved to my-niceness-card.txt)\n`);
      process.stderr.write('🔒 100% local — quiz scored on your machine, nothing was sent anywhere.\n');
      if (wantExportJson) {
        const rec = buildExportRecord({ persona }, scored.niceness, SCALE_NAME, span, stats, myName);
        try { fs.writeFileSync(path.join(process.cwd(), 'good-bot-card.json'), JSON.stringify(rec, null, 2)); } catch (_) {}
        process.stderr.write('📦 wrote good-bot-card.json (use --compare later)\n');
      }
      if (!noHistory) recordRun(persona, SCALE_NAME, scored.niceness);
      if (wantRecord) {
        const dest = path.join(process.cwd(), 'good-bot-cast.json');
        try {
          writeCast(text, dest, { title: `good-bot · ${persona.name}` });
          process.stderr.write(`🎬 wrote ${dest} (play with: asciinema play ${path.basename(dest)})\n`);
        } catch (e) { process.stderr.write(`cast export failed: ${e.message}\n`); }
      }
      if (webhookUrl) {
        let host = ''; try { host = new URL(webhookUrl).hostname; } catch (_) {}
        process.stderr.write(`\n⚠️  --post-webhook sends your REDACTED card to ${host || webhookUrl}\n`);
        postWebhook(webhookUrl, plain).then(r => {
          if (r.ok) process.stderr.write(`✅ posted to ${r.host} (HTTP ${r.status})\n`);
          else process.stderr.write(`❌ webhook post failed: ${r.error || ('HTTP ' + r.status + ' — ' + (r.body || ''))}\n`);
        });
      }
    })().catch(e => { process.stderr.write(`quiz failed: ${e.message}\n`); process.exit(1); });
    return;
  }

  let items, fileCount = 0, counts = {}, originLabel;
  if (importPath) {
    try { items = importExport(importPath); }
    catch (e) { process.stderr.write(`Could not read export file: ${e.message}\n`); process.exit(1); }
    originLabel = `imported export (${path.basename(importPath)})`;
    if (!items.length) { process.stderr.write('No human messages found in that export.\n'); process.exit(1); }
  } else {
    const r = collectMessages(source || 'all');
    items = r.items; fileCount = r.fileCount; counts = r.counts;
    if (!items.length) {
      process.stderr.write(
        'No local AI-assistant transcripts found.\n' +
        'Tried: Claude Code (~/.claude/projects), Codex (~/.codex/sessions),\n' +
        '       Gemini CLI (~/.gemini/tmp/*/logs.json + ~/.gemini/sessions),\n' +
        '       Continue.dev (~/.continue/sessions),\n' +
        '       Aider (.aider.chat.history.md in ~, the current dir, and project roots).\n' +
        'For Claude Desktop/web/Cowork: export your data and run with --import conversations.json\n' +
        'For Cursor / Windsurf: export your chat history and use --import (JSON).\n'
      );
      process.exit(1);
    }
    originLabel = Object.entries(counts).map(([k, v]) => `${v} from ${k}`).join(' + ');
  }

  if (!sampleOnly) process.stderr.write(`Reading your transcripts… ${items.length} messages (${originLabel}).\n`);

  const analysis = analyze(items);
  const stats = analysis.stats;
  const { first, last } = spanOf(items);
  const span = dateSpan(first, last);

  if (sampleOnly) { emitSample(analysis, stats, span); return; }

  // Achievements ride along on every run: the card shows the rarest few,
  // --achievements opens the full gallery (and short-circuits the card).
  const achievements = evaluateAchievements(
    computeAchievementStats(analysis, { sources: importPath ? 1 : Object.keys(counts).length || 1 }));
  if (wantAchievements) {
    const galleryText = renderAchievementGallery(achievements);
    process.stdout.write(galleryText + '\n');
    if (!noCopy) copyClipboard(galleryText.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write('🔒 100% local — nothing was sent anywhere, no data collected.\n');
    return;
  }

  // --lab: the research report replaces the card. Pure local math
  // (analytics.js + stats.js) over the same scored records — no AI, no
  // network, and only aggregate numbers + project basenames on the page.
  if (wantLab) {
    const labText = renderLab(buildLabReport(analysis.scored), { span });
    process.stdout.write(labText + '\n');
    if (!noCopy) copyClipboard(labText.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write(`(plain-text report ${noCopy ? 'ready above' : 'copied to your clipboard'})\n`);
    process.stderr.write('🔒 100% local — every statistical test ran on your machine; nothing was sent anywhere.\n');
    return;
  }

  let card = null;
  if (random) {
    const idx = Math.floor(Math.random() * SCALE.length);
    const persona = SCALE[idx];
    card = { persona, verdict: persona.tag, assessment: persona.blurb, exhibits: localExhibits(analysis.scored, idx) };
  } else if (_useAi) {
    process.stderr.write('\n⚠️  --ai sends a REDACTED sample of your own messages to your local `claude`.\n');
    process.stderr.write('Asking Claude to grade you (one short call)… ');
    const raw = llmCard(analysis, buildSample(analysis.scored, SAMPLE_CHAR_BUDGET), stats);
    const parsed = raw && parseLabeled(raw);
    if (parsed) {
      const persona = matchPersona(parsed.persona) || pickPersona(analysis.sig);
      card = { persona, verdict: parsed.verdict, assessment: parsed.assessment, exhibits: parsed.exhibits };
      process.stderr.write('done.\n');
    } else { process.stderr.write('no/odd response — falling back to local scoring.\n'); }
  }
  if (!card) {
    const persona = pickPersona(analysis.sig);
    const idx = SCALE.indexOf(persona);
    card = { persona, verdict: persona.tag, assessment: persona.blurb, exhibits: localExhibits(analysis.scored, idx) };
  }

  // --json: print the machine-readable report and stop — no card, no color,
  // no clipboard, no files, no history entry. Exhibit quotes stay out unless
  // the user opted in with --include-quotes (still redacted either way).
  if (wantJson) {
    const rep = buildJsonReport({
      persona: card.persona, niceness: analysis.niceness, stats,
      apologies: analysis.scored.reduce((acc, s) => acc + (s.apolog || 0), 0),
      achievements,
      sources: importPath ? { import: items.length } : counts,
      dateRange: span ? { first, last, label: span } : null,
      me: myName,
      exhibits: includeQuotes ? card.exhibits : null,
    });
    process.stdout.write(JSON.stringify(rep, null, 2) + '\n');
    process.stderr.write(`🔒 100% local — JSON written to stdout, nothing was sent anywhere.${includeQuotes ? '' : ' (quotes excluded — opt in with --include-quotes)'}\n`);
    return;
  }

  // --compare theirs.json: the teammate's saved card vs. the result we just
  // computed. Their file takes column A; you take column B.
  if (compareTheirs) {
    const mineRep = buildJsonReport({
      persona: card.persona, niceness: analysis.niceness, stats,
      achievements, me: myName || 'You',
      sources: importPath ? { import: items.length } : counts,
      dateRange: span ? { first, last, label: span } : null,
    });
    const mine = normalizeCardRecord(mineRep, 'your local result');
    const r = renderCompare(compareTheirs, mine);
    process.stdout.write(r.text + '\n');
    if (!noCopy) copyClipboard(r.text.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write('🔒 100% local — their card was read from disk, yours was computed right here; nothing was sent anywhere.\n');
    return;
  }

  // --roast: render the roast card instead of the report card. Deterministic
  // by default (seeded from the stats); --random reshuffles the jokes (and,
  // as everywhere, the persona + scale). Clipboard behavior matches the card.
  if (wantRoast) {
    const roast = buildRoast(computeRoastStats(analysis),
      random ? { seed: Math.floor(Math.random() * 0xffffffff) } : undefined);
    const roastText = renderRoastCard(card.persona, roast, stats, span);
    process.stdout.write(roastText + '\n');
    if (!noCopy) copyClipboard(roastText.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write(`(plain-text roast ${noCopy ? 'ready above' : 'copied to your clipboard'})\n`);
    if (random) process.stderr.write('🎲 jokes reshuffled — run again for a different set.\n');
    process.stderr.write('🔒 100% local — no AI, no network; the roast was assembled from your own stats.\n');
    return;
  }

  const text = renderCard(card.persona, card.verdict, card.assessment, card.exhibits, stats, span, achievements);
  process.stdout.write(text + '\n');
  if (wantTimeline) {
    if (_useAi) process.stderr.write('Rating each period with Claude…\n');
    process.stdout.write(renderTrends(analysis.scored, analysis.niceness, _useAi ? aiPeriodScorer : null) + '\n');
  }

  if (wantSvg) {
    const svg = renderSvg(card.persona, card.verdict, card.exhibits, stats, span);
    const svgPath = path.join(process.cwd(), 'good-bot-card.svg');
    fs.writeFileSync(svgPath, svg);
    const pngPath = path.join(process.cwd(), 'good-bot-card.png');
    const tool = tryRasterize(svgPath, pngPath);
    process.stderr.write(`🖼  wrote ${svgPath}${tool ? ` and ${pngPath} (via ${tool})` : ' (install rsvg-convert/cairosvg for PNG)'}\n`);
  }
  if (wantBadge) process.stdout.write('\n' + badgeMarkdown(card.persona) + '\n');

  if (wantWrapped) {
    const svg = wrappedSvg(card.persona, stats, span, analysis.niceness, computeWrapped(analysis));
    const svgPath = path.join(process.cwd(), 'good-bot-wrapped.svg');
    fs.writeFileSync(svgPath, svg);
    const pngPath = path.join(process.cwd(), 'good-bot-wrapped.png');
    const tool = tryRasterize(svgPath, pngPath, 1080);
    process.stderr.write(`✨ wrote your Wrapped poster → ${tool ? pngPath : svgPath}${tool ? ` (via ${tool})` : ' (install rsvg-convert/cairosvg for PNG)'}\n`);
    if (appShareTarget) {
      const caption = appShareCaption(card.persona, SCALE_NAME, appShareTarget);
      if (!noCopy) copyClipboard(caption);
      process.stdout.write(printAppShareInstructions(appShareTarget, tool ? pngPath : svgPath, caption));
      process.stderr.write(noCopy ? '(caption ready — copy from above)\n' : '📋 caption copied to your clipboard — paste it when you post\n');
    }
  }

  const plain = text.replace(/\[[0-9;]*m/g, '');

  let shareInfo = null;
  if (sharePlatform) {
    shareInfo = buildShareUrl(sharePlatform, card.persona, SCALE_NAME);
    if (!shareInfo) {
      const known = Object.entries(SHARE_PLATFORMS).filter(([, v]) => typeof v !== 'string').map(([k]) => k).join(' | ');
      process.stderr.write(`Unknown --share target "${sharePlatform}". Try: ${known}\n`);
    } else {
      process.stdout.write(`\n📣 Share to ${shareInfo.name}:\n${shareInfo.url}\n`);
      if (shareOpen) { openUrl(shareInfo.url); process.stderr.write(`(opened in your browser)\n`); }
    }
  }

  // --share: clipboard gets the URL (paste straight into Twitter/Bluesky/etc).
  // No --share: clipboard gets the card (existing behavior).
  if (!noCopy) copyClipboard(shareInfo ? shareInfo.url : plain);
  try { fs.writeFileSync(path.join(process.cwd(), 'my-niceness-card.txt'), plain); } catch (_) {}
  process.stderr.write(`\n(${shareInfo ? 'share URL' : 'plain-text card'} ${noCopy ? '' : 'copied to your clipboard · '}card saved to my-niceness-card.txt)\n`);
  if (random) process.stderr.write(`🎲 random pick on the ${SCALE_NAME} scale — run again for another.\n`);
  else if (!useAi) process.stderr.write('🔒 100% local — nothing was sent anywhere, no data collected. (--ai opts into a redacted local-LLM roast.)\n');
  if (wantExportJson) {
    const rec = buildExportRecord(card, analysis.niceness, SCALE_NAME, span, stats, myName);
    try { fs.writeFileSync(path.join(process.cwd(), 'good-bot-card.json'), JSON.stringify(rec, null, 2)); } catch (_) {}
    process.stderr.write('📦 wrote good-bot-card.json (use --compare later)\n');
  }
  if (!noHistory) recordRun(card.persona, SCALE_NAME, analysis.niceness);
  if (wantRecord) {
    const dest = path.join(process.cwd(), 'good-bot-cast.json');
    try {
      writeCast(text, dest, { title: `good-bot · ${card.persona.name}` });
      process.stderr.write(`🎬 wrote ${dest} (play with: asciinema play ${path.basename(dest)})\n`);
    } catch (e) { process.stderr.write(`cast export failed: ${e.message}\n`); }
  }
  if (webhookUrl) {
    let host = ''; try { host = new URL(_webhookUrl).hostname; } catch (_) {}
    process.stderr.write(`\n⚠️  --post-webhook sends your REDACTED card to ${host || _webhookUrl}\n`);
    postWebhook(_webhookUrl, plain).then(r => {
      if (r.ok) process.stderr.write(`✅ posted to ${r.host} (HTTP ${r.status})\n`);
      else process.stderr.write(`❌ webhook post failed: ${r.error || ('HTTP ' + r.status + ' — ' + (r.body || ''))}\n`);
    });
  }
}

if (require.main === module) main();

module.exports = {
  sanitize, extractTexts, extractCodex, extractGemini, extractContinue, extractAiderMarkdown,
  importExport, scoreMessage, shouty, shoutyWordCount, analyze,
  scaleIndex, personaFor, pickPersona, parseLabeled, matchPersona, cleanExhibit, sparkline, renderSvg,
  badgeMarkdown, computeWrapped, wrappedSvg, SCALES, SCALE, SCALE_NAME, SOURCES,
  SHARE_PLATFORMS, resolveSharePlatform, shareText, buildShareUrl,
  appShareCaption, printAppShareInstructions,
  QUIZ_QUESTIONS, scoreQuizAnswers, personaFromQuizFrac,
  HISTORY_PATH, readHistory, writeHistory, recordRun, forgetHistory,
  summarizeHistory, renderStreakReport,
  buildExportRecord, readCardJson, renderCompare,
  PKG_VERSION, personaId, buildJsonReport, normalizeCardRecord, compareQuip,
  postWebhook,
  buildAsciinemaCast, writeCast,
  loadTeamCards, rankTeamCards, renderLeaderboard,
  installNetworkAudit, renderAuditReport,
  achievementCardLines, renderAchievementGallery,
  roastSeed, computeRoastStats, isSaintly, roastBucketIds, buildRoast,
  renderRoastCard, DEMO_ROAST_STATS,
  renderLab,
};
