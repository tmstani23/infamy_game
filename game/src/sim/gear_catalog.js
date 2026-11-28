// Single source for active gear, shop prices, consumables and loot rates.
// CURRENT_ITEMS are legacy starters; compiled ITEMS also include shop/drop gear.
export const INVENTORY_SLOTS = 12;
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory', 'relic'];   // relic: world variety P4 (2026-11-27)
export const GEAR = {
  weighted_edge: { name: 'Weighted edge', slot: 'weapon', about: '+8% normal-hit power; 6% longer attack interval.', modifiers: { damage: 1.08, attackInterval: 1.06 }, glow: [1, .52, .18], visual: { kind: 'weaponEmbers', color: [1,.52,.18] } },
  light_lamellar: { name: 'Light lamellar', slot: 'armor', about: '6% less incoming damage; 5% slower running.', modifiers: { damageTaken: .94, run: .95 }, visual: { kind: 'armorShimmer', color: [.65,.8,.85] } },
  scouts_knot: { name: 'Scout’s knot', slot: 'accessory', about: '+5% run speed; 3% more incoming damage.', modifiers: { run: 1.05, damageTaken: 1.03 }, visual: { kind: 'movementWisps', color: [.5,.8,.65] } },
  honed_weapon: { name: 'Honed weapon', slot: 'weapon', buy: 150, sell: 40, bonuses: { normalDamage: .05 }, visual: { kind: 'weaponGlint', color: [.8,.9,1] } },
  balanced_weapon: { name: 'Balanced weapon', slot: 'weapon', buy: 150, sell: 40, bonuses: { normalAttackRate: .05 }, visual: { kind: 'weaponTrail', color: [.5,.75,1] } },
  reinforced_coat: { name: 'Reinforced coat', slot: 'armor', buy: 150, sell: 40, bonuses: { maxHpFlat: 30 }, visual: { kind: 'armorShimmer', color: [.85,.7,.4] } },
  lightweight_wraps: { name: 'Lightweight wraps', slot: 'armor', buy: 150, sell: 40, bonuses: { dodgeChanceFlat: .03 }, visual: { kind: 'bodyOutline', color: [.65,.85,.8] } },
  travelers_charm: { name: 'Traveler’s charm', slot: 'accessory', buy: 200, sell: 50, bonuses: { movement: .05 }, visual: { kind: 'movementWisps', color: [.45,.8,.7] } },
  focus_charm: { name: 'Focus charm', slot: 'accessory', buy: 200, sell: 50, bonuses: { cooldownReduction: .05 }, visual: { kind: 'accessoryAura', color: [.65,.4,.9] } },
};
export const CURRENT_ITEM_IDS = ['weighted_edge', 'light_lamellar', 'scouts_knot'];
export const CURRENT_ITEMS = Object.fromEntries(CURRENT_ITEM_IDS.map(id => [id, GEAR[id]]));
export const SHOP_ITEM_IDS = ['honed_weapon', 'balanced_weapon', 'reinforced_coat', 'lightweight_wraps', 'travelers_charm', 'focus_charm'];
export const RARITIES = {
  common: { name: 'Common', bonusScale: 1, visualStrength: 1 },
  green: { name: 'Green', bonusScale: 1.25, visualStrength: 1.4, color: [.35,.85,.45] },
  frontier: { name: 'Frontier', bonusScale: 1, visualStrength: 1.6, color: [.85,.68,.42] },   // wildlife W7: wolf and bear gear
  heirloom: { name: 'Heirloom', bonusScale: 1, visualStrength: 2, color: [.95,.8,.35] },     // a fallen castle's blade
  relic: { name: 'Relic', bonusScale: 1, visualStrength: 0, color: [.78,.3,.2] },              // a guarded place's find (world variety P4)
};
// bonusScale multiplies the BONUS, not the full stat: +5% becomes +6.25%.
// Every item requires a visible equipment effect; sprite variants are optional.
export const GEAR_VISUALS = { required: true, equippedOnly: true, preserveClanSignature: true,
  prioritizeSilhouette: true, physicalSpriteVariants: false };
export const LOOT = {
  accomplishments: {
    banditCamp: { first: .40, repeat: .10 },
    rivalHero: { first: 1, repeat: .15 },
    businessRaid: { first: .35, repeat: .15 },
  },
  bodies: { bandit: .05, enemyCrew: .10, enemyHero: .20 },
  slots: { weapon: .40, armor: .35, accessory: .25 },
  itemSelection: 'equalWithinSlot', rarity: 'green',
  rules: { oneBodyClaim: true, revivedEnemiesEligible: false, arrangedRepeatKillsEligible: false,
    heroAccomplishmentReplacesBodyRoll: true, campOrRaidCanAlsoHaveBodyLoot: true,
    saveClaimHistory: true, civiliansEligible: false, policeEligible: false },
};
export const CONSUMABLES = {
  bandage: { name: 'Field bandage', status: 'approvedDefinition', buy: 25, carryLimit: 2,
    healMaxHpShare: .25, channelSeconds: 6, cooldownSeconds: 60, cooldownGroup: 'healing',
    consumeAt: 'start', interruptOn: ['damage','movement','attack'], heroOnly: true, revives: false,
    visual: { kind: 'healingThreads', color: [.5,.85,.65] } },
  fleetfoot_tea: { name: 'Fleetfoot tea', status: 'proposal', movementBonus: .10, seconds: 8,
    cooldownSeconds: 60, cooldownGroup: 'movement', heroOnly: true,
    visual: { kind: 'movementWisps', color: [.5,.85,.65] } },
  warding_incense: { name: 'Warding incense', status: 'proposal', damageReduction: .10, seconds: 5,
    cooldownSeconds: 90, cooldownGroup: 'defense', heroOnly: true,
    visual: { kind: 'wardOutline', color: [.7,.6,.9] } },
  war_lantern: { name: 'War Lantern', status: 'migrationPlanned',
    existingRulesSource: 'units.rules.raid', existingOwnershipSource: 'clan.lanterns',
    // Keep price/carry limit/raid consumption authoritative in their existing
    // source until the inventory migration replaces that ownership atomically.
    allowedClanKinds: ['yakuza'], inventoryRepresentation: 'sharedClanCharge',
    visual: { kind: 'redLantern', color: [1,.2,.1] } },
};

// Compile both rarities from one set of bonuses. Legacy starter gear is kept
// for existing inventories; new shop items are never granted on spawning.
const percent = n => `${+(n*100).toFixed(2)}%`;
export const ITEMS = {...CURRENT_ITEMS};
function toModifiers(b){
  const modifiers={};
  if(b.normalDamage)modifiers.damage=1+b.normalDamage;
  if(b.normalAttackRate)modifiers.attackInterval=1/(1+b.normalAttackRate);
  if(b.movement)modifiers.run=modifiers.walk=1+b.movement;
  if(b.cooldownReduction)modifiers.cooldown=1-b.cooldownReduction;
  if(b.maxHpFlat)modifiers.maxHpFlat=b.maxHpFlat;
  if(b.dodgeChanceFlat)modifiers.dodgeChanceFlat=b.dodgeChanceFlat;
  if(b.damageReduction)modifiers.damageTaken=1-b.damageReduction;
  return modifiers;
}
const aboutOf=b=>Object.entries(b).map(([k,v])=>({normalDamage:`+${percent(v)} normal-hit damage`,normalAttackRate:`+${percent(v)} attack speed`,movement:`+${percent(v)} movement`,cooldownReduction:`−${percent(v)} ability cooldown`,maxHpFlat:`+${v} maximum HP`,dodgeChanceFlat:`+${percent(v)} dodge`,damageReduction:`−${percent(v)} incoming damage`})[k]).join('; ');
for (const id of SHOP_ITEM_IDS) for (const rarity of ['common','green']) {
  const source=GEAR[id], scale=RARITIES[rarity].bonusScale, b=Object.fromEntries(Object.entries(source.bonuses).map(([k,v])=>[k,v*scale]));
  const modifiers=toModifiers(b), about=aboutOf(b);
  // weapons (2026-11-01): common = edge glint, green = embers
  ITEMS[rarity==='green'?`${id}_green`:id]={...source, id, rarity, modifiers, about,
    name:(rarity==='green'?'Fine ':'')+source.name, sell:source.sell,
    visual:{...source.visual,...(source.slot==='weapon'?(rarity==='green'?{kind:'weaponEmbers',color:[1,.52,.18]}:{kind:'weaponGlint'}):{}),strength:RARITIES[rarity].visualStrength},glow:source.slot==='weapon'?source.visual.color:undefined};
}

// Frontier gear and castle heirlooms (wildlife W7, 2026-11-24). No fixed numbers: every stat is worked out here
// at load from the gear above, so the ladder holds whatever the shop numbers become:
//   shop item < city drop (Fine) < frontier gear < heirloom.
// Frontier: for each stat the item gives, the best shop item or city drop with that stat (same slot first, else any
// slot; a stat no shop item or drop gives, such as less incoming damage, starts from the starter gear) plus FRONTIER_PLUS
// points (a flat stat such as maximum HP: plus that share). Heirloom: the best shop weapon for its stat plus HEIRLOOM_PLUS points.
// 2026-11-24 (hero frontier thread): raised from 2 and 5 so they are felt, in the city too.
export const FRONTIER_PLUS = 0.10, HEIRLOOM_PLUS = 0.25;
// `fixed` keeps a drawback as it is (none now: 2026-11-24 took the bear coat's slower running off). Wolves and bears drop them (sim/wild_animals.js
// killed, data/wildlife.json species gear); a castle's heirloom goes to whoever takes it (sim/item_services.js).
export const FRONTIER_GEAR = {
  wolf_fur_cloak: { name: 'Wolf fur cloak', slot: 'armor', stats: ['maxHpFlat', 'movement'], sell: 90, icon: 'lightweight_wraps', visual: { kind: 'movementWisps', color: [.78,.8,.84] } },
  bear_hide_coat: { name: 'Bear hide coat', slot: 'armor', stats: ['damageReduction'], sell: 120, icon: 'reinforced_coat', visual: { kind: 'armorShimmer', color: [.62,.46,.3] } },
  wolf_fang_charm: { name: 'Wolf fang charm', slot: 'accessory', stats: ['dodgeChanceFlat'], sell: 90, icon: 'travelers_charm', visual: { kind: 'fangDodge', color: [.72,.78,.86] } },
  bear_claw_charm: { name: 'Bear claw charm', slot: 'accessory', stats: ['normalDamage'], sell: 120, icon: 'focus_charm', visual: { kind: 'clawStrike', color: [.7,.4,.2] } },
};
// one per castle clan, by faction; never sold (a keepsake). Each swing leaves its own arc (render/gear_fx.js heirloomArc, 2026-11-25).
export const HEIRLOOMS = {
  yakuza: { name: 'Benikiri', about0: 'The Yakuza boss blade, taken with their castle.', stat: 'normalDamage', visual: { kind: 'heirloomArc', style: 'benikiri', color: [.62,.08,.08] } },
  kuroda: { name: 'Shimotsuki', about0: 'The Kuroda lord blade, taken with their castle.', stat: 'normalAttackRate', visual: { kind: 'heirloomArc', style: 'shimotsuki', color: [.6,.78,.96] } },
  shinobi: { name: 'Kagenui', about0: 'The Shinobi master blade, taken with their castle.', stat: 'normalDamage', visual: { kind: 'heirloomArc', style: 'kagenui', color: [.5,.46,.66] } },
};
export const heirloomFor = clan => clan ? `heirloom_${HEIRLOOMS[clan.faction] ? clan.faction : clan.kind === 'ninja' ? 'shinobi' : 'yakuza'}` : null;
{
  const shopB = id => GEAR[id.replace(/_green$/, '')].bonuses, scaleOf = id => RARITIES[ITEMS[id].rarity].bonusScale;
  const tiered = Object.keys(ITEMS).filter(id => ITEMS[id].rarity === 'common' || ITEMS[id].rarity === 'green');
  const starterB = { damageReduction: id => 1 - (CURRENT_ITEMS[id].modifiers.damageTaken ?? 1) };
  const best = (stat, slot, ids) => {
    const v = ids.filter(id => shopB(id)[stat] != null && (!slot || ITEMS[id].slot === slot)).map(id => shopB(id)[stat] * scaleOf(id));
    return v.length ? Math.max(...v) : null;
  };
  for (const [id, g] of Object.entries(FRONTIER_GEAR)) {
    const b = {};
    for (const k of g.stats) {
      const base = best(k, g.slot, tiered) ?? best(k, null, tiered) ?? Math.max(0, ...CURRENT_ITEM_IDS.map(s => starterB[k]?.(s) || 0));
      b[k] = k === 'maxHpFlat' ? Math.round(base * (1 + FRONTIER_PLUS) + 0.5) : +(base + FRONTIER_PLUS).toFixed(4);
    }
    const modifiers = { ...toModifiers(b), ...(g.fixed || {}) };
    const about = [aboutOf(b), g.fixed?.run ? `${Math.round((1 - g.fixed.run) * 100)}% slower running` : ''].filter(Boolean).join('; ');
    ITEMS[id] = { ...g, id, rarity: 'frontier', bonuses: b, modifiers, about, visual: { ...g.visual, strength: RARITIES.frontier.visualStrength } };
  }
  for (const [f, h] of Object.entries(HEIRLOOMS)) {
    const b = { [h.stat]: +(best(h.stat, 'weapon', SHOP_ITEM_IDS) + HEIRLOOM_PLUS).toFixed(4) };
    ITEMS[`heirloom_${f}`] = { name: h.name, slot: 'weapon', id: `heirloom_${f}`, icon: h.stat === 'normalAttackRate' ? 'balanced_weapon' : 'honed_weapon', rarity: 'heirloom', heirloom: true, faction: f, bonuses: b,
      modifiers: toModifiers(b), about: `${aboutOf(b)}. ${h.about0}`, visual: { ...h.visual, strength: RARITIES.heirloom.visualStrength }, glow: h.visual.color };
  }
}
// Relics (world variety P4, 2026-11-25 and 2026-11-27): one per guarded place (data/hidden_places.json `relic`), the
// 4th equipment slot. Tricks, never damage or stat numbers; they work for the hero and the crew riding with him, player only.
// Each clan earns each relic once; never sold, never dropped. key: true = used with the Relic key (sim/relics.js), else
// always on while worn. Numbers here are the single source; first guesses, tuned in play.
export const RELICS = {
  relic_spyglass: { name: "Sea captain's spyglass", trick: 'sight', sightMult: 1.6,
    about: 'Always on: your hero sees and reveals 60% farther on the island' },
  relic_smoke_lantern: { name: "Hermit's smoke lantern", trick: 'smoke', key: true, radius: 8, seconds: 6, cooldown: 60,
    about: 'Relic key: a smoke cloud of radius 8 round your hero for 6 s; no shot passes through it, and your people inside are hidden unless they attack (seen 3 s after); 60 s cooldown' },
  relic_ferryman_charm: { name: "Ferryman's charm", trick: 'wade', waterSpeed: 0.6, crewRange: 120,
    about: 'Always on: your hero and his crew within 120 wade any river, not only at fords and bridges; 40% slower in the water' },
  relic_climber_hook: { name: "Climber's hook", trick: 'climb', key: true, crewRange: 8, wallRange: 4, climbSeconds: 3, cooldown: 90,
    about: 'Relic key: your hero and crew within 8 climb over the nearest palisade or wall within 4; 3 s climb; 90 s cooldown' },
  relic_fox_mask: { name: 'Fox mask', trick: 'unseen', crewRange: 20, rivalSight: 6,
    about: 'Always on: on the island your hero and crew within 20 go unnoticed by bandits and wild animals, and rival troops and heroes only see you within 6; attacking shows you for 20 s' },
  relic_conch_horn: { name: 'Conch horn', trick: 'signal', key: true, range: 60, seconds: 15, cooldown: 90,
    about: 'Relic key: every enemy within 60, hidden ones too, is marked for 15 s: shown on screen and on the maps, and cannot stealth again; 90 s cooldown' },
  relic_pilgrim_gourd: { name: "Pilgrim's gourd", trick: 'heal', key: true, heal: 0.5, seconds: 3, cooldown: 180,
    about: 'Relic key: heals your hero 50% of maximum HP over 3 s; 180 s cooldown' },
};
for (const [id, r] of Object.entries(RELICS))
  ITEMS[id] = { ...r, id, slot: 'relic', rarity: 'relic', relic: true, keepsake: true, bonuses: {}, modifiers: {}, visual: null };
// Dropped bag items (sim/ground_items.js, 2026-11-26): a bundle lies 15 minutes; Space within reach picks it up.
export const GROUND_ITEMS = { lifeSeconds: 900, reach: 2.5 };
// Frontier merchant (2026-11-26): a market stall beside the hall of each of your founded frontier towns (sim/item_services.js).
// Sells the plain shop gear and bandages at blacksmith prices; buys bag items at buyShare of the shop price (Fine items: their
// plain item's price), never less than the blacksmith pays (wolf and bear gear). Heirlooms are never sold.
// spot: in town grid cells from the hall's middle, off the hall's front right wall; model: the stall keeper's look.
export const FRONTIER_MERCHANT = { name: 'Merchant', spot: [2.2, 0.6], reach: 4.5, model: 'old_woman', buyShare: 0.5, stock: [...SHOP_ITEM_IDS, 'bandage'] };
// Where the stall keeper stands (2026-11-26: never on a building): the middle of the free town grid cell (no building,
// road, wall, zone or building site, buildable ground) nearest the spot, on rings 2 to 4 round the hall; the market stall
// stands 2.2 units behind him (town_props.js). Pure, so the sim and the drawing agree; it moves on if that cell is built on.
export function merchantSpot(s, cellSize = 11) {
  const g = s?.grid, cell = g?.cell || cellSize, want = [FRONTIER_MERCHANT.spot[0] * cell, FRONTIER_MERCHANT.spot[1] * cell];
  if (!g?.use || !g.n) return [s.x + want[0], s.z + want[1]];
  const n = g.n, c = (n - 1) / 2, taken = new Set();
  for (const p of s.projects || []) for (const i of p.cells?.length ? p.cells : [p.cell]) taken.add(i);
  let best = null, bd = Infinity;
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
    if (Math.max(Math.abs(dr), Math.abs(dc)) < 2) continue;
    const col = c + dc, row = c + dr; if (col < 0 || row < 0 || col >= n || row >= n) continue;
    const i = row * n + col;
    if (g.use[i] !== '.' || (g.zone && g.zone[i] !== '.') || (g.ground && g.ground[i] === 'x') || taken.has(i)) continue;
    const d = Math.hypot(dc * cell - want[0], dr * cell - want[1]);
    if (d < bd) { bd = d; best = [dc * cell, dr * cell]; }
  }
  return best ? [s.x + best[0], s.z + best[1]] : [s.x + want[0], s.z + want[1]];
}
export const merchantPays = id => { const it = ITEMS[id]; if (!it?.sell) return 0; const buy = GEAR[String(id).replace(/_green$/, '')]?.buy || 0;
  return Math.max(it.sell, Math.round(buy * FRONTIER_MERCHANT.buyShare)); };
export const SHOP = {reach:4.5, x:-53,z:-10,building:'blacksmith',name:'Blacksmith',lootRepeatSeconds:120};
