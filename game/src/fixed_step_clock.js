// Bounded fixed-step catch-up: ordinary slow frames keep real time; extreme
// stalls discard whole overdue steps, retaining only the interpolation fraction.
export function createFixedStepClock({ tick = 1 / 20, maxSteps = 10 } = {}) {
  let acc = 0;
  const stats = { steps: 0, catchUpFrames: 0, droppedSteps: 0, cappedSeconds: 0 };
  function advance(elapsed, step, paused = false) {
    const dt = Math.max(0, Math.min(elapsed, 1));
    if (paused) return;
    stats.cappedSeconds += Math.max(0, elapsed - dt);
    acc += dt;
    let steps = 0;
    while (acc + 1e-9 >= tick && steps < maxSteps) {
      step(); acc = Math.max(0, acc - tick); steps++;
    }
    if (steps > 1) stats.catchUpFrames++;
    stats.steps += steps;
    const dropped = Math.floor((acc + 1e-9) / tick);
    if (dropped) { stats.droppedSteps += dropped; acc = Math.max(0, acc - dropped * tick); }
  }
  return { advance, alpha: () => acc / tick, diagnostics: () => ({ ...stats }) };
}
