// Horses and the hero's mount (Tim 2026-11-06, plan in project files omnibus_stable/plan.md). Horses come
// from a stable's production bar (sim/frontier/stable.js) and wait there; the clan's mount (clan.mount, the
// first horse raised or the one chosen at the stable) is the one H uses. Island only.
// H ({ id: <hero id>, type: 'mount', horse?: <id> }, right-click a horse of yours sends its id): on the horse -> get off; the horse beside you -> get on; else she is
// called and gallops to you. Riding is rules.mount.speed x the hero's run speed; he cannot fight while
// mounted, and below rules.mount.throwShare of his health he is thrown off. Going through the gate he gets
// off first (the horse waits there). A bot boss mounts his horse on the island by himself.
// createMounts({ state, rules, spawn, nav, born, say }) -> { command, tick, mountOf, dismount }
import { steer } from './vehicle_steer.js';

export function createMounts({ state, rules, spawn, nav, born, say }) {
  const R = () => rules?.mount || {};
  const clanOf = owner => state.clans?.[owner];
  const mountOf = owner => { const id = clanOf(owner)?.mount, h = id && state.entities[id]; return h && h.type === 'horse' && !h.dead ? h : null; };
  const heroOf = owner => Object.values(state.entities).find(e => e.type === 'hero' && e.owner === owner);
  const runOf = () => (R().heroRun ?? 6);

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

  function command(e, c) {
    if (e.type !== 'hero' || e.dead || e.downed || e.jailed) return;
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
      if (clan && !mountOf(b.owner)) clan.mount = id;
      say(b.owner, `${name} is ready at the stable${clan?.mount === id ? ' (H to call and ride her)' : ''}`);
    }
    for (const horse of Object.values(state.entities)) {
      if (horse.type !== 'horse') continue;
      const rider = horse.rider && state.entities[horse.rider];
      if (rider) {
        if (rider.ride?.horse !== horse.id) { delete horse.rider; continue; }
        if (rider.place !== 'world' || rider.dead || rider.downed || rider.jailed) { dismount(rider); continue; }
        if (rider.hp < (rider.maxHp || 0) * (R().throwShare ?? 0.33)) { dismount(rider, 'Thrown from the saddle!'); continue; }
        const moved = Math.hypot(rider.x - horse.x, rider.z - horse.z) > 0.01;
        Object.assign(horse, { x: rider.x, z: rider.z, dir: rider.dir ?? horse.dir, heading: rider.heading ?? horse.heading, anim: moved ? 'run' : 'idle' });
        delete rider.attackTarget; delete rider.swing;
        continue;
      }
      const caller = horse.called && state.entities[horse.called];
      if (caller) {
        if (caller.place !== 'world' || caller.dead) { delete horse.called; horse.anim = 'idle'; continue; }
        if (Math.hypot(caller.x - horse.x, caller.z - horse.z) <= (R().reach ?? 4) * 0.6) { delete horse.called; delete horse.path; horse.anim = 'idle'; if (!caller.aboard) mount(caller, horse); continue; }
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
  return { command, tick, mountOf, dismount };
}
