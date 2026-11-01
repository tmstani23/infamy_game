// Right-handed weapon basis: haft rises forward, cutting edge projects forward
// and hooks down. It cannot flip into the armpit with the Mixamo wrist roll.
export function sickleBasis(phase, attacking = false) {
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const stroke=!attacking?0:phase<.18?0:phase<.65?smooth((phase-.18)/.47):1-smooth((phase-.65)/.35);
  const pitch=Math.PI/4-stroke*Math.PI*100/180,c=Math.cos(pitch),s=Math.sin(pitch);
  return {blade:[0,-c,s],normal:[1,0,0],haft:[0,s,c]};
}
