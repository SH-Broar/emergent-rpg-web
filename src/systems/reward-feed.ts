/**
 * 보상 표시 통합 — *획득물마다 한 줄*, 분류 접두를 붙여 토스트로 띄운다(채집 방식).
 *
 * 형식 예:
 *   아이템: 약초
 *   카드: 강타
 *   유물: 모노의 토큰
 *   컬러: 빛 +5
 *   골드 +12 / 시간의 조각 +3 / 영혼 +1 / 체력 +5
 *
 * 전투/활동/채집/보스/상점/사건 등 *모든 보상*이 이 헬퍼를 거쳐 일관된 한국어로 표기된다.
 * (영어 컬러 키·raw id·별표 노출 방지.)
 */

import { useUiStore } from '@/stores/ui';
import { useRunStore } from '@/stores/run';
import type { Item } from '@/data/schemas';

function toast(line: string): void {
  useUiStore().toast('success', line);
}

/** 축복(blessing) 활성 시 보상 배율 1.25, 아니면 1. 채집/활동/전투 보상이 참조. */
export function blessingMul(): number {
  try {
    return (useRunStore().data.blessingCombats ?? 0) > 0 ? 1.25 : 1;
  } catch {
    return 1;
  }
}

/** 아이템(소비품/재료/특산물) — 카테고리에 맞는 분류 접두. */
export function rewardItem(item: Pick<Item, 'name' | 'category'>): void {
  const prefix = item.category === 'material' ? '재료' : item.category === 'specialty' ? '특산물' : '아이템';
  toast(`${prefix}: ${item.name}`);
}
/** 분류·이름만으로 직접 한 줄(아이템 객체가 없을 때). */
export function rewardItemNamed(name: string, prefix = '아이템'): void {
  toast(`${prefix}: ${name}`);
}
export function rewardCard(name: string): void { toast(`카드: ${name}`); }
export function rewardRelic(name: string): void { toast(`유물: ${name}`); }
export function rewardClue(name: string): void { toast(`단서: ${name}`); }
/**
 * 컬러 — 상승 피드백은 이제 *상단 중앙 컬러 팝*(applyColorBoost→ui.colorPop, ColorPopOverlay)으로
 * 일원화한다(item 6). 모든 호출처가 applyColorBoost 직후 호출하므로 팝이 이미 떠 있어, 여기서
 * 토스트를 또 띄우면 같은 정보가 중복된다 → 토스트 생략(no-op). 함수/시그니처는 호환을 위해 보존.
 */
export function rewardColor(_color: string, _amount: number): void {
  /* no-op: 컬러 상승은 ColorPopOverlay(상단 팝)가 담당. */
}
export function rewardGold(amount: number): void { if (amount !== 0) toast(`골드 +${amount}`); }
export function rewardShards(amount: number): void { if (amount !== 0) toast(`시간의 조각 +${amount}`); }
export function rewardSoul(amount: number): void { if (amount !== 0) toast(`영혼 +${amount}`); }
export function rewardHp(amount: number): void { if (amount !== 0) toast(`체력 +${amount}`); }
export function rewardXp(amount: number): void { if (amount > 0) toast(`경험치 +${amount}`); }
export function rewardLevelUp(levels: number): void { if (levels > 0) toast(`레벨 업! 강화권 +${levels}`); }
