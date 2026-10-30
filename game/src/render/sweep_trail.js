// Presentation history only: sample the squad's actual route, never a straight line through walls.
export function createSweepTrail(limit=96,spacing=1.25){
  let leg=null,lastTick=-1,points=[];
  return {
    update(op,leader,tick){
      const key=`${op.startedAt}:${op.pointIndex}`;
      if(key!==leg||tick<lastTick){points=[];leg=key;}
      lastTick=tick;
      if(op.state==='Returning'){points=[];return points;}
      if(!leader||leader.place!=='street')return points;
      const last=points.at(-1),distance=last?Math.hypot(leader.x-last.x,leader.z-last.z):0;
      if(!last)points.push({x:leader.x,z:leader.z,angle:0});
      else if(distance>=spacing){
        const angle=Math.atan2(leader.x-last.x,leader.z-last.z);
        last.angle=angle;points.push({x:leader.x,z:leader.z,angle});
        if(points.length>limit)points.shift();
      }
      return points;
    },
    clear(){points=[];leg=null;lastTick=-1;}
  };
}

export function sweepArrivalVisible(news,state,viewer,canSee){
  return news.clan===viewer||(news.units||[]).some(id=>{
    const e=state.entities[id];
    return e&&!e.dead&&!e.downed&&e.place==='street'&&Math.hypot(e.x-news.x,e.z-news.z)<6&&canSee(viewer,e);
  });
}
