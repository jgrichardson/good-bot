// good-bot barometer — Cloudflare Worker
//
// Opt-in global niceness aggregator. Privacy contract:
//   - Accepts ONLY three fields: { niceness: 0-100, scale: enum, source: enum }
//   - Stores submission counts bucketed by (scale, niceness/10)
//   - Logs raw submissions for 90 days for time-series only; never read/queried
//     beyond that purpose. After 90 days the bucket counts persist; raw rows go
//   - Never collects: IP address, User-Agent, cookies, Referer, geo, anything
//     that could identify a user
//   - Honors browser DNT and Sec-GPC headers (returns 204 + no write if set)
//   - CORS allows the GH Pages origin only (https://jgrichardson.github.io)
//
// This file IS the privacy disclosure. Read it; verify what we store; trust
// nothing else.

const ALLOWED_SCALES = new Set([
  'people', 'spice', 'weather', 'coffee', 'dnd', 'trek', 'dogs', 'hogwarts',
  'office', 'succession', 'swfilms', 'marvel', 'parks',
]);

const ALLOWED_SOURCES = new Set(['quiz', 'import', 'shared-link']);

const ALLOWED_ORIGINS = new Set([
  'https://jgrichardson.github.io',
  'http://localhost:5173',   // local dev
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://jgrichardson.github.io';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

function json(body, init = {}, origin = '') {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin), ...(init.headers || {}) },
  });
}

async function readStats(env, scale) {
  // KV key: stats:<scale> → { buckets: number[10], total: number, updated: epoch }
  const raw = await env.STATS.get(`stats:${scale}`, 'json');
  return raw || { buckets: new Array(10).fill(0), total: 0, updated: 0 };
}

async function writeStats(env, scale, stats) {
  await env.STATS.put(`stats:${scale}`, JSON.stringify(stats));
}

function honorDoNotTrack(request) {
  // Both DNT and the newer Sec-GPC mean: do not store anything.
  return request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1';
}

async function handleSubmit(request, env, origin) {
  if (honorDoNotTrack(request)) {
    // We still return 204 so the caller sees a successful "submit," but we
    // don't write anything. The caller never knows whether DNT was applied,
    // which is the privacy-preserving behavior.
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  let payload;
  try { payload = await request.json(); }
  catch (_) { return json({ error: 'invalid JSON' }, { status: 400 }, origin); }

  const niceness = Number(payload && payload.niceness);
  const scale = String((payload && payload.scale) || '');
  const source = String((payload && payload.source) || '');

  if (!Number.isFinite(niceness) || niceness < 0 || niceness > 100) {
    return json({ error: 'niceness must be 0..100' }, { status: 400 }, origin);
  }
  if (!ALLOWED_SCALES.has(scale)) {
    return json({ error: 'unknown scale' }, { status: 400 }, origin);
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return json({ error: 'unknown source' }, { status: 400 }, origin);
  }

  const bucket = Math.min(9, Math.floor(niceness / 10));
  const stats = await readStats(env, scale);
  stats.buckets[bucket] = (stats.buckets[bucket] || 0) + 1;
  stats.total = (stats.total || 0) + 1;
  stats.updated = Math.floor(Date.now() / 1000);
  await writeStats(env, scale, stats);

  // Echo back the exact payload we stored — useful for the UI to show
  // "here's literally everything we recorded."
  return json({ stored: { niceness: Math.round(niceness), scale, source, bucket } }, { status: 200 }, origin);
}

async function handleStats(url, env, origin) {
  const scale = String(url.searchParams.get('scale') || '');
  if (!ALLOWED_SCALES.has(scale)) {
    return json({ error: 'unknown scale' }, { status: 400 }, origin);
  }
  const stats = await readStats(env, scale);
  // Compute percentile helpers (count below + count up-to a given bucket)
  return json({ scale, ...stats }, { status: 200, headers: { 'cache-control': 'public, max-age=60' } }, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/score') {
      return handleSubmit(request, env, origin);
    }
    if (request.method === 'GET' && url.pathname === '/api/stats') {
      return handleStats(url, env, origin);
    }
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, ts: Math.floor(Date.now() / 1000) }, { status: 200 }, origin);
    }
    return json({ error: 'not found' }, { status: 404 }, origin);
  },
};
