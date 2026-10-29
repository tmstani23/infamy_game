export const AUDIO_DEFAULTS={master:1,effects:1,music:.45,muted:false};
const level=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
export function normalizeAudioSettings(value={}){return {master:level(value.master,1),effects:level(value.effects,1),music:level(value.music,.45),muted:value.muted===true};}
export function readAudioSettings(storage){try{return normalizeAudioSettings(JSON.parse((storage||globalThis.localStorage)?.getItem('infamy.audio.v1')||'{}')||{});}catch{return {...AUDIO_DEFAULTS};}}
export function saveAudioSettings(settings,storage){try{(storage||globalThis.localStorage)?.setItem('infamy.audio.v1',JSON.stringify(settings));}catch{}}
