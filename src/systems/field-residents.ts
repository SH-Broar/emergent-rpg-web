import { isTimeAlly } from './time-story';
import type { NodeMap, RunState } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { courtId, commonId, homeId, residentGoal, RESIDENT_EVENTS, eventActive, worldDate, WEEK_DAYS } from '@/data/npc-calendar';
import { fieldItemName, fieldMap, placeFieldEntity } from './field-generation';
import { inward, roadId, roadCount } from './field-geography';
import { isEdgeRequirementMet } from './map';
import { createSocialProfile } from './world/social';
import { actionRestriction } from './world/status';
import { distance, fieldPath, hasSight, walkable } from './world/spatial';
import { resolveInteraction } from './world/engine';
import type { InteractionAction, InteractionWorld, WorldEntity } from './world/types';
import type { FieldSpeech } from './field-types';

type Edge={to:string;requirement?:string};
const graphs=new WeakMap<NodeMap,Map<string,Edge[]>>();
function graph(map:NodeMap){
 let result=graphs.get(map);if(result)return result;
 result=new Map();const add=(a:string,b:string,requirement?:string)=>{const edges=result!.get(a)??[];if(!edges.some(e=>e.to===b))edges.push({to:b,requirement});result!.set(a,edges);};
 for(const node of map.nodes){
   for(const edge of [...node.neighbors.map(to=>({nodeId:to,requires:undefined as string|undefined})),...(node.conditionalNeighbors??[])]){
     const dest=map.nodes.find(n=>n.id===edge.nodeId);if(!dest)continue;
     const count=roadCount(map,node,dest),[a,b]=[node.id,dest.id].sort();
     const roads=Array.from({length:count},(_,i)=>roadId(a!,b!,node.id===a?i:count-1-i));
     const chain=[node.id,...roads,dest.id];for(let i=0;i<chain.length-1;i++)add(chain[i]!,chain[i+1]!,edge.requires);
   }
   const residents=[...useDataStore().npcs.values()].filter(n=>n.homeNodeId===node.id);
   if(residents.length){add(node.id,courtId(node.id));add(courtId(node.id),node.id);for(const npc of residents){add(courtId(node.id),homeId(npc));add(homeId(npc),courtId(node.id));}}
   if(node.kind==='village'){add(node.id,commonId(node.id));add(commonId(node.id),node.id);}
 }
 graphs.set(map,result);return result;
}
export function residentRoute(run:RunState,from:string,to:string):string[]{
 const map=fieldMap(run);if(!map||from===to)return [];
 const edges=graph(map),queue=[from],prior=new Map<string,string|undefined>([[from,undefined]]);
 for(let i=0;i<queue.length;i++)for(const e of edges.get(queue[i]!)??[]){
   if(prior.has(e.to)||e.requirement&&!isEdgeRequirementMet(e.requirement,run))continue;
   prior.set(e.to,queue[i]);if(e.to===to){const route=[to];while(prior.get(route[0]!))route.unshift(prior.get(route[0]!)!);return route.slice(1);}queue.push(e.to);
 }
 return [];
}
/** Seed each identity once. Later deletion, injury and displacement are world state. */
export function ensureResidentPopulation(run:RunState,world:InteractionWorld){
 if(!run.field||run.field.residentsVersion)return;
 const data=useDataStore(),map=fieldMap(run);if(!map)return;
 for(const npc of data.npcs.values()){
   if(!npc.homeNodeId||!map.nodes.some(n=>n.id===npc.homeNodeId))continue;
   const id='npc:'+npc.id;if(world.entities[id]||world.knowledge[id])continue;
   const body=data.races.get(npc.raceId)?.baseStats;
   const goal=residentGoal(npc,map,run.field.elapsedSeconds);
   world.entities[id]={id,npcId:npc.id,name:npc.name,kind:'actor',nodeId:goal.nodeId,ownerId:id,
     colors:npc.colorValues?Object.fromEntries(Object.entries(npc.colorValues).map(([k,v])=>[k,v<=1?v*100:v])):{},
     tags:['person','resident',...(npc.tags??[])],stock:{'i-crop-grain':1},
     properties:{integrity:100,maxHp:100,lifeLevel:1,practice:0,laborPower:body?body.vigor+body.attack/4:12,hardness:body?body.defense/2:0},
     agent:createSocialProfile(npc.raceId,npc.role||'traveler',{homeNodeId:npc.homeNodeId,turn:world.turn}),
     routine:{goal:goal.nodeId,activity:goal.activity,route:[],nextAt:run.field.elapsedSeconds}};
 }
 run.field.residentsVersion=1;
}
export function placeArrivingResidents(run:RunState,world:InteractionWorld){
 const space=world.spaces?.[run.currentNodeId];if(!space)return;
 for(const actor of Object.values(world.entities))if(actor.npcId&&actor.nodeId===space.id&&!actor.pos&&!actor.routine?.travel&&(actor.properties.integrity??100)>0)placeFieldEntity(world,space,actor,space.spawn);
}
function moveArea(world:InteractionWorld,actor:WorldEntity,to:string){
 const from=actor.nodeId,source=world.spaces?.[from],destination=world.spaces?.[to];
 const departure=source?.exits.find(e=>e.to===to),arrival=destination?.exits.find(e=>e.to===from);
 if(source&&(!departure||!actor.pos||!fieldPath(world,from,actor.pos,departure.pos,actor.id)))return false;
 if(destination){
   if(!arrival)return false;
   const direction=inward(destination,arrival.pos),landing={x:arrival.pos.x+direction.x,y:arrival.pos.y+direction.y};
   if(!walkable(world,to,arrival.pos,actor.id)||!walkable(world,to,landing,actor.id))return false;
 }
 const result=resolveInteraction(world,actor.id,actor.id,{id:'resident-travel',label:'길 따라가기',description:'',duration:0,effects:[{kind:'move',nodeId:to}]});
 if(!result.ok)return false;
 actor.pos=undefined;
 const space=world.spaces?.[to];
 if(space){const exit=space.exits.find(e=>e.to===from),direction=exit?inward(space,exit.pos):undefined;
   if(direction){actor.properties.facingX=direction.x;actor.properties.facingY=direction.y;}
   placeFieldEntity(world,space,actor,exit&&direction?{x:exit.pos.x+direction.x,y:exit.pos.y+direction.y}:space.spawn);
 }
 for(const held of Object.values(world.entities).filter(e=>e.carriedBy===actor.id))held.nodeId=to;
 return true;
}
/** Visible people walk cell by cell. Distant people retain an arrival time per actual connection. */
export function tickResidentSchedules(run:RunState,world:InteractionWorld,active:ReadonlySet<string>){
 const now=run.field!.elapsedSeconds,map=fieldMap(run);if(!map)return;
 const edges=graph(map);
 for(const actor of Object.values(world.entities)){
   if(!actor.npcId||!actor.agent||(actor.properties.integrity??100)<=0||isTimeAlly(run,actor))continue;
   const npc=useDataStore().npcs.get(actor.npcId);if(!npc?.homeNodeId)continue;
   const goal=residentGoal(npc,map,now),r=actor.routine??={goal:goal.nodeId,activity:goal.activity,route:[],nextAt:now};
   // A restraint delays a journey instead of letting the timetable move the actor through it.
   if(actionRestriction(actor,true)||actionRestriction(actor)){if(r.travel)r.travel.arrivesAt+=30;continue;}
   const threatened=active.has(actor.id)&&Object.values(world.entities).some(e=>e.nodeId===actor.nodeId&&e.creature&&(e.properties.integrity??100)>0&&hasSight(world,actor,e));
   if(threatened){if(r.travel)r.travel.arrivesAt+=30;continue;}
   if(r.travel){
     const trip=r.travel,edge=edges.get(actor.nodeId)?.find(e=>e.to===trip.to);
     if(trip.from!==actor.nodeId||!edge||edge.requirement&&!isEdgeRequirementMet(edge.requirement,run)){r.travel=undefined;r.route=[];continue;}
     if(active.has(actor.id)){r.travel=undefined;}else if(now>=trip.arrivesAt){if(moveArea(world,actor,trip.to))r.route.shift();r.travel=undefined;r.nextAt=now+30;}else continue;
   }
   if(r.goal!==goal.nodeId){r.goal=goal.nodeId;r.route=[];}r.activity=goal.activity;
   if(actor.nodeId===r.goal){r.route=[];continue;}
   if(now<r.nextAt)continue;r.nextAt=now+30;
   if(!r.route.length)r.route=residentRoute(run,actor.nodeId,r.goal);
   const to=r.route[0];if(!to)continue;
   const edge=edges.get(actor.nodeId)?.find(e=>e.to===to);
   if(!edge||edge.requirement&&!isEdgeRequirementMet(edge.requirement,run)){r.route=[];continue;}
   const space=world.spaces?.[actor.nodeId],exit=space?.exits.find(e=>e.to===to);
   if(space&&!actor.pos)placeFieldEntity(world,space,actor,space.spawn);
   if(space&&actor.pos&&exit){
     const path=fieldPath(world,space.id,actor.pos,exit.pos,actor.id);
     if(!path)continue;
     if(active.has(actor.id)){
       if(path.length){resolveInteraction(world,actor.id,actor.id,{id:'resident-step',label:'이동',description:'',duration:0,effects:[{kind:'relocate',side:'actor',pos:path[0]!}]});}
       else if(moveArea(world,actor,to))r.route.shift();
       continue;
     }
     r.travel={to,from:actor.nodeId,arrivesAt:now+Math.max(1,path.length+1)*30};
   }else if(!space)r.travel={to,from:actor.nodeId,arrivesAt:now+180};
   // A loaded area with a missing exit is an obstruction, never an abstract shortcut.
 }
 placeArrivingResidents(run,world);
}
export function residentAgenda(run:RunState,actor:WorldEntity):FieldSpeech['topics']{
 const npc=useDataStore().npcs.get(actor.npcId??''),map=fieldMap(run);if(!npc||!map||!run.field)return [];
 const goal=residentGoal(npc,map,run.field.elapsedSeconds),date=worldDate(run.field.elapsedSeconds);
 const place=goal.nodeId===homeId(npc)?'집':goal.nodeId.endsWith('::commons')?'공동 마당':goal.nodeId.endsWith('::residents')?'집 앞':map.nodes.find(n=>n.id===goal.nodeId)?.label??'근처';
 const topics:NonNullable<FieldSpeech['topics']>=[{label:'오늘은',lines:[actor.nodeId===goal.nodeId?place+'에서 좀 더 머무르려고.':place+'에 가려던 참이야. 길이 괜찮으면 곧 갈 거야.']}];
 const next=RESIDENT_EVENTS.filter(e=>e.npcId===npc.id&&(!e.days||e.days.some(d=>d>=date.day))).map(e=>e.title+' · '+(e.weekdays?e.weekdays.map(d=>WEEK_DAYS[d]).join('·')+'요일':e.days!.join('·')+'일')+' '+e.start+'시');
 if(next.length)topics.push({label:'약속',lines:next});
 for(const e of RESIDENT_EVENTS)if(e.npcId===npc.id&&e.nodeId===actor.nodeId&&eventActive(e,run.field.elapsedSeconds)&&(run.field.residentEvents?.[e.id]??0)!==date.day)topics.unshift({label:e.title,lines:e.lines,confirmLabel:e.choice+(e.input?' · '+Object.entries(e.input).map(([id,n])=>fieldItemName(id)+' '+n).join(', '):''),action:'resident-event:'+e.id});
 return topics;
}
export function performResidentEvent(run:RunState,world:InteractionWorld,actorId:string,eventId:string){
 const event=RESIDENT_EVENTS.find(e=>e.id===eventId),actor=world.entities[actorId],player=world.entities.player,now=run.field!.elapsedSeconds,day=worldDate(now).day;
 if(!event||!actor||actor.npcId!==event.npcId||actor.nodeId!==event.nodeId||!actor.pos||!player?.pos||actor.nodeId!==player.nodeId||distance(actor.pos,player.pos)>1||!hasSight(world,player,actor)||(actor.properties.integrity??100)<=0||actionRestriction(actor)||actionRestriction(player)||(actor.agent?.relations.player?.trust??0)<-.25||!eventActive(event,now)||(run.field!.residentEvents?.[event.id]??0)===day)return {ok:false,message:'지금은 함께할 수 없다.'};
 const effects:InteractionAction['effects']=Object.entries(event.input??{}).map(([resourceId,n])=>({kind:'stock',side:'actor',resourceId,amount:-n}));
 for(const [resourceId,n]of Object.entries(event.output??{}))effects.push(resourceId==='i-crop-grain'?{kind:'transfer',from:'target',to:'actor',resourceId,quantity:n}:{kind:'stock',side:'actor',resourceId,amount:n});
 effects.push({kind:'signal',message:event.result});
 const result=resolveInteraction(world,player.id,actor.id,{id:event.id,label:event.choice,description:'',duration:0,effects});
 if(!result.ok)return result;
 (run.field!.residentEvents??={})[event.id]=day;
 const relation=actor.agent!.relations.player??={trust:0,regard:0};relation.trust=Math.min(1,relation.trust+.03);relation.regard=Math.min(1,relation.regard+.05);
 return {ok:true,message:'',practice:event.practice??0,speech:{actorId,name:actor.name,lines:[event.result]}};
}
