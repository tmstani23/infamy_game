import { createZones } from './sim/frontier/zones.js';
import {BUILD_DETAILS} from './build_tooltips.js';
import { residents } from './sim/frontier/people.js';

export const townName = value => String(value || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// Town building site (Tim 2026-11-15): who builds it and how long it has left. The townspeople build the paid
// project at rates.townBuildRate each (1 in a bot town or with Automatic on); each worker at the site adds
// rates.workerBuildRate, at most rates.maxBuilders workers.
export function siteBuilders(s, p, data, clans = null) {
  const R = data.rates || {}, key = `p|${s.id}|${p.id}`, max = R.maxBuilders ?? 4;
  const sent = (s.workers || []).filter(w => w.job?.key === key), at = sent.filter(w => !w.trip).length;
  const folk = p.paid ? s.builders || 0 : 0, rate = clans?.[s.owner]?.bot || s.autoBuild ? 1 : R.townBuildRate ?? 0.5;
  const speed = folk * rate + at * (R.workerBuildRate ?? 1), left = Math.max(0, p.need - p.progress);
  const who = [folk ? `${folk} townspeople` : '', sent.length ? `${sent.length} of your workers${at < sent.length ? `, ${sent.length - at} on the way` : ''}` : ''].filter(Boolean).join(', ') || 'nobody yet';
  const out = [`Builders: ${who}`];
  if (p.paid && speed > 0 && left > 0) out.push(`Time left: about ${Math.ceil(left / speed)} s`);
  if (s.owner != null && !clans?.[s.owner]?.bot && sent.length < max && left > 0) out.push(`\u0001Send workers to build faster: select them and right-click the site (up to ${max})`);
  return out;
}

// Reads only: the inspector and build overlay share the simulation's road query.
export function townCellTip(s, cell, data, clans = null) {
  if (!s?.grid || cell < 0 || cell >= s.grid.n * s.grid.n) return null;
  const g = s.grid, b = s.buildings.find(b => (b.cells || [b.cell]).includes(cell));
  const p = s.projects.find(p => (p.cells || [p.cell]).includes(cell));
  const entry = Object.entries(data.zones.kinds).find(([, k]) => k.char === g.zone[cell]);
  if (!b && !p && !entry && !'rwg'.includes(g.use[cell])) return null;
  const [kind, def] = entry || [], zone = s.zones?.[kind];
  const lines = [`Town: ${s.name}`, `Zone: ${kind ? townName(kind) : 'none (placed structure)'}`];
  if (p) lines.push(`State: ${townName(p.phase || (p.paid ? 'frame' : 'planned'))} · ${Math.round(100 * p.progress / Math.max(1, p.need))}%`);
  if (p?.authorized) lines.push(...siteBuilders(s, p, data, clans));
  else if (b) lines.push(`State: ${townName(b.stage)}`);
  else if (entry) lines.push(`State: ${g.ground[cell] === 'o' ? 'Clearing' : def.stages[Number(g.stage[cell]) - 1] || 'Zoned ground'}`);
  else lines.push('State: finished');
  if (entry) {
    lines.push(`Zone state: ${zone?.abandoned ? 'abandoned' : 'active'} · health ${Math.round((zone?.health ?? 1) * 100)}%`);
    if (!createZones({ data }).roadNear(s, cell, def.needs?.roadReach)) lines.push(`\u0002No road linked to the town hall within ${def.needs?.roadReach} cells: will not grow`);
    if(def.needs?.food && (s.foodShortage || (s.stock.food || 0)<data.rates.food*residents(s)))lines.push(`Needs food: ${Number((data.rates.food*residents(s)).toFixed(2))} per economy tick for ${s.pop} people`);
    if(def.needs?.workersPerCell && (zone?.workers || 0)<(zone?.wanted || 0))lines.push(`Needs townspeople: ${zone?.workers || 0} / ${zone?.wanted || 0} zone jobs filled; trained gatherers are separate`);
    if(def.housing) {   // B7: who lives here and what the next level needs
      const st=Number(g.stage[cell]) || 0, beds=Math.round(def.housing*st*(zone?.abandoned?0:(zone?.health ?? 1))), fill=s.housing>0?Math.min(1,residents(s)/s.housing):0;
      lines.push(`People: about ${Math.round(beds*fill)} / ${beds} (the town is ${Math.round(fill*100)}% full)`);
      const goods=data.upkeep?.goodsByStage?.[st] || 0;
      if(st>0 && st<def.stages.length)lines.push(goods>0?`Next level needs goods (${goods} per economy tick)${s.goodsShort || !(s.stock.goods>0)?' · missing':''}`:'Next level: road and healthy zone');
      if(st>=def.stages.length)lines.push('Largest house');
    }
    if(def.output) {   // Tim 2026-11-21: say what the zone makes, per second and per hour (one economy tick is cadenceTicks / 20 s)
      const sec=(data.cadenceTicks || 20)/20, n=v=>Number(v.toPrecision(3)), rate=v=>`${n(v/sec)}/s, ${n(v*3600/sec)}/hr`;
      const made=Object.entries(def.output).map(([r,v])=>`${r} ${rate(v)}`).join(' + '), now=zone?.output || 0;
      lines.push(`Output: ${made} per plot level at full workers${def.trait?' (soil changes it)':''}`);
      lines.push(now>0?`Making now: ${Object.keys(def.output).join('/')} ${rate(now)} (whole ${kind} zone)`:'Making nothing now');
    }
    if(def.inputs)for(const [r,amount] of Object.entries(def.inputs))lines.push(`Input: ${amount} ${r} per goods produced${(s.stock[r] || 0)<=0?' · missing':''}`);
    if(g.ground[cell]==='o')lines.push('Needs ground clearing before growth');
    if(Number(g.stage[cell])<def.stages.length)lines.push(`Growth: ${s.zoneGrow?.[cell] || 0} / ${def.growTicks} healthy economy ticks`);
    if(zone?.abandoned)lines.push('Recovery: restore food/workers to raise zone health; road access is required for growth');
  } else lines.push('Zone state: not zoned');
  if (!entry && !b && !p && 'rg'.includes(g.use[cell]) && data.zones?.roadsConnect) {   // Tim 2026-11-05: linked roads only
    const reach = Object.values(data.zones.kinds).find(k => k.needs?.roadReach)?.needs.roadReach ?? 3;
    lines.push(createZones({ data }).linkedRoads(s)[cell]
      ? `\u0001Linked to the town hall: zones within ${reach} cells can grow`
      : `\u0002Not linked to the town hall: zones near it get no road access. Join it to the hall with more road or gate cells.`);
  }
  const bt=b?.stage==='built'&&!entry?data.buildings?.[b.type]:null;   // a placed farmhouse or workshop (camps gather by hand: no passive output)
  if(bt&&['farm','workshop'].includes(b.type)) {
    const sec=(data.cadenceTicks || 20)/20, n=v=>Number(v.toPrecision(3)), rate=v=>`${n(v/sec)}/s, ${n(v*3600/sec)}/hr`;
    if(bt.output)lines.push(`Output: ${Object.entries(bt.output).map(([r,v])=>`${r} ${rate(v)}`).join(' + ')} per worker, ${bt.jobs} jobs`);
    if(bt.recipe)lines.push(`Output: ${Object.entries(bt.recipe.out).map(([r,v])=>`${r} ${rate(v/bt.recipe.everyTicks)}`).join(' + ')} with a full crew of ${bt.jobs}`,`Uses: ${Object.entries(bt.recipe.in).map(([r,v])=>`${r} ${rate(v/bt.recipe.everyTicks)}`).join(' + ')}`);
  }
  const details=BUILD_DETAILS[b?.type || p?.type];if(details)lines.push(...details);
  return { title: townName(b?.type || p?.type || kind || ({ r: 'road', w: 'wall', g: 'gate' }[g.use[cell]])), lines, hall: b?.type === 'town_hall' && b.stage === 'built', stable: b?.type === 'stable' && b.stage === 'built' && s.owner != null, camp: b && b.stage === 'built' && (data.workers?.gatherBuildings || []).includes(b.type) && data.workers?.carts ? b : null };
}

// One floating tooltip for anything with a data-tip attribute inside `root` (frontier F4: panel, overview).
// Tips only go on things a player cannot guess or needs for a decision (Tim, 2026-11-02).
// Tip text is plain; a line starting with GOOD_LINE or WARN_LINE shows in green or amber.
export const GOOD_LINE = '\u0001', WARN_LINE = '\u0002';
function showTip(el, text) {
  if (!/[\u0001\u0002]/.test(text) || !el.appendChild) { el.textContent = text.replace(/[\u0001\u0002]/g, ''); return; }
  el.textContent = '';
  text.split('\n').forEach((line, i) => {
    const span = document.createElement('span');
    if (line[0] === GOOD_LINE) span.style.color = '#7fc27a';
    if (line[0] === WARN_LINE) span.style.color = '#d9a25a';
    span.textContent = (i ? '\n' : '') + line.replace(/^[\u0001\u0002]/, '');
    el.appendChild(span);
  });
}
export function bindTips(root) {
  let el = document.getElementById?.('fptip');
  if (!el) { el = document.createElement('div'); el.id = 'fptip'; el.hidden = true; document.body.appendChild(el); }
  const hide = () => { el.hidden = true; };
  root.addEventListener('mouseover', e => {
    const t = e.target.closest?.('[data-tip]'); if (!t) { hide(); return; }
    showTip(el, t.dataset.tip); el.style.visibility = 'hidden'; el.hidden = false;
    const r = t.getBoundingClientRect(), w = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w.width - 8))}px`;
    el.style.top = `${r.bottom + 6 + w.height < innerHeight ? r.bottom + 6 : Math.max(8, r.top - w.height - 6)}px`;
    el.style.visibility = '';
  });
  root.addEventListener('mouseleave', hide);
  return { hide };
}
