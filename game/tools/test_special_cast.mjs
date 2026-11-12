// War checkpoint 7-1: special abilities cast by the player and the auto switch (sim/special_cast.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { SPECIALS, specialOf, specialView, specialCommand, CAST_WAIT_TICKS } from '../src/sim/special_cast.js';
import { createDiversion, DIVERSION } from '../src/sim/diversion.js';
import { RIFLE } from '../src/sim/rifleman.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const fresh = clan => {
  const units = read('data/units.json');
  for (const t of Object.values(units.types)) { t.dodgeChance = 0; t.critChance = 0; }
  const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'), parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units, settings: { ...read('data/settings.json') } });
  const { heroId } = setupMatch(g, { clan, difficulty: 'easy', bots: read('data/bots.json') });
  const st = g.state, hero = st.entities[heroId], me = hero.owner;
  for (const e of Object.values(st.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; if (e.type === 'hero') e.x += 80; }
  const sector = st.deployment.sectors[0];
  return { g, st, units, hero, me, ax: sector.anchor.x, az: sector.anchor.z, group: sector.id };
};
const cast = (f, ability, ids, extra = {}) => f.g.step([{ id: f.hero.id, type: 'special', ability, units: ids, ...extra }]);

// ---- which unit has which ability ----------------------------------------------------------------
{ const units = read('data/units.json'), of = type => specialOf(units, { type });
  assert.equal(of('shinobi_geisha'), 'charm'); assert.equal(of('kuroda_rifleman'), 'aimed'); assert.equal(of('yakuza_enforcer'), 'taunt'); assert.equal(of('archer'), 'hamstring');
  for (const t of ['thug', 'swordsman', 'army_archer', 'army_rifleman', 'war_enforcer', 'hero']) assert.equal(of(t), null, `${t} has no special`);
  assert.ok(Object.values(SPECIALS).every(s => s.name && typeof s.targeted === 'boolean')); }

// ---- Taunt (instant) and the slowing arrow (rides on the next shot): Yakuza -----------------------------
{ const f = fresh('yakuza'), { g, st, me, ax, az, group } = f;
  const rival = Object.keys(st.clans).find(id => id !== me && st.clans[id].faction === 'kuroda');
  const mk = (type, model, dx, dz, extra = {}) => st.entities[g.spawn(type, model, ax + dx, az + dz, { owner: me, deployment: { group }, order: { kind: 'stop' }, ...extra })];
  const big1 = mk('yakuza_enforcer', 'enforcer', 0, 0), big2 = mk('yakuza_enforcer', 'enforcer', 1, 0), thug = mk('thug', 'thug', 0, 2, { holdFire: true });
  const foe = st.entities[g.spawn('thug', 'thug', ax + 3, az, { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
  const ids = [big1.id, big2.id, thug.id];
  // auto off: nobody taunts on his own
  cast(f, 'taunt', ids, { auto: false });
  assert.equal(big1.autoCast, false); assert.equal(big2.autoCast, false); assert.equal(thug.autoCast, undefined, 'only units with the ability take the switch');
  for (let i = 0; i < 30; i++) g.step();
  assert.ok(!foe.taunted && !big1.taunt, 'auto off: no taunt on his own');
  { const v = specialView({ state: st, units: f.units }, 'taunt', ids); assert.deepEqual(v, { have: 2, ready: 2, auto: 0, nextReadyAt: 0 }); }
  // the player asks: it happens, with auto still off; the second enforcer finds the enemy already taunted and keeps his cooldown
  // one press, one caster (Tim 2026-11-12): the ready one nearest the pointer
  cast(f, 'taunt', ids, { x: big2.x + 0.2, z: big2.z });
  assert.ok(!big1.castReq && !big1.taunt, 'one press asks one unit: the nearest to the pointer');
  for (let i = 0; i < 3 && !foe.taunted; i++) g.step();
  assert.equal(foe.taunted?.source, big2.id, 'an asked-for taunt lands with auto off, from the asked unit');
  const used = [big1, big2].filter(b => b.taunt?.readyAt > st.tick);
  assert.deepEqual(used, [big2], 'only the asked one spent his cooldown');
  // a second press takes the next ready one; the enemy is already taunted, so he keeps his cooldown
  cast(f, 'taunt', ids, { x: big2.x, z: big2.z });
  assert.ok(big1.castReq?.until >= st.tick, 'the next press asks the next ready unit');
  for (let i = 0; i < 5; i++) g.step();
  assert.ok(!(big1.taunt?.readyAt > st.tick), 'nobody left to taunt: no cooldown spent');
  { const v = specialView({ state: st, units: f.units }, 'taunt', ids); assert.equal(v.ready, 1); assert.equal(v.have, 2); }
  for (let i = 0; i < CAST_WAIT_TICKS + 5; i++) g.step();
  assert.ok([big1, big2].every(b => !b.castReq || b.castReq.until <= st.tick), 'an unused request lapses');
  // all on cooldown: the view gives the shortest time left
  for (const b of [big1, big2]) b.taunt = { readyAt: st.tick + (b === big1 ? 100 : 40) };
  { const v = specialView({ state: st, units: f.units }, 'taunt', ids); assert.equal(v.ready, 0); assert.equal(v.nextReadyAt, st.tick + 40, 'shortest cooldown of the group'); }
  cast(f, 'taunt', ids); assert.ok([big1, big2].every(b => !(b.castReq?.until > st.tick)), 'a unit on cooldown does not queue a cast');
  cast(f, 'taunt', ids, { auto: true }); assert.equal(big1.autoCast, undefined, 'auto back on');
  // someone else's hero cannot order them
  { const other = Object.values(st.entities).find(e => e.type === 'hero' && e.owner !== me);
    assert.equal(specialCommand({ state: st, units: f.units }, other, { ability: 'taunt', units: ids, auto: false }), 0); assert.equal(big1.autoCast, undefined); }

  // the Yumi archer's slowing arrow
  const yumi = mk('archer', 'archer', -4, 0), far = st.entities[g.spawn('thug', 'thug', ax - 4, az + 6, { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
  cast(f, 'hamstring', [yumi.id], { auto: false });
  yumi.holdFire = false; yumi.order = { kind: 'attack', target: far.id };
  let slowed = false; for (let i = 0; i < 120 && !slowed; i++) { g.step(); slowed ||= !!far.buffs?.snared?.hamstring; }
  assert.ok(!slowed && far.hp < far.maxHp, 'auto off: plain arrows, no slowing arrow');
  cast(f, 'hamstring', [yumi.id], { x: far.x, z: far.z });
  assert.equal(yumi.order?.target, far.id, 'she is sent at the enemy nearest the spot');
  for (let i = 0; i < 120 && !slowed; i++) { g.step(); slowed ||= !!far.buffs?.snared?.hamstring; }
  assert.ok(slowed, 'the asked-for slowing arrow lands'); assert.ok(!yumi.castReq, 'and the request is used up');
  assert.doesNotThrow(() => JSON.stringify(st)); }

// ---- Aimed Shot: Kuroda; asked-for shots spread over the enemies near the spot ------------------------------
{ const f = fresh('kuroda'), { g, st, me, ax, az, group } = f, R = { ...RIFLE, ...f.units.types.kuroda_rifleman.rifle };
  const rival = Object.keys(st.clans).find(id => id !== me && st.clans[id].kind !== 'ninja');
  const r1 = st.entities[g.spawn('kuroda_rifleman', 'mercenary', ax, az, { owner: me, deployment: { group }, order: { kind: 'stop' } })];
  const r2 = st.entities[g.spawn('kuroda_rifleman', 'mercenary', ax, az + 1, { owner: me, deployment: { group }, order: { kind: 'stop' } })];
  const foe = dz => st.entities[g.spawn('thug', 'thug', ax + 6, az + dz, { owner: rival, deployment: { group: 'hero' }, order: { kind: 'stop' }, holdFire: true })];
  cast(f, 'aimed', [r1.id, r2.id], { auto: false });
  const a = foe(0), b = foe(-1.2);
  for (let i = 0; i < 40; i++) g.step();
  assert.ok(!r1.rifle?.aim && !r2.rifle?.aim && a.hp === a.maxHp && b.hp === b.maxHp, 'auto off: no shot on their own');
  // two presses at the same spot: two riflemen, and the second takes another target near it
  cast(f, 'aimed', [r1.id, r2.id], { x: a.x, z: a.z });
  assert.equal([r1, r2].filter(r => r.castReq?.until > st.tick || r.rifle?.aim).length, 1, 'one press, one rifleman');
  g.step(); cast(f, 'aimed', [r1.id, r2.id], { x: a.x, z: a.z });
  let aims = new Set(); for (let i = 0; i < 6; i++) { g.step(); for (const r of [r1, r2]) if (r.rifle?.aim) aims.add(r.rifle.aim.target); }
  assert.deepEqual([...aims].sort(), [a.id, b.id].sort(), 'two riflemen, two targets');
  for (let i = 0; i < R.aimTicks + 4; i++) g.step();
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both shots land');
  { const v = specialView({ state: st, units: f.units }, 'aimed', [r1.id, r2.id]); assert.equal(v.ready, 0); assert.ok(v.nextReadyAt > st.tick); } }

// ---- Charm: an asked-for charm takes the valid enemy nearest the spot, also with auto off ------------------
{ const a = { id: 'a', type: 'shinobi_geisha', owner: 'p', x: 0, z: 0, place: 'street', deployment: { group: 'hero' }, order: { kind: 'stop' } };
  const state = { tick: 100, entities: { a }, clans: { p: {}, q: {} }, casts: [] };
  const enemy = (id, x) => state.entities[id] = { id, type: 'thug', owner: 'q', x, z: 0, place: 'street', order: { kind: 'stop' } };
  const d = createDiversion({ state, deployment: { canOccupy: () => true }, vision: { canSee: () => true }, reveal() {}, clearCombat() {}, hostile: (x, y) => x.owner !== y.owner });
  const near = enemy('near', 2), far = enemy('far', 5);
  a.autoCast = false;
  assert.equal(d.step(a, {}), false); assert.equal(a.lure, undefined, 'auto off: no charm on her own');
  a.castReq = { x: 5, z: 0, until: state.tick + CAST_WAIT_TICKS };
  assert.equal(d.step(a, {}), true); assert.equal(a.lure.target, far.id, 'the enemy nearest the spot, not the nearest to her'); assert.equal(a.castReq, undefined);
  assert.equal(a.lure.readyAt, state.tick + DIVERSION.cooldownTicks); assert.ok(near && !near.buffs?.charmSnare); }
console.log('test_special_cast: ok');
