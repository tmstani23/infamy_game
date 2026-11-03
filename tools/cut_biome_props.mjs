// Reproducible extraction of the reviewed biome sheets. Keep the source alpha and
// pixels; use object-specific regions instead of assuming the art obeyed a grid.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = 'assets/environment/island/biome_props';
const output = path.join(root, 'cutouts');
const manifestFile = path.join(output, 'cutouts_manifest.json');
const regions = JSON.parse(fs.readFileSync(path.join(root, 'crop_regions.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const sheets = new Map(), results = [];
for (const asset of manifest.assets) {
  if (!sheets.has(asset.sourceSheet)) sheets.set(asset.sourceSheet,
    await sharp(path.join(root, asset.sourceSheet)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  const { data: source, info } = sheets.get(asset.sourceSheet);
  const index = (asset.sourceCell.row - 1) * 3 + asset.sourceCell.column - 1;
  const region = regions[asset.sourceSheet]?.[index];
  if (!region) throw new Error(`Missing reviewed extraction region: ${asset.file}`);
  const [left, top, right, bottom] = region, width = right - left, height = bottom - top;
  if (left < 0 || top < 0 || right > info.width || bottom > info.height) throw new Error(`Invalid region: ${asset.file}`);
  const data = await sharp(source, { raw: info }).extract({ left, top, width, height }).raw().toBuffer();
  const splits = regions._rowSplits?.[asset.sourceSheet]?.[asset.sourceCell.row];
  if (splits) {
    const column = asset.sourceCell.column;
    const inside = (x, y) => Object.entries(splits).every(([boundary, points]) => {
      let splitX = points[0][1];
      for (const [fromY, atX] of points) if (y >= fromY) splitX = atX;
      return column <= +boundary ? x < splitX : x >= splitX;
    });
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = left + x, sy = top + y, i = (y * width + x) * 4;
      if (!inside(sx, sy)) data[i + 3] = 0;
      else if (data[i + 3] > 128 && [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => !inside(sx + dx, sy + dy)))
        throw new Error(`Opaque object touches extraction split: ${asset.file}`);
    }
    asset.extractionMask = { rowSplits: splits, column };
  }
  let x0 = width, y0 = height, x1 = -1, y1 = -1, opaqueBottom = -1, edgePixels = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = data[(y * width + x) * 4 + 3];
    if (a > 30) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (a > 128) {
      opaqueBottom = Math.max(opaqueBottom, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgePixels++;
    }
  }
  if (edgePixels) throw new Error(`${asset.file}: ${edgePixels} opaque pixels touch the extraction boundary; review its region`);
  if (x1 < x0 || opaqueBottom < 0) throw new Error(`Empty object region: ${asset.file}`);
  let sum = 0, count = 0;
  for (let y = Math.max(0, opaqueBottom - 2); y <= opaqueBottom; y++) for (let x = x0; x <= x1; x++)
    if (data[(y * width + x) * 4 + 3] > 128) { sum += x; count++; }
  const bounds = { left: x0, top: y0, right: x1, bottom: y1 };
  const tx = Math.max(0, x0 - 4), ty = Math.max(0, y0 - 4);
  const tw = Math.min(width, x1 + 5) - tx, th = Math.min(height, y1 + 5) - ty;
  const cropped = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left: tx, top: ty, width: tw, height: th }).raw().toBuffer();
  let transparentPixels = 0, min = 255, max = 0;
  for (let i = 3; i < cropped.length; i += 4) { const a = cropped[i]; min = Math.min(min, a); max = Math.max(max, a); if (a === 0) transparentPixels++; }
  asset.sourceCell.rect = { x: left, y: top, width, height };
  asset.trim = { alphaThreshold: 30, paddingPixels: 4,
    rectWithinCell: { x: tx, y: ty, width: tw, height: th }, size: { width: tw, height: th } };
  asset.groundAnchor = { x: Math.round(sum / count) - tx, y: opaqueBottom - ty,
    coordinateSpace: 'trimmedImage', method: 'mean opaque x in bottom 3 rows' };
  asset.opaqueBoundsWithinCell = bounds;
  asset.alpha = { channel: true, transparentPixels, min, max };
  results.push({ file: asset.file, png: await sharp(cropped, { raw: { width: tw, height: th, channels: 4 } }).png().toBuffer() });
}

// Archive the previous cuts once before replacing them. Never discard a source sheet.
const backup = path.resolve('to_delete/biome_props_fixed_grid_cuts_2026-11-02');
const workspace = path.resolve('.') + path.sep;
if (!backup.startsWith(workspace)) throw new Error('Backup must stay inside the workspace');
fs.mkdirSync(backup, { recursive: true });
for (const file of [...results.map(r => r.file), 'cutouts_manifest.json']) {
  const dest = path.join(backup, file);
  if (!fs.existsSync(dest)) fs.copyFileSync(path.join(output, file), dest);
}
for (const result of results) fs.writeFileSync(path.join(output, result.file), result.png);
manifest.schemaVersion = 2;
manifest.canvas.layout = 'logical 3x2; actual extraction rectangles reviewed per object';
delete manifest.canvas.cellSize;
manifest.cellPolicy = 'Reviewed per-object extraction regions in crop_regions.json; alpha-trim at >30 with 4px padding; source alpha preserved. Ground anchors are trimmed-image coordinates.';
manifest.status = 'Re-cut from full objects after fixed-cell clipping was found; import with tools/import_biome_props.mjs';
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Re-cut ${results.length} sprites; no opaque pixels touch any extraction boundary. Previous cuts archived in ${backup}.`);
