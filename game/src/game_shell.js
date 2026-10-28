// Keep native browser selection/drag/context UI off gameplay surfaces while
// retaining normal editing inside form fields.
export function bindGameShell(doc=document){
 const editable=e=>e.target?.closest?.('input,textarea,[contenteditable="true"]');
 for(const type of ['contextmenu','selectstart','dragstart'])doc.addEventListener(type,e=>{if(!editable(e))e.preventDefault();},{capture:true});
}
