// Node adapter exercises the actual browser worker entry, without a browser.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};
await import('../src/sim_worker.js');
parentPort.on('message',data=>self.onmessage({data}));
