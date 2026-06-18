/**
 * 보스 스키마.
 *
 * spec v2: 보스 = 연표별 종말 위협 + 단일 공식 구조 + 캐릭터별 시그니처 양상.
 *  - "공식 구조 1개"는 모든 보스 공유 — 매우 단순한 데이터 (HP, intent 패턴, 약점)
 *  - "연표별 변형"은 보스 ID 다르게
 *  - "캐릭터별 양상"은 signatureVariants[i].signatureId로 직접 매칭 (구 hyperion[4].bossSignatureId 제거됨)
 */

import type { BossId, NamedEntity } from './base';
import type { Companion } from './npc';
import type { GridAttack } from './monster';
import type { MoveProfile } from './move-profile';

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

  // === 격자 전투(grid-combat) 페이즈 전용 — 전부 optional. 미설정 시 보스 기본값/엔진 폴백. ===
  /**
   * 이 페이즈에서 쓰는 격자 공격(시그니처 무브) 목록. 보스 HP%가 이 페이즈에 들어서면
   * 격자 엔진이 보스 전투원의 attacks를 *이 세트로 교체*한다(거동 전환). 미설정이면 직전 세트 유지.
   * 로더가 phase 섹션의 `grid_attack_N` 키들로부터 합성한다.
   */
  gridBehavior?: GridAttack[];
  /**
   * 이 페이즈 진입 시 *1회* 소환할 미니언 — 몬스터 id 목록(같은 수만큼 빈 칸에 출현).
   * 로더가 phase 섹션 `spawn_minions = mr-X, mr-Y`로부터 합성. 미설정/빈 배열이면 소환 없음.
   */
  spawnMinions?: string[];
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

  /**
   * 보스 분류 (작업 29).
   *  - 'boss' (기본): 연표 종말 위협. 승리 = 런 종료 + 메타 보상. 3페이즈 권장.
   *  - 'arc' : 런 도중 만나는 지성체(강 엘리트 승격). 승리 = 맵 복귀 + 전용 특전 자동 드롭(런 지속).
   *            JRPG식 대화 회피 가능. 2페이즈 권장. 같은 BossView·페이즈·기믹 인프라 공유.
   * 미지정이면 'boss' (옛 데이터 호환).
   */
  kind?: 'arc' | 'boss';

  /** 어느 연표의 종말 위협? (arc 보스는 lore상 소속 연표 — 라우팅엔 미사용.) */
  timelineId: string;

  /** 기본 스탯. */
  hp: number;
  attack: number;
  defense: number;

  /** 다단계 패턴. 비어 있으면 단일 페이즈로 모든 intent 사용. */
  phases: BossPhase[];

  // === 격자 전투(grid-combat) 보스 전용 — 전부 optional. 미설정 시 엔진 폴백. ===
  /**
   * 격자 이동 프로필(행마법). 미설정 시 근접 추격(orthogonal1) 폴백.
   * 보스는 보통 느리고 묵직하게 움직이거나(king range1) 제자리(공격 사거리가 넓음).
   * 로더가 `move_pattern`/`move_range`로부터 합성.
   */
  gridMoveProfile?: MoveProfile;
  /**
   * 고정(스크립트형) AI 플래그. 보스 시그니처 무브는 *읽히는 텔레그래프*가 중요하므로 기본 true 권장
   * (게임트리 lookahead 대신 페이즈 grid_attack 순서대로 그리디 로테이션). 미설정 시 true(보스는 스크립트형).
   * 로더가 `fixed_ai`로부터(보스는 명시 false가 아니면 true).
   */
  gridFixedAi?: boolean;

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

  // === arc 보스 전용 (kind='arc') — 일반 보스에선 미사용. ===
  /**
   * 대화 회피(JRPG식) intro 대사 — 캐릭터 성격별 분위기 몇 줄.
   * 비어 있으면 introText 한 줄만 보인다.
   */
  dialogue?: string[];
  /** "실력을 시험한다" 버튼 라벨 (전투 진입). 미지정 시 기본 라벨. */
  challengeLabel?: string;
  /** "다음에" 버튼 라벨 (회피 — 전투 없이 맵 복귀, 보상 0, 재진입 가능). 미지정 시 기본 라벨. */
  declineLabel?: string;

  /**
   * arc 전용 특전 보상 — 승리 시 *자동 드롭*. 일반 풀에 등장하지 않는 전용 콘텐츠 권장.
   *  - relicIds : 유물 ID들 (acquireRelic).
   *  - cardIds  : 카드 ID들 (collection 추가).
   *  - itemIds  : 아이템 ID들 (인벤토리 추가).
   *  - gold     : 추가 골드 (미지정 시 0).
   */
  arcReward?: {
    relicIds?: string[];
    cardIds?: string[];
    itemIds?: string[];
    gold?: number;
  };

  /**
   * 통합 동료 정의 (Item 37-② Stage B) — passive/skill/card 택1. NPC와 동일 타입 재사용.
   * arc 보스(kind='arc')는 승리 시 *맵 복귀*라 동료화가 가능하다. 이 정의가 있으면 onVictory가
   * roster에 {id, src:'monster'} 로 추가(중복 스킵)한다. 일반 보스(kind='boss')는 승리=런 종료라 보통 미설정.
   * 로더가 `companion_*` 필드(NPC/몬스터와 동일 키)로부터 합성한다.
   */
  companion?: Companion;
}
