import {createWorkerRuntime} from './sim_worker_runtime.js';
const runtime=createWorkerRuntime({post:(message,transfers)=>self.postMessage(message,transfers)});
const fail=error=>{clearInterval(timer);self.postMessage({type:'fatal',message:error.message,stack:error.stack});};
const timer=setInterval(()=>{try{runtime.pump();}catch(error){fail(error);}},10);
self.onmessage=({data})=>{try{runtime.receive(data);}catch(error){fail(error);}};
