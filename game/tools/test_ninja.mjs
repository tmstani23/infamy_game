// The Shinobi clan (ninja build, /mnt/project-files/next_steps/ninja_build_plan.md): units, hiring rules, crew cap.
// Run: node game/tools/test_ninja.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const settings = data('data/settings.json');
const newGame = () => {
  const g = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...settings, dayNight: { auto: false } },
  });
  g.clans.addClan('player', { name: 'Shinobi clan', kind: 'ninja' });
  g.clans.addClan('kuroda', { bot: true });
  return g;
};

// phase 1: the ninja leader is a hero with his own numbers; ninja crew only for the Shinobi clan
{
  const g = newGame();
  const units = g.settings.units;
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', 6, 8, { owner: 'player' })];
  const ronin = g.state.entities[g.spawn('hero', 'ronin', 10, 8, { owner: 'kuroda' })];
  assert.equal(boss.maxHp, units.models.ninja_leader.hp, 'ninja leader hp');
  assert.ok(boss.maxHp < ronin.maxHp, 'a bit less health than the ronin');
  // runs faster: same command, more ground covered
  const x0 = boss.x, r0 = ronin.x;
  for (let i = 0; i < 20; i++) g.step([{ id: boss.id, type: 'move', right: 0, down: -1 }, { id: ronin.id, type: 'move', right: 0, down: -1 }]);
  const dn = Math.hypot(boss.x - x0, boss.z - 8), dr = Math.hypot(ronin.x - r0, ronin.z - 8);
  assert.ok(dn > dr * 1.05, `ninja faster (${dn.toFixed(2)} vs ${dr.toFixed(2)})`);
  assert.equal(g.state.clans.player.kind, 'ninja');
  assert.ok(g.clans.hirePrice('player', 'ninja') > 0, 'shinobi hire ninja');
  assert.equal(g.clans.hirePrice('player', 'thug'), null, 'shinobi do not hire thugs');
  assert.equal(g.clans.hirePrice('kuroda', 'ninja'), null, 'yakuza do not hire ninja');
  assert.ok(g.clans.hirePrice('kuroda', 'thug') > 0);
  // crew cap from Renown, not businesses
  const base = g.clans.crewCap('player');
  g.state.clans.player.renown = 250;
  assert.equal(g.clans.crewCap('player'), base + Math.floor(250 / g.settings.units.rules.renownPerCrew), 'cap grows with Renown');
  console.log('ninja units ok');
}

// phase 3: stealth. Hidden in the dark away from enemies; seen close up, in lantern light, when hitting
{
  const g = newGame();
  const S = g.settings.units.rules.stealth;
  g.step([{ type: 'time', night: true }]);
  // a dark spot: away from every lantern
  const dark = (() => { for (let x = -60; x < 60; x += 2) for (let z = -20; z < 60; z += 2) if (!g.stealth.lit(x, z) && g.nav.free(x, z)) return [x, z]; })();
  const n = g.state.entities[g.spawn('ninja', 'ninja_grunt', dark[0], dark[1], { owner: 'player', order: { kind: 'stop' } })];   // passive, so he does not go for the thug
  const t = g.state.entities[g.spawn('thug', 'thug', dark[0] + S.darkRange + 3, dark[1], { owner: 'kuroda', order: { kind: 'stop' } })];
  for (let i = 0; i < 4; i++) g.step();
  assert.equal(n.hidden, true, 'hidden in the dark');
  assert.ok(!g.vision.canSee('kuroda', n), 'rival cannot see him');
  // an enemy walks up close: seen, and stays seen for revealSeconds
  t.x = dark[0] + S.darkRange - 0.5;
  for (let i = 0; i < 4; i++) g.step();
  assert.equal(n.hidden, false, 'seen close up');
  t.x = dark[0] + 30;
  for (let i = 0; i < 20 * (S.revealSeconds - 1); i++) g.step();
  assert.equal(n.hidden, false, 'still revealed');
  for (let i = 0; i < 20 * 2; i++) g.step();
  assert.equal(n.hidden, true, 'hidden again');
  // the yakuza never hide
  assert.ok(!t.hidden);
  console.log('stealth ok');
}

// snuffing a lantern: at night, next to it, 1 s standing still; 3 a night; back at dawn
{
  const g = newGame();
  const S = g.settings.units.rules.stealth;
  const l = g.stealth.lights[0];
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', l.x + 1, l.z, { owner: 'player' })];
  g.step([{ id: boss.id, type: 'snuff' }]);
  assert.ok(!boss.snuffing, 'not by day');
  g.step([{ type: 'time', night: true }]);
  assert.ok(g.stealth.lit(l.x, l.z), 'lit at night by the lantern');
  g.step([{ id: boss.id, type: 'snuff' }]);
  for (let i = 0; i < 20 * S.snuffSeconds + 2; i++) g.step();
  assert.ok(g.state.lightsOut.includes(l.prop), 'lantern out');
  assert.equal(g.stealth.snuffsLeft('player'), S.snuffPerNight - 1);
  g.step([{ type: 'time', night: false }]);
  assert.equal(g.state.lightsOut.length, 0, 'lit again at dawn');
  console.log('snuff ok');
}

// back windows: a way into businesses for the Shinobi clan only
{
  const g = newGame();
  const win = g.doors.find(d => d.ninja && d.place !== 'street');
  assert.ok(win, 'back windows exist');
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', win.x, win.z, { owner: 'player' })];
  const thug = g.state.entities[g.spawn('hero', 'ronin', win.x, win.z, { owner: 'kuroda' })];
  assert.equal(g.doorNear(thug.id)?.ninja, undefined, 'yakuza do not use windows');
  g.step([{ id: boss.id, type: 'use' }]);
  assert.equal(boss.place, win.place, 'ninja climbed in');
  console.log('back window ok');
}
// phase 2: the village in the west forest. The Shinobi live in the longhouse (not the inn), the
// village is their territory, they hire at the dojo, and the stream is crossed on its two bridges
{
  const g = newGame(), district = data('data/port_town.json');
  const biz = Object.values(g.state.businesses);
  const home = biz.find(b => b.hideout === 'player'), dojo = biz.find(b => b.kind === 'dojo');
  assert.equal(district.buildings[+home.id.slice(1)].art, 'longhouse', 'the Shinobi hideout is the longhouse');
  assert.equal(home.owner, 'player');
  assert.ok(!biz.some(b => district.buildings[+b.id.slice(1)].art === 'inn'), 'the inn is no hideout for the Shinobi');
  assert.ok(biz.find(b => b.hideout === 'kuroda')?.owner === 'kuroda', 'Kuroda keep the izakaya');
  g.step([]);
  const [vx, vz] = district.spawns.ninja;
  assert.equal(g.territory.ownerAt(vx, vz), 'player', 'the village is Shinobi territory');
  assert.equal(g.territory.ownerAt(-102, 30), 'player', 'all of it');
  // hiring: ninja at the dojo, not in a teahouse; yakuza not at the dojo
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', vx, vz, { owner: 'player' })];
  const tea = biz.find(b => b.kind === 'teahouse');
  boss.place = tea.room;
  g.clans.hire(boss, tea.id, 'ninja');
  assert.equal(g.state.clans.player.queue.length, 0, 'no ninja for hire in a teahouse');
  boss.place = dojo.room;
  g.clans.hire(boss, dojo.id, 'ninja');
  assert.equal(g.state.clans.player.queue.length, 1, 'ninja hired at the dojo');
  const ronin = g.state.entities[g.spawn('hero', 'ronin', 6, 8, { owner: 'kuroda' })];
  ronin.place = dojo.room;
  g.clans.hire(ronin, dojo.id, 'thug');
  assert.equal(g.state.clans.kuroda.queue.length, 0, 'yakuza hire in teahouses, not the dojo');
  // into town: over a bridge, never through the stream
  const stream = district.blockShapes.find(b => b.line?.[0][1] === 96);
  const bridges = district.walkShapes.filter(([x0]) => x0 < -77);
  assert.equal(bridges.length, 4, 'four stream crossings, including the screenshot-bank bridge and retained southern crossing');
  for (const [tx, tz] of [[6, 8], [-60, -7]]) {
    const path = g.nav.findPath(vx, vz, tx, tz);
    assert.ok(path, `village to ${tx},${tz}`);
    const pts = [[vx, vz], ...path];
    for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 10; k++) {
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 10, z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 10;
      const inStream = stream.line.some((p, n) => n && Math.abs(x - (p[0] + stream.line[n - 1][0]) / 2) < 2 && z <= Math.max(p[1], stream.line[n - 1][1]) && z >= Math.min(p[1], stream.line[n - 1][1]));
      if (inStream) assert.ok(bridges.some(([x0, z0, x1, z1]) => x >= x0 - 1 && x <= x1 + 1 && z >= z0 - 1 && z <= z1 + 1), `stream crossed off a bridge at ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
  console.log('village ok');
}

// playing Yakuza the village longhouse belongs to nobody (a ninja bot comes later) and the inn is your hideout
{
  const g = createGame({
    district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
    interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
    units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
    settings: { ...settings, dayNight: { auto: false } },
  });
  g.clans.addClan('player');
  const biz = Object.values(g.state.businesses);
  assert.equal(biz.find(b => b.hideout === 'player')?.owner, 'player');
  assert.equal(biz.find(b => b.hideout === 'ninja')?.owner, null);
  console.log('yakuza village ok');
}
// phase 4: the ninja leader's abilities (Q Shadow Step, E Distract, R Smoke Bomb, F Assassinate)
{
  const g = newGame(), A = g.settings.units.models.ninja_leader.abilities;
  g.step([{ type: 'time', night: true }]);
  const dark = (() => { for (let x = -60; x < 60; x += 2) for (let z = -20; z < 60; z += 2) if (!g.stealth.lit(x, z) && !g.stealth.lit(x + 10, z) && g.nav.free(x, z) && g.nav.free(x + 6, z)) return [x, z]; })();
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', dark[0], dark[1], { owner: 'player' })];
  const crew = g.state.entities[g.spawn('ninja', 'ninja_grunt', dark[0] - 1, dark[1], { owner: 'player', order: { kind: 'follow', target: boss.id } })];
  // Q: up to range toward the mouse, still hidden
  for (let i = 0; i < 3; i++) g.step();
  const x0 = boss.x;
  g.step([{ id: boss.id, type: 'ability', slot: 'Q', x: boss.x + 5, z: boss.z }]);
  assert.ok(Math.abs(boss.x - x0 - 5) < 0.3, `shadow step ${(boss.x - x0).toFixed(2)}`);
  assert.equal(boss.hidden, true, 'still hidden after the step');
  // ...and never over the stream: from the village bank toward town it stops at the water
  const v = g.state.entities[g.spawn('hero', 'ninja_leader', -87, 30, { owner: 'player' })];
  g.step([{ id: v.id, type: 'ability', slot: 'Q', x: -78, z: 30 }]);
  assert.ok(v.x < -84, `stopped at the stream (${v.x.toFixed(1)})`);
  // F: needs hiddenSeconds of hiding first
  const thug = g.state.entities[g.spawn('thug', 'thug', boss.x + 3, boss.z, { owner: 'kuroda', order: { kind: 'stop' } })];
  boss.hiddenAt = g.state.tick;
  g.step([{ id: boss.id, type: 'ability', slot: 'F', x: thug.x, z: thug.z }]);
  assert.ok(!boss.cooldowns?.F && !thug.downed, 'too soon after hiding');
  for (let i = 0; i < 20 * A.F.hiddenSeconds; i++) g.step();
  assert.equal(boss.hidden, true, 'hidden next to the thug in the dark');
  g.step([{ id: boss.id, type: 'ability', slot: 'F', x: thug.x, z: thug.z }]);
  assert.ok(thug.downed || thug.dead, 'crew down at once');
  assert.ok(boss.cooldowns?.F > g.state.tick, 'on cooldown');
  assert.equal(boss.hidden, false, 'assassinate shows him');
  // a boss retains bossShare of current HP, including when already wounded
  const rival = g.state.entities[g.spawn('hero', 'ronin', boss.x + 2, boss.z, { owner: 'kuroda' })];
  boss.cooldowns.F = 0; boss.hidden = true; boss.hiddenAt = g.state.tick - 20 * 5; boss.revealUntil = 0;
  g.step([{ id: boss.id, type: 'ability', slot: 'F', x: rival.x, z: rival.z }]);
  assert.equal(rival.hp, Math.round(rival.maxHp * A.F.bossShare), 'boss to 60%');
  for (const hp of [rival.maxHp * 0.8, rival.maxHp * 0.4, 300, 301, 1, 0.5]) {
    rival.hp = hp;
    boss.cooldowns.F = 0; boss.hidden = true; boss.hiddenAt = g.state.tick - 20 * 5; boss.revealUntil = 0;
    g.step([{ id: boss.id, type: 'ability', slot: 'F', target: rival.id }]);
    assert.equal(rival.hp, Math.min(hp, Math.max(1, Math.round(hp * A.F.bossShare))), 'hero retains 60% of current HP without healing or a finishing blow');
  }
  // R: nearby clan units hold fire; the rival can't target into the cloud
  boss.hp = boss.maxHp * 0.5;
  Object.assign(crew, { x: boss.x - 1, z: boss.z });
  g.step([{ id: boss.id, type: 'ability', slot: 'R', x: boss.x, z: boss.z }]);
  assert.equal(g.state.smokes?.length, 1, 'smoke up');
  assert.ok(boss.holdFire && crew.holdFire, 'all ninja hold their attacks');
  rival.x = boss.x + 6;
  g.step([{ id: rival.id, type: 'attack', target: boss.id }]);
  assert.ok(!rival.attackTarget, 'nobody outside sees into the smoke');
  for (let i = 0; i < 20 * 2; i++) g.step();
  assert.equal(boss.hidden, true, 'hidden in his own smoke');
  assert.ok(boss.hp >= boss.maxHp * (0.5 + 2 * A.R.heal) - 1 && boss.buffs?.shroud, `heals in his smoke (${(boss.hp / boss.maxHp).toFixed(2)})`);
  for (let i = 0; i < 20 * A.R.seconds; i++) g.step();
  assert.ok(!g.state.smokes, 'smoke gone');
  assert.ok(crew.holdFire, 'still holding until a new order');
  g.step([{ id: boss.id, type: 'order', kind: 'follow', units: [crew.id] }]);
  assert.ok(crew.holdFire && crew.smokePassive, 'Follow preserves passive escort after smoke expiry');
  // E: a bandit near where the pebble lands walks over
  const bx = boss.x + 8;
  const b = g.state.entities[g.bandits.add()];
  Object.assign(b, { x: bx + 4, z: boss.z, place: 'street' });
  boss.cooldowns.E = 0;
  g.step([{ id: boss.id, type: 'ability', slot: 'E', x: bx, z: boss.z }]);
  assert.ok(b.distracted, 'bandit distracted');
  for (let i = 0; i < 60; i++) g.step();
  assert.ok(Math.hypot(b.x - b.distracted.x, b.z - b.distracted.z) < 1.5, 'walked to the pebble before another clan entered sight');
  // caltrops: a rival boss right where they land is slowed
  const r2 = g.state.entities[g.spawn('hero', 'ronin', bx + 0.5, boss.z, { owner: 'kuroda' })];
  boss.cooldowns.E = 0;
  g.step([{ id: boss.id, type: 'ability', slot: 'E', x: bx, z: boss.z }]);
  assert.equal(r2.buffs?.snared?.speed, A.E.snareSpeed, 'boss slowed by caltrops');
  const sx = r2.x;
  for (let i = 0; i < 10; i++) g.step([{ id: r2.id, type: 'move', right: 1, down: 0 }]);
  const slowGo = Math.hypot(r2.x - sx, 0);
  assert.ok(slowGo > 0.5 && slowGo < 2.2, `moves at half speed (${slowGo.toFixed(2)} in 0.5 s)`);
  for (let i = 0; i < 40; i++) g.step();
  console.log('leader abilities ok');
}
// phase 5: contracts from the village shrine
{
  const g = newGame(), C = g.state.contracts, K = g.contracts.rules;
  const biz = Object.values(g.state.businesses);
  const tea = biz.find(b => b.kind === 'teahouse');
  g.clans.setOwner ? g.clans.setOwner(tea.id, 'kuroda') : (tea.owner = 'kuroda');
  tea.owner = 'kuroda';
  const noGuards = () => { for (const e of Object.values(g.state.entities)) if (e.guard) delete g.state.entities[e.id]; };
  const run = (n, cmds = []) => { for (let i = 0; i < n; i++) { g.step(i ? [] : cmds); noGuards(); } };
  run(2);
  assert.ok(C.board.length >= K.perDawn[0] && C.board.length <= K.perDawn[1], `board posted (${C.board.length})`);
  const want = kind => { for (let k = 0; k < 40 && !C.board.some(j => j.kind === kind && (kind !== 'scout' && kind !== 'mark' || j.business === tea.id)); k++) g.contracts.post();
    return C.board.find(j => j.kind === kind && (kind !== 'scout' && kind !== 'mark' || j.business === tea.id)); };
  const shrine = g.doors.find(d => d.menu === 'contracts');
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', shrine.x, shrine.z, { owner: 'player' })];
  const crew = g.state.entities[g.spawn('ninja', 'ninja_grunt', shrine.x + 1, shrine.z, { owner: 'player', order: { kind: 'stop' } })];
  const clan = g.state.clans.player;
  // take a Scout job: the target is warned; stand inside hidden for its seconds
  let job = want('scout');
  const scoutQuote = g.contracts.quote(job);
  g.step([{ id: boss.id, type: 'contract', action: 'take', job: job.id }]);
  assert.equal(C.active.player?.id, job.id, 'scout taken');
  assert.ok(g.state.news.some(n => n.kind === 'contractWarn' && n.clan === 'kuroda'), 'kuroda warned');
  const room = g.rooms.find(r => r.name === tea.room);
  Object.assign(crew, { place: tea.room, x: room.spawn.x, z: room.spawn.z });
  const ryo0 = clan.ryo;
  run(20 * (K.scout.seconds + 1));
  assert.ok(!C.active.player, 'scout done');
  assert.equal(clan.ryo, ryo0 + scoutQuote.ryo); assert.equal(clan.renown, scoutQuote.renown);
  // Sabotage: plant on the back-room spot at night, hold, then no payout from it at dawn
  g.step([{ type: 'time', night: true }]);
  job = want('mark');
  const markQuote = g.contracts.quote(job);
  g.step([{ id: boss.id, type: 'contract', action: 'take', job: job.id }]);
  const spot = g.contracts.backRoom(tea);
  Object.assign(crew, { x: spot.x, z: spot.z });
  run(20 * (K.mark.plantSeconds + 1));
  assert.ok(C.active.player?.mark, 'mark planted');
  run(20 * (K.mark.holdSeconds + 1));
  assert.ok(!C.active.player && tea.sabotaged, 'mark held: sabotaged');
  const k0 = g.state.clans.kuroda.ryo;
  g.step([{ type: 'time', night: false }]);
  assert.ok(!tea.sabotaged, 'used up at dawn');
  assert.ok(g.state.clans.kuroda.ryo - k0 < g.settings.units.rules.businesses.teahouse.payout, 'no teahouse payout');
  // Steal: in through the business's back window, then the stash
  g.state.clans.kuroda.ryo = 1000;
  crew.place = 'street';
  job = want('steal');
  const stealQuote = g.contracts.quote(job);
  g.step([{ id: boss.id, type: 'contract', action: 'take', job: job.id }]);
  const win = g.doors.find(d => d.ninja && d.place === tea.room);
  // right-click the business with crew selected: they climb in by the back window too (Tim 2026-10-21)
  Object.assign(crew, { x: win.x + 0.5, z: win.z, place: 'street', order: { kind: 'stop' } });
  g.step([{ id: boss.id, type: 'order', units: [crew.id], kind: 'enter', business: tea.id }]);
  for (let i = 0; i < 20 * 3 && crew.place !== tea.room; i++) g.step();
  assert.equal(crew.place, tea.room, 'crew climbed in by the back window');
  Object.assign(crew, { place: 'street', x: win.x + 0.5, z: win.z, order: { kind: 'stop' } });   // out of the way of the stash checks
  Object.assign(boss, { x: win.x, z: win.z, place: 'street' });
  g.step([{ id: boss.id, type: 'use' }]);
  assert.equal(boss.place, tea.room, 'climbed into the business');
  // harder steal (Tim 2026-10-20): the business has a guard patrolling it; send it off for this check
  const hg = Object.values(g.state.entities).filter(e => e.guard === tea.id);
  for (const e of hg) delete g.state.entities[e.id];
  const stash = g.contracts.stash(tea), r1 = clan.ryo;
  Object.assign(boss, { x: stash.x, z: stash.z });
  run(20 * 4);
  const p1 = C.active.player.progress;
  assert.ok(C.active.player.spot?.on && Math.hypot(C.active.player.spot.x - stash.x, C.active.player.spot.z - stash.z) < 0.01, 'the stash ring is on the stash, lit while on it');
  Object.assign(boss, { x: stash.x + 3, z: stash.z }); run(20 * 2);
  assert.equal(C.active.player.progress, p1, 'stepping off pauses the steal, keeps the count');
  // seen inside: one alarm to the owners, and the count still runs while seen (Tim 2026-10-21)
  const watcher = g.state.entities[g.spawn('thug', 'thug', boss.x + 1, boss.z, { owner: 'kuroda', place: tea.room, order: { kind: 'stop' }, hp: 1e6, maxHp: 1e6 })];
  boss.hp = boss.maxHp = 1e6;
  Object.assign(boss, { x: stash.x, z: stash.z });
  let alarm = 0, p2 = C.active.player.progress;
  for (let i = 0; i < 20 && C.active.player; i++) { g.step(); alarm += g.state.news.filter(n => n.kind === 'stealAlert' && n.clan === 'kuroda' && n.by === 'player').length; }
  assert.equal(alarm, 1, 'one alarm when seen inside');
  assert.ok(C.active.player.progress > p2, 'the count runs while seen');
  delete g.state.entities[watcher.id];
  Object.assign(boss, { x: stash.x, z: stash.z });
  run(20 * (K.steal.seconds - 3));
  assert.equal(clan.ryo - r1, Math.min(stealQuote.stealCap, 1000 * stealQuote.stealShare), 'stole their ryo');
  assert.equal(g.state.clans.kuroda.ryo, 1000 - (clan.ryo - r1));
  // a job not done by dawn fails and pays nothing
  boss.place = 'street'; Object.assign(boss, { x: shrine.x, z: shrine.z });
  g.step([{ type: 'time', night: true }]);
  job = C.board[0];
  g.step([{ id: boss.id, type: 'contract', action: 'take', job: job.id }]);
  const r2 = clan.ryo;
  g.step([{ type: 'time', night: false }]);
  assert.ok(!C.active.player && g.state.news.some(n => n.kind === 'contractFailed'), 'ran out at dawn');
  assert.ok(clan.ryo >= r2 && clan.renown === scoutQuote.renown + markQuote.renown + stealQuote.renown, 'no pay for a failed job');
  console.log('contracts ok');
}
// fair board (Tim 2026-10-20): at most perClan jobs on a clan, taking one swaps the rest on that clan away
{
  const g = newGame(), C = g.state.contracts, K = g.contracts.rules;
  g.clans.addClan('ota', { bot: true });
  const biz = Object.values(g.state.businesses).filter(b => !b.hideout && b.room);
  biz.forEach((b, i) => { b.owner = i % 2 ? 'kuroda' : 'ota'; });
  g.step([]);
  for (let k = 0; k < 30; k++) {
    g.contracts.post();
    for (const id of ['kuroda', 'ota']) assert.ok(C.board.filter(j => j.target === id).length <= K.perClan, `max ${K.perClan} on ${id}`);
  }
  // find a board with two jobs on one clan, take one: none left on that clan
  let job;
  for (let k = 0; k < 60 && !job; k++) { g.contracts.post(); const t = C.board.find(j => j.target && C.board.filter(x => x.target === j.target).length === 2); job = t; }
  assert.ok(job, 'a board with two jobs on one clan');
  const shrine = g.doors.find(d => d.menu === 'contracts');
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', shrine.x, shrine.z, { owner: 'player' })];
  const n0 = C.board.length;
  g.step([{ id: boss.id, type: 'contract', action: 'take', job: job.id }]);
  assert.equal(C.active.player?.id, job.id, 'taken');
  assert.ok(!C.board.some(j => j.target === job.target), 'no other jobs left on that clan');
  assert.ok(C.board.length >= n0 - 2, 'swapped for jobs elsewhere');
  // Recent hits reduce this clan's own frequency. Comparing two different clans
  // conflates that penalty with business scores, leadership and eligible job kinds.
  delete C.active.player;
  C.hits = [];
  let baseline = 0;
  for (let k = 0; k < 200; k++) { g.contracts.post(); baseline += C.board.filter(j => j.target === 'kuroda').length; }
  C.hits = [{ target: 'kuroda', day: C.day }, { target: 'kuroda', day: C.day }];
  let ku = 0;
  for (let k = 0; k < 200; k++) { g.contracts.post(); ku += C.board.filter(j => j.target === 'kuroda').length; }
  assert.ok(ku < baseline, `recent hits reduce that clan's jobs (${ku} vs baseline ${baseline})`);
  console.log('fair board ok');
}
// Tim 2026-10-20: snuff a clicked lantern from up to snuffReach away (with a smoke-flash cast);
// Shadow Step onto an enemy lands by it with a sure crit and auto attacks it
{
  const g = newGame(), S = g.settings.units.rules.stealth;
  const l = g.stealth.lights.find(l => g.nav.free(l.x + 6, l.z));
  const boss = g.state.entities[g.spawn('hero', 'ninja_leader', l.x + 6, l.z, { owner: 'player' })];
  g.step([{ type: 'time', night: true }]);
  g.step([{ id: boss.id, type: 'snuff', prop: l.prop }]);
  assert.ok(boss.snuffing?.prop === l.prop, 'snuffing from 6 away');
  assert.ok(g.state.casts.some(c => c.kind === 'snuff'), 'smoke flash');
  for (let i = 0; i < 20 * S.snuffSeconds + 2; i++) g.step();
  assert.ok(g.state.lightsOut.includes(l.prop), 'that lantern out');
  const far = g.state.entities[g.spawn('hero', 'ninja_leader', l.x + S.snuffReach + 2, l.z + 30, { owner: 'player' })];
  g.step([{ id: far.id, type: 'snuff', prop: g.stealth.lights[1].prop }]);
  assert.ok(!far.snuffing || Math.hypot(g.stealth.lights[1].x - far.x, g.stealth.lights[1].z - far.z) < S.snuffReach, 'not from too far');
  // Shadow Step on a thug
  const A = g.settings.units.models.ninja_leader.abilities.Q;
  const spot = (() => { for (let x = -60; x < 60; x += 2) for (let z = -20; z < 60; z += 2) if (g.nav.free(x, z) && g.nav.free(x + 5, z) && g.nav.free(x + 2.5, z)) return [x, z]; })();
  const n = g.state.entities[g.spawn('hero', 'ninja_leader', spot[0], spot[1], { owner: 'player' })];
  const thug = g.state.entities[g.spawn('thug', 'thug', spot[0] + 5, spot[1], { owner: 'kuroda', order: { kind: 'stop' } })];
  for (let i = 0; i < 3; i++) g.step();
  const hp0 = thug.hp;
  g.step([{ id: n.id, type: 'ability', slot: 'Q', x: thug.x + 3, z: thug.z, target: thug.id }]);
  assert.ok(Math.hypot(n.x - thug.x, n.z - thug.z) < (A.landGap ?? 0.9) + 0.4, `landed by the thug (${Math.hypot(n.x - thug.x, n.z - thug.z).toFixed(2)})`);
  assert.ok(g.state.hits.some(h => h.a === n.id && h.t === thug.id && h.crit) || thug.hp < hp0, 'sure crit');
  assert.equal(n.attackTarget, thug.id, 'auto attacking it');
  assert.ok(g.state.casts.some(c => c.kind === 'shadowstep' && c.crit), 'crit slash cast');
  // Assassinate from 4 away (reach 3 + his own): he lunges in and the thug goes down
  const F = g.settings.units.models.ninja_leader.abilities.F;
  const dark = (() => { for (let x = -60; x < 60; x += 2) for (let z = -20; z < 60; z += 2) if (!g.stealth.lit(x, z) && !g.stealth.lit(x + 4, z) && g.nav.free(x, z) && g.nav.free(x + 4, z) && g.nav.free(x + 2, z)) return [x, z]; })();
  const k = g.state.entities[g.spawn('hero', 'ninja_leader', dark[0], dark[1], { owner: 'player' })];
  const t2 = g.state.entities[g.spawn('thug', 'thug', dark[0] + 4, dark[1], { owner: 'kuroda', order: { kind: 'stop' } })];
  for (let i = 0; i < 20 * F.hiddenSeconds + 2; i++) g.step();
  if (k.hidden) {
    g.step([{ id: k.id, type: 'ability', slot: 'F', x: t2.x, z: t2.z }]);
    assert.ok(t2.downed || t2.dead, 'assassinated from 4 away');
    assert.ok(Math.hypot(k.x - t2.x, k.z - t2.z) < 1.5, 'lunged in');
  } else console.log('  (thug spotted him at 4: skipped the long assassinate check)');
  console.log('snuff from afar + shadow step crit ok');
}
console.log('ninja tests passed');
