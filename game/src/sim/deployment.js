import { createSectors } from './sectors.js';
import { createNav } from './nav.js';
import { isRallyParticipant } from './deployment_rally.js';
import { deploymentFeedback } from './deployment_feedback.js';

export const storedDeployment = e => e.deployment ? {
  savedGroup: e.deployment.transfer?.to || (e.deployment.group === 'home' ? e.deployment.savedGroup : null) || e.deployment.group,
  keepAtHQ: !!e.deployment.keepAtHQ, everAssigned: !!e.deployment.everAssigned,
  ...(e.deployment.diversionReadyAt ? { diversionReadyAt: e.deployment.diversionReadyAt } : {}),
} : undefined;
export const restoredDeployment = record => record.deployment ? {
  group: 'home', savedGroup: record.deployment.savedGroup, keepAtHQ: !!record.deployment.keepAtHQ, everAssigned: !!record.deployment.everAssigned,
  ...(record.deployment.diversionReadyAt ? { diversionReadyAt: record.deployment.diversionReadyAt } : {}),
} : undefined;

// Authoritative membership and physical transfers. Match setup enables local
// movement limits; isolated sim fixtures can still exercise the older rules.
export function createDeployment({ state, district, nav, navOf = () => nav, doors = [], moveTo,
  clearCombat = () => {}, entryAllowed = () => true, inCombat = () => false }) {
  const geometry = createSectors(district, nav);
  state.deployment ||= { version: 1, restrictionsEnabled: false, heroLimit: 6, sectorLimit: 3,
    sectors: geometry.sectors, village: geometry.village, clans: {} };
  const D = state.deployment, sectorIds = D.sectors.map(s => s.id);
  const localNavs = new Map();
  const crew = e => !!e && !!state.clans?.[e.owner] && e.type !== 'hero' && e.type !== 'civilian'
    && !e.guard && !e.cop && !e.wild;
  const active = e => crew(e) && !e.dead && !e.jailed;
  const validGroup = id => id === 'home' || id === 'hero' || sectorIds.includes(id);
  function addClan(clan) {
    if (!clan || D.clans[clan.id]) return;
    D.clans[clan.id] = { reserveTarget: 2, sectors: Object.fromEntries(D.sectors.map(s => [s.id, {
      task: clan.kind === 'ninja' ? 'watch' : 'patrol', desired: D.sectorLimit, objective: { ...s.anchor }, fallback: { ...s.anchor },
    }])) };
  }
  const members = (clan, group = null) => Object.values(state.entities)
    .filter(e => active(e) && e.owner === clan && (group === null || e.deployment?.group === group));
  function onSpawn(e) {
    if (!crew(e)) return;
    addClan(state.clans[e.owner]);
    if (!validGroup(e.deployment?.group)) {
      const leader = state.entities[e.order?.target];
      const followsHero = e.order?.kind === 'follow' && leader?.type === 'hero' && leader.owner === e.owner;
      const group = followsHero && counts(e.owner).hero < D.heroLimit ? 'hero' : 'home';
      e.deployment = { group, keepAtHQ: false, ...(group === 'hero' ? { everAssigned: true } : {}) };
    } else e.deployment.keepAtHQ ??= false;
  }
  function sync() {
    for (const clan of Object.values(state.clans || {})) {
      addClan(clan);
      if (clan.kind !== 'ninja') for (const sector of Object.values(D.clans[clan.id].sectors)) if (sector.task === 'hold') sector.task = 'patrol';
      if(clan.kind==='ninja')for(const sector of Object.values(D.clans[clan.id].sectors))if(sector.task==='extraction'){sector.task='watch';delete sector.operation;}
    }
    for (const e of Object.values(state.entities)) if (crew(e) && !e.deployment) onSpawn(e);
    for (const e of Object.values(state.entities)) if (e.deployment?.transfer && (!active(e) || e.downed)) {
      e.deployment.savedGroup = e.deployment.transfer.to;
      e.deployment.group = 'home'; delete e.deployment.transfer;
    }
    if (D.restrictionsEnabled && state.tick % 20 === 0) automaticDispatch();
  }
  function counts(clan, excluding = []) {
    const excluded = new Set(excluding), result = Object.fromEntries(['hero', 'home', ...sectorIds].map(id => [id, 0]));
    for (const e of members(clan)) if (!excluded.has(e.id)) {
      const group = e.deployment?.transfer?.to || e.deployment?.group;
      if (validGroup(group)) result[group]++;
    }
    return result;
  }
  const full = n => n.hero >= D.heroLimit && sectorIds.every(id => n[id] >= D.sectorLimit);
  function canAssign(clan, ids, to) {
    if (!state.clans?.[clan] || !validGroup(to) || !Array.isArray(ids) || !ids.length)
      return { ok: false, why: 'Choose crew and a valid destination' };
    const unique = [...new Set(ids)], selected = unique.map(id => state.entities[id]);
    if (selected.some(e => !active(e) || e.owner !== clan || e.downed)) return { ok: false, why: 'Only available hired crew can transfer' };
    if (selected.every(e => !e.deployment?.transfer && e.deployment?.group === to)) return { ok: true, why: '' };
    const n = counts(clan, unique);
    n[to] += unique.length;
    if (to === 'hero' && n.hero > D.heroLimit) return { ok: false, why: 'Hero group holds six crew outside Rally' };
    if (sectorIds.includes(to) && n[to] > D.sectorLimit && !full(n))
      return { ok: false, why: 'Overflow requires six hero crew and three in every town sector' };
    return { ok: true, why: '' };
  }
  function nextAutomaticSector(clan) {
    const n = counts(clan), goal = id => D.clans[clan].sectors[id].desired ?? D.sectorLimit;
    const sorted = sectorIds.filter(id => goal(id) > 0).sort((a, b) => n[a] - n[b] || sectorIds.indexOf(a) - sectorIds.indexOf(b));
    const vacancy = sorted.find(id => n[id] < Math.min(goal(id), D.sectorLimit));
    if (vacancy) return vacancy;
    if (!full(n)) return null;
    return sorted.find(id => n[id] < goal(id)) || sorted.find(id => goal(id) >= D.sectorLimit) || null;
  }
  function sectorAt(x, z, place = 'street') {
    if (place !== 'street') {
      const b = Object.values(state.businesses).find(b => b.room === place);
      return b?.ring ? geometry.at(...b.ring) : null;
    }
    return geometry.at(x, z);
  }
  const home = clan => Object.values(state.businesses).find(b => b.hideout === clan && b.owner === clan);
  const hero = clan => Object.values(state.entities).find(e => e.owner === clan && e.type === 'hero');
  const say = (clan, text) => { if (state.clans[clan]) state.clans[clan].notice = { tick: state.tick, text }; };
  function canOccupy(e, x, z, place = e.place) {
    if (!D.restrictionsEnabled || !crew(e) || e.deployment?.transfer || e.deployment?.group === 'hero' || isRallyParticipant(state, e)) return true;
    const group = e.deployment?.group;
    if (group === 'home') {
      const h = home(e.owner), p = h?.ring || hero(e.owner)?.home;
      return !!p && (place === h?.room || (place === 'street' && Math.hypot(x - p[0], z - p[1]) <= 12));
    }
    return sectorAt(x, z, place) === group;
  }
  const canActAt = (e, x, z, place = e.place) => !e.deployment?.transfer && canOccupy(e, x, z, place);
  function navFor(e) {
    if (!D.restrictionsEnabled || !crew(e) || e.deployment?.transfer || e.deployment?.group === 'hero' || isRallyParticipant(state, e) || e.place !== 'street') return null;
    const group = e.deployment.group, key = group === 'home' ? `home:${e.owner}` : group;
    if (!localNavs.has(key)) {
      const { bounds, cell, w, cells } = geometry.cellGrid(), label = sectorIds.indexOf(group);
      localNavs.set(key, createNav([], bounds, { cell, pad: 0, allowed: (x, z) => {
        if (group === 'home') return nav.free(x, z) && canOccupy(e, x, z, 'street');
        const k = Math.floor((z - bounds.minZ) / cell) * w + Math.floor((x - bounds.minX) / cell);
        return cells[k] === label;
      } }));
    }
    return localNavs.get(key);
  }
  function allowsOrder(e, c, leader, door) {
    if (!D.restrictionsEnabled) return true;
    let ok = !e.deployment?.transfer;
    if (ok && c.kind === 'follow') ok = e.deployment.group === 'hero' || isRallyParticipant(state, e);
    else if (ok && c.kind === 'attack') {
      const t = state.entities[c.target]; ok = !!t && canActAt(e, t.x, t.z, t.place);
    } else if (ok && c.kind === 'enter') ok = !!door && canActAt(e, door.to.x, door.to.z, door.place);
    else if (ok && c.kind === 'heal') {
      const b = Object.values(state.businesses).find(b => b.kind === 'clinic');
      ok = !!b?.ring && canActAt(e, ...b.ring, 'street');
    } else if (ok && ['move', 'station', 'attackmove'].includes(c.kind)) ok = canActAt(e, c.x, c.z, c.place || leader.place);
    if (!ok) say(e.owner, e.deployment?.transfer ? 'Crew are transferring; use Deployment to reroute them'
      : 'Use Deployment to transfer crew outside their assignment or into the hero group');
    return ok;
  }
  function destination(e, to) {
    let point, place = 'street';
    if (to === 'hero') {
      const h = hero(e.owner);
      if (!h || h.dead || h.downed || h.jailed) return null;
      point = [h.x, h.z]; place = h.place;
    } else if (to === 'home') {
      const h = home(e.owner), d = doors.find(d => d.to && !d.ninja && d.place === h?.room);
      if (!d) return null;
      point = [d.to.x, d.to.z]; place = d.place;
    } else {
      const p = D.clans[e.owner]?.sectors[to]?.objective;
      if (!p) return null;
      point = [p.x, p.z];
    }
    const angle = (Number(e.id) || 0) * 2.4, offset = to === 'hero' ? 0 : .65;
    const grid = place === 'street' && sectorIds.includes(to)
      ? navFor({ ...e, place, deployment: { group: to } }) || nav : navOf(place);
    const p = grid?.nearestFree(point[0] + Math.cos(angle) * offset, point[1] + Math.sin(angle) * offset);
    return p ? { x: p[0], z: p[1], place, reach: to === 'hero' ? 1.8 : .6 } : null;
  }
  const entrance = place => doors.find(d => d.to && !d.ninja && d.place === place);
  function exit(place) {
    const d = entrance(place);
    return d && doors.find(out => out.to && !out.ninja && out.place === 'street' && out.to.x === d.x && out.to.z === d.z);
  }
  function route(e, target, validate = false) {
    if (!target) return null;
    const legs = [], p = { x: e.x, z: e.z, place: e.place };
    if (p.place !== target.place && p.place !== 'street') {
      const d = exit(p.place); if (!d) return null;
      legs.push({ x: d.x, z: d.z, place: p.place, door: d, reach: 1.1 });
      Object.assign(p, d.to, { place: 'street' });
    }
    if (p.place !== target.place) {
      const d = entrance(target.place);
      if (!d || !entryAllowed(e, target.place)) return null;
      legs.push({ x: d.x, z: d.z, place: 'street', door: d, reach: 1.1 });
      Object.assign(p, d.to, { place: target.place });
    }
    legs.push(target);
    if (validate) {
      let from = { x: e.x, z: e.z, place: e.place };
      for (const leg of legs) {
        if (Math.hypot(from.x - leg.x, from.z - leg.z) > leg.reach) {
          const path = navOf(from.place)?.findPath(from.x, from.z, leg.x, leg.z), end = path?.at(-1);
          if (!end || Math.hypot(end[0] - leg.x, end[1] - leg.z) > leg.reach) return null;
        }
        from = leg.door ? { ...leg.door.to, place: leg.door.place } : leg;
      }
    }
    return legs;
  }
  function canTransfer(heroId, ids, to) {
    const h = state.entities[heroId];
    if (!h || h.type !== 'hero') return { ok: false, why: 'Only your hero can authorize a transfer' };
    const capacity = canAssign(h.owner, ids, to);
    if (!capacity.ok) return capacity;
    const wait = Math.max(0, 6 - (state.tick - Math.max(h.hitAt ?? -Infinity, h.foughtAt ?? -Infinity)) / 20);
    if (wait > 0) return { ok: false, why: `Hero in combat: transfers available in ${Math.ceil(wait)} s` };
    if (to === 'hero' && (h.dead || h.downed || h.jailed)) return { ok: false, why: 'Hero unavailable: choose HQ or a sector' };
    return { ok: true, why: '' };
  }
  const quiet = e => state.tick - Math.max(e.hitAt ?? -Infinity, e.foughtAt ?? -Infinity) >= 120;
  function idle(e) {
    const o = e.order;
    return !e.swing && !e.execute && !e.lootEscort && !e.attackTarget && !inCombat(e)
      && (!o || o.kind === 'stop' || (o.kind === 'move' && o.arrived) || (o.kind === 'station' && o.garrison));
  }
  const healthy = e => Number.isFinite(e.maxHp) && e.hp >= e.maxHp;
  const ready = e => active(e) && !e.downed && healthy(e) && quiet(e) && idle(e);
  function startTransfer(e, to, target, automatic = false) {
    clearCombat(e);
    delete e.holdFire; delete e.smokePassive;
    if (e.distracted?.source) { delete e.distracted; e.diversionImmuneUntil = state.tick + 200; }
    delete e.diversionReturn; delete e.dancingUntil;
    if (!automatic) {
      const r = D.clans[e.owner]?.rally;
      if (r?.active) r.participants = r.participants.filter(p => p.id !== e.id);
    }
    delete e.deployment.automatic;
    if (!automatic) e.deployment.everAssigned = true;
    e.deployment.transfer = { from: e.deployment.group, to, startedAt: state.tick, target, status: 'moving', progressAt: state.tick, x: e.x, z: e.z, ...(automatic ? { automatic: true } : {}) };
    e.order = { kind: 'stop' };
  }
  function automaticDispatch() {
    for (const clan of Object.values(state.clans || {})) {
      const h = hero(clan.id);
      if (!h) continue;
      const reserves = members(clan.id, 'home').filter(e => !e.deployment.transfer && !e.downed && !isRallyParticipant(state, e));
      for (const e of reserves) delete e.deployment.automatic;
      const heroUp = !h.dead && !h.downed && !h.jailed;
      // Revived and respawned crew go back to the group they came from; new crew fill the
      // hero group up to six first (Tim 2026-10-27). Neither waits for the hero's combat.
      const sent = new Set(), waiting = new Set();
      for (const e of reserves) {
        if (!quiet(e) || !idle(e) || e.deployment.keepAtHQ) continue;
        const saved = e.deployment.savedGroup;
        let to = saved && saved !== 'home' && validGroup(saved) ? saved : null;
        if (to && (!canAssign(clan.id, [e.id], to).ok || (to === 'hero' && !heroUp))) {
          if (to !== 'hero' || heroUp) { delete e.deployment.savedGroup; to = null; }
          else {
            waiting.add(e.id);
            e.deployment.automatic = { to, status: 'queued', why: 'Hero unavailable; waiting to return to hero group' };
            continue;
          }
        }
        if (!to && !e.deployment.everAssigned && heroUp && healthy(e) && canAssign(clan.id, [e.id], 'hero').ok) to = 'hero';
        if (!to) continue;
        const target = destination(e, to);
        if (!route(e, target, true)) { waiting.add(e.id); e.deployment.automatic = { to, status: 'blocked', why: 'Automatic transfer blocked; retrying' }; continue; }
        delete e.deployment.savedGroup;
        startTransfer(e, to, target, true); sent.add(e.id);
      }
      const available = reserves.filter(e => !sent.has(e.id) && !waiting.has(e.id) && ready(e));
      // Pinned ready crew count toward the requested ready reserve; choose the
      // retained crew first so reservations cannot oversubscribe a sector.
      const retained = new Set(available.filter(e => e.deployment.keepAtHQ).map(e => e.id));
      for (const e of available) {
        if (retained.size >= D.clans[clan.id].reserveTarget) break;
        retained.add(e.id);
      }
      for (const e of reserves) {
        if (sent.has(e.id) || !quiet(e) || !idle(e)) continue;
        let to;
        if (!waiting.has(e.id) && ready(e) && !retained.has(e.id)) to = nextAutomaticSector(clan.id);
        // Recruits and returnees held for recovery/reserve physically travel
        // home first; raising the target never recalls assigned field crew.
        if (!to && e.place !== home(clan.id)?.room) to = 'home';
        if (!to) continue;
        const allowed = canTransfer(h.id, [e.id], to);
        if (!allowed.ok) {
          e.deployment.automatic = { to, status: 'queued', why: allowed.why };
          continue;
        }
        const target = destination(e, to);
        if (!route(e, target, true)) {
          e.deployment.automatic = { to, status: 'blocked', why: 'Automatic transfer blocked; retrying' };
          continue;
        }
        startTransfer(e, to, target, true);
      }
    }
  }
  function reserveStatus(e) {
    const d = e.deployment;
    if (d?.transfer || d?.group !== 'home' || e.downed) return '';
    if (d.automatic) return d.automatic.why;
    if (!healthy(e)) return 'Recovering · waits for full health';
    if (!quiet(e) || !idle(e)) return 'Busy · automatic deployment waits';
    if (d.keepAtHQ) return 'Ready · pinned at HQ';
    return 'Ready · retained for HQ target or sector capacity';
  }
  function command(h, c) {
    if (h.type !== 'hero' || !D.clans[h.owner]) return;
    const result = (ok, text) => deploymentFeedback(state, h, c, ok, text);
    const ids = Array.isArray(c.units) ? [...new Set(c.units)] : [];
    if (c.action === 'staffing') {
      const sector = D.clans[h.owner].sectors[c.sector];
      if (!sector || !Number.isSafeInteger(c.value) || c.value < 0) return result(false, 'Choose a valid sector staffing goal');
      sector.desired = c.value;
      result(true, `Staffing goal: ${c.value}. Crew deploy from eligible HQ reserves; field crew are not recalled.`);
      return;
    }
    if (c.action === 'reserveTarget') {
      if (!Number.isSafeInteger(c.value) || c.value < 0) return result(false, 'Choose a valid HQ reserve target');
      D.clans[h.owner].reserveTarget = c.value;
      result(true, `Keep at HQ: ${c.value} ready crew. Assigned crew will not be recalled.`);
      return;
    }
    if (c.action === 'keepAtHQ') {
      if (typeof c.value !== 'boolean' || !ids.length || ids.some(id => !active(state.entities[id]) || state.entities[id].owner !== h.owner)) return result(false, 'Select your own available crew');
      for (const id of ids) state.entities[id].deployment.keepAtHQ = c.value;
      result(true, c.value ? 'Keep at HQ active; field crew must be transferred home manually' : 'HQ pin removed; ready surplus can automatically deploy');
      return;
    }
    if (c.action !== 'transfer') return;
    const allowed = canTransfer(h.id, ids, c.to);
    if (!allowed.ok) { result(false, allowed.why); return; }
    const prepared = ids.map(id => {
      const e = state.entities[id], target = destination(e, c.to);
      return { e, target, path: route(e, target, true) };
    });
    if (prepared.some(p => !p.path)) { result(false, 'Transfer blocked: no reachable route to that destination'); return; }
    for (const { e, target } of prepared) startTransfer(e, c.to, target);
    result(true, `TRANSFER STARTED — ${ids.length} crew travelling to ${c.to === 'hero' ? 'hero group' : c.to === 'home' ? 'HQ reserves' : D.sectors.find(s => s.id === c.to).name}`);
  }
  function travelStep(e, unit) {
    const t = e.deployment?.transfer;
    if (!t) return false;
    clearCombat(e, false);
    if (t.status === 'blocked' && state.tick < t.retryAt) { e.anim = 'idle'; return true; }
    const target = t.to === 'hero' || !t.target ? destination(e, t.to) : t.target;
    const path = route(e, target, t.status === 'blocked');
    const blocked = () => { t.status = 'blocked'; t.retryAt = state.tick + 20; clearCombat(e); e.anim = 'idle'; };
    if (!path) { blocked(); return true; }
    t.status = 'moving'; t.target = target;
    const leg = path[0];
    if (Math.hypot(leg.x - e.x, leg.z - e.z) <= leg.reach) {
      if (leg.door) {
        if (leg.door.place !== 'street' && !entryAllowed(e, leg.door.place)) { blocked(); return true; }
        Object.assign(e, leg.door.to, { place: leg.door.place, anim: 'idle' });
        clearCombat(e); t.progressAt = state.tick; t.x = e.x; t.z = e.z;
      } else {
        e.deployment.group = t.to; e.deployment.arrivedAt = state.tick;
        if (t.to !== 'home') e.deployment.everAssigned = true;
        delete e.deployment.transfer;
        delete e.deployment.duty;
        clearCombat(e);
        e.order = { kind: 'move', x: e.x, z: e.z, arrived: true }; e.anim = 'idle';
      }
      return true;
    }
    if (!moveTo(e, unit, leg.x, leg.z, false)) { blocked(); return true; }
    if (Math.hypot(e.x - t.x, e.z - t.z) > .03) { t.x = e.x; t.z = e.z; t.progressAt = state.tick; }
    if (state.tick - t.progressAt > 60) blocked();
    return true;
  }
  function localTravel(e, unit, target) {
    if (!canOccupy(e, target.x, target.z, target.place)) return 'blocked';
    const legs = route(e, { ...target, reach: .8 });
    if (!legs) return 'blocked';
    const leg = legs[0];
    if (Math.hypot(e.x - leg.x, e.z - leg.z) <= leg.reach) {
      if (!leg.door) return 'arrived';
      if (!canOccupy(e, leg.door.to.x, leg.door.to.z, leg.door.place) || (leg.door.place !== 'street' && !entryAllowed(e, leg.door.place))) return 'blocked';
      Object.assign(e, leg.door.to, { place: leg.door.place, anim: 'idle' }); clearCombat(e); return 'moving';
    }
    return moveTo(e, unit, leg.x, leg.z, !!target.walk) ? 'moving' : 'blocked';
  }
  function returnAfterRally(e, to) {
    if (!active(e) || e.downed || e.deployment.transfer || to === 'hero') return;
    const target = destination(e, to);
    startTransfer(e, to, target, true);
    e.deployment.transfer.returning = true;
    if (!target || !route(e, target, true)) Object.assign(e.deployment.transfer, { status: 'blocked', retryAt: state.tick + 20 });
  }
  sync();
  return { addClan, onSpawn, sync, members, counts, canAssign, nextAutomaticSector, sectorAt,
    overflowAvailable: clan => full(counts(clan)), cellGrid: geometry.cellGrid, canOccupy, canActAt, navFor, allowsOrder,
    canTransfer, command, travelStep, localTravel, returnAfterRally, reserveStatus, enable: () => { D.restrictionsEnabled = true; } };
}
