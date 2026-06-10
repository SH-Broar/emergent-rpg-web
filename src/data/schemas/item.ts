/**
 * 아이템 — *즉시 사용*형 소비품.
 *
 * 사용자 사양 (2026-05-15):
 *   - 작게는 체력 회복부터, 크게는 텔레포트·컬러 수치 조절까지.
 *   - 카드와 달리 *덱 슬롯 X*. 별도 인벤토리. 클릭 시 즉시 효과.
 *
 * 카드처럼 인스턴스 ID 사용 — 동명 아이템 사본도 별개로 카운트.
 */

import type { Element, NamedEntity, Rank } from './base';
import type { ColorValues } from './npc';

/** 효과 종류. param 의미는 kind 별로 다름. */
export type ItemEffectKind =
  | 'heal'            // HP +value (전투 중이면 combat.player.hp + r.hp 양쪽)
  | 'gold'            // 골드 +value
  | 'time-shards'     // 시간의 조각 +value
  | 'color-boost'     // colors[param: keyof ColorValues] += value
  | 'color-all'       // 8 컬러 모두 += value
  | 'grant-card'      // param = cardId
  | 'grant-relic'     // param = relicId
  | 'teleport-village' // 임의의 village kind 노드로 즉시 이동 (맵 전용)
  | 'revive-node'      // 이미 소진한 노드(전투 정리/사건 지남/활동 완료/채집) 1곳을 되살려 재진입 가능 (맵 전용, 대상 선택)
  | 'cleanse-transform' // 변신(체인지) 정화 — 원래 종족·덱으로 복귀(변신 중이 아니면 무효)
  | 'gain-life'        // 목숨 +value(기본 1) — 상한(maxLives)까지. 맵 전용(전투 밖). (Item 28)
  | 'cleanse-group'   // 전투 중 플레이어의 디버프를 *그룹별*로 정화. param = 'low'|'mid'|'high'|'all'
                      //   low : 약화·취약·중독·점액·화상
                      //   mid : 수면·세뇌·각인·유령화·경련
                      //   high: 퇴행·마비·비용교란(cost-up)
                      //   all : 위 일반 디버프 전부
                      // 구속/삼킴/거미줄(grapple류)·빙의/혼란은 *제외*(별도 정화 경로).
  // ===== 전투 포션 전용 (Item Economy) — combat=true 아이템에서만 의미. 전투 밖 사용 시 무효. =====
  | 'combat-mana'     // 전투 중 마나 +value
  | 'combat-draw'     // 전투 중 카드 value장 드로우
  | 'combat-block'    // 전투 중 player.block += value
  | 'combat-enemy-status' // 전투 중 적에게 status(param) value 스택 부여 (vulnerable/weakness 등)
  | 'combat-self-status'  // 전투 중 자신에게 status(param) value 스택 부여 (strength 등)
  | 'combat-free-grapple'; // 전투 중 구속/삼킴 즉시 해제 (grapple=undefined + lockedCardIds 비움)

export interface ItemEffect {
  kind: ItemEffectKind;
  value?: number;
  /** kind에 따라 의미가 다른 파라미터 (color key / card id / relic id 등). */
  param?: keyof ColorValues | string;
}

/**
 * 아이템 카테고리 — 사용 패턴 구분.
 *
 *  - `consumable`: 클릭 시 즉시 효과 (HP·골드·컬러 부스트·전투 포션 등). 기본값.
 *  - `specialty`: *권역마다 다른 특산물* — 원소/플레이버 축 제작 재료. 클릭 사용 X.
 *  - `material`: *희귀도 사다리 재료* — rank로 등급 구분(common=일반/rare=희귀/legendary=전설).
 *      제작·강화 연료. i-time-answer = 전설(legendary). 'rare-material'은 옛 별칭(로더가 정규화).
 *
 * 재료 카테고리는 `effects` 비워두고 사용 시점에서 *제작 재료 비교*에 사용.
 */
export type ItemCategory = 'consumable' | 'specialty' | 'material';

/** 아이템 정의 + 런타임 인스턴스. */
export interface Item extends NamedEntity {
  id: string;
  /** 런타임 인스턴스 ID — 카드와 동일 패턴. */
  instanceId?: string;
  rank: Rank;
  /** 카테고리 — 미지정 시 'consumable'. */
  category?: ItemCategory;
  /**
   * 전투 중 사용 가능한 포션인지. true면 CombatView에서 사용(턴당 1회).
   * false/미지정이면 맵·메뉴에서만 사용. (Item Economy)
   */
  combat?: boolean;
  /** 즉시 사용 효과 — 클릭 시 순서대로 적용. 재료는 빈 배열. */
  effects: ItemEffect[];
  /** 사용 후 소모? (기본 true) */
  consumable: boolean;
  flavor?: string;
  /** 특산물의 *권역 id* — 그 권역의 채집·전투에서만 드롭 (specialty 전용). */
  regionId?: string;
  /**
   * 특산물의 *속성* — 카드 각성(공방) 재료 매칭에 사용 (XP·각성 시스템, 8종 특산물 전용).
   * 카드 element와 일치하는 특산물이 각성 재료. element 없는 카드는 아무 특산물 허용.
   * 비특산물 아이템은 미설정.
   */
  element?: Element;
}
