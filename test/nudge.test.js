'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  nudgeDecision, nudgeSuppressed, maybeNudge, readState, writeState,
  NUDGE_AFTER_RUNS, NUDGE_LINE,
} = require('../niceness.js');

function tmpStateFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-nudge-')), 'state.json');
}

// ---- the pure state machine -------------------------------------------------
test('nudgeDecision: runs 1 and 2 stay quiet, the 3rd shows, the 4th never again', () => {
  let state = {};
  let r;
  r = nudgeDecision(state); assert.strictEqual(r.show, false); state = r.state;   // run 1
  r = nudgeDecision(state); assert.strictEqual(r.show, false); state = r.state;   // run 2
  r = nudgeDecision(state); assert.strictEqual(r.show, true); state = r.state;    // run 3 — the one time
  assert.strictEqual(state.nudgeShown, true);
  r = nudgeDecision(state); assert.strictEqual(r.show, false); state = r.state;   // run 4
  r = nudgeDecision(state); assert.strictEqual(r.show, false);                    // run 5 … forever
  assert.strictEqual(NUDGE_AFTER_RUNS, 3);
});

test('nudgeDecision: a suppressed 3rd run still counts but defers the nudge', () => {
  let state = {};
  state = nudgeDecision(state).state;
  state = nudgeDecision(state).state;
  const r3 = nudgeDecision(state, { suppressed: true });                          // 3rd run, --no-nudge
  assert.strictEqual(r3.show, false);
  assert.strictEqual(r3.state.nudgeShown, undefined);                             // not burned
  assert.strictEqual(r3.state.nudgeRuns, 3);                                      // still counted
  const r4 = nudgeDecision(r3.state);                                             // next clean run
  assert.strictEqual(r4.show, true);
  assert.strictEqual(r4.state.nudgeShown, true);
});

test('nudgeDecision: does not mutate the input state', () => {
  const state = { nudgeRuns: 2 };
  nudgeDecision(state);
  assert.strictEqual(state.nudgeRuns, 2);
  assert.strictEqual(state.nudgeShown, undefined);
});

// ---- suppression rules --------------------------------------------------------
test('nudgeSuppressed: --no-nudge, --json, --mcp, --statusline, --webhook, non-TTY', () => {
  assert.strictEqual(nudgeSuppressed([], true), false);
  assert.strictEqual(nudgeSuppressed(['--no-nudge'], true), true);
  assert.strictEqual(nudgeSuppressed(['--json'], true), true);
  assert.strictEqual(nudgeSuppressed(['--mcp'], true), true);
  assert.strictEqual(nudgeSuppressed(['--statusline'], true), true);
  assert.strictEqual(nudgeSuppressed(['--webhook', 'https://x'], true), true);
  assert.strictEqual(nudgeSuppressed(['--post-webhook', 'https://x'], true), true);
  assert.strictEqual(nudgeSuppressed([], false), true);                            // piped stdout
});

// ---- maybeNudge: state machine + persistence, against a temp file --------------
test('maybeNudge: 3rd lifetime run shows once, persisted, never again', () => {
  const file = tmpStateFile();
  assert.strictEqual(maybeNudge([], { file, isTTY: true }), false);                // run 1
  assert.strictEqual(maybeNudge([], { file, isTTY: true }), false);                // run 2
  assert.strictEqual(maybeNudge([], { file, isTTY: true }), true);                 // run 3 — shows
  const persisted = readState(file);
  assert.strictEqual(persisted.nudgeRuns, 3);
  assert.strictEqual(persisted.nudgeShown, true);
  assert.strictEqual(maybeNudge([], { file, isTTY: true }), false);                // run 4 — never again
});

test('maybeNudge: --no-nudge suppresses on the 3rd run, defers to the 4th', () => {
  const file = tmpStateFile();
  maybeNudge([], { file, isTTY: true });
  maybeNudge([], { file, isTTY: true });
  assert.strictEqual(maybeNudge(['--no-nudge'], { file, isTTY: true }), false);    // suppressed 3rd
  assert.strictEqual(readState(file).nudgeShown, undefined);
  assert.strictEqual(maybeNudge([], { file, isTTY: true }), true);                 // shows on the next one
});

test('maybeNudge: non-TTY stdout never shows, but runs still count', () => {
  const file = tmpStateFile();
  for (let i = 0; i < 5; i++) assert.strictEqual(maybeNudge([], { file, isTTY: false }), false);
  assert.strictEqual(readState(file).nudgeRuns, 5);
  assert.strictEqual(readState(file).nudgeShown, undefined);
});

// ---- state file plumbing --------------------------------------------------------
test('readState: missing or corrupt file degrades to a fresh state', () => {
  assert.deepStrictEqual(readState('/nope/never/state.json'), { schemaVersion: 1 });
  const file = tmpStateFile();
  fs.writeFileSync(file, '{corrupt');
  assert.deepStrictEqual(readState(file), { schemaVersion: 1 });
  fs.writeFileSync(file, '[1,2,3]');
  assert.deepStrictEqual(readState(file), { schemaVersion: 1 });
});

test('writeState/readState: round-trips and creates the directory', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'good-bot-nudge-')), 'deeper', 'state.json');
  assert.strictEqual(writeState({ nudgeRuns: 7, nudgeShown: true }, file), true);
  const s = readState(file);
  assert.strictEqual(s.nudgeRuns, 7);
  assert.strictEqual(s.nudgeShown, true);
  assert.strictEqual(s.schemaVersion, 1);
});

test('NUDGE_LINE: one line, the star ask, the newsletter teaser', () => {
  assert.ok(!NUDGE_LINE.includes('\n'));
  assert.match(NUDGE_LINE, /⭐/);
  assert.match(NUDGE_LINE, /github\.com\/jgrichardson\/good-bot/);
  assert.match(NUDGE_LINE, /newsletter/);
});
