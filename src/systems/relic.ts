/**
 * 유물 효과 시스템.
 *
 * 유물의 trigger별로 *적절한 시점*에 핸들러를 호출.
 * 효과는 *데이터 드리븐* — kind 문자열로 핸들러 매핑.
 *
 * MVR 단계 효과:
 *  - bonus-hp:N         passive  (시작 시 maxHp +N + hp +N)
 *  - bonus-mana:N       on-combat-start (전투 시작 시 mana +N — 1회성 보너스)
 *  - bonus-gold:N       on-combat-end (전투 승리 시 gold +N)
 *  - bonus-damage:N     on-card-play (모든 damage 효과 +N)
 *  - discount:N         passive (제작 비용 N 비율 할인 — Village/Workshop이 조회)
 */

import type {
  CombatState,
  Relic,
  RelicEffect,
  RelicTriggerKind,
  RunState,
} from '@/data/schemas';
import { useRunStore } from '@/stores/run';

/** 효과 핸들러 컨텍스트 — trigger에 따라 일부 필드 없음. */
export interface RelicContext {
  run: RunState;
  combat?: CombatState;
  triggeredBy?: string;   // 'card-play' 시 카드 id 등
}

export type RelicEffectHandler = (effect: RelicEffect, ctx: RelicContext) => void;

const HANDLERS: Record<string, RelicEffectHandler> = {
  'bonus-hp': (eff, ctx) => {
    const n = eff.value ?? 0;
    ctx.run.maxHp += n;
    ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + n);
  },
  'bonus-mana': (eff, ctx) => {
    if (!ctx.combat) return;
    const n = eff.value ?? 0;
    ctx.combat.mana += n;
    ctx.combat.maxMana += n;
  },
  'bonus-gold': (eff, ctx) => {
    ctx.run.gold += eff.value ?? 0;
  },
  'bonus-damage': (eff, ctx) => {
    if (!ctx.combat) return;
    // 직접 데미지 보정은 combat 시스템에서 사용. 여기선 다음 데미지에 적용될 *임시 보너스*만 등록.
    // 현재는 *카드 사용 직후* 호출되므로 효과는 이미 적용된 후 — TODO: 카드 사용 *전* 훅으로.
    void eff;
  },
  discount: (_eff, _ctx) => {
    // 제작 비용 할인 — Village/Workshop이 useDiscount()로 *조회*. 핸들러 호출은 패시브로 등록만.
  },
};

/** 한 유물의 효과들을 trigger 시점에 호출. */
function fire(relic: Relic, ctx: RelicContext) {
  if (relic.effects.length === 0 && !relic.customEffectId) return;
  for (const effect of relic.effects) {
    const handler = HANDLERS[effect.kind];
    if (handler) handler(effect, ctx);
  }
  // customEffectId 함수 슬롯은 추후
}

/** 모든 활성 유물에서 해당 trigger를 가진 것을 호출. */
export function fireRelicTrigger(trigger: RelicTriggerKind, ctx: RelicContext) {
  for (const relic of ctx.run.relics) {
    if (relic.trigger === trigger) {
      fire(relic, ctx);
    }
  }
}

/** 게임 시작 시점: passive 유물을 1회 적용. */
export function applyPassiveRelicsAtRunStart() {
  const run = useRunStore();
  for (const relic of run.data.relics) {
    if (relic.trigger === 'passive') {
      fire(relic, { run: run.data });
    }
  }
}

/** 전투 시작 시: on-combat-start 발동. */
export function onCombatStart() {
  const run = useRunStore();
  fireRelicTrigger('on-combat-start', { run: run.data, combat: run.data.combat });
}

/** 전투 종료 시 (승리): on-combat-end 발동. */
export function onCombatEnd() {
  const run = useRunStore();
  fireRelicTrigger('on-combat-end', { run: run.data });
}

/** 노드 진입 시: on-node-enter 발동. */
export function onNodeEnter(nodeId: string) {
  const run = useRunStore();
  fireRelicTrigger('on-node-enter', { run: run.data, triggeredBy: nodeId });
}

/** 휴식 노드 시: on-rest 발동. */
export function onRest() {
  const run = useRunStore();
  fireRelicTrigger('on-rest', { run: run.data });
}

/** 카드 사용 직후: on-card-play 발동. */
export function onCardPlay(cardId: string) {
  const run = useRunStore();
  fireRelicTrigger('on-card-play', { run: run.data, combat: run.data.combat, triggeredBy: cardId });
}

/** 제작 할인율 조회 — discount kind 효과 합산. 0.0 ~ 1.0 (0.3 = 30% 할인). */
export function getCraftingDiscount(): number {
  const run = useRunStore();
  let total = 0;
  for (const relic of run.data.relics) {
    for (const eff of relic.effects) {
      if (eff.kind === 'discount') {
        total += eff.value ?? 0;
      }
    }
  }
  return Math.min(0.9, total);
}

/** 데미지 보너스 합산 (카드 효과 *전* 호출용). */
export function getDamageBonus(): number {
  const run = useRunStore();
  let total = 0;
  for (const relic of run.data.relics) {
    for (const eff of relic.effects) {
      if (eff.kind === 'bonus-damage') {
        total += eff.value ?? 0;
      }
    }
  }
  return total;
}
