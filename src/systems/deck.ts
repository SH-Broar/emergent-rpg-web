/**
 * 덱 시스템.
 *
 * spec v2 Round 11: 30장 고정 → *10→20→30 점진 확장*, *교체식 정제*.
 *  - shuffle, drawCard, discardCard, swapCard, expandSize
 *  - 시스템은 *순수 함수*로 구현 (스토어는 결과를 받아 적용)
 */

import type { Card } from '@/data/schemas';

/**
 * 카드 *정의*에서 *인스턴스*를 생성. 동명 카드 사본도 별개로 식별.
 *
 * `instanceId` 명명 규칙: `{cardId}#{6자 랜덤}` — UI 디버그/로그에서 정의를 한눈에.
 * 충돌 가능성은 36^6 ≈ 22억 분의 1 — 한 런에서 사실상 무시.
 */
let instanceSeq = 0;
export function instantiateCard(card: Card): Card {
  instanceSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return { ...card, instanceId: `${card.id}#${rand}-${instanceSeq.toString(36)}` };
}

/** 표준 Fisher-Yates 셔플. 새 배열 반환. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
 * 덱 크기 점진 확장: 10 → 20 → 30.
 * 확장 시 빈 슬롯이 늘어남 (실제 카드는 차근차근 채워짐).
 */
export function expandDeckSize(current: 10 | 20 | 30): 10 | 20 | 30 {
  if (current === 10) return 20;
  if (current === 20) return 30;
  return 30;
}

/** 덱이 30장이고 더 채울 슬롯이 없으면 true. */
export function isDeckFull(deck: readonly Card[], deckSize: 10 | 20 | 30): boolean {
  return deck.length >= deckSize;
}
