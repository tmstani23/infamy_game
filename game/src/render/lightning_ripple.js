// Bend a persistent electrical channel into an expanding arc, rather than
// emitting straight little spears. No frame-random positions.
export function lightningRipplePoint(p, age, bend, out={}) {
  const t=p.x,angle=-1.1+2.2*t;
  out.x=.24*(Math.sin(angle)+Math.sin(1.1))/(2*Math.sin(1.1))*(.8+.3*age);
  out.y=bend*(Math.cos(angle)-Math.cos(1.1))/(1-Math.cos(1.1))*(.85+.15*Math.sin(age*4))+p.y*.2;
  return out;
}
