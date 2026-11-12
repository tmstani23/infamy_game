// Number keys (Tim 2026-11-12, rebindable): an open menu takes 1 to 9 first (fixed); otherwise the
// crew group actions select a group (group1..4) or make one (assignGroup1..4), on whatever keys they are bound to.
export function bindCrewNumberKeys({ onAction, onKeyFirst, crewInput, menus }) {
  onKeyFirst(event => {
    const m = /^Digit([1-9])$/.exec(event.code);
    const menu = m && menus.find(menu => menu.isOpen());
    if (!menu) return false;
    event.preventDefault(); menu.pick(Number(m[1]) - 1); return true;
  });
  for (let n = 1; n <= 4; n++) {
    onAction(`group${n}`, event => { if (event.metaKey) return; event.preventDefault(); crewInput.selectGroup(n); });
    onAction(`assignGroup${n}`, event => { if (event.metaKey) return; event.preventDefault(); crewInput.assignGroup(n); });
  }
}
