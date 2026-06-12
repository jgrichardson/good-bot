'use strict';

// Analytics engine for `--lab` — the research-report mode. Same contract as
// scales.js / achievements.js / stats.js: zero dependencies, no I/O, no
// network, no state. Everything here consumes the per-message records that
// `analyze()` in niceness.js already produces ({ ts, mood, len, project,
// pleases, thanks, … }) and returns plain data; the renderer in niceness.js
// turns it into the card.
//
// Honesty rules are baked into every section: each claim carries its
// uncertainty (a Wilson CI or a p-value), comparative claims ("meaner after
// midnight") are only made when the confidence intervals actually separate,
// and any section without enough data says exactly what was missing instead
// of fabricating a result.

const {
  mean, median, wilsonInterval, mannKendall, changepoints, circularStats, linreg,
} = require('./stats.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;  // same session boundary --timeline uses
const SPIRAL_GAP_MS = 2 * 60 * 1000;    // "rapid-fire" inter-message gap
const SPIRAL_MAX_LEN = 120;             // chars — a short, snapped-off message
const SPIRAL_MIN_RUN = 3;               // an episode needs >= 3 consecutive hits
const LEAGUE_MIN_N = 30;                // min messages for a project to rank
const DAILY_MIN_ACTIVE_DAYS = 21;       // below this, bucket by week instead
const FORECAST_MIN_ACTIVE_DAYS = 14;
const FORECAST_MIN_BUCKETS = 6;
const FORECAST_MIN_R2 = 0.05;
const FORECAST_HORIZON_DAYS = 60;

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function pad2(n) { return String(n).padStart(2, '0'); }

// ts may be an ISO string (Claude / Gemini / imports) or epoch ms (some Codex
// rows). Anything unparseable → null, and the record sits out time analysis.
function tsToMs(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) && ts > 0 ? ts : null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}

// Timestamped records only, chronologically sorted, each with a parsed `.ms`.
function withTimestamps(records) {
  const out = [];
  for (const r of Array.isArray(records) ? records : []) {
    const ms = tsToMs(r && r.ts);
    if (ms != null) out.push(Object.assign({}, r, { ms }));
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// The same warm/neutral/harsh call `aggregate()` in niceness.js makes per
// message: the sign of the message's mood score.
function stateOf(r) { return r.mood > 0 ? 'warm' : r.mood < 0 ? 'harsh' : 'neutral'; }

// Niceness of a slice — mirrors the formula in niceness.js aggregate(): the
// net share of warm vs harsh messages, centered at 50, clamped to 0..100.
function nicenessOf(list) {
  const n = Math.max(list.length, 1);
  let pos = 0, neg = 0;
  for (const r of list) { if (r.mood > 0) pos++; else if (r.mood < 0) neg++; }
  return clamp(50 + ((pos - 1.7 * neg) / n) * 140, 0, 100);
}

// Local-time calendar keys, consistent with how --timeline buckets things.
function dayKeyOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function weekKeyOf(ms) { // Monday of the local week, expressed as a day key
  const d = new Date(ms);
  const back = (d.getDay() + 6) % 7;
  return dayKeyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime());
}
function monthKeyOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// Split sorted timestamped records into sessions on a 30-minute silence.
function sessionize(sorted) {
  const sessions = [];
  let cur = [];
  for (const r of sorted) {
    if (cur.length && r.ms - cur[cur.length - 1].ms > SESSION_GAP_MS) { sessions.push(cur); cur = []; }
    cur.push(r);
  }
  if (cur.length) sessions.push(cur);
  return sessions;
}

// ---------------------------------------------------------------------------
// 1. Tone time series — per-day (or per-week when sparse) mean tone
// ---------------------------------------------------------------------------

// Buckets carry their midpoint time in *days* so the forecast regresses on
// real elapsed time, not bucket index (gaps in your history stay gaps).
function toneSeries(records) {
  const sorted = withTimestamps(records);
  const daySet = new Set();
  for (const r of sorted) daySet.add(dayKeyOf(r.ms));
  const activeDays = daySet.size;
  const granularity = activeDays >= DAILY_MIN_ACTIVE_DAYS ? 'day' : 'week';
  const keyFn = granularity === 'day' ? dayKeyOf : weekKeyOf;
  const map = new Map();
  for (const r of sorted) {
    const k = keyFn(r.ms);
    (map.get(k) || map.set(k, []).get(k)).push(r);
  }
  const buckets = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => ({ key, n: list.length, niceness: nicenessOf(list), t: mean(list.map(r => r.ms)) / DAY_MS }));
  return { granularity, activeDays, buckets, timestamped: sorted.length };
}

// Mann-Kendall trend + binary-segmentation changepoints over the tone series.
function trendSection(series) {
  const { buckets, granularity, activeDays } = series;
  if (buckets.length < 4) {
    return {
      ok: false, granularity, activeDays,
      reason: `not enough data — need at least 4 active ${granularity === 'day' ? 'days' : 'weeks'} with messages, found ${buckets.length}`,
    };
  }
  const values = buckets.map(b => b.niceness);
  const mk = mannKendall(values);
  const cps = changepoints(values, { minSegment: granularity === 'day' ? 5 : 3 });
  const edges = [0, ...cps, values.length];
  const shifts = cps.map((cp, i) => ({
    index: cp,
    key: buckets[cp].key,
    before: mean(values.slice(edges[i], cp)),
    after: mean(values.slice(cp, edges[i + 2])),
  }));
  return { ok: true, granularity, activeDays, values, keys: buckets.map(b => b.key), mk, shifts };
}

// ---------------------------------------------------------------------------
// 2. Forecast — OLS extrapolation with a slope CI, and honest refusals
// ---------------------------------------------------------------------------

function forecastSection(series) {
  const { buckets, activeDays, granularity } = series;
  if (activeDays < FORECAST_MIN_ACTIVE_DAYS) {
    const more = FORECAST_MIN_ACTIVE_DAYS - activeDays;
    return { ok: false, reason: `not enough data — need ${more} more active day${more === 1 ? '' : 's'} of history before extrapolating is honest` };
  }
  if (buckets.length < FORECAST_MIN_BUCKETS) {
    return { ok: false, reason: `not enough ${granularity === 'day' ? 'daily' : 'weekly'} buckets — need ${FORECAST_MIN_BUCKETS}, found ${buckets.length}` };
  }
  const xs = buckets.map(b => b.t);
  const ys = buckets.map(b => b.niceness);
  const fit = linreg(xs, ys);
  if (fit.r2 < FORECAST_MIN_R2) {
    return { ok: false, r2: fit.r2, reason: `no forecast — r² = ${fit.r2.toFixed(3)}: the fit explains almost nothing, so any extrapolation would be fiction` };
  }
  const mx = mean(xs), my = mean(ys);
  const targetT = xs[xs.length - 1] + FORECAST_HORIZON_DAYS;
  const at = slope => clamp(my + slope * (targetT - mx), 0, 100);
  const a = at(fit.slopeCI[0]), b = at(fit.slopeCI[1]);
  return {
    ok: true,
    predicted: at(fit.slope), lo: Math.min(a, b), hi: Math.max(a, b),
    slopePerDay: fit.slope, slopeCI: fit.slopeCI, r2: fit.r2,
    horizonDays: FORECAST_HORIZON_DAYS, targetMs: targetT * DAY_MS,
  };
}

// ---------------------------------------------------------------------------
// 3. Markov mood model — warm/neutral/harsh transition dynamics
// ---------------------------------------------------------------------------

const STATES = ['warm', 'neutral', 'harsh'];

// First-order transition matrix counted within sessions only (a 30-minute
// silence is not a "transition" — it's you going to lunch). Also derives:
//   grudge      P(harsh→harsh), with a Wilson CI — do you stay mad?
//   recovery    messages from entering a harsh run back to a civil message
//   openClose   warm share of session-opening vs session-closing messages,
//               with a verdict only when the Wilson intervals separate.
function moodSection(records, opts) {
  opts = opts || {};
  const minTransitions = Number.isFinite(opts.minTransitions) ? opts.minTransitions : 20;
  const minHarsh = Number.isFinite(opts.minHarsh) ? opts.minHarsh : 5;
  const sessions = sessionize(withTimestamps(records));
  const counts = {};
  for (const a of STATES) { counts[a] = {}; for (const b of STATES) counts[a][b] = 0; }
  let transitions = 0;
  const recoveries = [];
  let unrecovered = 0;
  const opens = { warm: 0, n: 0 };
  const closes = { warm: 0, n: 0 };
  for (const ss of sessions) {
    for (let i = 1; i < ss.length; i++) {
      counts[stateOf(ss[i - 1])][stateOf(ss[i])]++;
      transitions++;
    }
    // Recovery: from the first harsh message of a run, how many messages
    // until the tone is back to warm/neutral?
    let inHarsh = false, steps = 0;
    for (const r of ss) {
      const st = stateOf(r);
      if (inHarsh) {
        steps++;
        if (st !== 'harsh') { recoveries.push(steps); inHarsh = false; }
      } else if (st === 'harsh') { inHarsh = true; steps = 0; }
    }
    if (inHarsh) unrecovered++;
    if (ss.length >= 2) { // a 1-message session has no distinct open vs close
      opens.n++; closes.n++;
      if (stateOf(ss[0]) === 'warm') opens.warm++;
      if (stateOf(ss[ss.length - 1]) === 'warm') closes.warm++;
    }
  }
  if (transitions < minTransitions) {
    return { ok: false, reason: `not enough data — need ${minTransitions}+ in-session transitions, found ${transitions}` };
  }
  const matrix = {};
  for (const a of STATES) {
    const row = STATES.reduce((s, b) => s + counts[a][b], 0);
    matrix[a] = {};
    for (const b of STATES) matrix[a][b] = row > 0 ? counts[a][b] / row : 0;
  }
  const harshRow = STATES.reduce((s, b) => s + counts.harsh[b], 0);
  let grudge = null;
  if (harshRow >= minHarsh) {
    const ci = wilsonInterval(counts.harsh.harsh, harshRow);
    grudge = { p: counts.harsh.harsh / harshRow, lo: ci.lo, hi: ci.hi, n: harshRow };
  }
  const openCi = wilsonInterval(opens.warm, opens.n);
  const closeCi = wilsonInterval(closes.warm, closes.n);
  let verdict = 'inconclusive';
  if (opens.n >= 5) {
    if (openCi.lo > closeCi.hi) verdict = 'opener';
    else if (closeCi.lo > openCi.hi) verdict = 'closer';
  }
  return {
    ok: true, transitions, counts, matrix, grudge,
    recovery: recoveries.length
      ? { median: median(recoveries), episodes: recoveries.length, unrecovered }
      : null,
    openClose: {
      open: { warm: opens.warm, n: opens.n, p: opens.n ? opens.warm / opens.n : 0, lo: openCi.lo, hi: openCi.hi },
      close: { warm: closes.warm, n: closes.n, p: closes.n ? closes.warm / closes.n : 0, lo: closeCi.lo, hi: closeCi.hi },
      verdict,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Frustration spirals — rapid-fire bursts of short, negative messages
// ---------------------------------------------------------------------------

// An episode is >= 3 consecutive messages, each negative-toned and short
// (<= 120 chars), each landing < 2 minutes after the previous one. That's
// the "wrong. WRONG. why" doom-loop signature.
function spiralSection(records) {
  const sorted = withTimestamps(records);
  if (sorted.length < SPIRAL_MIN_RUN) {
    return { ok: false, reason: `not enough timestamped messages — need ${SPIRAL_MIN_RUN}+, found ${sorted.length}` };
  }
  const episodes = [];
  let run = [];
  const flush = () => {
    if (run.length >= SPIRAL_MIN_RUN) {
      episodes.push({
        start: run[0].ms, end: run[run.length - 1].ms, length: run.length,
        heat: run.reduce((s, r) => s - Math.min(r.mood, 0), 0),
      });
    }
    run = [];
  };
  for (const r of sorted) {
    const hit = r.mood < 0 && (r.len || 0) <= SPIRAL_MAX_LEN;
    if (!hit) { flush(); continue; }
    if (run.length && r.ms - run[run.length - 1].ms >= SPIRAL_GAP_MS) flush();
    run.push(r);
  }
  flush();
  const worst = episodes.slice().sort((a, b) => b.length - a.length || b.heat - a.heat)[0] || null;
  // Trend: episode count per calendar month across the whole observed span
  // (months with zero episodes count as zeros — that's the point).
  let trend = null;
  if (episodes.length >= 2) {
    const monthly = [];
    let d = new Date(sorted[0].ms);
    d = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(sorted[sorted.length - 1].ms);
    while (d <= end) {
      monthly.push({ key: monthKeyOf(d.getTime()), n: 0 });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    const idx = new Map(monthly.map((m, i) => [m.key, i]));
    for (const e of episodes) {
      const i = idx.get(monthKeyOf(e.start));
      if (i != null) monthly[i].n++;
    }
    trend = { monthly, mk: mannKendall(monthly.map(m => m.n)) };
  }
  return { ok: true, count: episodes.length, episodes, worst, trend };
}

// ---------------------------------------------------------------------------
// 5. Chronotype — circular stats over message hours + politeness by daypart
// ---------------------------------------------------------------------------

// "Politeness" here is the warm share — P(message scored warm) — the same
// per-message classification the card uses. The night and weekend verdicts
// are only 'meaner'/'nicer' when the Wilson intervals fully separate.
function chronotypeSection(records) {
  const sorted = withTimestamps(records);
  if (sorted.length < 30) {
    return { ok: false, reason: `not enough timestamped messages — need 30+, found ${sorted.length}` };
  }
  const hours = sorted.map(r => new Date(r.ms).getHours());
  const circ = circularStats(hours);
  const DAYPARTS = [['night', 0, 6], ['morning', 6, 12], ['afternoon', 12, 18], ['evening', 18, 24]];
  const buckets = DAYPARTS.map(([label, lo, hi]) => {
    const members = sorted.filter((r, i) => hours[i] >= lo && hours[i] < hi);
    const warm = members.filter(r => r.mood > 0).length;
    const ci = wilsonInterval(warm, members.length);
    return { label, n: members.length, warm, p: members.length ? warm / members.length : 0, lo: ci.lo, hi: ci.hi };
  });
  const splitCi = (test) => {
    const a = { warm: 0, n: 0 }, b = { warm: 0, n: 0 };
    sorted.forEach((r, i) => {
      const side = test(r, hours[i]) ? a : b;
      side.n++;
      if (r.mood > 0) side.warm++;
    });
    const ca = wilsonInterval(a.warm, a.n), cb = wilsonInterval(b.warm, b.n);
    let verdict = 'insufficient';
    if (a.n >= 10 && b.n >= 10) {
      verdict = ca.hi < cb.lo ? 'meaner' : ca.lo > cb.hi ? 'nicer' : 'inconclusive';
    }
    return {
      in: { warm: a.warm, n: a.n, p: a.n ? a.warm / a.n : 0, lo: ca.lo, hi: ca.hi },
      out: { warm: b.warm, n: b.n, p: b.n ? b.warm / b.n : 0, lo: cb.lo, hi: cb.hi },
      verdict,
    };
  };
  const night = splitCi((r, h) => h < 6);
  const weekend = splitCi((r) => { const d = new Date(r.ms).getDay(); return d === 0 || d === 6; });
  return { ok: true, meanHour: circ.meanHour, R: circ.R, rayleighP: circ.rayleighP, buckets, night, weekend };
}

// ---------------------------------------------------------------------------
// 6. Project league — who gets the best you?
// ---------------------------------------------------------------------------

// Redaction-safe: only the project dir basename is ever surfaced, never the
// full path (paths can carry usernames, clients, codenames).
function projectName(p) {
  return String(p).split(/[\\/]+/).filter(Boolean).pop() || null;
}

function leagueSection(records, opts) {
  opts = opts || {};
  const minN = Number.isFinite(opts.minN) ? opts.minN : LEAGUE_MIN_N;
  const map = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || !r.project) continue;
    const name = projectName(r.project);
    if (!name) continue;
    (map.get(name) || map.set(name, []).get(name)).push(r);
  }
  const qualified = [...map.entries()].filter(([, l]) => l.length >= minN);
  const skipped = map.size - qualified.length;
  if (!qualified.length) {
    return { ok: false, skipped, minN, reason: `not enough per-project data — no project clears the ${minN}-message bar (${map.size} project${map.size === 1 ? '' : 's'} seen)` };
  }
  const rows = qualified
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([name, list]) => {
      const harsh = list.filter(r => r.mood < 0).length;
      const ci = wilsonInterval(harsh, list.length);
      const polite = list.reduce((s, r) => s + (r.pleases || 0) + (r.thanks || 0), 0);
      return {
        name, n: list.length,
        politeness: polite / list.length,
        harsh, harshRate: harsh / list.length, harshLo: ci.lo, harshHi: ci.hi,
        niceness: nicenessOf(list),
      };
    });
  return { ok: true, rows, skipped, minN };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function buildLabReport(records, opts) {
  const recs = Array.isArray(records) ? records : [];
  const series = toneSeries(recs);
  return {
    meta: {
      messages: recs.length,
      timestamped: series.timestamped,
      activeDays: series.activeDays,
      granularity: series.granularity,
    },
    trend: trendSection(series),
    forecast: forecastSection(series),
    mood: moodSection(recs, opts && opts.mood),
    spirals: spiralSection(recs),
    chronotype: chronotypeSection(recs),
    league: leagueSection(recs, opts && opts.league),
  };
}

// ---------------------------------------------------------------------------
// Demo data for `--lab --demo`
// ---------------------------------------------------------------------------

// Tiny seeded PRNG (mulberry32, same family the roast uses) so the demo
// report is identical on every run — screenshot-stable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A synthetic-but-plausible 100-day history, built so every section of the
// report has something real to find: a genuinely harsher opening act, a true
// changepoint around day 45 where the tone steps up (plus a mild drift after
// it, so the trend test and the forecast both fire), front-loaded
// after-midnight frustration spirals, measurably meaner night sessions, a
// you-greet-the-bot-nicely opening bias, and four projects — one deliberately
// under the league's 30-message bar so the min-n guard shows itself.
function demoLabRecords() {
  const rand = mulberry32(0xC0FFEE);
  const out = [];
  const DAYS = 100;
  const start = new Date(2026, 2, 3); // Mar 3, 2026 → ends Jun 10, 2026
  const projects = ['/home/demo/projects/good-bot', '/home/demo/projects/acme-api', '/home/demo/projects/dotfiles'];
  let sideSessions = 0;
  for (let d = 0; d < DAYS; d++) {
    if (rand() < 0.13) continue; // a day off now and then
    const post = d >= 45;        // the changepoint
    const drift = post ? Math.min(0.06, (d - 45) * 0.0012) : 0;
    const warmP = post ? 0.38 + drift : 0.26;
    const harshP = post ? 0.12 : 0.18;
    const nSessions = 1 + (rand() < 0.45 ? 1 : 0);
    for (let s = 0; s < nSessions; s++) {
      const night = rand() < 0.15;
      const hour = night ? Math.floor(rand() * 5) : 9 + Math.floor(rand() * 11);
      let t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d,
        hour, Math.floor(rand() * 50), Math.floor(rand() * 60)).getTime();
      let project = projects[rand() < 0.55 ? 0 : (rand() < 0.7 ? 1 : 2)];
      if (sideSessions < 2 && rand() < 0.03) { project = '/home/demo/projects/weekend-hack'; sideSessions++; }
      const msgs = 4 + Math.floor(rand() * 7);
      for (let m = 0; m < msgs; m++) {
        if (m > 0) t += (60 + Math.floor(rand() * 360)) * 1000; // 1–7 min later
        const harshCut = night ? Math.min(0.65, harshP + 0.30) : harshP;
        let warmHere = night ? Math.max(0.08, warmP - 0.12) : warmP;
        if (m === 0) warmHere += 0.30; // session openers skew polite
        const roll = rand();
        let mood = 0, pleases = 0, thanks = 0;
        if (roll < harshCut) mood = -(1 + Math.floor(rand() * 3));
        else if (roll < harshCut + warmHere) {
          mood = 1 + Math.floor(rand() * 3);
          if (rand() < 0.5) pleases = 1;
          if (rand() < 0.4) thanks = 1;
        }
        out.push({ ts: new Date(t).toISOString(), mood, len: 30 + Math.floor(rand() * 260), project, pleases, thanks });
      }
    }
    // Front-loaded after-midnight frustration spirals.
    if (rand() < (post ? 0.03 : 0.16)) {
      let t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, 0, 40, 0).getTime();
      const burst = SPIRAL_MIN_RUN + Math.floor(rand() * 3);
      for (let i = 0; i < burst; i++) {
        out.push({
          ts: new Date(t).toISOString(),
          mood: -(1 + Math.floor(rand() * 2)),
          len: 12 + Math.floor(rand() * 60),
          project: projects[0], pleases: 0, thanks: 0,
        });
        t += (20 + Math.floor(rand() * 70)) * 1000; // 20–90 s apart
      }
    }
  }
  return out;
}

module.exports = {
  // building blocks (exported for tests + the renderer)
  tsToMs, withTimestamps, stateOf, nicenessOf, sessionize, projectName,
  // the sections
  toneSeries, trendSection, forecastSection, moodSection,
  spiralSection, chronotypeSection, leagueSection,
  // the report + demo
  buildLabReport, demoLabRecords,
  // tunables (exported so tests pin the real boundaries)
  SPIRAL_GAP_MS, SPIRAL_MAX_LEN, SPIRAL_MIN_RUN, LEAGUE_MIN_N,
  FORECAST_MIN_ACTIVE_DAYS, FORECAST_MIN_R2, FORECAST_HORIZON_DAYS,
};
