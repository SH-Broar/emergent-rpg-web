import type { Element } from '@/data/schemas/base';
import type { InteractionAction, InteractionWorld, PrimitiveEffect, WorldEntity } from './world/types';
import { interactionDisabled } from './world/engine';
import { actionRestriction, outgoingDamage, status } from './world/status';
import { distance, hasSight, walkable } from './world/spatial';

export type ColorOperationDirection = 'out' | 'in';
export type ColorOperationId = `${Element}:${ColorOperationDirection}`;
export interface ColorOperationDefinition {
  id: ColorOperationId;
  color: Element;
  direction: ColorOperationDirection;
  label: string;
  description: string;
  mana: number;
  reach: number;
}
export const COLOR_OPERATION_DEFS: readonly ColorOperationDefinition[] = [
  { id:'fire:out', color:'fire', direction:'out', label:'가열', description:'열을 더한다. 마른 가연물에는 불이 붙는다.', mana:1, reach:3 },
  { id:'fire:in', color:'fire', direction:'in', label:'냉각', description:'열과 불길을 낮춘다.', mana:1, reach:3 },
  { id:'water:out', color:'water', direction:'out', label:'적심', description:'물 1개를 옮겨 적신다. 불을 끄고 전기를 잘 통하게 한다.', mana:1, reach:3 },
  { id:'water:in', color:'water', direction:'in', label:'회수', description:'수분을 물 1개로 회수한다. 마른 대상에서는 모을 수 없다.', mana:1, reach:2 },
  { id:'electric:out', color:'electric', direction:'out', label:'방전', description:'전류를 흘린다. 젖음·전도율·절연에 따라 피해가 달라진다.', mana:2, reach:3 },
  { id:'electric:in', color:'electric', direction:'in', label:'절연', description:'전류가 통하기 어렵게 한다. 마비와 경련도 조금 덜어 낸다.', mana:1, reach:2 },
  { id:'iron:out', color:'iron', direction:'out', label:'경화', description:'경도를 높인다. 몸에는 짧게 유지되는 방어도 더한다.', mana:1, reach:2 },
  { id:'iron:in', color:'iron', direction:'in', label:'연화', description:'경도를 낮춘다. 단단한 물건을 부수기 쉬워진다.', mana:1, reach:2 },
  { id:'earth:out', color:'earth', direction:'out', label:'다짐', description:'철광 1개로 바닥에 막는 턱을 만든다. 몸에는 이동 구속을 건다.', mana:2, reach:2 },
  { id:'earth:in', color:'earth', direction:'in', label:'풀기', description:'단단히 막힌 물체를 풀거나 이동 구속을 덜어 낸다.', mana:1, reach:2 },
  { id:'wind:out', color:'wind', direction:'out', label:'밀기', description:'옮길 만한 대상을 한 칸 밀고 연기를 흩는다.', mana:1, reach:3 },
  { id:'wind:in', color:'wind', direction:'in', label:'당기기', description:'옮길 만한 대상을 한 칸 당긴다. 막힌 칸은 넘지 못한다.', mana:1, reach:3 },
  { id:'light:out', color:'light', direction:'out', label:'비춤', description:'빛을 더한다. 빛을 필요로 하는 생산에도 닿는다.', mana:1, reach:3 },
  { id:'light:in', color:'light', direction:'in', label:'각성', description:'잠·졸음·혼란을 덜고, 주의가 필요한 생산을 돌본다.', mana:1, reach:2 },
  { id:'dark:out', color:'dark', direction:'out', label:'가림', description:'짙은 장막으로 시야를 가린다. 적과 주민의 시선에도 작용한다.', mana:1, reach:3 },
  { id:'dark:in', color:'dark', direction:'in', label:'진정', description:'졸음을 불러 행동을 쉬게 하고 주의를 낮춘다.', mana:2, reach:2 },
];
export const colorOperationDefinition = (id: string) => COLOR_OPERATION_DEFS.find(d => d.id === id);
const influence = (property: string, amount: number, side?: 'actor' | 'target'): PrimitiveEffect =>
  ({ kind:'influence', property, amount, ...(side ? { side } : {}) });
const stock = (resourceId: string, amount: number): PrimitiveEffect => ({kind:'stock',resourceId,amount,side:'actor'});
const living = (e: WorldEntity) => (e.properties.maxHp ?? 0) > 0 || e.kind === 'actor';
const value = (e: WorldEntity, property: string) => e.properties[property] ?? 0;

/** Only world capabilities choose effects: no quest, record, NPC or monster IDs are inspected. */
function operationEffects(world: InteractionWorld, actor: WorldEntity, target: WorldEntity, id: ColorOperationId): PrimitiveEffect[] {
  const effects: PrimitiveEffect[] = [];
  const add = (property: string, amount: number) => { if (amount !== 0) effects.push(influence(property, amount)); };
  const lower = (property: string, amount: number) => add(property, -Math.min(amount, value(target, property)));
  const fill = (property: string, amount: number, cap: number) => add(property, Math.max(0, Math.min(amount, cap - value(target, property))));
  switch (id) {
    case 'fire:out': fill('heat', 4, 10); break;
    case 'fire:in': lower('heat', 6); lower('burning', 6); lower('status:burn', 3); break;
    case 'water:out':
      if (value(target,'moisture') < 9) { effects.push(stock('water',-1)); fill('moisture',3,9); }
      break;
    case 'water:in':
      if (value(target,'moisture') >= 3) { add('moisture',-3); effects.push(stock('water',1)); }
      break;
    case 'electric:out': {
      const affinity = Math.max(0, Math.min(100, actor.colors.electric ?? 0));
      const power = outgoingDamage(actor, 6 + Math.floor(affinity / 25) * 2, true);
      if (power > 0) add('charge', power / (target.properties.maxHp ?? target.creature?.maxHp ?? 100) * 100);
      break;
    }
    case 'electric:in':
      fill('insulation',1,3); lower('status:paralyze',1); lower('status:spasm',1);
      break;
    case 'iron:out':
      fill('hardness',3,12);
      if (living(target)) { fill('guard',8,12); fill('status:ward',2,2); }
      break;
    case 'iron:in': lower('hardness',4); break;
    case 'earth:out':
      if (living(target)) fill('status:anchored',2,2);
      else if ((target.kind === 'terrain' || value(target,'soil') > 0) && !value(target,'solid') && target.pos &&
        !Object.values(world.entities).some(e => e.id !== target.id && e.nodeId === target.nodeId && e.pos && !e.carriedBy &&
          distance(e.pos,target.pos!) === 0 && (value(e,'integrity') > 0) && (living(e) || value(e,'solid') > 0))) {
        effects.push(stock('i-life-ore',-1)); add('solid',1); fill('hardness',3,8);
      }
      break;
    case 'earth:in':
      if (living(target)) lower('status:anchored',2);
      else if (value(target,'solid') > 0) { lower('solid',1); lower('hardness',2); }
      break;
    case 'wind:out':
    case 'wind:in': {
      if (id === 'wind:out') lower('smoke',4);
      const capacity = 2 + Math.floor(Math.max(0, Math.min(100, actor.colors.wind ?? 0)) / 25);
      if (actor.id === target.id || !actor.pos || !target.pos || target.carriedBy ||
        (!living(target) && value(target,'portable') <= 0) || (target.properties.mass ?? 1) > capacity || status(target,'anchored')) break;
      const dx = target.pos.x - actor.pos.x, dy = target.pos.y - actor.pos.y;
      if (!dx && !dy) break;
      const sign = id === 'wind:out' ? 1 : -1;
      const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx)*sign, y:0 } : { x:0, y:Math.sign(dy)*sign };
      const pos = { x:target.pos.x + step.x, y:target.pos.y + step.y };
      if (walkable(world,target.nodeId,pos,target.id)) effects.push({kind:'relocate',pos});
      break;
    }
    case 'light:out': fill('light',3,12); break;
    case 'light:in':
      lower('status:sleep',2); lower('status:drowsy',2); lower('status:confusion',2);
      if (target.production?.careProperty === 'attention') fill('attention',3,30);
      break;
    case 'dark:out': fill('smoke',4,6); break;
    case 'dark:in':
      if (living(target) && !status(target,'sleep')) add('status:drowsy',2);
      lower('attention',3);
      break;
  }
  return effects;
}

/** Build an ordinary atomic world transaction. Execution, time and visual feedback remain in the field adapter. */
export function colorOperationAction(world: InteractionWorld, actorId: string, targetId: string, operationId: string): InteractionAction | undefined {
  const definition = colorOperationDefinition(operationId), actor = world.entities[actorId], target = world.entities[targetId];
  if (!definition || !actor || !target) return;
  const effects = operationEffects(world, actor, target, definition.id);
  if (!effects.length) return;
  return { id:'color:' + definition.id, label:definition.label, description:definition.description, duration:0,
    reach:definition.reach, requires:{actorMin:{mana:definition.mana}},
    effects:[influence('mana',-definition.mana,'actor'),...effects],
  };
}
export function colorOperationDisabled(world: InteractionWorld, actorId: string, targetId: string, action?: InteractionAction): string | undefined {
  const actor = world.entities[actorId], target = world.entities[targetId];
  if (!actor || !target) return '대상을 찾을 수 없다.';
  if (!action) return '이 대상에는 변화를 만들 수 없다.';
  const restricted = actionRestriction(actor);
  if (restricted) return restricted;
  if (!hasSight(world,actor,target)) return '대상이 보이지 않는다.';
  if(target.kind==='actor'&&status(target,'ghost')&&(status(actor,'ghost')||actor.pos&&target.pos&&distance(actor.pos,target.pos)>1)&&
    action.effects.some(e=>e.kind==='influence'&&e.side!=='actor'&&['force','charge'].includes(e.property)&&e.amount>0))return '닿지 않는다.';
  return interactionDisabled(world,actorId,targetId,action);
}
export interface ColorOperationOffer extends ColorOperationDefinition {
  enabled: boolean;
  reason?: string;
  action?: InteractionAction;
}
export function colorOperationOffers(world: InteractionWorld, actorId: string, targetId: string, color?: Element): ColorOperationOffer[] {
  return COLOR_OPERATION_DEFS.filter(d => !color || d.color === color).map(definition => {
    const action = colorOperationAction(world,actorId,targetId,definition.id);
    const reason = colorOperationDisabled(world,actorId,targetId,action);
    return {...definition,action,enabled:!reason,...(reason?{reason}:{})};
  });
}
