// New tank bodies use their own Mixamo rigs; shared clips are retargeted at export.
export const TANK_SPRITES = {
 koruda_enforcer: {
  item:{proc:'kusarigama',mode:'right',length:1,grip:.2,palmOffset:.075,shield:'long',tank:'kusarigama'},
  clips:{idle:'Great Sword Idle.fbx',walk:'brawler/Walking.fbx',run:'Run.fbx',attack:'Great Sword Slash.fbx',taunt:'Yelling Out.fbx',death:'Two Handed Sword Death.fbx',hit:'Reaction.fbx'}
 },
 shinobi_enforcer: {
  item:{proc:'tonfa',mode:'right',length:1,palmOffset:.075,tank:'tonfa'},
  clips:{idle:'ninja/Fighting Idle.fbx',walk:'ninja/Sneak Walk.fbx',run:'ninja/Fast Run.fbx',attack:'ninja/Sword And Shield Slash.fbx',attack2:'ninja/Sword And Shield Slash 2.fbx',taunt:'Yelling Out.fbx',death:'ninja/Standing Death Forward 02.fbx',hit:'ninja/Hit Reaction.fbx',dodge:'ninja/Stand To Roll.fbx'}
 }
};
