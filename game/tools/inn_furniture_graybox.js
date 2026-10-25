import * as THREE from 'three';
import { CAM_RIGHT, CAM_UP, CAM_QUAT, VIEW_DIR, toScreen } from '../src/render/iso.js';
import { plan } from './inn_furniture_plan.js';
import { createInnStructure } from './inn_structure.js';

// A deliberately simple but complete 3D reference for one whole-scene paint.
// Positions and footprints come only from the furnished blueprint JSON.
const params = new URLSearchParams(location.search);
const wallOnlyRequested = params.get('wallOnly') === '1';
const referenceRequested = params.get('reference') === '1' || wallOnlyRequested;
const floorOnlyRequested = params.get('floorOnly') === '1';
const outerMargin = 2;
const floorBounds = [-outerMargin, -outerMargin, plan.size[0] + outerMargin, plan.size[1] + outerMargin];
const capture = params.has('capture');
const captureIds = params.get('capture') === 'ids';
const paintRequested = params.get('paint') === '1';
const cutoutsRequested = paintRequested && params.get('cutouts') !== '0';
const wallsRequested = params.get('walls') === '1';
document.body.classList.toggle('capture', capture);
document.body.classList.toggle('reference', referenceRequested);
const canvas = document.querySelector('#view');
const stage = document.querySelector('#stage');
const labels = document.querySelector('#labels');
const labelToggle = document.querySelector('#show-labels');
const paintToggle = document.querySelector('#paint');
const warpToggle = document.querySelector('#local-warp');
const softContactToggle = document.querySelector('#soft-contact');
const exactCutoutsToggle = document.querySelector('#exact-cutouts');
const wallsToggle = document.querySelector('#walls');
const fadeWallsToggle = document.querySelector('#fade-walls');
const focusRoom = document.querySelector('#focus-room');
const doorsButton = document.querySelector('#doors');
const objectSelect = document.querySelector('#paint-object');
const paintX = document.querySelector('#paint-x');
const paintY = document.querySelector('#paint-y');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: referenceRequested });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = referenceRequested ? null : new THREE.Color('#17191c');
if (referenceRequested) renderer.setClearColor(0x000000, 0);
scene.add(new THREE.HemisphereLight('#e9eef3', '#454748', 1.25));
const daylight = new THREE.DirectionalLight('#f4f0e6', 0.8);
daylight.position.set(-8, 16, -3);
daylight.castShadow = true;
daylight.shadow.mapSize.set(2048, 2048);
daylight.shadow.camera.left = -17;
daylight.shadow.camera.right = 17;
daylight.shadow.camera.top = 17;
daylight.shadow.camera.bottom = -17;
daylight.shadow.bias = -0.0002;
scene.add(daylight);

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.91, ...extra });
const m = {
  floor: mat('#bdb5a5'), seam: mat('#918a7c'),
  timber: mat('#77695a'), top: mat('#9b8871'), dark: mat('#4d493f'),
  cloth: mat('#8c9497'), linen: mat('#c0b9aa'), blanket: mat('#687680'),
  ceramic: mat('#9c9a91'), metal: mat('#54585a', { metalness: 0.18 }),
  stone: mat('#777770'), water: mat('#778c94', { roughness: 0.28 }),
  map: mat('#d6caa9'), lamp: mat('#e9af77', { emissive: '#ff974e', emissiveIntensity: 1.8 }),
  cord: mat('#9c8a76'),
};

function add(parent, geo, material, x, y, z) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const box = (p, x, y, z, w, h, d, material) => add(p, new THREE.BoxGeometry(w, h, d), material, x, y, z);
const cylinder = (p, x, y, z, r0, r1, h, material, sides=16) => add(p, new THREE.CylinderGeometry(r0, r1, h, sides), material, x, y, z);
let floorTop;
let grayFloorMaterial;
function floor() {
  const [x0,z0,x1,z1] = floorBounds;
  const w=x1-x0, d=z1-z0;
  const base=box(scene, (x0+x1)/2, -0.10, (z0+z1)/2, w, 0.2, d, m.dark);
  base.castShadow = false;
  base.visible = !referenceRequested;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = w*90; textureCanvas.height = d*90;
  const ctx = textureCanvas.getContext('2d');
  ctx.fillStyle = '#bcb3a3'; ctx.fillRect(0, 0, w*90, d*90);
  for (let z=0; z<d; z++) for (let x=0; x<w; x++) {
    const xx=x*90, zz=z*90;
    ctx.fillStyle = (x+z)%3===0 ? '#c5bcab' : (x+z)%3===1 ? '#bcb4a4' : '#b6ae9f';
    ctx.fillRect(xx+2, zz+2, 86, 86);
    ctx.strokeStyle = '#a69d8d'; ctx.lineWidth = 1;
    for (let k=13; k<90; k+=13) { ctx.beginPath(); ctx.moveTo(xx+4, zz+k); ctx.lineTo(xx+86, zz+k); ctx.stroke(); }
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  grayFloorMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grayFloorMaterial);
  top.rotation.x = -Math.PI/2; top.position.set((x0+x1)/2, 0.005, (z0+z1)/2);
  top.receiveShadow = true;
  scene.add(top);
  top.visible = !referenceRequested;
  floorTop = top;
}

function table(g,w,d,h=0.82) {
  box(g,0,h,0,w,0.16,d,m.top);
  box(g,0,h-0.11,0,w*0.91,0.12,d*0.88,m.timber);
  for (const x of [-w/2+0.17,w/2-0.17]) for (const z of [-d/2+0.17,d/2-0.17])
    box(g,x,(h-0.16)/2,z,0.15,h-0.16,0.15,m.dark);
}
function chest(g,w,d) {
  box(g,0,0.37,0,w,0.69,d,m.timber);
  box(g,0,0.75,0,w+0.06,0.09,d+0.06,m.top);
  for (const x of [-w*0.32,w*0.32]) box(g,x,0.42,d/2+0.008,0.08,0.57,0.026,m.metal);
  box(g,0,0.52,d/2+0.03,0.2,0.11,0.08,m.metal);
}
function futon(g,w,d) {
  box(g,0,0.08,0,w,0.16,d,m.dark);
  box(g,0,0.17,0,w*0.94,0.15,d*0.92,m.linen);
  box(g,0,0.25,d*0.12,w*0.93,0.16,d*0.56,m.blanket);
  box(g,0,0.29,-d*0.29,w*0.42,0.15,d*0.24,m.cloth);
}
function shelf(g,w,d,h=1.8) {
  for (const x of [-w/2+0.07,w/2-0.07]) for (const z of [-d/2+0.06,d/2-0.06])
    box(g,x,h/2,z,0.13,h,0.13,m.dark);
  for (const y of [0.14,h*0.39,h*0.69,h-0.11])
    box(g,0,y,0,w,0.12,d,m.timber);
}
function cushion(g,w,d) {
  box(g,0,0.09,0,w,0.17,d,m.cloth);
  box(g,0,0.17,0,w*0.88,0.035,d*0.84,m.linen);
}
function lamp(g) {
  const roofY=3.0, centreY=1.95, bodyTop=centreY+0.31;
  const profile=[[0.10,-0.27],[0.19,-0.20],[0.23,-0.05],[0.23,0.05],[0.19,0.20],[0.10,0.27]];
  add(g,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),20),m.lamp,0,centreY,0);
  cylinder(g,0,centreY-0.29,0,0.11,0.11,0.06,m.dark);
  cylinder(g,0,centreY+0.29,0,0.11,0.11,0.06,m.dark);
  // Every lantern uses the same visible suspension from its cap to roof height.
  cylinder(g,0,(bodyTop+roofY)/2,0,0.016,0.016,roofY-bodyTop,m.cord,8);
  cylinder(g,0,roofY-0.035,0,0.055,0.055,0.07,m.dark,8);
  const light = new THREE.PointLight('#ffb65a', 12, 5.1, 2);
  light.position.y=centreY; g.add(light);
}
function tub(g,w,d) {
  const r=Math.min(w,d)*0.43;
  cylinder(g,0,0.43,0,r,r*0.96,0.82,m.timber,24);
  cylinder(g,0,0.855,0,r*0.78,r*0.78,0.012,m.water,24);
  const ring = add(g,new THREE.TorusGeometry(r*0.91,0.055,8,28),m.dark,0,0.86,0);
  ring.rotation.x=Math.PI/2;
  for (const y of [0.22,0.63]) {
    const band=add(g,new THREE.TorusGeometry(r+0.012,0.027,6,28),m.metal,0,y,0);
    band.rotation.x=Math.PI/2;
  }
}
function hearth(g,w,d) {
  box(g,0,0.23,0,w,0.45,d,m.stone);
  box(g,0,0.50,0,w*0.82,0.13,d*0.76,m.dark);
  cylinder(g,0,0.59,0,Math.min(w,d)*0.22,Math.min(w,d)*0.25,0.19,m.metal);
  const ember=mat('#df7842',{emissive:'#f2702f',emissiveIntensity:1.5});
  cylinder(g,0,0.7,0,0.23,0.23,0.018,ember);
}
function planningTable(g,w,d) {
  table(g,w,d,0.86);
  box(g,-w*0.12,0.955,-d*0.02,w*0.57,0.014,d*0.55,m.map);
  for (const x of [w*0.17,w*0.32]) cylinder(g,x,0.96,d*0.17,0.065,0.065,0.17,m.ceramic);
}
function mapRack(g,w,d) {
  shelf(g,w,d,1.85);
  for (const y of [0.54,1.1,1.62]) for (const x of [-w*0.26,0,w*0.26]) {
    const roll=cylinder(g,x,y,0,0.11,0.11,d*0.7,m.map);
    roll.rotation.x=Math.PI/2;
  }
}
function weaponRack(g,w,d) {
  // The painting shows a compact floor stand holding a cluster of weapons,
  // rather than the broad framed rack used in the initial blockout.
  box(g,0,0.09,0,w*0.74,0.18,d*0.68,m.dark);
  for (const x of [-w*0.29,w*0.29]) box(g,x,0.69,0,0.08,1.2,0.08,m.timber);
  box(g,0,1.15,0,w*0.63,0.08,0.08,m.timber);
  const shafts=[
    [-0.24,-0.08,1.88],[-0.12,0.05,2.10],[0,-0.04,1.96],
    [0.12,0.08,2.17],[0.24,-0.02,1.91],
  ];
  for (const [x,z,h] of shafts) {
    cylinder(g,w*x,h/2,d*z,0.023,0.023,h,m.timber,8);
    add(g,new THREE.ConeGeometry(0.066,0.21,4),m.metal,w*x,h+0.10,d*z);
  }
}
function filledShelf(g,w,d) {
  shelf(g,w,d,1.7);
  for (const y of [0.22,0.77,1.29]) for (const x of [-w*0.25,w*0.22])
    box(g,x,y+0.10,0,w*0.35,0.19,d*0.64,m.linen);
}
function kitchenRack(g,w,d) {
  shelf(g,w,d,1.9);
  for (const y of [0.26,0.8,1.37]) for (const x of [-w*0.25,w*0.25])
    cylinder(g,x,y+0.11,0,0.15,0.16,0.23,m.ceramic);
}
function reception(g,w,d) {
  table(g,w,d,1.0);
  box(g,0,0.53,-d*0.38,w*0.86,0.75,0.09,m.timber);
  box(g,0,1.10,d*0.06,w*0.25,0.035,d*0.26,m.map);
}

function buildObject(obj) {
  const [x0,z0,x1,z1]=obj.rect, w=x1-x0, d=z1-z0;
  const g=new THREE.Group();
  g.position.set((x0+x1)/2,0,(z0+z1)/2);
  g.userData.id=obj.id;
  const name=obj.name.toLowerCase();
  let height=1;
  if (obj.light) { lamp(g); height=3.0; }
  else if (name.includes('futon')) { futon(g,w,d); height=0.4; }
  else if (name.includes('cushion')) { cushion(g,w,d); height=0.2; }
  else if (name.includes('chest')) { chest(g,w,d); height=0.8; }
  else if (name.includes('hearth')) { hearth(g,w,d); height=0.8; }
  else if (name.includes('preparation')) { table(g,w,d,0.84); height=0.9; }
  else if (name.includes('pantry')) { kitchenRack(g,w,d); height=1.9; }
  else if (name.includes('water tub')) { tub(g,w,d); height=0.9; }
  else if (name.includes('planning table')) { planningTable(g,w,d); height=1; }
  else if (name.includes('map and document')) { mapRack(g,w,d); height=1.9; }
  else if (name.includes('weapon rack')) { weaponRack(g,w,d); height=2.3; }
  else if (name.includes('reception')) { reception(g,w,d); height=1.1; }
  else if (name.includes('linen')) { filledShelf(g,w,d); height=1.7; }
  else if (name.includes('table')) { table(g,w,d,name.includes('low')?0.47:0.73); height=0.8; }
  else { box(g,0,0.5,0,w,1,d,m.stone); }
  scene.add(g);
  return { obj, height, group: g };
}

floor();
const structure=createInnStructure(scene,plan,outerMargin);
structure.root.visible=wallsRequested && !referenceRequested;
const objects=plan.objects.map(buildObject);
const cutoutManifest=await fetch('../data/inn_furnishings.json').then(response => response.json());
const cutoutEntries=await Promise.all(Object.entries(cutoutManifest).map(async ([id,spec]) => {
  const object=objects.find(entry => entry.obj.id===id);
  if (!object) throw new Error(`Unknown inn cutout ID: ${id}`);
  if (spec.hidden) return {id,spec,mesh:null,object};
  const texture=await new THREE.TextureLoader().loadAsync(`../art/interior/${spec.image}`);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({
    map:texture,transparent:true,alphaTest:0.02,depthTest:false,depthWrite:false,
    toneMapped:false,side:THREE.DoubleSide,
  }));
  mesh.quaternion.copy(CAM_QUAT);
  mesh.renderOrder=100+spec.sourceCrop[3]/1000;
  mesh.visible=false;
  scene.add(mesh);
  return {id,spec,mesh,object};
}));
function updateCutoutVisibility() {
  const show=painted && exactCutoutsToggle.checked;
  for (const entry of cutoutEntries) {
    if (entry.mesh) {
      entry.mesh.visible=show;
      // Camera-facing painted pieces have no real depth volume; the 3D floor
      // otherwise clips them into triangles when partitions are displayed.
      entry.mesh.material.depthTest=false;
    }
    if (entry.object.obj.light) {
      // Keep the real light source while replacing only its graybox geometry.
      entry.object.group.traverse(child => { if (child.isMesh) child.visible=!show; });
    } else {
      entry.object.group.visible=!show;
    }
  }
}
const contactShadows = (() => {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(64,64,12,64,64,64);
  gradient.addColorStop(0,'rgba(39,27,15,0.20)');
  gradient.addColorStop(0.55,'rgba(39,27,15,0.08)');
  gradient.addColorStop(1,'rgba(39,27,15,0)');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,opacity:0.55});
  return objects.filter(({obj}) => !obj.light).map(({obj}) => {
    const [x0,z0,x1,z1]=obj.rect;
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry((x1-x0)*1.12,(z1-z0)*1.12),material);
    shadow.rotation.x=-Math.PI/2;
    shadow.position.set((x0+x1)/2,0.012,(z0+z1)/2);
    shadow.visible=false;
    scene.add(shadow);
    return shadow;
  });
})();
const paintedFloorMaterial = (() => {
  // A seamless world-aligned tatami surface in the painting's palette. Using
  // the whole painted screenshot on the floor would print ghost furniture.
  const [x0,z0,x1,z1] = floorBounds;
  const w=x1-x0, d=z1-z0;
  const canvas = document.createElement('canvas');
  canvas.width = w * 80; canvas.height = d * 80;
  const ctx = canvas.getContext('2d');
  let seed = 1979;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let z=0; z<d; z++) for (let x=0; x<w; x++) {
    const u=x*80, v=z*80;
    ctx.fillStyle = (x+z)%3===0 ? '#c4aa78' : (x+z)%3===1 ? '#c8b182' : '#c1a675';
    ctx.fillRect(u,v,80,80);
    ctx.fillStyle = '#796948';
    ctx.fillRect(u,v,2,80); ctx.fillRect(u,v,80,2);
    for (let i=0; i<180; i++) {
      ctx.fillStyle = random()<0.5 ? '#e0c69122' : '#735e3d1a';
      ctx.fillRect(u+4+random()*72,v+4+random()*72,0.6,3+random()*7);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
})();

// The floor corners of the generated painting register the AI image to the
// exact 20x18 blueprint without changing a single mesh position.
const imageW=1672, imageH=941;
const P0=[797,149], PX=[1608,506], PZ=[61,505];
const heightPixelsPerUnit=51;
// Nine shared landmarks form four independently fitted, continuous quadrants.
// The middle samples follow the painted tatami seams; the bottom corner is
// 25px lower than a single affine fit predicts. Shared edges prevent cracks.
const paintGrid = [
  [[797,149], [1201,328], [1608,506]],
  [[429,327], [834,521], [1239,699]],
  [[61,505], [467,701], [871,887]],
];
const offsets = new Map(objects.map(({obj}) => [obj.id, {x:0,y:0}]));
const globalOffset = {x:0,y:0};
const grayMaterials = new WeakMap();
for (const {group,obj} of objects) {
  objectSelect.add(new Option(`${obj.id} — ${obj.name}`, obj.id));
  group.traverse(mesh => { if (mesh.isMesh) grayMaterials.set(mesh, mesh.material); });
}
let paintMaterial = null;
let painted = false;
function paintPixel(point,id) {
  const local=offsets.get(id);
  let floorX, floorY;
  if (warpToggle.checked) {
    const gx=Math.max(0,Math.min(1.999999,point.x/plan.size[0]*2));
    const gz=Math.max(0,Math.min(1.999999,point.z/plan.size[1]*2));
    const ix=Math.floor(gx), iz=Math.floor(gz), u=gx-ix, v=gz-iz;
    const p00=paintGrid[iz][ix], p10=paintGrid[iz][ix+1];
    const p01=paintGrid[iz+1][ix], p11=paintGrid[iz+1][ix+1];
    floorX=(1-u)*(1-v)*p00[0]+u*(1-v)*p10[0]+(1-u)*v*p01[0]+u*v*p11[0];
    floorY=(1-u)*(1-v)*p00[1]+u*(1-v)*p10[1]+(1-u)*v*p01[1]+u*v*p11[1];
  } else {
    floorX=P0[0] + (PX[0]-P0[0])*point.x/plan.size[0] + (PZ[0]-P0[0])*point.z/plan.size[1];
    floorY=P0[1] + (PX[1]-P0[1])*point.x/plan.size[0] + (PZ[1]-P0[1])*point.z/plan.size[1];
  }
  return [
    floorX + globalOffset.x + local.x,
    floorY - heightPixelsPerUnit*point.y + globalOffset.y + local.y,
  ];
}
function updateUVs(entry) {
  entry.group.updateMatrixWorld(true);
  entry.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position=mesh.geometry.getAttribute('position');
    const uv=mesh.geometry.getAttribute('uv');
    const point=new THREE.Vector3();
    for (let i=0; i<position.count; i++) {
      point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const [px,py]=paintPixel(point,entry.obj.id);
      uv.setXY(i,px/imageW,1-py/imageH);
    }
    uv.needsUpdate=true;
  });
}
async function setPaint(value) {
  if (value && !paintMaterial) {
    const texture=await new THREE.TextureLoader().loadAsync('./inn_whole_scene_paint_v1.png');
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    paintMaterial=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  }
  painted=value;
  floorTop.material=value ? paintedFloorMaterial : grayFloorMaterial;
  contactShadows.forEach(shadow => { shadow.visible=value && softContactToggle.checked && !exactCutoutsToggle.checked; });
  for (const entry of objects) {
    if (value) updateUVs(entry);
    entry.group.traverse(mesh => { if (mesh.isMesh) mesh.material=value ? paintMaterial : grayMaterials.get(mesh); });
  }
  updateCutoutVisibility();
  renderer.render(scene,camera);
}
paintToggle.addEventListener('change', () => { setPaint(paintToggle.checked); });
warpToggle.addEventListener('change', () => {
  if (!painted) return;
  objects.forEach(updateUVs);
  renderer.render(scene,camera);
});
softContactToggle.addEventListener('change', () => {
  contactShadows.forEach(shadow => { shadow.visible=painted && softContactToggle.checked && !exactCutoutsToggle.checked; });
  renderer.render(scene,camera);
});
exactCutoutsToggle.addEventListener('change', () => {
  updateCutoutVisibility();
  contactShadows.forEach(shadow => { shadow.visible=painted && softContactToggle.checked && !exactCutoutsToggle.checked; });
  renderer.render(scene,camera);
});
function readSelection() {
  return objectSelect.value==='all' ? globalOffset : offsets.get(objectSelect.value);
}
function syncSliders() {
  const offset=readSelection();
  for (const [axis,slider] of [['x',paintX],['y',paintY]]) {
    slider.value=offset[axis];
    document.querySelector(`#paint-${axis}-value`).textContent=offset[axis];
  }
}
objectSelect.addEventListener('change',syncSliders);
for (const [axis,slider] of [['x',paintX],['y',paintY]]) slider.addEventListener('input',() => {
  readSelection()[axis]=Number(slider.value);
  document.querySelector(`#paint-${axis}-value`).textContent=slider.value;
  if (!painted) return;
  if (objectSelect.value==='all') objects.forEach(updateUVs);
  else updateUVs(objects.find(entry => entry.obj.id===objectSelect.value));
  renderer.render(scene,camera);
});
const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,500);
camera.quaternion.copy(CAM_QUAT);
function positionCutouts() {
  const viewPoint=point => {
    const projected=point.clone().project(camera);
    return [(projected.x+1)*stage.clientWidth/2,(1-projected.y)*stage.clientHeight/2];
  };
  const origin=viewPoint(new THREE.Vector3());
  const alongX=viewPoint(new THREE.Vector3(plan.size[0],0,0));
  const alongZ=viewPoint(new THREE.Vector3(0,0,plan.size[1]));
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const screenPerSourcePixel=(
    distance(origin,alongX)/distance(P0,PX)+
    distance(origin,alongZ)/distance(P0,PZ)
  )/2;
  const worldPerSourcePixel=screenPerSourcePixel*(camera.top-camera.bottom)/stage.clientHeight;
  for (const {spec,mesh,object} of cutoutEntries) {
    if (!mesh) continue;
    const [left,top,right,bottom]=spec.sourceCrop;
    const [x0,z0,x1,z1]=object.obj.rect;
    const x=(x0+x1)/2,z=(z0+z1)/2;
    const floorX=P0[0]+(PX[0]-P0[0])*x/plan.size[0]+(PZ[0]-P0[0])*z/plan.size[1];
    const floorY=P0[1]+(PX[1]-P0[1])*x/plan.size[0]+(PZ[1]-P0[1])*z/plan.size[1];
    const w=(right-left)*worldPerSourcePixel,h=(bottom-top)*worldPerSourcePixel;
    mesh.scale.set(w,h,1);
    mesh.position.set(x,0,z);
    mesh.position.addScaledVector(CAM_RIGHT,((left+right)/2-floorX)*worldPerSourcePixel);
    mesh.position.addScaledVector(CAM_UP,(floorY-bottom+(bottom-top)/2)*worldPerSourcePixel);
  }
}
function resize() {
  const width=stage.clientWidth, height=stage.clientHeight;
  renderer.setSize(width,height,false);
  const frameBounds = referenceRequested && !wallOnlyRequested
    ? [0,0,plan.size[0],plan.size[1]] : floorBounds;
  const pts=[];
  for (const x of [frameBounds[0],frameBounds[2]]) for (const z of [frameBounds[1],frameBounds[3]]) for (const y of [0,wallsToggle.checked?3.1:2.5])
    pts.push(toScreen(new THREE.Vector3(x,y,z)));
  const x0=Math.min(...pts.map(p=>p.x)), x1=Math.max(...pts.map(p=>p.x));
  const y0=Math.min(...pts.map(p=>p.y)), y1=Math.max(...pts.map(p=>p.y));
  const half=Math.max((y1-y0)/2,(x1-x0)/2*height/width)*1.08;
  window.innCameraHalf=half;
  camera.left=-half*width/height; camera.right=half*width/height;
  camera.top=half; camera.bottom=-half; camera.updateProjectionMatrix();
  const centre=new THREE.Vector3(plan.size[0]/2,1.25,plan.size[1]/2);
  camera.position.copy(centre).addScaledVector(VIEW_DIR,200);
  camera.updateMatrixWorld();
  positionCutouts();
  renderer.render(scene,camera);
  renderLabels();
}
function renderLabels() {
  labels.replaceChildren();
  if ((capture && !captureIds) || (!capture && !labelToggle.checked)) return;
  for (const {obj,height} of objects) {
    const [x0,z0,x1,z1]=obj.rect;
    const p=new THREE.Vector3((x0+x1)/2,height+0.15,(z0+z1)/2).project(camera);
    const label=document.createElement('span');
    label.textContent=obj.id;
    label.style.left=`${(p.x+1)*stage.clientWidth/2}px`;
    label.style.top=`${(1-p.y)*stage.clientHeight/2}px`;
    labels.append(label);
  }
}
labelToggle.addEventListener('change',renderLabels);
focusRoom.add(new Option('Overview — all rooms','all'));
for (const room of plan.rooms) focusRoom.add(new Option(room.name,room.name));
focusRoom.value='all';
let doorsOpen=true;
function updateStructure() {
  structure.update({
    visible:wallsToggle.checked,
    open:doorsOpen,
    fade:fadeWallsToggle.checked,
    roomName:focusRoom.value,
  });
  updateCutoutVisibility();
  renderer.render(scene,camera);
}
wallsToggle.addEventListener('change',() => { updateStructure(); resize(); });
fadeWallsToggle.addEventListener('change',updateStructure);
focusRoom.addEventListener('change',updateStructure);
doorsButton.addEventListener('click',() => {
  doorsOpen=!doorsOpen;
  doorsButton.textContent=doorsOpen?'Close doors':'Open doors';
  updateStructure();
});
window.addEventListener('resize',resize);
wallsToggle.checked=wallsRequested && !referenceRequested;
doorsButton.textContent='Close doors';
updateStructure();
resize();
paintToggle.checked=paintRequested;
exactCutoutsToggle.checked=cutoutsRequested;
if (paintRequested) await setPaint(true);
if (floorOnlyRequested) {
  floorTop.material = paintedFloorMaterial;
  for (const {group} of objects) group.visible = false;
  for (const {mesh} of cutoutEntries) if (mesh) mesh.visible = false;
  structure.root.visible = false;
  renderer.render(scene,camera);
}
if (wallOnlyRequested) {
  for (const {group} of objects) group.visible = false;
  structure.update({visible:true, open:true, fade:true, roomName:'all'});
  renderer.render(scene,camera);
}
window.innFurnitureReady=true;
