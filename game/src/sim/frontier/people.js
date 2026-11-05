// Who lives in a town (economy balance B1, Tim 2026-11-05). Trained workers leave `pop` but still eat
// and need a bed: residents = townspeople + workers + workers in training. Pure helpers, no state.
export const workerCount = s => (s.workers?.length || 0) + (s.workerTraining?.length || 0);
export const residents = s => (s.pop || 0) + workerCount(s);
