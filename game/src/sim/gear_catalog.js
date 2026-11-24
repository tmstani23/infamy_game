// Single source for active gear, shop prices, consumables and loot rates.
// CURRENT_ITEMS are legacy starters; compiled ITEMS also include shop/drop gear.
export const INVENTORY_SLOTS = 12;
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'];
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
  // weapons (Tim 2026-11-01): common = edge glint, green = embers
  ITEMS[rarity==='green'?`${id}_green`:id]={...source, id, rarity, modifiers, about,
    name:(rarity==='green'?'Fine ':'')+source.name, sell:source.sell,
    visual:{...source.visual,...(source.slot==='weapon'?(rarity==='green'?{kind:'weaponEmbers',color:[1,.52,.18]}:{kind:'weaponGlint'}):{}),strength:RARITIES[rarity].visualStrength},glow:source.slot==='weapon'?source.visual.color:undefined};
}

// Frontier gear and castle heirlooms (wildlife W7, Tim 2026-11-24). No fixed numbers: every stat is worked out here
// at load from the gear above, so the ladder holds whatever the shop numbers become:
//   shop item < city drop (Fine) < frontier gear < heirloom.
// Frontier: for each stat the item gives, the best shop item or city drop with that stat (same slot first, else any
// slot; a stat no shop item or drop gives, such as less incoming damage, starts from the starter gear) plus 2 points
// (a flat stat such as maximum HP: plus 2%). Heirloom: the best shop weapon for its stat plus 5 points.
// `fixed` keeps a drawback as it is (the bear coat is heavy). Wolves and bears drop them (sim/wild_animals.js
// killed, data/wildlife.json species gear); a castle's heirloom goes to whoever takes it (sim/item_services.js).
export const FRONTIER_GEAR = {
  wolf_fur_cloak: { name: 'Wolf fur cloak', slot: 'armor', stats: ['maxHpFlat', 'movement'], sell: 90, icon: 'lightweight_wraps', visual: { kind: 'movementWisps', color: [.78,.8,.84] } },
  bear_hide_coat: { name: 'Bear hide coat', slot: 'armor', stats: ['damageReduction'], fixed: { run: .95 }, sell: 120, icon: 'reinforced_coat', visual: { kind: 'armorShimmer', color: [.62,.46,.3] } },
  wolf_fang_charm: { name: 'Wolf fang charm', slot: 'accessory', stats: ['dodgeChanceFlat'], sell: 90, icon: 'travelers_charm', visual: { kind: 'accessoryAura', color: [.82,.88,.95] } },
  bear_claw_charm: { name: 'Bear claw charm', slot: 'accessory', stats: ['normalDamage'], sell: 120, icon: 'focus_charm', visual: { kind: 'accessoryAura', color: [1,.62,.22] } },
};
// one per castle clan, by faction; never sold (a keepsake). Glow colours are placeholders until the heirloom effect is built.
export const HEIRLOOMS = {
  yakuza: { name: 'Benikiri', about0: 'The Yakuza boss blade, taken with their castle.', stat: 'normalDamage', visual: { kind: 'weaponEmbers', color: [.95,.3,.18] } },
  kuroda: { name: 'Shimotsuki', about0: 'The Kuroda lord blade, taken with their castle.', stat: 'normalAttackRate', visual: { kind: 'weaponTrail', color: [.62,.84,1] } },
  shinobi: { name: 'Kagenui', about0: 'The Shinobi master blade, taken with their castle.', stat: 'normalDamage', visual: { kind: 'weaponTrail', color: [.62,.42,.92] } },
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
      b[k] = k === 'maxHpFlat' ? Math.round(base * 1.02 + 0.5) : +(base + 0.02).toFixed(4);
    }
    const modifiers = { ...toModifiers(b), ...(g.fixed || {}) };
    const about = [aboutOf(b), g.fixed?.run ? `${Math.round((1 - g.fixed.run) * 100)}% slower running` : ''].filter(Boolean).join('; ');
    ITEMS[id] = { ...g, id, rarity: 'frontier', bonuses: b, modifiers, about, visual: { ...g.visual, strength: RARITIES.frontier.visualStrength } };
  }
  for (const [f, h] of Object.entries(HEIRLOOMS)) {
    const b = { [h.stat]: +(best(h.stat, 'weapon', SHOP_ITEM_IDS) + 0.05).toFixed(4) };
    ITEMS[`heirloom_${f}`] = { name: h.name, slot: 'weapon', id: `heirloom_${f}`, icon: h.stat === 'normalAttackRate' ? 'balanced_weapon' : 'honed_weapon', rarity: 'heirloom', heirloom: true, faction: f, bonuses: b,
      modifiers: toModifiers(b), about: `${aboutOf(b)}. ${h.about0}`, visual: { ...h.visual, strength: RARITIES.heirloom.visualStrength }, glow: h.visual.color };
  }
}
export const SHOP = {reach:4.5, x:-53,z:-10,building:'blacksmith',name:'Blacksmith',lootRepeatSeconds:120};
