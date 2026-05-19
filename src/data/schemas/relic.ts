/**
 * 유물 스키마.
 *
 * 카드와 동일한 4등급 + 효과 시스템(하이브리드).
 * 유물은 *지속 효과* 위주이므로 trigger는 항상 'persistent'에 가까움.
 */

import type { NamedEntity, Rank, RelicId } from './base';

export type RelicSource =
  | 'race'        // 종족 시작 유물
  | 'character'   // 캐릭터 시작 유물
  | 'event'       // 이벤트 보상
  | 'elite'       // 엘리트 노드 보상
  | 'boss'        // 보스 클리어 보상
  | 'shop'        // 상점 구매
  | 'meta';       // 메타 진행 해금

/** 유물 효과 트리거. */
export type RelicTriggerKind =
  | 'passive'                  // 항상 활성
  | 'on-combat-start'
  | 'on-combat-end'
  | 'on-node-enter'
  | 'on-card-play'             // legacy alias → on-card-played-after
  | 'on-card-played-before'    // 카드 사용 직전 (효과 적용 전)
  | 'on-card-played-after'     // 카드 사용 직후 (효과 적용 후, discard 전)
  | 'on-turn-start'            // 플레이어 턴 시작
  | 'on-turn-end'              // 플레이어 턴 종료 (몬스터 행동 전)
  | 'on-damage-taken'          // 플레이어 피해 입을 때 (본 라운드 발동 미구현)
  | 'on-block-gain'            // 플레이어 block 획득 시 (본 라운드 발동 미구현)
  | 'on-rest';

/** 유물 효과 — 카드 효과보다 풍부 (전역 변경자). */
export interface RelicEffect {
  kind: string;          // 'modify-damage' | 'modify-block' | 'extra-draw' | 'discount' | ...
  value?: number;
  params?: Record<string, unknown>;
}

export interface Relic extends NamedEntity {
  id: RelicId;
  rank: Rank;
  source: RelicSource;
  trigger: RelicTriggerKind;

  effects: RelicEffect[];

  /** 특수 유물은 함수 슬롯. */
  customEffectId?: string;

  flavor?: string;
}
