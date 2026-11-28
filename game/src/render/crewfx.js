// Presentation only: finite projectile meshes and visible, state-driven control effects.
import * as THREE from 'three';
import { onFxLayer } from './bloom.js';
import { groundY } from '../castle_height.js';

export function createCrewFx({scene,spriteOf,heroFx}){   // heroFx: render/hero_fx.js painted effects (2026-11-28)
  const shots=new Map(),bindings=new Map(),braces=new Map(),bursts=[];
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  const material=color=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide});
  function add(geometry,color){const m=new THREE.Mesh(geometry,material(color));scene.add(m);onFxLayer(m);return m;}
  function remove(m){scene.remove(m);m.traverse?.(n=>{n.geometry?.dispose();if(n.material)n.material.dispose();});}
  const visible=id=>!!spriteOf(id)?.thing.mesh.visible;
  let glow=null;   // a soft round light, made once (torch glow)
  function glowTex(){if(glow)return glow;const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.4,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return glow=new THREE.CanvasTexture(cv);}
  function ring(radius,color){const m=add(new THREE.RingGeometry(radius-.04,radius+.04,40),color);m.rotation.x=-Math.PI/2;return m;}
  // A soft see-through streak trailing a shot (2026-11-25: tower and stockade shots were hard to see in a war):
  // a faded straw colour starting just behind the fletching, in segments that thin and fade to nothing toward the
  // tail, plus a faint wider sheath so it holds up zoomed out. Normal blending and kept off the bloom layer, so it
  // never glows brighter than the lanterns.
  const TRACER={arrow:{core:0xd3c9b0,glow:0xc4b89c,back:-.7,seg:[[.45,.04,.5],[.45,.028,.26],[.45,.012,.07]],sheath:.13,sheathOpacity:.13,halo:{color:0xdccfae,at:-.1,size:1.8,opacity:.28}},
    bullet:{core:0xd2c6ae,glow:0xc2b8a4,back:-.14,seg:[[.8,.02,.4],[.8,.015,.2],[.8,.008,.06]],sheath:.09,sheathOpacity:.09,halo:{color:0xe8c58a,at:.05,size:.65,opacity:.2}}};   // bullet: a pale heat-and-smoke hairline behind the lead slug
  function tracer(group,t){
    let y=t.back,top=t.seg[0][1];
    for(const [len,r,o] of t.seg){
      const m=new THREE.Mesh(new THREE.CylinderGeometry(top,r,len,6,1,true),material(t.core));m.material.opacity=o;m.position.y=y-len/2;group.add(m);
      y-=len;top=r;
    }
    const total=t.back-y,sheath=new THREE.Mesh(new THREE.CylinderGeometry(t.sheath,t.sheath*.1,total,8,1,true),material(t.glow));
    sheath.material.opacity=t.sheathOpacity;sheath.position.y=t.back-total/2;group.add(sheath);
    // a soft halo round the shot itself keeps it findable zoomed out
    const h=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color:t.halo.color,transparent:true,depthWrite:false,opacity:t.halo.opacity}));h.position.y=t.halo.at;h.scale.setScalar(t.halo.size);group.add(h);
  }
  function shot(p){
    const group=new THREE.Group(),color=p.kind==='geishabolt'?0xff82c3:p.kind==='cannonball'?0x26262a:p.kind==='firebomb'?0xff8a3c:p.hamstring?0x8affcb:p.kind==='bullet'?0xfff2b0:0xf3dc9a;
    const shaft=new THREE.Mesh(p.kind==='cannonball'?new THREE.SphereGeometry(p.ship?.13:.21,10,8):p.kind==='firebomb'?new THREE.SphereGeometry(.22,8,6):p.kind==='geishabolt'?new THREE.SphereGeometry(.10,8,6):p.kind==='bullet'?new THREE.CylinderGeometry(.035,.035,1.5,5):new THREE.CylinderGeometry(.04,.04,1.0,5),material(color));   // bullet: bright tracer (war riflemen)
    group.add(shaft);   // 7c (2026-11-12): shots are much easier to see; the body was never added before, only the faint trail showed
    if(p.kind==='cannonball'){
      // 2026-11-13: a long soft smoke wake, not a defined tube: soft puffs that grow and fade behind the ball
      shaft.material.opacity=1;
      for(let i=1;i<=8;i++){const puff=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color:0xcfc8bc,transparent:true,depthWrite:false,opacity:.2*(1-i/9)}));puff.position.y=-.3*i*(p.ship?.7:1);puff.scale.setScalar((.3+.07*i)*(p.ship?.65:1));group.add(puff);}
      scene.add(group);group.traverse(onFxLayer);return {mesh:group,elapsed:0};
    }
    // 2026-11-12: arrows and bullets looked the same; an arrow is a wooden shaft with an iron head and pale
    // fletching, a bullet a small hot ball with a thin fading streak, flying flat
    if(p.kind==='arrow'&&!p.hamstring){
      shaft.geometry.dispose();shaft.geometry=new THREE.CylinderGeometry(.03,.03,1.15,5);shaft.material.color.set(0x8a6440);shaft.material.opacity=1;
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.08,.26,5),material(0x2e2f33));tip.material.opacity=1;tip.position.y=.7;group.add(tip);
      for(const r of [0,Math.PI/2]){const f=new THREE.Mesh(new THREE.PlaneGeometry(.1,.18),material(0xe8e2d4));f.position.y=-.48;f.rotation.y=r;f.material.opacity=.95;group.add(f);}
      if(p.tower||p.garrison)shaft.material.color.set(0x5e4128);   // a darker shaft reads against the ground zoomed out
      scene.add(group);group.traverse(onFxLayer);if(p.tower||p.garrison)tracer(group,TRACER.arrow);return {mesh:group,elapsed:0};
    }
    if(p.kind==='bullet'){
      // a solid slug (2026-11-12: it read as an effect): a dull lead body with a rounded nose, a faint grey wake
      shaft.geometry.dispose();shaft.geometry=new THREE.CylinderGeometry(.065,.065,.26,8);shaft.material.color.set(0x6d6558);shaft.material.opacity=1;
      const nose=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6,0,Math.PI*2,0,Math.PI/2),material(0x8a8070));nose.material.opacity=1;nose.position.y=.13;group.add(nose);
      const glint=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.16,5),material(0xd8cfb8));glint.material.opacity=.9;glint.position.set(.03,0,.03);group.add(glint);
      if(!p.garrison){const streak=new THREE.Mesh(new THREE.CylinderGeometry(.025,.003,.7,5),material(0xcfc8b8));streak.position.y=-.45;streak.material.opacity=.22;group.add(streak);}
      scene.add(group);group.traverse(onFxLayer);if(p.garrison)tracer(group,TRACER.bullet);return {mesh:group,elapsed:0};   // stockade rifle shots: the same tracer
    }
    if(p.kind==='arrow'){const tip=new THREE.Mesh(new THREE.ConeGeometry(.11,.3,5),material(color));tip.position.y=.62;group.add(tip);}
    const trail=new THREE.Mesh(new THREE.CylinderGeometry(.03,.008,p.hamstring?1.4:p.kind==='bullet'?1.6:.9,5),material(color));trail.position.y=p.kind==='bullet'?-1.5:-.9;trail.material.opacity=.5;group.add(trail);
    scene.add(group);group.traverse(onFxLayer);return {mesh:group,elapsed:0};
  }
  return {
    clear(){for(const map of [shots,bindings,braces]){for(const v of map.values())remove(v.mesh||v);map.clear();}for(const b of bursts)remove(b.mesh);bursts.length=0;},
    cast(c){
      if(!visible(c.a))return;
      if(c.kind==='boarded'){for(const radius of [1.6,2.4]){const m=ring(radius,0xffd34d);m.position.set(c.x,.13+groundY(c.x,c.z),c.z);bursts.push({mesh:m,time:0,life:.5,expand:true});}}
      if(c.kind==='refuseMount'){for(const radius of [1.1,1.6]){const m=ring(radius,0xff5a3c);m.position.set(c.x,.13+groundY(c.x,c.z),c.z);bursts.push({mesh:m,time:0,life:.55,expand:true});}}
      if(c.kind==='dogsGone')heroFx.dustPuff(c.x,c.z,.8);   // a loosed dog vanishes in a dust puff (sim/dogs.js)   // a loosed dog vanishes in a dust puff (sim/dogs.js)
      if(c.kind==='firebombMark')heroFx.bombMark(c.x,c.z,{radius:c.radius,seconds:(c.ticks||40)/20});   // war 7c-2: the real radius, filling through the wind-up and flight (painted 2026-11-28)
      if(c.kind==='torchCast')heroFx.torch(c.x,c.z,(c.ticks||20)/20,()=>spriteOf(c.a)?.pos,c.tx??c.x,c.tz??c.z);   // the Torch channel: a painted flame out in front of him, toward the building (2026-11-28)
      if(c.kind==='dogsBite')heroFx.bite(c.x,c.z);
      if(c.kind==='hamstringHit')heroFx.hamstring(c.x,c.z);   // painted, with dark red blood (2026-11-28)
      // taunts: abilityfx.js heroFx.taunt (2026-11-28)
    },
    update(dt,state,heroId,viewPlace=null){
      const hero=viewPlace?{...state.entities[heroId],place:viewPlace}:state.entities[heroId],present=new Set();
      for(const p of state.projectiles||[]){
        // one key per shot: a tower's volley shares a and at (2026-11-25: only one of its 3 arrows was drawn)
        if(hero?.place!==p.place||(!p.tower&&!p.garrison&&!visible(p.a)))continue;   // garrison: shot from inside a house (7c-3b)   // tower: a watchtower's arrow has no unit behind it (war checkpoint 6)
        const key=`${p.a}:${p.at}:${p.t}:${p.until}`;present.add(key);let v=shots.get(key);if(!v){v=shot(p);shots.set(key,v);}
        v.elapsed=Math.max(v.elapsed+dt*20,state.tick-p.at-1);
        const u=Math.min(1,v.elapsed/(p.until-p.at)),dx=p.tx-p.x,dz=p.tz-p.z;
        // A shallow arc remains readable without making a close shot look lobbed.
        v.mesh.position.set(p.x+dx*u,groundY(p.x,p.z)*(1-u)+groundY(p.tx,p.tz)*u+1.2+(p.kind==='firebomb'?1.6:p.kind==='cannonball'?.8:p.kind==='bullet'?0:.25)*Math.sin(Math.PI*u),p.z+dz*u);   // bombs and cannon balls are lobbed
        direction.set(dx,groundY(p.tx,p.tz)-groundY(p.x,p.z)+(p.kind==='bullet'?0:.25)*Math.PI*Math.cos(Math.PI*u),dz).normalize();v.mesh.quaternion.setFromUnitVectors(up,direction);
      }
      for(const [key,v] of shots)if(!present.has(key)){remove(v.mesh);shots.delete(key);}
      const activeBindings=new Set(),activeBraces=new Set();
      for(const e of Object.values(state.entities)){
        if(e.dead||e.downed||e.jailed||e.place!==hero?.place||!visible(e.id))continue;
        if(e.buffs?.snared?.hamstring&&e.buffs.snared.until>state.tick){
          activeBindings.add(e.id);let m=bindings.get(e.id);if(!m){m=ring(.42,0x83ffd1);bindings.set(e.id,m);}m.position.set(e.x,.25+groundY(e.x,e.z),e.z);m.rotation.z+=dt*1.8;m.scale.setScalar(1+.08*Math.sin(state.tick*.35));
        }
        if(e.type==='kuroda_enforcer'&&e.buffs?.bulwark?.until>state.tick){
          activeBraces.add(e.id);let m=braces.get(e.id);if(!m){m=ring(.8,0xff514d);braces.set(e.id,m);}m.position.set(e.x,.09+groundY(e.x,e.z),e.z);m.material.opacity=.4+.15*Math.sin(state.tick*.2);
        }
      }
      for(const [map,active] of [[bindings,activeBindings],[braces,activeBraces]])for(const [id,m] of map)if(!active.has(id)){remove(m);map.delete(id);}
      for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.time+=dt;if(b.expand)b.mesh.scale.setScalar(1+b.time*3);b.mesh.traverse(n=>{if(n.material)n.material.opacity=(n.userData.fxOpacity??.65)*(b.steady?.55+.45*Math.abs(Math.sin(b.time*7)):Math.max(0,1-b.time/b.life));});if(b.time>=b.life){remove(b.mesh);bursts.splice(i,1);}}
    }
  };
}
