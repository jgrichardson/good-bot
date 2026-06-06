// Build script for the good-bot web app.
// Bundles src/main.js + transitive imports (including ../scales.js) into
// dist/main.js, copies static assets, and optionally serves the result.
// Zero runtime dependencies in the shipped bundle.

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'src');
const PUBLIC = path.join(__dirname, 'public');
const DIST = path.join(__dirname, 'dist');

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

fs.mkdirSync(DIST, { recursive: true });

// Copy static assets (HTML, CSS, favicons, OG image)
function copyStatic() {
  // index.html + style.css live under src/ for editor convenience
  for (const f of ['index.html', 'style.css']) {
    const from = path.join(SRC, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DIST, f));
  }
  // Public assets pass through unchanged
  if (fs.existsSync(PUBLIC)) {
    for (const f of fs.readdirSync(PUBLIC)) {
      fs.copyFileSync(path.join(PUBLIC, f), path.join(DIST, f));
    }
  }
}

const ctx = await esbuild.context({
  entryPoints: [path.join(SRC, 'main.js')],
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  outfile: path.join(DIST, 'main.js'),
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  loader: { '.svg': 'text' },
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  // The CommonJS scales.js + scoring helpers are pulled in via require() and
  // esbuild rewrites them to ESM at bundle time. The web app intentionally
  // does NOT bundle the file/network parts of niceness.js — those use node:fs
  // and node:https which don't exist in the browser. We import the pure
  // helpers (QUIZ_QUESTIONS, scoreQuizAnswers, etc.) by surgical re-exports
  // declared in src/engine.js.
  external: [],
});

if (watch) {
  await ctx.watch();
  copyStatic();
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: DIST, port: 5173 });
    console.log(`good-bot web · dev server: http://${host || 'localhost'}:${port}/`);
  }
  // Keep the process alive forever in watch mode
  await new Promise(() => {});
} else {
  await ctx.rebuild();
  copyStatic();
  await ctx.dispose();
  console.log(`good-bot web · built to ${path.relative(process.cwd(), DIST)}`);
}
