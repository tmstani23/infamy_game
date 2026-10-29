import * as THREE from 'three';
import { createParticles, createCards, SHAPE } from './vfx.js';
import { createGroundFirePatch } from './hq_fire.js';
import { onFxLayer } from './bloom.js';

const FIRE=[[1,.9,.5],[1,.55,.12],[1,.25,.04]],SMOKE=[[.15,.13,.12],[.3,.27,.23],[.43,.4,.35]];
const rand=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
export function createShakedownFx({scene,overlay,unitToScreen}) {
  const glow=createParticles(scene,{max:900}),smoke=createParticles(scene,{max:600,additive:false}),cards=createCards(scene);
  const bombs=new Map(),fires=new Map(),labels=new Map(),bursts=[],sweeps=new Map();
  const stickGeo=new THREE.CylinderGeometry(.065,.065,.48,7),bandGeo=new THREE.CylinderGeometry(.07,.07,.035,7),sparkGeo=new THREE.SphereGeometry(.06,6,4),ringGeo=new THREE.RingGeometry(.96,1,48);
  let place='street';
  const basic=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false});
  function bombMesh() {
    const group=new THREE.Group();
    for(const offset of [-.075,.075]){
      const stick=new THREE.Mesh(stickGeo,basic(0xb63824));stick.position.x=offset;group.add(stick);
      for(const y of [-.13,.13]){const band=new THREE.Mesh(bandGeo,basic(0xd5c39b));band.position.set(offset,y,0);group.add(band);}
    }
    const fuse=onFxLayer(new THREE.Mesh(sparkGeo,basic(0xffda64)));fuse.position.y=.3;group.add(fuse);
    group.renderOrder=99820;group.traverse(m=>{if(m.isMesh)m.renderOrder=99820;});scene.add(group);
    const ring=onFxLayer(new THREE.Mesh(ringGeo,basic(0xff6335,.6)));ring.rotation.x=-Math.PI/2;ring.renderOrder=5;scene.add(ring);
    return {group,ring};
  }
  const disposeBomb=b=>{scene.remove(b.group,b.ring);b.group.traverse(m=>m.material?.dispose());b.ring.material.dispose();};
  function label(key,text,p,color='#ffce83') {
    if(!overlay)return;
    let el=labels.get(key);if(!el){el=document.createElement('div');el.className='shakedown-text';overlay.appendChild(el);labels.set(key,el);}
    el.textContent=text;el.style.color=color;
    const s=unitToScreen(p.x,p.z,3);el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-50%)`;
  }
  function cast(c) {
    if(c.kind==='dynamiteBlast'&&c.place===place){
      cards.glint(c.x,.55,c.z,c.radius*2.1,0xffd690,.32);cards.ink(c.x,c.z,c.radius,.55,0x24150e);
      for(let i=0;i<42;i++){
        const a=rand(0,Math.PI*2),v=rand(1,5);
        glow.emit({x:c.x,y:.3,z:c.z,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:rand(.5,4),gravity:5,drag:1.8,life:rand(.25,.8),size:rand(.08,.23),color:pick(FIRE),shape:i%3?SHAPE.ember:SHAPE.sparkle});
      }
      for(let i=0;i<20;i++){
        const a=rand(0,Math.PI*2),v=rand(.3,2);
        smoke.emit({x:c.x,y:.35,z:c.z,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:rand(.4,1.4),drag:1.5,life:rand(1,2.2),size:rand(.45,.9),grow:2,alpha:.8,color:pick(SMOKE),shape:SHAPE.dot,sway:.25});
      }
    }
    if(c.kind==='shakedownSuccess'||c.kind==='sweepSuccess'){
      const p=place===c.place?{x:c.x,z:c.z}:place==='street'?{x:c.streetX,z:c.streetZ}:null;
      if(p&&Number.isFinite(p.x)){
        bursts.push({...p,place,age:0,next:0,bonus:c.bonus,sweep:c.kind==='sweepSuccess'});cards.seal(p.x,p.z,2.1,'金',0xffc45d,2.3,{spin:0});
      }
    }
  }
  function update(dt,state,followId) {
    place=state.entities[followId]?.place||'street';
    const own=state.entities[followId]?.owner,visible=new Set();
    for(const bomb of state.shakedowns?.bombs||[]){
      if(bomb.place!==place)continue;
      const b=state.businesses[Object.values(state.deployment?.clans||{}).flatMap(c=>Object.values(c.sectors)).find(t=>t.operation?.id===bomb.operation&&t.operation.kind==='shakedown')?.operation.business];
      if(!state.entities[bomb.a]&&b?.owner!==own)continue;
      visible.add(bomb.id);let mesh=bombs.get(bomb.id);if(!mesh){mesh=bombMesh();bombs.set(bomb.id,mesh);}
      const t=Math.max(0,Math.min(1,(state.tick-bomb.thrownAt)/Math.max(1,bomb.landsAt-bomb.thrownAt)));
      const x=bomb.fromX+(bomb.x-bomb.fromX)*t,z=bomb.fromZ+(bomb.z-bomb.fromZ)*t,y=t<1?.9+Math.sin(t*Math.PI)*2.4:.16;
      mesh.group.position.set(x,y,z);mesh.group.rotation.z=t<1?state.tick*.55:1.5;
      mesh.ring.position.set(bomb.x,.035,bomb.z);mesh.ring.scale.setScalar((bomb.emergency?3:2.2)*(.9+.05*Math.sin(state.tick)));mesh.ring.material.opacity=t<1?.12:.35+.2*Math.sin(state.tick*.6)**2;
      if(Math.random()<Math.min(1,dt*28))glow.emit({x,y:y+.3,z,vy:.5,life:.2,size:.09,color:[1,.75,.2],shape:SHAPE.sparkle});
    }
    for(const [id,b]of bombs)if(!visible.has(id)){disposeBomb(b);bombs.delete(id);}
    const liveFires=new Set();
    for(const f of state.shakedowns?.fires||[]){
      if(f.place!==place)continue;liveFires.add(f.id);
      if(!fires.has(f.id)){const mesh=createGroundFirePatch(f.x,f.z,f.radius,f.id*.37);scene.add(mesh);fires.set(f.id,mesh);}
    }
    for(const [id,mesh]of fires)if(!liveFires.has(id)){scene.remove(mesh);mesh.material.dispose();mesh.geometry.dispose();fires.delete(id);}
    const activeLabels=new Set();
    const activeSweeps=new Set();
    if(place==='street')for(const task of Object.values(state.deployment?.clans[own]?.sectors||{})){
      const op=task.operation;if(op?.kind!=='sweep')continue;
      const key='sweep:'+op.units[0];activeLabels.add(key);
      label(key,'SWEEP · '+op.state.toUpperCase()+' · '+(op.hold/20).toFixed(1)+'/20s'+(op.contested?' · CONTESTED':''),op.point,'#ff9292');
      if(op.state==='Returning')continue;
      activeSweeps.add(key);let ring=sweeps.get(key);
      if(!ring){ring=onFxLayer(new THREE.Mesh(ringGeo,basic(0xc33745,.25)));ring.rotation.x=-Math.PI/2;ring.renderOrder=5;scene.add(ring);sweeps.set(key,ring);}
      ring.position.set(op.point.x,.04,op.point.z);ring.scale.setScalar(6);ring.material.opacity=op.contested?.4:.18+.08*(op.hold/400);
    }
    for(const [key,ring]of sweeps)if(!activeSweeps.has(key)){scene.remove(ring);ring.material.dispose();sweeps.delete(key);}
    for(const c of Object.values(state.deployment?.clans||{}))for(const task of Object.values(c.sectors)){
      const op=task.operation;if(op?.kind!=='shakedown')continue;
      const unit=op.units.map(id=>state.entities[id]).find(e=>e?.owner===own),b=state.businesses[op.business];
      if(!unit||!b||(place!=='street'&&place!==b.room))continue;
      const p=place===b.room?op.front:{x:b.ring[0],z:b.ring[1]},key=`op:${op.id}`;activeLabels.add(key);
      label(key,op.state==='Holding'?`SHAKEDOWN ${Math.floor(op.progress/20)}/20s`:op.state==='Contested'?'SHAKEDOWN · CONTESTED':op.state==='Returning'?'SHAKEDOWN · RETURNING':op.state==='Bombarding'?'DYNAMITE!':`SHAKEDOWN · ${op.state.toUpperCase()}`,p,op.state==='Contested'?'#ff9783':'#ffce83');
    }
    for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.age+=dt;if(b.age>2.8){bursts.splice(i,1);continue;}if(b.place!==place)continue;
      const key=`win:${i}`;activeLabels.add(key);label(key,`${b.sweep?'SWEEP COMPLETE':'SHAKEN DOWN'} · +${b.bonus} RYO`,b);
      if(b.age>=b.next&&b.next<1.5){b.next+=.45;const x=b.x+rand(-1,1),z=b.z+rand(-1,1);
        for(let j=0;j<24;j++){const a=j*Math.PI/12,v=rand(1,2.5);glow.emit({x,y:4.5,z,vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:rand(-.5,1.4),gravity:1.8,life:1.1,size:.13,color:j%2?[1,.75,.25]:[1,.25,.08],shape:SHAPE.sparkle});}
      }
    }
    for(const [key,el]of labels)if(!activeLabels.has(key)){el.remove();labels.delete(key);}
    glow.update(dt);smoke.update(dt);cards.update(dt);
  }
  return {cast,update};
}
