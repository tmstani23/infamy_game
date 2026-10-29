import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createMenuMusic,INTRO_TRACKS} from '../src/menu_music.js';
class Media extends EventTarget{
  paused=true;volume=1;plays=0;loads=0;blocked=false;
  async play(){this.plays++;if(this.blocked)throw Object.assign(new Error('gesture required'),{name:'NotAllowedError'});this.paused=false;this.dispatchEvent(new Event('playing'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  removeAttribute(name){if(name==='src')this.src='';}
  load(){this.loads++;}
}
function fixture(random=0,saved={}){
  const values=new Map([['infamy.audio.v1',JSON.stringify(saved)]]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const audio=new Media(),events=new EventTarget(),doc=new EventTarget();doc.hidden=false;
  let clock=0,id=0;const intervals=new Map(),timers={setInterval:fn=>{intervals.set(++id,fn);return id;},clearInterval:i=>intervals.delete(i)};
  const open=()=>createMenuMusic({audio,events,doc,storage,random:()=>random,timers,now:()=>clock});
  return{audio,events,doc,storage,open,advance:t=>{clock=t;for(const fn of [...intervals.values()])fn();},intervals};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
{
  const f=fixture(0,{master:.5,music:.4}),m=f.open();await settle();
  assert.ok(f.audio.src.endsWith(INTRO_TRACKS[0].file));assert.equal(f.audio.loop,true);
  assert.equal(f.audio.volume,.2,'music uses saved music level multiplied by master');
  m.setVolume(.6);assert.equal(f.audio.volume,.3);assert.equal(JSON.parse(f.storage.getItem('infamy.audio.v1')).music,.6);
  m.toggle();assert.equal(f.audio.paused,true);
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(f.audio.paused,true,'switching tabs never undoes a deliberate pause');
  m.toggle();await settle();assert.equal(f.audio.paused,false);
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.audio.paused,true,'background tab pauses intro');
  f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(f.audio.paused,false);
  m.stop();f.advance(300);assert.ok(f.audio.volume>0&&f.audio.volume<.3,'Start fades music without blocking game loading');
  f.advance(600);assert.equal(f.audio.paused,true);assert.equal(f.audio.src,'');assert.equal(f.intervals.size,0);
  const plays=f.audio.plays;f.events.dispatchEvent(new Event('pointerdown'));f.doc.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(f.audio.plays,plays,'cleanup prevents music restarting during gameplay');
}
{
  const f=fixture(.999);f.audio.blocked=true;const m=f.open();await settle();
  assert.ok(f.audio.src.endsWith(INTRO_TRACKS[1].file));assert.equal(m.status().blocked,true);
  f.audio.blocked=false;f.events.dispatchEvent(new Event('pointerdown'));await settle();
  assert.equal(f.audio.paused,false,'first permitted gesture retries blocked autoplay');
  m.stop(0);
}
{
  const f=fixture(0,{muted:true}),m=f.open();assert.equal(f.audio.plays,0,'saved mute respected on load');
  m.toggle();await settle();assert.equal(f.audio.paused,false,'explicit Play enables saved-muted audio');
  f.audio.dispatchEvent(new Event('error'));assert.equal(m.status().unavailable,true);assert.equal(f.audio.paused,true);
  m.stop(0);
}
for(const track of INTRO_TRACKS){
  const file=new URL(`../../assets/music/${track.file}`,import.meta.url);assert.ok(existsSync(file));
  assert.ok(readFileSync(file).length>1000,'real supplied music file exists');
}
console.log('Menu music: both random choices, loop, saved mix, autoplay retry, manual pause, visibility, fade/cleanup and media failure passed');
