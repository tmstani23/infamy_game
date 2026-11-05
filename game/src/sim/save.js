import { createLieutenantBrain } from './lieutenant.js';
import { modeRules } from './modes/index.js';
// Save and load (frontier plan F1). A save is plain JSON: the whole game.state plus the
// "private" closure state that modules keep outside it (rng seeds, AI memory, path caches).
// Modules opt in with saveState() / loadState(data); see to_delete/_chk/save_audit.md.
import { createBot } from './bot.js';
import { createNinjaBot } from './ninja_bot.js';

export const SAVE_VERSION = 1;
// Older saves are upgraded in order: { from: 1, to: 2, run(save) } edits the save in place.
export const MIGRATIONS = [];
const DIFFERENT = 'This save is from a different version';
export function migrateSave(save, { migrations = MIGRATIONS, target = SAVE_VERSION } = {}) {
  if (!save || !Number.isInteger(save.version) || save.version > target || save.version < 1) throw new Error(DIFFERENT);
  while (save.version < target) {
    const step = migrations.find(m => m.from === save.version);
    if (!step) throw new Error(DIFFERENT);
    step.run(save); save.version = step.to;
  }
  return save;
}

// --- plain-JSON encoding --------------------------------------------------------------
// Map, Set, typed arrays (run-length packed) and non-finite numbers become tagged objects,
// so modules can hand back their closure values as they are.
const TYPED = { Uint8Array, Int8Array, Uint16Array, Int16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
function rle(a) { const out = []; for (let i = 0; i < a.length;) { let j = i; while (j < a.length && Object.is(a[j], a[i])) j++; out.push(a[i], j - i); i = j; } return out; }
export function encode(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $num: String(v) };
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (Array.isArray(v)) return v.map(x => { const y = encode(x); return y === undefined ? null : y; });
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [encode(k), encode(x) ?? null]) };
  if (v instanceof Set) return { $set: [...v].map(encode) };
  if (ArrayBuffer.isView(v)) return { $typed: v.constructor.name, length: v.length, rle: rle(v).map(encode) };
  const out = {};
  for (const [k, x] of Object.entries(v)) { const y = encode(x); if (y !== undefined) out[k] = y; }
  return out;
}
export function decode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(decode);
  if ('$num' in v) return Number(v.$num);
  if ('$map' in v) return new Map(v.$map.map(([k, x]) => [decode(k), decode(x)]));
  if ('$set' in v) return new Set(v.$set.map(decode));
  if ('$typed' in v) {
    const a = new TYPED[v.$typed](v.length);
    for (let i = 0, n = 0; i < v.rle.length; i += 2) { a.fill(decode(v.rle[i]), n, n + v.rle[i + 1]); n += v.rle[i + 1]; }
    return a;
  }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
}

// Deep in-place patch: keeps the identity of every object and array that already exists,
// because modules hold references into state (state.contracts, state.deployment, camps ...).
const plainObject = v => v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)
  && !(v instanceof Map) && !(v instanceof Set);
export function patch(target, source) {
  if (Array.isArray(target)) {
    target.length = source.length;
    for (let i = 0; i < source.length; i++) target[i] = merge(target[i], source[i]);
    return target;
  }
  for (const k of Object.keys(target)) if (!(k in source)) delete target[k];
  for (const [k, v] of Object.entries(source)) target[k] = merge(target[k], v);
  return target;
}
function merge(old, v) {
  if (plainObject(old) && plainObject(v)) return patch(old, v);
  if (Array.isArray(old) && Array.isArray(v)) return patch(old, v);
  return v;
}

// --- bots (they run beside the game, in the worker runtime) ----------------------------
// rivals: setupMatch's list { clan, hero, kind, rules, seed }; kept on each bot as `config`.
export function makeBots(game, rivals) {
  const lieutenant = clan => Object.assign(createLieutenantBrain(game, { clan }), { config: { lieutenant: true, clan } });
  const list = rivals.map(r => r.lieutenant ? lieutenant(r.clan) : Object.assign((r.kind === 'ninja' ? createNinjaBot : createBot)(game, r), { config: r }));
  // C2: one lieutenant brain per clan in a campaign (player and bots); older saves get theirs appended
  if (game.lieutenant && modeRules(game.state).campaignCity)
    for (const clan of Object.keys(game.state.clans)) if (!list.some(b => b.config?.lieutenant && b.config.clan === clan)) list.push(lieutenant(clan));
  return list;
}

// The player's hero id (a loaded game keeps its saved ids)
export const heroOf = (game, clan = 'player') => Object.values(game.state.entities).find(e => e.type === 'hero' && e.owner === clan)?.id ?? null;

// --- save / load ---------------------------------------------------------------------
export function makeSave(game, { bots = [] } = {}) {
  return {
    version: SAVE_VERSION, tick: game.state.tick,
    state: encode(game.state),
    private: encode({ game: game.saveState?.() ?? null, bots: bots.map(b => ({ config: b.config, state: b.saveState?.() ?? null })) }),
  };
}
// Loads into a freshly created game (createGame, no setupMatch). Returns the rebuilt bots.
export function loadSave(game, save) {
  save = migrateSave(save);
  const priv = decode(save.private) || {};
  patch(game.state, decode(save.state));
  game.loadState?.(priv.game);
  const bots = makeBots(game, (priv.bots || []).map(b => b.config));
  bots.forEach((b, i) => b.loadState?.(priv.bots?.[i]?.state));   // lieutenants appended for older saves have no saved state
  return bots;
}
