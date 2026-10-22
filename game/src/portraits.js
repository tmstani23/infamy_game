// Small portraits for the UI, cut from each model's idle sprite sheet: the first frame of
// row 0 (facing the camera), cropped to head and shoulders. Cached per model as a data URL.
const SIZE = 64;
const CROP = { x: 0.2, y: 0.08, w: 0.6 };   // part of the 160px cell kept, as fractions of it
const cache = {};

// crop: optional { x, y, w } fractions instead of CROP (e.g. the tighter unit frames, src/unit_frames.js)
export function portrait(catalog, model, onReady, crop = CROP) {
  const key = crop === CROP ? model : `${model}@${crop.x},${crop.y},${crop.w}`;
  if (cache[key]) return cache[key].url;
  const entry = catalog.characters?.[model]?.idle;
  if (!entry) return null;
  cache[key] = { url: null };
  const img = new Image();
  img.onload = () => {
    const cell = img.naturalHeight / 8;
    // Wider spear cells preserve the same character scale in the world; crop
    // the equivalent original area so portrait heads keep their normal size.
    const ratio = 3 / (catalog.characterFraming?.[model]?.cellWorld || 3);
    const framed = { x: .5 + (crop.x-.5)*ratio, y: .5 + (crop.y-.5)*ratio, w: crop.w*ratio };
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.getContext('2d').drawImage(img, cell * framed.x, cell * framed.y, cell * framed.w, cell * framed.w, 0, 0, SIZE, SIZE);
    cache[key].url = c.toDataURL();
    onReady?.();
  };
  img.src = `../assets/sprites/${typeof entry === 'string' ? entry : entry.file}.png`;
  return null;
}
