/**
 * 스테이지 스키마 — 전투 노드(던전 입구)의 격자 무대.
 *
 * 절차적 생성(systems/stage-gen.ts)이 권역/tier/난이도 파라미터로 만든다.
 * 격자는 *정사각형이 아닐 수 있다* — void 셀로 비직사각·구멍을 표현.
 */

import type { GridPos } from './base';

export type CellType =
  | 'floor'   // 통행/점유 가능
  | 'wall'    // 통행·점유 불가(격자 안의 장애물)
  | 'void'    // 격자 밖(비직사각/구멍 — 렌더 안 함)
  | 'item'    // 바닥 아이템 칸(통행 가능)
  | 'spawn';  // 증원 출현 후보 칸(통행 가능)

/** 증원(추가 적) 규칙 — point 8: 처치 중 등장 / 맵 비면 등장. */
export interface StageSpawn {
  /** 이 전투 turn 시작 시 등장. */
  atTurn?: number;
  /** 맵에 적이 0이 되면 등장(1회 소비). */
  whenEmpty?: boolean;
  enemyId: string;
  /** 등장 위치. 미지정 시 spawn/floor 빈 칸 중 무작위. */
  at?: GridPos;
}

export interface GridStage {
  id: string;
  /** 바운딩 박스. cells[y][x], 0 <= x < width, 0 <= y < height. */
  width: number;
  height: number;
  /** [y][x] 셀 종류. void=격자 밖(비직사각·구멍). */
  cells: CellType[][];
  /** 플레이어 시작 칸. */
  playerStart: GridPos;
  /** 초기 적 배치 칸(enemyIds와 인덱스 정렬). */
  enemyStarts: GridPos[];
  /** 바닥 아이템 — 그 칸에 서면 획득. */
  itemDrops?: { pos: GridPos; itemId: string }[];
  /** 증원 규칙. */
  spawns?: StageSpawn[];
  /**
   * 계획 시야 N (1~3, 스테이지/난이도가 결정).
   * 플레이어는 N턴 앞 행동을 미리 큐에 배치하고, 적 의도도 N개 공개된다.
   */
  foresight: number;
}
