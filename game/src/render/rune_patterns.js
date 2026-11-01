// Shared procedural vocabulary: no textures, rotating text or filled light discs.
export const RUNE = { entry:0, shinobi:1, raid:2, contract:3, shakedown:4, sweep:5, assignment:6 };
export const RUNE_GLSL = /* glsl */`
  float runeStroke(float d, float width) {
    return 1.0-smoothstep(width,width+.009,abs(d));
  }
  float runeLine(vec2 p, vec2 a, vec2 b, float width) {
    vec2 v=b-a;
    return runeStroke(length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0)),width);
  }
  // x: static ink; y: outer progress segments. All marks fit the unit radius.
  vec2 runePattern(vec2 p, float style, float progress) {
    float r=length(p),a=atan(p.y,p.x),turn=fract((a+1.57079633)/6.2831853+1.0);
    float segmented=step(.16,fract(turn*32.0));
    float track=runeStroke(r-.975,.012)*segmented;
    float outer=progress<0.0?0.0:track*(.10+.90*step(turn,clamp(progress,0.0,1.0)));
    float ink=0.0;
    if(style<.5) {
      // Broken threshold, with two inward chevrons. The gap stays still.
      ink=runeStroke(r-.89,.017)*step(.26,abs(a+1.57079633));
      vec2 q=vec2(abs(p.x),p.y);
      ink=max(ink,runeLine(q,vec2(.71,-.09),vec2(.57,0.0),.014));
      ink=max(ink,runeLine(q,vec2(.57,0.0),vec2(.71,.09),.014));
      ink=max(ink,runeLine(p,vec2(-.16,-.78),vec2(.16,-.78),.015));
    } else if(style<1.5) {
      ink=runeStroke(r-.89,.014)*step(.38,abs(a+1.57079633));
      // An open crescent, deliberately different from the entry chevrons.
      ink=max(ink,runeStroke(r-.40,.024)*smoothstep(.34,.38,length(p-vec2(.20,.10))));
      ink=max(ink,runeStroke(length(p-vec2(-.12,.59))-.025,.012));
    } else if(style<2.5) {
      ink=runeStroke(r-.88,.035)*step(.10,fract(turn*12.0));
      ink=max(ink,runeStroke(r-.72,.012));
      ink=max(ink,runeStroke(abs(p.x)+abs(p.y)-.43,.023));
      ink=max(ink,runeLine(p,vec2(-.22,0.0),vec2(.22,0.0),.018));
      ink=max(ink,runeLine(p,vec2(0.0,-.22),vec2(0.0,.22),.018));
    } else if(style<3.5) {
      ink=runeStroke(r-.89,.012);
      // Fine abstract script, with a small central contract seal.
      float script=runeStroke(r-.72,.008)*step(.35,fract(turn*24.0));
      script=max(script,step(.82,cos(a*24.0))*step(.67,r)*step(r,.77)*.7);
      ink=max(ink,script);
      ink=max(ink,runeStroke(abs(p.x)+abs(p.y)-.26,.014));
      ink=max(ink,runeLine(p,vec2(-.13,0.0),vec2(.13,0.0),.012));
      ink=max(ink,runeLine(p,vec2(0.0,-.37),vec2(0.0,.37),.010));
    } else if(style<4.5) {
      ink=runeStroke(r-.89,.016);
      ink=max(ink,runeStroke(r-.30,.022));
      ink=max(ink,runeStroke(max(abs(p.x),abs(p.y))-.085,.014));
      // Two oval links beside the coin.
      vec2 q=vec2(abs(p.x)-.47,p.y);
      ink=max(ink,runeStroke(length(q/vec2(.18,.11))-1.0,.10)*.75);
    } else if(style<5.5) {
      ink=runeStroke(r-.89,.016)*step(.10,fract(turn*8.0));
      vec2 q=vec2(abs(p.x),p.y);
      ink=max(ink,runeLine(q,vec2(0.0,.35),vec2(.29,.25),.016));
      ink=max(ink,runeLine(q,vec2(.29,.25),vec2(.24,-.16),.016));
      ink=max(ink,runeLine(q,vec2(.24,-.16),vec2(0.0,-.37),.016));
      ink=max(ink,runeLine(q,vec2(0.0,-.02),vec2(.12,.09),.012));
      ink=max(ink,runeLine(q,vec2(0.0,-.17),vec2(.12,-.06),.012));
    } else {
      // A quiet three-part clan crest; no surrounding action seal.
      ink=runeStroke(r-.40,.012);
      for(int i=0;i<3;i++) {
        float angle=float(i)*2.0943951;
        vec2 center=vec2(cos(angle),sin(angle))*.19;
        ink=max(ink,runeStroke(length(p-center)-.075,.021));
      }
    }
    return vec2(ink,outer);
  }
`;
