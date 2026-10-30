// Shared UI layout registry and transactional editor. Game rules remain running.
export const HUD_PANELS = ['hud','minimap','bar','selpanel','partyframes','bldpanel','ryo','heat','uself','utarget','stealth','utilitymenu','raidalarm','attackbar','knockbar','campingnotice','contract','interiorinfo','prompt','hire','clinic','police','contracts','lostcops','callout','pausedbanner','snap','deploymentpanel'];
const KEY='infamy.hudLayout.v1',FILE='data/ui_layout.json',PROPS=['left','top','right','bottom','transform','scale','position'];
const STRUCTURAL=new Set(['view','vignette','fx','selbox','lock','hudlayout','startscreen','loading','gamemap','gamesettings','characterpage','controls','results']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clone=v=>JSON.parse(JSON.stringify(v));
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
const store=s=>{try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}fetch(FILE,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({panels:s},null,2)}).catch(()=>{});};
export function createHudLayout({fromFile,onBegin=()=>{},onEnd=()=>{}}={}){
 let saved=clone(fromFile&&Object.keys(fromFile).length?fromFile:load()),before=null,editing=false,drag=null;
 const panels=new Map(),layer=document.createElement('div');layer.id='hudlayout';layer.hidden=true;
 layer.setAttribute('role','dialog');layer.setAttribute('aria-label','Edit UI layout');layer.setAttribute('aria-modal','true');document.body.appendChild(layer);
 const toolbar=document.createElement('div');toolbar.className='layout-toolbar';
 const heading=document.createElement('strong');heading.textContent='EDIT LAYOUT';toolbar.appendChild(heading);
 const hint=document.createElement('span');hint.textContent='Drag panels or resize their corners. Hidden panels use labelled placeholders. Arrows move; + / − resize.';toolbar.appendChild(hint);
 const actions={};for(const [key,label]of [['done','Done'],['cancel','Cancel'],['reset','Reset layout']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=key;toolbar.appendChild(b);actions[key]=b;}layer.appendChild(toolbar);
 const signature=el=>PROPS.map(k=>el.style[k]||'').join('|');
 function dimensions(p){const w=p.el.offsetWidth,h=p.el.offsetHeight;if(w)p.w=w;if(h)p.h=h;return [p.w||220,p.h||70];}
 function place(p){
  if(p.el.classList.contains('hud-docked'))return;
  const L=saved[p.id];
  if(!L){Object.assign(p.el.style,p.defaults);p.el.dataset.layoutPinned='false';p.applied=signature(p.el);return;}
  const [w,h]=dimensions(p),s=clamp(Number(L.s)||1,.5,2.5);
  const x=clamp(L.ax==='l'?L.dx:innerWidth-L.dx-w*s,0,Math.max(0,innerWidth-w*s));
  const y=clamp(L.ay==='t'?L.dy:innerHeight-L.dy-h*s,0,Math.max(0,innerHeight-h*s));
  Object.assign(p.el.style,{position:'fixed',left:`${x-w*(1-s)/2}px`,top:`${y-h*(1-s)/2}px`,right:'auto',bottom:'auto',transform:'none',scale:String(s)});
  p.el.dataset.layoutPinned='true';p.applied=signature(p.el);
 }
 function keep(p,x,y,s){const [w,h]=dimensions(p);s=clamp(s,.5,2.5);x=clamp(x,0,Math.max(0,innerWidth-w*s));y=clamp(y,0,Math.max(0,innerHeight-h*s));const ax=x+w*s/2<innerWidth/2?'l':'r',ay=y+h*s/2<innerHeight/2?'t':'b';saved[p.id]={ax,ay,dx:Math.round(ax==='l'?x:innerWidth-x-w*s),dy:Math.round(ay==='t'?y:innerHeight-y-h*s),s:+s.toFixed(3)};place(p);}
 function register(el,id=el?.id,label=el?.dataset?.layoutLabel||id){
  if(!el||!id||panels.has(id)||el===layer||el===toolbar)return;
  const p={id,el,name:label,defaults:Object.fromEntries(PROPS.map(k=>[k,el.style[k]||'']))};panels.set(id,p);
  const handle=document.createElement('div');handle.className='layout-handle';handle.tabIndex=0;handle.setAttribute('role','button');handle.setAttribute('aria-label',`Move or resize ${label}`);
  const title=document.createElement('span');title.textContent=label;handle.appendChild(title);
  const grip=document.createElement('button');grip.type='button';grip.className='layout-resize';grip.textContent='◢';grip.setAttribute('aria-label',`Resize ${label}`);handle.appendChild(grip);layer.appendChild(handle);p.handle=handle;
  handle.addEventListener('mousedown',e=>{if(!editing||e.button!==0)return;e.preventDefault();e.stopPropagation();drag={p,x:e.clientX,y:e.clientY,rect:{...p.rect},s:saved[id]?.s||1,resize:e.target===grip};});
  handle.addEventListener('keydown',e=>{if(!editing)return;const r=p.rect,step=e.shiftKey?10:1,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.code];if(delta){e.preventDefault();keep(p,r.left+delta[0],r.top+delta[1],saved[id]?.s||1);}else if(['+','=','-'].includes(e.key)){e.preventDefault();keep(p,r.left,r.top,(saved[id]?.s||1)+(e.key==='-'?-.05:.05));}update();});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(saved[id])place(p);}).observe(el);
  if(saved[id])place(p);
 }
 function enroll(el){
  if(!el||el.nodeType===3||el===layer)return;
  if(el.dataset?.layoutId){register(el,el.dataset.layoutId,el.dataset.layoutLabel||el.dataset.layoutId);return;}
  if(el.id&&!STRUCTURAL.has(el.id)){register(el);return;}
  if(el.classList?.contains('tip')){const n=[...panels.keys()].filter(k=>k.startsWith('tooltip-')).length+1;register(el,`tooltip-${n}`,`Tooltip ${n}`);}
 }
 HUD_PANELS.forEach(id=>register(document.getElementById(id)));
 for(const el of document.body.children)enroll(el);
 for(const [id,selector]of [['gamesettings','.settings-window'],['characterpage','.character-window'],['controls','.cols']]){const root=document.getElementById(id);if(root)register(root.querySelector(selector)||root,id,id);}
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)enroll(n);}).observe(document.body,{childList:true});
 function update(){
  let hidden=0;
  for(const p of panels.values()){
   if(saved[p.id]&&signature(p.el)!==p.applied)place(p);
   if(!editing)continue;
   const actual=p.el.getBoundingClientRect(),L=saved[p.id];dimensions(p);
   let rect=actual;
   if(!actual.width||!actual.height){const [w,h]=dimensions(p),s=L?.s||1;rect={left:L?parseFloat(p.el.style.left)||0:Math.max(8,innerWidth-240*(1+Math.floor(hidden/7))),top:L?parseFloat(p.el.style.top)||0:95+(hidden%7)*80,width:w*s,height:h*s};hidden++;}
   p.rect={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
   Object.assign(p.handle.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  }
 }
 function finish(commit){if(!editing)return;drag=null;if(commit)store(saved);else{saved=before;for(const p of panels.values())place(p);}before=null;editing=false;layer.hidden=true;onEnd();}
 function begin(){if(editing)return;before=clone(saved);editing=true;layer.hidden=false;onBegin();update();actions.done.focus();}
 function reset(){saved={};for(const p of panels.values())place(p);if(!editing)store(saved);update();}
 actions.done.addEventListener('click',()=>finish(true));actions.cancel.addEventListener('click',()=>finish(false));actions.reset.addEventListener('click',reset);
 addEventListener('mousemove',e=>{if(!drag||!editing)return;if(typeof e.buttons==='number'&&!(e.buttons&1)){drag=null;return;}const {p,rect:r,s,resize}=drag,dx=e.clientX-drag.x,dy=e.clientY-drag.y;keep(p,resize?r.left:r.left+dx,resize?r.top:r.top+dy,resize?s*Math.max((r.width+dx)/r.width,(r.height+dy)/r.height):s);update();});
 addEventListener('mouseup',()=>{drag=null;},{capture:true});addEventListener('blur',()=>{drag=null;});
 addEventListener('resize',()=>{for(const p of panels.values())if(saved[p.id])place(p);update();});
 layer.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}if(e.code==='Tab'){const stops=[...layer.querySelectorAll('button,[tabindex="0"]')],first=stops[0],last=stops.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 for(const type of ['mousedown','mouseup','click','contextmenu','wheel'])layer.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
 return {begin,done:()=>finish(true),cancel:()=>finish(false),reset,update,register,isEditing:()=>editing,registered:()=>[...panels.keys()]};
}
