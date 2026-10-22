// Camping visits describe the whole clan; indoor heroes must not receive a
// street-area warning because crew left outside can keep that visit occupied.
export function hqCampingNoticeVisit(state, heroId) {
  const hero = state.entities[heroId];
  if (!hero || hero.place !== 'street') return null;
  const visits = (state.hqCamping?.visits || []).filter(v => v.clan === hero.owner);
  return visits.find(v => v.active && v.inside) || visits.find(v => v.inside) || visits[0] || null;
}
