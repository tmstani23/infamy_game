// Kuroda VFX consume shared state/events only. Symbols rotate around a fixed
// formation centre; their front face stays translucent over the fight.
import * as THREE from 'three';
import { onFxLayer } from './bloom.js';
import { VIEW_DIR, CAM_QUAT, CAM_RIGHT, CAM_UP } from './iso.js';
import { SCREEN_RIGHT, SCREEN_DOWN } from '../sim/geometry.js';
import { createParticles, createCards, SHAPE } from './vfx.js';

const CRIMSON = 0xe82c48, GOLD = 0xffce83, HOT = 0xfff0c2;
const rand = (a,b) => a + Math.random()*(b-a);
const count = (rate,dt) => Math.floor(rate*dt) + (Math.random()<rate*dt%1 ? 1 : 0);
const angleOf = (dx,dz) => Math.atan2(dx*CAM_UP.x+dz*CAM_UP.z,dx*CAM_RIGHT.x+dz*CAM_RIGHT.z);
function facing(dir=0) {
  const a=dir*Math.PI/4,x=-Math.sin(a),y=Math.cos(a);
  return {x:x*SCREEN_RIGHT.x+y*SCREEN_DOWN.x,z:x*SCREEN_RIGHT.z+y*SCREEN_DOWN.z};
}
const mat = (color, opacity = 1, map = null) => new THREE.MeshBasicMaterial({ color, opacity, map,
  transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
const mesh = (geometry, color, opacity, map) => {
  const m=onFxLayer(new THREE.Mesh(geometry,mat(color,opacity,map)));
  m.renderOrder=99820;return m;
};
// All silhouettes are geometry, using the same additive layers/cards as the other
// heroes. No new image assets: broad coloured bodies, fine bright edges, tapered tails.
function strip(points, widths) {
  const vertices=[],indices=[];
  for(let i=0;i<points.length;i++) {
    const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    const dx=next[0]-prev[0],dz=next[2]-prev[2],len=Math.hypot(dx,dz)||1,w=widths[i]/2;
    vertices.push(p[0]-dz/len*w,p[1],p[2]+dx/len*w,p[0]+dz/len*w,p[1],p[2]-dx/len*w);
    if(i<points.length-1){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);
  geo.computeBoundingSphere();return geo;
}
function line(points,width,color,opacity=1) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*3),width,4,false),color,opacity);
}
function polygon(points,color,opacity=1) {
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  return mesh(new THREE.ShapeGeometry(shape),color,opacity);
}
function crest(size=1,opacity=1) {
  const g=new THREE.Group();
  const points=[[0,.7],[.48,.4],[.4,-.22],[0,-.68],[-.4,-.22],[-.48,.4],[0,.7]];
  const fill=polygon(points,CRIMSON,.12*opacity);g.add(fill);
  for(const [scale,width,color,alpha] of [[1,.045,CRIMSON,.65],[.94,.014,GOLD,.95]])
    g.add(line(points.map(([x,y])=>[x*scale,y*scale,0]),width,color,alpha*opacity));
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,petal=[];
    for(let j=0;j<=16;j++){const t=j*Math.PI*2/16,x=Math.cos(t)*.085,y=.15+Math.sin(t)*.17;
      petal.push([x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a),.012]);}
    const m=line(petal,.012,GOLD,.85*opacity);g.add(m);
  }
  g.scale.setScalar(size);return g;
}
let glyphMap;
function glyphTexture() {
  if (glyphMap) return glyphMap;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.translate(64,64); g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0,-57); g.lineTo(37,0); g.lineTo(0,57); g.lineTo(-37,0); g.closePath(); g.stroke();
  for (let i=0;i<5;i++) { g.save(); g.rotate(i*Math.PI*2/5); g.beginPath(); g.ellipse(0,-13,5,11,0,0,Math.PI*2); g.stroke(); g.restore(); }
  g.beginPath(); g.arc(0,0,4,0,Math.PI*2); g.stroke();
  for (const y of [-41,41]) { g.beginPath(); g.moveTo(-6,y); g.lineTo(6,y); g.stroke(); }
  return glyphMap = new THREE.CanvasTexture(c);
}
const dispose = group => group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });

export function createKurodaFx({ scene, spriteOf, posOf }) {
  const formations = new Map(), counters = new Map(), stuns = new Map(), wards = new Map(), bursts = [];
  const motion = new Map(), particles = createParticles(scene,{max:900}), cards = createCards(scene);
  const group = () => { const g = new THREE.Group(); scene.add(g); return g; };
  const ring = (g, radius, color, width = .025, opacity = .5) => {
    const m = mesh(new THREE.RingGeometry(radius-width, radius, 80), color, opacity);
    m.rotation.x = -Math.PI/2; m.position.y = .045; m.renderOrder=4;m.material.depthTest=true;
    m.userData.baseOpacity=opacity; g.add(m); return m;
  };
  function burst(g,life,spin=0,grow=0,animate=null) {
    const materials=[];
    g.traverse(o=>{if(o.isMesh)materials.push([o.material,o.material.opacity]);});
    bursts.push({g,age:0,life,spin,grow,materials,animate});
  }
  function sparks(x,y,z,n=16,spread=1,speed=2) {
    for(let i=0;i<n;i++){
      const a=rand(0,Math.PI*2),r=rand(0,spread),v=rand(.3,speed),gold=Math.random()<.55;
      particles.emit({x:x+Math.cos(a)*r,y:y+rand(-.1,.1),z:z+Math.sin(a)*r,
        vx:Math.cos(a)*v,vz:Math.sin(a)*v,vy:rand(.5,2.2),gravity:2.5,drag:2,
        life:rand(.35,.75),size:rand(.07,.18),color:gold?[1,.72,.3]:[.95,.12,.2],
        shape:gold?SHAPE.sparkle:SHAPE.ember,twinkle:.65,spin:rand(-3,3)});
    }
  }
  function impact(x,y,z,size=1) {
    cards.glint(x,y,z,1.6*size,GOLD,.3);
    cards.glint(x,y,z,.9*size,HOT,.22);
    sparks(x,y,z,Math.round(14*size),.12,2.2*size);
  }
  function shards(x,y,z,n=12,scale=1) {
    for(let i=0;i<n;i++){
      const a=i*Math.PI*2/n+rand(-.2,.2),v=rand(1.2,2.8)*scale;
      const g=group(),m=polygon([[0,.16],[-.035,0],[0,-.12],[.035,0]],i%3?GOLD:CRIMSON,.85);
      g.position.set(x,y,z);m.quaternion.copy(CAM_QUAT);m.rotateZ(a);g.add(m);
      burst(g,.4+Math.random()*.2,0,0,(k,dt)=>{g.position.x+=Math.cos(a)*v*dt;g.position.z+=Math.sin(a)*v*dt;g.position.y+=dt*(1-k);m.rotateZ(dt*3);});
    }
  }
  function shieldFlash(x,y,z,size=1) {
    const g=group(),ward=crest(size);g.position.set(x,y,z);ward.quaternion.copy(CAM_QUAT);g.add(ward);
    burst(g,.5,0,0,k=>ward.scale.setScalar(size*(1+.3*k)));
    impact(x,y,z,.9*size);shards(x,y,z,12,size);
  }
  function formationSet(f) {
    const g = group(); g.position.set(f.x,0,f.z);
    const rings=[ring(g,f.radius,CRIMSON,.07,.65),ring(g,f.radius-.12,GOLD,.025,.78),ring(g,f.radius+.06,CRIMSON,.014,.3)];
    for(const y of [.32,1.12]){const m=ring(g,f.radius,CRIMSON,.012,.16);m.position.y=y;rings.push(m);}
    const floor=crest(f.radius*.7,.38);floor.rotation.x=-Math.PI/2;floor.position.y=.055;
    floor.traverse(o=>{if(o.isMesh){o.renderOrder=4;o.material.depthTest=true;}});g.add(floor);
    const floorMaterials=[];floor.traverse(o=>{if(o.isMesh)floorMaterials.push([o.material,o.material.opacity]);});
    const segments=[];
    for(let i=0;i<12;i++){
      const m=mesh(new THREE.RingGeometry(f.radius*.72,f.radius*.73,16,1,i*Math.PI/6,.32),GOLD,.5);
      m.rotation.x=-Math.PI/2;m.position.y=.06;m.renderOrder=4;m.material.depthTest=true;g.add(m);segments.push(m);
    }
    const symbols = [],outer = new THREE.Group();g.add(outer);
    for (let i=0;i<20;i++) {
      const m=mesh(new THREE.PlaneGeometry(.64,.9),GOLD,.75,glyphTexture());
      const halo=mesh(new THREE.PlaneGeometry(.77,1.08),CRIMSON,.23,glyphTexture());
      g.add(halo,m); symbols.push({m,halo});
    }
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,m=mesh(new THREE.PlaneGeometry(.3,.42),GOLD,.32,glyphTexture());
      m.position.set(Math.cos(a)*(f.radius+.22),.42,Math.sin(a)*(f.radius+.22));m.rotation.y=-a-Math.PI/2;outer.add(m);
    }
    return { g, rings, symbols, floor, floorMaterials, segments, outer, f, age: 0, out: 0 };
  }
  function arc(x,z,r,life=.5,dir=0) {
    const g=group(),d=facing(dir);g.position.set(x,.95,z);g.rotation.y=-Math.atan2(d.z,d.x);
    for(const [radius,width,color,alpha,lag] of [[r,.62,CRIMSON,.58,0],[r+.03,.055,HOT,.95,0],[r-.04,.13,GOLD,.9,0],[r-.35,.14,CRIMSON,.4,-.38],[r-.65,.065,GOLD,.45,-.7]]) {
      const points=[],widths=[];
      for(let i=0;i<=64;i++){
        const t=i/64,a=t*Math.PI*1.6+lag,taper=Math.sin(t*Math.PI)**.7;
        points.push([Math.cos(a)*radius,.16*Math.sin(a),Math.sin(a)*radius]);widths.push(width*taper);
      }
      g.add(mesh(strip(points,widths),color,alpha));
    }
    burst(g,life,5,.12,(k,dt)=>{
      if(k>.7)return;
      const a=k*Math.PI*2*1.3;
      for(let n=count(45,dt);n>0;n--)particles.emit({x:x+Math.cos(a)*r,y:.9,z:z+Math.sin(a)*r,
        vx:Math.cos(a)*.8,vz:Math.sin(a)*.8,vy:rand(.1,.7),life:.4,size:rand(.1,.2),color:[1,.53,.2],shape:SHAPE.sparkle,spin:3});
    });
  }
  function thrust(c) {
    const dx=c.tx-c.x,dz=c.tz-c.z,len=Math.hypot(dx,dz);
    if (!len) return;
    const g=group();g.position.set(c.x,1.15,c.z);
    const finish=c.strike===3;
    const shaft=new THREE.Group();shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,0,dz).normalize());g.add(shaft);
    const width=finish ? .21 : .14,head=Math.min(.8,len*.4);
    for(const [w,color,opacity] of [[width*1.6,CRIMSON,.3],[width,finish?GOLD:CRIMSON,.75],[width*.22,HOT,.95]]){
      const m=polygon([[0,len],[w,len-head*.72],[w*.36,len-head],[w*.2,.15],[-w*.2,.15],[-w*.36,len-head],[-w,len-head*.72]],color,opacity);
      shaft.add(m);
      // Crossed planes keep the spearhead broad from every direction.
      const cross=m.clone();cross.geometry=m.geometry.clone();cross.material=m.material.clone();cross.rotation.y=Math.PI/2;shaft.add(cross);
    }
    burst(g,finish ? .45 : .33,0,0,k=>shaft.scale.setScalar(.78+.22*Math.min(1,k/.15)));
    const a=angleOf(dx,dz),mx=(c.x+c.tx)/2,mz=(c.z+c.tz)/2;
    cards.stroke(mx,1.15,mz,a,len,finish ? .65 : .4,CRIMSON,.4);
    cards.stroke(mx,1.15,mz,a,len*.92,.065,HOT,.28);
    if(c.landed!==false){impact(c.tx,1.15,c.tz,finish?1.5:.8);if(finish)shards(c.tx,1.15,c.tz,16,1.2);}
  }
  return {
    cast(c) {
      if (c.kind==='sweep') {
        arc(c.x,c.z,c.radius,.62,c.dir);
        for(let i=0;i<40;i++){const a=i*Math.PI*2/40;sparks(c.x+Math.cos(a)*c.radius,.24,c.z+Math.sin(a)*c.radius,1,0,1.7);}
        cards.glint(c.x,.35,c.z,1.25,GOLD,.3);
      }
      if (c.kind==='cleave') {arc(c.tx,c.tz,c.radius,.35,c.dir);sparks(c.tx,.8,c.tz,9,.6,1.2);}
      if (c.kind==='thrust') thrust(c);
      if (c.kind==='reprisal') {arc(c.x,c.z,.7,.3);}
      if (c.kind==='counter') {
        const d=facing(c.dir);shieldFlash(c.x+d.x*.4,1.3,c.z+d.z*.4,1.35);
        cards.stroke(c.x,1.25,c.z,-.55,1.9,.4,GOLD,.36);
        const s=spriteOf(c.a);if(s)s.flash=Math.max(s.flash||0,.8);
      }
      if (c.kind==='counterstun') shieldFlash(c.tx,1.55,c.tz,.75);
      if (c.kind==='pursuit') {
        // The unfinished brace opens into two streaming ribbons.
        const d=facing(c.dir),g=group();g.position.set(c.x,1.2,c.z);
        for(const side of [-1,1]){
          const points=[],widths=[];
          for(let i=0;i<=20;i++){const t=i/20;points.push([-d.x*t*1.8-d.z*side*(.25+t*.3),Math.sin(t*4)*.16,-d.z*t*1.8+d.x*side*(.25+t*.3)]);widths.push(.2*(1-t));}
          g.add(mesh(strip(points,widths),CRIMSON,.65));
        }
        burst(g,.45);sparks(c.x,.15,c.z,18,.25,2);
      }
      if (c.kind==='formation') {
        cards.seal(c.x,c.z,2.6,'守',GOLD,.9,{opacity:.55,spin:-.35});
        sparks(c.x,.2,c.z,36,1.2,2);
      }
    },
    update(dt,state,heroId) {
      particles.update(dt);cards.update(dt);
      const owner=state.entities[heroId]?.owner;
      const live=new Set();
      for (const f of state.formations || []) {
        if (f.until<=state.tick || !(f.clan===owner || spriteOf(f.a)?.thing.mesh.visible)) continue;
        const key=`${f.a}:${f.start}`;live.add(key);
        let v=formations.get(key);
        if (!v) {v=formationSet(f);formations.set(key,v);}
        v.f=f;v.out=0;
      }
      for (const [key,v] of formations) {
        v.age+=dt;
        if (!live.has(key)) v.out+=dt;
        const fade=Math.min(1,v.age/.25)*Math.max(0,1-v.out/.4);
        if (!fade) {scene.remove(v.g);dispose(v.g);formations.delete(key);continue;}
        v.symbols.forEach(({m,halo},i)=>{
          const a=i*Math.PI*2/v.symbols.length-v.age*.42;
          const r=v.f.radius;
          const rise=Math.min(1,Math.max(0,(v.age-i*.018)/.38));
          m.position.set(Math.cos(a)*r,(.85+(i%2)*.35)*rise+Math.sin(v.age*2+i)*.06,Math.sin(a)*r);
          m.scale.setScalar(.75+.25*rise);
          m.rotation.set(0,-a-Math.PI/2,0);
          const near=Math.cos(a)*VIEW_DIR.x+Math.sin(a)*VIEW_DIR.z>0;
          const pulse=.9+.1*Math.sin(v.age*3+i*.4);
          m.material.opacity=(near ? .3 : .9)*fade*pulse*rise;
          halo.position.copy(m.position);halo.rotation.copy(m.rotation);
          halo.scale.copy(m.scale);halo.material.opacity=(near ? .09 : .3)*fade*pulse*rise;
        });
        const floorReveal=Math.min(1,v.age/.6);
        v.floor.scale.setScalar(v.f.radius*.7*(.4+.6*floorReveal));
        for(const [m,opacity] of v.floorMaterials)m.opacity=opacity*fade*floorReveal;
        v.segments.forEach((m,i)=>{m.rotation.z=-v.age*.23;m.material.opacity=.65*fade*Math.min(1,Math.max(0,(v.age-i*.025)/.2));});
        v.outer.rotation.y=v.age*.32;
        v.outer.children.forEach(m=>m.material.opacity=.32*fade);
        for (const m of v.rings) m.material.opacity=m.userData.baseOpacity*fade*(.9+.1*Math.sin(v.age*3));
        for(let n=count(14*fade,dt);n>0;n--){const a=rand(0,Math.PI*2);
          particles.emit({x:v.f.x+Math.cos(a)*v.f.radius,y:.25,z:v.f.z+Math.sin(a)*v.f.radius,
            vy:rand(.35,.8),life:rand(.65,1.15),size:rand(.06,.12),color:[1,.68,.25],shape:SHAPE.sparkle,twinkle:.8});
        }
      }
      const activeCounters=new Set(), activeStuns=new Set(), activeWards=new Set(), movingIds=new Set();
      for (const e of Object.values(state.entities)) {
        const p=posOf(e.id), s=spriteOf(e.id);
        if (!p || !s?.thing.mesh.visible || e.dead || e.downed || e.jailed) continue;
        if (e.brace || e.buffs?.reprisal?.until>state.tick) {
          activeCounters.add(e.id);let v=counters.get(e.id);
          if (!v) {
            const g=group(),m=ring(g,.65,GOLD,.05,.65),badge=crest(1.05),coil=new THREE.Group();g.add(badge,coil);
            for(const [width,color,alpha] of [[.06,CRIMSON,.5],[.014,GOLD,.9]]) {
              const points=[];for(let i=0;i<=32;i++){const a=i*Math.PI*4/32;points.push([Math.cos(a)*.43,.35+i/32*1.55,Math.sin(a)*.43]);}
              coil.add(line(points,width,color,alpha));
            }
            const materials=[],parts=[];badge.traverse(o=>{if(o.isMesh){materials.push([o.material,o.material.opacity]);parts.push(o.geometry);}});
            v={g,m,badge,coil,materials,parts};counters.set(e.id,v);
          }
          v.g.position.set(p.x,0,p.z);v.m.rotation.z+=dt*2;
          v.m.material.color.set(e.brace?GOLD:CRIMSON);
          v.m.material.opacity=e.brace ? .65 : .3+.12*Math.sin(state.tick*.4);
          const d=facing(e.dir);
          v.badge.position.set(d.x*.25-d.z*.36,1.3,d.z*.25+d.x*.36);
          // Counter's ring may rotate; the shield ward keeps facing the camera.
          v.badge.quaternion.copy(v.g.quaternion).invert().multiply(CAM_QUAT);
          v.badge.visible=!!e.brace||!!e.buffs?.reprisal?.stunPending;
          const progress=e.brace?Math.min(1,(state.tick-e.brace.start+1)/6):1;
          v.badge.scale.setScalar(e.brace ? .7+.35*progress : .55);
          for(const [m,alpha] of v.materials)m.opacity=alpha*(e.brace?progress:.65);
          for(const geo of v.parts)geo.setDrawRange(0,Math.floor(geo.index.count*progress/3)*3);
          v.coil.visible=!e.brace;v.coil.rotation.y+=dt*3;
          for(let n=count(e.brace?7:4,dt);n>0;n--)sparks(p.x,.4,p.z,1,.4,.6);
        }
        if(e.buffs?.snared?.style==='kuroda'&&e.buffs.snared.until>state.tick) {
          for(let n=count(10,dt);n>0;n--){const a=rand(0,Math.PI*2);
            particles.emit({x:p.x+Math.cos(a)*.4,y:.13,z:p.z+Math.sin(a)*.4,vy:.15,
              life:.5,size:.17,color:[.9,.1,.2],shape:SHAPE.ember,spin:2,
              orbit:{x:p.x,z:p.z,r:.4,w:4,a}});
          }
        }
        if(e.buffs?.formation?.until>state.tick){
          activeWards.add(e.id);let v=wards.get(e.id);
          if(!v){const g=group(),badge=mesh(new THREE.PlaneGeometry(.32,.44),GOLD,.65,glyphTexture());g.add(badge);v={g,badge};wards.set(e.id,v);}
          v.g.position.set(p.x,2.1+Math.sin(state.tick*.1+e.id)*.045,p.z);
          v.badge.quaternion.copy(CAM_QUAT);v.badge.material.opacity=.55+.15*Math.sin(state.tick*.15+e.id);
        }
        if(e.buffs?.pursuit?.until>state.tick){
          movingIds.add(e.id);const old=motion.get(e.id),d=old?Math.hypot(p.x-old.x,p.z-old.z):0;
          if(old&&old.place===e.place&&d>.005&&d<2){
            const dx=p.x-old.x,dz=p.z-old.z,a=angleOf(dx,dz),ux=dx/d,uz=dz/d;
            if(Math.random()<dt*14){
              const g=group();g.position.set(p.x,0,p.z);
              for(const side of [-1,1])for(const [width,color,alpha] of [[.18,CRIMSON,.5],[.026,GOLD,.85]]) {
                const points=[],widths=[];
                for(let i=0;i<=16;i++){
                  const t=i/16,wave=Math.sin(t*5+state.tick*.3)*.12,back=t*1.65;
                  points.push([-ux*back-uz*(side*.3+wave),1.25-t*.55,-uz*back+ux*(side*.3+wave)]);widths.push(width*(1-t));
                }
                g.add(mesh(strip(points,widths),color,alpha));
              }
              burst(g,.32);
              cards.stroke(p.x-ux*.3,.1,p.z-uz*.3,a,.5,.045,GOLD,.22);
            }
            for(let n=count(18,dt);n>0;n--)particles.emit({x:p.x+rand(-.2,.2),y:.1,z:p.z+rand(-.2,.2),vx:-ux*.6,vz:-uz*.6,vy:.3,
              life:.4,size:.1,color:[1,.63,.23],shape:SHAPE.sparkle,twinkle:.7});
          }
          motion.set(e.id,{x:p.x,z:p.z,place:e.place});
        }
        if (e.buffs?.stunned?.until>state.tick) {
          activeStuns.add(e.id);let v=stuns.get(e.id);
          if (!v) { const g=group(), stars=[];for(let i=0;i<3;i++){const m=mesh(new THREE.OctahedronGeometry(.07),GOLD,.9);g.add(m);stars.push(m);}v={g,stars};stuns.set(e.id,v); }
          v.g.position.set(p.x,2.35,p.z);v.g.rotation.y+=dt*5;
          v.stars.forEach((m,i)=>m.position.set(Math.cos(i*Math.PI*2/3)*.25,0,Math.sin(i*Math.PI*2/3)*.25));
        }
      }
      for (const [map,liveIds] of [[counters,activeCounters],[stuns,activeStuns],[wards,activeWards]]) for(const [id,v] of map)
        if(!liveIds.has(id)){scene.remove(v.g);dispose(v.g);map.delete(id);}
      for(const id of motion.keys())if(!movingIds.has(id))motion.delete(id);
      for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.age+=dt;
        if(b.age>=b.life){scene.remove(b.g);dispose(b.g);bursts.splice(i,1);continue;}
        b.g.rotation.y+=dt*b.spin;
        const k=b.age/b.life;
        if(b.grow)b.g.scale.setScalar(1-b.grow*(1-Math.min(1,k/.45)));
        for(const [m,opacity] of b.materials)m.opacity=opacity*(1-k)**1.3;
        b.animate?.(k,dt);
      }
    },
  };
}
