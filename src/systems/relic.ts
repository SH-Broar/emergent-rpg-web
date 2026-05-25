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
import { useDataStore } from '@/stores/data';
import { drawCards, instantiateCard } from '@/systems/deck';
import { rng } from '@/systems/rng';
import { applyColorBoost, applyColorBoostAll, type ColorKey } from '@/systems/colors';
import { deriveStats } from '@/systems/stats';
// 유물발 방어도 block 락 progress 에 반영(QA Medium-1) — 카드/포션과 동일 경로.
// locks.ts 는 타입+ui store 만 의존하므로 relic.ts↔combat.ts 순환을 만들지 않는다.
import { gainPlayerBlock } from '@/systems/locks';

const ALL_8_COLORS: ColorKey[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];

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
  /** 이 효과를 발동시킨 유물 — fire()가 주입. 카운터 키 등에 사용. */
  relic?: Relic;
  /** on-damage-taken 등에서 전달되는 피해량. */
  amount?: number;
}

export type RelicEffectHandler = (effect: RelicEffect, ctx: RelicContext) => void;

// ===== 신규 효과 헬퍼 =====

/** 공격 카드 판정 — 데미지 계열 효과를 하나라도 가진 카드. */
const DAMAGE_EFFECT_KINDS = new Set<string>([
  'damage', 'damage-min-color', 'damage-top-color', 'damage-color-count',
  'damage-per-debuff', 'consume-vulnerable', 'damage-from-hp', 'damage-per-hand',
  'block-to-damage', 'spend-all-energy', 'damage-per-companion', 'damage-per-relic',
  'growing-damage',
]);

/** triggeredBy 카드 id가 *공격 카드*인지 — 데이터 정의로 판정. */
function isAttackCardId(id: string | undefined): boolean {
  if (!id) return false;
  const card = useDataStore().cards.get(id);
  if (!card) return false;
  return card.effects.some((e) => DAMAGE_EFFECT_KINDS.has(e.kind));
}

/** 손패 상한 — 다른 드로우 경로(rize-relay 등)와 일관. */
const MAX_HAND_SIZE = 10;

/** 덱에서 n장 손패로 (10장 캡 적용, drawCards 정책: drawPile 소진 시 discard 셔플). */
function drawIntoHand(c: CombatState, n: number): void {
  const count = Math.min(n, MAX_HAND_SIZE - c.hand.length);
  if (count <= 0) return;
  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, count);
  c.hand.push(...drawn);
  c.drawPile = newDrawPile;
  c.discardPile = newDiscardPile;
  // 유물발 드로우도 on-draw 발동(장수만큼). damage-enemy 등은 카드를 뽑지 않으므로 재귀 없음.
  fireOnDraw(c, drawn.length);
}

/** 플레이어에게 상태 부여 (스택 누적). */
function applyStatusToPlayer(c: CombatState, status: string, v: number): void {
  if (!status || v === 0) return;
  c.player.statuses[status] = (c.player.statuses[status] ?? 0) + v;
}

/** 적에게 직접 피해 (vulnerable 반영, block 흡수). retaliate 전용 간이 경로. */
function damageEnemyDirect(c: CombatState, v: number): void {
  let dmg = Math.max(0, v);
  if ((c.enemy.statuses?.vulnerable ?? 0) > 0) dmg = Math.floor(dmg * 1.5);
  const absorbed = Math.min(c.enemy.block, dmg);
  c.enemy.block -= absorbed;
  c.enemy.hp = Math.max(0, c.enemy.hp - (dmg - absorbed));
}

/** 무작위 컬러 +v. */
function boostRandomColor(v: number): void {
  if (v === 0) return;
  const color = ALL_8_COLORS[Math.floor(rng() * ALL_8_COLORS.length)];
  applyColorBoost(color, v);
}

/** 유물별 독립 카운터 +1 후 현재값 반환. */
function bumpCounter(c: CombatState, relicId: string | undefined, name: string): number {
  if (!c.relicCounters) c.relicCounters = {};
  const key = `${relicId ?? '?'}:${name}`;
  const next = (c.relicCounters[key] ?? 0) + 1;
  c.relicCounters[key] = next;
  return next;
}

/** 유물별 카운터 리셋. */
function resetCounter(c: CombatState, relicId: string | undefined, name: string): void {
  if (!c.relicCounters) return;
  c.relicCounters[`${relicId ?? '?'}:${name}`] = 0;
}

/** ATK/DEF/MAG ↔ 기반 컬러쌍. boost-stat이 쌍을 동시에 올린다. */
const STAT_PAIRS: Record<string, [ColorKey, ColorKey]> = {
  atk: ['fire', 'electric'],
  def: ['earth', 'iron'],
  mag: ['water', 'wind'],
};

/**
 * 지표(arg) 현재값 — 컬러명이면 컬러값, atk/def/mag면 파생 스탯.
 * 컬러 메타지표: 'top-color'=8색 중 최댓값, 'color-count'=0보다 큰 색 종류 수. (아르카나 색 공명용)
 */
function metricValue(arg: string): number {
  const colors = useRunStore().data.colors;
  if (arg === 'top-color') {
    return Math.max(0, ...Object.values(colors as Record<string, number>));
  }
  if (arg === 'color-count') {
    return Object.values(colors as Record<string, number>).filter((v) => v > 0).length;
  }
  if (arg in colors) return (colors as Record<string, number>)[arg] ?? 0;
  const s = deriveStats(colors);
  if (arg === 'atk') return s.atk;
  if (arg === 'def') return s.def;
  if (arg === 'mag') return s.mag;
  return 0;
}

/** boost-color/item-use-color 공통 — arg = 컬러명 | 'all' | 'random'. */
function boostColorArg(arg: string, v: number): void {
  if (v === 0) return;
  if (arg === 'all') applyColorBoostAll(v);
  else if (arg === 'random' || !arg) boostRandomColor(v);
  else applyColorBoost(arg as ColorKey, v);
}

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
    ctx.run.gold = Math.max(0, ctx.run.gold + (eff.value ?? 0));
  },
  'bonus-damage': (eff, ctx) => {
    if (!ctx.combat) return;
    // 직접 데미지 보정은 combat 시스템에서 사용. 여기선 다음 데미지에 적용될 *임시 보너스*만 등록.
    // 현재는 *카드 사용 직후* 호출되므로 효과는 이미 적용된 후 — TODO: 카드 사용 *전* 훅으로.
    void eff;
  },
  // value = 백분율 확률 (0~100). 발동 시 8 컬러 중 1개 +1.
  'chance-random-color-1': (eff, _ctx) => {
    void _ctx;
    const chance = (eff.value ?? 0) / 100;
    if (rng() < chance) {
      const color = ALL_8_COLORS[Math.floor(rng() * ALL_8_COLORS.length)];
      applyColorBoost(color, 1);
    }
  },
  discount: (_eff, _ctx) => {
    // 제작 비용 할인 — Village/Workshop이 useDiscount()로 *조회*. 핸들러 호출은 패시브로 등록만.
  },

  // ===== 전투 시작 (on-combat-start) =====
  'combat-start-block': (eff, ctx) => {
    if (!ctx.combat) return;
    // 전투 시작 시점엔 락이 아직 없으므로 progress 누적은 no-op(영향 없음). 경로 일원화 목적의 호출.
    gainPlayerBlock(ctx.combat, eff.value ?? 0);
  },
  'combat-start-draw': (eff, ctx) => {
    if (!ctx.combat) return;
    drawIntoHand(ctx.combat, eff.value ?? 0);
  },
  // 전투 시작 시 *특정 카드 1장*을 손에 지급. arg=cardId. (나방: 0코 2드로우·손에 남는 카드)
  // 손패 가득(10)이면 버린 더미로. 이 카드는 combat 전용 인스턴스 — 런 덱을 오염시키지 않는다.
  'combat-start-hand-card': (eff, ctx) => {
    if (!ctx.combat) return;
    const id = String(eff.params?.arg ?? '');
    if (!id) return;
    const def = useDataStore().cards.get(id);
    if (!def) return;
    const inst = instantiateCard(def);
    if (ctx.combat.hand.length < 10) ctx.combat.hand.push(inst);
    else ctx.combat.discardPile.push(inst);
  },
  // 색 → 자원 전환 (아르카나 색 공명). value=제수, arg=지표(top-color/color-count 등).
  // 전투 시작 시 마나 += floor(지표/제수). 모아 온 색이 짙을수록 매 전투 더 많은 에너지.
  'combat-start-mana-from-metric': (eff, ctx) => {
    if (!ctx.combat) return;
    const div = eff.value ?? 0;
    if (div <= 0) return;
    const n = Math.floor(metricValue(String(eff.params?.arg ?? '')) / div);
    if (n <= 0) return;
    ctx.combat.mana += n;
    ctx.combat.maxMana += n;
  },
  // 색 → 드로우 전환. 전투 시작 시 카드 floor(지표/제수)장 더 뽑기.
  'combat-start-draw-from-metric': (eff, ctx) => {
    if (!ctx.combat) return;
    const div = eff.value ?? 0;
    if (div <= 0) return;
    const n = Math.floor(metricValue(String(eff.params?.arg ?? '')) / div);
    if (n > 0) drawIntoHand(ctx.combat, n);
  },
  'combat-start-status': (eff, ctx) => {
    if (!ctx.combat) return;
    applyStatusToPlayer(ctx.combat, String(eff.params?.arg ?? eff.params?.status ?? ''), eff.value ?? 0);
  },

  // ===== 턴 시작 (on-turn-start) =====
  'turn-start-block': (eff, ctx) => {
    if (!ctx.combat) return;
    gainPlayerBlock(ctx.combat, eff.value ?? 0);
  },
  'turn-start-hp-loss': (eff, ctx) => {
    if (!ctx.combat) return;
    ctx.combat.player.hp = Math.max(1, ctx.combat.player.hp - (eff.value ?? 0));
  },

  // ===== 회복 (on-combat-end / on-node-enter / on-rest) =====
  'combat-end-heal': (eff, ctx) => {
    ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + (eff.value ?? 0));
  },
  'node-enter-heal': (eff, ctx) => {
    ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + (eff.value ?? 0));
  },

  // ===== 카운터형 (on-card-played-after) — value = 주기 N. 카운터 키는 eff.kind로 격리 =====
  'cards-to-draw': (eff, ctx) => {
    if (!ctx.combat) return;
    const n = eff.value ?? 8;
    if (bumpCounter(ctx.combat, ctx.relic?.id, eff.kind) >= n) {
      resetCounter(ctx.combat, ctx.relic?.id, eff.kind);
      drawIntoHand(ctx.combat, 1);
    }
  },
  'cards-to-color': (eff, ctx) => {
    if (!ctx.combat) return;
    const n = eff.value ?? 5;
    if (bumpCounter(ctx.combat, ctx.relic?.id, eff.kind) >= n) {
      resetCounter(ctx.combat, ctx.relic?.id, eff.kind);
      boostRandomColor(1);
    }
  },
  'attacks-to-strength': (eff, ctx) => {
    if (!ctx.combat || !isAttackCardId(ctx.triggeredBy)) return;
    const n = eff.value ?? 4;
    if (bumpCounter(ctx.combat, ctx.relic?.id, eff.kind) >= n) {
      resetCounter(ctx.combat, ctx.relic?.id, eff.kind);
      applyStatusToPlayer(ctx.combat, 'strength', 1);
    }
  },
  'attacks-to-color': (eff, ctx) => {
    if (!ctx.combat || !isAttackCardId(ctx.triggeredBy)) return;
    const n = eff.value ?? 3;
    if (bumpCounter(ctx.combat, ctx.relic?.id, eff.kind) >= n) {
      resetCounter(ctx.combat, ctx.relic?.id, eff.kind);
      boostRandomColor(1);
    }
  },

  // ===== 반응형 (on-damage-taken) =====
  'hurt-to-color': (eff, _ctx) => {
    boostRandomColor(eff.value ?? 0);
  },
  retaliate: (eff, ctx) => {
    if (!ctx.combat) return;
    damageEnemyDirect(ctx.combat, eff.value ?? 0);
  },
  // 현재 적에게 직접 N 피해 (vulnerable 반영·block 흡수). on-draw 등에서 사용 (나방 바람결 깃).
  'damage-enemy': (eff, ctx) => {
    if (!ctx.combat) return;
    damageEnemyDirect(ctx.combat, eff.value ?? 0);
  },
  'hurt-to-block': (eff, ctx) => {
    if (!ctx.combat) return;
    gainPlayerBlock(ctx.combat, eff.value ?? 0);
  },

  // ===== 컬러/스탯 영구 상승 (트리거-무관: on-acquire / on-node-enter / on-combat-end / on-turn-start / on-rest / on-item-use / on-color-gain) =====
  // arg = 컬러명 | 'all' | 'random'.
  'boost-color': (eff, _ctx) => {
    boostColorArg(String(eff.params?.arg ?? 'random'), eff.value ?? 0);
  },
  // arg = 'atk' | 'def' | 'mag' — 기반 컬러쌍을 동시에 value만큼.
  'boost-stat': (eff, _ctx) => {
    const pair = STAT_PAIRS[String(eff.params?.arg ?? '')];
    if (!pair) return;
    const v = eff.value ?? 0;
    applyColorBoost(pair[0], v);
    applyColorBoost(pair[1], v);
  },

  // ===== 스케일링 (현재 컬러/스탯에 비례, 전투 트리거에서) — value = 제수, arg = 지표 =====
  'block-from-metric': (eff, ctx) => {
    if (!ctx.combat) return;
    const div = eff.value ?? 10;
    if (div <= 0) return;
    gainPlayerBlock(ctx.combat, Math.floor(metricValue(String(eff.params?.arg ?? '')) / div));
  },
  'strength-from-metric': (eff, ctx) => {
    if (!ctx.combat) return;
    const div = eff.value ?? 10;
    if (div <= 0) return;
    applyStatusToPlayer(ctx.combat, 'strength', Math.floor(metricValue(String(eff.params?.arg ?? '')) / div));
  },

  // ===== 턴 수 연동 (on-turn-start) =====
  // 턴 번호 × value 방어 (스노볼).
  'turn-start-block-snowball': (eff, ctx) => {
    if (!ctx.combat) return;
    gainPlayerBlock(ctx.combat, (ctx.combat.turn ?? 1) * (eff.value ?? 0));
  },
  // 턴 ≥ arg 부터 매 턴 힘 +value (후반 가속).
  'turn-after-strength': (eff, ctx) => {
    if (!ctx.combat) return;
    const n = Number(eff.params?.arg ?? 4);
    if ((ctx.combat.turn ?? 1) >= n) applyStatusToPlayer(ctx.combat, 'strength', eff.value ?? 1);
  },
  // 턴 ≤ arg 까지 매 턴 방어 +value (전반 보호).
  'turn-before-block': (eff, ctx) => {
    if (!ctx.combat) return;
    const n = Number(eff.params?.arg ?? 3);
    if ((ctx.combat.turn ?? 1) <= n) gainPlayerBlock(ctx.combat, eff.value ?? 0);
  },
  // 턴 번호의 1의 자리 == arg 일 때 무작위 컬러 +value (창의적 연계).
  'turn-units-color': (eff, ctx) => {
    if (!ctx.combat) return;
    const d = Number(eff.params?.arg ?? 0);
    if (((ctx.combat.turn ?? 1) % 10) === d) boostRandomColor(eff.value ?? 1);
  },

  // ===== 즉시 자원 (on-acquire / on-item-use / on-color-gain / on-node-enter 등) =====
  'gain-time-shards': (eff, ctx) => {
    ctx.run.timeShards = Math.max(0, (ctx.run.timeShards ?? 0) + (eff.value ?? 0));
  },
  'heal-now': (eff, ctx) => {
    const v = eff.value ?? 0;
    // 전투 중이면 전투 hp(c.player.hp)를, 그 외엔 런 hp를 회복.
    if (ctx.combat) {
      ctx.combat.player.hp = Math.min(ctx.combat.player.maxHp, ctx.combat.player.hp + v);
    } else {
      ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + v);
    }
  },
  // arg = cardId — 컬렉션에 카드 1장 추가 (on-acquire 전용 권장).
  'gain-card': (eff, _ctx) => {
    const id = String(eff.params?.arg ?? '');
    if (!id) return;
    const card = useDataStore().cards.get(id);
    if (card) useRunStore().addCardToCollection(card);
  },
};

/** 한 유물의 효과들을 trigger 시점에 호출. */
function fire(relic: Relic, ctx: RelicContext) {
  if (relic.effects.length === 0 && !relic.customEffectId) return;
  // 카운터형 핸들러가 발동 유물을 식별할 수 있도록 relic 주입.
  const localCtx: RelicContext = { ...ctx, relic };
  for (const effect of relic.effects) {
    const handler = HANDLERS[effect.kind];
    if (handler) handler(effect, localCtx);
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

/**
 * 유물 *획득* 중앙 진입점 — 보유 목록 추가 + 미발견 기록 + 즉시 발동.
 *  - trigger === 'on-acquire': 효과 1회 즉시 발동 (영구 강화/즉시 자원).
 *  - trigger === 'passive': bonus-hp 등 패시브 핸들러 1회 즉시 적용
 *    (modifier 계열은 핸들러 없어 no-op — 조회 시점 합산이라 무관).
 * 런 시작 종족 유물은 RaceSelect가 직접 push + applyPassiveRelicsAtRunStart로 처리
 * (이 함수를 거치지 않아 패시브 이중발동 없음).
 */
export function acquireRelic(relic: Relic): void {
  const run = useRunStore();
  const r = run.data;
  r.relics.push(relic);
  if (!r.newRelicEncounters.includes(relic.id)) r.newRelicEncounters.push(relic.id);
  const t = normalizeTrigger(relic.trigger);
  if (t === 'on-acquire' || t === 'passive') {
    fire(relic, { run: r });
  }
}

/**
 * 컬러 상승 시 호출되는 훅 — colors.ts의 setColorGainHook으로 등록 (main.ts).
 * on-color-gain 유물 효과를 발동. colors.ts↔relic.ts 순환을 피하려 콜백 주입 방식.
 * (재진입 가드는 colors.ts applyColorBoost가 담당.)
 */
export function fireColorGain(color: string, delta: number): void {
  const run = useRunStore();
  if (!run.data.relics.length) return;
  fireRelicTrigger('on-color-gain', { run: run.data, combat: run.data.combat, amount: delta, triggeredBy: color });
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

/**
 * 전투 중 카드를 드로우할 때: on-draw 발동 *드로운 장수만큼*(1장당 1회).
 * combat이 있어야(전투 중) 발동 — 전투 밖 드로우는 무의미하므로 호출자가 combat 유무로 가드.
 * 핸들러(damage-enemy 등)는 카드를 *뽑지 않으므로* 재귀/무한루프 없음.
 * combat 인자는 호출자(combat.ts/item.ts)가 직접 넘긴다(useRunStore().data.combat과 동일 참조).
 */
export function fireOnDraw(combat: CombatState | undefined, count: number): void {
  if (!combat || count <= 0) return;
  const run = useRunStore();
  if (!run.data.relics.length) return;
  for (let i = 0; i < count; i++) {
    fireRelicTrigger('on-draw', { run: run.data, combat });
  }
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

/**
 * `skip-turn-every:N` 효과 합산 — 가장 작은 N 반환 (보유 유물 중 가장 빈번한 절약).
 * 없으면 0. r-postman-mail이 대표. state 인자로 받음 (순환 의존 회피).
 */
export function getSkipTurnEveryN(state: RunState): number {
  let smallestN = 0;
  for (const relic of state.relics) {
    for (const eff of relic.effects) {
      if (eff.kind === 'skip-turn-every') {
        const n = eff.value ?? 0;
        if (n > 0 && (smallestN === 0 || n < smallestN)) smallestN = n;
      }
    }
  }
  return smallestN;
}

/** 활동(주사위) 관련 유물 modifier 종류. trigger 무관, 조회 시점 합산(passive). */
export type ActivityModifierKind =
  | 'activity-success-add'   // 활동 성공 확률에 +N (절대 %p)
  | 'activity-reward-mul';   // 활동 성공 보상 배율에 +N (0.5 = +50%)

/**
 * 활동 modifier 합산 — 보유 유물의 해당 kind effect.value를 모두 더함.
 * getCraftingDiscount/getSkipTurnEveryN과 같은 조회형(트리거 무관). 활동 시스템(activity.ts)이 조회.
 */
export function getActivityModifier(kind: ActivityModifierKind): number {
  let total = 0;
  try {
    const run = useRunStore();
    for (const relic of run.data.relics) {
      for (const eff of relic.effects) {
        if (eff.kind === kind) total += eff.value ?? 0;
      }
    }
  } catch {
    /* store 미접근 가능 */
  }
  return total;
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
