// The numbers behind each war special, for hovers (Tim 2026-11-18: the train cards and ability buttons said how to
// cast a special but not what it does in numbers). Reads the same unit definitions and defaults as the sim, so the
// hover never drifts from the rules. No DOM: Node checks it (tools/test_special_stats.mjs).
// specialNumbers(id, unitDef) -> one short sentence of numbers ('' when the unit has no such special)
// specialHover(id, name, about, unitDef) -> 'Name: about Numbers' for a title attribute
import { DIVERSION } from './sim/diversion.js';
import { RIFLE } from './sim/rifleman.js';
import { TAUNT } from './sim/taunt.js';

const s = t => `${Number(((t || 0) / 20).toFixed(1))} s`;
const pct = f => `${Math.round(f * 100)} percent`;   // no special characters in game text (Tim 2026-11-10)

export function specialNumbers(id, u = {}) {
  switch (id) {
    case 'charm': { const a = DIVERSION; return `Range ${a.radius}, ${s(a.castTicks)} to cast, charms for ${s(a.durationTicks)}, cooldown ${s(a.cooldownTicks)}.`; }
    case 'aimed': { if (!u.rifle) return ''; const a = { ...RIFLE, ...u.rifle }; return `${a.damage} damage, range ${a.range}, ${s(a.aimTicks)} to aim, staggers for ${s(a.staggerTicks)}, cooldown ${s(a.cooldownTicks)}.`; }
    case 'taunt': { const a = { ...TAUNT, ...(u.taunt || {}) }; return `Radius ${a.radius}, lasts ${s(a.durationTicks)}, he takes ${pct(1 - a.damageTaken)} less damage meanwhile, cooldown ${s(a.cooldownTicks)}.`; }
    case 'dogs': { const a = u.dogs; if (!a) return ''; return `${a.count} dogs, ${a.damage} damage, knocks down for ${s(a.knockdownTicks)}, range ${a.range}, cooldown ${s(a.cooldownTicks)}.`; }
    case 'gatling': { const a = u.gatling; if (!a) return ''; return `${Math.round(a.damage * 20 / Math.max(1, a.everyTicks))} damage a second in a ${a.coneDeg} degree cone, range ${a.minRange} to ${a.range}, ${s(a.setupTicks)} to set up.`; }
    case 'firebomb': { const a = u.bomb; if (!a) return ''; return `${a.damage} damage to every enemy within ${a.radius}, ${a.structureDamage} to a building, throw range ${a.range}, cooldown ${s(a.cooldownTicks)}.`; }
    case 'hamstring': { const a = u.projectile?.hamstring; if (!a) return ''; return `Normal arrow damage (${Math.round(u.damage || 0)}), slows by ${pct(1 - a.speed)} for ${s(a.durationTicks)}, cooldown ${s(a.cooldownTicks)}.`; }
    default: return '';
  }
}
export const specialHover = (id, name, about, u) => `${name}: ${about || ''}${about ? ' ' : ''}${specialNumbers(id, u)}`.trim();
