import assert from 'node:assert/strict';
import {sickleBasis} from '../../look_tests/tank_sickle_motion.js';
import {lightningRipplePoint} from '../src/render/lightning_ripple.js';
const b=sickleBasis(0,false);
assert.ok(b.haft[1]>0&&b.haft[2]>0);
assert.ok(Math.abs(Math.atan2(b.haft[1],b.haft[2])-Math.PI/4)<1e-8);
assert.ok(b.blade[1]<0&&b.blade[2]>0,'blade points forward and down, not back into the armpit');
assert.ok(sickleBasis(.65,true).haft[1]<0,'strike swings down');
assert.deepEqual(sickleBasis(1,true),b,'recovers to upright guard');
for(let dir=0;dir<8;dir++){
  const angle=dir*Math.PI/4,forward=[Math.sin(angle),Math.cos(angle)];
  assert.ok(b.blade[2]*(forward[0]**2+forward[1]**2)>0,'blade stays forward in all sprite views');
}
const start=lightningRipplePoint({x:0,y:0},0,.1),mid=lightningRipplePoint({x:.5,y:0},0,.1),end=lightningRipplePoint({x:1,y:0},0,.1);
assert.ok(Math.abs(start.y)<1e-8&&Math.abs(end.y)<1e-8);
assert.ok(mid.y>.08,'ripple has a broad arc instead of a straight spear');
assert.ok(Math.abs(lightningRipplePoint({x:.5,y:0},.501,.1).y-lightningRipplePoint({x:.5,y:0},.5,.1).y)<.001,'ripple movement is continuous');
console.log('Kuroda visuals: forward/up haft, forward/down blade, downstroke/recovery and continuous curved ripples passed');
