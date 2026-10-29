import { INTRO_TRACKS } from './menu_music.js';
import { normalizeAudioSettings,readAudioSettings } from './audio_settings.js';

// One streamed element for the whole match; no full-song WebAudio buffers.
export function createGameMusic({audio=new Audio(),settings=readAudioSettings(),tracks=INTRO_TRACKS,
  random=Math.random,events=globalThis,doc=globalThis.document,onChange=()=>{}}={}){
  let prefs=normalizeAudioSettings(settings),bag=[],current=-1,closed=false,blocked=false,version=0;
  const failed=new Set();
  audio.loop=false;audio.preload='metadata';
  const level=()=>prefs.musicEnabled&&!prefs.muted?prefs.master*prefs.music:0;
  const status=()=>({track:tracks[current],playing:!audio.paused,enabled:prefs.musicEnabled,blocked,unavailable:failed.size>=tracks.length});
  const publish=()=>{if(!closed)onChange(status());};
  async function play(){
    if(closed||!level()||doc?.hidden||failed.size>=tracks.length)return;
    const started=version;audio.volume=level();
    try{await audio.play();if(started!==version)return;if(closed||!level()||doc?.hidden){audio.pause();return;}blocked=false;}
    catch(error){if(closed||started!==version)return;if(error?.name==='NotAllowedError')blocked=true;else if(error?.name!=='AbortError'){errorTrack();return;}}
    publish();
  }
  function next(){
    if(closed||failed.size>=tracks.length){audio.pause();publish();return;}
    if(!bag.length){
      bag=tracks.map((_,i)=>i).filter(i=>!failed.has(i));
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      if(bag.length>1&&bag[0]===current)[bag[0],bag[1]]=[bag[1],bag[0]];
    }
    do{current=bag.shift();}while(failed.has(current)&&bag.length);
    if(failed.has(current)){bag=[];next();return;}
    version++;audio.src='../assets/music/'+tracks[current].file;audio.load();void play();publish();
  }
  function errorTrack(){if(closed)return;failed.add(current);bag=bag.filter(i=>!failed.has(i));next();}
  function retry(){if(audio.paused)void play();}
  function visibility(){if(doc.hidden)audio.pause();else retry();}
  function stop(){
    if(closed)return;closed=true;version++;
    audio.removeEventListener('ended',next);audio.removeEventListener('error',errorTrack);
    for(const type of ['playing','pause'])audio.removeEventListener(type,publish);
    events.removeEventListener('pointerdown',retry,true);events.removeEventListener('keydown',retry,true);
    events.removeEventListener('pagehide',stop);doc?.removeEventListener('visibilitychange',visibility);
    audio.pause();audio.removeAttribute('src');audio.load();bag=[];
  }
  audio.addEventListener('ended',next);audio.addEventListener('error',errorTrack);
  for(const type of ['playing','pause'])audio.addEventListener(type,publish);
  events.addEventListener('pointerdown',retry,true);events.addEventListener('keydown',retry,true);
  events.addEventListener('pagehide',stop);doc?.addEventListener('visibilitychange',visibility);
  next();
  return {status,stop,setSettings(value){if(closed)return;prefs=normalizeAudioSettings(value);audio.volume=level();if(!level())audio.pause();else retry();publish();}};
}
