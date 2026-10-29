// Shinobi hero weapon effect. Uses the real blade mask and existing character
// opacity/depth. No gameplay state or visibility rules are changed.
import * as THREE from 'three';
import {weaponShadowMaterial} from './shading.js';

export function createWeaponShadow(spriteUniforms) {
  const geometry=new THREE.BufferGeometry(),capacity=1600;
  const positions=new Float32Array(capacity*3),uvs=new Float32Array(capacity*2);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=weaponShadowMaterial(spriteUniforms),mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.visible=false;
  let clock=0,history=[],lastSample=-1,critAt=-10,critAxis=null,lastAxis=null;
  function critical(){critAt=clock;critAxis=lastAxis;}
  return {mesh,critical,
    update(dt,axis,swing=null,enabled=true){
      clock+=dt;material.uniforms.uTime.value=clock;
      if(!enabled||!axis){mesh.visible=false;history=[];critAxis=null;return;}
      lastAxis=axis;
      const active=swing!==null&&swing>.08&&swing<.94;
      if(active&&clock-lastSample>.025){history.push({axis,time:clock});lastSample=clock;}
      history=history.filter(h=>clock-h.time<.22);
      let count=0;
      function ribbon(blade,{bend=0,offset=0,width=.02,fade=.6,shrink=1,drift=0}){
        const dx=(blade.tip.x-blade.base.x)*shrink,dy=(blade.tip.y-blade.base.y)*shrink;
        const len=Math.hypot(dx,dy);if(len<.008)return;
        const nx=-dy/len,ny=dx/len,steps=18;
        const at=t=>{
          const wave=bend*Math.sin(Math.PI*t)+drift*.045*Math.sin(t*8+clock*1.6)+drift*.02*Math.sin(t*17-clock*.9);
          return {x:blade.base.x+dx*t+nx*len*(offset+wave)-.5,y:blade.base.y+dy*t+ny*len*(offset+wave)-.5};
        };
        for(let i=0;i<steps;i++){
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
      // A short dark cut persists at previous blade positions, then closes
      // inward. Keep the history bounded and sample independently of FPS.
      for(const h of history.filter((_,i)=>i%2===0).slice(-4)){
        const life=1-(clock-h.time)/.22;
        ribbon(h.axis,{bend:.25,width:.019*life,fade:.64*life,shrink:.9+.1*life});
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
