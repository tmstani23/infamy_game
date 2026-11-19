// Town worker roster. Presentation only; selection stays local and orders go through frontier commands.
import {workerDetails} from './worker_details.js';
import {msConcept} from './menu_shell.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function workerStatus(w,index) {
  if(w.status)return w.status;
  if(w.garrison)return 'Garrisoned in stockade';
  if(w.shelter)return w.shelter.in?'Sheltering in the town hall':'Running to the town hall';   // Tim 2026-11-19
  if(w.nextOrder)return w.nextOrder.kind==='hold'?'Returning load, then holding':'Returning load before move';
  if(w.order?.kind==='hold')return 'Standing';
  if(w.order?.kind==='move')return 'Moving';
  if(w.job)return w.trip?'Going to repair':'Repairing or putting out a fire';   // 7c-4
  if(w.project)return w.buildAt?(w.trip?'Going to build':'Building'):'Clearing ground';
  const kind=index.get(w.spot)?.kind;
  if(kind) return w.carrying>0 ? `Returning ${kind}` : w.trip && w.elapsed>=w.trip.out ? `Harvesting ${kind}` : `Going to ${kind}`;
  return 'Waiting for orders';
}
// Job filter (Tim 2026-11-06): the resource a worker is set to harvest, or null (moving, standing, clearing ground)
export const JOB_ORDER=['timber','stone','fish','forage'];
export function workerJob(w,index) {
  if(w.garrison || w.job || w.project || w.order?.kind==='hold' || w.order?.kind==='move' || w.nextOrder)return null;
  return index.get(w.spot)?.kind || null;
}
// Task filter (7c-4): the harvest job, or 'build' (a camp builder) or 'repair' (repairing or dousing)
// Tim 2026-11-12: a worker carrying anything is listed under what he carries (food goes under its spot's kind, else forage)
const CARRY_KIND={timber:'timber',stone:'stone',food:'forage'};
export const workerTask=(w,index)=>w.job?'repair':w.project && w.buildAt?'build':workerJob(w,index) || (w.carrying>0 ? (index.get(w.spot)?.kind || CARRY_KIND[w.cargoResource || w.trip?.resource] || null) : null);
const TASK_ICON={
 build:'<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><rect x="9.500" y="6" width="3" height="11" rx="1" fill="#a8844a"/><rect x="4" y="2" width="14" height="5" rx="1.500" fill="#9c988c"/></g></svg>',
 repair:'<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><path d="M11 2c2 3 5 4.500 5 8.500a5 5 0 0 1-10 0C6 8 8 7 9 5c.500 1.500 1 2 2 2.500C11 5.500 11 4 11 2z" fill="#e0703a"/><path d="M11 9c1 1.500 2 2 2 3.500a2 2 0 0 1-4 0c0-1 .500-1.500 2-3.500z" fill="#ffd27a"/></g></svg>',
};
// Idle filter (Tim 2026-11-05): standing, waiting for orders, stuck or route blocked
export const workerIdle=(w,index)=>['Route blocked','Stuck','Standing','Waiting for orders','Garrisoned in stockade'].includes(workerStatus(w,index));
// Workers tab redesign (Tim 2026-11-11): job coins on top, red sub-tabs Workers / Groups / Spots / Log, worker cards with a
// portrait, the job icon and an inline progress bar, a Tired chip, one pager. Same info and the same buttons (data-act) as before.
const RES_ICON={
 timber:'<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><rect x="4" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="4" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="9" y="9.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="9" cy="13" rx="2.6" ry="3.5" fill="#d9a866"/><rect x="6.5" y="3.5" width="12" height="7" rx="2" fill="#7a4f2a"/><ellipse cx="6.5" cy="7" rx="2.6" ry="3.5" fill="#d9a866"/></g></svg>',
 stone:'<svg viewBox="0 0 22 16"><g stroke="#2a1d10" stroke-width="1"><path d="M11 1 19 4.5 11 8 3 4.5Z" fill="#d4d0c4"/><path d="M3 4.5 11 8 11 15 3 11.5Z" fill="#9c988c"/><path d="M19 4.5 11 8 11 15 19 11.5Z" fill="#7d796f"/></g></svg>',
 fish:'<svg viewBox="0 0 22 14"><g stroke="#1b2a33" stroke-width="1"><path d="M2 7c3-5 10-6 14-1l4-3v8l-4-3c-4 5-11 4-14-1z" fill="#7fa7b8"/><circle cx="6" cy="6" r="1" fill="#1b2a33"/><path d="M9 4c1 2 1 4 0 6" fill="none"/></g></svg>',
 forage:'<svg viewBox="0 0 22 18"><g stroke="#2a1d10" stroke-width="1"><path d="M3 8h16l-2 8H5z" fill="#a8844a"/><path d="M5 11h12M6 14h10" stroke="#6e5428"/><circle cx="8" cy="6" r="2.4" fill="#b8473a"/><circle cx="12" cy="5" r="2.4" fill="#6f9a45"/><circle cx="15" cy="7" r="2" fill="#c9a03a"/></g></svg>',
};
const resIcon=k=>`<span class="wico">${RES_ICON[k]||TASK_ICON[k]||''}</span>`;
const cap1=k=>k?k[0].toUpperCase()+k.slice(1):'';
const nameOf=id=>/^w\d+$/.test(id)?`Worker ${id.slice(1)}`:`Worker ${id}`;
const HELP='Click a worker to select it, double-click a worker or group to follow it with the camera. Right-click ground to move and wait, or a resource spot to harvest. Right-click a building site to build it, or a damaged or burning building of yours to repair it and put the fire out. Z stops selected workers. Return unloads, then a harvester goes back to its spot. Dropped cargo is lost; you can reassign immediately afterward.';
// camp (7c-4, a war camp's pane): task coins timber, stone, building and repair; spots = the camp's resource spots
// (every one in its reach, rich or not), paged with spotPage. A town shows a Repair coin only while someone repairs.
// filter (Tim 2026-11-12): a job coin shows only those workers until another coin or All is clicked; one filter at a time
export function workerPanelHTML(s,{overworked=new Set(),selected,index,data,page=0,known=()=>true,tab='roster',logPage=0,stockade=false,camp=false,spots=null,spotPage=0,spotState=()=>null,filter=null}) {
  const all=s.workers || [],idle=all.filter(w=>workerIdle(w,index)),workers=tab==='idle'?idle:filter?all.filter(w=>workerTask(w,index)===filter):all,groups=data.workers.groups || 4,rows=data.workers.panelRows || 6;
  const button=(act,id,label,on=false,extra='')=>`<button data-act="build-worker-${act}" data-id="${esc(id)}" aria-pressed="${on}" class="${on?'on':''}"${extra}>${esc(label)}</button>`;
  const pager=(act,at,pages,prev='Prev',next='Next')=>pages>1?`<div class="wpager"><span>Page ${at+1} of ${pages}</span><span>${button(act,Math.max(0,at-1),prev,false,at?'':' disabled')}${button(act,Math.min(pages-1,at+1),next,false,at<pages-1?'':' disabled')}</span></div>`:'';
  // job coins: click selects every worker on that job (Ctrl or Shift adds them), like the old Jobs buttons
  const jobs={};for(const w of all){const k=workerTask(w,index);if(k)(jobs[k] ||= []).push(w.id);}
  const kinds=camp?['timber','stone','build','repair']:[...JOB_ORDER,...(jobs.repair?['repair']:[])];
  const taskName=k=>k==='build'?'Building':k==='repair'?'Repair':cap1(k),taskTip=k=>k==='build'?'Select every worker building':k==='repair'?'Select every worker repairing or putting out a fire':`Select every worker harvesting ${k}`;
  const coin=(act,id,v,label,icon,on,tip,cls='')=>`<button class="wcoin${cls}${on?' on':''}" data-act="build-worker-${act}" data-id="${esc(id)}" aria-pressed="${on}" title="${esc(tip)}">${icon}<b>${v}</b><span>${esc(label)}</span></button>`;
  const coins=`<div class="wcoins"${kinds.length!==4?` style="grid-template-columns:repeat(${kinds.length+2},minmax(0,1fr))"`:''}>${coin('all','',all.length,'All','',!filter && tab!=='idle',camp?'Show and select every worker of this camp':'Show and select every worker in this town')}`
    +kinds.map(k=>coin('job',k,(jobs[k]||[]).length,taskName(k),resIcon(k),filter===k && tab!=='idle',`${taskTip(k)} and show only them; Ctrl+click adds them`,jobs[k]?.length?'':' none')).join('')
    +coin('tab','idle',idle.length,'Idle','',tab==='idle',idle.length?'Workers standing, waiting for orders or stuck: show only them':'Nobody is idle',idle.length?' idle':' none')+'</div>';
  const T=(id,label,tip='')=>`<button role="tab" data-act="build-worker-tab" data-id="${id}" aria-selected="${tab===id || (id==='roster' && tab==='idle')}" class="${tab===id || (id==='roster' && tab==='idle')?'on':''}"${tip?` title="${esc(tip)}"`:''}>${label}</button>`;
  const tabs=`<div class="wtabs" role="tablist" aria-label="Worker views">${T('roster',`Workers ${all.length}`,HELP)}${T('groups','Groups')}${T('spots','Spots')}${T('log','Log')}</div>`;
  const head=`<div class="workerroster">${coins}${tabs}`;
  const options=value=>Array.from({length:groups+1},(_,g)=>`<option value="${g}" ${g===value?'selected':''}>${g?'Group '+g:'No group'}</option>`).join('');
  if(tab==='log') {
    const entries=[...(s.workerLog || [])].reverse(),pages=Math.max(1,Math.ceil(entries.length/rows));logPage=Math.max(0,Math.min(logPage,pages-1));
    const time=tick=>{const seconds=Math.floor(tick/20);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
    return head+`<div class="wsec" title="Newest first, match time, last ${data.workers.logEntries || 64} deliveries. Deposited resources are already in town stock."><span>Delivery log</span><b>newest first</b></div>`
      +entries.slice(logPage*rows,(logPage+1)*rows).map(e=>`<div class="wlog">${resIcon(e.resource)}<span>Worker ${esc(e.worker)}<small>${time(e.tick)}</small></span><b>${esc(e.amount)} ${esc(e.resource)} returned</b></div>`).join('')
      +(!entries.length?'<div class="hint">No deliveries recorded yet.</div>':'')
      +pager('log-page',logPage,pages,'Newer','Older')+'</div>';
  }
  if(tab==='groups') {
    const card=g=>{const mem=all.filter(w=>w.group===g),on=mem.length>0 && mem.every(w=>selected.includes(w.id));
      const kinds={};for(const w of mem){const k=workerJob(w,index);if(k)kinds[k]=(kinds[k]||0)+1;}
      return `<button class="wgroup${on?' on':''}" data-act="build-worker-group" data-id="${g}" aria-pressed="${on}" title="Click selects the group, double-click follows it with the camera"><b>Group ${g}</b><span class="wbig">${mem.length}</span><small>${Object.entries(kinds).map(([k,n])=>`${resIcon(k)}${n}`).join(' ') || (mem.length?'not harvesting':'empty')}</small></button>`;};
    return head+`<div class="wsec" title="Assign workers to a group from their card on the Workers tab, or select several and use Assign selected"><span>Groups</span><b>${all.filter(w=>w.group).length} grouped</b></div><div class="wgroups">${Array.from({length:groups},(_,i)=>card(i+1)).join('')}</div>`+selectionBar()+'</div>';
  }
  if(tab==='spots' && spots) {   // a war camp: every resource spot in its reach, nearest first, rich or not
    const per=rows,list=[...spots].sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)),pages=Math.max(1,Math.ceil(list.length/per));spotPage=Math.max(0,Math.min(spotPage,pages-1));
    return head+`<div class="wsec" title="Every timber and stone spot your camp workers can reach in the war circle, rich or not. Click Look to move the camera there; select workers and right-click its pieces to send them."><span>Resources near the camp</span><b>${list.length} spots</b></div><div class="wspots">`
      +(list.slice(spotPage*per,(spotPage+1)*per).map(p=>{const n=all.filter(w=>w.spot===p.id).length,over=overworked.has(p.id),st=spotState(p);
        return `<div class="wspot${over?' tired':''}" title="${esc(p.id)}">${resIcon(p.kind)}<span><b>${cap1(p.kind)}${st?.rich?' (rich)':''}</b><small>${Math.round(Math.hypot(p.x-s.x,p.z-s.z))} away, ${st?.yieldText?st.yieldText+', ':''}${n} working${over?', too many':''}</small></span>${button('spot',p.id,'Look',false,` data-kind="${esc(p.kind)}"`)}</div>`;}).join('') || '<div class="hint">No timber or stone in reach of the camp.</div>')
      +'</div>'+pager('spot-page',spotPage,pages)+'</div>';
  }
  if(tab==='spots') {
    const spots=index.spotsNear(s.x,s.z,data.workers.range).filter(p=>known(p.x,p.z));
    const list=JOB_ORDER.flatMap(kind=>spots.filter(p=>p.kind===kind).sort((a,b)=>Math.hypot(a.x-s.x,a.z-s.z)-Math.hypot(b.x-s.x,b.z-s.z)).slice(0,2));
    return head+'<div class="wsec" title="Click Look to move the camera there; right-click its pieces to assign selected workers."><span>Nearby discovered spots</span><b>two closest of each</b></div><div class="wspots">'
      +(list.map(p=>{const n=all.filter(w=>w.spot===p.id).length,over=overworked.has(p.id);
        return `<div class="wspot${over?' tired':''}" title="${esc(p.id)}">${resIcon(p.kind)}<span><b>${cap1(p.kind)}</b><small>${Math.round(Math.hypot(p.x-s.x,p.z-s.z))} away, ${n} working${over?', too many':''}</small></span>${button('spot',p.id,'Look',false,` data-kind="${esc(p.kind)}"`)}</div>`;}).join('') || '<div class="hint">No discovered spots nearby.</div>')+'</div></div>';
  }
  function selectionBar(){
    const here=all.filter(w=>selected.includes(w.id)),carry=here.some(w=>w.carrying>0);
    // always takes its space so selecting never shifts the cards under the mouse (Tim 2026-11-05)
    return `<div class="wselbar"${here.length?'':' style="visibility:hidden" aria-hidden="true"'}><span><b>${here.length}</b> selected</span>${button('stop','','Stop (Z)')}${button('return','','Return',false,carry?'':' disabled')}${button('drop','','Drop...',false,carry?'':' disabled')}${!camp?button('hall','','To hall',false,` title="Send the selected workers into the town hall: they hand in their loads and wait inside, safe, until Back to work"`):''}${stockade?button('stockade','','To stockade',false,` title="Send the selected workers into the stockade (they must be close to it)"`):''}<select data-act="build-worker-assign-selected" aria-label="Assign selected workers to group"${here.length?'':' disabled'}><option value="">Assign selected</option>${options(-1)}</select></div>`;
  }
  const pages=Math.max(1,Math.ceil(workers.length/rows));page=Math.max(0,Math.min(page,pages-1));
  const face=msConcept('laborer');
  const cards=workers.slice(page*rows,(page+1)*rows).map(w=>{const d=workerDetails(w,index),kind=index.get(w.spot)?.kind,tired=overworked.has(w.spot),on=selected.includes(w.id);
    const where=[w.spot?`spot ${w.spot}`:'',w.entity==null?'offscreen':''].filter(Boolean).join(', ');
    return `<div class="wcard${on?' sel':''}${tired?' tired':''}"${where?` title="${esc(where)}"`:''}>`
      +`<button class="wface" data-act="build-worker-select" data-id="${esc(w.id)}" aria-pressed="${on}" title="Click selects, double-click follows with the camera"${face?` style="background-image:url('${face}')"`:''}></button>`
      +`<div class="wmain"><div class="wtop"><b>${esc(nameOf(w.id))}</b>${tired?'<span class="wchip" title="Too many workers on this vein: extra workers add little. Move some to another spot.">Tired</span>':''}</div>`
      +`<div class="wjob">${kind?resIcon(kind):''}<span>${esc(workerStatus(w,index))}${w.carrying?`, carrying ${w.carrying} ${esc(d.resource)}`:''}</span></div>`
      // the harvest line always takes its space so cards never grow when it appears (Tim 2026-11-05)
      +(d.harvesting?`<div class="wprog"><i style="width:${Math.round(Math.max(0,Math.min(1,d.progress))*100)}%"></i></div><small class="harvestline">${d.left}s left, ${d.gathered.toFixed(1)} / ${w.trip.load}</small>`:'<div class="wprog off"><i></i></div><small class="harvestline" style="visibility:hidden">-</small>')
      +`<select class="wgrp" data-act="build-worker-assign" data-id="${esc(w.id)}" aria-label="Group for ${esc(w.id)}" title="Put this worker in a group">${options(w.group || 0)}</select>`
      +'</div></div>';}).join('');
  return head+(cards?`<div class="wcards">${cards}</div>`:`<div class="hint">${tab==='idle'?'Nobody is idle.':camp?'No workers yet. Hire some on the left.':'No workers yet. Train one at the town hall.'}</div>`)
    +pager('page',page,pages)+selectionBar()+'</div>';
}
