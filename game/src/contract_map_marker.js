// Contract destinations use outdoor map coordinates. Hidden bosses can only
// retain a recent watcher report, never their unobserved current position.
export function contractMapLocation(game, clan) {
  const state = game.state, job = state.contracts?.active?.[clan];
  if (!job) return null;
  const business = state.businesses[job.business];
  if (business) return { x: business.x, z: business.z };
  if (!job.hero) return null;
  const track = state.deployment?.clans[clan]?.bossTrack;
  if (job.kind === 'boss' && track?.target === job.hero && track.discovered && Number.isFinite(track.x)) return { x: track.x, z: track.z };
  const target = state.entities[job.hero];
  if (target && !target.dead && !target.jailed && !target.hidden && game.vision.canSee(clan, target)) {
    if (target.place === 'street') return { x: target.x, z: target.z };
    const building = Object.values(state.businesses).find(b => b.room === target.place);
    if (building) return { x: building.x, z: building.z };
  }
  const report = state.deployment?.clans[clan]?.sightings?.[job.hero];
  return report && state.tick - report.seenAt < 200 ? { x: report.x, z: report.z } : null;
}
