import * as THREE from 'three';
import { weaponLightningMaterial } from './shading.js';
import { bladeAxes, lightningPattern } from './weapon_lightning_pattern.js';

export function readBladeAxes(texture, frames) {
  const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  return bladeAxes(ctx.getImageData(0,0,image.width,image.height).data,image.width,image.height,frames);
}

export function createWeaponLightning(spriteUniforms) {
  const geometry=new THREE.BufferGeometry(),capacity=1024;
  const positions=new Float32Array(capacity*3),uvs=new Float32Array(capacity*2);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=weaponLightningMaterial(spriteUniforms),mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.visible=false;
  let clock=0,next=0,start=-10,duration=.18,paths=[],lastAttack=false,previousAxis=null;
  const salt=Math.random()*100000|0;
  function rebuild(axis) {
    const dx=axis.tip.x-axis.base.x,dy=axis.tip.y-axis.base.y;
    const length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
    let n=0;
    for(const path of paths) for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i];
      // Paths are stored in blade coordinates, so a flash follows animation
      // changes without leaving a displaced bolt hanging in the air.
      const at=p=>({x:axis.base.x+dx*p.x+nx*length*p.y-.5,y:axis.base.y+dy*p.x+ny*length*p.y-.5});
      const p=at(a),q=at(b),l=Math.hypot(q.x-p.x,q.y-p.y)||1;
      const taper=1-.7*i/path.points.length,w=.0075*path.width*taper;
      const ox=-(q.y-p.y)/l*w,oy=(q.x-p.x)/l*w;
      const vertices=[[p.x+ox,p.y+oy,0],[p.x-ox,p.y-oy,1],[q.x+ox,q.y+oy,0],[q.x+ox,q.y+oy,0],[p.x-ox,p.y-oy,1],[q.x-ox,q.y-oy,1]];
      for(const [x,y,u] of vertices){positions.set([x,y,.004],n*3);uvs.set([u,0],n*2);n++;}
    }
    geometry.setDrawRange(0,n);geometry.attributes.position.needsUpdate=true;geometry.attributes.uv.needsUpdate=true;
  }
  return {mesh,
    update(dt,axis,attack=0,enabled=true) {
      clock+=dt;
      if(!enabled||!axis){mesh.visible=false;paths=[];previousAxis=null;return;}
      const attacking=attack>0;
      if(clock>=next||(attacking&&!lastAttack)) {
        start=clock;duration=attacking?.22:.16;
        paths=lightningPattern({base:{x:0,y:0},tip:{x:1,y:0}},salt+Math.floor(clock*1000),attacking);
        next=clock+(attacking?.24:.58)+Math.random()*(attacking?.16:.7);previousAxis=null;
      }
      lastAttack=attacking;
      const age=(clock-start)/duration;
      mesh.visible=age>=0&&age<1;
      if(!mesh.visible)return;
      if(previousAxis!==axis){rebuild(axis);previousAxis=axis;}
      // Brief return-stroke flashes, a weaker second pulse, then fast decay.
      const flash=Math.exp(-age*13)+.7*Math.exp(-Math.pow((age-.34)/.09,2))+.12*(1-age);
      material.uniforms.uPower.value=flash*(attacking?1.45:1);
    },
    dispose(){geometry.dispose();material.dispose();},
  };
}
