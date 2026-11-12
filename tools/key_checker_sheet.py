"""Turn a sheet with a painted-in white and light grey checkerboard into a transparent PNG.

    python tools/key_checker_sheet.py in.png out.png

For image sheets that came back with a fake transparency checkerboard (ruined_buildings1.png, Tim 2026-11-12).
Background = near-grey, light pixels joined to the sheet edge, plus enclosed gaps (between posts and beams) that
are flat checker colour. Needs Pillow, numpy and scipy.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def key(im):
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    lo, hi = rgb.min(-1), rgb.max(-1)
    sat = hi - lo
    tone = (sat < 9) & (lo >= 206)   # the two checker colours and the blur between squares (the grey darkens down the sheet)
    lab, n = ndi.label(tone)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    idx = np.arange(1, n + 1)
    size = ndi.sum(tone, lab, idx)
    grey = ndi.sum(tone & (lo < 236), lab, idx)
    # enclosed gaps: bigger ones hold both colours or one flat colour; tiny flat specks next to nothing are paint
    ok = [i + 1 for i in range(n) if size[i] >= 24 and (min(grey[i], size[i] - grey[i]) > 0.1 * size[i] or size[i] >= 60)]
    bg = outside | np.isin(lab, ok)
    # peel the pale fringe where the art was blended onto the checkerboard
    pale = (lo > 205) & (sat < 16)
    for _ in range(2):
        bg |= ndi.binary_dilation(bg) & pale
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    soft = ndi.uniform_filter(alpha.astype(np.float32), 3)
    alpha = np.where(bg, 0, np.minimum(255, soft * 1.15)).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), alpha])
    return Image.fromarray(out, 'RGBA')


if __name__ == '__main__':
    key(Image.open(sys.argv[1])).save(sys.argv[2], optimize=True)
