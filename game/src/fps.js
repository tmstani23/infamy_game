// FPS readout, top left, toggled with P: frames a second over the last half second,
// plus the slowest frame in that time (a spike shows up there before the average drops)
export function createFps({diagnostics=()=>null,sim=()=>null}={}) {
  let prevSim=null;   // sim worker totals at the last readout, for per-window rates
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.6);color:#9f9;font:700 12px/1.3 monospace;pointer-events:none';
  el.hidden = true;
  document.body.appendChild(el);
  let frames = 0, worst = 0, since = performance.now(), last = since;
  return {
    toggle() { el.hidden = !el.hidden; },
    frame() {
      const now = performance.now();
      worst = Math.max(worst, now - last); last = now; frames++;
      if (now - since < 500) return;
      if (!el.hidden) {
        const mem = performance.memory ? `  ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
        const d=diagnostics();
        el.style.whiteSpace='pre-line';
        el.textContent = `${Math.round(frames * 1000 / (now - since))} fps  worst ${Math.round(worst)} ms${mem}`
          +(d?`\nDraw ${d.drawMs.toFixed(1)}ms · ${d.calls} calls · ${d.sprites} sprites (${d.workers} workers)\nGPU resources: ${d.geometries} geometries · ${d.textures} textures · ${d.programs} programs\n${d.width}×${d.height} · DPR ${d.pixelRatio}`:'');
      }
      const sd=sim();
      if(sd && !el.hidden) {
        const p=prevSim || sd, steps=(sd.clock?.steps ?? 0)-(p.clock?.steps ?? 0), secs=(now-since)/1000;
        el.textContent+=`\nSim ${Math.round(steps/secs)} ticks/s (want 20) · ${steps?((sd.simMs-p.simMs)/steps).toFixed(1):'-'} ms/tick · ${Math.round(((sd.packets ?? 0)-(p.packets ?? 0))/secs)} updates/s · dropped ${sd.clock?.droppedSteps ?? 0}`;
      }
      prevSim=sd;
      frames = 0; worst = 0; since = now;
    },
  };
}
