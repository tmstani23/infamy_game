// Game settings (data/settings.json): the numbers picked before a game, laid over the
// detail data files. Returns new copies; the files passed in are not changed.
// In multiplayer the host's settings go through this same function on the server.
const copy = o => (o ? JSON.parse(JSON.stringify(o)) : o);
const set = (obj, key, v) => { if (obj && v !== undefined) obj[key] = v; };

export function applySettings({ units, civilians, bandits, police }, s = {}) {
  units = copy(units); civilians = copy(civilians); bandits = copy(bandits); police = copy(police);
  const ur = units?.rules, c = s.costs || {}, crew = s.crew || {}, heat = s.heat || {};
  set(ur, 'startRyo', c.startRyo);
  set(ur, 'priceStepPerCrew', c.priceStepPerCrew);
  set(ur, 'recoverCostShare', c.recoverShare);
  set(ur, 'reviveNowCostShare', c.reviveNowShare);
  for (const [type, price] of Object.entries(c.hire || {})) set(units?.types?.[type], 'price', price);
  set(ur, 'baseCap', crew.baseCap);
  set(ur, 'heroRespawnSeconds', crew.heroRespawnSeconds);
  if (ur?.capPerBusiness && crew.capPerBusiness !== undefined) for (const k in ur.capPerBusiness) ur.capPerBusiness[k] = crew.capPerBusiness;
  if (ur && heat.townsfolk) ur.civilianHeat = { ...ur.civilianHeat, ...heat.townsfolk };
  set(ur, 'heatCoolSeconds', heat.coolSeconds);
  if (ur && s.hideout) { const { _note, ...h } = s.hideout; ur.hideout = { ...ur.hideout, ...h }; }
  if (ur?.raid && s.warLantern?.price !== undefined) ur.raid = { ...ur.raid, lanternPrice: s.warLantern.price };
  if (ur && s.businesses) {
    ur.businesses = ur.businesses || {};
    for (const [kind, v] of Object.entries(s.businesses)) {
      if (kind.startsWith('_')) continue;
      const { crewSlots, ...rest } = v;
      ur.businesses[kind] = { ...ur.businesses[kind], ...rest };
      if (crewSlots !== undefined) (ur.capPerBusiness ||= {})[kind] = crewSlots;    // crew it adds to the cap
    }
  }

  // townsfolk: one total, shared out by each type's count in civilians.json (largest remainder)
  const total = s.townsfolk?.total;
  if (civilians?.types && total !== undefined) {
    const types = Object.values(civilians.types), sum = types.reduce((n, t) => n + (t.count || 0), 0);
    if (sum > 0) {
      const raw = types.map(t => (t.count || 0) * total / sum);
      types.forEach((t, i) => { t.count = Math.floor(raw[i]); });
      let left = total - types.reduce((n, t) => n + t.count, 0);
      raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { types[i].count++; left--; } });
    }
  }

  set(bandits?.rules, 'maxOut', s.bandits?.maxOut);
  set(bandits?.rules, 'perNight', s.bandits?.perNight);

  const pr = police?.rules, p = s.police || {};
  if (pr?.tiers && p.officersPerTier) pr.tiers.forEach((t, i) => set(t, 'officers', p.officersPerTier[i]));
  set(pr, 'heroJailSeconds', p.heroJailSeconds);
  set(pr, 'bribeHeat', p.bribeHeat);
  set(pr, 'bribePerTier', p.bribePerTier);
  set(pr, 'bailShare', p.bailShare);
  set(pr, 'hitPoliceHeat', heat.hitPolice);

  return { units, civilians, bandits, police, dayNight: s.dayNight || null };
}
