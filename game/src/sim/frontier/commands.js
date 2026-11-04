// Frontier commands and receipts (frontier plan F2.8). One command shape for players, bots and
// governors: { id: <hero id>, type: 'frontier', action, ... }. Each action checks that the
// settlement's owner is the commanding clan (e.owner) and that values are valid, then acts and
// pushes a receipt { seq, tick, clan, action, ok, reason } onto state.frontier.receipts.
// A rejected command changes nothing but the receipt list. Receipts of earlier ticks are dropped
// by clearOldReceipts(), which the hub calls at the start of every frontier tick.
// createCommands({ state, data, world, economy, construction, governor }) -> { command, clearOldReceipts }
const PRIORITIES = ['grow', 'produce', 'trade', 'fortify'];
const ACTIONS = ['setPriority', 'setBudget', 'setAutoBuild', 'approveSuggestion', 'setTax', 'authorize', 'cancel', 'queue', 'setTownOrder', 'devRoadState', 'found', 'place', 'remove', 'zone'];

export function createCommands({ state, data, world, economy, construction, governor, founding, worldData, placement, zones }) {
  const f = () => state.frontier;

  function receipt(e, c, ok, reason = '') {
    const fr = f();
    fr.receiptSeq = (fr.receiptSeq || 0) + 1;
    fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok, reason });
    return true;   // the command was handled (accepted or rejected)
  }
  const reject = (e, c, reason) => receipt(e, c, false, reason);

  function clearOldReceipts() {
    const fr = f();
    if (fr.receipts.length && fr.receipts.some(r => r.tick !== state.tick)) fr.receipts = fr.receipts.filter(r => r.tick === state.tick);
  }

  function command(e, c) {
    if (c.action === 'noop') return false;
    if (!ACTIONS.includes(c.action)) return reject(e, c, 'unknown action');
    if (c.action === 'devRoadState') {   // dev build only (data.dev): block or clear a road to try the alerts
      if (!data.dev) return reject(e, c, 'dev only');
      if (!world.frontier.roads[c.road] || !['working', 'blocked'].includes(c.state)) return reject(e, c, 'no such road');
      world.setRoadState(c.road, c.state);
      return receipt(e, c, true);
    }
    if (c.action === 'found') {   // E3: found a town at the hero's own spot with the settlers standing round him
      if (e.type !== 'hero' || !founding) return reject(e, c, 'only a hero can found a town');
      const r = founding.found(e, c.name, worldData, world, construction);
      if (!r.ok && state.clans?.[e.owner]) state.clans[e.owner].notice = { tick: state.tick, text: r.reason };
      return r.ok ? receipt(e, c, true) : reject(e, c, r.reason);
    }
    if (c.action === 'setTownOrder') {   // clan-wide: the full list of your towns, in your order
      const mine = world.townOrder(e.owner);
      const ok = e.owner && Array.isArray(c.order) && c.order.length === mine.length && new Set(c.order).size === mine.length && c.order.every(id => mine.includes(id));
      if (!ok) return reject(e, c, 'order must list each of your towns once');
      world.setTownOrder(e.owner, c.order);
      return receipt(e, c, true);
    }
    if (c.action === 'place' || c.action === 'remove' || c.action === 'zone') {   // L3.2/L3.3: build bar actions, named by `town`
      const t = typeof c.town === 'string' ? world.settlement(c.town) : null;
      if (!t) return reject(e, c, 'no such settlement');
      if (t.capital) return reject(e, c, 'the capital has no frontier economy');
      if (t.owner == null || t.owner !== e.owner) return reject(e, c, 'not your settlement');
      if (c.dryRun) { placement.lastDryRun = c.action === 'place' ? placement.check(t, c) : c.action === 'zone' ? zones.zone(t, { ...c, dryRun: true }) : null; return true; }   // changes nothing, not even receipts
      const by = c.by === 'g' ? 'g' : 'p';
      const r = c.action === 'place' ? placement.place(t, { ...c, by }) : c.action === 'zone' ? zones.zone(t, { kind: c.kind, rect: c.rect, cells: c.cells, by }) : placement.remove(t, c);
      const fr = f();
      fr.receiptSeq = (fr.receiptSeq || 0) + 1;
      fr.receipts.push({ seq: fr.receiptSeq, tick: state.tick ?? 0, clan: e.owner ?? null, action: c.action, ok: r.ok, reason: r.reason, cost: r.cost, cells: r.cells });
      return true;
    }
    // projects name their town through the project id; everything else names the settlement
    let s, hit;
    if (c.action === 'authorize' || c.action === 'cancel') {
      hit = typeof c.project === 'string' ? construction.find(c.project) : null;
      if (!hit) return reject(e, c, 'no such project');
      s = hit.settlement;
    } else {
      s = typeof c.settlement === 'string' ? world.settlement(c.settlement) : null;
      if (!s) return reject(e, c, 'no such settlement');
    }
    if (s.capital) return reject(e, c, 'the capital has no frontier economy');
    if (s.owner == null || s.owner !== e.owner) return reject(e, c, 'not your settlement');

    switch (c.action) {
      case 'setPriority':
        if (!PRIORITIES.includes(c.priority)) return reject(e, c, 'unknown priority');
        s.priority = c.priority;
        return receipt(e, c, true);
      case 'setBudget':
        if (!Number.isFinite(c.ryo) || c.ryo < 0) return reject(e, c, 'budget must be 0 or more');
        s.budget = { ...(s.budget || {}), ryo: c.ryo };
        return receipt(e, c, true);
      case 'setAutoBuild':
        if (typeof c.on !== 'boolean') return reject(e, c, 'on must be true or false');
        s.autoBuild = c.on;
        return receipt(e, c, true);
      case 'approveSuggestion':
        if (!Number.isInteger(c.index) || !s.suggestions?.[c.index]) return reject(e, c, 'no such suggestion');
        return governor.approve(s.id, c.index) ? receipt(e, c, true) : reject(e, c, 'could not start it');
      case 'setTax':
        if (!['low', 'normal', 'high', 'auto'].includes(c.level)) return reject(e, c, 'unknown tax level');
        economy.setTax(s.id, c.level);
        return receipt(e, c, true);
      case 'authorize':
        construction.authorize(hit.project.id);
        return receipt(e, c, true);
      case 'cancel':
        construction.cancel(hit.project.id);
        return receipt(e, c, true);
      case 'queue':
        if (!data.buildings[c.building]) return reject(e, c, 'unknown building');
        return construction.queue(s.id, c.building, c.cell ?? null) ? receipt(e, c, true) : reject(e, c, 'could not queue it');
    }
    return reject(e, c, 'unknown action');
  }

  return { command, clearOldReceipts };
}
