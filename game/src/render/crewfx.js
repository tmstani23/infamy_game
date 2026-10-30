// Presentation only: finite projectile meshes and visible, state-driven control effects.
import * as THREE from 'three';
import { onFxLayer } from './bloom.js';

export function createCrewFx({scene,spriteOf}){
  const shots=new Map(),bindings=new Map(),braces=new Map(),bursts=[];
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  const material=color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide});
  function add(geometry,color){const m=new THREE.Mesh(geometry,material(color));scene.add(m);onFxLayer(m);return m;}
  function remove(m){scene.remove(m);m.traverse?.(n=>{n.geometry?.dispose();if(n.material)n.material.dispose();});}
  const visible=id=>!!spriteOf(id)?.thing.mesh.visible;
  function ring(radius,color){const m=add(new THREE.RingGeometry(radius-.04,radius+.04,40),color);m.rotation.x=-Math.PI/2;return m;}
  function shot(p){
    const group=new THREE.Group(),color=p.kind==='geishabolt'?0xff82c3:p.hamstring?0x8affcb:0xe5c882;
    const shaft=new THREE.Mesh(p.kind==='geishabolt'?new THREE.SphereGeometry(.10,8,6):new THREE.CylinderGeometry(.022,.022,.65,5),material(color));group.add(shaft);
    if(p.kind==='arrow'){const tip=new THREE.Mesh(new THREE.ConeGeometry(.07,.19,5),material(color));tip.position.y=.4;group.add(tip);}
    const trail=new THREE.Mesh(new THREE.CylinderGeometry(.015,.005,p.hamstring?.9:.45,5),material(color));trail.position.y=-.6;trail.material.opacity=.35;group.add(trail);
    scene.add(group);group.traverse(onFxLayer);return {mesh:group,elapsed:0};
  }
  return {
    clear(){for(const map of [shots,bindings,braces]){for(const v of map.values())remove(v.mesh||v);map.clear();}for(const b of bursts)remove(b.mesh);bursts.length=0;},
    cast(c){
      if(!visible(c.a))return;
      if(c.kind==='hamstringHit'){
        const m=ring(.9,0x83ffd1);m.position.set(c.x,.13,c.z);bursts.push({mesh:m,time:0,life:.6});
      }
      if(c.kind==='taunt'&&c.style==='shinobi_enforcer'){
        for(const radius of [.8,1.2]){const m=ring(radius,0xba9fff);m.position.set(c.x,.12,c.z);bursts.push({mesh:m,time:0,life:.6,expand:true});}
      }
      if(c.kind==='taunt'&&c.cone){
        // A sharp shield-slam sector points toward the actual cone used by the sim.
        const m=add(new THREE.RingGeometry(.4,c.radius,40,1,-c.cone*Math.PI/360,c.cone*Math.PI/180),0xff514d);
        m.rotation.x=-Math.PI/2;m.rotation.z=-Math.PI*(1+c.dir)/4;m.position.set(c.x,.08,c.z);bursts.push({mesh:m,time:0,life:.65});
      }
    },
    update(dt,state,heroId){
      const hero=state.entities[heroId],present=new Set();
      for(const p of state.projectiles||[]){
        if(hero?.place!==p.place||!visible(p.a))continue;
        const key=`${p.a}:${p.at}`;present.add(key);let v=shots.get(key);if(!v){v=shot(p);shots.set(key,v);}
        v.elapsed=Math.max(v.elapsed+dt*20,state.tick-p.at-1);
        const u=Math.min(1,v.elapsed/(p.until-p.at)),dx=p.tx-p.x,dz=p.tz-p.z;
        // A shallow arc remains readable without making a close shot look lobbed.
        v.mesh.position.set(p.x+dx*u,1.2+.25*Math.sin(Math.PI*u),p.z+dz*u);
        direction.set(dx,.25*Math.PI*Math.cos(Math.PI*u),dz).normalize();v.mesh.quaternion.setFromUnitVectors(up,direction);
      }
      for(const [key,v] of shots)if(!present.has(key)){remove(v.mesh);shots.delete(key);}
      const activeBindings=new Set(),activeBraces=new Set();
      for(const e of Object.values(state.entities)){
        if(e.dead||e.downed||e.jailed||e.place!==hero?.place||!visible(e.id))continue;
        if(e.buffs?.snared?.hamstring&&e.buffs.snared.until>state.tick){
          activeBindings.add(e.id);let m=bindings.get(e.id);if(!m){m=ring(.42,0x83ffd1);bindings.set(e.id,m);}m.position.set(e.x,.25,e.z);m.rotation.z+=dt*1.8;m.scale.setScalar(1+.08*Math.sin(state.tick*.35));
        }
        if(e.type==='kuroda_enforcer'&&e.buffs?.bulwark?.until>state.tick){
          activeBraces.add(e.id);let m=braces.get(e.id);if(!m){m=ring(.8,0xff514d);braces.set(e.id,m);}m.position.set(e.x,.09,e.z);m.material.opacity=.4+.15*Math.sin(state.tick*.2);
        }
      }
      for(const [map,active] of [[bindings,activeBindings],[braces,activeBraces]])for(const [id,m] of map)if(!active.has(id)){remove(m);map.delete(id);}
      for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.time+=dt;if(b.expand)b.mesh.scale.setScalar(1+b.time*3);b.mesh.material.opacity=.65*Math.max(0,1-b.time/b.life);if(b.time>=b.life){remove(b.mesh);bursts.splice(i,1);}}
    }
  };
}
