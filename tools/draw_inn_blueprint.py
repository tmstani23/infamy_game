"""Draw the reviewable inn furnishing plan from its single JSON source."""

import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "docs/blueprints/inn_hideout_v2.json"
OUT = PLAN.with_suffix(".svg")
MODULE = ROOT / "game/tools/inn_furniture_plan.js"
data = json.loads(PLAN.read_text(encoding="utf-8"))
OX, OZ, CELL = 180, 190, 45


def sx(x):
    return OX + CELL * x


def sy(z):
    return OZ + CELL * z


def line(x0, z0, x1, z1):
    return f"M{sx(x0):g} {sy(z0):g} L{sx(x1):g} {sy(z1):g}"


def tag(x, y, value, size=16, weight="normal", anchor="middle"):
    return (f'<text x="{x:g}" y="{y:g}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{html.escape(value)}</text>')


svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1900 1200" width="1900" height="1200">',
    '<rect width="1900" height="1200" fill="white"/>',
    '<g fill="black" font-family="Arial, Helvetica, sans-serif">',
    tag(180, 67, "INN / PLAYER HIDEOUT", 35, "bold", "start"),
    tag(180, 98, "FURNISHED BLUEPRINT · REVIEW DRAFT · TOP-DOWN · 1 CELL = 45 PX", 17, "normal", "start"),
    tag(1190, 167, "OBJECT SCHEDULE", 26, "bold", "start"),
    tag(1190, 192, "IDs on plan correspond to objects below", 16, "normal", "start"),
    '</g>',
    '<g fill="none" stroke="#dedede" stroke-width="1">',
]
for x in range(1, 20):
    svg.append(f'<path d="{line(x, 0, x, 18)}"/>')
for z in range(1, 18):
    svg.append(f'<path d="{line(0, z, 20, z)}"/>')
svg.append('</g>')

# Furniture covers the grid. Lamps are rings so they remain distinguishable.
svg.append('<g font-family="Arial, Helvetica, sans-serif" fill="black">')
for obj in data['objects']:
    x0, z0, x1, z1 = obj['rect']
    x, y, w, h = sx(x0), sy(z0), CELL * (x1-x0), CELL * (z1-z0)
    if obj.get('light'):
        cx, cy = x+w/2, y+h/2
        svg.append(f'<circle cx="{cx:g}" cy="{cy:g}" r="16" fill="white" stroke="black" stroke-width="2.5"/>')
        svg.append(f'<path d="M{cx-10:g} {cy:g} H{cx+10:g} M{cx:g} {cy-10:g} V{cy+10:g}" stroke="black" stroke-width="1"/>')
        svg.append(tag(cx, cy+29, obj['id'], 13, 'bold'))
    else:
        svg.append(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="white" stroke="black" stroke-width="2"/>')
        svg.append(tag(x+w/2, y+h/2+4 if h < 52 else y+h/2-3, obj['id'], 17, 'bold'))
        if w >= 100 and h >= 52:
            short = obj['name'].replace('Crew ', '').replace('Guest ', '').replace('Communal ', '')
            if len(short) <= 20:
                svg.append(tag(x+w/2, y+h/2+15, short, 11))
svg.append('</g>')

# Structure is drawn above the furniture so penetrations are obvious.
svg.append('<g fill="none" stroke="black" stroke-linecap="square" stroke-linejoin="miter">')
svg.append(f'<path d="{line(0,0,10,0)} {line(12,0,20,0)} {line(0,0,0,18)} {line(0,18,20,18)} {line(20,18,20,0)}" stroke-width="9"/>')
for p in data['partitions']:
    for a,b in p['segments']:
        path = line(p['at'],a,p['at'],b) if p['along']=='z' else line(a,p['at'],b,p['at'])
        svg.append(f'<path d="{path}" stroke-width="7"/>')
    for a,b in p.get('doorSpans', []):
        if p['along']=='z':
            x=sx(p['at'])
            svg.append(f'<path d="M{x-7:g} {sy(a)+7:g} V{sy(b)-7:g} M{x+7:g} {sy(a)+7:g} V{sy(b)-7:g}" stroke-width="2"/>')
        else:
            y=sy(p['at'])
            svg.append(f'<path d="M{sx(a)+7:g} {y-7:g} H{sx(b)-7:g} M{sx(a)+7:g} {y+7:g} H{sx(b)-7:g}" stroke-width="2"/>')
svg.append('</g>')

# Windows show as a break in the heavy wall with twin thin rails.
svg.append('<g fill="white">')
for win in data['proposedWindows']:
    a,b=win['span']
    side=win['side']
    if side in ('north','south'):
        y=sy(0 if side=='north' else 18)
        svg.append(f'<rect x="{sx(a):g}" y="{y-6:g}" width="{CELL*(b-a):g}" height="12"/>')
    else:
        x=sx(0 if side=='west' else 20)
        svg.append(f'<rect x="{x-6:g}" y="{sy(a):g}" width="12" height="{CELL*(b-a):g}"/>')
svg.append('</g><g fill="none" stroke="black" stroke-width="1.8">')
for win in data['proposedWindows']:
    a,b=win['span']
    side=win['side']
    if side in ('north','south'):
        y=sy(0 if side=='north' else 18)
        svg.append(f'<path d="M{sx(a):g} {y-4:g} H{sx(b):g} M{sx(a):g} {y+4:g} H{sx(b):g}"/>')
    else:
        x=sx(0 if side=='west' else 20)
        svg.append(f'<path d="M{x-4:g} {sy(a):g} V{sy(b):g} M{x+4:g} {sy(a):g} V{sy(b):g}"/>')
svg.append('</g>')

svg.append('<g fill="black" font-family="Arial, Helvetica, sans-serif">')
room_labels = [('CREW QUARTERS',3,0.8),('GUEST ROOM',17,0.8),
               ('KITCHEN + STORES',3,9.8),('PLANNING + GEAR',17.7,9.8),
               ('COMMON HALL',10,1.0)]
for name,x,z in room_labels:
    tx,ty=sx(x),sy(z)
    width=max(130,len(name)*12)
    svg.append(f'<rect x="{tx-width/2:g}" y="{ty-19:g}" width="{width:g}" height="25" fill="white"/>')
    svg.append(tag(tx,ty,name,17,'bold'))
svg.append(tag(sx(11),sy(0)-20,'MAIN ENTRANCE',14,'bold'))
svg.append('</g>')

# Dimensions and north indicator.
svg.append('<g fill="none" stroke="black" stroke-width="2">')
svg.append('<path d="M180 145 H1080 M180 135 V155 M1080 135 V155 M130 190 V1000 M120 190 H140 M120 1000 H140"/>')
svg.append('<path d="M1150 135 V185 M1142 147 L1150 135 L1158 147"/>')
svg.append('<path d="M180 1068 H450 M180 1060 V1076 M270 1060 V1076 M360 1060 V1076 M450 1060 V1076"/>')
svg.append('</g><g fill="black" font-family="Arial, Helvetica, sans-serif">')
svg.append(tag(630,138,'20 GAME UNITS',17))
svg.append(tag(1150,125,'N',18,'bold'))
svg.append(tag(76,602,'18 GAME UNITS',17))
svg.append(tag(180,1098,'0',14,anchor='start'))
svg.append(tag(270,1098,'2',14))
svg.append(tag(360,1098,'4',14))
svg.append(tag(450,1098,'6 units',14,anchor='end'))
svg.append('</g>')

# The schedule is compact but every planned object has its full name here.
svg.append('<g fill="black" font-family="Arial, Helvetica, sans-serif">')
cursor=225
for room in data['rooms']:
    objects=[o for o in data['objects'] if o['room']==room['name']]
    svg.append(tag(1190,cursor,room['name'].upper(),19,'bold','start'))
    cursor+=25
    for obj in objects:
        svg.append(tag(1190,cursor,f"{obj['id']}   {obj['name']}",16,anchor='start'))
        cursor+=22
    cursor+=15
svg.append('</g>')
svg.append('<path d="M1165 205 V1070" fill="none" stroke="black" stroke-width="2"/>')
svg.append('<g fill="black" font-family="Arial, Helvetica, sans-serif">')
svg.append(tag(180,1140,'Placement draft. Lamp symbols match the five lights in the current inn preview.',17,anchor='start'))
svg.append(tag(180,1165,'Furniture outlines will become the 3D blockout; wall and door geometry remains separate.',17,anchor='start'))
svg.append('</g></svg>')
OUT.write_text('\n'.join(svg)+'\n',encoding='utf-8')
MODULE.write_text('// Generated from docs/blueprints/inn_hideout_v2.json.\n'
                  + 'export const plan = '
                  + json.dumps(data, ensure_ascii=False, indent=2)
                  + ';\n', encoding='utf-8')
print(OUT)
