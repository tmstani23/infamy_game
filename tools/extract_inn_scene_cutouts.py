"""Extract original painted pixels for all visible inn furnishings.

The hand-traced outlines only define transparency. RGB pixels come unchanged
from the approved whole-scene painting; this script never redraws the props.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/blueprints/inn_whole_scene_paint_v1.png"
DEST = ROOT / "game/art/interior"
MANIFEST = ROOT / "game/data/inn_furnishings.json"
SCALE = 4

# Source-image coordinates. The painting completely occludes H6 behind H7.
CUTOUTS = {
    "C1_crew_futon_1": [(706,210),(761,181),(818,190),(879,225),(880,245),(815,280),(701,235),(700,222)],
    "C2_crew_futon_2": [(551,279),(591,260),(620,269),(711,313),(721,332),(657,360),(533,309),(531,296)],
    "C3_clothing_chest": [(887,211),(924,220),(954,239),(954,278),(906,311),(852,284),(852,244)],
    "C4_crew_lantern": [(666,214),(671,212),(676,216),(676,254),(689,260),(691,280),(687,296),(677,303),(663,296),(656,282),(658,263),(665,254)],
    "G1_guest_futon": [
        (1397, 467), (1513, 516), (1516, 528), (1522, 529),
        (1522, 542), (1456, 574), (1332, 524), (1332, 509),
        (1339, 494),
    ],
    "G3_guest_chest": [
        (1315, 409), (1375, 431), (1375, 473),
        (1325, 497), (1273, 474), (1273, 432),
    ],
    "G2_guest_futon_2": [
        (1181,565),(1206,551),(1223,544),(1243,549),
        (1280,561),(1320,578),(1350,595),(1361,607),
        (1362,619),(1288,651),(1247,630),(1208,611),
        (1176,592),(1173,583),
    ],
    "G4_guest_lantern": [(1234,471),(1240,472),(1243,477),(1242,499),(1253,509),(1255,530),(1248,546),(1236,551),(1223,542),(1218,527),(1221,507),(1232,498)],
    "K1_cooking_hearth": [(397,330),(416,336),(421,347),(477,356),(500,381),(502,413),(414,447),(387,432),(349,417),(316,387),(342,365)],
    "K2_preparation_table": [
        [(243,392),(296,368),(400,414),(401,425),(348,450),(243,405)],
        [(252,403),(268,410),(268,441),(251,440)],
        [(333,438),(350,446),(350,483),(335,480)],
        [(379,427),(392,421),(393,461),(378,461)],
    ],
    "K3_pantry_rack": [(79,381),(113,368),(175,378),(177,490),(167,498),(130,510),(65,510),(59,490),(78,480)],
    "K4_water_tub": [(241,439),(260,443),(269,451),(281,464),(280,498),(263,521),(224,521),(209,503),(210,465),(214,457),(225,447)],
    "K5_kitchen_lantern": [(300,377),(305,378),(308,382),(308,420),(319,426),(322,446),(316,463),(303,469),(290,461),(284,447),(288,427),(298,420)],
    "P1_planning_table": [
        [(981,623),(1037,589),(1153,645),(1153,658),(1100,687),(981,640)],
        [(987,636),(1002,643),(1002,678),(987,676)],
        [(1086,682),(1101,677),(1101,722),(1086,721)],
        [(1136,654),(1149,648),(1149,703),(1135,699)],
    ],
    "P2_map_document_rack": [(963,495),(990,494),(1040,514),(1042,605),(1028,614),(1022,618),(961,604)],
    "P3_weapon_rack": [(927,503),(969,500),(999,620),(982,644),(932,657),(905,634),(907,542)],
    "P4_gear_chest": [(777,676),(837,699),(876,724),(876,761),(875,789),(842,798),(735,751),(734,706)],
    "P5_planning_lantern": [(874,635),(880,635),(881,642),(882,679),(894,685),(896,702),(891,719),(878,724),(863,716),(859,702),(862,683),(872,677)],
    "H1_reception_counter": [
        [(871,305),(981,253),(1052,288),(1052,310),(954,351),(871,319)],
        [(877,316),(891,322),(891,369),(877,370)],
        [(933,342),(949,346),(949,393),(933,394)],
        [(991,318),(1032,303),(1033,367),(991,367)],
        [(1033,310),(1048,306),(1048,352),(1033,353)],
    ],
    "H2_communal_table": [
        [(782,442),(851,408),(969,466),(971,481),(932,506),(782,457)],
        [(789,455),(803,461),(803,487),(789,487)],
        [(944,480),(959,475),(959,512),(944,511)],
    ],
    "H3_north_left_cushion": [(913,418),(947,432),(946,445),(917,457),(903,445),(905,432)],
    "H4_north_right_cushion": [(975,454),(1006,468),(1008,484),(974,499),(967,488),(977,480)],
    "H5_south_left_cushion": [(775,480),(810,496),(812,512),(768,521),(740,506),(742,493)],
    "H7_linen_service_shelf": [(813,528),(884,490),(928,510),(930,609),(858,637),(810,619),(810,547)],
    "H8_low_tea_table": [
        [(536,573),(592,544),(703,593),(704,608),(659,633),(536,586)],
        [(542,584),(555,588),(555,606),(542,606)],
        [(642,625),(656,622),(656,651),(642,651)],
        [(682,603),(695,597),(695,632),(682,632)],
    ],
    "H9_north_tea_cushion": [(675,551),(705,565),(716,580),(676,598),(651,582),(652,567)],
    "H10_south_tea_cushion": [(563,605),(594,617),(602,635),(566,656),(528,641),(528,627)],
    "H11_hall_lantern": [(463,421),(469,421),(472,425),(471,452),(481,459),(483,479),(476,495),(468,500),(455,494),(450,480),(452,460),(462,452)],
}

def extract(image: Image.Image, name: str, shape: list) -> list[int]:
    polygons = shape if isinstance(shape[0][0], tuple) else [shape]
    points = [point for polygon in polygons for point in polygon]
    pad = 3
    left = min(x for x, _ in points) - pad
    top = min(y for _, y in points) - pad
    right = max(x for x, _ in points) + pad + 1
    bottom = max(y for _, y in points) + pad + 1
    crop = image.crop((left, top, right, bottom)).convert("RGBA")
    mask = Image.new("L", (crop.width * SCALE, crop.height * SCALE), 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon([((x - left) * SCALE, (y - top) * SCALE) for x, y in polygon], fill=255)
    mask = mask.resize(crop.size, Image.Resampling.LANCZOS)
    crop.putalpha(mask)
    crop.save(DEST / f"inn_{name.split('_', 1)[1]}.png", optimize=True)
    print(f"{name}: source crop ({left}, {top}, {right}, {bottom})")
    return [left, top, right, bottom]


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = {}
    with Image.open(SOURCE) as image:
        for name, polygon in CUTOUTS.items():
            manifest[name.split("_")[0]] = {
                "image": f"inn_{name.split('_', 1)[1]}.png",
                "sourceCrop": extract(image, name, polygon),
            }
    manifest["H6"] = {"hidden": True, "reason": "occluded by H7 in whole-scene painting"}
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Extracted {len(CUTOUTS)} visible objects; one occluded blueprint object")


if __name__ == "__main__":
    main()
