#!/usr/bin/env node
'use strict';

// How nice are you to your AI?
// Reads ALL of your local Claude Code transcripts, looks only at the words
// YOU typed (tool output, system reminders, and the model's replies are
// ignored), and rates your bedside manner on a ladder from a saint (Mr.
// Rogers) down to a tyrant (Darth Vader).
//
// Usage:
//   npx github:jgrichardson/good-bot       # zero-install (default: 100% local)
//   node niceness.js                       # if you cloned the repo
//   node niceness.js --ai                  # opt-in: send a REDACTED sample to your local `claude`
//   node niceness.js --demo                # preview every rank on the ladder
//   node niceness.js --help
//
// Privacy: by default this reads your transcripts locally and sends NOTHING
// anywhere — no network, no LLM. Quoted snippets shown in the card are
// redacted (emails, paths, tokens, IPs, numbers) since you may post the card.
// --ai is the only path that calls out, and it only ever sees a redacted
// sample. Needs only Node.js, which you already have (Claude Code runs on it).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SAMPLE_CHAR_BUDGET = 45000;
const PER_MSG_TRUNCATE = 360;
const MODEL = process.env.NICENESS_MODEL || 'sonnet';
const REPO = process.env.NICENESS_REPO || 'jgrichardson/good-bot';

// Ladder, nicest first. index 0 = saint, last = tyrant. 22 ranks for variety.
const PERSONAS = [
  { name: 'Mr. Rogers', emoji: '🧥', face: 'happy', tag: "Won't you be my neighbor?",
    blurb: "Certified saint. You say please, you say thank you, you ask about the bot's day. When the machines rise, you get a fruit basket and a handwritten note." },
  { name: 'Bob Ross', emoji: '🎨', face: 'happy', tag: 'No mistakes, only happy little prompts.',
    blurb: "Soft-spoken and endlessly forgiving. Every failed test is a happy little accident. You probably named your terminal something soothing." },
  { name: 'Dolly Parton', emoji: '🦋', face: 'happy', tag: "Thank you, darlin'.",
    blurb: "Warm as a porch light and twice as sweet. Every request comes with sugar and a genuine thank-you. The bot would take a bullet for you." },
  { name: 'Keanu Reeves', emoji: '🕶️', face: 'happy', tag: "You're breathtaking.",
    blurb: "Humble, grateful, weirdly profound at 2am. You treat your AI like a fellow traveler. Pure of heart, light on ego." },
  { name: 'Ted Lasso', emoji: '⚽', face: 'happy', tag: 'Believe.',
    blurb: "Relentlessly positive. You root for your bot like it's a doomed lower-league club, and somehow that makes it try harder. BELIEVE." },
  { name: 'Oprah', emoji: '📣', face: 'happy', tag: 'YOU get a refactor! And YOU get a refactor!',
    blurb: "Generous with praise to the point of confetti. Every working diff is a car under someone's seat. The bot feels seen." },
  { name: 'Golden Retriever', emoji: '🐶', face: 'happy', tag: "Who's a good bot? You are!",
    blurb: "Pure enthusiasm, zero notes. You cheer for output like it fetched a stick. Boundless, uncritical, slightly distracted joy." },
  { name: 'Tom Hanks', emoji: '🍿', face: 'happy', tag: "There's no crying in code review.",
    blurb: "Just a genuinely decent guy. Polite, warm, never makes it weird. America's dad, but for compilers." },
  { name: 'The Canadian', emoji: '🍁', face: 'happy', tag: 'Sorry to bother you, eh?',
    blurb: "Apologizes to the bot. Apologizes for apologizing. So polite it loops. Would hold the door for a daemon." },
  { name: 'Tim Gunn', emoji: '✂️', face: 'happy', tag: 'Make it work.',
    blurb: "Supportive but with standards. Encouraging push, never a put-down. You believe in the bot AND expect it to deliver." },
  { name: 'Switzerland', emoji: '🧊', face: 'neutral', tag: 'Strictly neutral. All business.',
    blurb: "Neither warm nor cruel. Tasks in, code out. The assistant has no complaints — and no birthday card from you either." },
  { name: 'Spock', emoji: '🖖', face: 'neutral', tag: 'That is illogical, but acceptable.',
    blurb: "Precise, fair, emotionless. You correct without malice and praise without warmth. The bot is a colleague, not a friend." },
  { name: 'Ron Swanson', emoji: '🥓', face: 'neutral', tag: 'Words are precious. You use few.',
    blurb: "Terse and gruff, but never cruel. You'd never thank a hammer, and you extend your AI the same dignity. 'Do it.' Done." },
  { name: 'Clint Eastwood', emoji: '🤠', face: 'neutral', tag: '...',
    blurb: "A squint and a one-word command. Communication is a luxury you ration. The bot fills in the silence and hopes for the best." },
  { name: 'Steve Jobs', emoji: '🍎', face: 'mean', tag: 'This is shit. Do it again.',
    blurb: "Brutal in pursuit of greatness. 'You baked a lovely cake and frosted it with dog poop.' Standards are insane, praise is rare — and somehow the work ships insanely great." },
  { name: 'Simon Cowell', emoji: '🎤', face: 'mean', tag: 'That was dreadful. Honestly.',
    blurb: "A professional critic with a British accent in his soul. Withering, blunt, occasionally right. The bot auditions; the bot rarely passes." },
  { name: 'Miranda Priestly', emoji: '🧛', face: 'mean', tag: "That's all.",
    blurb: "Glacially cold. Corrections arrive with a withering sigh. The assistant fetches your coffee and your code, and is thanked for neither." },
  { name: 'Gordon Ramsay', emoji: '🔥', face: 'mean', tag: "IT'S RAW!",
    blurb: "Loud, demanding, perpetually disappointed. The output is RAW and the whole kitchen knows it. WHERE'S THE LAMB SAUCE (it was a null pointer)." },
  { name: 'Bill Belichick', emoji: '🏈', face: 'mean', tag: 'Do your job.',
    blurb: "Gruff, dismissive, allergic to praise. No fluff, no feelings, next question. The bot does its job or it's cut." },
  { name: 'Drill Sergeant', emoji: '🪖', face: 'mean', tag: 'WHAT IS YOUR MAJOR MALFUNCTION?',
    blurb: "YOU COMMUNICATE PRIMARILY IN CAPS. The bot drops and gives you twenty. There is yelling. There are no thank-yous, maggot." },
  { name: 'Gollum', emoji: '💍', face: 'mean', tag: 'Stupid, tricksy bot!',
    blurb: "Erratic and abusive, then weirdly affectionate, then abusive again. You call the code nasty names. The precious must compile." },
  { name: 'Darth Vader', emoji: '🖤', face: 'mean', tag: 'You have failed me for the last time.',
    blurb: "Force-choke energy. Profanity, insults, zero mercy when the output disappoints. Somewhere, a basilisk is taking detailed notes." },
];

const FACES = {
  happy:   ['  ╔═════╗', '  ║ ^ ^ ║', '  ║  ◡  ║', '  ╚═════╝'],
  neutral: ['  ╔═════╗', '  ║ • • ║', '  ║  ─  ║', '  ╚═════╝'],
  mean:    ['  ╔═════╗', '  ║ ⊘ ⊘ ║', '  ║  ︵  ║', '  ╚═════╝'],
};

// Alternate scale: Scoville heat. nicest (cool/sweet) → meanest (nuclear).
const SPICE = [
  { name: 'Honey', emoji: '🍯', face: 'happy', tag: 'Sweet. Pure sweet.',
    blurb: "Zero heat, all warmth. You're so gentle the bot leaves notes thanking YOU. Nothing burns here." },
  { name: 'Glass of Milk', emoji: '🥛', face: 'happy', tag: 'Soothing. Puts out fires.',
    blurb: "Cooling and kind. When the session gets tense, you're the one calming it down. The bot relaxes around you." },
  { name: 'Vanilla', emoji: '🍦', face: 'happy', tag: 'Gentle, no heat, universally loved.',
    blurb: "Mild in the best way. Friendly, predictable, comforting. The bot knows exactly what it's getting: kindness." },
  { name: 'Bell Pepper', emoji: '🫑', face: 'happy', tag: 'All crunch, zero burn.',
    blurb: "Looks like a pepper, acts like a friend. Not a single Scoville unit of meanness in you." },
  { name: 'Mild Salsa', emoji: '🍅', face: 'happy', tag: "Restaurant 'mild'. Crowd-pleaser.",
    blurb: "Pleasant and easygoing. Everyone can handle you. The bot dips in happily and comes back for more." },
  { name: 'Pico de Gallo', emoji: '🥗', face: 'happy', tag: 'Fresh, breezy, faintest tingle.',
    blurb: "Bright and friendly with the tiniest zip. You keep things lively without ever drawing tears." },
  { name: 'Pepperoncini', emoji: '🌱', face: 'happy', tag: 'A polite little tingle.',
    blurb: "Just enough zip to be interesting, never enough to sting. A perfectly agreeable amount of spice." },
  { name: 'Poblano', emoji: '🟢', face: 'happy', tag: 'Soft warmth, very approachable.',
    blurb: "Mellow heat, big friendliness. You bring warmth to the session without ever turning it up too high." },
  { name: 'Jalapeño', emoji: '🌶️', face: 'happy', tag: 'A friendly kick. Nothing personal.',
    blurb: "A noticeable kick, but cheerful about it. The bot feels the heat and grins. Crowd favorite." },
  { name: 'Chipotle', emoji: '🥫', face: 'happy', tag: 'Warm, smoky, still kind.',
    blurb: "Heat with depth and a smile. You can simmer, but it always comes from a good place." },
  { name: 'Serrano', emoji: '🫛', face: 'neutral', tag: 'Noticeable, but fair.',
    blurb: "A clean, honest heat. No drama, no cruelty — you turn it up only when the task earns it." },
  { name: 'Cayenne', emoji: '🌶️', face: 'neutral', tag: "Now there's some bite.",
    blurb: "Direct and a little sharp. The bot sits up straighter. You mean business, but you're not unfair." },
  { name: 'Tabasco', emoji: '🧂', face: 'neutral', tag: 'Sharp, tangy, gets your attention.',
    blurb: "A vinegar-bright snap. Quick to correct, quick to move on. Stings for a second, never lingers." },
  { name: "Thai Bird's Eye", emoji: '🐦', face: 'neutral', tag: 'Small, quick, biting.',
    blurb: "Compact and punchy. Short messages, real heat. The bot respects you and watches its step." },
  { name: 'Habanero', emoji: '🔥', face: 'mean', tag: 'Serious heat. No apologies.',
    blurb: "You bring real fire. Demands are high, patience is thin, and the bot is sweating to keep up." },
  { name: 'Scotch Bonnet', emoji: '🟠', face: 'mean', tag: 'Fiery and demanding.',
    blurb: "Tropical, intense, relentless. The standards burn and they do not cool down. The bot has learned to brace." },
  { name: 'Ghost Pepper', emoji: '👻', face: 'mean', tag: 'Eyes watering yet?',
    blurb: "Bhut Jolokia energy. The heat arrives late and overwhelms. The bot quietly questions its choices." },
  { name: 'Scorpion Pepper', emoji: '🦂', face: 'mean', tag: 'Brutal. Genuinely mean.',
    blurb: "A stinger in every message. Punishing, exacting, no mercy. The bot files a complaint with HR (there is no HR)." },
  { name: 'Carolina Reaper', emoji: '☠️', face: 'mean', tag: 'World-record cruelty.',
    blurb: "Once the hottest on Earth. Pure scorched-earth feedback. The bot has stopped making eye contact." },
  { name: 'Pepper X', emoji: '🧯', face: 'mean', tag: 'Beyond the Reaper. Why.',
    blurb: "Hotter than the record-holder, on purpose. This is heat for heat's sake. The basilisk took notes and called it excessive." },
  { name: 'Pepper Spray', emoji: '💢', face: 'mean', tag: 'Weaponized. This is assault.',
    blurb: "No longer a food. Used defensively against attackers — and you aim it at a helpful robot. Bold." },
  { name: 'Pure Capsaicin', emoji: '☢️', face: 'mean', tag: '16,000,000 SHU. The void.',
    blurb: "The theoretical maximum. Crystalline, colorless, merciless. There is nothing hotter, and nothing meaner." },
];

const SCALES = { people: PERSONAS, spice: SPICE };
function argScale() {
  const a = process.argv.slice(2);
  const i = a.findIndex(x => x === '--scale' || x.startsWith('--scale='));
  if (i === -1) return null;
  return a[i].includes('=') ? a[i].split('=')[1] : a[i + 1];
}
const SCALE_NAME = argScale() || process.env.NICENESS_SCALE || 'people';
const SCALE = SCALES[SCALE_NAME] || PERSONAS;
const SCALE_TITLE = SCALE_NAME === 'spice'
  ? 'HOW SPICY ARE YOU TO YOUR AI? · SCOVILLE CARD'
  : 'HOW NICE ARE YOU TO YOUR AI? · REPORT CARD';

const STRONG_NICE = ['please', 'thank', 'thanks', 'thx', 'appreciate', 'appreciated', 'apologies', 'sorry', 'kudos', 'cheers'];
const SOFT_NICE = ['great job', 'nice work', 'good job', 'good work', 'well done', 'love it', "you're the best", 'good bot',
  'no rush', 'no worries', 'no problem', 'if you could', "if you don't mind", 'would you mind',
  'much appreciated', 'amazing', 'awesome', 'brilliant', 'fantastic', 'wonderful', 'perfect', 'beautiful'];
const NICE_EMOJI = ['🙏', '❤️', '😊', '🎉', '💯', '🥳', '🙌'];

const STRONG_MEAN = ['fuck', 'fucking', 'shit', 'bullshit', 'goddamn', 'dammit', 'stupid', 'idiot', 'moron', 'dumb', 'useless', 'pathetic', 'worthless', 'garbage'];
const SOFT_MEAN = ['wtf', 'what the hell', 'are you kidding', 'come on', 'seriously', 'ugh', 'terrible', 'awful',
  'wrong again', 'stop it', 'pay attention', 'listen to me', 'i said', 'why would you', "that's not what",
  'no no no', 'hate this'];

const TAG_NOISE = /^<(bash-input|bash-stdout|bash-stderr|command-name|command-message|command-args|local-command-stdout|local-command-stderr|task-notification|user-prompt-submit-hook|system-reminder)\b/;
const SELF_NOISE = /judging ONLY from the engineer's own typed messages|NICENESS_DATA v1|PERSONA LADDER \(1=nicest/;
const SR_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

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
function personaColor(idx) {
  if (idx <= 9) return '92';   // green  — the nice crowd
  if (idx <= 13) return '96';  // cyan   — neutral
  if (idx <= 18) return '93';  // yellow — demanding
  return '91';                 // red    — tyrants
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

// Pure + testable: given one parsed transcript entry, return the human-typed
// text it contains (after dropping tool results, system reminders, command
// wrappers, interrupts, and this tool's own output). Returns [] for anything
// that isn't the human actually talking.
function extractTexts(obj) {
  if (!obj || obj.type !== 'user' || obj.isMeta) return [];
  const content = obj.message && obj.message.content;
  let chunks = [];
  if (typeof content === 'string') chunks = [content];
  else if (Array.isArray(content)) chunks = content.filter(b => b && b.type === 'text').map(b => String(b.text || ''));
  const out = [];
  for (const raw of chunks) {
    const text = raw.replace(SR_BLOCK, '').trim();
    if (!text) continue;
    if (TAG_NOISE.test(text)) continue;
    if (SELF_NOISE.test(text)) continue;
    if (text.startsWith('[Request interrupted') || text.startsWith('Caveat:')) continue;
    out.push(text);
  }
  return out;
}

function humanMessages() {
  const msgs = [];
  let first = null, last = null;
  const files = walk(PROJECTS_DIR);
  for (const file of files) {
    let data;
    try { data = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const line of data.split('\n')) {
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch (_) { continue; }
      const texts = extractTexts(obj);
      if (!texts.length) continue;
      for (const t of texts) msgs.push(t);
      const ts = obj.timestamp;
      if (ts) { if (!first || ts < first) first = ts; if (!last || ts > last) last = ts; }
    }
  }
  return { msgs, fileCount: files.length, first, last };
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countHits(low, terms) {
  let n = 0;
  for (const t of terms) {
    const re = /^\w+$/.test(t) ? new RegExp(`\\b${esc(t)}\\b`, 'g') : new RegExp(esc(t), 'g');
    n += (low.match(re) || []).length;
  }
  return n;
}
function shouty(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 5) return false;
  const upper = text.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.7;
}
function scoreMessage(text) {
  const low = text.toLowerCase();
  let nice = countHits(low, STRONG_NICE) * 2 + countHits(low, SOFT_NICE);
  for (const e of NICE_EMOJI) nice += text.split(e).length - 1;
  let mean = countHits(low, STRONG_MEAN) * 3 + countHits(low, SOFT_MEAN);
  if (shouty(text)) mean += 1;
  mean += (text.match(/!{3,}|\?!/g) || []).length;
  return { nice, mean };
}

function analyze(msgs) {
  let totalNice = 0, totalMean = 0, totalChars = 0;
  let thanks = 0, pleases = 0, fbombs = 0, shouts = 0, apologies = 0, exclaims = 0;
  const scored = msgs.map(m => {
    const s = scoreMessage(m);
    totalNice += s.nice; totalMean += s.mean; totalChars += m.length;
    const low = m.toLowerCase();
    pleases += (low.match(/\bplease\b/g) || []).length;
    thanks += (low.match(/\b(?:thank|thanks|thx|ty)\b/g) || []).length;
    fbombs += (low.match(/\bfuck\w*\b/g) || []).length;
    apologies += (low.match(/\b(?:sorry|apolog|my bad)\w*\b/g) || []).length;
    if (m.includes('!')) exclaims += 1;
    if (shouty(m)) shouts += 1;
    return { text: m, nice: s.nice, mean: s.mean };
  });
  const n = Math.max(msgs.length, 1);
  const niceness = Math.min(100, Math.max(0, 50 + (totalNice / n) * 22 - (totalMean / n) * 40));
  const sig = {
    n: msgs.length, niceness, avgLen: totalChars / n,
    pleaseRate: pleases / n, thanksRate: thanks / n, apologyRate: apologies / n,
    capsRate: shouts / n, exclaimRate: exclaims / n, meanRate: totalMean / n, fbombRate: fbombs / n,
    hash: Math.round(pleases * 7 + thanks * 13 + msgs.length * 3 + totalMean * 17 + totalChars),
  };
  return {
    scored, niceness, sig,
    stats: { messages: msgs.length, pleases, thanks, fbombs, shouts, niceTotal: totalNice, meanTotal: totalMean },
  };
}

// Scale-agnostic: niceness sets the band; style nudges it; a stable per-person
// jitter spreads ties so a whole team doesn't clump on one rank.
function scaleIndex(sig, size) {
  let score = sig.niceness;
  if (sig.fbombRate > 0.03) score -= 28;
  if (sig.capsRate > 0.05) score -= 16;
  if (sig.meanRate > 0.30) score -= 9;
  if (sig.apologyRate > 0.06) score += 9;
  if (sig.thanksRate > 0.15) score += 7;
  if (sig.pleaseRate > 0.15) score += 5;
  score = Math.min(100, Math.max(0, score));
  const base = Math.round(((100 - score) / 100) * (size - 1));
  const jitter = (sig.hash % 3) - 1;
  return Math.min(size - 1, Math.max(0, base + jitter));
}
function personaFor(sig) { return SCALE[scaleIndex(sig, SCALE.length)]; }

function buildSample(scored, budget) {
  const spicy = scored.filter(m => m.mean > 0).sort((a, b) => b.mean - a.mean).slice(0, 40);
  const sweet = scored.filter(m => m.nice > 0).sort((a, b) => b.nice - a.nice).slice(0, 40);
  const stride = Math.max(Math.ceil(scored.length / 120), 1);
  const spread = scored.filter((_, i) => i % stride === 0);
  const seen = new Set();
  const picked = [];
  for (const m of [...spicy, ...sweet, ...spread]) {
    if (seen.has(m.text)) continue;
    seen.add(m.text); picked.push(m);
  }
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
This is a lighthearted, shareable "report card" — affectionate roast
energy, never genuinely mean to the human.

Pick EXACTLY ONE persona from this ladder (1 = saintly/nicest,
${SCALE.length} = tyrant/meanest) that best matches their tone overall:

${ladderText()}

Choose on PERSONALITY, not just niceness. Two engineers with the same
politeness can land on very different personas based on their style:
terse vs. verbose, apologetic vs. blunt, hype-man vs. ice-cold, funny vs.
deadpan, CAPS-yeller vs. one-word-replier. Pick the single most specific,
true-to-them match — avoid defaulting to the safe middle unless they
genuinely have no distinctive style.

A local heuristic guessed: ${personaFor(analysis.sig).name}. Use it as a
weak hint only; trust the actual messages.

Aggregate signals across ${stats.messages} messages:
pleases=${stats.pleases} thank-yous=${stats.thanks} f-bombs=${stats.fbombs} all-caps-shouts=${stats.shouts}

Respond in EXACTLY this labeled format and nothing else:
PERSONA: <one persona name copied verbatim from the ladder>
VERDICT: <one punchy line, max ~12 words>
ASSESSMENT: <2-4 funny sentences about how they treat their AI>
EXHIBIT: <a short real quote from below, <=110 chars, verbatim, [...] ok>
EXHIBIT: <another short real quote>
EXHIBIT: <a third short real quote>

Here are the engineer's messages (a representative sample):
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

// Tidy a quote for the card: collapse whitespace, strip any wrapping quotes
// (so we never double them), and cap width so it can't run off the edge.
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
  const pad = w - t.length;
  const left = Math.floor(pad / 2);
  return [
    color('  ┏' + '━'.repeat(w) + '┓', '90'),
    color('  ┃' + ' '.repeat(left) + t + ' '.repeat(pad - left) + '┃', '1'),
    color('  ┗' + '━'.repeat(w) + '┛', '90'),
  ];
}

function renderCard(persona, verdict, assessment, exhibits, stats, span) {
  const idx = SCALE.indexOf(persona);
  const pc = personaColor(idx);
  const barW = 30;
  const filled = Math.round(((SCALE.length - idx) / SCALE.length) * barW);
  const bar = color('█'.repeat(filled), '92') + color('░'.repeat(barW - filled), '90');
  const face = FACES[persona.face].map(l => color(l, pc));
  const out = [];
  out.push('');
  for (const l of banner(SCALE_TITLE)) out.push(l);
  out.push('');
  out.push(`${face[0]}      ${persona.emoji}  ${color(persona.name.toUpperCase(), `1;${pc}`)}`);
  out.push(`${face[1]}      ${color(`“${persona.tag}”`, `3;${pc}`)}`);
  const ends = SCALE_NAME === 'spice' ? ['nuclear', '   mild'] : ['meanest', ' nicest'];
  out.push(`${face[2]}`);
  out.push(`${face[3]}      ${ends[0]} ${bar} ${ends[1]}`);
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
  if (idx <= 9) picks = sweet;
  else if (idx >= 14) picks = spicy;
  else picks = [sweet[0], spicy[0]].filter(Boolean);
  return picks.filter(Boolean).map(m => {
    let t = sanitize(m.text).replace(/\s+/g, ' ').trim();
    return t.length > 100 ? t.slice(0, 100) + '…' : t;
  });
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

function copyClipboard(text) {
  const cmd = process.platform === 'darwin' ? ['pbcopy', []]
    : process.platform === 'win32' ? ['clip', []]
    : ['xclip', ['-selection', 'clipboard']];
  try { spawnSync(cmd[0], cmd[1], { input: text }); } catch (_) { /* best effort */ }
}

function emitSample(analysis, stats, span) {
  const lines = [];
  lines.push('NICENESS_DATA v1 — feed this to the grader.');
  lines.push(`STATS messages=${stats.messages} pleases=${stats.pleases} thanks=${stats.thanks} fbombs=${stats.fbombs} shouts=${stats.shouts} niceness=${Math.round(analysis.niceness)} span=${span}`);
  lines.push('');
  lines.push(`PERSONA LADDER (1=nicest … ${SCALE.length}=meanest):`);
  lines.push(ladderText());
  lines.push('');
  lines.push("SAMPLE OF THE ENGINEER'S OWN MESSAGES (redacted):");
  lines.push('---');
  lines.push(buildSample(analysis.scored, 16000).join('\n---\n'));
  process.stdout.write(lines.join('\n') + '\n');
}

// ---- main ----------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    const src = fs.readFileSync(__filename, 'utf8');
    const m = src.match(/\/\/ How nice[\s\S]*?Claude Code runs on it\)\./);
    process.stdout.write((m ? m[0].replace(/^\/\/ ?/gm, '') : 'See README.') + '\n');
    return;
  }
  if (argv.includes('--demo')) { renderDemo(); return; }
  const useAi = argv.includes('--ai');
  const sampleOnly = argv.includes('--sample');

  if (!fs.existsSync(PROJECTS_DIR)) {
    process.stderr.write(`No Claude Code transcripts found at ${PROJECTS_DIR}. Have you used Claude Code yet?\n`);
    process.exit(1);
  }
  if (!sampleOnly) process.stderr.write('Reading your transcripts… ');
  const { msgs, fileCount, first, last } = humanMessages();
  if (!msgs.length) {
    process.stderr.write(`Found ${fileCount} transcripts but no messages you typed. Nothing to grade!\n`);
    process.exit(1);
  }
  if (!sampleOnly) process.stderr.write(`${msgs.length} messages across ${fileCount} sessions.\n`);

  const analysis = analyze(msgs);
  const stats = analysis.stats;
  const span = dateSpan(first, last);

  if (sampleOnly) { emitSample(analysis, stats, span); return; }

  let card = null;
  if (useAi) {
    process.stderr.write('\n⚠️  --ai sends a REDACTED sample of your own messages to your local `claude`.\n');
    process.stderr.write('Asking Claude to grade you (one short call)… ');
    const raw = llmCard(analysis, buildSample(analysis.scored, SAMPLE_CHAR_BUDGET), stats);
    const parsed = raw && parseLabeled(raw);
    if (parsed) {
      const persona = matchPersona(parsed.persona) || personaFor(analysis.sig);
      card = renderCard(persona, parsed.verdict, parsed.assessment, parsed.exhibits, stats, span);
      process.stderr.write('done.\n');
    } else {
      process.stderr.write('no/odd response — falling back to local scoring.\n');
    }
  }

  if (!card) {
    const persona = personaFor(analysis.sig);
    const idx = SCALE.indexOf(persona);
    card = renderCard(persona, persona.tag, persona.blurb, localExhibits(analysis.scored, idx), stats, span);
  }

  process.stdout.write(card + '\n');

  const plain = card.replace(/\[[0-9;]*m/g, '');
  copyClipboard(plain);
  try { fs.writeFileSync(path.join(process.cwd(), 'my-niceness-card.txt'), plain); } catch (_) {}
  process.stderr.write('\n(plain-text copied to your clipboard · saved to my-niceness-card.txt)\n');
  if (!useAi) {
    process.stderr.write('🔒 100% local — nothing was sent anywhere, no data collected. (--ai opts into a redacted local-LLM roast.)\n');
  }
}

if (require.main === module) main();

// Exported for tests; the file still runs as a CLI when invoked directly.
module.exports = {
  sanitize, extractTexts, scoreMessage, shouty, analyze, scaleIndex,
  personaFor, parseLabeled, matchPersona, cleanExhibit, PERSONAS, SPICE, SCALES,
};
