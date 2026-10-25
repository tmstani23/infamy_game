// Read-only location HUD, sharing the building panel's names and live stats.
import { buildingInfo } from './building_panel.js';

export function interiorInfo({ game, district, info, units, heroId, clan }) {
  const place = game.state.entities[heroId]?.place;
  if (!place || place === 'street') return null;
  const business = Object.values(game.state.businesses || {}).find(b => b.room === place);
  const index = business && Number(business.id.slice(1));
  const details = Number.isInteger(index) ? buildingInfo({ state: game.state, district, info, units }, index, clan) : null;
  if (!details) return { name: place.replace(/_/g, ' '), owner: 'Interior', rows: [] };
  const rows = details.rows.filter(([label]) => label !== 'Enter');
  const score = units?.rules?.businesses?.[business.kind]?.score;
  if (score) rows.push(['Season score', `${score} ${score === 1 ? 'point' : 'points'}`]);
  return { ...details, rows };
}

export function createInteriorInfo({ root, ...context }) {
  let last = '';
  const label = document.createElement('button');
  label.type = 'button'; label.className = 'building-name';
  label.setAttribute('aria-describedby', 'interior-details');
  const box = document.createElement('div');
  box.id = 'interior-details'; box.className = 'building-details'; box.setAttribute('role', 'tooltip');
  root.replaceChildren(label, box);
  return { update() {
    const details = interiorInfo(context);
    root.hidden = !details;
    if (!details) { last = ''; return; }
    const key = JSON.stringify(details);
    if (key === last) return;
    last = key;
    const name = document.createElement('strong'); name.textContent = details.name;
    const owner = document.createElement('small'); owner.textContent = details.owner;
    const stats = document.createElement('dl');
    for (const [label, value] of details.rows) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      stats.append(dt, dd);
    }
    label.textContent = details.name;
    box.replaceChildren(name, owner, stats);
  } };
}
