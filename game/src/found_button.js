import { modeRules } from './sim/modes/index.js';
// Hall placement presentation. The simulation rechecks every click before payment.
export function createFoundButton({ root, game, heroId, send, view, blocked=()=>false, onStart=()=>{} }) {
  let active=false, mouse=null, preview=null, key='';
  const ghost=document.createElement('canvas'), hint=document.createElement('div');
  ghost.id='foundghost';hint.id='foundhint';
  ghost.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:21';
  hint.style.cssText='position:fixed;pointer-events:none;z-index:22;padding:8px;background:rgba(12,18,24,.94);max-width:300px;border:1px solid;border-radius:6px';
  ghost.hidden=hint.hidden=true;document.body.append(ghost,hint);
  const hero=()=>game.state.entities[heroId];
  const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
  function cancel(){active=false;mouse=null;preview=null;key='';ghost.hidden=hint.hidden=true;}
  function draw(){
    if(!active || !mouse || blocked()){ghost.hidden=hint.hidden=true;return;}
    const p=view.screenToGround(mouse.x,mouse.y);if(!p){ghost.hidden=hint.hidden=true;return;}
    const next=JSON.stringify([game.state.tick,Math.round(p.x),Math.round(p.z)]);
    if(next!==key){key=next;preview=game.frontier.founding.check(hero(),undefined,p);}
    const {x,z}=preview.point,h=preview.half,color=preview.ok?'#65ef88':'#ff655f';
    ghost.hidden=hint.hidden=false;ghost.width=innerWidth;ghost.height=innerHeight;
    const ctx=ghost.getContext('2d'),points=[[-h,-h],[h,-h],[h,h],[-h,h]].map(([dx,dz])=>view.unitToScreen(x+dx,z+dz,0));
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=preview.ok?'rgba(65,220,100,.3)':'rgba(240,55,50,.35)';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
    const top=points.map(p=>({x:p.x,y:p.y-24}));
    ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(points[i].x,points[i].y);ctx.lineTo(top[i].x,top[i].y);ctx.stroke();}
    hint.textContent=preview.ok?`Town hall · ${preview.cost} ryo · Left-click to found. Right-click / Esc cancels.`:`Town hall: ${preview.reason} · Right-click / Esc cancels.`;
    hint.style.color=color;hint.style.borderColor=color;hint.style.left=`${Math.max(8,Math.min(innerWidth-320,mouse.x+18))}px`;hint.style.top=`${Math.max(8,Math.min(innerHeight-100,mouse.y+18))}px`;
  }
  function update(){
    const h=hero(),f=game.frontier?.founding;
    const near=h && f && h.place==='world' && modeRules(game.state).founding?f.settlersWith(h).length:0;
    root.hidden=!near;
    if(!near || h?.dead || h?.downed || blocked()){cancel();return;}
    root.disabled=false;root.textContent=active?'Choose town hall location · Esc cancels':`Found a town · ${near} settlers`;
    draw();
  }
  root.addEventListener('click',()=>{if(!root.disabled){cancel();onStart();active=true;}root.blur();update();});
  addEventListener('mousemove',e=>{if(active){mouse=e.target?.closest?.('canvas#view')?{x:e.clientX,y:e.clientY}:null;draw();}});
  addEventListener('mousedown',e=>{
    if(!active || blocked() || !e.target?.closest?.('canvas#view'))return;
    if(e.button===2){cancel();consume(e);return;}
    if(e.button!==0)return;
    mouse={x:e.clientX,y:e.clientY};key='';draw();consume(e);
    if(preview?.ok){send({id:heroId,type:'frontier',action:'found',...preview.point});cancel();}
  },{capture:true});
  addEventListener('contextmenu',e=>{if(active && e.target?.closest?.('canvas#view'))consume(e);},{capture:true});
  addEventListener('keydown',e=>{if(active && e.code==='Escape'){cancel();consume(e);}},{capture:true});
  addEventListener('blur',cancel);
  return {update,cancel,isPlacing:()=>active};
}
