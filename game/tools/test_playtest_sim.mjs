// Bounded integration run: actual town navigation, rival bots, deployment,
// combat and a full Rally expiry. No browser or rendering dependencies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createBot } from '../src/sim/bot.js';
import { createNinjaBot } from '../src/sim/ninja_bot.js';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const bots = read('data/bots.json');
for (const clan of ['yakuza', 'kuroda', 'shinobi']) {
  const game = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'),
    cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'),
    parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'),
    units: read('data/units.json'), civilians: read('data/civilians.json'),
    bandits: read('data/bandits.json'), police: read('data/police.json'), settings: read('data/settings.json') });
  const { heroId, rivals } = setupMatch(game, { clan, difficulty: 'medium', bots, test: { playerRyo: 3000 } });
  game.civilians.populate();
  const brains = rivals.map(r => (r.kind === 'ninja' ? createNinjaBot : createBot)(game, r));
  const state = game.state;
  // Extra test crew exercise every sector without waiting for an economy grind.
  // Destinations and spawns are valid nav cells; orders still use the real sim.
  const assigned = [];
  for (const sector of state.deployment.sectors) {
    const unitType = clan === 'shinobi' ? 'ninja' : 'thug';
    const model = clan === 'shinobi' ? 'ninja_grunt' : 'thug';
    const nav = game.deployment.navFor({ owner: 'player', place: 'street', deployment: { group: sector.id } });
    const point = nav.nearestFree(sector.anchor.x, sector.anchor.z);
    for (let n = 0; n < 2; n++) assigned.push(game.spawn(unitType, model, ...point,
      { owner: 'player', deployment: { group: sector.id } }));
  }
  let rallyStarted = false, rallyEnded = false, transfersStarted = 0, nightReached = false;
  const command = c => ({ id: heroId, type: 'deployment', ...c });
  for (let tick = 0; tick < 260 * 20; tick++) {
    const commands = brains.flatMap(b => b.tick());
    if (tick === 0) for (const sector of state.deployment.sectors) commands.push(command({ action: 'assignment',
      sector: sector.id, task: clan === 'shinobi' ? 'ambush' : 'patrol', objective: sector.anchor }));
    // Initiate one real trip before Rally, then exercise its expiry and return.
    if (tick === 20) commands.push(command({ action: 'transfer', units: [assigned[0]], to: state.deployment.sectors[1].id }));
    if (tick === 30 * 20) commands.push(command({ action: 'rally' }));
    if (tick === 31 * 20) commands.push({ id: heroId, type: 'order', kind: 'follow', units: assigned.filter(id => {
      const e = state.entities[id]; return e && !e.dead && !e.downed && game.rally.participating(e);
    }) });
    game.step(commands);
    if (tick === 20) transfersStarted += Number(!!state.entities[assigned[0]]?.deployment.transfer);
    rallyStarted ||= game.rally.status('player').active;
    if (rallyStarted && !game.rally.status('player').active) rallyEnded = true;
    nightReached ||= state.night;
    if (tick % 20 === 0) {
      const counts = game.deployment.counts('player');
      assert.ok(counts.hero <= 6, `${clan}: permanent hero membership exceeded six`);
      for (const e of Object.values(state.entities)) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.z), `${clan}: invalid position ${e.id}`);
        assert.ok(Number.isFinite(e.hp) && Number.isFinite(e.maxHp), `${clan}: invalid health ${e.id}`);
        if (e.deployment?.transfer && !game.rally.participating(e)) {
          assert.ok(!state.hits.some(hit => hit.a === e.id), `${clan}: transferee attacked`);
        }
      }
      for (const task of Object.values(state.deployment.clans.player.sectors)) {
        assert.ok(task.task && task.task !== 'extraction', `${clan}: sector lost its supported duty`);
      }
    }
  }
  assert.equal(transfersStarted, 1, `${clan}: integration transfer never initiated`);
  assert.ok(rallyStarted && rallyEnded, `${clan}: full Rally lifecycle was not exercised`);
  assert.ok(nightReached, `${clan}: automatic day/night transition was not exercised`);
  assert.doesNotThrow(() => JSON.stringify(state), `${clan}: state serialization`);
  console.log(`${clan}: 260 seconds with both rival bots, four staffed sectors, transfer, Rally expiry and night transition passed`);
}
