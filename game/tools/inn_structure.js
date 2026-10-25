import * as THREE from 'three';

// Structural geometry follows the same fixed blueprint as the furnished scene.
// Keep each interior section independent so a wall in front of the selected
// room can fade without making every partition translucent.
export function createInnStructure(scene, plan, outerMargin = 0) {
  const root = new THREE.Group();
  root.name = 'inn-structure';
  scene.add(root);
  const segments = [];
  const doors = [];
  const exteriorFar = [];
  const height = 3;
  const thickness = 0.16;
  const postWidth = 0.14;
  const plaster = new THREE.MeshStandardMaterial({ color: '#d9d3c5', roughness: 1, transparent: true });
  const timber = new THREE.MeshStandardMaterial({ color: '#574638', roughness: 1, transparent: true });
  const doorPanel = new THREE.MeshStandardMaterial({ color: '#ad9271', roughness: 1, transparent: true });
  const threshold = new THREE.MeshStandardMaterial({ color: '#645747', roughness: 1 });

  function block(parent, bounds, material, fading = false) {
    const [x0, y0, z0, x1, y1, z1] = bounds;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1-x0, y1-y0, z1-z0), fading ? material.clone() : material);
    mesh.position.set((x0+x1)/2, (y0+y1)/2, (z0+z1)/2);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function bounds(along, at, a, b, y0, y1, halfThickness = thickness/2) {
    return along === 'z'
      ? [at-halfThickness, y0, a, at+halfThickness, y1, b]
      : [a, y0, at-halfThickness, b, y1, at+halfThickness];
  }

  function partition(along, at, a, b) {
    const group = new THREE.Group();
    root.add(group);
    block(group, bounds(along, at, a, b, 0, height), plaster, true);
    for (const end of [a, b]) {
      block(group, bounds(along, at, end-postWidth/2, end+postWidth/2, 0, height, thickness), timber, true);
    }
    block(group, bounds(along, at, a, b, height-0.18, height, thickness), timber, true);
    segments.push({ group, along, at, a, b });
  }

  for (const wall of plan.partitions) {
    const outerEnd = wall.along === 'z' ? plan.size[1] : plan.size[0];
    for (const [a, b] of wall.segments) partition(
      wall.along, wall.at,
      a === 0 ? -outerMargin : a,
      b === outerEnd ? outerEnd + outerMargin : b,
    );
    for (const [a, b] of wall.doorSpans || []) {
      const group = new THREE.Group();
      root.add(group);
      block(group, bounds(wall.along, wall.at, a, b, 2.2, height, thickness), timber, true);
      const sill = block(group, bounds(wall.along, wall.at, a, b, 0, 0.055, thickness), threshold);
      sill.userData.threshold = true;
      const leaf = block(group, bounds(wall.along, wall.at, a+0.05, b-0.05, 0.055, 2.2), doorPanel, true);
      for (const end of [a, b]) {
        block(group, bounds(wall.along, wall.at, end-postWidth/2, end+postWidth/2, 0, height, thickness), timber, true);
      }
      doors.push({ group, leaf, along: wall.along, at: wall.at, a, b });
    }
  }

  const [width, depth] = plan.size;
  const left = -outerMargin, north = -outerMargin;
  const right = width + outerMargin, south = depth + outerMargin;
  // The fixed southeast view keeps the far walls tall and the near walls low.
  exteriorFar.push(block(root, [left-thickness,0,north, left,height,south], plaster, true));
  block(root, [left,0,south, right,0.55,south+thickness], timber);
  block(root, [right,0,north, right+thickness,0.55,south], timber);
  const [entranceStart, entranceEnd] = plan.entrance.span;
  exteriorFar.push(block(root, [left,0,north-thickness, entranceStart,height,north], plaster, true));
  exteriorFar.push(block(root, [entranceEnd,0,north-thickness, right,height,north], plaster, true));
  exteriorFar.push(block(root, [entranceStart,2.2,north-thickness, entranceEnd,height,north], timber, true));

  function crosses(part, target) {
    // Ray from a room toward the fixed +x/+z camera.
    const eye = { x: target.x+60, z: target.z+60 };
    if (part.along === 'z') {
      const t = (part.at-target.x)/(eye.x-target.x);
      const z = target.z+t*(eye.z-target.z);
      return t>0 && t<1 && z>=part.a && z<=part.b;
    }
    const t = (part.at-target.z)/(eye.z-target.z);
    const x = target.x+t*(eye.x-target.x);
    return t>0 && t<1 && x>=part.a && x<=part.b;
  }

  function update({ visible, open, fade, roomName }) {
    root.visible = visible;
    for (const door of doors) door.leaf.visible = !open;
    const overview = roomName === 'all';
    for (const mesh of exteriorFar) {
      mesh.material.opacity = fade && overview ? 0.35 : 1;
      mesh.material.depthWrite = mesh.material.opacity === 1;
    }
    const room = plan.rooms.find(item => item.name === roomName) || plan.rooms[0];
    const [x0,z0,x1,z1] = room.rect;
    const target = { x:(x0+x1)/2, z:(z0+z1)/2 };
    for (const part of [...segments, ...doors]) {
      const opacity = fade && (overview || crosses(part, target)) ? 0.22 : 1;
      for (const mesh of part.group.children) {
        if (mesh.userData.threshold) continue;
        mesh.material.opacity = opacity;
        mesh.material.depthWrite = opacity === 1;
      }
    }
  }

  return { root, update };
}
