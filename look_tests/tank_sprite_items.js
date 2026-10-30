import * as THREE from 'three';
import {chainWeightPose} from './tank_chain_motion.js';
import {rightTonfaPitch} from './tank_tonfa_motion.js';

// Physical shield with painted face, iron rim, board thickness and rear straps.
export function buildLongShield(std,texture){
 const g=new THREE.Group();
 const iron=std({color:0x393238,metalness:.65,roughness:.6},[0xb49b7b,.35]);
 const wood=std({color:0x342b25,roughness:.85},[0x8c7770,.2]);
 const leather=std({color:0x36221c,roughness:.9},[0x8c6652,.15]);
 const add=(w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.userData.noWeaponGlow=true;g.add(m);return m;};
 add(.53,1.12,.075,0,-.16,0,wood);
 const painted=std({map:texture,color:0xffffff,roughness:.72,metalness:.12},[0x96827c,.2]);
 add(.51,1.10,.006,0,-.16,.041,painted);
 for(const x of [-.27,.27])add(.022,1.15,.09,x,-.16,0,iron);
 for(const y of [-.73,.41])add(.55,.022,.09,0,y,0,iron);
 for(const y of [-.34,.06]){
  add(.22,.04,.03,0,y,-.10,leather);
  for(const x of [-.11,.11])add(.025,.04,.08,x,y,-.07,leather);
 }
 return g;
}

export function buildTankWeapon(std,kind){
 const group=new THREE.Group();group.userData.tank=kind;
 const iron=std({color:0x38333e,metalness:.7,roughness:.45},[0x948ba4,.3]);
 const cord=std({color:kind==='tonfa'?0x342a43:0x661f2a,roughness:.85},[0x8a6075,.2]);
 const silver=std({color:0x9b949b,metalness:.8,roughness:.3},[0xb7a9bb,.4]);
 const glow=std({color:0x8b62ac,emissive:0x50306c,emissiveIntensity:.3,roughness:.5},[0xa97ad1,.35]);
 const box=(parent,w,h,d,x,y,z,mat,lit=false)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.userData.noWeaponGlow=!lit;parent.add(m);return m;};
 if(kind==='tonfa'){
  for(const side of ['Right','Left']){
   const baton=new THREE.Group();baton.name=side;group.add(baton);
   box(baton,.045,.045,.86,.12,0,.16,iron);
   box(baton,.15,.035,.035,.045,0,-.06,cord);
   for(const z of [-.26,.57])box(baton,.055,.055,.025,.12,0,z,silver);
   box(baton,.007,.006,.72,.12,.025,.16,glow,true);
   if(side==='Left')for(const mesh of baton.children){mesh.position.z*=1.25;mesh.scale.z*=1.25;}
  }
 }else{
  const sickle=new THREE.Group();sickle.name='sickle';group.add(sickle);
  box(sickle,.035,.035,.48,0,0,.06,cord);
  for(const z of [-.17,.28])box(sickle,.05,.05,.025,0,0,z,silver);
  const shape=new THREE.Shape();shape.moveTo(0,.27);shape.bezierCurveTo(.14,.37,.42,.32,.47,.08);shape.bezierCurveTo(.33,.23,.15,.23,0,.20);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSize:.003,bevelThickness:.002,bevelSegments:1,steps:1});geo.rotateX(Math.PI/2);
  sickle.add(new THREE.Mesh(geo,silver));
  const links=new THREE.InstancedMesh(new THREE.TorusGeometry(.022,.006,4,8),iron,30);links.name='chain';links.userData.noWeaponGlow=true;links.frustumCulled=false;group.add(links);
  const weight=new THREE.Mesh(new THREE.IcosahedronGeometry(.08,0),iron);weight.name='weight';weight.userData.noWeaponGlow=true;group.add(weight);
 }
 return group;
}

// The weight follows a deliberate extension/sweep/recovery arc, baked into each attack frame.
// This is asset animation only; it never adds combat reach or damage.
export function poseTankWeapon(group,root,findBone,{clip,phase,palmOf}){
 root.updateMatrixWorld(true);
 if(group.userData.tank==='tonfa'){
  for(const side of ['Right','Left']){
   const hand=findBone(new RegExp(side+'Hand$')),baton=group.getObjectByName(side);if(!hand)continue;
   palmOf(hand,baton.position);baton.scale.setScalar(root.scale.x);
   if(side==='Right'){
    const pitch=rightTonfaPitch(phase,/slash|thrust/i.test(clip)),direction=new THREE.Vector3(0,Math.sin(pitch),Math.cos(pitch)).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    baton.lookAt(baton.position.clone().add(direction));
   }else{hand.getWorldQuaternion(baton.quaternion);baton.rotateX(Math.PI/2);}
  }return;
 }
 const hand=findBone(/RightHand$/);if(!hand)return;
 const sickle=group.getObjectByName('sickle');palmOf(hand,sickle.position);hand.getWorldQuaternion(sickle.quaternion);sickle.rotateX(Math.PI/2);sickle.scale.setScalar(root.scale.x);sickle.updateMatrixWorld(true);
 const start=sickle.localToWorld(new THREE.Vector3(0,0,-.18));
 const motion=chainWeightPose(phase,/slash|thrust/i.test(clip)),extend=motion.extension;
 const end=root.localToWorld(new THREE.Vector3(motion.x,motion.y,motion.z));
 const mid=start.clone().lerp(end,.5);mid.y-=(1-extend)*.30;
 const curve=new THREE.QuadraticBezierCurve3(start,mid,end),links=group.getObjectByName('chain'),dummy=new THREE.Object3D();
 for(let i=0;i<30;i++){const t=i/29;dummy.position.copy(curve.getPoint(t));dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),curve.getTangent(t));dummy.rotateY(i%2*Math.PI/2);dummy.scale.setScalar(root.scale.x);dummy.updateMatrix();links.setMatrixAt(i,dummy.matrix);}
 links.instanceMatrix.needsUpdate=true;group.getObjectByName('weight').position.copy(end);
}
