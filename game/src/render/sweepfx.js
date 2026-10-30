import * as THREE from 'three';
import { onFxLayer } from './bloom.js';
import { createSweepTrail } from './sweep_trail.js';
import { SWEEP } from '../sim/sweep.js';

// Bounded instanced markers. Geometry is shared across operations; no per-frame mesh allocation.
export function createSweepFx({scene,spriteOf}){
  const active=new Map(),matrix=new THREE.Object3D();
  const chevron=new THREE.BufferGeometry();
  chevron.setAttribute('position',new THREE.Float32BufferAttribute([
    -1.05,0,-.55, 0,0,.2, 0,0,.55, -1.05,0,-.55, 0,0,.55, -1.05,0,-.2,
    0,0,.2, 1.05,0,-.55, 1.05,0,-.2, 0,0,.2, 1.05,0,-.2, 0,0,.55
  ],3));
  const circle=new THREE.RingGeometry(.97,1,64);
  const shield=new THREE.CylinderGeometry(.85,.85,.55,20,1,true,-Math.PI*.36,Math.PI*.72);
  const material=(opacity)=>new THREE.MeshBasicMaterial({color:0xe65365,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
  function create(){
    const group=new THREE.Group(),trail=onFxLayer(new THREE.InstancedMesh(chevron,material(.48),96));
    const shields=onFxLayer(new THREE.InstancedMesh(shield,material(.3),32));
    const ring=onFxLayer(new THREE.Mesh(circle,material(.32)));
    const progress=onFxLayer(new THREE.Mesh(circle,new THREE.ShaderMaterial({
      uniforms:{progress:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:'varying vec2 p; void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 p; uniform float progress; void main(){float a=mod(atan(p.y,p.x)+6.2831853,6.2831853)/6.2831853;if(a>progress)discard;gl_FragColor=vec4(1.,.32,.4,.85);}'
    })));
    for(const m of [trail,shields]){m.count=0;m.frustumCulled=false;}
    ring.rotation.x=progress.rotation.x=-Math.PI/2;
    ring.scale.setScalar(SWEEP.holdRadius);progress.scale.setScalar(SWEEP.holdRadius+.22);
    group.add(trail,shields,ring,progress);scene.add(group);
    return {group,trail,shields,ring,progress,history:createSweepTrail()};
  }
  function remove(key){const p=active.get(key);scene.remove(p.group);for(const m of p.group.children){m.dispose?.();m.material.dispose();}active.delete(key);}
  function update(state,followId){
    const hero=state.entities[followId],own=hero?.owner,seen=new Set();
    if(hero?.place==='street')for(const [clan,config] of Object.entries(state.deployment?.clans||{}))for(const [sector,task]of Object.entries(config.sectors)){
      const op=task.operation;if(op?.kind!=='sweep'||op.state==='Returning')continue;
      const team=op.units.map(id=>state.entities[id]).filter(e=>e&&!e.dead&&!e.downed&&e.place==='street');
      const visible=team.filter(e=>clan===own||spriteOf(e.id)?.thing.mesh.visible);
      if(!visible.length)continue;
      const key=`${clan}:${sector}`;seen.add(key);let p=active.get(key);if(!p){p=create();active.set(key,p);}
      // Sample only a visible leader; never bridge a rival's unseen travel or show its planned destination.
      const leader=team[0],leaderVisible=clan===own||spriteOf(leader.id)?.thing.mesh.visible;
      if(!leaderVisible)p.history.clear();
      const points=leaderVisible?p.history.update(op,leader,state.tick):[];
      points.forEach((v,i)=>{matrix.position.set(v.x,.065,v.z);matrix.rotation.set(0,v.angle,0);matrix.scale.setScalar(1);matrix.updateMatrix();p.trail.setMatrixAt(i,matrix.matrix);});
      p.trail.count=points.length;p.trail.instanceMatrix.needsUpdate=true;
      const holding=op.reached&&op.state!=='Marching';
      let count=0;
      if(holding)for(const e of visible){if(count===32)break;if(!(e.buffs?.sweep?.until>state.tick)||Math.hypot(e.x-op.point.x,e.z-op.point.z)>SWEEP.holdRadius)continue;
        matrix.position.set(e.x,.32,e.z);matrix.rotation.set(0,(state.tick/20)*.18+count*1.7,0);matrix.scale.setScalar(1);matrix.updateMatrix();p.shields.setMatrixAt(count++,matrix.matrix);
      }
      p.shields.count=count;p.shields.instanceMatrix.needsUpdate=true;
      p.ring.visible=p.progress.visible=clan===own;
      p.ring.position.set(op.point.x,.055,op.point.z);p.progress.position.set(op.point.x,.06,op.point.z);
      p.ring.material.opacity=op.contested?.55:.27;
      p.progress.material.uniforms.progress.value=Math.min(1,op.hold/SWEEP.holdTicks);
    }
    for(const key of active.keys())if(!seen.has(key))remove(key);
  }
  return {update,clear(){for(const key of active.keys())remove(key);}};
}
