import {readAudioSettings,saveAudioSettings} from './audio_settings.js';

export const INTRO_TRACKS=[
  {file:'city/intro_rain_city.mp3',title:'雨の街の静寂'},
  {file:'city/intro_rain_night.mp3',title:'雨夜の菜单'},
];

// In-game shuffle: every song once per cycle, no repeats until all have played (prompts in assets/music_prompts.md).
// Subfolders of assets/music are only for organizing by mood; all songs share one playlist.
export const GAME_TRACKS=[...INTRO_TRACKS,
  {file:'city/harbor_morning.mp3',title:'港の朝'},
  {file:'city/lanternlit_alley.mp3',title:'Lanternlit Alley'},
  {file:'city/lanterns_in_rain.wav',title:'Lanterns in Rain'},
  {file:'city/lantern_night.mp3',title:'提灯の夜'},
  {file:'city/teahouse_night.mp3',title:'茶屋の夜'},
  {file:'city/candlelit_tearoom.mp3',title:'燭明茶室'},
  {file:'city/in_the_red_lamplight.mp3',title:'红灯影里'},
  {file:'city/lantern_festival_band.mp3',title:'提灯の囃子'},
  {file:'city/meiji_machine_sounds.mp3',title:'明治の機械音'},
  {file:'city/rolling_with_the_swells.mp3',title:'Rolling with the Swells'},
  {file:'frontier/frontier_reel.mp3',title:'Frontier Reel'},
  {file:'frontier/prairie_campfire.mp3',title:'Prairie Campfire'},
  {file:'frontier/railroad_chug.mp3',title:'Railroad Chug'},
  {file:'frontier/saloon_polka.mp3',title:'Saloon Polka'},
  {file:'frontier/desert_stillness.mp3',title:'砂漠の静けさ'},
  {file:'frontier/dawn_march.mp3',title:'黎明の行進'},
  {file:'battle/pulse_of_the_wind.mp3',title:'風の鼓動'},
  {file:'battle/pulse_of_the_final_battle.mp3',title:'決戦の鼓動'},
  {file:'battle/patrol_march.mp3',title:'警備行進曲'},
  {file:'stealth/silent_bamboo_grove.wav',title:'Silent Bamboo Grove'},
  {file:'stealth/ninja_grove_song1.wav',title:'Ninja Grove Song 1'},
  {file:'stealth/stealth_coil.mp3',title:'Stealth Coil'},
  {file:'stealth/stealth_coil_2.mp3',title:'Stealth Coil 2'},
  {file:'ceremony/imperial_ceremony_march.mp3',title:'皇典の行進'},
  {file:'ceremony/silence_of_the_rain_funeral.mp3',title:'雨葬の静寂'},
];

// Stream just one intro track; no full-song WebAudio decoding or combat voices.
export function createMenuMusic({audio=new Audio(),storage,events=globalThis,doc=globalThis.document,
  random=Math.random,onChange=()=>{},timers=globalThis,now=()=>performance.now()}={}) {
  const track=INTRO_TRACKS[Math.min(INTRO_TRACKS.length-1,Math.floor(random()*INTRO_TRACKS.length))];
  let settings=readAudioSettings(storage),closed=false,userPaused=false,blocked=false,failed=false,fadeTimer=null;
  audio.src=`../assets/music/${track.file}`;audio.loop=true;audio.preload='none';
  const level=()=>settings.muted||!settings.musicEnabled?0:settings.master*settings.music;
  const status=()=>({track,volume:settings.music,playing:!audio.paused&&!failed,blocked,unavailable:failed,muted:level()===0});
  const publish=()=>{if(!closed)onChange(status());};
  async function play(){
    if(closed||userPaused||failed||doc?.hidden||level()===0)return;
    audio.volume=level();
    try{
      await audio.play();
      if(closed||userPaused||doc?.hidden){audio.pause();return;}
      blocked=false;
    }catch(error){
      if(closed)return;
      if(error?.name==='NotAllowedError')blocked=true;
      else if(error?.name!=='AbortError')failed=true;
    }
    publish();
  }
  function retry(e){if(e.target?.closest?.('.start-music-toggle'))return;if(audio.paused&&!userPaused)void play();}
  function visibility(){if(doc.hidden)audio.pause();else if(!userPaused)void play();}
  function error(){failed=true;audio.pause();publish();}
  function cleanup(){
    if(fadeTimer!==null){timers.clearInterval(fadeTimer);fadeTimer=null;}
    for(const type of ['playing','pause'])audio.removeEventListener(type,publish);
    audio.removeEventListener('error',error);audio.pause();audio.removeAttribute('src');audio.load();
  }
  function stop(fadeMs=600){
    if(closed)return;closed=true;
    events.removeEventListener('pointerdown',retry,true);events.removeEventListener('keydown',retry,true);
    events.removeEventListener('pagehide',pagehide);doc?.removeEventListener('visibilitychange',visibility);
    if(!fadeMs||audio.paused){cleanup();return;}
    const began=now(),volume=audio.volume;
    fadeTimer=timers.setInterval(()=>{const share=Math.min(1,(now()-began)/fadeMs);audio.volume=volume*(1-share);if(share>=1)cleanup();},25);
  }
  function pagehide(){stop(0);}
  for(const type of ['playing','pause'])audio.addEventListener(type,publish);
  audio.addEventListener('error',error);
  events.addEventListener('pointerdown',retry,true);events.addEventListener('keydown',retry,true);
  events.addEventListener('pagehide',pagehide);doc?.addEventListener('visibilitychange',visibility);
  void play();
  return {status,stop,
    toggle(){
      if(closed||failed)return;
      if(!audio.paused&&!blocked){userPaused=true;audio.pause();publish();}
      else{
        userPaused=false;settings.muted=false;settings.musicEnabled=true;
        if(!settings.master)settings.master=1;if(!settings.music)settings.music=.45;
        saveAudioSettings(settings,storage);void play();
      }
    },
    setVolume(volume){
      if(closed)return;
      settings.music=Math.max(0,Math.min(1,Number(volume)||0));saveAudioSettings(settings,storage);
      audio.volume=level();if(!level())audio.pause();else if(!userPaused)void play();publish();
    },
  };
}
