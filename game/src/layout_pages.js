// Presentation-only paging for growing UI lists. No hidden records or selection are removed.
export function createLayoutPages(root,id){
 const selectors={partyframes:'.crew .mate',controls:'.cols > section',characterpage:'.character-stats > div',hire:'.row',clinic:'.row',police:'.row',contracts:'.row'};
 const selector=selectors[id];if(!selector)return null;
 const nav=document.createElement('nav');nav.className='layout-pages';nav.setAttribute('aria-label','Panel pages');
 const previous=document.createElement('button'),label=document.createElement('span'),next=document.createElement('button');
 previous.type=next.type='button';previous.textContent='‹ Previous';next.textContent='Next ›';
 nav.append(previous,label,next);root.appendChild(nav);
 let page=0,size=1,items=[],oldWidth=-1,oldHeight=-1,crewPages=[],oldGroups=[],oldCardHeight=0;
 const measured=new WeakMap();
 function paint(){
  const pages=Math.max(1,id==='partyframes'?(crewPages.at(-1)||0)+1:Math.ceil(items.length/size));page=Math.max(0,Math.min(page,pages-1));
  items.forEach((item,i)=>item.classList.toggle('layout-page-hidden',(id==='partyframes'?crewPages[i]:Math.floor(i/size))!==page));
  nav.hidden=pages===1;label.textContent=`${page+1} / ${pages}`;previous.disabled=page===0;next.disabled=page===pages-1;
 }
 previous.addEventListener('click',()=>{page--;paint();});next.addEventListener('click',()=>{page++;paint();});
 return {update(width,height){
  if(!width)return;
  const current=[...root.querySelectorAll(selector)];
  const groups=current.map(e=>e.parentElement||e.parent||root);
  const cardHeight=Math.max(44,...current.map(e=>{if(e.offsetHeight)measured.set(e,e.offsetHeight);return measured.get(e)||0;}))+4;
  if(width===oldWidth&&height===oldHeight&&cardHeight===oldCardHeight&&current.length===items.length&&current.every((e,i)=>e===items[i]&&groups[i]===oldGroups[i]))return;
  const cols=Math.max(1,Math.floor((width-20)/104));
  size=id==='controls'?1:Math.max(1,Math.floor((height-150)/70));
  if(id==='partyframes'){
   // Match the grouped roster grid: each section wraps its own cards, and a
   // grid row consumes the tallest section's height rather than one row per card.
   const maxSectionCols=Math.max(1,Math.floor((width-14)/226));
   const available=Math.max(cardHeight+42,height-100);
   let groups=new Map(),p=0;crewPages=[];
   const used=groups=>{const sectionCols=Math.min(maxSectionCols,groups.size),sectionWidth=(width-20-(sectionCols-1)*6)/sectionCols,cardCols=Math.max(1,Math.floor((sectionWidth-6)/100));
    const blocks=[...groups.values()].map(n=>36+Math.ceil(n/cardCols)*cardHeight);let total=0;
    for(let i=0;i<blocks.length;i+=sectionCols)total+=Math.max(...blocks.slice(i,i+sectionCols))+6;return total;};
   current.forEach((item,i)=>{const group=item.parentElement||item.parent||root,next=new Map(groups);next.set(group,(next.get(group)||0)+1);
    if(groups.size&&used(next)>available){p++;groups=new Map([[group,1]]);}else groups=next;crewPages[i]=p;});
  }
  oldWidth=width;oldHeight=height;oldGroups=groups;oldCardHeight=cardHeight;items=current;paint();
 }};
}
