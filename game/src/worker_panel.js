// Town worker roster. Presentation only; selection stays local and orders go through frontier commands.
import {workerDetails} from './worker_details.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function workerStatus(w,index) {
  if(w.status)return w.status;
  if(w.nextOrder)return w.nextOrder.kind==='hold'?'Returning load, then holding':'Returning load before move';
  if(w.order?.kind==='hold')return 'Standing';
  if(w.order?.kind==='move')return 'Moving';
  if(w.project)return 'Clearing ground';
  const kind=index.get(w.spot)?.kind;
  if(kind) return w.carrying>0 ? `Returning ${kind}` : w.trip && w.elapsed>=w.trip.out ? `Harvesting ${kind}` : `Going to ${kind}`;
  return 'Waiting for orders';
}
// Idle filter (Tim 2026-11-05): standing, waiting for orders, stuck or route blocked
export const workerIdle=(w,index)=>['Route blocked','Stuck','Standing','Waiting for orders'].includes(workerStatus(w,index));
export function workerPanelHTML(s,{selected,index,data,page=0,known=()=>true,tab='roster',logPage=0}) {
  const all=s.workers || [],workers=tab==='idle'?all.filter(w=>workerIdle(w,index)):all,groups=data.workers.groups || 4,rows=data.workers.panelRows || 6;
  const pages=Math.max(1,Math.ceil(workers.length/rows));page=Math.max(0,Math.min(page,pages-1));
  const button=(act,id,label,on=false)=>`<button data-act="build-worker-${act}" data-id="${esc(id)}" aria-pressed="${on}" class="${on?'on':''}">${esc(label)}</button>`;
  const tabs=`<div class="workergroups" role="tablist" aria-label="Worker views"><button role="tab" data-act="build-worker-tab" data-id="roster" aria-selected="${tab==='roster'}">Workers</button><button role="tab" data-act="build-worker-tab" data-id="idle" aria-selected="${tab==='idle'}" title="Workers standing, waiting for orders or stuck">Idle (${all.filter(w=>workerIdle(w,index)).length})</button><button role="tab" data-act="build-worker-tab" data-id="log" aria-selected="${tab==='log'}">Log</button></div>`;
  if(tab==='log') {
    const entries=[...(s.workerLog || [])].reverse(),pages=Math.max(1,Math.ceil(entries.length/rows));logPage=Math.max(0,Math.min(logPage,pages-1));
    const time=tick=>{const seconds=Math.floor(tick/20);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
    return `<div class="workerroster"><h3>Workers · Delivery log</h3>${tabs}<div class="hint">Newest first · match time · last ${data.workers.logEntries || 64} deliveries. Deposited resources are already in town stock.</div>`
      +entries.slice(logPage*rows,(logPage+1)*rows).map(e=>`<div class="row"><span>${time(e.tick)} · Worker ${esc(e.worker)}</span><b>${esc(e.amount)} ${esc(e.resource)} returned</b></div>`).join('')
      +(!entries.length?'<div class="hint">No deliveries recorded yet.</div>':'')
      +(pages>1?`<div class="pager">${button('log-page',Math.max(0,logPage-1),'Newer')} ${logPage+1}/${pages} ${button('log-page',Math.min(pages-1,logPage+1),'Older')}</div>`:'')+'</div>';
  }
  const options=value=>Array.from({length:groups+1},(_,g)=>`<option value="${g}" ${g===value?'selected':''}>${g?'Group '+g:'Ungrouped'}</option>`).join('');
  const selectedHere=workers.filter(w=>selected.includes(w.id));
  const groupButtons=Array.from({length:groups},(_,i)=>i+1).map(g=>{
    const ids=all.filter(w=>w.group===g).map(w=>w.id);
    return button('group',g,`Group ${g} (${ids.length})`,ids.length>0 && ids.every(id=>selected.includes(id)));
  }).join('');
  const roster=workers.slice(page*rows,(page+1)*rows).map(w=>{const detail=workerDetails(w,index);return `<div class="workerrow">`
    + button('select',w.id,w.id,selected.includes(w.id))
    + `<span>${esc(workerStatus(w,index))}<small>${esc(w.spot || '')}${w.carrying?' · carrying '+w.carrying+' '+esc(detail.resource):''}${w.entity==null?' · offscreen':''}</small>`
    + (detail.harvesting?`<small>${detail.left}s left · load progress ${detail.gathered.toFixed(2)} / ${w.trip.load}<progress value="${detail.progress}" max="1"></progress></small>`:'')+'</span>'
    + `<select data-act="build-worker-assign" data-id="${esc(w.id)}" aria-label="Group for ${esc(w.id)}">${options(w.group || 0)}</select></div>`;}).join('');
  const spots=index.spotsNear(s.x,s.z,data.workers.range).filter(p=>known(p.x,p.z));
  const resources=['timber','stone','fish','forage'].flatMap(kind=>spots.filter(p=>p.kind===kind).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)).slice(0,2));
  return `<div class="workerroster"><h3>Workers · ${workers.length}</h3>${tabs}<div class="workergroups">${button('all','',`All (${workers.length})`)}${groupButtons}</div>`
    + (selectedHere.length ? `<div class="workergroups">${selectedHere.length} selected ${button('stop','','Stop / stand (Z)')}${selectedHere.some(w=>w.carrying>0)?button('return','','Return resources')+button('drop','','Drop resources…'):''}<label>Assign selected: <select data-act="build-worker-assign-selected" aria-label="Assign selected workers to group"><option value="">Choose group</option>${options(-1)}</select></label></div>` : '')
    + (roster || '<div class="hint">No workers yet. Train one at the town hall.</div>')
    + (pages>1?`<div class="pager">${button('page',Math.max(0,page-1),'Previous')} ${page+1}/${pages} ${button('page',Math.min(pages-1,page+1),'Next')}</div>`:'')
    + `<div class="hint">Double-click a worker or group to follow it with the camera. Right-click ground to move and wait, or a resource spot to harvest. Z stops selected workers. Return resources unloads then holds. Dropped cargo is lost; you can reassign immediately afterward.</div>`
    + `<div class="workergroups">Nearby discovered spots: ${resources.map(p=>button('spot',p.id,`${p.kind} · ${Math.round(Math.hypot(p.x-s.x,p.z-s.z))} units`)).join('') || 'none'}</div><div class="hint">Click a spot button to look there; right-click its pieces to assign selected workers.</div></div>`;
}
