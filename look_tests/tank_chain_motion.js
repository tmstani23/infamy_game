// Character-local +Z is forward. Wind up, cast the weight ahead, then recover.
export function chainWeightPose(phase,attacking){
 const p=Math.max(0,Math.min(1,phase));
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const extension=!attacking?0:p<.18?0:p<.55?smooth((p-.18)/.37):1-smooth((p-.55)/.45);
 return {x:-.55+.40*extension,y:.60+.42*extension,z:.35+1.45*extension,extension};
}
