import assert from 'node:assert/strict';
import {chainWeightPose} from '../../look_tests/tank_chain_motion.js';
import {rightTonfaPitch} from '../../look_tests/tank_tonfa_motion.js';
const idle=chainWeightPose(0,false),impact=chainWeightPose(.55,true);
assert.deepEqual(chainWeightPose(.7,false),idle,'nonattack clips keep the weight at rest');
assert.deepEqual(chainWeightPose(0,true),idle);assert.deepEqual(chainWeightPose(1,true),idle,'recover smoothly to idle');
assert.ok(impact.z>1.7&&Math.abs(impact.x)<.2,'impact extends ahead rather than across the body');
let maxSide=0;for(let i=0;i<=100;i++){const p=chainWeightPose(i/100,true);assert.ok(p.z>=idle.z);maxSide=Math.max(maxSide,Math.abs(p.x));}
assert.ok(maxSide<=.55,'no sideways whip arc');
for(let i=0;i<8;i++){const yaw=i*Math.PI/4,dx=impact.x-idle.x,dz=impact.z-idle.z;
 const worldX=dx*Math.cos(yaw)+dz*Math.sin(yaw),worldZ=-dx*Math.sin(yaw)+dz*Math.cos(yaw);
 assert.ok(worldX*Math.sin(yaw)+worldZ*Math.cos(yaw)>1.4,'forward extension stays forward in every sprite direction');}
console.log('Tank chain: forward cast, bounded lateral motion, impact and idle recovery across eight directions passed');
assert.equal(rightTonfaPitch(.4,false),Math.PI/4,'right guard points up at 45 degrees');
assert.ok(rightTonfaPitch(.65,true)<0,'right strike comes down in front');
assert.ok(Math.abs(rightTonfaPitch(1,true)-Math.PI/4)<1e-10,'strike recovers to upward guard');
console.log('Right tonfa: forward/up guard, downward strike and recovery passed');
