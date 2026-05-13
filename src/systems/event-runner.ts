/**
 * 이벤트 노드 처리.
 *
 * spec v2: 이벤트 = 본문 + 선택지 + 효과.
 * 선택지 효과: hp/gold/카드/유물/관계/후속 이벤트 트리거.
 */

import type { Event, EventChoice, EventChoiceEffect } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';

/**
 * 이벤트 풀에서 트리거 조건이 맞는 이벤트를 가중치 추첨.
 * MVR: 단순 랜덤. 트리거 필터는 *나중 확장*.
 */
export function pickEvent(pool: readonly Event[]): Event | undefined {
  if (pool.length === 0) return undefined;
  const totalWeight = pool.reduce((sum, e) => sum + (e.trigger.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  for (const e of pool) {
    r -= e.trigger.weight ?? 1;
    if (r <= 0) return e;
  }
  return pool[pool.length - 1];
}

/**
 * 선택지가 사용 가능한가? (조건 검사 — MVR에서는 매우 단순)
 */
export function isChoiceAvailable(choice: EventChoice): boolean {
  if (!choice.condition) return true;
  // 향후: 조건 표현식 파서. MVR에서는 모두 사용 가능.
  return true;
}

/** 선택지 선택 — 효과 적용 + 결과 텍스트 반환. */
export function selectChoice(choice: EventChoice): string {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;

  const resultParts: string[] = [];

  for (const effect of choice.effects) {
    applyEffect(effect, resultParts);
    if (effect.resultText) resultParts.push(effect.resultText);
  }

  // 토스트 알림
  if (resultParts.length > 0) {
    ui.toast('info', resultParts[0]);
  }
  void r; // run state는 applyEffect 내부에서 직접 변경

  return resultParts.join('\n');
}

function applyEffect(effect: EventChoiceEffect, resultParts: string[]) {
  const run = useRunStore();
  const r = run.data;

  if (effect.hpDelta !== undefined) {
    r.hp = Math.max(0, Math.min(r.maxHp, r.hp + effect.hpDelta));
    resultParts.push(effect.hpDelta >= 0 ? `HP +${effect.hpDelta}` : `HP ${effect.hpDelta}`);
  }
  if (effect.goldDelta !== undefined) {
    r.gold = Math.max(0, r.gold + effect.goldDelta);
    resultParts.push(effect.goldDelta >= 0 ? `골드 +${effect.goldDelta}` : `골드 ${effect.goldDelta}`);
  }
  if (effect.affinityDelta) {
    const a = effect.affinityDelta;
    r.npcAffinity[a.npcId] = (r.npcAffinity[a.npcId] ?? 0) + a.delta;
    resultParts.push(`${a.npcId} 친밀도 ${a.delta >= 0 ? '+' : ''}${a.delta}`);
  }
  // 카드/유물 grant는 *지금 단계에서는 단순* — 실제 인스턴스 추가는 콘텐츠 로드 시점에 처리
  if (effect.grantCardId) {
    resultParts.push(`카드 획득: ${effect.grantCardId}`);
    // TODO: 카드 풀에서 찾아 r.deck에 swap UI 띄우기 (Phase 2e)
  }
  if (effect.grantRelicId) {
    resultParts.push(`유물 획득: ${effect.grantRelicId}`);
    // TODO: r.relics에 추가
  }
  // customEffectId는 핸들러 레지스트리 (Phase 2e)
}
