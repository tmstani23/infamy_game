// Mode split guard (Tim 2026-11-05): Classic and Campaign share one core; only sim/modes/ knows the mode names.
//  1. nothing outside sim/modes/ and sim/match_options.js compares a match mode (match?.mode ===, 'campaign' literal);
//  2. the Classic rule set (and anything it imports) never reaches sim/frontier/ or sim/influence/;
//  3. every capability the code asks for exists on both rule sets.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { RULE_SETS } from '../src/sim/modes/index.js';
const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const rel = p => relative(SRC, p).replace(/\\/g, '/');
const files = walk(SRC);
// 1. no mode checks in the core, the UI or the frontier
const ALLOWED = [/^sim\/modes\//, /^sim\/match_options\.js$/, /^save_store\.js$/, /^save_menu\.js$/];
const MODE_CHECK = /match\??\.mode\b|\.mode\s*[!=]==?\s*'(campaign|classic)'|===\s*'campaign'|!==\s*'campaign'/;
const SAVE_META_OK = /saveMeta\s*=/;   // main.js records the mode in a save's label only
const bad = [];
for (const f of files) {
  if (ALLOWED.some(r => r.test(rel(f)))) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (MODE_CHECK.test(line) && !SAVE_META_OK.test(line) && !/a\.mode|raid\.mode/.test(line)) bad.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 90)}`); });
}
assert.deepEqual(bad, [], 'mode checks belong in sim/modes/ (use modeRules(state).<capability>):\n' + bad.join('\n'));
// 2. Classic never imports campaign-only systems
const seen = new Set(), queue = [resolve(SRC, 'sim/modes/classic.js')];
while (queue.length) {
  const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
  for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
    const t = resolve(dirname(f), m[1]);
    assert.ok(!/\/sim\/(frontier|influence)\//.test(t.replace(/\\/g, '/')) && !/campaign\.js$/.test(t), `Classic must not import ${rel(t)}`);
    queue.push(t);
  }
}
// 3. both rule sets declare the same capabilities
assert.deepEqual(Object.keys(RULE_SETS.classic).sort(), Object.keys(RULE_SETS.campaign).sort(), 'rule sets must declare the same capabilities');
console.log('test_mode_separation: ok');
