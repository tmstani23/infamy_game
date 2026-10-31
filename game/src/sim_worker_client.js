import {applySnapshot} from './sim_snapshot.js';

export async function createSimWorkerClient({game,options,match,onError,workerFactory=()=>new Worker(new URL('./sim_worker.js',import.meta.url),{type:'module'})}){
  const worker=workerFactory();
  let receivedAt=0,diagnostics={},disposed=false,map=false,onSnapshot=()=>{},applyMs=0,maxApplyMs=0;
  let lastInput='',lastInputAt=-Infinity;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Simulation worker startup timed out'));},30000);
    let ready=false;
    const fail=error=>{clearTimeout(timeout);worker.terminate();disposed=true;reject(error);onError?.(error);};
    worker.onerror=e=>fail(new Error(e.message||'Simulation worker failed'));
    worker.onmessage=({data:m})=>{
      if(m.type==='fatal'){fail(new Error(m.message));return;}
      if(m.type!=='snapshot')return;
      try{
        onSnapshot('before');const start=performance.now();applySnapshot(game,m.packet);
        applyMs=performance.now()-start;maxApplyMs=Math.max(maxApplyMs,applyMs);
        map=m.packet.map;receivedAt=performance.now();diagnostics=m.diagnostics;
        onSnapshot('after');
        worker.postMessage({type:'ack',sequence:m.packet.sequence});
        if(!ready){ready=true;clearTimeout(timeout);resolve();}
      }catch(error){fail(error);}
    };
    worker.postMessage({type:'init',options,match});
  });
  return {
    input(data){
      if(disposed)return;
      const signature=JSON.stringify({...data,commands:undefined}),time=performance.now();
      const moving=data.movement&&(data.movement.right||data.movement.down);
      if(!data.commands?.length&&signature===lastInput&&(!moving||time-lastInputAt<100))return;
      lastInput=signature;lastInputAt=time;worker.postMessage({type:'input',...data});
    },
    observe(fn){onSnapshot=fn;},
    alpha(){return Math.min(1,Math.max(0,(performance.now()-receivedAt)/50));},
    diagnostics:()=>({...diagnostics,applyMs,maxApplyMs,worker:true}),
    get map(){return map;},
    dispose(){disposed=true;worker.terminate();},
  };
}
