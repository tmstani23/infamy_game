import {ITEMS, SHOP_ITEM_IDS, CONSUMABLES, INVENTORY_SLOTS} from './sim/gear_catalog.js';
import {itemOf, itemArt, detailHtml} from './item_detail.js';

// Blacksmith (Tim 2026-11-01): Buy / Sell tabs, even tiles, click to select (hover previews),
// a detail pane with stats and the equipped effect, then a confirm button sends the command.
export function createShopUI({game,heroId,view,send,onOpen=()=>{},onClose=()=>{},hidden=()=>false}){
  const root=document.createElement('section');root.id='blacksmithshop';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Blacksmith shop');
  root.innerHTML='<div class="shop-window"><header><div><small>BLACKSMITH · FIELD OUTFITTER</small><h2>Blacksmith</h2></div><div class="shop-tabs" role="tablist"><button type="button" role="tab" data-tab="buy">Buy</button><button type="button" role="tab" data-tab="sell">Sell</button></div><button type="button" class="shop-close" aria-label="Close shop">✕</button></header><div class="shop-body"><div class="shop-grid"></div><aside class="shop-detail"><div class="detail-body"></div><div class="shop-confirm"><button type="button" class="shop-go"></button><button type="button" class="shop-cancel">Cancel</button></div><p class="shop-why"></p></aside></div><footer><span class="shop-money"></span><button type="button" class="shop-claim"></button><span class="inventory-notice" role="status"></span><span class="shop-help">Click an item to see it, then confirm</span></footer></div>';
  const icon=document.createElement('button');icon.id='shopmarker';icon.textContent='⚒ Shop';icon.title='Blacksmith — approach to buy and sell (Space)';
  document.body.append(root,icon);const $=s=>root.querySelector(s),put=(el,v)=>{if(el.textContent!==v)el.textContent=v;};let open=false,focus,tab='buy',picked=null,hover=null;
  const hero=()=>game.state.entities[heroId],command=(action,extra={})=>send({id:heroId,type:'item',action,...extra});
  const stockIds=[...SHOP_ITEM_IDS,'bandage','war_lantern'];
  const tile=key=>{const b=document.createElement('button');b.type='button';b.className='shop-tile';b.dataset.key=key;
    b.innerHTML='<small class="tile-slot"></small><span class="tile-art"></span><b class="tile-name"></b><span class="tile-price"></span>';
    b.addEventListener('click',()=>{picked=picked===key?null:key;render();});
    b.addEventListener('mouseenter',()=>{if(hover!==key){hover=key;render();}});   // leaving a tile keeps its preview until the pointer leaves the grid (no flicker between tiles)
    b.addEventListener('focus',()=>{hover=key;render();});b.addEventListener('blur',()=>{if(hover===key){hover=null;render();}});
    return b;};
  const tiles={buy:stockIds.map(tile),sell:Array.from({length:INVENTORY_SLOTS},(_,i)=>tile(String(i)))};
  $('.shop-grid').addEventListener('mouseleave',()=>{if(hover!=null){hover=null;render();}});
  $('.shop-tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]')?.dataset.tab;if(t&&t!==tab){tab=t;picked=hover=null;layout();render();}});
  function layout(){const grid=$('.shop-grid');grid.replaceChildren(...tiles[tab]);
    for(const b of root.querySelectorAll('[data-tab]')){const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));}}
  // what a key means on the current tab: {id, price, ok, why}
  function entry(key){
    const e=hero(),clan=game.state.clans[e?.owner],inv=clan?.inventory;if(!inv)return null;
    if(tab==='sell'){const id=inv.bag[+key],item=ITEMS[id];if(!item)return {id:null};
      return {id,label:`${item.sell??0} ryo`,ok:!!item.sell,why:item.sell?'':'This keepsake cannot be sold',verb:`Sell · ${item.sell} ryo`};}
    const id=key,price=ITEMS[id]?.buy||(id==='bandage'?CONSUMABLES.bandage.buy:game.businesses.raidRules.lanternPrice);
    const why=ITEMS[id]?(!inv.bag.includes(null)?'Your bag is full':''):id==='bandage'?((inv.bandages||0)>=2?'You carry the most bandages (2)':'')
      :clan.kind==='ninja'?'Shinobi cannot buy War Lanterns':(clan.lanterns||0)>=(game.businesses.raidRules.lanternCarry||1)?'You already carry a War Lantern':'';
    const poor=clan.ryo<price?`Need ${price} ryo`:'';
    return {id,label:`${price} ryo${id==='bandage'?` · ${inv.bandages||0}/2`:''}`,ok:!why&&!poor,why:why||poor,verb:`Buy · ${price} ryo`,price};
  }
  function render(){
    if(!open)return;const e=hero(),inv=game.state.clans[e?.owner]?.inventory;if(!inv)return;
    for(const b of tiles[tab]){const key=b.dataset.key,en=entry(key),item=itemOf(en?.id);
      b.classList.toggle('empty',!item);b.classList.toggle('picked',key===picked);b.classList.toggle('green-item',item?.rarity==='green');
      b.classList.toggle('unavailable',!!item&&!en.ok);b.disabled=!item;
      if(b.dataset.item!==(en?.id||'')){b.dataset.item=en?.id||'';b.querySelector('.tile-art').innerHTML=itemArt(en?.id);}
      put(b.querySelector('.tile-slot'),item?(ITEMS[en.id]?item.slot:'supply'):'');
      put(b.querySelector('.tile-name'),item?.name||'');put(b.querySelector('.tile-price'),item?en.label:'');
    }
    if(picked!=null&&!entry(picked)?.id)picked=null;   // sold or gone
    const key=hover??picked,en=key!=null?entry(key):null,item=ITEMS[en?.id];
    const rows=en?.id?(tab==='buy'?[['Buy price',`${en.price} ryo`],...(item?.sell?[['Sells back for',`${item.sell} ryo`]]:[])]:[['Sells for',en.label]]):[];
    const html=detailHtml(en?.id,{rows,equipped:item?ITEMS[inv.equipment?.[item.slot]]||null:null});
    if($('.detail-body').dataset.html!==html){$('.detail-body').dataset.html=html;$('.detail-body').innerHTML=html;}
    const sel=picked!=null?entry(picked):null,go=$('.shop-go');
    put(go,sel?.id?sel.verb:tab==='buy'?'Select an item to buy':'Select an item to sell');
    go.disabled=!sel?.id||!sel.ok;$('.shop-cancel').hidden=picked==null;
    put($('.shop-why'),sel?.id&&!sel.ok?sel.why:'');
  }
  $('.shop-go').addEventListener('click',()=>{const sel=picked!=null&&entry(picked);if(!sel?.id||!sel.ok)return;
    if(tab==='buy')command('buy',{item:sel.id});else{command('sell',{index:+picked});picked=null;}render();});
  $('.shop-cancel').addEventListener('click',()=>{picked=null;render();});
  function close(){if(!open)return;open=false;root.hidden=true;onClose();focus?.focus?.();}
  function show(){if(!game.itemServices.near(hero()))return;focus=document.activeElement;open=true;root.hidden=false;picked=hover=null;layout();onOpen();update();$('.shop-close').focus();}
  icon.addEventListener('click',show);$('.shop-close').addEventListener('click',close);$('.shop-claim').addEventListener('click',()=>command('claim'));
  root.addEventListener('click',e=>{if(e.target===root)close();});
  root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(picked!=null){picked=null;render();}else close();}if(e.key==='Tab'){const a=[...root.querySelectorAll('button:not(:disabled):not([hidden])')],first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  for(const target of [root,icon])for(const event of ['mousedown','mouseup','contextmenu','wheel'])target.addEventListener(event,e=>{e.stopPropagation();if(event==='contextmenu')e.preventDefault();});
  let lastMarker='';
  function update(){
    const e=hero(),npc=game.itemServices.shop(),clan=game.state.clans[e?.owner],near=game.itemServices.near(e);
    icon.hidden=hidden()||!npc||e?.place!=='street'||!game.vision.canSee(e.owner,npc)||open;
    if(!icon.hidden){const p=view.unitToScreen(npc.x,npc.z,3.0),k=`${Math.round(p.x)},${Math.round(p.y)},${near}`;   // write the DOM only when it moved
      if(k!==lastMarker){lastMarker=k;icon.style.left=`${Math.round(p.x)}px`;icon.style.top=`${Math.round(p.y)-2}px`;icon.disabled=!near;}}
    if(!open)return;if(!near||hidden())return close();
    const inv=clan.inventory;render();
    put($('.shop-money'),`${Math.floor(clan.ryo)} ryo · Bag ${inv.bag.filter(Boolean).length}/${INVENTORY_SLOTS}`);
    $('.shop-claim').hidden=!inv.pending?.length;put($('.shop-claim'),`Claim waiting rewards (${inv.pending?.length||0})`);
    put($('.inventory-notice'),clan.notice&&game.state.tick-clan.notice.tick<100?clan.notice.text:'');
  }
  return {update,open:show,close,isOpen:()=>open};
}
