/**
 * 유물 효과 *격자 전투 적용* 계층 (신규).
 *
 * 구 systems/relic.ts의 트리거 핸들러는 1v1 CombatState(c.enemy 단일 타깃·c.hand 등)에
 * 직접 쓰기 때문에 격자(GridCombatState: player + enemies[])에 그대로 못 맞는다.
 * 그래서 *상태-무관* 부분(modifier 조회 getModifierAdd/Mul·applyModifiers·getDamageBonus)만
 * 재사용하고, 트리거별 *상태 변형*은 여기서 GridCombatState에 맞게 다시 적는다.
 *
 * 구 combat.ts가 부르던 시점을 격자 엔진(grid-combat.ts)이 그대로 미러:
 *   전투 시작 / 라운드(턴) 시작 / 카드 사용 후 / 드로우 / 피해 받음 / 전투 종료.
 *
 * === 로드아웃 규칙 (project loadout) ===
 * "활성 유물 = 패시브/즉발 전부 + 전투형 중 로드아웃(run.combatLoadout, 비면 자동 cap까지)".
 *  - 전투형(combatType) 유물은 state.loadout(=resolveLoadout 결과)에 든 것만 발동.
 *  - 비-전투형(패시브·즉발)은 한도와 무관하게 상시 적용 → run.relics에서 직접 본다.
 * 구 relic.ts의 modifier 게터(getModifierAdd 등)는 run.relics *전체*를 합산하므로
 * 로드아웃을 어기지 않도록 여기 *격자 전용 게터*(activeGridRelics 기준)를 새로 둔다.
 *
 * === enemy 단일 타깃 가정 효과 ===
 * retaliate(반격)·damage-enemy 등 구 코드의 "현재 적 1마리" 가정은 *가장 가까운 살아 있는 적*에 적용.
 * (호출자가 nearest 적을 주입 — grid-combat.ts가 nearestEnemy로 해석.)
 */

import type { GridCombatState, GridCombatant, Relic, RelicEffect } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { isCombatType } from './loadout';
import { applyColorBoost, applyColorBoostAll, type ColorKey } from './colors';
import { deriveStats } from './stats';
import { rng } from './rng';

const ALL_8_COLORS: ColorKey[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];

/** effect.kind alias 정규화(구 데이터 호환) — relic.ts와 동일. */
const RELIC_KIND_ALIASES: Record<string, string> = { 'bonus-damage': 'damage-out-add' };
function normalizeKind(kind: string): string {
  return RELIC_KIND_ALIASES[kind] ?? kind;
}

/** trigger alias 정규화 — relic.ts와 동일(on-card-play → on-card-played-after). */
function normalizeTrigger(t: string): string {
  return t === 'on-card-play' ? 'on-card-played-after' : t;
}

/**
 * 이 격자 전투에서 *발동 가능한* 유물 목록 — 로드아웃 규칙 적용.
 *  - 전투형(combatType): state.loadout(resolveLoadout 결과)에 든 것만.
 *  - 비-전투형(패시브·즉발): run.relics에서 전부(상시 적용).
 * loadout이 비어 있으면(옛 세이브) 전투형도 run.relics에서 전부 본다(안전 폴백 — 무동작 방지).
 */
export function activeGridRelics(state: GridCombatState): Relic[] {
  let all: Relic[] = [];
  try {
    all = useRunStore().data.relics ?? [];
  } catch {
    return state.loadout ?? [];
  }
  const loadoutIds = new Set((state.loadout ?? []).map((r) => r.id));
  const loadoutEmpty = loadoutIds.size === 0;
  const out: Relic[] = [];
  for (const relic of all) {
    if (isCombatType(relic)) {
      // 전투형 — 로드아웃에 든 것만(로드아웃 비면 전부 폴백).
      if (loadoutEmpty || loadoutIds.has(relic.id)) out.push(relic);
    } else {
      // 비-전투형(패시브·즉발) — 상시.
      out.push(relic);
    }
  }
  return out;
}

// ============================================================================
// 격자 전용 modifier 게터 (활성 유물 기준 합산 — 로드아웃 규칙 준수)
// ----------------------------------------------------------------------------
// 구 relic.ts getModifierAdd/Mul은 run.relics 전체를 보므로 로드아웃을 어긴다.
// 격자는 activeGridRelics 기준으로 다시 합산한다.
// ============================================================================

function sumAdd(state: GridCombatState, kind: string): number {
  let total = 0;
  for (const relic of activeGridRelics(state)) {
    for (const eff of relic.effects) {
      if (normalizeKind(eff.kind) === kind) total += eff.value ?? 0;
    }
  }
  return total;
}

function prodMul(state: GridCombatState, kind: string): number {
  let product = 1;
  for (const relic of activeGridRelics(state)) {
    for (const eff of relic.effects) {
      if (normalizeKind(eff.kind) === kind) product *= eff.value ?? 1;
    }
  }
  return product;
}

/** 주는 피해 보너스(가법) — damage-out-add(+ bonus-damage alias). */
export function gridDamageAdd(state: GridCombatState): number {
  return sumAdd(state, 'damage-out-add');
}
/** 주는 피해 배율(곱) — damage-out-mul. */
export function gridDamageMul(state: GridCombatState): number {
  return prodMul(state, 'damage-out-mul');
}
/** 받는 피해 배율(곱) — damage-in-mul. */
export function gridDamageInMul(state: GridCombatState): number {
  return prodMul(state, 'damage-in-mul');
}
/** 방어 보너스(가법) — block-out-add. */
export function gridBlockAdd(state: GridCombatState): number {
  return sumAdd(state, 'block-out-add');
}
/** 매 라운드 핸드사이즈 가산 — draw-extra-add. */
export function gridDrawExtra(state: GridCombatState): number {
  return sumAdd(state, 'draw-extra-add');
}
/** 매 라운드 마나 한도 가산 — mana-extra-add. */
export function gridManaExtra(state: GridCombatState): number {
  return sumAdd(state, 'mana-extra-add');
}
/** 카드 cost 보정(가법, 음수=할인) — cost-mod-add. */
export function gridCostMod(state: GridCombatState): number {
  return sumAdd(state, 'cost-mod-add');
}

/**
 * 주는 피해에 유물 보너스 적용 — base에 add를 더하고 mul을 곱한다(combat.ts applyModifiers 패턴).
 * 격자 applyDamage 직전 *카드/공격 피해 산출 시점*에 호출.
 */
export function applyDamageRelicMods(state: GridCombatState, base: number): number {
  const add = gridDamageAdd(state);
  const mul = gridDamageMul(state);
  return Math.max(0, Math.round((base + add) * mul));
}

// ============================================================================
// 트리거별 격자 적용 — GridCombatState 직접 변형
// ============================================================================

const MAX_HAND_SIZE = 10;

/** 플레이어에게 상태 부여(스택 누적). */
function addPlayerStatus(state: GridCombatState, status: string, v: number): void {
  if (!status || v === 0) return;
  state.player.statuses[status] = (state.player.statuses[status] ?? 0) + v;
}

/** 무작위 컬러 +v(런 컬러). */
function boostRandomColor(v: number): void {
  if (v === 0) return;
  applyColorBoost(ALL_8_COLORS[Math.floor(rng() * ALL_8_COLORS.length)], v);
}

/** boost-color/boost-stat 공통 — arg = 컬러명 | 'all' | 'random'. */
function boostColorArg(arg: string, v: number): void {
  if (v === 0) return;
  if (arg === 'all') applyColorBoostAll(v);
  else if (arg === 'random' || !arg) boostRandomColor(v);
  else applyColorBoost(arg as ColorKey, v);
}

const STAT_PAIRS: Record<string, [ColorKey, ColorKey]> = {
  atk: ['fire', 'electric'],
  def: ['earth', 'iron'],
  mag: ['water', 'wind'],
};

/** 지표(arg) 현재값 — 컬러/atk/def/mag/top-color/color-count. relic.ts metricValue 미러. */
function metricValue(arg: string): number {
  let colors: Record<string, number>;
  try {
    colors = useRunStore().data.colors as unknown as Record<string, number>;
  } catch {
    return 0;
  }
  if (arg === 'top-color') return Math.max(0, ...Object.values(colors));
  if (arg === 'color-count') return Object.values(colors).filter((v) => v > 0).length;
  if (arg in colors) return colors[arg] ?? 0;
  const s = deriveStats(colors as never);
  if (arg === 'atk') return s.atk;
  if (arg === 'def') return s.def;
  if (arg === 'mag') return s.mag;
  return 0;
}

/** 유물 카운터 +1 후 현재값. */
function bumpCounter(state: GridCombatState, relicId: string | undefined, name: string): number {
  if (!state.relicCounters) state.relicCounters = {};
  const key = `${relicId ?? '?'}:${name}`;
  const next = (state.relicCounters[key] ?? 0) + 1;
  state.relicCounters[key] = next;
  return next;
}
function resetCounter(state: GridCombatState, relicId: string | undefined, name: string): void {
  if (!state.relicCounters) return;
  state.relicCounters[`${relicId ?? '?'}:${name}`] = 0;
}

/** 공격 카드의 hit 수(damage 계열 효과 개수) — relic.ts attackHitCount 미러. */
const DAMAGE_EFFECT_KINDS = new Set<string>([
  'damage', 'damage-min-color', 'damage-top-color', 'damage-color-count',
  'damage-per-debuff', 'consume-vulnerable', 'damage-from-hp', 'damage-per-hand',
  'block-to-damage', 'spend-all-energy', 'damage-per-companion', 'damage-per-relic',
  'growing-damage', 'damage-low-hand', 'damage-per-cards-played', 'damage-per-confine',
  'heavy-blade', 'adaptive-strike',
]);
function attackHitCount(cardId: string | undefined): number {
  if (!cardId) return 0;
  let card;
  try {
    card = useDataStore().cards.get(cardId);
  } catch {
    return 0;
  }
  if (!card) return 0;
  let hits = 0;
  for (const e of card.effects) if (DAMAGE_EFFECT_KINDS.has(e.kind)) hits++;
  return hits;
}

/**
 * grid-combat.ts가 주입하는 격자 헬퍼 — 순환 의존 회피용.
 *  - gainBlock : 플레이어 방어 획득(juggernaut 경유 — gainPlayerBlock).
 *  - drawCards : 덱에서 n장(on-draw 재귀 포함은 호출 측이 관리).
 *  - dealNearest: 가장 가까운 적에게 직접 피해(vulnerable·block 흡수 — applyDamage).
 *  - nearest   : 가장 가까운 살아 있는 적(없으면 undefined).
 */
export interface GridRelicHooks {
  gainBlock: (state: GridCombatState, v: number) => void;
  drawCards: (state: GridCombatState, n: number) => void;
  dealNearest: (state: GridCombatState, v: number) => void;
  nearest: (state: GridCombatState) => GridCombatant | undefined;
}

// 훅 홀더 — grid-combat.ts가 *전투 시작 시점*(startGridCombat)에 1회 등록한다.
// (모듈 top-level이 아니라 함수 시점 등록이라 순환 import TDZ에 걸리지 않는다.)
let HOOKS: GridRelicHooks | undefined;

/** grid-combat.ts가 등록(idempotent). */
export function registerGridRelicHooks(h: GridRelicHooks): void {
  HOOKS = h;
}

function hooks(): GridRelicHooks {
  if (!HOOKS) {
    // 미등록(이론상 불가) — 안전 no-op.
    return {
      gainBlock: (s, v) => { if (v > 0) s.player.block += v; },
      drawCards: () => {},
      dealNearest: () => {},
      nearest: (s) => s.enemies.find((e) => e.hp > 0),
    };
  }
  return HOOKS;
}

/** 한 효과를 격자에 적용 — kind별. ctx: triggeredBy(카드 id)·relic(카운터 키). */
function applyEffect(
  state: GridCombatState,
  eff: RelicEffect,
  relic: Relic,
  triggeredBy?: string,
): void {
  const h = hooks();
  const v = eff.value ?? 0;
  switch (normalizeKind(eff.kind)) {
    // ===== 전투 시작 =====
    case 'combat-start-block':
      h.gainBlock(state, v);
      break;
    case 'combat-start-draw':
      h.drawCards(state, v);
      break;
    case 'combat-start-status':
      addPlayerStatus(state, String(eff.params?.arg ?? eff.params?.status ?? ''), v);
      break;
    case 'bonus-mana':
      state.mana += v;
      state.maxMana += v;
      break;
    case 'combat-start-mana-from-metric': {
      if (v <= 0) break;
      const n = Math.floor(metricValue(String(eff.params?.arg ?? '')) / v);
      if (n > 0) { state.mana += n; state.maxMana += n; }
      break;
    }
    case 'combat-start-draw-from-metric': {
      if (v <= 0) break;
      const n = Math.floor(metricValue(String(eff.params?.arg ?? '')) / v);
      if (n > 0) h.drawCards(state, n);
      break;
    }
    case 'combat-start-return-to-deck': {
      const want = Math.min(v, state.hand.length);
      for (let i = 0; i < want; i++) {
        const idx = Math.floor(rng() * state.hand.length);
        const [card] = state.hand.splice(idx, 1);
        state.drawPile.push(card);
      }
      break;
    }
    case 'combat-start-hand-card': {
      const id = String(eff.params?.arg ?? '');
      if (!id) break;
      try {
        const def = useDataStore().cards.get(id);
        if (!def) break;
        const inst = { ...def, instanceId: `${def.id}#relic-${Math.random().toString(36).slice(2, 8)}` };
        if (state.hand.length < MAX_HAND_SIZE) state.hand.push(inst);
        else state.discardPile.push(inst);
      } catch { /* 무해 */ }
      break;
    }

    // ===== 라운드(턴) 시작 =====
    case 'turn-start-block':
      h.gainBlock(state, v);
      break;
    case 'turn-start-hp-loss':
      state.player.hp = Math.max(1, state.player.hp - v);
      break;
    case 'turn-start-block-snowball':
      h.gainBlock(state, (state.turn ?? 1) * v);
      break;
    case 'turn-after-strength': {
      const n = Number(eff.params?.arg ?? 4);
      if ((state.turn ?? 1) >= n) addPlayerStatus(state, 'strength', v || 1);
      break;
    }
    case 'turn-before-block': {
      const n = Number(eff.params?.arg ?? 3);
      if ((state.turn ?? 1) <= n) h.gainBlock(state, v);
      break;
    }
    case 'turn-units-color': {
      const d = Number(eff.params?.arg ?? 0);
      if (((state.turn ?? 1) % 10) === d) boostRandomColor(v || 1);
      break;
    }
    case 'block-from-metric': {
      const div = v || 10;
      if (div <= 0) break;
      h.gainBlock(state, Math.floor(metricValue(String(eff.params?.arg ?? '')) / div));
      break;
    }
    case 'strength-from-metric': {
      const div = v || 10;
      if (div <= 0) break;
      addPlayerStatus(state, 'strength', Math.floor(metricValue(String(eff.params?.arg ?? '')) / div));
      break;
    }

    // ===== 카운터형 (카드 사용 후) =====
    case 'cards-to-draw': {
      const n = v || 8;
      if (bumpCounter(state, relic.id, eff.kind) >= n) {
        resetCounter(state, relic.id, eff.kind);
        h.drawCards(state, 1);
      }
      break;
    }
    case 'cards-to-color': {
      const n = v || 5;
      if (bumpCounter(state, relic.id, eff.kind) >= n) {
        resetCounter(state, relic.id, eff.kind);
        boostRandomColor(1);
      }
      break;
    }
    case 'attacks-to-strength': {
      const hits = attackHitCount(triggeredBy);
      if (hits <= 0) break;
      const n = v || 4;
      if (n <= 0) break;
      if (!state.relicCounters) state.relicCounters = {};
      const ck = `${relic.id ?? '?'}:${eff.kind}`;
      let acc = (state.relicCounters[ck] ?? 0) + hits;
      while (acc >= n) { acc -= n; addPlayerStatus(state, 'strength', 1); }
      state.relicCounters[ck] = acc;
      break;
    }
    case 'attacks-to-color': {
      const hits = attackHitCount(triggeredBy);
      if (hits <= 0) break;
      const n = v || 3;
      if (n <= 0) break;
      if (!state.relicCounters) state.relicCounters = {};
      const ck = `${relic.id ?? '?'}:${eff.kind}`;
      let acc = (state.relicCounters[ck] ?? 0) + hits;
      while (acc >= n) { acc -= n; boostRandomColor(1); }
      state.relicCounters[ck] = acc;
      break;
    }

    // ===== 반응형 (피해 받을 때) =====
    case 'retaliate':
    case 'damage-enemy':
      h.dealNearest(state, v); // 가장 가까운 살아 있는 적.
      break;
    case 'hurt-to-color':
      boostRandomColor(v);
      break;
    case 'hurt-to-block':
      h.gainBlock(state, v);
      break;

    // ===== 전투 종료 (on-combat-end) =====
    case 'combat-end-heal':
      // 격자 전투 종료 시점엔 run.hp로 라이트백되므로 run.hp를 회복(combat.ts와 동일).
      try {
        const r = useRunStore().data;
        r.hp = Math.min(r.maxHp, r.hp + v);
      } catch { /* 무해 */ }
      break;
    case 'bonus-gold':
      // 전투 승리 보너스 골드 — 드롭 골드와 합산(run.gold). 보상 피드는 호출 측이 처리.
      try {
        const r = useRunStore().data;
        r.gold = Math.max(0, r.gold + v);
      } catch { /* 무해 */ }
      break;

    // ===== 컬러/스탯 영구 상승(트리거 무관 — 전투 트리거에서도 발동 가능) =====
    case 'boost-color':
      boostColorArg(String(eff.params?.arg ?? 'random'), v);
      break;
    case 'boost-stat': {
      const pair = STAT_PAIRS[String(eff.params?.arg ?? '')];
      if (pair) { applyColorBoost(pair[0], v); applyColorBoost(pair[1], v); }
      break;
    }

    // ===== 그 외(modifier 계열·맵 전용 등) — 격자 트리거에선 no-op =====
    //  damage-out-*/damage-in-mul/block-out-add/draw-extra/mana-extra/cost-mod : 조회형(게터에서 합산).
    //  node-enter-heal/heal-now/discount/gain-* 등 : 격자 전투 트리거 비대상.
    default:
      break;
  }
}

/** 한 유물의 효과 전부 적용(해당 트리거에서). */
function fireRelic(state: GridCombatState, relic: Relic, triggeredBy?: string): void {
  for (const eff of relic.effects) applyEffect(state, eff, relic, triggeredBy);
}

/** 활성 유물 중 *해당 트리거*를 가진 것을 전부 발동. */
function fireTrigger(state: GridCombatState, trigger: string, triggeredBy?: string): void {
  for (const relic of activeGridRelics(state)) {
    if (normalizeTrigger(relic.trigger) === trigger) fireRelic(state, relic, triggeredBy);
  }
}

// ===== 공개 트리거 진입점 (grid-combat.ts가 시점마다 호출) =====

/** 전투 시작 — on-combat-start. (startGridCombat/startGridBossCombat 끝에서.) */
export function gridRelicCombatStart(state: GridCombatState): void {
  fireTrigger(state, 'on-combat-start');
}

/** 라운드(턴) 시작 — on-turn-start. (refreshHandAndMana 후, 새 라운드 진입 시.) */
export function gridRelicTurnStart(state: GridCombatState): void {
  fireTrigger(state, 'on-turn-start');
}

/** 카드 사용 후 — on-card-played-after(+ legacy on-card-play alias). */
export function gridRelicOnCardPlayed(state: GridCombatState, cardId: string | undefined): void {
  fireTrigger(state, 'on-card-played-after', cardId);
}

/** 드로우 — on-draw(드로운 장수만큼 1장당 1회). */
export function gridRelicOnDraw(state: GridCombatState, count: number): void {
  if (count <= 0) return;
  for (let i = 0; i < count; i++) fireTrigger(state, 'on-draw');
}

/** 피해 받을 때 — on-damage-taken. (플레이어가 실제 hp를 잃었을 때.) */
export function gridRelicOnDamageTaken(state: GridCombatState): void {
  fireTrigger(state, 'on-damage-taken');
}

/** 전투 종료(승리) — on-combat-end. (endGridCombat win 경로에서.) */
export function gridRelicCombatEnd(state: GridCombatState): void {
  fireTrigger(state, 'on-combat-end');
}
