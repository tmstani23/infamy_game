export function rightTonfaPitch(phase,attacking){
 if(!attacking)return Math.PI/4;
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const swing=phase<.18?0:phase<.65?smooth((phase-.18)/.47):1-smooth((phase-.65)/.35);
 return Math.PI/4-swing*Math.PI*100/180;
}
