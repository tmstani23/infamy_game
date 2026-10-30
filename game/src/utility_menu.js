// Existing buttons keep their handlers and live labels. Only presentation moves.
const ICONS = { deploymentbtn:'▧',characterbtn:'♙',settingsbtn:'⚙',unstuckbtn:'⌂',pausebtn:'Ⅱ',mutebtn:'♫',fullscreenbtn:'⛶',ctlbtn:'?',daynight:'☀' };
export function createUtilityMenu({ root, anchor, buttons, win = window }) {
  root.setAttribute('aria-label','Game menu');
  for (const b of buttons) { b.classList.add('utility-button');b.dataset.icon=ICONS[b.id]||'•';root.appendChild(b); }
  let positionKey = null;
  function update(force = false) {
    for (const b of buttons) {
      const label = b.textContent + (b.title ? ` · ${b.title}` : '');
      if(b.getAttribute('aria-label')!==label)b.setAttribute('aria-label',label);
      if(b.id==='pausebtn')b.dataset.icon=b.getAttribute('aria-pressed')==='true'?'▶':'Ⅱ';
    }
    if(root.dataset.layoutPinned==='true')return;
    const key=[win.innerWidth,win.innerHeight,anchor.style.cssText,root.dataset.layoutPinned].join('|');
    if(!force&&key===positionKey)return;positionKey=key;
    const r=anchor.getBoundingClientRect(),w=root.offsetWidth,h=root.offsetHeight;
    root.style.left=`${Math.max(8,Math.min(win.innerWidth-w-8,r.left-w-12))}px`;
    root.style.top=`${Math.max(8,Math.min(win.innerHeight-h-8,r.bottom-h))}px`;
  }
  update();return { update };
}
