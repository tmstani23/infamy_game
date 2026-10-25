// Crew supply physical presence for services; recruiting still needs the hero inside.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createClinicMenu } from '../src/clinic_menu.js';
import { createPoliceMenu } from '../src/police_menu.js';
import { createContractMenu } from '../src/contract_menu.js';
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
function setup(ninja = false) {
  const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
  g.clans.addClan('player', { kind: ninja ? 'ninja' : 'yakuza', ryo: 10000 });
  g.clans.addClan('kuroda');
  const home = Object.values(g.state.businesses).find(b => b.hideout === 'player'), room = g.rooms.find(r => r.name === home.room);
  const hero = g.spawn('hero', ninja ? 'ninja_leader' : 'ronin', room.spawn.x, room.spawn.z, { owner: 'player', place: room.name });
  const unit = g.spawn(ninja ? 'ninja' : 'thug', ninja ? 'ninja_grunt' : 'thug', 0, 1, { owner: 'player', order: { kind: 'stop' } });
  const S = g.state.entities, c = g.state.clans.player;
  const at = menu => { const d = g.doors.find(d => d.menu === menu); Object.assign(S[unit], { x: d.x, z: d.z, place: 'street' }); return d; };
  return { g, hero, unit, S, c, at };
}
const panel = () => ({ hidden: true, innerHTML: '', addEventListener() {} });
{
  const { g, hero, unit, S, c, at } = setup();
  S[hero].hp = 100; S[unit].hp = 50;
  at('clinic');
  const root = panel(), sent = [];
  const menu = createClinicMenu({ panel: root, game: g, heroId: hero, selected: () => [unit], send: c => sent.push(c) });
  menu.toggle(); assert.ok(menu.isOpen() && !root.hidden, 'crew at clinic opens the real menu');
  menu.pick(0); assert.equal(sent[0].id, unit);
  g.step(sent.splice(0));
  assert.equal(S[unit].hp, S[unit].maxHp, 'crew heal through the menu');
  assert.ok(S[hero].hp < 101, 'distant hero is not remotely healed');
  c.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 0, cost: 15 });
  menu.pick(1); g.step(sent.splice(0));
  assert.equal(c.clinic.length, 0);
  const revived = Object.values(S).find(e => e.owner === 'player' && e.type === 'thug' && e.id !== unit);
  assert.equal(revived.order, undefined, 'revived player crew holds until explicitly ordered');
  Object.assign(S[unit], { x: 0, z: 1 }); Object.assign(revived, { x: 1, z: 1 });
  menu.update(); assert.ok(!menu.isOpen(), 'menu closes when all own units leave the clinic');
  const money = c.ryo;
  c.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 0, cost: 15 });
  g.step([{ id: hero, type: 'clinic', action: 'revive', patient: 0 }]);
  assert.equal(c.ryo, money, 'no remote action without any physical representative');
}
{
  const { g, hero, unit, S, c, at } = setup();
  const root = panel(), sent = [];
  const menu = createPoliceMenu({ panel: root, game: g, heroId: hero, selected: () => [unit], send: c => sent.push(c) });
  at('police_box'); c.heat = 30;
  menu.toggle('police_box'); menu.pick(0); g.step(sent.splice(0));
  assert.ok(c.heat < 30, 'crew pays clan bribe');
  menu.close(); at('police_hq');
  c.jail = [{ unit: 'thug', model: 'thug', bail: 50 }];
  menu.toggle('police_hq'); menu.pick(0); g.step(sent.splice(0));
  assert.equal(c.jail.length, 0, 'crew pays bail');
  const freed = Object.values(S).find(e => e.owner === 'player' && e.type === 'thug' && e.id !== unit);
  assert.equal(freed.order.target, hero);
}
{
  const { g, hero, unit, at } = setup(true);
  at('contracts'); g.step();
  const root = panel(), sent = [];
  const menu = createContractMenu({ panel: root, tracker: panel(), game: g, heroId: hero, selected: () => [unit], send: c => sent.push(c) });
  menu.toggle(); menu.pick(0); g.step(sent.splice(0));
  assert.ok(g.state.contracts.active.player, 'ninja crew takes a shrine contract');
  menu.pick(0); g.step(sent.splice(0));
  assert.equal(g.state.contracts.active.player, undefined, 'ninja crew cancels the job');
}
{
  const { g, hero, unit, S, c } = setup();
  const shop = Object.values(g.state.businesses).find(b => b.kind === 'shop');
  Object.assign(S[unit], { x: shop.ring[0], z: shop.ring[1] });
  assert.ok(g.businesses.canBuy(hero, shop.id).ok, 'building panel accepts own crew presence');
  const before = c.ryo;
  g.step([{ id: hero, type: 'business', action: 'buy', business: shop.id }]);
  assert.equal(shop.owner, 'player'); assert.equal(before - c.ryo, 400);
  const lender = Object.values(g.state.businesses).find(b => b.kind === 'moneylender');
  Object.assign(S[unit], { x: lender.ring[0], z: lender.ring[1] });
  g.step([{ id: hero, type: 'business', action: 'lantern', business: lender.id }]);
  assert.equal(c.lanterns, 1, 'crew buys a War Lantern');
  const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse'), room = g.rooms.find(r => r.name === tea.room);
  Object.assign(S[unit], { place: room.name, x: room.spawn.x, z: room.spawn.z });
  g.step([{ id: unit, type: 'hire', business: tea.id, unit: 'thug' }]);
  assert.equal(c.queue.length, 0, 'crew inside cannot recruit');
  g.step([{ id: hero, type: 'hire', business: tea.id, unit: 'thug' }]);
  assert.equal(c.queue.length, 0, 'distant hero cannot recruit through crew');
  Object.assign(S[hero], { place: room.name, x: room.spawn.x, z: room.spawn.z });
  g.step([{ id: hero, type: 'hire', business: tea.id, unit: 'thug' }]);
  assert.equal(c.queue.length, 1, 'hero inside can still recruit');
}
{
  const { g, hero, unit, S, at } = setup();
  at('clinic'); S[unit].downed = true;
  assert.equal(g.serviceAt(hero, 'clinic'), null, 'downed crew cannot provide presence');
  S[unit].downed = false; S[unit].guard = 'house';
  assert.equal(g.serviceAt(hero, 'clinic'), null, 'house guards cannot provide presence');
  delete S[unit].guard; S[unit].owner = 'kuroda';
  assert.equal(g.serviceAt(hero, 'clinic'), null, 'enemy crew cannot provide presence');
}
console.log('crew clinic UI/heal/revive, police bribe/bail, contracts, purchases, recruitment exception and presence validation ok');
