// Sector cleared bonus (sim/rewards.js sectorTick, Tim 2026-10-29): node game/tools/test_sector_clear.mjs
import assert from 'node:assert/strict';
import { createRewards } from '../src/sim/rewards.js';

const unit = (id, owner, x) => ({ id, owner, type: 'thug', maxHp: 100, hp: 100, x, z: 0, place: 'street' });
const state = { tick: 0, news: [], ryoGains: [], casts: [], clans: { a: { id: 'a', ryo: 0 }, b: { id: 'b', ryo: 0 } },
  entities: { a1: unit('a1', 'a', 1), a2: unit('a2', 'a', 2), b1: unit('b1', 'b', 3), b2: unit('b2', 'b', 4) } };
const rewards = createRewards(state, { sectorClearBonus: 200, sectorClearCooldownSeconds: 180 });
const at = x => x < 50 ? 'west' : 'east';
rewards.sectorTick(at);
assert.equal(state.clans.a.ryo, 0, 'no bonus while both clans stand there');
state.entities.b1.downed = true; state.entities.b2.dead = true; state.tick += 20;
rewards.sectorTick(at);
assert.equal(state.clans.a.ryo, 200, 'clearing two rivals out of the sector pays');
assert.equal(state.clans.b.ryo, 0);
// cooldown: a second clear of the same sector right away does not pay again
state.entities.b1.downed = false; state.entities.b2.dead = false; state.tick += 20; rewards.sectorTick(at);
state.entities.b1.x = state.entities.b2.x = 99; state.tick += 20; rewards.sectorTick(at);
assert.equal(state.clans.a.ryo, 200, 'one claim per sector per cooldown');
// a single passer-by is not a full clear
state.tick += 20 * 200; state.entities.b1.x = 5; rewards.sectorTick(at);
state.entities.b1.x = 99; state.tick += 20; rewards.sectorTick(at);
assert.equal(state.clans.a.ryo, 200, 'one rival unit leaving is not a clear');
console.log('sector clear bonus ok');
// A clear during Sweep contributes 200; completing that same attempt adds only 300.
{
  const s={tick:0,news:[],ryoGains:[],casts:[],clans:{a:{id:'a',ryo:0},b:{id:'b',ryo:0}},
    entities:{a:unit('a','a',1),b:unit('b','b',2),c:unit('c','b',3)}};
  const r=createRewards(s),baseline=r.sectorClaim('a','west').sequence;
  r.sectorTick(at);s.entities.b.dead=s.entities.c.dead=true;s.tick=20;r.sectorTick(at);
  assert.equal(s.clans.a.ryo,200);
  assert.equal(r.claimSweep('a','west',baseline),300);assert.equal(s.clans.a.ryo,500);
  assert.equal(r.claimSweep('a','west',baseline),0,'no repeated top-up');
  assert.equal(r.claimSweep('a','west',r.sectorClaim('a','west').sequence),0,'next attempt shares cooldown');
  s.tick+=3600;assert.equal(r.claimSweep('a','west',r.sectorClaim('a','west').sequence),500);
  s.entities.b.dead=s.entities.c.dead=false;r.sectorTick(at);s.entities.b.dead=s.entities.c.dead=true;r.sectorTick(at);
  assert.equal(s.clans.a.ryo,1000,'generic clear cannot add another 200 after Sweep');
}
