// Keep the control descriptions in the markup for accessibility; show a single
// floating copy so scrolling the controls panel cannot clip the tooltip.
export function bindControlTooltips(panel) {
  const tip = document.createElement('div');
  tip.id = 'control-tooltip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  const hide = () => { tip.hidden = true; };
  for (const [index, row] of [...panel.querySelectorAll('.row')].entries()) {
    const key = row.querySelector('kbd'), description = row.querySelector('span');
    if (!key || !description) continue;
    description.id ||= `control-description-${index}`;
    key.tabIndex = 0;
    key.setAttribute('aria-describedby', description.id);
    const show = () => {
      if (panel.hidden) return;
      tip.textContent = description.textContent;
      tip.style.visibility = 'hidden'; tip.hidden = false;
      const rect = key.getBoundingClientRect(), box = tip.getBoundingClientRect(), gap = 8, margin = 12;
      const below = rect.bottom + gap;
      const top = below + box.height <= innerHeight - margin ? below : rect.top - box.height - gap;
      tip.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - box.width - margin))}px`;
      tip.style.top = `${Math.max(margin, Math.min(top, innerHeight - box.height - margin))}px`;
      tip.style.visibility = '';
    };
    key.addEventListener('mouseenter', show);
    key.addEventListener('mouseleave', hide);
    key.addEventListener('focus', show);
    key.addEventListener('blur', hide);
  }
  panel.addEventListener('scroll', hide);
  window.addEventListener('resize', hide);
  return { hide };
}
