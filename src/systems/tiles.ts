/**
 * 타일 속성 모델 (격자 전투) — 사용자 사양.
 *
 * 각 타일 종류는 6축 OX 속성의 조합:
 *  - 이동(move)      : 일반 이동으로 통과(move) / 그 칸에 멈춤(moveStop).
 *  - 공중이동(air)   : "공중" 상태/공중 이동 카드로 통과(airMove) / 멈춤(airStop).  ※ 공중 메커니즘 미구현 — *휴면*.
 *  - 공격(attack)    : 공격이 적용될 수 있는 칸(유효 타격칸).
 *  - 관통(pierce)    : 투척이 지나갈 수 있음. (미정의 개념상 attack과 동일 — 레지스트리에서 일치시킴.)
 *  - 설치(place)     : 설치기를 쓸 수 있는 칸.  ※ 설치 메커니즘 미구현 — *휴면*.
 *  - 시야(sight)     : 이 칸 너머로 원거리(시야)를 쓸 수 있음(true=투과).
 *
 * 방해물(벽 등)도 타일로 처리한다. 올라갔을 때 효과가 나는 장판(화상장판 등)은 *설치물*로 따로 취급하며
 * 여기 타일 종류에는 넣지 않는다.
 */

import type { CellType, GridPos, GridStage } from '@/data/schemas';

export interface TileProps {
  /** 일반 이동으로 통과 가능. */
  move: boolean;
  /** 일반 이동으로 이 칸에 멈출 수 있음. */
  moveStop: boolean;
  /** 공중 이동으로 통과 가능(휴면). */
  airMove: boolean;
  /** 공중 이동으로 멈출 수 있음(휴면). */
  airStop: boolean;
  /** 공격이 적용될 수 있는 칸. */
  attack: boolean;
  /** 투척이 지나갈 수 있음(기본 = attack). */
  pierce: boolean;
  /** 설치기를 쓸 수 있는 칸(휴면). */
  place: boolean;
  /** 시야 투과 — 이 칸 너머로 원거리 가능(true=투과, false=차단). */
  sight: boolean;
}

const T = (
  move: boolean, moveStop: boolean, airMove: boolean, airStop: boolean,
  attack: boolean, pierce: boolean, place: boolean, sight: boolean,
): TileProps => ({ move, moveStop, airMove, airStop, attack, pierce, place, sight });

/**
 * 타일 종류별 속성. 의미 있는 최소 집합(최대 2^6이나 의미 위주).
 *                 move  stop  air  airStop atk  pierce place sight
 */
export const TILE_PROPS: Record<CellType, TileProps> = {
  floor: T(true,  true,  true,  true,  true,  true,  true,  true),  // 바닥 — 전부 가능
  item:  T(true,  true,  true,  true,  true,  true,  true,  true),  // 바닥 + 아이템 오버레이
  spawn: T(true,  true,  true,  true,  true,  true,  true,  true),  // 바닥 + 증원점
  wall:  T(false, false, false, false, false, false, false, false), // 벽 — 전부 차단(시야·투척 포함)
  void:  T(false, false, false, false, false, false, false, false), // 격자 밖
  pit:   T(false, false, true,  false, true,  true,  false, true),  // 구덩이 — 지상X, 공중 통과(착지X), 원거리/투척/시야 O
  bush:  T(true,  true,  true,  true,  true,  true,  true,  false), // 수풀 — 통행 O, 시야 차단(엄폐)
  fence: T(false, false, true,  false, true,  true,  false, true),  // 난간 — 통행 X, 시야/투척/원거리 O
};

/** 격자 밖/미정의 타일의 폴백(전부 차단). */
const VOID_PROPS = TILE_PROPS.void;

/** 좌표의 타일 속성(격자 밖 = void 폴백). */
export function tilePropsAt(stage: GridStage, p: GridPos): TileProps {
  if (p.x < 0 || p.y < 0 || p.y >= stage.cells.length || p.x >= (stage.cells[p.y]?.length ?? 0)) {
    return VOID_PROPS;
  }
  const t = stage.cells[p.y][p.x];
  return TILE_PROPS[t] ?? TILE_PROPS.floor;
}

// 축별 접근자 — 호출부 가독성.
export const canMoveThrough = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).move;
export const canStopAt = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).moveStop;
export const canAirThrough = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).airMove;
export const canAirStop = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).airStop;
export const canAttackTile = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).attack;
export const canPierceTile = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).pierce;
export const canPlaceTile = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).place;
export const tileTransparent = (s: GridStage, p: GridPos): boolean => tilePropsAt(s, p).sight;

/**
 * 시야(LoS) 확보 — from→to 직선이 지나가는 *중간* 칸에 시야 차단(sight=false) 칸이 하나도 없으면 true.
 * 끝점(from/to)은 검사 제외(목표 칸 자체가 차단성이어도 그 칸은 조준 가능). Bresenham 정수 라인.
 */
export function hasLineOfSight(stage: GridStage, from: GridPos, to: GridPos): boolean {
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // 첫 칸(from)은 건너뛰고 진행, to 직전까지 중간 칸만 검사.
  while (true) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) break; // to 도달 — 중간 검사 끝.
    if (!tileTransparent(stage, { x: x0, y: y0 })) return false; // 중간에 불투명 칸 — 시야 차단.
  }
  return true;
}
