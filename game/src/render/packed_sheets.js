// Packed texture addressing keeps the original full-cell coordinates. The
// character quad/effect children never move or shrink when its crop changes.
export const SPRITE_SAMPLE = /* glsl */`
uniform sampler2D uMap;
uniform vec4 uSampleBounds;
vec4 spriteTex(vec2 p) {
  #ifdef PACKED_SPRITE
  vec4 t = texture2D(uMap, clamp(p, uSampleBounds.xy, uSampleBounds.zw));
  vec2 inside = step(uSampleBounds.xy, p) * step(p, uSampleBounds.zw);
  return t * inside.x * inside.y;
  #else
  return texture2D(uMap, p);
  #endif
}`;

// Secondary effects must copy the whole frame address, including the crop.
// Copy values rather than sharing uniforms: ghosts retain their captured pose.
export function copySpriteFrame(target, source) {
  const u = target.uniforms, s = source.uniforms;
  u.uMap.value = s.uMap.value;
  u.uFrame.value.copy(s.uFrame.value);
  if (s.uSampleBounds) u.uSampleBounds.value.copy(s.uSampleBounds.value);
  else u.uSampleBounds.value.set(0, 0, 1, 1);
  const packed = !!source.defines?.PACKED_SPRITE;
  if (!!target.defines?.PACKED_SPRITE !== packed) {
    target.defines ||= {};
    if (packed) target.defines.PACKED_SPRITE = 1;
    else delete target.defines.PACKED_SPRITE;
    target.needsUpdate = true;
  }
}

function check(ok, message) { if (!ok) throw new Error(`Packed sprites: ${message}`); }

function validateChannel(channel, directions, margin) {
  check(channel && Number.isInteger(channel.cell) && channel.cell > 0, 'invalid cell');
  check(Number.isInteger(channel.frames) && channel.frames > 0, 'invalid frame count');
  check(Array.isArray(channel.pages) && channel.pages.length > 0, 'missing pages');
  check(Array.isArray(channel.regions) && channel.regions.length === channel.frames * directions, 'missing frame regions');
  for (const p of channel.pages) {
    check(/^[a-z0-9_-]+\.png$/.test(p.file), 'invalid page filename');
    check(Number.isInteger(p.width) && Number.isInteger(p.height) && p.width > 0 && p.height > 0 && p.width <= 2048 && p.height <= 2048, 'invalid page size');
  }
  for (const r of channel.regions) {
    if (!r) continue;
    check(['page', 'x', 'y', 'left', 'top', 'width', 'height'].every(k => Number.isInteger(r[k])), 'invalid region');
    const p = channel.pages[r.page];
    check(p && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.left+r.width <= channel.cell && r.top+r.height <= channel.cell, 'crop outside original cell');
    check(r.x >= margin && r.y >= margin && r.x+r.width+margin <= p.width && r.y+r.height+margin <= p.height, 'crop outside padded page');
  }
}

export function packedFrames(channel, textures, margin) {
  return channel.regions.map(r => {
    if (!r) return {map: textures[0], uv: [0, 0, 1, 1], bounds: [0, 0, 0, 0]};
    const p = channel.pages[r.page], cell = channel.cell;
    // uFrame maps the ENTIRE original canvas onto the atlas. uSampleBounds
    // masks everything outside this tile, including neighbouring packed poses.
    return {map: textures[r.page],
      uv: [(r.x-r.left)/p.width, 1-(r.y+cell-r.top)/p.height, cell/p.width, cell/p.height],
      bounds: [(r.x-margin)/p.width, 1-(r.y+r.height+margin)/p.height,
        (r.x+r.width+margin)/p.width, 1-(r.y-margin)/p.height]};
  });
}

export function setSheetFrame(uniforms, sheet, dir, frame, glow = false) {
  const packed = sheet.packed?.[glow ? 'glow' : 'color'];
  if (packed) {
    const p = packed[dir * sheet.frames + frame];
    uniforms.uMap.value = p.map;
    uniforms.uFrame.value.set(...p.uv);
    uniforms.uSampleBounds.value.set(...p.bounds);
  } else {
    uniforms.uMap.value = glow ? sheet.glow : sheet.tex;
    uniforms.uFrame.value.set(frame/sheet.frames, 1-(dir+1)/8, 1/sheet.frames, 1/8);
    uniforms.uSampleBounds.value.set(0, 0, 1, 1);
  }
}

export async function loadPackedSheets({url, model, names, loadJson, loadTexture, requireGlow = false, releaseTexture = texture => texture.dispose()}) {
  const manifest = await loadJson(url);
  check(manifest.version === 1 && manifest.model === model && manifest.directions === 8 && manifest.margin >= 8, 'unsupported manifest');
  const records = new Map(), pages = new Map();
  for (const entry of Object.values(names)) {
    const file = typeof entry === 'string' ? entry : entry.file;
    if (records.has(file)) continue;
    const record = manifest.sheets?.[file]; check(record, `missing animation ${file}`);
    validateChannel(record.color, 8, manifest.margin);
    check(!requireGlow || record.glow, 'missing required weapon glow');
    if (record.glow) {
      validateChannel(record.glow, 8, manifest.margin);
      check(record.color.frames === record.glow.frames, 'color/glow frame mismatch');
      check(Array.isArray(record.bladeAxes) && record.bladeAxes.length === record.color.frames * 8, 'missing original blade axes');
      check(record.bladeAxes.every(a => !a || [a.base?.x, a.base?.y, a.tip?.x, a.tip?.y].every(Number.isFinite)), 'invalid blade axes');
    }
    records.set(file, record);
    for (const channel of [record.color, record.glow].filter(Boolean)) for (const page of channel.pages) {
      if (pages.has(page.file)) check(pages.get(page.file).width === page.width && pages.get(page.file).height === page.height, 'inconsistent shared page size');
      else pages.set(page.file, page);
    }
  }
  const loaded = new Map();
  // Wait for every outstanding load even after failure, then release all
  // successes before falling back. A failed trial cannot leak late arrivals.
  const results = await Promise.allSettled([...pages].map(async ([file, page]) => {
    const texture = await loadTexture(new URL(file, url).href);
    loaded.set(file, texture);
    check(texture.image.width === page.width && texture.image.height === page.height, `wrong image dimensions ${file}`);
  }));
  const failure = results.find(r => r.status === 'rejected');
  if (failure) { for (const texture of new Set(loaded.values())) releaseTexture(texture); throw failure.reason; }
  const sets = new Map();
  for (const [file, record] of records) {
    const color = record.color.pages.map(p => loaded.get(p.file));
    const glow = record.glow?.pages.map(p => loaded.get(p.file));
    sets.set(file, {tex: color[0], glow: glow?.[0], frames: record.color.frames, bladeAxes: record.bladeAxes,
      packed: {color: packedFrames(record.color, color, manifest.margin),
        glow: glow ? packedFrames(record.glow, glow, manifest.margin) : null}});
  }
  const sheets = Object.fromEntries(Object.entries(names).map(([anim, entry]) => {
    const {file, speed = 1} = typeof entry === 'string' ? {file: entry} : entry;
    return [anim, {...sets.get(file), speed}];
  }));
  Object.defineProperty(sheets, 'packing', {value: {model, pages: pages.size, ...manifest.verification}});
  return sheets;
}

export async function loadSheetSet({packedUrl, disabled = false, loadOriginal, onFallback, ...options}) {
  if (packedUrl && !disabled) {
    try { return await loadPackedSheets({...options, url: packedUrl}); }
    catch (error) { onFallback?.(error); }
  }
  return loadOriginal();
}
