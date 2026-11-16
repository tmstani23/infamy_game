// Shared packed pages, bounded decode concurrency, and ownership-safe fallback.
// Optional detail levels (2026-11-15, render/sprite_detail.js): with `swap`, setLevel(level) reloads every held page at
// that level in place (the same texture object, so every sprite using it follows); new pages load at the current level.
//   load(url, level) -> texture            (texture.userData.level = the level it really loaded at)
//   swap(texture, url, level) -> Promise   (replace the texture's picture; resolves when done)
export function createTextureCache(load, limit = 4, swap = null) {
  const entries = new Map(), owners = new Map(), queue = [];
  let active = 0, level = 'full';
  function pump() {
    while (active < limit && queue.length) {
      active++;
      const job = queue.shift();
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; pump(); });
    }
  }
  const queued = run => new Promise((resolve, reject) => { queue.push({run, resolve, reject}); pump(); });
  const levelOf = texture => texture?.userData?.level || 'full';
  function retune(entry, url) {
    if (!swap || !entry.texture || entry.swapping || levelOf(entry.texture) === level || entry.stuck === level) return;
    const want = level; entry.swapping = true;
    queued(() => entries.get(url) === entry ? swap(entry.texture, url, want, () => entries.get(url) === entry) : null)
      .catch(() => {}).finally(() => {
        entry.swapping = false;
        if (entry.texture && levelOf(entry.texture) !== want) entry.stuck = want;   // no such page at that level: stop asking
        if (entries.get(url) === entry) retune(entry, url);                          // the level moved on meanwhile
      });
  }
  return {
    acquire(url) {
      let entry = entries.get(url);
      if (!entry) {
        entry = {users: 0}; entries.set(url, entry);
        entry.promise = queued(() => load(url, level))
          .then(texture => { entry.texture = texture; owners.set(texture, {url, entry}); retune(entry, url); return texture; },
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
    level: () => level,
    setLevel(next) {
      if (next === level) return false;
      level = next;
      for (const [url, entry] of entries) { delete entry.stuck; retune(entry, url); }
      return true;
    },
    stats() {
      const out = {pages: 0, full: 0, half: 0, compressed: 0, loading: 0, pixels: 0, bytes: 0};
      for (const entry of entries.values()) {
        if (!entry.texture) { out.loading++; continue; }
        out.pages++; out[levelOf(entry.texture)]++;
        const u = entry.texture.userData || {}; if (u.size) out.pixels += u.size.width * u.size.height;
        out.bytes += u.bytes || 0; if (entry.texture.isCompressedTexture) out.compressed++;
      }
      return out;
    },
  };
}
