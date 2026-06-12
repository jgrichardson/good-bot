'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  mean, variance, median, ranks,
  erf, normalCdf, tCdf, tCrit,
  wilsonInterval, mannKendall, changepoints, circularStats, spearman, linreg,
} = require('../stats.js');

function closeTo(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol,
    `${msg || 'value'}: ${actual} not within ${tol} of ${expected}`);
}

// Distance between two hours on the 24h circle (23.9999 is "close to" 0).
function hourDist(a, b) {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

// ---- helpers ---------------------------------------------------------------

test('mean: known value and empty input', () => {
  assert.strictEqual(mean([1, 2, 3, 4]), 2.5);
  assert.strictEqual(mean([]), 0);
  assert.strictEqual(mean([7]), 7);
});

test('variance: sample variance, hand-checked', () => {
  // mean 5, squared deviations 9+1+1+1+0+0+4+16 = 32, n−1 = 7
  closeTo(variance([2, 4, 4, 4, 5, 5, 7, 9]), 32 / 7, 1e-12, 'variance');
  assert.strictEqual(variance([5]), 0);
  assert.strictEqual(variance([]), 0);
  assert.strictEqual(variance([3, 3, 3, 3]), 0);
});

test('median: odd, even, empty', () => {
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(median([4, 1, 3, 2]), 2.5);
  assert.strictEqual(median([]), 0);
});

test('ranks: mid-ranks for ties, original order preserved', () => {
  assert.deepStrictEqual(ranks([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
  assert.deepStrictEqual(ranks([30, 10, 20]), [3, 1, 2]);
  assert.deepStrictEqual(ranks([]), []);
  assert.deepStrictEqual(ranks([5, 5, 5]), [2, 2, 2]);
});

// ---- special functions ------------------------------------------------------

test('normalCdf hits textbook values', () => {
  assert.strictEqual(normalCdf(0), 0.5);
  closeTo(normalCdf(1.96), 0.975, 1e-4, 'Φ(1.96)');
  closeTo(normalCdf(-1.96), 0.025, 1e-4, 'Φ(−1.96)');
  closeTo(erf(1), 0.8427008, 1e-6, 'erf(1)');
});

test('tCdf / tCrit round-trip and known critical values', () => {
  // Standard t-table: t(0.975, 3) = 3.182446, t(0.975, 10) = 2.228139
  closeTo(tCrit(0.975, 3), 3.182446, 1e-4, 't crit df=3');
  closeTo(tCrit(0.975, 10), 2.228139, 1e-4, 't crit df=10');
  closeTo(tCdf(tCrit(0.9, 7), 7), 0.9, 1e-9, 'round-trip');
  assert.strictEqual(tCdf(0, 5), 0.5);
});

// ---- 1. Wilson interval ----------------------------------------------------

test('wilsonInterval 8/10 matches statsmodels to 3 decimals', () => {
  // statsmodels proportion_confint(8, 10, method="wilson") → (0.4902, 0.9433)
  const { lo, hi } = wilsonInterval(8, 10);
  closeTo(lo, 0.490, 5e-4, 'wilson lo');
  closeTo(hi, 0.943, 5e-4, 'wilson hi');
});

test('wilsonInterval extremes are clamped and sane', () => {
  // Wilson 0/10 → (0, 0.2775); 10/10 mirrors it
  const zero = wilsonInterval(0, 10);
  closeTo(zero.lo, 0, 1e-9, '0/10 lo');
  closeTo(zero.hi, 0.2775, 5e-4, '0/10 hi');
  const all = wilsonInterval(10, 10);
  closeTo(all.lo, 0.7225, 5e-4, '10/10 lo');
  closeTo(all.hi, 1, 1e-9, '10/10 hi');
});

test('wilsonInterval degenerate n=0 → total ignorance, never NaN', () => {
  assert.deepStrictEqual(wilsonInterval(0, 0), { lo: 0, hi: 1 });
  assert.deepStrictEqual(wilsonInterval(5, 0), { lo: 0, hi: 1 });
});

test('wilsonInterval is monotone in successes', () => {
  const a = wilsonInterval(2, 20);
  const b = wilsonInterval(18, 20);
  assert.ok(b.lo > a.lo && b.hi > a.hi, 'more successes → higher interval');
});

// ---- 2. Mann-Kendall --------------------------------------------------------

test('mannKendall: strictly increasing 10-series, hand-computed', () => {
  const r = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // S = C(10,2) = 45; varS = 10·9·25/18 = 125; z = 44/√125 = 3.93551
  assert.strictEqual(r.S, 45);
  assert.strictEqual(r.varS, 125);
  closeTo(r.z, 3.93551, 1e-4, 'MK z');
  assert.ok(r.p > 0 && r.p < 1e-3, `p should be tiny, got ${r.p}`);
  assert.strictEqual(r.trend, 'increasing');
});

test('mannKendall: strictly decreasing mirrors the increasing case', () => {
  const r = mannKendall([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.strictEqual(r.S, -45);
  closeTo(r.z, -3.93551, 1e-4, 'MK z');
  assert.strictEqual(r.trend, 'decreasing');
});

test('mannKendall: tie-corrected variance on [1,1,2,2,3], hand-computed', () => {
  const r = mannKendall([1, 1, 2, 2, 3]);
  // S = 8; varS = (5·4·15 − 2·[2·1·9]) / 18 = (300 − 36)/18 = 14.667
  assert.strictEqual(r.S, 8);
  closeTo(r.varS, 264 / 18, 1e-12, 'tie-corrected varS');
  // z = 7/√14.667 = 1.8278 → two-sided p ≈ 0.0675 → not significant
  closeTo(r.p, 0.0675, 3e-3, 'MK tie p');
  assert.strictEqual(r.trend, 'none');
});

test('mannKendall: degenerate inputs are NaN-free', () => {
  for (const input of [[], [42], [5, 5, 5, 5, 5, 5]]) {
    const r = mannKendall(input);
    assert.strictEqual(r.S, 0, `S for ${JSON.stringify(input)}`);
    assert.strictEqual(r.z, 0);
    assert.strictEqual(r.p, 1);
    assert.strictEqual(r.trend, 'none');
    assert.ok(!Number.isNaN(r.varS), 'varS is a number');
  }
});

// ---- 3. Changepoints --------------------------------------------------------

test('changepoints: clean mean shift → index 5 with default penalty', () => {
  assert.deepStrictEqual(changepoints([1, 1, 1, 1, 1, 9, 9, 9, 9, 9]), [5]);
});

test('changepoints: constant / empty / short series → []', () => {
  assert.deepStrictEqual(changepoints([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]), []);
  assert.deepStrictEqual(changepoints([]), []);
  assert.deepStrictEqual(changepoints([1, 9, 1]), []);
});

test('changepoints: finds two changes recursively, sorted ascending', () => {
  const series = [0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0];
  assert.deepStrictEqual(changepoints(series, { penalty: 50 }), [6, 12]);
});

test('changepoints: minSegment is respected', () => {
  const series = [1, 1, 1, 9, 9, 9];
  assert.deepStrictEqual(changepoints(series, { minSegment: 3, penalty: 10 }), [3]);
  // minSegment 4 leaves no legal split point in a 6-long series
  assert.deepStrictEqual(changepoints(series, { minSegment: 4, penalty: 10 }), []);
});

test('changepoints: deterministic — same input, same output', () => {
  const series = [2, 2, 1, 2, 2, 8, 9, 8, 9, 8, 3, 2, 3, 2, 3];
  const a = changepoints(series, { minSegment: 3, penalty: 20 });
  const b = changepoints(series, { minSegment: 3, penalty: 20 });
  assert.deepStrictEqual(a, b);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], 'sorted ascending');
});

// ---- 4. Circular stats ------------------------------------------------------

test('circularStats: all messages at the same hour', () => {
  const r = circularStats([6, 6, 6, 6]);
  closeTo(r.meanHour, 6, 1e-9, 'meanHour');
  closeTo(r.R, 1, 1e-12, 'R');
  // Wilkie (1983): p = exp(√(1+16) − 9) = 0.00762
  closeTo(r.rayleighP, 0.00762, 1e-4, 'rayleigh p');
});

test('circularStats: tight cluster → strong direction, tiny p', () => {
  const r = circularStats([1, 2, 3, 1, 2, 3, 2, 2]);
  assert.ok(hourDist(r.meanHour, 2) < 0.1, `meanHour ${r.meanHour} near 2`);
  assert.ok(r.R > 0.9, `R ${r.R} > 0.9`);
  assert.ok(r.rayleighP >= 0 && r.rayleighP < 0.01, `p ${r.rayleighP} significant`);
});

test('circularStats: uniform hours → no direction, p ≈ 1', () => {
  const r = circularStats([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  assert.ok(r.R < 1e-9, `R ${r.R} ≈ 0`);
  assert.ok(r.rayleighP > 0.99, `p ${r.rayleighP} ≈ 1`);
  assert.ok(Number.isFinite(r.meanHour), 'meanHour finite even when meaningless');
});

test('circularStats: midnight wrap-around averages to 0, not 12', () => {
  const r = circularStats([23, 23, 1, 1]);
  assert.ok(hourDist(r.meanHour, 0) < 1e-6, `meanHour ${r.meanHour} wraps to 0`);
  assert.ok(r.R > 0.9, 'tight cluster across midnight');
});

test('circularStats: empty input is NaN-free', () => {
  assert.deepStrictEqual(circularStats([]), { meanHour: 0, R: 0, rayleighP: 1 });
});

// ---- 5. Spearman ------------------------------------------------------------

test('spearman matches scipy on a 5-point textbook case', () => {
  // scipy.stats.spearmanr([1,2,3,4,5], [2,1,4,3,5]) → rho=0.8, p=0.10409
  const r = spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
  closeTo(r.rho, 0.8, 1e-12, 'rho');
  closeTo(r.p, 0.1041, 5e-3, 'p');
});

test('spearman: perfect monotone relationships', () => {
  const up = spearman([1, 2, 3, 4], [10, 20, 30, 40]);
  assert.strictEqual(up.rho, 1);
  assert.strictEqual(up.p, 0);
  const down = spearman([1, 2, 3, 4], [9, 7, 5, 3]);
  assert.strictEqual(down.rho, -1);
  assert.strictEqual(down.p, 0);
});

test('spearman handles ties like scipy', () => {
  // scipy.stats.spearmanr([1,2,2,3], [1,2,3,4]) → rho=0.94868, p=0.05132
  const r = spearman([1, 2, 2, 3], [1, 2, 3, 4]);
  closeTo(r.rho, 0.94868, 1e-4, 'rho with ties');
  closeTo(r.p, 0.05132, 1e-3, 'p with ties');
});

test('spearman: degenerate inputs are NaN-free', () => {
  assert.deepStrictEqual(spearman([], []), { rho: 0, p: 1 });
  assert.deepStrictEqual(spearman([1], [2]), { rho: 0, p: 1 });
  assert.deepStrictEqual(spearman([1, 2], [3, 4]), { rho: 0, p: 1 }); // n < 3
  assert.deepStrictEqual(spearman([7, 7, 7, 7], [1, 2, 3, 4]), { rho: 0, p: 1 });
});

// ---- 6. Linear regression ---------------------------------------------------

test('linreg on the classic 5-point example, hand-computed', () => {
  // xs=[1..5], ys=[2,4,5,4,5]: slope 0.6, intercept 2.2, r²=0.6,
  // SE=√0.08, t(0.975,3)=3.18245 → CI 0.6 ± 0.90018
  const r = linreg([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
  closeTo(r.slope, 0.6, 1e-12, 'slope');
  closeTo(r.intercept, 2.2, 1e-12, 'intercept');
  closeTo(r.r2, 0.6, 1e-12, 'r2');
  closeTo(r.slopeCI[0], -0.3002, 1e-3, 'CI lo');
  closeTo(r.slopeCI[1], 1.5002, 1e-3, 'CI hi');
});

test('linreg: perfect line → r²=1, CI collapses onto the slope', () => {
  const xs = [0, 1, 2, 3, 4, 5];
  const r = linreg(xs, xs.map(x => 2 * x + 1));
  closeTo(r.slope, 2, 1e-9, 'slope');
  closeTo(r.intercept, 1, 1e-9, 'intercept');
  closeTo(r.r2, 1, 1e-9, 'r2');
  closeTo(r.slopeCI[0], 2, 1e-6, 'CI lo');
  closeTo(r.slopeCI[1], 2, 1e-6, 'CI hi');
});

test('linreg: degenerate inputs are NaN-free', () => {
  assert.deepStrictEqual(linreg([], []), { slope: 0, intercept: 0, r2: 0, slopeCI: [0, 0] });
  assert.deepStrictEqual(linreg([3], [7]), { slope: 0, intercept: 7, r2: 0, slopeCI: [0, 0] });
  // constant xs: nothing to regress on
  const flat = linreg([2, 2, 2, 2], [1, 2, 3, 4]);
  assert.deepStrictEqual(flat, { slope: 0, intercept: 2.5, r2: 0, slopeCI: [0, 0] });
  // constant ys: slope 0, r² 0 by convention (matches scipy.linregress)
  const level = linreg([1, 2, 3, 4], [5, 5, 5, 5]);
  assert.strictEqual(level.slope, 0);
  assert.strictEqual(level.r2, 0);
  for (const v of [level.intercept, level.slopeCI[0], level.slopeCI[1]]) {
    assert.ok(!Number.isNaN(v), 'no NaN anywhere');
  }
});

test('every public function survives a junk-input gauntlet without NaN', () => {
  const results = [
    wilsonInterval(NaN, 0),
    mannKendall(null),
    circularStats(undefined),
    spearman(null, null),
    linreg(undefined, undefined),
  ];
  for (const r of results) {
    for (const v of Object.values(r)) {
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) {
        if (typeof x === 'number') assert.ok(!Number.isNaN(x), `NaN leaked: ${JSON.stringify(r)}`);
      }
    }
  }
  assert.deepStrictEqual(changepoints(null), []);
});
