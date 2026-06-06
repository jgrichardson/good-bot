// Optional opt-in barometer client. Posts only { niceness, scale, source }
// to the worker; reads aggregate stats for the percentile display.
//
// Never auto-fires — only runs when the user explicitly taps "Add my score."
// Gracefully no-ops if the worker is unreachable (offline / not deployed).

const WORKER_BASE = 'https://good-bot-barometer.jgrciv.workers.dev';

export async function submitScore({ niceness, scale, source }) {
  try {
    const res = await fetch(`${WORKER_BASE}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niceness, scale, source }),
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json().catch(() => ({}));
    return { ok: true, stored: body.stored || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function fetchStats(scale) {
  try {
    const res = await fetch(`${WORKER_BASE}/api/stats?scale=${encodeURIComponent(scale)}`, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

export function computePercentile(niceness, stats) {
  if (!stats || !Array.isArray(stats.buckets) || !stats.total) return null;
  const bucket = Math.min(9, Math.floor(niceness / 10));
  // Count everyone strictly below the user's bucket.
  let below = 0;
  for (let i = 0; i < bucket; i++) below += stats.buckets[i] || 0;
  // Within the user's bucket, assume uniform distribution.
  const inBucket = stats.buckets[bucket] || 0;
  const fracInBucket = (niceness % 10) / 10;
  const meAndBelow = below + Math.floor(inBucket * fracInBucket);
  return {
    percentile: Math.round((meAndBelow / stats.total) * 100),
    total: stats.total,
  };
}
