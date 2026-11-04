// L3.7 presentation over authored spot locations and snapshot stage strings.
import { spotState } from './sim/resource_spots.js';

export function spotPiecesToProps(spot, saved, art, config) {
  const stages = spotState(spot, saved), choices = art?.[spot.kind];
  if (!choices) return [];
  return spot.pieces.map(([dx, dz, variant], i) => {
    const stage = stages[i], names = choices[stage] || choices.f;
    return { key: `spot:${spot.id}:${i}:${stage}`, spot: spot.id, art: names[variant % names.length],
      x: spot.x + dx, z: spot.z + dz, s: config.scales[spot.kind][stage], noLights: true };
  });
}

export function visibleSpots(index, { x, z, radius, known, zoom = Infinity, minZoom = 0 }) {
  if (!index || zoom < minZoom) return [];
  return index.spotsNear(x, z, radius).filter(p => known(p.x, p.z));
}

export function spotInfo(spot, saved) {
  const stages = spotState(spot, saved), count = ch => [...stages].filter(s => s === ch).length;
  return { title: `${spot.deposit ? 'Rich ' : ''}${spot.kind} spot`, lines: [
    `${count('f')} full · ${count('h')} harvested · ${count('s')} regrowing`,
    spot.kind === 'timber' ? 'Stumps regrow into saplings, then trees.' : 'Worked pieces recover over time.'
  ] };
}

// Replace the decorative undergrowth only inside authored clusters; never change navigation.
export function coveredBySpot(prop, spots, padding) {
  return spots.some(s => s.pieces.some(([dx, dz]) => Math.hypot(prop.x - s.x - dx, prop.z - s.z - dz) < padding));
}
