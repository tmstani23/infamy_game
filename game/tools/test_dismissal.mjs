// Dismissal refunds, clinic releases, and their confirmation controls.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createHireMenu } from '../src/hire_menu.js';
import { createClinicMenu } from '../src/clinic_menu.js';
import { DISMISS_REFUND_SHARE } from '../src/sim/clans.js';

const data = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url)));
const g = createGame({ district: data('data/port_town.json'), catalog: data('data/art.json'), cutouts: data('art/cutouts.json'),
  interiors: data('data/interiors.json'), parts: data('data/interior_parts.json'), recipes: data('data/room_recipes.json'),
  units: data('data/units.json'), civilians: data('data/civilians.json'), bandits: data('data/bandits.json'), police: data('data/police.json'),
  settings: { ...data('data/settings.json'), dayNight: { auto: false } } });
g.clans.addClan('player', { ryo: 1000 });
g.clans.addClan('enemy');
const home = Object.values(g.state.businesses).find(b => b.hideout === 'player');
const room = g.rooms.find(r => r.name === home.room);
const hero = g.spawn('hero', 'ronin', room.spawn.x, room.spawn.z, { owner: 'player', place: room.name });
const crew = g.spawn('thug', 'thug', -4, 0, { owner: 'player' });
const enemy = g.spawn('thug', 'thug', -3, 0, { owner: 'enemy' });
const S = g.state.entities, clan = g.state.clans.player;

// At the home hideout, only full-health active crew can be dismissed; refund is 15% of base hire cost.
const before = clan.ryo, count = g.clans.crewCount('player');
assert.equal(g.clans.dismiss(S[hero], crew, home.id), `Thug dismissed · ${Math.floor(data('data/units.json').types.thug.price * DISMISS_REFUND_SHARE)} ryo refunded`);
assert.equal(S[crew], undefined);
assert.equal(clan.ryo - before, Math.floor(data('data/units.json').types.thug.price * DISMISS_REFUND_SHARE));
assert.equal(g.clans.crewCount('player'), count - 1);

const hurt = g.spawn('thug', 'thug', -5, 0, { owner: 'player' });
S[hurt].hp--;
assert.match(g.clans.dismiss(S[hero], hurt, home.id), /Only healthy/);
assert.ok(S[hurt], 'hurt crew remains');
S[hurt].hp = S[hurt].maxHp;
assert.match(g.clans.dismiss(S[hero], enemy, home.id), /Only healthy/);
assert.ok(S[enemy], 'foreign crew remains');
assert.match(g.clans.dismiss(S[hero], hurt, 'not-a-hideout'), /inside your own hideout/);
const tea = Object.values(g.state.businesses).find(b => b.kind === 'teahouse');
assert.match(g.clans.dismiss(S[hero], hurt, tea.id), /inside your own hideout/);
Object.assign(S[hero], { place: 'street', x: 0, z: 0 });
assert.match(g.clans.dismiss(S[hero], hurt, home.id), /inside your own hideout/);
Object.assign(S[hero], { place: room.name, x: room.spawn.x, z: room.spawn.z });
g.state.clans.enemy.bot = true;
const botHero = g.spawn('hero', 'ronin', room.spawn.x, room.spawn.z, { owner: 'enemy', place: room.name });
assert.equal(g.clans.dismiss(S[botHero], enemy, home.id), null, 'bots cannot use the player dismissal API');

// Clinic release removes the patient and frees capacity with no payment or spawn.
clan.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 0, cost: 15 });
const money = clan.ryo, patientCount = g.clans.crewCount('player');
assert.equal(g.clans.releasePatient(S[hero], 0), 'Thug released from the clinic');
assert.equal(clan.clinic.length, 0);
assert.equal(clan.ryo, money);
assert.equal(g.clans.crewCount('player'), patientCount - 1);
assert.equal(g.clans.releasePatient(S[hero], 0), null, 'invalid index ignored');

// UI confirmation sends the agreed commands without an extra dialog.
const panel = () => { const handlers = {}; return { hidden: true, innerHTML: '', addEventListener: (k, f) => handlers[k] = f, click: target => handlers.click({ target }) }; };
const hirePanel = panel(), hireSent = [];
const hire = createHireMenu({ panel: hirePanel, money: { textContent: '' }, game: g, units: data('data/units.json'), heroId: hero, send: c => hireSent.push(c) });
hire.toggle();
const nextCrew = g.spawn('thug', 'thug', -2, 0, { owner: 'player' });
hire.update();
const dismissButton = { closest: () => ({ dataset: { dismiss: nextCrew } }), blur() {} };
hirePanel.click(dismissButton); hirePanel.click(dismissButton);
assert.deepEqual(hireSent[0], { id: hero, type: 'dismiss', unit: nextCrew, business: home.id });

const clinicDoor = g.doors.find(d => d.menu === 'clinic');
Object.assign(S[hero], { place: 'street', x: clinicDoor.x, z: clinicDoor.z });
clan.clinic.push({ unit: 'thug', model: 'thug', kind: 'recover', left: 0, cost: 15 });
const clinicPanel = panel(), clinicSent = [];
const clinic = createClinicMenu({ panel: clinicPanel, game: g, heroId: hero, send: c => clinicSent.push(c) });
clinic.toggle();
const releaseButton = { closest: () => ({ dataset: { release: '0' } }), blur() {} };
clinicPanel.click(releaseButton); clinicPanel.click(releaseButton);
assert.deepEqual(clinicSent[0], { id: hero, type: 'clinic', action: 'release', patient: 0 });
console.log('dismissal, release and confirmation controls passed');
