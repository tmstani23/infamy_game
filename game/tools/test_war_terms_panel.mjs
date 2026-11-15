// War 8c-3: the surrender screens (war_terms_panel.js, war_surrender_foot.js, the war bar's ceasefire line): pure model and html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame } from '../src/sim/game.js';
import { setupMatch } from '../src/sim/setup_match.js';
import { makeSave, loadSave } from '../src/sim/save.js';
import { terrainAt } from '../src/sim/world_data.js';
import { townBlockersIn, cellToWorld, centreCell } from '../src/sim/frontier/town_grid.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const world = data('data/world.json'), frontier = data('data/frontier.json'), settings = data('data/settings.json');
const options = () => ({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings, world, worldChunks: data('data/world_chunks.json'), resourceSpots: data('data/world_spots.json'), resourceSpotRules: data('data/resource_spots.json'), frontier: { ...frontier, dev: true, railways: data('data/railways.json') } });
const S = frontier.war.structures;
assert.ok(S && S.townHall.length === 3 && S.wall > 0 && S.gate > 0 && S.zone.length === 3 && S.damage.melee === 1 && S.damage.ranged < 1 && S.damage.siege > 1, 'structure data block');
for (const t of Object.keys(frontier.war.buildings)) assert.ok((S.camp[t] ?? S.camp.default) > 0, `camp ${t} has health`);

const g = createGame(options());
const m = setupMatch(g, { clan: 'yakuza', difficulty: 'easy', mode: 'campaign', bots: data('data/bots.json'), spawns: options().district.spawns, test: { playerRyo: 5000 } });
const hero = g.state.entities[m.heroId], war = g.frontier.war, fw = g.frontier.world, ST = g.frontier.structures;
const rival = Object.keys(g.state.clans).find(c => c !== 'player');
const third = Object.keys(g.state.clans).find(c => c !== 'player' && c !== rival);
const open = (x, z, r) => { for (let dx = -r; dx <= r; dx += 50) for (let dz = -r; dz <= r; dz += 50) if (terrainAt(world, x + dx, z + dz) !== 'p') return false; return true; };
const spots = [];
for (let z = 500; z < world.size.h - 500 && spots.length < 2; z += 50) for (let x = 500; x < world.size.w - 500 && spots.length < 2; x += 50) {
  if (Math.hypot(x - world.capital.x, z - world.capital.z) < 1600 || spots.some(s => Math.hypot(x - s[0], z - s[1]) < 2000)) continue;
  if (open(x, z, 500)) spots.push([x, z]);
}
assert.equal(spots.length, 2, 'test spots exist');
const addTown = (id, owner, [x, z]) => fw.addTown({ id, name: id, region: null, owner, x, z, site: null, traits: { soil: 1, water: 1, defense: 1, nodes: {} }, pop: 5, stock: { ...frontier.founding.startStock, ryo: 0 }, buildings: [{ type: 'town_hall', stage: 'built', cell: 0 }] });
const enemy = addTown('enemyTown', rival, spots[0]), mine = addTown('myTown', 'player', spots[1]);
g.step([]);
const put = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
const G = enemy.grid, n = G.n, C = centreCell(n);
const WALL = C + 6, GATE = C + 6 + n, HOUSE = C - 6, STORE = C + 5 * n;
G.use = put(put(G.use, WALL, 'w'), GATE, 'g');
const house = () => { G.ground = put(G.ground, HOUSE, 'c'); G.zone = put(G.zone, HOUSE, 'h'); G.stage = put(G.stage, HOUSE, '2'); };
house();
G.use = put(G.use, STORE, 'B'); enemy.buildings.push({ type: 'storehouse', stage: 'built', cell: STORE });
const stockadeCells = [C - 5 * n, C - 5 * n + 1, C - 4 * n, C - 4 * n + 1];
for (const i of stockadeCells) G.use = put(G.use, i, 'B');
enemy.buildings.push({ id: 'stk', type: 'stockade', stage: 'built', cell: stockadeCells[0], cells: stockadeCells });
const hall = enemy.buildings.find(b => b.type === 'town_hall');
const cmd = c => { g.step([{ id: hero.id, type: 'frontier', ...c }]); return g.state.frontier.receipts.findLast(r => r.action === c.action); };


import { termsModel, termsHtml, termsCss } from '../src/war_terms_panel.js';
import { surrenderFoot } from '../src/war_surrender_foot.js';
import { warBarModel } from '../src/war_bar.js';
const WT = g.frontier.warTerms, E = g.state.entities;
const shots = [], shot = (name, html) => shots.push([name, html]);
const run = n => { for (let i = 0; i < n; i++) g.step([]); };
const start = () => { Object.assign(hero, { x: enemy.x + 300, z: enemy.z, place: 'world' }); const r = cmd({ action: 'devStartWar', town: 'enemyTown', side: 'attack' }); assert.ok(r?.ok, r?.reason); return war.warOn('enemyTown'); };
g.state.clans.player.ryo = 5000; enemy.stock.ryo = 3000;

// ---- the Surrender line ---------------------------------------------------------------------------------------
{ const a = surrenderFoot({ side: 'attacker', town: 'Holdfast', terms: false, confirm: false });
  assert.ok(a.includes('data-surrender="ask"') && !a.includes('data-surrender="yes"') && a.includes('cannot be taken back'));
  const b = surrenderFoot({ side: 'defender', town: 'Holdfast', terms: false, confirm: true });
  assert.ok(b.includes('data-surrender="yes"') && b.includes('Keep fighting') && b.includes('the town falls'));
  const c = surrenderFoot({ side: 'defender', town: 'Holdfast', terms: true, confirm: true });
  assert.ok(c.includes('data-terms="1"') && !c.includes('data-surrender'), 'during terms it only opens the window'); }

// ---- I attack and surrender: the offer face ---------------------------------------------------------------------
let w = start();
assert.equal(termsModel(g, hero.id, w), null, 'no terms, no window');
assert.equal(warBarModel(g, hero.id).eyebrow, 'War');
cmd({ action: 'warSurrender', war: w.id });
let tm = termsModel(g, hero.id, w);
assert.ok(tm && tm.face === 'offer' && !tm.waiting && tm.attacking && tm.suggest >= 0 && tm.purse === 5000, JSON.stringify(tm));
let h = termsHtml(tm, {});
assert.ok(h.includes('Offer terms') && h.includes('data-offer="1"') && h.includes('data-leave="1"') && h.includes(`Suggested: ${tm.suggest} ryo`) && h.includes('Ceasefire') && h.includes('data-clock'), 'offer face');
assert.ok(!/[←-⇿☀-➿]/.test(h), 'no special characters');
assert.ok(termsHtml(tm, { amount: '123', why: 'You have only 5 ryo' }).includes('value="123"') && termsHtml(tm, { why: 'You have only 5 ryo' }).includes('You have only 5 ryo'));
{ const b = warBarModel(g, hero.id); assert.equal(b.eyebrow, 'Ceasefire'); assert.ok(/you surrendered/.test(b.line.text) && !b.line.good, b.line.text); }
cmd({ action: 'warOffer', war: w.id, amount: 1 });
tm = termsModel(g, hero.id, w); h = termsHtml(tm, {});
assert.ok(tm.waiting && /being weighed/.test(tm.said) && /data-offer="1" disabled/.test(h) && /data-amount="1"[^>]* disabled/.test(h), 'one offer at a time: the box and button are off while it waits');
{ const r = cmd({ action: 'warOffer', war: w.id, amount: 2 }); assert.ok(!r.ok && /still being weighed/.test(r.reason)); }
shot('2 your offer waits', h);
run(20 * 4);   // the bot says no to 1 ryo
tm = termsModel(g, hero.id, w);
assert.ok(tm && !tm.waiting && /said no to 1 ryo/.test(tm.said), JSON.stringify(tm?.said));
cmd({ action: 'warLeave', war: w.id }); run(2);
assert.ok(!war.warOn('enemyTown'), 'left without terms: the war is over');
assert.equal(warBarModel(g, hero.id), null);

// ---- they defend and surrender: the answer face, then the outcome cards --------------------------------------------
run(20); enemy.cooldownUntil = 0; delete enemy.warCooldown;
for (const k of Object.keys(enemy)) if (/cooldown/i.test(k)) delete enemy[k];
if (g.state.frontier.wars?.cooldowns) g.state.frontier.wars.cooldowns = {};
w = start();
const boss = Object.values(E).find(e => e.owner === rival && e.type === 'hero') || { owner: rival };
WT.command(boss, { action: 'warSurrender', war: w.id });
tm = termsModel(g, hero.id, w); h = termsHtml(tm, {});
assert.ok(tm.face === 'answer' && tm.amount == null && h.includes('Waiting for their offer') && !h.includes('data-answer'), 'waiting for their offer');
{ const b = warBarModel(g, hero.id); assert.ok(b.eyebrow === 'Ceasefire' && b.line.good, 'their surrender reads as good news'); }
for (let i = 0; i < 20 * 8 && !w.terms?.offer; i++) g.step([]);
assert.ok(w.terms?.offer, 'the bot offers');
tm = termsModel(g, hero.id, w); h = termsHtml(tm, {});
assert.ok(tm.amount === w.terms.offer.amount && Array.isArray(tm.fair) && tm.fair[0] <= tm.fair[1], JSON.stringify(tm.fair));
assert.ok(h.includes(`<b>${tm.amount} ryo</b>`) && h.includes('Fair offer: about') && ['accept', 'no', 'never'].every(a => h.includes(`data-answer="${a}"`)), 'answer face'); shot('3 their offer', h);
cmd({ action: 'warAnswer', war: w.id, answer: 'never' });
tm = termsModel(g, hero.id, w); h = termsHtml(tm, {});
assert.ok(tm.face === 'outcome' && tm.cards.length === 3 && h.includes('is yours to take') && h.includes('Sacked in') && h.includes('data-outcome="sack"'), 'the next phase: capture, sack or burn'); shot('4 choose', h);
assert.ok(/choose what happens/.test(warBarModel(g, hero.id).line.text));
cmd({ action: 'warOutcome', war: w.id, outcome: 'sack' }); run(2);
assert.ok(!war.warOn('enemyTown'), 'sacked: the war is over');
if (process.env.DUMP) { const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.DUMP, `<!doctype html><meta charset="utf-8"><style>body{background:#1b2420;margin:0;padding:20px;display:grid;grid-template-columns:720px 720px;gap:30px}h3{color:#fff;font:14px system-ui;margin:0 0 6px}${termsCss().replaceAll('#warterms', '.wt')}.wt{position:static!important;transform:none!important;color:#eadfc6;font:13px/1.35 system-ui,sans-serif}</style>${shots.map(([n, x]) => `<div><h3>${n}</h3><div class="wt">${x}</div></div>`).join('')}`); }
console.log('war terms panel ok');
