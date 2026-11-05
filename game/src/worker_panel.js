// Town worker roster. Presentation only; selection stays local and orders go through frontier commands.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function workerStatus(w,index) {
  if(w.status)return w.status;
  if(w.nextOrder)return 'Returning load before move';
  if(w.order?.kind==='hold')return 'Standing';
  if(w.order?.kind==='move')return 'Moving';
  if(w.project)return 'Clearing ground';
  const kind=index.get(w.spot)?.kind;
  if(kind) return w.carrying>0 ? `Returning ${kind}` : w.trip && w.elapsed>=w.trip.out ? `Harvesting ${kind}` : `Going to ${kind}`;
  return 'Waiting for orders';
}
export function workerPanelHTML(s,{selected,index,data,page=0,known=()=>true}) {
  const workers=s.workers || [],groups=data.workers.groups || 4,rows=data.workers.panelRows || 6;
  const pages=Math.max(1,Math.ceil(workers.length/rows));page=Math.max(0,Math.min(page,pages-1));
  const button=(act,id,label,on=false)=>`<button data-act="build-worker-${act}" data-id="${esc(id)}" aria-pressed="${on}" class="${on?'on':''}">${esc(label)}</button>`;
  const options=value=>Array.from({length:groups+1},(_,g)=>`<option value="${g}" ${g===value?'selected':''}>${g?'Group '+g:'Ungrouped'}</option>`).join('');
  const selectedHere=workers.filter(w=>selected.includes(w.id));
  const groupButtons=Array.from({length:groups},(_,i)=>i+1).map(g=>{
    const ids=workers.filter(w=>w.group===g).map(w=>w.id);
    return button('group',g,`Group ${g} (${ids.length})`,ids.length>0 && ids.every(id=>selected.includes(id)));
  }).join('');
  const roster=workers.slice(page*rows,(page+1)*rows).map(w=>`<div class="workerrow">`
    + button('select',w.id,w.id,selected.includes(w.id))
    + `<span>${esc(workerStatus(w,index))}<small>${esc(w.spot || '')}${w.carrying?' · cargo '+w.carrying:''}${w.entity==null?' · offscreen':''}</small></span>`
    + `<select data-act="build-worker-assign" data-id="${esc(w.id)}" aria-label="Group for ${esc(w.id)}">${options(w.group || 0)}</select></div>`).join('');
  const spots=index.spotsNear(s.x,s.z,data.workers.range).filter(p=>known(p.x,p.z));
  const resources=['timber','stone','fish','forage'].flatMap(kind=>spots.filter(p=>p.kind===kind).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)).slice(0,2));
  return `<div class="workerroster"><h3>Workers · ${workers.length}</h3><div class="workergroups">${button('all','',`All (${workers.length})`)}${groupButtons}</div>`
    + (selectedHere.length ? `<div class="workergroups">${selectedHere.length} selected ${button('stop','','Stop / stand (Z)')}<label>Assign selected: <select data-act="build-worker-assign-selected" aria-label="Assign selected workers to group"><option value="">Choose group</option>${options(-1)}</select></label></div>` : '')
    + (roster || '<div class="hint">No workers yet. Train one at the town hall.</div>')
    + (pages>1?`<div class="pager">${button('page',Math.max(0,page-1),'Previous')} ${page+1}/${pages} ${button('page',Math.min(pages-1,page+1),'Next')}</div>`:'')
    + `<div class="hint">Select workers here or in the world. Right-click ground to move and wait, or a resource spot to harvest. Z stops selected workers.</div>`
    + `<div class="workergroups">Nearby discovered spots: ${resources.map(p=>button('spot',p.id,`${p.kind} · ${Math.round(Math.hypot(p.x-s.x,p.z-s.z))} units`)).join('') || 'none'}</div><div class="hint">Click a spot button to look there; right-click its pieces to assign selected workers.</div></div>`;
}
