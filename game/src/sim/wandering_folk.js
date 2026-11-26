// Wandering folk (world variety P2, 2026-11-26; plan in project files war_build/world_variety/plan.md part E).
// People out on the island doing their own thing. They ask nothing of the player; they are there to be worth watching.
// Like the deer (sim/wild_animals.js) they come to the player: now and then a scene is put down out of sight round one of
// the player's own units, by the kind of place it needs (a road, a bridge or ford, a pass, open country) and by the
// region's biome, and it is taken off the map again once nobody of the player's is near. Never in a town ring, a camp,
// by the gate or in a war circle. When an army marches up, a war circle comes over it or shots ring out close by,
// everyone in it scatters and is gone.
// Folk are townsfolk to the rules (type 'civilian', untouchable: nobody can hit them, nobody can order them, bots and
// troops ignore them). The one exception is the peddler's bandits (owner 'bandits'): real bandits that anyone may fight.
// Each scene kind is its own small story with its own reactions (data/wildlife.json "folk"; numbers there):
//   hermit   sits on a log in the wild, turns to watch whoever passes, bows to one who stops by him; gets up and walks on
//   duel     (CP2) two ronin on a bridge or ford: face off, circle, clash; one falls, the winner walks off.
//            They break off to stare down a rider who comes close.
//   peddler  (CP3) bandits hold up a lone trader on a pass or road. Step in (hit one) and they fight; ride past and they
//            rob him and go
//   pilgrims (CP4) a line on the road with a hand bell; they stop to bow at a roadside shrine; step off the road for riders
//   camp     (CP5) at night, folk round a fire with one on watch; they stand up when riders or a band come near
// State: state.world.folk = { scenes: { id: scene }, next, rest: { cell: tick } } and on each member e.folk (its scene
// id). A scene: { id, kind, x, z, phase, until, members: [ids], m: { id: per-member mind }, props: [{ art, x, z, ... }] }.
// props are what render/folk_fx.js draws (seat logs, a fire). Plain sim code, no three.js.
import { dirIndex } from './geometry.js';
import { WILD } from './bandits.js';

const HZ = 20;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// state, data (wildlife.json "folk"), world (world.json), areas (sim/areas.js), roads: [{ points }] (the drawn roads),
// settled(x, z): towns, camps, the gate; warAt(x, z): a war circle covers it; ready(): island games only;
// spawn / remove / moveTo / stopPath / fightStep / statsOf: the game's own
export function createWanderingFolk({ state, data, world = null, areas, roads = [], settled = () => false, warAt = () => false, ready = () => true, herd = () => [], startle = () => {},
  spawn, remove, moveTo, stopPath, fightStep = () => false, statsOf, say = () => {}, seed = 1 }) {
  const R = data?.rules || {}, SC = data?.scenes || {};
  const secs = s => Math.round(s * HZ);
  let s = seed >>> 0;
  function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  const range = ([a, b]) => a + rng() * (b - a);
  const pick = list => list[Math.floor(rng() * list.length)];
  const F = () => { state.world ||= {}; return state.world.folk ||= { scenes: {}, next: null, rest: {}, n: 0 }; };
  const alive = e => e && !e.dead && !e.downed;
  // a few words over his head (render/folk_fx.js 'folkSay'): one of the scene's lines (wildlife.json folk.scenes.<scene>.lines.<key>)
  const speak = (sc, e, key, chance = 1) => {
    const lines = SC[sc.kind]?.lines?.[key];
    if (!e || !lines?.length || rng() >= chance) return;
    // "words | answer": the answer comes a moment later from whoever of the scene stands nearest him (a short exchange)
    const [text, answer] = pick(lines).split(' | ');
    state.casts.push({ kind: 'folkSay', scene: sc.id, a: e.id, x: e.x, z: e.z, text, place: 'world' });
    if (answer) sc.reply = { at: state.tick + secs(R.replySeconds ?? 1.8), text: answer, from: e.id }; else delete sc.reply;
  };
  // after a scene's step: the answer that is due, and a line for whatever it just did (lines named by the cast kind,
  // as "folkBell" or "folkPop", spoken by the one the cast is about)
  function talk(sc, from) {
    const r = sc.reply;
    if (r && state.tick >= r.at) {
      delete sc.reply;
      const a = state.entities[r.from], o = a && members(sc).filter(e => e.id !== r.from && alive(e) && e.anim !== 'death').sort((p, q) => dist(p, a) - dist(q, a))[0];
      if (o) state.casts.push({ kind: 'folkSay', scene: sc.id, a: o.id, x: o.x, z: o.z, text: r.text, place: 'world' });
    }
    const lines = SC[sc.kind]?.lines;
    if (!lines) return;
    for (let i = from, n = state.casts.length; i < n; i++) {
      const c = state.casts[i];
      if (c.scene === sc.id && c.kind !== 'folkSay' && lines[c.kind]) speak(sc, state.entities[c.a], c.kind, R.talkChance ?? 0.7);
    }
  }
  // somebody of a clan out on the island (folk notice them; bots' people too)
  const person = e => alive(e) && e.place === 'world' && !!state.clans?.[e.owner] && !e.folk && !e.garrison && !e.aboard && !e.stored && !e.inShip && !e.ship && !e.shipRide && e.type !== 'civilian';
  const rider = p => !!(p.mounted || p.ride);
  const playerClan = owner => !!state.clans?.[owner] && !state.clans[owner].bot;
  const activeChunk = (x, z) => areas.activeIds().includes(areas.chunkId(...areas.chunkOf(x, z)));
  const cellKey = (x, z) => { const c = R.restCell ?? 300; return `${Math.floor(x / c)}_${Math.floor(z / c)}`; };
  const face = (e, x, z) => { if (Math.hypot(x - e.x, z - e.z) > 0.05) e.dir = dirIndex(x - e.x, z - e.z); };
  const free = (x, z) => areas.nav.nearestFree(x, z);
  const biomeAt = (x, z) => {
    let best = null, bd = Infinity;
    for (const r of world?.regions || []) {
      const [x0, z0, x1, z1] = r.box || [];
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r.biome;
      const d = Math.hypot(x - (x0 + x1) / 2, z - (z0 + z1) / 2);
      if (d < bd) { bd = d; best = r.biome; }
    }
    return best;
  };

  // ---- Roads (the drawn ones), as segments -------------------------------------------------------------------------
  const segs = [];
  for (const l of roads || []) for (let k = 1; k < (l.points?.length || 0); k++) segs.push([l.points[k - 1], l.points[k], l, k]);
  function onRoad(x, z, reach) {   // the nearest point on a road within reach: { x, z, seg, t } or null
    let best = null, bd = reach;
    for (const sg of segs) {
      const [[ax, az], [bx, bz]] = sg, dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      if (Math.min(ax, bx) > x + reach || Math.max(ax, bx) < x - reach || Math.min(az, bz) > z + reach || Math.max(az, bz) < z - reach) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, seg: sg, t }; }
    }
    return best;
  }
  const roadDistance = (x, z, reach = 30) => { const p = onRoad(x, z, reach); return p ? Math.hypot(p.x - x, p.z - z) : Infinity; };

  // ---- Where scenes may come ---------------------------------------------------------------------------------------
  // spread-out spots among the player's own units on the island (the hero first); none in a war circle or a town
  // which way each of them is going (since the last look, every thinkSeconds), so a scene can start ahead of a rider
  // instead of behind him (2026-11-26: riding past, you would miss them)
  const seen = new Map();
  function anchors() {
    const out = [], gap = R.anchorGap ?? 120, moved = R.headingMove ?? 3;
    const mine = Object.values(state.entities).filter(e => person(e) && playerClan(e.owner) && !e.warTroop && !e.worker)
      .sort((a, b) => (b.type === 'hero') - (a.type === 'hero'));
    for (const e of mine) {
      if (out.length >= (R.anchors ?? 3)) break;
      if (settled(e.x, e.z) || warAt(e.x, e.z)) continue;
      if (!out.every(a => Math.hypot(a.x - e.x, a.z - e.z) > gap)) continue;
      const was = seen.get(e.id), heading = was && Math.hypot(e.x - was[0], e.z - was[1]) >= moved ? Math.atan2(e.z - was[1], e.x - was[0]) : null;
      out.push({ x: e.x, z: e.z, heading, hero: e.type === 'hero' });
    }
    if (state.tick % Math.round((R.thinkSeconds ?? 3) * HZ) === 0) { seen.clear(); for (const e of mine) seen.set(e.id, [e.x, e.z]); }
    return out;
  }
  // a spot of this kind round the anchor, out of sight of everyone: { x, z, ford?, road? } or null
  // loose: no road (or crossing, or pass) to be had there, so open ground will do (a camp in the woods, a hold-up on a forest path)
  function spotFor(where, a, people, loose = false) {
    const [r0, r1] = R.spawnRing || [70, 110];
    const clear = (x, z) => activeChunk(x, z) && !settled(x, z) && !warAt(x, z) && (F().rest[cellKey(x, z)] ?? -1) <= state.tick
      && !people.some(p => Math.hypot(p.x - x, p.z - z) < r0 * 0.8);
    // on the move: only the way he is going, within aheadCone either side
    const ahead = (x, z) => a.heading == null || Math.cos(Math.atan2(z - a.z, x - a.x) - a.heading) >= Math.cos(R.aheadCone ?? 0.6);
    const listed = list => {   // bridges, fords and passes from world.json, nearest the ring first
      const c = (list || []).filter(p => { const d = Math.hypot(p.x - a.x, p.z - a.z); return d >= r0 * 0.8 && d <= r1 * (R.landmarkReach ?? 2); })
        .filter(p => ahead(p.x, p.z) && clear(p.x, p.z));
      const p = c.length ? pick(c) : null, q = p && free(p.x, p.z);
      return q ? { x: q[0], z: q[1], landmark: p.id } : null;
    };
    if (where === 'crossing') { const p = listed(world?.fords); if (p) return p; where = 'road'; }
    if (where === 'pass') { const p = listed(world?.passes); if (p) return p; where = 'road'; }
    for (let tries = 0; tries < 12; tries++) {
      const ang = a.heading == null ? rng() * Math.PI * 2 : a.heading + (rng() * 2 - 1) * (R.aheadCone ?? 0.6), d = range([r0, r1]);
      let x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d, road = null;
      if (where === 'road') {
        road = onRoad(x, z, R.roadReach ?? 45);
        if (!road) continue;
        x = road.x; z = road.z;
      } else if (where === 'wild' || where === 'nearRoad') {
        const rd = roadDistance(x, z, 40);
        if (where === 'wild' && rd < (R.offRoad ?? 14)) continue;
        if (where === 'nearRoad' && (rd < (R.offRoad ?? 14) || rd > 40)) continue;
      }
      if (!clear(x, z) || !ahead(x, z)) continue;
      const q = free(x, z);
      if (!q || Math.hypot(q[0] - x, q[1] - z) > 6) continue;
      return { x: q[0], z: q[1], road };
    }
    return loose && where !== 'wild' ? spotFor('wild', a, people) : null;
  }
  // the scene kinds that fit here and now, by weight times the biome's lean
  function kindFor(x, z) {
    const biome = biomeAt(x, z), list = Object.entries(SC).filter(([k, sc]) => BUILD[k] && !sc.off
      && (sc.time !== 'night' || state.night) && (sc.time !== 'day' || !state.night))
      .map(([k, sc]) => [k, (sc.weight ?? 1) * (sc.biomes?.[biome] ?? sc.biomes?.other ?? 1)]).filter(([, w]) => w > 0);
    let r = rng() * list.reduce((n, [, w]) => n + w, 0);
    for (const [k, w] of list) if ((r -= w) < 0) return k;
    return null;
  }

  // ---- Scene life --------------------------------------------------------------------------------------------------
  function newScene(kind, spot) {
    const f = F(), id = `folk${++f.n}`;
    return f.scenes[id] = { id, kind, x: spot.x, z: spot.z, phase: 'start', until: state.tick, members: [], m: {}, props: [], born: state.tick };
  }
  // one of the scene's people: townsfolk to the rules (nobody can touch them), or a real bandit
  function member(sc, model, x, z, extra = {}) {
    const p = free(x, z) || [x, z], bandit = extra.bandit;
    delete extra.bandit;
    if (!bandit && R.names?.length) {   // each his own name (2026-11-26): "Genzo the pilgrim"
      const used = members(sc).map(e => e.given), left = R.names.filter(n => !used.includes(n)), given = pick(left.length ? left : R.names);
      extra = { ...extra, given, name: extra.name ? `${given} the ${extra.name.toLowerCase()}` : given };
    }
    const id = bandit
      ? spawn('bandit', statsOf('bandit').sprite || model || 'bandit', p[0], p[1], { place: 'world', area: 'world', owner: WILD, wild: true, folk: sc.id, name: 'Bandit', dir: 0, ...extra })
      : spawn('civilian', model, p[0], p[1], { place: 'world', area: 'world', folk: sc.id, untouchable: true, holdFire: true, hp: 60, maxHp: 60, dir: 0, ...extra });
    sc.members.push(id);
    sc.m[id] = { mode: 'idle' };
    return state.entities[id];
  }
  const members = sc => sc.members.map(id => state.entities[id]).filter(Boolean);
  function end(sc) {
    for (const id of sc.members) if (state.entities[id]) remove(id);
    F().rest[cellKey(sc.x, sc.z)] = state.tick + secs(R.restSeconds ?? 600);
    delete F().scenes[sc.id];
  }
  // walk (or run) toward (x, z): true while on the way, false once there or when no way
  function go(e, x, z, run = false) {
    if (Math.hypot(x - e.x, z - e.z) < 0.6) { stopPath(e); return false; }
    if (!moveTo(e, statsOf(e), x, z, !run)) { stopPath(e); return false; }
    return true;
  }
  // off out of the scene: walk away and go once out of everyone's sight
  function leave(e, sc, from = sc, run = false) {
    const m = sc.m[e.id];
    if (!m || m.mode === 'leave') return;
    const a = Math.atan2(e.z - from.z, e.x - from.x) + (rng() - 0.5) * 0.7, d = R.leaveDistance ?? 70;
    const p = free(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d) || [e.x + Math.cos(a) * d, e.z + Math.sin(a) * d];
    Object.assign(m, { mode: 'leave', x: p[0], z: p[1], run, until: state.tick + secs(R.leaveSeconds ?? 60) });
    delete e.swing;
  }
  function leaveStep(e, sc, m, people) {
    const moving = state.tick < m.until && go(e, m.x, m.z, m.run);
    if (moving) return;
    // no way there (water, a cliff): another way out, a few times over, before he gives up
    if (state.tick < m.until && Math.hypot(m.x - e.x, m.z - e.z) > 3 && (m.tries = (m.tries || 0) + 1) <= 8) {
      const ang = rng() * Math.PI * 2, d = (R.leaveDistance ?? 70) * (0.4 + rng() * 0.6), p = free(e.x + Math.cos(ang) * d, e.z + Math.sin(ang) * d);
      if (p) { m.x = p[0]; m.z = p[1]; }
      return;
    }
    e.anim = 'idle';
    if (!people.some(p => dist(p, e) < (R.goneDistance ?? 40))) remove(e.id);
  }
  // everyone runs off (an army, a war, shots): a moment's fright, then away from it
  function scatter(sc, from) {
    if (sc.phase === 'scatter') return;
    sc.phase = 'scatter';
    for (const p of sc.props) if (p.fire && !p.out) p.out = state.tick;   // a camp's fire left to burn down
    for (const e of members(sc)) {
      if (e.dead || e.anim === 'death') continue;
      delete e.peddlerShop;   // no trading on the run
      if (e.owner === WILD && e.angry) continue;   // a bandit in a fight fights on
      const m = sc.m[e.id];
      leave(e, sc, { x: from[0], z: from[1] }, true);
      m.fright = state.tick + secs(R.frightSeconds ?? 0.8);
    }
  }
  // noises that scatter folk: shots and blows near, not those of the scene's own fight
  function noises() {
    const N = R.scatter || {}, out = [];
    for (const c of state.casts || []) if (N[c.kind] && (c.place ?? 'world') === 'world') out.push([c.x, c.z, N[c.kind], c.a]);
    for (const h of state.hits || []) {
      const a = state.entities[h.a], t = state.entities[h.t];
      if (a?.place !== 'world' || a.wildlife) continue;
      out.push([a.x, a.z, (statsOf(a).attackRange || 1) > 3 ? N.shot ?? 45 : N.melee ?? 15, a.folk || t?.folk || null]);
    }
    return out;
  }
  // an army on the march: this many war troops (any side) near
  const army = (sc, people) => people.filter(p => p.warTroop && dist(p, sc) <= (R.armyRadius ?? 50)).length >= (R.armySize ?? 8);

  // ---- The scenes --------------------------------------------------------------------------------------------------
  // A log to sit on (the 'sit' clip sits on a seat, render/view.js lifts the sitter by SIT_LIFT): lying under the sitter
  // and along his facing, the way render/campfire_fx.js lays the seat logs round a fire
  const seatLog = (x, z, fx, fz) => ({ art: 'rotten_log', x, z, s: 0.5, flip: Math.abs(z - fz) > Math.abs(x - fx), depthBias: (x - fx) + (z - fz) > 0 ? 1.5 : -1.5, seat: true, fx, fz });
  // The wandering hermit (2026-11-26: no log, no fire; each scene its own thing): an old herbalist the animals
  // trust. A few deer come along with him (real deer, sim/wild_animals.js: they keep him as their home and do not
  // mind him) and the crows come down by him (render/crow_fx.js, e.crowFriend). He roams from one patch to the next,
  // stooping to pick herbs; with enough picked he stops to mix them in his flasks, and that goes off: a pop, a flash
  // and coloured smoke ('folkPop' cast: render/folk_fx.js draws it, the deer and crows bolt and come back), and he
  // flinches, or with a big one scurries back a few steps. He turns to watch whoever is near and bows to one who stops
  // beside him. After a few brews he goes on his way.
  const HERMIT = {
    where: 'wild',
    start(sc, spot) {
      const H = SC.hermit || {};
      const e = member(sc, pick(H.models || ['monk']), spot.x, spot.z, { name: H.name || 'Wandering hermit', crowFriend: true });
      Object.assign(sc, { phase: 'herbs', brews: 0, picked: 0 });
      Object.assign(sc.m[e.id], { mode: 'stand', until: state.tick + secs(2) });
      if (H.herd !== false) for (const id of herd(H.animal || 'deer', spot.x + 3, spot.z + 2, { friend: e.id }) || []) if (state.entities[id]) state.entities[id].folkFriend = sc.id;
    },
    // the next patch of herbs: on a bit from here, turning away from whoever is close
    patch(sc, e, people) {
      const H = SC.hermit || {}, near = people.slice().sort((a, b) => dist(a, e) - dist(b, e))[0];
      for (let i = 0; i < 6; i++) {
        const a = (near && dist(near, e) < 30 && i < 3 ? Math.atan2(e.z - near.z, e.x - near.x) + (rng() - 0.5) * 2 : rng() * Math.PI * 2), d = range(H.patchDistance || [7, 16]);
        const p = free(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
        if (p && Math.hypot(p[0] - e.x, p[1] - e.z) > 3 && !settled(p[0], p[1])) return p;
      }
      return null;
    },
    step(sc, people) {
      const H = SC.hermit || {}, e = members(sc).find(u => u.type === 'civilian');
      if (!e) return end(sc);
      const m = sc.m[e.id];
      if (e.tiny && state.tick >= (m.tinyUntil ?? 0)) {   // back to his own size with a little puff
        delete e.tiny;
        state.casts.push({ kind: 'folkPop', scene: sc.id, a: e.id, x: e.x, z: e.z, place: 'world', small: true, tint: Math.floor(rng() * 4) });
      }
      if (m.mode === 'leave') return leaveStep(e, sc, m, people);
      const near = people.filter(p => dist(p, e) <= (H.watchRange ?? 12)).sort((a, b) => dist(a, e) - dist(b, e))[0];
      // one who stops beside him gets a bow, whatever he was at (not in the middle of a flinch)
      const close = near && dist(near, e) <= (H.bowRange ?? 5) && near.anim !== 'run' && !rider(near);
      m.linger = close ? (m.linger || 0) + 1 : 0;
      if (close && !['bow', 'flinch', 'scurry', 'down'].includes(m.mode) && m.linger >= secs(H.lingerSeconds ?? 2) && state.tick >= (m.bowed ?? -Infinity)) {
        stopPath(e);
        Object.assign(m, { back: m.mode, backLeft: Math.max(secs(1), (m.until ?? state.tick) - state.tick), mode: 'bow', until: state.tick + secs(H.bowSeconds ?? 2.4), bowed: state.tick + secs(H.bowGap ?? 30), to: near.id });
        speak(sc, e, 'greet');
      }
      if (m.mode === 'bow') {
        const t = state.entities[m.to];
        e.anim = 'bow'; if (t) face(e, t.x, t.z);
        if (state.tick < m.until) return;
        Object.assign(m, { mode: m.back === 'roam' ? 'stand' : m.back || 'stand', until: state.tick + (m.backLeft ?? secs(1)) });
        return;
      }
      if (m.mode === 'stand') {   // a look round between things
        e.anim = 'idle';
        if (near) face(e, near.x, near.z);
        if (state.tick < m.until) return;
        if (sc.brews >= (H.brews ?? 3)) return leave(e, sc, near || sc);
        if (sc.picked >= (m.need ??= Math.round(range(H.picksPerBrew || [2, 3])))) {
          Object.assign(m, { mode: 'mix', until: state.tick + secs(range(H.mixSeconds || [4, 7])) });
          return;
        }
        if (!m.fed && rng() < (H.feedChance ?? 0.35)) {
          const pet = Object.values(state.entities).filter(a => a.wm?.friend === e.id && !a.dead).sort((a, b) => dist(a, e) - dist(b, e))[0], ang = rng() * Math.PI * 2;
          const [tx, tz] = pet ? [pet.x, pet.z] : [e.x + Math.cos(ang) * 3, e.z + Math.sin(ang) * 3];
          face(e, tx, tz);
          Object.assign(m, { fed: true, tossed: false, tx, tz, mode: 'feed', until: state.tick + secs(H.feedSeconds ?? 2.6) });
          return;
        }   // a handful thrown to the animals
        m.fed = false;
        const p = HERMIT.patch(sc, e, people);
        if (!p) { m.until = state.tick + secs(2); return; }
        // what he is after stands there to be seen: a little clump of mushrooms (hermit.herbs, island art; 2026-11-26).
        // He stops a step short of it and stoops to it; it is gone from the ground part way through the stoop
        sc.props = sc.props.filter(q => !q.herb);
        const hd = Math.hypot(p[0] - e.x, p[1] - e.z) || 1, short = H.herbReach ?? 0.7;
        sc.props.push({ art: pick(H.herbs || ['forest_cream_mushrooms']), x: p[0], z: p[1], herb: true });
        Object.assign(m, { mode: 'roam', x: p[0] - (p[0] - e.x) / hd * short, z: p[1] - (p[1] - e.z) / hd * short, hx: p[0], hz: p[1], until: state.tick + secs(30) });
        return;
      }
      if (m.mode === 'feed') {   // hermit.clips.feed: his bow until he has a throwing clip
        e.anim = H.clips?.feed || 'bow';
        // the toss itself, part way through the clip: toward the nearest of his animals ('folkFeed': render/folk_fx.js)
        if (!m.tossed && state.tick >= m.until - secs((H.feedSeconds ?? 2.6) * (1 - (H.tossAt ?? 0.55)))) {
          m.tossed = true;
          state.casts.push({ kind: 'folkFeed', scene: sc.id, a: e.id, x: e.x, z: e.z, tx: m.tx, tz: m.tz, place: 'world' });
        }
        if (state.tick < m.until) return;
        Object.assign(m, { mode: 'stand', until: state.tick + secs(range(H.pauseSeconds || [1, 2.5])) });
        return;
      }
      if (m.mode === 'roam') {
        if (close) { stopPath(e); Object.assign(m, { mode: 'stand', until: state.tick + secs(3) }); return; }   // somebody has come up to him: he stops for them
        if (state.tick < m.until && go(e, m.x, m.z)) { [sc.x, sc.z] = [e.x, e.z]; return; }
        stopPath(e);
        Object.assign(m, { mode: 'pick', until: state.tick + secs(H.pickSeconds ?? 2.4) });
        return;
      }
      if (m.mode === 'pick') {   // stooping to it (hermit.clips.pick: his bow until he has a picking clip)
        e.anim = H.clips?.pick || 'bow';
        if (m.hx != null) face(e, m.hx, m.hz);
        if (state.tick >= m.until - secs((H.pickSeconds ?? 2.4) * (1 - (H.pickAt ?? 0.5)))) sc.props = sc.props.filter(q => !q.herb);
        if (state.tick < m.until) return;
        sc.picked++;
        Object.assign(m, { mode: 'stand', until: state.tick + secs(range(H.pauseSeconds || [1, 2.5])) });
        return;
      }
      if (m.mode === 'mix') {   // at his flasks (hermit.clips.mix: his talking hands until he has a mixing clip)
        e.anim = H.clips?.mix || 'talk';
        // notes and scraps slip out of his sleeves as he works ('folkPaper': render/folk_fx.js)
        if (state.tick >= (m.paper ?? 0)) { m.paper = state.tick + secs(range(H.paperEvery || [0.6, 1.4])); state.casts.push({ kind: 'folkPaper', scene: sc.id, a: e.id, x: e.x, z: e.z, place: 'world' }); }
        if (state.tick < m.until) return;
        // how this brew goes wrong (hermit.mishaps, chances): a plain pop he flinches at; a big one he scurries back from;
        // one that shrinks him for a few seconds (e.tiny: render/view.js draws him small); one that knocks him flat
        const M = H.mishaps || { pop: 0.4, big: 0.25, shrink: 0.2, knock: 0.15 };
        let roll = rng() * Object.values(M).reduce((n, w) => n + w, 0), kind = 'pop';
        for (const [k, w] of Object.entries(M)) if ((roll -= w) < 0) { kind = k; break; }
        const big = kind === 'big' || kind === 'knock';
        sc.brews++; sc.picked = 0; delete m.need;
        state.casts.push({ kind: 'folkPop', scene: sc.id, a: e.id, x: e.x, z: e.z, place: 'world', big, shrink: kind === 'shrink', tint: Math.floor(rng() * 4) });
        for (const a of Object.values(state.entities)) if (a.wm?.friend === e.id) startle(a, e.x, e.z);   // his deer bolt (and come back: he is their home)
        Object.assign(m, { px: e.x, pz: e.z });
        if (kind === 'big') {   // he scurries back from it, then creeps back
          const b = (near && dist(near, e) < 8 ? Math.atan2(e.z - near.z, e.x - near.x) : rng() * Math.PI * 2) + (rng() - 0.5), p = free(e.x + Math.cos(b) * (H.scurry ?? 6), e.z + Math.sin(b) * (H.scurry ?? 6));
          Object.assign(m, { mode: 'scurry', x: p?.[0] ?? e.x, z: p?.[1] ?? e.z, until: state.tick + secs(3) });
        } else if (kind === 'knock') Object.assign(m, { mode: 'down', until: state.tick + secs(H.downSeconds ?? 3.5) });   // flat on his face, then up again
        else {
          if (kind === 'shrink') { e.tiny = true; m.tinyUntil = state.tick + secs(range(H.tinySeconds || [5, 8])); }
          Object.assign(m, { mode: 'flinch', until: state.tick + secs(H.flinchSeconds ?? 1.6) });
        }
        return;
      }
      if (m.mode === 'down') {
        e.anim = 'death';
        if (state.tick < m.until) return;
        Object.assign(m, { mode: 'flinch', until: state.tick + secs(H.flinchSeconds ?? 1.6) });
        return;
      }
      if (m.mode === 'scurry') {
        if (state.tick < m.until && go(e, m.x, m.z, true)) return;
        stopPath(e);
        Object.assign(m, { mode: 'flinch', until: state.tick + secs(H.flinchSeconds ?? 1.6) });
        return;
      }
      if (m.mode === 'flinch') {   // staring at where it went off
        e.anim = 'scared'; face(e, m.px, m.pz);
        if (state.tick < m.until) return;
        Object.assign(m, { mode: 'stand', until: state.tick + secs(range(H.pauseSeconds || [1, 2.5])) });
      }
    },
  };

  // The ronin duel, on a bridge or a ford (else a road): they face off with a shout, circle, clash, part, again for a
  // round or two; then one falls and the winner stands over him a moment and walks off. The body lies there until the
  // scene goes. A rider who comes close stops it: both turn and stare him down until he has gone by.
  const DUEL = {
    where: 'crossing',
    start(sc, spot) {
      const D = SC.duel || {}, models = (D.models || ['ronin', 'swordsman']).slice();
      const seg = spot.road?.seg, ang = seg ? Math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0]) : rng() * Math.PI;
      const gap = (D.gap ?? 4.4) / 2;
      for (const k of [0, 1]) {
        const sgn = k ? 1 : -1, m = models.splice(Math.floor(rng() * models.length), 1)[0] || 'ronin';
        member(sc, m, spot.x + Math.cos(ang) * gap * sgn, spot.z + Math.sin(ang) * gap * sgn, { name: D.name || 'Ronin' });
      }
      const [a, b] = members(sc);
      if (!a || !b) return;
      face(a, b.x, b.z); face(b, a.x, a.z);
      const [r0, r1] = D.rounds || [2, 3];
      Object.assign(sc, { phase: 'face', until: state.tick + secs(D.faceSeconds ?? 3), ang, rounds: Math.round(range([r0, r1])), loser: rng() < 0.5 ? 0 : 1 });
      state.casts.push({ kind: 'folkShout', scene: sc.id, a: a.id, x: sc.x, z: sc.z, place: 'world' });
    },
    step(sc, people) {
      const D = SC.duel || {}, [a, b] = sc.members.map(id => state.entities[id]);
      if (!a || !b) {   // one went off: the other goes too
        for (const e of members(sc)) if (sc.m[e.id]?.mode !== 'leave' && e.anim !== 'death') leave(e, sc);
        for (const e of members(sc)) if (sc.m[e.id]?.mode === 'leave') leaveStep(e, sc, sc.m[e.id], people); else DUEL.body(e, sc, people);
        return;
      }
      const both = [a, b];
      // after the fall: the winner stands over the body, then walks off; the body lies there
      if (sc.phase === 'fallen') {
        const w = both[1 - sc.loser], l = both[sc.loser], m = sc.m[w.id];
        DUEL.body(l, sc, people);
        if (m.mode === 'leave') return leaveStep(w, sc, m, people);
        w.anim = 'idle'; face(w, l.x, l.z);
        if (state.tick >= sc.until) leave(w, sc, l);
        return;
      }
      // a rider close by: both stop and stare him down until he has gone past
      const rd = people.filter(p => rider(p) && dist(p, sc) <= (sc.phase === 'stare' ? (D.stareRange ?? 12) + 5 : D.stareRange ?? 12)).sort((p, q) => dist(p, sc) - dist(q, sc))[0];
      if (rd) {
        if (sc.phase !== 'stare') { sc.paused = { phase: sc.phase, left: Math.max(secs(1), sc.until - state.tick) }; sc.phase = 'stare'; }
        sc.until = state.tick + secs(D.stareHold ?? 1.5);
        for (const e of both) { stopPath(e); delete e.swing; e.anim = 'idle'; face(e, rd.x, rd.z); }
        return;
      }
      if (sc.phase === 'stare') {
        if (state.tick < sc.until) return;
        sc.phase = sc.paused?.phase || 'face'; sc.until = state.tick + (sc.paused?.left ?? secs(2)); delete sc.paused;
        if (sc.phase === 'clash' || sc.phase === 'circle') sc.phase = 'part';   // they square up again first
        for (const e of both) face(e, (e === a ? b : a).x, (e === a ? b : a).z);
        return;
      }
      const ring = (k, r) => [sc.x + Math.cos(sc.ang) * r * (k ? 1 : -1), sc.z + Math.sin(sc.ang) * r * (k ? 1 : -1)];
      if (sc.phase === 'face') {
        for (const e of both) { e.anim = 'idle'; face(e, (e === a ? b : a).x, (e === a ? b : a).z); }
        if (state.tick >= sc.until) Object.assign(sc, { phase: 'circle', until: state.tick + secs(D.circleSeconds ?? 3.5) });
        return;
      }
      if (sc.phase === 'circle') {   // round each other, a quarter turn or so
        sc.ang += (D.circleTurn ?? 0.9) / HZ;
        both.forEach((e, k) => { const [x, z] = ring(k, (D.gap ?? 4.4) / 2); if (!go(e, x, z)) { e.anim = 'idle'; face(e, (e === a ? b : a).x, (e === a ? b : a).z); } });
        if (state.tick >= sc.until) {
          Object.assign(sc, { phase: 'clash', until: state.tick + secs(D.clashSeconds ?? 1.4) });
          state.casts.push({ kind: 'folkClash', scene: sc.id, a: a.id, x: sc.x, z: sc.z, place: 'world' });
        }
        return;
      }
      if (sc.phase === 'clash') {   // in close, blades going
        both.forEach((e, k) => { const [x, z] = ring(k, D.clashGap ?? 0.75); if (!go(e, x, z, true)) { e.anim = 'attack'; face(e, (e === a ? b : a).x, (e === a ? b : a).z); } });
        if (state.tick < sc.until) return;
        if (--sc.rounds > 0) { Object.assign(sc, { phase: 'part', until: state.tick + secs(D.partSeconds ?? 1.5) }); return; }
        // the last clash: one falls
        const l = both[sc.loser], w = both[1 - sc.loser];
        stopPath(l); l.anim = 'death'; sc.m[l.id].down = state.tick;
        stopPath(w); w.anim = 'idle'; face(w, l.x, l.z);
        Object.assign(sc, { phase: 'fallen', until: state.tick + secs(D.standOverSeconds ?? 3) });
        state.casts.push({ kind: 'folkFall', scene: sc.id, a: l.id, x: l.x, z: l.z, place: 'world' });
        return;
      }
      if (sc.phase === 'part') {   // step back apart and square up again
        both.forEach((e, k) => { const [x, z] = ring(k, (D.gap ?? 4.4) / 2); if (!go(e, x, z)) { e.anim = 'idle'; face(e, (e === a ? b : a).x, (e === a ? b : a).z); } });
        if (state.tick >= sc.until) {
          Object.assign(sc, { phase: 'face', until: state.tick + secs(D.faceSeconds ?? 3) * 0.6 });
          state.casts.push({ kind: 'folkShout', scene: sc.id, a: b.id, x: sc.x, z: sc.z, place: 'world' });
        }
      }
    },
    // the fallen one lies there; once nobody is near for a while after the fight the body goes
    body(e, sc, people) {
      e.anim = 'death';
      const m = sc.m[e.id];
      if (state.tick - (m.down ?? state.tick) > secs(SC.duel?.bodySeconds ?? 120) && !people.some(p => dist(p, e) < (R.goneDistance ?? 40))) remove(e.id);
    },
  };

  // The peddler held up, on a pass (else a road): two or three bandits ring a lone trader and lean on him, one shoving
  // him now and then. Whoever comes near gets watched and warned off. Hit one of them and they fight (they are real
  // bandits: their bodies carry ryo as any bandit's do); with them dead the peddler bows his thanks to his rescuer. Ride
  // past and after a while they rob him and go one way, and he goes the other.
  const PEDDLER = {
    where: 'pass',
    start(sc, spot) {
      const P = SC.peddler || {};
      const v = member(sc, pick(P.models || ['merchant']), spot.x, spot.z, { name: P.name || 'Peddler' });
      const n = Math.round(range(P.bandits || [2, 3])), base = rng() * Math.PI * 2;
      sc.ringAt = {};
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (P.spread ?? 0.9), r = P.ring ?? 2.6;
        const b = member(sc, 'bandit', v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, { bandit: true });
        face(b, v.x, v.z);
        sc.ringAt[b.id] = [b.x, b.z];
      }
      face(v, ...sc.ringAt[sc.members[1]]);
      Object.assign(sc, { phase: 'threat', until: state.tick + secs(range(P.threatSeconds || [30, 45])), victim: v.id, shove: state.tick + secs(range(P.shoveEvery || [4, 7])) });
    },
    step(sc, people) {
      const P = SC.peddler || {}, v = state.entities[sc.victim], gang = members(sc).filter(e => e.owner === WILD && alive(e));
      const vm = v && sc.m[v.id];
      if (vm?.mode === 'leave') leaveStep(v, sc, vm, people);
      for (const b of gang) if (sc.m[b.id]?.mode === 'leave') leaveStep(b, sc, sc.m[b.id], people);
      // a fight on: the gang fights by the game's own rules, the peddler cowers back out of it
      const fighting = gang.filter(b => sc.m[b.id]?.mode !== 'leave' && BANDIT_FIGHT(b, sc));
      if (fighting.length || gang.some(b => b.angry)) {
        sc.phase = 'fight';
        if (v && vm?.mode === 'dead') DUEL.body(v, sc, people);
        else if (v && vm?.mode !== 'leave') {
          const foe = people.filter(p => dist(p, v) < 15).sort((p, q) => dist(p, v) - dist(q, v))[0];
          if (foe && dist(foe, v) < 4) { const a = Math.atan2(v.z - foe.z, v.x - foe.x), p = free(v.x + Math.cos(a) * 5, v.z + Math.sin(a) * 5); if (!p || !go(v, p[0], p[1], true)) v.anim = 'scared'; }
          else { stopPath(v); v.anim = 'scared'; }
        }
        return;
      }
      if (sc.phase === 'fight') {
        if (!gang.length && vm?.mode === 'dead') { sc.phase = 'robbed'; return; }   // avenged, too late for him
        if (!gang.length) {   // saved: he bows to whoever saved him, then goes on his way
          const by = people.filter(p => dist(p, sc) < 40).sort((p, q) => (q.type === 'hero') - (p.type === 'hero') || dist(p, sc) - dist(q, sc))[0];
          Object.assign(sc, { phase: 'saved', until: state.tick + secs(P.bowSeconds ?? 2.6), by: by?.id ?? null });
          if (v && by) { stopPath(v); face(v, by.x, by.z); say(by.owner, P.thanks || 'The peddler bows his thanks'); }
          state.casts.push({ kind: 'folkThanks', scene: sc.id, a: v?.id ?? null, x: sc.x, z: sc.z, place: 'world' });
          speak(sc, v, 'thanks');
          return;
        }
        // the fight broke off with some of them still up: back round him, and they will soon be done with him
        if (vm?.mode === 'dead') { sc.phase = 'robbed'; for (const b of gang) leave(b, sc); return; }
        Object.assign(sc, { phase: 'threat', until: Math.min(sc.until, state.tick + secs(P.afterFightSeconds ?? 10)) });
      }
      if (sc.phase === 'saved') {
        if (!v || vm?.mode === 'leave') return;
        const by = state.entities[sc.by];
        v.anim = 'bow'; if (by) face(v, by.x, by.z);
        // saved, he opens his pack to his rescuers for a while (2026-11-26): the hero walks up and trades with him as
        // with a town's merchant (sim/item_services.js merchantNear, e.peddlerShop)
        if (state.tick >= sc.until) { v.peddlerShop = true; Object.assign(sc, { phase: 'trade', until: state.tick + secs(P.tradeSeconds ?? 120) }); speak(sc, v, 'trade'); }
        return;
      }
      if (sc.phase === 'trade') {
        if (!v || vm?.mode === 'leave') return;
        const buyer = people.filter(p => p.type === 'hero' && dist(p, v) < (P.tradeStay ?? 10)).sort((p, q) => dist(p, v) - dist(q, v))[0];
        stopPath(v); v.anim = 'idle'; if (buyer) { face(v, buyer.x, buyer.z); sc.until = Math.max(sc.until, state.tick + secs(8)); }   // never walks off on a buyer at his elbow
        if (state.tick >= sc.until) { delete v.peddlerShop; speak(sc, v, 'bye'); leave(v, sc, buyer || sc); }
        return;
      }
      if (sc.phase === 'robbed') {   // the gang off one way with his goods, he goes the other after a moment
        if (v && sc.lament && state.tick >= sc.lament) { delete sc.lament; speak(sc, v, 'robbed'); }
        if (sc.goAt != null && state.tick >= sc.goAt) {
          const a = rng() * Math.PI * 2, away = { x: sc.x - Math.cos(a) * 10, z: sc.z - Math.sin(a) * 10 };
          delete sc.goAt; speak(sc, gang[0], 'done');
          for (const b of gang) leave(b, sc, away);
        }
        if (v && vm?.mode === 'dead') { DUEL.body(v, sc, people); return; }   // nobody came: he lies where they left him
        if (v && vm?.mode !== 'leave') { v.anim = 'idle'; if (state.tick >= sc.until) leave(v, sc, gang[0] || sc); }
        return;
      }
      if (!v) { for (const b of gang) leave(b, sc); sc.phase = 'robbed'; return; }
      // nobody stepped in (2026-11-26): one of them walks up and cuts him down, they take his goods and go
      if (sc.phase === 'kill') {
        const b = gang.find(g => g.id === sc.killer) || gang[0];
        if (!b) { sc.phase = 'threat'; return; }
        v.anim = 'scared';
        for (const g of gang) if (g !== b) { g.anim = 'idle'; face(g, v.x, v.z); }
        if (sc.killAt == null) {
          const d = dist(b, v) || 1, reach = P.strikeReach ?? 1.1;
          if (d > reach + 0.25 && state.tick < sc.killBy && go(b, v.x + (b.x - v.x) / d * reach, v.z + (b.z - v.z) / d * reach)) return;
          stopPath(b);
          sc.killAt = state.tick + secs(P.hurtAfter ?? 0.35);
          state.casts.push({ kind: 'folkShove', scene: sc.id, a: b.id, x: v.x, z: v.z, place: 'world' });
          speak(sc, b, 'kill');
        }
        b.anim = 'attack'; face(b, v.x, v.z);
        if (state.tick < sc.killAt) return;
        v.anim = 'death'; Object.assign(vm, { mode: 'dead', down: state.tick }); stopPath(v);
        state.casts.push({ kind: 'folkHit', scene: sc.id, a: b.id, t: v.id, x: v.x, z: v.z, kill: true, place: 'world' });
        state.casts.push({ kind: 'folkCoins', scene: sc.id, a: v.id, x: v.x, z: v.z, tx: b.x, tz: b.z, place: 'world' });
        state.casts.push({ kind: 'folkRobbed', scene: sc.id, a: v.id, x: v.x, z: v.z, place: 'world' });
        sc.phase = 'robbed'; sc.goAt = state.tick + secs(P.shoveSeconds ?? 1);
        return;
      }
      // the hold-up: back to their places round him if a fight pulled them off, leaning on him, watching whoever comes
      // he cowers, pleads with them now and then, and doubles over when one of them lands a blow (2026-11-26: "the bandits
      // arent even attacking him")
      v.anim = state.tick >= (sc.hurtFrom ?? Infinity) && state.tick < (sc.hurtUntil ?? 0) ? 'bow' : Math.floor((state.tick + sc.born) / secs(P.pleadEvery ?? 3)) % 3 === 0 ? 'talk' : 'scared';
      if (sc.hitAt != null && state.tick >= sc.hitAt) {   // the blow lands: a little blood (render/view.js 'folkHit'), now and then coins
        const b = state.entities[sc.shoving] || gang[0];
        delete sc.hitAt;
        if (b) state.casts.push({ kind: 'folkHit', scene: sc.id, a: b.id, t: v.id, x: v.x, z: v.z, place: 'world' });
        if (b && sc.coins) state.casts.push({ kind: 'folkCoins', scene: sc.id, a: v.id, x: v.x, z: v.z, tx: b.x, tz: b.z, place: 'world' });
      }
      const pleadN = Math.floor((state.tick + sc.born) / secs(P.pleadEvery ?? 3));
      if (v.anim === 'talk' && sc.pleadN !== pleadN) { sc.pleadN = pleadN; speak(sc, v, 'plead'); }
      const near = people.filter(p => dist(p, sc) <= (P.noticeRange ?? 14)).sort((p, q) => dist(p, sc) - dist(q, sc))[0];
      if (near && !sc.warned) { sc.warned = true; state.casts.push({ kind: 'folkWarn', scene: sc.id, a: gang[0]?.id ?? null, x: sc.x, z: sc.z, place: 'world' }); speak(sc, gang[0], 'warn'); }
      if (!near) sc.warned = false;
      gang.forEach((b, i) => {
        const at = sc.ringAt[b.id] || [v.x, v.z];
        // his turn: he steps right up to the peddler, swings at him, and goes back to his place
        if (sc.shoving === b.id) {
          if (!sc.struck) {
            const d = dist(b, v) || 1, reach = P.strikeReach ?? 1.1;
            if (d > reach + 0.25 && state.tick < sc.shoveBy && go(b, v.x + (b.x - v.x) / d * reach, v.z + (b.z - v.z) / d * reach)) return;
            stopPath(b);
            Object.assign(sc, { struck: true, shoveEnd: state.tick + secs(P.shoveSeconds ?? 1), hurtFrom: state.tick + secs(P.hurtAfter ?? 0.35), hurtUntil: state.tick + secs((P.hurtAfter ?? 0.35) + (P.hurtSeconds ?? 1.1)) });
            state.casts.push({ kind: 'folkShove', scene: sc.id, a: b.id, x: v.x, z: v.z, place: 'world' });
            speak(sc, b, 'strike', P.strikeTalk ?? 0.6);
            sc.hitAt = sc.hurtFrom; sc.coins = rng() < (P.coinChance ?? 0.5);   // now and then the blow shakes some coins out of him
          }
          if (state.tick < sc.shoveEnd) { b.anim = 'attack'; face(b, v.x, v.z); return; }
          delete sc.shoving; delete sc.struck;
        }
        if (Math.hypot(at[0] - b.x, at[1] - b.z) > 1 && go(b, at[0], at[1])) return;
        b.anim = 'idle';
        // the two nearest him keep their eyes on the passer-by; the rest on the peddler
        if (near && i < 2) face(b, near.x, near.z); else face(b, v.x, v.z);
      });
      if (sc.shoving && !gang.some(b => b.id === sc.shoving)) { delete sc.shoving; delete sc.struck; }
      if (!sc.shoving && state.tick >= sc.shove && gang.length) {
        const b = pick(gang);
        Object.assign(sc, { shoving: b.id, struck: false, shoveBy: state.tick + secs(4), shove: state.tick + secs(range(P.shoveEvery || [2.5, 4])) });
      }
      if (state.tick < sc.until) return;
      // done waiting: the nearest of them goes in to finish it (the 'kill' phase above)
      const killer = gang.slice().sort((p, q) => dist(p, v) - dist(q, v))[0];
      if (!killer) return;
      delete sc.shoving; delete sc.struck; delete sc.hitAt;
      Object.assign(sc, { phase: 'kill', killer: killer.id, killAt: null, killBy: state.tick + secs(4) });
    },
  };

  // Pilgrims on the road: a line of three to five, the first ringing a hand bell now and then. They walk the road past
  // the player; where a roadside shrine stands by it (a shrine prop of the island art) they stop in a row, bow and stand
  // a moment, then go on. A rider coming along makes each step off the road and wait, facing him, until he has gone by.
  const SHRINE = /shrine/, NOT_SHRINE = /ninja/;
  function shrineNear(route, reach) {
    let best = null, bd = reach;
    for (const c of areas.active?.() || []) for (const p of c.gen?.props || []) {
      const name = p.art || p.kind || '';
      if (!SHRINE.test(name) || NOT_SHRINE.test(name)) continue;
      route.forEach((q, i) => { const d = Math.hypot(p.x - q[0], p.z - q[1]); if (d < bd) { bd = d; best = { x: p.x, z: p.z, art: name, at: i }; } });
    }
    return best;
  }
  const PILGRIMS = {
    where: 'road', needsRoad: true,
    // the road from here, the way that passes the player, resampled every step units, about length long
    route(spot, a) {
      const P = SC.pilgrims || {}, [, , line, k] = spot.road.seg, pts = line.points, L = P.routeLength ?? 170, step = P.routeStep ?? 12;
      const walk = sgn => {
        const out = [[spot.x, spot.z]];
        let left = L, cur = [spot.x, spot.z];
        for (let i = sgn > 0 ? k : k - 1; i >= 0 && i < pts.length && left > 0; i += sgn) {
          const p = pts[i], d = Math.hypot(p[0] - cur[0], p[1] - cur[1]);
          for (let t = step; t <= Math.min(d, left); t += step) out.push([cur[0] + (p[0] - cur[0]) * t / d, cur[1] + (p[1] - cur[1]) * t / d]);
          left -= d; cur = p;
        }
        // only ground they can walk: a stretch ends where the road goes over water or through rock
        const ok = [];
        for (const q of out) { const f = free(q[0], q[1]); if (!f || Math.hypot(f[0] - q[0], f[1] - q[1]) > 4) break; ok.push(f); }
        return ok;
      };
      const routes = [walk(1), walk(-1)].filter(r => r.length > (SC.pilgrims?.minRoute ?? 6));   // a real stretch of road, not a stub at a road's end
      const close = r => Math.min(...r.map(q => Math.hypot(q[0] - a.x, q[1] - a.z)));
      routes.sort((p, q) => close(p) - close(q));
      return routes[0] || null;
    },
    start(sc, spot) {
      const P = SC.pilgrims || {}, route = spot.anchor && PILGRIMS.route(spot, spot.anchor);
      if (!route) return;
      const n = Math.round(range(P.count || [3, 5])), models = P.models || ['monk', 'monk2', 'old_woman'];
      const back = Math.atan2(route[0][1] - route[1][1], route[0][0] - route[1][0]);
      for (let i = 0; i < n; i++) member(sc, i === 0 ? models[0] : pick(models), spot.x + Math.cos(back) * i * (P.spacing ?? 2.2), spot.z + Math.sin(back) * i * (P.spacing ?? 2.2), { name: P.name || 'Pilgrim' });
      const shrine = shrineNear(route, P.shrineReach ?? 25);
      Object.assign(sc, { phase: 'walk', route, leg: 1, trail: members(sc).map(e => [e.x, e.z]).reverse(), bell: state.tick + secs(range(P.bellEvery || [6, 10])), shrine });
    },
    // where the i-th in line should be: spacing * i back along the leader's trail
    slot(sc, i) {
      const sp = (SC.pilgrims?.spacing ?? 2.2) * i, t = sc.trail;
      let left = sp;
      for (let k = t.length - 1; k > 0; k--) {
        const d = Math.hypot(t[k][0] - t[k - 1][0], t[k][1] - t[k - 1][1]);
        if (d >= left) { const f = left / (d || 1); return [t[k][0] + (t[k - 1][0] - t[k][0]) * f, t[k][1] + (t[k - 1][1] - t[k][1]) * f]; }
        left -= d;
      }
      return t[0];
    },
    step(sc, people) {
      const P = SC.pilgrims || {}, line = sc.members.map(id => state.entities[id]).filter(Boolean);
      if (!line.length) return;
      if (sc.phase === 'gone') { for (const e of line) leaveStep(e, sc, sc.m[e.id], people); return; }
      const [lead] = line, dirAt = () => { const q = sc.route[Math.min(sc.leg, sc.route.length - 1)], p = sc.route[Math.max(0, Math.min(sc.leg, sc.route.length - 1) - 1)]; return Math.atan2(q[1] - p[1], q[0] - p[0]); };
      // a rider coming: everyone steps off the road to the side away from him and waits, facing him
      const rd = people.filter(p => rider(p) && line.some(e => dist(p, e) <= (sc.phase === 'aside' ? (P.stepRange ?? 14) + 5 : P.stepRange ?? 14))).sort((p, q) => dist(p, lead) - dist(q, lead))[0];
      if (rd) {
        if (sc.phase !== 'aside') {
          sc.paused = sc.phase; sc.phase = 'aside';
          const a = dirAt(), nx = -Math.sin(a), nz = Math.cos(a);
          for (const e of line) {
            const side = ((rd.x - e.x) * nx + (rd.z - e.z) * nz) > 0 ? -1 : 1, p = free(e.x + nx * side * (P.stepAside ?? 3.5), e.z + nz * side * (P.stepAside ?? 3.5));
            sc.m[e.id].aside = p || [e.x, e.z];
          }
        }
        sc.until = state.tick + secs(P.asideHold ?? 1.5);
      }
      if (sc.phase === 'aside') {
        for (const e of line) { const p = sc.m[e.id].aside; if (!p || !go(e, p[0], p[1])) { e.anim = rd && dist(rd, e) < 5 ? 'bow' : 'idle'; face(e, (rd || lead).x, (rd || lead).z); } }
        if (rd || state.tick < sc.until) return;
        sc.phase = sc.paused || 'walk'; delete sc.paused;
        for (const e of line) delete sc.m[e.id].aside;
      }
      if (sc.phase === 'shrine') {   // in a row before the shrine: bow, then stand a moment
        const s = sc.shrine, a = Math.atan2(sc.z0 - s.z, sc.x0 - s.x), nx = -Math.sin(a), nz = Math.cos(a), r = P.shrineGap ?? 3;
        let placed = 0;
        line.forEach((e, i) => {
          const off = (i - (line.length - 1) / 2) * 1.4, x = s.x + Math.cos(a) * r + nx * off, z = s.z + Math.sin(a) * r + nz * off;
          if (sc.sub === 'gather' && Math.hypot(x - e.x, z - e.z) > 0.8 && go(e, x, z)) return;
          placed++;
          stopPath(e); face(e, s.x, s.z);
          e.anim = sc.sub === 'gather' ? 'idle' : state.tick < sc.until - secs(P.standSeconds ?? 4) ? 'bow' : 'idle';
        });
        // all in the row (or long enough waiting for a slow one): the bow, then a moment standing
        if (sc.sub === 'gather' && (placed === line.length || state.tick >= sc.until)) Object.assign(sc, { sub: 'bow', until: state.tick + secs((P.bowSeconds ?? 3) + (P.standSeconds ?? 4)) });
        if (sc.sub === 'gather' || state.tick < sc.until) return;
        sc.phase = 'walk'; sc.shrine = { ...sc.shrine, done: true };
        sc.trail = line.map(e => [e.x, e.z]).reverse();
        return;
      }
      // walking: the leader along the road, the rest in his steps; the bell now and then
      const at = sc.route[sc.leg];
      if (!at) {   // the end of the stretch: on out of sight
        sc.phase = 'gone';
        const p = sc.route[sc.route.length - 2] || [sc.x, sc.z];
        for (const e of line) leave(e, sc, { x: p[0], z: p[1] });
        return;
      }
      const gap = Math.hypot(at[0] - lead.x, at[1] - lead.z);
      if (!(gap < (sc.best ?? Infinity) - 0.2)) { if (state.tick - (sc.bestAt ?? state.tick) > secs(P.stuckSeconds ?? 6)) { sc.leg = sc.route.length; delete sc.best; return; } }   // no nearer for a while: no way on, they turn off the road and go
      else { sc.best = gap; sc.bestAt = state.tick; }
      sc.bestAt ??= state.tick;
      if (!go(lead, at[0], at[1]) || gap < 1.5) { sc.leg++; delete sc.best; sc.bestAt = state.tick; }
      const last = sc.trail[sc.trail.length - 1];
      if (Math.hypot(lead.x - last[0], lead.z - last[1]) > 0.4) { sc.trail.push([lead.x, lead.z]); if (sc.trail.length > 80) sc.trail.shift(); }
      line.slice(1).forEach((e, i) => { const [x, z] = PILGRIMS.slot(sc, i + 1); if (!go(e, x, z)) { e.anim = 'idle'; face(e, lead.x, lead.z); } });
      [sc.x, sc.z] = [lead.x, lead.z];
      if (state.tick >= sc.bell) {
        sc.bell = state.tick + secs(range(P.bellEvery || [6, 10]));
        state.casts.push({ kind: 'folkBell', scene: sc.id, a: lead.id, x: lead.x, z: lead.z, place: 'world' });
      }
      // the shrine by the road: stop there
      const s = sc.shrine;
      if (s && !s.done && Math.hypot(lead.x - s.x, lead.z - s.z) < (P.shrineStop ?? 8)) {
        Object.assign(sc, { phase: 'shrine', sub: 'gather', until: state.tick + secs(P.gatherSeconds ?? 15), x0: lead.x, z0: lead.z });
        state.casts.push({ kind: 'folkBell', scene: sc.id, a: lead.id, x: lead.x, z: lead.z, place: 'world' });
      }
    },
  };

  // A night camp just off a road: travellers sit on logs round a fire, nobody armed, and one of them is on his feet,
  // strolling round the camp and stopping for a word by the fire. Riders, or a band of three or more, coming near: he
  // turns on them and calls out; the rest stay sitting (2026-11-26: sitting and having a chat, no swords out).
  // At dawn they put the fire out and go on.
  const CAMP = {
    where: 'nearRoad',
    start(sc, spot) {
      const C = SC.camp || {}, n = Math.round(range(C.sitters || [3, 4])), r = C.seatRadius ?? 2.4, models = (C.models || ['monk', 'monk2']).slice();
      sc.props.push({ art: 'campfire', x: spot.x, z: spot.z, fire: true });
      const base = rng() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = base + i / n * Math.PI * 2, seat = free(spot.x + Math.cos(a) * r, spot.z + Math.sin(a) * r);
        if (!seat || Math.hypot(seat[0] - spot.x, seat[1] - spot.z) > r + 1) continue;
        const m = models.length ? models.splice(Math.floor(rng() * models.length), 1)[0] : 'monk';
        const e = member(sc, m, seat[0], seat[1], { name: C.name || 'Traveller' });
        Object.assign(sc.m[e.id], { seat: [e.x, e.z] });
        sc.props.push(seatLog(e.x, e.z, spot.x, spot.z));
        e.sitAt = [spot.x, spot.z];
        face(e, spot.x, spot.z); e.anim = 'sit';
      }
      const wa = base + Math.PI / n, wp = free(spot.x + Math.cos(wa) * (C.watchRadius ?? 5), spot.z + Math.sin(wa) * (C.watchRadius ?? 5));
      if (wp) { const w = member(sc, C.watchModel || 'laborer', wp[0], wp[1], { name: C.watchName || 'Watchman' }); sc.watch = w.id; sc.m[w.id].look = state.tick; face(w, wp[0] * 2 - spot.x, wp[1] * 2 - spot.z); }
      Object.assign(sc, { phase: 'camp', fx: spot.x, fz: spot.z });
    },
    step(sc, people) {
      const C = SC.camp || {}, all = members(sc), w = state.entities[sc.watch], fire = sc.props.find(p => p.fire);
      if (sc.phase === 'dawn') {   // fire out, up and on their way
        for (const e of all) { const m = sc.m[e.id]; if (m?.mode === 'leave') leaveStep(e, sc, m, people); else { e.anim = 'idle'; if (state.tick >= sc.until) leave(e, sc, { x: sc.fx, z: sc.fz }); } }
        return;
      }
      if (!state.night) {
        Object.assign(sc, { phase: 'dawn', until: state.tick + secs(C.dawnSeconds ?? 4) });
        if (fire) fire.out = state.tick;
        return;
      }
      // who is coming: riders, or a band (groupSize or more of one clan)
      const R2 = sc.alarm ? (C.alarmRange ?? 25) + 5 : C.alarmRange ?? 25, near = people.filter(p => dist(p, sc) <= R2);
      const band = near.filter(p => rider(p) || near.filter(o => o.owner === p.owner).length >= (C.groupSize ?? 3)).sort((p, q) => dist(p, sc) - dist(q, sc));
      if (band.length) {
        if (!sc.alarm) state.casts.push({ kind: 'folkCall', scene: sc.id, a: w?.id ?? null, x: sc.x, z: sc.z, place: 'world' });
        sc.alarm = state.tick;
      } else if (sc.alarm && state.tick - sc.alarm > secs(C.calmSeconds ?? 4)) delete sc.alarm;
      const them = band[0];
      for (const e of all) {
        const m = sc.m[e.id];
        if (e.id === sc.watch) {
          if (them) { stopPath(e); delete m.to; e.anim = 'idle'; face(e, them.x, them.z); m.look = state.tick + secs(1); continue; }
          if (m.to) {   // strolling to his next spot
            if (go(e, m.to[0], m.to[1])) continue;
            delete m.to;
            m.look = state.tick + secs(range(C.lookEvery || [4, 7]));
            m.chat = rng() < (C.chatChance ?? 0.5) ? state.tick + secs(C.chatSeconds ?? 2.5) : 0; if (m.chat) speak(sc, w, 'chat');   // a word with the others, or a look out into the dark
            if (m.chat) face(e, sc.fx, sc.fz); else face(e, e.x * 2 - sc.fx, e.z * 2 - sc.fz);
          }
          e.anim = state.tick < (m.chat ?? 0) ? 'talk' : 'idle';
          if (state.tick >= (m.look ?? 0)) {
            const [r0, r1] = C.strollRing || [3.6, 5.5], a = Math.atan2(e.z - sc.fz, e.x - sc.fx) + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.2), r = r0 + rng() * (r1 - r0);
            const to = free(sc.fx + Math.cos(a) * r, sc.fz + Math.sin(a) * r);
            if (to && Math.hypot(to[0] - sc.fx, to[1] - sc.fz) >= r0 - 0.5) m.to = to;
            m.look = state.tick + secs(range(C.lookEvery || [4, 7]));
          }
          continue;
        }
        if (m.seat && Math.hypot(m.seat[0] - e.x, m.seat[1] - e.z) > 0.6 && go(e, m.seat[0], m.seat[1])) continue;
        e.anim = 'sit'; face(e, sc.fx, sc.fz);
      }
    },
  };

  const BUILD = { hermit: HERMIT, duel: DUEL, peddler: PEDDLER, pilgrims: PILGRIMS, camp: CAMP };

  // A scene of this kind somewhere round this anchor (tests call it straight); null when nowhere fits
  function startScene(kind, a, people = Object.values(state.entities).filter(person)) {
    const B = BUILD[kind];
    if (!B) return null;
    const spot = spotFor(B.where, a, people, !B.needsRoad);
    if (!spot) return null;
    spot.anchor = a;
    const sc = newScene(kind, spot);
    B.start(sc, spot);
    if (!sc.members.length) { delete F().scenes[sc.id]; return null; }
    return sc;
  }

  // Called once per tick after the units moved
  function tick() {
    if (!data || !areas || !ready()) return;
    const f = F(), scenes = Object.values(f.scenes);
    const people = scenes.length || state.tick % secs(R.thinkSeconds ?? 3) === 0 ? Object.values(state.entities).filter(person) : [];
    if (scenes.length) {
      const noise = noises();
      for (const sc of scenes) {
        if (!f.scenes[sc.id]) continue;
        sc.members = sc.members.filter(id => state.entities[id]);
        for (const id of Object.keys(sc.m)) if (!state.entities[id]) delete sc.m[id];
        if (!sc.members.length && sc.phase !== 'start') { end(sc); continue; }
        // shots and blows close by, an army marching up, a war circle come over it: everyone runs
        if (sc.phase !== 'scatter') {
          const n = noise.find(([x, z, r, by]) => by !== sc.id && Math.hypot(x - sc.x, z - sc.z) <= r);
          if (n) scatter(sc, n);
          else if ((state.tick + sc.born) % 10 === 0 && (army(sc, people) || warAt(sc.x, sc.z))) {
            const t = people.filter(p => p.warTroop).sort((a, b) => dist(a, sc) - dist(b, sc))[0];
            scatter(sc, t ? [t.x, t.z] : [sc.x + 1, sc.z]);
          }
        }
        if (sc.phase === 'scatter') {
          for (const e of members(sc)) {
            const m = sc.m[e.id];
            if (m?.mode !== 'leave') { if (e.owner === WILD) BANDIT_FIGHT(e, sc); else if (e.anim === 'death') DUEL.body(e, sc, people); continue; }
            if (state.tick < (m.fright ?? 0)) { stopPath(e); e.anim = e.model && e.type === 'civilian' ? 'scared' : 'idle'; continue; }
            leaveStep(e, sc, m, people);
          }
          continue;
        }
        const cast0 = state.casts.length;
        BUILD[sc.kind]?.step(sc, people);
        if (F().scenes[sc.id]) talk(sc, cast0);
      }
    }
    if (state.tick % secs(R.thinkSeconds ?? 3) !== 0) return;
    const marks = anchors();
    // gone again once nobody of the player's is near
    for (const sc of Object.values(f.scenes)) {
      const anyone = members(sc).length ? members(sc) : [sc];
      if (anyone.every(e => marks.every(a => dist(a, e) > (R.despawnDistance ?? 170)))) end(sc);
    }
    // a new scene now and then: about one every everySeconds of being out on the island
    if (!marks.length) return;
    if (f.next == null) f.next = state.tick + secs(range(R.firstSeconds || [30, 90]));
    if (state.tick < f.next) return;
    // round the hero whenever he is out; the scenes round someone else of his far off do not use up his share
    const a = marks.find(m => m.hero) || pick(marks);
    if (Object.values(f.scenes).filter(sc => dist(a, sc) <= (R.despawnDistance ?? 170)).length >= (R.maxScenes ?? 2)) return;
    const kind = kindFor(a.x, a.z);
    const sc = kind && startScene(kind, a, people);
    f.next = state.tick + secs(sc ? range(R.everySeconds || [120, 240]) : R.retrySeconds ?? 15);
  }

  // a bandit of a scene while angry: the game's own fighting (sim/game.js fightStep); anger runs out by its clock
  function BANDIT_FIGHT(e, sc) {
    if (e.angry) for (const [clan, until] of Object.entries(e.angry)) if (state.tick >= until) delete e.angry[clan];
    if (e.angry && !Object.keys(e.angry).length) delete e.angry;
    if (e.angry && fightStep(e, SC.peddler?.giveUp ?? 10)) return true;
    if (e.swing) { fightStep(e, SC.peddler?.giveUp ?? 10); return true; }
    return false;
  }

  return { tick, startScene, anchors, spotFor, scenes: () => Object.values(F().scenes), end: id => { const sc = F().scenes[id]; if (sc) end(sc); },
    scatter: (id, from) => { const sc = F().scenes[id]; if (sc) scatter(sc, from); }, noises,
    saveState: () => ({ s }), loadState: d => { if (d && Number.isFinite(d.s)) s = d.s; } };
}
