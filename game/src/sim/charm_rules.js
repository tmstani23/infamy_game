export function charmProtected(attacker,target,state){
  const charm=target?.distracted;
  if(!attacker||!charm?.source||charm.until<=state.tick)return false;
  const clan=charm.clan||state.entities[charm.source]?.owner;
  if(attacker.owner!==clan)return false;
  const order=attacker.charmAttack;
  return !(order?.target===target.id&&order.source===charm.source&&order.at===charm.at);
}
// Only accepted direct attack commands grant an exception, scoped to this charm.
export function allowCharmAttack(attacker,target,state){
  delete attacker.charmAttack;
  if(charmProtected(attacker,target,state))attacker.charmAttack={target:target.id,source:target.distracted.source,at:target.distracted.at};
}
