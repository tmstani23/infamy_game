// One floating tooltip for anything with a data-tip attribute inside `root` (frontier F4: panel, overview).
// Tips only go on things a player cannot guess or needs for a decision (Tim, 2026-11-02).
export function bindTips(root) {
  let el = document.getElementById?.('fptip');
  if (!el) { el = document.createElement('div'); el.id = 'fptip'; el.hidden = true; document.body.appendChild(el); }
  const hide = () => { el.hidden = true; };
  root.addEventListener('mouseover', e => {
    const t = e.target.closest?.('[data-tip]'); if (!t) { hide(); return; }
    el.textContent = t.dataset.tip; el.style.visibility = 'hidden'; el.hidden = false;
    const r = t.getBoundingClientRect(), w = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w.width - 8))}px`;
    el.style.top = `${r.bottom + 6 + w.height < innerHeight ? r.bottom + 6 : Math.max(8, r.top - w.height - 6)}px`;
    el.style.visibility = '';
  });
  root.addEventListener('mouseleave', hide);
  return { hide };
}
