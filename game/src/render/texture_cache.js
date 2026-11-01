// Shared packed pages, bounded decode concurrency, and ownership-safe fallback.
export function createTextureCache(load, limit = 4) {
  const entries = new Map(), owners = new Map(), queue = [];
  let active = 0;
  function pump() {
    while (active < limit && queue.length) {
      active++;
      const job = queue.shift();
      Promise.resolve().then(() => load(job.url)).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  }
  return {
    acquire(url) {
      let entry = entries.get(url);
      if (!entry) {
        entry = {users: 0}; entries.set(url, entry);
        entry.promise = new Promise((resolve, reject) => { queue.push({url, resolve, reject}); pump(); })
          .then(texture => { entry.texture = texture; owners.set(texture, {url, entry}); return texture; },
            error => { entries.delete(url); throw error; });
      }
      entry.users++;
      return entry.promise;
    },
    release(texture) {
      const owner = owners.get(texture);
      if (!owner) return;
      if (--owner.entry.users === 0) {
        owners.delete(texture); entries.delete(owner.url); texture.dispose();
      }
    },
  };
}
