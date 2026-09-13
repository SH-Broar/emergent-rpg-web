/**
 * Bounded, deterministic story play simulation. Uses real quest/gesture/combat APIs.
 * Initial loadout and player arrivals are controlled; only the requested living party is staged at the final fight.
 * One exceptional scenario kills an NPC with actual player strikes after the final quest is accepted.
 * No completed quest, decision, reading, victory, ally, or ending is assigned by this harness.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const saved = new Map(), prior = { window: globalThis.window, storage: globalThis.localStorage, fetch: globalThis.fetch };
globalThis.window = { setTimeout: () => 0 };
globalThis.localStorage = { getItem: k => saved.get(k) ?? null, setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) };
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const artifact = 'time-story-quality-20260913-retreat';
mkdirSync(join(root,'scratch'),{recursive:true});
const report = { revision: '2026-09-13 parallel investigations, physical local reporting, explicit testimony, protected ally retreat and ordinary NPC death recovery', method: 'Vite SSR + Pinia, actual services, gestures and combat turns; controlled starting loadout, player arrivals and optional final-battle arrival of living recruited allies; one deliberate NPC death uses actual strikes', scenarios: [], errors: [] };
try {
  setActivePinia(createPinia());
  const mod = p => server.ssrLoadModule('/src/' + p);
  const { useRunStore } = await mod('stores/run.ts'), { useDataStore } = await mod('stores/data.ts'), { useMetaStore } = await mod('stores/meta.ts');
  const { loadAllData } = await mod('data/loader.ts');
  globalThis.fetch = async url => new Response(readFileSync(join(root, 'public', String(url).replace(/^\//, '')), 'utf8'));
  const data = useDataStore(); data.data = await loadAllData('/');
  const timeline = [...data.timelines.values()].find(t => data.nodeMaps.get(t.nodeMapId)?.nodes.some(n => n.id === 'n-iluneon-square'));
  const field = await mod('systems/field-simulation.ts'), generation = await mod('systems/field-generation.ts');
  const journey = await mod('systems/field-journey.ts'), combat = await mod('systems/field-combat.ts');
  const selection = await mod('systems/field-selection.ts'),engine=await mod('systems/world/engine.ts');
  const skills = await mod('systems/field-skills.ts'), spatial = await mod('systems/world/spatial.ts');
  const supplies = await mod('systems/field-supplies.ts'), geo = await mod('systems/field-geography.ts');
  const { instantiateCard } = await mod('systems/deck.ts'), random = await mod('systems/rng.ts');
  const { endingPresentation } = await mod('data/time-endings.ts');
  const { JOURNEY_QUESTS } = await mod('data/journey-quests.ts'), { FIELD_RECORDS } = await mod('data/field-records.ts');
  const run = useRunStore(), meta = useMetaStore();
  const map = data.nodeMaps.get(timeline.nodeMapId), main = JOURNEY_QUESTS.filter(q => q.main && q.id.startsWith('time-'));
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify({ main: main.map(q=>({id:q.id,npc:q.npcId,turnIn:q.turnInNpcId,goals:q.goals})), cards:[...data.cards.values()].filter(c=>!skills.skillUnavailable(c)&&c.targetMode==='aimed').map(c=>({id:c.id,name:c.name,mana:c.magic?.mana??c.cost,damage:skills.skillEffects(c).filter(e=>e.kind==='damage').map(e=>e.value),strokes:skills.skillStrokes(c)})).slice(0,35) },null,2));
  } else {
    if(!process.argv.includes('--combat-probe'))assert.equal(main.length,20,'The authored twenty-quest story must exist before simulation');
    let log;
    const clone = value => JSON.parse(JSON.stringify(value));
    const live = () => field.ensureField(run.data);
    function nodeRoute(from,to) {
      from=from?.split('::')[0];to=to?.split('::')[0];
      if(from===to)return {edges:0,roads:0,nodes:[from]};
      const lookup=new Map(map.nodes.map(n=>[n.id,n])),queue=[{id:from,nodes:[from],roads:0}],seen=new Set([from]);
      for(const item of queue)for(const id of lookup.get(item.id)?.neighbors??[])if(!seen.has(id)){
        seen.add(id);const a=lookup.get(item.id),b=lookup.get(id),next={id,nodes:[...item.nodes,id],roads:item.roads+(a&&b?geo.roadCount(map,a,b):0)};
        if(id===to)return {edges:next.nodes.length-1,roads:next.roads,nodes:next.nodes};
        queue.push(next);
      }
      return {edges:null,roads:null,nodes:[]};
    }
    function walkFirstStreet() {
      const route=nodeRoute(run.data.currentNodeId,'n-iluneon-clocktower'),start=run.data.field.elapsedSeconds;
      assert(route.nodes.length,'Clocktower walking route missing');
      const transitions=[];
      for(const to of route.nodes.slice(1)){
        let previous;
        for(let hops=0;run.data.currentNodeId!==to&&hops<30;hops++){
          const {space}=live(),from=space.id;
          const next=space.road?space.exits.find(e=>e.to!==previous)?.to:geo.fieldConnection(map,map.nodes.find(n=>n.id===space.nodeId),map.nodes.find(n=>n.id===to)).to;
          assert(next,'No forward walking exit');
          for(let step=0;step<100;step++){
            const {world,space:current,player}=live(),exit=current.exits.find(e=>e.to===next);
            assert(exit,'Expected linked exit '+next);
            if(spatial.distance(player.pos,exit.pos)<=1){const result=field.performFieldGesture('tap',undefined,exit.pos);assert(result.ok,result.message);break;}
            const path=spatial.fieldPath(world,current.id,player.pos,exit.pos,'player',true);assert(path?.length,'Blocked actual street path');
            const result=field.stepField(path[0]);assert(result.ok,'Street movement '+result.message);settleEncounter();
          }
          assert.notEqual(run.data.currentNodeId,from,'Did not travel through the street exit');
          transitions.push({from,to:run.data.currentNodeId});previous=from;
        }
        assert.equal(run.data.currentNodeId,to);
      }
      log.streetWalk={transitions,turns:(run.data.field.elapsedSeconds-start)/30};
    }
    function arrive(nodeId,why) {
      const {world,player}=live(),from=player.nodeId;
      if(from!==nodeId)log.arrivals.push({from,to:nodeId,why,...nodeRoute(from,nodeId)});
      run.data.currentNodeId=nodeId;player.nodeId=nodeId;
      const space=generation.ensureFieldSpace(run.data,world,nodeId);
      generation.placeFieldEntity(world,space,player,space.spawn);
      field.ensureField(run.data);
      return {world,player,space};
    }
    function placeNear(actor) {
      const {world,space,player}=live();
      assert.equal(actor.nodeId,space.id);
      const p=spatial.cardinal(actor.pos).find(p=>spatial.walkable(world,space.id,p,'player')&&spatial.hasSight(world,{...player,pos:p},actor));
      assert(p,'No free adjacent position: '+actor.name);
      player.pos={...p};log.localPlacements++;
    }
    function settleEncounter() {
      if(run.data.field.encounter){log.encounters.push(clone(run.data.field.encounter));combat.resolveFieldEncounter(run.data,true);}
    }
    function atNpc(npcId,allowRemains=false) {
      let {world}=live(),actor=Object.values(world.entities).find(e=>e.npcId===npcId);
      assert(actor,'NPC missing: '+npcId);

      if(actor.properties.integrity<=0&&allowRemains){
        arrive(actor.nodeId,'유품 조사 '+actor.name);
        const remains=live().world.entities['quest-remains:'+npcId];
        assert(remains,'Physical remains missing: '+npcId);placeNear(remains);
        assert(selection.fieldTargets(field.visibleFieldEntities(run.data)).some(e=>e.id===remains.id),'Remains are not selectable');
        return remains;
      }
      for(let i=0;run.data.timeStory?.recovering?.[npcId]!==undefined&&i<25;i++){field.advanceFieldTime(30);settleEncounter();log.scheduleWaits++;live();}
      for(let i=0;actor.routine?.travel&&i<150;i++){field.advanceFieldTime(30);settleEncounter();log.scheduleWaits++;}
      assert(!actor.routine?.travel,'NPC still travelling: '+npcId);
      assert(actor.properties.integrity>0,'NPC died: '+npcId);
      arrive(actor.nodeId,'NPC '+actor.name);placeNear(actor);
      return actor;
    }
    function service(npcId,action) {
      const actor=atNpc(npcId,action.startsWith('quest:'));
      if(actor.tags.includes('quest-remains')){const opened=field.performFieldGesture('tap',actor.id,actor.pos);assert(opened.ok);assert(opened.speech?.topics?.some(t=>t.action===action),'Remains topic missing: '+action);}
      const result=field.performFieldService(actor.id,action);
      log.actions.push({action,npc:npcId,ok:result.ok,message:result.message,lines:result.speech?.lines});
      assert(result.ok,action+': '+result.message);
      return result;
    }
    function talk(npcId,goal) {
      const actor=atNpc(npcId,true),result=field.performFieldGesture('tap',actor.id,actor.pos);
      log.actions.push({action:'talk',npc:npcId,ok:result.ok,lines:result.speech?.lines});
      assert(result.ok,'Talk failed: '+npcId+' '+result.message);
      if(goal?.testimony){
        const topic=result.speech?.topics?.find(t=>t.action?.endsWith(':'+goal.testimony));
        assert(topic,'Actual testimony topic missing: '+goal.testimony);placeNear(actor);
        const heard=field.performFieldService(actor.id,topic.action);
        log.actions.push({action:topic.action,npc:npcId,ok:heard.ok,lines:heard.speech?.lines});assert(heard.ok,heard.message);
      }
    }
    function read(id) {
      const definition=FIELD_RECORDS.find(r=>r.id===id);assert(definition,'Unknown reading '+id);
      arrive(definition.nodeId,'단서 '+definition.name);
      const {world}=live(),actor=world.entities['record:'+id];assert(actor,'Record not generated: '+id);
      placeNear(actor);
      let result=field.performFieldGesture('tap',actor.id,actor.pos);
      log.actions.push({action:'inspect',id,ok:result.ok,lines:result.speech?.lines});
      if(!run.data.field.journey.readings?.[id]&&definition.min?.moisture){
        live();placeNear(actor);run.data.field.selectedItem=undefined;
        const watered=field.performFieldGesture('tend',actor.id,actor.pos);
        log.actions.push({action:'water',id,ok:watered.ok,message:watered.message});assert(watered.ok,'Cannot wet '+id);
        placeNear(actor);result=field.performFieldGesture('tap',actor.id,actor.pos);
        log.actions.push({action:'read',id,ok:result.ok,lines:result.speech?.lines});
      }
      assert(run.data.field.journey.readings?.[id],'Reading not retained: '+id+' '+result.message);
    }
    function countGoal(goal) {
      for(let i=0;journey.goalProgress(run.data,goal)<(goal.amount??1)&&i<15;i++){
        const {world,player}=live();
        if(goal.key==='skill'||goal.key.startsWith('skill:')){
          arrive('n-iluneon-guild','연습 말뚝');
          const dummy=Object.values(world.entities).find(e=>e.nodeId==='n-iluneon-guild'&&e.tags.includes('practice'));assert(dummy,'Practice post missing');placeNear(dummy);
          const result=field.performFieldGesture('corner',dummy.id,dummy.pos,{drawn:true,quality:1});
          if(!result.ok)field.advanceFieldTime(30);
        }else if(goal.key==='crafted'||goal.key.startsWith('crafted')){
          const actor=atNpc('npc-echo'),result=supplies.craftSupply(run.data,world,actor.id,'salve');
          assert(result.ok,'Craft failed: '+result.message);field.advanceFieldTime(30);
        }else if(goal.key==='used'||goal.key.startsWith('used')){
          run.data.field.selectedItem='field-wrap';
          const result=field.performFieldGesture('tend','player',player.pos);assert(result.ok,'Use failed: '+result.message);
          run.data.field.selectedItem=undefined;
        }else throw Error('Unsupported actual count goal: '+goal.key);
      }
      assert(journey.goalProgress(run.data,goal)>=(goal.amount??1),'Count failed: '+goal.key);
    }
    function useSupplies() {
      const {world,space,player}=live();
      const hurtAllies=Object.keys(run.data.timeStory?.allies??{}).map(id=>world.entities['npc:'+id]).filter(e=>e&&e.nodeId===player.nodeId&&e.properties.integrity>0&&e.properties.integrity<75).sort((a,b)=>a.properties.integrity-b.properties.integrity);
      for(const ally of hurtAllies){
        if(player.stock['field-salve']<=0)break;
        if(spatial.distance(player.pos,ally.pos)>1){
          const next=spatial.fieldPath(world,space.id,player.pos,ally.pos,'player',true)?.[0];
          if(next&&!space.exits.some(e=>spatial.distance(e.pos,next)===0)&&field.stepField(next).ok){(log.allyCare??=[]).push({target:ally.npcId,action:'approach',hp:ally.properties.integrity});return true;}
        }else{
          run.data.field.selectedItem='field-salve';
          const result=field.performFieldGesture('tend',ally.id,ally.pos);run.data.field.selectedItem=undefined;
          if(result.ok){(log.allyCare??=[]).push({target:ally.npcId,action:'salve',hp:ally.properties.integrity});return true;}
        }
      }
      if(player.properties.integrity<55&&player.stock['field-salve']>0){
        run.data.field.selectedItem='field-salve';
        const result=field.performFieldGesture('tend','player',player.pos);
        run.data.field.selectedItem=undefined;
        return result.ok;
      }
      return false;
    }
    function checkUnacceptedFinalGate() {
      const from=run.data.currentNodeId;
      arrive('n-anchor-point::dungeon:3','수락 전 최종전 잠금 확인');
      const {world}=live(),boss=Object.values(world.entities).find(e=>e.creature?.definitionId==='bs-act-1-anchor');
      assert(boss);assert(!run.data.field.journey.accepted['time-20']);
      assert(combat.bossEncounterFailure(run.data,boss),'Unaccepted final encounter must be locked');
      assert.equal(combat.beginBossEncounter(run.data,boss,true),false);
      placeNear(boss);
      const hp=boss.properties.integrity,time=run.data.field.elapsedSeconds;
      const result=field.performFieldGesture('strike',boss.id,boss.pos);
      assert.equal(result.ok,false);assert.equal(boss.properties.integrity,hp);
      assert.equal(run.data.field.elapsedSeconds,time);assert(!boss.creature.engaged);
      log.finalGate={lockedBeforeAcceptance:true,message:result.message,damage:0,turns:0};
      arrive(from,'잠금 확인 뒤 복귀');
    }
    function causeControlledNpcOutcome(npcId) {
      const actor=atNpc(npcId),protectedPerson=!!actor.properties.defeatProtected;
      const event={npcId,cause:'Controlled environmental integrity damage through the actual world engine; no player blame or direct HP assignment',startIntegrity:actor.properties.integrity};
      const facts=engine.influenceEntity(live().world,actor,'integrity',-100,undefined);
      field.advanceFieldTime(30);live();
      event.facts=clone(facts);event.finalIntegrity=actor.properties.integrity;event.node=actor.nodeId;
      event.outcome=protectedPerson?'withdrew':'dead';log.controlledNpcOutcome=event;
      if(protectedPerson){assert(actor.properties.integrity>0);assert(run.data.timeStory.withdrawals[npcId]);assert(!run.data.timeStory.allies[npcId]);}
      else assert(actor.properties.integrity<=0);
    }
    function fight(bossId) {
      const node=map.nodes.find(n=>n.contentRef?.bossId===bossId);
      assert(node,'Boss node not found: '+bossId);
      const arenaId=node.id+'::dungeon:3';
      arrive(arenaId,'겨룸 3층 '+bossId);
      let {world,player}=live(),boss=Object.values(world.entities).find(e=>e.nodeId===arenaId&&e.creature?.definitionId===bossId);
      assert(boss,'Boss entity not found: '+bossId);
      if(bossId==='bs-act-1-anchor'){
        assert(run.data.field.journey.accepted['time-20'],'Final quest must be accepted before actual battle');
        assert.equal(combat.bossEncounterFailure(run.data,boss),undefined);
        log.finalGate.acceptedBeforeBattle=true;
        log.partyStaging=[];
        for(const npcId of log.party){
          const ally=world.entities['npc:'+npcId];assert(ally&&run.data.timeStory.allies[npcId]&&ally.properties.integrity>0,'A living recruited companion is required');
          const from=ally.nodeId,oldPos={...ally.pos};generation.placeFieldEntity(world,world.spaces[arenaId],ally,player.pos);
          log.partyStaging.push({npcId,from,oldPos,to:arenaId,pos:{...ally.pos},integrity:ally.properties.integrity});
        }
      }
      if(bossId==='bs-act-1-anchor'){run.saveActiveRun();writeFileSync(join(root,'scratch/'+artifact+'-before-final-'+log.key+'.json'),JSON.stringify({saved:[...saved],log}));}
      const battle={bossId,hp:boss.creature.maxHp,startPlayerHp:run.data.hp,turns:0,casts:0,strikes:0,dodges:0,supplies:0,waits:0,damageTaken:0,intentSamples:[],supports:[]};
      log.battles.push(battle);
      if(!boss.creature.engaged){assert(combat.beginBossEncounter(run.data,boss,true),'Encounter did not begin: '+bossId);settleEncounter();}
      assert(boss.creature.engaged,'Actual encounter was not accepted: '+bossId);
      const start=run.data.field.elapsedSeconds,knockouts=run.data.field.bases?.knockouts??0;
      for(let i=0;i<900&&boss.properties.integrity>0&&!run.data.ended;i++){
        ({world,player}=live());settleEncounter();
        assert.equal(player.nodeId,arenaId,'Lost the fight and woke at home: '+bossId);
        const hp=run.data.hp,attack=boss.creature.pending;
        if(battle.intentSamples.length<8&&boss.creature.intent&&!battle.intentSamples.includes(boss.creature.intent))battle.intentSamples.push(boss.creature.intent);
        const danger=attack?.remaining===1&&attack.cells.some(c=>spatial.distance(c.pos,player.pos)===0);
        let acted=false;
        if(danger){
          const safe=spatial.cardinal(player.pos).find(p=>spatial.walkable(world,arenaId,p,'player')&&!world.spaces[arenaId].exits.some(e=>spatial.distance(e.pos,p)===0)&&!attack.cells.some(c=>spatial.distance(c.pos,p)===0));
          if(safe){acted=field.stepField(safe).ok;if(acted)battle.dodges++;}
        }
        if(!acted&&useSupplies()){acted=true;battle.supplies++;}
        if(!acted){
          for(const gesture of ['circle','triangle','angle','corner']){
            const result=field.performFieldGesture(gesture,boss.id,boss.pos,{drawn:true,quality:1});
            if(result.ok){acted=true;battle.casts++;break;}
          }
        }
        if(!acted&&spatial.distance(player.pos,boss.pos)===1){
          const result=field.performFieldGesture('strike',boss.id,boss.pos);
          if(result.ok){acted=true;battle.strikes++;}
        }
        if(!acted){
          const path=spatial.fieldPath(world,arenaId,player.pos,boss.pos,'player',true);
          if(path?.length&&!world.spaces[arenaId].exits.some(e=>spatial.distance(e.pos,path[0])===0))acted=field.stepField(path[0]).ok;
        }
        if(!acted){field.advanceFieldTime(30);battle.waits++;}
        battle.damageTaken+=Math.max(0,hp-run.data.hp);
      }
      if(boss.properties.integrity<=0&&!run.data.bossesCleared.includes(bossId)&&!run.data.arcsCleared.includes(bossId))field.advanceFieldTime(30);
      battle.turns=(run.data.field.elapsedSeconds-start)/30;
      battle.finalPlayerHp=run.data.hp;
      battle.statuses=Object.keys(player.properties).filter(k=>k.startsWith('status:')&&player.properties[k]>0);
      battle.supports=clone(run.data.timeStory?.allies??{});
      assert(run.data.bossesCleared.includes(bossId)||run.data.arcsCleared.includes(bossId),'Actual victory missing: '+bossId);
      assert.equal(run.data.field.bases?.knockouts??0,knockouts,'Knockout during bounded fight');
    }
    function goalActive(goal) {
      return !goal.whenChoice||run.data.field.journey.decisions?.[goal.whenChoice.questId]===goal.whenChoice.choiceId;
    }
    function goal(goal) {
      if(!goalActive(goal)||journey.goalProgress(run.data,goal)>=(goal.amount??1))return;
      if(goal.kind==='visit'){arrive(goal.key,'방문 '+goal.label);return;}
      if(goal.kind==='talk'){talk(goal.key,goal);return;}
      if(goal.kind==='read'){read(goal.key);return;}
      if(goal.kind==='boss'){fight(goal.key);return;}
      if(goal.kind==='count'){countGoal(goal);return;}
      if(goal.kind==='ally'){service(goal.key,'story:recruit');return;}
      if(goal.kind==='deliver'){assert(live().player.stock[goal.key]>=(goal.amount??1),'Controlled starting inventory insufficient: '+goal.key);return;}
      throw Error('Goal needs actual implementation: '+JSON.stringify(goal));
    }
    function questService(q,verb,choiceId) {
      const action='quest:'+verb+':'+q.id+(choiceId?':'+choiceId:'');
      if(log.localReports&&q.reportRecords?.length){
        const recordId=verb==='accept'?q.reportRecords[0]:q.reportRecords.at(-1),definition=FIELD_RECORDS.find(r=>r.id===recordId);
        arrive(definition.nodeId,'현장 조사 '+q.id);const actor=live().world.entities['record:'+recordId];placeNear(actor);
        assert(selection.fieldTargets(field.visibleFieldEntities(run.data)).some(e=>e.id===actor.id));
        const opened=field.performFieldGesture('tap',actor.id,actor.pos);
        assert(opened.ok&&opened.speech?.topics?.some(t=>t.action===action),'Physical report topic missing: '+action);
        const result=field.performFieldService(actor.id,action);assert(result.ok,result.message);
        log.actions.push({action,record:recordId,ok:result.ok,lines:result.speech?.lines});return result;
      }
      return service(verb==='accept'?q.npcId:q.turnInNpcId??q.npcId,action);
    }
    function start(name,choice,chaos=false,{key=choice,party=[],incapacitateNpc,incapacitateBefore='time-05',localReports=true}={}) {
      log={name,key,choice,chaos,party,incapacitateNpc,incapacitateBefore,localReports,arrivals:[],localPlacements:0,scheduleWaits:0,actions:[],encounters:[],battles:[],quests:[]};report.scenarios.push(log);
      run.startRun({timelineId:timeline.id,raceId:'human',season:'spring',startNodeId:'n-iluneon-square',maxHp:300,maxMp:3,timeLimit:300,activeChaos:chaos?[{id:'ch-fractured-time',intensity:1}]:[]});
      const seeded=random.createSeededRng(20260912);random.setRng(()=>seeded.next());
      run.data.level=12;run.data.relics=[];
      const {player}=live();
      Object.assign(player.stock,{water:40,'raw-fiber':40,'raw-stone':20,'i-life-char':10,'i-life-charge':10,'field-salve':80,'field-wrap':20,'i-life-ore':20,'i-crop-grain':20});
      const loadout={corner:'c-field-pulse',angle:'c-rize-relay',triangle:'c-magic-ember',circle:'c-zero-spark',square:'c-field-step'};
      for(const [gesture,id] of Object.entries(loadout)){const card=instantiateCard(data.cards.get(id));run.data.collection.push(card);run.data.field.skills.slots[gesture]=card.instanceId;}
      log.start={level:run.data.level,maxHp:run.data.maxHp,mana:run.data.maxMp,stock:clone(player.stock),loadout,story:clone(run.data.timeStory??{})};
      if(process.argv.includes('--combat-probe')){fight('bs-arc-dun');fight('bs-arc-tifre');return;}
      walkFirstStreet();
      checkUnacceptedFinalGate();
      const order=choice==='tifre'?[1,2,4,3,13,14,9,10,11,12,6,5,7,8,15,16,17,18,19,20]:[1,2,3,4,13,5,6,7,8,14,9,10,11,12,15,18,16,17,19,20];
      log.investigationOrder=order.map(n=>'time-'+String(n).padStart(2,'0'));
      for(const q of [...['home','first-shape','fibers','provisions'].map(id=>JOURNEY_QUESTS.find(q=>q.id===id)),...log.investigationOrder.map(id=>main.find(q=>q.id===id))]){
        const before=run.data.field.elapsedSeconds;
        assert(journey.questAvailable(run.data,q),'Investigation order violates prerequisite: '+q.id);
        if(q.id===incapacitateBefore&&incapacitateNpc)causeControlledNpcOutcome(incapacitateNpc);
        questService(q,'accept');
        log.quests.push({id:q.id,title:q.title,npc:q.npcId,goals:clone(q.goals),offer:q.offer,reminder:q.reminder});
        if(!run.data.field.journey.completed[q.id])for(const g of q.goals)goal(g);
        if(q.completeOnBoss){assert(run.data.field.journey.completed[q.id],q.id+' must complete at actual victory');}
        else if(run.data.field.journey.completed[q.id]){log.quests.at(-1).completedOnAccept=true;}
        else if(q.choices?.length){
          const chosen=q.id==='time-17'&&chaos?'both':choice;
          questService(q,'choose',chosen);
        }else questService(q,'finish');
        if(q.id==='time-17')for(const npcId of party)service(npcId,'story:recruit');
        log.quests.at(-1).turns=(run.data.field.elapsedSeconds-before)/30;
        console.log(name+' '+q.id+' '+q.title+' '+log.quests.at(-1).turns+' turns');
      }
      log.completed=Object.keys(run.data.field.journey.completed).filter(id=>id.startsWith('time-'));
      log.decisions=clone(run.data.field.journey.decisions);log.ending=clone(run.data.timeStory?.ending??null);log.allies=clone(run.data.timeStory?.allies??{});
      log.meta=clone(meta.storyEndings??null);
      writeFileSync(join(root,'scratch/'+artifact+'-preview-'+log.key+'.json'),JSON.stringify({run:run.data,meta:meta.$state}));log.elapsedSeconds=run.data.field.elapsedSeconds;
      log.routeEdges=log.arrivals.reduce((sum,a)=>sum+(a.edges??0),0);log.roadSpaces=log.arrivals.reduce((sum,a)=>sum+(a.roads??0),0);
      assert(run.data.ended);assert.equal(log.completed.length,20);
      assert.equal(log.ending?.id,chaos?'together':choice==='dun'?'stillness':'severance');
      assert(log.finalGate.lockedBeforeAcceptance&&log.finalGate.acceptedBeforeBattle);
      const witnesses=log.ending.witnesses;
      for(const [key,npcId] of [['dun','npc-kumamimi'],['tifre','npc-toramimi']]){
        const actor=run.data.interactionWorld.entities['npc:'+npcId],joined=!!log.allies[npcId];
        assert(actor.properties.integrity>0,'Protected NPC cannot be dead');
        const expected=run.data.timeStory.recovering?.[npcId]!==undefined?'recovering':joined&&actor.nodeId==='n-anchor-point::dungeon:3'?'present':'absent';
        assert.equal(witnesses[key].state,expected,key+' actual participation');
        assert.equal(witnesses[key].joined,expected==='recovering'?false:joined);
      }
      log.withdrawals=clone(run.data.timeStory.withdrawals??{});log.recovering=clone(run.data.timeStory.recovering??{});
      log.presentation=clone(endingPresentation(log.ending.id,witnesses));
      for(const [key,name] of [['dun','던'],['tifre','티프레']])if(witnesses[key].state!=='present')
        assert(!log.presentation.pages.some(p=>p.speaker===name),'Absent/dead NPC must not speak physically at the ending');
      assert(meta.runHistory.some(entry=>entry.storyEnding===log.ending.id&&JSON.stringify(entry.storyWitnesses)===JSON.stringify(witnesses)),'History must retain actual ending witnesses');
    }
    start('던의 방법','dun');
    if(!process.argv.includes('--combat-probe')){
      start('티프레의 방법','tifre');
      start('갈라진 시간 · 두 사람과 함께','dun',true,{key:'chaos-party',party:['npc-kumamimi','npc-toramimi']});
      start('갈라진 시간 · 생존한 두 사람을 두고 독행','dun',true,{key:'chaos-solo'});
      start('갈라진 시간 · 조사 전 던 이탈과 회복','dun',true,{key:'chaos-early-withdrawal',incapacitateNpc:'npc-kumamimi',localReports:false});
      start('갈라진 시간 · 조사 전 올뤼 사망','dun',true,{key:'chaos-guide-remains',incapacitateNpc:'npc-olyu',incapacitateBefore:'time-02',localReports:false});
    }
    report.status='PASS';
    console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.map(s=>({name:s.name,quests:s.completed?.length,ending:s.ending,battles:s.battles.map(b=>({boss:b.bossId,hp:b.hp,turns:b.turns,damage:b.damageTaken})),arrivals:s.arrivals.length,routeEdges:s.routeEdges,roadSpaces:s.roadSpaces}))},null,2));
  }
} catch(error) {
  report.status='FAIL';report.errors.push(error.stack??String(error));console.error(error.stack??error);process.exitCode=1;
} finally {
  if(!process.argv.includes('--inspect')){mkdirSync(join(root,'scratch'),{recursive:true});writeFileSync(join(root,'scratch/'+artifact+'.json'),JSON.stringify(report,null,2));}
  await server.close();globalThis.window=prior.window;globalThis.localStorage=prior.storage;globalThis.fetch=prior.fetch;
}
