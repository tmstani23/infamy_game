// Sprite page detail levels and the level-aware page cache (render/sprite_detail.js, render/texture_cache.js).
import assert from 'node:assert/strict';
import { halfUrl, ktxUrl, compressedAt, detailFor, createDetailPicker, DETAIL } from '../src/render/sprite_detail.js';
import { normalizeVideoSettings, VIDEO_DEFAULTS } from '../src/video_settings.js';
import { createTextureCache } from '../src/render/texture_cache.js';

// half page address: own folder, _half name; nothing else has one
assert.equal(halfUrl('http://x/assets/sprites_packed/catalog_v1/archer_color_0.png'), 'http://x/assets/sprites_packed/catalog_v1_half/archer_color_0_half.png');
assert.equal(halfUrl('../assets/sprites_packed/portraits/archer_color_0.png'), null);
assert.equal(halfUrl('../assets/sprites_packed/catalog_v1/archer.json'), null);
assert.equal(halfUrl('../assets/sprites_packed/catalog_v1_half/archer_color_0_half.png'), null, 'a half page has no half of its own');

// compressed copies: own folders; Far zoom only (the default) compresses only the half pages
assert.equal(ktxUrl('http://x/assets/sprites_packed/catalog_v1/archer_color_0.png', 'half'), 'http://x/assets/sprites_packed/catalog_v1_half_ktx2/archer_color_0_half.ktx2');
assert.equal(ktxUrl('http://x/assets/sprites_packed/catalog_v1/archer_color_0.png', 'full'), 'http://x/assets/sprites_packed/catalog_v1_ktx2/archer_color_0.ktx2');
assert.equal(ktxUrl('../assets/sprites_packed/portraits/archer_color_0.png', 'half'), null);
assert.equal(VIDEO_DEFAULTS.sprites, 'far');
assert.deepEqual([compressedAt('far', 'half'), compressedAt('far', 'full'), compressedAt('all', 'full'), compressedAt('off', 'half')], [true, false, true, false]);
assert.equal(normalizeVideoSettings({ sprites: 'nonsense' }).sprites, 'far'); assert.equal(normalizeVideoSettings({ sprites: 'off' }).sprites, 'off');

// the line between the levels has a gap, so a zoom resting near it does not flip
assert.equal(detailFor(1, 'full'), 'full');
assert.equal(detailFor(DETAIL.down - 0.01, 'full'), 'half');
assert.equal(detailFor((DETAIL.down + DETAIL.up) / 2, 'full'), 'full');
assert.equal(detailFor((DETAIL.down + DETAIL.up) / 2, 'half'), 'half');
assert.equal(detailFor(DETAIL.up + 0.01, 'half'), 'full');
assert.equal(detailFor(NaN, 'half'), 'half');

// picker: to half only after the zoom has rested, back to full at once
const pick = createDetailPicker();
assert.equal(pick.update(0.3, 0), 'full');
assert.equal(pick.update(0.3, 1.9), 'full', 'not yet settled');
assert.equal(pick.update(1, 1.95), 'full');
assert.equal(pick.update(0.3, 2.5), 'full', 'the wait starts again after zooming back in');
assert.equal(pick.update(0.3, 4.6), 'half');
assert.equal(pick.update(0.6, 5), 'half', 'inside the gap it stays');
assert.equal(pick.update(0.9, 5.01), 'full', 'zooming in is sharp at once');

// cache: new pages load at the current level; setLevel retunes held pages in place
const tick = () => new Promise(r => setTimeout(r, 0));
const missingHalf = new Set(['c']);
let loads = [], swaps = [], disposed = [];
const tex = (url, level) => ({ url, userData: { level, size: level === 'half' ? { width: 50, height: 50 } : { width: 100, height: 100 } }, dispose() { disposed.push(url); } });
const cache = createTextureCache(
  async (url, level) => { const got = level === 'half' && !missingHalf.has(url) ? 'half' : 'full'; loads.push(url + ':' + got); return tex(url, got); },
  2,
  async (texture, url, level, held) => {
    if (level === 'half' && missingHalf.has(url)) return;
    await tick();
    if (!held()) return;
    swaps.push(url + ':' + level); texture.userData.level = level; texture.userData.size = level === 'half' ? { width: 50, height: 50 } : { width: 100, height: 100 };
  });
const a = await cache.acquire('a'), a2 = await cache.acquire('a'), c = await cache.acquire('c');
assert.equal(a, a2, 'one texture per page');
assert.deepEqual(loads, ['a:full', 'c:full']);
assert.deepEqual(cache.stats(), { pages: 2, full: 2, half: 0, compressed: 0, loading: 0, pixels: 20000, bytes: 0 });
assert.equal(cache.setLevel('half'), true);
assert.equal(cache.setLevel('half'), false);
for (let i = 0; i < 6; i++) await tick();
assert.deepEqual(swaps, ['a:half'], 'the held page went to half; the page with no half was left alone');
assert.equal(a.userData.level, 'half'); assert.equal(c.userData.level, 'full');
assert.deepEqual(cache.stats(), { pages: 2, full: 1, half: 1, compressed: 0, loading: 0, pixels: 12500, bytes: 0 });
const b = await cache.acquire('b');
assert.equal(b.userData.level, 'half', 'a new page loads at the level in force');
// level changes while a swap is running: the page ends at the last level asked
cache.setLevel('full'); cache.setLevel('half'); cache.setLevel('full');
for (let i = 0; i < 12; i++) await tick();
assert.equal(a.userData.level, 'full'); assert.equal(b.userData.level, 'full'); assert.equal(cache.level(), 'full');
// a page released while its swap waits is not touched
swaps = []; cache.setLevel('half'); cache.release(b);
for (let i = 0; i < 12; i++) await tick();
assert.ok(disposed.includes('b')); assert.ok(!swaps.includes('b:half'), 'a released page is not swapped');
// shared page: freed only when the last user lets go
cache.release(a); assert.ok(!disposed.includes('a')); cache.release(a); assert.ok(disposed.includes('a'));
cache.release(c);
assert.deepEqual(cache.stats(), { pages: 0, full: 0, half: 0, compressed: 0, loading: 0, pixels: 0, bytes: 0 });
// a failed load can be tried again
let fail = true;
const flaky = createTextureCache(async url => { if (fail) throw new Error('missing'); return tex(url, 'full'); });
await assert.rejects(flaky.acquire('x')); fail = false; assert.equal((await flaky.acquire('x')).url, 'x');
console.log('Sprite detail: half and compressed page addresses, setting, zoom line with a gap, settle wait, cache levels, in-place swap, release passed');
