// Fog of war on screen: turns one clan's vision grid (sim/vision.js) into the soft fog
// texture the shaders read (render/shading.js), and hands the view only what that clan
// can see, the way a multiplayer server will. ?fog=0 turns it off.
import * as THREE from 'three';
import { shared } from './shading.js';

const FADE = 5;   // how fast cells fade in and out (per second)

export function createFog({ vision, clan, on = true }) {
  const g = vision.grid(clan), n = g.w * g.h;
  const data = new Uint8Array(n * 4), now = new Float32Array(n * 2);
  const tex = new THREE.DataTexture(data, g.w, g.h);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;   // soft edges between cells
  shared.uFog.value = tex;
  shared.uFogRect.value.set(g.minX, g.minZ, g.w, g.h);
  shared.uFogOn.value = on ? 1 : 0;
  let first = true;

  // Ease every cell toward its target, so sight opens and closes smoothly
  function update(dt) {
    if (!on) return;
    const k = first ? 1 : Math.min(1, dt * FADE);
    first = false;
    for (let i = 0; i < n; i++) {
      now[i * 2] += (g.visible[i] - now[i * 2]) * k;
      now[i * 2 + 1] += (g.explored[i] - now[i * 2 + 1]) * k;
      data[i * 4] = now[i * 2] * 255;
      data[i * 4 + 1] = now[i * 2 + 1] * 255;
    }
    tex.needsUpdate = true;
  }

  // The state with only the units this clan can see
  function seen(state) {
    if (!on) return state;
    const entities = {};
    for (const e of Object.values(state.entities)) if (vision.canSee(clan, e)) entities[e.id] = e;
    return { ...state, entities };
  }

  // Hits and casts on units this clan can see (no damage numbers out in the fog)
  const seenEvents = (list, state, key) => on ? list.filter(h => vision.canSee(clan, state.entities[h[key]]) || vision.canSee(clan, state.entities[h.a])) : list;

  return { update, seen, seenEvents, isOn: () => on };
}
