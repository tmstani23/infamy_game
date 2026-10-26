import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url))), units = read('data/units.json');
for (const type of Object.values(units.types)) { type.dodgeChance = 0; type.critChance = 0; }
const g = createGame({ district: read('data/port_town.json'), catalog: read('data/art.json'), cutouts: read('art/cutouts.json'), interiors: read('data/interiors.json'),
  parts: read('data/interior_parts.json'), recipes: read('data/room_recipes.json'), units, settings: { ...read('data/settings.json'), dayNight: { auto: false } } });
const { heroId } = setupMatch(g, { clan: 'shinobi', difficulty: 'easy', bots: read('data/bots.json') });
const st = g.state, h = st.entities[heroId];
for (const e of Object.values(st.entities)) { e.holdFire = true; if (e.type !== 'hero') e.order = { kind: 'stop' }; }
const grid = g.deployment.cellGrid(); let boundary;
for (let k = 0; k < grid.cells.length && !boundary; k++) if (k % grid.w + 1 < grid.w && grid.cells[k] >= 0 && grid.cells[k+1] >= 0 && grid.cells[k] !== grid.cells[k+1]) boundary = [k,k+1];
const point = k => ({ x: grid.bounds.minX + (k % grid.w + .5) * grid.cell, z: grid.bounds.minZ + (Math.floor(k / grid.w) + .5) * grid.cell });
const a = point(boundary[0]), b = point(boundary[1]), sector = st.deployment.sectors[grid.cells[boundary[0]]], other = st.deployment.sectors[grid.cells[boundary[1]]];
const add = (p,group) => st.entities[g.spawn('ninja','ninja_grunt',p.x,p.z,{owner:'player',deployment:{group}})];
const team = [add(a,sector.id),add(a,sector.id),add(a,sector.id)]; add(b,other.id);
const rival = Object.keys(st.clans).find(id => id !== 'player' && st.clans[id].kind !== 'ninja');
const foe = p => st.entities[g.spawn('thug','thug',p.x,p.z,{owner:rival,holdFire:true,order:{kind:'stop'},deployment:{group:'hero'}})];
const t = foe(a);
st.contracts.active.player={kind:'boss',hero:t.id,target:rival};
g.shinobiAssignments.tick();
assert.ok(st.news.some(n=>n.kind==='sectorContact'&&n.target===t.id&&n.priority));
assert.equal(st.deployment.clans.player.sightings[t.id].sector,sector.id);
Object.assign(t,b);st.tick=5;g.shinobiAssignments.tick();
assert.equal(st.deployment.clans.player.sightings[t.id].sector,other.id,'reports coordinate across sector watchers');
assert.ok(st.news.some(n=>n.kind==='sectorContact'&&n.sector===other.id));
const last=structuredClone(st.deployment.clans.player.sightings[t.id]);
t.hidden=true;t.x+=30;st.tick=10;g.shinobiAssignments.tick();
assert.equal(st.deployment.clans.player.sightings[t.id].x,last.x);
assert.equal(st.deployment.clans.player.sightings[t.id].live,false);
assert.ok(last.direction,'watch stores only the observed heading');
st.tick=205;g.shinobiAssignments.tick();assert.equal(st.deployment.clans.player.sightings[t.id],undefined);
delete st.contracts.active.player;
for(const e of team)Object.assign(e,sector.anchor);
Object.assign(t,{x:sector.anchor.x+1,z:sector.anchor.z},{hidden:false,hp:35});h.downed=true;
const send=c=>g.step([{id:heroId,type:'deployment',...c}]);
send({action:'armAmbush',sector:sector.id,target:t.id});
assert.equal(st.deployment.clans.player.sectors[sector.id].operation.state,'Attacking');
let sawEscape=false;
for(let i=0;i<1800;i++){
  g.step();const op=st.deployment.clans.player.sectors[sector.id].operation;
  if(op?.state==='Escaping')sawEscape=true;
  if(sawEscape&&!op)break;
}
assert.ok(t.dead,'ambush uses ordinary attacks followed by normal execution');
assert.ok(sawEscape,'target death automatically retreats without a second activation');
assert.equal(st.deployment.clans.player.sectors[sector.id].operation,undefined);
assert.equal(st.deployment.clans.player.sectors[sector.id].task,'watch');
assert.ok(team.every(e=>e.deployment.duty.manual===false));

const wait=foe(other.anchor);Object.assign(team[0],sector.anchor);
// A distant target must be visible to arm; an allied observer supplies normal sight.
add(other.anchor,other.id);
send({action:'armAmbush',sector:sector.id,target:wait.id});
assert.equal(st.deployment.clans.player.sectors[sector.id].operation.state,'Ambush armed');
send({action:'cancelAmbush',sector:sector.id});assert.equal(st.deployment.clans.player.sectors[sector.id].operation,undefined);

for(const e of team)Object.assign(e,sector.anchor,{hp:e.maxHp});
send({action:'assignment',sector:sector.id,task:'extraction',objective:sector.anchor,fallback:sector.anchor});
const intruder=foe({x:sector.anchor.x+2,z:sector.anchor.z});let intercepted=false;
for(let i=0;i<80;i++){g.step();if(st.hits.some(hit=>team.some(e=>hit.a===e.id)&&hit.t===intruder.id))intercepted=true;}
assert.ok(intercepted,'Secure Extraction proactively intercepts within its radius');
Object.assign(intruder,other.anchor,{dead:false,downed:false,hp:intruder.maxHp});g.step();
assert.ok(team.every(e=>e.deployment.duty.intercept!==intruder.id),'interception breaks when target leaves the short leash/sector');
const unsafe=foe(sector.anchor);for(const e of team)e.hp=e.maxHp*.2;
send({action:'armAmbush',sector:sector.id,target:unsafe.id});
assert.equal(st.deployment.clans.player.sectors[sector.id].operation.state,'Escaping','low-health ambush aborts safely');
console.log('Shinobi assignments: truthful coordinated priority sightings/expiry, remote KO arm/cancel, ordinary kill/execute/automatic escape, extraction intercept/leash and unsafe abort passed');
