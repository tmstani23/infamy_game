// Shinobi hero weapon effect. Uses the real blade mask and existing character
// opacity/depth. No gameplay state or visibility rules are changed.
import * as THREE from 'three';
import {weaponShadowMaterial} from './shading.js';

export function createWeaponShadow(spriteUniforms) {
  const geometry=new THREE.BufferGeometry(),capacity=2400;
  const positions=new Float32Array(capacity*3),uvs=new Float32Array(capacity*2);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=weaponShadowMaterial(spriteUniforms),mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.visible=false;
  let clock=0,history=[],lastSample=-1,critAt=-10,critAxis=null,lastAxis=null;
  // loose wisps shed by the blade (Tim 2026-10-29 visual pass): idle they drift outward and down,
  // running they stream behind him, opposite the way he faces. Sprite-local units (0..1 of the quad).
  let motes=[],shedAt=0;
  const MAX_MOTES=28;
  function critical(){critAt=clock;critAxis=lastAxis;}
  return {mesh,critical,
    update(dt,axis,swing=null,enabled=true,{anim='idle',dir=0}={}){
      clock+=dt;material.uniforms.uTime.value=clock;
      if(!enabled||!axis){mesh.visible=false;history=[];critAxis=null;motes=[];return;}
      lastAxis=axis;
      const active=swing!==null&&swing>.08&&swing<.94;
      if(active&&clock-lastSample>.025){history.push({axis,time:clock});lastSample=clock;}
      history=history.filter(h=>clock-h.time<.22);
      let count=0;
      function ribbon(blade,{bend=0,offset=0,width=.02,fade=.6,shrink=1,drift=0,steps=18}){
        const dx=(blade.tip.x-blade.base.x)*shrink,dy=(blade.tip.y-blade.base.y)*shrink;
        const len=Math.hypot(dx,dy);if(len<.008)return;
        const nx=-dy/len,ny=dx/len;
        const at=t=>{
          const wave=bend*Math.sin(Math.PI*t)+drift*.045*Math.sin(t*8+clock*1.6)+drift*.02*Math.sin(t*17-clock*.9);
          return {x:blade.base.x+dx*t+nx*len*(offset+wave)-.5,y:blade.base.y+dy*t+ny*len*(offset+wave)-.5};
        };
        for(let i=0;i<steps&&count+6<=capacity;i++){
          const ta=i/steps,tb=(i+1)/steps,a=at(ta),b=at(tb);
          const l=Math.hypot(b.x-a.x,b.y-a.y)||1,ox=-(b.y-a.y)/l,oy=(b.x-a.x)/l;
          const wa=width*Math.pow(Math.sin(Math.PI*ta),.65),wb=width*Math.pow(Math.sin(Math.PI*tb),.65);
          const fa=fade*Math.pow(Math.sin(Math.PI*ta),.35),fb=fade*Math.pow(Math.sin(Math.PI*tb),.35);
          const vertices=[[a.x+ox*wa,a.y+oy*wa,0,fa],[a.x-ox*wa,a.y-oy*wa,1,fa],[b.x+ox*wb,b.y+oy*wb,0,fb],
            [b.x+ox*wb,b.y+oy*wb,0,fb],[a.x-ox*wa,a.y-oy*wa,1,fa],[b.x-ox*wb,b.y-oy*wb,1,fb]];
          for(const [x,y,u,v]of vertices){positions.set([x,y,.005],count*3);uvs.set([u,v],count*2);count++;}
        }
      }
      // Two quiet, independent wisps cling to the blade rather than enveloping
      // the hero. Their tapered ends curl and breathe without a flashing halo.
      for(let i=0;i<2;i++){
        const side=i?1:-1;
        ribbon(axis,{bend:side*(.1+.05*Math.sin(clock*1.1+i*3)),offset:side*.045,width:.0045,
          fade:.37+.08*Math.sin(clock*1.4+i*2),drift:side});
      }
      // Shed wisps: idle a slow trickle drifting outward and down; running a steadier stream trailing
      // behind (facing from the sheet direction, same convention as sim dirIndex: screen right -sin, down cos).
      const running=anim==='run',walking=anim==='walk',th=dir*Math.PI/4,fx=-Math.sin(th),fy=-Math.cos(th);
      const every=running?.045:walking?.09:.16;
      if(clock-shedAt>every&&motes.length<MAX_MOTES){
        shedAt=clock;
        const t=.25+Math.random()*.7,bx=axis.base.x+(axis.tip.x-axis.base.x)*t,by=axis.base.y+(axis.tip.y-axis.base.y)*t;
        const ax=axis.tip.x-axis.base.x,ay=axis.tip.y-axis.base.y,al=Math.hypot(ax,ay)||1,side=Math.random()<.5?-1:1;
        const out={x:-ay/al*side,y:ax/al*side};
        const vx=running?-fx*.32+out.x*.04:walking?-fx*.12+out.x*.06:out.x*.07;
        const vy=running?-fy*.32-.05:walking?-fy*.12-.06:-.09+out.y*.03;
        motes.push({x:bx,y:by,vx:vx+(Math.random()-.5)*.03,vy:vy+(Math.random()-.5)*.02,born:clock,life:running?.55:walking?.8:1.2,curl:Math.random()*6});
      }
      motes=motes.filter(m=>clock-m.born<m.life);
      for(const m of motes){
        const age=(clock-m.born)/m.life,k=1-age;
        m.x+=m.vx*dt;m.y+=m.vy*dt;m.vx*=1-dt*.8;m.vy-=dt*.05;   // slows and sinks as it fades
        const sway=.012*Math.sin(clock*3+m.curl),sp=Math.hypot(m.vx,m.vy)||1,len=.03+.05*Math.min(1,sp*3);
        const tail={x:m.x-m.vx/sp*len+sway,y:m.y-m.vy/sp*len};
        ribbon({base:tail,tip:{x:m.x,y:m.y}},{bend:.18*Math.sin(m.curl),width:.0055*(.4+.6*k),fade:.42*Math.sin(Math.PI*Math.min(1,age*1.4+.15))*k+.02,steps:5});
      }
      // A short dark cut persists at previous blade positions, then closes
      // inward. Keep the history bounded and sample independently of FPS.
      // Attacks a little more visible (Tim 2026-10-29): wider, stronger cut.
      for(const h of history.filter((_,i)=>i%2===0).slice(-4)){
        const life=1-(clock-h.time)/.22;
        ribbon(h.axis,{bend:.25,width:.024*life,fade:.78*life,shrink:.9+.1*life});
      }
      const age=clock-critAt;
      if(critAxis)for(let i=0;i<2;i++){
        const t=age-(i+1)*.075,life=1-t/.34;
        if(t<0||life<=0)continue;
        ribbon(critAxis,{bend:.32+i*.13,offset:.15+i*.16,width:.012*life,fade:.55*life,shrink:.65+.35*life});
      }
      geometry.setDrawRange(0,count);geometry.attributes.position.needsUpdate=true;geometry.attributes.uv.needsUpdate=true;
      mesh.visible=count>0;
    },
    dispose(){geometry.dispose();material.dispose();},
  };
}
