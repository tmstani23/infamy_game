// Frontier governor (frontier plan F2.7). A fixed rule list, checked top to bottom every
// data.governor.reviewTicks economy ticks (same style as sim/bot.js). Players, bots and the
// governor share one set of commands; the governor never orders armies or attacks.
//
// The governor MAINTAINS, it does not expand (Tim, 2026-11-02): rules 1-5 only write suggestions
// (settlement.suggestions, at most 3, each with a reason) that wait for the player's OK. On its own it
// always: repairs damaged buildings and rebuilds ruined ones on the same spot, keeps mood decent with
// auto taxes (rule 6), and writes report.doing / report.next. With settlement.autoBuild = true a suggestion
// within budget is queued and authorized by itself. Never more than one governor project at a time.
// Every rule fires only when its cause is the real limit, so it never loops.
// createGovernor({ state, data, world, economy, construction }) -> { review, run, approve }
import { residents } from './people.js';
import { placedRoom, upgradeCheck, startUpgrade, tierOf, nextTier, zoneCells } from './tiers.js';
import { isFull } from './storage.js';
import { workerCount } from './people.js';
const EPS = 1e-9;
const TAX_STEPS = ['low', 'normal', 'high'];

export function createGovernor({ state, data, world, economy, construction, zones = null, workers = null }) {
  const G = data.governor, f = () => state.frontier;

  function init(s) {
    if (s.gov) return;
    s.gov = { foodLast: s.stock.food, falling: 0, moodHigh: 0, window: 0, nBuilt: s.buildings.filter(b => b.stage === 'built').length };
    s.autoBuild = !!s.autoBuild;
    s.suggestions ||= [];
    s.budget = { ryo: s.budget?.ryo || 0, spent: s.budget?.spent || 0 };
  }

  const value = cost => Object.entries(cost).reduce((n, [r, v]) => n + v * (data.values[r] ?? 1), 0);
  const pending = (s, type) => s.projects.some(p => p.type === type && !p.replaces) || s.suggestions.some(x => x.type === type);
  const has = (s, type) => s.buildings.some(b => b.type === type);

  // L3.3: in grid towns house/farm/workshop are zones. The governor zones free untouched cells itself
  // (autoBuild) or suggests it; it waits while that kind is still growing, so it never over-zones.
  const zoneKind = (s, type) => (zones?.on(s) && data.zones.fromBuilding?.[type]) || null;
  function suggest(s, type, reason) {
    const zk = zoneKind(s, type);
    if (zk && zones.busy(s, zk)) return true;
    if (zk && s.autoBuild) { const r = zones.autoZone(s, zk); if (!r.ok) s.report.next = `${reason} (${r.reason})`; return true; }
    if (pending(s, type) || s.suggestions.length >= G.maxSuggestions) return true;   // already on the list: this rule has fired
    if (!zk && placedRoom(s, type, data) < 1) { s.report.next = `${reason} (town hall tier limit)`; return true; }   // B3
    s.suggestions.push({ type, reason });
    return true;
  }

  // Rules 1 to 5: returns true when one fired (checked top to bottom, the first that fires wins).
  function rules(s) {
    const idle = s.report.idle || 0, unfilled = s.report.unfilled || 0;
    // 1. food falling: a farm, but only if there are workers to run it
    if (s.gov.falling >= G.foodFallingReviews) {
      if (idle >= G.idleNeeded) return suggest(s, 'farm', 'Farm: food falling');
      s.report.next = 'Food falling, need workers';
    }
    // 2. housing full and food not falling: a house
    if (residents(s) >= s.housing && s.gov.falling === 0) return suggest(s, 'house', 'House: no free housing');
    const spare = idle >= G.idleNeeded && unfilled === 0;
    // 3. priority produce: the building for the scarcest of timber, stone and goods
    if (s.priority === 'produce' && spare) {
      const low = [['lumber_camp', 'timber'], ['quarry', 'stone'], ['workshop', 'goods']].sort((a, b) => s.stock[a[1]] - s.stock[b[1]])[0];
      return suggest(s, low[0], `${low[0].replace('_', ' ')}: ${low[1]} is low`);
    }
    // 4. priority fortify: a stockade if none
    if (s.priority === 'fortify' && !has(s, 'stockade')) return suggest(s, 'stockade', 'Stockade: fortify');
    // 5. priority trade: a workshop if none
    if (s.priority === 'trade' && spare && !has(s, 'workshop')) return suggest(s, 'workshop', 'Workshop: trade goods');
    return false;
  }

  // Repairs and rebuilds on the same spot, at normal cost; materials may be short, construction waits.
  function maintain(s) {
    if (s.projects.length) return;
    const b = s.buildings.find(x => x.stage !== 'built' && !s.projects.some(p => p.replaces === x.id));
    if (!b) return;
    construction.authorize(construction.queue(s.id, b.type, b.cell, { replaces: b.id }));
  }

  function promote(s) {
    if (!s.autoBuild || s.projects.length || !s.suggestions.length) return;
    const sg = s.suggestions.shift();
    const zk = zoneKind(s, sg.type);
    if (zk) { zones.autoZone(s, zk); return; }
    const pid = construction.queue(s.id, sg.type, null);
    if (!pid) return;
    const cost = value(construction.find(pid).project.cost);
    if (s.budget.spent + cost <= s.budget.ryo + EPS) { construction.authorize(pid); s.budget.spent += cost; }
  }

  // Rule 6: mood keeper, only on auto taxes. The player's locked level is never touched.
  function moodKeeper(s) {
    if (s.taxLocked) return;
    const i = TAX_STEPS.indexOf(s.taxLevel);
    s.gov.moodHigh = s.mood > G.moodHigh ? s.gov.moodHigh + 1 : 0;
    if (s.mood < G.moodLow && i > 0) { economy.setAutoTax(s.id, TAX_STEPS[i - 1]); s.gov.moodHigh = 0; }
    else if (s.gov.moodHigh >= G.moodHighReviews && i < TAX_STEPS.length - 1) { economy.setAutoTax(s.id, TAX_STEPS[i + 1]); s.gov.moodHigh = 0; }
  }

  function review(s) {
    init(s);
    if (s.autoBuild) workers?.assignIdle(s);
    const gov = s.gov;
    // a building finished or came back since the last review: give it time before judging food again
    const nBuilt = s.buildings.filter(b => b.stage === 'built').length;
    gov.falling = nBuilt === gov.nBuilt && s.stock.food < gov.foodLast - EPS ? gov.falling + 1 : 0;
    gov.nBuilt = nBuilt;
    gov.foodLast = s.stock.food;
    if(gov.falling===0 && (s.report.rate?.food || 0)>0)s.suggestions=s.suggestions.filter(x=>!(x.type==='farm' && x.reason==='Farm: food falling'));
    if (++gov.window >= G.budgetWindowReviews) { gov.window = 0; s.budget.spent = 0; }
    s.report.next = '';
    maintain(s);
    rules(s);
    promote(s);
    moodKeeper(s);
    const p = s.projects.find(x => x.authorized) || s.projects[0];
    s.report.doing = p ? `${p.replaces ? 'Rebuilding' : 'Building'} ${p.type.replace('_', ' ')}${p.paid ? ` (${p.progress}/${p.need})` : p.authorized ? ' (waiting for materials)' : ' (waiting for OK)'}` : 'Keeping the town running';
    if (!s.report.next && s.suggestions.length) s.report.next = s.suggestions[0].reason;
    upgradeHint(s);
  }

  // B3: when the town presses on a tier limit and can afford the next tier, say so. The upgrade itself is
  // the player's choice (town panel); towns owned by a bot clan with autoBuild upgrade on their own.
  function upgradeHint(s) {
    if (!data.tiers?.list || !upgradeCheck(s, data).ok) return;
    const t = tierOf(s, data), atLimit = (zones?.on(s) && Object.entries(t.cells || {}).some(([k, cap]) => zoneCells(s, data.zones.kinds[k]?.char) >= cap))
      || workerCount(s) >= t.workers || data.resources.some(r => isFull(s, data, r));
    if (!atLimit) return;
    if (s.autoBuild && s.owner && s.owner !== 'player') {
      startUpgrade(s, data, world);
      s.report.next = 'Upgrading the town hall';
    } else s.report.next = `Upgrade the town hall to ${nextTier(s, data).name}: the town is at its tier limits`;
  }

  // The player's OK on a suggestion (also used by the F2.8 command): queue it and authorize it.
  function approve(sid, index) {
    const s = world.settlement(sid);
    if (!s) return false;
    init(s);
    const sg = s.suggestions[index];
    if (!sg) return false;
    const zk = zoneKind(s, sg.type);
    if (zk) { if (!zones.autoZone(s, zk).ok) return false; s.suggestions.splice(index, 1); return true; }
    const pid = construction.queue(s.id, sg.type, null);
    if (!pid) return false;
    construction.authorize(pid);
    s.suggestions.splice(index, 1);
    return pid;
  }

  function run() {
    if (f().econTick % G.reviewTicks !== 0) return;
    for (const s of Object.values(f().settlements)) if (!s.capital) review(s);
  }

  return { review, run, approve };
}
