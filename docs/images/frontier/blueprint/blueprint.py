"""World blueprint generator (design tool, not game code).
Writes world_blueprint_vN.json + .png. Coordinates: x east, z south, world units.
Run: python3 blueprint.py <version>
"""
import json, math, random, sys, heapq
import numpy as np
from PIL import Image, ImageDraw, ImageFont

VER = sys.argv[1] if len(sys.argv) > 1 else "v1"
OUT = "/mnt/project-files/world_blueprint/"
W, H, CELL = 14000, 8000, 50
NX, NZ = W // CELL, H // CELL
INNER = (1750, 1200, 12250, 6800)          # the 6x4 block of full regions
rng = random.Random(1871)

# ---------------- shapes (hand-authored, from the concept painting) ----------------
COAST_BASE = [(450,4500),(250,3700),(600,3000),(500,2300),(900,1800),(500,1300),(700,900),(1300,1000),(1600,700),
 (2300,850),(3000,500),(3900,700),(4700,350),(5600,500),(6400,250),(7350,600),(7650,800),(8000,600),(8200,400),
 (9000,750),(9800,500),(10600,800),(11400,600),(12100,1000),(12800,1100),(13500,1500),(13300,2300),(12700,2550),
 (12450,2850),(12600,3150),(13100,3150),(13800,3300),(13600,4100),(13900,4900),(13300,5400),(13600,6100),(13000,6900),
 (13500,7500),(12900,7600),(12300,7350),(11400,7200),(10500,7600),(10000,7350),(9700,6700),(9550,6000),(9200,5350),
 (8750,5150),(8300,5450),(8050,6150),(7750,6900),(7350,7450),(6800,7650),(5900,7300),(5000,7650),(4100,7350),
 (3200,7700),(2400,7300),(1700,7400),(1200,6700),(600,6200),(800,5400)]
SOUTH_BAY={"name":"Sallow Bay","head":(8800,5250)}
ISLETS = [("Watch Rock",13700,2050,170),("Gull Teeth",13350,7350,230),("Lantern Isle",450,6950,200),("Frost Skerry",2000,330,190)]
CAPITAL = {"x":12950,"z":3420,"port":{"x":12900,"z":3170},"name":"The Capital (existing port city)"}

RANGES = [  # id, name, points, half width, pass fractions along length
 ("R1","Sutra Spine",[(5500,800),(5850,2100),(6250,3400),(6600,4650),(6950,5700),(7100,6500)],380,[.12,.33,.52,.72,.9]),
 ("R2","Bellfrost Range",[(2500,1250),(3500,1450),(4500,1250),(5100,1150)],280,[.2,.55,.85]),
 ("R3","Bellfrost East",[(6300,1250),(7300,1350),(8300,1150),(9300,1250)],260,[.15,.5,.85]),
 ("R4","Red Mesa Walls",[(1700,2300),(2350,3300),(2150,4500),(2700,5700)],230,[.18,.5,.82]),
 ("R5","Mistfall Ridges",[(4100,5800),(4900,6250),(5700,6200),(6300,6750)],230,[.2,.5,.8]),
 ("R6","Kite-Tail Hills",[(10100,6300),(10800,6550),(11500,6250)],200,[.2,.55,.9]),
]
RIVERS = [  # id, name, points (source -> mouth), width
 ("V1","Heron River",[(6750,1650),(7300,1900),(7900,2600),(8800,3200),(9800,3550),(10900,3300),(11800,3100),(12600,2850),(12900,2700)],110),
 ("V2","Snowmelt Run",[(9500,1350),(9600,1600),(9300,2300),(8900,2900),(8800,3200)],80),
 ("V3","Sallow River",[(6950,4250),(7500,4400),(8000,4700),(8500,4950),(8850,5300)],100),
 ("V4","Ashen Wash",[(5650,2650),(5100,2900),(4400,3800),(3800,4800),(3500,5800),(3200,6800),(3100,7900)],80),
]
SOURCES = {"V1":"waterfall","V2":"tarn","V3":"waterfall","V4":"tarn"}
LAKES = [("L1","Lake of Still Bells",3700,2150,380),("L2","Reedmirror Lake",10450,5000,330)]

# ---------------- helpers ----------------
def subdivide(poly):
    out=[]
    def rec(a,b,d):
        L=math.dist(a,b)
        if L<110 or d>7: out.append(a); return
        mx,mz=(a[0]+b[0])/2,(a[1]+b[1])/2
        nx,nz=-(b[1]-a[1])/L,(b[0]-a[0])/L
        off=(rng.random()-.5)*L*.42
        px,pz=mx+nx*off,mz+nz*off
        rec(a,(px,pz),d+1); rec((px,pz),b,d+1)
    for i in range(len(poly)): rec(poly[i],poly[(i+1)%len(poly)],0)
    return out

def smooth(pts,n=3):
    for _ in range(n):
        q=[pts[0]]
        for a,b in zip(pts,pts[1:]): q+= [(a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25),(a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75)]
        q.append(pts[-1]); pts=q
    return pts

def meander(pts,amp):
    out=[]
    for a,b in zip(pts,pts[1:]):
        L=math.dist(a,b); n=max(2,int(L/250)); nx,nz=-(b[1]-a[1])/L,(b[0]-a[0])/L
        for i in range(n):
            t=i/n; o=(rng.random()-.5)*amp*(0 if i==0 else 1)
            out.append((a[0]+(b[0]-a[0])*t+nx*o,a[1]+(b[1]-a[1])*t+nz*o))
    out.append(pts[-1]); return smooth(out,2)

def plen(p): return sum(math.dist(a,b) for a,b in zip(p,p[1:]))
def at_frac(p,f):
    d=plen(p)*f
    for a,b in zip(p,p[1:]):
        L=math.dist(a,b)
        if d<=L: t=d/L; return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
        d-=L
    return p[-1]

XS=(np.arange(NX)+.5)*CELL; ZS=(np.arange(NZ)+.5)*CELL
GX,GZ=np.meshgrid(XS,ZS)
def seg_dist(p):
    d=np.full(GX.shape,1e9)
    for a,b in zip(p,p[1:]):
        ax,az=a; bx,bz=b; vx,vz=bx-ax,bz-az; L2=vx*vx+vz*vz or 1
        t=np.clip(((GX-ax)*vx+(GZ-az)*vz)/L2,0,1)
        d=np.minimum(d,np.hypot(GX-(ax+t*vx),GZ-(az+t*vz)))
    return d
def inside(poly):
    m=np.zeros(GX.shape,bool); n=len(poly)
    for i in range(n):
        x1,z1=poly[i]; x2,z2=poly[(i+1)%n]
        c=((z1>GZ)!=(z2>GZ)) & (GX < (x2-x1)*(GZ-z1)/((z2-z1) or 1e-9)+x1)
        m^=c
    return m
def noise(scale,seed):
    r=np.random.default_rng(seed); g=r.random((NZ//scale+3,NX//scale+3))
    zi=np.arange(NZ)/scale; xi=np.arange(NX)/scale
    z0=zi.astype(int); x0=xi.astype(int); fz=(zi-z0)[:,None]; fx=(xi-x0)[None,:]
    fz=fz*fz*(3-2*fz); fx=fx*fx*(3-2*fx)
    a=g[z0][:,x0]; b=g[z0][:,x0+1]; c=g[z0+1][:,x0]; d=g[z0+1][:,x0+1]
    return (a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz
N1=noise(14,1)*.65+noise(5,2)*.35; N2=noise(10,3)*.6+noise(4,4)*.4

# ---------------- terrain ----------------
coast=subdivide(COAST_BASE)
land=inside(coast)
for _,x,z,r in ISLETS: land|=np.hypot(GX-x,GZ-z)<r*(.8+.4*N2)
code=np.full(GX.shape,'p',dtype='<U1')
# biomes
snowline=1750+N1*700
code[(GZ<snowline)&(GX>2000+N2*1600)&(GX<10600-N2*1600)]='n'
desert=(GX<4300+N1*900)&(GZ>1900+N2*400)&(GZ<5700+N1*500)
code[desert]='d'
forest=((GZ>5000+N1*600)|((np.abs(GX-6300)<1500+N2*500)&(GZ>1800))|((GX<2600)&(GZ<2600)))&~desert
code[forest&(N2>.32)]='f'
code[(np.hypot(GX-7900,GZ-5900)<650*(.7+.6*N1))|(np.hypot(GX-4900,GZ-4600)<450*(.7+.6*N1))]='b'
code[(np.hypot(GX-11700,GZ-6500)<800*(.6+.6*N2))|(np.hypot(GX-10450,GZ-5000)<650*(.6+.6*N2))]='k'
code[(GX>9000)&(GZ>5600+N2*300)&(code=='p')]='f'   # rainforest
# ranges + passes
passes=[]; mount=np.zeros(GX.shape,bool); hillband=np.zeros(GX.shape,bool); passzone=np.full(GX.shape,'',dtype='<U4')
for rid,name,pts,hw,fr in RANGES:
    p=meander(pts,260); d=seg_dist(p); w=hw*(.75+.5*N1)
    tip=np.ones(GX.shape)
    mount|=d<w; hillband|=d<w+420
    for i,f in enumerate(fr):
        x,z=at_frac(p,f); pid=f"{rid}-P{i+1}"
        g=np.hypot(GX-x,GZ-z)<300
        mount&=~g; passzone[g&(d<w+60)]=pid
        passes.append({"id":pid,"range":rid,"x":round(x),"z":round(z)})
code[hillband&(code!='k')&(code!='n')]='h'; code[mount]='m'
# lakes
for lid,name,x,z,r in LAKES: code[np.hypot(GX-x,GZ-z)<r*(.8+.4*N2)]='w'
# rivers + fords
rivers=[]; fords=[]; fordzone=np.full(GX.shape,'',dtype='<U6'); rivmask=np.zeros(GX.shape,bool); sources=[]; streams=[]
for vid,name,pts,wd in RIVERS:
    p=meander(pts,300); L=plen(p)
    # taper: four chunks, 55% width at the source up to 100% at the mouth
    k=len(p)
    for q in range(4):
        chunk=p[q*k//4:min(k,(q+1)*k//4+1)]
        if len(chunk)<2: continue
        d=seg_dist(chunk); m=(d<max(wd*(.55+.15*q)/2,35))&(code!='w')&(code!='m')
        rivmask|=m
    # source: tarn at the very start (inside the range) or a waterfall where it leaves the mountains
    sx,sz=p[0]
    if SOURCES[vid]=='tarn':
        code[np.hypot(GX-sx,GZ-sz)<170]='w'; sources.append({"river":vid,"kind":"tarn","x":round(sx),"z":round(sz)})
    else:
        fx,fz=sx,sz
        for t in np.linspace(0,.5,60):
            x,z=at_frac(p,t); i,j=int(z//CELL),int(x//CELL)
            if code[i,j]!='m': fx,fz=x,z; break
        sources.append({"river":vid,"kind":"waterfall","x":round(fx),"z":round(fz)})
    n=max(1,round(L/1000))
    for i in range(n):
        f=(i+.5)/n; x,z=at_frac(p,f); fid=f"{vid}-F{i+1}"
        fords.append({"id":fid,"river":vid,"x":round(x),"z":round(z),"kind":"bridge" if wd>=100 else "ford"})
        fordzone[(np.hypot(GX-x,GZ-z)<120)&rivmask]=fid
    rivers.append({"id":vid,"name":name,"width":wd,"source":SOURCES[vid],"points":[[round(a),round(b)] for a,b in p[::2]]+[[round(p[-1][0]),round(p[-1][1])]]})
    # two feeder streams (shallow, walkable, drawn only)
    for side,f in ((1,.35),(-1,.62)):
        jx,jz=at_frac(p,f); ax,az=at_frac(p,f-.02); tx,tz=jx-ax,jz-az; tl=math.hypot(tx,tz) or 1
        nx,nz=-tz/tl*side,tx/tl*side
        st=[(jx+nx*1500-tx/tl*700,jz+nz*1500-tz/tl*700),(jx+nx*700-tx/tl*250,jz+nz*700-tz/tl*250),(jx,jz)]
        st=[(min(max(x,300),W-300),min(max(z,300),H-300)) for x,z in st]
        sp=meander(st,220); streams.append({"river":vid,"points":[[round(a),round(b)] for a,b in sp[::2]]+[[round(sp[-1][0]),round(sp[-1][1])]]})
code[rivmask]='r'
code[~land]='w'
fh=SOUTH_BAY['head']; fd=np.hypot(GX-fh[0],GZ-fh[1])
flood=land&(fd<1500*(.75+.5*N1))&np.isin(code,list('pfbhd'))
code[flood]='p'
dSea0=None
sea=~land
lakemask=(code=='w')&land

# ---------------- regions ----------------
region=np.full(GX.shape,'',dtype='<U3')
REG_NAMES=["Saltwind Moor","Hollow Bell Heights","Ninefold Snows","Crane-Bone Ridge","Lantern Thaw","Rimewater Shore",
 "Rust Mesa","Thirsting Steps","Stone Sutra Peaks","Upper Heron Valley","Ninth Paddy Reach","Tollgate Fields",
 "Ochre Quiet","Dry Well Terraces","Weeping Cedar Gorge","Mossbridge Hills","Broken Levee Plain","Lower Heron Valley",
 "Pale Cliff Barrens","Firebreak Woods","Mistfall Wilds","Old Charcoal Forest","Green Fever Canopy","Drowned Shrine Fen"]
COAST_NAMES=["Bleached Net Point","Ice-Bell Coast","Thaw Mouth","Wreck Lantern Shore","Ninety Stones Coast","Monsoon Inlet",
 "Red Wall Cliffs","Ember Strand","Bone Comb Inlets","Watchfire Cape","Harbor of Debts","Lacquer Reef"]
regions=[]
for r in range(4):
    for c in range(6):
        rid=f"{r*6+c+1:02d}"; x0,z0=1750+c*1750,1200+r*1400
        region[(GX>=x0)&(GX<x0+1750)&(GZ>=z0)&(GZ<z0+1400)]=rid
        regions.append({"id":rid,"name":REG_NAMES[r*6+c],"full":True,"box":[x0,z0,x0+1750,z0+1400]})
boxes=[(c*W/3,0,(c+1)*W/3,1200) for c in range(3)]+[(c*W/3,6800,(c+1)*W/3,H) for c in range(3)]+\
      [(0,1200+r*5600/3,1750,1200+(r+1)*5600/3) for r in range(3)]+[(12250,1200+r*5600/3,W,1200+(r+1)*5600/3) for r in range(3)]
for i,b in enumerate(boxes):
    rid=f"C{i+1}"; m=(GX>=b[0])&(GX<b[2])&(GZ>=b[1])&(GZ<b[3])&(region=='')
    region[m]=rid; regions.append({"id":rid,"name":COAST_NAMES[i],"full":False,"box":[round(v) for v in b]})
for _,x,z,rr in ISLETS: region[(np.hypot(GX-x,GZ-z)<rr*1.3)&land&(np.hypot(GX-x,GZ-z)>0)&((GX<400)|(GX>13550)|(GZ<450)|(GZ>7250))]='ISL'

# ---------------- derived fields ----------------
def blur_dist(mask,maxd):
    """cheap distance field (cells) via repeated dilation"""
    d=np.full(mask.shape,maxd,float); cur=mask.copy(); d[cur]=0
    for k in range(1,maxd):
        n=cur.copy(); n[1:]|=cur[:-1]; n[:-1]|=cur[1:]; n[:,1:]|=cur[:,:-1]; n[:,:-1]|=cur[:,1:]
        d[n&~cur]=k; cur=n
    return d*CELL
code[flood&(blur_dist(sea,8)<250)&(N2>.45)]='k'
dWater=blur_dist((code=='r')|lakemask,30); dSea=blur_dist(sea,30); dMount=blur_dist(code=='m',30)
buildable=land&np.isin(code,list('pfhdnb'))
# flood fill from capital over passable cells (fords count); pockets nobody can reach are flagged unbuildable
_pass=land&(code!='m')&(code!='w')&((code!='r')|(fordzone!=''))
reach=np.zeros(GX.shape,bool); _st=[(int(CAPITAL['z']//CELL),int(CAPITAL['x']//CELL))]; reach[_st[0]]=True
while _st:
    i,j=_st.pop()
    for a,b in ((i+1,j),(i-1,j),(i,j+1),(i,j-1)):
        if 0<=a<NZ and 0<=b<NX and _pass[a,b] and not reach[a,b]: reach[a,b]=True; _st.append((a,b))
pockets=int((buildable&~reach).sum()); buildable&=reach
unbuild_share=float(((~buildable)&land).sum()/land.sum())

# ---------------- sites ----------------
SOIL={'p':3,'f':2,'h':2,'b':2,'n':1,'d':1,'k':1}
def soil_at(i,j):
    win=code[max(0,i-6):i+7,max(0,j-6):j+7].ravel(); return round(np.mean([SOIL.get(c,0) for c in win]),2)
def lvl(v,a,b): return 3 if v>=b else 2 if v>=a else 1
cand=[]
for i in range(2,NZ-2,3):
    for j in range(2,NX-2,3):
        if not buildable[i,j] or region[i,j] in ('','ISL'): continue
        if not buildable[i-2:i+3,j-2:j+3].all(): continue
        x,z=XS[j],ZS[i]
        if math.hypot(x-CAPITAL['x'],z-CAPITAL['z'])<1600: continue
        s=soil_at(i,j)+(.8 if flood[i,j] else 0); wv=3 if min(dWater[i,j],dSea[i,j])<350 else 2 if min(dWater[i,j],dSea[i,j])<800 else 1
        df=3 if dMount[i,j]<500 or (dWater[i,j]<200) else 2 if dMount[i,j]<1100 or code[i,j]=='h' else 1
        score=s*1.2+wv*1.5+df*.8+rng.random()*1.5
        cand.append((score,i,j,x,z,s,wv,df))
cand.sort(reverse=True)
sites=[]
def can_place(x,z): return all(math.hypot(x-s['x'],z-s['z'])>=1000 for s in sites)
def place(cnd):
    sc,i,j,x,z,s,wv,df=cnd; reg=region[i,j]
    tags=[]
    if dWater[i,j]<400: tags.append('river' if (code[max(0,i-8):i+9,max(0,j-8):j+9]=='r').any() else 'lake')
    if dSea[i,j]<900: tags.append('coast')
    if any(math.hypot(x-p['x'],z-p['z'])<1000 for p in passes): tags.append('pass')
    if any(math.hypot(x-f['x'],z-f['z'])<700 for f in fords): tags.append('crossing')
    sites.append({"id":f"S{len(sites)+1:02d}","x":round(x),"z":round(z),"region":reg,"terrain":str(code[i,j]),
      "traits":{"soil":lvl(s,1.6,2.3),"water":wv,"defense":df},"tags":tags,"harbor":None})
for reg in [r['id'] for r in regions]:
    want=2 if reg[0]!='C' else 1
    for c in cand:
        if want==0: break
        if region[c[1],c[2]]==reg and can_place(c[3],c[4]): place(c); want-=1
for c in cand:
    if len(sites)>=60: break
    if can_place(c[3],c[4]): place(c)
# harbors: nearest coast cell to coastal sites
seaedge=land&(np.roll(sea,1,0)|np.roll(sea,-1,0)|np.roll(sea,1,1)|np.roll(sea,-1,1))
ei,ej=np.nonzero(seaedge)
for s in sites:
    if 'coast' in s['tags']:
        d=np.hypot(XS[ej]-s['x'],ZS[ei]-s['z']); k=int(np.argmin(d))
        if d[k]<1000: s['harbor']={"x":round(XS[ej[k]]),"z":round(ZS[ei[k]])}

# ---------------- routes check (3 routes per site not sharing a pass or crossing) ----------------
passable=land&(code!='m')&(code!='w')&((code!='r')|(fordzone!=''))
COST={'p':1,'d':1,'n':1.3,'f':1.5,'b':1.5,'h':2,'k':2.5,'r':3}
costg=np.vectorize(lambda c:COST.get(c,99))(code)
choke=np.where(passzone!='',passzone,fordzone)
def cell(x,z): return int(z//CELL),int(x//CELL)
cap=cell(CAPITAL['x'],CAPITAL['z'])
def shortest(src,banned):
    dist={src:0}; prev={}; pq=[(0,src)]
    while pq:
        d,u=heapq.heappop(pq)
        if u==cap: break
        if d>dist[u]: continue
        i,j=u
        for di,dj,m in ((1,0,1),(-1,0,1),(0,1,1),(0,-1,1),(1,1,1.41),(1,-1,1.41),(-1,1,1.41),(-1,-1,1.41)):
            a,b=i+di,j+dj
            if 0<=a<NZ and 0<=b<NX and passable[a,b] and choke[a,b] not in banned:
                nd=d+costg[a,b]*m
                if nd<dist.get((a,b),1e18): dist[(a,b)]=nd; prev[(a,b)]=u; heapq.heappush(pq,(nd,(a,b)))
    if cap not in dist: return None
    path=[cap]
    while path[-1]!=src: path.append(prev[path[-1]])
    return path[::-1],dist[cap]
trunk=None
for s in sites:
    src=cell(s['x'],s['z']); banned=set(); n=0; first=None
    while n<3:
        r=shortest(src,banned)
        if not r: break
        near={choke[i,j] for i,j in r[0] if choke[i,j] and (math.hypot(XS[j]-s['x'],ZS[i]-s['z'])<450)}
        used={choke[i,j] for i,j in r[0] if choke[i,j]}-near
        n+=1; first=first or r
        if not used: n=3; break
        banned|=used
    s['routesToCapital']=n
    s['travelCostToCapital']=round(first[1]*CELL) if first else None
    if s is max(sites,key=lambda q:math.hypot(q['x']-CAPITAL['x'],q['z']-CAPITAL['z'])): trunk=first[0]

# ---------------- set pieces + native village slots ----------------
SET_KIND={'n':'frozen shrine','d':'buried caravan','m':'old mine','f':'forest ruin','h':'watch ruin','p':'abandoned manor','b':'hermit grove','k':'sunken shrine'}
setpieces=[]
for r in regions:
    if not r['full']: continue
    best=None
    for t in range(400):
        i=rng.randrange(NZ); j=rng.randrange(NX)
        if region[i,j]!=r['id'] or not buildable[i,j]: continue
        x,z=XS[j],ZS[i]; dmin=min(math.hypot(x-s['x'],z-s['z']) for s in sites)
        sc=dmin+(400 if dMount[i,j]<400 else 0)
        if best is None or sc>best[0]: best=(sc,x,z,code[i,j])
    if best: setpieces.append({"id":f"SP{r['id']}","region":r['id'],"x":round(best[1]),"z":round(best[2]),"idea":SET_KIND.get(str(best[3]),'ruin')})
NATIVE_AREAS=[("N1","Red mesa people (dry west)",3000,4700),("N2","Snowfield herders (north)",4300,1900),
              ("N3","Canopy villages (south-east)",11000,5900),("N4","Spine valley clans (central mountains)",6900,3500)]
natives=[]
for nid,desc,x,z in NATIVE_AREAS:
    i,j=cell(x,z); bi,bj=np.nonzero(buildable); d=np.hypot(XS[bj]-x,ZS[bi]-z); d[np.hypot(XS[bj][:,None]-np.array([s['x'] for s in sites]),ZS[bi][:,None]-np.array([s['z'] for s in sites])).min(1)<700]=1e9
    k=int(np.argmin(d)); natives.append({"id":nid,"note":desc,"x":round(XS[bj[k]]),"z":round(ZS[bi[k]])})

# ---------------- sea lanes (coarse water grid) ----------------
seaC=sea[::4,::4]; C4=CELL*4; nz4,nx4=seaC.shape
def sea_path(a,b):
    def near(p):
        best=None
        for i in range(nz4):
            for j in range(nx4):
                if seaC[i,j]:
                    d=math.hypot((j+.5)*C4-p['x'],(i+.5)*C4-p['z'])
                    if best is None or d<best[0]: best=(d,(i,j))
        return best[1]
    s,t=near(a),near(b); dist={s:0}; prev={}; pq=[(0,s)]
    while pq:
        d,u=heapq.heappop(pq)
        if u==t: break
        if d>dist[u]: continue
        for di,dj,m in ((1,0,1),(-1,0,1),(0,1,1),(0,-1,1),(1,1,1.41),(1,-1,1.41),(-1,1,1.41),(-1,-1,1.41)):
            v=(u[0]+di,u[1]+dj)
            if 0<=v[0]<nz4 and 0<=v[1]<nx4 and seaC[v]:
                # prefer staying a bit offshore
                pen=0 if (v[0]<2 or v[0]>nz4-3 or v[1]<2 or v[1]>nx4-3) else (0.6 if not seaC[max(0,v[0]-1):v[0]+2,max(0,v[1]-1):v[1]+2].all() else 0)
                nd=d+m+pen
                if nd<dist.get(v,1e18): dist[v]=nd; prev[v]=u; heapq.heappush(pq,(nd,v))
    p=[t]
    while p[-1]!=s: p.append(prev[p[-1]])
    p=p[::-1]; return [[round((j+.5)*C4),round((i+.5)*C4)] for i,j in p[::3]]+[[round((p[-1][1]+.5)*C4),round((p[-1][0]+.5)*C4)]]
harbors=[s for s in sites if s['harbor']]
lanes=[{"id":f"SL{k+1}","from":"capital","to":s['id'],"points":sea_path(CAPITAL['port'],s['harbor'])} for k,s in enumerate(harbors)]

# ---------------- resource nodes (placed by rule, fixed; Tim moves any via overrides) ----------------
def dist_ok(x,z,lst,d): return all(math.hypot(x-o['x'],z-o['z'])>=d for o in lst)
nodes=[]
def node_kind(i,j):
    c=code[i,j]
    if dSea[i,j]<150 and c in 'pfhdb': return 'fishing'
    if dMount[i,j]<250 and c=='h': return 'ore' if rng.random()<.35 else 'quarry'
    if c=='h' or (c=='d' and N1[i,j]>.55): return 'quarry'
    if c in 'fb': return 'forest'
    if c=='p' or (c=='k' and rng.random()<.3): return 'fertile'
    if c=='n': return 'quarry' if rng.random()<.5 else 'forest'
    return None
cells=[(i,j) for i in range(1,NZ-1,2) for j in range(1,NX-1,2)]; rng.shuffle(cells)
per_reg={}
for i,j in cells:
    reg=region[i,j]
    if reg in ('','ISL') or not (buildable[i,j] or (dSea[i,j]<150 and land[i,j])): continue
    if per_reg.get(reg,0)>=(5 if reg[0]!='C' else 3): continue
    k=node_kind(i,j)
    if not k: continue
    x,z=XS[j],ZS[i]
    if not dist_ok(x,z,nodes,650) or not dist_ok(x,z,sites,350) or math.hypot(x-CAPITAL['x'],z-CAPITAL['z'])<1200: continue
    per_reg[reg]=per_reg.get(reg,0)+1
    nodes.append({"id":f"N{len(nodes)+1:03d}","kind":k,"x":round(x),"z":round(z),"region":reg})
# fishing grounds on lakes
for lid,name,x,z,r in LAKES: nodes.append({"id":f"N{len(nodes)+1:03d}","kind":"fishing","x":x,"z":z+round(r*.6),"region":str(region[int((z+r*.6)//CELL),int(x//CELL)])})

# ---------------- camps (fixed spots; tier rises with distance from the capital) ----------------
camps=[]
maxd=max(math.hypot(x-CAPITAL['x'],z-CAPITAL['z']) for x in (0,W) for z in (0,H))
def tier(x,z):
    d=math.hypot(x-CAPITAL['x'],z-CAPITAL['z']); return 1+min(4,int(d/2600))
rng.shuffle(cells)
for i,j in cells:
    if len([c for c in camps if c['kind']=='bandit'])>=36: break
    if region[i,j] in ('','ISL') or not buildable[i,j]: continue
    x,z=XS[j],ZS[i]; c=code[i,j]
    near_p=min(math.hypot(x-p['x'],z-p['z']) for p in passes)
    pref=(c in 'fhb') or near_p<900
    if not pref and rng.random()<.4: continue
    if math.hypot(x-CAPITAL['x'],z-CAPITAL['z'])<2500 or not dist_ok(x,z,sites,700) or not dist_ok(x,z,camps,850) or not dist_ok(x,z,natives,900): continue
    camps.append({"id":f"K{len(camps)+1:02d}","kind":"bandit","tier":tier(x,z),"x":round(x),"z":round(z),"region":str(region[i,j])})
rng.shuffle(cells)
for i,j in cells:
    if len([c for c in camps if c['kind']!='bandit'])>=24: break
    if region[i,j] in ('','ISL') or not buildable[i,j]: continue
    x,z=XS[j],ZS[i]
    if math.hypot(x-CAPITAL['x'],z-CAPITAL['z'])<2000 or not dist_ok(x,z,sites,600) or not dist_ok(x,z,camps,700) or not dist_ok(x,z,setpieces,600): continue
    camps.append({"id":f"K{len(camps)+1:02d}","kind":"ruin" if rng.random()<.5 else "cache","tier":tier(x,z),"x":round(x),"z":round(z),"region":str(region[i,j])})

# ---------------- write json ----------------
world={"version":VER,"note":"World blueprint (design). W1.3's generator follows this; W1.4 overrides refine it.",
 "size":{"w":W,"h":H},"cell":CELL,"capital":CAPITAL,
 "coast":[[round(x),round(z)] for x,z in coast[::2]],"islets":[{"name":n,"x":x,"z":z,"r":r} for n,x,z,r in ISLETS],
 "regions":regions,"ranges":[{"id":a,"name":b,"spine":[list(p) for p in c],"halfWidth":d} for a,b,c,d,_ in RANGES],
 "passes":passes,"rivers":rivers,"fords":fords,"lakes":[{"id":a,"name":b,"x":c,"z":d,"r":e} for a,b,c,d,e in LAKES],
 "floodplain":{"name":"Sallow Floodplain","x":SOUTH_BAY["head"][0],"z":SOUTH_BAY["head"][1],"r":1500},"riverSources":sources,"streams":streams,"sites":sites,"nodes":nodes,"camps":camps,"setPieces":setpieces,"nativeVillageSlots":natives,"seaLanes":lanes,
 "terrain":{"codes":{"p":"plain","f":"forest","h":"hills","m":"mountain","w":"water","d":"dry","n":"snow","b":"bamboo","k":"marsh","r":"river"},
            "rows":["".join(r) for r in code]},
 "stats":{}}
st=world['stats']
st['sites']=len(sites); st['harbors']=len(harbors); st['passes']=len(passes); st['fords']=len(fords)
st['unbuildableLandShare']=round(unbuild_share,3); st['sealedPocketCells']=pockets; st['nodes']={k:sum(1 for n in nodes if n['kind']==k) for k in ('forest','quarry','fertile','fishing','ore')}; st['camps']={k:sum(1 for c in camps if c['kind']==k) for k in ('bandit','ruin','cache')}
st['minRoutesToCapital']=min(s['routesToCapital'] for s in sites)
st['sitesUnder3Routes']=[s['id'] for s in sites if s['routesToCapital']<3]
st['minSiteSpacing']=round(min(math.hypot(a['x']-b['x'],a['z']-b['z']) for a in sites for b in sites if a is not b))
st['sitesPerRegion']={r['id']:sum(1 for s in sites if s['region']==r['id']) for r in regions}
json.dump(world,open(OUT+f"world_blueprint_{VER}.json","w"),indent=1)

# ---------------- render (overview + one image per layer) ----------------
S=0.1; IW,IH=int(W*S),int(H*S); M=60
F=lambda n,b=False:ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if b else ''}.ttf",n)
COL={'p':(196,190,140),'f':(108,132,92),'h':(170,160,120),'m':(128,118,108),'w':(70,104,128),'d':(205,160,104),'n':(226,226,222),'b':(140,160,96),'k':(120,138,112),'r':(70,110,140)}
X=lambda x:M+x*S; Z=lambda z:M+z*S
INK=(30,28,24); HALO=(245,238,222,210)
def label(dr,x,y,t,f,fill=INK,center=False):
    if center: x-=dr.textlength(t,font=f)/2
    dr.text((x,y),t,font=f,fill=fill,stroke_width=2,stroke_fill=HALO)
def base(mode):
    img=Image.new('RGB',(IW+2*M,IH+M+120),(238,229,208)); dr=ImageDraw.Draw(img,'RGBA')
    tex=np.zeros((NZ,NX,3),np.uint8)
    if mode=='build':
        tex[land]=(225,215,190); tex[buildable]=(150,180,120); tex[land&~buildable]=(200,110,90)
    else:
        for k,c in COL.items(): tex[code==k]=c
        tex[(code=='p')&(GX>8200)&(GZ<5000)]=(178,186,110); tex[flood&(code=='p')]=(150,178,96)
        sh=(N2*24-12).astype(int)[...,None]; tex=np.clip(tex.astype(int)+sh*land[...,None],0,255).astype(np.uint8)
        if mode=='faded': tex=(tex*.45+np.array([238,229,208])*.55).astype(np.uint8)
    tex[sea]=(58,86,110) if mode!='faded' else (150,165,175)
    img.paste(Image.fromarray(tex).resize((IW,IH),Image.NEAREST),(M,M))
    dr.line([(X(x),Z(z)) for x,z in coast]+[(X(coast[0][0]),Z(coast[0][1]))],fill=(40,40,40,200),width=2)
    if mode=='full':
        mi,mj=np.nonzero(code=='m')
        for k in range(0,len(mi),7):
            x,z=XS[mj[k]],ZS[mi[k]]; px,pz=X(x),Z(z); q=9
            dr.polygon([(px-q,pz+q*.6),(px,pz-q),(px+q,pz+q*.6)],fill=(150,140,128,255),outline=(70,62,56,255))
            if z<2600: dr.polygon([(px-q*.35,pz-q*.45),(px,pz-q),(px+q*.35,pz-q*.45)],fill=(245,245,245,255))
    if mode!='build':
        for st_ in streams: dr.line([(X(a),Z(b)) for a,b in st_['points']],fill=(70,110,150,220),width=1)
        for r in rivers:
            pts=[(X(a),Z(b)) for a,b in r['points']]; n=len(pts)
            for q in range(n-1): dr.line([pts[q],pts[q+1]],fill=(56,98,140,255),width=2+int(3*q/n))
        for so in sources:
            px,pz=X(so['x']),Z(so['z'])
            if so['kind']=='waterfall':
                for o in (-4,0,4): dr.line([(px+o,pz-7),(px+o,pz+5)],fill=(235,245,255),width=2)
                dr.rectangle([px-7,pz-8,px+7,pz+6],outline=(30,60,100),width=1)
    cx,cz=X(CAPITAL['x']),Z(CAPITAL['z']); dr.regular_polygon((cx,cz,13),5,fill=(170,30,30),outline=(20,20,20))
    label(dr,cx-70,cz+14,"CAPITAL",F(13,True),(120,10,10))
    return img,dr
def L_borders(dr,names=True):
    for r in regions:
        x0,z0,x1,z1=r['box']
        if r['full']:
            for a,b in [((x0,z0),(x1,z0)),((x0,z0),(x0,z1)),((x1,z0),(x1,z1)),((x0,z1),(x1,z1))]:
                n=int(math.dist(a,b)/120)
                for q in range(0,n,2): dr.line([(X(a[0]+(b[0]-a[0])*q/n),Z(a[1]+(b[1]-a[1])*q/n)),(X(a[0]+(b[0]-a[0])*(q+1)/n),Z(a[1]+(b[1]-a[1])*(q+1)/n))],fill=(40,40,40,90),width=1)
    if not names: return
    for r in regions:
        x0,z0,x1,z1=r['box']; cx,cz=(x0+x1)/2,(z0+z1)/2
        if not r['full']:
            mm=(region==r['id'])
            if mm.any(): cx,cz=GX[mm].mean(),GZ[mm].mean()
        label(dr,X(cx),Z(z0+90 if r['full'] else cz),f"{r['id']} {r['name']}",F(11,True) if r['full'] else F(10),center=True)
def L_water(dr):
    for f in fords:
        px,pz=X(f['x']),Z(f['z']); dr.rectangle([px-5,pz-3,px+5,pz+3],fill=(250,240,200),outline=(60,40,20))
    for l in LAKES: label(dr,X(l[2]),Z(l[3])-6,l[1],F(10),(20,40,70),True)
    label(dr,X(SOUTH_BAY['head'][0]),Z(SOUTH_BAY['head'][1]+900),SOUTH_BAY['name'],F(11,True),(20,40,70),True)
    label(dr,X(SOUTH_BAY['head'][0]),Z(SOUTH_BAY['head'][1]-700),'Sallow Floodplain',F(10,True),(40,70,20),True)
    for r in rivers:
        a,b=r['points'][len(r['points'])//3]; label(dr,X(a)+8,Z(b),r['name'],F(10),(20,50,90))
def L_mountains(dr):
    for p in passes:
        px,pz=X(p['x']),Z(p['z']); dr.line([(px-6,pz-6),(px+6,pz+6)],fill=(200,40,30),width=3); dr.line([(px-6,pz+6),(px+6,pz-6)],fill=(200,40,30),width=3)
    for rr in RANGES:
        a=at_frac(rr[2],.4); label(dr,X(a[0])+14,Z(a[1]),rr[1],F(11,True),(70,40,30))
def L_sites(dr,lanes_on=True):
    if lanes_on:
        for l in lanes:
            pts=[(X(a),Z(b)) for a,b in l['points']]
            for a,b in zip(pts[::2],pts[1::2]): dr.line([a,b],fill=(235,240,245,200),width=2)
    for s_ in sites:
        px,pz=X(s_['x']),Z(s_['z']); col=(250,250,250) if s_['routesToCapital']>=3 else (255,120,120)
        if s_['harbor']:
            hx,hz=X(s_['harbor']['x']),Z(s_['harbor']['z']); dr.line([(px,pz),(hx,hz)],fill=(20,40,80,200),width=2); dr.regular_polygon((hx,hz,5),4,fill=(20,40,80))
        dr.ellipse([px-6,pz-6,px+6,pz+6],fill=col,outline=(20,20,20),width=2)
        label(dr,px+7,pz-14,s_['id'][1:],F(10,True))
NODECOL={'forest':(40,100,40),'quarry':(120,120,130),'fertile':(220,190,40),'fishing':(40,120,200),'ore':(150,70,40)}
def L_nodes(dr):
    for n in nodes:
        px,pz=X(n['x']),Z(n['z']); dr.rectangle([px-5,pz-5,px+5,pz+5],fill=NODECOL[n['kind']],outline=(20,20,20))
def L_camps(dr):
    for c in camps:
        px,pz=X(c['x']),Z(c['z'])
        if c['kind']=='bandit':
            r=4+c['tier']*1.6; dr.regular_polygon((px,pz,r),3,fill=(170,30,30,230),outline=(20,0,0)); label(dr,px+r,pz-4,str(c['tier']),F(9,True),(120,0,0))
        else: dr.regular_polygon((px,pz,6),6,fill=(230,200,120) if c['kind']=='cache' else (150,130,110),outline=(40,30,20))
    for sp in setpieces:
        px,pz=X(sp['x']),Z(sp['z']); dr.polygon([(px,pz-7),(px+7,pz),(px,pz+7),(px-7,pz)],outline=(90,30,110),fill=(200,170,220,230))
    for n in natives:
        px,pz=X(n['x']),Z(n['z']); dr.ellipse([px-9,pz-9,px+9,pz+9],outline=(20,110,90),width=3)
def footer(img,dr,title,legend,line2=""):
    dr.text((M,16),f"Infamy world blueprint {VER} · {title}",font=F(20,True),fill=INK)
    y=M+IH+14; x=M
    for item in legend:
        if isinstance(item,tuple):
            t,c=item; dr.rectangle([x,y+1,x+14,y+14],fill=c,outline=(30,30,30)); x+=20
        else: t=item
        dr.text((x,y),t,font=F(13),fill=INK); x+=dr.textlength(t,font=F(13))+22
        if x>IW-100: x=M; y+=22
    if line2: dr.text((M,y+26),line2,font=F(13),fill=(80,70,60))
st_line=f"{len(sites)} sites · {len(harbors)} harbors · {len(passes)} passes · {len(fords)} fords/bridges · unbuildable land {unbuild_share*100:.0f}% · fewest routes to capital {st['minRoutesToCapital']} · {len(nodes)} nodes · {len(camps)} camps"
TER=[(n,COL[k]) for k,n in [('p','plain'),('f','forest'),('h','hills'),('m','mountain'),('d','dry'),('n','snow'),('b','bamboo'),('k','marsh'),('r','water')]]
outs={}
img,dr=base('full'); L_borders(dr); L_water(dr); L_mountains(dr); L_sites(dr,False)
footer(img,dr,"overview",["● site","★ capital","✕ pass","▭ ford/bridge","◆ harbor"]+TER,st_line); outs['overview']=img
img,dr=base('full'); L_borders(dr,False); L_water(dr); L_mountains(dr)
footer(img,dr,"layer 1: terrain, mountains and water",["✕ pass (3+ per range)","▭ ford or bridge (about every 1,000 u)","▥ waterfall source","thin lines: feeder streams (walkable)"]+TER); outs['1_terrain']=img
img,dr=base('faded'); L_borders(dr)
footer(img,dr,"layer 2: regions",["01-24 full regions (1,750 × 1,400)","C1-C12 coastal regions"]); outs['2_regions']=img
img,dr=base('build'); L_borders(dr,False)
footer(img,dr,"layer 3: buildable vs not",[("buildable",(150,180,120)),("not buildable (mountain, water, river, marsh)",(200,110,90))],f"Unbuildable share of land: {unbuild_share*100:.1f}% (plan cap 20%). Roads can still cross hills/forest/marsh at higher cost."); outs['3_buildable']=img
img,dr=base('faded'); L_borders(dr,False); L_mountains(dr); L_sites(dr)
footer(img,dr,"layer 4: sites, harbors, sea lanes",["● site (red = fewer than 3 routes)","◆ harbor","— sea lane from the capital's port"],f"{len(sites)} sites, {len(harbors)} with harbors. Closest pair {st['minSiteSpacing']} u apart."); outs['4_sites']=img
img,dr=base('faded'); L_borders(dr,False); L_nodes(dr); L_sites(dr,False)
footer(img,dr,"layer 5: resource nodes",[(f"{k} ({st['nodes'][k]})",c) for k,c in NODECOL.items()],"Placed by terrain rules once, then fixed. Every campaign uses the same nodes; Tim moves any he wants."); outs['5_nodes']=img
img,dr=base('faded'); L_borders(dr,False); L_camps(dr); L_sites(dr,False)
footer(img,dr,"layer 6: camps, set pieces, native villages",["▲ bandit camp (number = tier 1-5, rises with distance)","⬢ ruin (grey) / cache (gold)","◇ set-piece slot (1 per region)","○ native village slot (pick 2-4)"],f"Camps: {st['camps']}. Fixed spots; contents (strength, loot) can vary."); outs['6_camps']=img
for k,im in outs.items(): im.save(OUT+f"{VER}_{k}.png")
print(json.dumps({k:v for k,v in st.items() if k!='sitesPerRegion'}))
