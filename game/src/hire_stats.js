// Recruitment descriptions read the same definitions as the simulation.
import { DIVERSION } from './sim/diversion.js';
import { RIFLE } from './sim/rifleman.js';
import { TAUNT } from './sim/taunt.js';

const number = n => Number(n.toFixed(2)).toString();
const percent = n => `${number(n * 100)}%`;
export const escapeHireText = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function hireStats(type, unit) {
  const interval = unit.attackSpeed || 1, damage = Math.round(unit.damage || 0);
  const specials = [];
  if (type === 'shinobi_geisha') {
    const a = DIVERSION;
    specials.push({ name: 'Charm', about: `Automatic ${a.castTicks / 20}s channel within ${a.radius} steps; slows the target by ${percent(1 - a.snareSpeed)} while casting, then charms for ${a.durationTicks / 20}s. ${a.cooldownTicks / 20}s cooldown. Enemy clan crew and house guards only; excludes heroes, bandits, police and civilians, and targets under allied fire. Movement and damage interrupt the channel.` });
  }
  if (unit.taunt) {
    const a = { ...TAUNT, ...unit.taunt };
    const targets = type === 'yakuza_enforcer' ? 'all nearby enemies' : a.coneDegrees ? `enemies in a ${a.coneDegrees}° forward cone` : 'one enemy';
    specials.push({ name: 'Instant Taunt', about: `Automatically forces ${targets} within ${a.radius} steps to attack this unit for ${a.durationTicks / 20}s; ${a.cooldownTicks / 20}s cooldown. Enemy clan crew and house guards only; excludes heroes, bandits, police and civilians.${a.damageTaken < 1 ? ` Reduces damage received by ${percent(1 - a.damageTaken)} for the Taunt duration.` : ' No damage reduction.'}` });
  }
  if (unit.rifle) {
    const a = { ...RIFLE, ...unit.rifle };
    specials.push({ name: 'Aimed Shot', about: `Automatically aims for ${a.aimTicks / 20}s, then deals ${a.damage} damage within ${a.range} steps and staggers for ${a.staggerTicks / 20}s (half duration on heroes). ${a.cooldownTicks / 20}s cooldown after firing, plus the next aim. Movement or damage interrupts aiming; ${a.retryTicks / 20}s retry. Normal attacks use the rifle butt.` });
  }
  if (unit.projectile?.hamstring) {
    const a = unit.projectile.hamstring;
    specials.push({ name: 'Hamstring', about: `An arrow deals normal weapon damage and slows by ${percent(1 - a.speed)} for ${a.durationTicks / 20}s; ${a.cooldownTicks / 20}s cooldown.` });
  }
  for (const a of Object.values(unit.abilities || {})) specials.push({ name: a.name, about: a.about });
  if (unit.dodgeChance) specials.push({ name: `${percent(unit.dodgeChance)} dodge`, about: 'Chance to avoid a normal attack. Abilities use their own hit rules.' });
  if (unit.critChance) specials.push({ name: `${percent(unit.critChance)} critical`, about: `Normal attacks have a ${percent(unit.critChance)} chance to deal ${unit.critMultiplier || 2}× damage, before target protection.` });
  return { damage, interval, attacksPerSecond: 1 / interval, dps: damage / interval, specials };
}

export function hireStatsHtml(type, unit) {
  const s = hireStats(type, unit);
  return `${s.damage} dmg · range ${unit.attackRange}<br>` +
    `<span title="Base normal-attack cooldown. Movement, aiming and range can reduce the actual attack rate.">${number(s.attacksPerSecond)} attacks/s · every ${number(s.interval)}s</span> · ` +
    `<span title="Base sustained normal-attack DPS: rounded normal-hit damage divided by attack interval. Excludes critical hits, special abilities, buffs, dodges, armour, travel and interruptions.">${number(s.dps)} base DPS</span>` +
    (s.specials.length ? `<br>${s.specials.map(a => `<span tabindex="0" title="${escapeHireText(a.about)}">${escapeHireText(a.name)}</span>`).join(' · ')}` : '');
}
