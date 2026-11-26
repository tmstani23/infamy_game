import {ITEMS, SHOP_ITEM_IDS, CONSUMABLES, LOOT, SHOP, FRONTIER_MERCHANT as FM, merchantPays, merchantSpot, heirloomFor} from './gear_catalog.js';
import {canInteract} from './interactions.js';
import {debitRyo} from './treasury.js';
import {noticeFor} from './util.js';

export function createItemServices({state,raidRules={},spawn,nav,removeUnit=null,cellSize=11}) {
  const say=noticeFor(state), ticks=s=>Math.round(s*20);
  const hero=owner=>Object.values(state.entities).find(e=>e.owner===owner&&e.type==='hero');
  const shop=()=>Object.values(state.entities).find(e=>e.shopkeeper&&!e.merchantOf);
  function initialize(){
    if(shop()||!spawn)return;
    const p=nav.nearestFree(SHOP.x,SHOP.z);
    spawn('civilian','merchant',...p,{name:SHOP.name,shopkeeper:true,holdFire:true,hp:60});   // hp only so frames read right; he can never be hit (combat.js, game.js hostile/attackAllowed)
  }
  const near=e=>!!e&&canInteract(e)&&e.type==='hero'&&e.place==='street'&&!!shop()&&Math.hypot(e.x-shop().x,e.z-shop().z)<=SHOP.reach;
  // the frontier merchant (2026-11-26): the stall keeper of one of e's own towns, within reach
  const merchantNear=e=>{if(!e||!canInteract(e)||e.type!=='hero'||e.place!=='world'||e.aboard)return null;
    return Object.values(state.entities).find(m=>(m.peddlerShop&&!m.dead||m.merchantOf&&state.frontier?.settlements?.[m.merchantOf]?.owner===e.owner)&&Math.hypot(e.x-m.x,e.z-m.z)<=FM.reach)||null;};   // or a peddler he saved on the road (sim/wandering_folk.js, 2026-11-26)
  // one stall keeper per founded town of a player clan, day and night (wars are a race: never wait for the shop)
  function merchants(){
    if(!state.frontier||state.tick%20||!spawn)return;
    for(const s of Object.values(state.frontier.settlements||{})){
      const m=s.merchantNpc&&state.entities[s.merchantNpc];
      const want=s.founded&&s.owner&&!s.ruined&&!s.empty&&!state.clans?.[s.owner]?.bot&&Number.isFinite(s.x);
      if(m&&(!want||m.dead))(removeUnit?.(m.id),delete s.merchantNpc);
      if(!want){delete s.merchantNpc;continue;}
      const [x,z]=merchantSpot(s,cellSize);
      if(!m||m.dead)s.merchantNpc=spawn('city_captain',FM.model,x,z,{owner:null,place:'world',area:'world',guide:true,shopkeeper:true,merchantOf:s.id,holdFire:true,hp:60,name:FM.name});
      else Object.assign(m,{x,z,place:'world',anim:'idle'});
    }
  }
  const inv=e=>state.clans[e?.owner]?.inventory;
  // rival bots wear what they win (2026-11-24): an item better than the one in its slot goes straight on (by rarity:
  // shop < city drop < frontier < heirloom), the old one into the bag if there is room.
  const RANK={green:1,frontier:2,heirloom:3}, rank=id=>RANK[ITEMS[id]?.rarity]||0;
  function botWear(owner,v,id){const slot=ITEMS[id].slot,cur=v.equipment?.[slot];if(!(slot in(v.equipment||{}))||(cur&&rank(id)<=rank(cur)))return false;
    if(cur){const i=v.bag.indexOf(null);if(i>=0)v.bag[i]=cur;}v.equipment[slot]=id;state.itemGains?.push({clan:owner,id});return true;}
  function give(owner,id){const c=state.clans[owner],v=c?.inventory;if(!v||!ITEMS[id])return false;if(c.bot&&botWear(owner,v,id))return true;
    const i=v.bag.indexOf(null);if(i<0)return false;v.bag[i]=id;state.itemGains?.push({clan:owner,id});say(c,`Found ${ITEMS[id].name}`);return true;}
  function command(e,c){
    const clan=state.clans[e?.owner],v=inv(e);if(!clan||!v||e.type!=='hero'||!canInteract(e))return;
    if(c.action==='buy'||c.action==='sell'){
      const merchant=!near(e)&&merchantNear(e);
      if(!near(e)&&!merchant)return say(clan,'Approach the blacksmith or a town merchant to trade');
      if(c.action==='sell'){
        if(!Number.isInteger(c.index)||c.index<0||c.index>=v.bag.length)return;
        const item=ITEMS[v.bag[c.index]];if(!item)return;
        const price=merchant?merchantPays(v.bag[c.index]):item.sell??0;if(!price)return say(clan,'This keepsake cannot be sold');
        v.bag[c.index]=null;clan.ryo+=price;state.ryoGains.push({clan:e.owner,amount:price,reason:'Gear sold'});return;
      }
      const id=c.item;let price;
      if(merchant&&!FM.stock.includes(id))return say(clan,'The merchant does not sell that');
      if(SHOP_ITEM_IDS.includes(id)){
        if(!v.bag.includes(null))return say(clan,'Personal inventory is full');price=ITEMS[id].buy;
      }else if(id==='bandage'){
        if((v.bandages||0)>=CONSUMABLES.bandage.carryLimit)return say(clan,'You can carry two bandages');price=CONSUMABLES.bandage.buy;
      }else if(id==='war_lantern'){
        if(clan.kind==='ninja')return say(clan,'Shinobi cannot buy War Lanterns');
        if((clan.lanterns||0)>=(raidRules.lanternCarry||1))return say(clan,'You already carry a War Lantern');price=raidRules.lanternPrice;
      }else return;
      if(!(price>0)||clan.ryo<price)return say(clan,`Need ${price} ryo`);
      debitRyo(state,clan,price,'Shop purchase',{target:id});
      if(id==='bandage')v.bandages=(v.bandages||0)+1;
      else if(id==='war_lantern')clan.lanterns=(clan.lanterns||0)+1;
      else v.bag[v.bag.indexOf(null)]=id;
      return say(clan,`Bought ${ITEMS[id]?.name||CONSUMABLES[id].name}`);
    }
    if(c.action==='bandage'){
      const b=CONSUMABLES.bandage;
      if(e.bandaging||e.execute||e.dash||e.brace||e.spearCombo||e.buffs?.stunned?.until>state.tick||e.hp>=e.maxHp||!(v.bandages>0)||v.bandageReadyAt>state.tick)return;
      v.bandages--;v.bandageReadyAt=state.tick+ticks(b.cooldownSeconds);
      delete e.attackTarget;delete e.swing;
      e.bandaging={startedAt:state.tick,x:e.x,z:e.z,place:e.place,healed:0,total:e.maxHp*b.healMaxHpShare};
    }
  }
  function interrupt(e,c){if(e?.bandaging&&((c.type==='move'&&Math.hypot(c.right,c.down)>.05)||['attack','ability','execute','use','interiorDoor','loot','cancel'].includes(c.type)))delete e.bandaging;}
  function bandageTick(){for(const e of Object.values(state.entities))if(e.bandaging){
    const b=e.bandaging,elapsed=state.tick-b.startedAt;
    if(!canInteract(e)||e.buffs?.stunned?.until>state.tick||e.place!==b.place||Math.hypot(e.x-b.x,e.z-b.z)>.03||(e.hitAt??-1)>=b.startedAt||e.swing||e.attackTarget){delete e.bandaging;continue;}
    const amount=b.total*Math.min(1,elapsed/ticks(CONSUMABLES.bandage.channelSeconds));
    e.hp=Math.min(e.maxHp,e.hp+amount-b.healed);b.healed=amount;
    if(elapsed>=ticks(CONSUMABLES.bandage.channelSeconds))delete e.bandaging;
  }}
  function random(){const l=state.gearLoot||=( {seed:72437,first:{},recent:{},camps:{}} );l.seed=(Math.imul(l.seed,1664525)+1013904223)>>>0;return l.seed/4294967296;}
  function roll(rate){if(random()>=rate)return null;const p=random(),slot=p<LOOT.slots.weapon?'weapon':p<LOOT.slots.weapon+LOOT.slots.armor?'armor':'accessory';const choices=SHOP_ITEM_IDS.filter(id=>ITEMS[id].slot===slot);return choices[Math.floor(random()*choices.length)]+'_green';}
  function accomplishment(owner,kind,key){
    const l=state.gearLoot||={seed:72437,first:{},recent:{},camps:{}};const k=`${owner}:${kind}:${key}`;
    if(l.recent[k]!=null&&state.tick-l.recent[k]<ticks(SHOP.lootRepeatSeconds))return;
    const rate=LOOT.accomplishments[kind][l.first[k]?'repeat':'first'];l.first[k]=true;l.recent[k]=state.tick;
    const id=roll(rate);if(!id)return;
    grant(owner,id);
  }
  // into the bag, else waiting at the shop, else sold (a keepsake that cannot be sold still waits; W7 heirlooms)
  function grant(owner,id){
    if(give(owner,id))return true;
    const v=state.clans[owner]?.inventory;if(!v)return false;v.pending||=[];
    if(v.pending.length<12||!ITEMS[id].sell){v.pending.push(id);say(state.clans[owner],'Gear reward waiting: free a bag slot and claim it at the shop');}
    else{const value=ITEMS[id].sell;state.clans[owner].ryo+=value;state.ryoGains.push({clan:owner,amount:value,reason:'Overflow gear sold'});say(state.clans[owner],`Reward storage full: gear sold for ${value} ryo`);}
    return false;
  }
  function defeat(a,t){
    if(!state.clans[a?.owner]||a.owner===t.owner||t.shopkeeper||t.cop||t.guard||t.type==='civilian'||t.noGearLoot)return;
    if(t.type==='hero'){accomplishment(a.owner,'rivalHero',t.owner);return;}
    if(t.gearRolled)return;t.gearRolled=true;
    if(t.camp){const camp=state.banditCamps?.find(c=>c.units.includes(t.id));if(camp)camp.gearWinner=a.owner;}
    const id=roll(t.wild?LOOT.bodies.bandit:LOOT.bodies.enemyCrew);if(id)t.gearItem=id;
  }
  function collect(e,body){if(!body.gearItem)return true;if(!give(e.owner,body.gearItem)){say(state.clans[e.owner],'Personal inventory is full');return false;}delete body.gearItem;return true;}
  function tick(){
    bandageTick();
    for(const n of state.news||[])if(n.kind==='raidWon'&&!n.hq)accomplishment(n.raider,'businessRaid',n.business);
    const l=state.gearLoot||={seed:72437,first:{},recent:{},camps:{}};
    for(const c of state.banditCamps||[])if(c.clearedAt!=null&&c.gearWinner&&l.camps[c.id]!==c.clearedAt){l.camps[c.id]=c.clearedAt;accomplishment(c.gearWinner,'banditCamp',c.id);}
  }
  // a castle falls (Z6): its clan's heirloom blade goes to the clan that took it (wildlife W7, 2026-11-24).
  // Called after the frontier tick (sim/game.js), which ends the wars.
  function castles(){for(const n of state.news||[])if(n.kind==='warEnded'&&n.result==='fell'&&state.clans[n.attacker]){const id=heirloomFor(state.clans[n.defender]);if(ITEMS[id])grant(n.attacker,id);}}
  function claim(e){if(!near(e)&&!merchantNear(e))return;const v=inv(e);while(v?.pending?.length&&v.bag.includes(null))give(e.owner,v.pending.shift());}
  return {initialize,near,shop,merchantNear,merchants,command,interrupt,tick,defeat,collect,claim,grant,castles,give};
}
