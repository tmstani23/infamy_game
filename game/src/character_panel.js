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

export function createCharacterPanel({ game, heroId, catalog, button, onOpen = () => {}, onClose = () => {} }) {
  const root = document.createElement('section'); root.id = 'characterpage'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Hero character');
  root.innerHTML = '<div class="character-window"><header><div><span class="character-eyebrow">CLAN RECORD</span><h2>Character</h2></div><button type="button" class="character-close" aria-label="Close character page">✕</button></header><div class="character-layout"><aside><div class="hero-art"><div class="hero-sprite"></div></div><span class="hero-clan"></span><h3 class="hero-name"></h3><div class="character-health"><div></div></div><span class="character-hp"></span><div class="character-passives"></div></aside><main><div class="stat-heading"><h3>Attributes</h3><span>Base</span><span>Modifier</span><span>Current</span></div><div class="character-stats"></div><div class="character-abilities"><h3>Abilities</h3><div></div></div></main></div><footer>Hover a modifier for its source · Changes update during play</footer></div>';
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), rows = new Map(), abilities = new Map(), passiveRows = new Map();
  let model = null, open = false, previousFocus = null;
  function setOpen(on) {
    if (open === on) return;
    open = on; root.hidden = !on; button?.setAttribute('aria-expanded', String(on));
    if (on) { previousFocus = document.activeElement; onOpen(); update(); $('.character-close').focus(); }
    else { onClose(); previousFocus?.focus?.(); }
  }
  $('.character-close').addEventListener('click', () => setOpen(false));
  root.addEventListener('click', e => { if (e.target === root) setOpen(false); });
  root.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.code === 'KeyJ') { e.preventDefault(); setOpen(false); }
    if (e.key === 'Tab') {
      const stops = [...root.querySelectorAll('button, summary, [tabindex="0"]')], first = stops[0], last = stops.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  for (const type of ['mousedown', 'mouseup', 'contextmenu', 'wheel']) root.addEventListener(type, e => e.stopPropagation());
  button?.addEventListener('click', () => setOpen(!open));
  function update() {
    if (!open) return;
    const hero = game.state.entities[heroId], snapshot = game.stats.snapshot(hero); if (!snapshot) return;
    root.dataset.clan = snapshot.faction || snapshot.kind;
    $('.hero-name').textContent = snapshot.name; $('.hero-clan').textContent = snapshot.clan;
    $('.character-hp').textContent = `${Math.ceil(snapshot.hp)} / ${snapshot.maxHp} HP`;
    $('.character-health div').style.width = `${Math.max(0, Math.min(100, snapshot.hp / snapshot.maxHp * 100))}%`;
    if (model !== snapshot.model) {
      model = snapshot.model; const entry = catalog.characters?.[model]?.idle, file = typeof entry === 'string' ? entry : entry?.file;
      if (file) {
        const image = new Image(), expected = model; image.onload = () => {
          if (expected !== model) return;
          const frame = image.naturalHeight / 8;
          $('.hero-sprite').style.backgroundImage = `url(${image.src})`;
          $('.hero-sprite').style.backgroundSize = `${image.naturalWidth / frame * 100}% 800%`;
        }; image.src = `../assets/sprites/${file}.png`;
      }
    }
    for (const row of snapshot.rows) {
      let record = rows.get(row.key);
      if (!record) {
        const el = document.createElement('div'); el.className = 'character-stat'; el.tabIndex = 0;
        const label = document.createElement('span'), base = document.createElement('span'), modifier = document.createElement('span'), current = document.createElement('strong');
        modifier.className = 'stat-modifier'; el.append(label, base, modifier, current); $('.character-stats').appendChild(el);
        record = { el, label, base, modifier, current }; rows.set(row.key, record);
      }
      const change = modifierDisplay(row);
      record.label.textContent = row.label; record.base.textContent = formatStat(row, row.base); record.modifier.textContent = change.text; record.current.textContent = formatStat(row, row.value);
      record.el.dataset.group = row.group; record.modifier.className = `stat-modifier ${change.kind}`;
      record.current.className = change.changed ? `modified ${change.kind}` : '';
      const detail = [...row.sources, row.note].filter(Boolean).join(' · ') || 'Base value; no active modifiers.';
      record.el.title = detail; record.modifier.title = detail;
      record.el.setAttribute('aria-label', `${row.label}: base ${formatStat(row, row.base)}, modifier ${change.text}, current ${formatStat(row, row.value)}. ${detail}`);
    }
    for (const passive of snapshot.passives) {
      let el = passiveRows.get(passive.id);
      if (!el) { el = document.createElement('div'); el.className = 'character-passive'; el.innerHTML = '<b></b><small></small><p></p>'; $('.character-passives').appendChild(el); passiveRows.set(passive.id, el); }
      el.querySelector('b').textContent = passive.name; el.querySelector('small').textContent = passive.status; el.querySelector('p').textContent = passive.description; el.classList.toggle('active', passive.active);
    }
    for (const a of snapshot.abilities) {
      let el = abilities.get(a.key);
      if (!el) { el = document.createElement('details'); el.innerHTML = '<summary><kbd></kbd><b></b><span></span></summary><p></p>'; $('.character-abilities > div').appendChild(el); abilities.set(a.key, el); }
      el.querySelector('kbd').textContent = a.key; el.querySelector('b').textContent = a.name;
      el.querySelector('span').textContent = a.remaining > 0 ? `${Math.ceil(a.remaining)}s remaining` : `${a.cooldown}s cooldown`;
      el.querySelector('p').textContent = a.about;
    }
  }
  return { update, toggle: () => setOpen(!open), close: () => { if (open) setOpen(false); }, isOpen: () => open };
}
