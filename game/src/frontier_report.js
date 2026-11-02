// Dev-only town readout text (frontier plan F2.4b). Pure: reads a frontier snapshot, writes nothing.
// F4 replaces this with the real town panel.
const fix = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString();

export function frontierReport(frontier) {
  if (!frontier) return 'frontier: off';
  const lines = [`frontier · economy tick ${frontier.econTick}`];
  for (const s of Object.values(frontier.settlements || {})) {
    if (s.capital) continue;
    const stock = Object.entries(s.stock).map(([r, v]) => `${r} ${fix(v)}`).join(' · ');
    const jobs = (s.buildings || []).reduce((n, b) => n + (b.stage === 'built' ? b.workers || 0 : 0), 0);
    lines.push(`${s.name} (${s.id}) owner ${s.owner ?? '-'} · pop ${s.pop}/${s.housing} · jobs ${jobs}${s.mood !== undefined ? ` · mood ${fix(s.mood, 0)}` : ''}`);
    lines.push(`  ${stock}`);
    const r = s.report || {};
    if (r.doing || r.next || r.waiting?.length) lines.push(`  ${r.doing || ''}${r.next ? ' → ' + r.next : ''}${r.waiting?.length ? ' · waiting: ' + r.waiting.join(', ') : ''}`);
  }
  return lines.join('\n');
}
