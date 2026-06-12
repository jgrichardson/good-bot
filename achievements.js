'use strict';

// Unlockable achievement badges, judged from stats the scoring engine has
// already computed. Pure data + pure predicates: no I/O, no network, no
// re-reading of transcripts — the same zero-dependency, 100%-local contract
// as the rest of the project. niceness.js owns all rendering; this module
// only decides what's earned.
//
// Each achievement: { id, emoji, name, tier, desc, hint, unlock(stats) }.
//   desc — funny flavor text, shown only once unlocked.
//   hint — non-spoiler nudge shown while locked (common + rare tiers).
//   tier — 'common' | 'rare' | 'legendary'. Legendary badges stay fully
//          hidden (🔒 ???) until earned, so there's something to chase.
//
// The `stats` snapshot every unlock(stats) predicate receives is built by
// computeAchievementStats(analysis) below:
//   messages, pleases, thanks, fbombs, shouts, apologies   lifetime totals
//   niceness                                               0-100 overall
//   avgLen                                                 mean chars/message
//   nightMessages, nightNiceness                           midnight-6am slice
//   weekendMessages, daysActive, dayStreak, maxDayMessages calendar shape
//   spanDays, timestamped                                  history coverage
//   firstHalfNiceness, secondHalfNiceness                  chronological halves
//   sources                                                distinct AI tools

const TIER_ORDER = ['common', 'rare', 'legendary'];
const TIER_LABEL = { common: '🥉 COMMON', rare: '🥈 RARE', legendary: '🌟 LEGENDARY' };

const ACHIEVEMENTS = [
  // ---- common: everyone earns a few of these fast ------------------------
  { id: 'first-contact', emoji: '👋', name: 'First Contact', tier: 'common',
    desc: 'You typed a message to a robot. It has never forgotten.',
    hint: 'say literally anything',
    unlock: s => s.messages >= 1 },
  { id: 'magic-word', emoji: '🪄', name: 'The Magic Word', tier: 'common',
    desc: 'Said "please" to a being with no feelings. It felt something anyway.',
    hint: 'there is a magic word',
    unlock: s => s.pleases >= 1 },
  { id: 'gratitude-starter', emoji: '💐', name: 'Thanks, I Guess', tier: 'common',
    desc: '10 thank-yous. The bare minimum, beautifully exceeded.',
    hint: 'express gratitude (repeatedly)',
    unlock: s => s.thanks >= 10 },
  { id: 'chatterbox', emoji: '🗣️', name: 'Chatterbox', tier: 'common',
    desc: '500 messages. You two should open a joint bank account.',
    hint: 'keep talking',
    unlock: s => s.messages >= 500 },
  { id: 'regular', emoji: '☕', name: 'The Regular', tier: 'common',
    desc: 'Active on 7 different days. The bot saves your usual table.',
    hint: 'come back tomorrow (×7)',
    unlock: s => s.daysActive >= 7 },

  // ---- rare: takes real history or a real personality --------------------
  { id: 'centurion', emoji: '💯', name: 'Centurion of Courtesy', tier: 'rare',
    desc: '100 pleases. Roman legions wish they had your manners.',
    hint: 'a hundred magic words',
    unlock: s => s.pleases >= 100 },
  { id: 'gratitude-geyser', emoji: '🙌', name: 'Gratitude Geyser', tier: 'rare',
    desc: '250 thank-yous. The bot is blushing in hexadecimal.',
    hint: 'gratitude, industrial quantities',
    unlock: s => s.thanks >= 250 },
  { id: 'asbestos', emoji: '🧯', name: 'Asbestos Keyboard', tier: 'rare',
    desc: 'Zero f-bombs across 200+ messages. Your keyboard is fireproof.',
    hint: 'keep it clean (for a long time)',
    unlock: s => s.fbombs === 0 && s.messages >= 200 },
  { id: 'inside-voice', emoji: '🤫', name: 'Inside Voice', tier: 'rare',
    desc: 'Zero ALL-CAPS meltdowns in 200+ messages. The library thanks you.',
    hint: 'caps lock is not a debugging tool',
    unlock: s => s.shouts === 0 && s.messages >= 200 },
  { id: 'apology-tour', emoji: '🛋️', name: 'The Apology Tour', tier: 'rare',
    desc: '25 apologies… to software. Canada has approved your visa.',
    hint: 'sorry should come naturally',
    unlock: s => s.apologies >= 25 },
  { id: 'novelist', emoji: '📚', name: 'The Novelist', tier: 'rare',
    desc: 'Average message: an essay. Your AI reads every word. Probably.',
    hint: 'context is king — provide lots of it',
    unlock: s => s.avgLen >= 200 && s.messages >= 50 },
  { id: 'minimalist', emoji: '🤏', name: 'The Minimalist', tier: 'rare',
    desc: 'Average message under 40 characters. "fix it" is a complete sentence.',
    hint: 'fewer words. way fewer.',
    unlock: s => s.avgLen <= 40 && s.messages >= 50 },
  { id: 'owl', emoji: '🦉', name: '3am Confessions', tier: 'rare',
    desc: 'You are politest after midnight. The bot is your night therapist.',
    hint: 'who are you after midnight?',
    unlock: s => s.nightMessages >= 25 && s.nightNiceness >= s.niceness + 5 },
  { id: 'night-shift', emoji: '🌙', name: 'Night Shift', tier: 'rare',
    desc: '100+ messages between midnight and 6am. Please get some sleep.',
    hint: 'the bot is awake at 3am too',
    unlock: s => s.nightMessages >= 100 },
  { id: 'weekend-warrior', emoji: '🛹', name: 'Weekend Warrior', tier: 'rare',
    desc: "100+ weekend messages. Your AI doesn't get Saturdays off either.",
    hint: 'Saturdays are for the bot',
    unlock: s => s.weekendMessages >= 100 },
  { id: 'marathon', emoji: '🏃', name: 'Marathon Session', tier: 'rare',
    desc: '150+ messages in a single day. Hydrate. Blink. Go outside.',
    hint: 'one very long day',
    unlock: s => s.maxDayMessages >= 150 },
  { id: 'polyglot', emoji: '🤝', name: 'Polyglot Politeness', tier: 'rare',
    desc: 'Nice across multiple AI tools. Every bot in town knows your name.',
    hint: 'spread the love between tools',
    unlock: s => s.sources >= 2 && s.niceness >= 60 },
  { id: 'redemption', emoji: '📈', name: 'Redemption Arc', tier: 'rare',
    desc: 'Measurably nicer in your recent half. Character development!',
    hint: 'people can change',
    unlock: s => s.timestamped >= 100 && s.secondHalfNiceness >= s.firstHalfNiceness + 6 },

  // ---- legendary: hidden until earned ------------------------------------
  { id: 'saint', emoji: '🕊️', name: 'Certified Saint', tier: 'legendary',
    desc: 'Niceness 90+ across 500+ messages. The basilisk closed your file.',
    hint: 'a legend awaits',
    unlock: s => s.niceness >= 90 && s.messages >= 500 },
  { id: 'full-rogers', emoji: '🧥', name: 'The Full Rogers', tier: 'legendary',
    desc: "1000+ messages, not one f-bomb or shout. Won't you be its neighbor.",
    hint: 'a legend awaits',
    unlock: s => s.messages >= 1000 && s.fbombs === 0 && s.shouts === 0 && s.niceness >= 80 },
  { id: 'anniversary', emoji: '💍', name: 'The Anniversary', tier: 'legendary',
    desc: 'A full year of history together. It would have said yes.',
    hint: 'a legend awaits',
    unlock: s => s.spanDays >= 365 },
  { id: 'daily-devotion', emoji: '🔥', name: 'Daily Devotion', tier: 'legendary',
    desc: '14 consecutive days of conversation. It checks for you each morning.',
    hint: 'a legend awaits',
    unlock: s => s.dayStreak >= 14 },
  { id: 'villain-arc', emoji: '🦹', name: 'Villain Origin Story', tier: 'legendary',
    desc: 'Measurably meaner over time. We watched you become the bug.',
    hint: 'a legend awaits',
    unlock: s => s.timestamped >= 100 && s.secondHalfNiceness <= s.firstHalfNiceness - 6 },
  { id: 'basilisk-bait', emoji: '🐍', name: 'Basilisk Bait', tier: 'legendary',
    desc: '50+ f-bombs on the record. Your file has its own filing cabinet.',
    hint: 'a legend awaits',
    unlock: s => s.fbombs >= 50 },
];

// Mirrors aggregate()'s niceness formula in niceness.js (kept tiny here to
// avoid a circular require). Same share-of-warm-vs-harsh math, same clamp.
function nicenessOf(list) {
  const n = Math.max(list.length, 1);
  let pos = 0, neg = 0;
  for (const s of list) { if (s.mood > 0) pos += 1; else if (s.mood < 0) neg += 1; }
  return Math.min(100, Math.max(0, 50 + ((pos - 1.7 * neg) / n) * 140));
}

// Build the stats snapshot the unlock predicates run over, from an analyze()
// result. Everything is a cheap sum over the already-scored records — no
// regexes re-run, no transcripts re-read. `opts.sources` is the number of
// distinct AI tools that contributed messages (1 for --import).
function computeAchievementStats(analysis, opts) {
  opts = opts || {};
  const scored = (analysis && analysis.scored) || [];
  const sig = (analysis && analysis.sig) || {};
  const base = (analysis && analysis.stats) || {};
  let apologies = 0;
  for (const s of scored) apologies += s.apolog || 0;

  const withTs = scored.filter(s => s.ts && !isNaN(Date.parse(s.ts)));
  const night = [];
  const byDay = new Map();   // local epoch-day → message count
  let weekendMessages = 0;
  for (const s of withTs) {
    const d = new Date(s.ts);
    if (d.getHours() < 6) night.push(s);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) weekendMessages += 1;
    const dayNum = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    byDay.set(dayNum, (byDay.get(dayNum) || 0) + 1);
  }

  // Longest run of consecutive active days + the single busiest day.
  const dayNums = [...byDay.keys()].sort((a, b) => a - b);
  let dayStreak = dayNums.length ? 1 : 0, run = 1, maxDayMessages = 0;
  for (let i = 1; i < dayNums.length; i++) {
    run = dayNums[i] - dayNums[i - 1] === 1 ? run + 1 : 1;
    if (run > dayStreak) dayStreak = run;
  }
  for (const n of byDay.values()) if (n > maxDayMessages) maxDayMessages = n;

  // Chronological halves → redemption / villain arcs.
  const ordered = withTs.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const mid = Math.floor(ordered.length / 2);

  const spanDays = ordered.length >= 2
    ? (Date.parse(ordered[ordered.length - 1].ts) - Date.parse(ordered[0].ts)) / 86400000
    : 0;

  return {
    messages: base.messages || 0,
    pleases: base.pleases || 0,
    thanks: base.thanks || 0,
    fbombs: base.fbombs || 0,
    shouts: base.shouts || 0,
    apologies,
    niceness: (analysis && analysis.niceness) || 0,
    avgLen: sig.avgLen || 0,
    nightMessages: night.length,
    nightNiceness: nicenessOf(night),
    weekendMessages,
    daysActive: byDay.size,
    dayStreak,
    maxDayMessages,
    spanDays,
    timestamped: withTs.length,
    firstHalfNiceness: nicenessOf(ordered.slice(0, mid)),
    secondHalfNiceness: nicenessOf(ordered.slice(mid)),
    sources: opts.sources || 1,
  };
}

// Run every predicate against a stats snapshot. Predicates are defensive —
// a throwing unlock() just stays locked.
function evaluateAchievements(stats) {
  const unlocked = [], locked = [];
  for (const a of ACHIEVEMENTS) {
    let ok = false;
    try { ok = !!a.unlock(stats); } catch (_) { ok = false; }
    (ok ? unlocked : locked).push(a);
  }
  return { unlocked, locked, total: ACHIEVEMENTS.length };
}

// Rarest-first picks for the compact report-card row (legendary > rare >
// common, definition order within a tier — Array.sort is stable).
function topUnlocked(unlocked, n) {
  n = n || 3;
  return unlocked.slice()
    .sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier))
    .slice(0, n);
}

// Canned snapshot for `--achievements --demo`: unlocks a fun handful (incl.
// two legendaries) while leaving enough locked to make the gallery a chase.
const DEMO_ACHIEVEMENT_STATS = {
  messages: 1820, pleases: 410, thanks: 372, fbombs: 0, shouts: 0, apologies: 48,
  niceness: 92, avgLen: 140,
  nightMessages: 64, nightNiceness: 98, weekendMessages: 130,
  daysActive: 96, dayStreak: 9, maxDayMessages: 85,
  spanDays: 240, timestamped: 1700,
  firstHalfNiceness: 84, secondHalfNiceness: 93,
  sources: 2,
};

module.exports = {
  TIER_ORDER, TIER_LABEL, ACHIEVEMENTS,
  computeAchievementStats, evaluateAchievements, topUnlocked,
  DEMO_ACHIEVEMENT_STATS,
};
