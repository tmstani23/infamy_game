// Field guide (2026-11-25): every number on the page comes from the data, and every damage kind in the
// tables has a named row. Run: node tools/test_field_guide.mjs
import { readFileSync } from 'node:fs';
import { fieldGuideData, fieldGuideHtml, KNOWN_KINDS } from '../src/field_guide.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const frontier = read('../data/frontier.json'), units = read('../data/units.json');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const W = frontier.war, D = W.structures.damage, H = W.ships.hullDamage, pct = f => Math.round(f * 100);

const g = fieldGuideData(frontier, units), row = k => g.rows.find(r => r.k === k);
ok(g.rows.map(r => r.k).join() === 'siege,melee,ranged,gatling,bomb,torch', `rows in order: ${g.rows.map(r => r.k)}`);

// every damage kind in the two tables has a named row (add a name and icon in field_guide.js when this fails)
const kinds = t => Object.keys(t).filter(k => !k.startsWith('_') && typeof t[k] === 'number');
for (const k of new Set([...kinds(D), ...kinds(H)])) ok(KNOWN_KINDS.includes(k), `damage kind "${k}" has a field guide row`);
ok(!g.rows.some(r => r.unknown), 'no unnamed rows');

// the numbers match the tables
for (const k of ['melee', 'ranged', 'bomb']) {
  ok(row(k).cells.wood.pct === pct(D[k]), `${k} vs wood ${row(k).cells.wood.pct}%`);
  ok(row(k).cells.ships.pct === pct(H[k]), `${k} vs ships ${row(k).cells.ships.pct}%`);
}
ok(row('siege').cells.wood.pct === pct(D.siege) && row('siege').cells.stone.pct === pct(D.siege), 'cannons vs wood and stone');
ok(row('siege').cells.ships.pct === pct(H.siege), 'cannons vs ships');
ok(row('bomb').cells.stone.pct === pct(D.bomb * W.structures.stone.bomb), `fire-bombs vs stone ${row('bomb').cells.stone.pct}%`);
ok(row('bomb').cells.wood.fire && !row('bomb').cells.stone.fire, 'fire-bombs light wood, not stone');
ok(row('gatling').cells.ships.pct === pct(H.gatling) && row('gatling').cells.wood.pct === pct(D.ranged), 'gatling vs ships and wood (counts as ranged on buildings)');
const shares = [W.buildings.cannon_tower.fire.unitShare, W.ships.guns.broadside.unitShare, units.types.field_cannon.unitShare];
const t = row('siege').cells.troops;
ok(t.pct === pct(Math.min(...shares)) && (t.to ?? t.pct) === pct(Math.max(...shares)), `cannons vs troops ${t.pct}%${t.to ? ` to ${t.to}%` : ''} (unitShare)`);
ok(row('torch').cells.troops.none && row('torch').cells.wood.fire && row('torch').cells.ships.none, 'torch: fire on buildings, nothing else');
ok(g.notes.fireDamage === W.structures.fire.damage, `fire ${g.notes.fireDamage} a second`);
ok(g.notes.armory.startsWith(`${pct(W.armory.step)}% less per level against Troops`), `armory note: ${g.notes.armory}`);
ok(units.types.hero.frontierDamage !== 2 || g.notes.hero.includes('twice'), `hero note: ${g.notes.hero}`);

// it follows a change in the data, and a new kind still shows
const changed = structuredClone(frontier); changed.war.ships.hullDamage.ranged = 0.5; changed.war.structures.damage.poison = 2;
const g2 = fieldGuideData(changed, units);
ok(g2.rows.find(r => r.k === 'ranged').cells.ships.pct === 50, 'a changed table value shows');
ok(g2.rows.find(r => r.k === 'poison')?.cells.wood.pct === 200, 'an unknown damage kind still gets a plain row');

// the page: the numbers are printed, extra hits get the loop, weak hits fade
const html = fieldGuideHtml(g);
ok(html.includes(`${pct(D.siege)}%`) && html.includes('fg-loop'), 'cannons printed with a loop');
ok((html.match(/class="hi/g) || []).length === g.rows.flatMap(r => Object.values(r.cells)).filter(c => c.pct > 100).length, 'every extra hit is marked');
ok(html.includes(`${W.structures.fire.damage} damage a second`), 'fire damage printed');
ok(!/[^\x20-\x7e\n]/.test(html), 'no special characters');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
