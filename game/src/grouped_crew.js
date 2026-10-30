import { unitName,unitStatus } from './selection_panel.js';
import { isRallyParticipant } from './sim/deployment_rally.js';
import { syncChildren } from './stable_list.js';

// Tim 2026-10-28: double-click a group header = the camera follows that group; drag a pip onto
// another group = transfer (the crew take that group's duty from the Deployment menu)
// Tim 2026-10-30: selected crew get a gold box and the rest of their group dims; tabs 1-4 show the
// control groups (click selects, Ctrl+click assigns, again dissolves); a drag shows gold where the crew
// fit and red where they don't, and a refused drop flashes red with the reason.
const CSS=`
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
  #partyframes .crew-drop-note:empty{display:none}`;
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
    head.addEventListener('click',()=>{
      const crew=Object.values(game.state.entities).filter(e=>e.owner===game.state.entities[heroId]?.owner&&e.type!=='hero'&&!e.guard&&!e.dead&&!e.downed&&!e.jailed&&!e.deployment?.transfer&&key(e)===id);
      crewInput.select(crew.map(e=>e.id));
    });const note=document.createElement('div');note.className='crew-drop-note';el.append(head,list,note);root.appendChild(el);const s={el,head,list,label,note,headKey:''};sections.set(id,s);return s;
  };
  const key=e=>{
    const r=game.state.deployment.clans[e.owner]?.rally;
    return r?.active&&(e.deployment?.group==='hero'||isRallyParticipant(game.state,e))?'rally':e.deployment?.group||'home';
  };
  const droppable=id=>id&&id!=='rally'&&id!=='medical';
  let dragged=null;
  root.addEventListener('dragstart',e=>{const id=e.target.closest?.('.mate')?.dataset.id;if(!id||!game.state.entities[id]){e.preventDefault();return;}
    const sel=crewInput.selected();dragged=sel.includes(id)?sel.filter(x=>game.state.entities[x]?.type!=='hero'):[id];
    e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged.join(','));});
  const moving=to=>(dragged||[]).filter(id=>{const u=game.state.entities[id];return u&&(u.deployment?.group||'home')!==to;});
  const check=to=>{const ids=moving(to);return ids.length?game.deployment?.canTransfer?.(heroId,ids,to)||{ok:true,why:''}:{ok:true,why:''};};
  root.addEventListener('dragover',e=>{const sec=e.target.closest?.('.crew-section'),to=sec?.dataset.group;if(!dragged||!droppable(to))return;e.preventDefault();
    const ok=check(to).ok;for(const s of sections.values()){s.el.classList.toggle('drop-target',s.el===sec&&ok);s.el.classList.toggle('drop-full',s.el===sec&&!ok);}});
  const clearDrop=()=>{for(const s of sections.values())s.el.classList.remove('drop-target','drop-full');};
  const refuse=(s,why)=>{s.el.classList.add('drop-refused');s.note.textContent=why;clearTimeout(s.flash);
    s.flash=setTimeout(()=>{s.el.classList.remove('drop-refused');s.note.textContent='';},1200);};
  root.addEventListener('dragleave',e=>{if(!root.contains(e.relatedTarget))clearDrop();});
  root.addEventListener('dragend',()=>{dragged=null;clearDrop();});
  root.addEventListener('drop',e=>{const to=e.target.closest?.('.crew-section')?.dataset.group;e.preventDefault();clearDrop();
    const ids=moving(to),can=droppable(to)&&ids.length?check(to):null;dragged=null;if(!can)return;
    if(!can.ok){refuse(sections.get(to),can.why);return;}
    send({id:heroId,type:'deployment',action:'transfer',units:ids,to});});
  function update(crew,clinic,jail){
    root.classList.add('grouped');
    const names={rally:'Rally force',hero:'Hero group',...Object.fromEntries(game.state.deployment.sectors.map(s=>[s.id,s.name])),home:'HQ reserves'};
    const ordered=[],live=new Set(crew.map(e=>e.id)),selected=new Set(crewInput.selected());
    for(const [id,p]of pips)if(!live.has(id)){p.el.remove();pips.delete(id);}
    const sizes=[0,0,0,0];for(const e of crew){const g=crewInput.groupOf(e.id);if(g)sizes[g-1]++;}
    const picked=crew.filter(e=>selected.has(e.id));
    tabButtons.forEach((b,i)=>{const n=sizes[i],key=`${i+1}|${n}`;if(b.dataset.key!==key){b.dataset.key=key;b.textContent=String(i+1);if(n){const c=document.createElement('small');c.textContent=n;b.appendChild(c);}}
      b.classList.toggle('empty',!n);b.classList.toggle('on',!!n&&picked.length>0&&crew.every(e=>(crewInput.groupOf(e.id)===i+1)===selected.has(e.id)));});
    ordered.push(tabs);
    for(const [id,label]of Object.entries(names)){
      const members=crew.filter(e=>key(e)===id);if(!members.length)continue;
      const s=createSection(id,label),chosen=members.filter(e=>selected.has(e.id)).length,partial=chosen>0&&chosen<members.length,headKey=`${label}|${members.length}|${partial?chosen:''}`;
      if(s.headKey!==headKey){s.headKey=headKey;s.head.textContent=`${label} · ${members.length}`;if(partial){const b=document.createElement('b');b.textContent=` · ${chosen} selected`;s.head.appendChild(b);}}
      s.head.setAttribute('aria-pressed',String(chosen>0));s.el.classList.toggle('selected',chosen>0);
      const nodes=members.map(e=>{
        let p=pips.get(e.id);if(!p){const el=document.createElement('div'),name=document.createElement('span'),hp=document.createElement('div'),group=document.createElement('b'),status=document.createElement('small');el.className='mate';el.draggable=true;name.className='name';hp.className='pip';group.className='group';status.className='crew-status';el.append(name,hp,group,status);p={el,name,hp,group,status};pips.set(e.id,p);}
        p.el.dataset.id=e.id;p.name.textContent=unitName(units,e.type);p.hp.style.setProperty('--hp',`${Math.max(0,e.hp/e.maxHp*100)}%`);
        const status=unitStatus(e,game.state),location=where(e);if(p.status.textContent!==status)p.status.textContent=status;
        p.group.textContent=crewInput.groupOf(e.id)||'';p.el.classList.toggle('picked',selected.has(e.id));p.el.classList.toggle('dim',partial&&!selected.has(e.id));p.el.classList.toggle('down',!!e.downed);p.el.classList.toggle('hurt',e.hp/e.maxHp<.5);
        p.el.title=`${p.name.textContent} · ${Math.ceil(e.hp)}/${e.maxHp} HP · ${label} · ${status}${location?' · '+location:''}. Click selects and shows them in the target frame; Shift+click adds or removes; double-click also follows with the camera; drag onto another group to transfer.`;return p.el;
      });syncChildren(s.list,nodes);ordered.push(s.el);
    }
    if(clinic.length||jail.length){
      const s=createSection('medical','Unavailable');s.head.textContent=`Clinic ${clinic.length} · Jail ${jail.length}`;s.head.disabled=true;
      const records=[...clinic.map((c,i)=>({key:`clinic-${i}`,name:unitName(units,c.unit),title:`Clinic · ${Math.ceil(c.left)}s`,id:null})),...jail.map(p=>({key:`jail-${p.id}`,name:unitName(units,p.unit),title:`Police HQ · In jail · bail ${p.bail} ryo`,id:p.id}))];
      const keys=new Set(records.map(r=>r.key));for(const [id,p]of medical)if(!keys.has(id)){p.el.remove();medical.delete(id);}
      const cards=records.map(r=>{let p=medical.get(r.key);if(!p){const el=document.createElement('div'),name=document.createElement('span'),status=document.createElement('small');name.className='name';status.className='crew-status';el.append(name,status);p={el,name,status};medical.set(r.key,p);}p.el.className='mate away'+(r.id?' jailed':'');p.name.textContent=r.name;p.status.textContent=r.title;p.el.title=r.title;if(r.id)p.el.dataset.id=r.id;else delete p.el.dataset.id;return p.el;});syncChildren(s.list,cards);ordered.push(s.el);
    }
    syncChildren(root,ordered);
  }
  return {update};
}
