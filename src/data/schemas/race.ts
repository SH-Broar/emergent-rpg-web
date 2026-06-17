/**
 * 종족 스키마.
 *
 * 종족은 캐릭터의 *시드 정체성*과 *기본 카드 풀*을 정의한다.
 * 31종족 중 일부만 MVR에서 활성화.
 */

import type { CardId, Element, NamedEntity, RaceId, RelicId } from './base';
import type { ColorValues } from './npc';
import type { MoveProfile } from './move-profile';

export interface Race extends NamedEntity {
  id: RaceId;

  /** 종족 분류 (UI 그룹화용). 예: "human" | "beastkin" | "flight" | "dragon-divine" | "plant" | "construct" */
  category: string;

  /** 종족 고유 원소 친화 (있으면 시작 컬러에 +0.2 등). */
  primaryElement?: Element;
  secondaryElement?: Element;

  /**
   * 종족 기본 스탯 — 이전엔 character가 가졌으나 characters/ 폐기 후 race로 통합.
   * 시작 HP/MP는 baseStats.hp/mp + startHpBonus/startMpBonus.
   */
  baseStats: {
    hp: number;
    mp: number;
    attack: number;
    defense: number;
    vigor: number;
  };

  /**
   * 시작 덱 (시드 정체성 카드) — 이전엔 character.startingDeck.
   * deckSize 미달 시 seedCardIds에서 가중 랜덤으로 채움.
   */
  startingDeck: CardId[];

  /** 시작 30장 풀의 *기본 등급* 카드 — 종족이 시작 덱 부족분을 여기서 추첨/선택. */
  seedCardIds: CardId[];

  /** 종족 시작 시 부여되는 *기본 등급* 유물 (있을 수도 없을 수도). */
  seedRelicIds?: RelicId[];

  /**
   * 종족 시작 시 지급되는 회복/소비 아이템 id (있을 수도 없을 수도).
   * 전 종족 공통 시작 아이템에 *더해* 지급된다(나방·아르카나 초반 회복 보완).
   */
  seedItemIds?: string[];

  /** 시작 HP/MP 기본값 보정. */
  startHpBonus?: number;
  startMpBonus?: number;

  /**
   * 최대 목숨 보정 (Item 28) — 기본 2에 이 값만큼 더해 시작. 미설정/0이면 기본 2.
   * 종족이 *런별 강화*로 목숨을 더 들고 가는 경우(예: 끈질긴 종족).
   */
  maxLivesBonus?: number;

  /**
   * 종족 고정 덱 슬롯 크기 — 이 종족 캐릭터가 이 *덱 크기*로 시작.
   * 없으면 RunStore 기본 (10).
   * 인간 = 15.
   */
  deckSize?: number;

  /**
   * 종족 시작 컬러 시드 — 한 컬러당 *최대 5* 권장 (사용자 사양).
   * 시작 시 RunState.colors에 *더해진다* (덮어쓰기 아님).
   * 컬러 상한 100. 종족의 *원소 친화*가 시작값으로 표현되는 위치.
   */
  seedColors?: Partial<ColorValues>;

  /**
   * 격자 전투 이동 프로필 — 종족의 행마법(클래스 정체성, C절).
   * 하코=룩 / 리무=나이트 / 화이트팡=composite(비숍∪직교1) / 샤유아=manhattan.
   * 미설정 시 인간 룩(HUMAN_MOVE_PROFILE) 폴백. range는 moveUpgrades + 바람색 moveBonus로 가산.
   * 데이터: move_pattern / move_range / compose("bishop orthogonal1") / move_offsets(custom).
   */
  moveProfile?: MoveProfile;
}
