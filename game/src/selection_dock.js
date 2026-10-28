// Move the existing live cards into the active menu. Reuse their handlers/state
// and restore their original HUD parent when both menus close.
export function createSelectionDock({ panels, destination, onRestore = () => {} }) {
  const homes=panels.map(el=>({el,parent:el.parentNode,next:el.nextSibling}));
  let current=null;
  return { update() {
    const next=destination();
    if(next!==current){
      if(current)current.hidden=true;
      for(const home of next?homes:[...homes].reverse()){
        const {el,parent,next:sibling}=home;
        el.classList.toggle('hud-docked',!!next);
        if(next)next.appendChild(el);
        else parent.insertBefore(el,sibling?.parentNode===parent?sibling:null);
      }
      if(current&&!next)onRestore();
      current=next;
    }
    if(current)current.hidden=panels.every(el=>el.hidden);
  }};
}
