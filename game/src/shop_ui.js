import {ITEMS, SHOP_ITEM_IDS, CONSUMABLES} from './sim/gear_catalog.js';
import {createItemGrid} from './inventory_ui.js';

export function createShopUI({game,heroId,view,send,onOpen=()=>{},onClose=()=>{},hidden=()=>false}){
  const root=document.createElement('section');root.id='blacksmithshop';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Blacksmith shop');
  root.innerHTML='<div class="shop-window"><header><div><small>BLACKSMITH · FIELD OUTFITTER</small><h2>Buy & sell</h2></div><button class="shop-close" aria-label="Close shop">✕</button></header><div class="shop-columns"><section><h3>Supplies & starter gear</h3><div class="shop-stock"></div></section><section><h3>Sell carried gear <small>Click an item to sell</small></h3><div class="gear-grid"></div><button class="shop-claim">Claim waiting rewards</button><p class="shop-help">Fine green gear comes from victories and enemy loot. Equip gear from your Character page (I).</p></section></div><footer><span class="shop-money"></span><span class="inventory-notice" role="status"></span></footer></div>';
  const icon=document.createElement('button');icon.id='shopmarker';icon.textContent='⚒ Shop';icon.title='Blacksmith — approach to buy and sell (Space)';
  document.body.append(root,icon);const $=s=>root.querySelector(s);let open=false,focus;
  const hero=()=>game.state.entities[heroId],command=(action,extra={})=>send({id:heroId,type:'item',action,...extra});
  const stock=[...SHOP_ITEM_IDS,'bandage','war_lantern'].map(id=>{
    const item=ITEMS[id]||CONSUMABLES[id],b=document.createElement('button');b.type='button';
    const art=ITEMS[id]?id:id==='bandage'?'bandage':null;
    b.innerHTML=`${art?`<img src="../assets/items/${art}.png" alt="">`:'<span class="shop-lantern">🏮</span>'}<strong>${item.name}</strong><small></small>`;
    b.title=ITEMS[id]?.about||(id==='bandage'?'Heal 25% maximum HP over 6s. Movement, damage and attacking interrupt it. 60s cooldown.':'Starts a night raid at a rival business. One shared clan charge.');
    b.addEventListener('click',()=>command('buy',{item:id}));$('.shop-stock').append(b);return {id,b};
  });
  const bag=createItemGrid($('.gear-grid'),{activate:index=>command('sell',{index})});
  function close(){if(!open)return;open=false;root.hidden=true;onClose();focus?.focus?.();}
  function show(){if(!game.itemServices.near(hero()))return;focus=document.activeElement;open=true;root.hidden=false;onOpen();update();$('.shop-close').focus();}
  icon.addEventListener('click',show);$('.shop-close').addEventListener('click',close);$('.shop-claim').addEventListener('click',()=>command('claim'));
  root.addEventListener('click',e=>{if(e.target===root)close();});
  root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const a=[...root.querySelectorAll('button:not(:disabled)')],first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  for(const target of [root,icon])for(const event of ['mousedown','mouseup','contextmenu','wheel'])target.addEventListener(event,e=>{e.stopPropagation();if(event==='contextmenu')e.preventDefault();});
  function update(){
    const e=hero(),npc=game.itemServices.shop(),clan=game.state.clans[e?.owner],near=game.itemServices.near(e);
    icon.hidden=hidden()||!npc||e?.place!=='street'||!game.vision.canSee(e.owner,npc)||open;
    if(!icon.hidden){const p=view.unitToScreen(npc.x,npc.z);icon.style.left=`${p.x}px`;icon.style.top=`${p.y-65}px`;icon.disabled=!near;}
    if(!open)return;if(!near||hidden())return close();
    const inv=clan.inventory;bag(inv.bag,true,'Sell for listed value');
    for(const {id,b}of stock){const price=ITEMS[id]?.buy||(id==='bandage'?CONSUMABLES.bandage.buy:game.businesses.raidRules.lanternPrice);
      const full=ITEMS[id]?!inv.bag.includes(null):id==='bandage'?(inv.bandages||0)>=2:clan.kind==='ninja'||(clan.lanterns||0)>=(game.businesses.raidRules.lanternCarry||1);
      b.disabled=clan.ryo<price||full;b.querySelector('small').textContent=`${price} ryo${full?' · Unavailable':''}`;
    }
    $('.shop-money').textContent=`${Math.floor(clan.ryo)} ryo · Bandages ${inv.bandages||0}/2 · War Lantern ${clan.lanterns||0}`;
    $('.shop-claim').hidden=!inv.pending?.length;$('.shop-claim').textContent=`Claim waiting rewards (${inv.pending?.length||0})`;
    $('.inventory-notice').textContent=clan.notice&&game.state.tick-clan.notice.tick<100?clan.notice.text:'';
  }
  return {update,open:show,close,isOpen:()=>open};
}
