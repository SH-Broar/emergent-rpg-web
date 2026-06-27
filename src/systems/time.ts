/**
 * 게임 시계 — 런 시간(행동/이동 turn)을 일·시·분으로 환산.
 *
 * 모델(2026-06-27): 게임 = 3일(72시간). **1일차 12:00 시작 → 4일차 12:00 종료**(총 300턴).
 *   1턴(노드 방문 1회) = 14.4분. 100턴 = 24시간. 일차 경계 = 자정.
 *   정오 시작이라 1·4일차는 50턴(12h), 2·3일차는 100턴(24h) → 50+100+100+50 = 300.
 *
 * 진실원 = visitedNodes.length(경과 턴). 순수 함수(store 비의존) — run.ts↔time.ts 순환 없음.
 */

/** 1턴(행동/노드 방문) = 14.4분. 100턴 = 24시간. */
export const MINUTES_PER_TURN = 14.4;
/** 시작 절대분 — 1일차 12:00 = 720분(1일차 0:00 기준). */
export const START_MINUTE = 720;
/** 하루 = 1440분. */
export const DAY_MINUTES = 1440;

/** 경과 턴 → 1일차 0:00 기준 절대 분(반올림 정수). */
export function absoluteMinute(turn: number): number {
  return Math.round(START_MINUTE + turn * MINUTES_PER_TURN);
}

/** 경과 턴의 일차(1-base). 1일차 12:00 시작 → turn 50에서 2일차. */
export function dayOfTurn(turn: number): number {
  return Math.floor(absoluteMinute(turn) / DAY_MINUTES) + 1;
}

/** 경과 턴 → { day, hour, minute }(전부 정수). 시계 표시용. */
export function clockOfTurn(turn: number): { day: number; hour: number; minute: number } {
  const abs = absoluteMinute(turn);
  const within = abs % DAY_MINUTES;
  return {
    day: Math.floor(abs / DAY_MINUTES) + 1,
    hour: Math.floor(within / 60),
    minute: within % 60,
  };
}

/** "HH:MM" 시각 표기. */
export function clockLabel(turn: number): string {
  const { hour, minute } = clockOfTurn(turn);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "N일차 HH:MM" 전체 표기. */
export function clockFull(turn: number): string {
  const { day } = clockOfTurn(turn);
  return `${day}일차 ${clockLabel(turn)}`;
}

/** 제한 턴 → 총 게임시간 라벨 (예: 300턴 → "72시간"). 연표 제한시간 표시용. */
export function durationLabel(turns: number): string {
  return `${Math.round((turns * MINUTES_PER_TURN) / 60)}시간`;
}

/** 짧은 잔여 턴 → 분 라벨 (예: 3턴 → "43분"). 생활 제작·재진입 등 단기 표시용. */
export function minutesLabel(turns: number): string {
  return `${Math.round(turns * MINUTES_PER_TURN)}분`;
}
