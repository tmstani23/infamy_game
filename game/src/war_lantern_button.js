// Preview only; the existing authoritative business command checks again.
export function createWarLanternButton({ button, game, heroId, send }) {
  function preview() {
    const h=game.state.entities[heroId],clan=game.state.clans[h?.owner];
    if(!h||!clan)return {ok:false,why:'Your hero is unavailable'};
    let b=null,distance=Infinity;for(const candidate of Object.values(game.state.businesses)){if(!candidate.ring)continue;const d=Math.hypot(h.x-candidate.ring[0],h.z-candidate.ring[1]);if(d<distance){distance=d;b=candidate;}}
    if(h.place!=='street'||!b||Math.hypot(h.x-b.ring[0],h.z-b.ring[1])>3)return {ok:false,why:clan.lanterns?'Stand at a rival business entrance to plant a raid':'Buy a War Lantern at the moneylender'};
    const action=b.kind==='moneylender'?'lantern':'raid';
    const can=action==='lantern'?game.businesses.canBuyLantern(heroId,b.id):game.businesses.canRaid(heroId,b.id);
    return {...can,action,business:b.id};
  }
  button.addEventListener('click',()=>{const p=preview();if(p.ok)send({id:heroId,type:'business',action:p.action,business:p.business});button.blur();});
  function update(){const p=preview();button.disabled=!p.ok;button.textContent=p.action==='lantern'?'Buy Lantern':'War Lantern';button.title=p.ok?p.action==='lantern'?`Buy War Lantern · ${p.price} ryo`:'Plant War Lantern · start a raid':p.why;button.setAttribute('aria-label',button.textContent+' · '+button.title);}
  update();return {update};
}
