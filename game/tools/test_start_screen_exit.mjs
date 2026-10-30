import assert from 'node:assert/strict';
import {requestGameExit} from '../src/start_screen.js';

function harness(closeImpl) {
  let callback, delay, calls=0, notice=0;
  const win={closed:false,close(){calls++;closeImpl?.(this);}};
  requestGameExit({windowRef:win,timers:{setTimeout(fn,ms){callback=fn;delay=ms;}},onBlocked(){notice++;}});
  assert.equal(calls,1,'Exit Game asks the browser or shell to close this window');
  assert.equal(delay,250,'browser has time to close before fallback appears');
  callback();
  return {win,notice};
}

assert.equal(harness(win=>{win.closed=true;}).notice,0,'a successfully closed app shows no fallback');
assert.equal(harness().notice,1,'an ordinary browser tab receives an honest close fallback');
assert.equal(harness(()=>{throw new Error('close unavailable');}).notice,1,'a blocked close exception also shows the fallback');
console.log('Start screen exit: shell/browser close attempt and blocked-tab fallback passed');
