/**
 * 스테이지 스키마 — 전투 노드(던전 입구)의 격자 무대.
 *
 * 절차적 생성(systems/stage-gen.ts)이 권역/tier/난이도 파라미터로 만든다.
 * 격자는 *정사각형이 아닐 수 있다* — void 셀로 비직사각·구멍을 표현.
 */

import type { GridPos } from './base';

/**
 * 타일 종류 — 각 종류는 6속성(이동/공중이동/공격/관통/설치/시야) 조합(systems/tiles.ts TILE_PROPS).
 * 방해물도 타일로 처리. 효과장판(화상 등)은 *설치물*로 별도 취급(타일 종류 아님).
 */
export type CellType =
  | 'floor'   // 바닥 — 모든 행위 가능
  | 'wall'    // 벽 — 이동·공격·관통·시야 전부 차단(격자 안 장애물)
  | 'void'    // 격자 밖(비직사각/구멍 — 렌더 안 함)
  | 'item'    // 바닥 아이템 칸(= floor + 아이템)
  | 'spawn'   // 증원 출현 후보 칸(= floor)
  | 'pit'     // 구덩이 — 지상 이동 불가, 공중 통과(착지 X), 원거리/투척/시야 통과
  | 'bush'    // 수풀 — 통행 가능하나 시야 차단(엄폐)
  | 'fence';  // 난간 — 통행 불가하나 시야·투척·원거리 통과

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

/**
 * 인카운터(저작 전투) — 특정 노드의 *맵 타일 배치 + 몬스터 + 소환 스케줄*을 손으로 정의(절차 생성 대체).
 * grid는 파이프(|) 구분 ASCII 행. 타일 문자(INI가 `#`을 주석 처리하므로 벽은 `w`):
 *   '.'=바닥, 'w'=벽, '_'=격자밖(void), 'o'=구덩이(pit), 'b'=수풀(bush), 'f'=난간(fence),
 *   'P'=플레이어 시작(바닥), '1'~'9'=적 시작 슬롯(바닥), 's'=소환점(바닥).
 * monsters[i] = 슬롯 (i+1) 의 몬스터 id. spawns = 증원(턴/맵비움 + 몬스터 id).
 */
export interface EncounterDef {
  id: string;
  name?: string;
  /** 파이프 분해된 ASCII 행(각 문자 = 타일/엔티티). */
  rows: string[];
  /** 적 슬롯('1'~'9') → 몬스터 id (slot N = monsters[N-1]). */
  monsters: string[];
  /** 증원 — atTurn(턴 시작) 또는 whenEmpty(맵 비면) + 몬스터 id. */
  spawns: { atTurn?: number; whenEmpty?: boolean; monster: string }[];
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
