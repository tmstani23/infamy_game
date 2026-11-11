import { unitName,unitStatus } from './selection_panel.js';
import { crewCommandGroup } from './sim/deployment_rally.js';
import { syncChildren } from './stable_list.js';

// Tim 2026-10-28: double-click a group header = the camera follows that group; drag a pip onto
// another group = transfer (the crew take that group's duty from the Deployment menu)
// Tim 2026-10-30: selected crew get a gold box and the rest of their group dims; tabs 1-4 show the
// control groups (click selects, Ctrl+click assigns, again dissolves); a drag shows gold where the crew
// fit and red where they don't, and a refused drop flashes red with the reason.
const CSS=`
  @keyframes hqWaiting{50%{box-shadow:0 0 8px #f4c66c66;border-color:#ecd08c}}
  #partyframes .crew-waiting{border:1px solid #d8b160;animation:hqWaiting 3s ease-in-out infinite}
  #partyframes .crew-waiting .crew-drop-note{color:#ffe2a3}
  #partyframes .crew-tabs{display:flex;gap:4px;grid-column:1/-1}
  #partyframes .crew-tab{flex:1;padding:2px 0;border-radius:4px;border:1px solid #555;background:#22262e;color:#ffd34d;font:700 11px system-ui;cursor:pointer}
  #partyframes .crew-tab small{color:#aaa;font-weight:400;margin-left:3px}
  #partyframes .crew-tab.empty{color:#666;border-color:#333}
  #partyframes .crew-tab.on{background:rgba(255,211,77,.18);border-color:#ffd34d}
  #partyframes .crew-group-select b{color:#ffd34d;font-weight:600}
  #partyframes .crew.grouped .mate{position:relative}
  #partyframes .crew.grouped .mate.picked{border:2px solid #ffd34d;background:rgba(255,211,77,.2)}
  #partyframes .crew.grouped .mate.dim{opacity:.45}
  #partyframes .crew.grouped .mate .group{position:absolute;top:-5px;right:-4px;width:12px;border-radius:6px;background:#ffd34d;color:#111;font:800 9px/12px system-ui;text-align:center}
  #partyframes .crew-section.drop-target{border:2px dashed #ffd34d;box-shadow:none}
  #partyframes .crew-section.drop-full,#partyframes .crew-section.drop-refused{border:2px solid #e0473c;background:rgba(224,71,60,.18);box-shadow:none}
  #partyframes .crew-drop-note{color:#ff8a7a;font:600 10px system-ui;margin-top:2px}
  #partyframes .crew-drop-note:empty{display:none}
  #partyframes .veh{display:block;min-width:84px;cursor:pointer;padding:2px 4px;border-radius:4px;border:1px solid #5c4a2c;background:#1a1d24}
  #partyframes .veh.picked{border:2px solid #ffd34d;background:rgba(255,211,77,.2)}
  #partyframes .veh{position:relative}
  #partyframes .veh::after{content:attr(data-out);position:absolute;top:2px;right:3px;padding:1px 5px;border-radius:3px;font:700 9px/13px system-ui;color:#1a1208;background:#e9b44c;box-shadow:0 1px 3px rgba(0,0,0,.6);opacity:0;transform:translateY(-2px);transition:opacity .12s,transform .12s;pointer-events:none}
  #partyframes .veh:hover::after{opacity:1;transform:none}
  #partyframes .veh .vname{font:700 10px system-ui;color:#e9d6a8}
  #partyframes .veh .seats{display:flex;flex-wrap:wrap;gap:2px;margin-top:2px}
  #partyframes .veh .seat{width:13px;height:13px;border-radius:3px;background:#3b4150;color:#fff;font:700 8px/13px system-ui;text-align:center;overflow:hidden}
  #partyframes .veh .seat.empty{background:none;border:1px dashed #555}
  #partyframes .veh .seat.hero{background:#8a6a2a}
  #partyframes .veh .seat.settler{background:#4a6b3a}
  #partyframes .veh .seat[title]:not(.hero):hover{outline:1px solid #e9b44c;background:#5a4a2a}`;
let cssAdded=false;

export function createGroupedCrew({root,game,heroId,units,crewInput,send=()=>{},watchGroup=()=>{},where=()=>''}) {
  if(!cssAdded&&document.head){cssAdded=true;const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);}
  const sections=new Map(),pips=new Map(),medical=new Map();
  const tabs=document.createElement('div');tabs.className='crew-tabs';
  const tabButtons=[1,2,3,4].map(n=>{const b=document.createElement('button');b.type='button';b.className='crew-tab';b.dataset.n=n;
    b.title=`Control group ${n}: click selects it (same as ${n}); Ctrl+click puts the selected crew in it (same as Ctrl+${n}), again dissolves it`;
    b.addEventListener('mousedown',e=>e.stopPropagation());
    b.addEventListener('click',e=>{if(e.ctrlKey)crewInput.assignGroup(n);else crewInput.selectGroup(n);b.blur();});tabs.appendChild(b);return b;});
  const createSection=(id,label)=>{
    if(sections.has(id))return sections.get(id);
    const el=document.createElement('section'),head=document.createElement('button'),list=document.createElement('div');
    el.className='crew-section';el.dataset.group=id;head.className='crew-group-select';head.type='button';list.className='crew-group-pips';
    head.addEventListener('dblclick',()=>watchGroup(id));
    // right-click the Frontier crew header (Tim 2026-11-10): everyone gets off, out of every vehicle and off every horse
    if(id==='vehicles')head.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();
      const owner=game.state.entities[heroId]?.owner,O=game.omnibus,all=Object.values(game.state.entities);
      const vs=O?all.filter(v=>O.isVehicle(v)&&v.omnibusOwner===owner&&!v.dead&&O.riders(v).length).map(v=>v.id):[];
      if(vs.length)send({id:heroId,type:'omnibus',action:'deploy',vehicles:vs});
      for(const u of all)if(u.owner===owner&&u.type!=='hero'&&u.mounted&&u.ride?.horse&&!u.dead)send({id:heroId,type:'mount',horse:u.ride.horse,units:[u.id]});});
    head.addEventListener('click',()=>{
      // a header selects just what its section shows (Tim 2026-11-08): the vehicles header its vehicles, a group
      // header its crew on foot or horseback (riders show in their vehicle's card)
      const owner=game.state.entities[heroId]?.owner,O=game.omnibus;
      if(id==='vehicles'){crewInput.select([...(O?Object.values(game.state.entities).filter(v=>O.isVehicle(v)&&v.omnibusOwner===owner&&!v.dead&&O.riders(v).length).map(v=>v.id):[]),
        ...Object.values(game.state.entities).filter(e=>e.owner===owner&&e.type!=='hero'&&e.mounted&&!e.dead).map(e=>e.id)]);return;}
      const crew=Object.values(game.state.entities).filter(e=>e.owner===owner&&e.type!=='hero'&&!e.guard&&!e.dead&&!e.downed&&!e.jailed&&!e.aboard&&!e.deployment?.transfer&&key(e)===id);
      crewInput.select(crew.map(e=>e.id));
    });const note=document.createElement('div');note.className='crew-drop-note';el.append(head,list,note);root.appendChild(el);const s={el,head,list,label,note,headKey:''};sections.set(id,s);return s;
  };
  const key=e=>e.type==='settler'?'settlers':crewCommandGroup(game.state,e);   // E1: settlers are their own group
  const droppable=id=>id&&id!=='rally'&&id!=='medical'&&id!=='settlers';
  let dragged=null;
  const showDestinations=()=>{for(const [id,s]of sections)s.el.style.display=dragged&&droppable(id)?'block':s.count?'':'none';};
  root.addEventListener('dragstart',e=>{const id=e.target.closest?.('.mate')?.dataset.id;if(!id||!game.state.entities[id]){e.preventDefault();return;}
    const sel=crewInput.selected();dragged=sel.includes(id)?sel.filter(x=>game.state.entities[x]?.type!=='hero'):[id];
    e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged.join(','));showDestinations();});
  const moving=to=>(dragged||[]).filter(id=>{const u=game.state.entities[id];return u&&(u.deployment?.group||'home')!==to;});
  const check=to=>{const ids=moving(to);return ids.length?game.deployment?.canTransfer?.(heroId,ids,to)||{ok:true,why:''}:{ok:true,why:''};};
  root.addEventListener('dragover',e=>{const sec=e.target.closest?.('.crew-section'),to=sec?.dataset.group;if(!dragged||!droppable(to))return;e.preventDefault();
    const ok=check(to).ok;for(const s of sections.values()){s.el.classList.toggle('drop-target',s.el===sec&&ok);s.el.classList.toggle('drop-full',s.el===sec&&!ok);}});
  const clearDrop=()=>{for(const s of sections.values())s.el.classList.remove('drop-target','drop-full');};
  const refuse=(s,why)=>{s.el.classList.add('drop-refused');s.note.textContent=why;clearTimeout(s.flash);
    s.flash=setTimeout(()=>{s.el.classList.remove('drop-refused');s.note.textContent='';},1200);};
  root.addEventListener('dragleave',e=>{if(!root.contains(e.relatedTarget))clearDrop();});
  root.addEventListener('dragend',()=>{dragged=null;clearDrop();showDestinations();});
  root.addEventListener('drop',e=>{const to=e.target.closest?.('.crew-section')?.dataset.group;e.preventDefault();clearDrop();
    const ids=moving(to),can=droppable(to)&&ids.length?check(to):null;dragged=null;showDestinations();if(!can)return;
    if(!can.ok){refuse(sections.get(to),can.why);return;}
    send({id:heroId,type:'deployment',action:'transfer',units:ids,to});});
  function update(crew,clinic,jail){
    root.classList.add('grouped');
    const names={rally:'Rally force',hero:'Hero group',settlers:'Settlers',...Object.fromEntries(game.state.deployment.sectors.map(s=>[s.id,s.name])),home:'HQ reserves'};
    const ordered=[],live=new Set(crew.map(e=>e.id)),selected=new Set(crewInput.selected());
    for(const [id,p]of pips)if(!id.startsWith('veh:')&&!id.startsWith('mnt:')&&!live.has(id)){p.el.remove();pips.delete(id);}
    const sizes=[0,0,0,0];for(const e of crew){const g=crewInput.groupOf(e.id);if(g)sizes[g-1]++;}
    const picked=crew.filter(e=>selected.has(e.id));
    tabButtons.forEach((b,i)=>{const n=sizes[i],key=`${i+1}|${n}`;if(b.dataset.key!==key){b.dataset.key=key;b.textContent=String(i+1);if(n){const c=document.createElement('small');c.textContent=n;b.appendChild(c);}}
      b.classList.toggle('empty',!n);b.classList.toggle('on',!!n&&picked.length>0&&crew.every(e=>(crewInput.groupOf(e.id)===i+1)===selected.has(e.id)));});
    ordered.push(tabs);
    for(const [id,label]of Object.entries(names)){
      const members=crew.filter(e=>key(e)===id&&!e.aboard&&!e.mounted);   // riders show in their vehicle's card, horsemen as mounts (Tim 2026-11-08)
      const s=createSection(id,label),chosen=members.filter(e=>selected.has(e.id)).length,partial=chosen>0&&chosen<members.length,headKey=`${label}|${members.length}|${partial?chosen:''}`;s.count=members.length;
      if(s.headKey!==headKey){s.headKey=headKey;s.head.textContent=`${label} · ${members.length}`;if(partial){const b=document.createElement('b');b.textContent=` · ${chosen} selected`;s.head.appendChild(b);}}
      const waiting=id==='home'&&members.some(e=>e.deployment?.awaitingAssignment);s.el.classList.toggle('crew-waiting',!!waiting);if(waiting)s.note.textContent='Crew waiting to be assigned';else if(s.note.textContent==='Crew waiting to be assigned')s.note.textContent='';
      s.head.setAttribute('aria-pressed',String(chosen>0));s.el.classList.toggle('selected',chosen>0);
      const nodes=members.map(e=>{
        let p=pips.get(e.id);if(!p){const el=document.createElement('div'),name=document.createElement('span'),hp=document.createElement('div'),group=document.createElement('b'),status=document.createElement('small');el.className='mate';el.draggable=true;name.className='name';hp.className='pip';group.className='group';status.className='crew-status';el.append(name,hp,group,status);p={el,name,hp,group,status};pips.set(e.id,p);}
        p.el.dataset.id=e.id;p.name.textContent=unitName(units,e.type);p.hp.style.setProperty('--hp',`${Math.max(0,e.hp/e.maxHp*100)}%`);
        const status=unitStatus(e,game.state),location=where(e);if(p.status.textContent!==status)p.status.textContent=status;
        p.group.textContent=crewInput.groupOf(e.id)||'';p.el.classList.toggle('picked',selected.has(e.id));p.el.classList.toggle('dim',partial&&!selected.has(e.id));p.el.classList.toggle('down',!!e.downed);p.el.classList.toggle('hurt',e.hp/e.maxHp<.5);
        p.el.title=`${p.name.textContent} · ${Math.ceil(e.hp)}/${e.maxHp} HP · ${label} · ${status}${location?' · '+location:''}. Click selects and shows them in the target frame; Shift+click adds or removes; double-click also follows with the camera; drag onto another group to transfer.`;return p.el;
      });syncChildren(s.list,nodes);ordered.push(s.el);
    }
    // Frontier crew (Tim 2026-11-07): each loaded rickshaw or omnibus is one card with its shared health and a seat per
    // place (2 or 8): riders show in their seats, empty seats faintly. Clicking the card selects the vehicle.
    const owner=game.state.entities[heroId]?.owner,O=game.omnibus;
    const vehicles=O?Object.values(game.state.entities).filter(v=>O.isVehicle(v)&&v.omnibusOwner===owner&&!v.dead&&O.riders(v).length):[];
    // crew on horseback show here too, one Mount card each (Tim 2026-11-08): click selects the rider, right-click gets him off
    const mounts=crew.filter(e=>e.mounted&&e.ride?.kind==='horse'&&!e.dead);
    const vs=createSection('vehicles','Frontier crew');vs.count=vehicles.length+mounts.length;
    const vk=`v${vehicles.length}|${mounts.length}`;
    if(vs.headKey!==vk){vs.headKey=vk;vs.head.title='Click selects them; right-click gets everyone off: out of every vehicle and off every horse';vs.head.textContent=`Frontier crew · ${[vehicles.length?`${vehicles.length} vehicle${vehicles.length===1?'':'s'}`:'',mounts.length?`${mounts.length} mounted`:''].filter(Boolean).join(' · ')}`;}
    const vnodes=vehicles.map(v=>{
      let p=pips.get('veh:'+v.id);
      if(!p){const el=document.createElement('div'),name=document.createElement('div'),hp=document.createElement('div'),seats=document.createElement('div');
        el.className='mate veh';el.dataset.out='⏏ Unload';name.className='vname';hp.className='pip';seats.className='seats';el.append(name,hp,seats);
        el.addEventListener('mousedown',e=>e.stopPropagation());el.addEventListener('click',()=>{crewInput.select([v.id]);crewInput.look?.(v.id);});el.addEventListener('dblclick',()=>crewInput.watch?.(v.id));   // like a click on it in the world: it shows in the target frame (Tim 2026-11-08)
        // right-click the card: everyone in it steps out, the same as right-clicking it in the world (Tim 2026-11-08)
        el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();send({id:heroId,type:'omnibus',action:'deploy',vehicles:[v.id]});});
        p={el,name,hp,seats,key:''};pips.set('veh:'+v.id,p);}
      const rs=O.riders(v),n=O.seatsOf(v),k=rs.map(r=>r.id).join(',')+'|'+n;
      p.name.textContent=`${v.type==='rickshaw'?'Rickshaw':'Omnibus'}${v.vorder?.kind==='stay'?' · staying':v.driver?' · driving':''}`;
      p.hp.style.setProperty('--hp',`${Math.max(0,v.hp/v.maxHp*100)}%`);
      if(p.key!==k){p.key=k;p.seats.replaceChildren(...Array.from({length:n},(_,i)=>{const r=rs[i],d=document.createElement('span');
        d.className='seat'+(r?(r.type==='hero'?' hero':r.type==='settler'?' settler':''):' empty');if(r){d.textContent=unitName(units,r.type).slice(0,1);d.title=unitName(units,r.type)+(r.type==='hero'?'':' · right-click: only he steps out');
          // right-click one rider's seat: only he steps out and waits (Tim 2026-11-08); the hero's seat lets only him out (Tim 2026-11-10)
          if(r.type==='hero'){d.title='You · right-click: only you step out';d.addEventListener('mouseenter',()=>{const c=d.closest('.veh');if(c)c.dataset.out='⏏ You out';});d.addEventListener('mouseleave',()=>{const c=d.closest('.veh');if(c)c.dataset.out='⏏ Unload';});d.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();send({id:heroId,type:'omnibus',action:'deploy',vehicles:[v.id],units:[r.id],hero:true});});}
          if(r.type!=='hero'){const nm=unitName(units,r.type);d.addEventListener('mouseenter',()=>{const c=d.closest('.veh');if(c)c.dataset.out=`⏏ ${nm} out`;});d.addEventListener('mouseleave',()=>{const c=d.closest('.veh');if(c)c.dataset.out='⏏ Unload';});d.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();send({id:heroId,type:'omnibus',action:'deploy',vehicles:[v.id],units:[r.id]});});}}return d;}));}
      p.el.classList.toggle('picked',selected.has(v.id));
      p.el.title=`${p.name.textContent} · ${Math.ceil(v.hp)}/${v.maxHp} health · ${rs.length} of ${n} seats. Click selects it: right-click the ground to send it, V to follow, Z to stay, Q or right-click this card to let them out; double-click: the camera follows it.`;
      return p.el;});
    const mnodes=mounts.map(u=>{
      let p=pips.get('mnt:'+u.id);
      if(!p){const el=document.createElement('div'),name=document.createElement('div'),hp=document.createElement('div'),seats=document.createElement('div'),d=document.createElement('span');
        el.className='mate veh mount';el.dataset.out='⏏ Dismount';name.className='vname';hp.className='pip';seats.className='seats';d.className='seat';seats.append(d);el.append(name,hp,seats);
        el.addEventListener('mousedown',e=>e.stopPropagation());el.addEventListener('click',()=>crewInput.select([u.id]));el.addEventListener('dblclick',()=>crewInput.watch?.(u.id));
        el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();const r=game.state.entities[u.id];if(r?.ride?.horse)send({id:heroId,type:'mount',horse:r.ride.horse,units:[u.id]});});
        p={el,name,hp,seats,d};pips.set('mnt:'+u.id,p);}
      const horse=game.state.entities[u.ride.horse];
      p.name.textContent=`Mount · ${horse?.name||'Horse'}`;p.d.textContent=unitName(units,u.type).slice(0,1);p.d.title=unitName(units,u.type);
      p.hp.style.setProperty('--hp',`${Math.max(0,u.hp/u.maxHp*100)}%`);
      p.el.classList.toggle('picked',selected.has(u.id));
      p.el.title=`${unitName(units,u.type)} on ${horse?.name||'a horse'} · ${Math.ceil(u.hp)}/${u.maxHp} HP. Click selects him: right-click the ground to send him, V to follow, Z to stay, Q or right-click this card to get him off; double-click: the camera follows him.`;
      return p.el;});
    for(const [id,p]of pips)if((id.startsWith('veh:')&&!vehicles.some(v=>'veh:'+v.id===id))||(id.startsWith('mnt:')&&!mounts.some(u=>'mnt:'+u.id===id))){p.el.remove();pips.delete(id);}
    syncChildren(vs.list,[...vnodes,...mnodes]);if(vehicles.length||mounts.length)ordered.splice(1,0,vs.el);
    if(clinic.length||jail.length){
      const s=createSection('medical','Unavailable');s.count=clinic.length+jail.length;s.head.textContent=`Clinic ${clinic.length} · Jail ${jail.length}`;s.head.disabled=true;
      const records=[...clinic.map((c,i)=>({key:`clinic-${i}`,name:unitName(units,c.unit),title:`Clinic · ${Math.ceil(c.left)}s`,id:null})),...jail.map(p=>({key:`jail-${p.id}`,name:unitName(units,p.unit),title:`Jail · bail ${p.bail}`,tip:`In jail at the Police HQ: bail ${p.bail} ryo (Space at its door)`,id:p.id}))];   // Tim 2026-11-07: the long line wrapped to 3 lines and crowded the cards
      const keys=new Set(records.map(r=>r.key));for(const [id,p]of medical)if(!keys.has(id)){p.el.remove();medical.delete(id);}
      const cards=records.map(r=>{let p=medical.get(r.key);if(!p){const el=document.createElement('div'),name=document.createElement('span'),status=document.createElement('small');name.className='name';status.className='crew-status';el.append(name,status);p={el,name,status};medical.set(r.key,p);}p.el.classList.add('mate','away');p.el.classList.toggle('jailed',!!r.id);if(p.name.textContent!==r.name)p.name.textContent=r.name;if(p.status.textContent!==r.title)p.status.textContent=r.title;/* keep the page's layout-page-hidden class: resetting className every frame showed the card, then paging hid it again, so the panel flashed (Tim 2026-11-07) */p.el.title=r.tip||r.title;if(r.id)p.el.dataset.id=r.id;else delete p.el.dataset.id;return p.el;});syncChildren(s.list,cards);ordered.push(s.el);
    }
    syncChildren(root,ordered);showDestinations();
  }
  return {update};
}
