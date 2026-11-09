// Frontier economy (frontier plan F2.4, F2.5, F2.5b): production, food, jobs, growth, mood and taxes.
// createEconomy({ state, data, world }) -> { run, econTick, assignJobs, hit, setTax, setAutoTax, setMarketKeep }.
// Runs once per economy tick for every non-capital settlement. Every stock change goes through
// world.change (the one door), every pop change through world.changePop, always with a reason.
// No randomness: the same start always gives the same result. Nobody dies; unhappy people leave.
// Per-town state is plain data on the settlement record (mood, safety, taxLevel, ...), created
// lazily by init(), so older saves without these fields still run.
import { residents } from './people.js';
import { isFull, storageCap, defaultKeep } from './storage.js';
import { upgradeTick } from './tiers.js';
import { noteArrival, noteTierUp } from './arrivals.js';
import { foldFlow } from './flow.js';
const EPS = 1e-9;

export function createEconomy({ state, data, world, zones = null, workers = null, trade = {} }) {
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
  const foodShort = s => s.stock.food < rates.food * residents(s) * rates.foodShortTicks;

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
          const full = Object.keys(t.recipe.out).find(r => isFull(s, data, r));
          if (full) { wait(s, `${full} store full`); break; }
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
    const need = rates.food * residents(s), have = s.stock.food;
    s.foodShortage=have+EPS<need;
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
      const surplus = s.stock.food > s.growthFood0 + EPS || isFull(s, data, 'food');   // B2: a full store counts as surplus
      s.growthFood0 = s.stock.food;
      if (residents(s) >= s.housing) s.growthBlock = 'housing';
      else if (!surplus) s.growthBlock = 'food';
      else { s.growthBlock = null; world.changePop(s.id, 1, 'growth'); noteArrival(s, data, state); }   // B7: someone walks in
    }
    if (s.growthBlock === 'housing' && residents(s) < s.housing) s.growthBlock = null;
    if (s.growthBlock === 'food' && (s.report.rate?.food || 0)>EPS) s.growthBlock=null;
    if (s.growthBlock) wait(s, s.growthBlock==='food'?'population growth surplus':s.growthBlock);
    // B7: what the town panel says about growth (seconds until the next person, or what blocks it)
    const secs = (data.cadenceTicks || 20) / 20;
    s.report.growth = residents(s) >= s.housing ? { block: 'housing', text: 'Housing full: more housing lets the town grow' }
      : s.growthBlock === 'food' ? { block: 'food', text: 'Food not rising: more farms let the town grow' }
      : { block: null, eta: Math.ceil((rates.growthTicks - s.growthProgress) / Math.max(speed, 1e-9) * secs), text: '' };
    if (!s.report.growth.block) s.report.growth.text = `Next person in ${s.report.growth.eta}s${speed < 1 ? ' (slowed by low mood)' : ''}`;
  }

  // ---- mood and taxes (F2.5b) ----
  function factors(s) {
    const eating = rates.food * residents(s);
    const food = s.foodShortage ? M.foodFactor.out
      : s.stock.food < eating * M.foodLowTicks ? M.foodFactor.low : M.foodFactor.ok;
    s.moodFactors = { food, safety: s.safety, taxes: M.taxFactor[s.taxLevel] };
    const w = M.weights;
    s.mood = s.moodFactors.food * w.food + s.moodFactors.safety * w.safety + s.moodFactors.taxes * w.taxes;
    if (s.goodsShort) s.mood *= data.upkeep?.goodsShortMood ?? 1;   // B5: houses want goods to level up
  }

  const WHY = {
    food: v => v <= 0 ? ['Food has run out', 'More farms or workers'] : ['Food is running low', 'More farms'],
    safety: () => ['Recently raided', 'Station guards'],
    taxes: () => ['Taxes high', 'Lower taxes']
  };
  function why(s) {
    const round=n=>Math.round(n*100)/100,normalFood=rates.food*residents(s)*M.foodLowTicks,missing=Math.max(0,normalFood-s.stock.food);
    const rate=s.report.rate?.food || 0;
    s.report.statusTips={
      food:`Food: ${round(s.stock.food)} in stock. Normal reserve: ${round(normalFood)}. Missing: ${round(missing)}. Consumption: ${round(rates.food*residents(s))} per economy tick. Net change: ${round(rate)} per second.${missing && rate>0?' About '+Math.ceil(missing/rate)+' seconds to recover.':''}`,
      housing:`Housing: ${s.pop} people + ${residents(s)-s.pop} workers / ${s.housing} capacity. Need ${Math.max(0,residents(s)+1-s.housing)} additional capacity for the next person.`,
      safety:`Safety: ${round(s.safety)} / 100. Normal status starts at 70; missing ${round(Math.max(0,70-s.safety))} points. Recovers ${M.safetyRecover} points per review.`,
      taxes:`Taxes: ${s.taxLevel}. Tax mood factor: ${M.taxFactor[s.taxLevel]} / 100. Normal status starts at 70. ${Object.entries(M.taxFactor).filter(([,v])=>v>=70).map(([k,v])=>`${k}: ${v}`).join('; ')}.`,
      builders:`Builders: ${s.builders || 0}. Need at least 1 available townsperson; ${s.report.idle || 0} currently idle.`,
      'population growth surplus':`Population growth needs a positive food surplus across its growth period. Current food: ${round(s.stock.food)}; comparison stock: ${round(s.growthFood0)}; net change: ${round(rate)} per second.`,
      'needs road':`Road access is missing for ${Object.values(s.zones || {}).reduce((n,z)=>n+(z.noRoad || 0),0)} zoned cells. Zones grow only with a road or gate within ${data.zones?.kinds?.housing?.needs?.roadReach ?? 3} cells that links back to the town hall through other road or gate cells.`
    };
    const worst = Object.entries(s.moodFactors).filter(([, v]) => v < 70).sort((a, b) => a[1] - b[1]).slice(0, 3);
    s.report.moodWhy = worst.map(([k, v]) => { const [text, hint] = WHY[k](v); return { factor: k, text, hint, tip:s.report.statusTips[k]+'\n'+hint }; });
  }

  // One review: compute mood from the three factors, collect taxes, apply gentle decline, let
  // safety recover a little.
  function review(s) {
    factors(s);
    // Economy pass 2 C (Tim 2026-11-05): employed townsfolk pay full tax, idle ones pay idleTaxShare.
    const idle = Math.min(s.pop, s.report?.idle || 0), share = rates.idleTaxShare ?? 1;
    const tax = rates.tax[s.taxLevel] * (s.pop - idle + idle * share) * (s.mood / 100);
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
    if (upgradeTick(s)) { s.tierUpAt = f().econTick; noteTierUp(s, state); }   // B3: town hall upgrade finished (alerts announce it)
    // B2: caps for the town panel (null = no cap); derived each economy tick, never read back by rules.
    s.storageCaps = Object.fromEntries(data.resources.map(r => { const c = storageCap(s, data, r); return [r, Number.isFinite(c) ? c : null]; }));
    if (zones?.on(s)) zones.migrate(s);   // L3.3: old house/farm/workshop buildings become zones
    assignJobs(s);
    const before = { ...s.stock };
    produce(s);
    if (zones?.on(s)) zones.tick(s);      // L3.3: zone health, growth, output and housing
    forage(s);
    eat(s);
    market(s);
    // net stock change per second from production and eating (not spending), for the town panel's "how long" hints
    const secs = (data.cadenceTicks || 20) / 20;
    const gathered=s.workerIncome || {};
    s.report.rate = Object.fromEntries(Object.keys(s.stock).map(r => [r, (s.stock[r] - before[r] + (gathered[r] || 0)) / secs]));
    s.workerIncome={};
    foldFlow(s, secs);   // Usage page per-minute flows
    grow(s);
    factors(s);why(s); // report recovery now; taxes and population reviews keep their normal cadence
    if (f().econTick % M.reviewTicks === 0) review(s);
  }

  // Economy pass 2 D (Tim 2026-11-05): a built market sells goods above the keep level for ryo.
  function market(s) {
    const mk = data.market;
    if (!mk || !s.buildings.some(b => b.type === 'market' && b.stage === 'built')) return;
    const keep = s.marketKeep ?? defaultKeep(s, data, 'goods'), sell = Math.min(mk.perTick, (s.stock.goods || 0) - keep);
    if (sell <= EPS) return;
    world.change(s.id, 'goods', -sell, 'market');
    // C4: each Influence tier of the owner raises the export price; sales count as frontier trade
    world.change(s.id, 'ryo', sell * mk.price * (s.owner && trade.exportFactor ? trade.exportFactor(s.owner) : 1), 'market');
    if (s.owner) trade.sold?.(s.owner, sell);
  }
  function setMarketKeep(sid, keep) {
    const s = world.settlement(sid); init(s);
    s.marketKeep = keep; return true;
  }

  // called by the frontier hub each economy tick
  function run() {
    for (const s of Object.values(f().settlements)) if (!s.capital) econTick(s);
  }

  return { econTick, run, assignJobs, hit, setTax, setAutoTax, setMarketKeep };
}
