// Mode split guard M0: a fixed-seed Classic and Campaign match must keep the same state fingerprint
// through the Classic/Campaign rule-set refactor. Refresh intentionally with UPDATE=1 (only when rules change on purpose).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world, worldChunks: data('data/world_chunks.json'), frontier });
const TICKS = 400;
function fingerprint(mode) {
  const g = createGame(options());
  setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode, bots: data('data/bots.json'), spawns: options().district.spawns });
  for (let i = 0; i < TICKS; i++) g.step([]);
  const S = g.state;
  const hash = createHash('sha256').update(JSON.stringify({ tick: S.tick, match: S.match, clans: S.clans, entities: S.entities, frontier: S.frontier ?? null })).digest('hex').slice(0, 16);
  return { hash, units: Object.keys(S.entities).length };
}
const file = new URL('./mode_baseline.json', import.meta.url);
const now = { classic: fingerprint('classic'), campaign: fingerprint('campaign') };
const again = { classic: fingerprint('classic'), campaign: fingerprint('campaign') };
assert.deepEqual(now, again, 'same seed must give the same state (sim is deterministic)');
if (process.env.UPDATE || !existsSync(file)) { writeFileSync(file, JSON.stringify(now, null, 1) + '\n'); console.log('baseline written', now); }
else assert.deepEqual(now, JSON.parse(readFileSync(file)), 'mode behaviour changed vs baseline');
console.log('mode baseline ok', now);
