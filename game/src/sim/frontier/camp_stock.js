// The war camp's own stock (timber, stone): a separate pot from town stock, which only world.js changes.
// Every write to camp.stock goes through here (tools/frontier_lint.mjs owner rule).
export function addCampStock(camp, res, n) {
  camp.stock ||= {};
  camp.stock[res] = Math.round(((camp.stock[res] || 0) + n) * 100) / 100;
}
