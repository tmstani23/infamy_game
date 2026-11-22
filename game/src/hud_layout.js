// Shared UI layout registry and transactional editor. Game rules remain running.
import { createLayoutPages } from './layout_pages.js';
export const HUD_PANELS = ['hud','minimap','bar','selpanel','partyframes','crewcommands','bldpanel','ryo','heat','uself','utarget','stealth','utilitymenu','raidalarm','attackbar','knockbar','campingnotice','contract','interiorinfo','prompt','hire','clinic','police','contracts','lostcops','callout','pausedbanner','snap','deploymentpanel','townpanel','townsoverview','foundtown','townalerts','townhover','townflash','goalcard','structcard'];
const TB_KEY='infamy.hudLayout.toolbar.v1',KEY='infamy.hudLayout.v1',FILE='data/ui_layout.json',PROPS=['left','top','right','bottom','transform','scale','position','width','height','minHeight'];
// fixed-shape panels keep the uniform corner scale; every other panel also gets side handles for free width/height (Tim 2026-10-30)
const UNIFORM=new Set(['ryo','minimap','heat','stealth','raidalarm','uself','utarget','uhover','prompt','attackbar','knockbar']);
const NAMES={hud:'Top status',minimap:'Minimap',bar:'Action bar',selpanel:'Selection details',partyframes:'Crew panel',crewcommands:'Crew commands',bldpanel:'Building details',ryo:'Ryo',heat:'Infamy',uself:'Hero portrait',utarget:'Target portrait',uhover:'Hover portrait',structcard:'Building pane',stealth:'Stealth badge',utilitymenu:'Navigation icons',raidalarm:'Raid alarm',attackbar:'Raid progress',knockbar:'Recovery progress',campingnotice:'HQ camping warning',contract:'Contract status',interiorinfo:'Interior details',prompt:'Interaction prompt',hire:'Hiring window',clinic:'Clinic window',police:'Police window',contracts:'Contracts window',lostcops:'Police escape alert',callout:'Game alerts',pausedbanner:'Paused banner',snap:'Camera notice',deploymentpanel:'Deployment window',townpanel:'Town window',townsoverview:'Towns overview window',foundtown:'Found settlement button',townalerts:'Town alerts',townhover:'Town hover card',townflash:'Town notice',goalcard:'Campaign goal',fptip:'Town info tooltip',gamesettings:'Settings window',blacksmithshop:'Blacksmith shop',hqstash:'HQ stash',characterpage:'Character window',controls:'Controls window',jail:'Jail status',seasonend:'Match results',snuffhint:'Light interaction hint','control-tooltip':'Controls tooltip',
 // menu restyle (Tim 2026-11-11): every window and badge gets a plain name
 sitemenu:'Island gate window',landoffice:'Land Office window',lttalk:'Lieutenant talk',svtalk:'Surveyor talk',svtour:'Surveyor map card',stationmenu:'Station window',stablemenu:'Stable window',vehiclespanel:'Vehicles window',garrisoncard:'Garrison card',railledger:'Rail ledger',towninspect:'Town inspector',townbuildreview:'Build review',buildmini:'Build box',citywatch:'Watch the city bar','interior-details':'Interior details',foundhint:'Found settlement hint',warsplash:'War banner splash',warcamp:'War camp window',townwar:'Town war window',warpack:'Pack for war window',warcamphint:'War camp hint',warbannerhint:'War banner hint',warbannerbtn:'War banner button',warlanternbtn:'War lantern button',warcoin:'War chest'};
export function layoutCategory(id){
 if(/tooltip|hint|uhover|townhover|fptip/.test(id))return 'tooltips';
 if(['raidalarm','attackbar','knockbar','campingnotice','lostcops','callout','pausedbanner','snap','jail','townalerts','townflash'].includes(id))return 'alerts';
 if(['hire','clinic','police','contracts','deploymentpanel','townpanel','townsoverview','gamesettings','blacksmithshop','hqstash','characterpage','controls','seasonend'].includes(id))return 'windows';
 return 'main';
}
const STRUCTURAL=new Set(['shopmarker','view','vignette','fx','selbox','lock','hudlayout','startscreen','loading','gamemap','gamesettings','blacksmithshop','hqstash','characterpage','controls','results','towngrowthfx','townbuildoverlay','townbuildhint','gatefade']);   // full-screen effect layers are never movable panels
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Panel opacity (Tim 2026-11-20): saved._all.o fades every panel (default 0.88), saved[id].o overrides it for one panel (30 means 30).
export const OPACITY_ALL='_all',OPACITY_DEFAULT=.88,OPACITY_MIN=.3;
const opNum=v=>{const n=Number(v);return Number.isFinite(n)?clamp(n,OPACITY_MIN,1):null;};
const clone=v=>JSON.parse(JSON.stringify(v));
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
// Saved layouts (Tim 2026-11-16): data/ui_layout.json is the shipped Default (the game never writes it); the player's
// layouts live in saves/layouts/<name>.json (server layouts_api.mjs). The chosen one is remembered per browser.
export const DEFAULT_LAYOUT='Default',CUR_KEY='infamy.hudLayout.current.v1',LAYOUT_NAME_RE=/^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/;
export const currentLayoutName=()=>{try{return localStorage.getItem(CUR_KEY)||DEFAULT_LAYOUT;}catch{return DEFAULT_LAYOUT;}};
const setCurrentName=n=>{try{localStorage.setItem(CUR_KEY,n);}catch{}};
const layoutUrl=n=>`/layouts/${encodeURIComponent(n)}`;
export const listLayouts=()=>fetch('/layouts').then(r=>r.ok?r.json():{names:[]}).then(j=>j.names||[]).catch(()=>[]);
export const fetchLayout=n=>fetch(layoutUrl(n)).then(r=>r.ok?r.json():null).then(j=>j?.panels||null).catch(()=>null);
const putLayout=(n,s)=>fetch(layoutUrl(n),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({panels:s})}).then(r=>r.ok).catch(()=>false);
export function createHudLayout({fromFile,defaults=null,current=DEFAULT_LAYOUT,onBegin=()=>{},onEnd=()=>{},onLayouts=()=>{}}={}){
 const base=clone(defaults||fromFile||{});let layoutName=current,names=[],beforeName=null;
 // writes the layout being used: a saved layout to its file; changes made on Default go to a new layout "My layout"
 const store=s=>{try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}
  if(layoutName===DEFAULT_LAYOUT){layoutName='My layout';setCurrentName(layoutName);if(!names.includes(layoutName))names=[...names,layoutName].sort((a,b)=>a.localeCompare(b));showLayouts();}
  putLayout(layoutName,s);};
 let saved=clone(fromFile&&Object.keys(fromFile).length?fromFile:load()),before=null,editing=false,drag=null,selected=null,snapGrid=false;
 const grid=v=>snapGrid?Math.round(v/10)*10:v;
 const hiddenCategories=new Set(['tooltips','alerts','windows']);
 const panels=new Map(),layer=document.createElement('div');layer.id='hudlayout';layer.hidden=true;
 layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Edit UI layout');layer.setAttribute('aria-modal','true');document.body.appendChild(layer);
 const toolbar=document.createElement('div');toolbar.className='layout-toolbar';let toolbarDrag=null;
 const heading=document.createElement('strong');heading.textContent='Edit layout';toolbar.appendChild(heading);
 heading.title='Drag to move the editor toolbar';toolbar.title='Drag the empty space on this bar to move it';toolbar.addEventListener('mousedown',e=>{if(!editing||e.button!==0||e.target.closest('button,select,option,input'))return;e.preventDefault();e.stopPropagation();const r=toolbar.getBoundingClientRect();toolbarDrag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};});
 const saveToolbarPos=()=>{try{localStorage.setItem(TB_KEY,JSON.stringify({left:toolbar.style.left,top:toolbar.style.top}));}catch{}};
 try{const tp=JSON.parse(localStorage.getItem(TB_KEY)||'null');if(tp&&tp.left&&tp.top){toolbar.style.left=tp.left;toolbar.style.top=tp.top;}}catch{}
 const hint=document.createElement('span');hint.textContent='Select a panel, then drag or resize it. Use the picker for overlapping panels.';toolbar.appendChild(hint);
 // the Layout row: pick a layout, Save over it, Save as a typed name, Delete (moves the file to to_delete)
 const sets=document.createElement('div');sets.className='layout-sets';toolbar.appendChild(sets);
 const setsLab=document.createElement('label');setsLab.textContent='Layout';sets.appendChild(setsLab);
 const chooser=document.createElement('select');chooser.setAttribute('aria-label','Choose a saved layout');chooser.title='Switch to a saved layout. Default is the layout the game ships with.';sets.appendChild(chooser);setsLab.htmlFor='';
 const mk=(label,title)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;sets.appendChild(b);return b;};
 const saveBtn=mk('Save','Save the panels as they are now over the chosen layout');
 const nameBox=document.createElement('input');nameBox.type='text';nameBox.maxLength=30;nameBox.placeholder='New layout name';nameBox.setAttribute('aria-label','New layout name');sets.appendChild(nameBox);
 const saveAsBtn=mk('Save as','Save the panels as they are now as a new layout with the typed name');
 const delBtn=mk('Delete','Remove the chosen layout (its file moves to to_delete)');
 const setsNote=document.createElement('small');setsNote.textContent='Saved in saves/layouts';sets.appendChild(setsNote);
 const note=t=>{setsNote.textContent=t||'Saved in saves/layouts';};
 function showLayouts(){
  if(typeof document==='undefined')return;   // a late list answer after the page (or a test) went away
  const all=[DEFAULT_LAYOUT,...names];
  chooser.innerHTML='';for(const n of all){const o=document.createElement('option');o.value=n;o.textContent=n===DEFAULT_LAYOUT?'Default (game)':n;chooser.appendChild(o);}
  chooser.value=all.includes(layoutName)?layoutName:DEFAULT_LAYOUT;
  const isDefault=layoutName===DEFAULT_LAYOUT;saveBtn.disabled=delBtn.disabled=isDefault;
  onLayouts({names:all,current:layoutName});
 }
 function apply(next){drag=null;saved=clone(next||{});for(const p of panels.values())place(p);showOpacity();update();}
 async function refresh(){names=await listLayouts();showLayouts();return names;}
 async function choose(n){
  if(n===layoutName)return true;
  const panelsOf=n===DEFAULT_LAYOUT?base:await fetchLayout(n);
  if(!panelsOf){note(`Could not load ${n}`);showLayouts();return false;}
  layoutName=n;setCurrentName(n);apply(panelsOf);try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}showLayouts();note(`Using ${n===DEFAULT_LAYOUT?'Default':n}`);return true;
 }
 async function saveAs(raw){
  const n=String(raw||'').trim();
  if(!LAYOUT_NAME_RE.test(n)||n.toLowerCase()==='default'){note('Name: letters, numbers, spaces, - or _, up to 30');return false;}
  if(!await putLayout(n,saved)){note('Could not save (is the game server running?)');return false;}
  layoutName=n;setCurrentName(n);if(!names.includes(n))names=[...names,n].sort((a,b)=>a.localeCompare(b));showLayouts();note(`Saved as ${n}`);nameBox.value='';if(editing)before=clone(saved),beforeName=n;return true;
 }
 async function remove(n=layoutName){
  if(n===DEFAULT_LAYOUT)return false;
  const ok=await fetch(layoutUrl(n),{method:'DELETE'}).then(r=>r.ok).catch(()=>false);
  if(!ok){note(`Could not delete ${n}`);return false;}
  names=names.filter(x=>x!==n);if(layoutName===n){layoutName=DEFAULT_LAYOUT;setCurrentName(DEFAULT_LAYOUT);apply(base);if(editing)before=clone(saved),beforeName=DEFAULT_LAYOUT;}
  showLayouts();note(`${n} moved to to_delete`);return true;
 }
 chooser.addEventListener('change',()=>{choose(chooser.value);});
 saveBtn.addEventListener('click',async()=>{if(layoutName===DEFAULT_LAYOUT)return;const ok=await putLayout(layoutName,saved);note(ok?`Saved ${layoutName}`:'Could not save (is the game server running?)');if(ok&&editing)before=clone(saved),beforeName=layoutName;});
 saveAsBtn.addEventListener('click',()=>saveAs(nameBox.value));
 nameBox.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();saveAs(nameBox.value);}});
 delBtn.addEventListener('click',()=>remove());
 const actions={};for(const [key,label]of [['done','Done'],['cancel','Cancel'],['reset','Reset layout']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=key;toolbar.appendChild(b);actions[key]=b;}layer.appendChild(toolbar);
 const filters=document.createElement('div');filters.className='layout-filters';toolbar.appendChild(filters);
 const snapButton=document.createElement('button');snapButton.type='button';snapButton.dataset.action='grid';snapButton.textContent='Grid: Off (10px)';snapButton.setAttribute('aria-pressed','false');
 snapButton.addEventListener('click',()=>{drag=null;toolbarDrag=null;snapGrid=!snapGrid;snapButton.textContent=`Grid: ${snapGrid?'On':'Off'} (10px)`;snapButton.setAttribute('aria-pressed',String(snapGrid));layer.classList.toggle('layout-grid',snapGrid);});toolbar.appendChild(snapButton);
 const opacityAll=()=>opNum(saved[OPACITY_ALL]?.o)??OPACITY_DEFAULT,opacityOwn=id=>opNum(saved[id]?.o),opacityOf=id=>opacityOwn(id)??opacityAll();
 function paintOpacity(p){const v=String(opacityOf(p.id));if(p.el.style.opacity!==v)p.el.style.opacity=v;}
 // the Opacity row: every panel, then the selected panel. A typeable % box, the slider is an extra.
 const ops=document.createElement('div');ops.className='layout-sets layout-opacity';toolbar.appendChild(ops);
 const opsLab=document.createElement('label');opsLab.textContent='Opacity';ops.appendChild(opsLab);
 function opControl(name,title,onSet){
  const lab=document.createElement('small');lab.textContent=name;ops.appendChild(lab);
  const range=document.createElement('input');range.type='range';range.min=String(OPACITY_MIN*100);range.max='100';range.step='1';range.style.width='120px';range.title=title;range.setAttribute('aria-label',`${name} opacity slider`);ops.appendChild(range);
  const box=document.createElement('input');box.type='text';box.inputMode='numeric';box.maxLength=3;box.size=3;box.style.width='42px';box.style.textAlign='right';box.title=title;box.setAttribute('aria-label',`${name} opacity percent`);ops.appendChild(box);
  const pct=document.createElement('small');pct.textContent='%';ops.appendChild(pct);
  const set=raw=>{const n=Number(String(raw).trim());if(Number.isFinite(n))onSet(clamp(Math.round(n),OPACITY_MIN*100,100)/100);showOpacity();};
  range.addEventListener('input',()=>set(range.value));box.addEventListener('change',()=>set(box.value));
  box.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();set(box.value);}});
  return {lab,range,box,show:(v,off=false)=>{const t=String(Math.round(v*100));range.value=t;if(document.activeElement!==box)box.value=t;range.disabled=box.disabled=off;}};
 }
 function setOpacity(id,v){const n=opNum(v);if(n==null)return;if(id===OPACITY_ALL){saved[OPACITY_ALL]={o:n};for(const p of panels.values())paintOpacity(p);return;}
  const p=panels.get(id);if(!p)return;const {o,...rest}=saved[id]||{};saved[id]={...rest,o:n};if(!Object.keys(saved[id]).length)delete saved[id];paintOpacity(p);}
 const opAll=opControl('All panels','Opacity of every panel, 30 to 100',v=>setOpacity(OPACITY_ALL,v));
 const opOne=opControl('Selected panel','Opacity of the selected panel, 30 to 100. It overrides All panels until you press Reset.',v=>{if(selected)setOpacity(selected,v);});
 const opReset=document.createElement('button');opReset.type='button';opReset.textContent='Reset';opReset.title='All panels back to 88, the selected panel back to 100';ops.appendChild(opReset);
 const resetOpacity=()=>{for(const id of panels.keys())followAll(id);setOpacity(OPACITY_ALL,OPACITY_DEFAULT);showOpacity();};
 opReset.addEventListener('click',()=>{if(selected)followAll(selected);else resetOpacity();showOpacity();});
 function followAll(id){const p=panels.get(id);if(!p||!saved[id])return;const {o,...rest}=saved[id];if(Object.keys(rest).length)saved[id]=rest;else delete saved[id];paintOpacity(p);}
 function showOpacity(){opAll.show(opacityAll());const p=selected&&panels.get(selected);opOne.lab.textContent=p?(opacityOwn(p.id)==null?`${p.name} (follows All)`:p.name):'Selected panel';opOne.show(p?opacityOf(p.id):opacityAll(),!p);opReset.textContent=p?'Reset selection':'Reset all';opReset.title=p?`${p.name} follows All panels again`:'Every panel back to 88';}
 const picker=document.createElement('select');picker.setAttribute('aria-label','Select UI panel');filters.appendChild(picker);
 const empty=document.createElement('option');empty.value='';empty.textContent='Select a panel...';picker.appendChild(empty);
 for(const [category,label]of [['main','Main HUD'],['tooltips','Tooltips'],['alerts','Alerts'],['windows','Windows']]){
  const b=document.createElement('button');b.type='button';b.dataset.filter=category;
  // the label says what a click does (Tim 2026-11-05: "Hide Windows" while windows were already hidden read as a missing Town window)
  const label_=()=>{const off=hiddenCategories.has(category);b.textContent=`${off?'Show':'Hide'} ${label}`;b.setAttribute('aria-pressed',String(off));};label_();
  b.addEventListener('click',()=>{drag=null;if(hiddenCategories.has(category))hiddenCategories.delete(category);else hiddenCategories.add(category);label_();if(selected&&hiddenCategories.has(panels.get(selected).category))select(null);update();});
  filters.appendChild(b);
 }
 picker.addEventListener('change',()=>{select(picker.value||null);update();});
 // Firefox redraws (flickers) an open dropdown whenever its options change: panels that appear while it is open
 // (tooltips, alerts) join the list once it closes.
 const lateOptions=[];const addOption=o=>{if(document.activeElement===picker)lateOptions.push(o);else picker.appendChild(o);};
 picker.addEventListener('blur',()=>{while(lateOptions.length)picker.appendChild(lateOptions.shift());});
 function select(id){drag=null;selected=id;picker.value=id||'';showOpacity();for(const p of panels.values()){
  const on=p.id===id;p.handle.classList.toggle('selected',on);p.handle.setAttribute('aria-pressed',String(on));p.el.classList.toggle('layout-focused',editing&&on);
 }}
 const signature=el=>PROPS.map(k=>el.style[k]||'').join('|');
 function dimensions(p){const w=p.el.offsetWidth,h=p.el.offsetHeight,L=saved[p.id];if(w)p.w=w;if(h)p.h=h;return [w||L?.w||p.w||220,h||L?.h||p.h||70];}
 function place(p){
  paintOpacity(p);
  if(p.el.classList.contains('hud-docked'))return;
  const L=saved[p.id];
  if(!L||!L.ax){Object.assign(p.el.style,p.defaults);p.el.dataset.layoutPinned='false';p.el.dataset.layoutSized='false';p.applied=signature(p.el);return;}
  p.el.style.width=L.w?`${L.w}px`:p.defaults.width;p.el.style.minHeight=L.h?`${L.h}px`:p.defaults.minHeight;
  p.el.style.height=L.h?(UNIFORM.has(p.id)||p.id==='bar'||p.id==='selpanel'?`${L.h}px`:'auto'):p.defaults.height;   // selpanel: a fixed height, so its cards shrink to fit instead of the pane growing (Tim 2026-11-18)
  p.el.dataset.layoutSized=String(!!(L.w||L.h));
  const [w,h]=dimensions(p),s=clamp(Number(L.s)||1,.5,2.5);
  const x=clamp(L.ax==='l'?L.dx:innerWidth-L.dx-w*s,0,Math.max(0,innerWidth-w*s));
  const y=clamp(L.ay==='t'?L.dy:innerHeight-L.dy-h*s,0,Math.max(0,innerHeight-h*s));
  Object.assign(p.el.style,{position:'fixed',left:`${x-w*(1-s)/2}px`,top:`${y-h*(1-s)/2}px`,right:'auto',bottom:'auto',transform:'none',scale:String(s)});
  p.el.dataset.layoutPinned='true';p.applied=signature(p.el);
 }
 function keep(p,x,y,s,snap=false){const [w,h]=dimensions(p);if(snap){x=grid(x);y=grid(y);}s=clamp(s,.5,2.5);x=clamp(x,0,Math.max(0,innerWidth-w*s));y=clamp(y,0,Math.max(0,innerHeight-h*s));const ax=x+w*s/2<innerWidth/2?'l':'r',ay=y+h*s/2<innerHeight/2?'t':'b';const o=saved[p.id]||{};saved[p.id]={...(o.w?{w:o.w}:{}),...(o.h?{h:o.h}:{}),...(o.o!=null?{o:o.o}:{}),ax,ay,dx:Math.round(ax==='l'?x:innerWidth-x-w*s),dy:Math.round(ay==='t'?y:innerHeight-y-h*s),s:+s.toFixed(3)};place(p);}
 function register(el,id=el?.id,label=el?.dataset?.layoutLabel||NAMES[id]||id){
  if(!el||!id||panels.has(id)||el===layer||el===toolbar)return;
  const p={id,el,name:label,category:el.dataset?.layoutCategory||layoutCategory(id),defaults:Object.fromEntries(PROPS.map(k=>[k,el.style[k]||'']))};panels.set(id,p);
  el.dataset.layoutFree=String(!UNIFORM.has(id));
  p.pages=createLayoutPages(el,id);
  const option=document.createElement('option');option.value=id;option.textContent=label;addOption(option);p.option=option;
  const handle=document.createElement('div');handle.className='layout-handle';handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label',`Move or resize ${label}`);
  const title=document.createElement('span');title.textContent=label;handle.appendChild(title);
  const grip=document.createElement('button');grip.type='button';grip.className='layout-resize';grip.textContent='';grip.setAttribute('aria-label',`Resize ${label}`);handle.appendChild(grip);
  if(UNIFORM.has(id))grip.title='Keeps its shape: drag to scale';
  else for(const side of ['l','r','t','b']){const edge=document.createElement('div');edge.className=`layout-edge layout-edge-${side}`;edge.dataset.edge=side;handle.appendChild(edge);}
  layer.appendChild(handle);p.handle=handle;
  handle.addEventListener('mousedown',e=>{if(!editing||e.button!==0||hiddenCategories.has(p.category))return;e.preventDefault();e.stopPropagation();select(id);drag={p,x:e.clientX,y:e.clientY,rect:{...p.rect},s:saved[id]?.s||1,resize:e.target===grip,edge:e.target?.dataset?.edge};});
  handle.addEventListener('focus',()=>{if(editing&&!hiddenCategories.has(p.category))select(id);});
  handle.addEventListener('keydown',e=>{if(!editing||selected!==id)return;const r=p.rect,step=e.shiftKey||snapGrid?10:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.code];if(delta){e.preventDefault();keep(p,r.left+delta[0],r.top+delta[1],saved[id]?.s||1,true);}else if(['+','=','-'].includes(e.key)){e.preventDefault();keep(p,r.left,r.top,(saved[id]?.s||1)+(e.key==='-'?-.05:.05));}update();});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(saved[id]?.ax)place(p);}).observe(el);
  if(saved[id]?.ax)place(p);else paintOpacity(p);
 }
 // full-screen click-through layers (fades, effect canvases) are never panels: their box would cover every other one
 const screenLayer=el=>{if(typeof getComputedStyle!=='function')return false;const c=getComputedStyle(el);return c.position==='fixed'&&c.pointerEvents==='none'&&['top','left','right','bottom'].every(k=>c[k]==='0px');};
 function enroll(el){
  if(!el||el.nodeType===3||el===layer)return;
  if(el.nodeType===1&&!el.dataset?.layoutId&&screenLayer(el))return;
  if(el.dataset?.layoutId){register(el,el.dataset.layoutId,el.dataset.layoutLabel||el.dataset.layoutId);return;}
  if(el.id&&!STRUCTURAL.has(el.id)){register(el);return;}
  if(el.classList?.contains('tip')){const n=[...panels.keys()].filter(k=>k.startsWith('tooltip-')).length+1;register(el,`tooltip-${n}`,`Tooltip ${n}`);}
 }
 HUD_PANELS.forEach(id=>register(document.getElementById(id)));
 // the windows first (Tim 2026-11-09): enrolling body children would take the id for the full-screen backdrop
 for(const [id,selector]of [['gamesettings','.settings-window'],['characterpage','.character-window'],['hqstash','.stash-window'],['blacksmithshop','.shop-window'],['controls',null]]){const root=document.getElementById(id);if(root)register(selector?root.querySelector(selector)||root:root,id,NAMES[id]);}
 for(const el of document.body.children)enroll(el);
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)enroll(n);}).observe(document.body,{childList:true});
 function update(){
  let hidden=0;
  for(const p of panels.values()){
   if(p.pages&&p.el.offsetWidth){const rect=p.el.getBoundingClientRect(),L=saved[p.id],s=L?.s||1;
    // a scaled panel grows about its middle, so its live top moves with its content: paging from that fed back into itself
    // and the crew panel bounced (Tim 2026-11-07). A top-anchored saved panel uses its saved top instead.
    const top=L&&L.ay==='t'&&Number.isFinite(L.dy)?L.dy:Math.max(0,rect.top);
    p.pages.update(p.el.offsetWidth,Math.min(L?.h||600,Math.max(160,(innerHeight-top-24)/s)));
   }
   if(saved[p.id]?.ax&&signature(p.el)!==p.applied)place(p);else paintOpacity(p);
   if(!editing)continue;
   // write only on change: this runs every frame, and touching the options flickers an open picker
   const filtered=hiddenCategories.has(p.category);if(p.handle.hidden!==filtered)p.handle.hidden=filtered;if(p.option.hidden!==filtered)p.option.hidden=filtered;if(p.el.classList.contains('layout-filtered')!==filtered)p.el.classList.toggle('layout-filtered',filtered);
   if(filtered)continue;
   const actual=p.el.getBoundingClientRect(),L=saved[p.id];dimensions(p);
   let rect=actual;
   if(!actual.width||!actual.height){const [w,h]=dimensions(p),s=L?.s||1;rect={left:L?(parseFloat(p.el.style.left)||0)+w*(1-s)/2:Math.max(8,innerWidth-240*(1+Math.floor(hidden/7))),top:L?(parseFloat(p.el.style.top)||0)+h*(1-s)/2:95+(hidden%7)*80,width:w*s,height:h*s};hidden++;}
   p.rect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
   Object.assign(p.handle.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  }
 }
 // Live move (Tim 2026-11-04, extended 2026-11-15 to every window-category panel): windows can be dragged by their title bar outside Edit layout. Move only; resizing stays in Edit layout.
 const MOVABLE=new Set(['hire','clinic','police','contracts','townpanel','townsoverview','gamesettings','characterpage','hqstash','blacksmithshop','controls','towninspect','structcard']);   // towninspect, structcard: building cards drag by their top (Tim 2026-11-22)
 let live=null;
 addEventListener('mousedown',e=>{
  if(editing||e.button!==0||!e.target?.closest)return;
  if(e.target.closest('button,input,select,textarea,a,th,[data-tip]'))return;
  const head=e.target.closest('h1,h2,h3,header');
  for(const p of panels.values()){
   if(!(MOVABLE.has(p.id)||p.category==='windows'||/window|talk|outcome|review|board|shop|stash/i.test(p.name||''))||p.el.hidden||!p.el.contains(head||e.target))continue;
   const r=p.el.getBoundingClientRect();if(!r.width)return;
   if(!head&&!(e.clientY-r.top<48))return;   // otherwise only the top strip (tab rows, padding) also drags
   e.preventDefault();e.stopPropagation?.();e.stopImmediatePropagation?.();live={p,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};return;
  }
 },true);
 addEventListener('mousemove',e=>{
  if(!live||editing)return;
  if(typeof e.buttons==='number'&&!(e.buttons&1)){live=null;return;}
  const dx=e.clientX-live.x,dy=e.clientY-live.y;if(!live.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
  live.moved=true;keep(live.p,live.left+dx,live.top+dy,saved[live.p.id]?.s||1);
 });
 const endLive=()=>{if(live?.moved)store(saved);live=null;};
 addEventListener('mouseup',endLive,{capture:true});addEventListener('blur',endLive);
 function finish(commit){if(!editing)return;drag=null;if(commit)store(saved);else{saved=before;for(const p of panels.values())place(p);showOpacity();if(beforeName!==null&&beforeName!==layoutName){layoutName=beforeName;setCurrentName(layoutName);showLayouts();}}before=null;beforeName=null;editing=false;select(null);for(const p of panels.values())p.el.classList.remove('layout-filtered');layer.hidden=true;onEnd();}
 function begin(){if(editing)return;before=clone(saved);beforeName=layoutName;editing=true;note();refresh();showOpacity();layer.hidden=false;onBegin();update();actions.done.focus();}
 function reset(){drag=null;toolbarDrag=null;toolbar.style.left='max(10px,calc(50% - 470px))';toolbar.style.top='10px';try{localStorage.removeItem(TB_KEY);}catch{}layoutName=DEFAULT_LAYOUT;setCurrentName(DEFAULT_LAYOUT);apply(base);try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}showLayouts();note('Back to Default');}   // Reset layout = the Default layout (Tim 2026-11-16)
 actions.done.addEventListener('click',()=>finish(true));actions.cancel.addEventListener('click',()=>finish(false));actions.reset.addEventListener('click',reset);
 addEventListener('mousemove',e=>{if(!editing)return;if(toolbarDrag){if(typeof e.buttons==='number'&&!(e.buttons&1)){toolbarDrag=null;return;}const w=toolbar.offsetWidth,h=toolbar.offsetHeight;toolbar.style.left=`${clamp(toolbarDrag.left+e.clientX-toolbarDrag.x,0,Math.max(0,innerWidth-w))}px`;toolbar.style.top=`${clamp(toolbarDrag.top+e.clientY-toolbarDrag.y,0,Math.max(0,innerHeight-h))}px`;return;}if(!drag)return;if(typeof e.buttons==='number'&&!(e.buttons&1)){drag=null;return;}const {p,rect:r,s,resize,edge}=drag,dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(edge){   // side handle: change width or height, the opposite side stays put
   const horiz=edge==='l'||edge==='r',minimum=p.id==='bar'?(horiz?Math.min(560,innerWidth/s):100):40,size=clamp(grid(horiz?r.width+(edge==='l'?-dx:dx):r.height+(edge==='t'?-dy:dy))/s,minimum,(horiz?innerWidth:innerHeight)/s);
   const x=edge==='l'?r.left+r.width-size*s:r.left,y=edge==='t'?r.top+r.height-size*s:r.top;
   if(horiz)p.el.style.width=`${size}px`;else {p.el.style.height=`${size}px`;p.el.style.minHeight=`${size}px`;}
   saved[p.id]={...saved[p.id],[horiz?'w':'h']:Math.round(size)};
   keep(p,x,y,s);update();return;
  }keep(p,resize?r.left:r.left+dx,resize?r.top:r.top+dy,resize?s*Math.max(grid(r.width+dx)/r.width,grid(r.height+dy)/r.height):s,!resize);update();});
 addEventListener('mouseup',()=>{if(toolbarDrag)saveToolbarPos();drag=null;toolbarDrag=null;},{capture:true});addEventListener('blur',()=>{drag=null;toolbarDrag=null;});
 addEventListener('resize',()=>{for(const p of panels.values())if(saved[p.id]?.ax)place(p);update();});
 layer.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}if(e.code==='Tab'){const stops=[...layer.querySelectorAll('button,select,[tabindex="0"]')].filter(el=>{const h=el.closest('.layout-handle');return !el.closest('[hidden]')&&(!h||el===h||h.classList.contains('selected'));}),first=stops[0],last=stops.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 for(const type of ['mousedown','mouseup','click','contextmenu','wheel'])layer.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
 showLayouts();refresh();
 return {setOpacity,opacity:id=>id===OPACITY_ALL?opacityAll():opacityOf(id),followAll,resetOpacity,begin,done:()=>finish(true),cancel:()=>finish(false),reset,update,register,isEditing:()=>editing,registered:()=>[...panels.keys()],layouts:()=>[DEFAULT_LAYOUT,...names],current:()=>layoutName,choose,saveAs,remove,refresh};
}
