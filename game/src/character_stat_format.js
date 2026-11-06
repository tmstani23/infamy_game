// Stat text for the Character page (no DOM, no three.js), so Node tests can import it.
// Character page formats authoritative snapshots; it owns no stat formulas.
export function formatStat(row, value) {
  const n = row.unit === '%' ? value * 100 : value;
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: row.unit === 'hp' || row.unit === 'damage' ? 0 : 3 }).format(n);
  return row.unit === '%' ? `${number}%` : row.unit === '×' ? `${number}×` : `${number}${row.unit === 'hp' || row.unit === 'damage' ? '' : ` ${row.unit}`}`;
}
export function modifierDisplay(row) {
  if (Math.abs(row.modifier) < 1e-9) return { text: '—', kind: '', changed: false };
  const n = row.unit === '%' ? row.modifier * 100 : row.modifier;
  const text = `${n > 0 ? '+' : '−'}${new Intl.NumberFormat('en-US', { maximumFractionDigits: row.unit === 'hp' || row.unit === 'damage' ? 0 : 3 }).format(Math.abs(n))}${row.unit === '%' ? ' pp' : ''}`;
  return { text, kind: (row.lowerBetter ? row.modifier < 0 : row.modifier > 0) ? 'positive' : 'negative', changed: true };
}
