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

import type { CardId, RaceId, RelicId, TimelineId } from './base';

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

/**
 * 런 한 판의 영구 기록 (v5) — 기록(로그) 페이지 + 세이브 코드에 동반.
 * id 위주 슬림 저장(이름은 표시 시 데이터에서 조회, 폴백 id). 위치 라벨만 문자열로 박제(맵 데이터 휘발 대비).
 * append-only 확장 전제 — 새 필드는 모두 optional로 더한다.
 */
export interface RunSummary {
  /** 종료 시각 (ms). 최신순 정렬·표시용. */
  endedAt: number;
  timelineId: string;
  raceId: string;
  endReason: 'time-up' | 'free-end' | 'hp-zero' | 'boss-cleared' | 'boss-defeated';
  /** 종료 위치 노드 라벨 (맵 조회 실패 시 생략). */
  endNodeLabel?: string;
  /** 종료 위치 권역명 (맵 조회 실패 시 생략). */
  endRegionName?: string;
  /** currentDay. */
  days: number;
  /** visitedNodes.length. */
  turns: number;
  /** 도달 distinct 권역 수. */
  regions: number;
  /** combatCleared 노드 수. */
  combats: number;
  /** bossesCleared (보스 id 목록). */
  bossIds: string[];
  chaosScore: number;
  /** activeChaos 사본. */
  chaos: { id: string; intensity: number }[];
  /** 클리어 + 점수>0 + 연표 최고 기록 갱신. */
  newRecord: boolean;
  /** roster 사본 (영입 동료). */
  companions: { id: string; src: 'npc' | 'monster' }[];
  relicIds: string[];
  /** collection을 id별 그룹(같은 카드 ×N 묶음). */
  cards: { id: string; count: number }[];
  gold: number;
  hp: number;
  maxHp: number;
  /** absorb 표시값 3종 (재계산 불가하므로 저장). */
  hyperionGain: number;
  researchGain: number;
  soulGain: number;
}

/** 런 기록 보관 상한 — 세이브 코드 용량 통제 (최신 N건만 유지). */
export const RUN_HISTORY_LIMIT = 30;

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
  /** 해금된 유물 id 목록 (메타 투자 결과 — A단계는 데이터 구조만, B단계에서 풀 필터링). */
  unlockedRelicIds: RelicId[];

  /** 구매 완료한 메타 해금 항목 id (중복 구매 방지). */
  purchasedUnlocks: string[];

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

  // === 카오스 도전-점수 시스템 (Phase A, 세이브 v3) ===
  /** 영혼으로 영구 구매한 카오스 id 목록. 기본 []. */
  unlockedChaosIds: string[];
  /** 상점에 진열되는 최고 티어 (1~4). T(n) 카오스 켜고 클리어 시 +1. 기본 1. */
  chaosTierRevealed: number;
  /** 연표(timeline)별 최고 카오스 도전 점수. 기본 {}. */
  bestChaosScore: Record<string, number>;

  /**
   * NPC 친밀도 — *영속 메타* (Item 37-② Stage C, 1B). npcId → 누적 친밀도(0..10 클램프).
   * 친밀도는 더 이상 런 종료 시 흡수되지 않고, 대화할 때마다 *직접 여기에 누적*된다(cross-run).
   * lore/도감 전용 — 게임플레이 보상은 격하됨(친밀도 임계는 codex/lore 등록만).
   * 옛 세이브엔 없을 수 있음 → 로드 시 {}로 backfill.
   */
  npcAffinity?: Record<string, number>;

  /**
   * 런 한 판의 영구 기록 목록 (v5) — 최신이 [0]. 최근 RUN_HISTORY_LIMIT건만 유지.
   * 옛 세이브엔 없을 수 있음 → 로드 시 []로 backfill. 세이브 코드에 통째 동반.
   */
  runHistory?: RunSummary[];

  /**
   * 메타 세이브 버전. v3=카오스, v4=NPC 친밀도 영속(1B), v5=런 기록. 마이그레이션 판단·기록용.
   * 옛 세이브엔 없을 수 있음(undefined ⇒ v3 이하로 간주, 누락 필드 backfill).
   */
  saveVersion?: number;
}

/** NPC 친밀도 영속 상한 (Item 37-② Stage C, 1B). */
export const MAX_NPC_AFFINITY = 10;

/** 현재 메타 세이브 버전 — v3=카오스, v4=NPC 친밀도 영속(1B), v5=런 기록. */
export const META_SAVE_VERSION = 5;

/** 기본 초기 메타 진행. (createMetaProgress 같은 팩토리는 stores에서 제공) */
export const EMPTY_META_GAUGE: MetaGauge = {
  current: 0,
  max: 100,
  unlockThresholds: [0.25, 0.5, 0.75, 1.0],
};
