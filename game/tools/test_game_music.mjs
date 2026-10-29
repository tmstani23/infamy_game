import assert from 'node:assert/strict';
import { createGameMusic } from '../src/game_music.js';
import { readAudioSettings,saveAudioSettings } from '../src/audio_settings.js';
class Media extends EventTarget{
  paused=true;volume=1;currentTime=0;plays=0;loads=0;blocked=false;
  async play(){this.plays++;if(this.blocked)throw Object.assign(new Error('gesture'),{name:'NotAllowedError'});this.paused=false;this.dispatchEvent(new Event('playing'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  load(){this.loads++;}removeAttribute(name){if(name==='src')this.src='';}
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(settings={},blocked=false){
  const audio=new Media(),events=new EventTarget(),doc=new EventTarget();doc.hidden=false;audio.blocked=blocked;
  const music=createGameMusic({audio,events,doc,settings,random:()=>.3});return {audio,events,doc,music};
}
{
  const {audio,music}=fixture();await settle();assert.equal(audio.paused,false);assert.equal(audio.loop,false);
  const files=new Set([audio.src]);let last=audio.src;
  for(let i=0;i<20;i++){audio.paused=true;audio.dispatchEvent(new Event('ended'));await settle();assert.notEqual(audio.src,last,'no adjacent repeat across shuffled cycles');files.add(audio.src);last=audio.src;}
  assert.equal(files.size,2);assert.equal(audio.loads,21,'one element streams successive songs');music.stop();
}
{
  const {audio,music,events}=fixture({master:.5,music:.4});await settle();assert.equal(audio.volume,.2);
  audio.currentTime=37;const source=audio.src;music.setSettings({master:.5,music:.4,musicEnabled:false});assert.equal(audio.paused,true);
  const plays=audio.plays;events.dispatchEvent(new Event('pointerdown'));assert.equal(audio.plays,plays,'gestures cannot undo music-off');
  music.setSettings({master:.5,music:.4,musicEnabled:true});await settle();assert.equal(audio.paused,false);assert.equal(audio.src,source);assert.equal(audio.currentTime,37);
  music.setSettings({master:.5,music:.4,muted:true});assert.equal(audio.paused,true);assert.equal(audio.volume,0);
  music.setSettings({master:.5,music:.4,effects:0});await settle();assert.equal(audio.volume,.2,'effects volume does not alter music');
  music.stop();music.stop();const after=audio.plays;events.dispatchEvent(new Event('pointerdown'));audio.dispatchEvent(new Event('ended'));assert.equal(audio.plays,after);assert.equal(audio.src,'');
}
{
  const {audio,music,events,doc}=fixture({},true);await settle();assert.equal(music.status().blocked,true);
  audio.blocked=false;events.dispatchEvent(new Event('keydown'));await settle();assert.equal(audio.paused,false);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(audio.paused,true);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(audio.paused,false);
  events.dispatchEvent(new Event('pagehide'));assert.equal(audio.src,'');
}
{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  saveAudioSettings({...readAudioSettings(storage),musicEnabled:false,music:.25},storage);
  const {audio,music}=fixture(readAudioSettings(storage));await settle();assert.equal(audio.plays,0);assert.equal(music.status().enabled,false);music.stop();
}
{
  const {audio,music,events}=fixture();await settle();const first=audio.src;
  audio.dispatchEvent(new Event('error'));await settle();assert.notEqual(audio.src,first,'failed song skipped');
  audio.dispatchEvent(new Event('error'));assert.equal(music.status().unavailable,true);const loads=audio.loads;
  events.dispatchEvent(new Event('pointerdown'));audio.dispatchEvent(new Event('ended'));await settle();assert.equal(audio.loads,loads,'failed playlist never spins');music.stop();
}
console.log('In-game music: two-track shuffle/nonrepeat, streaming, persistent off/volume, master mute, autoplay, visibility, failure and cleanup passed');
