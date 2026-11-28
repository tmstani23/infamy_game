// Shared by the draft renderer and production exporter. Real held geometry,
// with a blade-only glow mask; character bodies and source clips are preserved.
import * as THREE from 'three';

export function buildSpear(std, hero = false) {
  const g = new THREE.Group();
  const wood = std({ color: 0x38241e, roughness: 0.78, metalness: 0.05 }, [0x91736a, 0.25]);
  const iron = std({ color: 0x363139, roughness: 0.38, metalness: 0.7 }, [0xffc078, 0.35]);
  const gold = std({ color: 0xc7a260, roughness: 0.3, metalness: 0.7, emissive: 0x513018 }, [0xffd48c, 0.6]);
  const cord = std({ color: 0x641e2d, roughness: 0.8 }, [0x943c42, 0.2]);
  const cylinder = (r, from, to, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, to - from, 12), mat);
    m.rotation.x = Math.PI / 2; m.position.z = (from + to) / 2;
    m.userData.noWeaponGlow = true; g.add(m); return m;
  };
  const neck = hero ? 0.66 : 0.80;
  cylinder(0.012, 0.015, neck, wood);
  cylinder(0.016, 0, 0.025, iron);
  cylinder(0.016, 0.20, 0.42, cord);
  for (let z = 0.21; z < 0.42; z += 0.018) cylinder(0.017, z, z + 0.005, iron);
  cylinder(0.019, neck - 0.03, neck + 0.015, gold);
  const blade = new THREE.Shape();
  const outline = hero
    ? [[0,neck],[-0.027,0.69],[-0.052,0.72],[-0.039,0.80],[-0.022,0.91],[0,1],[0.022,0.91],[0.039,0.80],[0.052,0.72],[0.027,0.69]]
    : [[0,neck],[-0.035,0.84],[-0.027,0.91],[0,1],[0.027,0.91],[0.035,0.84]];
  outline.forEach(([x,z], i) => i ? blade.lineTo(x,z) : blade.moveTo(x,z)); blade.closePath();
  const geo = new THREE.ExtrudeGeometry(blade, { depth: 0.009, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, steps: 1 });
  // Shape xy -> spear xz, with a small physical thickness.
  geo.rotateX(Math.PI / 2);
  const leaf = new THREE.Mesh(geo, std({ color: 0x71656b, metalness: 0.7, roughness: 0.25, emissive: 0x57101b, emissiveIntensity: 0.65 }, [0xffa76a, 0.8]));
  g.add(leaf);
  const edgePoints = [...outline, outline[0]];
  const curve = new THREE.CatmullRomCurve3(edgePoints.map(([x,z]) => new THREE.Vector3(x,-0.009,z)), false, 'centripetal');
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.0018, 4, false), gold));
  const ridgeLength = hero ? 0.255 : 0.13;
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(hero ? 0.006 : 0.004, 0.008, ridgeLength), new THREE.MeshStandardMaterial({ color: 0xb22939, emissive: 0xc41c35, emissiveIntensity: 0.8 }));
  ridge.position.set(0,-0.009,hero ? 0.815 : 0.88); g.add(ridge);
  return g;
}

// The caravan raider chief's war glaive (P4 boss, 2026-11-28): a heavy curved blade with a hooked back spike on an
// iron-banded haft, its edge hot orange (the glow mask is the blade; weapon_glow.json spear_flaming tints it)
export function buildGlaive(std) {
  const g = new THREE.Group();
  const wood = std({ color: 0x2a1a14, roughness: 0.8, metalness: 0.05 }, [0x8a6a5a, 0.25]);
  const iron = std({ color: 0x2c2a2e, roughness: 0.4, metalness: 0.75 }, [0xffb070, 0.45]);
  const steel = std({ color: 0x4a474c, metalness: 0.8, roughness: 0.3, emissive: 0x220a04, emissiveIntensity: 0.5 }, [0xffb27a, 0.55]);
  const hot = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a10, emissiveIntensity: 1.4 });
  const cylinder = (r, from, to, mat, glow = false) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, to - from, 12), mat);
    m.rotation.x = Math.PI / 2; m.position.z = (from + to) / 2;
    if (!glow) m.userData.noWeaponGlow = true; g.add(m); return m;
  };
  const neck = 0.64;
  cylinder(0.014, 0.03, neck, wood);
  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 8), iron); butt.rotation.x = -Math.PI / 2; butt.position.z = 0.015; butt.userData.noWeaponGlow = true; g.add(butt);
  for (const z of [0.18, 0.34, 0.5]) cylinder(0.018, z, z + 0.02, iron);
  cylinder(0.022, neck - 0.04, neck + 0.02, iron);
  // the blade: a broad single edge curving forward and back to the point, in the xz plane
  const outline = [[-0.02, neck], [0.03, neck + 0.02], [0.085, 0.76], [0.098, 0.85], [0.07, 0.94], [0.0, 1.0], [-0.015, 0.93], [-0.02, 0.8]];
  const shape = new THREE.Shape(); outline.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z)); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, steps: 1 });
  geo.rotateX(Math.PI / 2); g.add(new THREE.Mesh(geo, steel));
  // hooked back spike
  const spike = new THREE.Shape(); [[-0.018, 0.68], [-0.075, 0.70], [-0.095, 0.66], [-0.06, 0.72], [-0.018, 0.74]].forEach(([x, z], i) => i ? spike.lineTo(x, z) : spike.moveTo(x, z)); spike.closePath();
  const sg = new THREE.ExtrudeGeometry(spike, { depth: 0.01, bevelEnabled: false }); sg.rotateX(Math.PI / 2); g.add(new THREE.Mesh(sg, steel));
  // the hot cutting edge along the outer curve
  const edge = new THREE.CatmullRomCurve3([[0.03, neck + 0.02], [0.085, 0.76], [0.098, 0.85], [0.07, 0.94], [0.0, 1.0]].map(([x, z]) => new THREE.Vector3(x, -0.006, z)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(edge, 30, 0.0045, 5, false), hot));
  return g;
}

export function buildShield(std) {
  const g = new THREE.Group();
  const iron = std({ color: 0x2b2b30, metalness: 0.65, roughness: 0.48 }, [0xb49b7b, 0.4]);
  const gold = std({ color: 0x9a7c48, metalness: 0.6, roughness: 0.5 }, [0xe9bc70, 0.5]);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.065, 28), std({ color: 0x261e24, roughness: 0.65, metalness: 0.12 }, [0x9d7772, 0.3]));
  face.rotation.x = Math.PI / 2; g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.016, 6, 32), iron); rim.position.z = 0.04; g.add(rim);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.006, 5, 32), gold); ring.position.z = 0.038; g.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 6), gold);
    petal.scale.set(0.75, 1.45, 0.17); petal.position.set(Math.sin(a)*0.085, Math.cos(a)*0.085, 0.043); petal.rotation.z = -a; g.add(petal);
  }
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), iron); boss.scale.z = 0.5; boss.position.z = 0.05; g.add(boss);
  return g;
}

// A spear needs a deliberate thrust, rather than inheriting the borrowed
// sword clip's wrist twirl. Keep its torso/legs and solve the arms to the grip.
export function poseSpear(root, findBone, { both, shield, clip, phase, leftOnly=false, rightGrip=null }) {
  if (/death|dying/i.test(clip)) return null;
  const nativeAttack = /upward thrust|bayonet stab/i.test(clip);
  const attack = /thrust/i.test(clip), sweep = /great sword slash/i.test(clip);
  const run = /run/i.test(clip);
  const thrust = !attack ? 0 : phase < .25 ? -.12 * phase/.25
    : phase < .5 ? -.12 + .58 * (phase-.25)/.25
    : phase < .85 ? .46 * (1-(phase-.5)/.35) : 0;
  const yaw = sweep ? phase * Math.PI*2 : 0;
  const lift = sweep || attack ? 0 : (run ? .18 : .32);
  const direction = new THREE.Vector3(Math.sin(yaw), lift, Math.cos(yaw)).normalize();
  const rightPoint = rightGrip?new THREE.Vector3(...rightGrip):new THREE.Vector3(-.27 + (sweep ? Math.sin(yaw)*.12 : 0), 1.1 + (run ? Math.sin(phase*Math.PI*2)*.025 : 0), .18 + thrust);
  const leftPoint = both ? rightPoint.clone().addScaledVector(direction, .45)
    : new THREE.Vector3(.43, 1.22, .30 + (attack ? thrust*.15 : 0));
  const world = p => root.localToWorld(p.clone());
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const rotateBone = (bone, child, point) => {
    root.updateMatrixWorld(true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const to = point.clone().sub(origin).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(from, to);
    const q = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parentQ.multiply(q)); root.updateMatrixWorld(true);
  };
  const arm = (side, target, sign) => {
    const upper = findBone(new RegExp(side+'Arm$')), lower = findBone(new RegExp(side+'ForeArm$')), hand = findBone(new RegExp(side+'Hand$'));
    if (!upper || !lower || !hand) return;
    const s = upper.getWorldPosition(new THREE.Vector3()), elbow = lower.getWorldPosition(new THREE.Vector3()), wrist = hand.getWorldPosition(new THREE.Vector3());
    const a = s.distanceTo(elbow), b = elbow.distanceTo(wrist), line = target.clone().sub(s);
    const d = Math.min(a+b-.001, Math.max(Math.abs(a-b)+.001, line.length()));
    line.normalize();
    const bend = new THREE.Vector3(sign, -.55, -.1).applyQuaternion(rootQ);
    bend.addScaledVector(line, -bend.dot(line)).normalize();
    const adjacent = (a*a+d*d-b*b)/(2*d), height = Math.sqrt(Math.max(0, a*a-adjacent*adjacent));
    const goalElbow = s.clone().addScaledVector(line, adjacent).addScaledVector(bend, height);
    rotateBone(upper, lower, goalElbow); rotateBone(lower, hand, target);
  };
  root.updateMatrixWorld(true);
  if (nativeAttack) {
    // the purpose-picked Mixamo clips already contain the thrust. Keep their
    // arms instead of retargeting the old sword slash into one.
    if (shield) arm('Left', world(leftPoint), 1);
    const right = findBone(/RightHand$/);
    const from = both ? right : findBone(/RightForeArm$/);
    const to = both ? findBone(/LeftHand$/) : right;
    return to.getWorldPosition(new THREE.Vector3()).sub(from.getWorldPosition(new THREE.Vector3())).normalize();
  }
  if(!leftOnly)arm('Right', world(rightPoint), -1);
  if (both || shield) arm('Left', world(leftPoint), 1);
  return direction.applyQuaternion(rootQ);
}
