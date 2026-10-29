// Every authoritative debit records its actual before/after balance. Keep the
// saved history bounded; transient events are cleared with the other tick FX.
export function debitRyo(state, clan, amount, reason, details = {}) {
  const before = clan.ryo;
  clan.ryo -= amount;
  if (!(amount > 0)) return;
  const entry = { ...details, clan: clan.id, at: state.tick, amount, reason, before, after: clan.ryo };
  (state.ryoLosses ||= []).push(entry);
  const history = clan.ryoHistory ||= [];
  history.push(entry);
  if (history.length > 20) history.splice(0, history.length - 20);
}
