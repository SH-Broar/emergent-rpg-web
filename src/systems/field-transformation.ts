import type { Card, RunState } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { instantiateCard } from './deck';
import { ensureFieldSkills, skillUnavailable } from './field-skills';
import type { InteractionAction, InteractionWorld, WorldEntity } from './world/types';
import { actionRestriction } from './world/status';
import { hasSight } from './world/spatial';
import { interactionDisabled, resolveInteraction } from './world/engine';

const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const bodyKeys=['laborPower','hardness'] as const;
const cardKey=(c:Card)=>c.instanceId??c.id;

/** Bridge the shared species property to the player's sealed investments, including old saves. */
export function reconcileFieldTransformation(run:RunState,world:InteractionWorld) {
  const player=world.entities.player;
  if(!run.field || !player)return;
  let saved=run.transform;
  if(saved && player.properties['form:'+saved.formRaceId]===undefined) {
    player.properties['form:'+saved.formRaceId]=1;
    player.form={raceId:saved.formRaceId,originalSpecies:saved.originalRaceId};
    if(player.agent)player.agent.species=saved.formRaceId;
  }
  if((saved && !saved.field) || (player.form && !saved)) {
    const raceId=player.form?.raceId??saved!.formRaceId;
    const form=useDataStore().races.get(raceId);
    const definitions=(form?.fieldSkills??[]).map(id=>useDataStore().cards.get(id));
    if(!definitions.length || definitions.some(c=>!c||skillUnavailable(c)))return;
    let prior=run.field.skills??ensureFieldSkills(run);
    const stash= saved??{
      formRaceId:raceId,originalRaceId:run.raceId,stashDeck:copy(run.deck),
      stashCollection:copy(run.collection),stashDeckSize:run.deckSize,releaseStack:5
    };
    if(saved && !Object.values(prior.slots).some(id=>stash.stashCollection.some(c=>c.instanceId===id))){
      const preview={...run,transform:undefined,deck:stash.stashDeck,collection:stash.stashCollection,field:{...run.field,skills:undefined}};
      prior={...ensureFieldSkills(preview),readyAt:copy(prior.readyAt)};
    }
    const acquired=saved?run.collection.filter(c=>c.source!=='form'&&!stash.stashCollection.some(s=>cardKey(s)===cardKey(c))):[];
    // A paid cast and its one-shot preparations stop here; they never fire from the sealed body.
    stash.field={version:1,skills:{version:2,slots:copy(prior.slots),readyAt:copy(prior.readyAt)},
      body:Object.fromEntries(bodyKeys.filter(key=>player.properties[key]!==undefined).map(key=>[key,player.properties[key]!])),
      startedTurn:Math.floor(run.field.elapsedSeconds/30)};
    const training=run.field.formTraining?.[raceId];
    const cards=training?copy(training.cards):definitions.map(c=>instantiateCard(copy(c!)));
    for(const definition of definitions)if(!cards.some(c=>c.id===definition!.id))cards.push(instantiateCard(copy(definition!)));
    run.transform=stash;saved=stash;
    run.raceId=raceId;run.deck=cards;run.collection=[...cards,...acquired];run.deckSize=cards.length;
    run.field.skills=training?copy(training.skills):undefined;ensureFieldSkills(run);
    if(run.field.formTraining)delete run.field.formTraining[raceId];
    player.properties.laborPower=form!.baseStats.vigor+form!.baseStats.attack/4;
    player.properties.hardness=form!.baseStats.defense/2;
    if(player.agent)player.agent.species=raceId;
    run.field.notification={actorId:'player',name:'두 꼬리 여우',lines:['낯선 귀가 소리를 좇고, 꼬리 둘이 옷자락을 밀어 올린다.','익숙한 기술 대신, 손끝에 작은 여우불이 맺힌다.']};
  }
  if(saved?.field && !player.form) {
    const current=ensureFieldSkills(run);
    (run.field.formTraining??={})[saved.formRaceId]={cards:copy(run.collection.filter(c=>c.source==='form')),
      skills:{version:2,slots:copy(current.slots),readyAt:copy(current.readyAt)}};
    const sealed=new Set(saved.stashCollection.map(cardKey));
    const acquired=run.collection.filter(c=>c.source!=='form'&&!sealed.has(cardKey(c)));
    run.raceId=saved.originalRaceId;run.deck=saved.stashDeck;run.collection=[...saved.stashCollection,...acquired];run.deckSize=saved.stashDeckSize;
    run.field.skills=copy(saved.field.skills); // absolute cooldowns continue to elapse
    for(const key of bodyKeys){if(saved.field.body[key]===undefined)delete player.properties[key];else player.properties[key]=saved.field.body[key]!;}
    if(player.agent)player.agent.species=run.raceId;
    run.transform=undefined;ensureFieldSkills(run);
  }
}

/** Capability lives on this individual, not a village menu or an immortal fallback. */
export function formCureAction(world:InteractionWorld,healer:WorldEntity,patient:WorldEntity):InteractionAction|undefined {
  const form=patient.form;
  if(!form || healer.kind!=='actor' || !healer.npcId || healer.creature || healer.id===patient.id ||
    !healer.tags.includes('restore:'+form.raceId) || !healer.pos || !patient.pos ||
    actionRestriction(healer) || actionRestriction(patient) || (healer.agent?.relations[patient.id]?.trust??0)<-.25 ||
    !hasSight(world,healer,patient))return;
  return {id:'restore-form',label:'원래 모습으로',description:'',duration:0,reach:1,
    effects:[{kind:'influence',property:'form:'+form.raceId,amount:-100},{kind:'signal',message:'변신을 풀었다.'}]};
}
export function formCureFailure(run:RunState,world:InteractionWorld,healerId:string):string|undefined {
  if(run.ended)return '지금은 부탁할 수 없다.';
  const healer=world.entities[healerId],patient=world.entities.player;
  if(!healer||!patient)return '그 사람은 여기 없다.';
  if(!run.transform?.field||!patient.form)return '풀어야 할 변신이 없다.';
  if((healer.properties.integrity??100)<=0)return '지금은 도움을 받을 수 없다.';
  const action=formCureAction(world,healer,patient);
  if(!action)return '지금은 이 변신을 풀어 줄 수 없다.';
  return interactionDisabled(world,healer.id,patient.id,action);
}
export function cureFieldTransformation(run:RunState,world:InteractionWorld,healerId:string) {
  const reason=formCureFailure(run,world,healerId);
  if(reason)return {ok:false,message:reason};
  const healer=world.entities[healerId]!,patient=world.entities.player!;
  const result=resolveInteraction(world,healer.id,patient.id,formCureAction(world,healer,patient)!);
  if(result.ok)reconcileFieldTransformation(run,world);
  return {ok:result.ok,message:result.ok?'익숙한 감각이 돌아왔다.':result.reason??result.message};
}
