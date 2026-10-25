"""Extract transparent views and install the approved tenement game cutouts."""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "environment"
OUTPUT = SOURCE / "interior_prop_previews" / "tenements"
SHEETS = {
    "futon": ("matts.jpg", (2, 2)),
    "communal_table": ("comm_tables.jpg", (2, 2)),
    "household_shelf": ("house_storeshelf.jpg", (4, 2)),
    "seat_cushion": ("cushions_mats.jpg", (3, 2)),
}


def remove_connected_white(image):
    """Only key out near-white JPEG background connected to the crop edge."""
    w, h = image.size
    colors = list(image.convert("RGB").get_flattened_data())
    outside = bytearray(w * h)
    pending = deque()

    def near_white(i):
        r, g, b = colors[i]
        return min(r, g, b) >= 235 and max(r, g, b) - min(r, g, b) <= 18

    for x in range(w):
        for i in (x, (h - 1) * w + x):
            if near_white(i) and not outside[i]:
                outside[i] = 1
                pending.append(i)
    for y in range(h):
        for i in (y * w, y * w + w - 1):
            if near_white(i) and not outside[i]:
                outside[i] = 1
                pending.append(i)

    while pending:
        i = pending.popleft()
        x, y = i % w, i // w
        for j in (i - 1 if x else -1, i + 1 if x + 1 < w else -1,
                  i - w if y else -1, i + w if y + 1 < h else -1):
            if j >= 0 and not outside[j] and near_white(j):
                outside[j] = 1
                pending.append(j)

    # White pockets inside a shelf may be enclosed by its frame and never
    # reached by the outside flood; key those pixels out as well.
    background = bytearray(outside)
    for i in range(w * h):
        if near_white(i):
            background[i] = 1

    pixels = []
    for i, (r, g, b) in enumerate(colors):
        if background[i]:
            pixels.append((0, 0, 0, 0))
            continue
        x, y = i % w, i // w
        edge = any(j >= 0 and background[j] for j in (
            i - 1 if x else -1, i + 1 if x + 1 < w else -1,
            i - w if y else -1, i + w if y + 1 < h else -1))
        alpha = max(64, min(255, (255 - min(r, g, b)) * 9)) if edge else 255
        if alpha < 255:
            fraction = alpha / 255
            r, g, b = (max(0, min(255, round((c - 255 * (1 - fraction)) / fraction)))
                       for c in (r, g, b))
        pixels.append((r, g, b, alpha))
    result = Image.new("RGBA", (w, h))
    result.putdata(pixels)
    bounds = result.getbbox()
    if not bounds:
        raise ValueError("No artwork found in crop")
    pad = 6
    return result.crop((max(0, bounds[0] - pad), max(0, bounds[1] - pad),
                        min(w, bounds[2] + pad), min(h, bounds[3] + pad)))


def source_cells(name, image, layout):
    cols, rows = layout
    for row in range(rows):
        count = cols if row == 0 or name != "household_shelf" else 2
        for col in range(count):
            left = round(col * image.width / count)
            right = round((col + 1) * image.width / count)
            top = round(row * image.height / rows)
            bottom = round((row + 1) * image.height / rows)
            yield row * cols + col + 1, image.crop((left, top, right, bottom))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true", help="export the approved views at game size")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    groups = []
    for name, (filename, layout) in SHEETS.items():
        source = Image.open(SOURCE / filename).convert("RGB")
        group = []
        for number, cell in source_cells(name, source, layout):
            cutout = remove_connected_white(cell)
            cutout.save(OUTPUT / f"{name}_{number}.png")
            group.append((f"{name.replace('_', ' ')} {number}", cutout))
        groups.append(group)

    tile_w, tile_h, gap, label_h = 270, 290, 22, 24
    rows = sum((len(group) + 3) // 4 for group in groups)
    sheet = Image.new("RGB", (4 * tile_w + 5 * gap, rows * (tile_h + label_h) + (rows + 1) * gap), "#1c1e20")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    row_index = 0
    for group in groups:
        for offset in range(0, len(group), 4):
            for col, (label, cutout) in enumerate(group[offset:offset + 4]):
                x = gap + col * (tile_w + gap)
                y = gap + row_index * (tile_h + label_h + gap)
                draw.rectangle((x, y, x + tile_w, y + tile_h), fill="#313336", outline="#606469")
                view = cutout.copy()
                view.thumbnail((tile_w - 22, tile_h - 22), Image.Resampling.LANCZOS)
                sheet.paste(view, (x + (tile_w - view.width) // 2, y + (tile_h - view.height) // 2), view)
                draw.text((x + 5, y + tile_h + 5), label, fill="#e6ded0", font=font)
            row_index += 1
    sheet.save(OUTPUT / "contact_sheet.png")
    print(f"Prepared {sum(len(group) for group in groups)} review cutouts and {OUTPUT / 'contact_sheet.png'}")
    if args.install:
        destination = ROOT / "game" / "art" / "interior"
        for source_name, target_name in (
            ("futon_2", "tenement_futon"),
            ("communal_table_1", "tenement_communal_table"),
            ("household_shelf_1", "tenement_storage_shelf"),
            ("seat_cushion_1", "floor_cushion_indigo"),
            ("seat_cushion_4", "floor_cushion_straw"),
            ("seat_cushion_5", "floor_cushion_red"),
        ):
            art = Image.open(OUTPUT / f"{source_name}.png").convert("RGBA")
            art.thumbnail((300, 300), Image.Resampling.LANCZOS)
            art.save(destination / f"{target_name}.png", optimize=True)
            print(f"Installed {target_name}: {art.width}x{art.height}")


if __name__ == "__main__":
    main()
