// Presentation-only paging for growing UI lists. No hidden records or selection are removed.
export function createLayoutPages(root,id){
 const selectors={partyframes:'.crew .mate',controls:'.cols > section',characterpage:'.character-stats > div',hire:'.row',clinic:'.row',police:'.row',contracts:'.row'};
 const selector=selectors[id];if(!selector)return null;
 const nav=document.createElement('nav');nav.className='layout-pages';nav.setAttribute('aria-label','Panel pages');
 const previous=document.createElement('button'),label=document.createElement('span'),next=document.createElement('button');
 previous.type=next.type='button';previous.textContent='‹ Previous';next.textContent='Next ›';
 nav.append(previous,label,next);root.appendChild(nav);
 let page=0,size=1,items=[],oldWidth=-1,oldHeight=-1;
 function paint(){
  const pages=Math.max(1,Math.ceil(items.length/size));page=Math.max(0,Math.min(page,pages-1));
  items.forEach((item,i)=>item.classList.toggle('layout-page-hidden',Math.floor(i/size)!==page));
  nav.hidden=pages===1;label.textContent=`${page+1} / ${pages}`;previous.disabled=page===0;next.disabled=page===pages-1;
 }
 previous.addEventListener('click',()=>{page--;paint();});next.addEventListener('click',()=>{page++;paint();});
 return {update(width,height){
  if(!width)return;
  const current=[...root.querySelectorAll(selector)];
  if(width===oldWidth&&height===oldHeight&&current.length===items.length&&current.every((e,i)=>e===items[i]))return;
  const cols=Math.max(1,Math.floor((width-20)/104));
  size=id==='partyframes'?Math.max(1,cols*Math.max(1,Math.floor((height-135)/120))):id==='controls'?1:Math.max(1,Math.floor((height-150)/70));
  oldWidth=width;oldHeight=height;items=current;paint();
 }};
}
