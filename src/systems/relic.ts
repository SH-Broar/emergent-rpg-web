/**
 * 유물 효과 시스템.
 *
 * 유물의 trigger별로 *적절한 시점*에 핸들러를 호출.
 * 효과는 *데이터 드리븐* — kind 문자열로 핸들러 매핑.
 *
 * MVR 단계 효과 (1회성 trigger 기반):
 *  - bonus-hp:N         passive  (시작 시 maxHp +N + hp +N)
 *  - bonus-mana:N       on-combat-start (전투 시작 시 mana +N — 1회성 보너스)
 *  - bonus-gold:N       on-combat-end (전투 승리 시 gold +N)
 *  - discount:N         passive (제작 비용 N 비율 할인 — Village/Workshop이 조회)
 *
 * 합산형 modifier (조회 시점 합산, passive 상시 적용):
 *  - damage-out-add:N   출력 데미지에 +N
 *  - damage-out-mul:N   출력 데미지에 ×N
 *  - damage-in-mul:N    받는 데미지에 ×N
 *  - block-out-add:N    출력 block에 +N
 *  - draw-extra-add:N   매 턴 핸드사이즈에 +N
 *  - mana-extra-add:N   매 턴 마나 한도에 +N
 *  - cost-mod-add:N     카드 cost에 +N (음수면 할인)
 *
 * 호환 alias (옛 데이터/세이브 정규화):
 *  - bonus-damage:N  → damage-out-add:N
 */

import type {
  CombatState,
  Relic,
  RelicEffect,
  RelicTriggerKind,
  RunState,
} from '@/data/schemas';
import { useRunStore } from '@/stores/run';

// ========== Modifier 인프라 ==========

/** 합산형 modifier kind. trigger 기반 효과와는 별도. */
export type RelicModifierKind =
  | 'damage-out-add'
  | 'damage-out-mul'
  | 'damage-in-mul'
  | 'block-out-add'
  | 'draw-extra-add'
  | 'mana-extra-add'
  | 'cost-mod-add';

/** 옛 데이터/세이브의 effect.kind 문자열을 새 modifier kind로 정규화. */
const RELIC_KIND_ALIASES: Record<string, string> = {
  'bonus-damage': 'damage-out-add',
};

/** 옛 데이터/세이브의 trigger 문자열을 새 trigger로 정규화. */
const RELIC_TRIGGER_ALIASES: Partial<Record<RelicTriggerKind, RelicTriggerKind>> = {
  'on-card-play': 'on-card-played-after',
};

/** effect.kind 정규화 (alias 적용). */
function normalizeKind(kind: string): string {
  return RELIC_KIND_ALIASES[kind] ?? kind;
}

/** trigger 문자열 정규화 (alias 적용). */
function normalizeTrigger(t: RelicTriggerKind): RelicTriggerKind {
  return RELIC_TRIGGER_ALIASES[t] ?? t;
}

/**
 * modifier 조회 컨텍스트 — 본 라운드는 빈 객체.
 * 다음 라운드에 cardId, element, targetIsElite 등 조건부 modifier 자리.
 */
export interface ModCtx {
  cardId?: string;
  element?: string;
}

/** 합산(add) modifier 조회 — 모든 활성 유물의 해당 kind 효과를 더함. */
export function getModifierAdd(kind: RelicModifierKind, _ctx?: ModCtx): number {
  void _ctx;
  let total = 0;
  try {
    const run = useRunStore();
    for (const relic of run.data.relics) {
      for (const eff of relic.effects) {
        if (normalizeKind(eff.kind) === kind) {
          total += eff.value ?? 0;
        }
      }
    }
  } catch {
    /* store 미접근 가능 */
  }
  return total;
}

/** 곱셈(mul) modifier 조회 — 모든 활성 유물의 해당 kind 효과를 곱함 (base 1). */
export function getModifierMul(kind: RelicModifierKind, _ctx?: ModCtx): number {
  void _ctx;
  let product = 1;
  try {
    const run = useRunStore();
    for (const relic of run.data.relics) {
      for (const eff of relic.effects) {
        if (normalizeKind(eff.kind) === kind) {
          product *= eff.value ?? 1;
        }
      }
    }
  } catch {
    /* store 미접근 가능 */
  }
  return product;
}

/**
 * base 값에 add/mul modifier를 한 번에 적용.
 * 공식: clampMin0( round( (base + Σ add) × Π mul ) ).
 * mulKind가 null이면 곱셈 단계 생략 (mul=1과 동치).
 */
export function applyModifiers(
  base: number,
  addKind: RelicModifierKind,
  mulKind: RelicModifierKind | null = null,
  ctx?: ModCtx,
): number {
  const add = getModifierAdd(addKind, ctx);
  const mul = mulKind ? getModifierMul(mulKind, ctx) : 1;
  return Math.max(0, Math.round((base + add) * mul));
}

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

/**
 * 모든 활성 유물에서 해당 trigger를 가진 것을 호출.
 * alias 정규화 적용: 데이터의 `on-card-play`는 `on-card-played-after` 시점에 매칭.
 */
export function fireRelicTrigger(trigger: RelicTriggerKind, ctx: RelicContext) {
  const target = normalizeTrigger(trigger);
  for (const relic of ctx.run.relics) {
    if (normalizeTrigger(relic.trigger) === target) {
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

/**
 * 데미지 보너스 합산 (카드 효과 *전* 호출용).
 * @deprecated `getModifierAdd('damage-out-add')` 또는 `applyModifiers(base, 'damage-out-add', 'damage-out-mul')` 사용 권장.
 *             다음 라운드에서 제거 예정.
 */
export function getDamageBonus(): number {
  return getModifierAdd('damage-out-add');
}
