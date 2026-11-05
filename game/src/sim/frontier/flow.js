// Stock flows for the Usage page (Tim 2026-11-05). world.change notes every stock change here by its
// reason; once per economy tick the sums fold into a smoothed per-minute rate per reason. Read-only
// for rules: nothing in the sim decides anything from s.flow, it only explains the stock to players.
const SMOOTH = 1 / 60;   // about a one-minute average, so lumpy worker drop-offs read steady
export function noteFlow(s, resource, delta, reason) {
  const acc = ((s.flowAcc ||= {})[resource] ||= {});
  acc[reason] = (acc[reason] || 0) + delta;
}
// secs = seconds per economy tick
export function foldFlow(s, secs) {
  const acc = s.flowAcc || {}, flow = (s.flow ||= {});
  for (const r of new Set([...Object.keys(flow), ...Object.keys(acc)])) {
    const now = acc[r] || {}, f = (flow[r] ||= {});
    for (const why of new Set([...Object.keys(f), ...Object.keys(now)])) {
      const v = (f[why] || 0) + ((now[why] || 0) * 60 / secs - (f[why] || 0)) * SMOOTH;
      if (Math.abs(v) < 1e-3 && !now[why]) delete f[why]; else f[why] = v;
    }
  }
  s.flowAcc = {};
}
