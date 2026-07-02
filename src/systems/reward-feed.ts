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

// === 보상 배치(2026-07-02) — 승리/수확 등 여러 보상을 한 패널로 모으는 버퍼. ===
// batchActive면 reward* 호출이 토스트 대신 이 버퍼에 라인을 쌓는다. begin → (reward* …) → end/collect로 감싼다.
let batchActive = false;
let batchLines: string[] = [];

function toast(line: string): void {
  if (batchActive) { batchLines.push(line); return; }
  useUiStore().toast('success', line);
}

/** 보상 배치 시작 — 이후 reward* 호출은 토스트 대신 버퍼에 라인을 쌓는다(중첩 미지원, 마지막 begin이 이김). */
export function beginRewardBatch(): void {
  batchActive = true;
  batchLines = [];
}

/**
 * 보상 배치 종료 + 공용 RewardPanel(오버레이) 표시 — 수집 라인이 있으면 ui 큐에 넣는다.
 * 수확·우편처럼 *뷰가 패널이 아닌* 곳에서 사용. 반환: 수집된 라인(참고용).
 */
export function endRewardBatch(title: string): string[] {
  const lines = batchLines;
  batchActive = false;
  batchLines = [];
  if (lines.length > 0) useUiStore().pushRewardPanel({ title, lines });
  return lines;
}

/**
 * 보상 배치 종료(오버레이 없이) — 수집 라인만 반환. 승리 화면·사건처럼 *뷰가 이미 패널*이라
 * 오버레이 대신 라인을 인라인으로 직접 표시할 때.
 */
export function collectRewardBatch(): string[] {
  const lines = batchLines;
  batchActive = false;
  batchLines = [];
  return lines;
}

/**
 * 보상 라인을 *스크롤 없이* 담도록 압축 — max줄 초과면 (max-1)줄 + "외 N건" 한 줄.
 * RewardPanel과 승리 화면 임베드 공용. 기본 max 9(초과 시 8줄 + 요약).
 */
export function compressRewardLines(lines: string[], max = 9): string[] {
  if (lines.length <= max) return lines;
  const head = lines.slice(0, max - 1);
  head.push(`외 ${lines.length - (max - 1)}건`);
  return head;
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
