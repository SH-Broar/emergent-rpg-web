/**
 * 보스 스키마.
 *
 * spec v2: 보스 = 연표별 종말 위협 + 단일 공식 구조 + 캐릭터별 시그니처 양상.
 *  - "공식 구조 1개"는 모든 보스 공유 — 매우 단순한 데이터 (HP, intent 패턴, 약점)
 *  - "연표별 변형"은 보스 ID 다르게
 *  - "캐릭터별 양상"은 signatureVariants[i].signatureId로 직접 매칭 (구 hyperion[4].bossSignatureId 제거됨)
 */

import type { BossId, NamedEntity } from './base';

/** 보스의 한 행동 의도. 턴마다 하나씩 노출. */
export interface BossIntent {
  kind: 'attack' | 'defend' | 'buff' | 'debuff' | 'special';
  /** 데미지/방어 값 등 */
  value?: number;
  description: string;
}

/** 보스의 다단계 패턴. 일정 HP 이하로 떨어지면 phase 전환. */
export interface BossPhase {
  /** 이 페이즈가 시작되는 HP 비율 (1.0 = 처음, 0.5 = 절반). */
  startsAtHpRatio: number;
  intents: BossIntent[];
}

/** 시그니처 양상 변형 — 특정 캐릭터로 도전 시 보스가 다르게 행동. */
export interface BossSignatureVariant {
  signatureId: string;
  /** 양상별 보스 대화 (몰입용). */
  dialogue?: string[];
  /** intent 오버라이드 (선택). */
  intentOverrides?: BossIntent[];
}

export interface Boss extends NamedEntity {
  id: BossId;

  /** 어느 연표의 종말 위협? */
  timelineId: string;

  /** 기본 스탯. */
  hp: number;
  attack: number;
  defense: number;

  /** 다단계 패턴. 비어 있으면 단일 페이즈로 모든 intent 사용. */
  phases: BossPhase[];

  /** 캐릭터별 시그니처 양상 변형. */
  signatureVariants?: BossSignatureVariant[];

  /** 클리어 시 메타 진행 보상. */
  rewards: {
    /** 콘텐츠 해금 키 (예: "unlock-timeline-320"). */
    unlockKeys?: string[];
    /** 영혼 자원 (소프트 메타 자원). */
    soulGain?: number;
    /** 클리어한 카드/유물 도감 등록 트리거. */
    grantCodexEntries?: string[];
    /** 다음 런에 영향을 줄 절차적 변형 입력. */
    procContext?: Record<string, unknown>;
  };

  /** 보스 대화/플레이버. */
  introText?: string;
  defeatText?: string;
}
