// Fence centre-lines shared by physical collision and drawing (local world coordinates).
export function wallSegments(grid,i,cornerCut) {
  const col=i%grid.n,row=Math.floor(i/grid.n),h=grid.cell/2;
  const joins=(dx,dz)=>col+dx>=0 && col+dx<grid.n && row+dz>=0 && row+dz<grid.n && 'wg'.includes(grid.use[(row+dz)*grid.n+col+dx]);
  const w=joins(-1,0),e=joins(1,0),n=joins(0,-1),s=joins(0,1),x=w||e,z=n||s;
  if(!x || !z)return x || !z ? [[[-h,0],[h,0]]] : [[[0,-h],[0,h]]];
  if(Number(w)+Number(e)+Number(n)+Number(s)===2) {
    const sx=w?-1:1,sz=n?-1:1,b=grid.cell*cornerCut;
    return [[[sx*h,0],[sx*b,0]],[[sx*b,0],[0,sz*b]],[[0,sz*b],[0,sz*h]]];
  }
  return [[[w?-h:0,0],[e?h:0,0]],[[0,n?-h:0],[0,s?h:0]]];
}
