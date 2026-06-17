/**
 * 격자 전술 전투 엔진 (신규) — 순수 함수 계층.
 *
 * 구 STS식 1v1(systems/combat.ts)을 대체할 *격자 다중 적* 전투의 코어.
 * UI(GridCombatView)는 이 모듈의 공개 함수에만 의존한다(스토어 경유).
 *
 * 핵심 설계 (autopilot spec §4 / D-decisions):
 *  - 행동 = 이동 · 카드 · 아이템 택1 (한 스텝에 하나).
 *  - 카드 = 자기 기준 *고정 패턴*(회전 없음). 위치잡기로 조준.
 *  - 방어(block) = 0 리셋 X. 라운드 종료마다 floor(block/2) 반감(D6).
 *  - 계획 시야 N(foresight, 1~3): N턴 앞 행동을 큐에 배치 + 적 의도 N개 공개.
 *  - 발동 속도(fast→normal→slow), 동률 플레이어 우선.
 *  - 격자는 정사각형이 아닐 수 있음(void 셀).
 *
 * 이 모듈은 *순수 변형*이다: GridCombatState를 인자로 받아 in-place로 바꾸거나 값을 돌려준다.
 * Pinia/스토어 접근은 최소화하되, 컬러 보너스·유물 트리거 등 *전역 런 상태*에 의존하는 부분은
 * 기존 combat.ts와 동일하게 useRunStore()를 통해 읽는다(엔진 호출은 항상 활성 런 컨텍스트).
 */

import type {
  Boss,
  BossPhase,
  Card,
  CastSpeed,
  FxEvent,
  GridAttack,
  GridCombatState,
  GridCombatant,
  GridOffset,
  GridPos,
  GridStage,
  Item,
  Monster,
  MoveProfile,
  PlannedAction,
  Relic,
  RunState,
} from '@/data/schemas';
import { HUMAN_MOVE_PROFILE, DEFAULT_ENEMY_MOVE_PROFILE } from '@/data/schemas';
import { drawCards, shuffle } from './deck';
import { bonusesFromEffective } from './equipment';
import type { CombatBonuses } from './stats';
import { resolveLoadout } from './loadout';
import { applyColorBoost, applyColorBoostAll, type ColorKey } from './colors';
import { rng } from './rng';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import {
  registerGridRelicHooks,
  gridRelicCombatStart,
  gridRelicTurnStart,
  gridRelicOnCardPlayed,
  gridRelicOnDraw,
  gridRelicOnDamageTaken,
  applyDamageRelicMods,
  gridBlockAdd,
  gridDrawExtra,
  gridManaExtra,
  gridCostMod,
  gridDamageInMul,
} from './grid-relic';
import { useItemInGrid, registerGridItemHooks } from './grid-item';

// ============================================================================
// 상수
// ============================================================================

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;
const MAX_HAND_SIZE = 10;
const LOG_MAX = 24;
/** 전투 중 foresight 상한(add-foresight 카드 등으로 변동 — US-004). 하한 1. */
const MAX_FORESIGHT = 5;

/** 발동 속도 → 정렬 순위(작을수록 먼저). */
const SPEED_ORDER: Record<CastSpeed, number> = { fast: 0, normal: 1, slow: 2 };

/**
 * 유물·포션 격자 적용 계층(grid-relic.ts/grid-item.ts)에 격자 헬퍼를 주입한다.
 * *전투 시작 시점*(startGridCombat/startGridBossCombat)에 호출 — 모듈 top-level이 아니라
 * 함수 시점이라 순환 import(run.ts↔grid-relic.ts) TDZ에 걸리지 않는다. idempotent(여러 번 호출 무해).
 */
let gridHooksReady = false;
function ensureGridHooks(): void {
  if (gridHooksReady) return;
  gridHooksReady = true;
  registerGridRelicHooks({
    gainBlock: (state, v) => gainPlayerBlock(state, v),
    drawCards: (state, n) => drawIntoHand(state, n),
    dealNearest: (state, v) => {
      const tgt = nearestEnemy(state);
      if (tgt) applyDamage(state, tgt, v, state.player.statuses);
    },
    nearest: (state) => nearestEnemy(state),
  });
  registerGridItemHooks({
    gainBlock: (state, v) => gainPlayerBlock(state, v),
    drawCards: (state, n) => drawIntoHand(state, n),
    nearest: (state) => nearestEnemy(state),
  });
}

// ============================================================================
// 기하 헬퍼
// ============================================================================

export function samePos(a: GridPos, b: GridPos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 맨해튼 거리. */
export function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 체비셰프 거리(8방). */
export function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** 칸이 바운딩 박스 안인가. */
function inBounds(stage: GridStage, p: GridPos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < stage.width && p.y < stage.height;
}

/**
 * 칸이 *통행/점유 가능*한 바닥인가(점유자 무시).
 * floor/item/spawn = 통행 가능, wall/void = 불가.
 */
export function tileWalkable(stage: GridStage, p: GridPos): boolean {
  if (!inBounds(stage, p)) return false;
  const t = stage.cells[p.y]?.[p.x];
  return t === 'floor' || t === 'item' || t === 'spawn';
}

/**
 * 그 칸에 서 있는 전투원(살아 있는) 1명. 없으면 undefined.
 * 칸 점유는 *배타적이 아니다*(플레이어·적 겹침 허용) — 여럿이 겹친 칸이면 첫 1명만 반환.
 * 타깃팅/AoE는 combatantsAt(전부)를 쓸 것. 이 단일 헬퍼는 인스펙트·궁지 판정 등 1명이면 충분한 곳에만.
 */
export function combatantAt(state: GridCombatState, pos: GridPos): GridCombatant | undefined {
  if (state.player.hp > 0 && samePos(state.player.pos, pos)) return state.player;
  for (const e of state.enemies) {
    if (e.hp > 0 && samePos(e.pos, pos)) return e;
  }
  for (const a of state.allies ?? []) {
    if (a.hp > 0 && samePos(a.pos, pos)) return a;
  }
  return undefined;
}

/**
 * 그 칸에 겹쳐 있는 *살아 있는 전투원 전부*(플레이어 + 적, 겹침 허용).
 * 한 칸에 적 여럿이거나 플레이어와 적이 겹쳐 있어도 모두 반환 — AoE/공격 타깃 판정용.
 */
export function combatantsAt(state: GridCombatState, pos: GridPos): GridCombatant[] {
  const out: GridCombatant[] = [];
  if (state.player.hp > 0 && samePos(state.player.pos, pos)) out.push(state.player);
  for (const e of state.enemies) {
    if (e.hp > 0 && samePos(e.pos, pos)) out.push(e);
  }
  for (const a of state.allies ?? []) {
    if (a.hp > 0 && samePos(a.pos, pos)) out.push(a);
  }
  return out;
}

/**
 * 궁지 정도 — 어떤 위치의 *직교 인접 4칸 중 통행 불가 칸 수*(0~4).
 * 차단 = 통행 불가 바닥(벽/void/격자 밖)뿐. 전투원은 칸을 막지 않으므로(겹침 허용) 더는 세지 않는다.
 * 구석/막다른 곳일수록 값이 커진다(damage-per-confine 등 위치 기반 레버용).
 */
export function confinedCount(state: GridCombatState, pos: GridPos): number {
  let blocked = 0;
  for (const d of ROOK_DIRS) {
    const p = { x: pos.x + d.dx, y: pos.y + d.dy };
    if (!tileWalkable(state.stage, p)) blocked += 1;   // 벽/void/격자 밖.
  }
  return blocked; // 0~4.
}

/** 살아 있는 전투원 전체(플레이어 + 적 + 아군). */
function aliveCombatants(state: GridCombatState): GridCombatant[] {
  const out: GridCombatant[] = [];
  if (state.player.hp > 0) out.push(state.player);
  for (const e of state.enemies) if (e.hp > 0) out.push(e);
  for (const a of state.allies ?? []) if (a.hp > 0) out.push(a);
  return out;
}

// ============================================================================
// 이동 — moveProfile + 장애물 + 점유
// ============================================================================

const ROOK_DIRS: GridOffset[] = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];
const BISHOP_DIRS: GridOffset[] = [
  { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
];
const KING_DIRS: GridOffset[] = [...ROOK_DIRS, ...BISHOP_DIRS];
const KNIGHT_OFFSETS: GridOffset[] = [
  { dx: 1, dy: 2 }, { dx: 2, dy: 1 }, { dx: -1, dy: 2 }, { dx: -2, dy: 1 },
  { dx: 1, dy: -2 }, { dx: 2, dy: -1 }, { dx: -1, dy: -2 }, { dx: -2, dy: -1 },
];

/**
 * 이 칸이 *이동 도착 가능*한가 — 통행 가능 바닥(floor/item/spawn)이면 OK.
 * 칸 점유는 배타적이 아니므로(겹침 허용) 전투원이 서 있어도 그 칸으로 이동/착지 가능.
 */
function isFreeTile(state: GridCombatState, p: GridPos): boolean {
  return tileWalkable(state.stage, p);
}

/**
 * 슬라이딩(rook/bishop/king) 도달 칸 — 각 방향으로 range칸까지, *경로가 막히면 중단*.
 * 막는 것: 격자 밖/void/wall뿐. 전투원은 통과 가능(겹침 허용)이라 더는 경로를 막지 않는다.
 */
function slideReach(
  state: GridCombatState,
  from: GridPos,
  dirs: GridOffset[],
  range: number,
): GridPos[] {
  const out: GridPos[] = [];
  for (const d of dirs) {
    for (let step = 1; step <= range; step++) {
      const p = { x: from.x + d.dx * step, y: from.y + d.dy * step };
      if (!tileWalkable(state.stage, p)) break;        // 벽/void/밖 — 경로 차단.
      out.push(p);                                     // 전투원 겹침 허용 — 통과·착지 가능.
    }
  }
  return out;
}

/**
 * combatant가 이번 스텝에 이동 가능한 칸 목록.
 * moveProfile + 장애물(wall/void) + 점유(다른 전투원) 반영.
 * rook/bishop은 *경로 막힘*까지 반영(slideReach). knight는 점프(경로 무시).
 */
export function reachableTiles(state: GridCombatState, combatant: GridCombatant): GridPos[] {
  const prof = combatant.moveProfile;
  const from = combatant.pos;
  const range = Math.max(1, prof.range ?? 1);

  switch (prof.pattern) {
    case 'rook':
      return slideReach(state, from, ROOK_DIRS, range);
    case 'bishop':
      return slideReach(state, from, BISHOP_DIRS, range);
    case 'king':
      return slideReach(state, from, KING_DIRS, range);
    case 'orthogonal1': {
      const out: GridPos[] = [];
      for (const d of ROOK_DIRS) {
        const p = { x: from.x + d.dx, y: from.y + d.dy };
        if (isFreeTile(state, p)) out.push(p);
      }
      return out;
    }
    case 'knight': {
      const out: GridPos[] = [];
      for (const o of KNIGHT_OFFSETS) {
        const p = { x: from.x + o.dx, y: from.y + o.dy };
        if (isFreeTile(state, p)) out.push(p);
      }
      return out;
    }
    case 'manhattan': {
      // 맨해튼 거리 ≤ range 다이아몬드(점프형 — 경로 무시, 슬라임 오즈). 자기 칸 제외.
      const out: GridPos[] = [];
      for (let dy = -range; dy <= range; dy++) {
        const rem = range - Math.abs(dy);
        for (let dx = -rem; dx <= rem; dx++) {
          if (dx === 0 && dy === 0) continue;
          const p = { x: from.x + dx, y: from.y + dy };
          if (isFreeTile(state, p)) out.push(p);
        }
      }
      return out;
    }
    case 'composite': {
      // 하위 패턴들의 합집합(중복 제거). 각 하위는 같은 range를 쓰되 reachableTiles 규칙 그대로.
      const out: GridPos[] = [];
      const seen = new Set<string>();
      for (const sub of prof.compose ?? []) {
        const subProf: MoveProfile = { pattern: sub, range };
        for (const t of reachableTiles(state, { ...combatant, moveProfile: subProf })) {
          const k = `${t.x},${t.y}`;
          if (!seen.has(k)) { seen.add(k); out.push(t); }
        }
      }
      return out;
    }
    case 'custom': {
      const out: GridPos[] = [];
      for (const o of prof.customOffsets ?? []) {
        const p = { x: from.x + o.dx, y: from.y + o.dy };
        if (isFreeTile(state, p)) out.push(p);
      }
      return out;
    }
    default:
      return [];
  }
}

/** to가 combatant의 합법 이동 칸인가. */
function isLegalMove(state: GridCombatState, combatant: GridCombatant, to: GridPos): boolean {
  return reachableTiles(state, combatant).some((p) => samePos(p, to));
}

// ============================================================================
// 카드 미리보기 — 고정 shape를 caster 기준 절대 칸으로
// ============================================================================

/**
 * 카드 shape를 caster(기본 player) 기준 *절대 칸*으로 변환. 회전 없음.
 * 격자 밖·void·wall 칸은 제외. shape 미설정/빈 배열이면 빈 배열(self/제자리 발동).
 * aimOffset 지정 시(targetMode='aimed') shape 기준점 = caster + aimOffset(조준 칸 중심).
 */
export function previewCardTiles(
  state: GridCombatState,
  card: Card,
  casterPos?: GridPos,
  aimOffset?: GridOffset,
): GridPos[] {
  const base = casterPos ?? state.player.pos;
  const origin = aimOffset ? { x: base.x + aimOffset.dx, y: base.y + aimOffset.dy } : base;
  const shape = card.shape ?? [];
  const out: GridPos[] = [];
  for (const o of shape) {
    const p = { x: origin.x + o.dx, y: origin.y + o.dy };
    // 격자 밖·void·wall 제외 (floor/item/spawn만 유효 타겟 칸).
    if (tileWalkable(state.stage, p)) out.push(p);
  }
  return out;
}

/** 원거리 조준 카드(targetMode='aimed')인가. */
export function isAimedCard(card: Card): boolean {
  return card.targetMode === 'aimed';
}

/**
 * aimed 카드의 *조준 가능 칸* — 플레이어 기준 맨해튼 거리 1..aimRange 내 통행 가능 칸.
 * UI가 이 칸들을 하이라이트하고, 플레이어가 고른 칸을 중심으로 shape가 적용된다.
 */
export function aimableTiles(state: GridCombatState, card: Card): GridPos[] {
  const range = Math.max(1, card.aimRange ?? 3);
  const from = state.player.pos;
  const out: GridPos[] = [];
  for (let dy = -range; dy <= range; dy++) {
    const rem = range - Math.abs(dy);
    for (let dx = -rem; dx <= rem; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = { x: from.x + dx, y: from.y + dy };
      if (tileWalkable(state.stage, p)) out.push(p);
    }
  }
  return out;
}

/** 적 격자 공격 shape를 적 기준 절대 칸으로 (인스펙트/실행 공용). */
export function previewAttackTiles(
  state: GridCombatState,
  attacker: GridCombatant,
  attack: GridAttack,
): GridPos[] {
  const out: GridPos[] = [];
  for (const o of attack.shape ?? []) {
    const p = { x: attacker.pos.x + o.dx, y: attacker.pos.y + o.dy };
    if (tileWalkable(state.stage, p)) out.push(p);
  }
  return out;
}

// ============================================================================
// 카드 사용 가능 여부
// ============================================================================

/** 카드의 실효 비용 — base cost + 유물 cost-mod(음수=할인) - 이번 라운드 hand-cost-down(최소 0). */
function cardCost(state: GridCombatState, card: Card): number {
  const down = state.handCostDown ?? 0;
  const relicMod = gridCostMod(state); // cost-mod-add(소매치기 장갑 등, 음수면 할인).
  return Math.max(0, (card.cost ?? 0) + relicMod - down);
}

/** 마나·사용 불가 검증. */
export function canPlayCard(state: GridCombatState, card: Card): boolean {
  if (!card) return false;
  if (card.unplayable) return false;
  return state.mana >= cardCost(state, card);
}

// ============================================================================
// 플레이어 행동 큐 (계획 시야)
// ============================================================================

/**
 * playerPlan에 행동 추가 — 길이 < foresight면 push.
 * card: 손패 존재 + 마나(누적 plan 비용 합산까지 고려) 검증.
 * move: 합법 이동 칸 검증(현재 상태 기준 — best effort; 실제 해소는 commit 시 재평가).
 * 성공 시 true.
 */
export function queuePlayerAction(state: GridCombatState, action: PlannedAction): boolean {
  if (state.playerPlan.length >= state.foresight) return false;

  if (action.kind === 'card') {
    const card = state.hand.find((c) => c.instanceId === action.cardInstanceId);
    if (!card || card.unplayable) return false;
    // aimed 카드는 조준 오프셋이 사거리 내여야 한다(원거리 조준 — UI가 지정).
    if (isAimedCard(card)) {
      const off = action.aimOffset;
      const range = Math.max(1, card.aimRange ?? 3);
      if (!off || (Math.abs(off.dx) + Math.abs(off.dy)) > range || (off.dx === 0 && off.dy === 0)) {
        return false;
      }
    }
    // 이미 큐에 든 카드는 중복 사용 불가(같은 인스턴스).
    if (state.playerPlan.some((a) => a.kind === 'card' && a.cardInstanceId === action.cardInstanceId)) {
      return false;
    }
    // 누적 마나 — 이미 큐에 든 카드 비용 + 이번 카드 비용 ≤ mana.
    const queuedCost = state.playerPlan.reduce((sum, a) => {
      if (a.kind !== 'card') return sum;
      const c = state.hand.find((h) => h.instanceId === a.cardInstanceId);
      return sum + (c ? cardCost(state, c) : 0);
    }, 0);
    if (queuedCost + cardCost(state, card) > state.mana) return false;
    state.playerPlan.push(action);
    return true;
  }

  if (action.kind === 'move') {
    // 닻(anchored) 상태면 이동 불가(보스 anchor 기믹 — US-005).
    if ((state.player.statuses['anchored'] ?? 0) > 0) return false;
    if (!isLegalMove(state, state.player, action.to)) return false;
    state.playerPlan.push(action);
    return true;
  }

  if (action.kind === 'item') {
    // 이번 라운드 이미 포션을 썼으면(가드) 큐잉 불가.
    if (state.potionUsedThisTurn) return false;
    // 같은 라운드 계획에 이미 아이템 행동이 있으면 불가(턴당 1회).
    if (state.playerPlan.some((a) => a.kind === 'item')) return false;
    // 보유 + 전투용 + 효과 보유 포션만.
    if (!canUseGridItem(action.itemId)) return false;
    state.playerPlan.push(action);
    return true;
  }

  if (action.kind === 'swap') {
    // 동료 교대 — 아이템류 1회. 이미 교대 중이거나 계획에 swap/item이 있으면 불가.
    if (!canSwapTo(state, action.companionId)) return false;
    if (state.playerPlan.some((a) => a.kind === 'swap' || a.kind === 'item')) return false;
    state.playerPlan.push(action);
    return true;
  }

  if (action.kind === 'wait') {
    state.playerPlan.push(action);
    return true;
  }

  return false;
}

/** 격자 전투에서 사용 가능한 포션인가 — 보유 + combat=true + 효과 보유. */
export function canUseGridItem(itemId: string): boolean {
  try {
    const items = useRunStore().data.items ?? [];
    const item = items.find((i) => i.instanceId === itemId || i.id === itemId);
    return !!item && item.combat === true && (item.effects?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** 현재 보유한 *전투용* 포션 목록(UI 행동바용). */
export function combatPotions(): Item[] {
  try {
    return (useRunStore().data.items ?? []).filter(
      (i) => i.combat === true && (i.effects?.length ?? 0) > 0,
    );
  } catch {
    return [];
  }
}

/** 플레이어 계획 비우기. */
export function clearPlayerPlan(state: GridCombatState): void {
  state.playerPlan = [];
}

// ============================================================================
// 컬러 보너스 (구 combat.ts 패턴 이식 — 색→ATK/DEF 가법 보정)
// ============================================================================

/** 현재 런의 effective 컬러 전투 보너스(damage/block/draw/mana/move). 스토어 미접근 시 0 폴백. */
function currentBonuses(): CombatBonuses {
  try {
    return bonusesFromEffective(useRunStore().data, useDataStore().equipments);
  } catch {
    return { damage: 0, block: 0, drawExtra: 0, manaExtra: 0, moveBonus: 0 };
  }
}

/**
 * 유물 draw-extra-add / mana-extra-add 합산(로드아웃 규칙) — 핸드/마나 사이징 보정.
 * 게터가 GridCombatState.loadout만 읽으므로 *로드아웃만 든 경량 객체*로 조회.
 */
function relicHandManaExtras(loadout: Relic[]): { draw: number; mana: number } {
  const probe = { loadout } as unknown as GridCombatState;
  return { draw: gridDrawExtra(probe), mana: gridManaExtra(probe) };
}

// ============================================================================
// 상태이상 배수 (구 combat.ts applyDamage 의 핵심만 이식)
// ----------------------------------------------------------------------------
// 슬라이스 범위: vulnerable(대상 ×1.5) / weakness(공격자 ×0.75)만 확실히.
// 그 외 강 상태(possession/imprint/ghost 등)는 *참조 시 안전 무시*(crash X).
// ============================================================================

// 라운드마다 -1 감쇠되는 *일시* 상태. strength·파워(metallicize 등)는 STS 관례대로 *영구*(감쇠 제외).
// ghost(유령화)는 양날 상태로 라운드 감쇠.
const DECAYING_STATUSES = new Set<string>(['weakness', 'vulnerable', 'frail', 'ghost', 'anchored']);

/** 샤유아 전파/연쇄 대상 디버프 키(status-spread·chain-explosion). */
const SPREADABLE_DEBUFFS = ['vulnerable', 'weakness', 'frail', 'poison', 'burn', 'regress'] as const;

function damageMultipliers(
  v: number,
  attacker: Record<string, number> | undefined,
  target: Record<string, number> | undefined,
): number {
  let r = Math.max(0, v);
  if ((attacker?.weakness ?? 0) > 0) r = Math.floor(r * 0.75);
  if ((target?.vulnerable ?? 0) > 0) r = Math.floor(r * 1.5);
  // 유령화(ghost): 공격자가 유령화면 주는 피해 ×0.5, 대상이 유령화면 받는 피해 ×0.5(양날).
  if ((attacker?.ghost ?? 0) > 0) r = Math.floor(r * 0.5);
  if ((target?.ghost ?? 0) > 0) r = Math.floor(r * 0.5);
  return r;
}

/**
 * 통합 피해 적용 — block 흡수 후 hp. 흡수분은 fx(block-absorb)로 시각화.
 * rawValue: strength/색보너스 등 *플랫 보정이 끝난* 피해.
 */
function applyDamage(
  state: GridCombatState,
  target: GridCombatant,
  rawValue: number,
  attackerStatuses: Record<string, number> | undefined,
): void {
  let v = damageMultipliers(rawValue, attackerStatuses, target.statuses);
  // 플레이어가 *받는* 피해에 유물 damage-in-mul 적용(유리 송곳니 등 — combat.ts와 동일).
  if (target.team === 'player') {
    const inMul = gridDamageInMul(state);
    if (inMul !== 1) v = Math.max(0, Math.floor(v * inMul));
  }
  if (v <= 0) return;
  const wasAlive = target.hp > 0;
  const absorbed = Math.min(target.block, v);
  target.block -= absorbed;
  const hpLoss = v - absorbed;
  target.hp = Math.max(0, target.hp - hpLoss);
  if (absorbed > 0) pushFx(state, { kind: 'block-absorb', actorId: target.id, amount: absorbed });
  if (hpLoss > 0) {
    pushFx(state, { kind: 'hit', actorId: target.id, amount: hpLoss });
    // 플레이어가 *실제로* hp를 잃으면 런 누적 피해 기록(c-tripps-rage 등 동적 cost 연동) + 피격 반응 유물.
    if (target.team === 'player') {
      try {
        const r = useRunStore().data;
        r.runDamageReceived = (r.runDamageReceived ?? 0) + hpLoss;
      } catch { /* 무해 */ }
      // on-damage-taken 유물(반격·아픔→색·맞고 방어). retaliate는 적을 때리므로 재귀 안전.
      gridRelicOnDamageTaken(state);
    }
  }
  // 처치 — 살아 있던 대상이 0이 되는 *전이 순간*에만 death fx 1회.
  if (wasAlive && target.hp <= 0) {
    pushFx(state, { kind: 'death', actorId: target.id });
  }
}

/** 상태이상 부여 — "vulnerable:2" 형태 파싱 후 스택 누적. */
function applyStatusToken(target: GridCombatant, token: string | undefined): void {
  if (!token) return;
  const [name, vStr] = token.split(':');
  if (!name) return;
  const v = vStr ? Number(vStr) : 1;
  if (!Number.isFinite(v) || v === 0) return;
  target.statuses[name] = (target.statuses[name] ?? 0) + v;
}

/** 매 라운드 종료 상태이상 감쇠(-1, 0이면 제거). */
function decayStatuses(c: GridCombatant): void {
  for (const key of DECAYING_STATUSES) {
    const stack = c.statuses[key] ?? 0;
    if (stack <= 0) continue;
    if (stack - 1 <= 0) delete c.statuses[key];
    else c.statuses[key] = stack - 1;
  }
}

// ============================================================================
// FX / 로그
// ============================================================================

let fxSeq = 0;
/**
 * 현재 해소 중인 *행동 그룹* 인덱스(순차 재생용). commitRound가 각 executeAction 직전에 +1 한다.
 * 라운드 외(전투 시작 유물 등)에서 난 fx는 0번 그룹.
 */
let fxActionIndex = 0;
function pushFx(state: GridCombatState, ev: Omit<FxEvent, 'seq'>): void {
  fxSeq += 1;
  (state.fx ?? (state.fx = [])).push({ ...ev, seq: fxSeq, actionIndex: fxActionIndex });
}

function pushLog(state: GridCombatState, text: string): void {
  if (!text) return;
  state.log = [...(state.log ?? []), text].slice(-LOG_MAX);
}

// ============================================================================
// 전투 시작
// ============================================================================

/**
 * 격자 전투 시작 — 플레이어/적 배치, 덱 셔플·초기 핸드, 마나, foresight, 적 의도 큐, 로드아웃.
 * 반환된 state를 스토어가 run.gridCombat에 저장한다.
 */
export function startGridCombat(
  run: RunState,
  stage: GridStage,
  enemyDefs: Monster[],
): GridCombatState {
  // fx 시퀀스를 전투마다 리셋 — 새 전투가 fx:[]로 시작하므로 잔존 fx 혼입 방지.
  fxSeq = 0;
  ensureGridHooks(); // 유물·포션 격자 헬퍼 1회 주입(전투 시작 시점 — 순환 import 안전).
  const loadout = resolveLoadout(run);
  // 색 보너스 + *유물* draw-extra/mana-extra 합산(로드아웃 규칙).
  const extra = relicHandManaExtras(loadout);
  const bonus = currentBonuses();
  const handSize = Math.max(1, STARTING_HAND_SIZE + bonus.drawExtra + extra.draw);
  const maxMana = Math.max(1, DEFAULT_MAX_MANA + bonus.manaExtra + extra.mana);

  // 덱 셔플 + 초기 드로우 (구 combat.ts와 동일 — 전투마다 새 셔플).
  const drawPile0 = shuffle([...run.deck]);
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile0, [], handSize);

  // 플레이어 전투원 — 인간 룩 이동(+moveUpgrades +바람색 사거리 가산).
  const moveProfile = playerMoveProfile(run, bonus.moveBonus);
  const player: GridCombatant = {
    id: 'player',
    team: 'player',
    pos: { ...stage.playerStart },
    hp: run.hp,
    maxHp: run.maxHp,
    block: 0,
    statuses: {},
    speed: 'normal',
    moveProfile,
  };

  // 적 전투원 — enemyStarts와 인덱스 정렬. 위치 미지정분은 빈 칸 폴백.
  const enemies: GridCombatant[] = [];
  enemyDefs.forEach((def, i) => {
    const start = stage.enemyStarts[i];
    const pos = start ? { ...start } : firstFreeSpawnTile(stage, enemies, player);
    if (!pos) return;
    enemies.push(makeEnemyCombatant(def, pos, i));
  });

  const state: GridCombatState = {
    stage,
    player,
    enemies,
    foresight: Math.max(1, stage.foresight || 1),
    playerPlan: [],
    turn: 1,
    mana: maxMana,
    maxMana,
    hand: drawn,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    exhaustPile: [],
    loadout,
    log: [],
    fx: [],
    relicCounters: {},
    cardsPlayedThisTurn: 0,
  };

  // 전투 시작 유물(on-combat-start) — 방어/드로우/상태/마나 등을 격자 state에 적용.
  gridRelicCombatStart(state);
  // 적 초기 의도 큐 계산(foresight 만큼 예측 — 전투 시작 유물 적용 후 위치/상태 반영).
  recomputeAllEnemyPlans(state);
  return state;
}

/** 종족(raceId)의 격자 이동 프로필 — 미정의/조회 실패 시 undefined(인간 룩 폴백). */
function raceMoveProfile(run: RunState): MoveProfile | undefined {
  try {
    return useDataStore().races.get(run.raceId)?.moveProfile;
  } catch {
    return undefined;
  }
}

/**
 * 플레이어 이동 프로필 — *종족 행마법*(C절) + moveUpgrades + *바람 색* moveBonus 사거리 가산(F5).
 * 종족 미설정 시 인간 룩 폴백. range는 슬라이드/맨해튼/복합 비숍에 적용(나이트는 무시·직교1은 고정 1).
 * (이동 강화 = 색(바람)의 주축. moveUpgrades는 유물·이벤트 부가 가산분. 무속성 화이트팡은 시간 메커닉 — 별도.)
 */
function playerMoveProfile(run: RunState, moveBonus = 0): MoveProfile {
  const base = raceMoveProfile(run) ?? HUMAN_MOVE_PROFILE;
  const up = Math.max(0, run.moveUpgrades ?? 0) + Math.max(0, moveBonus);
  // 패턴/compose/customOffsets는 보존하고 range만 가산(점프형은 엔진이 range를 무시).
  return { ...base, range: Math.max(1, base.range + up) };
}

/** 몬스터 정의 → 격자 전투원. */
function makeEnemyCombatant(def: Monster, pos: GridPos, idx: number): GridCombatant {
  const hp = Math.max(1, Math.round(def.hp));
  return {
    id: `enemy-${idx}-${def.id}`,
    team: 'enemy',
    pos,
    hp,
    maxHp: hp,
    block: def.defense ?? 0,
    statuses: {},
    speed: def.speed ?? 'normal',
    moveProfile: def.moveProfile ?? DEFAULT_ENEMY_MOVE_PROFILE,
    monsterId: def.id,
    name: def.name,
    attack: def.attack,
    attacks: def.gridBehavior ? def.gridBehavior.map((a) => ({ ...a })) : undefined,
    drop: { gold: def.drop?.gold ?? 0, timeShards: def.drop?.timeShards ?? 0 },
    fixedAi: def.fixedAi || undefined,
  };
}

/**
 * 배치 칸 하나 — 증원/위치 폴백용. *빈 칸을 선호*하되, 점유는 배타적이 아니므로(겹침 허용)
 * 빈 칸이 없으면 점유 칸도 허용(spawn > floor 순). 통행 가능 칸이 하나라도 있으면 항상 반환.
 */
function firstFreeSpawnTile(
  stage: GridStage,
  enemies: GridCombatant[],
  player: GridCombatant,
): GridPos | undefined {
  const occupied = (p: GridPos) =>
    samePos(player.pos, p) || enemies.some((e) => samePos(e.pos, p));
  let firstSpawn: GridPos | undefined;   // 점유돼도 spawn 칸 폴백.
  let firstWalkable: GridPos | undefined; // 점유돼도 통행 칸 폴백.
  // 1순위: 빈 spawn → 2순위: 빈 floor. 동시에 점유 칸 폴백을 기억해 둔다.
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const p = { x, y };
      if (!tileWalkable(stage, p)) continue;
      const isSpawn = stage.cells[y]?.[x] === 'spawn';
      if (!firstWalkable) firstWalkable = p;
      if (isSpawn && !firstSpawn) firstSpawn = p;
      if (!occupied(p)) {
        if (isSpawn) return p;            // 빈 spawn — 최우선.
        if (!firstWalkable || firstWalkable === p) { /* 빈 floor 후보 — 아래에서 반환 */ }
      }
    }
  }
  // 빈 floor 우선 탐색(빈 spawn은 위에서 이미 반환).
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const p = { x, y };
      if (tileWalkable(stage, p) && !occupied(p)) return p;
    }
  }
  // 빈 칸이 전혀 없음 — 점유 칸 폴백(겹침 허용): spawn > 아무 통행 칸.
  return firstSpawn ?? firstWalkable;
}

// ============================================================================
// 보스 격자 전투(#4) — 시작 + 페이즈 전환
// ----------------------------------------------------------------------------
// 보스 = enemies[0]의 강력한 단일 전투원(높은 HP, 페이즈별 grid_attack 세트).
// HP%가 임계(bossPhaseThresholds)를 넘으면 commitRound가 거동(attacks)을 다음 페이즈 세트로 교체 +
// spawn_minions 1회 소환. AI는 fixedAi(스크립트 그리디)로 *읽히는 텔레그래프* 보장.
// ============================================================================

/** 보스 페이즈 i의 격자 공격 세트 — 비어 있으면 *직전(이전 인덱스부터 역방향)* 세트를 상속. */
function phaseBehaviorAt(phases: BossPhase[], idx: number): GridAttack[] {
  for (let i = Math.min(idx, phases.length - 1); i >= 0; i--) {
    const b = phases[i]?.gridBehavior;
    if (b && b.length > 0) return b.map((a) => ({ ...a }));
  }
  return [];
}

/**
 * 보스 → 격자 전투원. 페이즈별 grid 공격 세트를 phaseBehaviors에 보관하고
 * 현재(첫) 페이즈 세트를 attacks로 활성화. fixedAi 기본 true(스크립트 그리디).
 */
function makeBossCombatant(boss: Boss, pos: GridPos): GridCombatant {
  const hp = Math.max(1, Math.round(boss.hp));
  const phaseBehaviors = boss.phases.map((_, i) => phaseBehaviorAt(boss.phases, i));
  // 페이즈가 전혀 grid 공격을 안 주면(옛 데이터) 보스 기본 근접 1칸으로 폴백(빈 배열 → execAttack -1 경로).
  const firstSet = phaseBehaviors[0] ?? [];
  return {
    id: `boss-${boss.id}`,
    team: 'enemy',
    pos,
    hp,
    maxHp: hp,
    block: boss.defense ?? 0,
    statuses: {},
    speed: boss.gridSpeed ?? 'normal',
    moveProfile: boss.gridMoveProfile ?? DEFAULT_ENEMY_MOVE_PROFILE,
    monsterId: boss.id,
    name: boss.name,
    attack: boss.attack,
    attacks: firstSet.length > 0 ? firstSet : undefined,
    drop: { gold: 0, timeShards: 0 }, // 보스 보상은 boss-rewards.ts가 별도 처리.
    fixedAi: boss.gridFixedAi !== false, // 보스 기본 스크립트형(읽히는 텔레그래프).
    isBoss: true,
    phaseBehaviors,
  };
}

/**
 * 보스 격자 전투 시작 — 일반 startGridCombat과 동일 셋업이되 적 대신 보스 1마리(enemies[0]).
 * stage는 호출자(스토어)가 보스용으로 *적당히 크게* 생성해 넘긴다(enemyStarts[0]에 보스 배치).
 */
export function startGridBossCombat(
  run: RunState,
  stage: GridStage,
  boss: Boss,
): GridCombatState {
  fxSeq = 0;
  ensureGridHooks(); // 유물·포션 격자 헬퍼 1회 주입.
  const loadout = resolveLoadout(run);
  const extra = relicHandManaExtras(loadout);
  const bonus = currentBonuses();
  const handSize = Math.max(1, STARTING_HAND_SIZE + bonus.drawExtra + extra.draw);
  const maxMana = Math.max(1, DEFAULT_MAX_MANA + bonus.manaExtra + extra.mana);

  const drawPile0 = shuffle([...run.deck]);
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile0, [], handSize);

  const moveProfile = playerMoveProfile(run, bonus.moveBonus);
  const player: GridCombatant = {
    id: 'player',
    team: 'player',
    pos: { ...stage.playerStart },
    hp: run.hp,
    maxHp: run.maxHp,
    block: 0,
    statuses: {},
    speed: 'normal',
    moveProfile,
  };

  // 보스 배치 — enemyStarts[0](우상단). 없으면 빈 칸 폴백.
  const bossPos = stage.enemyStarts[0]
    ? { ...stage.enemyStarts[0] }
    : firstFreeSpawnTile(stage, [], player);
  const enemies: GridCombatant[] = [];
  if (bossPos) enemies.push(makeBossCombatant(boss, bossPos));

  // 페이즈 임계(내림차순) — HP%로 전환 판정.
  const thresholds = boss.phases.map((p) => p.startsAtHpRatio);

  const state: GridCombatState = {
    stage,
    player,
    enemies,
    foresight: Math.max(1, stage.foresight || 1),
    playerPlan: [],
    turn: 1,
    mana: maxMana,
    maxMana,
    hand: drawn,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    exhaustPile: [],
    loadout,
    log: [],
    fx: [],
    relicCounters: {},
    cardsPlayedThisTurn: 0,
    // 보스 메타 — UI/보상 분기 + 페이즈 추적.
    isBoss: true,
    bossId: boss.id,
    bossKind: boss.kind === 'arc' ? 'arc' : 'boss',
    bossName: boss.name,
    bossPhaseIndex: 0,
    bossPhaseThresholds: thresholds,
  };

  // 전투 시작 유물(on-combat-start) — 일반 전투와 동일.
  gridRelicCombatStart(state);
  recomputeAllEnemyPlans(state);
  return state;
}

/**
 * 보스 페이즈 전환 점검 — 보스 HP%가 다음 임계 이하로 떨어지면:
 *   1) bossPhaseIndex 증가(여러 단계를 한 번에 건너뛸 수도 있음 — 큰 한 방).
 *   2) attacks를 그 페이즈의 phaseBehaviors 세트로 교체(거동 전환).
 *   3) 그 페이즈의 spawn_minions를 *1회* 소환(boss 정의 phase에서 읽음).
 * 한 라운드 해소 끝(또는 스텝 끝)마다 호출해도 안전(같은 페이즈면 no-op).
 */
function checkBossPhase(state: GridCombatState, boss: Boss | undefined): void {
  if (!state.isBoss) return;
  const bossUnit = state.enemies.find((e) => e.isBoss);
  if (!bossUnit || bossUnit.hp <= 0) return;
  const thresholds = state.bossPhaseThresholds ?? [];
  if (thresholds.length <= 1) return;
  const ratio = bossUnit.maxHp > 0 ? bossUnit.hp / bossUnit.maxHp : 0;

  // 현재 HP%로 도달 가능한 *가장 늦은* 페이즈 인덱스 — BossView activePhase와 동일 규칙.
  let targetIdx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio <= thresholds[i]) targetIdx = i;
  }

  let cur = state.bossPhaseIndex ?? 0;
  if (targetIdx <= cur) return; // 전환 없음(되돌아가기 없음).

  // cur+1 .. targetIdx 까지 차례로 진입(각 페이즈의 소환을 빠짐없이 1회씩 처리).
  while (cur < targetIdx) {
    cur += 1;
    // 거동 교체 — 그 페이즈 세트(없으면 상속된 직전 세트).
    const set = bossUnit.phaseBehaviors?.[cur];
    if (set && set.length > 0) bossUnit.attacks = set.map((a) => ({ ...a }));
    // 진입 소환.
    const minions = boss?.phases?.[cur]?.spawnMinions ?? [];
    for (const mid of minions) spawnEnemy(state, mid);
    pushLog(state, `${bossUnit.name ?? '보스'}이(가) 자세를 바꾼다`);
    pushFx(state, { kind: 'status', actorId: bossUnit.id });
  }
  state.bossPhaseIndex = cur;
  // 거동이 바뀌었으니 의도 재계산(텔레그래프 갱신).
  bossUnit.intentQueue = enemyPlan(state, bossUnit);
}

/** 현재 보스 정의 조회(스토어) — 페이즈 소환 minion id를 읽기 위해. 미접근 시 undefined. */
function currentBossDef(state: GridCombatState): Boss | undefined {
  if (!state.bossId) return undefined;
  try {
    return useDataStore().bosses.get(state.bossId);
  } catch {
    return undefined;
  }
}

// ============================================================================
// 적 AI — enemyPlan
// ============================================================================

/**
 * 적 1마리의 향후 foresight 스텝 행동 예측(텔레그래프 + 실행 공용).
 *
 * 기본 = *바운드 게임트리(lookahead) AI*(planEnemyGameTree). foresight 스텝까지 행동 시퀀스
 * 후보를 분기/깊이 캡 안에서 펼치고 휴리스틱으로 평가해 최고 점수 시퀀스를 고른다.
 *
 * 폴백(단순 그리디, planOneEnemyStep 반복):
 *  - enemy.fixedAi 가 true (스크립트형 적·보스 페이즈) 또는
 *  - 격자 공격(attacks)이 없음 (gridBehavior 미정의 — 근접 1칸 폴백뿐이라 트리 무의미).
 *
 * best-effort 예측 — 실제 실행 시점엔 commitRound가 상태를 재평가한다.
 */
export function enemyPlan(state: GridCombatState, enemy: GridCombatant): PlannedAction[] {
  const useTree = !enemy.fixedAi && (enemy.attacks?.length ?? 0) > 0;
  return useTree ? planEnemyGameTree(state, enemy) : greedyEnemyPlan(state, enemy);
}

/** 단순 그리디 폴백 — 가상 위치를 갱신하며 N스텝을 planOneEnemyStep으로 채운다. */
function greedyEnemyPlan(state: GridCombatState, enemy: GridCombatant): PlannedAction[] {
  const out: PlannedAction[] = [];
  let simPos = { ...enemy.pos };
  for (let step = 0; step < state.foresight; step++) {
    const action = planOneEnemyStep(state, enemy, simPos);
    out.push(action);
    if (action.kind === 'move') simPos = { ...action.to };
  }
  return out;
}

/** 적 1스텝 — 가상 위치 기준으로 공격/접근 결정. */
function planOneEnemyStep(
  state: GridCombatState,
  enemy: GridCombatant,
  simPos: GridPos,
): PlannedAction {
  const target = state.player;
  if (target.hp <= 0) return { kind: 'wait' };

  // 1) 사용 가능한 격자 공격 — 플레이어가 패턴 칸 안에 들어오는가.
  const attacks = enemy.attacks ?? [];
  for (let i = 0; i < attacks.length; i++) {
    const atk = attacks[i];
    const requires = atk.requiresInRange !== false; // 기본 true.
    if (!requires) {
      // 위치 무관 자기 행동(버프 등) — 슬라이스에선 그냥 그 칸을 타겟으로.
      return { kind: 'attack', attackIdx: i, targetTiles: attackTilesFrom(state, simPos, atk) };
    }
    const tiles = attackTilesFrom(state, simPos, atk);
    if (tiles.some((p) => samePos(p, target.pos))) {
      return { kind: 'attack', attackIdx: i, targetTiles: tiles };
    }
  }

  // 2) gridBehavior 없음 → 근접 폴백: 인접(거리1) 또는 *같은 칸*(거리0, 겹침)이면 근접 공격.
  if (attacks.length === 0) {
    if (manhattan(simPos, target.pos) <= 1) {
      return { kind: 'attack', attackIdx: -1, targetTiles: [{ ...target.pos }] };
    }
  }

  // 3) 접근 이동 — 사거리 안으로 들어가도록 플레이어에 가까운 칸(겹침 허용).
  const move = approachMove(state, enemy, simPos, target.pos);
  if (move) return { kind: 'move', to: move };

  // 4) 마지막 폴백 — 인접/겹침이면 근접 공격, 아니면 대기.
  if (manhattan(simPos, target.pos) <= 1) {
    return { kind: 'attack', attackIdx: -1, targetTiles: [{ ...target.pos }] };
  }
  return { kind: 'wait' };
}

/** atk의 적용 칸을 임의 origin 기준으로(예측용 — 가상 위치 지원). */
function attackTilesFrom(state: GridCombatState, origin: GridPos, atk: GridAttack): GridPos[] {
  const out: GridPos[] = [];
  for (const o of atk.shape ?? []) {
    const p = { x: origin.x + o.dx, y: origin.y + o.dy };
    if (tileWalkable(state.stage, p)) out.push(p);
  }
  return out;
}

/** 어떤 칸의 *과밀도* — self를 뺀 살아 있는 다른 적이 그 칸 직교 인접(≤1)에 몇이나 있는가. */
function crowdingAt(state: GridCombatState, pos: GridPos, self: GridCombatant): number {
  let n = 0;
  for (const e of state.enemies) {
    if (e === self || e.hp <= 0) continue;
    if (manhattan(e.pos, pos) <= 1) n += 1;
  }
  return n;
}

/**
 * 접근 이동 — reachableTiles 중 플레이어에 가장 가까워지는 칸.
 * fromPos는 가상 위치(예측). 실행 시엔 enemy.pos와 동일하게 호출된다.
 * 그리디 적이 같은 칸으로 과수렴하지 않도록(US-006): *가장 가까운* 칸이 여럿이면 *덜 붐비는* 칸을 고른다.
 */
function approachMove(
  state: GridCombatState,
  enemy: GridCombatant,
  fromPos: GridPos,
  targetPos: GridPos,
): GridPos | undefined {
  // 가상 위치가 enemy.pos와 다르면 임시로 위치를 바꿔 reachable을 구한 뒤 원복.
  const realPos = enemy.pos;
  enemy.pos = fromPos;
  const tiles = reachableTiles(state, enemy);
  enemy.pos = realPos;
  if (tiles.length === 0) return undefined;

  // 1) 더 가까워지는 칸만 후보(접근 의도 유지) → 그중 최소 거리.
  const curDist = manhattan(fromPos, targetPos);
  let minD = Infinity;
  for (const t of tiles) {
    const d = manhattan(t, targetPos);
    if (d < curDist && d < minD) minD = d;
  }
  if (minD === Infinity) return undefined;

  // 2) 최소 거리 칸들 중 *과밀도가 가장 낮은* 칸(동률 분산). 동률은 등장 순서(결정론).
  let best: GridPos | undefined;
  let bestCrowd = Infinity;
  for (const t of tiles) {
    if (manhattan(t, targetPos) !== minD) continue;
    const c = crowdingAt(state, t, enemy);
    if (c < bestCrowd) { bestCrowd = c; best = t; }
  }
  return best;
}

// ============================================================================
// 게임트리 AI — 바운드 lookahead (planEnemyGameTree)
// ----------------------------------------------------------------------------
// 각 적이 *자신의* foresight 스텝 행동 시퀀스 후보를 분기/깊이 캡 안에서 펼치고,
// 휴리스틱(예상 피해 +, 노출 -, 거리, 과밀 회피, 위치 가치)으로 평가해 최고 시퀀스를 고른다.
// 다른 전투원(플레이어·아군)은 *정적*으로 가정(표준 바운드 가정) — 실행 시 commitRound가 재평가한다.
// 동점은 시드 rng로 결정론 처리(Math.random 금지).
//
// 성능 캡:
//  - 깊이 = foresight (≤3).
//  - 스텝당 이동 분기 ≤ MOVE_BRANCH_CAP, 공격은 사용 가능한 것 전부(소수).
//  - 전체 평가 노드 ≤ NODE_BUDGET (초과 시 그 가지 그리디 폴백). 1라운드 즉각(<50ms).
// ============================================================================

/** 스텝당 펼치는 이동 후보 상한(플레이어에 가까운 순 상위 K). */
const MOVE_BRANCH_CAP = 6;
/** 한 적 계획당 전체 시뮬레이션 노드 예산(지수 폭발 방지). */
const NODE_BUDGET = 600;

/** 게임트리 평가용 경량 컨텍스트(적 1마리 계획 동안 고정값 캐시). */
interface AiContext {
  state: GridCombatState;
  enemy: GridCombatant;
  /** 플레이어 위치(정적 가정). */
  playerPos: GridPos;
  /** 다른 살아 있는 적 위치(과밀 회피용, 자신 제외 — 정적). */
  allyPositions: GridPos[];
  /** 적 기본 공격치 + 힘(근접 폴백 피해 추정용). */
  baseAtk: number;
  /** 남은 노드 예산(가변). */
  budget: number;
}

/** 한 시뮬레이션 노드 상태 — 적 가상 위치 + 누적 평가 항목. */
interface AiSimNode {
  pos: GridPos;
  /** 이 경로에서 플레이어에게 줄 것으로 추정한 누적 피해. */
  cumDamage: number;
  /** 이 경로의 행동 시퀀스(루트→현재). */
  actions: PlannedAction[];
}

/**
 * 게임트리 진입점 — 후보 시퀀스를 펼쳐 최고 점수의 *행동 시퀀스 전체*를 intentQueue로 돌려준다.
 * 깊이는 foresight, 분기는 캡. 노드 예산 초과 시 그리디 폴백.
 */
function planEnemyGameTree(state: GridCombatState, enemy: GridCombatant): PlannedAction[] {
  const ctx: AiContext = {
    state,
    enemy,
    playerPos: { ...state.player.pos },
    allyPositions: state.enemies
      .filter((e) => e !== enemy && e.hp > 0)
      .map((e) => ({ ...e.pos })),
    baseAtk: (enemy.attack ?? 0) + (enemy.statuses.strength ?? 0),
    budget: NODE_BUDGET,
  };

  if (state.player.hp <= 0) {
    return new Array(state.foresight).fill(null).map(() => ({ kind: 'wait' } as PlannedAction));
  }

  const root: AiSimNode = { pos: { ...enemy.pos }, cumDamage: 0, actions: [] };
  const best = searchBestSequence(ctx, root, 0);

  // 예산 초과/실패 시 그리디 폴백(안전).
  if (!best || best.actions.length === 0) return greedyEnemyPlan(state, enemy);

  // 시퀀스 길이를 foresight에 맞춤(부족분은 wait, 초과분은 자름).
  const seq = best.actions.slice(0, state.foresight);
  while (seq.length < state.foresight) seq.push({ kind: 'wait' });
  return seq;
}

/**
 * DFS — node에서 depth..foresight 까지 최고 점수 잎(누적 시퀀스)을 찾는다.
 * 반환: 최고 점수 잎 노드(전체 actions 포함). 동점은 시드 rng로 결정론 선택.
 */
function searchBestSequence(ctx: AiContext, node: AiSimNode, depth: number): AiSimNode | undefined {
  // 종료(깊이 도달) 또는 예산 소진 — 현재 노드를 잎으로.
  if (depth >= ctx.state.foresight || ctx.budget <= 0) return node;

  const candidates = enumerateStepActions(ctx, node.pos);
  if (candidates.length === 0) {
    // 행동 후보 없음 — wait로 채워 나머지 깊이를 종료.
    const waited: AiSimNode = {
      pos: node.pos,
      cumDamage: node.cumDamage,
      actions: [...node.actions, { kind: 'wait' }],
    };
    return searchBestSequence(ctx, waited, depth + 1);
  }

  let best: AiSimNode | undefined;
  let bestScore = -Infinity;
  for (const cand of candidates) {
    if (ctx.budget <= 0) break;
    ctx.budget -= 1;
    const child = applyCandidate(ctx, node, cand);
    const leaf = searchBestSequence(ctx, child, depth + 1);
    if (!leaf) continue;
    const score = scoreLeaf(ctx, leaf);
    // 동점 — 시드 rng로 절반 확률 교체(결정론, 편향 없음).
    if (score > bestScore || (score === bestScore && rng() < 0.5)) {
      bestScore = score;
      best = leaf;
    }
  }
  return best;
}

/** node.pos에서 가능한 *이 스텝의 행동 후보* — 공격(사거리 안) 전부 + 접근 이동 상위 K + 필요 시 wait. */
function enumerateStepActions(ctx: AiContext, fromPos: GridPos): PlannedAction[] {
  const out: PlannedAction[] = [];
  const attacks = ctx.enemy.attacks ?? [];

  // 1) 사용 가능한 격자 공격(플레이어가 패턴 칸에 들어오는가) — 전부 후보.
  for (let i = 0; i < attacks.length; i++) {
    const atk = attacks[i];
    const requires = atk.requiresInRange !== false;
    const tiles = attackTilesFrom(ctx.state, fromPos, atk);
    if (!requires || tiles.some((p) => samePos(p, ctx.playerPos))) {
      out.push({ kind: 'attack', attackIdx: i, targetTiles: tiles });
    }
  }

  // 2) 이동 후보 — fromPos 기준 reachable 중 플레이어에 가까운 순 상위 K(자신 위치 임시 변경 후 원복).
  const realPos = ctx.enemy.pos;
  ctx.enemy.pos = fromPos;
  const tiles = reachableTiles(ctx.state, ctx.enemy);
  ctx.enemy.pos = realPos;
  tiles.sort((a, b) => manhattan(a, ctx.playerPos) - manhattan(b, ctx.playerPos));
  for (let k = 0; k < tiles.length && k < MOVE_BRANCH_CAP; k++) {
    out.push({ kind: 'move', to: { ...tiles[k] } });
  }

  // 3) 아무 후보도 없으면 wait(제자리)로라도 한 스텝.
  if (out.length === 0) out.push({ kind: 'wait' });
  return out;
}

/** 후보 행동을 node에 적용한 자식 노드(가상 — 실제 상태 불변). */
function applyCandidate(ctx: AiContext, node: AiSimNode, cand: PlannedAction): AiSimNode {
  const actions = [...node.actions, cand];
  if (cand.kind === 'move') {
    return { pos: { ...cand.to }, cumDamage: node.cumDamage, actions };
  }
  if (cand.kind === 'attack') {
    return { pos: node.pos, cumDamage: node.cumDamage + estimateAttackDamage(ctx, node.pos, cand.attackIdx), actions };
  }
  // wait.
  return { pos: node.pos, cumDamage: node.cumDamage, actions };
}

/** 이 스텝 공격이 플레이어에게 줄 것으로 추정한 피해(블록 무시 — 우선순위용 근사). */
function estimateAttackDamage(ctx: AiContext, fromPos: GridPos, attackIdx: number): number {
  const atk = ctx.enemy.attacks?.[attackIdx];
  if (!atk) return 0;
  const base = (atk.damage ?? ctx.enemy.attack ?? 0) + (ctx.enemy.statuses.strength ?? 0);
  // 플레이어가 들어오는 패턴 칸 인덱스의 perTileMul 적용분만 합산(여러 칸이 겹치면 합).
  let dmg = 0;
  (atk.shape ?? []).forEach((off, i) => {
    const p = { x: fromPos.x + off.dx, y: fromPos.y + off.dy };
    if (!tileWalkable(ctx.state.stage, p)) return;
    if (samePos(p, ctx.playerPos)) dmg += Math.floor(base * (atk.perTileMul?.[i] ?? 1));
  });
  return dmg;
}

/**
 * 잎 노드 점수 — 휴리스틱 합.
 *  + 누적 예상 피해(가장 큰 가중)
 *  + 플레이어 근접도(가까울수록 — 다음 라운드 사거리 확보)
 *  - 아군 과밀(같은 칸 인접에 몰리면 페널티 — 협공 분산 유도)
 *  - 자기 노출(플레이어 직교 인접에 *붙어* 끝나면 반격 위험 소폭 페널티)
 *  + 위치 가치(궁지에 안 몰린 트인 칸 소폭 가산 — 기동성)
 */
function scoreLeaf(ctx: AiContext, leaf: AiSimNode): number {
  let score = 0;
  // 예상 피해 — 핵심 동인.
  score += leaf.cumDamage * 10;

  // 플레이어와의 거리 — 가까울수록 +(맨해튼이 작을수록 점수↑).
  const dist = manhattan(leaf.pos, ctx.playerPos);
  score += (12 - Math.min(12, dist)) * 1.5;

  // 아군 과밀 회피 — 끝 위치가 다른 적과 인접/동일하면 페널티(협공 분산).
  for (const ally of ctx.allyPositions) {
    const ad = manhattan(leaf.pos, ally);
    if (ad === 0) score -= 6;       // 같은 칸으로 수렴(실제론 불가하나 가상 안전).
    else if (ad === 1) score -= 2;  // 바로 옆에 뭉침.
  }

  // 자기 노출 — 플레이어 직교 인접에 붙어 끝나면 소폭 페널티(피해를 못 줄 때만 의미).
  if (dist === 1 && leaf.cumDamage <= 0) score -= 1.5;

  // 위치 가치 — 궁지(차단 칸 많음)에 안 몰린 트인 칸 소폭 선호(기동성 유지).
  const confine = confinedCount(ctx.state, leaf.pos);
  score -= confine * 0.5;

  return score;
}

/** 모든 적 intentQueue 재계산. */
function recomputeAllEnemyPlans(state: GridCombatState): void {
  for (const e of state.enemies) {
    if (e.hp <= 0) {
      e.intentQueue = [];
      continue;
    }
    e.intentQueue = enemyPlan(state, e);
  }
}

// ============================================================================
// 라운드 해소 — commitRound
// ============================================================================

interface ScheduledAction {
  actor: GridCombatant;
  action: PlannedAction;
  speed: CastSpeed;
  isPlayer: boolean;
}

/**
 * 라운드 해소.
 * 스텝 0..foresight-1 각각에서 [플레이어 plan[step] + 각 적 intentQueue[step]]를
 * castSpeed순(동률 플레이어 우선)으로 인터리브 실행한다.
 * 매 동작마다 fx push. 스텝 종료 후 증원·처치 정리·승리 판정.
 * 라운드 종료: turn++, block 반감, 상태 감쇠, *마나만* 풀충전(손패는 유지), 적 의도 재계산, plan 비움.
 */
export function commitRound(state: GridCombatState): void {
  if (state.outcome) return;

  // 순차 재생용 행동 그룹 인덱스 리셋 — 이 라운드의 fx가 0번부터 그룹된다.
  fxActionIndex = 0;

  for (let step = 0; step < state.foresight; step++) {
    if (state.outcome) break;

    const scheduled: ScheduledAction[] = [];

    // 플레이어 행동(있으면).
    const pAction = state.playerPlan[step];
    if (pAction && state.player.hp > 0) {
      scheduled.push({
        actor: state.player,
        action: pAction,
        speed: actionSpeed(state, state.player, pAction),
        isPlayer: true,
      });
    }

    // 적 둔화(slow-enemy): 활성 중이면 *마지막 스텝*의 적 행동을 생략(효과상 적 행동 -1).
    const slowSuppress = (state.gridEnemySlow ?? 0) > 0 && step === state.foresight - 1 && state.foresight > 1;

    // 각 적 행동.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const eAction = enemy.intentQueue?.[step];
      if (!eAction) continue;
      if (slowSuppress) continue; // 둔화로 이 스텝 적 행동 생략.
      // 적 행동 박제(skip-enemy-action): 공격/이동 행동을 1개 소비하며 건너뛴다(대기는 소비 안 함).
      if ((state.gridEnemySkip ?? 0) > 0 && eAction.kind !== 'wait') {
        state.gridEnemySkip = (state.gridEnemySkip ?? 0) - 1;
        continue;
      }
      scheduled.push({
        actor: enemy,
        action: eAction,
        speed: actionSpeed(state, enemy, eAction),
        isPlayer: false,
      });
    }

    // 각 아군(소환 토큰) 행동 — 적 추격·근접. 둔화/박제(적 전용)는 미적용.
    for (const ally of state.allies ?? []) {
      if (ally.hp <= 0) continue;
      const aAction = ally.intentQueue?.[step];
      if (!aAction) continue;
      scheduled.push({
        actor: ally,
        action: aAction,
        speed: actionSpeed(state, ally, aAction),
        isPlayer: false,
      });
    }

    // 정렬 — 카테고리(방어 0 → 공격·기타 1 → 이동 2) 우선, 그다음 castSpeed, 동률이면 플레이어 우선.
    //   "방어 먼저, 이동 나중" 규칙(#5): 블록을 미리 쌓고, 위치 변동은 가장 마지막에 해소.
    scheduled.sort((a, b) => {
      const c = actionCategory(state, a) - actionCategory(state, b);
      if (c !== 0) return c;
      const d = SPEED_ORDER[a.speed] - SPEED_ORDER[b.speed];
      if (d !== 0) return d;
      if (a.isPlayer && !b.isPlayer) return -1;
      if (!a.isPlayer && b.isPlayer) return 1;
      return 0;
    });

    // 순차 실행 — 죽은 행위자는 건너뜀(실행 시점 재확인).
    //   각 행동마다 fxActionIndex를 +1 해 fx가 *행동별 그룹*으로 나뉜다(뷰가 한 행동씩 순차 재생).
    for (const s of scheduled) {
      if (state.outcome) break;
      if (s.actor.hp <= 0) continue;
      fxActionIndex += 1;
      executeAction(state, s);
    }

    // 스텝 종료 — 처치 정리 + 증원(atTurn은 라운드 단위라 여기선 whenEmpty만).
    cleanupDead(state);
    // 동료 조종 중 동료(=state.player) 사망 → 즉시 복귀 + 마나 0(패널티). checkOutcome 전에 처리해 패배 오판 방지.
    if (state.swap?.controlling && state.player.hp <= 0) revertSwap(state, true);
    // 보스 페이즈 전환 — 이번 스텝 피해로 HP%가 임계를 넘으면 거동 교체 + 소환(즉시 반응).
    if (state.isBoss) checkBossPhase(state, currentBossDef(state));
    handleWhenEmptySpawns(state);
    if (checkOutcome(state)) break;
  }

  // 전투 종료(승/패) — 라운드 종료 정리는 불필요하나, stale plan 재실행 방지로 계획만 비운다.
  if (state.outcome) {
    // 동료 *조종 중* 종료면 실제 플레이어로 복귀 — HP 라이트백(endGridCombat)이 동료 HP를 쓰지 않게.
    //  (승리 시 복귀=무패널티. 대기 중이면 state.player가 아직 실제 플레이어라 swap만 해제.)
    if (state.swap?.controlling) revertSwap(state, false);
    else state.swap = undefined;
    state.playerPlan = [];
    return;
  }

  // === 라운드 종료 ===
  state.turn += 1;

  // 파워 틱(라운드 종료) — 강철(metallicize): player.block += metallicize.
  //  D6(방어 반감)과 충돌 주의: 매 라운드 +block을 반감 *전에* 더해 함께 반감되게 한다(눈덩이 방지).
  //  무통(feel-no-pain)은 exhaust 시점에 이미 부여되므로 여기선 미적용. 반격진(juggernaut)은
  //  gainPlayerBlock 경유라 자동.
  {
    const metal = state.player.statuses['metallicize'] ?? 0;
    if (metal > 0) gainPlayerBlock(state, metal);
  }

  // 모든 전투원 block 반감(D6) + 상태 감쇠. barricade(불굴)면 플레이어 block 반감 면제.
  const barricaded = (state.player.statuses['barricade'] ?? 0) > 0;
  for (const c of aliveCombatants(state)) {
    if (!(c === state.player && barricaded)) c.block = Math.floor(c.block / 2);
    decayStatuses(c);
  }

  // 개화(bloom-strength) — 다음 라운드 대비 매 라운드 strength += bloom(비감쇠).
  if ((state.gridBloom ?? 0) > 0) {
    state.player.statuses['strength'] = (state.player.statuses['strength'] ?? 0) + (state.gridBloom ?? 0);
  }

  // 지연 피해(delayed-damage) 틱 — roundsLeft-1, 0이면 대상(없으면 가장 가까운 적)에게 폭발.
  if (state.gridPendingDamage && state.gridPendingDamage.length > 0) {
    const next: typeof state.gridPendingDamage = [];
    for (const p of state.gridPendingDamage) {
      p.roundsLeft -= 1;
      if (p.roundsLeft > 0) { next.push(p); continue; }
      let tgt = p.targetEnemyId ? state.enemies.find((e) => e.id === p.targetEnemyId && e.hp > 0) : undefined;
      if (!tgt) tgt = nearestEnemy(state);
      if (tgt) applyDamage(state, tgt, p.damage, state.player.statuses);
    }
    state.gridPendingDamage = next;
  }

  // 적 둔화(slow-enemy) 라운드 카운트다운.
  if ((state.gridEnemySlow ?? 0) > 0) state.gridEnemySlow = (state.gridEnemySlow ?? 0) - 1;

  // 라운드 단위 휘발 상태 리셋 — this-turn-amp / hand-cost-down / 포션 턴 가드.
  state.gridThisTurnAmp = 0;
  state.handCostDown = 0;
  state.potionUsedThisTurn = false;

  // atTurn 증원 — 새 turn 기준.
  handleAtTurnSpawns(state);
  cleanupDead(state);
  if (checkOutcome(state)) return;

  // 동료 교대(C6) 라운드 종료 전환/복귀 — 마나 리필 *전*에 처리(전환 시 동료가, 복귀 시 플레이어가 새 마나).
  if (state.swap) {
    if (state.swap.controlling) revertSwap(state, false); // 조종 1라운드 끝 → 자동 복귀.
    else beginCompanionControl(state);                    // 교대(대기) 라운드 끝 → 동료 조종 시작.
  }

  // 마나만 풀충전(F4) — 손패는 자동 리필하지 않는다(보충은 [대기] 행동 전용).
  refillManaPerRound(state);

  // 라운드(턴) 시작 유물(on-turn-start) — 매 턴 방어/힘/색 등. 핸드/마나 리필 후 적용.
  gridRelicTurnStart(state);

  // 보스 페이즈 전환 — 라운드 종료 시점 HP%로도 한 번 더 점검(지연/DoT 피해 반영).
  if (state.isBoss) checkBossPhase(state, currentBossDef(state));

  // 적·아군 의도 재계산.
  recomputeAllEnemyPlans(state);
  recomputeAllyPlans(state);

  // 플레이어 계획 비움.
  state.playerPlan = [];
  state.cardsPlayedThisTurn = 0;
}

/** 방어(블록 획득) 계열 카드 효과 kind 집합 — 방어 카테고리 분류용. */
const DEFENSE_EFFECT_KINDS = new Set<string>([
  'block', 'block-top-color', 'growing-block', 'double-block',
]);

/**
 * 행동 카테고리(해소 순서 우선) — 작을수록 먼저 해소.
 *   0 = 방어(블록 획득): 이동 액션은 아니되 블록 계열 카드.
 *   2 = 이동(move 액션).
 *   1 = 공격·기타(그 사이).
 * "방어 먼저, 이동 나중"(#5). 카드는 효과로, move/wait/item/attack은 kind로 분류.
 */
function actionCategory(state: GridCombatState, s: ScheduledAction): number {
  const action = s.action;
  if (action.kind === 'move') return 2;
  if (action.kind === 'card') {
    const card = state.hand.find((c) => c.instanceId === action.cardInstanceId);
    const isDefense = !!card && card.effects.some((e) => DEFENSE_EFFECT_KINDS.has(e.kind));
    return isDefense ? 0 : 1;
  }
  // attack / item / wait — 그 사이(1). (적의 self 버프 공격도 1로 두어 기존 순서 보존.)
  return 1;
}

/** 행동의 발동 속도. */
function actionSpeed(state: GridCombatState, actor: GridCombatant, action: PlannedAction): CastSpeed {
  if (action.kind === 'card') {
    const card = state.hand.find((c) => c.instanceId === action.cardInstanceId);
    return card?.castSpeed ?? 'normal';
  }
  if (action.kind === 'attack') {
    const atk = actor.attacks?.[action.attackIdx];
    return atk?.castSpeed ?? actor.speed ?? 'normal';
  }
  // 이동/아이템/대기 — 행위자 기본 속도.
  return actor.speed ?? 'normal';
}

/** 한 예약 행동 실행. */
function executeAction(state: GridCombatState, s: ScheduledAction): void {
  const { actor, action } = s;
  switch (action.kind) {
    case 'move':
      execMove(state, actor, action.to);
      break;
    case 'card':
      execCard(state, action.cardInstanceId, action.targetTiles, action.aimOffset);
      break;
    case 'attack':
      if (actor.team === 'ally') execAllyAttack(state, actor);
      else execAttack(state, actor, action.attackIdx, action.targetTiles);
      break;
    case 'item':
      if (actor.team === 'player') execItem(state, action.itemId);
      break;
    case 'swap':
      if (actor.team === 'player') execSwap(state, action.companionId);
      break;
    case 'wait':
      if (actor.team === 'player') execWait(state);
      break;
    default:
      break;
  }
}

/**
 * 대기 실행(플레이어) — 손패를 목표 크기(5+드로우보너스)까지 *보충*(F4 [확정]).
 * 손패는 자동 리필되지 않으므로, 카드를 비워가며 쓰다가 [대기]로만 다시 채운다.
 * 이미 목표 이상이면 드로우 없음(대기는 한 스텝 소비로 의미). drawIntoHand가 더미 고갈/재셔플 처리.
 */
function execWait(state: GridCombatState): void {
  const need = targetHandSize(state) - state.hand.length;
  if (need > 0) {
    const before = state.hand.length;
    drawIntoHand(state, need);
    const drawn = state.hand.length - before;
    if (drawn > 0) pushLog(state, `손패 보충 (+${drawn})`);
  }
}

/** 이동 실행 — 합법성 재확인(상태 변동 가능) 후 이동 + 바닥 아이템 획득. */
function execMove(state: GridCombatState, actor: GridCombatant, to: GridPos): void {
  // 닻(anchored) 상태면 플레이어 이동 무력화(큐잉 후 부여됐을 수 있어 실행 시점에도 가드 — US-005).
  if (actor.team === 'player' && (actor.statuses['anchored'] ?? 0) > 0) {
    pushLog(state, '닻에 묶여 움직일 수 없다');
    return;
  }
  // 실행 시점 합법성 재평가 — 도착 칸이 비어 있고 통행 가능해야.
  if (!isFreeTile(state, to)) {
    // 막혔으면 같은 방향 best-effort 한 칸(접근). 그래도 안 되면 제자리.
    const fallback = approachMove(state, actor, actor.pos, to);
    if (!fallback || !isFreeTile(state, fallback)) return;
    to = fallback;
  }
  const from = { ...actor.pos };
  actor.pos = { ...to };
  pushFx(state, { kind: 'move', actorId: actor.id, from, to: { ...to } });
  // 바닥 아이템 — 플레이어가 그 칸에 서면 획득(슬라이스: 기록만, 실제 인벤 추가는 스토어).
  if (actor.team === 'player') collectItemAt(state, to);
}

/** 바닥 아이템 픽업 — itemDrops에서 제거 + 런 인벤토리에 추가. */
function collectItemAt(state: GridCombatState, pos: GridPos): void {
  const drops = state.stage.itemDrops;
  if (!drops || drops.length === 0) return;
  const idx = drops.findIndex((d) => samePos(d.pos, pos));
  if (idx < 0) return;
  const [picked] = drops.splice(idx, 1);
  try {
    const itm = useDataStore().items.get(picked.itemId);
    if (itm) {
      useRunStore().addItem(itm);
      pushLog(state, `${itm.name} 획득`);
    }
  } catch { /* 무해 */ }
}

/** 카드 실행 — 마나 차감 + shape 칸 대상에 효과. aimOffset(aimed 카드)면 조준 칸 중심으로 적용. */
function execCard(
  state: GridCombatState,
  cardInstanceId: string,
  targetTiles: GridPos[],
  aimOffset?: GridOffset,
): void {
  const idx = state.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (idx < 0) return;
  const card = state.hand[idx];
  if (card.unplayable) return;
  const cost = cardCost(state, card);
  if (state.mana < cost) return; // 마나 부족(이미 큐 검증했지만 방어).
  state.mana -= cost;
  state.cardsPlayedThisTurn = (state.cardsPlayedThisTurn ?? 0) + 1;

  // next-card-double 캡처 — 이 카드가 적용될 때 2배가 걸려 있었는지(이 카드 자신엔 미적용 카드가 세팅, 다음 카드부터).
  const doubled = state.gridNextCardDouble === true;
  if (doubled) state.gridNextCardDouble = false;

  // 손에서 제거(효과 적용 전에 빼서 자기참조 효과 안전).
  state.hand.splice(idx, 1);

  applyCardEffects(state, card, targetTiles, doubled, aimOffset);

  // 카드 이동 — exhaust-self면 소멸(+무통 트리거), return-self-to-hand면 손으로 복귀, 아니면 버린 더미.
  if (card.effects.some((e) => e.kind === 'exhaust-self')) {
    state.exhaustPile.push(card);
    // 무통(feel-no-pain): 카드 소멸 시 player.block += feelNoPain.
    const fnp = state.player.statuses['feelNoPain'] ?? 0;
    if (fnp > 0) gainPlayerBlock(state, fnp);
  } else if (card.effects.some((e) => e.kind === 'return-self-to-hand')) {
    // 손이 가득 차 있으면 버린 더미로(캡 보호).
    if (state.hand.length < MAX_HAND_SIZE) state.hand.push(card);
    else state.discardPile.push(card);
  } else {
    state.discardPile.push(card);
  }
  // 카드 사용 후 유물(on-card-played-after) — 카운터형(헤아림의 염주·벼림의 띠 등).
  gridRelicOnCardPlayed(state, card.id);
  pushLog(state, `「${card.name}」`);
}

/**
 * 전투 포션 사용(격자) — run.items에서 instanceId(폴백 id)로 1점 찾아 효과 적용 후 소모.
 *  - 턴(라운드)당 1회 가드: state.potionUsedThisTurn. 이미 썼으면 무시.
 *  - 전투용(combat=true)·사용 가능(효과 보유) 포션만. 아니면 안전 무시.
 *  - heal→hp / combat-block→block / combat-mana→mana / combat-draw→드로우 /
 *    combat-enemy-status→가장 가까운 적 / combat-self-status→player / cleanse-group→정화.
 *  - on-item-use 유물은 *맵 경로(item.ts useItem)* 전용이라 격자에선 미발동(중복 방지).
 */
function execItem(state: GridCombatState, itemId: string): void {
  if (state.potionUsedThisTurn) return; // 이번 라운드 이미 사용.
  let run;
  try {
    run = useRunStore();
  } catch {
    return;
  }
  const items = run.data.items ?? [];
  const idx = items.findIndex((i) => i.instanceId === itemId || i.id === itemId);
  if (idx < 0) return;
  const item = items[idx];
  // 전투용·사용 가능 포션만(재료·맵 전용은 격자에서 무시).
  if (!item.combat) return;
  if (!item.effects || item.effects.length === 0) return;

  const lines = useItemInGrid(state, item);

  // 소모 — 소비형이면 인벤토리에서 1점 제거.
  if (item.consumable !== false) items.splice(idx, 1);

  // 턴당 1회 가드.
  state.potionUsedThisTurn = true;

  if (lines.length > 0) pushLog(state, `'${item.name}' — ${lines.join(' / ')}`);
  else pushLog(state, `'${item.name}' 사용`);
}

/**
 * 플레이어 방어 획득 중앙 경유점(격자판) — juggernaut(반격진) 발동을 위해 모든 플레이어 block 증가가 거친다.
 * juggernaut 피해는 적 hp 직접(dealRawDamage)이라 block을 다시 만들지 않으므로 재진입 없음.
 */
function gainPlayerBlock(state: GridCombatState, amount: number): void {
  if (amount <= 0) return;
  state.player.block += amount;
  pushFx(state, { kind: 'block-gain', actorId: state.player.id, amount }); // 방어 획득 fx(US-007).
  const jugg = state.player.statuses['juggernaut'] ?? 0;
  if (jugg > 0) {
    // 가장 가까운 살아 있는 적에게 반격.
    const tgt = nearestEnemy(state);
    if (tgt) applyDamage(state, tgt, jugg, state.player.statuses);
  }
}

/**
 * move-rider 대시(D2) — 플레이어를 가장 가까운 적 기준 toward/away로 최대 tiles칸 이동.
 * 카드 효과 부가이동(이동 프로필 무시 — 카드가 부여한 기동). 매 칸 우세 축으로 1칸, 벽/void/밖이면 중단.
 * 한 칸이라도 움직였으면 move fx 1회(카드 행동 그룹에 묶여 애니).
 */
function dashPlayer(state: GridCombatState, tiles: number, mode: 'toward' | 'away'): void {
  if (tiles <= 0) return;
  const enemy = nearestEnemy(state);
  if (!enemy) return;
  const from = { ...state.player.pos };
  let cur = { ...state.player.pos };
  for (let i = 0; i < tiles; i++) {
    const dx = enemy.pos.x - cur.x;
    const dy = enemy.pos.y - cur.y;
    let sx = 0, sy = 0;
    if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx); else sy = Math.sign(dy);
    if (mode === 'away') { sx = -sx; sy = -sy; }
    if (sx === 0 && sy === 0) break;          // toward로 이미 같은 칸(겹침) — 더 갈 곳 없음.
    const next = { x: cur.x + sx, y: cur.y + sy };
    if (!tileWalkable(state.stage, next)) break; // 벽/void/밖 — 중단.
    cur = next;
  }
  if (!samePos(cur, from)) {
    state.player.pos = cur;
    pushFx(state, { kind: 'move', actorId: state.player.id, from, to: { ...cur } });
    collectItemAt(state, cur); // 대시로 바닥 아이템 칸에 닿으면 획득.
  }
}

/** 플레이어에 가장 가까운 살아 있는 적(맨해튼). 없으면 undefined. */
function nearestEnemy(state: GridCombatState): GridCombatant | undefined {
  let best: GridCombatant | undefined;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = manhattan(state.player.pos, e.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** 8 컬러 값 배열(현재 런). 스토어 미접근 시 전부 0. */
function colorValues(): number[] {
  try {
    const c = useRunStore().data.colors;
    return [c.fire, c.water, c.electric, c.iron, c.earth, c.wind, c.light, c.dark];
  } catch {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }
}

/** 동료(활성 슬롯) 수. */
function companionCount(): number {
  try {
    return (useRunStore().data.activeSlots ?? []).filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** 유물 수. */
function relicCount(): number {
  try {
    return useRunStore().data.relics.length;
  } catch {
    return 0;
  }
}

/** 적 디버프 스택 총합(취약/약화/연약/중독/화상/퇴행). */
function enemyDebuffSum(s: Record<string, number>): number {
  return (s.vulnerable ?? 0) + (s.weakness ?? 0) + (s.frail ?? 0)
    + (s.poison ?? 0) + (s.burn ?? 0) + (s.regress ?? 0);
}

/** this-turn-amp / next-card-double 곱을 effect base 수치에 반영. */
function ampValue(state: GridCombatState, raw: number, doubled: boolean): number {
  let v = raw;
  const pct = state.gridThisTurnAmp ?? 0;
  if (pct > 0) v = v * (1 + pct / 100);
  if (doubled) v = v * 2;
  return v;
}

/**
 * 카드 효과 적용 — 격자 적응 풀 핸들러(B3, 627 변환 계약).
 * 분류:
 *  - self 페이로드(heal/block/draw/마나/파워/색)는 플레이어에게(위치 무관).
 *  - 적 페이로드(damage/디버프/소비)는 shape 칸 위 적군(shapeHits)에 각 perTileMul로 분배.
 *  - 스케일링 피해는 base를 산출 후 shapeHits에 분배.
 *  - 1v1 전제가 강해 격자에 부적합한 일부(release-transform/curse-tick 등)는 안전 no-op.
 * doubled: 이 카드가 next-card-double 대상이면 모든 effect base ×2.
 */
function applyCardEffects(
  state: GridCombatState,
  card: Card,
  targetTiles: GridPos[],
  doubled = false,
  aimOffset?: GridOffset,
): void {
  const bonus = currentBonuses();
  const playerStatuses = state.player.statuses;
  const strength = playerStatuses.strength ?? 0;
  const relicBlockAdd = gridBlockAdd(state); // 유물 방어 보너스(block-out-add) — block 계열 카드에 가산.

  // 실행 시점 *현재 위치* 기준 shape로 대상 재계산(텔레그래프 stale 방지) — perTileMul을 shape 인덱스에 정렬.
  // aimed 카드는 anchor = player.pos + aimOffset(조준 칸 중심)로 shape를 옮겨 적용.
  void targetTiles;
  const anchor = aimOffset
    ? { x: state.player.pos.x + aimOffset.dx, y: state.player.pos.y + aimOffset.dy }
    : state.player.pos;
  const shape = card.shape ?? [];
  const perTileMul = card.perTileMul ?? [];
  const shapeHits: { target: GridCombatant; mul: number }[] = [];
  shape.forEach((off, i) => {
    const pos = { x: anchor.x + off.dx, y: anchor.y + off.dy };
    if (!tileWalkable(state.stage, pos)) return;
    // 그 칸의 *모든* 적군을 대상에 포함(겹침 허용 — 한 칸에 적 여럿/플레이어와 겹쳐도). perTileMul은 칸 인덱스 기준.
    const mul = perTileMul[i] ?? 1;
    for (const c of combatantsAt(state, pos)) {
      if (c.team === 'enemy' && c.hp > 0) shapeHits.push({ target: c, mul });
    }
  });

  /**
   * shape 칸 위 각 적에게 base 피해를 perTileMul로 분배(strength/weakness/vulnerable 통합).
   * 유물 damage-out-add/mul(applyDamageRelicMods)을 strength·색보너스 포함한 base에 적용 —
   * 구 combat.ts applyModifiers와 동일 위치(perTileMul 분배 *전*).
   */
  const dealToShape = (base: number, addStrength = true): void => {
    if (base <= 0) return;
    const withStr = addStrength ? base + strength : base;
    const v = applyDamageRelicMods(state, withStr); // 유물 주는 피해 보정.
    for (const { target, mul } of shapeHits) {
      applyDamage(state, target, Math.floor(v * mul), playerStatuses);
    }
  };
  /** 플레이어 방어 획득(juggernaut 경유). */
  const gainBlock = (v: number): void => { if (v > 0) gainPlayerBlock(state, v); };
  /** 카드 자해 — rupture(각혈) 발동: 카드로 HP를 잃으면 strength += rupture. */
  const loseHpFromCard = (lost: number): void => {
    if (lost <= 0) return;
    state.player.hp = Math.max(0, state.player.hp - lost);
    const rupture = playerStatuses['rupture'] ?? 0;
    if (rupture > 0) playerStatuses['strength'] = (playerStatuses['strength'] ?? 0) + rupture;
  };

  for (const eff of card.effects) {
    const rawV = eff.value ?? 0;
    const v = ampValue(state, rawV, doubled); // this-turn-amp + next-card-double 반영(수치형 base).
    switch (eff.kind) {
      // === 기본 5종 ===
      case 'damage': {
        dealToShape(Math.floor(v) + bonus.damage);
        break;
      }
      case 'heal': {
        const hv = Math.floor(v);
        if (hv > 0) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + hv);
          pushFx(state, { kind: 'heal', actorId: state.player.id, amount: hv });
        } else if (hv < 0) {
          loseHpFromCard(-hv); // 음수 = 자기 HP 비용(각혈 발동).
        }
        break;
      }
      case 'block': {
        gainBlock(Math.max(0, Math.floor(v) + bonus.block + relicBlockAdd + (playerStatuses.dexterity ?? 0)));
        break;
      }
      case 'draw': {
        drawIntoHand(state, Math.floor(rawV)); // 드로우 수는 amp 미적용.
        break;
      }
      case 'apply-status': {
        const status = String(eff.params?.status ?? '');
        if (!status) break;
        const sv = Math.floor(rawV); // 상태 스택은 amp 미적용.
        if ((eff.target ?? 'enemy') === 'self') {
          state.player.statuses[status] = (state.player.statuses[status] ?? 0) + sv;
        } else {
          for (const { target } of shapeHits) {
            target.statuses[status] = (target.statuses[status] ?? 0) + sv;
          }
        }
        break;
      }

      // === 컬러 피해/방어 ===
      case 'damage-min-color': {
        const nonzero = colorValues().filter((x) => x > 0);
        const minC = nonzero.length > 0 ? Math.min(...nonzero) : 0;
        dealToShape(Math.max(0, Math.floor(minC * rawV)), false); // ATK/strength 무시(순수 균형값).
        break;
      }
      case 'damage-top-color': {
        const top = Math.max(0, ...colorValues());
        dealToShape(Math.floor(top * rawV), false);
        break;
      }
      case 'damage-color-count': {
        const cnt = colorValues().filter((x) => x > 0).length;
        dealToShape(cnt * Math.floor(rawV), false);
        break;
      }
      case 'block-top-color': {
        const top = Math.max(0, ...colorValues());
        gainBlock(Math.floor(top * rawV));
        break;
      }

      // === 스케일링 피해 ===
      case 'damage-per-hand': {
        dealToShape(Math.floor(rawV) * state.hand.length + bonus.damage);
        break;
      }
      case 'damage-per-confine': {
        // 궁지 — 플레이어 직교 인접 4칸 중 차단 수(0~4, 캡 4) × value 추가 피해.
        // *추가* 피해 효과이므로 색 보너스(bonus.damage)는 더하지 않는다(병행 damage 효과가 이미 가산).
        // confine=0(트인 곳)이면 0이라 무피해 — 같이 둔 damage 효과만 적용된다.
        // dealToShape로 strength/weakness/vulnerable·perTileMul 분배를 재사용(addStrength=false: 순수 궁지 보너스).
        const confine = Math.min(4, confinedCount(state, state.player.pos));
        dealToShape(Math.floor(rawV) * confine, false);
        break;
      }
      case 'damage-low-hand': {
        const threshold = Number(eff.params?.threshold ?? 2);
        const mult = state.hand.length <= threshold ? 2 : 1; // 이 카드는 이미 hand에서 제거됨.
        dealToShape(Math.floor(v) * mult + bonus.damage);
        break;
      }
      case 'damage-per-debuff': {
        // 각 대상별 자기 디버프 스택 기준(다중 적). base = value×sum + ATK.
        if (shapeHits.length === 0) break;
        for (const { target, mul } of shapeHits) {
          const sum = enemyDebuffSum(target.statuses);
          const base = Math.floor(v) * sum + bonus.damage + strength;
          applyDamage(state, target, Math.floor(base * mul), playerStatuses);
        }
        break;
      }
      case 'damage-from-hp': {
        const pay = Math.min(Math.floor(v), Math.max(0, state.player.hp - 1));
        loseHpFromCard(pay);
        const mult = Number(eff.params?.mult ?? 2);
        dealToShape(Math.floor(pay * mult), false);
        break;
      }
      case 'block-to-damage': {
        dealToShape(state.player.block * Math.floor(rawV), false);
        break;
      }
      case 'spend-all-energy': {
        const spent = state.mana;
        state.mana = 0;
        dealToShape(spent * Math.floor(rawV), false);
        break;
      }
      case 'damage-per-companion': {
        dealToShape(companionCount() * Math.floor(rawV) + bonus.damage);
        break;
      }
      case 'damage-per-relic': {
        dealToShape(relicCount() * Math.floor(rawV) + bonus.damage);
        break;
      }
      case 'damage-per-cards-played': {
        const played = state.cardsPlayedThisTurn ?? 0;
        dealToShape(Math.floor(rawV) * played + bonus.damage);
        break;
      }
      case 'heavy-blade': {
        const mult = Number(eff.params?.mult ?? 1);
        dealToShape(Math.floor(v) + strength * mult + bonus.damage, false); // strength는 mult로 직접.
        break;
      }
      case 'adaptive-strike': {
        if (state.player.block > 0) {
          const bn = Number(eff.params?.bonus ?? 4);
          dealToShape(Math.floor(v) + bn + bonus.damage);
        } else {
          gainBlock(Math.max(0, Math.floor(v) + bonus.block + relicBlockAdd + (playerStatuses.dexterity ?? 0)));
        }
        break;
      }
      case 'consume-vulnerable':
      case 'consume-burn':
      case 'consume-poison': {
        // 각 대상 적의 해당 스택을 제거 → 제거량 × value 추가 피해(그 적에게).
        const key = eff.kind === 'consume-vulnerable' ? 'vulnerable'
          : eff.kind === 'consume-burn' ? 'burn' : 'poison';
        for (const { target, mul } of shapeHits) {
          const stack = target.statuses[key] ?? 0;
          target.statuses[key] = 0;
          applyDamage(state, target, Math.floor(stack * Math.floor(rawV) * mul), playerStatuses);
        }
        break;
      }
      case 'amplify-debuff': {
        // 각 대상 적의 최고 디버프 ×2 + 증가분 × value 피해. 없으면 소피해.
        for (const { target, mul } of shapeHits) {
          const s = target.statuses;
          let bestKey = '';
          let best = 0;
          for (const k of ['vulnerable', 'weakness', 'frail', 'poison', 'burn']) {
            const sv = s[k] ?? 0;
            if (sv > best) { best = sv; bestKey = k; }
          }
          if (bestKey && best > 0) {
            s[bestKey] = best * 2;
            applyDamage(state, target, Math.floor(best * Math.floor(rawV) * mul), playerStatuses);
          } else {
            applyDamage(state, target, Math.floor(4 * mul), playerStatuses);
          }
        }
        break;
      }

      // === self 회복 변형 ===
      case 'heal-per-hand': {
        const hv = state.hand.length * Math.floor(rawV);
        if (hv > 0) {
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + hv);
          pushFx(state, { kind: 'heal', actorId: state.player.id, amount: hv });
        }
        break;
      }

      // === 마커 / 덱·손패 조작 ===
      case 'exhaust-self':
      case 'return-self-to-hand':
        break; // 카드 이동은 execCard에서 처리.
      case 'return-hand-to-deck': {
        let remaining = Math.floor(rawV) || 1;
        while (remaining > 0 && state.hand.length > 0) {
          const last = state.hand.pop()!;
          state.drawPile.unshift(last);
          remaining -= 1;
        }
        break;
      }
      case 'next-turn-energy': {
        state.nextTurnEnergyBonus = (state.nextTurnEnergyBonus ?? 0) + (Math.floor(rawV) || 1);
        break;
      }
      case 'hand-cost-down': {
        state.handCostDown = (state.handCostDown ?? 0) + (Math.floor(rawV) || 1);
        break;
      }
      case 'this-turn-amp': {
        const pct = rawV || Number(eff.params?.pct ?? 50);
        state.gridThisTurnAmp = (state.gridThisTurnAmp ?? 0) + pct;
        break;
      }
      case 'next-card-double': {
        state.gridNextCardDouble = true;
        break;
      }
      case 'refill': {
        state.mana = state.maxMana;
        drawIntoHand(state, MAX_HAND_SIZE - state.hand.length);
        break;
      }
      case 'growing-block': {
        const grown = (card.bonusBlock ?? 0);
        gainBlock(Math.max(0, Math.floor(v) + grown + bonus.block + relicBlockAdd + (playerStatuses.dexterity ?? 0)));
        card.bonusBlock = grown + Number(eff.params?.growth ?? 1); // 다음 사용 대비 누적.
        break;
      }
      case 'growing-damage': {
        const grown = (card.bonusDamage ?? 0);
        dealToShape(Math.floor(v) + grown + bonus.damage);
        card.bonusDamage = grown + 1;
        break;
      }
      case 'buff-card-instance': {
        if (state.hand.length === 0) break;
        const add = Math.floor(rawV);
        const idx = state.hand.findIndex((cd) => cd.effects.some((ef) => ef.kind === 'damage'));
        const tgt = state.hand[idx >= 0 ? idx : 0];
        if (tgt) tgt.bonusDamage = (tgt.bonusDamage ?? 0) + add;
        break;
      }
      case 'draw-if-color': {
        const color = String(eff.params?.color ?? 'fire');
        const threshold = Number(eff.params?.threshold ?? 5);
        try {
          const cur = (useRunStore().data.colors as Record<string, number>)[color] ?? 0;
          if (cur >= threshold) drawIntoHand(state, Math.floor(rawV) || 1);
        } catch { /* 무해 */ }
        break;
      }
      case 'grant-color': {
        const amount = Math.floor(rawV);
        if (amount === 0) break;
        const color = String(eff.params?.color ?? 'random');
        try {
          if (color === 'all') applyColorBoostAll(amount);
          else if (color === 'random') {
            const all: ColorKey[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];
            applyColorBoost(all[Math.floor(rng() * all.length)], amount);
          } else applyColorBoost(color as ColorKey, amount);
        } catch { /* 무해 */ }
        break;
      }

      // === 파워(지속 자기버프) — 라운드 종료에서 틱(commitRound). 여기선 누적만. ===
      case 'metallicize':
      case 'feel-no-pain':
      case 'rupture':
      case 'juggernaut': {
        const key = eff.kind === 'feel-no-pain' ? 'feelNoPain' : eff.kind;
        const pv = Math.floor(rawV);
        if (pv !== 0) playerStatuses[key] = (playerStatuses[key] ?? 0) + pv;
        break;
      }
      case 'barricade': {
        playerStatuses['barricade'] = 1;
        break;
      }
      case 'double-block': {
        // 즉발 — 곱이라 juggernaut(증분 트리거) 미발동.
        state.player.block = state.player.block * 2;
        break;
      }
      case 'bloom-strength': {
        const bv = Math.floor(rawV) || 1;
        state.gridBloom = (state.gridBloom ?? 0) + bv;
        playerStatuses['strength'] = (playerStatuses['strength'] ?? 0) + bv; // 즉시 1회.
        break;
      }

      // === 제어형 ===
      case 'move-self': {
        // move-rider(D2) — 카드가 플레이어를 value칸 이동(가장 가까운 적 기준 toward/away).
        const mode = eff.params?.mode === 'toward' ? 'toward' : 'away';
        dashPlayer(state, Math.max(1, Math.floor(rawV) || 1), mode);
        break;
      }
      case 'add-foresight': {
        // 전투 중 foresight 변동(US-004) — value만큼 가감(1..MAX 클램프). 적/아군 의도 큐는
        // 라운드 종료 recompute가 새 길이에 맞춘다(현재 라운드는 빈 스텝만 추가돼 무해).
        const delta = Math.floor(rawV) || 1;
        state.foresight = Math.max(1, Math.min(MAX_FORESIGHT, state.foresight + delta));
        break;
      }
      // === 샤유아 시그니처(C4) ===
      case 'summon-ally': {
        // 분열 소환 — 작은 아군 토큰 value마리(캡 MAX_ALLIES). params.hp/attack 옵션.
        const n = Math.max(1, Math.floor(rawV) || 1);
        const ahp = Math.max(1, Number(eff.params?.hp ?? 6));
        const aatk = Math.max(0, Number(eff.params?.attack ?? 4));
        summonAlly(state, n, ahp, aatk);
        break;
      }
      case 'status-spread': {
        // 전파 — shape가 닿은 적의 디버프를 *인접 적*에게 복사(연쇄 셋업).
        for (const { target } of shapeHits) {
          for (const other of state.enemies) {
            if (other === target || other.hp <= 0) continue;
            if (manhattan(other.pos, target.pos) > 1) continue;
            for (const k of SPREADABLE_DEBUFFS) {
              const stacks = target.statuses[k] ?? 0;
              if (stacks > 0) other.statuses[k] = (other.statuses[k] ?? 0) + stacks;
            }
          }
          pushFx(state, { kind: 'status', actorId: target.id });
        }
        break;
      }
      case 'chain-explosion': {
        // 연쇄 폭발 — 디버프가 걸린 *모든 적*이 자신+인접 적에게 value 피해 폭발(보드 전역, 중복 제거).
        const dmg = applyDamageRelicMods(state, Math.floor(v) + bonus.damage + strength);
        if (dmg > 0) {
          const hitSet = new Set<GridCombatant>();
          for (const src of state.enemies) {
            if (src.hp <= 0) continue;
            const debuffSum = SPREADABLE_DEBUFFS.reduce((s, k) => s + (src.statuses[k] ?? 0), 0);
            if (debuffSum <= 0) continue;
            for (const other of state.enemies) {
              if (other.hp > 0 && manhattan(other.pos, src.pos) <= 1) hitSet.add(other);
            }
          }
          for (const e of hitSet) applyDamage(state, e, dmg, playerStatuses);
        }
        break;
      }
      case 'ghost-self': {
        playerStatuses['ghost'] = (playerStatuses['ghost'] ?? 0) + (Math.floor(rawV) || 2);
        break;
      }
      case 'skip-enemy-action': {
        state.gridEnemySkip = (state.gridEnemySkip ?? 0) + (Math.floor(rawV) || 1);
        break;
      }
      case 'slow-enemy': {
        state.gridEnemySlow = Math.max(state.gridEnemySlow ?? 0, Math.floor(rawV) || 1);
        break;
      }
      case 'delayed-damage': {
        const delay = Math.max(1, Number(eff.params?.delay ?? 2));
        const tgt = shapeHits[0]?.target ?? nearestEnemy(state);
        (state.gridPendingDamage ?? (state.gridPendingDamage = [])).push({
          roundsLeft: delay,
          damage: Math.floor(v),
          targetEnemyId: tgt?.id,
        });
        break;
      }
      case 'negate-reflect': {
        // 격자: 단순화 — 이번 라운드 받는 피해를 줄이는 정교한 추적 대신 ghost 1라운드로 근사(crash X).
        playerStatuses['ghost'] = (playerStatuses['ghost'] ?? 0) + 1;
        break;
      }
      case 'random-effect': {
        const pool: number[] = [0, 1, 2, 3];
        const pick = pool[Math.floor(rng() * pool.length)];
        if (pick === 0) dealToShape(26 + bonus.damage);
        else if (pick === 1) { for (const { target } of shapeHits) target.statuses['vulnerable'] = (target.statuses['vulnerable'] ?? 0) + 3; }
        else if (pick === 2) { drawIntoHand(state, 2); state.mana = Math.min(state.maxMana, state.mana + 2); }
        else { state.player.hp = state.player.maxHp; pushFx(state, { kind: 'heal', actorId: state.player.id, amount: state.player.maxHp }); }
        break;
      }

      // === 1v1 전제 강함/희귀 — 안전 no-op(crash 금지) ===
      case 'curse-tick':        // 손에 있을 때 턴 시작 피해 — 격자 틱 미이식. 변환 시 회피.
      case 'release-transform': // 변신 해제 — 격자 변신 미이식.
        break;

      default:
        // 미지원 효과 — 안전 무시(타입 누락 방어).
        break;
    }
  }
}

/** 적 격자 공격 실행 — attackIdx -1이면 근접 폴백(monster.attack). */
function execAttack(
  state: GridCombatState,
  attacker: GridCombatant,
  attackIdx: number,
  plannedTiles: GridPos[],
): void {
  const enemyStrength = attacker.statuses.strength ?? 0;

  // 근접 폴백 — gridBehavior 없는 적. 인접(거리1) *또는 같은 칸*(거리0, 겹침)이면 근접 타격.
  if (attackIdx < 0 || !attacker.attacks || !attacker.attacks[attackIdx]) {
    if (manhattan(attacker.pos, state.player.pos) <= 1 && state.player.hp > 0) {
      const dmg = (attacker.attack ?? 0) + enemyStrength;
      applyDamage(state, state.player, dmg, attacker.statuses);
      pushLog(state, `${attacker.name ?? '적'}의 공격`);
    }
    return;
  }

  const atk = attacker.attacks[attackIdx];
  void plannedTiles; // 예측 칸은 텔레그래프용 — 실행은 실제 위치 기준 shape로 재계산.
  const baseDamage = (atk.damage ?? attacker.attack ?? 0) + enemyStrength;
  const perTileMul = atk.perTileMul ?? [];

  // perTileMul을 atk.shape 인덱스에 정렬(walkable 필터로 인덱스가 밀리지 않게 shape 직접 순회).
  // 칸에 플레이어가 *겹쳐 있어도* 맞도록 combatantsAt(전부)로 판정.
  let hitAny = false;
  (atk.shape ?? []).forEach((off, i) => {
    const p = { x: attacker.pos.x + off.dx, y: attacker.pos.y + off.dy };
    if (!tileWalkable(state.stage, p)) return;
    const mul = perTileMul[i] ?? 1;
    for (const target of combatantsAt(state, p)) {
      if (target.team === 'player' && target.hp > 0) {
        applyDamage(state, target, Math.floor(baseDamage * mul), attacker.statuses);
        applyStatusToken(target, atk.applyStatus);
        hitAny = true;
      }
    }
  });
  if (hitAny) pushLog(state, `${attacker.name ?? '적'}의 ${atk.name ?? '공격'}`);
}

/** 덱에서 n장 손패로(10장 캡). 드로운 장수만큼 on-draw 유물 발동(1장당 1회). */
function drawIntoHand(state: GridCombatState, n: number): void {
  const count = Math.min(n, MAX_HAND_SIZE - state.hand.length);
  if (count <= 0) return;
  const { drawn, newDrawPile, newDiscardPile } = drawCards(state.drawPile, state.discardPile, count);
  state.hand.push(...drawn);
  state.drawPile = newDrawPile;
  state.discardPile = newDiscardPile;
  // on-draw 유물(나방 바람결 깃 등) — 핸들러는 카드를 뽑지 않으므로 재귀 없음.
  gridRelicOnDraw(state, drawn.length);
}

/**
 * 목표 손패 크기 — 드로우 5 + 색(물) drawExtra + 유물 draw-extra. [대기]·전투시작 드로우의 상한.
 * (F4: 손패는 자동 리필되지 않는다. [대기] 행동만이 이 크기까지 손패를 보충한다.)
 */
function targetHandSize(state: GridCombatState): number {
  const bonus = currentBonuses();
  const relicDraw = gridDrawExtra(state);
  return Math.max(1, STARTING_HAND_SIZE + bonus.drawExtra + relicDraw);
}

/**
 * 라운드 종료 *마나만* 풀충전(F4 [확정]) — 손패는 건드리지 않는다.
 * 카드는 손에 유지되니 마나만 매 라운드 최대로 회복. 손패 보충은 [대기] 행동 전용(execWait).
 * 유물 mana-extra + next-turn-energy(칼리번) 반영.
 */
function refillManaPerRound(state: GridCombatState): void {
  const bonus = currentBonuses();
  const relicMana = gridManaExtra(state);  // mana-extra-add(들뜬 등불 등).
  state.maxMana = Math.max(1, DEFAULT_MAX_MANA + bonus.manaExtra + relicMana);
  // next-turn-energy(칼리번) — 다음 라운드 시작 마나 보너스 1회 반영 후 0 리셋.
  const energyBonus = state.nextTurnEnergyBonus ?? 0;
  state.mana = state.maxMana + energyBonus;
  state.nextTurnEnergyBonus = 0;
}

// ============================================================================
// 증원 / 처치 / 승패
// ============================================================================

/** 처치된 적 정리 — hp<=0 적의 intentQueue 비움(death fx는 applyDamage가 전이 순간에 처리). 죽은 아군은 제거. */
function cleanupDead(state: GridCombatState): void {
  for (const e of state.enemies) {
    if (e.hp <= 0 && e.intentQueue && e.intentQueue.length > 0) {
      e.intentQueue = [];
    }
  }
  // 죽은 아군 토큰 제거(death fx는 applyDamage가 이미 처리 — 렌더에서 사라짐).
  if (state.allies && state.allies.some((a) => a.hp <= 0)) {
    state.allies = state.allies.filter((a) => a.hp > 0);
  }
}

/** whenEmpty 증원 — 맵에 살아 있는 적이 0이면 1회 소비. */
function handleWhenEmptySpawns(state: GridCombatState): void {
  const spawns = state.stage.spawns;
  if (!spawns || spawns.length === 0) return;
  const aliveEnemies = state.enemies.some((e) => e.hp > 0);
  if (aliveEnemies) return;
  for (const sp of spawns) {
    if (sp.whenEmpty && !(sp as { __used?: boolean }).__used) {
      (sp as { __used?: boolean }).__used = true;
      spawnEnemy(state, sp.enemyId, sp.at);
      break; // 한 번에 하나만(맵이 다시 비면 다음).
    }
  }
}

/** atTurn 증원 — 현재 turn에 해당하는 증원 1회 소비. */
function handleAtTurnSpawns(state: GridCombatState): void {
  const spawns = state.stage.spawns;
  if (!spawns || spawns.length === 0) return;
  for (const sp of spawns) {
    if (sp.atTurn === state.turn && !(sp as { __used?: boolean }).__used) {
      (sp as { __used?: boolean }).__used = true;
      spawnEnemy(state, sp.enemyId, sp.at);
    }
  }
}

/** 적 1마리 생성 — enemyId를 monsters에서 해석, 위치는 at 또는 빈 칸. */
function spawnEnemy(state: GridCombatState, enemyId: string, at?: GridPos): void {
  let def: Monster | undefined;
  try {
    def = useDataStore().monsters.get(enemyId);
  } catch { /* 무해 */ }
  if (!def) return;
  const pos = at && isFreeTile(state, at) ? { ...at } : firstFreeSpawnTile(state.stage, state.enemies.filter((e) => e.hp > 0), state.player);
  if (!pos) return;
  const idx = state.enemies.length;
  const combatant = makeEnemyCombatant(def, pos, idx);
  combatant.intentQueue = enemyPlan(state, combatant);
  state.enemies.push(combatant);
  pushFx(state, { kind: 'spawn', actorId: combatant.id, to: { ...pos } });
  pushLog(state, `${def.name} 등장`);
}

// ============================================================================
// 아군 토큰 (summon-ally — 샤유아 분열)
// ----------------------------------------------------------------------------
// 작은 슬라임 등 *아군*은 매 라운드 가장 가까운 적을 추격하고 인접 시 근접 타격한다.
// v1: 공격 헬퍼(적 AI 타깃은 플레이어 전용 — 아군은 적 AoE에 안 맞음), 총량 캡으로 밸런스.
// ============================================================================

/** 아군 최대 동시 보유 수(머릿수 캡 — 무한 누적 방지). */
const MAX_ALLIES = 5;

/** 작은 아군의 기본 이동 — 맨해튼 1칸(슬라임처럼 굼뜨게 추격). */
const ALLY_MOVE_PROFILE: MoveProfile = { pattern: 'manhattan', range: 1 };

/** pos에서 가장 가까운 살아 있는 적(맨해튼). 없으면 undefined. */
function nearestEnemyTo(state: GridCombatState, pos: GridPos): GridCombatant | undefined {
  let best: GridCombatant | undefined;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = manhattan(pos, e.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * 아군 토큰 N마리 소환(분열) — 플레이어 인접 빈 칸 우선 배치(없으면 통행 칸).
 * hp/attack은 작게(머릿수 컨셉). 캡(MAX_ALLIES) 초과분은 무시. 소환 즉시 의도 계산.
 */
function summonAlly(state: GridCombatState, count: number, hp = 6, attack = 4): void {
  const allies = state.allies ?? (state.allies = []);
  for (let n = 0; n < count; n++) {
    const live = allies.filter((a) => a.hp > 0).length;
    if (live >= MAX_ALLIES) break;
    const pos = firstFreeSpawnTile(state.stage, [...state.enemies.filter((e) => e.hp > 0), ...allies.filter((a) => a.hp > 0)], state.player)
      ?? { ...state.player.pos };
    const ally: GridCombatant = {
      id: `ally-${allies.length}-${state.turn}-${n}`,
      team: 'ally',
      pos: { ...pos },
      hp: Math.max(1, hp),
      maxHp: Math.max(1, hp),
      block: 0,
      statuses: {},
      speed: 'normal',
      moveProfile: ALLY_MOVE_PROFILE,
      attack,
      name: '작은 슬라임',
    };
    ally.intentQueue = planAlly(state, ally);
    allies.push(ally);
    pushFx(state, { kind: 'spawn', actorId: ally.id, to: { ...pos } });
  }
}

/** 아군 1마리의 foresight 스텝 계획 — 적 인접이면 근접 공격, 아니면 가장 가까운 적으로 접근. */
function planAlly(state: GridCombatState, ally: GridCombatant): PlannedAction[] {
  const out: PlannedAction[] = [];
  let simPos = { ...ally.pos };
  for (let step = 0; step < state.foresight; step++) {
    const target = nearestEnemyTo(state, simPos);
    if (!target) { out.push({ kind: 'wait' }); continue; }
    if (manhattan(simPos, target.pos) <= 1) {
      out.push({ kind: 'attack', attackIdx: -1, targetTiles: [{ ...target.pos }] });
      continue;
    }
    const move = approachMove(state, ally, simPos, target.pos);
    if (move) { out.push({ kind: 'move', to: move }); simPos = { ...move }; }
    else out.push({ kind: 'wait' });
  }
  return out;
}

/** 아군 전체 의도 재계산(라운드 종료). */
function recomputeAllyPlans(state: GridCombatState): void {
  for (const a of state.allies ?? []) {
    if (a.hp > 0) a.intentQueue = planAlly(state, a);
  }
}

/** 아군 근접 공격 — 인접(거리≤1)·겹침 적에게 attack+strength 피해. */
function execAllyAttack(state: GridCombatState, ally: GridCombatant): void {
  const target = nearestEnemyTo(state, ally.pos);
  if (!target || manhattan(ally.pos, target.pos) > 1) return;
  const dmg = (ally.attack ?? 0) + (ally.statuses.strength ?? 0);
  applyDamage(state, target, dmg, ally.statuses);
  pushLog(state, `${ally.name ?? '아군'}의 공격`);
}

// ============================================================================
// 동료 교대 (C6 companion swap)
// ----------------------------------------------------------------------------
// 아이템류 1행동: 교대 라운드는 대기(전환), 다음 라운드 동료 조종(전용 스킬/카드 손패),
// 1라운드 뒤 자동 복귀. HP0이면 즉시 복귀 + 마나 0(패널티). state.player를 동료로 교체(id 'player' 유지
// — 적 AI/fx/스냅샷이 'player'를 기준으로 동작). 복귀 시 savedPlayer/savedHand 환원.
// ============================================================================

/** 교대 동료의 시작 HP(낮음). */
const COMPANION_SWAP_HP = 16;

/** 교대 가능한 *활성 슬롯* 동료(스킬/카드형) — UI 선택용. {id, name}. */
export function swappableCompanions(): { id: string; name: string }[] {
  try {
    const run = useRunStore().data;
    const data = useDataStore();
    const out: { id: string; name: string }[] = [];
    for (const slot of run.activeSlots ?? []) {
      if (!slot || slot.src !== 'npc') continue;
      const comp = data.npcs.get(slot.id)?.companion;
      if (comp && (comp.kind === 'skill' || comp.kind === 'card')) {
        out.push({ id: slot.id, name: data.npcs.get(slot.id)?.name ?? slot.id });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** companionId가 지금 교대 가능한가 — 스킬/카드형 활성 동료 + 현재 미교대. */
function canSwapTo(state: GridCombatState, companionId: string): boolean {
  if (state.swap) return false; // 이미 교대 중/전환 중.
  return swappableCompanions().some((c) => c.id === companionId);
}

/** 동료 능력 → 격자 손패 카드. skill=합성 카드 1장(주변 8칸 근접 AoE 기본), card=cardIds 해석. */
function buildCompanionHand(companionId: string): Card[] {
  const data = useDataStore();
  const comp = data.npcs.get(companionId)?.companion;
  if (!comp) return [];
  if (comp.kind === 'skill' && comp.skill) {
    const card: Card = {
      id: `companion-skill-${companionId}`,
      instanceId: `companion-skill-${companionId}`,
      name: comp.skill.name,
      rank: 'common',
      source: 'npc',
      cost: 0,
      trigger: 'manual',
      effects: comp.skill.effects.map((e) => ({ ...e })),
      shape: KING_DIRS.map((d) => ({ dx: d.dx, dy: d.dy })), // 주변 8칸 근접 — 동료 한 턴 버스트.
      castSpeed: 'normal',
      targetMode: 'pattern',
      flavor: comp.skill.description,
    };
    return [card];
  }
  if (comp.kind === 'card' && comp.cardIds) {
    const out: Card[] = [];
    for (const cid of comp.cardIds) {
      const def = data.cards.get(cid);
      if (def) out.push({ ...def, instanceId: `companion-${cid}` });
    }
    return out;
  }
  return [];
}

/**
 * 교대 전환 — state.player를 동료 전투원으로 교체(id 'player' 유지, 동료 race 이동·낮은 HP),
 * 손패를 동료 능력 카드로 교체. swap.controlling=true. 능력 빌드 실패 시 복귀(no-op).
 */
function beginCompanionControl(state: GridCombatState): void {
  const s = state.swap;
  if (!s) return;
  const data = useDataStore();
  const npc = data.npcs.get(s.companionId);
  const hand = buildCompanionHand(s.companionId);
  if (!npc || hand.length === 0) {
    // 동료 능력 없음 — 교대 취소(원상 복귀).
    state.swap = undefined;
    return;
  }
  // 복귀 지점 확정(전환 직전의 플레이어 전투원 + 손패) — 이후 state.player를 동료로 교체.
  s.savedPlayer = state.player;
  s.savedHand = [...state.hand];
  const moveProfile = (npc.raceId ? data.races.get(npc.raceId)?.moveProfile : undefined)
    ?? DEFAULT_ENEMY_MOVE_PROFILE; // 폴백(직교 1칸).
  const companion: GridCombatant = {
    id: 'player', // 'player' 유지 — 적 AI/fx/스냅샷이 이 id를 조종 주체로 본다.
    team: 'player',
    pos: { ...state.player.pos },
    hp: COMPANION_SWAP_HP,
    maxHp: COMPANION_SWAP_HP,
    block: 0,
    statuses: {},
    speed: 'normal',
    moveProfile,
    name: npc.name ?? '동료',
  };
  state.player = companion;
  state.hand = hand;
  s.controlling = true;
  pushLog(state, `${companion.name} 교대 — 조종`);
  pushFx(state, { kind: 'status', actorId: 'player' });
}

/**
 * 교대 복귀 — savedPlayer/savedHand 환원. penalty면 마나 0(HP0 즉시 복귀).
 * 복귀 플레이어는 동료가 끝낸 위치로 이어받는다(연속성).
 */
function revertSwap(state: GridCombatState, penalty: boolean): void {
  const s = state.swap;
  if (!s) return;
  const endPos = { ...state.player.pos };
  state.player = s.savedPlayer;
  state.player.pos = endPos;
  state.hand = s.savedHand;
  if (penalty) state.mana = 0;
  state.swap = undefined;
  pushLog(state, penalty ? '동료가 쓰러져 복귀 (마나 소진)' : '플레이어로 복귀');
  pushFx(state, { kind: 'status', actorId: 'player' });
}

/**
 * 교대 행동 실행(플레이어) — 교대 *준비*만 기록(이번 라운드는 대기 취급, 전환은 라운드 종료에).
 * savedPlayer는 라이브 플레이어 참조(이번 라운드 받는 피해까지 보존). savedHand는 전환 시점에 확정.
 */
function execSwap(state: GridCombatState, companionId: string): void {
  if (!canSwapTo(state, companionId)) return;
  state.swap = { companionId, controlling: false, savedPlayer: state.player, savedHand: [] };
  pushLog(state, '교대 준비 — 다음 턴 동료 조종');
}

/** 승패 판정 — set하면 true. 플레이어 hp<=0 → lose, 살아 있는 적 0 + 미소비 증원 0 → win. */
function checkOutcome(state: GridCombatState): boolean {
  if (state.player.hp <= 0) {
    state.outcome = 'lose';
    return true;
  }
  const aliveEnemies = state.enemies.some((e) => e.hp > 0);
  const pendingSpawns = (state.stage.spawns ?? []).some(
    (sp) => !(sp as { __used?: boolean }).__used,
  );
  if (!aliveEnemies && !pendingSpawns) {
    state.outcome = 'win';
    return true;
  }
  return false;
}

// ============================================================================
// 조회 헬퍼
// ============================================================================

export function isWin(state: GridCombatState): boolean {
  return state.outcome === 'win';
}

export function isLose(state: GridCombatState): boolean {
  return state.outcome === 'lose';
}
