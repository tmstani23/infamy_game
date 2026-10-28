import { unitName } from './selection_panel.js';
import { isRallyParticipant } from './sim/deployment_rally.js';
import { syncChildren } from './stable_list.js';

export function createGroupedCrew({root,game,heroId,units,crewInput}) {
  const sections=new Map(),pips=new Map(),medical=new Map();
  const createSection=(id,label)=>{
    if(sections.has(id))return sections.get(id);
    const el=document.createElement('section'),head=document.createElement('button'),list=document.createElement('div');
    el.className='crew-section';head.className='crew-group-select';head.type='button';list.className='crew-group-pips';
    head.addEventListener('click',()=>{
      const crew=Object.values(game.state.entities).filter(e=>e.owner===game.state.entities[heroId]?.owner&&e.type!=='hero'&&!e.guard&&!e.dead&&!e.downed&&!e.jailed&&!e.deployment?.transfer&&key(e)===id);
      crewInput.select(crew.map(e=>e.id));
    });el.append(head,list);root.appendChild(el);const s={el,head,list,label};sections.set(id,s);return s;
  };
  const key=e=>{
    const r=game.state.deployment.clans[e.owner]?.rally;
    return r?.active&&(e.deployment?.group==='hero'||isRallyParticipant(game.state,e))?'rally':e.deployment?.group||'home';
  };
  function update(crew,clinic,jail){
    root.classList.add('grouped');
    const names={rally:'Rally force',hero:'Hero group',...Object.fromEntries(game.state.deployment.sectors.map(s=>[s.id,s.name])),home:'HQ reserves'};
    const ordered=[],live=new Set(crew.map(e=>e.id)),selected=new Set(crewInput.selected());
    for(const [id,p]of pips)if(!live.has(id)){p.el.remove();pips.delete(id);}
    for(const [id,label]of Object.entries(names)){
      const members=crew.filter(e=>key(e)===id);if(!members.length)continue;
      const s=createSection(id,label);s.head.textContent=`${label} · ${members.length}`;s.head.setAttribute('aria-pressed',String(members.some(e=>selected.has(e.id))));
      s.el.classList.toggle('selected',members.some(e=>selected.has(e.id)));
      const nodes=members.map(e=>{
        let p=pips.get(e.id);if(!p){const el=document.createElement('div'),name=document.createElement('span'),hp=document.createElement('div'),group=document.createElement('b');el.className='mate';name.className='name';hp.className='pip';group.className='group';el.append(name,hp,group);p={el,name,hp,group};pips.set(e.id,p);}
        p.el.dataset.id=e.id;p.name.textContent=unitName(units,e.type);p.hp.style.setProperty('--hp',`${Math.max(0,e.hp/e.maxHp*100)}%`);
        p.group.textContent=crewInput.groupOf(e.id)||'';p.el.classList.toggle('picked',selected.has(e.id));p.el.classList.toggle('down',!!e.downed);p.el.classList.toggle('hurt',e.hp/e.maxHp<.5);
        p.el.title=`${p.name.textContent} · ${Math.ceil(e.hp)}/${e.maxHp} HP · ${label}. Click selects group; double-click selects individual.`;return p.el;
      });syncChildren(s.list,nodes);ordered.push(s.el);
    }
    if(clinic.length||jail.length){
      const s=createSection('medical','Unavailable');s.head.textContent=`Clinic ${clinic.length} · Jail ${jail.length}`;s.head.disabled=true;
      const records=[...clinic.map((c,i)=>({key:`clinic-${i}`,name:unitName(units,c.unit),title:`At clinic · ${Math.ceil(c.left)}s`,id:null})),...jail.map(p=>({key:`jail-${p.id}`,name:unitName(units,p.unit),title:`In jail · bail ${p.bail} ryo`,id:p.id}))];
      const keys=new Set(records.map(r=>r.key));for(const [id,el]of medical)if(!keys.has(id)){el.remove();medical.delete(id);}
      const cards=records.map(r=>{let el=medical.get(r.key);if(!el){el=document.createElement('div');medical.set(r.key,el);}el.className=`mate away${r.id?' jailed':''}`;el.textContent=r.name;el.title=r.title;if(r.id)el.dataset.id=r.id;else delete el.dataset.id;return el;});syncChildren(s.list,cards);ordered.push(s.el);
    }
    syncChildren(root,ordered);
  }
  return {update};
}
