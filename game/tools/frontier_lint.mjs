// Guard scanner for the frontier plan (Shared design, "Guards against stray changes").
// scan(srcDir) returns a list of { file, line, text, rule } for writes to frontier records outside
// the module that owns them, and for render/UI code that writes to frontier snapshot data.
// Used by game/tools/test_frontier_guards.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// field -> the only files (relative to game/src, with '/') allowed to assign it on frontier records
export const OWNERS = {
  stock: ['sim/frontier/world.js', 'sim/frontier/camp_stock.js'],   // camp_stock.js: the war camp's own pot
  owner: ['sim/frontier/world.js'],
  units: ['sim/frontier/world.js', 'sim/frontier/armies.js'],
  cargo: ['sim/frontier/world.js', 'sim/frontier/logistics.js']
};
// Receivers that mean "a frontier record". `.owner =` and `.units =` exist on other things
// (entities, businesses, operations), so they are only flagged on frontier-named receivers.
const RECEIVER = '(?:settlement|town|army|shipment|road|frontier\\.settlements\\[[^\\]]+\\]|frontier\\.armies\\[[^\\]]+\\]|frontier\\.shipments\\[[^\\]]+\\])';
const ASSIGN = '\\s*(?:[-+*/|&]|\\*\\*)?=(?!=)';
const RULES = {
  stock: new RegExp(`\\.stock\\b(?:\\.\\w+|\\[[^\\]]+\\])?${ASSIGN}`),
  owner: new RegExp(`\\b${RECEIVER}\\.owner${ASSIGN}`),
  units: new RegExp(`\\b${RECEIVER}\\.units${ASSIGN}`),
  cargo: new RegExp(`\\.cargo\\b(?:\\.\\w+|\\[[^\\]]+\\])?${ASSIGN}`)
};
const SNAPSHOT_WRITE = new RegExp(`\\.frontier\\b[\\w.\\[\\]'"]*${ASSIGN}`);
const isRenderOrUi = rel => rel.startsWith('render/') || !rel.includes('/');   // top-level src/*.js are UI/browser files
const SKIP_UI = new Set(['sim_snapshot.js', 'sim_worker.js', 'sim_worker_client.js', 'sim_worker_runtime.js']);

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

export function scan(srcDir) {
  const hits = [];
  for (const path of files(srcDir)) {
    const rel = relative(srcDir, path).split(sep).join('/');
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const text = raw.replace(/\/\/.*$/, '');   // ignore comments
      for (const [field, re] of Object.entries(RULES)) {
        if (re.test(text) && !OWNERS[field].includes(rel)) hits.push({ file: rel, line: i + 1, text: raw.trim(), rule: field });
      }
      if (isRenderOrUi(rel) && !SKIP_UI.has(rel) && SNAPSHOT_WRITE.test(text)) hits.push({ file: rel, line: i + 1, text: raw.trim(), rule: 'snapshot' });
    });
  }
  return hits;
}
