// The fixed isometric camera as three.js vectors (numbers come from sim/geometry.js)
import * as THREE from 'three';
import { ELEVATION, SCREEN_RIGHT as SR } from '../sim/geometry.js';
export { PPU } from '../sim/geometry.js';

// From a ground point toward the camera (the camera sits to the south-east)
export const VIEW_DIR = new THREE.Vector3(
  Math.cos(ELEVATION) * Math.SQRT1_2,
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.SQRT1_2);

// Camera axes: right and up on screen
export const CAM_RIGHT = new THREE.Vector3(SR.x, 0, SR.z);
export const CAM_UP = new THREE.Vector3().crossVectors(VIEW_DIR, CAM_RIGHT).normalize();
export const CAM_QUAT = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(CAM_RIGHT, CAM_UP, VIEW_DIR));

// Screen position of a world point in world units (x right, y up)
export const toScreen = p => ({ x: p.dot(CAM_RIGHT), y: p.dot(CAM_UP) });
