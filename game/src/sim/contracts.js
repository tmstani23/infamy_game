// Shinobi contracts (ninja build phase 5, Tim 2026-10-20): the village shrine's board posts
// perDawn jobs every dawn, from the town and from the clans. A Shinobi clan takes one at a time
// (Space at the shrine); it runs until the next dawn. Done: ryo + Renown; failed: nothing. The
// clan it is aimed at gets a warning when it is taken.
//   scout   stand inside a named rival business, hidden, for seconds
//   mark    at night plant a mark on its back-room spot (plantSeconds standing there), then keep a
//           ninja inside for holdSeconds (none inside for leaveSeconds = failed); the owner hears of
//           it at once if the planter was seen, else after alertDelay, and his units standing on
//           the mark for clearSeconds scrub it off (failed). Done: that business pays 0 at the next dawn
//   steal   in a rival-owned business, stand on its back-room stash for seconds: take
//           share of the clan's ryo (at most max)
//   boss    knock out the named rival boss
//   bandits knock out count night bandits before dawn
// Fair board (Tim 2026-10-20): at most perClan jobs on one clan; a clan the Shinobi hit in the
// last recentDays days draws fewer jobs, the season leader more; taking a job swaps the other
// jobs on that clan for jobs on other clans or the town.
// Numbers: units.json rules.contracts. Everything is plain data in state.contracts.
// Completing the first bandit job unlocks one extra before dawn. Newly owned
// businesses can fill spare board slots during the day, without replacing active jobs.
const DEFAULTS = {
  perDawn: [3, 5],
  perClan: 2, recentDays: 2, leaderWeight: 2, rewardPerBusinessPoint: 0.1,
  scout: { ryo: 150, renown: 15, seconds: 10 },
  mark: { ryo: 300, renown: 30, plantSeconds: 3, holdSeconds: 60, leaveSeconds: 10, alertDelay: 15, clearSeconds: 4, reach: 1.5 },
  steal: { share: 0.2, max: 500, capPerBusinessPoint: 100, renown: 25, seconds: 10, reach: 1.5 },
  boss: { ryo: 400, renown: 40 },
  bandits: { ryo: 200, renown: 20, count: 5 },
};
const KIND_NAME = { shop: 'Shop', tenements: 'Tenements', pawnshop: 'Pawnshop', bathhouse: 'Bathhouse', sake_brewery: 'Sake brewery', manor: 'Manor', customs_house: 'Customs house', teahouse: 'Teahouse', warehouse: 'Warehouse', gambling_den: 'Gambling den', hideout: 'hideout' };

// backRoom(b) = { x, z } of a business's back-room spot (in its room); WILD = the bandits' owner id
// leader() = the clan leading the season score (or null)
import { canInteract } from './interactions.js';
import { contractLockoutUntil } from './hq_raids.js';
export function createContracts({ state, rules = {}, scores = {}, backRoom, stash = backRoom, WILD = 'wild', seed = 1234, leader = () => null }) {
  const R = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, typeof v === 'object' && !Array.isArray(v) ? { ...v, ...rules[k] } : rules[k] ?? v]));
  const secs = s => Math.round(s * 20);
  let rs = seed;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  state.contracts ||= { board: [], active: {}, next: 1, posted: false, day: 0, hits: [] };
  const C = state.contracts;
  const ninja = id => state.clans?.[id]?.kind === 'ninja';
  const clanName = id => state.clans?.[id]?.name || 'a rival clan';
  const say = (clan, text) => { clan.notice = { tick: state.tick, text }; return text; };
  const alive = e => e && !e.dead && !e.downed && !e.jailed;
  const unitsOf = id => Object.values(state.entities).filter(e => e.owner === id && alive(e));
  const businessScore = clan => Object.values(state.businesses).reduce((n, b) => n + (b.owner === clan && !b.hideout ? scores[b.kind] || 0 : 0), 0);
  // Board quotes follow public business strength. Accepted jobs retain their
  // quoted reward and theft ceiling even if ownership changes elsewhere.
  function quote(job) {
    if (job.rewardLocked) return { ryo: job.ryo, renown: job.renown, businessScore: job.businessScore,
      multiplier: job.multiplier, stealCap: job.stealCap, stealShare: job.stealShare };
    const score = job.target ? businessScore(job.target) : 0, base = R[job.kind];
    const multiplier = 1 + score * R.rewardPerBusinessPoint;
    return { ryo: base.ryo == null ? null : Math.round(base.ryo * multiplier), renown: Math.round(base.renown * multiplier),
      businessScore: score, multiplier, ...(job.kind === 'steal' ? {
        stealCap: R.steal.max + score * R.steal.capPerBusinessPoint, stealShare: R.steal.share } : {}) };
  }

  // every job that could go up now: on clans that aren't Shinobi, plus the town's bandit job
  function pool() {
    const out = [];
    for (const b of Object.values(state.businesses)) {
      if (!b.owner || ninja(b.owner) || !b.room || b.hideout || !(scores[b.kind] > 0)) continue;
      const place = `the ${clanName(b.owner)} ${KIND_NAME[b.kind] || b.kind.replace(/_/g, ' ')}`;
      out.push({ kind: 'steal', business: b.id, target: b.owner, label: `Steal from ${place}` });
      out.push({ kind: 'scout', business: b.id, target: b.owner, label: `Scout ${place}` });
      out.push({ kind: 'mark', business: b.id, target: b.owner, label: `Sabotage ${place}` });
    }
    for (const e of Object.values(state.entities)) if (e.type === 'hero' && e.owner && !ninja(e.owner) && state.clans?.[e.owner])
      out.push({ kind: 'boss', hero: e.id, target: e.owner, label: `Knock out the ${clanName(e.owner)} boss` });
    out.push({ kind: 'bandits', target: null, label: `Thin out the bandits (${R.bandits.count} tonight)` });
    return out;
  }
  const same = (a, b) => a.kind === b.kind && a.business === b.business && a.hero === b.hero;
  const businessOwners = () => Object.fromEntries(pool().filter(j => j.business).map(j => [j.business, j.target]));
  C.banditsTaken ??= Object.values(C.active).filter(j => j.kind === 'bandits').length;
  C.banditBudget ??= 1;
  C.businessOwners ??= businessOwners();
  C.pendingBusinesses ??= [];
  // how likely a job on this clan is: fewer after recent hits on it, more on the season leader
  const weight = target => {
    if (!target) return 1;
    const recent = C.hits.filter(h => h.target === target && C.day - h.day < R.recentDays).length;
    return (target === leader() ? R.leaderWeight : 1) / (1 + recent);
  };
  // one weighted pick from the pool for the board, never more than perClan on one clan, a kind not
  // on the board yet first; null when nothing fits
  function draw(board, skip = () => false) {
    const per = id => board.filter(j => j.target === id).length;
    const ok = pool().filter(j => !board.some(b => same(b, j)) && !skip(j) && (!j.target || per(j.target) < R.perClan)
      && (j.kind !== 'bandits' || (C.banditsTaken < C.banditBudget && !Object.values(C.active).some(a => a.kind === 'bandits'))));
    if (!ok.length) return null;
    const fresh = ok.filter(j => !board.some(b => b.kind === j.kind)), from = fresh.length ? fresh : ok;
    let r = rnd() * from.reduce((s, j) => s + weight(j.target), 0);
    const j = from.find(j => (r -= weight(j.target)) <= 0) || from[from.length - 1], k = R[j.kind];
    const rivals = Object.keys(state.clans || {}).filter(id => !ninja(id) && id !== j.target);
    return { ...j, id: C.next++, client: j.kind === 'bandits' || !rivals.length ? 'town' : rivals[Math.floor(rnd() * rivals.length)], ryo: k.ryo ?? null, renown: k.renown, night: j.kind === 'mark' };
  }

  // a fresh board each dawn
  function post() {
    const [lo, hi] = R.perDawn, n = lo + Math.floor(rnd() * (hi - lo + 1));
    C.board = [];
    C.banditsTaken = Object.values(C.active).filter(j => j.kind === 'bandits').length;
    C.banditBudget = 1;
    C.businessOwners = businessOwners(); C.pendingBusinesses = [];
    for (let i = 0; i < n; i++) { const j = draw(C.board); if (!j) break; C.board.push(j); }
    C.posted = true;
  }

  // New ownership creates a finite set of business jobs during the day. Fill
  // spare board slots (up to the usual maximum), without reissuing old jobs or
  // undoing the same-clan swaps when a contract is accepted.
  function refresh() {
    const owners = businessOwners();
    C.pendingBusinesses = C.pendingBusinesses.filter(j => owners[j.business] === j.target);
    for (const j of pool()) if (j.business && C.businessOwners[j.business] !== j.target
      && !C.pendingBusinesses.some(p => same(p, j) && p.target === j.target)) C.pendingBusinesses.push(j);
    C.businessOwners = owners;
    C.board = C.board.filter(j => !j.business || owners[j.business] === j.target);
    const max = R.perDawn[1];
    // A completed first bandit job unlocks one replacement, shared by the board.
    if (C.banditBudget > 1 && C.board.length < max) {
      const j = draw(C.board, j => j.kind !== 'bandits');
      if (j) C.board.push(j);
    }
    while (C.board.length < max) {
      const j = draw(C.board, j => !C.pendingBusinesses.some(p => same(p, j) && p.target === j.target)
        || Object.values(C.active).some(a => a.target === j.target));
      if (!j) break;
      C.pendingBusinesses = C.pendingBusinesses.filter(p => !same(p, j) || p.target !== j.target);
      C.board.push(j);
    }
  }

  const reward = job => { const q = quote(job); return job.kind === 'steal'
    ? `${Math.round(q.stealShare * 100)}% of their ryo (max ${q.stealCap})` : `${q.ryo} ryo`; };

  function finish(clanId, ok, why, ryo = null) {
    const job = C.active[clanId], clan = state.clans[clanId];
    delete C.active[clanId];
    if (!job || !clan) return;
    if (ok) {
      const pay = ryo ?? job.ryo ?? 0;
      clan.ryo += pay; clan.renown = (clan.renown || 0) + job.renown;
      if (job.target) C.hits.push({ target: job.target, day: C.day });
      if (pay) state.ryoGains.push({ clan: clanId, amount: pay, target: job.hero ?? job.business, reason: 'Contract' });
      state.news.push({ kind: 'contractDone', clan: clanId, label: job.label, ryo: pay, renown: job.renown });
      say(clan, `Contract done: +${pay} ryo, +${job.renown} Renown`);
      if (job.kind === 'bandits' && C.banditsTaken === 1) C.banditBudget = 2;
    } else {
      state.news.push({ kind: 'contractFailed', clan: clanId, label: job.label, why });
      if (state.clans[job.target]) state.news.push({ kind: 'contractFailedOnYou', clan: job.target, by: clanId,
        contractType: { scout: 'Scout', mark: 'Sabotage', steal: 'Steal', boss: 'Boss' }[job.kind] || job.kind, why });
      say(clan, `Contract failed: ${why}`);
    }
  }

  // [{ id, type: 'contract', action: 'take', job } | { action: 'drop' }] from a Shinobi boss at the shrine (door: the menu door he stands at)
  function command(e, c, door) {
    const clan = state.clans?.[e?.owner];
    if (!clan || !canInteract(e) || !ninja(clan.id)) return;
    if (c.action === 'drop') { if (C.active[clan.id]) finish(clan.id, false, 'called off'); return; }
    if (c.action !== 'take') return;
    const locked = Math.ceil((contractLockoutUntil(state, clan.id) - state.tick) / 20);
    if (locked > 0) return say(clan, `HQ burning: contracts reopen in ${locked} s`);
    if (door?.menu !== 'contracts') return say(clan, 'Take contracts at the village shrine');
    if (C.active[clan.id]) return say(clan, 'Finish or call off your contract first');
    const i = C.board.findIndex(j => j.id === c.job);
    if (i < 0) return say(clan, 'That job is gone');
    const [job] = C.board.splice(i, 1);
    if (!pool().some(j => same(j, job) && j.target === job.target)) return say(clan, 'That contract target is no longer available');
    const priced = quote(job);
    if (job.kind === 'bandits') C.banditsTaken++;
    // the board spreads out: other jobs on the same clan swap for jobs elsewhere (or go)
    if (job.target) {
      const keep = C.board.filter(j => j.target !== job.target), swaps = C.board.length - keep.length;
      for (let k = 0; k < swaps; k++) { const j = draw(keep, x => x.target === job.target); if (j) keep.push(j); }
      C.board = keep;
      C.pendingBusinesses = C.pendingBusinesses.filter(j => j.target !== job.target);
    }
    C.active[clan.id] = { ...job, ...priced, rewardLocked: true, clan: clan.id, takenAt: state.tick, progress: 0 };
    if (job.target) state.news.push({ kind: 'contractWarn', clan: job.target, label: job.label });   // the target gets a warning
    state.news.push({ kind: 'contractTaken', clan: clan.id, label: job.label, ...where(C.active[clan.id]) });
    say(clan, `Contract: ${job.label}`);
  }

  // where the job is, for the map ping and the tracker
  function where(job) {
    const b = state.businesses[job.business], h = state.entities[job.hero];
    return b ? { x: b.x, z: b.z } : h ? { x: h.x, z: h.z } : {};
  }

  function step(clanId, job) {
    const tick = state.tick, mine = unitsOf(clanId);
    const b = state.businesses[job.business];
    if (['scout', 'mark', 'steal'].includes(job.kind) && (!b || b.hideout || !(scores[b.kind] > 0))) return finish(clanId, false, 'the business is no longer available');
    if (b && b.owner !== job.target) return finish(clanId, false, 'the owner changed');
    if (job.kind === 'scout') {
      const seen = mine.some(e => e.place === b.room && e.hidden);
      job.progress = seen ? job.progress + 1 : 0;
      job.need = secs(R.scout.seconds);
      if (job.progress >= job.need) finish(clanId, true);
    } else if (job.kind === 'mark') {
      const r = R.mark;
      if (!job.mark) {
        const spot = backRoom(b);
        const on = state.night && spot && mine.find(e => e.place === b.room && Math.hypot(e.x - spot.x, e.z - spot.z) <= r.reach);
        job.spot = spot && { x: spot.x, z: spot.z, r: r.reach, on: !!on };   // the ring to plant it in (render/banners.js)
        job.progress = on ? job.progress + 1 : 0;
        job.need = secs(r.plantSeconds);
        if (on && job.progress >= job.need) {
          job.mark = { x: spot.x, z: spot.z, place: b.room, at: tick, alertAt: tick + (on.hidden ? secs(r.alertDelay) : 0), held: 0, away: 0, clear: 0 };
          job.progress = 0; job.need = secs(r.holdSeconds);
          state.news.push({ kind: 'markPlanted', clan: clanId, business: b.id });
        }
        return;
      }
      const m = job.mark;
      delete job.spot;
      if (!m.alerted && tick >= m.alertAt) { m.alerted = true; state.news.push({ kind: 'markAlert', clan: job.target, business: b.id, x: b.x, z: b.z }); }
      const inside = mine.some(e => e.place === m.place);
      m.away = inside ? 0 : m.away + 1;
      if (m.away >= secs(r.leaveSeconds)) return finish(clanId, false, 'nobody stayed inside');
      // the owner's people scrub it off once they know (standing on it clearSeconds)
      const scrub = m.alerted && Object.values(state.entities).some(e => e.owner === job.target && alive(e) && e.place === m.place && Math.hypot(e.x - m.x, e.z - m.z) <= r.reach);
      m.clear = scrub ? m.clear + 1 : 0;
      if (m.clear >= secs(r.clearSeconds)) return finish(clanId, false, 'the mark was scrubbed off');
      if (inside) job.progress++;
      if (job.progress >= job.need) { b.sabotaged = true; finish(clanId, true); }
    } else if (job.kind === 'steal') {
      const spot = stash(b), r = R.steal;
      const on = spot && mine.some(e => e.place === b.room && Math.hypot(e.x - spot.x, e.z - spot.z) <= r.reach);
      job.spot = spot && { x: spot.x, z: spot.z, r: r.reach, on };   // the ring to stand in (render/banners.js)
      // stepping off pauses the count instead of resetting it (Tim 2026-10-20)
      if (on) job.progress++;
      job.need = secs(r.seconds);
      // seen inside: the owners get one alarm (guards fight as usual; medium/hard bots send crew home)
      if (!job.alerted && mine.some(e => e.place === b.room && !e.hidden)) {
        job.alerted = true;
        state.news.push({ kind: 'stealAlert', clan: job.target, by: clanId, business: b.id, place: KIND_NAME[b.kind] || b.kind.replace(/_/g, ' '), x: b.x, z: b.z });
      }
      if (job.progress >= job.need) {
        const victim = state.clans[job.target], q = quote(job);
        const amount = Math.min(q.stealCap, Math.floor((victim?.ryo || 0) * q.stealShare));
        if (victim) victim.ryo -= amount;
        finish(clanId, true, '', amount);
      }
    } else if (job.kind === 'boss') {
      const h = state.entities[job.hero];
      if (!h) return finish(clanId, false, 'the boss is gone');
      if (state.hits.some(x => x.t === job.hero && x.kill && state.entities[x.a]?.owner === clanId)) finish(clanId, true);
    } else if (job.kind === 'bandits') {
      job.need = R.bandits.count;
      job.progress += state.hits.filter(x => x.kill && state.entities[x.t]?.owner === WILD && state.entities[x.a]?.owner === clanId).length;
      if (job.progress >= job.need) finish(clanId, true);
    }
  }

  function tick() {
    const any = Object.keys(state.clans || {}).some(ninja);
    if (!any) return;
    for (const id of Object.keys(C.active)) if (contractLockoutUntil(state, id) > state.tick)
      finish(id, false, 'your HQ was raided');
    // dawn: jobs still running run out, and a new board goes up (also the first time round)
    if (state.dawn) for (const [id, job] of Object.entries(C.active)) if (job.takenAt < state.tick) finish(id, false, 'dawn came');
    if (state.dawn) { C.day++; C.hits = C.hits.filter(h => C.day - h.day < R.recentDays); }
    if (state.dawn || !C.posted) post();
    for (const [id, job] of Object.entries(C.active)) step(id, job);
    refresh();
  }

  // Crew sent into an active infiltration job use its business window. Rival
  // home bases are never a contract target or an exception to HQ access rules.
  const mayClimb = (e, place) => ninja(e.owner) && Object.values(C.active).some(j => j.clan === e.owner
    && ['scout', 'mark', 'steal'].includes(j.kind) && !state.businesses[j.business]?.hideout && state.businesses[j.business]?.room === place);

  return { tick, command, post, mayClimb, where, reward, quote, businessScore, backRoom, stash, rules: R };
}
