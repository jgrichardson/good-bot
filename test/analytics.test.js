'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  toneSeries, trendSection, forecastSection, moodSection,
  spiralSection, chronotypeSection, leagueSection,
  buildLabReport, demoLabRecords, nicenessOf,
} = require('../analytics.js');
const { wilsonInterval } = require('../stats.js');

function closeTo(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${msg || 'value'}: ${actual} not within ${tol} of ${expected}`);
}

// Build a record shaped like analyze() in niceness.js produces. Local-time
// Date constructors keep day/hour assertions timezone-stable.
function rec(date, mood, extra) {
  return Object.assign(
    { ts: date.toISOString(), mood, len: 80, project: null, pleases: 0, thanks: 0 },
    extra || {});
}
function day(d, hour) { return new Date(2026, 2, 1 + d, hour == null ? 12 : hour, 0, 0); }

// ---- tone series -----------------------------------------------------------

test('toneSeries: daily resolution at 21+ active days, weekly when sparse', () => {
  const daily = [];
  for (let d = 0; d < 25; d++) daily.push(rec(day(d), 1), rec(day(d), -1));
  const s1 = toneSeries(daily);
  assert.strictEqual(s1.granularity, 'day');
  assert.strictEqual(s1.activeDays, 25);
  assert.strictEqual(s1.buckets.length, 25);

  const sparse = [];
  for (let d = 0; d < 10; d++) sparse.push(rec(day(d * 2), 1));
  const s2 = toneSeries(sparse);
  assert.strictEqual(s2.granularity, 'week');
  assert.ok(s2.buckets.length < 10, 'weekly buckets must merge sparse days');
});

test('nicenessOf mirrors the aggregate() share formula', () => {
  // pos = 1, neg = 1, n = 4 → 50 + ((1 − 1.7)/4)·140 = 25.5
  closeTo(nicenessOf([{ mood: 2 }, { mood: -1 }, { mood: 0 }, { mood: 0 }]), 25.5, 1e-9, 'mixed');
  assert.strictEqual(nicenessOf([]), 50);
  assert.strictEqual(nicenessOf([{ mood: 3 }, { mood: 1 }]), 100); // clamped
});

// ---- trend & changepoints ----------------------------------------------------

test('trendSection: finds the real shift and the increasing trend', () => {
  const recs = [];
  for (let d = 0; d < 60; d++) {
    for (let i = 0; i < 4; i++) recs.push(rec(new Date(2026, 0, 1 + d, 10 + i), d >= 30 ? 1 : -1));
  }
  const tr = trendSection(toneSeries(recs));
  assert.ok(tr.ok);
  assert.strictEqual(tr.mk.trend, 'increasing');
  assert.ok(tr.mk.p < 0.01, `MK p should be tiny, got ${tr.mk.p}`);
  assert.strictEqual(tr.shifts.length, 1);
  assert.strictEqual(tr.shifts[0].index, 30);
  assert.ok(tr.shifts[0].after > tr.shifts[0].before, 'shift direction must be upward');
});

test('trendSection: honest refusal with too few buckets', () => {
  const tr = trendSection(toneSeries([rec(day(0), 1), rec(day(1), 1), rec(day(2), -1)]));
  assert.strictEqual(tr.ok, false);
  assert.match(tr.reason, /not enough data/);
});

// ---- forecast ----------------------------------------------------------------

test('forecastSection: refuses below 14 active days and names the deficit', () => {
  const recs = [];
  for (let d = 0; d < 10; d++) recs.push(rec(day(d), 1));
  const fc = forecastSection(toneSeries(recs));
  assert.strictEqual(fc.ok, false);
  assert.match(fc.reason, /4 more active day/);
});

test('forecastSection: refuses when r² is indistinguishable from noise', () => {
  const recs = [];
  for (let d = 0; d < 40; d++) {
    const moods = d % 2 ? [1, 1, -1, 0] : [-1, -1, 1, 0];
    moods.forEach((mood, i) => recs.push(rec(new Date(2026, 0, 1 + d, 9 + i), mood)));
  }
  const fc = forecastSection(toneSeries(recs));
  assert.strictEqual(fc.ok, false);
  assert.match(fc.reason, /r²/);
});

test('forecastSection: extrapolates a steady warming trend with a CI', () => {
  const recs = [];
  for (let d = 0; d < 40; d++) {
    const warm = Math.round((d / 39) * 6);
    for (let i = 0; i < 6; i++) recs.push(rec(new Date(2026, 0, 1 + d, 9 + i), i < warm ? 1 : -1));
  }
  const series = toneSeries(recs);
  const fc = forecastSection(series);
  assert.ok(fc.ok, `expected a forecast, got: ${fc.reason}`);
  assert.ok(fc.r2 > 0.5, `r² should be strong, got ${fc.r2}`);
  assert.ok(fc.slopePerDay > 0);
  assert.ok(fc.lo <= fc.predicted && fc.predicted <= fc.hi, 'prediction must sit inside its band');
  assert.ok(fc.predicted > series.buckets[0].niceness, 'warming forecast must beat the opening tone');
  assert.strictEqual(fc.horizonDays, 60);
});

// ---- Markov mood model --------------------------------------------------------

test('moodSection: known transition matrix, grudge Wilson CI, recovery median', () => {
  // One session, 1 min apart: W W H H N H W →
  // W→W, W→H, H→H, H→N, N→H, H→W (6 transitions)
  const moods = [1, 1, -1, -1, 0, -1, 1];
  const recs = moods.map((mood, i) => rec(new Date(2026, 0, 5, 12, i), mood));
  const md = moodSection(recs, { minTransitions: 1, minHarsh: 1 });
  assert.ok(md.ok);
  assert.strictEqual(md.transitions, 6);
  assert.strictEqual(md.counts.warm.warm, 1);
  assert.strictEqual(md.counts.warm.harsh, 1);
  assert.strictEqual(md.counts.harsh.harsh, 1);
  assert.strictEqual(md.counts.harsh.neutral, 1);
  assert.strictEqual(md.counts.harsh.warm, 1);
  assert.strictEqual(md.counts.neutral.harsh, 1);
  closeTo(md.matrix.harsh.harsh, 1 / 3, 1e-12, 'P(harsh→harsh)');
  const ci = wilsonInterval(1, 3);
  closeTo(md.grudge.p, 1 / 3, 1e-12, 'grudge p');
  closeTo(md.grudge.lo, ci.lo, 1e-12, 'grudge lo');
  closeTo(md.grudge.hi, ci.hi, 1e-12, 'grudge hi');
  assert.strictEqual(md.grudge.n, 3);
  // recoveries: H H N → 2 steps; H W → 1 step; median 1.5
  assert.strictEqual(md.recovery.episodes, 2);
  assert.strictEqual(md.recovery.median, 1.5);
});

test('moodSection: a 30-minute silence breaks the chain', () => {
  const a = rec(new Date(2026, 0, 5, 12, 0), 1);
  const b = rec(new Date(2026, 0, 5, 13, 0), -1); // next session
  const md = moodSection([a, b], { minTransitions: 0, minHarsh: 1 });
  assert.ok(md.ok);
  assert.strictEqual(md.transitions, 0);
});

test('moodSection: honest refusal under the default transition floor', () => {
  const md = moodSection([rec(day(0), 1), rec(new Date(2026, 2, 1, 12, 1), -1)]);
  assert.strictEqual(md.ok, false);
  assert.match(md.reason, /not enough data/);
});

test('moodSection: opener-vs-closer verdict needs separated intervals', () => {
  const recs = [];
  for (let s = 0; s < 6; s++) { // 6 sessions: open warm, close harsh
    recs.push(rec(new Date(2026, 0, 1 + s, 10, 0), 1));
    recs.push(rec(new Date(2026, 0, 1 + s, 10, 2), 0));
    recs.push(rec(new Date(2026, 0, 1 + s, 10, 4), -1));
  }
  const md = moodSection(recs, { minTransitions: 1, minHarsh: 1 });
  assert.strictEqual(md.openClose.open.warm, 6);
  assert.strictEqual(md.openClose.close.warm, 0);
  assert.strictEqual(md.openClose.verdict, 'opener');
});

// ---- frustration spirals -------------------------------------------------------

test('spiralSection: 3-message burst counts; the 2-minute gap is a hard boundary', () => {
  const t0 = new Date(2026, 0, 10, 22, 0, 0).getTime();
  const mk = (offsets, tweak) => offsets.map((s, i) => Object.assign(
    { ts: new Date(t0 + s * 1000).toISOString(), mood: -1, len: 40, project: null, pleases: 0, thanks: 0 },
    tweak ? tweak(i) : null));

  const r1 = spiralSection(mk([0, 60, 119])); // gaps 60s, 59s — chained
  assert.strictEqual(r1.count, 1);
  assert.strictEqual(r1.worst.length, 3);

  // exactly 120s between messages 2 and 3 → chain broken → no episode
  assert.strictEqual(spiralSection(mk([0, 60, 180])).count, 0);

  // a long message in the middle breaks the run
  assert.strictEqual(spiralSection(mk([0, 60, 100], i => (i === 1 ? { len: 500 } : null))).count, 0);

  // a non-negative message in the middle breaks the run
  assert.strictEqual(spiralSection(mk([0, 60, 100], i => (i === 1 ? { mood: 0 } : null))).count, 0);

  // two rapid negatives are not an episode
  assert.strictEqual(spiralSection(mk([0, 60, 7200], i => (i === 2 ? { mood: 1 } : null))).count, 0);
});

test('spiralSection: monthly trend covers every month in the span, zeros included', () => {
  const recs = [];
  for (let b = 0; b < 3; b++) { // 3 bursts, all in January
    const t0 = new Date(2026, 0, 2 + b, 22, 0, 0).getTime();
    for (let i = 0; i < 3; i++) {
      recs.push({ ts: new Date(t0 + i * 30000).toISOString(), mood: -2, len: 30, project: null, pleases: 0, thanks: 0 });
    }
  }
  for (let d = 0; d < 90; d += 5) recs.push(rec(new Date(2026, 1, 1 + d, 12, 0), 1)); // calm Feb–Apr
  const sp = spiralSection(recs);
  assert.ok(sp.ok);
  assert.strictEqual(sp.count, 3);
  assert.ok(sp.trend && sp.trend.monthly.length >= 4, 'span covers Jan through Apr');
  assert.strictEqual(sp.trend.monthly[0].n, 3);
  assert.strictEqual(sp.trend.monthly[sp.trend.monthly.length - 1].n, 0);
});

// ---- chronotype ------------------------------------------------------------------

test('chronotypeSection: claims "meaner after midnight" only when intervals separate', () => {
  const recs = [];
  for (let d = 0; d < 30; d++) {
    recs.push(rec(new Date(2026, 0, 1 + d, 2, 0), -1));  // night, harsh
    recs.push(rec(new Date(2026, 0, 1 + d, 14, 0), 1));  // afternoon, warm
  }
  const ch = chronotypeSection(recs);
  assert.ok(ch.ok);
  assert.strictEqual(ch.night.verdict, 'meaner');
  const night = ch.buckets.find(b => b.label === 'night');
  const noon = ch.buckets.find(b => b.label === 'afternoon');
  assert.strictEqual(night.warm, 0);
  assert.strictEqual(noon.warm, 30);
  assert.ok(night.hi < noon.lo, 'bucket CIs must separate');
  // hours 2 and 14 are antipodal on the clock → essentially no direction
  assert.ok(ch.R < 0.2, `antipodal clusters should give R ≈ 0, got ${ch.R}`);

  // identical warm share on both sides → inconclusive, no claim
  const flat = [];
  for (let d = 0; d < 20; d++) {
    flat.push(rec(new Date(2026, 0, 1 + d, 2, 0), d % 2 ? 1 : -1));
    flat.push(rec(new Date(2026, 0, 1 + d, 14, 0), d % 2 ? 1 : -1));
  }
  assert.strictEqual(chronotypeSection(flat).night.verdict, 'inconclusive');
});

test('chronotypeSection: refuses under 30 timestamped messages', () => {
  const ch = chronotypeSection([rec(day(0), 1)]);
  assert.strictEqual(ch.ok, false);
  assert.match(ch.reason, /need 30\+/);
});

// ---- project league ----------------------------------------------------------------

test('leagueSection: the 30-message bar — 29 does not qualify, basenames only', () => {
  const recs = [];
  for (let i = 0; i < 30; i++) {
    recs.push(rec(new Date(2026, 0, 1, 10, i), i < 10 ? 1 : 0,
      { project: '/Users/demo/secret-client/big-project', pleases: i < 6 ? 1 : 0 }));
  }
  for (let i = 0; i < 29; i++) {
    recs.push(rec(new Date(2026, 0, 2, 10, i), -1, { project: '/Users/demo/tiny' }));
  }
  const lg = leagueSection(recs);
  assert.ok(lg.ok);
  assert.strictEqual(lg.rows.length, 1);
  assert.strictEqual(lg.rows[0].name, 'big-project'); // never the full path
  assert.strictEqual(lg.rows[0].n, 30);
  assert.strictEqual(lg.skipped, 1);
  closeTo(lg.rows[0].politeness, 6 / 30, 1e-12, 'politeness ratio');
  assert.strictEqual(lg.rows[0].harsh, 0);
});

test('leagueSection: honest refusal when nothing qualifies', () => {
  const lg = leagueSection([rec(day(0), 1, { project: '/a/b' })]);
  assert.strictEqual(lg.ok, false);
  assert.match(lg.reason, /30-message bar/);
});

// ---- demo + full report --------------------------------------------------------------

test('demoLabRecords: deterministic, and every section of the report fires', () => {
  const a = demoLabRecords();
  const b = demoLabRecords();
  assert.strictEqual(a.length, b.length);
  assert.deepStrictEqual(a[0], b[0]);
  assert.ok(a.length > 500, `demo should be a real corpus, got ${a.length}`);

  const rep = buildLabReport(a);
  assert.ok(rep.trend.ok);
  assert.ok(rep.trend.shifts.length >= 1, 'demo series must contain a detectable changepoint');
  assert.strictEqual(rep.trend.mk.trend, 'increasing');
  assert.ok(rep.forecast.ok, `demo must produce a forecast: ${rep.forecast.reason || ''}`);
  assert.ok(rep.mood.ok);
  assert.ok(rep.mood.grudge && rep.mood.grudge.n >= 5, 'demo needs a measurable grudge');
  assert.ok(rep.spirals.count >= 2, `demo needs spirals, got ${rep.spirals.count}`);
  assert.ok(rep.chronotype.ok);
  assert.strictEqual(rep.chronotype.night.verdict, 'meaner');
  assert.ok(rep.league.ok);
  assert.ok(rep.league.rows.length >= 2);
  assert.ok(rep.league.skipped >= 1, 'demo includes a below-bar project');
});

test('renderLab: every section header present, honest at 80 columns', () => {
  const { renderLab } = require('../niceness.js');
  const text = renderLab(buildLabReport(demoLabRecords()), { span: 'Mar 3, 2026 → Jun 10, 2026', demo: true });
  for (const part of ['THE LAB', 'Trend & changepoints', 'Forecast', 'Mood dynamics',
    'Frustration spirals', 'Chronotype', 'Project league', 'Methods',
    'Mann-Kendall', 'Wilson', 'Rayleigh']) {
    assert.ok(text.includes(part), `missing section: ${part}`);
  }
  const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
  for (const line of plain.split('\n')) {
    assert.ok(line.length <= 80, `line over 80 cols (${line.length}): ${line}`);
  }
});

test('buildLabReport: empty history refuses every section, never throws', () => {
  const rep = buildLabReport([]);
  assert.strictEqual(rep.meta.messages, 0);
  assert.strictEqual(rep.trend.ok, false);
  assert.strictEqual(rep.forecast.ok, false);
  assert.strictEqual(rep.mood.ok, false);
  assert.strictEqual(rep.spirals.ok, false);
  assert.strictEqual(rep.chronotype.ok, false);
  assert.strictEqual(rep.league.ok, false);
});
