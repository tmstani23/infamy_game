// Building panel, bottom left (where the selection panel sits): the selected building's
// picture, name, owner and status. Only reads the state; the click that selects a building
// is in crew_input.js. buildingInfo has no DOM, so Node can check it.
const title = s => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');

// What the panel says about building number i of the district, seen by clan:
// { name, owner, rows: [[label, value], ...] }
export function buildingInfo({ state, district, info = {}, units }, i, clan) {
  const b = district.buildings[i];
  if (!b) return null;
  const name = info.names?.[b.art] || title(b.art);
  const biz = state.businesses[`b${i}`];
  if (!biz) return { name, owner: 'No business here yet', rows: [] };
  const c = state.clans?.[clan];
  const owner = !biz.owner ? 'Unclaimed' : biz.owner === clan ? 'Yours' : state.clans?.[biz.owner]?.name || title(biz.owner);
  const rows = [['Role', info.roles?.[biz.kind] || title(biz.kind)]];
  rows.push(['Enter', biz.room ? 'Yes, Space at the door' : biz.kind === 'clinic' ? 'Clinic menu, Space at the ring' : biz.kind === 'police_box' ? 'Bribes, Space at the ring' : biz.kind === 'police_hq' ? 'Bail, Space at the ring' : 'No']);
  const slots = units?.rules?.capPerBusiness?.[biz.kind];
  if (slots) rows.push([biz.owner === clan ? 'Gives' : 'If held', `+${slots} crew slots`]);
  if (biz.kind === 'teahouse' && c) {
    const q = c.queue.filter(h => h.business === biz.id);
    rows.push(['Hiring', q.length ? `${q.length} waiting, ${Math.ceil(Math.max(0, q[0].left))} s left` : 'Nobody waiting']);
  }
  if (biz.kind === 'clinic' && c) rows.push(['Patients', c.clinic.length ? `${c.clinic.length} of your crew` : 'None of yours']);
  if (biz.room) {
    const n = Object.values(state.entities).filter(e => e.owner === clan && !e.dead && e.place === biz.room).length;
    rows.push(['Inside', n ? `${n} of your units` : 'None of yours']);
  }
  return { name, owner, rows };
}

export function createBuildingPanel({ root, game, district, info, units, scenery, crewInput, clan }) {
  let shown = null, last = '';
  function update() {
    const i = crewInput.building();
    root.hidden = i === null;
    if (i === null) { shown = null; return; }
    const d = buildingInfo({ state: game.state, district, info, units }, i, clan);
    if (!d) { root.hidden = true; return; }
    if (i !== shown) {
      shown = i; last = '';
      const file = scenery.find(s => s.building === i)?.item.file;
      root.innerHTML = '<div class="pic"></div><div class="info"><b></b><i></i><dl></dl></div>';
      if (file) root.querySelector('.pic').style.backgroundImage = `url(${file})`;
    }
    const key = JSON.stringify(d);
    if (key === last) return;
    last = key;
    root.querySelector('b').textContent = d.name;
    root.querySelector('i').textContent = d.owner;
    const dl = root.querySelector('dl');
    dl.innerHTML = '';
    for (const [k, v] of d.rows) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = v;
      dl.append(dt, dd);
    }
  }
  return { update };
}
