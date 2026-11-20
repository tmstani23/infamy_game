// Remembered sight (Tim 2026-11-18, war test item 7): you only know the parts of a rival town, or of an enemy war
// camp, that your units or watchtowers have had in sight. Rules only: no DOM, no randomness, plain data in state.
//   state.sightings = { <clan>: { 'town:<id>': { m: '0101…', b: { <building id>: record } },
//                                 'camp:<war id>': { b: { <building id>: record } } } }
//   m: one char per block of BLOCK x BLOCK town cells, '1' once seen (sim_snapshot.js sends a rival town's grid
//      layers only for seen blocks, as they are now).
//   b: each building as you last saw it (type, cell, stage...): a new one stays hidden and a burned one stands until
//      one of your units sees its spot again.
// Only player clans (not bots) keep a memory: bot generals read the full state, as before (a later fairness item).
// Sight: a unit on the island sees dayRange by day and range by night (world_chunks.json sight, as sim/vision.js
// without the fire bonus); a built watchtower its sight (structures.watchers).
// createSightings({ state, sight, towers }) -> { tick, seenMask, remembered, campRemembered, BLOCK, EVERY }
import { cellToWorld } from './frontier/town_grid.js';

export const BLOCK = 3;
const EVERY = 10;
const keepOf = b => { const { queue, workers, paidCost, ...r } = b; return r; };

export function createSightings({ state, sight = {}, towers = () => [] }) {
  const players = () => Object.entries(state.clans || {}).filter(([, c]) => !c.bot).map(([id]) => id);
  const range = () => (!state.night && sight.dayRange) ? sight.dayRange : (sight.range ?? sight.dayRange ?? 60);
  function eyesOf(clan) {
    const r = range(), out = [];
    for (const e of Object.values(state.entities || {})) if (e.owner === clan && e.place === 'world' && !e.dead && !e.downed && !e.jailed) out.push({ x: e.x, z: e.z, r });
    for (const t of towers() || []) if (t.owner === clan && t.sight > 0) out.push({ x: t.x, z: t.z, r: t.sight });
    return out;
  }
  const mem = (clan, key) => (((state.sightings ||= {})[clan] ||= {})[key] ||= {});
  const blocksOf = n => Math.ceil(n / BLOCK);
  function townTick(clan, t, eyes) {
    const g = t.grid; if (!g?.n) return;
    const n = g.n, nb = blocksOf(n), half = (n * g.cell) / 2;
    const near = eyes.filter(p => Math.abs(p.x - t.x) <= half + p.r && Math.abs(p.z - t.z) <= half + p.r);
    if (!near.length) return;
    const m = mem(clan, 'town:' + t.id);
    if (!m.m || m.m.length !== nb * nb) m.m = '0'.repeat(nb * nb);
    m.b ||= {};
    const now = new Set(), c = (n - 1) / 2;
    for (const p of near) {
      // block range round the eye, then each block's middle cell against the sight circle
      const col = (p.x - t.x) / g.cell + c, row = (p.z - t.z) / g.cell + c, rc = p.r / g.cell + BLOCK;
      const b0 = Math.max(0, Math.floor((col - rc) / BLOCK)), b1 = Math.min(nb - 1, Math.floor((col + rc) / BLOCK));
      const a0 = Math.max(0, Math.floor((row - rc) / BLOCK)), a1 = Math.min(nb - 1, Math.floor((row + rc) / BLOCK));
      for (let bj = a0; bj <= a1; bj++) for (let bi = b0; bi <= b1; bi++) {
        const ci = Math.min(n - 1, bi * BLOCK + 1), cj = Math.min(n - 1, bj * BLOCK + 1), [x, z] = cellToWorld(t, cj * n + ci);
        if ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r) now.add(bj * nb + bi);
      }
    }
    if (!now.size) return;
    let arr = null;
    for (const k of now) if (m.m[k] !== '1') (arr ||= m.m.split(''))[k] = '1';
    if (arr) m.m = arr.join('');
    const blockOf = cell => Math.floor(Math.floor(cell / n) / BLOCK) * nb + Math.floor((cell % n) / BLOCK);
    const live = new Map((t.buildings || []).map(b => [b.id, b]));
    for (const b of live.values()) if (Number.isInteger(b.cell) && now.has(blockOf(b.cell))) m.b[b.id] = keepOf(b);
    for (const [id, r] of Object.entries(m.b)) if (Number.isInteger(r.cell) && now.has(blockOf(r.cell)) && !live.has(id)) delete m.b[id];
  }
  function campTick(clan, w, eyes) {
    const camp = w.camp; if (!camp?.buildings) return;
    const near = eyes.filter(p => Math.hypot(p.x - camp.x, p.z - camp.z) <= 400 + p.r);
    if (!near.length) return;
    const m = mem(clan, 'camp:' + w.id); m.b ||= {};
    const sees = (x, z) => near.some(p => (x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r);
    const live = new Map(camp.buildings.map(b => [b.id, b]));
    for (const b of live.values()) if (Number.isFinite(b.x) && sees(b.x, b.z)) m.b[b.id] = keepOf(b);
    for (const [id, r] of Object.entries(m.b)) if (!live.has(id) && Number.isFinite(r.x) && sees(r.x, r.z)) delete m.b[id];
  }
  function tick() {
    if ((state.tick ?? 0) % EVERY) return;
    const F = state.frontier; if (!F) return;
    for (const clan of players()) {
      const eyes = eyesOf(clan); if (!eyes.length) continue;
      for (const t of Object.values(F.settlements || {})) if ((!t.capital || t.castle) && t.owner !== clan && Number.isFinite(t.x)) townTick(clan, t, eyes);   // rival castles too (Z5)
      for (const w of Object.values(F.wars?.list || {})) if (w.camp && w.attacker !== clan) campTick(clan, w, eyes);
    }
    // a town or war that is gone (or became yours) is forgotten
    for (const [clan, all] of Object.entries(state.sightings || {})) for (const key of Object.keys(all)) {
      const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      const t = kind === 'town' ? F.settlements?.[id] : null;
      if (kind === 'town' ? (!t || t.owner === clan) : !F.wars?.list?.[id]) delete all[key];
    }
  }
  const seenMask = (clan, townId) => state.sightings?.[clan]?.['town:' + townId]?.m || null;
  const remembered = (clan, townId) => state.sightings?.[clan]?.['town:' + townId]?.b || {};
  const campRemembered = (clan, warId) => state.sightings?.[clan]?.['camp:' + warId]?.b || {};
  return { tick, seenMask, remembered, campRemembered, BLOCK, EVERY };
}

// For the snapshot: a rival town's grid with only the seen blocks filled in (ground is landscape and stays)
export function maskGrid(g, mask, block = BLOCK) {
  if (!g?.n) return g;
  const n = g.n, nb = Math.ceil(n / block);
  if (!mask) return { ...g, use: g.use.replace(/[^mk]/g, '.'), zone: '.'.repeat(n * n), by: '.'.repeat(n * n), stage: '0'.repeat(n * n) };
  const use = g.use.split(''), zone = g.zone.split(''), by = g.by.split(''), stage = g.stage.split('');
  for (let i = 0; i < n * n; i++) {
    if (mask[Math.floor(Math.floor(i / n) / block) * nb + Math.floor((i % n) / block)] === '1') continue;
    if (use[i] !== 'm' && use[i] !== 'k') use[i] = '.';   // a castle's moat and cliffs are landscape, seen with the ground (Z4h)
    zone[i] = '.'; by[i] = '.'; stage[i] = '0';
  }
  return { ...g, use: use.join(''), zone: zone.join(''), by: by.join(''), stage: stage.join('') };
}
