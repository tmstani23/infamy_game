import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { createDeploymentAI } from '../src/sim/deployment_ai.js';
import { createStats } from '../src/sim/stats.js';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
function fixture(clan = 'kuroda') {
  const g = createGame({ district:read('data/port_town.json'), catalog:read('data/art.json'),
    cutouts:read('art/cutouts.json'), interiors:read('data/interiors.json'), parts:read('data/interior_parts.json'),
    recipes:read('data/room_recipes.json'), units:read('data/units.json'),
    settings:{ ...read('data/settings.json'), dayNight:{ auto:false } } });
  const { heroId } = setupMatch(g, { clan, difficulty:'easy', bots:read('data/bots.json') });
  for (const e of Object.values(g.state.entities)) { e.holdFire = true; if (e.owner !== 'player') e.dead = true; }
  const sectors = g.state.deployment.sectors;
  const source = sectors.find(s => sectors.some(t => g.sweep.nearby(s.id,t.id)));
  const target = sectors.find(t => g.sweep.nearby(source.id,t.id));
  const task = g.state.deployment.clans.player.sectors[source.id];
  const crew = Array.from({ length:3 }, () => g.state.entities[g.spawn('thug','thug',source.anchor.x,source.anchor.z,
    { owner:'player', deployment:{ group:source.id }, order:{ kind:'stop' } })]);
  const rival=Object.keys(g.state.clans).find(id=>id!=='player');
  const send = c => g.step([{ id:heroId, type:'deployment', sector:source.id, targetClan:rival, ...c }]);
  const advance = () => { for (const e of Object.values(g.state.entities)) if (e.guard) e.dead = true; g.step(); };
  return { g, source, target, task, crew, send, advance };
}
{
  const { g, source, target, task, crew, send, advance } = fixture();
  const saved = JSON.stringify({ task:task.task, objective:task.objective, route:task.route });
  send({ action:'sweep', targetSector:source.id }); assert.equal(task.operation,undefined,'same sector rejected');
  send({ action:'sweep', targetSector:'missing' }); assert.equal(task.operation,undefined,'invalid target rejected');
  send({ action:'sweep', targetSector:target.id });
  const op = task.operation; assert.equal(op?.state,'Marching');
  assert.ok(g.deployment.canOccupy(crew[0],target.anchor.x,target.anchor.z,'street'));
  const third = g.state.deployment.sectors.find(s => s.id !== source.id && s.id !== target.id);
  assert.equal(g.deployment.canOccupy(crew[0],third.anchor.x,third.anchor.z,'street'),false,'no access to unrelated sector');
  send({ action:'sweep', targetSector:target.id }); assert.equal(task.operation,op,'duplicate rejected');
  send({ action:'assignment', task:'guard' }); assert.equal(task.task,'patrol','saved duty protected');
  let visited = false, returned = false;
  for (let i=0; i<4000 && task.operation; i++) {
    advance();
    visited ||= crew.every(e => g.deployment.sectorAt(e.x,e.z) === target.id);
    returned ||= op.state === 'Returning';
    assert.ok(crew.every(e => e.deployment.group === source.id),'membership unchanged');
  }
  assert.ok(visited,'all crew physically reach target'); assert.ok(returned);
  assert.equal(task.operation,undefined,`physical return completes: ${JSON.stringify(crew.map(e=>({x:e.x,z:e.z,hp:e.hp,dead:e.dead,order:e.order,duty:e.deployment.duty})))}`);
  assert.ok(crew.every(e => e.place === 'street' && g.deployment.sectorAt(e.x,e.z) === source.id));
  assert.equal(JSON.stringify({ task:task.task, objective:task.objective, route:task.route }),saved);
  assert.equal(g.deployment.canOccupy(crew[0],target.anchor.x,target.anchor.z,'street'),false,'excursion permission removed');
  assert.equal(op.success,true,'full hold succeeds');assert.equal(op.reward,0,'empty sector does not award Sweep money');
  assert.doesNotThrow(() => JSON.stringify(g.state));
}
{
  const { task, target, send, advance } = fixture();
  send({ action:'sweep', targetSector:target.id });
  for (let i=0;i<30;i++) advance();
  send({ action:'cancelSweep' });
  assert.equal(task.operation?.state,'Returning');
  for (let i=0;i<2000 && task.operation;i++) advance();
  assert.equal(task.operation,undefined,'recall returns home');
}
{
  const { task, target, send } = fixture('yakuza');
  send({ action:'sweep', targetSector:target.id }); assert.equal(task.operation,undefined,'Yakuza cannot Sweep');
}
{
  const { g, target, task, crew, send, advance } = fixture();
  send({ action:'sweep', targetSector:target.id });
  for (const e of crew) Object.assign(e,{ x:target.anchor.x, z:target.anchor.z, place:'street' });
  const rival = Object.keys(g.state.clans).find(id => id !== 'player');
  const foe = g.state.entities[g.spawn('thug','thug',target.anchor.x+1,target.anchor.z,
    { owner:rival, holdFire:true, deployment:{ group:'hero' }, order:{ kind:'stop' } })];
  const hp = foe.hp, op = task.operation;
  for (let i=0;i<80 && foe.hp===hp;i++) advance();
  assert.ok(foe.hp<hp,'Sweep uses real combat to damage a visible rival');
  assert.equal(op.state,'Fighting','nearby resistance prevents holding');
  const actor = crew[0], unit = g.settings.units.types[actor.kind] || g.settings.units.types.thug;
  foe.hidden = true; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'hidden rival is dropped immediately');
  delete foe.hidden; foe.place = 'unrelated-interior'; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'no interior pursuit');
  foe.place = 'street'; foe.x = actor.x+30; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'no distant pursuit');
  foe.x = actor.x+1; foe.z = actor.z; foe.type = 'civilian'; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'civilians excluded');
  foe.type = 'thug'; foe.cop = true; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'police excluded');
  delete foe.cop; foe.dead = true;
  for (const e of crew) Object.assign(e,{ x:target.anchor.x, z:target.anchor.z });
  advance(); assert.equal(op.state,'Holding','clear street starts independent hold');
  for(let i=0;i<400 && op.state!=='Returning';i++)advance();
  assert.equal(op.state,'Returning','twenty-second hold completes');
  foe.dead = false; g.sweep.step(actor,unit);
  assert.equal(op.targets[actor.id],undefined,'returning squad does not reacquire rivals');
}
{
  const {g,source,target,task,crew,send,advance}=fixture();
  send({action:'sweep',targetSector:target.id});
  assert.equal(g.stats.damageTaken(crew[0]),.9,'tight squad gains ten percent protection');
  crew[2].x+=10;g.sweep.tick();assert.equal(g.stats.damageTaken(crew[0]),1,'spreading out removes protection');
  const stats=createStats({state:g.state,units:g.settings.units,formationMultiplier:()=>.75});
  crew[0].buffs.sweep={until:g.state.tick+20,taken:.9};
  assert.equal(stats.damageTaken(crew[0]),.75,'stronger Iron Formation wins without stacking');
  for(const e of crew)Object.assign(e,{x:target.anchor.x,z:target.anchor.z});
  const op=task.operation,rival=op.targetClan;
  const defenders=Array.from({length:2},()=>g.state.entities[g.spawn('thug','thug',target.anchor.x+1,target.anchor.z,{owner:rival,holdFire:true,deployment:{group:'hero'},order:{kind:'stop'}})]);
  g.sweep.tick();assert.equal(op.contested,true);assert.equal(op.hold,0);
  const stranger=Object.keys(g.state.clans).find(id=>id!=='player'&&id!==rival);
  defenders[0].owner=stranger;g.sweep.step(crew[0],g.settings.units.types.thug);
  assert.notEqual(op.targets[crew[0].id],defenders[0].id,'unrelated clan never targeted');
  defenders.forEach(e=>e.dead=true);
  const grid=g.deployment.cellGrid(),index=g.state.deployment.sectors.findIndex(s=>s.id===target.id);
  let far;
  for(let k=0;k<grid.cells.length;k++)if(grid.cells[k]===index){
    const x=grid.bounds.minX+(k%grid.w+.5)*grid.cell,z=grid.bounds.minZ+(Math.floor(k/grid.w)+.5)*grid.cell;
    if(Math.hypot(x-target.anchor.x,z-target.anchor.z)>15){far={x,z};break;}
  }
  assert.ok(far);const enemyTask=g.state.deployment.clans[rival].sectors[target.id];enemyTask.task='guard';enemyTask.objective={...far};
  const survivor=g.state.entities[g.spawn('thug','thug',far.x,far.z,{owner:rival,holdFire:true,deployment:{group:target.id},order:{kind:'stop'}})];
  const heroCrew=g.state.entities[g.spawn('thug','thug',far.x,far.z,{owner:rival,holdFire:true,deployment:{group:'hero'},order:{kind:'stop'}})];
  g.sweep.tick();assert.equal(op.hold,1);for(let i=0;i<398;i++)g.sweep.tick();
  assert.equal(op.success,undefined,'full twenty seconds required');g.sweep.tick();assert.equal(op.success,true);
  assert.equal(survivor.deployment.scattered?.phase,'Withdrawing');assert.equal(heroCrew.deployment.scattered,undefined,'hero group never scattered');
  assert.equal(g.deployment.canAssign(rival,[survivor.id],'home').ok,false,'recovery cannot be bypassed by transfer');
  assert.equal(g.deployment.canActAt(survivor,far.x,far.z,'street'),false,'retreating crew cannot attack');
  const start={x:survivor.x,z:survivor.z};let reached=false,recoveryAt;
  for(let i=0;i<6000&&survivor.deployment.scattered;i++){
    advance();const s=survivor.deployment.scattered;
    assert.equal(survivor.deployment.group,target.id,'saved assignment slot remains reserved');
    if(s?.phase==='Recovering'){reached=true;recoveryAt??=g.state.tick;assert.ok(s.readyAt>=recoveryAt+598);}
    if(s?.phase==='Returning')assert.ok(g.state.tick-recoveryAt>=599,'thirty-second HQ recovery');
  }
  assert.ok(reached,'survivor physically reaches its HQ');assert.equal(survivor.deployment.scattered,undefined,'survivor returns physically to saved sector');
  assert.ok(Math.hypot(survivor.x-start.x,survivor.z-start.z)<3,'returns to saved objective');
  assert.doesNotThrow(()=>JSON.stringify(g.state));
}
{
  const {g,source,target,crew}=fixture(),hero=Object.values(g.state.entities).find(e=>e.owner==='player'&&e.type==='hero');
  const rival=Object.keys(g.state.clans).find(id=>id!=='player');
  const e=g.state.entities[g.spawn('thug','thug',target.anchor.x,target.anchor.z,{owner:rival,holdFire:true,deployment:{group:'hero'}})];
  const ai=createDeploymentAI(g,{clan:'player',hero:hero.id}),canSee=g.vision.canSee;g.vision.canSee=()=>true;
  const commands=ai.tick();const c=commands.find(c=>c.action==='sweep');assert.ok(c,'bots use the same Sweep command');
  assert.equal(c.targetClan,rival);assert.equal(c.sector,source.id);g.step([c]);
  assert.equal(g.state.deployment.clans.player.sectors[source.id].operation?.kind,'sweep');g.vision.canSee=canSee;
}
console.log('Sweep: physical march/return, real combat/visibility, hold/contest, grouping/nonstacking, rival filtering, HQ recovery/return, saved slots and bot commands passed');
