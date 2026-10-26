// Building panel, bottom left (where the selection panel sits): the selected building's
// picture, name, owner and status. Only reads the state; the click that selects a building
// is in crew_input.js. buildingInfo has no DOM, so Node can check it.
const title = s => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');
import { isShinobiHQ } from './sim/hq_raids.js';

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
  if (isShinobiHQ(state, biz)) {
    rows.push(['HQ raid', 'Suppress contracts; never captured']);
    rows.push(['Victory reward', '2 points + 600 ryo + 10% treasury (max 400)']);
    const r = state.hqRaids?.[biz.id];
    if (r?.suppressedUntil > state.tick) rows.push(['On fire', `Contracts reopen in ${Math.ceil((r.suppressedUntil - state.tick) / 20)} s`]);
    else if (r?.protectedUntil > state.tick) rows.push(['Raid protection', `${Math.ceil((r.protectedUntil - state.tick) / 20)} s remaining`]);
  }
  rows.push(['Enter', biz.room ? 'Yes, Space at the door' : biz.kind === 'clinic' ? 'Clinic menu, Space at the ring' : biz.kind === 'police_box' ? 'Bribes, Space at the ring' : biz.kind === 'police_hq' ? 'Bail, Space at the ring' : 'No']);
  const deal = units?.rules?.businesses?.[biz.kind];
  if (deal?.payout) rows.push([biz.owner === clan ? 'Pays you' : 'Pays', `${deal.payout} ryo at dawn`]);
  if (deal?.price && !biz.owner) rows.push(['Price', `${deal.price} ryo`]);
  const guards = units?.rules?.houseGuards?.count;
  if (deal && guards && biz.owner) rows.push(['Guards', `${Object.values(state.entities).filter(e => e.guard === biz.id && !e.dead).length} of ${guards}`]);
  const slots = units?.rules?.capPerBusiness?.[biz.kind];
  if (slots) rows.push([biz.owner === clan ? 'Gives' : 'If held', `+${slots} crew slots`]);
  if ((biz.kind === 'teahouse' || biz.kind === 'dojo') && c) {
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

// The panel's buttons send commands (send) for the hero (heroId): Buy for an unclaimed business
export function createBuildingPanel({ root, game, district, info, units, scenery, crewInput, clan, heroId, send, openService = () => {} }) {
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
      root.innerHTML = '<div class="pic"></div><div class="info"><b></b><i></i><dl></dl><div class="acts"><button class="service" hidden></button><button class="buy" hidden></button><button class="atk" hidden></button><button class="raid" hidden></button><button class="lantern" hidden></button><span class="why"></span></div><div class="notice" hidden></div></div>';
      root.querySelector('.service').addEventListener('click', e => {
        const b = game.state.businesses[`b${shown}`];
        const door = b && game.doors.find(d => d.menu && Math.hypot(d.x - (b.ring?.[0] ?? b.x), d.z - (b.ring?.[1] ?? b.z)) < 4);
        if (door) openService(door.menu);
        e.currentTarget.blur();
      });
      if (file) root.querySelector('.pic').style.backgroundImage = `url(${file})`;
      for (const [cls, action] of [['raid', 'raid'], ['lantern', 'lantern']]) root.querySelector(`.${cls}`).addEventListener('click', e => {
        send({ id: heroId, type: 'business', action, business: `b${shown}` });
        e.currentTarget.blur();
      });
      root.querySelector('.atk').addEventListener('click', e => {
        send({ id: heroId, type: 'business', action: 'attack', business: `b${shown}` });
        e.currentTarget.blur();
      });
      root.querySelector('.buy').addEventListener('click', e => {
        send({ id: heroId, type: 'business', action: 'buy', business: `b${shown}` });
        e.currentTarget.blur();
      });
    }
    // Buy (sim/businesses.js canBuy): greyed out with the reason when it can't be bought now
    const can = game.businesses && game.state.businesses[`b${i}`] && !game.state.businesses[`b${i}`].owner ? game.businesses.canBuy(heroId, `b${i}`) : null;
    d.buy = can?.price ? { ok: can.ok, why: can.why, price: can.price } : null;
    // Attack (night only, sim/businesses.js canAttack): shown next to Buy for an unclaimed business
    const atk = d.buy ? game.businesses.canAttack(heroId, `b${i}`) : null;
    d.attack = atk && { ok: atk.ok, why: atk.why };
    // Raid (a rival's business, needs a War Lantern) and Buy War Lantern (the moneylender's)
    const biz = game.state.businesses[`b${i}`];
    const service = biz && game.doors?.find(d => d.menu && Math.hypot(d.x - (biz.ring?.[0] ?? biz.x), d.z - (biz.ring?.[1] ?? biz.z)) < 4);
    d.service = service ? { menu: service.menu, ok: !!game.serviceAt?.(heroId, service.menu, crewInput.selected?.() || []) } : null;
    const raid = biz?.owner && biz.owner !== clan && (game.businesses?.rules[biz.kind] || isShinobiHQ(game.state, biz)) ? game.businesses.canRaid(heroId, `b${i}`) : null;
    d.raid = raid && { ok: raid.ok, why: raid.why };
    const ml = biz?.kind === 'moneylender' ? game.businesses?.canBuyLantern(heroId, `b${i}`) : null;
    d.lantern = ml && { ok: ml.ok, why: ml.why, price: ml.price };
    const c = game.state.clans?.[clan];
    d.notice = c?.notice && game.state.tick - c.notice.tick < 20 * 4 ? c.notice.text : '';
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
    const buy = root.querySelector('.buy');
    const serviceButton = root.querySelector('.service');
    serviceButton.hidden = !d.service;
    if (d.service) { serviceButton.textContent = 'Open menu'; serviceButton.disabled = !d.service.ok; }
    buy.hidden = !d.buy;
    if (d.buy) { buy.textContent = `Buy (${d.buy.price} ryo)`; buy.disabled = !d.buy.ok; }
    const raidBtn = root.querySelector('.raid'), mlBtn = root.querySelector('.lantern');
    raidBtn.hidden = !d.raid; raidBtn.textContent = 'Raid (War Lantern)'; raidBtn.disabled = !d.raid?.ok;
    mlBtn.hidden = !d.lantern; mlBtn.textContent = `Buy War Lantern (${d.lantern?.price} ryo)`; mlBtn.disabled = !d.lantern?.ok;
    const atkBtn = root.querySelector('.atk');
    atkBtn.hidden = !d.attack; atkBtn.textContent = 'Attack'; atkBtn.disabled = !d.attack?.ok;
    // the reason shown is Buy's, or Attack's when only buying is possible
    root.querySelector('.why').textContent = d.buy && !d.buy.ok ? d.buy.why : d.attack && !d.attack.ok && d.attack.why !== d.buy?.why ? `Attack: ${d.attack.why.toLowerCase()}`
      : d.raid && !d.raid.ok ? d.raid.why : d.lantern && !d.lantern.ok ? d.lantern.why : '';
    const note = root.querySelector('.notice');
    note.hidden = !d.notice; note.textContent = d.notice;
  }
  return { update };
}
