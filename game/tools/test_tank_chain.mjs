import assert from 'node:assert/strict';
import {chainWeightPose,bakeChainTrack,sampleChainTrack,CHAIN_LENGTH,CHAIN_LINKS} from '../../look_tests/tank_chain_motion.js';
import {rightTonfaPitch} from '../../look_tests/tank_tonfa_motion.js';
const idle=chainWeightPose(0,false),back=chainWeightPose(.29,true),overhead=chainWeightPose(.42,true),impact=chainWeightPose(.56,true);
assert.deepEqual(chainWeightPose(.7,false),idle);assert.deepEqual(chainWeightPose(0,true),idle);assert.deepEqual(chainWeightPose(1,true),idle);
assert.ok(back.z<-.7&&back.y>1.8,'weight rises behind the fighter during the backstroke');
assert.ok(overhead.y>2.1&&overhead.z>0,'weight passes overhead before the front stroke');
assert.ok(impact.z>1.7&&impact.y<overhead.y,'weight arcs down and forward at impact');
const anchorAt=p=>[-.48+.07*Math.sin(p*Math.PI*2),1.15+.12*Math.sin(p*Math.PI),.18+.12*Math.sin(p*Math.PI*2)];
const track=bakeChainTrack({duration:2,anchorAt}),step=CHAIN_LENGTH/(CHAIN_LINKS-1);
let maxError=0;
for(let f=0;f<track.frames.length;f++){
 const points=track.frames[f];assert.deepEqual(points[0],anchorAt(f/track.steps),'root stays pinned to the animated hand');
 for(let i=0;i<points.length;i++){
  assert.ok(points[i].every(Number.isFinite));assert.ok(points[i][1]>=.09,'no chain below the ground');
  if(i)maxError=Math.max(maxError,Math.abs(Math.hypot(...points[i].map((v,k)=>v-points[i-1][k]))-step));
 }
}
assert.ok(maxError<step*.12,'links retain bounded length instead of stretching with the attack');
const saved=sampleChainTrack(track,.56);sampleChainTrack(track,.1);sampleChainTrack(track,.9);assert.deepEqual(sampleChainTrack(track,.56),saved,'random frame order cannot alter the bake');
const end=sampleChainTrack(track,1),start=sampleChainTrack(track,0);assert.ok(Math.max(...end.map((p,i)=>Math.hypot(...p.map((v,k)=>v-start[i][k]))))<.08,'recovery settles close to the idle pose');
for(let i=0;i<8;i++){
 const yaw=i*Math.PI/4;
 for(const [pose,sign] of [[back,-1],[impact,1]]){
  const x=pose.x*Math.cos(yaw)+pose.z*Math.sin(yaw),z=-pose.x*Math.sin(yaw)+pose.z*Math.cos(yaw);
  assert.ok((x*Math.sin(yaw)+z*Math.cos(yaw))*sign>.7,'back/front stroke survives every view rotation');
 }
}
console.log('Tank chain: backswing rise, overhead/front cast, fixed-step constraints/hand pinning, bounded links, deterministic views and recovery passed');
assert.equal(rightTonfaPitch(.4,false),Math.PI/4,'right guard points up at 45 degrees');
assert.ok(rightTonfaPitch(.65,true)<0,'right strike comes down in front');
assert.ok(Math.abs(rightTonfaPitch(1,true)-Math.PI/4)<1e-10,'strike recovers to upward guard');
console.log('Right tonfa: forward/up guard, downward strike and recovery passed');
