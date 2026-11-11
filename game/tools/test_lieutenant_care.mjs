// Crew care by the lieutenant (Tim 2026-11-10): while the boss is out on the island the city captain bails jailed
// crew out at the police HQ and fetches recovered patients at the clinic, under the Hire order, inside the day's
// budget. Freed crew go back to their own group, never after the absent boss. The same for a rival clan.
// Run from the repo root: node game/tools/test_lieutenant_care.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots } from '../src/sim/save.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: data('data/frontier.json') });
const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 }, seed: 9 });
const brains = makeBots(g, m.rivals), L = g.lieutenant, U = g.settings.units.types;
const brainOf = id => brains.find(b => b.config?.lieutenant && b.config.clan === id);
const gate = g.doors.find(d => d.gate && d.place === 'world');
const heroOf = id => Object.values(g.state.entities).find(e => e.owner === id && e.type === 'hero');
const run = (brain, n, until = () => false) => { const sent = []; for (let i = 0; i < n && !until(); i++) { const out = brain.tick(); sent.push(...out); g.step(out); } return sent; };

function scenario(id, leave) {
  const clan = g.state.clans[id], hero = heroOf(id), mine = brainOf(id), r = L.record(id);
  assert.ok(mine, `${id} has a lieutenant brain`);
  leave(hero);
  assert.equal(hero.place, 'world', `${id} boss is out`);
  run(mine, 5);
  const cap = L.captainOf(id);
  assert.ok(cap, `${id} captain in charge`);
  for (const o of Object.keys(r.orders)) r.orders[o] = o === 'hire';   // only Hire: nothing else to distract him
  clan.ryo = 5000; r.budget = 2000; r.spent = 0;
  const price = U.thug.price, before = g.clans.crewOf(id).length;
  clan.jail = [{ id: 'jt1', unit: 'thug', model: U.thug.sprite, bail: Math.round(price * 0.5) }];
  clan.clinic.push({ unit: 'thug', model: U.thug.sprite, kind: 'recover', left: 0, cost: Math.round(price * 0.25) });
  // Hire off: nobody is freed
  r.orders.hire = false;
  run(mine, 200);
  assert.equal(clan.jail.length, 1, `${id}: Hire off leaves the prisoner`);
  r.orders.hire = true;
  const ryo0 = clan.ryo;
  const sent = run(mine, 4000, () => !clan.jail.length && !clan.clinic.some(p => p.kind === 'recover'));
  assert.equal(clan.jail.length, 0, `${id}: the captain bailed the prisoner out (${clan.notice?.text})`);
  assert.ok(!clan.clinic.some(p => p.kind === 'recover'), `${id}: the captain fetched the patient`);
  assert.ok(sent.some(c => c.type === 'police' && c.action === 'bail' && c.id === cap.id && c.by === 'lieutenant'), 'the captain sent the bail');
  assert.ok(sent.some(c => c.type === 'clinic' && c.action === 'revive' && c.id === cap.id), 'the captain sent the revive');
  assert.ok(g.clans.crewOf(id).length >= before + 2, `${id}: both are back on the roster`);
  assert.ok(r.spent >= Math.round(price * 0.5) + Math.round(price * 0.25), `${id}: booked against the budget (${r.spent})`);
  assert.ok(clan.ryo < ryo0, 'ryo paid');
  assert.ok(r.log.some(x => /Bailed out/.test(x.text)) && r.log.some(x => /from the clinic/.test(x.text)), 'both in the lieutenant log');
  const crew = g.clans.crewOf(id);
  assert.ok(!crew.some(u => u.order?.kind === 'follow' && u.order.target === hero.id && u.place !== 'world'), `${id}: nobody freed runs after the absent boss`);
  assert.equal(L.captainOf(id)?.place === 'world', false, 'the captain stays in the city');
  // over the budget: stays in jail
  clan.jail = [{ id: 'jt2', unit: 'thug', model: U.thug.sprite, bail: 99999 }];
  run(mine, 300);
  assert.equal(clan.jail.length, 1, `${id}: bail over the budget is left`);
  clan.jail = [];
}

// the player: the boss walks out through the gate
scenario('player', hero => { g.state.clans.player.permit = true; Object.assign(hero, { place: 'street', x: gate.x, z: gate.z }); g.step([{ id: hero.id, type: 'expedition', action: 'walk', units: [] }]); });
// a rival: its boss is put out on the island (its own bot brain is not run here)
const rival = Object.keys(g.state.clans).find(id => id !== 'player' && g.state.clans[id].bot && g.state.clans[id].kind !== 'ninja' && brainOf(id) && heroOf(id));
assert.ok(rival, 'a rival clan with a lieutenant');
scenario(rival, hero => { Object.assign(hero, { place: 'world' }); g.step([]); });
console.log('test_lieutenant_care: ok');
