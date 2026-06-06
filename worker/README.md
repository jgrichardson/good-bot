# good-bot barometer (Cloudflare Worker)

The opt-in global niceness aggregator. Powers the speedtest-style "you beat 73% of takers" display on https://jgrichardson.github.io/good-bot/.

## What it stores

Three fields per submission, nothing else:

| Field | Type | Notes |
|---|---|---|
| `niceness` | int 0-100 | bucketed to 0-9 (tens) before storage |
| `scale` | enum | one of the 13 known scales |
| `source` | enum | `quiz` \| `import` \| `shared-link` |

Stored as an aggregate per `(scale, bucket)` in Cloudflare KV. The raw individual submission is **never persisted** beyond the request that wrote it.

## What it explicitly does NOT store or collect

- IP address
- User-Agent
- Cookies
- Referer headers
- Geolocation
- Any portion of the user's transcripts
- Any persona name, exhibits, or other free-text
- Session, device, or browser fingerprint of any kind

## What it does with the data

- Computes the global histogram per scale
- Serves it back via `GET /api/stats?scale=people` for the percentile display

## What it NEVER does with the data

- Sell it
- Share it with third parties
- Use it as training data
- Use it for marketing or remarketing
- Cross-reference it with anything

## Honoring Do-Not-Track

If the browser sends `DNT: 1` or `Sec-GPC: 1`, the POST endpoint returns 204 without writing anything. The caller cannot distinguish a DNT-honored response from a normal one (privacy-preserving).

## Endpoints

```
POST /api/score      { niceness, scale, source } → echoes back what was stored
GET  /api/stats?scale=people → { buckets: number[10], total, updated }
GET  /api/health     → { ok: true, ts }
```

CORS allows `https://jgrichardson.github.io` and `http://localhost:5173` only.

## Deploy

One-time:

1. Create a free Cloudflare account
2. Generate an API token at https://dash.cloudflare.com/profile/api-tokens
   - Template: **Edit Cloudflare Workers**
   - Scope to your account
3. Add the token as a GitHub repo secret: `CLOUDFLARE_API_TOKEN`
4. Also note your `CLOUDFLARE_ACCOUNT_ID` (visible in any Cloudflare dashboard URL or workers.dev page) and add it as a secret too
5. Locally: `cd worker && npx wrangler login && npx wrangler kv namespace create STATS`
6. Copy the printed namespace ID into `wrangler.toml`
7. Commit + push — the `.github/workflows/worker-deploy.yml` workflow handles all future deploys

## Source = privacy disclosure

This file and `index.js` are the privacy disclosure. Read them. Trust nothing else.
