/**
 * 시간의 신 모노 (Mono) — 외부 프레임의 *영구 권능자*.
 *
 * spec v2 Round 9: 모노는 메타 진행의 매개자. 그의 *세계 간섭 강도*가
 * 5게이지의 단일 척도. 간섭이 강해질수록 더 많은 시간대·캐릭터·유물이 풀린다.
 *
 * 이 모듈은 *코드 객체*가 아니라 *서사적 컨텍스트와 메타 게이트 함수*를 모은다.
 */

import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';

export const MONO_TITLE = '시간의 신 모노';
export const MONO_VOICE = '시간';

/** 모노의 현재 간섭 강도 (0.0 ~ 1.0). composite 게이지 비율. */
export function getInterferenceStrength(): number {
  const meta = useMetaStore();
  return meta.compositeRatio;
}

/** 모노가 *그 콘텐츠*를 허용했는가? — 해금 토큰 검사. */
export function isUnlocked(unlockKey: string | undefined): boolean {
  if (!unlockKey) return true; // 잠금 조건 없음 = 항상 허용
  // r4: debugFlag unlockAll — 모든 콘텐츠 허용.
  if (useUiStore().debug.unlockAll) return true;
  const meta = useMetaStore();
  return meta.unlockedKeys.some((k) => k.key === unlockKey);
}

/** 모노가 *그 종족*을 허용했는가? */
export function canSelectRace(raceId: string): boolean {
  if (useUiStore().debug.unlockAll) return true;
  const meta = useMetaStore();
  return meta.unlockedRaceIds.includes(raceId) || meta.unlockedRaceIds.length === 0;
  // 첫 플레이 시 기본 종족은 허용
}

/** 모노가 *그 연표*를 허용했는가? */
export function canEnterTimeline(timelineId: string): boolean {
  if (useUiStore().debug.unlockAll) return true;
  const meta = useMetaStore();
  // 기본 연표는 항상 허용 (unlockedTimelineIds가 비어 있어도)
  if (meta.unlockedTimelineIds.length === 0) return true;
  return meta.unlockedTimelineIds.includes(timelineId);
}
