// News callouts each sim tick: the big moments in state.news shown to this player (moved out of main.js,
// phase 7 split, 2026-10-29). Reads the state only; never sends commands.
import { sweepArrivalVisible } from './render/sweep_trail.js';
export function createNewsCallouts({ game, heroId, $, TICK_RATE, callout, contractCallout, minimap, gameMap, view, presentation, showResults }) {
  const shinobiAlert = text => callout(text, 'loss shinobi-alert', 8000);
  function update() {
    for (const n of game.state.news) {
      const me = game.state.entities[heroId]?.owner, boss = game.state.clans[n.clan]?.name || 'Rival clan';
      if(n.kind==='sweepArrival'&&sweepArrivalVisible(n,game.state,me,(clan,e)=>game.vision.canSee(clan,e))){
        const zone=game.state.deployment.sectors.find(s=>s.id===n.sector)?.name||n.sector;
        callout(`${n.clan===me?'SWEEP IN POSITION':'ENEMY SWEEP IN POSITION'} · ${zone} · ${n.point}/3 · hold 20 s`,n.clan===me?'win':'loss',5000);
        minimap.ping(n.x,n.z);gameMap.ping(n.x,n.z);
      }
      if(['sweepAlert','sweepPoint','sweepSuccess'].includes(n.kind)&&(n.clan===me||n.defender===me||n.rival===me)){
        const yours=n.clan===me,zone=game.state.deployment.sectors.find(s=>s.id===n.sector)?.name||n.sector;
        const reward=n.ryo>0?`+${n.ryo} ryo`:'No additional ryo';
        const scattered=n.scattered||0;
        const text=n.kind==='sweepSuccess'?(yours
          ?`SWEEP VICTORY · ${zone} · 3/3 secured\n${reward} · ${scattered} rival crew scattered to HQ · returning to duty`
          :`ENEMY SWEEP COMPLETE · ${zone}\n${scattered} of your crew scattered to HQ`)
          :n.kind==='sweepPoint'?`SWEEP · ${zone} · moving to position ${n.point}/3`:`${yours?'SWEEP DISPATCHED':'ENEMY SWEEP'} · ${zone} · three positions to hold`;
        callout(text,(yours?'win':'loss')+(n.kind==='sweepSuccess'?' sweep-complete':''),n.kind==='sweepSuccess'?8000:5000);
        // Arrival pings above use current sight, never a rival's unrevealed next destination.
      }
      if(n.kind==='shakedownAlert'&&n.defender===me){callout(`Shakedown at your ${n.name}! Defend the front room!`,'loss',4000);minimap.ping(n.x,n.z);gameMap.ping(n.x,n.z);}
      if(n.kind==='shakedownSuccess'&&n.clan===me)callout(`SHAKEN DOWN · +${n.bonus} ryo · 50% next payout claimed`,'win',4000);
      if(n.kind==='shakedownSuccess'&&n.defender===me)callout('Shaken down! Half the next business payout claimed by Yakuza','loss',4000);
      if(n.kind==='shakedownPaid'&&n.clan===me)callout(`Shakedown paid: +${n.ryo} ryo`,'win');
      if (n.kind === 'renown' && n.clan === me && n.amount > 0) callout(`${n.reason || 'Renown earned'} · +${n.amount} Renown`, 'win');
      if (n.kind === 'leaderBounty' && n.clan === me) callout(`${n.reason} · +${n.amount} ryo`, 'win');
      if (n.kind === 'unstuck' && n.clan === me) { console.info('[stuck spot]', n.place, n.x.toFixed(1), n.z.toFixed(1)); callout('Back inside your HQ', 'win'); }
      if (n.kind === 'businessAttack' && n.clan === me) callout(`Your ${n.name} is under attack!`, 'loss');
      if (n.kind === 'hqSuppressed' && n.defender === me) callout(`HQ on fire! Contracts cancelled · reopen in ${Math.max(0, Math.ceil((n.suppressedUntil - game.state.tick) / TICK_RATE))} s`, 'loss');
      if (n.kind === 'hqSuppressed' && n.raider === me) callout(`Shinobi HQ defeated! +${n.points} points · +${n.bounty + n.stolen} ryo`, 'win');
      if (n.kind === 'raidWon') {   // every clan sees it (Tim 2026-10-26)
        const clanName = id => id === me ? 'Your clan' : game.state.clans[id]?.name || 'A rival clan';
        const whose = n.defender === me ? 'your' : `${game.state.clans[n.defender]?.name || 'a rival clan'}'s`;
        callout(`${clanName(n.raider)} successfully raided ${whose} ${n.hq ? 'HQ' : n.name.replace(/^The /, '')}!`, n.raider === me ? 'win' : n.defender === me ? 'loss' : 'news');
      }
      if (n.kind === 'hqRecovered' && n.clan === me) callout('HQ fire extinguished · contracts available · HQ protected for a full day/night cycle', 'news');
      if (n.kind === 'bossDown' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss knocked out!`, n.by === me ? 'win' : 'news');
      if (n.kind === 'bossArrested' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss arrested!`, 'news');
      if (n.kind === 'lanternDown' && n.defender === me) callout('War Lantern destroyed!', 'win');
      if (n.kind === 'lanternDown' && n.raider === me) callout('Your War Lantern was destroyed', 'loss');
      if (n.kind === 'doorsOpen' && n.raider === me) callout('The doors are open: get inside!', 'news');
      if (n.kind === 'backRoom' && n.state === 'taking' && n.defender === me) callout('Your back room is being taken!', 'loss');
      if (n.kind === 'backRoom' && n.state === 'contested' && (n.defender === me || n.raider === me)) callout('Back room contested!', 'news');
      if (!presentation.map && n.kind === 'crewOut' && n.clan === me) view.flashBuilding(n.building);   // your crew stepping out
      // territory (sim/territory.js): rivals walking into your streets, quarters held whole, the season's end
      if (n.kind === 'intruder' && n.clan === me) { callout('Rivals in your territory!', 'loss'); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'sectorContact' && n.clan === me) {
        const name = game.state.deployment.sectors.find(s => s.id === n.sector)?.name || n.sector;
        callout(`${n.priority ? 'Contract target' : 'Enemy'} entered ${name}`, 'loss'); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z);
      }
      if (n.kind === 'diversionWarning' && n.clan === me) { callout('Shinobi diversion nearby — order crew away or interrupt the dancer', 'loss'); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'quarter' && n.clan === me) callout(`You hold the ${n.name.replace(/^The /, '')}!`, 'win');
      if (n.kind === 'quarterLost' && n.clan === me) callout(`You lost the ${n.name.replace(/^The /, '')}`, 'loss');
      if (n.kind === 'quarter' && n.clan !== me && game.territory.quarters.find(q => q.id === n.quarter)?.businesses.every(id => game.vision.grid(me).explored[game.vision.cellOf(game.state.businesses[id].x, game.state.businesses[id].z)] === 1))
        callout(`${game.state.clans[n.clan]?.name || 'A rival'} holds the ${n.name.replace(/^The /, '')}`, 'news');
      if (n.kind === 'seasonEnd') showResults();
      // Shinobi contracts (sim/contracts.js): taken, done, failed; and warnings when one is aimed at you
      if (n.kind === 'contractTaken' && n.clan === me && n.x != null) { minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'contractDone' && n.clan === me) contractCallout(`Contract done: +${n.ryo} ryo, +${n.renown} Renown`, 'win');
      if (n.kind === 'contractFailed' && n.clan === me) contractCallout(`Contract failed: ${n.why}`, 'loss');
      if (n.kind === 'contractFailedOnYou' && n.clan === me) contractCallout(`A Shinobi ${n.contractType} contract against you failed`, 'win');
      if (n.kind === 'contractWarn' && n.clan === me) shinobiAlert('SHINOBI CONTRACT TARGETING YOU · Watch your businesses');
      if (n.kind === 'stealAlert' && n.by === me) contractCallout('Spotted! The alarm is up, keep taking the ryo', 'loss');
      if (n.kind === 'stealAlert' && n.clan === me) { shinobiAlert(`SHINOBI INSIDE YOUR ${n.place || 'BUSINESS'} · Stop the theft`); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'markAlert' && n.clan === me) { shinobiAlert('SHINOBI MARK IN YOUR BACK ROOM · Interrupt the sabotage'); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'sabotaged' && n.clan === me) contractCallout('Sabotaged: a business paid nothing at dawn', 'loss');
    }
  }
  return { update };
}
