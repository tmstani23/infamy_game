// Cache the pending load, not only its result: simultaneous recruits share the
// same decoded atlases/GPU textures. Failed loads remain retryable.
export function cachedSheetLoad(cache, key, load) {
  if (!cache[key]) {
    const pending = Promise.resolve().then(load);
    cache[key] = pending;
    pending.catch(() => { if (cache[key] === pending) delete cache[key]; });
  }
  return cache[key];
}
