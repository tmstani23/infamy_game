// Phase 6 (docs/playtest_followup_plan.md, Tim 2026-10-29): business / Renown slots grow the cap, but no clan passes maxCrew.
// Run: node game/tools/test_crew_cap.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({
  district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } },
});
g.clans.addClan('player', { name: 'Player' });
g.clans.addClan('shinobi', { name: 'Shinobi', kind: 'ninja', bot: true });
const R = g.settings.units.rules;
assert.equal(R.maxBonusSlots, undefined); assert.equal(R.maxCrew, 20);
g.state.season ||= {}; g.state.season.day = 1;
const base = R.baseCap;
// every business in town: its 20 slots, up to the ceiling
for (const b of Object.values(g.state.businesses)) if (!b.hideout) b.owner = 'player';
assert.equal(g.clans.crewCap('player'), R.maxCrew, 'property slots stop at the ceiling');
g.state.clans.shinobi.renown = 5000;
assert.equal(g.clans.crewCap('shinobi'), R.maxCrew, 'Renown slots stop at the ceiling');
g.state.clans.shinobi.renown = 3 * R.renownPerCrew;
assert.equal(g.clans.crewCap('shinobi'), base + 3, 'small Renown bonus unchanged');
g.state.season.day = 30;
assert.equal(g.clans.crewCap('player'), R.maxCrew, 'never above maxCrew');
console.log('crew cap ok');
