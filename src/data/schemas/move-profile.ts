/**
 * 이동 프로필 (행마법) 스키마 — 격자 전투.
 *
 * 종족/적마다 다른 이동 규칙을 체스말 패턴으로 표현한다.
 * 이동은 *강화 대상*(카드처럼 성장) — range가 강화로 증가한다.
 *
 * 슬라이스 정식 구현: 인간 = 룩(rook) 사거리 2.
 * 나방=나이트 / 팬텀=비숍·옆1 / 아르카나=킹+ 는 후속 트랙.
 */

import type { GridOffset } from './base';

export type MovePattern =
  | 'rook'        // 직선(상하좌우), 사거리 제한 — 하코(인간)
  | 'knight'      // L자 점프(사거리 무관) — 리무(나방)
  | 'bishop'      // 대각선, 사거리 제한
  | 'king'        // 인접 8칸(king), range로 확장
  | 'orthogonal1' // 상하좌우 1칸(근접 폴백)
  | 'manhattan'   // 맨해튼 거리 ≤ range 다이아몬드(점프형, 경로 무시) — 샤유아(슬라임)
  | 'composite'   // compose에 나열한 하위 패턴들의 합집합 — 화이트 팡(비숍 ∪ 직교1)
  | 'custom';     // customOffsets 사용

export interface MoveProfile {
  pattern: MovePattern;
  /**
   * 슬라이딩 패턴(rook/bishop/king)·맨해튼의 사거리. 강화로 증가.
   * 점프형(knight)·custom은 무시. orthogonal1은 항상 1. composite는 하위 패턴별로 적용.
   */
  range: number;
  /** pattern='custom'일 때 도달 가능한 상대 오프셋 집합. */
  customOffsets?: GridOffset[];
  /**
   * pattern='composite'일 때 합칠 하위 패턴들. 각자 같은 range를 쓴다(orthogonal1은 항상 1).
   * 예) 화이트 팡 = ['bishop','orthogonal1'] — 대각 슬라이드 ∪ 차원 스텝(직교 1칸).
   */
  compose?: MovePattern[];
}

/** 하코(인간) 기본 이동 — 룩(직선) 사거리 2. (RunState.moveUpgrades + 바람색 moveBonus로 range 가산) */
export const HUMAN_MOVE_PROFILE: MoveProfile = { pattern: 'rook', range: 2 };

/** 리무(나방) 이동 — 나이트(L자 점프, 경로·점유 무시). */
export const MOTH_MOVE_PROFILE: MoveProfile = { pattern: 'knight', range: 1 };

/** 화이트 팡(네코미미 수인) 이동 — 비숍(대각, 강화로 길어짐) ∪ 직교 1칸(차원 스텝). */
export const WHITEFANG_MOVE_PROFILE: MoveProfile = {
  pattern: 'composite', range: 2, compose: ['bishop', 'orthogonal1'],
};

/** 샤유아(슬라임) 이동 — 맨해튼 거리 R(상하좌우 기준 다이아몬드), R=1 시작 → 강화로 증가. */
export const SLIME_MOVE_PROFILE: MoveProfile = { pattern: 'manhattan', range: 1 };

/** 적 기본 이동 폴백 — 근접 추격(상하좌우 1칸). */
export const DEFAULT_ENEMY_MOVE_PROFILE: MoveProfile = { pattern: 'orthogonal1', range: 1 };
