import { unitName } from './selection_panel.js';
import { TASK_LABELS } from './deployment_map_data.js';
import { syncChildren } from './stable_list.js';

// One focused command group. Transfer destination picking never changes the
// source selection. All success feedback comes back from the simulation.
export function createDeploymentPanel({ root, button, game, units, heroId, crewInput, send,
  onPickPoint, onPickDestination, onCancelPick = () => {}, onOpen = () => {}, onClose = () => {}, onFocus = () => {}, onInspect = () => {} }) {
  root.innerHTML = '<header><h3>DEPLOYMENT</h3><button type="button" class="close" aria-label="Close deployment">✕</button></header><div class="tabs"></div>'
    + '<section class="first-zone" hidden><h4>Choose your first assignment zone</h4><p>Your hero group is full. Choose where spare crew should deploy first, or transfer one there manually.</p><div class="first-zone-options"></div></section>'
    + '<section class="group-summary"><h4></h4><strong></strong><span></span></section><div class="acceptance" role="status" aria-live="polite" hidden></div>'
    + '<section class="crew-selection"><div class="roster-heading"><b>Crew selected</b><button type="button" class="select-group">Select group</button></div><div class="roster"></div><button type="button" class="transfer-start">Transfer selected crew</button><button type="button" class="assign-here">Assign crew here</button><button type="button" class="return-assignment">Return to duty</button></section>'
    + '<section class="assign-mode" hidden><h4>Assign crew here</h4><p class="assign-destination"></p><label>From group <select class="assign-source" aria-label="Source group for assignment"></select></label><div class="assign-roster"></div><strong class="assign-preview"></strong><p class="assign-why"></p><button type="button" class="confirm-assignment">Assign selected crew</button><button type="button" class="cancel-assignment">Cancel</button></section>'
    + '<section class="active-transfers" hidden><h4>Traveling crew</h4><div class="travel-roster"></div></section>'
    + '<section class="transfer-mode" hidden><h4>Choose transfer destination</h4><p class="transfer-source"></p><div class="destinations"></div><button type="button" class="pick-destination">Choose sector on map</button><strong class="transfer-preview"></strong><p class="transfer-why"></p><button type="button" class="confirm-transfer">Confirm transfer</button><button type="button" class="cancel-transfer">Cancel</button></section>'
    + '<section class="duty" hidden><h4>Sector duty</h4><label>Active duty <select class="task" aria-label="Active sector duty"></select></label><label class="business-label">Business <select class="guard-business"></select></label><form class="staffing-goal"><label>Staffing goal <input class="staffing-target" type="number" min="0" step="1"></label><button type="submit">Set goal</button></form><small class="assignment-points"></small><details><summary>Patrol route / duty point</summary><button type="button" data-point="objective">Choose duty point</button><button type="button" data-point="route">Add route point</button><button type="button" class="clear-route">Clear route</button></details><div class="shinobi-ops" hidden><b class="hunt-target"></b><button type="button" class="arm-next">Ambush next enemy</button><button type="button" class="cancel-ambush">Cancel hunt</button><button type="button" class="retreat">Retreat</button><small class="ambush-preview"></small><div class="recent-targets"></div></div></section>'
    + '<section class="sweep-ops" hidden><h4>Kuroda Sweep</h4><label>Rival clan <select class="sweep-clan" aria-label="Sweep rival clan"></select></label><label>Adjacent sector <select class="sweep-sector" aria-label="Sweep target sector"></select></label><button type="button" class="start-sweep">Dispatch Sweep</button><button type="button" class="cancel-sweep">Recall squad</button><small class="sweep-preview"></small></section>'
    + '<section class="shakedown-ops" hidden><h4>Yakuza Shakedown</h4><label>Rival business <select class="shakedown-business" aria-label="Shakedown target business"></select></label><button type="button" class="start-shakedown">Start Shakedown</button><button type="button" class="cancel-shakedown">Recall squad</button><small class="shakedown-preview"></small></section>'
    + '<details class="rally-controls"><summary>Rally <span class="rally-status"></span></summary><div class="rally-groups"></div><button type="button" class="call-rally">Call Rally</button><small>3 minutes including travel.</small></details>'
    + '<details class="reserves"><summary>HQ reserves</summary><form><label>Keep <input class="reserve-target" type="number" min="0" step="1"> ready crew</label><button type="submit">Apply</button></form></details><footer></footer>';
  const $ = s => root.querySelector(s), owner = () => game.state.entities[heroId]?.owner;
  const config = () => game.state.deployment.clans[owner()], record = id => config().sectors[id];
  const names = { hero:'Hero group', home:'HQ reserves', ...Object.fromEntries(game.state.deployment.sectors.map(s => [s.id,s.name])) };
  const members = id => game.deployment.members(owner(), id);
  const available = e => !e.dead && !e.downed && !e.jailed && !e.deployment.transfer;
  const chosen = () => crewInput.selected().filter(id => members().some(e => e.id === id));
  const ninja = game.state.clans[owner()].kind === 'ninja', rows=new Map(), tabs=new Map(), destinations=new Map(), rallyChecks=new Map(), targetRows=new Map(), incomingRows=new Map(), travelRows=new Map();
  let focus='hero', open=false, transfer=null, incoming=null, latestTransfer=[], request=0, lastRefresh=null, feedbackSequence=config().feedback?.sequence || 0;
  let reserveDirty=false,staffingDirty=false;
  const issue = c => {
    send({id:heroId,type:'deployment',...c,request:`panel-${++request}`});
    $('.acceptance').hidden=false; $('.acceptance').className='acceptance pending'; $('.acceptance').textContent='ORDER PENDING…';
  };
  function selectGroup(id) {
    const ids=members(id).filter(available).map(e=>e.id);crewInput.select(ids);onInspect(ids[0]||null);
  }
  function setFocus(id, select=true) {
    if (!Object.hasOwn(names,id)) return;
    focus=id; transfer=null; incoming=null; staffingDirty=false; onCancelPick();
    if(record(id)&&game.deployment.needsFirstSector?.(owner()))issue({action:'autoSector',sector:id});
    if(select)selectGroup(id);
    if(record(id))onFocus(id);
    lastRefresh=null; update(true);
  }
  for(const [id,name] of Object.entries(names)) {
    if(record(id)){const first=document.createElement('button');first.type='button';first.textContent=name;first.addEventListener('click',()=>setFocus(id));$('.first-zone-options').appendChild(first);}
    $('.assign-source').add(new Option(name,id));
    const tab=document.createElement('button'); tab.type='button'; tab.addEventListener('click',()=>setFocus(id)); $('.tabs').appendChild(tab);tabs.set(id,tab);
    const destination=document.createElement('button'); destination.type='button'; destination.addEventListener('click',()=>chooseDestination(id)); $('.destinations').appendChild(destination);destinations.set(id,destination);
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;label.append(check,document.createTextNode(name));$('.rally-groups').appendChild(label);rallyChecks.set(id,check);
  }
  for(const task of ninja?['watch','ambush']:['patrol','guard'])$('.task').add(new Option(TASK_LABELS[task],task));
  function row(e) {
    let r=rows.get(e.id);if(r)return r;
    const el=document.createElement('div');el.className='member';
    const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',`Select ${unitName(units,e.type)} ${e.id}`);
    const name=document.createElement('button');name.type='button';name.className='crew-name';
    const hp=document.createElement('small'),status=document.createElement('span');
    const pinLabel=document.createElement('label'),pin=document.createElement('input');pin.type='checkbox';pinLabel.className='pin';pinLabel.append(pin,document.createTextNode('Keep at HQ'));pin.addEventListener('change',()=>issue({action:'keepAtHQ',units:[e.id],value:pin.checked}));
    check.addEventListener('change',()=>{const selected=chosen().filter(id=>game.state.entities[id]?.deployment.group===focus);crewInput.select(check.checked?[...new Set([...selected,e.id])]:selected.filter(id=>id!==e.id));if(check.checked)onInspect(e.id);update(true);});
    name.addEventListener('click',()=>{selectGroup(focus);onInspect(e.id);update(true);});
    name.addEventListener('dblclick',()=>{if(available(e)){crewInput.select([e.id]);onInspect(e.id);update(true);}});
    el.append(check,name,hp,status,pinLabel);r={el,check,name,hp,status,pin,pinLabel};rows.set(e.id,r);return r;
  }
  const assignment = changes => {
    const s=record(focus);if(!s)return;
    const task=changes.task||s.task;
    const business=Object.values(game.state.businesses).find(b=>b.owner===owner()&&b.room&&game.deployment.sectorAt(...b.ring)===focus);
    issue({action:'assignment',sector:focus,task,business:s.business||business?.id,objective:s.objective,fallback:s.fallback,route:s.route||[],...changes});
  };
  const travelers=()=>members().filter(e=>e.deployment.transfer&&(e.deployment.transfer.from===focus||e.deployment.transfer.to===focus));
  const cancelable=()=>travelers().filter(e=>!e.deployment.transfer.cancelled);
  const primaryCancel=()=>{const all=cancelable(),selected=new Set(chosen()),picked=all.filter(e=>selected.has(e.id)),latest=all.filter(e=>latestTransfer.includes(e.id));return picked.length?picked:latest.length?latest:all;};
  function chooseDestination(id) {if(!transfer)return;transfer.to=id;confirmTransfer();update(true);}
  function cancelTransfer(){transfer=null;incoming=null;onCancelPick();update(true);}
  $('.transfer-start').addEventListener('click',()=>{if(transfer){confirmTransfer();return;}const ids=chosen().filter(id=>available(game.state.entities[id]));if(!ids.length){const active=primaryCancel();if(active.length)issue({action:'cancelTransfer',units:active.map(e=>e.id)});return;}incoming=null;transfer={ids,from:focus,to:null};onPickDestination?.(chooseDestination);update(true);});
  $('.assign-here').addEventListener('click',()=>{
    const sources=['home',...Object.keys(names).filter(id=>id!=='home')].filter(id=>id!==focus&&members(id).some(available));
    if(!sources.length)return;
    transfer=null;onCancelPick();incoming={to:focus,from:sources[0],ids:[]};update(true);
  });
  $('.assign-source').addEventListener('change',()=>{if(incoming){incoming.from=$('.assign-source').value;incoming.ids=[];update(true);}});
  $('.cancel-assignment').addEventListener('click',()=>{incoming=null;update(true);});
  $('.confirm-assignment').addEventListener('click',()=>{
    if(!incoming?.ids.length)return;
    const {ids,to}=incoming,allowed=game.deployment.canTransfer(heroId,ids,to);
    if(!allowed.ok){update(true);return;}
    latestTransfer=[...ids];issue({action:'transfer',units:[...ids],to});incoming=null;update(true);
  });
  $('.pick-destination').addEventListener('click',()=>{if(transfer)onPickDestination?.(chooseDestination);});
  $('.cancel-transfer').addEventListener('click',cancelTransfer);
  function confirmTransfer(){
    if(!transfer?.to)return;
    const {ids,to}=transfer, allowed=game.deployment.canTransfer(heroId,ids,to);
    if(!allowed.ok){update(true);return;}
    latestTransfer=[...ids];issue({action:'transfer',units:ids,to});transfer=null;onCancelPick();update(true);
  }
  $('.confirm-transfer').addEventListener('click',confirmTransfer);
  $('.select-group').addEventListener('click',()=>{selectGroup(focus);update(true);});
  $('.return-assignment').addEventListener('click',()=>crewInput.returnToDutyAndSelectHero());
  $('.task').addEventListener('change',()=>assignment({task:$('.task').value}));
  $('.guard-business').addEventListener('change',()=>assignment({business:$('.guard-business').value}));
  $('.clear-route').addEventListener('click',()=>assignment({route:[]}));
  for(const b of root.querySelectorAll('[data-point]'))b.addEventListener('click',()=>{
    const sector=focus,key=b.dataset.point;if(!record(sector)||!onPickPoint)return;
    onPickPoint(sector,p=>{if(focus!==sector)return;const s=record(sector);if(key==='route'){if((s.route?.length||0)<8)assignment({route:[...(s.route||[]),p]});}else assignment({[key]:p});});
  });
  $('.arm-next').addEventListener('click',()=>issue({action:'armAmbush',sector:focus}));
  $('.cancel-ambush').addEventListener('click',()=>issue({action:'cancelAmbush',sector:focus}));
  $('.retreat').addEventListener('click',()=>issue({action:'retreat',sector:focus}));
  $('.start-sweep').addEventListener('click',()=>issue({action:'sweep',sector:focus,targetSector:$('.sweep-sector').value,targetClan:$('.sweep-clan').value}));
  $('.cancel-sweep').addEventListener('click',()=>issue({action:'cancelSweep',sector:focus}));
  $('.start-shakedown').addEventListener('click',()=>issue({action:'shakedown',sector:focus,business:$('.shakedown-business').value}));
  $('.cancel-shakedown').addEventListener('click',()=>issue({action:'cancelShakedown',sector:focus}));
  $('.call-rally').addEventListener('click',()=>issue({action:'rally',groups:[...rallyChecks].filter(([,c])=>c.checked).map(([id])=>id)}));
  $('.reserves form').addEventListener('submit',e=>{e.preventDefault();const input=$('.reserve-target');if(input.value!==''&&input.checkValidity())issue({action:'reserveTarget',value:Number(input.value)});});
  $('.staffing-goal').addEventListener('submit',e=>{e.preventDefault();const input=$('.staffing-target');if(record(focus)&&input.value!==''&&input.checkValidity())issue({action:'staffing',sector:focus,value:Number(input.value)});});
  $('.reserve-target').addEventListener('input',()=>{reserveDirty=true;});
  $('.staffing-target').addEventListener('input',()=>{staffingDirty=true;});
  function update(force=false) {
    const first=!!game.deployment.needsFirstSector?.(owner());
    button.textContent=first?'Deployment · choose first zone':'Deployment';button.classList.toggle('needs-zone',first);
    root.hidden=!open;button.setAttribute('aria-expanded',String(open));if(!open)return;
    $('.first-zone').hidden=!first;
    const st=game.state, selected=new Set(chosen()), signature=`${st.tick}:${focus}:${[...selected].join(',')}`;
    if(!force&&lastRefresh===signature)return;lastRefresh=signature;
    const selectedGroups=new Set([...selected].map(id=>st.entities[id]?.deployment.group));
    if(!transfer&&!incoming&&selectedGroups.size===1){const id=[...selectedGroups][0];if(names[id]&&id!==focus){focus=id;if(record(id))onFocus(id);}}
    const counts=game.deployment.counts(owner()),list=members(focus),task=record(focus),rally=game.rally.status(owner());
    for(const [id,b]of tabs){b.textContent=`${names[id]} ${counts[id]}${id==='hero'?'/6':''}`;b.setAttribute('aria-pressed',String(id===focus));}
    $('.group-summary h4').textContent=names[focus];
    $('.group-summary strong').textContent=`${selected.size} crew selected`;
    $('.group-summary span').textContent=task?`${TASK_LABELS[task.task]} · ${task.recovery?.state||task.operation?.state||list.find(e=>e.deployment.duty?.status)?.deployment.duty.status||'On duty'}`:'Command your selected crew';
    const allIds=new Set(members().map(e=>e.id));for(const [id,r]of rows)if(!allIds.has(id)){r.el.remove();rows.delete(id);}
    for(const [id,r]of incomingRows)if(!allIds.has(id)){r.el.remove();incomingRows.delete(id);}
    const ordered=list.map(e=>{
      const r=row(e);r.check.checked=selected.has(e.id);r.check.disabled=!available(e);r.name.textContent=`${unitName(units,e.type)} #${e.id}`;r.hp.textContent=`${Math.ceil(e.hp)}/${e.maxHp}`;
      r.status.textContent=e.downed?'Downed':e.deployment.transfer?'Transferring':e.deployment.duty?.manual?'Manual order':e.deployment.duty?.status||'Ready';
      r.el.classList.toggle('selected',selected.has(e.id));return r.el;
    });syncChildren($('.roster'),ordered);
    for(const e of list){const r=rows.get(e.id);r.pinLabel.hidden=focus!=='home';r.pin.checked=!!e.deployment.keepAtHQ;}
    const ready=[...selected].some(id=>available(st.entities[id])),traveling=travelers(),cancel=primaryCancel();
    $('.transfer-start').disabled=transfer?!transfer.to||!game.deployment.canTransfer(heroId,transfer.ids,transfer.to).ok:!ready&&!cancel.length;
    $('.transfer-start').textContent=transfer?'Choose destination below or on map':!ready&&cancel.length?`Cancel transfer${cancel.length>1?`s (${cancel.length})`:''}`:'Transfer selected crew';
    $('.active-transfers').hidden=!traveling.length;
    const travelIds=new Set(traveling.map(e=>e.id));for(const[id,r]of travelRows)if(!travelIds.has(id)){r.el.remove();travelRows.delete(id);}
    syncChildren($('.travel-roster'),traveling.map(e=>{
      let r=travelRows.get(e.id);if(!r){const el=document.createElement('div'),text=document.createElement('span'),cancel=document.createElement('button');el.className='travel-member';cancel.type='button';el.append(text,cancel);cancel.addEventListener('click',()=>issue({action:'cancelTransfer',units:[e.id]}));r={el,text,cancel};travelRows.set(e.id,r);}
      const t=e.deployment.transfer;r.text.textContent=`${unitName(units,e.type)} #${e.id} → ${names[t.to]}${t.cancelled?' · Returning':''}`;
      r.cancel.textContent=t.cancelled?'Returning':'Cancel transfer';r.cancel.disabled=!!t.cancelled;return r.el;
    }));
    $('.assign-here').textContent=`Assign crew to ${names[focus]}`;
    $('.assign-here').disabled=!Object.keys(names).some(id=>id!==focus&&members(id).some(available));
    $('.assign-mode').hidden=!incoming;
    if(incoming){
      const source=members(incoming.from).filter(available),validIds=new Set(source.map(e=>e.id));
      incoming.ids=incoming.ids.filter(id=>validIds.has(id));
      $('.assign-destination').textContent=`Destination: ${names[incoming.to]} · choose crew to bring here`;
      $('.assign-source').value=incoming.from;
      for(const option of $('.assign-source').children){option.textContent=`${names[option.value]} · ${counts[option.value]}`;option.disabled=option.value===incoming.to||!members(option.value).some(available);}
      const roster=source.map(e=>{
        let r=incomingRows.get(e.id);
        if(!r){const el=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
          el.className='assign-member';check.type='checkbox';el.append(check,text);
          check.addEventListener('change',()=>{if(!incoming)return;incoming.ids=check.checked?[...new Set([...incoming.ids,e.id])]:incoming.ids.filter(id=>id!==e.id);onInspect(e.id);update(true);});
          r={el,check,text};incomingRows.set(e.id,r);}
        r.check.checked=incoming.ids.includes(e.id);r.el.classList.toggle('selected',r.check.checked);
        r.text.textContent=`${unitName(units,e.type)} #${e.id} · ${Math.ceil(e.hp)}/${e.maxHp}`;return r.el;
      });syncChildren($('.assign-roster'),roster);
      const can=incoming.ids.length?game.deployment.canTransfer(heroId,incoming.ids,incoming.to):{ok:false,why:source.length?'Select crew above':'No available crew in this group'};
      $('.assign-preview').textContent=`${incoming.ids.length} crew: ${names[incoming.from]} → ${names[incoming.to]}`;
      $('.assign-why').textContent=can.why;$('.confirm-assignment').disabled=!can.ok;
    }
    $('.return-assignment').disabled=![...selected].some(id=>record(st.entities[id]?.deployment.group));
    $('.transfer-mode').hidden=!transfer;
    if(transfer){
      $('.transfer-source').textContent=`${transfer.ids.length} selected from ${names[transfer.from]} · choosing a destination starts travel immediately`;
      for(const [id,b]of destinations){const can=game.deployment.canTransfer(heroId,transfer.ids,id);b.textContent=`${names[id]} · ${counts[id]}`;b.disabled=!can.ok;b.title=can.why;b.setAttribute('aria-pressed',String(transfer.to===id));}
      const can=transfer.to?game.deployment.canTransfer(heroId,transfer.ids,transfer.to):{ok:false,why:'Choose a destination above or on the map'};
      $('.transfer-preview').textContent=transfer.to?`${transfer.ids.length} crew: ${names[transfer.from]} → ${names[transfer.to]}`:'Destination not selected';
      $('.transfer-why').textContent=can.why;$('.confirm-transfer').disabled=!can.ok;
    }
    $('.duty').hidden=!task;
    const sweep=game.sweep,showSweep=!!task&&st.clans[owner()].faction==='kuroda'&&!!sweep;
    $('.sweep-ops').hidden=!showSweep;
    if(showSweep){
      const targets=st.deployment.sectors.filter(s=>sweep.nearby(focus,s.id)),select=$('.sweep-sector'),key=targets.map(s=>s.id).join(',');
      if(select.dataset.key!==key){const selected=select.value;select.dataset.key=key;select.replaceChildren();for(const s of targets)select.add(new Option(s.name,s.id));if(targets.some(s=>s.id===selected))select.value=selected;}
      const rivals=Object.values(st.clans).filter(c=>c.id!==owner()),clans=$('.sweep-clan'),clanKey=rivals.map(c=>c.id).join(',');
      if(clans.dataset.key!==clanKey){const chosen=clans.value;clans.dataset.key=clanKey;clans.replaceChildren();for(const c of rivals)clans.add(new Option(c.name,c.id));if(rivals.some(c=>c.id===chosen))clans.value=chosen;}
      const op=task.operation?.kind==='sweep'&&task.operation,can=sweep.eligibility(owner(),focus,select.value,clans.value);
      $('.start-sweep').disabled=!can.ok;$('.cancel-sweep').disabled=!op||op.state==='Returning';
      $('.sweep-preview').textContent=op?op.state+' · '+(op.hold/20).toFixed(1)+'/20s'+(op.contested?' · CONTESTED':'')+(op.reason?' · '+op.reason:''):can.ok?'10% protection while together. Hold 20s; scatter rival sector crew. Up to 500 ryo total, shared 3-minute cooldown; requires two encountered rivals.':can.why;
    }
    const shakedown=game.shakedown,showShakedown=!!task&&st.clans[owner()].faction==='yakuza'&&!!shakedown;
    $('.shakedown-ops').hidden=!showShakedown;
    if(showShakedown){
      const targets=Object.values(st.businesses).filter(b=>b.room&&b.ring&&!b.hideout&&st.clans[b.owner]&&b.owner!==owner()&&units.rules.businesses[b.kind]?.payout&&shakedown.nearby(focus,b));
      const select=$('.shakedown-business'),key=targets.map(b=>`${b.id}:${b.owner}`).join(',');
      if(select.dataset.key!==key){const selected=select.value;select.dataset.key=key;select.replaceChildren();for(const b of targets)select.add(new Option(`${b.kind.replaceAll('_',' ')} · ${st.clans[b.owner].name}`,b.id));if(targets.some(b=>b.id===selected))select.value=selected;}
      const op=task.operation?.kind==='shakedown'&&task.operation,can=shakedown.eligibility(owner(),focus,select.value);
      $('.start-shakedown').disabled=!can.ok;$('.cancel-shakedown').disabled=!op||op.state==='Returning';
      $('.shakedown-preview').textContent=op?`${op.state} · ${Math.floor(op.progress/20)}/20 s${op.reason?` · ${op.reason}`:''}`:can.ok?'Three opening dynamite throws · +10 heat · hold 20 s · bonus + 50% next payout':can.why;
    }
    if(task){
      $('.task').value=task.task;
      if(staffingDirty&&$('.staffing-target').value!==''&&Number($('.staffing-target').value)===(task.desired??3))staffingDirty=false;
      if(!staffingDirty&&document.activeElement!==$('.staffing-target'))$('.staffing-target').value=task.desired??3;
      const businesses=Object.values(st.businesses).filter(b=>b.owner===owner()&&b.room&&game.deployment.sectorAt(...b.ring)===focus),key=businesses.map(b=>b.id).join(',');
      const select=$('.guard-business');if(select.dataset.key!==key){select.dataset.key=key;select.replaceChildren();for(const b of businesses)select.add(new Option(b.kind.replaceAll('_',' '),b.id));}select.value=task.business||businesses[0]?.id||'';
      $('.business-label').hidden=task.task!=='guard';$('.assignment-points').textContent=`Duty applies immediately · ${task.route?.length||0}/8 route points`;
      $('.shinobi-ops').hidden=!ninja;
      if(ninja){
        const hunt=config().hunt,targets=game.shinobiIntelligence.targets(owner()),known=targets.find(t=>t.id===hunt?.target);
        $('.hunt-target').textContent=hunt?`Hunt target: ${known?unitName(units,known.type==='hero'?known.model:known.type):'contract boss'}`:'No specific hunt target';
        $('.ambush-preview').textContent=task.recovery?.state||task.operation?.state||(hunt?'Hunt armed · waiting for a local sighting':task.task==='ambush'?'Repeated ambush · nearest detected enemy':'Watching');
        $('.cancel-ambush').disabled=!hunt&&!task.ambushNext;$('.retreat').disabled=!task.operation;
        const ids=new Set(targets.map(t=>t.id));for(const [id,b]of targetRows)if(!ids.has(id)){b.remove();targetRows.delete(id);}
        const targetNodes=targets.map(t=>{let b=targetRows.get(t.id);if(!b){b=document.createElement('button');b.type='button';b.addEventListener('click',()=>issue({action:'armAmbush',target:t.id}));targetRows.set(t.id,b);}b.textContent=`${unitName(units,t.type==='hero'?t.model:t.type)} · ${t.live?'In sight':`Seen ${Math.floor(t.age)}s ago`}${hunt?.target===t.id?' · HUNT SELECTED':''}`;b.setAttribute('aria-pressed',String(hunt?.target===t.id));return b;});syncChildren($('.recent-targets'),targetNodes);
      }
    }
    const feedback=config().feedback;
    if(feedback&&feedback.sequence!==feedbackSequence){feedbackSequence=feedback.sequence;const el=$('.acceptance');el.hidden=false;el.className=`acceptance ${feedback.ok?'accepted':'rejected'}`;el.textContent=feedback.ok?feedback.text:`ORDER NOT ACCEPTED — ${feedback.text}`;el.style.animation='none';void el.offsetWidth;el.style.animation='';}
    $('.rally-status').textContent=rally.active?`${rally.seconds}s remaining`:rally.cooldown?`${rally.cooldown}s cooldown`:'Ready';$('.call-rally').disabled=rally.active||rally.cooldown>0;
    const reserve=$('.reserve-target');if(reserveDirty&&reserve.value!==''&&Number(reserve.value)===config().reserveTarget)reserveDirty=false;if(!reserveDirty&&document.activeElement!==reserve)reserve.value=config().reserveTarget;
    const clan=st.clans[owner()];$('footer').textContent=`Clinic ${clan.clinic.length} · Jail ${clan.jail?.length||0} · HQ recovery ${clan.respawning?.length||0}`;
  }
  function show(on){if(open===on)return;open=on;lastRefresh=null;if(on)onOpen(record(focus)?focus:null);else{transfer=null;incoming=null;onCancelPick();onClose();}update(true);}
  $('.close').addEventListener('click',()=>show(false));button.addEventListener('click',()=>{if(!open)selectGroup(focus);show(!open);button.blur();});
  for(const type of ['mousedown','mouseup','click','contextmenu','pointerdown','pointerup','wheel'])root.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
  update(true);
  return {update,openGroup:id=>{setFocus(id);show(true);},close:()=>show(false),isOpen:()=>open,cancelTransfer};
}
