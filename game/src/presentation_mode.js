// Screen-only lifecycle. This never pauses or advances the simulation.
export function createPresentationMode({suspend,resume,now=()=>performance.now()}){
  let map=false,openedAt=0;
  const counts={opens:0,closes:0,worldFrames:0,mapFrames:0,worldMs:0,mapMs:0};
  return {sync(open){
    if(map===open)return false;
    map=open;
    if(open){openedAt=now();counts.opens++;suspend();}
    else{counts.closes++;resume(Math.max(0,(now()-openedAt)/1000));}
    return true;
  },get map(){return map;},measure(kind,draw){
    const start=now();draw();counts[kind+'Frames']++;counts[kind+'Ms']+=now()-start;
  },diagnostics(){return {...counts,mode:map?'map':'world'};}};
}
