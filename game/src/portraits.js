// Small portraits for the UI, cut from each model's idle sprite sheet: the first frame of
// row 0 (facing the camera), cropped to head and shoulders. Cached per model as a data URL.
const SIZE = 64;
const CROP = { x: 0.2, y: 0.08, w: 0.6 };   // part of the 160px cell kept, as fractions of it
const cache = {};

export function portrait(catalog, model, onReady) {
  if (cache[model]) return cache[model].url;
  const entry = catalog.characters?.[model]?.idle;
  if (!entry) return null;
  cache[model] = { url: null };
  const img = new Image();
  img.onload = () => {
    const cell = img.naturalHeight / 8;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.getContext('2d').drawImage(img, cell * CROP.x, cell * CROP.y, cell * CROP.w, cell * CROP.w, 0, 0, SIZE, SIZE);
    cache[model].url = c.toDataURL();
    onReady?.();
  };
  img.src = `../assets/sprites/${typeof entry === 'string' ? entry : entry.file}.png`;
  return null;
}
