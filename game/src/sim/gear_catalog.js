// Single source for active gear, shop prices, consumables and loot rates.
// CURRENT_ITEMS are legacy starters; compiled ITEMS also include shop/drop gear.
export const INVENTORY_SLOTS = 12;
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'];
export const GEAR = {
  weighted_edge: { name: 'Weighted edge', slot: 'weapon', about: '+8% normal-hit power; 6% longer attack interval.', modifiers: { damage: 1.08, attackInterval: 1.06 }, glow: [1, .52, .18], visual: { kind: 'weaponGlint', color: [1,.52,.18] } },
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
  green: { name: 'Green', bonusScale: 1.25, visualStrength: 1.25, color: [.35,.85,.45] },
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
for (const id of SHOP_ITEM_IDS) for (const rarity of ['common','green']) {
  const source=GEAR[id], scale=RARITIES[rarity].bonusScale, b=Object.fromEntries(Object.entries(source.bonuses).map(([k,v])=>[k,v*scale]));
  const modifiers={};
  if(b.normalDamage)modifiers.damage=1+b.normalDamage;
  if(b.normalAttackRate)modifiers.attackInterval=1/(1+b.normalAttackRate);
  if(b.movement)modifiers.run=modifiers.walk=1+b.movement;
  if(b.cooldownReduction)modifiers.cooldown=1-b.cooldownReduction;
  if(b.maxHpFlat)modifiers.maxHpFlat=b.maxHpFlat;
  if(b.dodgeChanceFlat)modifiers.dodgeChanceFlat=b.dodgeChanceFlat;
  const about=Object.entries(b).map(([k,v])=>({normalDamage:`+${percent(v)} normal-hit damage`,normalAttackRate:`+${percent(v)} attack speed`,movement:`+${percent(v)} movement`,cooldownReduction:`−${percent(v)} ability cooldown`,maxHpFlat:`+${v} maximum HP`,dodgeChanceFlat:`+${percent(v)} dodge`})[k]).join('; ');
  ITEMS[rarity==='green'?`${id}_green`:id]={...source, id, rarity, modifiers, about,
    name:(rarity==='green'?'Fine ':'')+source.name, sell:source.sell,
    visual:{...source.visual,strength:RARITIES[rarity].visualStrength},glow:source.slot==='weapon'?source.visual.color:undefined};
}
export const SHOP = {reach:4.5, x:-53,z:-10,building:'blacksmith',name:'Blacksmith',lootRepeatSeconds:120};
