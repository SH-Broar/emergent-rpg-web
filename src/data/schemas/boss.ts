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
  /**
   * 원본 raw 토큰 (콜론 분리 전 전체) — 다중 토큰 인텐트(bind:4:1, debuff:2:weakness,
   * add-card-draw:c-junk-wound:1 등)를 손실 없이 combat 엔진(Monster.intents)으로 흘려보내는 진실원.
   * combat.ts는 encoded를 콜론으로 직접 파싱하므로 kind/value로 인코딩이 손상되면 안 된다.
   */
  encoded?: string;
}

/** 보스의 다단계 패턴. 일정 HP 이하로 떨어지면 phase 전환. */
export interface BossPhase {
  /** 이 페이즈가 시작되는 HP 비율 (1.0 = 처음, 0.5 = 절반). */
  startsAtHpRatio: number;
  intents: BossIntent[];
  /**
   * 페이즈 고유 기믹 — combat.ts가 해석.
   *   anchor   : 닻 — 2턴마다 손패 1장 잠금.
   *   stillness: 정지 — 누적될수록 마나 감소, 4 도달 시 한 턴 정지.
   *   rewind   : 되감기 — 적이 직전 플레이어 턴 피해의 절반을 회복하고 디버프 제거.
   * 미지정이면 일반 페이즈(기믹 없음).
   */
  mechanic?: 'anchor' | 'stillness' | 'rewind';
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
