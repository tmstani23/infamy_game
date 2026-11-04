// Frontier economy (frontier plan F2.4, F2.5, F2.5b): production, food, jobs, growth, mood and taxes.
// createEconomy({ state, data, world }) -> { run, econTick, assignJobs, hit, setTax, setAutoTax }.
// Runs once per economy tick for every non-capital settlement. Every stock change goes through
// world.change (the one door), every pop change through world.changePop, always with a reason.
// No randomness: the same start always gives the same result. Nobody dies; unhappy people leave.
// Per-town state is plain data on the settlement record (mood, safety, taxLevel, ...), created
// lazily by init(), so older saves without these fields still run.
const EPS = 1e-9;

export function createEconomy({ state, data, world, zones = null, workers = null }) {
  const f = () => state.frontier;
  const rates = data.rates, M = data.mood;
  const type = b => data.buildings[b.type];
  const built = s => s.buildings.filter(b => b.stage === 'built');
  const wait = (s, what) => { if (!s.report.waiting.includes(what)) s.report.waiting.push(what); };

  function init(s) {
    if (s.mood !== undefined) return;
    s.safety = 100;
    s.taxLevel = 'normal';
    s.taxLocked = false;
    s.growthProgress = 0;
    s.growthFood0 = s.stock.food;
    s.growthBlock = null;
    s.lowReviews = 0;
    s.builders = 0;
    s.moodFactors = { food: 100, safety: 100, taxes: 100 };
    s.mood = 100;
    s.report.moodWhy = [];
    factors(s);
  }

  // ---- jobs (F2.5) ----
  const foodShort = s => s.stock.food < rates.food * s.pop * rates.foodShortTicks;

  // Fill order: farms when food is short, then builders for a paid project, then the town's
  // priority order, then anything left. Workers never exceed the population.
  function assignJobs(s) {
    init(s);
    let free = s.workforce = s.pop;
    const slots = built(s).filter(b => (type(b)?.jobs || 0) > 0 && !(workers?.has(s) && data.workers?.gatherBuildings.includes(b.type)));
    for (const b of s.buildings) b.workers = 0;
    const zs = zones?.on(s) ? zones.slots(s) : [];   // L3.3: zone jobs fill beside building jobs
    const fill = (pred, zpred = () => false) => {
      for (const b of slots) {
        if (!pred(b)) continue;
        const n = Math.min(type(b).jobs - b.workers, free);
        b.workers += n; free -= n;
      }
      for (const z of zs) {
        if (!zpred(z)) continue;
        const n = Math.min(z.jobs - z.workers, free);
        z.workers += n; free -= n;
      }
    };
    if (foodShort(s)) fill(b => type(b).output?.food, z => z.food);
    const wantBuilders = s.projects.some(p => p.paid && p.progress < p.need);
    s.builders = wantBuilders ? Math.min(rates.maxBuilders, free) : 0;
    free -= s.builders;
    for (const kind of data.priorities[s.priority] || []) fill(b => b.type === kind, z => z.as.includes(kind));
    fill(() => true, () => true);
    s.report.idle = free;
    s.report.unfilled = slots.reduce((n, b) => n + type(b).jobs - b.workers, 0) + zs.reduce((n, z) => n + z.jobs - z.workers, 0);
    if (zs.length) zones.setWorkers(s, zs);
  }

  // ---- site traits (E4): soil scales farms, nearby nodes enable and scale camps and quarries ----
  // Towns without traits (the fixtures) run at factor 1. All numbers: frontier.json traitEffects.
  function traitFactor(s, b) {
    const te = data.traitEffects;
    if (!te || !s.traits) return 1;
    let k = 1;
    if (data.buildings[b.type]?.output?.food) k *= te.soil?.[s.traits.soil] ?? 1;
    const kind = te.nodeKinds?.[b.type];
    if (kind) {
      const n = s.traits.nodes?.[kind] || 0;
      if (!n) { if ((te.noNodeFactor ?? 0) < 1) wait(s, `${kind} node`); k *= te.noNodeFactor ?? 0; }
      else k *= Math.min(te.nodeMax ?? 1, 1 + (te.nodeBonus ?? 0) * (n - 1));
    }
    return k;
  }

  // ---- production and food (F2.4) ----
  function produce(s) {
    for (const b of built(s)) {
      const t = type(b);
      if (!t || !b.workers) continue;
      if (t.output) { const k = traitFactor(s, b); for (const [res, per] of Object.entries(t.output)) world.change(s.id, res, per * b.workers * k, b.type); }
      if (t.recipe && f().econTick % (t.recipe.everyTicks || 1) === 0) {
        const runs = Math.floor(b.workers / (t.jobs || 1));   // one run per full crew
        for (let i = 0; i < runs; i++) {
          if (!Object.entries(t.recipe.in).every(([r, n]) => s.stock[r] + EPS >= n)) { wait(s, 'inputs'); break; }
          for (const [r, n] of Object.entries(t.recipe.in)) world.change(s.id, r, -n, b.type);
          for (const [r, n] of Object.entries(t.recipe.out)) world.change(s.id, r, n, b.type);
        }
      }
    }
  }

  // Founded towns never get stuck without timber: with no lumber camp, idle people gather a little by
  // hand up to a small cap (frontier.json forage; fixture towns are not affected). Placeholder, Tim to tune.
  function forage(s) {
    const fg = data.forage;
    if (!fg || workers?.has(s) || s.founded === undefined || built(s).some(b => b.type === 'lumber_camp')) return;
    const room = fg.cap - s.stock.timber, idle = s.report.idle || 0;
    if (room > 0 && idle > 0) world.change(s.id, 'timber', Math.min(room, fg.timberPerIdle * idle), 'forage');
  }

  function eat(s) {
    const need = rates.food * s.pop, have = s.stock.food;
    if (have + EPS >= need) { world.change(s.id, 'food', -Math.min(need, have), 'eat'); return; }
    if (have > 0) world.change(s.id, 'food', -have, 'eat');
    wait(s, 'food');
  }

  // ---- growth (F2.5) ----
  // +1 person per rates.growthTicks economy ticks (slower when mood is low) if there is housing and
  // food went up over the period. A blocked growth shows in report.waiting until it can happen.
  function grow(s) {
    const speed = Math.min(1, Math.max(M.growthMinSpeed, s.mood / M.growthFullAt));
    s.growthProgress += speed;
    if (s.growthProgress >= rates.growthTicks) {
      s.growthProgress = 0;
      const surplus = s.stock.food > s.growthFood0 + EPS;
      s.growthFood0 = s.stock.food;
      if (s.pop >= s.housing) s.growthBlock = 'housing';
      else if (!surplus) s.growthBlock = 'food';
      else { s.growthBlock = null; world.changePop(s.id, 1, 'growth'); }
    }
    if (s.growthBlock === 'housing' && s.pop < s.housing) s.growthBlock = null;
    if (s.growthBlock) wait(s, s.growthBlock);
  }

  // ---- mood and taxes (F2.5b) ----
  function factors(s) {
    const eating = rates.food * s.pop;
    const food = s.report.waiting.includes('food') ? M.foodFactor.out
      : s.stock.food < eating * M.foodLowTicks ? M.foodFactor.low : M.foodFactor.ok;
    s.moodFactors = { food, safety: s.safety, taxes: M.taxFactor[s.taxLevel] };
    const w = M.weights;
    s.mood = s.moodFactors.food * w.food + s.moodFactors.safety * w.safety + s.moodFactors.taxes * w.taxes;
  }

  const WHY = {
    food: v => v <= 0 ? ['Food has run out', 'More farms or workers'] : ['Food is running low', 'More farms'],
    safety: () => ['Recently raided', 'Station guards'],
    taxes: () => ['Taxes high', 'Lower taxes']
  };
  function why(s) {
    const worst = Object.entries(s.moodFactors).filter(([, v]) => v < 70).sort((a, b) => a[1] - b[1]).slice(0, 3);
    s.report.moodWhy = worst.map(([k, v]) => { const [text, hint] = WHY[k](v); return { factor: k, text, hint }; });
  }

  // One review: compute mood from the three factors, collect taxes, apply gentle decline, let
  // safety recover a little.
  function review(s) {
    factors(s);
    const tax = rates.tax[s.taxLevel] * s.pop * (s.mood / 100);
    if (tax > 0) world.change(s.id, 'ryo', tax, 'tax');
    if (s.mood < M.declineBelow) {
      s.lowReviews++;
      if (s.lowReviews >= M.declineReviews && s.pop > M.floorPop) world.changePop(s.id, -1, 'leave');
    } else s.lowReviews = 0;
    why(s);
    s.safety = Math.min(100, s.safety + M.safetyRecover);
  }

  // A raid or attack on the town: safety drops (F3.6 / F6 call this).
  function hit(sid, amount = M.raidSafetyHit) {
    const s = world.settlement(sid); init(s);
    s.safety = Math.max(0, s.safety - amount);
  }
  // Player lock: 'low' | 'normal' | 'high', or 'auto' to hand it back to the governor.
  function setTax(sid, level) {
    const s = world.settlement(sid); init(s);
    if (level === 'auto') { s.taxLocked = false; return true; }
    if (!rates.tax[level]) return false;
    s.taxLevel = level; s.taxLocked = true; return true;
  }
  // The governor's change: ignored while the player has locked a level.
  function setAutoTax(sid, level) {
    const s = world.settlement(sid); init(s);
    if (s.taxLocked || !rates.tax[level]) return false;
    s.taxLevel = level; return true;
  }

  function econTick(s) {
    init(s);
    s.report.waiting = [];
    if (zones?.on(s)) zones.migrate(s);   // L3.3: old house/farm/workshop buildings become zones
    assignJobs(s);
    const before = { ...s.stock };
    produce(s);
    if (zones?.on(s)) zones.tick(s);      // L3.3: zone health, growth, output and housing
    forage(s);
    eat(s);
    // net stock change per second from production and eating (not spending), for the town panel's "how long" hints
    const secs = (data.cadenceTicks || 20) / 20;
    const gathered=s.workerIncome || {};
    s.report.rate = Object.fromEntries(Object.keys(s.stock).map(r => [r, (s.stock[r] - before[r] + (gathered[r] || 0)) / secs]));
    s.workerIncome={};
    grow(s);
    if (f().econTick % M.reviewTicks === 0) review(s);
  }

  // called by the frontier hub each economy tick
  function run() {
    for (const s of Object.values(f().settlements)) if (!s.capital) econTick(s);
  }

  return { econTick, run, assignJobs, hit, setTax, setAutoTax };
}
