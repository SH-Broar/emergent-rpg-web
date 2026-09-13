import { useRunStore } from '@/stores/run';
import { fieldChaosAttackMultiplier } from './field-chaos';
import { JOURNEY_QUESTS } from '@/data/journey-quests';
import type { RunState } from '@/data/schemas';
import { rng } from './rng';
import { transformationChance } from './world/form-rules';
import type { GridPos } from '@/data/schemas/base';
import type { GridAttack } from '@/data/schemas/monster';
import { useDataStore } from '@/stores/data';
import type { FieldAttack } from './field-types';
import type { InteractionWorld, WorldEntity } from './world/types';
import { influenceEntity, recordFact } from './world/engine';
import { cardinal, distance, entitiesAt, fieldPath, walkable, hasSight } from './world/spatial';
import { actionRestriction, changeStatus, DECAYING, movesAsAir, outgoingDamage, status, statusEntries } from './world/status';

export function combatDefinition(e:WorldEntity) {
  const c=e.creature!;
  return c.rank==='boss'?useDataStore().bosses.get(c.definitionId):useDataStore().monsters.get(c.definitionId);
}
export function phaseFor(e:WorldEntity) {
  const def=combatDefinition(e);
  if(!def||!('phases' in def))return;
  return def.phases.filter(p=>(e.properties.integrity??100)/100<=p.startsAtHpRatio).at(-1)??def.phases[0];
}
export function hit(world:InteractionWorld, actor:WorldEntity, target:WorldEntity, amount:number, ranged=false):number {
  if((target.properties.integrity??100)<=0)return 0;
  if(status(target,'ghost')&&(ranged||status(actor,'ghost')))return 0;
  const hp=target.properties.maxHp??target.creature?.maxHp??100;
  const damage=Math.max(0,outgoingDamage(actor,amount,ranged)-(target.creature ? (combatDefinition(target)?.defense??0) : 0));
  const before=target.properties.integrity??100;
  // force remains a common material influence, including Color resistance and guard.
  const resistance=(target.properties.hardness??0)+(target.colors.iron??0)/20;
  influenceEntity(world,target,'force',damage/hp*100+resistance,actor.id);
  const lost=Math.round((before-(target.properties.integrity??100))*hp/100);
  return lost;
}
export function applyStatus(world:InteractionWorld,target:WorldEntity,token?:string,source?:WorldEntity) {
  if(!token)return;
  const [key,raw]=token.split(':');const n=Number(raw??1);
  if(!key||!Number.isFinite(n)||n<=0)return;
  influenceEntity(world,target,'status:'+key,n,source?.id);
}
const rotate=(p:{dx:number;dy:number},n:number)=>{let {dx,dy}=p;while(n-->0)[dx,dy]=[-dy,dx];return {dx,dy};};
/** Lock positions and multipliers together. Filtering a wall never shifts damage indices. */
export function planAttack(world:InteractionWorld,e:WorldEntity,player:WorldEntity):FieldAttack|undefined {
  const def=combatDefinition(e),c=e.creature!,phase=phaseFor(e);
  const attacks=phase?.gridBehavior??(def&&'gridBehavior'in def?def.gridBehavior:undefined);
  const index=Math.floor(e.properties.attacksMade??0);
  const authored=attacks?.[index%attacks.length];
  const fallback:GridAttack={name:'내려치기',damage:c.attack,shape:[{dx:0,dy:-1}],castSpeed:'normal'};
  const atk=authored??fallback,space=world.spaces![e.nodeId]!;
  const turns=atk.castSpeed==='slow'?2:1;
  const scale=c.rank==='boss'?3:c.rank==='elite'?2:1;
  const footprint=new Set<string>();
  for(const off of atk.shape)for(let step=1;step<=(Math.max(Math.abs(off.dx),Math.abs(off.dy))<=1?scale:1);step++)
    if(off.dx||off.dy)footprint.add(off.dx*step+','+off.dy*step);
  const recoveryTurns=atk.castSpeed==='slow'?2:footprint.size>=4?1:0;
  const rotations=[0,1,2,3].map(n=>{
    const cells=new Map<string,{pos:GridPos;multiplier:number}>();
    for(const [i,off]of atk.shape.entries()){
      const {dx,dy}=rotate(off,n);
      const length=Math.max(Math.abs(dx),Math.abs(dy));
      const extend=length<=1?scale:1;
      for(let step=1;step<=extend;step++){
        const pos={x:e.pos!.x+dx*step,y:e.pos!.y+dy*step};
        if(!space.tiles[pos.y]?.[pos.x]||space.tiles[pos.y]![pos.x]==='wall'||distance(pos,e.pos!)===0)continue;
        const multiplier=atk.perTileMul?.[i]??1,key=pos.x+','+pos.y;
        if(!cells.has(key)||cells.get(key)!.multiplier<multiplier)cells.set(key,{pos,multiplier});
      }
    }
    return [...cells.values()];
  });
  const cells=rotations.find(cells=>cells.some(p=>distance(p.pos,player.pos!)===0));
  if(!cells && atk.requiresInRange!==false)return;
  const chosen=cells??rotations[0]!;
  if(!chosen.length)return;
  return {name:atk.name??'공격',cells:chosen,damage:Math.ceil((atk.damage??c.attack)*fieldChaosAttackMultiplier(useRunStore().data,c.rank)),status:atk.applyStatus,transform:atk.transform?{...atk.transform}:undefined,remaining:turns,castTurns:turns,castSpeed:atk.castSpeed??'normal',recoveryTurns};
}
export function resolveAttack(world:InteractionWorld,e:WorldEntity) {
  const c=e.creature!,attack=c.pending!;
  let hitAny=false,hitActor=false;
  for(const {pos,multiplier} of attack.cells) {
    for(const target of entitiesAt(world,e.nodeId,pos)) {
      if(target.id===e.id||(target.properties.integrity??100)<=0)continue;
      if(status(target,'ghost')&&(distance(e.pos!,pos)>1||status(e,'ghost')))continue;
      hitAny=true;if(target.kind==='actor')hitActor=true;
      hit(world,e,target,Math.floor(attack.damage*multiplier),distance(e.pos!,pos)>1);
      if(target.kind==='actor')applyStatus(world,target,attack.status,e);
      const form=attack.transform;
      if(form && target.kind==='actor' && !target.form && (target.properties.integrity??100)>0 &&
        useDataStore().races.get(form.raceId)?.fieldSkills?.length) {
        const ready=!form.requiresStatus || status(target,form.requiresStatus) || form.requiresStatus==='feral'&&status(target,'feral-heavy');
        if(!ready)applyStatus(world,target,form.requiresStatus+':3',e);
        else if(rng()<transformationChance(target.properties.level))influenceEntity(world,target,'form:'+form.raceId,1,e.id,'몸의 형상이 바뀌었다.');
        else recordFact(world,{turn:world.turn,nodeId:target.nodeId,actorId:e.id,targetId:target.id,kind:'signal',labor:0,message:'변신 저항'});
      }
      if(attack.status?.startsWith('possession:')&&target.kind==='actor')influenceEntity(world,e,'integrity',-100,e.id);
    }
  }
  // Committing a heavy swing creates a punish window only when it misses a body.
  // Existing vulnerability makes every damage source benefit, including prepared spells and traps.
  c.recovery=hitActor?0:attack.recoveryTurns??(attack.castSpeed==='slow'?2:attack.cells.length>=4?1:0);
  if(c.recovery)e.properties['status:vulnerable']=Math.max(c.recovery,status(e,'vulnerable'));
  recordFact(world,{turn:world.turn,nodeId:e.nodeId,actorId:e.id,targetId:e.id,kind:'signal',labor:0,message:c.recovery?'빈틈':hitAny?attack.name:'빗나감'});
  c.pending=undefined;c.intent=undefined;c.nextAction=undefined;
  e.properties.attacksMade=(e.properties.attacksMade??0)+1;
}
export function tickStatuses(world:InteractionWorld,e:WorldEntity,turn:number,waiting=false) {
  if((e.properties.integrity??100)<=0)return;
  const hp=e.properties.maxHp??e.creature?.maxHp??100;
  // The newly received effects start on the following step, never expire before acting.
  for(const key of ['poison','burn','sap','possession']){
    const n=status(e,key);if(!n)continue;
    const damage=key==='possession'?Math.min(Math.max(0,(e.properties.integrity??100)*hp/100-1),Math.min(6,1+n)):n;
    if(damage>0)influenceEntity(world,e,'integrity',-damage/hp*100,e.id);
    if((e.properties.integrity??100)<=0)return;
    if(key==='poison')changeStatus(e.properties,key,-1);
    if(key==='burn')changeStatus(e.properties,key,-Math.ceil(n/2));
  }
  if(status(e,'regen')){influenceEntity(world,e,'integrity',status(e,'regen')/hp*100);changeStatus(e.properties,'regen',-1);}
  if(status(e,'spasm')){influenceEntity(world,e,'mana',-status(e,'spasm'));changeStatus(e.properties,'spasm',-status(e,'spasm'));}
  if(waiting&&status(e,'confusion')&&e.pos&&!actionRestriction(e,true)){
    const options=cardinal(e.pos).filter(p=>walkable(world,e.nodeId,p,e.id));
    const pos=options[(turn+e.id.length)%options.length];if(pos)e.pos={...pos};
  }
  if(status(e,'paralyze'))changeStatus(e.properties,'paralyze',-1);
  if(turn%3===0){if(status(e,'imprint')<=5)changeStatus(e.properties,'imprint',-1);changeStatus(e.properties,'feral',-1);}
}
export function finishStatusStep(e:WorldEntity,previous:Record<string,number>) {
  for(const key of DECAYING)if(previous['status:'+key])changeStatus(e.properties,key,-1);
  if(e.creature?.recovery)e.properties['status:vulnerable']=Math.max(e.creature.recovery,status(e,'vulnerable'));
  if(!previous['status:ward']&&!status(e,'ward'))e.properties.guard=Math.max(0,status(e,'metallicize')?(e.properties.guard??0)-1:Math.floor((e.properties.guard??0)/2));
}
export function afterMovement(e:WorldEntity) {
  changeStatus(e.properties,'possession',-1);changeStatus(e.properties,'slime',-1);e.properties['status:airborne']=0;
}
export function creatureDestinations(world:InteractionWorld,e:WorldEntity):GridPos[] {
  if(!e.pos||actionRestriction(e,true))return [];
  const def=combatDefinition(e),profile=def&&('moveProfile'in def?def.moveProfile:'gridMoveProfile'in def?def.gridMoveProfile:undefined);
  const range=status(e,'slime')||status(e,'slowed')||status(e,'drowsy')?1:Math.max(1,profile?.range??1);
  const result=new Map<string,GridPos>();
  const add=(dx:number,dy:number)=>{const p={x:e.pos!.x+dx,y:e.pos!.y+dy};if(walkable(world,e.nodeId,p,e.id))result.set(p.x+','+p.y,p);return p;};
  const patterns=(status(e,'slime')||status(e,'slowed'))?['orthogonal1']:profile?.pattern==='composite'?profile.compose??['orthogonal1']:[profile?.pattern??'orthogonal1'];
  for(const pattern of patterns){
    if(pattern==='knight'){for(const [x,y]of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])add(x!,y!);continue;}
    if(pattern==='custom'){for(const p of profile?.customOffsets??[])add(p.dx,p.dy);continue;}
    if(pattern==='manhattan'){for(let x=-range;x<=range;x++)for(let y=-range;y<=range;y++)if(Math.abs(x)+Math.abs(y)<=range&&(x||y))add(x,y);continue;}
    const directions=pattern==='bishop'?[[-1,-1],[1,-1],[-1,1],[1,1]]:pattern==='king'?[[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[1,0],[0,1],[-1,0]]:[[0,-1],[1,0],[0,1],[-1,0]];
    for(const [x,y]of directions)for(let n=1;n<=(pattern==='orthogonal1'?1:range);n++){
      const p=add(x!*n,y!*n);if(!walkable(world,e.nodeId,p,e.id)&&!movesAsAir(e))break;
    }
  }
  return [...result.values()];
}
export function nextCreaturePosition(world:InteractionWorld,e:WorldEntity,target:GridPos):GridPos|undefined {
  const destinations=creatureDestinations(world,e);if(!e.pos||!destinations.length)return;
  const victim=world.entities.player,old=e.pos;
  const firing=destinations.find(p=>{
    if(!victim?.pos||distance(victim.pos,target)!==0)return false;
    e.pos=p;const attack=planAttack(world,e,victim);e.pos=old;
    return attack?.cells.some(c=>distance(c.pos,target)===0);
  });
  const costs=destinations.map(p=>({p,cost:fieldPath(world,e.nodeId,p,target,e.id,true)?.length??Infinity}));
  costs.sort((a,b)=>a.cost-b.cost||distance(a.p,target)-distance(b.p,target));
  const next=firing??(Number.isFinite(costs[0]?.cost)?costs[0]!.p:undefined);
  return next;
}
export function commitCreatureMove(world:InteractionWorld,e:WorldEntity,next:GridPos) {
  if(!creatureDestinations(world,e).some(p=>distance(p,next)===0))return;
  e.pos={...next};afterMovement(e);recordFact(world,{turn:world.turn,nodeId:e.nodeId,actorId:e.id,targetId:e.id,kind:'move',labor:0,message:'이동'});
}
export function moveCreature(world:InteractionWorld,e:WorldEntity,target:GridPos) {
 const next=nextCreaturePosition(world,e,target);if(next)commitCreatureMove(world,e,next);
}
export function bossEncounterFailure(run: RunState, e: WorldEntity): string | undefined {
  if (e.creature?.definitionId === 'bs-act-1-anchor' && !JOURNEY_QUESTS.some(q => q.completeOnBoss === e.creature!.definitionId && run.field?.journey?.accepted[q.id]))
    return '츠요사이에게 마지막 부탁을 받고 오자.';
}
export function beginBossEncounter(run:RunState,e:WorldEntity,explicit=false):boolean {
  if (bossEncounterFailure(run,e)) return false;
  const c=e.creature!;
  if(run.interactionWorld&&enforceTamamoSubmission(run,run.interactionWorld,e.id))return true;
  if(c.rank!=='boss'||c.engaged)return false;
  if(!explicit&&(c.challengeAfter??0)>(run.field?.elapsedSeconds??0))return true;
  const def=combatDefinition(e);
  const story=JOURNEY_QUESTS.find(q=>q.encounter?.bossId===c.definitionId&&run.field?.journey?.accepted[q.id]&&!run.field.journey.completed[q.id]);
  run.field!.encounter={actorId:e.id,name:e.name,lines:story?.encounter?.lines??(def&&'dialogue'in def&&def.dialogue?.length?def.dialogue:[def&&'introText'in def?def.introText??e.name:e.name])};
  return true;
}
export function resolveFieldEncounter(run:RunState,accept:boolean) {
  const encounter=run.field?.encounter;if(!encounter)return;
  const e=run.interactionWorld?.entities[encounter.actorId];
  if(e&&run.interactionWorld&&enforceTamamoSubmission(run,run.interactionWorld,e.id))return;
  if(e && bossEncounterFailure(run,e)){run.field!.encounter=undefined;return;}
  if(e?.creature){e.creature.nextAction=undefined;if(accept){e.creature.engaged=true;e.creature.angry=true;}else e.creature.challengeAfter=run.field!.elapsedSeconds+300;}
  run.field!.encounter=undefined;
}
export function clearCombatStatuses(e:WorldEntity,rest=false) {
  for(const {key} of statusEntries(e))if(rest||!['possession','regress','feral-heavy'].includes(key))e.properties['status:'+key]=0;
  e.properties.guard=0;
  e.properties.castingStrength=0;e.properties.castingStrengthExpiresAt=0;
}

/** A transformed apprentice submits before either side can use a combat action. */
export function enforceTamamoSubmission(run:RunState,world:InteractionWorld,explicitId?:string):boolean {
 if(!run.field||!run.transform?.field||run.transform.formRaceId!=='race-form-fox'||run.ended)return false;
 const player=world.entities.player;if(!player?.pos)return false;
 const tamamo=Object.values(world.entities).find(e=>e.creature?.definitionId==='bs-arc-tamamo'&&e.nodeId===player.nodeId&&(e.properties.integrity??100)>0&&
  (e.id===explicitId||e.creature.engaged||e.pos&&distance(e.pos,player.pos!)<=6&&hasSight(world,e,player)));
 if(!tamamo)return false;
 run.field.knockoutReason='tamamo';run.field.encounter=undefined;
 if(run.field.skills)run.field.skills.pending=undefined;
 player.properties.integrity=0;run.hp=0;
 return true;
}
