/**
 * 캐릭터 스키마 — 플레이어가 깃들 NPC.
 *
 * 자동 매핑 (spec v2):
 *   히페리온 1~2단계: 스펙 +5 + 일반 카드
 *   히페리온 3~4단계: 스펙 +5 + 희귀 카드
 *   히페리온   5단계: 스펙 +5 + 전설 시그니처 카드 + 보스 양상 변형
 */

import type {
  CardId,
  CharacterId,
  NamedEntity,
  NpcId,
  RaceId,
  RelicId,
} from './base';

/** 히페리온 한 단계의 보상 (자동 매핑된 카드 + 스펙 + 시그니처 양상). */
export interface HyperionStage {
  /** 1~5 */
  stage: 1 | 2 | 3 | 4 | 5;

  /** 단계 완료 조건 (예: "kill_5_enemies" | "befriend_3_npcs"). */
  requirement: string;

  /** 스펙 보너스 — 자동 매핑상 +5 표준. */
  statBoost: {
    hp?: number;
    mp?: number;
    attack?: number;
    defense?: number;
    vigor?: number;
  };

  /** 단계별 카드 보상 (자동 매핑). */
  rewardCardId?: CardId;

  /** 단계별 유물 보상 (선택). */
  rewardRelicId?: RelicId;

  /** 5단계만: 보스전에서 활성화되는 시그니처 양상 식별자. */
  bossSignatureId?: string;
}

export interface Character extends NamedEntity {
  id: CharacterId;
  raceId: RaceId;

  /** 이 캐릭터의 본래 NPC 정의 (RDC 세계관 인물). */
  baseNpcId?: NpcId;

  /** 기본 스탯. */
  baseStats: {
    hp: number;
    mp: number;
    attack: number;
    defense: number;
    vigor: number;
  };

  /** 시작 덱 (10장 시드 — 종족 풀 + 캐릭터 정체성 카드). */
  startingDeck: CardId[];

  /** 5단계 히페리온 미션. 캐릭터별 고정 보상. */
  hyperion: [HyperionStage, HyperionStage, HyperionStage, HyperionStage, HyperionStage];

  /** 잠금 해제 조건 (메타 게이지 임계). */
  unlockRequirement?: string;

  /** 캐릭터 플레이버. 메인 메뉴 카드 그리드 표시용. */
  portrait?: string;
  tagline?: string;
}
