import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { RALLY_TICKS, RALLY_COOLDOWN_TICKS } from '../src/sim/deployment_rally.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'),
  parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units: read('data/units.json'), settings: { ...read('data/settings.json'), dayNight: { auto: false } } });
const { heroId } = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', bots: read('data/bots.json') });
const h = g.state.entities[heroId], [s, other] = g.state.deployment.sectors;
for (const e of Object.values(g.state.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; }
const unit = group => g.state.entities[g.spawn('thug', 'thug', s.anchor.x, s.anchor.z, { owner: 'player', deployment: { group }, order: { kind: 'stop' } })];
const e = unit(s.id), uncalled = unit(other.id), guard = unit(s.id); guard.guard = 'b0';
const call = groups => g.step([{ id: heroId, type: 'deployment', action: 'rally', groups }]);
call(['invalid']); assert.equal(g.rally.status('player').active, false);
h.downed = true; h.hitAt = g.state.tick; call([s.id]);
const r = g.state.deployment.clans.player.rally;
assert.equal(r.active, true); assert.equal(r.endsAt - r.startedAt, RALLY_TICKS);
assert.equal(r.participants.length, 1); assert.equal(g.rally.participating(e), true);
assert.equal(g.rally.participating(guard), false); assert.equal(g.rally.participating(uncalled), false);
assert.notEqual(e.order.kind, 'follow', 'KO Rally is remote and does not call crew to the body');
assert.equal(g.deployment.canOccupy(e, other.anchor.x, other.anchor.z, 'street'), true);
assert.equal(g.deployment.canOccupy(uncalled, s.anchor.x, s.anchor.z, 'street'), false);
h.downed = false;
g.step([{ id: heroId, type: 'order', kind: 'follow', units: [e.id] }]);
assert.equal(e.order.kind, 'follow', 'explicit Follow works for Rally participants');
assert.equal(e.deployment.group, s.id, 'Rally never manufactures permanent hero membership');
const end = r.endsAt; call([other.id]); assert.equal(r.endsAt, end, 'repeated activation cannot extend active Rally');
Object.assign(e, other.anchor); const away = [e.x, e.z];
g.state.tick = end; h.hitAt = end; g.step();
assert.equal(r.active, false); assert.equal(r.readyAt, end + RALLY_COOLDOWN_TICKS);
assert.ok(e.deployment.transfer?.returning, 'expiry starts physical return despite hero combat');
assert.ok(Math.hypot(e.x-away[0],e.z-away[1])<1, 'expiry never teleports survivors');
assert.equal(e.deployment.transfer.to,s.id);
for(let i=0;i<1800&&e.deployment.transfer;i++)g.step();
assert.equal(e.deployment.group,s.id);assert.notEqual(e.order.kind,'follow');
call([s.id]); assert.equal(r.active, false, 'cooldown starts at expiry');
g.state.tick = r.readyAt; call([s.id]); assert.equal(r.active, true);

// Group buffs and permanent reassignment use membership, not proximity alone.
const heroCrew=unit('hero'), localCrew=unit(other.id);
assert.equal(g.rally.buffEligible(h,heroCrew),true);
assert.equal(g.rally.buffEligible(h,e),true);
assert.equal(g.rally.buffEligible(h,localCrew),false);
assert.equal(g.rally.buffEligible(h,guard),false);
h.hitAt=h.foughtAt=g.state.tick-120;
g.step([{id:heroId,type:'deployment',action:'transfer',units:[e.id],to:'home'}]);
assert.ok(!r.participants.some(p=>p.id===e.id),'deliberate permanent transfer overrides Rally return');
assert.equal(g.rally.buffEligible(h,e),false,'in-flight permanent reassignment loses Rally buff eligibility');
e.buffs={rally:{until:g.state.tick+100},reprisal:{until:g.state.tick+100},ambush:{until:g.state.tick+100}};
g.rally.cleanBuffs();assert.deepEqual(e.buffs,{});

// Only successful formal lantern placement resets defender Rally, including HQ.
g.state.tick=r.endsAt;g.step();r.readyAt=g.state.tick+1000;
const b=Object.values(g.state.businesses).find(b=>b.hideout==='player'), attacker=Object.values(g.state.entities).find(e=>e.type==='hero'&&e.owner!==h.owner);
g.state.clans.player.kind='ninja'; // exercise the Shinobi HQ exception at this owned HQ
Object.assign(attacker,{x:b.ring[0],z:b.ring[1],place:'street',dead:false,downed:false});g.state.clans[attacker.owner].lanterns=1;
g.state.night=false;const before=r.readyAt;
g.step([{id:attacker.id,type:'business',action:'raid',business:b.id}]);assert.equal(r.readyAt,before,'invalid daytime raid does not reset');
g.state.night=true;
g.step([{id:attacker.id,type:'business',action:'raid',business:b.id}]);assert.ok(g.state.attacks[b.id]);assert.ok(r.readyAt<=g.state.tick,'actual HQ lantern placement resets cooldown');
call([s.id]);const activeEnd=r.endsAt;g.rally.raidPlaced('player');g.rally.raidPlaced('player');
assert.equal(r.endsAt,activeEnd);assert.equal(r.nextReady,true);
g.state.tick=activeEnd;g.step();assert.equal(r.readyAt,activeEnd,'active raid reset makes next Rally ready at expiry without stacking');
assert.doesNotThrow(() => JSON.stringify(g.state));
console.log('Deployment Rally: KO/combat, chosen groups, no auto Follow, temporary movement, timers, real return travel, permanent overrides, buff eligibility and formal HQ raid resets passed');
