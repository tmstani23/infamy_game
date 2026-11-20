// Winning and losing a war (frontier plan F6, checkpoint 8a, Tim 2026-11-14). Rules only: no DOM, no randomness.
// Numbers: data.war.channel, data.war.outcomes, data.war.rout.
//
// The channel. When a side's morale is 0 (sim/frontier/war_morale.js: every counted building down, the hall a
// ruin), the other side's HERO can take that hall: he stands within channel.reach of the ruin's edge and channels for
// channel.seconds. Any hit on him (or any loss of health) starts the count again from zero; walking off
// (channel.moveCancel), a new order, going down or leaving the island stops it. Once started, repaired or new
// buildings do not stop it, and workers cannot mend the hall it runs on (structures.js asks channelOn()).
// Both sides hear of it: news { kind: 'hallChannel', war, side, by, clan, outcome, x, z } when it starts,
// 'hallChannelReset' on a hit, 'hallChannelStop' when it breaks off.
//   war.channel = { side: 'town' | 'camp', by: <hero id>, outcome, start, hp, x, z }      (saved with the war)
//   hero.hallChannel = <war id>     (the game holds him still while it is set)
// Commands (players and bots alike):
//   { id: <hero id>, type: 'frontier', action: 'warTake', war, outcome: 'capture' | 'sack' | 'burn' }   the attacker, at the town hall ruin
//   { id: <hero id>, type: 'frontier', action: 'warTakeCamp', war }                                     the defender, at the camp hall ruin
//   { id: <hero id>, type: 'frontier', action: 'warTakeStop', war }
// When the channel completes the war ends (finish()):
//   town taken  -> the outcome is carried out (outcomes.js), result 'captured' | 'sacked' | 'burned'; what is left of the
//                  war chest goes back to the attacker's Clan treasury
//   camp taken  -> result 'campFell'; the war chest goes to the town's coffers; the attacker's hero and crew inside the
//                  war circle fall back to their nearest own town, on foot (sim/island_respawn.js fallBack)
// Then every war troop of both sides routs (rout.seconds: they run from the town and fade, then leave the map), the
// camp is gone with the war record, and the town's cooldown starts (war.end).
// createWarEnd({ state, data, war, world, morale }) -> { command, tick, check, view, channelOn, finish, attach, setOutcomes }
import { cellToWorld } from './town_grid.js';
import { creditRyo } from '../treasury.js';
import { storageCap } from './storage.js';
import { addCampStock } from './camp_stock.js';

export function createWarEnd({ state, data, war, world, morale, garrison = null }) {
  const W = () => data.war || {};
  const CH = () => ({ seconds: 60, reach: 8, moveCancel: 1.5, ...W().channel });
  const ROUT = () => ({ seconds: 6, run: 70, ...W().rout });
  let runtime = null, outcomes = null, hooks = {};
  const f = () => state.frontier;
  const town = id => f()?.settlements?.[id] || null;
  const say = (clan, text) => { const c = state.clans?.[clan]; if (c) c.notice = { tick: state.tick ?? 0, text }; };
  const news = n => (state.news ||= []).push(n);
  const need = () => Math.max(1, Math.round(CH().seconds * 20));

  // where a side's hall stands (or lies in ruins): its centre and its size r
  function hallPoint(w, side) {
    if (side === 'camp') { const b = (w.camp?.buildings || []).find(x => x.type === 'camp_hall'), r = W().buildings?.camp_hall?.radius ?? 12; return b ? { x: b.x, z: b.z, r } : w.camp ? { x: w.camp.x, z: w.camp.z, r } : null; }
    const s = town(w.town); if (!s) return null;
    const b = (s.buildings || []).find(x => x.type === 'town_hall');
    if (!b || !s.grid) return { x: s.x, z: s.z, r: 8 };
    const pts = (b.cells?.length ? b.cells : [b.cell]).map(i => cellToWorld(s, i));
    return { x: pts.reduce((n, p) => n + p[0], 0) / pts.length, z: pts.reduce((n, p) => n + p[1], 0) / pts.length, r: Math.sqrt(pts.length) * (s.grid.cell || 11) / 2 };
  }
  // is he close enough to that hall to take it (channel.reach from its edge)
  const atHall = (hero, w, side) => { const p = hallPoint(w, side); return !!p && Math.hypot(hero.x - p.x, hero.z - p.z) <= p.r + CH().reach; };
  const townsOf = clan => Object.values(f()?.settlements || {}).filter(s => s.owner === clan && !s.capital);
  // which outcomes the attacker may pick, each { id, ok, why }
  function outcomeList(w) {
    // Z2 (Tim 2026-11-19): every town can be captured or burned. The rule of 2026-11-09 (a clan's last town can only be
    // sacked) went with the big picture plan: a clan lives on in its home and founds again (rival_campaign.js).
    return ['capture', 'sack', 'burn'].map(id => ({ id, ok: true, why: '' }));
  }
  // may this hero start taking that side's hall now: { ok, reason }
  function check(hero, w, side, outcome = null) {
    if (!w || w.state !== 'active' || !war.byId(w.id)) return { ok: false, reason: 'No such war' };
    if (hero?.type !== 'hero') return { ok: false, reason: 'Only your hero can take a hall' };
    if ((side === 'town' ? w.attacker : w.defender) !== hero.owner) return { ok: false, reason: side === 'town' ? 'Only the attacker takes the town hall' : 'Only the defender takes the camp hall' };
    if (hero.dead || hero.downed || hero.aboard || hero.place !== 'world') return { ok: false, reason: 'Your hero cannot do that now' };
    if (w.terms) return { ok: false, reason: 'A ceasefire is on: terms are on the table' };   // 8c
    if (w.channel?.side === side) return { ok: false, reason: 'Already taking the hall' };
    if (!morale.ready(w.id, side)) {
      const up = morale.view(w.id)?.[side]?.up || [];
      return { ok: false, reason: up.length ? `Still standing: ${up.map(x => `${String(x.type).replace(/_/g, ' ')}${x.n > 1 ? ` ${x.n}` : ''}`).join(', ')}` : 'Destroy the hall first' };
    }
    if (!atHall(hero, w, side)) return { ok: false, reason: 'Walk up to the ruined hall' };
    if (side === 'town') {
      const o = outcomeList(w).find(x => x.id === outcome);
      if (!o) return { ok: false, reason: 'Pick capture, sack or burn' };
      if (!o.ok) return { ok: false, reason: o.why };
    }
    return { ok: true, reason: '' };
  }
  function start(hero, w, side, outcome) {
    const r = check(hero, w, side, outcome); if (!r.ok) return r;
    w.channel = { side, by: hero.id, outcome: side === 'town' ? outcome : null, start: state.tick ?? 0, hp: hero.hp, x: hero.x, z: hero.z };
    hero.hallChannel = w.id;
    delete hero.order; delete hero.attackTarget; delete hero.swing; delete hero.execute; delete hero.lootTarget;
    const p = hallPoint(w, side);
    news({ kind: 'hallChannel', war: w.id, side, by: hero.id, clan: hero.owner, outcome: w.channel.outcome, x: p.x, z: p.z, town: w.town });
    return { ok: true, reason: '' };
  }
  function stop(w, why = '') {
    const ch = w.channel; if (!ch) return;
    const u = state.entities?.[ch.by]; if (u?.hallChannel === w.id) delete u.hallChannel;
    delete w.channel;
    news({ kind: 'hallChannelStop', war: w.id, side: ch.side, by: ch.by, clan: u?.owner ?? null, why });
  }

  // F6 rules 2026-11-10: a winner gets back at most the unused part of the timber and stone he brought, into his
  // nearest own town to the camp (the camp stays sealed: what it gathered beyond that is lost). -> { town, timber, stone }
  function materialsBack(w) {
    const k = w.camp, out = { town: null, timber: 0, stone: 0 };
    if (!k?.stock || !k.brought) return out;
    let best = null, bd = Infinity;
    for (const t of Object.values(state.frontier?.settlements || {})) {
      if (t.owner !== w.attacker || t.capital || !Number.isFinite(t.x)) continue;
      const d = Math.hypot(t.x - (k.x ?? w.x), t.z - (k.z ?? w.z)); if (d < bd) { bd = d; best = t; }
    }
    if (!best) return out;
    out.town = best.id;
    for (const r of ['timber', 'stone']) {
      const n = Math.floor(Math.max(0, Math.min(k.stock[r] || 0, k.brought[r] || 0)));
      if (n > 0) { world.change(best.id, r, n, 'war camp returned'); out[r] = n; addCampStock(k, r, -n); }
    }
    return out;
  }

  // ---- the end of a war ---------------------------------------------------------------------------------------
  // every war troop of the war (or only one clan's) routs: away from the town, fading, then gone
  function rout(w, clan = null) {
    const s = town(w.town), R = ROUT(), cx = s?.x ?? w.x, cz = s?.z ?? w.z, until = (state.tick ?? 0) + Math.round(R.seconds * 20);
    for (const e of Object.values(state.entities || {})) {
      if (e.warTroop !== w.id || e.dead || e.rout || (clan != null && e.owner !== clan && e.horseOwner !== clan)) continue;
      const d = Math.hypot(e.x - cx, e.z - cz) || 1, tx = e.x + (e.x - cx) / d * R.run, tz = e.z + (e.z - cz) / d * R.run;
      e.rout = { start: state.tick ?? 0, until, x: tx, z: tz };
      e.order = { kind: 'move', x: tx, z: tz };
      if (e.garrison?.zone) garrison?.breakOutKey?.(e.garrison.key);   // troops holding a house come out
      delete e.attackTarget; delete e.swing; delete e.garrison; delete e.holdHouse;
    }
  }
  // result: 'captured' | 'sacked' | 'burned' | 'campFell' | 'attackerSurrendered' (8c: as a fallen camp) |
  // 'ransomed' (8c: terms accepted, the town is kept) | anything else (called off): the chest goes home
  // opts.days: the town's cooldown in game days when it is not the usual war.cooldownDays
  function finish(w, result, by = null, opts = {}) {
    if (!war.byId(w.id)) return false;
    const s = town(w.town), chest = Math.floor(w.camp?.chest || 0), attacker = state.clans?.[w.attacker];
    if (w.channel) { const u = state.entities?.[w.channel.by]; if (u?.hallChannel === w.id) delete u.hallChannel; delete w.channel; }
    let note = null;
    war.settleDefense?.(w);   // 8b-2: the defender's chest back to the town coffers first, so an outcome takes it with the town
    const sendHome = o => (hooks.sendHome || runtime?.warSendHome)?.(w, o) || null;
    if (result === 'campFell' || result === 'attackerSurrendered') {
      if (chest > 0 && s) world.change(s.id, 'ryo', chest, 'war spoils');
      w.spoils = chest;
      // 8e-6 (2026-11-16): the camp's timber and stone go to the town too, up to its storage room (the rest is lost)
      if (s && w.camp?.stock) for (const r of ['timber', 'stone']) {
        const n = Math.floor(Math.min(w.camp.stock[r] || 0, Math.max(0, storageCap(s, data, r) - (s.stock?.[r] || 0))));
        if (n > 0) { world.change(s.id, r, n, 'war spoils'); (w.spoilsStock ||= {})[r] = n; }
      }
      w.sentHome = sendHome(result === 'campFell' ? undefined : { why: 'surrender' });
    } else {
      if (['captured', 'sacked', 'burned'].includes(result)) note = outcomes?.[result]?.(w, by) || null;
      if (chest > 0 && attacker) creditRyo(state, attacker, chest, 'war chest returned');
      w.returned = chest;
      if (['captured', 'sacked', 'burned'].includes(result) || (result === 'ransomed' && w.terms?.by === 'defender')) w.materialsBack = materialsBack(w);
      if (result === 'ransomed') w.sentHome = sendHome({ why: 'ransomed' });   // 8c: the attacker's hero and crew go home, the town is kept
    }
    if (w.camp) w.camp.chest = 0;
    const cx = s?.x ?? w.x, cz = s?.z ?? w.z;
    rout(w);   // every war troop of both sides
    news({ kind: 'warEnded', war: w.id, town: w.town, townName: s?.name || note?.townName || '', result, attacker: w.attacker, defender: w.defender, by, x: cx, z: cz, ...(note || {}), chest, ...(w.spoilsStock ? { stock: w.spoilsStock } : {}),
      ...(w.terms ? { surrender: w.terms.by, ...(w.ransom ? { ransom: w.ransom.amount } : {}) } : {}) });
    war.end(w.id, result, opts.days ?? null);
    return true;
  }

  function tick() {
    const now = state.tick ?? 0;
    for (const w of war.active()) {
      const ch = w.channel; if (!ch) continue;
      const u = state.entities?.[ch.by];
      if (!u || u.dead || u.downed || u.aboard || u.place !== 'world') { stop(w, 'down'); continue; }
      if (Math.hypot(u.x - ch.x, u.z - ch.z) > CH().moveCancel || u.order) { stop(w, 'moved'); continue; }
      delete u.attackTarget; delete u.swing;
      if (u.hp < ch.hp - 1e-6 || (u.hitAt ?? -1) > ch.start) {
        ch.start = now; news({ kind: 'hallChannelReset', war: w.id, side: ch.side, by: ch.by, clan: u.owner });
      }
      ch.hp = u.hp;
      if (now - ch.start >= need()) finish(w, ch.side === 'camp' ? 'campFell' : ({ capture: 'captured', sack: 'sacked', burn: 'burned' })[ch.outcome] || 'sacked', u.owner);
    }
    // a hero whose war is gone is free again; routed troops leave the map when their time is up
    if (now % 5 === 0) for (const e of Object.values(state.entities || {})) {
      if (e.hallChannel && !war.byId(e.hallChannel)?.channel) delete e.hallChannel;
      if (e.rout && now >= e.rout.until && runtime?.remove) runtime.remove(e.id);
    }
  }
  // for the screen: the running channel of a war, or null
  function view(warId) {
    const w = war.byId(warId), ch = w?.channel; if (!ch) return null;
    const done = (state.tick ?? 0) - ch.start, n = need();
    return { side: ch.side, by: ch.by, clan: state.entities?.[ch.by]?.owner ?? null, outcome: ch.outcome, frac: Math.min(1, done / n), seconds: Math.max(0, Math.ceil((n - done) / 20)) };
  }
  const channelOn = (warId, side) => war.byId(warId)?.channel?.side === side;

  function command(e, c) {
    if (!['warTake', 'warTakeCamp', 'warTakeStop'].includes(c.action)) return false;
    const w = war.byId(c.war);
    let r;
    if (c.action === 'warTakeStop') { if (w?.channel?.by === e.id) { stop(w, 'stopped'); r = { ok: true, reason: '' }; } else r = { ok: false, reason: 'Not taking a hall' }; }
    else r = start(e, w, c.action === 'warTake' ? 'town' : 'camp', c.outcome);
    if (!r.ok) say(e.owner, r.reason);
    const fr = f(); fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    (fr.receipts ||= []).push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok: r.ok, reason: r.reason });
    return true;
  }
  return { command, tick, check, view, channelOn, finish, rout, stopChannel: stop, hallPoint, atHall, outcomeList, rules: () => ({ channel: CH(), rout: ROUT(), sackShare: W().outcomes?.sackShare ?? 0.5 }), attach: s => { runtime = s; }, setOutcomes: o => { outcomes = o; }, setHooks: h => { hooks = { ...hooks, ...h }; } };
}
