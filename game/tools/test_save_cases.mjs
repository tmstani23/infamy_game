// Any-time saves mid-action (frontier F1.4): mid-contract, mid-Shakedown, mid-raid.
// Each case saves, loads into a fresh game and runs 600 ticks beside the original: no error,
// and the two games stay identical (so nothing is left half-finished). About 30 s.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const base = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json') });
const run = (m, n) => { for (let i = 0; i < n; i++) m.game.step(m.bots.flatMap(b => b.tick())); };
function check(name, options, m, ticks = 600) {
  const save = JSON.parse(JSON.stringify(makeSave(m.game, { bots: m.bots })));
  const game = createGame(options), copy = { game, bots: loadSave(game, save) };
  assert.equal(JSON.stringify(copy.game.state), JSON.stringify(m.game.state), `${name}: same right after load`);
  run(m, ticks); run(copy, ticks);
  assert.equal(JSON.stringify(copy.game.state), JSON.stringify(m.game.state), `${name}: same after ${ticks} ticks`);
  console.log(`${name}: ok`);
}

{ // mid-contract, full match with bots
  const options = base(), game = createGame(options);
  const r = setupMatch(game, { clan: 'yakuza', difficulty: 'medium', bots: data('data/bots.json'), test: {} });
  game.civilians.populate();
  const m = { game, bots: makeBots(game, r.rivals) };
  let n = 0;
  while (!Object.values(game.state.contracts?.active || {}).some(Boolean) && n++ < 4000) run(m, 1);
  assert.ok(n < 4000, 'a contract started');
  run(m, 100);
  check('mid-contract', options, m);
}

{ // mid-Shakedown (setup as in test_shakedown.mjs)
  const options = base(), g = createGame(options);
  const { heroId } = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', bots: data('data/bots.json') });
  const rival = Object.keys(g.state.clans).find(id => id !== 'player' && g.state.clans[id].kind !== 'ninja');
  const b = Object.values(g.state.businesses).find(b => b.kind === 'shop' && b.room);
  g.clans.setOwner(b.id, rival);
  const sector = g.deployment.sectorAt(...b.ring), task = g.state.deployment.clans.player.sectors[sector];
  task.objective = { x: b.ring[0], z: b.ring[1] };
  for (let i = 0; i < 3; i++) { const p = g.nav.nearestFree(b.ring[0] + i * .6, b.ring[1]); g.spawn('thug', 'thug', ...p, { owner: 'player', deployment: { group: sector }, order: { kind: 'stop' } }); }
  g.state.night = true;
  g.step([{ id: heroId, type: 'deployment', sector, action: 'shakedown', business: b.id }]);
  assert.ok(task.operation, 'Shakedown started');
  const m = { game: g, bots: [] };
  run(m, 200);
  assert.ok(task.operation, 'still mid-Shakedown');
  check('mid-Shakedown', options, m);
}

{ // mid-raid (setup as in test_raid.mjs)
  const options = { ...base(), settings: { ...data('data/settings.json'), dayNight: { auto: false } } }, g = createGame(options);
  g.clans.addClan('player', { name: 'Your clan' });
  g.clans.addClan('kuroda', { name: 'Kuroda clan', bot: true });
  const biz = k => Object.values(g.state.businesses).find(b => b.kind === k), den = biz('gambling_den');
  g.clans.setOwner(den.id, 'kuroda');
  g.step();
  const hero = g.spawn('hero', 'ronin', den.ring[0], den.ring[1], { owner: 'player' });
  for (let i = 0; i < 3; i++) g.spawn('thug', 'thug', den.ring[0] + i * 0.5, den.ring[1] + 0.5, { owner: 'player', order: { kind: 'follow', target: hero } });
  g.state.clans.player.lanterns = 1;
  g.step([{ type: 'time', night: true }]);
  g.step([{ id: hero, type: 'business', action: 'raid', business: den.id }]);
  assert.equal(g.state.attacks[den.id]?.mode, 'raid', 'raid started');
  const m = { game: g, bots: [] };
  run(m, 300);
  assert.ok(g.state.attacks[den.id], 'still mid-raid');
  check('mid-raid', options, m);
}
console.log('test_save_cases: ok');
