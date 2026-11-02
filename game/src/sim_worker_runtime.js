import {createGame,TICK_RATE} from './sim/game.js';
import {setupMatch} from './sim/setup_match.js';
import {makeBots,makeSave,loadSave,heroOf} from './sim/save.js';
import {createFixedStepClock} from './fixed_step_clock.js';
import {createSnapshotEncoder,EVENT_KEYS} from './sim_snapshot.js';

// One authoritative match for its whole lifetime. Opening/closing the map only
// changes publication; no handoff of private simulation state is necessary.
export function createWorkerRuntime({post,now=()=>performance.now()}) {
  let game,bots,encoder,clock,last,options,paused=true,map=false,selected=[],inFlight=0,lastPublish=-Infinity,lastPublishedTick=-1;
  let commands=[],movement=null,movementAt=-Infinity,events={},urgent=false;
  const diagnostics={packets:0,encodeMs:0,simMs:0,maxSimMs:0,eventOverflows:0};
  function collect(){
    for(const key of EVENT_KEYS){
      // World particles aren't consumed in map mode. Gameplay alerts still are.
      if(map&&['hits','dodges','casts'].includes(key))continue;
      const list=events[key]||=([]);list.push(...(game.state[key]||[]));
      if(list.length>1024){diagnostics.eventOverflows+=list.length-1024;list.splice(0,list.length-1024);}
    }
  }
  function publish(force=false){
    // A single unacknowledged packet bounds the message queue, even with a busy UI.
    // World view: one packet per new tick, so the main thread interpolates exactly one 50 ms step
    // (a 50 ms wall-clock gate against a 10 ms pump made packets carry 0 or 2 ticks: hero stutter).
    if(inFlight||!game||!force&&!urgent&&map&&now()-lastPublish<250)return;
    if(!force&&!urgent&&game.state.tick===lastPublishedTick&&!Object.values(events).some(list=>list.length))return;
    const start=now(),packet=encoder.encode({map,selected,events});events={};urgent=false;
    diagnostics.encodeMs+=now()-start;diagnostics.packets++;
    lastPublish=now();lastPublishedTick=game.state.tick;inFlight=packet.sequence;
    post({type:'snapshot',packet,diagnostics:{...diagnostics,changedRecords:packet.set.length,
      recordChars:packet.recordChars,gridBytes:packet.grid.byteLength,mode:map?'map':'world',clock:clock.diagnostics()}},[packet.grid.buffer]);
  }
  function pump(){
    if(!game)return;
    const time=now(),elapsed=(time-last)/1000;last=time;
    clock.advance(elapsed,()=>{
      const start=now(),batch=commands;commands=[];
      const intent=movement&&now()-movementAt>250?{...movement,right:0,down:0}:movement;
      game.step([...(intent?[intent]:[]),...batch,...bots.flatMap(b=>b.tick())]);
      diagnostics.simMs+=now()-start;diagnostics.maxSimMs=Math.max(diagnostics.maxSimMs,now()-start);
      collect();if(batch.length)urgent=true;
    },paused);
    publish();
  }
  function receive(m){
    if(m.type==='init'){
      if(game)throw new Error('Match already initialized');
      options=m.options;game=createGame(options);
      // A saved game (frontier F1) starts from its file instead of a new match setup.
      if(m.save){bots=loadSave(game,m.save);}
      else{
        const match=setupMatch(game,m.match);game.civilians.populate();
        bots=makeBots(game,match.rivals);commands.push(...match.previewCommands);
      }
      encoder=createSnapshotEncoder(game);
      clock=createFixedStepClock({tick:1/TICK_RATE});last=now();
      post({type:'ready',heroId:heroOf(game)});publish(true);
    }else if(m.type==='save'){
      // Between ticks, so a save is always a whole tick.
      post({type:'save',request:m.request,save:makeSave(game,{bots})});
    }else if(m.type==='load'){
      // Swap in the saved match: a fresh game, its bots, and a full snapshot for the screen.
      const next=createGame(options),nextBots=loadSave(next,m.save);
      game=next;bots=nextBots;encoder=createSnapshotEncoder(game);
      commands=[];movement=null;events={};inFlight=0;lastPublishedTick=-1;urgent=true;last=now();
      post({type:'loaded',request:m.request,heroId:heroOf(game)});publish(true);
    }else if(m.type==='ack'){
      if(m.sequence===inFlight)inFlight=0;
    }else if(m.type==='input'){
      if(m.commands?.length)commands.push(...m.commands);
      if(m.movement){movement=m.movement;movementAt=now();}
      paused=!!m.paused;
      if(map!==!!m.map){map=!!m.map;urgent=true;}
      const next=m.selected||[];
      if(next.join(',')!==selected.join(',')){selected=next;urgent=true;}
      // Commands are processed even when paused, on resume, in original order.
      publish();
    }
  }
  return {receive,pump,get game(){return game;},get diagnostics(){return {...diagnostics,inFlight};}};
}
