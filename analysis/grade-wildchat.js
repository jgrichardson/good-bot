#!/usr/bin/env node
// Grades every conversation in a WildChat JSONL export with the shipped
// good-bot engine (same analyze() + pickPersona() the CLI uses) and emits
// the persona distribution as JSON. See analysis/README.md to reproduce.
//
// Usage: node analysis/grade-wildchat.js convs.jsonl > results.json
//   input lines: {"id": "...", "lang": "English", "country": "...", "turns": ["...", ...]}

const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const { analyze, pickPersona } = require(path.join(__dirname, '..', 'niceness.js'));

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: grade-wildchat.js <convs.jsonl> [maxTurnChars]'); process.exit(1); }
  // Optional conversational filter: keep only conversations where every human
  // turn is hand-typed scale (no document/code pastes, which false-positive
  // the caps/mean signals — see analysis/README.md "paste contamination").
  const maxTurnChars = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const tally = {
    total: 0, english: 0, skipped: 0,
    personas: {}, personasEnglish: {},
    hist: Array(10).fill(0),
    stats: { messages: 0, pleases: 0, thanks: 0, fbombs: 0, shouts: 0 },
  };
  let niceSum = 0, seen = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { tally.skipped++; continue; }
    const turns = (row.turns || []).filter(t => typeof t === 'string' && t.trim().length > 0);
    if (!turns.length) { tally.skipped++; continue; }
    if (turns.some(t => t.length > maxTurnChars)) { tally.skipped++; continue; }
    let a;
    try { a = analyze(turns); } catch { tally.skipped++; continue; }
    const p = pickPersona(a.sig);
    tally.total++;
    tally.personas[p.name] = (tally.personas[p.name] || 0) + 1;
    if ((row.lang || '').toLowerCase() === 'english') {
      tally.english++;
      tally.personasEnglish[p.name] = (tally.personasEnglish[p.name] || 0) + 1;
    }
    niceSum += a.niceness;
    tally.hist[Math.max(0, Math.min(9, Math.floor(a.niceness / 10)))]++;
    tally.stats.messages += a.stats.messages;
    tally.stats.pleases += a.stats.pleases;
    tally.stats.thanks += a.stats.thanks;
    tally.stats.fbombs += a.stats.fbombs;
    tally.stats.shouts += a.stats.shouts;
    if (++seen % 50000 === 0) console.error(`…${seen} conversations graded`);
  }
  tally.meanNiceness = +(niceSum / Math.max(1, tally.total)).toFixed(2);
  console.log(JSON.stringify(tally, null, 2));
}

main();
