// Rebuilds the dev test saves from the current code, so they never go stale (frontier F0.5).
//   node game/tools/make_dev_save.mjs            -> saves/dev_classic.json, dev_frontier.json, war_test_yakuza.json, war_defend_yakuza.json
//   node game/tools/make_dev_save.mjs war_test_yakuza   -> only the saves named
// Load them from the start screen (Load game) or Settings. Add a save only with Tim's OK (max 4).
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeBots, makeSave, loadSave, heroOf } from '../src/sim/save.js';
import { makeFile, validName } from '../src/save_store.js';
import { cellToWorld, zoneStructureAt, centreCell, setUse } from '../src/sim/frontier/town_grid.js';
import { createPlacement } from '../src/sim/frontier/placement.js';
import { militaryFor } from '../src/sim/frontier/town_military.js';
import { storageCap } from '../src/sim/frontier/storage.js';

const data = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const options = { district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'),
  police: data('data/police.json'), settings: data('data/settings.json'), world: data('data/world.json'), worldChunks: data('data/world_chunks.json'), frontier: { ...data('data/frontier.json'), railways: data('data/railways.json') } };   // railways as main.js gives them
const dir = new URL('../../saves/', import.meta.url);

const SAVES = {
  // A Classic city match: Yakuza, medium, 3 clans with bots, 20 s in, spare ryo to buy and hire.
  dev_classic: { clan: 'yakuza', difficulty: 'medium', ticks: 400, playerRyo: 3000 },
  // A campaign match (the island gate is open, W3.5) with the two fixture frontier towns: First Frontier is yours, Second Frontier is the first bot clan's (F2.9, F4).
  dev_frontier: { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', ticks: 400, playerRyo: 3000, frontier: true, settlers: 6 },
  // War test (Tim 2026-11-11, replaces campaign_test_yakuza): Yakuza already at war on a rival Kuroda town out on the
  // island. The hero and his crew stand at the war camp; the camp has a barracks, rifle range, supply tents and stables
  // built, the hall upgraded, and a full chest and stores, so every roster unit can be trained at once.
  war_test_yakuza: { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 6, warTest: true },
  // Defend test (Tim 2026-11-17, replaces rail_test_kuroda): your Village-tier town Tetsumichi (founded the real way,
  // the old rail test town) with a railway station, a line to the capital, average stock and a few military
  // buildings, is under attack by a bot Kuroda camp whose camp station and spur are already linked by rail (the red
  // supply line sections stand). Pots as an average war: the camp brought the tier-2 pack, Tetsumichi put 1000 ryo
  // from its coffers in its war chest. The hero and four crew stand at the station.
  war_defend_yakuza: { clan: 'yakuza', difficulty: 'medium', mode: 'campaign', ticks: 400, realGame: true, cityMix: true, ryo: 3000, renown: 300, crew: 8, railTown: true, warDefend: true },
};

// A grown tier-2 town for the railway test: founded with the real command, then roads, buildings and zones are
// placed with the build-bar commands; projects are finished at once and the zones start grown.
function railTown(game, heroId) {
  const S = game.state, hero = S.entities[heroId], clan = S.clans[hero.owner], W = game.frontier.world, wd = options.world;
  const [gx, gz] = game.gate.island, far = s => Math.hypot(s.x - gx, s.z - gz);
  const sites = wd.sites.filter(s => far(s) > 1400 && far(s) < 2800).sort((a, b) => far(a) - far(b));
  clan.permit = true; clan.ryo = Math.max(clan.ryo, 5000);
  let town = null;
  for (const site of sites) {
    Object.assign(hero, { place: 'world', x: site.x, z: site.z }); delete hero.aboard;
    for (const u of Object.values(S.entities)) if (u.type === 'settler' && u.owner === clan.id) game.spawn && Object.assign(u, { place: 'world', x: site.x + 1, z: site.z + 1 });
    if (!Object.values(S.entities).some(u => u.type === 'settler' && u.owner === clan.id))
      for (let i = 0; i < 6; i++) game.spawn('settler', 'laborer', site.x + 1 + i * 0.7, site.z + 1.5, { owner: clan.id, place: 'world', holdFire: true, order: { kind: 'follow', target: hero.id } });
    game.areas.update(Object.values(S.entities));
    const ck = game.frontier.founding.check(hero);
    if (!ck.ok) continue;
    game.step([{ id: hero.id, type: 'frontier', action: 'found', name: 'Tetsumichi', ...ck.point }]);
    town = Object.values(S.frontier.settlements).find(t => t.owner === clan.id && t.founded);
    if (town) break;
  }
  if (!town) throw new Error('railTown: could not found a town');
  game.step([]);
  town.tier = 2;
  const g = town.grid, n = g.n, cell = (r, c) => r * n + c;
  let hall = 0, best = Infinity;
  for (let i = 0; i < n * n; i++) { const [x, z] = cellToWorld(town, i), d = Math.hypot(x - town.x, z - town.z); if (d < best) { best = d; hall = i; } }
  const hr = Math.floor(hall / n), hc = hall % n;
  const rich = () => Object.assign(town.stock, { food: 3000, timber: 3000, stone: 3000, goods: 3000, ryo: 500 });
  const cmd = c => { rich(); game.step([{ id: hero.id, type: 'frontier', town: town.id, ...c }]); };
  // roads: a cross through the hall and two side streets
  for (let d = -9; d <= 9; d++) for (const [r, c] of [[hr, hc + d], [hr + d, hc], [hr - 5, hc + d], [hr + 5, hc + d]]) if (r >= 0 && c >= 0 && r < n && c < n) cmd({ action: 'place', kind: 'road', cells: [cell(r, c)] });
  const byDist = Array.from({ length: n * n }, (_, i) => i).sort((a, b) => Math.hypot(a / n - hr, a % n - hc) - Math.hypot(b / n - hr, b % n - hc) || a - b)
    .filter(i => Math.hypot(Math.floor(i / n) - hr, i % n - hc) >= 2);
  // the lumber camp and quarry go beside the nearest trees and rocks (they are drop-offs, so the workers' trips stay short)
  const WK = game.frontier.modules.find(m => m.name === 'workers').workers, spotKinds = game.frontier.data.workers.resources;
  const nearestSpot = res => [...WK.index.byId.values()].filter(p => spotKinds[p.kind] === res).sort((a, b) => Math.hypot(a.x - town.x, a.z - town.z) - Math.hypot(b.x - town.x, b.z - town.z))[0];
  const besideSpot = res => { const p = nearestSpot(res); if (!p) return byDist;
    const d = i => { const [x, z] = cellToWorld(town, i); return Math.hypot(x - p.x, z - p.z); };
    return Array.from({ length: n * n }, (_, i) => i).filter(i => d(i) > 14).sort((a, b) => d(a) - d(b)).slice(0, 400); };
  const at = { lumber_camp: besideSpot('timber'), quarry: besideSpot('stone') };
  for (const kind of ['station', 'storehouse', 'storehouse', 'market', 'stable', 'infirmary', 'lumber_camp', 'quarry']) {
    for (const i of at[kind] || byDist) {
      if (g.use[i] !== '.' || g.zone[i] !== '.') continue;
      const before = (town.projects || []).length;
      cmd({ action: 'place', kind, cells: [i] });
      if ((town.projects || []).length > before) break;
    }
  }
  for (const p of [...(town.projects || [])]) {
    town.buildings.push({ id: W.newId('b'), type: p.type, cell: p.cell, ...(p.cells ? { cells: p.cells } : {}), stage: 'built', workers: 0, paidCost: { ...p.cost } });
    town.projects.splice(town.projects.indexOf(p), 1);
  }
  W.recount(town.id);
  // zones, nearest the hall first: housing grown to houses, workshops and fields grown
  const want = { housing: [30, '2'], work: [10, '1'], farm: [20, '1'] };
  for (const [kind, [count, stage]] of Object.entries(want)) {
    let got = 0;
    for (const i of byDist) {
      if (got >= count) break;
      if (g.use[i] !== '.' || g.zone[i] !== '.') continue;
      cmd({ action: 'zone', kind, cells: [i] });
      if (g.zone[i] !== '.') { g.stage = g.stage.slice(0, i) + stage + g.stage.slice(i + 1); got++; }
    }
  }
  town.pop = 45; town.autoBuild = true; town.focusSet = true;   // the governor has his orders (goal step)
  town.workerTraining = [...(town.workerTraining || []), ...Array.from({ length: 10 }, () => ({ id: W.newId('w'), readyAt: S.tick }))];
  (clan.milestones ||= {}).metGovernor = true;
  // stock about half full: well short of the storage caps, so no "store full" alerts and the workers have work
  const half = () => { for (const r of ['food', 'timber', 'stone', 'goods']) town.stock[r] = Math.round(Math.min(2000, storageCap(town, game.frontier.data, r) * 0.5)); town.stock.ryo = 500; };
  for (let t = 0; t < 60; t++) { rich(); game.step([]); }
  half();
  WK.assignIdle(town);
  for (let t = 0; t < 40; t++) game.step([]);
  // the hero stands by the station with four crew following
  const st = town.buildings.find(b => b.type === 'station'), [sx, sz] = game.frontier.stable.centre(town, st);
  // on open ground just outside the station's footprint (Tim 2026-11-07: he spawned inside the station), within its reach
  const open = Array.from({ length: g.n * g.n }, (_, i) => i).filter(i => !['B', 'w'].includes(g.use[i]) && g.ground?.[i] !== 'x' && !(st.cells || [st.cell]).includes(i) && !zoneStructureAt(town, i, game.frontier.data))
    .map(i => { const [x, z] = cellToWorld(town, i); return { i, x, z, d: Math.hypot(x - sx, z - sz) }; }).filter(c => c.d <= 18).sort((p, q) => p.d - q.d);
  if (!open.length) throw new Error('railTown: no open ground beside the station');
  Object.assign(hero, { place: 'world', x: open[0].x, z: open[0].z, anim: 'idle' });
  const crew = Object.values(S.entities).filter(u => u.owner === clan.id && ['thug', 'kuroda_rifleman', 'kuroda_enforcer', 'ninja'].includes(u.type) && !u.dead && game.settings.units.types[u.type] && !u.worker && !u.railGang).slice(0, 4);
  crew.forEach((u, k) => { const c = open[Math.min(k + 1, open.length - 1)]; Object.assign(u, { place: 'world', x: c.x + (k % 2 ? 1 : -1), z: c.z + 1, order: { kind: 'follow', target: hero.id } }); });
  game.areas.update(Object.values(S.entities));
  return town;
}

// Places a town building on the cell nearest `toward` (or the hall) that passes the real placement check, built at once.
function placeBuilt(game, t, kind, toward = null) {
  const F = options.frontier, S = game.state, P = createPlacement({ data: F, state: S, construction: {} }), n = t.grid.n, put = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
  const px = toward ? toward.x : t.x, pz = toward ? toward.z : t.z;
  const order = [...Array(n * n).keys()].map(i => { const [x, z] = cellToWorld(t, i); return { i, d: Math.hypot(x - px, z - pz), h: Math.hypot(x - t.x, z - t.z) }; })
    .filter(c => c.h > 22).sort((a, b) => a.d - b.d || a.i - b.i);
  for (const { i } of order) {
    const r = P.check(t, { kind, cells: [i] });
    if (!r.ok) { if (/^(Needs|A town has|Your clan|town hall tier)/.test(r.reason)) return false; continue; }
    for (const c of r.cells) { t.grid.ground = put(t.grid.ground, c, 'c'); setUse(t, c, 'B'); t.grid.by = put(t.grid.by, c, 'g'); }
    t.buildings.push({ id: game.frontier.world.newId('b'), type: kind, cell: r.cells[0], cells: r.cells, ...(r.rot !== undefined ? { rot: r.rot } : {}), stage: 'built', workers: 0, paidCost: { ...((F.buildings[kind] || {}).cost || {}) } });
    game.frontier.world.recount?.(t.id);
    return true;
  }
  return false;
}
// Lays a done rail line from a town (or a camp node) the real way (ordered by the command), then finishes it at once.
function layLine(game, hero, from, to, payStock = null) {
  const S = game.state, links = () => Object.values(S.frontier.rail?.links || {});
  if (!from.startsWith('camp:')) { const s = S.frontier.settlements[from], keep = { ...s.stock }; Object.assign(s.stock, { timber: 9000, stone: 9000, goods: 9000 });
    game.step([{ id: hero.id, type: 'frontier', action: 'rail', mode: 'link', town: from, to }]); Object.assign(s.stock, keep); }
  else for (let i = 0; i < 40 && !links().some(l => l.from === from); i++) game.step([]);   // a camp orders its own spur (rail.js campSpurs)
  const l = links().find(x => x.owner === hero.owner && x.from === from && x.to === to && !x.done);
  if (!l) throw new Error(`layLine: no line ${from} to ${to}: ${S.clans[hero.owner]?.notice?.text || ''}`);
  if (payStock) { const per = options.frontier.railways.link.campCostPer100 || {}; l.spent = {}; for (const [r, n] of Object.entries(per)) { const k = Math.ceil(n * l.length / 100); l.spent[r] = k; payStock[r] = Math.max(0, (payStock[r] || 0) - k); } }
  l.paid = l.length; l.built = l.length - 0.01;
  for (let i = 0; i < 200 && !l.done; i++) game.step([]);
  if (!l.done) throw new Error(`layLine: ${from} to ${to} did not finish`);
  return l;
}
// The defend test: a bot Kuroda town with a station and line, its hero plants the banner by Tetsumichi with the
// tier-2 war pack; its camp gets a barracks and a camp station built with the real command, the spur laid and paid.
function warDefend(game, heroId) {
  const S = game.state, hero = S.entities[heroId], F = options.frontier, W = F.war, wd = options.world, war = game.frontier.war;
  const town = Object.values(S.frontier.settlements).find(t => t.owner === hero.owner && t.founded);
  // average town stock (as tools/soak_war.mjs SIZES.average) and a line to the capital
  const cap = r => storageCap(town, game.frontier.data, r);
  Object.assign(town.stock, { food: Math.min(3000, cap('food')), timber: Math.min(1500, cap('timber')), stone: Math.min(800, cap('stone')), goods: Math.min(300, cap('goods')), ryo: 2500 });
  layLine(game, hero, town.id, 'capital');
  for (const kind of ['barracks', 'rifle_range', 'watchtower', 'watchtower', 'supply_tents']) if (!placeBuilt(game, town, kind)) throw new Error('war_defend_yakuza: no room for a ' + kind);
  // the Kuroda attacker: a Village-tier town 1300 to 2000 off, with a railway station and a line to the capital
  const rival = Object.keys(S.clans).find(id => id !== hero.owner && S.clans[id].faction === 'kuroda') || Object.keys(S.clans).find(id => id !== hero.owner);
  const rh = Object.values(S.entities).find(e => e.type === 'hero' && e.owner === rival);
  const gap = s => Math.min(...Object.values(S.frontier.settlements).filter(t => Number.isFinite(t.x) && t !== town).map(t => Math.hypot(t.x - s.x, t.z - s.z)), Infinity);
  const [gx, gz] = game.gate.island;
  const site = wd.sites.map(s => ({ s, d: Math.hypot(s.x - town.x, s.z - town.z) })).filter(o => o.d >= 1300 && o.d <= 2000 && gap(o.s) >= 900 && Math.hypot(o.s.x - gx, o.s.z - gz) > 900).sort((a, b) => a.d - b.d)[0]?.s;
  if (!site) throw new Error('war_defend_yakuza: no site for the Kuroda town');
  const rt = game.frontier.world.addTown({ id: 'war_defend_town', name: 'Kurosaki', region: null, owner: rival, x: site.x, z: site.z, site: site.id ?? null,
    traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 25, stock: { food: 2000, timber: 1500, stone: 900, goods: 300, ryo: 3000 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
  game.step([]);
  rt.tier = 2; rt.founded = (S.tick ?? 0) - 12000 * 4;
  if (!placeBuilt(game, rt, 'station', town)) throw new Error('war_defend_yakuza: no room for the Kurosaki station');
  layLine(game, rh, rt.id, 'capital');
  // the banner by Tetsumichi, on its Kurosaki side, with the pack a bot takes to a tier-2 town
  const pack = W.general.attack.packByTier?.[Math.min(2, Math.max(1, town.tier || 1)) - 1] || W.general.attack.pack;
  S.clans[rival].warPack = { ...pack };
  const [inner, outer] = war.band(town), mid = (inner + outer) / 2, base = Math.atan2(rt.z - town.z, rt.x - town.x);
  let rec = null;
  for (let a = 0; a < 24 && !rec; a++) {
    const ang = base + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * Math.PI / 12, x = Math.round(town.x + Math.cos(ang) * mid), z = Math.round(town.z + Math.sin(ang) * mid);
    Object.assign(rh, { place: 'world', area: 'world', x: x + 3, z }); delete rh.aboard;
    if (!war.check(rh, town.id, { x, z }).ok) continue;
    game.step([{ id: rh.id, type: 'frontier', action: 'plantBanner', town: town.id, x, z }]);
    rec = war.warOn(town.id);
  }
  if (!rec) throw new Error('war_defend_yakuza: could not start the war');
  delete S.clans[rival].warPack;
  // the camp: a barracks and the camp station, paid from the pack and built at once; then the spur, paid from the camp stores
  const hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  const place = kind => {
    for (const d of [40, 60, 80, 100]) for (let a = 0; a < 24; a++) {
      const r = war.campCheck(rec.id, kind, { x: hall.x + Math.cos(a * Math.PI / 12) * d, z: hall.z + Math.sin(a * Math.PI / 12) * d });
      if (!r.ok) continue;
      game.step([{ id: rh.id, type: 'frontier', action: 'campPlace', war: rec.id, kind, ...r.point }]);
      const b = rec.camp.buildings.at(-1);
      if (b.type === kind && b.stage === 'site') { b.stage = 'built'; delete b.progress; delete b.need; return b; }
    }
    throw new Error(`war_defend_yakuza: no room for a camp ${kind} (${JSON.stringify(rec.camp.stock)}, chest ${rec.camp.chest})`);
  };
  place('barracks'); place('camp_station');
  layLine(game, rh, `camp:${rec.id}`, rt.id, rec.camp.stock);
  for (let i = 0; i < 40; i++) game.step([]);   // the marked rail sections appear (rail.js campLines)
  if (!rec.camp.station?.linked || !rec.camp.buildings.some(b => b.type === 'rail_section')) throw new Error('war_defend_yakuza: the camp spur is not linked: ' + JSON.stringify(rec.camp.station));
  // Tetsumichi puts 1000 ryo from its coffers in its war chest
  rec.defense = { ...(rec.defense || {}), chest: (rec.defense?.chest || 0) + 1000, put: (rec.defense?.put || 0) + 1000 };
  town.stock.ryo = Math.max(0, (town.stock.ryo || 0) - 1000);
  game.areas.update(Object.values(S.entities));
  return rec;
}

// The war test: a rival town on open ground far from the capital, the real banner planted next to it (the hero's
// war pack), then the camp buildings placed with the real command and finished at once.
function warTest(game, heroId) {
  const S = game.state, hero = S.entities[heroId], W = options.frontier.war, wd = options.world, war = game.frontier.war;
  const rival = Object.keys(S.clans).find(id => id !== hero.owner && S.clans[id].faction === 'kuroda') || Object.keys(S.clans).find(id => id !== hero.owner);
  const [gx, gz] = game.gate.island, far = s => Math.hypot(s.x - gx, s.z - gz);
  const sites = wd.sites.filter(s => far(s) > 1400 && far(s) < 2800).sort((a, b) => far(a) - far(b));
  let rec = null;
  for (const site of sites) {
    if (Object.values(S.frontier.settlements).some(t => Math.hypot(t.x - site.x, t.z - site.z) < 1600)) continue;
    const town = game.frontier.world.addTown({ id: 'war_test_town', name: 'Kurogane', region: null, owner: rival, x: site.x, z: site.z, site: site.id ?? null,
      traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 8, stock: { food: 300, timber: 300, stone: 300, goods: 200, ryo: 600 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
    game.step([]);   // the hub gives the town its grid
    const [inner, outer] = war.band(town), mid = (inner + outer) / 2;
    S.clans[hero.owner].warPack = { ryo: 5000, timber: 3000, stone: 2000 };
    for (let a = 0; a < 16 && !rec; a++) {
      const x = Math.round(town.x + Math.cos(a * Math.PI / 8) * mid), z = Math.round(town.z + Math.sin(a * Math.PI / 8) * mid);
      Object.assign(hero, { place: 'world', area: 'world', x: x + 3, z }); delete hero.aboard;
      if (!war.check(hero, town.id, { x, z }).ok) continue;
      game.step([{ id: hero.id, type: 'frontier', action: 'plantBanner', town: town.id, x, z }]);
      rec = war.warOn(town.id);
    }
    if (rec) break;
    delete S.frontier.settlements.war_test_town;
  }
  if (!rec) throw new Error('war_test_yakuza: could not start the war');
  // war 8a: a second small Kuroda town far off (Kuroiwa). A clan's last town can only be sacked, so with one more
  // the outcome picker at Kurogane offers Capture and Burn too.
  { const gap = s => Math.min(...Object.values(S.frontier.settlements).filter(t => Number.isFinite(t.x)).map(t => Math.hypot(t.x - s.x, t.z - s.z)));
    const other = wd.sites.filter(s => far(s) > 900 && gap(s) >= 700).sort((a, b) => gap(b) - gap(a))[0];
    if (!other) throw new Error('war_test_yakuza: no site for the second rival town');
    game.frontier.world.addTown({ id: 'war_test_town2', name: 'Kuroiwa', region: null, owner: rival, x: other.x, z: other.z, site: other.id ?? null,
      traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { food: 300, timber: 200, stone: 200, goods: 100, ryo: 300 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] }); }
  // Kurogane gets grown houses and workshops, so the defender's archers have somewhere to garrison (7c-3b)
  { const G = S.frontier.settlements.war_test_town.grid, n = G.n, C = centreCell(n), put = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
    const want = [['h', 2], ['h', 2], ['h', 3], ['h', 2], ['k', 1], ['k', 1]]; let k = 0;
    for (let r = 3; r <= 7 && k < want.length; r += 2) for (let a = 0; a < 8 && k < want.length; a++) {
      const dx = Math.round(Math.cos(a * Math.PI / 4) * r), dz = Math.round(Math.sin(a * Math.PI / 4) * r), i = C + dz * n + dx;
      if (G.ground[i] === 'x' || G.use[i] !== '.' || G.zone[i] !== '.') continue;
      G.ground = put(G.ground, i, 'c'); G.zone = put(G.zone, i, want[k][0]); G.stage = put(G.stage, i, String(want[k][1])); G.by = put(G.by, i, 'g'); k++;
    }
    if (k < want.length) throw new Error('war_test_yakuza: no room for Kurogane houses'); }
  // war 8b (Tim 2026-11-15): Kurogane gets everything a defending town can have at this point: tier 2 (Village), the
  // town hall war upgrade, a stockade and a stable, and every military building its clan may build up to the war
  // limits, all built; and 1500 ryo in the defender's war chest. (The Kuroda bot trains with them from 8d.)
  { const t = S.frontier.settlements.war_test_town, F = options.frontier, P = createPlacement({ data: F, state: S, construction: {} });
    t.tier = 2; t.warHall = true; t.pop = Math.max(t.pop || 0, 20);
    const C = centreCell(t.grid.n), n = t.grid.n, order = [...Array(n * n).keys()].sort((a, b) => Math.hypot(a % n - C % n, Math.floor(a / n) - Math.floor(C / n)) - Math.hypot(b % n - C % n, Math.floor(b / n) - Math.floor(C / n)) || a - b);
    const put = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);
    const build = kind => {
      for (const i of order) {
        const r = P.check(t, { kind, cells: [i] });
        if (!r.ok) { if (/^(Needs|A town has|Your clan|town hall tier)/.test(r.reason)) return false; continue; }
        for (const c of r.cells) { t.grid.ground = put(t.grid.ground, c, 'c'); setUse(t, c, 'B'); t.grid.by = put(t.grid.by, c, 'g'); }
        t.buildings.push({ id: game.frontier.world.newId('b'), type: kind, cell: r.cells[0], cells: r.cells, stage: 'built', workers: 0, paidCost: { ...(F.buildings[kind].cost || {}) } });
        return true;
      }
      return false;
    };
    const wanted = ['stockade', 'stable', ...['barracks', 'rifle_range', 'clan_hall', 'kennel', 'hidden_dojo', 'foundry', 'armory', 'field_clinic', 'supply_tents', 'watchtower'].filter(k => militaryFor(t, F, S).includes(k))];
    for (const kind of wanted) { const max = F.war.buildings[kind]?.max ?? 1; let k = 0; while (k < max && build(kind)) k++; if (!k) throw new Error(`war_test_yakuza: no room for a ${kind} in Kurogane`); }
    game.frontier.world.recount?.(t.id);
    rec.defense = { chest: 1500, put: 1500 }; }
  delete S.clans[hero.owner].warPack;
  const hall = rec.camp.buildings.find(b => b.type === 'camp_hall');
  // 7c (Tim 2026-11-12): the war test starts with only the camp hall (tier 1) and enough ryo, timber and stone to build everything
  const place = kind => {
    for (const d of [40, 60, 80, 100, 120]) for (let a = 0; a < 24; a++) {
      const r = war.campCheck(rec.id, kind, { x: hall.x + Math.cos(a * Math.PI / 12) * d, z: hall.z + Math.sin(a * Math.PI / 12) * d });
      if (!r.ok) continue;
      game.step([{ id: hero.id, type: 'frontier', action: 'campPlace', war: rec.id, kind, ...r.point }]);
      const b = rec.camp.buildings.at(-1);
      if (b.type === kind && b.stage === 'site') { b.stage = 'built'; b.progress = b.need; return; }
    }
    throw new Error('war_test_yakuza: no room for ' + kind);
  };
  for (const kind of []) place(kind);   // buildings to start with, built at once (none: Tim builds the camp himself)
  for (const w of rec.camp.workers) delete w.project;
  rec.camp.chest = 40000; Object.assign(rec.camp.stock, { timber: 12000, stone: 10000 });
  // the hero and his crew by the camp hall
  Object.assign(hero, { x: hall.x + 6, z: hall.z + 4 });
  let k = 0;
  for (const u of Object.values(S.entities)) if (u.owner === hero.owner && u.order?.kind === 'follow' && u.order.target === hero.id) {
    Object.assign(u, { place: 'world', area: 'world', x: hall.x + 8 + (k % 4) * 1.2, z: hall.z + 6 + Math.floor(k / 4) * 1.2 }); delete u.aboard; k++;
  }
  // Tim 2026-11-14: the hero's horse (Black Beauty, H) and one for each of his crew (Mount up, Shift+H) wait by the hall
  { const n = 1 + k; for (let i = 0; i < n; i++) (S.frontier.bornHorses ||= []).push({ owner: hero.owner, kind: i ? 'calico' : 'black_beauty', x: hall.x + 4 + i * 2.6, z: hall.z + 11, stable: 'capital', town: 'capital' }); }
  game.areas.update(Object.values(S.entities));
  for (let i = 0; i < 20; i++) game.step([]);
}

// Shares out the free businesses (the kinds that give crew room) between the clans that may hold them (the
// Shinobi clan holds none; its crew room comes from Renown). Biggest first, snake order, so the shares stay even.
function shareCity(game) {
  const room = game.settings.units.rules.capPerBusiness, ids = Object.keys(game.state.clans).filter(id => game.state.clans[id].kind !== 'ninja');
  const free = Object.values(game.state.businesses).filter(b => !b.owner && room[b.kind]).sort((a, b) => room[b.kind] - room[a.kind] || a.id.localeCompare(b.id));
  free.forEach((b, i) => { const lap = Math.floor(i / ids.length), k = i % ids.length; game.clans.setOwner(b.id, ids[lap % 2 ? ids.length - 1 - k : k]); });
}

// Tops every clan up to the spec's ryo, Renown and crew (crew spawn by the hero, following him).
function readyClans(game, spec) {
  for (const clan of Object.values(game.state.clans)) {
    clan.ryo = Math.max(clan.ryo || 0, spec.ryo); clan.renown = Math.max(clan.renown || 0, spec.renown);
    const hero = Object.values(game.state.entities).find(e => e.owner === clan.id && e.type === 'hero');
    const type = clan.kind === 'ninja' ? 'ninja' : 'thug', sprite = game.settings.units.types[type].sprite;
    for (let k = game.clans.crewCount(clan.id); k < spec.crew; k++) {
      const spot = game.nav.nearestFree(hero.x + 1 + k * 0.7, hero.z + 1);
      if (spot) game.spawn(type, sprite, ...spot, { owner: clan.id, order: { kind: 'follow', target: hero.id } });
    }
  }
}

export function build(name, spec) {
  // the rail save needs the island's resource spots (as main.js loads them) so workers have work and camps sit by them
  const spots = spec.railTown || spec.warDefend ? { resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json') } : {};
  const game = createGame(spec.realGame ? { ...options, ...spots, frontier: { ...options.frontier, fixtureTowns: false } } : options);   // E6b: real games have no fixture towns
  const m = setupMatch(game, { clan: spec.clan, difficulty: spec.difficulty, mode: spec.mode, bots: data('data/bots.json'),
    spawns: options.district.spawns, test: { playerRyo: spec.playerRyo } });
  game.civilians.populate();
  if (spec.cityMix) shareCity(game);
  if (spec.crew) readyClans(game, spec);
  const bots = makeBots(game, m.rivals);
  for (let i = 0; i < spec.ticks; i++) game.step(bots.flatMap(b => b.tick()));
  if (spec.railTown) railTown(game, m.heroId);
  if (spec.warTest) warTest(game, m.heroId);
  if (spec.warDefend) warDefend(game, m.heroId);
  if (spec.frontier) game.frontier.world.assignStartOwners({ player: 'player', bot: m.rivals[0]?.clan });
  // E2: settlers waiting round the hero, following him (dev travel on the World map takes them along), so founding can be tried at once.
  if (spec.settlers) game.state.clans.player.permit = true;   // E1: founding needs a permit (Land Office); the dev save holds one
  if (spec.settlers) { const h = game.state.entities[m.heroId]; for (let i = 0; i < spec.settlers; i++) game.spawn('settler', 'laborer', h.x + 1.5 + i * 0.7, h.z + 1.5, { owner: 'player', holdFire: true, order: { kind: 'follow', target: h.id } }); }
  const save = makeSave(game, { bots });
  return makeFile(save, { clan: game.state.clans.player?.kind ?? spec.clan, mode: game.state.match.mode, label: `Dev: ${name}`, day: game.state.clock?.day });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('make_dev_save.mjs')) {
  mkdirSync(dir, { recursive: true });
  const only = process.argv.slice(2);
  for (const [name, spec] of Object.entries(SAVES)) {
    if (only.length && !only.includes(name)) continue;
    if (!validName(name)) throw new Error('Bad save name ' + name);
    const file = build(name, spec), path = new URL(name + '.json', dir), tmp = new URL(name + '.json.tmp', dir);
    writeFileSync(tmp, JSON.stringify(file)); renameSync(tmp, path);
    // proves the F1 loader accepts it, as the Load menu would
    const g = createGame(options); loadSave(g, JSON.parse(readFileSync(path, 'utf8')));
    if (heroOf(g) == null) throw new Error(name + ' has no hero');
    console.log(`${name}: ok (tick ${file.tick}, hero ${heroOf(g)})`);
  }
}
