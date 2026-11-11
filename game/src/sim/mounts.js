// Horses and the hero's mount (Tim 2026-11-06, plan in project files omnibus_stable/plan.md). Horses come
// from a stable's production bar (sim/frontier/stable.js) and wait there; the clan's mount (clan.mount, the
// first horse raised or the one chosen at the stable) is the one H uses. Island only.
// H ({ id: <hero id>, type: 'mount', horse?: <id> }, right-click a horse of yours sends its id): on the horse -> get off; the horse beside you -> get on; else she is
// called and gallops to you. Riding is rules.mount.speed x the hero's run speed; he cannot fight while
// mounted, and below rules.mount.throwShare of his health he is thrown off. Going through the gate he gets
// off first (the horse waits there). A bot boss mounts his horse on the island by himself.
// Whistles (Tim 2026-11-07): each horse comes with her whistle (clan.whistles: { horse, name, kind }, shown under
// Field supplies on the character page). { type: 'mount', whistle: <horse id> } makes her your mount and calls
// her; if she is far (rules.mount.whistleRange), stuck (no closer for rules.mount.stuckSeconds) or gone (missing
// after a load), she appears beside you. A horse that dies takes her whistle with her.
// Stay ({ type: 'mount', stay: true }, the Mount panel, Tim 2026-11-07): she stays where she is (you get off, a call is off).
// Mount up (Tim 2026-11-07, Shift+H / the Mount up button): { type: 'mount', group: true, units?: [ids] } puts you and
// your selected crew (else the crew following you) on horses: free horses of yours nearby trot over, then spare
// ones (stored or far) come out to them. Settlers and workers never ride. Again with anyone mounted: everyone off.
// Mounted crew follow at horse speed; a hit, an attack order or low health puts them off, the horse waits there.
// createMounts({ state, rules, spawn, nav, born, say }) -> { command, tick, mountOf, dismount }
import { steer } from './vehicle_steer.js';

export function createMounts({ state, rules, spawn, nav, born, say }) {
  const R = () => rules?.mount || {};
  const clanOf = owner => state.clans?.[owner];
  const mountOf = owner => { const id = clanOf(owner)?.mount, h = id && state.entities[id]; return h && h.type === 'horse' && !h.dead ? h : null; };
  const heroOf = owner => Object.values(state.entities).find(e => e.type === 'hero' && e.owner === owner);
  const runOf = () => (R().heroRun ?? 6);
  // the clan's whistles, one per horse (older saves: made from the horses it owns)
  function whistlesOf(owner) {
    const clan = clanOf(owner); if (!clan) return [];
    clan.whistles ||= Object.values(state.entities).filter(h => h.type === 'horse' && h.horseOwner === owner && !h.dead).map(h => ({ horse: h.id, name: h.name, kind: h.horseKind }));
    return clan.whistles;
  }
  // a horse at the hero's side at once (nearest open ground)
  function beside(horse, hero) {
    const [x, z] = nav()?.nearestFree(hero.x + 1.5, hero.z + 1) || [hero.x + 1.5, hero.z + 1];
    Object.assign(horse, { x, z, place: 'world', anim: 'idle' }); delete horse.called; delete horse.path; delete horse.callBest;
    delete horse.stored;
  }
  // far away, stored or lost (Tim 2026-11-08): she turns up out of sight, arriveDistance off on the side she was on
  // (else behind you), and gallops the rest of the way in, so she never just pops up beside you
  function inbound(horse, hero) {
    const R0 = R().arriveDistance ?? 40, there = !horse.stored && horse.place === 'world';
    const base = there ? Math.atan2(horse.x - hero.x, horse.z - hero.z) : (hero.heading ?? 0) + Math.PI;
    let spot = null;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = base + k * Math.PI / 4, x = hero.x + Math.sin(a) * R0, z = hero.z + Math.cos(a) * R0;
      const p = nav()?.nearestFree(x, z) || [x, z];
      if (Math.hypot(p[0] - x, p[1] - z) < R0 * 0.3) { spot = p; break; }
    }
    if (!spot) return beside(horse, hero);
    Object.assign(horse, { x: spot[0], z: spot[1], place: 'world', anim: 'run' }); delete horse.stored; delete horse.path; delete horse.callBest;
    horse.called = hero.id;
  }
  // the whistle is heard (render/sound.js horse_whistle_1, Tim 2026-11-10)
  const blow = e => state.casts?.push({ kind: 'horseWhistle', a: e.id, x: e.x, z: e.z, place: e.place });
  function whistle(e, id) {
    const w = whistlesOf(e.owner).find(w => w.horse === id);
    if (!w) return say(e.owner, 'No such whistle');
    if (e.place !== 'world') return say(e.owner, 'Horses are for the island');
    let horse = state.entities[id];
    if (horse && (horse.type !== 'horse' || horse.dead)) return say(e.owner, `${w.name || 'Your horse'} is gone`);
    if (e.ride?.kind === 'horse' && e.ride.horse !== id) dismount(e);
    clanOf(e.owner).mount = id;
    if (!horse) {   // missing after a load: she comes back to the whistle
      const nid = spawn('horse', R().models?.[w.kind] || w.kind, e.x + 1.5, e.z + 1, { horseOwner: e.owner, horseKind: w.kind, name: w.name, place: 'world', hp: R().hp ?? 300, maxHp: R().hp ?? 300, holdFire: true, vehicle: true });
      horse = state.entities[nid]; w.horse = nid; clanOf(e.owner).mount = nid; inbound(horse, e); blow(e);
      return say(e.owner, `${w.name || 'Your horse'} is on her way`);
    }
    if (horse.rider === e.id) return;
    if (horse.rider) { const r = state.entities[horse.rider]; if (r) dismount(r); }
    const far = horse.stored || horse.place !== 'world' || Math.hypot(horse.x - e.x, horse.z - e.z) > (R().whistleRange ?? 300);
    if (far) { inbound(horse, e); blow(e); return say(e.owner, `${horse.name || 'Your horse'} is on her way`); }
    if (Math.hypot(horse.x - e.x, horse.z - e.z) <= (R().reach ?? 4)) return say(e.owner, `${horse.name || 'Your horse'} is your mount (H to ride)`);
    horse.called = e.id; delete horse.path; delete horse.callBest; blow(e);
    say(e.owner, `${horse.name || 'Your horse'} is on her way`);
  }

  function mount(hero, horse) {
    hero.ride = { kind: 'horse', speed: R().speed ?? 3.5, horse: horse.id };
    hero.mounted = true; hero.heading = horse.heading ?? hero.heading;
    horse.rider = hero.id; delete horse.called; delete horse.path;
    Object.assign(horse, { x: hero.x, z: hero.z });
  }
  function dismount(hero, why = '') {
    const horse = hero.ride?.kind === 'horse' && state.entities[hero.ride.horse];
    delete hero.ride; delete hero.mounted;
    if (!horse) return;
    horse.heading = hero.heading; delete hero.heading;
    delete horse.rider; horse.anim = 'idle';
    const [x, z] = nav()?.nearestFree(hero.x + 1.2, hero.z) || [hero.x, hero.z];
    Object.assign(horse, { x, z });
    if (why) say(hero.owner, why);
  }

  // who can ride: crew of the clan, not settlers, workers, guides, vehicles or horses
  const rider = (u, owner) => u && u.owner === owner && u.type !== 'hero' && !u.dead && !u.downed && !u.jailed && !u.garrison && !u.aboard
    && u.type !== 'settler' && !u.worker && u.type !== 'worker' && !u.guide && !u.captain && !u.civilian && !u.railGang && !u.vehicle && u.type !== 'horse' && !['omnibus', 'rickshaw'].includes(u.type);
  function mountUp(e, c) {
    if (e.place !== 'world') return say(e.owner, 'Horses are for the island');
    const ids = Array.isArray(c.units) && c.units.length ? c.units : Object.values(state.entities).filter(u => u.order?.kind === 'follow' && u.order.target === e.id).map(u => u.id);
    const group = ids.map(id => state.entities[id]).filter(u => rider(u, e.owner) && u.place === 'world' && Math.hypot(u.x - e.x, u.z - e.z) <= (R().groupRange ?? 40));
    // anyone up already: everyone off
    if (group.some(u => u.mounted) || (!group.length && e.ride?.kind === 'horse')) { if (e.ride?.kind === 'horse') dismount(e); for (const u of group) if (u.mounted) dismount(u); return; }
    if (e.aboard) return say(e.owner, 'Step out of the omnibus first (Q)');
    const own = horse => horse.type === 'horse' && horse.horseOwner === e.owner && !horse.dead && !horse.rider && !horse.recall;
    // the hero takes his own mount (as H)
    const mine = mountOf(e.owner);
    if (mine && !mine.rider && !e.mounted) command(e, {});
    const free = Object.values(state.entities).filter(h => own(h) && h.id !== mine?.id && !(h.called && state.entities[h.called]?.type !== 'hero' && h.called !== e.id && group.every(u => u.id !== h.called)))
      .sort((a, b) => (a.stored ? 1e9 : Math.hypot(a.x - e.x, a.z - e.z)) - (b.stored ? 1e9 : Math.hypot(b.x - e.x, b.z - e.z)));
    let short = 0;
    for (const u of group) {
      const horse = free.shift();
      if (!horse) { short++; continue; }
      if (horse.stored || horse.place !== 'world' || Math.hypot(horse.x - u.x, horse.z - u.z) > (R().whistleRange ?? 300)) beside(horse, u);
      if (Math.hypot(horse.x - u.x, horse.z - u.z) <= (R().reach ?? 4)) { mount(u, horse); continue; }
      horse.called = u.id; delete horse.path; delete horse.callBest;
    }
    say(e.owner, short ? `${short} crew have no horse: buy more at a stable` : group.length ? 'Mount up!' : 'Mounting up');
  }
  // select crew (or their group) and right-click one of your horses (Tim 2026-11-07): the nearest of them rides that
  // horse, the others take your other free horses (nearest first); a horse that is not beside its rider comes over
  function crewRide(e, c) {
    const picked = state.entities[c.horse];
    if (!picked || picked.type !== 'horse' || picked.horseOwner !== e.owner || picked.dead) return;
    const group = c.units.map(id => state.entities[id]).filter(u => rider(u, e.owner) && u.place === 'world');
    if (!group.length) return command(e, { horse: c.horse });
    const onIt = group.find(u => u.ride?.horse === picked.id);
    if (onIt) { dismount(onIt); onIt.order = { kind: 'stop' }; onIt.anim = 'idle'; return; }   // right-click the horse one of them rides: that one gets off and waits there (Tim 2026-11-08)
    const want = group.filter(u => !u.mounted).sort((a, b) => Math.hypot(a.x - picked.x, a.z - picked.z) - Math.hypot(b.x - picked.x, b.z - picked.z));
    if (!want.length) return;
    // the boss's own mount carries only him (Tim 2026-11-08): she tosses her head (render: refuseMount)
    if (picked.id === mountOf(e.owner)?.id || state.entities[picked.rider]?.type === 'hero') { state.casts?.push({ kind: 'refuseMount', a: picked.id, x: picked.x, z: picked.z, place: picked.place }); return; }
    if (picked.rider) return say(e.owner, 'Someone already rides her');
    const mine = mountOf(e.owner);
    const free = [picked, ...Object.values(state.entities).filter(h => h.id !== picked.id && h.type === 'horse' && h.horseOwner === e.owner && !h.dead && !h.rider && !h.recall && h.id !== mine?.id && !(h.called && !want.some(u => u.id === h.called)))
      .sort((a, b) => (a.stored ? 1e9 : Math.hypot(a.x - picked.x, a.z - picked.z)) - (b.stored ? 1e9 : Math.hypot(b.x - picked.x, b.z - picked.z)))];
    let short = 0;
    for (const u of want) {
      const horse = free.shift();
      if (!horse) { short++; continue; }
      if (horse.stored || horse.place !== 'world' || Math.hypot(horse.x - u.x, horse.z - u.z) > (R().whistleRange ?? 300)) beside(horse, u);
      if (Math.hypot(horse.x - u.x, horse.z - u.z) <= (R().reach ?? 4)) { mount(u, horse); continue; }
      horse.called = u.id; delete horse.path; delete horse.callBest;
    }
    say(e.owner, short ? `${short} crew have no horse: buy more at a stable` : want.length > 1 ? 'Mount up!' : `${picked.name || 'The horse'} is theirs to ride`);
  }
  // Stay here: she stays where she is; you get off if you ride her, and a call is off
  function stay(e) {
    const horse = mountOf(e.owner);
    if (!horse || horse.stored || horse.place !== 'world') return say(e.owner, 'Your horse is not out on the island');
    if (e.ride?.horse === horse.id) dismount(e);
    delete horse.called; delete horse.path; delete horse.callBest; delete horse.recall; horse.anim = 'idle';
    say(e.owner, `${horse.name || 'Your horse'} stays here`);
  }
  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
    if (c.stay) return stay(e);   // the Mount panel's Stay here (Tim 2026-11-07)
    if (c.whistle) return whistle(e, c.whistle);
    if (c.group) return mountUp(e, c);
    if (c.horse && Array.isArray(c.units) && c.units.length) return crewRide(e, c);
    // right-click one of your horses (Tim 2026-11-06 20:25): that one becomes your mount
    const picked = c.horse && state.entities[c.horse];
    if (picked?.type === 'horse' && picked.horseOwner === e.owner && !picked.dead) {
      if (e.ride?.horse === picked.id) return dismount(e);
      if (e.ride?.kind === 'horse') dismount(e);
      clanOf(e.owner).mount = picked.id;
    } else if (e.ride?.kind === 'horse') return dismount(e);
    if (e.place !== 'world') return say(e.owner, 'Horses are for the island');
    if (e.aboard) return say(e.owner, 'Step out of the omnibus first (Q)');
    const horse = mountOf(e.owner);
    if (!horse) return say(e.owner, 'No horse yet: raise one at a stable in your town');
    // in the stable, or far off (rules.mount.whistleRange, e.g. after a train ride): H works as her whistle and she
    // appears beside you (Tim 2026-11-08)
    if (horse.stored || horse.place !== 'world' || Math.hypot(horse.x - e.x, horse.z - e.z) > (R().whistleRange ?? 300)) return whistle(e, horse.id);
    if (horse.rider) return;
    if (Math.hypot(horse.x - e.x, horse.z - e.z) <= (R().reach ?? 4)) { mount(e, horse); return; }
    horse.called = e.id; delete horse.path;
    say(e.owner, `${horse.name || 'Your horse'} is on her way`);
  }

  // a called horse gallops toward the hero along a path on the island nav grid
  function gallop(horse, hero, dt) {
    const grid = nav(), speed = runOf() * (R().speed ?? 3.5) * dt;
    if (!horse.path?.length || state.tick % 40 === 0) horse.path = grid?.findPath(horse.x, horse.z, hero.x, hero.z) || [[hero.x, hero.z]];
    let left = speed;
    while (left > 0 && horse.path.length) {
      const [tx, tz] = horse.path[0], dx = tx - horse.x, dz = tz - horse.z, d = Math.hypot(dx, dz);
      if (d <= left) { horse.x = tx; horse.z = tz; horse.path.shift(); left -= d; continue; }
      horse.x += dx / d * left; horse.z += dz / d * left; steer(horse, Math.atan2(dx, dz), { turnDegrees: (R().turnDegrees ?? 240) * 2 }, dt); left = 0;
    }
    horse.anim = 'run';
  }

  function tick(dt) {
    for (const b of born?.() || []) {   // finished at a stable: out the door
      const name = b.kind === 'black_beauty' ? 'Black Beauty' : 'Calico';
      const id = spawn('horse', R().models?.[b.kind] || b.kind, b.x, b.z, { horseOwner: b.owner, horseKind: b.kind, name, place: 'world', hp: R().hp ?? 300, maxHp: R().hp ?? 300, holdFire: true, vehicle: true, stable: b.stable });
      const clan = clanOf(b.owner);
      if (clan) whistlesOf(b.owner).some(w => w.horse === id) || whistlesOf(b.owner).push({ horse: id, name, kind: b.kind });
      if (clan && !mountOf(b.owner)) clan.mount = id;
      say(b.owner, `${name} is ready ${b.town === 'capital' ? 'outside the island gate' : 'at the stable'}, her whistle is in your Field supplies${clan?.mount === id ? ' (H to call and ride her)' : ''}`);
    }
    if (state.tick % 20 === 0) for (const clan of Object.values(state.clans || {})) {   // a dead horse takes her whistle with her
      if (!clan.whistles?.length) continue;
      const gone = clan.whistles.filter(w => state.entities[w.horse]?.dead);
      if (!gone.length) continue;
      clan.whistles = clan.whistles.filter(w => !gone.includes(w));
      for (const w of gone) say(clan.id, `${w.name || 'Your horse'} has died`);
    }
    // a rider flag with no horse under it is dropped (Tim 2026-11-10: left over after a train or vehicle ride, it kept
    // the unit from fighting, riding again or showing in its group)
    if (state.tick % 20 === 0) for (const u of Object.values(state.entities)) {
      if (!u.mounted) continue;
      const horse = u.ride?.kind === 'horse' && state.entities[u.ride.horse];
      if (horse && !horse.dead && !horse.stored && horse.rider === u.id) continue;
      delete u.mounted; if (u.ride?.kind === 'horse') delete u.ride;
    }
    for (const horse of Object.values(state.entities)) {
      if (horse.type !== 'horse' || horse.stored) continue;
      const rider = horse.rider && state.entities[horse.rider];
      if (horse.rider && !rider) delete horse.rider;   // her rider is gone (Tim 2026-11-10: she could not be ridden, called or recalled)
      if (horse.recall) continue;                      // on her way to the stable (sim/vehicle_garage.js moves her)
      if (rider) {
        if (rider.ride?.horse !== horse.id) { delete horse.rider; continue; }
        if (rider.place !== 'world' || rider.dead || rider.downed || rider.jailed) { dismount(rider); continue; }
        if (rider.hp < (rider.maxHp || 0) * (R().throwShare ?? 0.33)) { dismount(rider, rider.type === 'hero' ? 'Thrown from the saddle!' : ''); continue; }
        // crew get off to fight: hit, or told to attack (Tim 2026-11-07); the horse waits there
        if (rider.type !== 'hero' && (rider.attackTarget || ['attack', 'attackmove'].includes(rider.order?.kind) || (rider.hitBy && state.tick - rider.hitBy.tick < 10))) { dismount(rider); continue; }
        // really travelling, not nudged by the crowd around her (Tim 2026-11-10: stopped crew horses ran on the spot)
        if (Math.hypot(rider.x - horse.x, rider.z - horse.z) > (R().moveStep ?? 0.12)) horse.wentAt = state.tick;
        const moved = horse.wentAt != null && state.tick - horse.wentAt <= 2;
        Object.assign(horse, { x: rider.x, z: rider.z, dir: rider.dir ?? horse.dir, heading: rider.heading ?? horse.heading, anim: moved ? (rider.type === 'hero' && !rider.gallop ? 'trot' : 'run') : 'idle' });
        delete rider.attackTarget; delete rider.swing;
        continue;
      }
      const caller = horse.called && state.entities[horse.called];
      if (caller) {
        if (caller.place !== 'world' || caller.dead || caller.downed || caller.aboard) { delete horse.called; horse.anim = 'idle'; continue; }
        if (Math.hypot(caller.x - horse.x, caller.z - horse.z) <= (R().reach ?? 4) * 0.6) { delete horse.called; delete horse.path; horse.anim = 'idle'; if (!caller.aboard && !caller.mounted) mount(caller, horse); continue; }
        // stuck: no closer for stuckSeconds, so she turns up beside the caller instead
        const d = Math.hypot(caller.x - horse.x, caller.z - horse.z);
        if (!horse.callBest || d < horse.callBest.d - 2) horse.callBest = { d, tick: state.tick };
        else if (state.tick - horse.callBest.tick > (R().stuckSeconds ?? 5) * 20) { beside(horse, caller); continue; }
        gallop(horse, caller, dt);
      } else if (horse.anim !== 'idle') horse.anim = 'idle';
    }
    // a bot boss rides his horse on the island (every 5 s)
    if (state.tick % 100 === 0) for (const clan of Object.values(state.clans || {})) {
      if (!clan.bot) continue;
      const h = heroOf(clan.id), horse = mountOf(clan.id);
      if (h && horse && h.place === 'world' && !h.ride && !h.aboard && !h.dead && !h.downed && h.hp >= (h.maxHp || 0) * 0.6 && !horse.called && !horse.rider) command(h, {});
    }
  }
  return { command, tick, mountOf, dismount, whistlesOf };
}
