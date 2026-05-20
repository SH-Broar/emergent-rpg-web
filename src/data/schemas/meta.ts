/**
 * 메타 진행 스키마 — 영구 저장 (localStorage 등).
 *
 * spec v2 / Round 11: 5게이지 시스템
 *   - 히페리온 ① / 히페리온 ② (캐릭터 시그니처 + NPC 친밀)
 *   - 해석 ① / 해석 ② (시대 미션 + 보스 클리어)
 *   - 종합 진행도 (위 4개의 함수)
 *
 * 각 게이지는 % 단계마다 콘텐츠 해금 노드를 풀어준다.
 */

import type { CardId, RaceId, TimelineId } from './base';

/** 한 메타 게이지 — 0~1 정규화 또는 누적 정수. */
export interface MetaGauge {
  /** 현재 누적 값. */
  current: number;
  /** 최대값 (해금 천장). */
  max: number;
  /** 다음 해금 단계까지의 % 임계. 0..1. */
  unlockThresholds: number[];
}

/** 콘텐츠 해금 토큰. 게이지 임계 도달 시 발급. */
export type GaugeKey = 'hyperion1' | 'hyperion2' | 'insight1' | 'insight2' | 'composite';

export interface UnlockKey {
  key: string;                // 예: "unlock-timeline-320", "unlock-card-legendary-001"
  source: GaugeKey;
  /** 발급 시점 (ms). */
  grantedAt: number;
}

/** 도감 한 항목. */
export interface CodexEntry {
  /** 항목 식별자 (cardId / relicId / npcId / eventId 등). */
  id: string;
  /** 종류. */
  kind: 'card' | 'relic' | 'npc' | 'event' | 'boss' | 'timeline';
  /** 처음 발견된 시점 (ms). */
  discoveredAt: number;
  /** 사용/만남 횟수. */
  encounterCount: number;
}

/** 영구 저장되는 메타 진행 상태. */
export interface MetaProgress {
  /** 5게이지. */
  gauges: {
    /** ① 캐릭터 시그니처(=히페리온 미션 5단계 클리어 누적). */
    hyperion1: MetaGauge;
    /** ② NPC 친밀도 누적 깊이. */
    hyperion2: MetaGauge;
    /** ① 시대 미션 클리어 (퀘스트). */
    insight1: MetaGauge;
    /** ② 보스 클리어 / 전투 성과. */
    insight2: MetaGauge;
    /** 종합 — 위 4개의 함수 (합/평균/곱; 구현 시점에 결정). */
    composite: MetaGauge;
  };

  /** 해금된 콘텐츠 토큰들. */
  unlockedKeys: UnlockKey[];

  /** 해금된 종족/연표/카드 id 목록 (UI 빠른 조회용). 구 unlockedCharacterIds. */
  unlockedRaceIds: RaceId[];
  unlockedTimelineIds: TimelineId[];
  unlockedCardIds: CardId[];

  /** 도감 (휘발 재화의 영구 기록). */
  codex: CodexEntry[];

  /** 영혼 자원 (소프트 메타 자원). */
  soulResource: number;

  /** 절차적 변형 입력 — 이전 런 결과 누적. */
  procInputs: Record<string, unknown>;

  /** 게임 시작 횟수. */
  totalRuns: number;
  /** 보스 클리어 횟수. */
  totalBossClears: number;
}

/** 기본 초기 메타 진행. (createMetaProgress 같은 팩토리는 stores에서 제공) */
export const EMPTY_META_GAUGE: MetaGauge = {
  current: 0,
  max: 100,
  unlockThresholds: [0.25, 0.5, 0.75, 1.0],
};
