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
      if (!isNoise(text)) items.push({ text, ts: tsFromMs(o.timestamp) });
    }
    if (items.length) return { items, fileCount: 1 };
  }
  return collectFromSource({ root: path.join(os.homedir(), '.claude', 'projects'), extract: extractTexts });
}

const SOURCES = {
  claude: { label: 'Claude Code', collect: collectClaude },
  codex: { label: 'Codex', root: path.join(os.homedir(), '.codex', 'sessions'), extract: extractCodex },
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
      for (const t of texts) items.push({ text: t, ts });
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
      if (!isNoise(text)) items.push({ text, ts: m.created_at || m.create_time || c.created_at || null });
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
  return { nice, mean };
}

function analyze(items) {
  let totalMean = 0, totalChars = 0, posMsgs = 0, negMsgs = 0;
  let thanks = 0, pleases = 0, fbombs = 0, shouts = 0, apologies = 0, exclaims = 0;
  const scored = items.map(it => {
    const text = typeof it === 'string' ? it : it.text;
    const ts = typeof it === 'string' ? null : it.ts;
    const s = scoreMessage(text);
    totalMean += s.mean; totalChars += text.length;
    // Classify each message once, so a single gushing message can't outweigh
    // a hundred curt ones (and vice versa) — closer to real sentiment than
    // summing every keyword.
    if (s.nice > s.mean) posMsgs += 1;
    else if (s.mean > s.nice) negMsgs += 1;
    const low = text.toLowerCase();
    pleases += (low.match(/\bplease\b/g) || []).length;
    thanks += (low.match(/\b(?:thank|thanks|thx|ty)\b/g) || []).length;
    fbombs += (low.match(/\bfuck\w*\b/g) || []).length;
    apologies += (low.match(/\b(?:sorry|apolog|my bad)\w*\b/g) || []).length;
    if (text.includes('!')) exclaims += 1;
    if (shouty(text)) shouts += 1;
    return { text, ts, nice: s.nice, mean: s.mean };
  });
  const n = Math.max(items.length, 1);
  // Net share of warm vs. harsh messages, negatives weighted heavier (one
  // cruel message colors a relationship more than one kind one).
  const niceness = clamp(50 + ((posMsgs - 1.7 * negMsgs) / n) * 140, 0, 100);
  const sig = {
    n: items.length, niceness, avgLen: totalChars / n,
    posRate: posMsgs / n, negRate: negMsgs / n,
    pleaseRate: pleases / n, thanksRate: thanks / n, apologyRate: apologies / n,
    capsRate: shouts / n, exclaimRate: exclaims / n, meanRate: totalMean / n, fbombRate: fbombs / n,
    hash: Math.round(pleases * 7 + thanks * 13 + items.length * 3 + totalMean * 17 + totalChars),
  };
  return { scored, niceness, sig, stats: { messages: items.length, pleases, thanks, fbombs, shouts } };
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
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(vals) {
  if (!vals.length) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
  return vals.map(v => SPARK[clamp(Math.floor(((v - mn) / span) * 8), 0, 7)]).join('');
}
function bucketNiceness(group) {
  return clamp(50 + (group.nice / group.n) * 22 - (group.mean / group.n) * 40, 0, 100);
}
function groupBy(scored, keyFn) {
  const m = new Map();
  for (const s of scored) {
    const k = keyFn(s);
    if (k == null) continue;
    const e = m.get(k) || { n: 0, nice: 0, mean: 0 };
    e.n++; e.nice += s.nice; e.mean += s.mean;
    m.set(k, e);
  }
  return m;
}
const EIGHTHS = '▏▎▍▌▋▊▉█';
function fmtCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}
// A fixed-width meter, colored by the niceness tier, with eighth-block
// precision so small differences (52 vs 55) are actually visible.
function meter(niceness, width = 22) {
  const f = clamp(niceness, 0, 100) / 100 * width;
  const full = Math.floor(f);
  const rem = f - full;
  const partial = (full < width && rem > 0.06) ? EIGHTHS[clamp(Math.floor(rem * 8), 0, 7)] : '';
  const empty = Math.max(0, width - full - (partial ? 1 : 0));
  const p = personaForNiceness(niceness);
  const code = tierCode(SCALE.indexOf(p), SCALE.length);
  return color('█'.repeat(full) + partial, code) + color('░'.repeat(empty), '90');
}
function trendRow(label, niceness, n) {
  const p = personaForNiceness(niceness);
  const lab = color(label.padEnd(10), '97');
  const val = color(String(Math.round(niceness)).padStart(3), '1');
  const who = color(p.emoji + ' ' + p.name, '90');
  const cnt = n != null ? color(`  (${fmtCount(n)})`, '90') : '';
  return `      ${lab} ${meter(niceness)} ${val}  ${who}${cnt}`;
}
function renderTrends(scored) {
  const out = [''];
  out.push(color('   📈 Niceness over time', '1;97'));
  const months = [...groupBy(scored, s => (s.ts ? s.ts.slice(0, 7) : null)).entries()]
    .filter(([, e]) => e.n >= 5).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (months.length >= 2) {
    for (const [k, e] of months) {
      const [y, m] = k.split('-');
      out.push(trendRow(`${MONTHS[+m - 1]} ${y}`, bucketNiceness(e), e.n));
    }
  } else {
    out.push(color('      (need at least two months of history for a trend)', '90'));
  }

  const BINS = [['night', 0, 6], ['morning', 6, 12], ['afternoon', 12, 18], ['evening', 18, 24]];
  const byHour = groupBy(scored, s => (s.ts ? new Date(s.ts).getHours() : null));
  const rows = [];
  for (const [name, lo, hi] of BINS) {
    let n = 0, nice = 0, mean = 0;
    for (let h = lo; h < hi; h++) {
      const e = byHour.get(h);
      if (e) { n += e.n; nice += e.nice; mean += e.mean; }
    }
    if (n >= 5) rows.push(trendRow(name, bucketNiceness({ n, nice, mean }), n));
  }
  if (rows.length >= 2) {
    out.push('');
    out.push(color('   🕑 Niceness by time of day', '1;97'));
    out.push(...rows);
  }
  return out.join('\n');
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
function tryRasterize(svgPath, pngPath) {
  const attempts = [
    ['rsvg-convert', ['-w', '1640', '-o', pngPath, svgPath]],
    ['cairosvg', [svgPath, '-o', pngPath, '--output-width', '1640']],
    ['resvg', ['-w', '1640', svgPath, pngPath]],
    ['inkscape', [svgPath, '--export-type=png', `--export-filename=${pngPath}`, '-w', '1640']],
  ];
  if (process.platform === 'darwin') attempts.push(['qlmanage', ['-t', '-s', '1640', '-o', path.dirname(pngPath), svgPath]]);
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
  good-bot --svg | --image     write a shareable image card (SVG, + PNG if a converter exists)
  good-bot --badge             print a README/profile badge for your rank
  good-bot --scale <name>      people | spice | weather | coffee | dnd | trek | dogs | hogwarts
  good-bot --random            roll a random rank (and random scale) — run again for another
  good-bot --source <name>     claude | codex | all   (default: all found locally)
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
  const noCopy = argv.includes('--no-copy');
  const random = argv.includes('--random');
  const importPath = argv.includes('--import') ? argVal('--import') : null;
  const source = argVal('--source');

  // --random with no explicit scale also randomizes which ladder you get.
  const explicitScale = argVal('--scale') != null || process.env.NICENESS_SCALE != null;
  if (random && !explicitScale) {
    const keys = Object.keys(SCALES);
    useScale(keys[Math.floor(Math.random() * keys.length)]);
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
      process.stderr.write('No local AI-assistant transcripts found.\nTried Claude Code (~/.claude/projects) and Codex (~/.codex/sessions).\n' +
        'For Claude Desktop/web/Cowork: export your data and run with --import conversations.json\n');
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
  if (wantTimeline) process.stdout.write(renderTrends(analysis.scored) + '\n');

  if (wantSvg) {
    const svg = renderSvg(card.persona, card.verdict, card.exhibits, stats, span);
    const svgPath = path.join(process.cwd(), 'good-bot-card.svg');
    fs.writeFileSync(svgPath, svg);
    const pngPath = path.join(process.cwd(), 'good-bot-card.png');
    const tool = tryRasterize(svgPath, pngPath);
    process.stderr.write(`🖼  wrote ${svgPath}${tool ? ` and ${pngPath} (via ${tool})` : ' (install rsvg-convert/cairosvg for PNG)'}\n`);
  }
  if (wantBadge) process.stdout.write('\n' + badgeMarkdown(card.persona) + '\n');

  const plain = text.replace(/\[[0-9;]*m/g, '');
  if (!noCopy) copyClipboard(plain);
  try { fs.writeFileSync(path.join(process.cwd(), 'my-niceness-card.txt'), plain); } catch (_) {}
  process.stderr.write(`\n(plain-text ${noCopy ? '' : 'copied to your clipboard · '}saved to my-niceness-card.txt)\n`);
  if (random) process.stderr.write(`🎲 random pick on the ${SCALE_NAME} scale — run again for another.\n`);
  else if (!useAi) process.stderr.write('🔒 100% local — nothing was sent anywhere, no data collected. (--ai opts into a redacted local-LLM roast.)\n');
}

if (require.main === module) main();

module.exports = {
  sanitize, extractTexts, extractCodex, importExport, scoreMessage, shouty, analyze,
  scaleIndex, personaFor, pickPersona, parseLabeled, matchPersona, cleanExhibit, sparkline, renderSvg,
  badgeMarkdown, SCALES, SCALE, SCALE_NAME,
};
