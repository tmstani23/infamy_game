// war 8d-4: the General tab, the war alert, the watch line, the war bar's Watch button and the hidden rival strategy.
// Pure builders only (no DOM). Run: node game/tools/test_war_general_tab.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generalTab, strategyTip, keepShare, STRATEGY_NAMES } from '../src/war_general_tab.js';
import { alertHtml, watchLine, WATCH_ALLOWED, createWarWatch } from '../src/war_watch.js';
import { warBarHtml } from '../src/war_bar.js';
const rules = JSON.parse(readFileSync(new URL('../data/frontier.json', import.meta.url), 'utf8')).war.general;

// the General tab
const town = generalTab({ strategy: 'siege', rules, camp: false, town: { name: 'Holdfast', ryo: 2770, keep: 0.5 } });
for (const k of Object.keys(STRATEGY_NAMES)) assert.ok(town.includes(`data-strategy="${k}"`), `card ${k}`);
assert.equal((town.match(/class="s on"/g) || []).length, 1); assert.ok(/class="s on" data-strategy="siege"/.test(town));
assert.ok(town.includes('data-keep="1"') && town.includes('value="50"') && town.includes('keep 1385 ryo in Holdfast'));
assert.ok(town.includes('Treasury only by train, above its keep line'));   // 8e-2 (Tim 2026-11-16)
const tk = generalTab({ strategy: 'siege', rules, camp: false, town: { name: 'Holdfast', ryo: 2770, keep: 0.5 }, treasury: { ryo: 3340, keep: 1000, room: 585 }, share: 0.25 });
assert.ok(tk.includes('data-tkeep="1"') && tk.includes('value="1000"') && tk.includes('Auto orders can use 585 today'), 'the treasury keep line row');
assert.ok(generalTab({ strategy: 'rush', rules, camp: true, treasury: { ryo: 3340, keep: 1000, room: 585 } }).includes('data-tkeep'), 'at the camp too');
assert.ok(generalTab({ strategy: 'rush', rules, camp: false, town: { name: 'A', ryo: 100, keep: 0.25 }, typing: '7' }).includes('value="7"'), 'a box being typed in keeps its text');
const camp = generalTab({ strategy: 'rush', rules, camp: true });
assert.ok(!camp.includes('data-keep') && /class="s on" data-strategy="rush"/.test(camp));
for (const k of Object.keys(STRATEGY_NAMES)) for (const c of [true, false]) { const tip = strategyTip(k, rules, c); assert.ok(tip.startsWith(STRATEGY_NAMES[k]) && tip.length > 40 && !/undefined|NaN/.test(tip), `tip ${k} ${c}: ${tip}`); }
assert.equal(keepShare('50'), 0.5); assert.equal(keepShare(' 0 '), 0); assert.equal(keepShare('100'), 1);
for (const bad of ['', 'x', '-1', '101']) assert.equal(keepShare(bad), null);

// the alert and the watch line
const a = alertHtml({ town: 'Holdfast', foe: 'Kuroda clan', general: true, muster: 180, watch: true, art: 'art/buildings/war_banner.png' });
assert.ok(a.includes('War on Holdfast') && a.includes('Kuroda clan planted') && a.includes('Your general is in command.') && a.includes('Training opens in 3:00') && a.includes('data-watch') && a.includes('data-map'));
const b = alertHtml({ town: 'Holdfast', foe: 'Kuroda clan', general: false, muster: 0, watch: false });
assert.ok(b.includes('You are in command.') && !b.includes('data-watch') && !b.includes('Training opens'));
assert.ok(watchLine({ town: 'Holdfast', strategy: 'raider', general: true }).includes('Your general is in command (Raider)'));
assert.ok(watchLine({ town: 'Kurogane', strategy: 'rush', general: true, attacking: true }).includes('siege of Kurogane'));
assert.ok(WATCH_ALLOWED.has('warStrategy') && WATCH_ALLOWED.has('warAnswer') && !WATCH_ALLOWED.has('campTrain'));
const offline = createWarWatch({ game: {}, view: {}, heroId: 'h' });   // no document: a harmless stand-in
assert.equal(offline.isOn(), false); assert.deepEqual(offline.filterCommands([{ type: 'order' }]), [{ type: 'order' }]);

// the war bar
const side = { name: 'x', pct: 50, color: '#fff' };
assert.ok(warBarHtml({ title: 'Defence of Holdfast', eyebrow: 'General in command', mine: side, foe: side, war: 'w1', watch: 'watch' }).includes('data-watch="w1"'));
assert.ok(/>Back</.test(warBarHtml({ title: 't', mine: side, foe: side, war: 'w1', watch: 'back' })));
assert.ok(!warBarHtml({ title: 't', mine: side, foe: side, war: 'w1' }).includes('data-watch'));

// no special characters in the texts (Tim 2026-11-10)
for (const s of [town, camp, a, b]) assert.ok(!/[^\x00-\x7F]/.test(s), 'ascii only');
console.log('war general tab: ok');
