// Only copy information during a legitimate sighting. Hidden movement, health,
// buffs and room changes never update the remembered character frame.
export function createTargetMemory() {
  let current=null,snapshot=null;
  return {
    read(id,entity,visible,tick) {
      if(id!==current){current=id;snapshot=null;}
      if(!id)return null;
      if(entity&&visible){
        const {id,type,civ,model,name,owner,hp,maxHp,x,z,place,downed}=entity;
        snapshot={entity:{id,type,civ,model,name,owner,hp,maxHp,x,z,place,downed,buffs:{}},at:tick};
        return {entity,visible:true,at:tick};
      }
      return snapshot?{...snapshot,visible:false}:null;
    },
  };
}
