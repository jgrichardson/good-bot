'use strict';

// Pure statistics core for good-bot — the mathematical foundation for the
// upcoming `--lab` analytics mode. Same contract as scales.js and
// achievements.js: zero dependencies, no I/O, no network, no state. Every
// function is pure and deterministic; every function is NaN-free on
// degenerate input (empty, length-1, constant series) — callers get a
// neutral, documented answer instead of NaN/Infinity.
//
// References are cited inline per function. The special functions (erf,
// log-gamma, regularized incomplete beta) are implemented from the classic
// sources so nothing here needs scipy or a math package:
//   - erf:      Abramowitz & Stegun, "Handbook of Mathematical Functions",
//               formula 7.1.26 (max abs error 1.5e-7).
//   - logGamma: Lanczos approximation, per Numerical Recipes in C, 2nd ed.,
//               §6.1 (gammln).
//   - ibeta:    regularized incomplete beta via continued fraction, per
//               Numerical Recipes in C, 2nd ed., §6.4 (betai / betacf).

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

// Arithmetic mean. Empty input → 0.
function mean(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

// Unbiased sample variance (n−1 denominator). Fewer than 2 values → 0.
function variance(xs) {
  const n = Array.isArray(xs) ? xs.length : 0;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (n - 1);
}

// Median (average of the two middle values for even n). Empty input → 0.
function median(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 1-based ranks with ties assigned their mid-rank (average of the positions
// they span) — the standard treatment for Spearman with ties. [] → [].
function ranks(xs) {
  const n = Array.isArray(xs) ? xs.length : 0;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const out = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const avg = (i + j + 2) / 2; // mean of 1-based positions i+1 .. j+1
    for (let k = i; k <= j; k++) out[idx[k]] = avg;
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// special functions (internal, exported for tests)
// ---------------------------------------------------------------------------

// Error function, Abramowitz & Stegun 7.1.26. Max abs error 1.5e-7 — plenty
// for the p-values we report.
function erf(x) {
  if (x === 0) return 0; // the polynomial leaves a ~1e-9 residue at 0
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

// Standard normal CDF Φ(z) = (1 + erf(z/√2)) / 2.
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Log-gamma, Lanczos approximation (Numerical Recipes §6.1).
function logGamma(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Continued fraction for the incomplete beta (Numerical Recipes §6.4, betacf).
function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b) (Numerical Recipes §6.4, betai).
function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

// Student's t CDF: P(T ≤ t) with df degrees of freedom, via
// P(|T| > t) = I_{df/(df+t²)}(df/2, 1/2).
function tCdf(t, df) {
  if (df <= 0) return 0.5;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

// Inverse t CDF (quantile), by deterministic bisection on tCdf. Used for
// the 95% CI on a regression slope: tCrit(0.975, n−2).
function tCrit(p, df) {
  if (df <= 0 || !(p > 0 && p < 1)) return 0;
  let lo = -1e3;
  let hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// 1. Wilson score interval
// ---------------------------------------------------------------------------

// Wilson score interval for a binomial proportion (Wilson, E. B. 1927,
// "Probable inference, the law of succession, and statistical inference",
// JASA 22:209–212). Better coverage than the Wald interval at small n and
// extreme proportions, which is exactly the regime short chat histories
// live in. z defaults to 1.96 (95%). n ≤ 0 → total-ignorance {lo:0, hi:1}.
function wilsonInterval(successes, n, z) {
  z = z === undefined ? 1.96 : z;
  if (!Number.isFinite(n) || n <= 0) return { lo: 0, hi: 1 };
  const k = Math.min(n, Math.max(0, successes || 0));
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  return {
    lo: Math.max(0, center - half),
    hi: Math.min(1, center + half),
  };
}

// ---------------------------------------------------------------------------
// 2. Mann-Kendall trend test
// ---------------------------------------------------------------------------

// Mann-Kendall non-parametric trend test (Mann 1945; Kendall 1975), with the
// tie-corrected variance per Kendall (1975) / Gilbert (1987, "Statistical
// Methods for Environmental Pollution Monitoring", eq. 16.4):
//   S    = Σ_{i<j} sign(x_j − x_i)
//   varS = [n(n−1)(2n+5) − Σ_p t_p(t_p−1)(2t_p+5)] / 18   (t_p = tie sizes)
//   z    = (S−1)/√varS if S>0, 0 if S=0, (S+1)/√varS if S<0  (continuity corr.)
//   p    = two-sided normal-approximation p-value, 2(1 − Φ(|z|)).
// trend is 'increasing'/'decreasing' when p < 0.05, else 'none'.
// Degenerate input (n < 2, or all values tied) → {S:0, varS:0, z:0, p:1,
// trend:'none'} — never NaN.
function mannKendall(series) {
  const xs = Array.isArray(series) ? series : [];
  const n = xs.length;
  if (n < 2) return { S: 0, varS: 0, z: 0, p: 1, trend: 'none' };
  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) S += Math.sign(xs[j] - xs[i]);
  }
  const tieCounts = new Map();
  for (const x of xs) tieCounts.set(x, (tieCounts.get(x) || 0) + 1);
  let tieTerm = 0;
  for (const t of tieCounts.values()) {
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (varS > 0 && S !== 0) z = (S > 0 ? S - 1 : S + 1) / Math.sqrt(varS);
  const p = varS > 0 ? Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z))))) : 1;
  const trend = p < 0.05 ? (S > 0 ? 'increasing' : 'decreasing') : 'none';
  return { S, varS, z, p, trend };
}

// ---------------------------------------------------------------------------
// 3. Changepoint detection (binary segmentation)
// ---------------------------------------------------------------------------

// Sum of squared deviations from the segment mean over [lo, hi), via prefix
// sums — the classic mean-shift segment cost.
function segmentCost(P, Q, lo, hi) {
  const len = hi - lo;
  if (len <= 0) return 0;
  const s = P[hi] - P[lo];
  return Math.max(0, Q[hi] - Q[lo] - (s * s) / len);
}

// Mean-shift changepoint detection by binary segmentation (Scott & Knott
// 1974, "A cluster analysis method for grouping means"; see Killick, Fearnhead
// & Eckley 2012 for the penalized framing). Greedily picks the split that most
// reduces the total sum-of-squared-deviations cost; a split is accepted only
// when its cost reduction exceeds `penalty`, then both halves are searched
// recursively. The default penalty is BIC-flavored: 2·ln(n)·variance(series)
// (cf. Yao 1988 on Schwarz-criterion changepoint counts). Each resulting
// segment must contain at least `minSegment` points. Ties between candidate
// splits go to the lowest index, so output is fully deterministic. Returns a
// sorted array of changepoint indices: index i means a new segment starts at
// series[i] (e.g. [1,1,1,1,1,9,9,9,9,9] → [5]). Empty/short/constant series
// → [].
function changepoints(series, opts) {
  const xs = Array.isArray(series) ? series : [];
  const n = xs.length;
  opts = opts || {};
  const minSegment = Number.isFinite(opts.minSegment) ? Math.max(1, opts.minSegment) : 5;
  if (n < 2 * minSegment) return [];
  const penalty = Number.isFinite(opts.penalty)
    ? opts.penalty
    : 2 * Math.log(n) * variance(xs);
  const P = new Array(n + 1).fill(0); // prefix sums
  const Q = new Array(n + 1).fill(0); // prefix sums of squares
  for (let i = 0; i < n; i++) {
    P[i + 1] = P[i] + xs[i];
    Q[i + 1] = Q[i] + xs[i] * xs[i];
  }
  const found = [];
  const segments = [[0, n]]; // stack of [lo, hi) ranges still to search
  while (segments.length) {
    const [lo, hi] = segments.pop();
    if (hi - lo < 2 * minSegment) continue;
    const whole = segmentCost(P, Q, lo, hi);
    let bestK = -1;
    let bestGain = 0;
    for (let k = lo + minSegment; k <= hi - minSegment; k++) {
      const gain = whole - segmentCost(P, Q, lo, k) - segmentCost(P, Q, k, hi);
      if (gain > bestGain + 1e-12) { // strict improvement; ties keep first k
        bestGain = gain;
        bestK = k;
      }
    }
    if (bestK < 0 || bestGain <= penalty) continue;
    found.push(bestK);
    segments.push([bestK, hi]);
    segments.push([lo, bestK]);
  }
  return found.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 4. Circular statistics over a 24h clock
// ---------------------------------------------------------------------------

// Circular mean direction + mean resultant length over hours-of-day, mapping
// hour h → angle 2πh/24 (Mardia & Jupp 2000, "Directional Statistics", §2.2;
// Fisher 1993, "Statistical Analysis of Circular Data"). Returns:
//   meanHour  — circular mean as an hour in [0, 24)
//   R         — mean resultant length R̄ ∈ [0, 1] (1 = all at the same hour,
//               0 = perfectly dispersed)
//   rayleighP — Rayleigh test p-value for the null of uniformity, via the
//               Wilkie (1983, "Rayleigh test for randomness of circular
//               data", Applied Statistics 32:311–312) approximation:
//               p ≈ exp(√(1 + 4n + 4(n² − R_total²)) − (1 + 2n)),
//               clamped to [0, 1]. Well-behaved at both extremes (R̄=0 → 1).
// Empty input → {meanHour: 0, R: 0, rayleighP: 1} (no direction, no
// evidence). Note meanHour for a perfectly dispersed sample is arbitrary
// (R ≈ 0); check R before trusting meanHour.
function circularStats(hoursArray) {
  const hs = Array.isArray(hoursArray) ? hoursArray : [];
  const n = hs.length;
  if (n === 0) return { meanHour: 0, R: 0, rayleighP: 1 };
  let C = 0;
  let S = 0;
  for (const h of hs) {
    const a = (2 * Math.PI * h) / 24;
    C += Math.cos(a);
    S += Math.sin(a);
  }
  const Rtotal = Math.sqrt(C * C + S * S); // resultant length, 0..n
  const R = Rtotal / n;                    // mean resultant length, 0..1
  const meanHour = ((Math.atan2(S, C) / (2 * Math.PI)) * 24 + 24) % 24;
  const p = Math.exp(Math.sqrt(1 + 4 * n + 4 * (n * n - Rtotal * Rtotal)) - (1 + 2 * n));
  return { meanHour, R, rayleighP: Math.min(1, Math.max(0, p)) };
}

// ---------------------------------------------------------------------------
// 5. Spearman rank correlation
// ---------------------------------------------------------------------------

// Spearman rank correlation (Spearman 1904) computed as the Pearson
// correlation of mid-ranks — the formulation that stays exact under ties
// (Zar 2010, "Biostatistical Analysis", §19.9). Two-sided p-value from the
// t-approximation t = ρ·√((n−2)/(1−ρ²)) on n−2 degrees of freedom (Kendall
// & Stuart; same approximation scipy.stats.spearmanr uses by default).
// Degenerate input (n < 3, or either side constant) → {rho: 0, p: 1};
// |ρ| = 1 → p = 0. Never NaN.
function spearman(xs, ys) {
  const n = Math.min(
    Array.isArray(xs) ? xs.length : 0,
    Array.isArray(ys) ? ys.length : 0
  );
  if (n < 3) return { rho: 0, p: 1 };
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  if (sxx <= 0 || syy <= 0) return { rho: 0, p: 1 };
  const rho = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  if (1 - rho * rho < 1e-12) return { rho, p: 0 };
  const t = rho * Math.sqrt(df / (1 - rho * rho));
  const p = Math.min(1, Math.max(0, ibeta(df / (df + t * t), df / 2, 0.5)));
  return { rho, p };
}

// ---------------------------------------------------------------------------
// 6. Ordinary least squares with a CI on the slope
// ---------------------------------------------------------------------------

// Simple OLS regression y = slope·x + intercept with r² and a 95% confidence
// interval on the slope: slope ± t(0.975, n−2)·SE, where
// SE = √(SSE / (n−2) / Sxx) (any regression text; e.g. Draper & Smith 1998,
// "Applied Regression Analysis", §1.4). Degenerate behavior, never NaN:
//   n = 0           → all zeros.
//   n = 1           → slope 0, intercept = y₀.
//   constant xs     → slope 0, intercept = ȳ, r² 0 (no fit possible).
//   constant ys     → slope 0, r² 0 by convention (matches scipy.linregress).
//   n = 2 (df = 0)  → exact fit through both points; CI collapses to the
//                     slope itself (no residual to estimate noise from).
function linreg(xs, ys) {
  const n = Math.min(
    Array.isArray(xs) ? xs.length : 0,
    Array.isArray(ys) ? ys.length : 0
  );
  if (n === 0) return { slope: 0, intercept: 0, r2: 0, slopeCI: [0, 0] };
  if (n === 1) return { slope: 0, intercept: ys[0], r2: 0, slopeCI: [0, 0] };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    sxx += a * a;
    sxy += a * b;
    syy += b * b;
  }
  if (sxx <= 0) return { slope: 0, intercept: my, r2: 0, slopeCI: [0, 0] };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy > 0 ? Math.min(1, (sxy * sxy) / (sxx * syy)) : 0;
  let lo = slope;
  let hi = slope;
  if (n > 2) {
    const sse = Math.max(0, syy - slope * sxy);
    const se = Math.sqrt(sse / (n - 2) / sxx);
    const tc = tCrit(0.975, n - 2);
    lo = slope - tc * se;
    hi = slope + tc * se;
  }
  return { slope, intercept, r2, slopeCI: [lo, hi] };
}

module.exports = {
  // helpers
  mean, variance, median, ranks,
  // special functions (internal, exported for tests + --lab)
  erf, normalCdf, tCdf, tCrit,
  // the six
  wilsonInterval, mannKendall, changepoints, circularStats, spearman, linreg,
};
