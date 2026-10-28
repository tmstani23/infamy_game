// Combat sounds (Kenney packs, CC0; list in assets/sounds/CREDITS.md), played from the
// sim's per-tick hits and casts and from swings starting. Quieter with distance from the
// camera, a little random pitch so repeats don't sound the same. K mutes. Purely output.
import {normalizeAudioSettings,readAudioSettings,saveAudioSettings} from '../audio_settings.js';
const BLADES = new Set(['ronin', 'swordsman', 'rival_yakuza', 'kuroda_spearman', 'ninja_leader', 'ninja_grunt', 'ninja_tanto']);
const SOFT = [0, 1, 2, 3, 4].map(i => `Audio/impactSoft_medium_00${i}`);
const FILES = ['sword_slash_1', 'sword_slash_2', 'sword_chop_1', 'katana_hit_metal_1', 'katana_hit_metal_2', 'katana_clash_1',
  'katana_draw_1', 'katana_draw_2', 'club_hit_1', 'club_hit_2', 'club_hit_3', 'crit_hit_1', 'crit_hit_2',
  'death_thud_1', 'death_thud_2', 'knockdown_thud_1', ...SOFT];
const HEAR = 24, MAX_VOICES = 14;

export function createSound({ base = '../assets/sounds/',storage } = {}) {
  let ctx = null, master = null, effects=null, voices = 0, settings=readAudioSettings(storage),ready=null;
  const listeners=new Set();
  function apply(){if(master)master.gain.value=settings.muted?0:settings.master;if(effects)effects.gain.value=settings.effects*1.5;}
  function setSettings(patch){settings=normalizeAudioSettings({...settings,...patch});apply();saveAudioSettings(settings,storage);for(const fn of listeners)fn({...settings});return {...settings};}
  const buffers = {};
  // browsers only allow audio after a key press or click
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new AudioContext();
    master = ctx.createGain();
    effects=ctx.createGain();effects.connect(master);
    const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.15;
    master.connect(limiter).connect(ctx.destination);apply();
    ready=Promise.all(FILES.map(f=>fetch(`${base}${f}.ogg`).then(r=>{if(!r.ok)throw Error('Sound unavailable');return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)).then(b=>{buffers[f]=b;}).catch(()=>{})));
  }
  addEventListener('keydown', unlock);
  addEventListener('mousedown', unlock);

  function play(names, volume, pitch = 1) {
    if (!ctx || settings.muted || voices >= MAX_VOICES || volume <= 0.01) return;
    const name = [].concat(names)[Math.floor(Math.random() * [].concat(names).length)], buf = buffers[name];
    if (!buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = pitch * (0.92 + Math.random() * 0.16);
    g.gain.value = volume;
    src.connect(g).connect(effects);
    voices++;
    src.onended = () => voices--;
    src.start();
  }
  // loudness for something at (x, z) heard at the camera (nothing from other places)
  const near = (me, x, z, place) => !me || place !== me.place ? 0 : Math.max(0, 1 - Math.hypot(x - me.x, z - me.z) / HEAR);

  // a temple bell, made on the spot (no file): a few soft partials that ring out (raid alarm)
  function bell() {
    if (!ctx || settings.muted) return;
    const t0 = ctx.currentTime;
    for (const [f, v, len] of [[392, 0.35, 2.6], [784, 0.16, 1.8], [1046, 0.09, 1.2], [1568, 0.05, 0.8]]) {
      for (const at of [0, 0.55]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(v, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(g).connect(effects);
        o.start(t0 + at); o.stop(t0 + at + len);
      }
    }
  }

  return {
    bell,
    toggleMute() { return setSettings({muted:!settings.muted}).muted; },
    setSettings,getSettings:()=>({...settings}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async preview(){unlock();await ready;if(!buffers.katana_clash_1||settings.muted||!settings.master||!settings.effects)return false;play('katana_clash_1',.55);return true;},
    // after each tick: new swings, hits and casts
    update(state, focus) {
      const me = focus;
      for (const e of Object.values(state.entities)) {
        if (!e.swing || e.swing.start !== state.tick - 1) continue;
        const v = near(me, e.x, e.z, e.place);
        if (BLADES.has(e.model)) play(['sword_slash_1', 'sword_slash_2'], 0.35 * v);
        else play(['sword_slash_1', 'sword_slash_2'], 0.2 * v, 0.7);   // heavier whoosh for clubs
      }
      for (const h of state.hits) {
        const t = state.entities[h.t], v = near(me, h.x, h.z, t?.place);
        if (BLADES.has(h.weapon)) play(h.kind === 'dash' ? ['katana_hit_metal_1', 'katana_hit_metal_2'] : 'sword_chop_1', 0.55 * v);
        else if (h.weapon === 'brute') play(Math.random() < 0.5 ? SOFT : ['club_hit_1', 'club_hit_2', 'club_hit_3'], 0.55 * v, 0.85);
        else play(['club_hit_1', 'club_hit_2', 'club_hit_3'], 0.55 * v);
        if (h.crit) play(['crit_hit_1', 'crit_hit_2'], 0.6 * v);
        if (h.kill) play(t?.type === 'hero' ? 'knockdown_thud_1' : ['death_thud_1', 'death_thud_2'], 0.6 * v);
      }
      for (const c of state.casts) {
        const a = state.entities[c.a], v = near(me, c.x, c.z, a?.place);
        if (c.kind === 'dash' || c.kind === 'lantern') play(['katana_draw_1', 'katana_draw_2'], 0.6 * v, c.kind === 'lantern' ? 0.8 : 1);
        if (c.kind === 'intimidate') play(SOFT, 0.7 * v, 0.6);
        if (c.kind === 'rally') play('katana_clash_1', 0.5 * v);
        if (c.kind === 'sweep' || c.kind === 'thrust') play('sword_slash_1', .4*v);
        if (c.kind === 'counter') play('katana_clash_1', .6*v, .85);
        if (c.kind === 'formation') play('katana_draw_2', .45*v, .65);
        if (c.kind === 'execute') { play(['crit_hit_1', 'crit_hit_2'], 0.7 * v, 0.8); play(['death_thud_1', 'death_thud_2'], 0.6 * v); }
      }
    },
  };
}
