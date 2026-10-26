import { sectorOutlines, hexCells } from './deployment_map_geometry.js';

export function createDeploymentMapOverlay({ game, clan, data, selectedSector, onPick, onHover }) {
  const bounds = game.deployment.cellGrid().bounds;
  const sectors = sectorOutlines(game.deployment.cellGrid(), game.state.deployment.sectors);
  const byId = new Map(sectors.map(s => [s.id, s]));
  const hexes = hexCells(bounds, (x, z) => game.deployment.sectorAt(x, z));
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let labels = [], project = null;
  const path = (ctx, toMap, points) => {
    ctx.beginPath(); points.forEach(([x, z], i) => { const p = toMap(x, z); i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
  };
  function ground({ ctx, toMap, now, size }) {
    project = toMap;
    const seconds = motion?.matches ? 0 : now / 1000, snapshot = data.get();
    const status = new Map(snapshot.sectors.map(s => [s.id, s]));
    ctx.save();
    path(ctx, toMap, [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]]);
    ctx.closePath(); ctx.clip();
    for (const h of hexes) {
      const sector = byId.get(h.sector), presence = status.get(h.sector)?.presence || [];
      path(ctx, toMap, h.points); ctx.closePath();
      if (presence.length) {
        // Split shared presence visually; no clan owns a deployment sector.
        ctx.save(); ctx.clip();
        const p = h.points.map(([x, z]) => toMap(x, z)), x = Math.min(...p.map(p => p[0])), y = Math.min(...p.map(p => p[1]));
        const width = Math.max(...p.map(p => p[0])) - x, height = Math.max(...p.map(p => p[1])) - y;
        ctx.globalAlpha = h.sector === selectedSector() ? .16 : .1;
        presence.forEach((c, i) => { ctx.fillStyle = c.color; ctx.fillRect(x + width * i / presence.length, y, width / presence.length + .2, height); });
        ctx.restore();
      }
      const anchor = sector?.anchor || game.state.deployment.village || { x: 0, z: 0 };
      const wave = (1 + Math.cos(Math.hypot(h.x - anchor.x, h.z - anchor.z) / 19 - seconds * Math.PI * 2 / 14)) / 2;
      const ripple = motion?.matches ? 0 : wave ** 5 * .22;
      const color = sector?.color || (h.sector === 'village' ? '#ae88e4' : '#7c8b86');
      ctx.globalAlpha = sector || h.sector === 'village' ? .28 + ripple : .1;
      ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 4 * (.5 + wave * .5);
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    for (const sector of sectors) for (const loop of sector.loops) {
      path(ctx, toMap, loop); ctx.closePath();
      ctx.lineWidth = 5.5; ctx.strokeStyle = '#0b1318'; ctx.stroke();
      ctx.lineWidth = sector.id === selectedSector() ? 3.2 : 2.5; ctx.strokeStyle = sector.color;
      ctx.globalAlpha = sector.id === selectedSector() && !motion?.matches ? .88 + .07 * Math.sin(seconds * 1.2) : .88;
      ctx.shadowColor = sector.color; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    const village = game.state.deployment.village;
    if (village) {
      const points = Array.from({ length: 64 }, (_, i) => [village.x + Math.cos(i * Math.PI / 32) * village.radius, village.z + Math.sin(i * Math.PI / 32) * village.radius]);
      path(ctx, toMap, points); ctx.closePath(); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#c0a2ec'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.font = '500 11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#c5b48c';
    ctx.fillText('SECTOR NETWORK', 16, size - 14); ctx.restore();
  }
  function markers({ ctx, toMap, size }) {
    const snapshot = data.get(), selected = selectedSector();
    ctx.save();
    for (const t of snapshot.transfers) {
      path(ctx, toMap, [[t.from.x, t.from.z], [t.to.x, t.to.z]]);
      ctx.strokeStyle = t.blocked ? '#e48665' : '#d6bd83'; ctx.globalAlpha = .65; ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
      const p = toMap(t.to.x, t.to.z); ctx.beginPath(); ctx.arc(...p, 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const c of snapshot.contacts) {
      const p = toMap(c.x, c.z), color = game.state.clans[c.owner]?.color || '#d67b69';
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.globalAlpha = c.live ? .9 : Math.max(.18, .65 * (1 - c.age / 10));
      if (!c.live) ctx.setLineDash([2, 3]);
      ctx.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
      if (c.live) ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
      if (!c.live && c.direction) {
        const end = toMap(c.x + c.direction.x * 4, c.z + c.direction.z * 4), angle = Math.atan2(end[1] - p[1], end[0] - p[0]);
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...end); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(...end); ctx.lineTo(end[0] - Math.cos(angle - .5) * 4, end[1] - Math.sin(angle - .5) * 4); ctx.lineTo(end[0] - Math.cos(angle + .5) * 4, end[1] - Math.sin(angle + .5) * 4); ctx.closePath(); ctx.fill();
      }
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    for (const e of snapshot.own.filter(e => e.interior && Number.isFinite(e.x))) {
      const [u, v] = toMap(e.x, e.z); ctx.fillStyle = game.state.clans[clan].color; ctx.strokeStyle = '#f2dfaa'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(u, v - 4); ctx.lineTo(u + 4, v); ctx.lineTo(u, v + 4); ctx.lineTo(u - 4, v); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const picked = snapshot.sectors.find(s => s.id === selected);
    if (picked) for (const [kind, point] of [['Objective', picked.objective], ['Fallback', picked.fallback]]) {
      const [u, v] = toMap(point.x, point.z); ctx.strokeStyle = kind === 'Objective' ? '#e9c27a' : '#b9c5d1'; ctx.lineWidth = 1.3;
      if (kind === 'Fallback') ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(u, v, kind === 'Objective' ? 7 : 10, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    labels = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px system-ui';
    for (const sector of sectors) {
      const s = snapshot.sectors.find(s => s.id === sector.id); if (!s) continue;
      const name = sector.name.toUpperCase(), anchor = toMap(sector.anchor.x, sector.anchor.z);
      const width = Math.min(size - 16, Math.max(100, ctx.measureText(name).width + 18));
      let x = Math.max(8, Math.min(size - width - 8, anchor[0] - width / 2)), y = Math.max(8, Math.min(size - 55, anchor[1] - 34));
      for (let tries = 0; tries < 8 && labels.some(r => x < r.x + r.width + 4 && x + width + 4 > r.x && y < r.y + r.height + 4 && y + 43 > r.y); tries++) y = y + 47 < size - 50 ? y + 47 : y - 47;
      labels.push({ id: sector.id, x, y, width, height: 39 });
      ctx.beginPath(); ctx.moveTo(...anchor); ctx.lineTo(x + width / 2, y + 39); ctx.strokeStyle = sector.color; ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#0b1118ed'; ctx.fillRect(x, y, width, 39); ctx.fillStyle = sector.color; ctx.fillRect(x, y, width, sector.id === selected ? 2.5 : 1.5);
      ctx.fillStyle = '#f0e7d2'; ctx.font = '600 12px system-ui'; ctx.fillText(name, x + width / 2, y + 13);
      ctx.fillStyle = '#b9bec6'; ctx.font = '11px system-ui'; ctx.fillText(`${s.count}/3 · ${s.status}`, x + width / 2, y + 28);
    }
    const village = game.state.deployment.village;
    if (village) {
      const [u, v] = toMap(village.x, village.z), yours = game.state.clans[clan].kind === 'ninja';
      ctx.font = '600 11px system-ui'; ctx.strokeStyle = '#080c10'; ctx.lineWidth = 4; ctx.fillStyle = '#dac5f3';
      const name = yours ? 'VILLAGE / HQ' : 'SHINOBI VILLAGE';
      ctx.strokeText(name, u, v - 6); ctx.fillText(name, u, v - 6);
      if (yours) {
        const count = game.deployment.counts(clan).home;
        ctx.font = '11px system-ui'; ctx.strokeText(`${count} HQ reserves`, u, v + 10); ctx.fillText(`${count} HQ reserves`, u, v + 10);
      }
    }
    ctx.restore();
  }
  function sectorAt(p) {
    if (!p) return null;
    if (project) {
      const [u, v] = project(p.x, p.z), label = labels.find(r => u >= r.x && u <= r.x + r.width && v >= r.y && v <= r.y + r.height);
      if (label) return label.id;
    }
    const id = game.deployment.sectorAt(p.x, p.z);
    return byId.has(id) ? id : null;
  }
  return { ground, markers, sectors,
    hover(p, e) { const id = sectorAt(p); onHover(id && data.get().sectors.find(s => s.id === id), e); return !!id; },
    pick(p) { const id = sectorAt(p); if (id) onPick(id, p); return !!id; } };
}
