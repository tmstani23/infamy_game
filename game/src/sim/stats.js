// One stat evaluator for gameplay and read-only presentation. Gear can later
// contribute modifiers here without creating a second character-sheet formula.
export const DEFAULT_MOVEMENT = {
  hero: { radius: .35, walk: 1.7, run: 6 },
  civilian: { radius: .3, walk: 1.1, run: 2.6 },
};
export const KURODA_FIELD_RECOVERY = 2;

export function baseStats(units, entity, roamers = {}) {
  if (typeof entity !== 'object' || !entity) return { ...units?.types[entity], ...DEFAULT_MOVEMENT[entity] };
  return { ...units?.types[entity.type], ...DEFAULT_MOVEMENT[entity.type], ...units?.models?.[entity.model],
    ...(entity.wild && !entity.camp ? roamers[entity.type]?.roamerStats : {}) };
}

export function createStats({ state, units, roamers, territory, atHome, formationMultiplier = () => 1, stealthRules = () => ({}) }) {
  const base = e => baseStats(units, e, roamers);
  const buff = (e, id) => { const b = e?.buffs?.[id]; return b && (b.until == null || b.until > state.tick) ? b : null; };
  const clamp = n => Math.max(0, Math.min(1, n));
  function damageMultiplier(e) { return (buff(e, 'lantern')?.damage || 1) * (buff(e, 'intimidated')?.damage || 1); }
  function damage(e) { return (base(e).damage || 0) * damageMultiplier(e); }
  function attackInterval(e) { return (base(e).attackSpeed || 1) / (buff(e, 'rally')?.boost || 1); }
  function criticalChance(e) {
    const bonus = Object.values(e.buffs || {}).reduce((n, b) => n + (b.until > state.tick ? b.critChance || 0 : 0), 0);
    return clamp((base(e).critChance || 0) + bonus);
  }
  const dodgeChance = e => clamp(base(e).dodgeChance || 0);
  const damageTaken = e => formationMultiplier(e) * (buff(e, 'bulwark')?.taken || 1);   // bulwark: enforcer while his taunt holds (sim/taunt.js)
  const lifesteal = e => buff(e, 'lantern')?.lifesteal || 0;
  function movement(e, gait) {
    const b = base(e), turf = e.type !== 'hero' && state.clans[e.owner] && territory.inOwn(e) ? territory.rules.crewSpeed : 1;
    const pursuit = e.type === 'hero' && gait === 'run' ? buff(e, 'pursuit')?.runSpeed || 1 : 1;
    return (b[gait] || 0) * turf * pursuit * (buff(e, 'snared')?.speed ?? 1);
  }
  function regeneration(e) {
    const rules = units?.rules || {}, rate = rules.regenPerSecond || 0, wait = (rules.regenAfterSeconds || 0) * 20;
    const turf = territory.inOwn(e) ? territory.rules.healFactor : 1;
    const fieldRest = e.place === 'street' && !e.swing && !e.execute && state.tick - (e.foughtAt ?? -Infinity) >= wait;
    const clan = state.clans[e.owner]?.faction === 'kuroda' && fieldRest ? KURODA_FIELD_RECOVERY : 1;
    const home = atHome(e) ? rules.hideout?.restPerSecond || 0 : 0;
    const maxHp = e.maxHp ?? base(e).hp ?? 0, eligible = !e.dead && !e.downed && state.tick - (e.hitAt ?? -Infinity) >= wait;
    return { base: maxHp * rate, rate: maxHp * (rate * turf * clan + home), current: eligible ? maxHp * (rate * turf * clan + home) : 0,
      eligible, waitSeconds: Math.max(0, (wait - (state.tick - (e.hitAt ?? -Infinity))) / 20), turf, clan, home };
  }
  function effective(e) {
    return { ...base(e), damage: damage(e), attackSpeed: attackInterval(e), critChance: criticalChance(e), dodgeChance: dodgeChance(e),
      walk: movement(e, 'walk'), run: movement(e, 'run'), lifesteal: lifesteal(e), damageTaken: damageTaken(e), regeneration: regeneration(e).current };
  }
  function passives(e) {
    const clan = state.clans[e.owner], result = [], regen = regeneration(e);
    if (clan?.faction === 'kuroda') result.push({ id: 'battle_hardened', name: 'Battle Hardened', icon: 'shield',
      description: `Street recovery is ${KURODA_FIELD_RECOVERY}× the normal rate while resting out of combat. Territory recovery bonuses still apply. HQ rest is separate.`,
      active: regen.clan > 1 && regen.eligible && e.hp < e.maxHp, status: regen.clan > 1 && regen.eligible ? e.hp < e.maxHp ? 'Recovering' : 'Ready' : 'Rest to activate' });
    if (clan?.kind === 'ninja') {
      const rules = stealthRules();
      result.push({ id: 'shadowcraft', name: 'Shadowcraft', icon: 'eye', active: !!e.hidden,
        description: `Concealment depends on movement and light. Observers require line of sight and a ${rules.viewAngle || 90}° forward cone. Running increases detection range. Smoke and Vanish have their own concealment rules.`,
        status: e.hidden ? 'Concealed' : 'Revealed' });
    }
    return result;
  }
  function snapshot(e) {
    if (!e) return null;
    const b = base(e), v = effective(e), regen = regeneration(e), clan = state.clans[e.owner], rows = [];
    const add = (key, label, group, initial, value, unit, sources = [], note = '', lowerBetter = false) => {
      rows.push({ key, label, group, base: initial, value, modifier: value - initial, unit, sources, note, lowerBetter });
    };
    const damageSources = [];
    if (buff(e, 'lantern')?.damage) damageSources.push(`Red Lantern ×${buff(e, 'lantern').damage}`);
    if (buff(e, 'intimidated')?.damage) damageSources.push(`Intimidate ×${buff(e, 'intimidated').damage}`);
    add('health', 'Maximum health', 'Vitality', b.hp || 0, e.maxHp ?? b.hp ?? 0, 'hp', e.maxHp !== b.hp ? ['Unit health override'] : []);
    add('regen', 'Passive recovery', 'Vitality', regen.base, regen.current, 'hp/s', [
      ...(regen.turf !== 1 ? [`Home territory ×${regen.turf}`] : []), ...(regen.clan !== 1 ? [`Battle Hardened ×${regen.clan}`] : []),
      ...(regen.home ? ['HQ rest'] : []), ...(!regen.eligible ? ['Recovery currently paused'] : [])],
      regen.waitSeconds > 0 ? `Resumes in ${Math.ceil(regen.waitSeconds)}s without another hit.` : 'Rate when injured. Full health caps further healing.');
    add('normalHit', 'Normal hit', 'Offence', Math.round(b.damage || 0), Math.round(v.damage), 'damage', damageSources,
      `Weapon power ${b.damage || 0}; modified power ${v.damage}. Rounded once on hit, before target protection. Critical hits round separately.`);
    add('attackInterval', 'Attack interval', 'Offence', b.attackSpeed || 1, v.attackSpeed, 's', buff(e, 'rally') ? [`Rally ×${buff(e, 'rally').boost || 1} attack speed`] : [], 'Cooldown between normal attacks; movement, range and windup still matter.', true);
    add('range', 'Attack reach', 'Offence', b.attackRange || 1, b.attackRange || 1, 'steps', [], 'Measured to target body; target radius is added by the combat rules.');
    add('critChance', 'Critical chance', 'Offence', clamp(b.critChance || 0), v.critChance, '%', v.critChance !== clamp(b.critChance || 0) ? ['Active critical-chance bonuses'] : []);
    add('critMultiplier', 'Critical damage', 'Offence', b.critMultiplier || 2, b.critMultiplier || 2, '×');
    add('dodge', 'Dodge chance', 'Defence', clamp(b.dodgeChance || 0), v.dodgeChance, '%', [], 'Normal-attack dodge. Abilities retain their own hit rules.');
    add('damageTaken', 'Damage received', 'Defence', 1, v.damageTaken, '%', v.damageTaken !== 1 ? ['Iron Formation'] : [], 'Incoming damage multiplier. Assassinate retains its explicit health rule.', true);
    add('lifesteal', 'Lifesteal', 'Defence', 0, v.lifesteal, '%', v.lifesteal ? ['Red Lantern'] : [], 'Healing from actual damage dealt, capped at maximum health.');
    for (const [key, label] of [['walk', 'Walk speed'], ['run', 'Run speed']]) {
      const sources = [];
      if (buff(e, 'snared')) sources.push(`Slowed ×${buff(e, 'snared').speed}`);
      if (key === 'run' && e.type === 'hero' && buff(e, 'pursuit')) sources.push(`Reprisal escape ×${buff(e, 'pursuit').runSpeed}`);
      if (e.type !== 'hero' && territory.inOwn(e)) sources.push(`Home streets ×${territory.rules.crewSpeed}`);
      add(key, label, 'Movement', b[key] || 0, v[key], 'steps/s', sources);
    }
    return { id: e.id, type: e.type, model: e.model, name: b.name || `${clan?.name || 'Clan'} leader`, clan: clan?.name || e.owner,
      faction: clan?.faction, kind: clan?.kind, hp: e.hp, maxHp: e.maxHp, tick: state.tick, rows, passives: passives(e),
      abilities: Object.entries(b.abilities || {}).map(([key, a]) => ({ key, ...a, remaining: Math.max(0, ((e.cooldowns?.[key] || 0) - state.tick) / 20) })) };
  }
  return { base, effective, damage, damageMultiplier, attackInterval, criticalChance, dodgeChance, damageTaken, lifesteal, movement, regeneration, passives, snapshot };
}
