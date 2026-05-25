/**
 * 변신 폼 카드 풀 — *변신 중에만* 보상/상점/공방 풀을 폼 카드로 역전(Item 37-③ 여우).
 *
 * 평소(미변신) 규칙: source=form 카드는 어떤 풀에도 등장하지 않는다(unlocks.availableCards가 제외).
 * 변신 중 규칙: 그 폼에 귀속된 form 카드만 풀에 등장한다(일반 풀은 *대신* 폼 풀로 대체).
 *   → 변신 상태로 진행하며 폼 덱을 빌드. 원복하면 다시 일반 풀(form 제외).
 *
 * 여우 폼 식별: id 접두 c-fox-* + 해제 카드(c-release-change, 원복 보장 항상 포함).
 * 다른 폼이 추가되면 FORM_CARD_PREFIX 맵에 접두를 등록한다(누락 시 해제 카드만 노출되는 안전 폴백).
 *
 * 강화판(-plus)은 풀에서 제외(공방 강화로만) — 일반 풀과 동일 정책.
 */

import type { Card } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';

/** 모든 폼 공용 해제 카드 — 변신 풀에 항상 포함(원복 선택지 보장). */
export const RELEASE_CARD_ID = 'c-release-change';

/** 폼 race id → 그 폼에 귀속된 form 카드 id 접두. */
const FORM_CARD_PREFIX: Record<string, string> = {
  'race-form-fox': 'c-fox-',
};

/** 지금 변신 중이고 폼 풀 전환 대상인 폼 race id (아니면 undefined). */
export function activeFormRaceId(): string | undefined {
  const t = useRunStore().data.transform;
  if (!t) return undefined;
  return FORM_CARD_PREFIX[t.formRaceId] ? t.formRaceId : undefined;
}

/** 지금 변신 중(폼 풀 전환 대상)인가. */
export function isFormPoolActive(): boolean {
  return activeFormRaceId() !== undefined;
}

/**
 * 변신 중 폼 카드 풀 — 그 폼 접두의 form 카드(-plus 제외) + 해제 카드.
 * 변신 중이 아니거나 미등록 폼이면 빈 배열(호출자는 일반 풀을 쓴다).
 */
export function activeFormCardPool(): Card[] {
  const formRaceId = activeFormRaceId();
  if (!formRaceId) return [];
  const prefix = FORM_CARD_PREFIX[formRaceId];
  const data = useDataStore();
  const pool: Card[] = [];
  for (const c of data.cards.values()) {
    if (c.source !== 'form') continue;
    if (c.id.endsWith('-plus')) continue; // 강화판은 풀 제외(공방 강화로만).
    if (c.id.startsWith(prefix) || c.id === RELEASE_CARD_ID) pool.push(c);
  }
  return pool;
}
