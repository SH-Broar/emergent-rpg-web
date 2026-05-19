/**
 * 메타 진행 변환 시스템.
 *
 * spec v2 Round 11:
 *  - 런 종료 시 휘발 재화는 도감에 등록
 *  - 히페리온 미션 진행도 → 모노 히페리온 게이지 (게이지 ①)
 *  - NPC 친밀도 누적 → 모노 히페리온 게이지 (게이지 ②)
 *  - 시대 미션 클리어 → 모노 해석 게이지 (게이지 ①)
 *  - 보스 클리어 → 모노 해석 게이지 (게이지 ②)
 */

import type { RunState } from '@/data/schemas';
import { useMetaStore } from '@/stores/meta';
import { useCodexStore } from '@/stores/codex';
import { useUiStore } from '@/stores/ui';

/**
 * 런 종료를 메타에 반영. 게이지 갱신 + 도감 등록 + 영혼 자원 + 토스트.
 * 반환: 발급된 콘텐츠 해금 토큰 목록.
 */
export function absorbRunIntoMeta(run: RunState) {
  const meta = useMetaStore();
  const codex = useCodexStore();
  const ui = useUiStore();

  // 히페리온 미션 클리어 단계 수 (true 카운트)
  // r4: 5단계 미션 시스템 제거로 hyperionProgress는 optional. 옛 세이브 잔존만 카운트, 새 런은 항상 0.
  const hyperionStageClears = Object.values(run.hyperionProgress ?? {}).filter(Boolean).length;

  // NPC 친밀도 누적 (모든 NPC의 affinity 합)
  const npcAffinityGain = Object.values(run.npcAffinity).reduce((a, b) => a + b, 0);

  // 시대 미션 / 보스 클리어 카운트
  const missionsCleared = run.missionsCleared.length;
  const bossesCleared = run.bossesCleared.length;

  // 게이지 변환 (이미 meta.ts의 absorbRunResult가 처리)
  const granted = meta.absorbRunResult({
    hyperionStageClears,
    npcAffinityGain,
    missionsCleared,
    bossesCleared,
  });

  // 도감 등록 (휘발 재화 → 영구 기록)
  codex.absorbRunEncounters({
    cards: run.newCardEncounters,
    relics: run.newRelicEncounters,
    npcs: run.newNpcEncounters,
    bosses: run.bossesCleared,
  });

  // 영혼 자원 — 보스 클리어 시 큰 보너스, 그 외 소량
  const soulGain = bossesCleared * 5 + hyperionStageClears + Math.floor(npcAffinityGain / 10);
  meta.addSoul(soulGain);

  // UI 알림
  if (granted.length > 0) {
    ui.toast('success', `${granted.length}개의 해금이 풀렸습니다.`);
  }
  if (soulGain > 0) {
    ui.toast('info', `영혼 ${soulGain} 획득`);
  }

  return { granted, soulGain };
}
