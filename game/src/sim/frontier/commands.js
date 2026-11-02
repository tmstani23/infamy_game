// Frontier commands and receipts (frontier plan F2.8). One command shape for players, bots and
// governors: { id: <hero id>, type: 'frontier', action, ... }. Each action checks that the
// settlement's owner is the commanding clan (e.owner) and that values are valid, then acts and
// pushes a receipt { seq, tick, clan, action, ok, reason } onto state.frontier.receipts.
// A rejected command changes nothing but the receipt list. Receipts of earlier ticks are dropped
// by clearOldReceipts(), which the hub calls at the start of every frontier tick.
// createCommands({ state, data, world, economy, construction, governor }) -> { command, clearOldReceipts }
const PRIORITIES = ['grow', 'produce', 'trade', 'fortify'];
const ACTIONS = ['setPriority', 'setBudget', 'setAutoBuild', 'approveSuggestion', 'setTax', 'authorize', 'cancel', 'queue'];

export function createCommands({ state, data, world, economy, construction, governor }) {
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
