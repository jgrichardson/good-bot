'use strict';

// THE PRIVACY GUARD — the mechanical half of the privacy promise.
//
// PRIVACY.md says the default path makes zero network calls and that the only
// network-capable code in the CLI lives inside two explicit opt-in handlers.
// This suite makes that claim CI-enforced rather than trust-me-bro: it
// statically scans every SHIPPED .js file (the package.json "files" array +
// "bin") and fails the build if network-capable code appears anywhere outside
// the allowlist below. Any new network feature must add a consciously
// reviewed entry HERE — with a reason — or CI breaks loudly.
//
// The scan is deliberately AST-free (line-based regexes) so it has zero
// dependencies and is auditable in one read. It catches:
//   • require('http' | 'https' | 'http2' | 'net' | 'tls' | 'dgram' | 'dns')
//     in both spellings — require('https') AND require("node:https") — plus
//     the /promises variants and dynamic import(...) of the same modules
//   • shelling out to curl/wget via child_process (spawn/exec/execFile/...)
//   • calls to the global fetch()

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// ---- what counts as network code ------------------------------------------
const NET_MODULES = ['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns'];
const REQUIRE_NET_RE = new RegExp(
  'require\\s*\\(\\s*[\'"](?:node:)?(' + NET_MODULES.join('|') + ')(?:/promises)?[\'"]\\s*\\)');
const IMPORT_NET_RE = new RegExp(
  '\\bimport\\s*\\(\\s*[\'"](?:node:)?(' + NET_MODULES.join('|') + ')(?:/promises)?[\'"]');
const CURL_RE = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(\s*['"](?:curl|wget)\b/;
const FETCH_CALL_RE = /(?<![\w$.])fetch\s*\(/;

// ---- THE ALLOWLIST ---------------------------------------------------------
// Every entry is a conscious, reviewed exception to "no network code". Each
// names the exact file + enclosing top-level function + modules it may
// lazy-require, and explains WHY it exists. Network code anywhere else —
// including a new lazy require inside one of these files — fails this suite.
const ALLOWLIST = [
  {
    // --webhook <url> (alias --post-webhook): the ONE deliberate network
    // write in the product. node:https is lazy-required inside sendWebhook —
    // and nowhere else — so no other code path can even reach the network
    // stack. Opt-in via an explicit URL every run, loud notice before the
    // POST, fully documented in PRIVACY.md "Network features (opt-in only)".
    file: 'niceness.js',
    fn: 'sendWebhook',
    modules: ['https'],
    maxRequires: 1,
  },
  {
    // --audit / --verify-privacy: requires each stdlib network module ONLY to
    // monkey-patch its entry points to throw + count, producing the
    // "provably no network call was attempted" attestation. These requires
    // never open a socket — they exist precisely so nothing else can.
    file: 'niceness.js',
    fn: 'installNetworkAudit',
    modules: ['net', 'tls', 'http', 'https', 'dns', 'dgram'],
    maxRequires: 6,
  },
];
// NOTE: the --ai opt-in needs no entry here. It shells out to the user's own
// local `claude` binary via spawnSync (see llmCard) — it never touches node's
// network stack, so the scan has nothing to allowlist for it. If --ai ever
// grows an HTTP path, this suite is exactly what should catch it.

// ---- the scanner -----------------------------------------------------------
// Walks the source line by line, tracking which COLUMN-0 function declaration
// we're inside (the repo style keeps every top-level function at column 0 and
// closes it with a column-0 `}`), so each finding can be attributed to its
// enclosing handler and matched against the allowlist. Line comments are
// stripped first so prose about require('https') can't trip it.
function scanSource(src, fileLabel) {
  const findings = [];
  let fn = null; // null = module top level
  const lines = String(src).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/\/\/.*$/, '');
    const decl = code.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/) ||
                 code.match(/^(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function\b|\()/);
    if (decl) fn = decl[1];
    const base = { file: fileLabel, line: i + 1, fn: fn || '(top level)', topLevel: fn === null };
    let m;
    if ((m = code.match(REQUIRE_NET_RE))) findings.push(Object.assign({ kind: 'require', module: m[1] }, base));
    if ((m = code.match(IMPORT_NET_RE))) findings.push(Object.assign({ kind: 'import', module: m[1] }, base));
    if (CURL_RE.test(code)) findings.push(Object.assign({ kind: 'curl/wget' }, base));
    if (FETCH_CALL_RE.test(code)) findings.push(Object.assign({ kind: 'fetch' }, base));
    // A column-0 `}` closes the current top-level function; a one-line
    // `function f() { … }` closes itself on the declaration line.
    if (/^\}/.test(code) || (decl && /\}\s*;?\s*$/.test(code))) fn = null;
  }
  return findings;
}

// Classify findings against the allowlist. Top-level requires are NEVER
// allowed; lazy requires must match an entry (file + fn + module) and stay
// within its maxRequires; curl/wget, fetch(), and dynamic import() of network
// modules are never allowed at all.
function violationsOf(findings) {
  const used = new Map();
  const bad = [];
  for (const f of findings) {
    if (f.kind === 'require' && !f.topLevel) {
      const entry = ALLOWLIST.find(a => a.file === f.file && a.fn === f.fn && a.modules.includes(f.module));
      if (entry) {
        const n = (used.get(entry) || 0) + 1;
        used.set(entry, n);
        if (n > entry.maxRequires) {
          bad.push(Object.assign({ why: `exceeds maxRequires=${entry.maxRequires} for allowlisted ${f.fn}()` }, f));
        }
        continue;
      }
      bad.push(Object.assign({ why: `require of "${f.module}" in non-allowlisted function ${f.fn}()` }, f));
    } else if (f.kind === 'require' || f.kind === 'import') {
      bad.push(Object.assign({ why: `${f.topLevel ? 'top-level ' : ''}${f.kind} of "${f.module}"${f.topLevel ? '' : ` in ${f.fn}()`}` }, f));
    } else if (f.kind === 'curl/wget') {
      bad.push(Object.assign({ why: 'curl/wget via child_process' }, f));
    } else {
      bad.push(Object.assign({ why: 'global fetch() call' }, f));
    }
  }
  return { bad, used };
}

// Resolve the shipped surface: package.json "files" + "bin", expanding
// directories to every .js inside. This is exactly what `npm publish` ships
// (plus the auto-included package.json itself, which is data, not code).
function shippedJsFiles() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const roots = new Set(Object.values(pkg.bin || {}).concat(pkg.files || []));
  const out = new Set();
  const addDir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) addDir(p);
      else if (e.isFile() && e.name.endsWith('.js')) out.add(p);
    }
  };
  for (const rel of roots) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) addDir(abs);
    else if (abs.endsWith('.js')) out.add(abs);
  }
  return [...out].sort();
}

function fmt(v) {
  return v.map(b => `  ${b.file}:${b.line} [${b.fn}] — ${b.why}`).join('\n');
}

// ---- THE GUARD: the shipped surface must be clean ---------------------------
test('no-network guard: every shipped .js file is free of non-allowlisted network code', () => {
  const files = shippedJsFiles();
  assert.ok(files.length >= 5, `expected to find the shipped modules, got: ${files.join(', ')}`);
  assert.ok(files.some(f => f.endsWith('niceness.js')), 'bin entry niceness.js must be scanned');
  assert.ok(files.some(f => f.endsWith('mcp.js')), 'mcp.js must be scanned');

  const all = [];
  for (const abs of files) {
    all.push(...scanSource(fs.readFileSync(abs, 'utf8'), path.relative(ROOT, abs)));
  }
  const { bad, used } = violationsOf(all);
  assert.strictEqual(bad.length, 0,
    `network-capable code outside the allowlist — if this is a NEW deliberate opt-in,\n` +
    `add a reviewed entry (with a reason) to ALLOWLIST in test/no-network.test.js\n` +
    `and disclose it in PRIVACY.md first:\n${fmt(bad)}`);

  // The allowlist may never go stale: every entry must still match real code,
  // so renaming/moving a handler forces a conscious update here too.
  for (const entry of ALLOWLIST) {
    assert.ok(used.get(entry),
      `stale ALLOWLIST entry: no require of [${entry.modules.join(', ')}] found inside ` +
      `${entry.fn}() in ${entry.file} — update or remove the entry`);
  }
});

// ---- scanner self-tests: prove the guard would actually catch violations ---
const FIXTURE = path.join(__dirname, 'fixtures', 'network-violation-fixture.js.txt');

test('scanner: the violation fixture trips every detector', () => {
  const findings = scanSource(fs.readFileSync(FIXTURE, 'utf8'), 'fixture.js');
  const { bad } = violationsOf(findings);
  const kinds = new Set(bad.map(b => b.kind));
  assert.ok(kinds.has('require'), 'fixture require() violations must be caught');
  assert.ok(kinds.has('import'), 'fixture dynamic import() violation must be caught');
  assert.ok(kinds.has('curl/wget'), 'fixture curl-via-child_process must be caught');
  assert.ok(kinds.has('fetch'), 'fixture fetch() call must be caught');
  assert.ok(bad.some(b => b.topLevel && b.kind === 'require'), 'top-level require must be caught');
  assert.ok(bad.some(b => !b.topLevel && b.kind === 'require'), 'lazy require in a non-allowlisted fn must be caught');
  assert.ok(bad.length >= 5, `expected ≥5 violations in the fixture, got ${bad.length}:\n${fmt(bad)}`);
});

test('scanner: catches both quote forms — require("node:https") and require(\'https\')', () => {
  const a = violationsOf(scanSource(`const x = require('https');\n`, 'a.js')).bad;
  const b = violationsOf(scanSource(`const y = require("node:https");\n`, 'b.js')).bad;
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].module, 'https');
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].module, 'https');
});

test('scanner: catches dns/promises and net, dgram, tls, http2 spellings', () => {
  for (const mod of ['dns/promises', 'net', 'dgram', 'tls', 'http2']) {
    const src = `function f() {\n  const m = require('node:${mod}');\n}\n`;
    const { bad } = violationsOf(scanSource(src, 'x.js'));
    assert.strictEqual(bad.length, 1, `require('node:${mod}') must be flagged`);
  }
});

test('scanner: the allowlist admits exactly the real handlers, nothing else', () => {
  // The genuine shape: lazy require inside sendWebhook in niceness.js — clean.
  const ok = violationsOf(scanSource(
    `function sendWebhook(url, plainText, opts) {\n  const lib = opts.transport || require('node:https');\n}\n`,
    'niceness.js'));
  assert.strictEqual(ok.bad.length, 0);
  // Same require, different function — violation.
  const wrongFn = violationsOf(scanSource(
    `function sneakyUpload(card) {\n  const lib = require('node:https');\n}\n`,
    'niceness.js'));
  assert.strictEqual(wrongFn.bad.length, 1);
  // Same function name, different file — violation.
  const wrongFile = violationsOf(scanSource(
    `function sendWebhook(url) {\n  const lib = require('node:https');\n}\n`,
    'mcp.js'));
  assert.strictEqual(wrongFile.bad.length, 1);
  // A SECOND https require inside the allowlisted fn — exceeds maxRequires.
  const tooMany = violationsOf(scanSource(
    `function sendWebhook(url) {\n  const a = require('node:https');\n  const b = require('https');\n}\n`,
    'niceness.js'));
  assert.strictEqual(tooMany.bad.length, 1);
  assert.match(tooMany.bad[0].why, /maxRequires/);
});

test('scanner: comments about network modules do not trip it', () => {
  const src = `// the webhook handler lazy-requires require('node:https') on purpose\n` +
    `function harmless() { return 1; } // try: require("https")\n`;
  const { bad } = violationsOf(scanSource(src, 'x.js'));
  assert.strictEqual(bad.length, 0);
});

test('scanner: prose like "fetched a stick" is not a fetch() call', () => {
  const src = `const blurb = 'it just fetched a stick';\nconst p = prefetch(1);\nconst q = obj.fetch;\n`;
  const { bad } = violationsOf(scanSource(src, 'x.js'));
  assert.strictEqual(bad.length, 0);
});
