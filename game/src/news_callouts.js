// News callouts each sim tick: the big moments in state.news shown to this player (moved out of main.js,
// phase 7 split, 2026-10-29). Reads the state only; never sends commands.
import { sweepArrivalVisible } from './render/sweep_trail.js';
export function createNewsCallouts({ game, heroId, $, TICK_RATE, callout: calloutRaw, contractCallout: contractRaw, minimap: mini, gameMap: bigMap, view, presentation, showResults, townAlert = () => {}, warAlert = () => {} }) {
  // Out on the island (Tim 2026-11-06) the lieutenant has the city: city alerts stay quiet, only major capital
  // losses show, marked "Capital:", plus one warning when the clan falls below half the businesses it held on leaving
  const AWAY_OK = new Set(['town', 'shipSunk', 'shipCaptured', 'boardWashed', 'worldCampCleared', 'renown', 'leaderBounty', 'unstuck', 'seasonEnd', 'hallChannel', 'hallChannelReset', 'hallChannelStop', 'warEnded', 'warSurrender', 'warOffer', 'warAnswer', 'warNoTerms', 'buildSiteTip', 'supplyLineTip', 'campMoved']);
  let hallResetAt = -1e9;   // "starts over" shows at most once every 3 s while he is being hit
  const major = (n, me) => (n.kind === 'raidWon' && n.defender === me) || (n.kind === 'quarterLost' && n.clan === me) || (n.kind === 'hqSuppressed' && n.defender === me);
  let prefix = '', quiet = false, heldOnLeaving = null, warned = false;
  const callout = (t, k, ms) => calloutRaw(prefix + t, k, ms), contractCallout = (t, k) => contractRaw(prefix + t, k);
  const minimap = { ping: (...a) => { if (!quiet) mini.ping(...a); } }, gameMap = { ping: (...a) => { if (!quiet) bigMap.ping(...a); } };
  const shinobiAlert = text => callout(text, 'loss shinobi-alert', 8000);
  const held = me => Object.values(game.state.businesses).filter(b => b.owner === me && !b.hideout).length;
  function update() {
    const hero = game.state.entities[heroId], away = hero?.place === 'world', mine = hero?.owner;
    if (away && heldOnLeaving === null) { heldOnLeaving = held(mine); warned = false; }
    if (!away) heldOnLeaving = null;
    if (away && !warned && heldOnLeaving >= 2 && held(mine) < Math.ceil(heldOnLeaving / 2)) {
      warned = true; calloutRaw(`Capital: you're losing the city (${held(mine)} of ${heldOnLeaving} businesses left)`, 'loss', 7000);
    }
    for (const n of game.state.news) {
      const me = game.state.entities[heroId]?.owner, boss = game.state.clans[n.clan]?.name || 'Rival clan';
      const big = away && major(n, me);
      if (away && !big && !AWAY_OK.has(n.kind)) continue;
      prefix = big ? 'Capital: ' : ''; quiet = away;
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
      if (n.kind === 'town' && n.clan === me) townAlert(n);
      if (n.kind === 'campMoved' && n.clan === me) callout(n.text, 'win', 6000);   // Move extras: what became of the workers (workers.js campExtras)
      if (n.kind === 'supplyLineTip' && n.clan === me) callout(`The camp attacking ${n.townName || 'your town'} is linked by rail. Its camp station and the red track beside it are its supply line: break them to cut the camp off`, 'win', 8000);   // once per clan (rail.js makeSections)
      if (n.kind === 'buildSiteTip' && n.clan === me) callout(`${n.townName || 'Your town'} is building. Select workers and right-click the site to build it faster`, 'win', 7000);   // once per clan (construction.js)   // frontier town alerts (sim/frontier/alerts.js, F4.4c)
      // war 8a (sim/frontier/war_end.js): a hall being taken, and how a war ended. Both sides hear of a channel; its start pings the map.
      if (n.kind === 'hallChannel' || n.kind === 'hallChannelStop' || n.kind === 'hallChannelReset') {
        const w = game.state.frontier?.wars?.list?.[n.war], foe = w && n.clan !== me && (w.attacker === me || w.defender === me);
        const hall = n.side === 'town' ? 'town hall' : 'war camp hall', secs = Math.round(game.frontier?.warEnd?.rules().channel.seconds ?? 60);
        if (n.kind === 'hallChannel' && n.clan === me) callout(`Taking the ${hall}: hold for ${secs} s. A hit starts it over`, 'win', 5000);
        if (n.kind === 'hallChannel' && foe) { callout(`${boss} is taking your ${hall}! Hit their hero to stop it`, 'loss', 8000); mini.ping(n.x, n.z); bigMap.ping(n.x, n.z); }
        if (n.kind === 'hallChannelReset' && n.clan === me && game.state.tick - hallResetAt > 60) { hallResetAt = game.state.tick; callout('You were hit: taking the hall starts over', 'loss', 2500); }
        if (n.kind === 'hallChannelStop' && n.clan === me && n.why !== 'stopped') callout('Taking the hall broke off', 'loss', 3000);
        if (n.kind === 'hallChannelStop' && foe) callout(`Their hero stopped taking your ${hall}`, 'win', 4000);
      }
      // war 8c (sim/frontier/war_terms.js): a surrender, its offers and answers; the terms window opens by itself (war_terms_panel.js)
      if (n.kind === 'warSurrender' && (n.attacker === me || n.defender === me)) {
        const mineS = n.clan === me, town = n.townName || 'the town';
        callout(mineS ? `You surrendered at ${town}: a ceasefire is on, offer your terms` : `${boss} surrender at ${town}! A ceasefire is on: wait for their terms`, mineS ? 'loss' : 'win', 7000);
        mini.ping(n.x, n.z); bigMap.ping(n.x, n.z); warAlert();
      }
      if (n.kind === 'warOffer' && n.to === me) { callout(`${boss} offer ${n.amount} ryo to end the war`, 'win', 7000); warAlert(); }
      if (n.kind === 'warAnswer' && n.to === me) { callout(n.answer === 'accept' ? `${boss} accepted ${n.amount} ryo: the war is over` : n.answer === 'no' ? `${boss} said no to ${n.amount} ryo: offer again or leave` : `${boss} refused your terms for good`, n.answer === 'accept' ? 'win' : 'loss', 7000); warAlert(); }
      if (n.kind === 'warNoTerms' && n.to === me) { callout(`${n.townName || 'The town'} is yours to take: choose capture, sack or burn`, 'win', 8000); mini.ping(n.x, n.z); bigMap.ping(n.x, n.z); }
      if (n.kind === 'warEnded') {
        const clanName = id => game.state.clans[id]?.name || 'A rival clan', town = n.townName || 'the town', defWins = n.result === 'campFell' || n.result === 'attackerSurrendered', party = n.attacker === me || n.defender === me,
          won = n.result === 'ransomed' ? n.by === me : defWins ? n.defender === me : n.attacker === me, lost = n.result === 'ransomed' ? party && n.by !== me : defWins ? n.attacker === me : n.defender === me;
        const text = n.result === 'fell' ? (won ? `${town} has fallen: ${clanName(n.defender)} is out` : lost ? `${town} has fallen to ${clanName(n.attacker)}` : `${clanName(n.attacker)} took ${town}: ${clanName(n.defender)} is out`)   // Z6: a castle
          : n.result === 'captured' ? (won ? `${town} is yours! War chest returned: ${n.chest} ryo` : lost ? `${town} was captured by ${clanName(n.attacker)}` : `${clanName(n.attacker)} captured ${town}`)
          : n.result === 'sacked' ? (won ? `${town} sacked: ${n.ryo || 0} ryo taken` : lost ? `${town} was sacked: ${n.ryo || 0} ryo lost` : `${clanName(n.attacker)} sacked ${town}`)
          : n.result === 'burned' ? (won ? `${town} burned to the ground` : lost ? `${town} was burned to the ground by ${clanName(n.attacker)}` : `${clanName(n.attacker)} burned ${town} to the ground`)
          : n.result === 'ransomed' ? (n.by === me ? `Ransom taken: the war on ${town} is over` : (n.attacker === me || n.defender === me) ? `Ransom paid: the war on ${town} is over` : `The war on ${town} ended with a ransom`)
          : n.result === 'attackerSurrendered' ? (n.defender === me ? `${clanName(n.attacker)} gave up the war on ${town}${n.chest ? `: ${n.chest} ryo of their war chest is yours` : ''}` : n.attacker === me ? `You gave up the war on ${town}: your war chest is lost` : `${clanName(n.attacker)} gave up the war on ${town}`)
          : n.result === 'campFell' ? (won ? `Their war camp fell! ${town} is safe${n.chest || n.stock ? ` and ${[n.chest ? `${n.chest} ryo of their war chest` : '', n.stock?.timber ? `${n.stock.timber} timber` : '', n.stock?.stone ? `${n.stock.stone} stone` : ''].filter(Boolean).join(', ')} ${n.chest || (n.stock?.timber && n.stock?.stone) ? 'are' : 'is'} yours` : ''}` : lost ? `Your war camp fell: the war on ${town} is lost` : `${clanName(n.defender)} broke the siege of ${town}`) : '';
        if (text) callout(text, won ? 'win' : lost ? 'loss' : 'news', 8000);
      }
      if (n.kind === 'townClaimed') callout(n.clan === me ? `${game.state.frontier?.settlements?.[n.town]?.name || 'The town'} is yours` : `${game.state.clans[n.clan]?.name || 'A rival clan'} claimed ${game.state.frontier?.settlements?.[n.town]?.name || 'an empty town'}`, n.clan === me ? 'win' : 'news', 6000);   // Z6d
      if (n.kind === 'townDecayed') callout(`${n.name || 'An empty town'} has crumbled to nothing`, 'news', 5000);
      if (n.kind === 'worldCampCleared' && n.clan === me) callout(`Bandit camp no. ${parseInt(String(n.camp).replace(/\D+/g,''),10)||n.camp} cleared · +${n.ryo} ryo${n.first ? ' · first clear' : ''}`, 'win');
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
      if (n.kind === 'shipCaptured') {   // ships S8: boarded and taken
        const what = n.unit === 'transport' ? 'transport' : 'warship';
        if (n.clan === me) callout(`Enemy ${what} captured`, 'win', 5000);
        else if (n.from === me) { callout(`Your ${what} was taken by boarders`, 'loss', 6000); mini.ping(n.x, n.z); bigMap.ping(n.x, n.z); }
      }
      if (n.kind === 'boardWashed' && n.clan === me && n.hero) { callout('You fell in the boarding fight and washed ashore', 'loss', 6000); if (n.ashore) view.panTo?.(n.x, n.z, n.ashore.x, n.ashore.z); }
      if (n.kind === 'shipSunk') {   // ships S4
        const what = n.unit === 'transport' ? 'transport' : 'warship';
        if (n.clan === me) { callout(n.hero ? `Your ${what} sank: you wash ashore` : `Your ${what} sank${n.lost ? `, ${n.lost} troops lost` : ''}`, 'loss', 6000); if (!n.hero) { mini.ping(n.x, n.z); bigMap.ping(n.x, n.z); } else if (n.ashore) view.panTo?.(n.x, n.z, n.ashore.x, n.ashore.z); }
        else if (n.by === me) callout(`Enemy ${what} sunk`, 'win', 4000);
      }
      if (n.kind === 'bossDown' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss knocked out!`, n.by === me ? 'win' : 'news');
      if (n.kind === 'bossArrested' && n.clan !== me && game.vision.canSee(me, game.state.entities[n.hero])) callout(`${boss} boss arrested!`, 'news');
      if (n.kind === 'lanternDown' && n.defender === me) callout('War Lantern destroyed!', 'win');
      if (n.kind === 'lanternDown' && n.raider === me) callout('Your War Lantern was destroyed', 'loss');
      if (n.kind === 'doorsOpen' && n.raider === me) callout(game.state.entities[heroId]?.place === 'world' ? 'Your captain\'s raid: the doors are open' : 'The doors are open: get inside!', 'news');
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
      if (n.kind === 'stealAlert' && n.clan === me) { shinobiAlert(`SHINOBI INSIDE YOUR ${(n.place || 'BUSINESS').toUpperCase()} · Stop the theft`); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'markAlert' && n.clan === me) { shinobiAlert(`SHINOBI MARK IN YOUR ${(game.state.businesses[n.business]?.kind || 'BUSINESS').replace(/_/g, ' ').toUpperCase()} · Interrupt the sabotage`); minimap.ping(n.x, n.z); gameMap.ping(n.x, n.z); }
      if (n.kind === 'sabotaged' && n.clan === me) contractCallout('Sabotaged: a business paid nothing at dawn', 'loss');
    }
  }
  return { update };
}
