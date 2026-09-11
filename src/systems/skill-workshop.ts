import type { Card, RunState } from '@/data/schemas';
import { canEnhance, maxLevelFor } from './enhance';
import { skillMana, skillCooldown, skillReach, skillEffects, skillHasPower } from './field-skill-rules';
import { skillLoadoutLocked, skillUnavailable } from './field-skills';
import { distance } from './world/spatial';

export type SkillUpgradePath = 'power' | 'efficiency' | 'recovery' | 'reach';
export const SKILL_UPGRADES: {id: SkillUpgradePath; name:string; description:string}[] = [
  {id:'power',name:'위력',description:'강화 단계 +1'},
  {id:'efficiency',name:'효율',description:'마나 −1'},
  {id:'recovery',name:'순환',description:'재사용 −1턴'},
  {id:'reach',name:'사거리',description:'조준 거리 +1칸'},
];
export const ENCHANTMENTS: {id:NonNullable<Card['enchantment']>;name:string;description:string}[] = [
  {id:'ember',name:'잔불',description:'적중 대상에 화상 2'},
  {id:'shelter',name:'보호',description:'사용 후 방어 3'},
  {id:'renewal',name:'소생',description:'사용 후 재생 1'},
];
export function atSkillWorkshop(run: RunState): boolean {
  const world=run.interactionWorld,player=world?.entities.player;
  return !!world&&!!player?.pos&&Object.values(world.entities).some(e=>e.nodeId===player.nodeId&&e.pos&&
    (e.tags.includes('service:workshop')||e.tags.includes('workshop'))&&distance(player.pos!,e.pos)<=1&&(e.properties.integrity??100)>0);
}
export function materialFailure(run: RunState, card: Card, targetId: string): string|undefined {
  if(!card.instanceId)return '임시 카드';
  if(card.instanceId===targetId)return '강화할 카드';
  if(Object.values(run.field?.skills?.slots??{}).includes(card.instanceId))return '장착 중';
  if(card.possession||card.curse||run.possessions?.[card.instanceId??''])return '봉인된 카드';
  if(card.source==='form'||card.unplayable)return '임시 카드';
}
export function upgradeQuote(card: Card, path: SkillUpgradePath) {
  const level=path==='power'?card.enhanceLevel??0:card.skillUpgrades?.[path]??0;
  const cards=1+Math.floor(level/3),shards=path==='power'?0:5*(level+1);
  let reason:string|undefined;
  if(path==='power'&&!canEnhance(card))reason=(card.enhanceLevel??0)>=maxLevelFor(card)?'최대 강화':'각성 필요';
  if(path==='power'&&!skillHasPower(card))reason='위력 강화 대상 없음';
  if(path==='efficiency'&&((card.skillUpgrades?.efficiency??0)>=1||skillMana(card)<=1))reason='마나 효율 최대';
  if(path==='recovery'&&((card.skillUpgrades?.recovery??0)>=2||skillCooldown(card)<=1))reason='재사용 단축 최대';
  if(path==='reach'&&(card.targetMode!=='aimed'||(card.skillUpgrades?.reach??0)>=2))reason=card.targetMode!=='aimed'?'조준 기술 전용':'사거리 최대';
  const before=path==='power'?(card.enhanceLevel??0):path==='efficiency'?skillMana(card):path==='recovery'?skillCooldown(card):skillReach(card);
  const after=before+(path==='efficiency'||path==='recovery'?-1:1);
  return {cards,shards,before,after,reason};
}
function contextFailure(run:RunState) {
  if(run.ended)return '여정이 끝났다.';
  if(run.transform?.field)return '변신이 풀린 뒤에 기술을 강화할 수 있다.';
  if(!atSkillWorkshop(run))return '공방 가까이에서 사용할 수 있다.';
  if(skillLoadoutLocked(run))return '위험이 사라진 뒤에 작업할 수 있다.';
}
function syncCopies(run:RunState,card:Card) {
  const i=run.deck.findIndex(c=>c.instanceId===card.instanceId);if(i>=0)run.deck[i]=card;
}
export function upgradeSkill(run: RunState, targetId: string, materialIds: string[], path: SkillUpgradePath): string|undefined {
  const context=contextFailure(run);if(context)return context;
  if(!SKILL_UPGRADES.some(p=>p.id===path))return '강화 방향을 선택하세요.';
  const target=run.collection.find(c=>c.instanceId===targetId);if(!target)return '카드를 찾을 수 없다.';
  if(skillUnavailable(target))return '현재 사용할 수 없는 기술이다.';
  const quote=upgradeQuote(target,path);if(quote.reason)return quote.reason;
  if(new Set(materialIds).size!==materialIds.length||materialIds.length!==quote.cards)return '재료 카드 '+quote.cards+'장을 선택하세요.';
  const materials=materialIds.map(id=>run.collection.find(c=>c.instanceId===id));
  if(materials.some(c=>!c||materialFailure(run,c,targetId)))return '재료로 쓸 수 없는 카드가 있다.';
  if(run.timeShards<quote.shards)return '시간의 조각 부족';
  // Validate the entire transaction before consuming anything. No salvage reward for consumed cards.
  run.collection=run.collection.filter(c=>!materialIds.includes(c.instanceId??''));
  run.deck=run.deck.filter(c=>!materialIds.includes(c.instanceId??''));
  run.timeShards-=quote.shards;
  if(path==='power')target.enhanceLevel=(target.enhanceLevel??0)+1;
  else (target.skillUpgrades??={})[path]=(target.skillUpgrades?.[path]??0)+1;
  syncCopies(run,target);
}
export const ENCHANT_SHARDS=12;
export const ENCHANT_MATERIAL='i-material-common';
export function enchantFailure(run:RunState,card:Card,enchantment:Card['enchantment']) {
  const context=contextFailure(run);if(context)return context;
  if(skillUnavailable(card))return '현재 사용할 수 없는 기술이다.';
  if(!ENCHANTMENTS.some(e=>e.id===enchantment))return '인챈트를 선택하세요.';
  if(card.enchantment===enchantment)return '이미 새겨져 있다.';
  if(enchantment==='ember'&&!skillEffects(card).some(e=>e.kind.includes('damage')||e.kind==='heavy-blade'||e.kind==='adaptive-strike'))return '공격 기술 전용';
  if(run.timeShards<ENCHANT_SHARDS)return '시간의 조각 부족';
  if(run.items.filter(i=>i.id===ENCHANT_MATERIAL).length<2)return '가공 재료 2개 필요';
}
export function enchantSkill(run:RunState,instanceId:string,enchantment:Card['enchantment']):string|undefined {
  const card=run.collection.find(c=>c.instanceId===instanceId);if(!card)return '카드를 찾을 수 없다.';
  const failure=enchantFailure(run,card,enchantment);if(failure)return failure;
  run.timeShards-=ENCHANT_SHARDS;
  for(let i=0;i<2;i++)run.items.splice(run.items.findIndex(i=>i.id===ENCHANT_MATERIAL),1);
  card.enchantment=enchantment;syncCopies(run,card);
}
