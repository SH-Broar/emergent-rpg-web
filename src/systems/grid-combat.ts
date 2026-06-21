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
  FxEvent,
  GridAttack,
  GridCombatState,
  GridCombatant,
  GridInstallation,
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
import { canStopAt, canMoveThrough, canAirThrough, canAirStop, canAttackTile, canPierceTile, canPlaceTile, hasLineOfSight } from './tiles';
import { bonusesFromEffective } from './equipment';
import type { CombatBonuses } from './stats';
import { resolveLoadout } from './loadout';
import { applyColorBoost, applyColorBoostAll, type ColorKey } from './colors';
import { rng, setRng, getRng, createSeededRng } from './rng';
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
/** 스피드(템포) 기본값 — 데이터·tier 미설정 시. "플레이어 N행동마다 적 1턴"의 N. */
const DEFAULT_TEMPO = 4;
/** 보스 기본 템포(강한 적 — 더 자주 행동). */
const BOSS_TEMPO = 2;
/** 한 라운드(실행)에 플레이어가 큐에 넣을 수 있는 행동 총 상한(마나 외 안전 캡). */
const MAX_PLAN = 12;

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


/**
 * 칸이 *지상 이동으로 멈출 수 있는*(통행/점유 가능) 바닥인가(점유자 무시).
 * 타일 속성 moveStop 기준(systems/tiles.ts). 구덩이/난간=불가, 수풀=가능. 공격 가능 여부는 canAttackTile 사용.
 */
export function tileWalkable(stage: GridStage, p: GridPos): boolean {
  return canStopAt(stage, p);
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

/** 전투원이 비행(airborne) 상태인가 — 이동 시 air 속성(통과/착지) 사용. */
function isAirborne(c: GridCombatant): boolean {
  return (c.statuses?.['airborne'] ?? 0) > 0;
}

/**
 * 슬라이딩(rook/bishop/king) 도달 칸 — 각 방향으로 range칸까지, *경로가 막히면 중단*.
 * canPass=통과 가능(경로), canLand=착지 가능. 지상은 둘이 같지만 공중은 구덩이 위를 통과만(착지 X).
 */
function slideReach(
  from: GridPos,
  dirs: GridOffset[],
  range: number,
  canPass: (p: GridPos) => boolean,
  canLand: (p: GridPos) => boolean,
): GridPos[] {
  const out: GridPos[] = [];
  for (const d of dirs) {
    for (let step = 1; step <= range; step++) {
      const p = { x: from.x + d.dx * step, y: from.y + d.dy * step };
      if (!canPass(p)) break;          // 경로 차단 — 중단.
      if (canLand(p)) out.push(p);     // 착지 가능 칸만 도착지로(공중은 구덩이 위 통과만).
    }
  }
  return out;
}

/**
 * combatant가 이번 스텝에 이동 가능한 칸 목록.
 * 비행(airborne) 상태면 air 속성(airMove 통과/airStop 착지)으로, 아니면 지상(move/moveStop)으로.
 * rook/bishop/king은 경로 막힘 반영(slideReach), knight는 점프(착지 가능 칸).
 */
export function reachableTiles(state: GridCombatState, combatant: GridCombatant): GridPos[] {
  const st = combatant.statuses;
  const slimed = (st?.['slime'] ?? 0) > 0;
  // 점액(slime, #6): 이동이 상하좌우 1칸으로 제한(이동속도 보너스 무시). 그 외엔 종족 프로필 + 상태 이동 보너스.
  const prof: MoveProfile = slimed ? { pattern: 'orthogonal1', range: 1 } : combatant.moveProfile;
  const from = combatant.pos;
  const range = Math.max(1, (prof.range ?? 1) + (slimed ? 0 : statusMoveBonus(st)));
  const air = movesAsAir(st);
  const canPass = (p: GridPos): boolean => (air ? canAirThrough(state.stage, p) : canMoveThrough(state.stage, p));
  const canLand = (p: GridPos): boolean => (air ? canAirStop(state.stage, p) : canStopAt(state.stage, p));

  switch (prof.pattern) {
    case 'rook':
      return slideReach(from, ROOK_DIRS, range, canPass, canLand);
    case 'bishop':
      return slideReach(from, BISHOP_DIRS, range, canPass, canLand);
    case 'king':
      return slideReach(from, KING_DIRS, range, canPass, canLand);
    case 'orthogonal1': {
      const out: GridPos[] = [];
      for (const d of ROOK_DIRS) {
        const p = { x: from.x + d.dx, y: from.y + d.dy };
        if (canLand(p)) out.push(p);
      }
      return out;
    }
    case 'knight': {
      // 점프 — 경로 무시, 착지 가능 칸에만. 비행 시 airStop 칸(구덩이 등 착지 X).
      const out: GridPos[] = [];
      for (const o of KNIGHT_OFFSETS) {
        const p = { x: from.x + o.dx, y: from.y + o.dy };
        if (canLand(p)) out.push(p);
      }
      return out;
    }
    case 'manhattan': {
      // 맨해튼 거리 ≤ range 다이아몬드 — *경로 인식* BFS. 통과=canPass, 착지=canLand.
      const out: GridPos[] = [];
      const seen = new Set<string>([`${from.x},${from.y}`]);
      let frontier: GridPos[] = [from];
      for (let step = 0; step < range; step++) {
        const next: GridPos[] = [];
        for (const cur of frontier) {
          for (const d of ROOK_DIRS) {
            const p = { x: cur.x + d.dx, y: cur.y + d.dy };
            const k = `${p.x},${p.y}`;
            if (seen.has(k)) continue;
            if (!canPass(p)) continue; // 경로 차단.
            seen.add(k);
            if (canLand(p)) out.push(p); // 착지 가능 칸만 도착지.
            next.push(p);
          }
        }
        frontier = next;
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
        if (canLand(p)) out.push(p);
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
 * 투척 1칸 해소(US-003) — caster에서 shape offset 칸을 향해 직선 투척.
 * 경로(직선)는 *관통(pierce)* 가능 칸을 지나가고, 관통 불가 칸을 만나면 *그 앞*의 공격 가능 칸이 타격점.
 * 다 뚫리면 대상 칸(공격 가능 시). 관통 미정의=공격과 동일(레지스트리에서 일치). 착지 불가면 null(불발).
 * 비직선 offset은 폴백(대상 칸이 공격 가능하면 그 칸).
 */
function resolveThrowCell(state: GridCombatState, caster: GridPos, off: GridOffset): GridPos | null {
  const adx = Math.abs(off.dx), ady = Math.abs(off.dy);
  const steps = Math.max(adx, ady);
  if (steps === 0) return null;
  const straight = adx === 0 || ady === 0 || adx === ady;
  if (!straight) {
    const p = { x: caster.x + off.dx, y: caster.y + off.dy };
    return canAttackTile(state.stage, p) ? p : null;
  }
  const sx = Math.sign(off.dx), sy = Math.sign(off.dy);
  let lastHit: GridPos | null = null;
  for (let i = 1; i <= steps; i++) {
    const p = { x: caster.x + sx * i, y: caster.y + sy * i };
    if (canAttackTile(state.stage, p)) lastHit = p;          // 여기 착지 가능 — 앞 칸 후보 갱신.
    if (i < steps && !canPierceTile(state.stage, p)) break;  // 중간 칸이 관통 불가 — 더 못 감(lastHit가 타격점).
  }
  return lastHit;
}

/**
 * 투척 카드 전체 해소 — 각 shape 칸을 투척해 타격점 집계. *둘 이상이 같은 칸*으로 귀결되면
 * 그 칸은 강 칸(1.5×)으로 승격(수렴, US-003). 반환 mul = per_tile_mul × (수렴 시 ≥1.5).
 */
export function resolveThrowHits(
  state: GridCombatState,
  card: Card,
  casterPos?: GridPos,
): { pos: GridPos; mul: number }[] {
  const caster = casterPos ?? state.player.pos;
  const muls = card.perTileMul ?? [];
  const acc = new Map<string, { pos: GridPos; baseMul: number; count: number }>();
  (card.shape ?? []).forEach((off, i) => {
    const hit = resolveThrowCell(state, caster, off);
    if (!hit) return;
    const k = `${hit.x},${hit.y}`;
    const m = muls[i] ?? 1;
    const ex = acc.get(k);
    if (ex) { ex.count += 1; ex.baseMul = Math.max(ex.baseMul, m); }
    else acc.set(k, { pos: hit, baseMul: m, count: 1 });
  });
  return [...acc.values()].map((v) => ({
    pos: v.pos,
    mul: v.count >= 2 ? Math.max(v.baseMul, STRONG_MUL) : v.baseMul,
  }));
}

/**
 * 카드 shape를 caster(기본 player) 기준 *절대 칸*으로 변환. 회전 없음.
 * 격자 밖·void·wall 칸은 제외. shape 미설정/빈 배열이면 빈 배열(self/제자리 발동).
 * aimOffset 지정 시(targetMode='aimed') shape 기준점 = caster + aimOffset(조준 칸 중심).
 * targetMode='throw'면 투척 해소(장애물 앞 정지).
 */
export function previewCardTiles(
  state: GridCombatState,
  card: Card,
  casterPos?: GridPos,
  aimOffset?: GridOffset,
): GridPos[] {
  if (card.targetMode === 'throw') {
    return resolveThrowHits(state, card, casterPos).map((h) => h.pos);
  }
  const base = casterPos ?? state.player.pos;
  const origin = aimOffset ? { x: base.x + aimOffset.dx, y: base.y + aimOffset.dy } : base;
  const shape = card.shape ?? [];
  const out: GridPos[] = [];
  for (const o of shape) {
    const p = { x: origin.x + o.dx, y: origin.y + o.dy };
    // 공격 유효 칸만(canAttackTile) — 구덩이처럼 이동 불가여도 attack O면 타격 가능, 벽은 제외.
    if (canAttackTile(state.stage, p)) out.push(p);
  }
  return out;
}

/** 원거리 조준 카드(targetMode='aimed')인가. */
export function isAimedCard(card: Card): boolean {
  return card.targetMode === 'aimed';
}

/**
 * 카드가 *타격(피해)형* 효과를 하나라도 가졌는가(#4 장판 판정) — damage 계열 effect 존재 여부.
 * 순수 회복/방어/드로우/버프 카드면 false → 장판 대신 자기 발동 펄스(#3)로 표현.
 * break-armor(방어 파괴)·consume-*(상태 소모 추가타) 등 *대상 칸에 작용*하는 효과도 타격으로 본다.
 */
const DAMAGE_EFFECT_KINDS = new Set<string>([
  'damage', 'damage-min-color', 'damage-top-color', 'damage-color-count', 'damage-per-hand',
  'damage-per-confine', 'damage-low-hand', 'damage-per-debuff', 'damage-from-hp', 'block-to-damage',
  'spend-all-energy', 'damage-per-companion', 'damage-per-relic', 'damage-per-cards-played',
  'heavy-blade', 'adaptive-strike', 'consume-vulnerable', 'consume-burn', 'consume-poison',
  'amplify-debuff', 'break-armor',
]);
export function cardDealsDamage(card: Card): boolean {
  return card.effects.some((e) => DAMAGE_EFFECT_KINDS.has(e.kind));
}

/** 카드 장판(#4) 유형 — throw / aimed=ranged / 그 외는 shape 도달거리로 melee·ranged. */
function cardStrikeStyle(card: Card): 'melee' | 'ranged' | 'throw' {
  if (card.targetMode === 'throw') return 'throw';
  if (card.targetMode === 'aimed') return 'ranged';
  for (const o of card.shape ?? []) {
    if (Math.max(Math.abs(o.dx), Math.abs(o.dy)) > 1) return 'ranged';
  }
  return 'melee';
}

/**
 * aimed 카드의 *조준 가능 칸* — 플레이어 기준 맨해튼 거리 1..aimRange 내 + *시야 확보* + 공격 가능 칸.
 * 시야: from→칸 직선이 지나는 중간 칸에 시야 차단(불투명)이 없어야 함(벽 너머 조준 불가, 난간 너머는 가능).
 */
export function aimableTiles(state: GridCombatState, card: Card, casterPos?: GridPos): GridPos[] {
  const range = Math.max(1, card.aimRange ?? 3);
  const from = casterPos ?? state.player.pos;
  // 설치 카드는 *설치 가능 칸*(canPlace)을, 그 외 원거리는 *공격 가능 칸*(canAttack)을 조준. 둘 다 시야 필요.
  const isPlace = card.effects.some((e) => e.kind === 'place-installation');
  const valid = (p: GridPos): boolean =>
    (isPlace ? canPlaceTile(state.stage, p) : canAttackTile(state.stage, p)) && hasLineOfSight(state.stage, from, p);
  const out: GridPos[] = [];
  for (let dy = -range; dy <= range; dy++) {
    const rem = range - Math.abs(dy);
    for (let dx = -rem; dx <= rem; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = { x: from.x + dx, y: from.y + dy };
      if (valid(p)) out.push(p);
    }
  }
  return out;
}

export interface ShapePreviewCell { x: number; y: number; self: boolean; hit: boolean; strong: boolean; }
export interface ShapePreview { w: number; h: number; cells: ShapePreviewCell[]; aimed: boolean; throw_: boolean; aimRange: number; }
/** 강 칸 판정 임계 — per_tile_mul ≥ 1.5면 강 공격 칸(1.5× 데미지)으로 표기(US-002). */
export const STRONG_MUL = 1.5;
/**
 * 카드 범위(shape)를 표시용 미니 그리드로 — 덱 편집(가방)·전투 상세 공용(US-005).
 * 패턴: (0,0)=플레이어(self), shape 칸=피격(강 칸=1.5×). aimed/throw: (0,0)=조준/투척 기준 칸.
 */
export function cardShapePreview(card: Card): ShapePreview {
  const aimed = card.targetMode === 'aimed';
  const throw_ = card.targetMode === 'throw';
  const muls = card.perTileMul ?? [];
  const pts = (card.shape ?? []).map((s, i) => ({ dx: s.dx, dy: s.dy, mul: muls[i] ?? 1 }));
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.dx); maxX = Math.max(maxX, p.dx);
    minY = Math.min(minY, p.dy); maxY = Math.max(maxY, p.dy);
  }
  const cells: ShapePreviewCell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const hitPt = pts.find((p) => p.dx === x && p.dy === y);
      cells.push({
        x, y,
        self: !aimed && !throw_ && x === 0 && y === 0,
        hit: !!hitPt,
        strong: !!hitPt && hitPt.mul >= STRONG_MUL,
      });
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, cells, aimed, throw_, aimRange: Math.max(1, card.aimRange ?? 3) };
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
    if (canAttackTile(state.stage, p)) out.push(p);
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
 * playerPlan에 행동 추가 — 스피드 모델(US-001): 길이 제한은 foresight가 아니라 *마나*(카드) + MAX_PLAN(안전 캡).
 * card: 손패 존재 + 마나(누적 plan 비용 합산까지 고려) 검증.
 * move: 합법 이동 칸 검증(현재 상태 기준 — best effort; 실제 해소는 commit 시 재평가).
 * 성공 시 true.
 */
export function queuePlayerAction(state: GridCombatState, action: PlannedAction): boolean {
  if (state.playerPlan.length >= MAX_PLAN) return false; // 안전 캡(마나 외). 카드는 아래 누적 마나로 제한.

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
    // 닻(anchored) 상태면 이동 불가(보스 anchor 기믹).
    if ((state.player.statuses['anchored'] ?? 0) > 0) return false;
    // 이동은 한 라운드 1회(퇴행 #10이면 2회). 합법성은 현재 위치 기준 best-effort.
    const moveLimit = (state.player.statuses['regress'] ?? 0) > 0 ? 2 : 1;
    if (state.playerPlan.filter((a) => a.kind === 'move').length >= moveLimit) return false;
    // 이동 후 위치(이전 큐 이동 반영) 기준 합법성 — 다중 이동(퇴행) 지원.
    let fromPos = state.player.pos;
    for (const a of state.playerPlan) if (a.kind === 'move') fromPos = a.to;
    if (!isLegalMove(state, { ...state.player, pos: fromPos }, action.to)) return false;
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

/** 계획에서 i번째 행동 1개 제거(줄별 취소, 2026-06-19). 성공 시 true. */
export function dequeuePlayerAction(state: GridCombatState, index: number): boolean {
  if (index < 0 || index >= state.playerPlan.length) return false;
  state.playerPlan.splice(index, 1);
  return true;
}

/**
 * 즉시 발동 카드인가(2026-06-19) — instant 플래그 + 조준/투척이 아닌 카드.
 * 즉시 카드는 손에서 누르는 즉시 *현재 위치* 고정 shape로 발동되고 적 템포를 진행시키지 않는다.
 */
export function isInstantCard(card: Card | undefined): boolean {
  return !!card && card.instant === true && card.targetMode !== 'aimed' && card.targetMode !== 'throw';
}

/**
 * 즉시 카드 발동(2026-06-19) — 계획·적 템포를 거치지 않고 바로 효과를 적용한다.
 * 마나 차감·효과·카드 이동(버림/소멸)·유물 트리거는 execCard와 동일하되 적은 행동하지 않는다.
 * 드로우 카드를 즉시로 두면 뽑은 카드를 *이번 턴*에 바로 쓸 수 있다.
 * 반환: 이 발동으로 전투가 끝났으면 outcome('win'/'lose'), 아니면 undefined.
 */
export function playInstantCard(state: GridCombatState, cardInstanceId: string): 'win' | 'lose' | undefined {
  if (state.outcome) return state.outcome;
  const card = state.hand.find((c) => c.instanceId === cardInstanceId);
  if (!card || !isInstantCard(card) || card.unplayable) return undefined;
  if (!canPlayCard(state, card)) return undefined;
  // 이 즉시 발동의 fx를 한 그룹(1번)으로 — 뷰가 짧게 순차 재생.
  fxActionIndex = 1;
  const targetTiles = previewCardTiles(state, card); // 현재 위치 고정 shape(조준 없음).
  execCard(state, cardInstanceId, targetTiles, undefined);
  postActionCleanup(state);
  return state.outcome;
}

/**
 * move-self(대시) 카드의 이동 목적지 미리보기(2026-06-19) — dashPlayer와 동일 경로를 *불변*으로 계산.
 * 가장 가까운 적 기준 toward/away로 tiles칸. 못 움직이면 null. UI 잔상(목적지) 표시용.
 */
export function previewDashTarget(state: GridCombatState, card: Card): GridPos | null {
  const eff = card.effects.find((e) => e.kind === 'move-self');
  if (!eff) return null;
  const tiles = Math.max(1, Math.floor(eff.value ?? 0) || 1);
  const mode = eff.params?.mode === 'toward' ? 'toward' : 'away';
  const enemy = nearestEnemy(state);
  if (!enemy) return null;
  const from = { ...state.player.pos };
  let cur = { ...from };
  for (let i = 0; i < tiles; i++) {
    const dx = enemy.pos.x - cur.x;
    const dy = enemy.pos.y - cur.y;
    let sx = 0, sy = 0;
    if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx); else sy = Math.sign(dy);
    if (mode === 'away') { sx = -sx; sy = -sy; }
    if (sx === 0 && sy === 0) break;
    const next = { x: cur.x + sx, y: cur.y + sy };
    if (!tileWalkable(state.stage, next)) break;
    cur = next;
  }
  return samePos(cur, from) ? null : cur;
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
//
// 구 combat.ts와 일치(DECAYING_DEBUFFS + 일부 버프):
//   - 디버프: weakness/vulnerable/frail/anchored/slowed/airborne/brainwash/sap/regress/feral/sleep.
//   - 버프  : focus/haste (라운드 중 사용된 뒤 라운드 끝에 -1 — execWait/카드 적용이 모두 라운드 끝 *전*이라 off-by-one 없음).
// 감쇠 제외(자기관리/영구):
//   - poison/burn/regen  : 라운드 끝 DoT 틱에서 스스로 감쇠(poison -1, burn /2, regen -1).
//   - slime/spasm        : refillManaPerRound에서 마나를 깎은 *뒤* 스스로 -1(마나 리필이 감쇠 루프 뒤라 inline 처리).
//   - possession/imprint : 영구(비감쇠). possession은 매 라운드 HP 잠식, imprint는 5↑이면 possession으로 전이.
//   - metallicize/barricade/feelNoPain/rupture/juggernaut/feral-heavy : 전투 휘발 파워/잔존(감쇠 안 함).
const DECAYING_STATUSES = new Set<string>([
  'weakness', 'vulnerable', 'ghost', 'anchored', 'drowsy', 'airborne',
  'brainwash', 'slime', 'sleep', 'haste', 'move-haste', 'confusion',
]);
// (퇴행 regress는 #10으로 영구화 — 비감쇠, 아이템/이벤트로만 해제. 집중 focus·반격진 등은 폐지.)

/**
 * 전투원이 수화(feral)/심수화(feral-heavy)인가 — 둘 다 공격 ×2 + 방어 0(combat.ts playerWild 동일).
 * 격자는 플레이어 외 전투원도 가질 수 있어 statuses 직접 인자.
 */
function isWild(statuses: Record<string, number> | undefined): boolean {
  return (statuses?.['feral'] ?? 0) > 0 || (statuses?.['feral-heavy'] ?? 0) > 0;
}
/** 수화 공격 배수(2026-06-19 검수) — 심수화 ×2, 일반 수화 ×1.5, 아니면 1. */
function wildMul(statuses: Record<string, number> | undefined): number {
  if ((statuses?.['feral-heavy'] ?? 0) > 0) return 2;
  if ((statuses?.['feral'] ?? 0) > 0) return 1.5;
  return 1;
}
/** 상태이상에 의한 이동 사거리 보너스(2026-06-19) — 심수화 +1, 가속(move-haste) +스택. */
function statusMoveBonus(statuses: Record<string, number> | undefined): number {
  return ((statuses?.['feral-heavy'] ?? 0) > 0 ? 1 : 0) + (statuses?.['move-haste'] ?? 0);
}
/** 이동이 *공중 속성*인가(2026-06-19) — 비행/유령화/퇴행이면 장애물 위를 넘어간다. */
function movesAsAir(statuses: Record<string, number> | undefined): boolean {
  return (statuses?.['airborne'] ?? 0) > 0 || (statuses?.['ghost'] ?? 0) > 0 || (statuses?.['regress'] ?? 0) > 0;
}
/** 심수화(feral-heavy)면 회복 전면 차단(combat.ts healBlocked 동일). 일반 수화는 회복 가능. */
function isHealBlocked(statuses: Record<string, number> | undefined): boolean {
  return (statuses?.['feral-heavy'] ?? 0) > 0;
}
/**
 * 주는 피해의 *플랫* 보정(strength 외) — +focus(집중)만. strength는 호출처 별도 가산.
 * (sap(잠식)은 2026-06-19 검수로 *순수 HP 도트*로 전환 — 더는 피해/방어를 깎지 않음.)
 */
function damageFlatBonus(statuses: Record<string, number> | undefined): number {
  return (statuses?.['focus'] ?? 0);
}
/**
 * 방어의 *플랫* 보정(dexterity 외) — 현재 방어를 깎는 디버프 없음(frail·sap 폐지). 항상 0.
 * (dexterity는 호출처 별도 가산. 유지 시 향후 방어 감소 디버프 삽입점.)
 */
function blockFlatBonus(_statuses: Record<string, number> | undefined): number {
  return 0;
}

// 격자에 *이식하지 않은* 상태(구조적 부적합 — 부여돼도 안전 무시, crash 없음):
//   - paralyze(마비)  : 플레이어 "한 라운드 통째 스킵"이 격자 행동 큐 모델과 맞지 않아 생략(드물게 적 부여).
//   - thorns(반격)    : applyDamage가 공격자 *엔티티*를 모르고 statuses만 받아, 반격 피해를 정확한 공격자에게
//                       귀속시킬 수 없어 생략. (juggernaut/rupture는 플레이어 self라 이식됨.)
//   - ward(방어 이월) : barricade(불굴, 이미 동작)와 기능 중복이라 별도 이식 생략.
//   - resolve(경감)   : 격자 적 디버프 부여가 applyStatusToken 단순 경로라 "받는 디버프 -1" 삽입점이 없어 생략.
// 나머지(poison/burn/sap/brainwash/imprint/possession/sleep/slime/spasm/regen/haste/focus/feral/feral-heavy/regress)는 동작한다.
//   - frail(취약)        : 2026-06-19 폐지 — 카드 'break-armor'(방어 파괴: 상대 방어 전부 제거) 즉시 효과로 대체.

/** 샤유아 전파/연쇄 대상 디버프 키(status-spread·chain-explosion). */
const SPREADABLE_DEBUFFS = ['vulnerable', 'weakness', 'poison', 'burn', 'regress'] as const;

function damageMultipliers(
  v: number,
  attacker: Record<string, number> | undefined,
  target: Record<string, number> | undefined,
): number {
  let r = Math.max(0, v);
  // 배수 순서는 구 combat.ts applyDamageMultipliers와 1:1 동일하게 유지:
  //   weakness×0.75 → brainwash×0.66 → imprint×0.85 → possession×0.5 → ghost(공격자)×0.5
  //   → vulnerable(대상)×1.5 → ghost(대상)×0.5. 각 단계 Math.floor.
  if ((attacker?.weakness ?? 0) > 0) r = Math.floor(r * 0.75);
  // 세뇌(brainwash): 홀려서 손이 무뎌진다 — 공격자가 주는 피해 ×0.66.
  if ((attacker?.brainwash ?? 0) > 0) r = Math.floor(r * 0.66);
  // 각인(imprint, #13): 스택당 주는 피해 -10% *복리*(×0.9^스택).
  const imp = attacker?.imprint ?? 0;
  if (imp > 0) r = Math.floor(r * Math.pow(0.9, imp));
  // 혼란(possession): 공격자가 주는 피해 ×0.5(강력, 비감쇠). (#12 빙의 분리는 후속 배치)
  if ((attacker?.possession ?? 0) > 0) r = Math.floor(r * 0.5);
  if ((target?.vulnerable ?? 0) > 0) r = Math.floor(r * 1.5);
  // 유령화(ghost, #11): ×0.5 피해 폐지 — 공중 이동·원거리 비표적·유령끼리 공격불가로 재설계.
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
  // 유령화끼리는 서로 공격 불가(#11) — 공격자·대상 모두 유령화면 피해 0.
  if ((attackerStatuses?.['ghost'] ?? 0) > 0 && (target.statuses?.['ghost'] ?? 0) > 0) return;
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
    // 수면(sleep): 실제로 HP를 깎는 피해를 받으면 즉시 깬다(combat.ts 동일 규칙). 적/플레이어 공통.
    if ((target.statuses['sleep'] ?? 0) > 0) delete target.statuses['sleep'];
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
  // 세뇌(brainwash, #4): 게이지형 — 중첩 없이 갱신(최댓값).
  if (name === 'brainwash') target.statuses['brainwash'] = Math.max(target.statuses['brainwash'] ?? 0, v);
  else target.statuses[name] = (target.statuses[name] ?? 0) + v;
  // 졸음(drowsy, #8) 2스택 → 수면(sleep)으로 전이.
  if (name === 'drowsy' && (target.statuses['drowsy'] ?? 0) >= 2) {
    delete target.statuses['drowsy'];
    target.statuses['sleep'] = (target.statuses['sleep'] ?? 0) + 1;
  }
  // 수면(sleep, #5): 비행(airborne) 해제.
  if ((target.statuses['sleep'] ?? 0) > 0) target.statuses['airborne'] = 0;
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

/**
 * 라운드 종료 *지속 상태 틱* — 모든 살아 있는 전투원(플레이어/적/아군)에 일관 적용.
 * 구 combat.ts tickPoison/tickBurn/tickRegen + possession 잠식 + imprint→possession 전이를 이식.
 *
 *  - poison : 스택만큼 *직접 HP*(block·배수 무시) → 스택 -1. (combat.ts tickPoison)
 *  - burn   : 스택만큼 직접 HP → 스택 = floor(스택/2), 1 미만이면 제거. (combat.ts tickBurn)
 *  - regen  : 스택만큼 회복(maxHp clamp) → 스택 -1. 심수화(feral-heavy)면 회복 차단(스택은 감쇠). (combat.ts tickRegen)
 *  - imprint: 5 이상이면 5 소비 + possession +1(전이). (combat.ts applyPlayerStatusTurnStart)
 *  - possession: 매 라운드 시작 HP 잠식 min(6, 1+스택), 최소 HP 1. 감쇠 안 함(영구). (combat.ts)
 *
 * 각 변화는 pushFx(hit/heal)로 남겨 애니가 보이게 한다(actorId 기준). 이 DoT로 죽으면 death fx는 직접 hp 차감이라
 * 여기서 직접 남긴다(applyDamage를 안 거치므로). 처치/승패 정리는 호출처(commitRound)가 postActionCleanup으로.
 * fxActionIndex는 호출 직전에 그룹을 따로 떼어 두면 순차 재생이 더 깔끔.
 */
function tickRoundStatuses(state: GridCombatState): void {
  for (const c of aliveCombatants(state)) {
    const s = c.statuses;

    // 각인(imprint, #13) — 5 이하면 3턴마다 -1, 6 이상이면 감쇠 없음(특수 이벤트로만 해소). 혼란 전이 폐지.
    const imp = s['imprint'] ?? 0;
    if (imp > 0 && imp <= 5 && state.turn % 3 === 0) {
      if (imp - 1 <= 0) delete s['imprint']; else s['imprint'] = imp - 1;
    }

    // possession(혼란) — 매 라운드 HP 잠식(스택 비례, 캡 6, 최소 HP 1). 비감쇠.
    const poss = s['possession'] ?? 0;
    if (poss > 0 && c.hp > 0) {
      const drain = Math.min(6, 1 + poss);
      const before = c.hp;
      c.hp = Math.max(1, c.hp - drain);
      const lost = before - c.hp;
      if (lost > 0) pushFx(state, { kind: 'hit', actorId: c.id, amount: lost });
    }

    // poison(중독) — 직접 HP 피해(block·배수 무시) 후 스택 -1.
    const poison = s['poison'] ?? 0;
    if (poison > 0 && c.hp > 0) {
      const before = c.hp;
      c.hp = Math.max(0, c.hp - poison);
      if (before - c.hp > 0) pushFx(state, { kind: 'hit', actorId: c.id, amount: before - c.hp });
      if (poison - 1 <= 0) delete s['poison']; else s['poison'] = poison - 1;
    }

    // burn(화상) — 직접 HP 피해 후 스택 절반(1 미만 소멸).
    const burn = s['burn'] ?? 0;
    if (burn > 0 && c.hp > 0) {
      const before = c.hp;
      c.hp = Math.max(0, c.hp - burn);
      if (before - c.hp > 0) pushFx(state, { kind: 'hit', actorId: c.id, amount: before - c.hp });
      const next = Math.floor(burn / 2);
      if (next < 1) delete s['burn']; else s['burn'] = next;
    }

    // regen(재생) — 스택만큼 회복 후 -1. 심수화면 회복 차단(스택은 감쇠).
    const regen = s['regen'] ?? 0;
    if (regen > 0) {
      if (c.hp > 0 && !isHealBlocked(s)) {
        const before = c.hp;
        c.hp = Math.min(c.maxHp, c.hp + regen);
        if (c.hp - before > 0) pushFx(state, { kind: 'heal', actorId: c.id, amount: c.hp - before });
      }
      if (regen - 1 <= 0) delete s['regen']; else s['regen'] = regen - 1;
    }

    // 잠식(sap) — *순수 HP 도트*(2026-06-19 검수): 스택만큼 직접 HP 피해. 감쇠 없음(전투 종료/정화로만 해소).
    const sap = s['sap'] ?? 0;
    if (sap > 0 && c.hp > 0) {
      const before = c.hp;
      c.hp = Math.max(0, c.hp - sap);
      if (before - c.hp > 0) pushFx(state, { kind: 'hit', actorId: c.id, amount: before - c.hp });
    }

    // 수화(feral, 2026-06-19 검수) — 10 이상이면 심수화(feral-heavy)로 전이, 아니면 3턴마다 -1 감쇠.
    const feral = s['feral'] ?? 0;
    if (feral >= 10) {
      s['feral-heavy'] = Math.max(1, s['feral-heavy'] ?? 0);
      delete s['feral'];
      if (c.team === 'player') pushLog(state, '수화가 심수화로 치달았다');
    } else if (feral > 0 && state.turn % 3 === 0) {
      if (feral - 1 <= 0) delete s['feral']; else s['feral'] = feral - 1;
    }

    // DoT/잠식으로 죽는 전이 순간 death fx(직접 hp 차감이라 applyDamage 경로를 안 탐).
    if (c.hp <= 0) pushFx(state, { kind: 'death', actorId: c.id });
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

/**
 * 공격 장판(#4) — 이 행동이 *때리는 칸* 목록 + 유형을 fx로 남긴다(현재 fxActionIndex 그룹).
 * 뷰가 그 행동 dwell 동안만 칸을 강조했다가 데미지 숫자와 함께 사라지게 한다(동시 표시 금지).
 * 빈 칸이면 push하지 않는다(self/제자리 버프 등은 발동 펄스로 대신).
 */
function pushAttackTilesFx(
  state: GridCombatState,
  actorId: string,
  tiles: GridPos[],
  style: 'melee' | 'ranged' | 'throw',
): void {
  if (!tiles.length) return;
  pushFx(state, { kind: 'attack-tiles', actorId, tiles: tiles.map((t) => ({ ...t })), style });
}

/**
 * 공격 shape의 장판 유형 판정(#4) — 적 격자 공격용.
 * shape 칸이 *전부 인접*(체비셰프 ≤1, 자기 칸 포함)이면 melee(근접), 한 칸이라도 멀면 ranged(원거리 직선).
 * 빈 shape(근접 폴백)는 호출처에서 melee로 직접 지정한다.
 */
function attackShapeStyle(shape: GridOffset[] | undefined): 'melee' | 'ranged' {
  for (const o of shape ?? []) {
    if (Math.max(Math.abs(o.dx), Math.abs(o.dy)) > 1) return 'ranged';
  }
  return 'melee';
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
    statuses: carriedRunStatuses(run), // 런 잔존 혼란(possession)·심수화(feral-heavy)를 안고 시작.
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

/**
 * 런에 잔존하는 강 상태이상을 전투 시작 시 플레이어가 안고 들어가는 statuses로 — combat.ts startCombat(line ~529) 동일.
 *   - possession(혼란): run.possessed > 0 이면 시드(정화/하루 경과 전까지 전투마다 안고 시작).
 *   - feral-heavy(심수화): run.feralHeavy > 0 이면 시드(마을/휴식 전까지 유지).
 * 전투 종료 시 run.ts endGridCombat이 이 두 값을 player.statuses에서 런으로 라이트백한다(잔존).
 */
function carriedRunStatuses(run: RunState): Record<string, number> {
  const carried: Record<string, number> = {};
  if ((run.possessed ?? 0) > 0) carried['possession'] = run.possessed as number;
  if ((run.feralHeavy ?? 0) > 0) carried['feral-heavy'] = run.feralHeavy as number;
  return carried;
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

/** 몬스터 정의 → 격자 전투원. defaultTempo = 데이터 미설정 시 적용할 권역 기본 템포. */
function makeEnemyCombatant(def: Monster, pos: GridPos, idx: number, defaultTempo = DEFAULT_TEMPO): GridCombatant {
  const hp = Math.max(1, Math.round(def.hp));
  return {
    id: `enemy-${idx}-${def.id}`,
    team: 'enemy',
    pos,
    hp,
    maxHp: hp,
    block: def.defense ?? 0,
    statuses: {},
    tempo: Math.max(1, def.tempo ?? defaultTempo),
    tempoCounter: 0,
    actionsPerTurn: Math.max(1, def.actions ?? 1),
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
    tempo: BOSS_TEMPO, // 보스 = 강한 적(자주 행동). 페이즈/상태로 변동 가능.
    tempoCounter: 0,
    actionsPerTurn: 1, // 보스는 트리거당 1행동(페이즈별 grid_attack 중 AI가 택1).
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
    statuses: carriedRunStatuses(run), // 런 잔존 혼란(possession)·심수화(feral-heavy)를 안고 시작.
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

/** 적의 *1턴 행동 수*(스피드 모델: 적은 트리거 시 이만큼 행동). 레거시 다중행동 actionsPerTurn, 기본 1. */
function enemyHorizon(enemy: GridCombatant): number {
  return Math.max(1, enemy.actionsPerTurn ?? 1);
}

/** 단순 그리디 폴백 — 가상 위치를 갱신하며 *1턴(actionsPerTurn)* 분량을 planOneEnemyStep으로 채운다. */
function greedyEnemyPlan(state: GridCombatState, enemy: GridCombatant): PlannedAction[] {
  const out: PlannedAction[] = [];
  let simPos = { ...enemy.pos };
  const horizon = enemyHorizon(enemy);
  for (let step = 0; step < horizon; step++) {
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
    if (canAttackTile(state.stage, p)) out.push(p);
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
  /** 이 적의 1턴 행동 수(계획 깊이 = actionsPerTurn). */
  horizon: number;
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
    horizon: enemyHorizon(enemy),
    budget: NODE_BUDGET,
  };

  if (state.player.hp <= 0) {
    return new Array(ctx.horizon).fill(null).map(() => ({ kind: 'wait' } as PlannedAction));
  }

  const root: AiSimNode = { pos: { ...enemy.pos }, cumDamage: 0, actions: [] };
  const best = searchBestSequence(ctx, root, 0);

  // 예산 초과/실패 시 그리디 폴백(안전).
  if (!best || best.actions.length === 0) return greedyEnemyPlan(state, enemy);

  // 시퀀스 길이를 horizon(1턴 행동 수)에 맞춤(부족분은 wait, 초과분은 자름).
  const seq = best.actions.slice(0, ctx.horizon);
  while (seq.length < ctx.horizon) seq.push({ kind: 'wait' });
  return seq;
}

/**
 * DFS — node에서 depth..foresight 까지 최고 점수 잎(누적 시퀀스)을 찾는다.
 * 반환: 최고 점수 잎 노드(전체 actions 포함). 동점은 시드 rng로 결정론 선택.
 */
function searchBestSequence(ctx: AiContext, node: AiSimNode, depth: number): AiSimNode | undefined {
  // 종료(깊이 도달) 또는 예산 소진 — 현재 노드를 잎으로.
  if (depth >= ctx.horizon || ctx.budget <= 0) return node;

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
    if (!canAttackTile(ctx.state.stage, p)) return;
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

/**
 * 플레이어 계획의 *이동 후 최종 위치*(엔진판 effectivePlayerPos) — 큐의 마지막 move 도착점.
 * 카드/아이템은 위치 불변(닻 가드는 실행 시점). 텔레그래프가 "내가 갈 곳" 기준으로 적 의도를 읽게 한다(#5).
 */
function plannedPlayerPos(state: GridCombatState): GridPos {
  let pos = { ...state.player.pos };
  for (const a of state.playerPlan) if (a.kind === 'move') pos = { ...a.to };
  return pos;
}

// ============================================================================
// 적 행동 텔레그래프(#5) — 임박 적의 *이번 턴* 위협을 계획 반영해 미리 표시
// ----------------------------------------------------------------------------
// 버그(2026-06-19): 뷰가 stale한 intentQueue(직전 라운드 종료 시 *옛 플레이어 위치* 기준 계산)를
// 그대로 따라가, 플레이어가 이동을 계획해도 적 위협이 옛 위치를 가리켜 "버그처럼" 보였다.
// 근본 수정: 텔레그래프를 *현재 계획의 도착 위치* 기준으로 적 의도를 다시 계산한다(plannedPlayerPos).
// 동시에 commitRound의 takeCombatantTurn이 *실행 직전* 의도를 재계산해(아래) 표시와 실행을 일치시킨다.
// ============================================================================

/** 적 e가 이번 라운드(현재 계획 + 턴종료 자동 대기 1틱)에 *행동하는가*. tut<=1 과 동일 의미를 엔진에서 판정. */
function enemyActsThisRound(state: GridCombatState, e: GridCombatant): boolean {
  const slow = (state.gridEnemySlow ?? 0) > 0 ? 1 : 0;
  const tempo = Math.max(1, (e.tempo ?? DEFAULT_TEMPO) + slow + (e.statuses['slowed'] ?? 0));
  // 이번 라운드 누적 틱 = 계획 행동 수 + 자동 대기 1(퇴행이면 자동 대기는 시간 미소모 → 미포함).
  const planTicks = state.playerPlan.length;
  const autoWait = (state.player.statuses['regress'] ?? 0) > 0 ? 0 : 1;
  const ticks = planTicks + autoWait;
  const c0 = e.tempoCounter ?? 0;
  return Math.floor((c0 + ticks) / tempo) > Math.floor(c0 / tempo);
}

/**
 * 텔레그래프 전용 *비반응(plain) 클론* — enemyPlan의 AI가 enemy.pos를 잠시 바꿔가며 평가하므로,
 * 라이브 *반응형* 상태를 건드리면 computed 안에서 자기 의존성을 변형해 무한 갱신(Maximum recursive
 * updates)이 난다. 그래서 AI가 읽고/잠시 쓰는 필드를 plain 객체로 떠서 그 위에서만 시뮬레이션한다.
 * stage는 AI가 *읽기만* 하므로 참조 공유(클론 불필요). player.pos는 *계획 도착*으로 미리 치환해 둔다.
 */
function cloneStateForTelegraph(state: GridCombatState): GridCombatState {
  // 완전 분리(non-reactive deep clone) — AI 시뮬은 enumerateStepActions에서 ctx.enemy.pos를 잠시
  //   바꿔가며 reachableTiles를 평가한다. 라이브 *reactive* 상태를 조금이라도 공유하면(얕은 클론·
  //   stage 참조 공유) 그 변형이 computed/watch의 자기 의존성을 건드려 "Maximum recursive updates"가
  //   난다. GridCombatState는 직렬화 가능(세이브 코드)하므로 깊은 복제로 라이브와의 모든 참조를 끊는다.
  const clone = JSON.parse(JSON.stringify(state)) as GridCombatState;
  clone.player.pos = { ...plannedPlayerPos(state) }; // 적이 *내가 갈 위치*를 노리게.
  clone.playerPlan = [];                              // 적 의도만 — 플레이어 계획 재실행 금지.
  clone.player.intentQueue = undefined;
  for (const e of clone.enemies) e.intentQueue = undefined;
  if (clone.allies) for (const a of clone.allies) a.intentQueue = undefined;
  return clone;
}

/**
 * 적 행동 텔레그래프 계산(#5) — 이번 턴에 행동할 적의 *이동 도착칸*(move) + *공격 타격칸*(attack)을
 * 플레이어 계획(도착 위치)을 반영해 다시 계산한다. 뷰가 이 결과로 칸을 강조한다.
 *
 * 핵심: stale intentQueue를 따라가지 않고, *플레이어가 갈 위치*(plannedPlayerPos) 기준으로 적 의도를
 * 그 자리에서 새로 평가한다 → 플레이어가 이동을 계획하면 적 위협도 그 위치 기준으로 갱신된다.
 * 라이브 상태 불변: 비반응 클론(cloneStateForTelegraph) 위에서만 시뮬레이션한다(무한 갱신 방지).
 */
export function previewEnemyTelegraph(live: GridCombatState): { attack: GridPos[]; move: GridPos[] } {
  const atk = new Map<string, GridPos>();
  const mv = new Map<string, GridPos>();
  const add = (m: Map<string, GridPos>, p: GridPos) => { m.set(`${p.x},${p.y}`, { ...p }); };

  // 행동 여부 판정은 *라이브* 카운터/계획 기준(이번 라운드에 실제로 행동하는가). 의도 계산만 클론에서.
  const clone = cloneStateForTelegraph(live);

  // 게임트리 AI는 동점 타이브레이크에 rng()를 쓰는데, *라이브 rng()*는 RunState.rngState(반응형)를 진행시켜
  //   computed 안에서 자기 의존성을 변형(무한 갱신) + 결정 시드 오염을 일으킨다. 그래서 텔레그래프 동안만
  //   *로컬* PRNG로 갈아끼운다(상태/위치 해시 시드 → 같은 계획 단계에서 안정). 끝나면 반드시 원복.
  const prevRng = getRng(); // *실제 등록 함수*를 떠 둔다(rng 래퍼를 setRng하면 자기재귀라 금지).
  let seed = 0x9e3779b9 ^ (clone.turn | 0);
  for (const e of clone.enemies) seed = (seed * 31 + (e.pos.x * 73856093) + (e.pos.y * 19349663)) >>> 0;
  const localPrng = createSeededRng(seed >>> 0);
  setRng(() => localPrng.next());
  try {
    for (let i = 0; i < live.enemies.length; i++) {
      const liveE = live.enemies[i];
      if (liveE.hp <= 0) continue;
      if (!enemyActsThisRound(live, liveE)) continue;
      const e = clone.enemies[i];
      if (!e) continue;
      // 이번 턴 의도를 *지금* 다시 계산(플레이어 도착 위치 기준, 클론 위) — stale 회피.
      const plan = enemyPlan(clone, e);
      let simPos = { ...e.pos };
      for (const a of plan) {
        if (a.kind === 'move') { add(mv, a.to); simPos = { ...a.to }; }
        else if (a.kind === 'attack') {
          if (a.targetTiles?.length) { for (const t of a.targetTiles) add(atk, t); }
          else if (a.attackIdx >= 0) {
            const def = e.attacks?.[a.attackIdx];
            if (def) for (const t of previewAttackTiles(clone, { ...e, pos: simPos }, def)) add(atk, t);
          } else {
            // 근접 폴백(attackIdx -1) — simPos 직교 인접 4칸이 위협 범위.
            for (const d of ROOK_DIRS) {
              const p = { x: simPos.x + d.dx, y: simPos.y + d.dy };
              if (canAttackTile(clone.stage, p)) add(atk, p);
            }
          }
        }
      }
    }
  } finally {
    setRng(prevRng); // 라이브 rng 원복(반드시).
  }
  return { attack: [...atk.values()], move: [...mv.values()] };
}

// ============================================================================
// 스피드 모델(US-001) — 플레이어 행동마다 적 템포 카운터, 도달 시 적 1턴
// ============================================================================

/**
 * 한 행동 직후 공통 정리 — 처치/동료사망복귀/보스페이즈/증원. 전투 종료면 true.
 * (commitRound 루프가 플레이어 행동·적 턴 직후마다 호출.)
 */
function postActionCleanup(state: GridCombatState): boolean {
  cleanupDead(state);
  if (state.swap?.controlling && state.player.hp <= 0) revertSwap(state, true);
  if (state.isBoss) checkBossPhase(state, currentBossDef(state));
  handleWhenEmptySpawns(state);
  return checkOutcome(state);
}

/**
 * 한 전투원(적/아군)의 *1턴* 수행 — intentQueue(actionsPerTurn 분량)를 순서대로 실행.
 * 각 행동은 fxActionIndex 그룹으로 분리(순차 재생). 실행 후 의도 재계산.
 */
function takeCombatantTurn(state: GridCombatState, c: GridCombatant): void {
  // 수면(sleep, #5): 이번 턴 행동 불가(스킵). 피해를 받으면 즉시 깸(applyDamage). 라운드 종료 시 -1 감쇠.
  if ((c.statuses['sleep'] ?? 0) > 0) return;
  // 텔레그래프 일치(#5) — *실행 직전* 의도를 현재 위치 기준으로 다시 계산해, 화면에 보여 준 위협(plannedPlayerPos
  // 기준 텔레그래프)과 실제 행동이 어긋나지 않게 한다. 적은 플레이어가 *간 자리*를 노린다(stale 추격 제거).
  // (아군 토큰은 enemyPlan 대상이 아니므로 기존 intentQueue 유지 — 적만 재계산.)
  if (c.team === 'enemy' && c.hp > 0) c.intentQueue = enemyPlan(state, c);
  const turn = c.intentQueue ?? [];
  for (const action of turn) {
    if (state.outcome) break;
    if (c.hp <= 0) break;
    fxActionIndex += 1;
    executeAction(state, c, action);
    if (postActionCleanup(state)) return;
  }
  // 다음 턴 의도 재계산(위치/상태 변동 반영).
  if (c.hp > 0) c.intentQueue = enemyPlan(state, c);
}

/**
 * 플레이어 1행동 후 적 템포 진행 — 모든 살아 있는 적의 카운터 +1.
 * counter >= effectiveTempo면 그 적 1턴(takeCombatantTurn) + counter -= effectiveTempo.
 *  - slow-enemy(gridEnemySlow) 활성: 실효 템포 +1(덜 자주 행동).
 *  - skip-enemy-action(gridEnemySkip): 발동될 턴을 1개 건너뜀(카운터는 소비).
 * 전투 종료면 즉시 중단.
 */
function tickEnemyTempo(state: GridCombatState): void {
  const slow = (state.gridEnemySlow ?? 0) > 0 ? 1 : 0;
  for (const enemy of state.enemies) {
    if (state.outcome) return;
    if (enemy.hp <= 0) continue;
    // 졸음(drowsy, #8: 구 둔화 대체) — 실효 템포 +스택(적이 그만큼 덜·늦게 행동). 2스택이면 수면으로(tickRoundStatuses).
    const drowsy = enemy.statuses['drowsy'] ?? 0;
    const tempo = Math.max(1, (enemy.tempo ?? DEFAULT_TEMPO) + slow + drowsy);
    enemy.tempoCounter = (enemy.tempoCounter ?? 0) + 1;
    if (enemy.tempoCounter < tempo) continue;
    enemy.tempoCounter -= tempo;
    // 적 행동 박제 — 발동될 턴을 건너뛴다(카운터는 이미 소비).
    if ((state.gridEnemySkip ?? 0) > 0) {
      state.gridEnemySkip = (state.gridEnemySkip ?? 0) - 1;
      continue;
    }
    takeCombatantTurn(state, enemy);
  }
}

/**
 * 설치물 적용 + 감쇠(2026-06-18) — 라운드 해소 끝에 호출.
 * 그 칸에 선 전투원에 효과(위해=적, 강화=플레이어). 폭발=즉발 피해 후 소멸. duration -1, 0이면 소멸.
 */
function tickInstallations(state: GridCombatState): void {
  if (!state.installations?.length) return;
  const consumed = new Set<GridInstallation>();
  for (const inst of state.installations) {
    const occupants = combatantsAt(state, inst.pos).filter((c) => c.hp > 0);
    for (const c of occupants) {
      const enemy = c.team === 'enemy';
      switch (inst.kind) {
        case 'burn': if (enemy) c.statuses['burn'] = (c.statuses['burn'] ?? 0) + inst.value; break;
        case 'poison': if (enemy) c.statuses['poison'] = (c.statuses['poison'] ?? 0) + inst.value; break;
        case 'vulnerable': if (enemy) c.statuses['vulnerable'] = (c.statuses['vulnerable'] ?? 0) + inst.value; break;
        case 'explosion': if (enemy) { applyDamage(state, c, inst.value, {}); consumed.add(inst); } break;
        case 'atk-up': if (c.team === 'player') c.statuses['strength'] = (c.statuses['strength'] ?? 0) + inst.value; break;
        case 'def-up': if (c.team === 'player') c.block += inst.value; break;
        case 'mana-up': if (c.team === 'player') state.mana += inst.value; break;
        default: break;
      }
    }
  }
  // 폭발(즉발 소멸) 제거 + duration 감쇠 후 만료 제거.
  state.installations = state.installations.filter((inst) => {
    if (consumed.has(inst)) return false;
    if (inst.duration === undefined) return true;
    inst.duration -= 1;
    return inst.duration > 0;
  });
}

// ============================================================================
// 라운드 해소 — commitRound
// ============================================================================

/**
 * 플레이어 계획 행동의 *발동 속도 랭크*(작을수록 먼저 해소). 안정 정렬 키.
 *  - 카드 행동: 그 카드의 castSpeed(fast=0 / normal=1 / slow=2). 손패 인스턴스에서 읽고,
 *               (드물게) 손에 없으면 데이터 정의로 폴백. 미설정 카드는 normal(1).
 *  - 이동(move): 항상 3 — slow보다도 뒤(맨 끝). "먼저 행동하고 마지막에 움직인다".
 *  - 그 외(item/swap/wait 등): normal(1) 기본.
 */
function actionSpeedRank(state: GridCombatState, action: PlannedAction): number {
  if (action.kind === 'move') return 3;
  if (action.kind === 'card') {
    let card: Card | undefined = state.hand.find((c) => c.instanceId === action.cardInstanceId);
    if (!card) {
      // 폴백 — 손패에 없으면(이론상 없음) instanceId의 정의 id로 데이터 조회.
      try {
        const baseId = action.cardInstanceId.split('#')[0];
        card = useDataStore().cards.get(baseId);
      } catch { /* 무해 */ }
    }
    const cs = card?.castSpeed;
    return cs === 'fast' ? 0 : cs === 'slow' ? 2 : 1;
  }
  return 1; // item/swap/wait 등 — normal.
}

/**
 * 라운드 해소 (스피드 모델 US-001).
 * playerPlan을 *발동 속도(castSpeed)로 안정 정렬*한 순서로 실행(fast→normal→slow→이동).
 * 동률(같은 랭크)이면 *큐 순서*를 유지 — 플레이어가 그 그룹의 순서를 통제한다.
 * 각 플레이어 행동마다 모든 적 템포 카운터 +1 →
 * counter>=tempo인 적이 1턴 수행(누적, 라운드 넘어감). 계획 후 아군 1턴씩.
 * 매 동작마다 fx push(순차 재생). 동작마다 증원·처치 정리·승패 판정.
 * 라운드 종료: turn++, block 반감, 상태 감쇠, *마나만* 풀충전(손패는 유지), 적 의도 재계산, plan 비움.
 */
export function commitRound(state: GridCombatState): void {
  if (state.outcome) return;

  // 수면(sleep, #5): 잠든 플레이어는 이번 라운드 행동 불가 — 계획 무효(자동 대기로 드로우만, 적은 진행).
  if ((state.player.statuses['sleep'] ?? 0) > 0) state.playerPlan = [];

  // 순차 재생용 행동 그룹 인덱스 리셋 — 이 라운드의 fx가 0번부터 그룹된다.
  fxActionIndex = 0;

  // 스피드 모델(US-001) — 플레이어 계획을 *발동 속도(castSpeed)로 안정 정렬*해 실행.
  //   랭크: 카드 fast(0)→normal(1)→slow(2), 이동(3, 항상 맨 끝). 같은 랭크는 큐 순서 유지(플레이어 통제).
  //   각 플레이어 행동마다 적 템포 카운터 +1, 도달한 적이 1턴 수행(누적). 구 foresight 스텝 인터리브는 폐지.
  //   정렬 키는 *실행 전*에 스냅샷한다 — executeAction이 손패를 비우므로(splice) 정렬 중 castSpeed 조회가 흔들리지 않게.
  const orderedPlan = state.playerPlan
    .map((action, idx) => ({ action, idx, rank: actionSpeedRank(state, action) }))
    .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx)) // 안정 정렬 — 동률은 원래 큐 인덱스 순.
    .map((entry) => entry.action);
  for (let i = 0; i < orderedPlan.length; i++) {
    if (state.outcome) break;
    const pAction = orderedPlan[i];
    if (state.player.hp > 0) {
      fxActionIndex += 1;
      executeAction(state, state.player, pAction);
    }
    if (postActionCleanup(state)) break;
    // 적 템포 진행 — 행동당 카운터 +1(2026-06-19: 대기 직접 선택 폐지 → 행동당 일괄 1).
    tickEnemyTempo(state);
    if (postActionCleanup(state)) break;
  }

  // 턴 종료 자동 대기(2026-06-19, #4) — 플레이어가 직접 고르지 않고 *항상 턴 끝에 1회* 붙는다.
  //   손패를 보충(드로우)하고 적 템포를 1만 진행시킨다(대기는 1턴). 빈 계획으로 커밋해도(턴 넘김) 발동.
  if (!state.outcome && state.player.hp > 0) {
    fxActionIndex += 1;
    execWait(state);
    // 세뇌(#4): 대기 때 *세뇌를 건 적* 쪽으로 1칸 끌려간다(출처 추적).
    if ((state.player.statuses['brainwash'] ?? 0) > 0) {
      const bw = state.brainwashBy ? state.enemies.find((e) => e.id === state.brainwashBy && e.hp > 0) : undefined;
      if (bw) stepToward(state, bw.pos);
    }
    // 혼란(confusion, #12): 대기 때 인접 8칸 중 무작위로 비틀거린다.
    if ((state.player.statuses['confusion'] ?? 0) > 0) confuseMove(state);
    // 퇴행(#10): 턴 종료 대기가 *시간을 쓰지 않음*(적 템포 미진행). 그 외엔 대기 1턴 진행.
    if (!postActionCleanup(state)) {
      if ((state.player.statuses['regress'] ?? 0) === 0) tickEnemyTempo(state);
      postActionCleanup(state);
    }
  }

  // 플레이어 계획 후 아군(소환 토큰)이 각자 1턴(적 추격·근접). 아군은 템포와 무관(플레이어 측).
  if (!state.outcome) {
    for (const ally of state.allies ?? []) {
      if (state.outcome) break;
      if (ally.hp <= 0) continue;
      takeCombatantTurn(state, ally);
    }
  }

  // 설치물 효과(라운드 끝) — 그 칸에 선 전투원에 적용 + 폭발/만료 정리. 즉발 피해로 처치/승패 가능.
  if (!state.outcome) {
    tickInstallations(state);
    postActionCleanup(state);
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

  // (강철 redesign 2026-06-19: 매 턴 +방어 틱 폐지 — 강철은 이제 *방어 감쇠 완화* 플래그. 아래 block 감쇠에서 처리.)

  // 지속 상태 틱(poison/burn/regen + possession 잠식 + imprint→possession) — 모든 살아 있는 전투원.
  //   *감쇠 전*에 적용해 poison:3 → 3 피해 후 2가 되도록(틱 안에서 자기 감쇠). 별도 fx 그룹으로 순차 재생.
  fxActionIndex += 1;
  tickRoundStatuses(state);
  if (postActionCleanup(state)) {
    // DoT로 승패가 갈리면 위 outcome 블록과 동일하게 정리(동료 조종 복귀 + plan 비움).
    if (state.swap?.controlling) revertSwap(state, false);
    else state.swap = undefined;
    state.playerPlan = [];
    return;
  }

  // 모든 전투원 block 감쇠(D6: 절반) + 상태 감쇠.
  //   강철(metallicize, 2026-06-19 검수): 플레이어 방어는 절반이 아니라 -1씩만 감소(플래그). 불굴(barricade) 폐지.
  const metalProtected = (state.player.statuses['metallicize'] ?? 0) > 0;
  for (const c of aliveCombatants(state)) {
    if (c === state.player && metalProtected) c.block = Math.max(0, c.block - 1);
    else c.block = Math.floor(c.block / 2);
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

/** 한 행동 실행(스피드 모델: 큐-순서 직접 실행, ScheduledAction 래퍼 제거). */
function executeAction(state: GridCombatState, actor: GridCombatant, action: PlannedAction): void {
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
  // 사고 가속(haste)이 보충 드로우 +1(켜져 있으면). (수면 sleep은 #5 재설계로 드로우 감소 폐지 — 턴 스킵.)
  const s = state.player.statuses;
  const hasteDraw = (s['haste'] ?? 0) > 0 ? 1 : 0;
  const target = Math.max(0, targetHandSize(state) + hasteDraw);
  const need = target - state.hand.length;
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
  // 실행 시점 합법성 재평가 — 비행 중이면 airStop, 아니면 지상 착지 가능 칸이어야.
  const air = isAirborne(actor);
  const landOk = (p: GridPos): boolean => (air ? canAirStop(state.stage, p) : isFreeTile(state, p));
  if (!landOk(to)) {
    // 막혔으면 같은 방향 best-effort 한 칸(접근). 그래도 안 되면 제자리.
    const fallback = approachMove(state, actor, actor.pos, to);
    if (!fallback || !landOk(fallback)) return;
    to = fallback;
  }
  const from = { ...actor.pos };
  actor.pos = { ...to };
  // 비행 중 이동 = 착지 → 비행 해제(사용자 규칙: 이동하면 공중이 아니게 됨, 재진입은 카드로만).
  if (air) actor.statuses['airborne'] = 0;
  pushFx(state, { kind: 'move', actorId: actor.id, from, to: { ...to } });
  // 바닥 아이템 — 플레이어가 그 칸에 서면 획득(슬라이스: 기록만, 실제 인벤 추가는 스토어).
  if (actor.team === 'player') collectItemAt(state, to);
  // 점액(#6): 이동마다 -1.
  { const sl = actor.statuses['slime'] ?? 0; if (sl > 0) { if (sl - 1 <= 0) delete actor.statuses['slime']; else actor.statuses['slime'] = sl - 1; } }
  // 빙의(#12): 플레이어는 *이동 1회당 -1*(게임 내에서 이동으로 떨쳐냄, 못 떨치고 나가면 런에 잔존).
  if (actor.team === 'player') { const ps = actor.statuses['possession'] ?? 0; if (ps > 0) { if (ps - 1 <= 0) delete actor.statuses['possession']; else actor.statuses['possession'] = ps - 1; } }
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

  // 장판(#4) — 카드가 *때리는 칸*을 데미지 *전에* 강조 fx로 남긴다(현재 위치 기준 재계산, 텔레그래프 stale 방지).
  //   타격형 카드: 그 칸들을 melee/ranged/throw 유형으로. 비타격(버프/회복) 카드: 자기 발동 펄스(#3)로 대신.
  if (cardDealsDamage(card)) {
    const strike = previewCardTiles(state, card, state.player.pos, aimOffset);
    pushAttackTilesFx(state, state.player.id, strike, cardStrikeStyle(card));
  } else {
    // 즉시/버프 카드(#3) — hit/move fx가 없어 화면에 안 보이던 것을 자기 발동 펄스 + (설치 등) 작용 칸 플래시로.
    pushFx(state, { kind: 'status', actorId: state.player.id });
    const placed = card.effects.some((e) => e.kind === 'place-installation');
    if (placed) {
      const tiles = previewCardTiles(state, card, state.player.pos, aimOffset);
      pushAttackTilesFx(state, state.player.id, tiles, 'ranged');
    }
  }

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
  // 점액(#6): 카드 사용(행동)마다 -1.
  { const sl = state.player.statuses['slime'] ?? 0; if (sl > 0) { if (sl - 1 <= 0) delete state.player.statuses['slime']; else state.player.statuses['slime'] = sl - 1; } }
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
/** 플레이어를 targetPos 쪽으로 1칸 이동(우세 축 우선). 막히면 제자리. 세뇌(#4) 끌림용. */
function stepToward(state: GridCombatState, targetPos: GridPos): void {
  const from = { ...state.player.pos };
  const dx = targetPos.x - from.x, dy = targetPos.y - from.y;
  let sx = 0, sy = 0;
  if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx); else sy = Math.sign(dy);
  if (sx === 0 && sy === 0) return;
  const next = { x: from.x + sx, y: from.y + sy };
  if (!tileWalkable(state.stage, next)) return;
  state.player.pos = next;
  pushFx(state, { kind: 'move', actorId: state.player.id, from, to: { ...next } });
  collectItemAt(state, next);
}

/** 혼란(confusion, #12) — 인접 8칸 중 무작위 통행 칸으로 비틀거리며 이동(대기 때). 갈 곳 없으면 제자리. */
function confuseMove(state: GridCombatState): void {
  const from = { ...state.player.pos };
  const dirs = [...KING_DIRS].sort(() => rng() - 0.5);
  for (const d of dirs) {
    const p = { x: from.x + d.dx, y: from.y + d.dy };
    if (tileWalkable(state.stage, p)) {
      state.player.pos = p;
      pushFx(state, { kind: 'move', actorId: state.player.id, from, to: { ...p } });
      collectItemAt(state, p);
      return;
    }
  }
}

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

/**
 * 적 밀기/당기기(미유, 2026-06-18) — 적을 플레이어 기준 toward(당기기)/away(밀기) tiles칸 직선 이동.
 * 장애물/격자밖/멈출 수 없는 칸 직전에 정지. 설치 칸 위로 옮겨 밟게 하는 용도.
 */
function shoveEnemy(state: GridCombatState, enemy: GridCombatant, tiles: number, mode: 'toward' | 'away'): void {
  if (tiles <= 0) return;
  const from = { ...enemy.pos };
  let cur = { ...enemy.pos };
  for (let i = 0; i < tiles; i++) {
    const dx = state.player.pos.x - cur.x;
    const dy = state.player.pos.y - cur.y;
    let sx = 0, sy = 0;
    if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx); else sy = Math.sign(dy);
    if (mode === 'away') { sx = -sx; sy = -sy; }
    if (sx === 0 && sy === 0) break;            // 플레이어와 같은 칸(겹침) — 더 당길 곳 없음.
    const next = { x: cur.x + sx, y: cur.y + sy };
    if (!canStopAt(state.stage, next)) break;   // 벽/구덩이/난간/밖 — 직전에 정지.
    cur = next;
  }
  if (!samePos(cur, from)) {
    enemy.pos = cur;
    pushFx(state, { kind: 'move', actorId: enemy.id, from, to: { ...cur } });
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

/** 적 디버프 스택 총합(취약/약화/중독/화상/퇴행). */
function enemyDebuffSum(s: Record<string, number>): number {
  return (s.vulnerable ?? 0) + (s.weakness ?? 0)
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
  const playerStatuses = state.player.statuses;
  // 퇴행(regress, #10): 컬러 보너스(ATK/DEF) *절반*(기존 전무효에서 완화). 대신 이동 2회·공중·무코스트 대기.
  const regress = (playerStatuses['regress'] ?? 0) > 0;
  const rawBonus = currentBonuses();
  const bonus = regress
    ? { ...rawBonus, damage: Math.floor(rawBonus.damage / 2), block: Math.floor(rawBonus.block / 2) }
    : rawBonus;
  const strength = playerStatuses.strength ?? 0;
  const wild = isWild(playerStatuses);               // 수화/심수화: 카드 base 피해 ×2 + 방어 0.
  const dmgFlat = damageFlatBonus(playerStatuses);   // +focus − sap (strength 별도).
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
  // 원거리(aimed/throw)는 유령화(ghost) 적을 타게팅 못 함(#11). 근접(pattern)은 가능.
  const rangedCard = card.targetMode === 'aimed' || card.targetMode === 'throw';
  // 세뇌(brainwash, #4): 플레이어 공격이 *아군*에게도 적중한다.
  const brainwashed = (state.player.statuses['brainwash'] ?? 0) > 0;
  const canHit = (c: GridCombatant): boolean =>
    (c.team === 'enemy' || (brainwashed && c.team === 'ally')) && c.hp > 0
    && !(rangedCard && (c.statuses?.['ghost'] ?? 0) > 0);
  if (card.targetMode === 'throw') {
    // 투척(US-003) — 플레이어 기준 레이캐스트 해소(장애물 앞 정지 + 수렴 강칸). anchor 무시.
    for (const hit of resolveThrowHits(state, card, state.player.pos)) {
      for (const c of combatantsAt(state, hit.pos)) {
        if (canHit(c)) shapeHits.push({ target: c, mul: hit.mul });
      }
    }
  } else {
    shape.forEach((off, i) => {
      const pos = { x: anchor.x + off.dx, y: anchor.y + off.dy };
      if (!canAttackTile(state.stage, pos)) return;
      // 그 칸의 *모든* 적군을 대상에 포함(겹침 허용 — 한 칸에 적 여럿/플레이어와 겹쳐도). perTileMul은 칸 인덱스 기준.
      const mul = perTileMul[i] ?? 1;
      for (const c of combatantsAt(state, pos)) {
        if (canHit(c)) shapeHits.push({ target: c, mul });
      }
    });
  }

  /**
   * shape 칸 위 각 적에게 base 피해를 perTileMul로 분배(strength/focus/sap/feral/weakness/vulnerable 통합).
   *
   * addStrength=true(일반 공격): 구 combat.ts `damage` 핸들러와 동일 합성 —
   *   base(카드값) → feral ×2 → + 색보너스(bonus.damage, regress면 0) + strength + focus − sap
   *   → 유물 damage-out-add/mul(applyDamageRelicMods) → perTileMul 분배 → applyDamage(배수).
   *   ※ 호출처는 *색보너스를 더하지 않은* 카드값만 넘긴다(색은 여기서 wild ×2 *뒤* 가산 — combat.ts와 동일).
   * addStrength=false(순수 스케일: damage-min-color/block-to-damage 등): 보정 없이 그 값 그대로(combat.ts pure-value 경로).
   */
  const dealToShape = (base: number, addStrength = true): void => {
    let v: number;
    if (addStrength) {
      const wb = Math.floor(base * wildMul(playerStatuses)); // 수화 ×1.5 / 심수화 ×2(색/힘 가산 전).
      const slimePen = rangedCard ? 0 : (playerStatuses['slime'] ?? 0); // 점액(#6): 근접 피해 -스택(원거리 제외).
      const composed = wb + bonus.damage + strength + dmgFlat - slimePen; // 색(regress 0) + 힘 - 점액.
      v = applyDamageRelicMods(state, Math.max(0, composed));  // 유물 주는 피해 보정.
    } else {
      if (base <= 0) return;
      v = base;                                          // 순수 스케일 — 추가 보정 없음.
    }
    if (v <= 0) return;
    for (const { target, mul } of shapeHits) {
      applyDamage(state, target, Math.floor(v * mul), playerStatuses);
    }
  };
  /** 플레이어 방어 획득(juggernaut 경유). 수화(feral/feral-heavy)면 방어 0(combat.ts block 핸들러 동일). */
  const gainBlock = (v: number): void => { if (!wild && v > 0) gainPlayerBlock(state, v); };
  /**
   * 방어 카드값 합성 — combat.ts block 핸들러와 동일:
   *   카드값 + 색보너스(bonus.block, regress 0) + 유물 block-out-add + dexterity − frail − sap, 최소 0.
   *   (수화 차단은 gainBlock에서 처리하므로 여기선 수치만.)
   */
  const blockValue = (cardVal: number): number =>
    Math.max(0, cardVal + bonus.block + relicBlockAdd + (playerStatuses['dexterity'] ?? 0) + blockFlatBonus(playerStatuses));
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
        dealToShape(Math.floor(v)); // 색/힘/focus/sap/feral은 dealToShape 내부에서 합성.
        break;
      }
      case 'heal': {
        const hv = Math.floor(v);
        // 세뇌(#4): 회복하면 *세뇌를 건 적*도 그만큼 회복(출처 추적, 죽었으면 무효).
        if (hv > 0 && brainwashed) { const be = state.brainwashBy ? state.enemies.find((e) => e.id === state.brainwashBy && e.hp > 0) : undefined; if (be) { be.hp = Math.min(be.maxHp, be.hp + hv); pushFx(state, { kind: 'heal', actorId: be.id, amount: hv }); } }
        if (hv > 0) {
          // 심수화(feral-heavy): 회복 전면 차단(combat.ts healBlocked). 일반 수화는 회복 가능.
          if (isHealBlocked(playerStatuses)) break;
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + hv);
          pushFx(state, { kind: 'heal', actorId: state.player.id, amount: hv });
        } else if (hv < 0) {
          loseHpFromCard(-hv); // 음수 = 자기 HP 비용(각혈 발동).
        }
        break;
      }
      case 'block': {
        gainBlock(blockValue(Math.floor(v))); // 색/민첩/유물/−sap 합성, 수화면 gainBlock이 0 처리.
        break;
      }
      case 'break-armor': {
        // 방어 파괴(2026-06-19) — 닿은 적의 방어막을 *전부* 즉시 제거(폐지된 frail 디버프 대체).
        for (const { target } of shapeHits) {
          if (target.block > 0) {
            pushFx(state, { kind: 'block-absorb', actorId: target.id, amount: target.block });
            target.block = 0;
          }
        }
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
        if (sv === 0) break;
        // applyStatusToken 경유 — 졸음→수면 전이·수면 비행해제 같은 특수 규칙을 카드/몬스터가 공유.
        if ((eff.target ?? 'enemy') === 'self') applyStatusToken(state.player, `${status}:${sv}`);
        else for (const { target } of shapeHits) applyStatusToken(target, `${status}:${sv}`);
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
        dealToShape(Math.floor(rawV) * state.hand.length); // 색/힘/focus/sap/feral은 dealToShape 내부.
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
        dealToShape(Math.floor(v) * mult); // 색/힘/focus/sap/feral은 dealToShape 내부.
        break;
      }
      case 'damage-per-debuff': {
        // 각 대상별 자기 디버프 스택 기준(다중 적). base(=value×sum) → feral ×2 → +색+힘+focus−sap.
        if (shapeHits.length === 0) break;
        for (const { target, mul } of shapeHits) {
          const sum = enemyDebuffSum(target.statuses);
          const card = Math.floor(v) * sum;
          const wb = wild ? card * 2 : card;
          const base = applyDamageRelicMods(state, Math.max(0, wb + bonus.damage + strength + dmgFlat));
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
        // 격자 기존 거동 보존(strength·색 가산) + 신규 focus/sap/feral 합류. dealToShape 내부 합성.
        //   (combat.ts dealRawDamage는 순수 count×value지만, 격자는 이전부터 strength/색을 더해 왔으므로
        //    그 거동을 깨지 않고 일관성을 위해 유지한다 — 효과 종류상 미세한 상향.)
        dealToShape(companionCount() * Math.floor(rawV));
        break;
      }
      case 'damage-per-relic': {
        dealToShape(relicCount() * Math.floor(rawV)); // 격자 기존 거동 보존(strength·색) + focus/sap/feral.
        break;
      }
      case 'damage-per-cards-played': {
        const played = state.cardsPlayedThisTurn ?? 0;
        dealToShape(Math.floor(rawV) * played);
        break;
      }
      case 'heavy-blade': {
        // 중검 — strength를 mult배로 직접 반영(combat.ts heavy-blade): base ×feral + strength×mult + 색 + focus − sap.
        const mult = Number(eff.params?.mult ?? 1);
        const wb = wild ? Math.floor(v) * 2 : Math.floor(v);
        const composed = applyDamageRelicMods(state, Math.max(0, wb + strength * mult + bonus.damage + dmgFlat));
        dealToShape(composed, false); // false: 합성은 여기서 끝(dealToShape가 다시 힘/색 더하지 않게).
        break;
      }
      case 'adaptive-strike': {
        if (state.player.block > 0) {
          const bn = Number(eff.params?.bonus ?? 4);
          dealToShape(Math.floor(v) + bn); // 색/힘/focus/sap/feral은 dealToShape 내부.
        } else {
          gainBlock(blockValue(Math.floor(v)));
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
        if (hv > 0 && !isHealBlocked(playerStatuses)) { // 심수화면 회복 차단.
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
        gainBlock(blockValue(Math.floor(v) + grown)); // 색/민첩/유물/−frail/−sap + 누적, 수화면 0.
        card.bonusBlock = grown + Number(eff.params?.growth ?? 1); // 다음 사용 대비 누적.
        break;
      }
      case 'growing-damage': {
        const grown = (card.bonusDamage ?? 0);
        dealToShape(Math.floor(v) + grown); // 색/힘/focus/sap/feral은 dealToShape 내부.
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
      // === 공중 이동(2026-06-18) — 비행 상태 부여(value턴). 이동 시 착지하며 해제. ===
      case 'grant-airborne': {
        const turns = Math.max(1, Math.floor(rawV) || 1);
        state.player.statuses['airborne'] = Math.max(state.player.statuses['airborne'] ?? 0, turns);
        pushLog(state, '날아올랐다');
        break;
      }
      // === 설치(2026-06-18) — shape 칸(anchor 기준) 중 설치 가능 칸에 효과 장판 생성. ===
      case 'place-installation': {
        const kind = String(eff.params?.kind ?? 'burn') as GridInstallation['kind'];
        const dur = eff.params?.duration !== undefined ? Math.max(1, Number(eff.params.duration)) : 3;
        const val = Math.max(1, Math.floor(rawV) || 1);
        const cells = (shape.length ? shape : [{ dx: 0, dy: 0 }]).map((o) => ({ x: anchor.x + o.dx, y: anchor.y + o.dy }));
        state.installations = state.installations ?? [];
        let placed = 0;
        for (const pos of cells) {
          if (!canPlaceTile(state.stage, pos)) continue;
          state.installations.push({ pos, kind, value: val, duration: dur });
          placed += 1;
        }
        if (placed > 0) pushLog(state, '설치물을 깔았다');
        break;
      }
      // === 밀기/당기기(미유, 2026-06-18) — 맞은 적을 플레이어 기준 끌거나 민다(설치 칸 유도). ===
      case 'pull-enemy':
      case 'push-enemy': {
        const dist = Math.max(1, Math.floor(rawV) || 1);
        const mode = eff.kind === 'pull-enemy' ? 'toward' : 'away';
        const moved = new Set<GridCombatant>();
        for (const { target } of shapeHits) {
          if (target.hp <= 0 || moved.has(target)) continue;
          moved.add(target);
          shoveEnemy(state, target, dist, mode);
        }
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
        const cwb = wild ? Math.floor(v) * 2 : Math.floor(v); // 수화 ×2(카드 base).
        const dmg = applyDamageRelicMods(state, Math.max(0, cwb + bonus.damage + strength + dmgFlat));
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
        if (pick === 0) dealToShape(26); // 색/힘/focus/sap/feral은 dealToShape 내부.
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
  // 공격자 측 플랫 보정(+focus − sap)과 수화(feral/feral-heavy ×2)도 일관 반영 —
  //   격자는 *어떤 전투원이든* 같은 상태이상 규칙을 따른다(combat.ts와 동일 합성: base ×feral + str + focus − sap).
  const atkFlat = damageFlatBonus(attacker.statuses);
  const composeAtk = (cardBase: number): number => {
    const wb = Math.floor(cardBase * wildMul(attacker.statuses)); // 수화 ×1.5 / 심수화 ×2.
    return Math.max(0, wb + enemyStrength + atkFlat);
  };

  // 근접 폴백 — gridBehavior 없는 적. 인접(거리1) *또는 같은 칸*(거리0, 겹침)이면 근접 타격.
  if (attackIdx < 0 || !attacker.attacks || !attacker.attacks[attackIdx]) {
    if (manhattan(attacker.pos, state.player.pos) <= 1 && state.player.hp > 0) {
      // 장판(#4) — 근접 폴백은 플레이어 칸 1칸을 melee로 강조 후 타격.
      pushAttackTilesFx(state, attacker.id, [{ ...state.player.pos }], 'melee');
      const dmg = composeAtk(attacker.attack ?? 0);
      applyDamage(state, state.player, dmg, attacker.statuses);
      pushLog(state, `${attacker.name ?? '적'}의 공격`);
    }
    return;
  }

  const atk = attacker.attacks[attackIdx];
  void plannedTiles; // 예측 칸은 텔레그래프용 — 실행은 실제 위치 기준 shape로 재계산.
  const baseDamage = composeAtk(atk.damage ?? attacker.attack ?? 0);
  const perTileMul = atk.perTileMul ?? [];

  // 장판(#4) — 이 공격이 때리는 모든 유효 칸(절대)을 데미지 *전에* 강조용 fx로 남긴다.
  //   유형: shape가 전부 인접이면 melee, 멀리 닿으면 ranged(직선 결). 데미지 숫자가 뜰 때 사라진다.
  const strikeTiles: GridPos[] = [];
  for (const off of atk.shape ?? []) {
    const p = { x: attacker.pos.x + off.dx, y: attacker.pos.y + off.dy };
    if (canAttackTile(state.stage, p)) strikeTiles.push(p);
  }
  pushAttackTilesFx(state, attacker.id, strikeTiles, attackShapeStyle(atk.shape));

  // perTileMul을 atk.shape 인덱스에 정렬(walkable 필터로 인덱스가 밀리지 않게 shape 직접 순회).
  // 칸에 플레이어가 *겹쳐 있어도* 맞도록 combatantsAt(전부)로 판정.
  let hitAny = false;
  let possessionCast = false;
  const appliedStatus = (atk.applyStatus ?? '').split(':')[0];
  (atk.shape ?? []).forEach((off, i) => {
    const p = { x: attacker.pos.x + off.dx, y: attacker.pos.y + off.dy };
    if (!canAttackTile(state.stage, p)) return;
    const mul = perTileMul[i] ?? 1;
    for (const target of combatantsAt(state, p)) {
      if (target.team === 'player' && target.hp > 0) {
        applyDamage(state, target, Math.floor(baseDamage * mul), attacker.statuses);
        applyStatusToken(target, atk.applyStatus);
        // 세뇌(#4): 출처 적 기록(회복·이동이 이 적을 향함). 빙의(#12): 시전자는 처치 취급.
        if (appliedStatus === 'brainwash') state.brainwashBy = attacker.id;
        if (appliedStatus === 'possession') possessionCast = true;
        hitAny = true;
      }
    }
  });
  if (hitAny) pushLog(state, `${attacker.name ?? '적'}의 ${atk.name ?? '공격'}`);
  // 빙의(#12): 빙의를 건 적은 스스로를 바쳐 사라진다(처치 취급 — 전투가 빨리 끝남).
  if (possessionCast && attacker.hp > 0) {
    attacker.hp = 0;
    pushFx(state, { kind: 'death', actorId: attacker.id });
    pushLog(state, `${attacker.name ?? '적'}이(가) 들러붙으며 사라졌다`);
  }
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
  const s = state.player.statuses;
  // (점액(slime)은 #6 재설계로 마나 무관 — 이동 상하좌우1 + 근접 -스택 + 행동마다 감쇠. 여기선 미처리.)
  state.maxMana = Math.max(1, DEFAULT_MAX_MANA + bonus.manaExtra + relicMana);
  const effMana = state.maxMana;
  // next-turn-energy(칼리번) — 다음 라운드 시작 마나 보너스 1회 반영 후 0 리셋.
  const energyBonus = state.nextTurnEnergyBonus ?? 0;
  state.mana = effMana + energyBonus;
  state.nextTurnEnergyBonus = 0;
  // 경련(spasm, 2026-06-19 검수): 이번 라운드 마나 -스택(최소 0), 턴 경과 시 *전부 소멸*(한 번에).
  const spasm = s['spasm'] ?? 0;
  if (spasm > 0) {
    state.mana = Math.max(0, state.mana - spasm);
    delete s['spasm'];
  }
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
      moveProfile: ALLY_MOVE_PROFILE,
      attack,
      name: '작은 슬라임',
    };
    ally.intentQueue = planAlly(state, ally);
    allies.push(ally);
    pushFx(state, { kind: 'spawn', actorId: ally.id, to: { ...pos } });
  }
}

/** 아군 1마리의 *1턴* 계획(actionsPerTurn, 기본 1) — 적 인접이면 근접 공격, 아니면 접근. */
function planAlly(state: GridCombatState, ally: GridCombatant): PlannedAction[] {
  const out: PlannedAction[] = [];
  let simPos = { ...ally.pos };
  const horizon = enemyHorizon(ally);
  for (let step = 0; step < horizon; step++) {
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
    statuses: {},    moveProfile,
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
