/**
 * 종족 스키마.
 *
 * 종족은 캐릭터의 *시드 정체성*과 *기본 카드 풀*을 정의한다.
 * 31종족 중 일부만 MVR에서 활성화.
 */

import type { CardId, Element, NamedEntity, RaceId, RelicId } from './base';
import type { ColorValues } from './npc';

export interface Race extends NamedEntity {
  id: RaceId;

  /** 종족 분류 (UI 그룹화용). 예: "human" | "beastkin" | "flight" | "dragon-divine" | "plant" | "construct" */
  category: string;

  /** 종족 고유 원소 친화 (있으면 시작 컬러에 +0.2 등). */
  primaryElement?: Element;
  secondaryElement?: Element;

  /** 시작 30장 풀의 *기본 등급* 카드 — 캐릭터가 시작 10장 부여 시 여기서 추첨/선택. */
  seedCardIds: CardId[];

  /** 종족 시작 시 부여되는 *기본 등급* 유물 (있을 수도 없을 수도). */
  seedRelicIds?: RelicId[];

  /** 시작 HP/MP 기본값 보정. */
  startHpBonus?: number;
  startMpBonus?: number;

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
}
