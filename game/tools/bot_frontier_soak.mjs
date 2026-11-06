// Phased bot frontier / governor soak (2026-11-06). Runs a campaign match with the rival bots and reports, per
// phase, what each bot clan reached: permit, settlers, out on the island, town founded, then its governor growing
// the town (initiative, workers, buildings, tier, market), plus raids on each clan while its boss is away and
// anything that stalled. The player's hero stays home (or goes out with "away").
// Long runs go in chunks that save and resume (each call stops after `seconds` of wall time):
//   node tools/bot_frontier_soak.mjs [gameMinutes=60] [stateFile=none] [seconds=95] [seed=5] [away]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave } from '../src/sim/save.js';

const [minutes = 60, file = 'none', seconds = 95, seed = 5, awayArg] = process.argv.slice(2);
const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'),
  resourceSpots: existsSync(new URL('../data/world_spots.json', import.meta.url)) ? data('data/world_spots.json') : undefined,
  frontier: { ...data('data/frontier.json'), fixtureTowns: false } });

const g = createGame(options());
let bots, log;
if (file !== 'none' && existsSync(file)) {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  bots = loadSave(g, saved.save); log = saved.log;
} else {
  const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 3000, botRyo: 3000 }, seed: Number(seed) });
  bots = makeBots(g, m.rivals);
  g.state.frontier.firstPlayerTownDay = g.state.clock.day;   // as if the player founded: the bots may go
  if (awayArg === 'away') { const h = g.state.entities[m.heroId]; g.step([{ id: h.id, type: 'expedition', action: 'walk', units: [] }]); Object.assign(h, { x: g.gate.island[0], z: g.gate.island[1], place: 'world' }); }
  log = { phases: [], marks: {}, raids: {}, last: {} };
}
const S = g.state, end = S.tick + Number(minutes) * 60 * 20, t0 = Date.now();
const hero = id => Object.values(S.entities).find(e => e.owner === id && e.type === 'hero');
const towns = id => Object.values(S.frontier.settlements).filter(s => s.owner === id && s.founded !== undefined);
const mark = (id, what) => { const m = (log.marks[id] ||= {}); if (m[what] === undefined) m[what] = Math.round(S.tick / 1200); };   // game minute
function snapshot() {
  const out = {};
  for (const c of Object.values(S.clans)) {
    const h = hero(c.id), t = towns(c.id)[0];
    if (c.permit) mark(c.id, 'permit');
    if ((c.settlersWaiting || 0) + Object.values(S.entities).filter(e => e.owner === c.id && e.type === 'settler').length >= 5) mark(c.id, 'settlers');
    if (h?.place === 'world') mark(c.id, 'island');
    if (t) mark(c.id, 'founded');
    if (t?.autoBuild) mark(c.id, 'initiative');
    if (t && (t.tier || 1) >= 2) mark(c.id, 'village');
    if (t?.buildings?.some(b => b.type === 'market' && b.stage === 'built')) mark(c.id, 'market');
    out[c.id] = { ryo: Math.round(c.ryo), biz: Object.values(S.businesses).filter(b => b.owner === c.id && !b.hideout).length, away: h?.place === 'world',
      town: t ? { tier: t.tier || 1, pop: Math.round(t.pop || 0), workers: (t.workers || []).length, built: (t.buildings || []).filter(b => b.stage === 'built').length,
        projects: (t.projects || []).length, zones: (t.grid?.zone?.match(/[hfk]/g) || []).length, timber: Math.round(t.stock?.timber || 0), stone: Math.round(t.stock?.stone || 0),
        goods: Math.round(t.stock?.goods || 0), food: Math.round(t.stock?.food || 0), doing: t.report?.doing || '' } : null };
  }
  return out;
}
const PHASE = 10 * 60 * 20;   // a report every 10 game minutes
while (S.tick < end && Date.now() - t0 < Number(seconds) * 1000) {
  const out = bots.flatMap(b => b.tick());
  g.step(out);
  if (S.tick % 20 === 0) for (const a of Object.values(S.attacks || {})) {   // each raid counted once, by defender, boss home or away
    if (a.mode !== 'raid' || !a.defender) continue;
    const key = `${a.business}:${a.clan}:${S.clock?.day}`;
    if ((log.seen ||= {})[key]) continue; log.seen[key] = 1;
    const r = (log.raids[a.defender] ||= { home: 0, away: 0 }); r[hero(a.defender)?.place === 'world' ? 'away' : 'home']++;
  }
  if (S.tick % 600 === 0 && S.tick % PHASE) snapshot();   // milestones twice a game minute
  if (S.tick % PHASE === 0) {
    const snap = snapshot(), stall = [];
    for (const [id, s] of Object.entries(snap)) {
      const p = log.last[id];
      if (s.town && p?.town && s.town.pop === p.town.pop && s.town.built === p.town.built && s.town.zones === p.town.zones && s.town.workers === p.town.workers) stall.push(`${id} town unchanged`);
      if (!s.town && p && !p.town && log.marks[id]?.permit === undefined && S.clans[id].bot) stall.push(`${id} no permit yet`);
    }
    log.phases.push({ minute: Math.round(S.tick / 1200), day: S.clock?.day, snap, stall });
    log.last = snap;
  }
}
const done = S.tick >= end;
if (file !== 'none') writeFileSync(file, JSON.stringify({ save: makeSave(g, { bots }), log }));
console.log(`minute ${Math.round(S.tick / 1200)}${done ? ' (done)' : ' (paused: run again with the same state file)'}`);
console.log('milestones (game minute):', JSON.stringify(log.marks));
console.log('raids on each clan (boss home / away):', JSON.stringify(log.raids));
for (const p of log.phases.slice(-3)) {
  console.log(`-- minute ${p.minute} day ${p.day}${p.stall.length ? ' STALL: ' + p.stall.join('; ') : ''}`);
  for (const [id, s] of Object.entries(p.snap)) console.log(`  ${id}: ryo ${s.ryo} biz ${s.biz}${s.away ? ' away' : ''}${s.town ? ` | town T${s.town.tier} pop ${s.town.pop} wk ${s.town.workers} built ${s.town.built} proj ${s.town.projects} zones ${s.town.zones} t/s/g/f ${s.town.timber}/${s.town.stone}/${s.town.goods}/${s.town.food} "${s.town.doing}"` : ''}`);
}
