import assert from 'node:assert/strict';
import {bindFullscreen} from '../src/fullscreen.js';
import {bindGameShell} from '../src/game_shell.js';
import {normalizeAudioSettings,readAudioSettings} from '../src/audio_settings.js';
import {createSound} from '../src/render/sound.js';
for(const supported of [true,false]){
 const events={},docEvents={},button={addEventListener(){},setAttribute(){},blur(){}},doc={fullscreenElement:null,fullscreenEnabled:true,addEventListener(k,fn){docEvents[k]=fn;}};
 let locks=0,unlocks=0;
 const win={navigator:supported?{keyboard:{async lock(keys){assert.deepEqual(keys,['Escape']);locks++;},unlock(){unlocks++;}}}:{},addEventListener(k,fn){events[k]=fn;}};
 doc.documentElement={async requestFullscreen(){doc.fullscreenElement={};docEvents.fullscreenchange();}};doc.exitFullscreen=async()=>{doc.fullscreenElement=null;docEvents.fullscreenchange();};
 const fullscreen=bindFullscreen(button,doc,win);await fullscreen.toggle();await Promise.resolve();
 assert.equal(fullscreen.status().active,true);assert.equal(fullscreen.status().escapeLocked,supported);
 let prevented=false;events.keydown({code:'Escape',preventDefault(){prevented=true;},target:{closest:()=>null}});
 assert.equal(prevented,supported);assert.equal(fullscreen.status().active,true,'game Escape handler never explicitly exits fullscreen');
 await fullscreen.toggle();assert.equal(doc.fullscreenElement,null);assert.equal(locks,supported?1:0);assert.ok(!supported||unlocks>=1);
}
{
 const handlers={},doc={addEventListener(k,fn){handlers[k]=fn;}};bindGameShell(doc);
 for(const type of ['contextmenu','selectstart','dragstart']){let prevented=false;handlers[type]({target:{closest:()=>null},preventDefault(){prevented=true;}});assert.equal(prevented,true);prevented=false;handlers[type]({target:{closest:()=>({})},preventDefault(){prevented=true;}});assert.equal(prevented,false,'editable inputs retain browser editing');}
}
assert.deepEqual(normalizeAudioSettings({master:2,effects:-1}),{master:1,effects:0,music:.45,musicEnabled:true,muted:false});
const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};values.set('infamy.audio.v1','broken');assert.equal(readAudioSettings(storage).master,1);
const saved={addEventListener:globalThis.addEventListener,AudioContext:globalThis.AudioContext,fetch:globalThis.fetch};
try{
 const gains=[];let starts=0;
 const node=()=>({connect(other){return other;}}),param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
 globalThis.addEventListener=()=>{};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 globalThis.AudioContext=class{destination=node();state='running';createGain(){const n={...node(),gain:param()};gains.push(n);return n;}createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}createBufferSource(){return {...node(),playbackRate:param(),start(){starts++;this.onended?.();}};}decodeAudioData(){return Promise.resolve({});}};
 const sound=createSound({storage});assert.equal(await sound.preview(),true);assert.equal(starts,1);assert.equal(gains[0].gain.value,1);assert.equal(gains[1].gain.value,1.5);
 sound.setSettings({master:.4,effects:.2});assert.equal(gains[0].gain.value,.4);assert.ok(Math.abs(gains[1].gain.value-.3)<1e-9);
 sound.toggleMute();assert.equal(gains[0].gain.value,0,'mute silences existing voices immediately');assert.equal(await sound.preview(),false);assert.equal(readAudioSettings(storage).muted,true,'settings persist');
}finally{Object.assign(globalThis,saved);}
console.log('Game shell: Escape keyboard lock/fallback/exit, page menu suppression with editable fields, audio buses/preview/mute/persistence passed');
