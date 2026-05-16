/**
 * 덱 시스템.
 *
 * spec v2 Round 11: 30장 고정 → *10→20→30 점진 확장*, *교체식 정제*.
 *  - shuffle, drawCard, discardCard, swapCard, expandSize
 *  - 시스템은 *순수 함수*로 구현 (스토어는 결과를 받아 적용)
 */

import type { Card } from '@/data/schemas';
import { rng } from './rng';

/**
 * 카드 *정의*에서 *인스턴스*를 생성. 동명 카드 사본도 별개로 식별.
 *
 * `instanceId` 명명 규칙: `{cardId}#{6자 랜덤}` — 시드 PRNG 기반이므로
 * 같은 런·같은 시점에서 같은 instanceId. 저장·복원도 결정론.
 */
let instanceSeq = 0;
export function instantiateCard(card: Card): Card {
  instanceSeq += 1;
  const rand = rng().toString(36).slice(2, 8);
  return { ...card, instanceId: `${card.id}#${rand}-${instanceSeq.toString(36)}` };
}

/** 표준 Fisher-Yates 셔플. 새 배열 반환. 시드 PRNG 기반 → 같은 시드면 같은 순서. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 카드 풀에서 카운트만큼 드로우. drawPile 부족 시 discardPile을 셔플해 보충. */
export interface DrawResult {
  drawn: Card[];
  newDrawPile: Card[];
  newDiscardPile: Card[];
}

export function drawCards(
  drawPile: readonly Card[],
  discardPile: readonly Card[],
  count: number,
): DrawResult {
  const drawn: Card[] = [];
  let draw = [...drawPile];
  let discard = [...discardPile];

  for (let i = 0; i < count; i++) {
    if (draw.length === 0) {
      if (discard.length === 0) break; // 더 뽑을 카드 없음
      draw = shuffle(discard);
      discard = [];
    }
    const card = draw.shift();
    if (card) drawn.push(card);
  }
  return { drawn, newDrawPile: draw, newDiscardPile: discard };
}

/** 카드 한 장 디스카드. */
export function discard(hand: readonly Card[], cardIndex: number, discardPile: readonly Card[]): {
  newHand: Card[];
  newDiscardPile: Card[];
} {
  if (cardIndex < 0 || cardIndex >= hand.length) {
    return { newHand: [...hand], newDiscardPile: [...discardPile] };
  }
  const newHand = [...hand];
  const [removed] = newHand.splice(cardIndex, 1);
  return { newHand, newDiscardPile: [...discardPile, removed] };
}

/** 핸드 전체 디스카드 (턴 종료 시). */
export function discardHand(hand: readonly Card[], discardPile: readonly Card[]): Card[] {
  return [...discardPile, ...hand];
}

/**
 * 교체식 정제: 새 카드 획득 시 *덱의 어느 슬롯*과 교체.
 * deckSize를 초과하지 않도록.
 */
export function swapCard(
  deck: readonly Card[],
  slotIndex: number,
  newCard: Card,
): Card[] {
  if (slotIndex < 0 || slotIndex >= deck.length) {
    return [...deck, newCard]; // 슬롯 비어 있으면 그냥 추가
  }
  const result = [...deck];
  result[slotIndex] = newCard;
  return result;
}

/**
 * 덱이 deckSize에 도달했으면 true.
 *
 * Round3 ⚠2: 리터럴 유니언 `10 | 20 | 30`을 `number`로 완화.
 * 종족별 deckSize(인간=15 등)가 임의값이라 리터럴 제약은 과도했음.
 * 옛 `expandDeckSize(10|20|30)`은 호출자 0건이라 함께 삭제.
 */
export function isDeckFull(deck: readonly Card[], deckSize: number): boolean {
  return deck.length >= deckSize;
}
