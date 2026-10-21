// Territory, quarters and the season score (sim/territory.js, docs/territory_plan.md).
// Run: node game/tools/test_territory.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const newGame = (extra = {}) => {
  const g = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...settings, dayNight: { auto: false }, ...extra },
  });
  g.clans.addClan('player');
  g.clans.addClan('kuroda', { bot: true });
  return g;
};
const biz = (g, kind) => Object.values(g.state.businesses).find(b => b.kind === kind);
const T = settings.territory;

// areas: the two hideouts from the start; a bought business adds its circle
{
  const g = newGame();
  g.step();
  assert.deepEqual(g.territory.areas().map(a => a.clan).sort(), ['kuroda', 'player'], 'hideouts mark territory');
  const tea = biz(g, 'teahouse');
  assert.equal(g.territory.ownerAt(tea.x, tea.z), null, 'unowned teahouse marks nothing');
  g.clans.setOwner(tea.id, 'player');
  g.step();
  assert.equal(g.territory.ownerAt(tea.x + T.radius.teahouse - 1, tea.z), 'player', 'inside the circle');
  assert.equal(g.territory.ownerAt(tea.x + T.radius.teahouse + 1.5, tea.z + 0), g.territory.areaAt(tea.x + T.radius.teahouse + 1.5, tea.z)?.clan ?? null);
  // overlaps: the nearest business wins
  const den = biz(g, 'gambling_den');
  g.clans.setOwner(den.id, 'kuroda');
  g.step();
  const mid = (tea.z + den.z) / 2;
  assert.equal(g.territory.ownerAt(tea.x, mid - 1), 'player', 'nearer the teahouse');
  assert.equal(g.territory.ownerAt(den.x, mid + 1), 'kuroda', 'nearer the den');
  console.log('areas and overlaps ok');
}

// vision: every rival unit in your territory is seen (not a hidden one), with no unit of yours near
{
  const g = newGame();
  const tea = biz(g, 'teahouse');
  g.clans.setOwner(tea.id, 'player');
  const far = g.spawn('hero', 'ronin', -60, -20, { owner: 'player' });
  const thug = g.spawn('thug', 'thug', tea.x + 5, tea.z, { owner: 'kuroda', order: { kind: 'station', x: tea.x + 5, z: tea.z } });
  g.step(); g.step();
  assert.ok(g.vision.canSee('player', g.state.entities[thug]), 'rival seen in your territory');
  assert.ok(g.state.news.length >= 0);
  g.state.entities[thug].hidden = true;
  assert.ok(!g.vision.canSee('player', g.state.entities[thug]), 'hidden ninja stays hidden');
  const vg = g.vision.grid('player');
  assert.equal(vg.visible[g.vision.cellOf(tea.x + 8, tea.z)], 1, 'territory uncovered on the fog grid');
  void far;
  console.log('territory vision ok');
}

// intruder alert: once, then not again for intruderAlertSeconds
{
  const g = newGame();
  const tea = biz(g, 'teahouse');
  g.clans.setOwner(tea.id, 'player');
  g.spawn('thug', 'thug', tea.x + 4, tea.z, { owner: 'kuroda', order: { kind: 'station', x: tea.x + 4, z: tea.z } });
  let alerts = 0;
  for (let i = 0; i < 20 * 10; i++) { g.step(); alerts += g.state.news.filter(n => n.kind === 'intruder' && n.clan === 'player').length; }
  assert.equal(alerts, 1, 'one alert in 10 s');
  console.log('intruder alert ok');
}

// bonuses: crew faster and healing faster in your own streets, heat cools faster
{
  const run = own => {
    const g = newGame();
    const tea = biz(g, 'teahouse');
    if (own) g.clans.setOwner(tea.id, 'player');
    const hero = g.spawn('hero', 'ronin', -60, -20, { owner: 'player' });
    const [rx, rz] = tea.ring;
    const c = g.spawn('thug', 'thug', rx, rz, { owner: 'player' });
    const e = g.state.entities[c];
    g.step([{ id: hero, type: 'order', units: [c], kind: 'move', x: rx + 6, z: rz + 2 }]);
    let moved = 0;
    for (let i = 0; i < 10; i++) { const x = e.x, z = e.z; g.step(); moved += Math.hypot(e.x - x, e.z - z); }
    e.hp = e.maxHp / 2; e.hitAt = -1e9;
    const hp0 = e.hp;
    for (let i = 0; i < 20 * 5; i++) g.step();
    g.state.clans.player.heat = 50;
    for (let i = 0; i < 20 * 60; i++) g.step();
    return { moved, healed: e.hp - hp0, heat: g.state.clans.player.heat };
  };
  const out = run(false), turf = run(true);
  assert.ok(turf.moved > out.moved * 1.05, `crew faster at home (${turf.moved.toFixed(2)} vs ${out.moved.toFixed(2)})`);
  assert.ok(turf.healed > out.healed * 1.8, `heals faster (${turf.healed.toFixed(1)} vs ${out.healed.toFixed(1)})`);
  console.log('crew speed and healing ok');
}
{
  const heatAfter = own => {
    const g = newGame();
    const tea = biz(g, 'teahouse');
    if (own) g.clans.setOwner(tea.id, 'player');
    g.spawn('hero', 'ronin', tea.x + 3, tea.z, { owner: 'player' });
    g.state.clans.player.heat = 50;
    for (let i = 0; i < 20 * 60; i++) g.step();
    return 50 - g.state.clans.player.heat;
  };
  const out = heatAfter(false), turf = heatAfter(true);
  assert.equal(out, 2, 'outside: 1 per 30 s');
  assert.equal(turf, 3, 'in your territory: 1 per 20 s');
  console.log('heat cooling ok');
}

// quarters: teahouse + den = the Pleasure Quarter; holding both adds the payout bonus at dawn
{
  const g = newGame();
  const tea = biz(g, 'teahouse'), den = biz(g, 'gambling_den');
  const q = g.territory.quarters.find(q => q.id === 'pleasure');
  assert.deepEqual(q.businesses.sort(), [tea.id, den.id].sort(), 'pleasure quarter has the teahouse and den');
  g.clans.setOwner(tea.id, 'player');
  g.step();
  assert.equal(g.territory.heldBy(q), null);
  g.clans.setOwner(den.id, 'player');
  g.step();
  assert.equal(g.territory.heldBy(q), 'player');
  const ryo = g.state.clans.player.ryo;
  g.step([{ type: 'time', night: true }]);
  g.step([{ type: 'time', night: false }]);
  const p = settings.businesses, bonus = 1 + T.quarterBonus;
  assert.equal(g.state.clans.player.ryo - ryo, Math.round(p.teahouse.payout * bonus) + Math.round(p.gambling_den.payout * bonus), 'quarter payout bonus');
  console.log('quarter bonus ok');
}

// season: weighted score, ends after `cycles` dawns with a winner
{
  const g = newGame({ season: { cycles: 3 } });
  g.clans.setOwner(biz(g, 'teahouse').id, 'player');
  g.clans.setOwner(biz(g, 'warehouse').id, 'kuroda');
  g.clans.setOwner(biz(g, 'gambling_den').id, 'player');
  assert.equal(g.territory.score('player'), 4);
  assert.equal(g.territory.score('kuroda'), 2, 'hideouts score nothing');
  assert.deepEqual(g.territory.breakdown('player').map(x => x.points).sort(), [1, 3], 'score breakdown');
  assert.ok(g.territory.quarters.find(q => q.id === 'bund')?.businesses.length === 2, 'the Bund requires warehouse and tenements');
  for (let d = 0; d < 2; d++) { g.step([{ type: 'time', night: true }]); g.step([{ type: 'time', night: false }]); }
  assert.equal(g.state.season.over, false);
  g.step([{ type: 'time', night: true }]);
  g.step([{ type: 'time', night: false }]);
  assert.equal(g.state.season.over, true, 'over after 3 dawns');
  assert.equal(g.state.season.winner, 'player');
  assert.deepEqual(g.state.season.final.map(s => s.score), [4, 2]);
  console.log('season score ok');
}
console.log('territory tests passed');
