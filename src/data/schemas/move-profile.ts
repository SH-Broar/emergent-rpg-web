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
  | 'rook'        // 직선(상하좌우), 사거리 제한 — 인간
  | 'knight'      // L자 점프(사거리 무관) — 나방(후속)
  | 'bishop'      // 대각선, 사거리 제한 — 팬텀(후속)
  | 'king'        // 인접 8칸(king), range로 확장 — 아르카나(후속)
  | 'orthogonal1' // 상하좌우 1칸(근접 폴백)
  | 'custom';     // customOffsets 사용

export interface MoveProfile {
  pattern: MovePattern;
  /**
   * 슬라이딩 패턴(rook/bishop/king)의 사거리. 강화로 증가.
   * 점프형(knight)·custom은 무시. orthogonal1은 항상 1.
   */
  range: number;
  /** pattern='custom'일 때 도달 가능한 상대 오프셋 집합. */
  customOffsets?: GridOffset[];
}

/** 인간 기본 이동 — 룩(직선) 사거리 2. (RunState.moveUpgrades로 range 가산) */
export const HUMAN_MOVE_PROFILE: MoveProfile = { pattern: 'rook', range: 2 };

/** 적 기본 이동 폴백 — 근접 추격(상하좌우 1칸). */
export const DEFAULT_ENEMY_MOVE_PROFILE: MoveProfile = { pattern: 'orthogonal1', range: 1 };
