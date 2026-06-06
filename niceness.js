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
//   good-bot --svg                     # write a shareable image card (SVG, + PNG if possible)
//   good-bot --badge                   # print a README/profile badge for your rank
//   good-bot --scale spice             # alternate ladders (try --demo to see one)
//   good-bot --source codex            # pick a tool: claude | codex | all (default: all found)
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

// Gemini CLI session entry. The tool writes JSONL with each event as a row;
// human messages have role 'user' and a string `content` (or `parts[].text`).
// We accept both shapes since the format has evolved.
function extractGemini(obj) {
  if (!obj) return [];
  const role = obj.role || (obj.message && obj.message.role) || null;
  if (role !== 'user') return [];
  const c = obj.content != null ? obj.content : (obj.message && obj.message.content);
  let text = '';
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) text = c.filter(p => p && (p.text || typeof p === 'string')).map(p => p.text || p).join(' ');
  else if (Array.isArray(obj.parts)) text = obj.parts.filter(p => p && p.text).map(p => p.text).join(' ');
  text = String(text || '').trim();
  return isNoise(text) ? [] : [text];
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

// Aider stores chat history as markdown in `.aider.chat.history.md` files.
// Human prompts are lines starting with `####`. We return human prompts split
// by the marker; the walker only descends into the user's chosen root (defaults
// to $HOME) and stops at 4 levels to avoid scanning everything.
function extractAiderMarkdown(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const lines = text.split('\n');
  let buf = null;
  for (const line of lines) {
    if (line.startsWith('#### ')) {
      if (buf !== null) { const t = buf.trim(); if (!isNoise(t)) out.push(t); }
      buf = line.slice(5);
    } else if (buf !== null) {
      if (line.startsWith('# ') || line.startsWith('> ')) {
        const t = buf.trim(); if (!isNoise(t)) out.push(t);
        buf = null;
      } else {
        buf += '\n' + line;
      }
    }
  }
  if (buf !== null) { const t = buf.trim(); if (!isNoise(t)) out.push(t); }
  return out;
}

function collectAider() {
  // Aider drops .aider.chat.history.md in each project root. We look at the
  // user's homedir + ~/Projects + ~/code + ~/src + ~/dev for these files.
  // Users with chats elsewhere can `--source aider --path <dir>` if we ever
  // expose that knob; for now this covers the common cases without scanning
  // an entire filesystem.
  const roots = [
    os.homedir(),
    path.join(os.homedir(), 'Projects'),
    path.join(os.homedir(), 'code'),
    path.join(os.homedir(), 'src'),
    path.join(os.homedir(), 'dev'),
    path.join(os.homedir(), 'work'),
    path.join(os.homedir(), 'workspace'),
  ];
  const items = [];
  let fileCount = 0;
  const seen = new Set();
  for (const r of roots) {
    let entries;
    try { entries = fs.readdirSync(r, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const projectDir = path.join(r, e.name);
      const histPath = path.join(projectDir, '.aider.chat.history.md');
      if (seen.has(histPath)) continue;
      seen.add(histPath);
      let data;
      try { data = fs.readFileSync(histPath, 'utf8'); } catch (_) { continue; }
      fileCount++;
      const texts = extractAiderMarkdown(data);
      const ts = (() => { try { return fs.statSync(histPath).mtime.toISOString(); } catch (_) { return null; } })();
      for (const t of texts) items.push({ text: t, ts, project: e.name });
    }
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
  gemini: { label: 'Gemini CLI', root: path.join(os.homedir(), '.gemini', 'sessions'), extract: extractGemini },
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

function shouty(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 5) return false;
  return text.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
}
function scoreMessage(text) {
  const low = text.toLowerCase();
  const negated = negatedPositives(low);
  let nice = countHits(low, STRONG_NICE) * 2 + countHits(low, SOFT_NICE);
  for (const e of NICE_EMOJI) nice += text.split(e).length - 1;
  nice = Math.max(0, nice - negated * 2);                 // a negated "thanks" isn't gratitude
  let mean = countHits(low, STRONG_MEAN) * 3 + countHits(low, SOFT_MEAN) + negated;
  if (shouty(text)) mean += 1;
  mean += (text.match(/!{3,}|\?!/g) || []).length;
  const frust = countHits(low, FRUSTRATION) + (low.match(/\?{2,}/g) || []).length;
  let enth = (text.includes('!') ? 1 : 0) + countHits(low, ENTHUSIASM);
  for (const e of ENTH_EMOJI) enth += text.split(e).length - 1;
  const pres = countHits(low, PRESSURE);
  // mood: warmth minus harshness, with frustration as a softer negative.
  const mood = nice - mean - 0.6 * frust;
  return { nice, mean, frust, enth, pres, mood };
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
    shout: shouty(text) ? 1 : 0,
    exclaim: text.includes('!') ? 1 : 0,
  };
}
// Aggregate a set of records into a niceness score + a sig usable by
// pickPersona + raw tone axes. No re-scoring.
function aggregate(list) {
  const n = Math.max(list.length, 1);
  let nice = 0, mean = 0, thanks = 0, pleases = 0, apolog = 0, fbomb = 0, shout = 0, exclaim = 0, chars = 0, frust = 0, enth = 0, pres = 0, pos = 0, neg = 0;
  for (const s of list) {
    nice += s.nice; mean += s.mean; thanks += s.thanks; pleases += s.pleases; apolog += s.apolog;
    fbomb += s.fbomb; shout += s.shout; exclaim += s.exclaim; chars += s.len; frust += s.frust; enth += s.enth; pres += s.pres;
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
function renderCard(persona, verdict, assessment, exhibits, stats, span) {
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
  out.push('');
  out.push(color('   ────────────────────────────────────────────────', '90'));
  out.push(color(`   📊 ${stats.messages} messages · ${stats.pleases} pleases · ${stats.thanks} thank-yous · ${stats.fbombs} f-bombs`, '96'));
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

// ---- export + compare --------------------------------------------------
// --export json writes a self-contained card record so two runs can be
// compared head-to-head later. --compare a.json b.json reads two such files
// and prints a "who's nicer" verdict.

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

function readCardJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw || !raw.persona || typeof raw.persona.name !== 'string') {
    throw new Error(`not a good-bot card: ${file}`);
  }
  if (typeof raw.niceness !== 'number') throw new Error(`missing niceness in ${file}`);
  return raw;
}

function renderCompare(a, b) {
  // a and b are card-export records. Decide a winner by niceness (ties go to
  // whoever has more pleases/thanks).
  const aNice = a.niceness, bNice = b.niceness;
  const aWins = aNice > bNice || (aNice === bNice && (a.stats.pleases + a.stats.thanks) > (b.stats.pleases + b.stats.thanks));
  const bWins = bNice > aNice || (aNice === bNice && (b.stats.pleases + b.stats.thanks) > (a.stats.pleases + a.stats.thanks));
  const tie = !aWins && !bWins;
  const nameA = a.displayName || a.persona.name;
  const nameB = b.displayName || b.persona.name;
  const lines = [];
  lines.push('');
  lines.push(color('  🥊  HEAD-TO-HEAD · WHO\'S NICER TO THEIR AI?', '1;35'));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  const pad = (s, w) => { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); };
  const W = 24;
  lines.push('  ' + color(pad('', 12), '90') + pad(nameA, W) + pad(nameB, W));
  const row = (label, va, vb) => {
    const aLabel = `${aWins && label === 'niceness' ? '👑 ' : ''}${va}`;
    const bLabel = `${bWins && label === 'niceness' ? '👑 ' : ''}${vb}`;
    lines.push('  ' + color(pad(label, 12), '90') + pad(aLabel, W) + pad(bLabel, W));
  };
  row('persona', `${a.persona.emoji || ''} ${a.persona.name}`.trim(), `${b.persona.emoji || ''} ${b.persona.name}`.trim());
  row('niceness', `${aNice}/100`, `${bNice}/100`);
  row('messages', String(a.stats.messages), String(b.stats.messages));
  row('pleases', String(a.stats.pleases), String(b.stats.pleases));
  row('thank-yous', String(a.stats.thanks), String(b.stats.thanks));
  row('f-bombs', String(a.stats.fbombs), String(b.stats.fbombs));
  lines.push(color('  ' + '─'.repeat(56), '90'));
  if (tie) {
    lines.push(color(`  🤝 TIE — both clock in at ${aNice}/100. Coexist gracefully.`, '36'));
  } else {
    const winner = aWins ? nameA : nameB;
    const loser = aWins ? nameB : nameA;
    const margin = Math.abs(aNice - bNice);
    lines.push(color(`  🥇 WINNER: ${winner}  (by ${margin}/100 over ${loser})`, '1;32'));
  }
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
  good-bot --wrapped           generate a "Your AI Relationship, Wrapped" share poster (PNG)
  good-bot --svg | --image     write a shareable image card (SVG, + PNG if a converter exists)
  good-bot --badge             print a README/profile badge for your rank
  good-bot --share <where>     compose URL for twitter | bluesky | linkedin | reddit (copies to clipboard)
  good-bot --share-open        also open the share URL in your browser
  good-bot --scale <name>      people | spice | weather | coffee | dnd | trek | dogs | hogwarts
                               office | succession | swfilms | marvel | parks
  good-bot --random            roll a random rank (and random scale) — run again for another
  good-bot --quiz              7-question personality quiz (no transcripts required)
  good-bot --quiz-answers ABCD non-interactive quiz: pass the 7-letter answer string
  good-bot --export json       write good-bot-card.json (for --compare later)
  good-bot --compare a.json b.json  head-to-head: whose AI relationship wins?
  good-bot --me <name>         label the card (for export + compare display)
  good-bot --streak            show your glow-up: persona streak, all-time best, trend
  good-bot --no-history        do not record this run to ~/.good-bot/history.json
  good-bot --forget-history    delete ~/.good-bot/history.json and exit
  good-bot --source <name>     claude | codex | gemini | continue | aider | all   (default: all found locally)
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
  if (argv.includes('--demo')) { renderDemo(); return; }

  const useAi = argv.includes('--ai');
  const sampleOnly = argv.includes('--sample');
  const wantTimeline = argv.includes('--timeline');
  const wantSvg = argv.includes('--svg') || argv.includes('--image');
  const wantBadge = argv.includes('--badge');
  const wantWrapped = argv.includes('--wrapped');
  const noCopy = argv.includes('--no-copy');
  const random = argv.includes('--random');
  const importPath = argv.includes('--import') ? argVal('--import') : null;
  const source = argVal('--source');
  const sharePlatform = argv.includes('--share') ? argVal('--share') : null;
  const shareOpen = argv.includes('--share-open');
  const wantQuiz = argv.includes('--quiz') || argv.includes('--quiz-answers');
  const quizAnswers = argv.includes('--quiz-answers') ? argVal('--quiz-answers') : null;
  const wantStreak = argv.includes('--streak');
  const noHistory = argv.includes('--no-history');
  const wantForget = argv.includes('--forget-history');
  const wantExportJson = argv.includes('--export') && argVal('--export') === 'json';
  const compareIdx = argv.indexOf('--compare');
  const compareFiles = compareIdx >= 0 ? argv.slice(compareIdx + 1, compareIdx + 3) : null;
  const myName = argv.includes('--me') ? argVal('--me') : null;

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

  // --compare a.json b.json head-to-head
  if (compareFiles && compareFiles.length === 2 && compareFiles[0] && compareFiles[1]) {
    let a, b;
    try { a = readCardJson(compareFiles[0]); } catch (e) { process.stderr.write(`failed to read ${compareFiles[0]}: ${e.message}\n`); process.exit(1); }
    try { b = readCardJson(compareFiles[1]); } catch (e) { process.stderr.write(`failed to read ${compareFiles[1]}: ${e.message}\n`); process.exit(1); }
    const r = renderCompare(a, b);
    process.stdout.write(r.text + '\n');
    if (!noCopy) copyClipboard(r.text.replace(/\x1b\[[0-9;]*m/g, ''));
    process.stderr.write('🔒 100% local — both files read on this machine, nothing was sent anywhere.\n');
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
      const text = renderCard(persona, persona.tag, persona.blurb, exhibits, stats, span);
      process.stdout.write(text + '\n');
      if (wantBadge) process.stdout.write('\n' + badgeMarkdown(persona) + '\n');
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
        '       Gemini CLI (~/.gemini/sessions), Continue.dev (~/.continue/sessions),\n' +
        '       Aider (~/**/.aider.chat.history.md).\n' +
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

  let card = null;
  if (random) {
    const idx = Math.floor(Math.random() * SCALE.length);
    const persona = SCALE[idx];
    card = { persona, verdict: persona.tag, assessment: persona.blurb, exhibits: localExhibits(analysis.scored, idx) };
  } else if (useAi) {
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

  const text = renderCard(card.persona, card.verdict, card.assessment, card.exhibits, stats, span);
  process.stdout.write(text + '\n');
  if (wantTimeline) {
    if (useAi) process.stderr.write('Rating each period with Claude…\n');
    process.stdout.write(renderTrends(analysis.scored, analysis.niceness, useAi ? aiPeriodScorer : null) + '\n');
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
}

if (require.main === module) main();

module.exports = {
  sanitize, extractTexts, extractCodex, extractGemini, extractContinue, extractAiderMarkdown,
  importExport, scoreMessage, shouty, analyze,
  scaleIndex, personaFor, pickPersona, parseLabeled, matchPersona, cleanExhibit, sparkline, renderSvg,
  badgeMarkdown, computeWrapped, wrappedSvg, SCALES, SCALE, SCALE_NAME, SOURCES,
  SHARE_PLATFORMS, resolveSharePlatform, shareText, buildShareUrl,
  QUIZ_QUESTIONS, scoreQuizAnswers, personaFromQuizFrac,
  HISTORY_PATH, readHistory, writeHistory, recordRun, forgetHistory,
  summarizeHistory, renderStreakReport,
  buildExportRecord, readCardJson, renderCompare,
};
