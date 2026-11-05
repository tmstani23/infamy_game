import { workerCap } from './sim/frontier/tiers.js';
import { workerCount } from './sim/frontier/people.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function trainingBar(label,left,total) {
  const fraction=Math.max(0,Math.min(1,left/Math.max(0.001,total)));
  return `<div class="trainingstatus"><b>Training: ${esc(label)}</b> · ${Math.max(0,left).toFixed(1)}s remaining<div class="trainingbar" role="progressbar" aria-label="Training time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraction*100)}"><i style="width:${fraction*100}%"></i></div></div>`;
}
export function workerTrainingHTML(s,tick,data) {
  const queue=s.workerTraining || [];if(!queue.length)return '';
  const first=queue[0],duration=data.workers.trainTicks/20;
  return trainingBar('Worker',Math.max(0,(first.readyAt-tick)/20),duration)
    + `<div class="hint">${queue.length-1} more queued · all complete in ${Math.max(0,(queue.at(-1).readyAt-tick)/20).toFixed(1)}s</div>`;
}
export function workerTrainingPreview(s,count,data) {
  const cost={ryo:count*data.workers.cost},people=count*data.workers.personCost,reserve=data.opening?.reservePeople || 0;
  const cap=workerCap(s,data),have=workerCount(s);
  const reason=!Number.isSafeInteger(count) || count<1?'Invalid training quantity':have+count>cap?`Town hall tier worker limit: ${have} / ${cap}`:s.pop<people+reserve?`Need ${people} people plus ${reserve} reserved; have ${s.pop}`:(s.stock.ryo || 0)<cost.ryo?'Not enough ryo':'';
  return {ok:!reason,reason,cost,people,cells:[]};
}
