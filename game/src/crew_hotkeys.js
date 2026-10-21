// Menu shortcuts take priority over local RTS control groups.
export function bindCrewNumberKeys({ onKey, crewInput, menus }) {
  for (let i = 0; i < 9; i++) onKey(`Digit${i + 1}`, event => {
    const menu = menus.find(menu => menu.isOpen());
    if (menu) { event.preventDefault(); menu.pick(i); return; }
    if (i >= 4 || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (event.ctrlKey) crewInput.assignGroup(i + 1);
    else crewInput.selectGroup(i + 1);
  });
}
