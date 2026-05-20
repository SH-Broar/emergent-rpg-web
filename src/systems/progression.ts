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
 *
 * 중복 가드: `run.metaAbsorbed`가 true면 meta/codex/soul *적용을 건너뛰고*
 * 표시용 값(hyperionGain/researchGain/soulGain/granted)만 계산해 반환.
 * RunEndView가 새로고침·재마운트되어도 게이지가 한 번 이상 부풀지 않는다.
 * 최초 적용 시 `run.metaAbsorbed = true`로 마킹.
 *
 * 반환:
 *  - granted: 이번 호출에서 발급된 콘텐츠 해금 토큰 (이미 흡수된 런은 [])
 *  - soulGain: 이 런이 외부로 가져간 영혼 (표시값)
 *  - hyperionGain: 외부 획득 히페리온 (보스단계*10 + NPC친밀도합)
 *  - researchGain: 외부 획득 연구 (미션*10 + 보스*25)
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

  // === 표시용 외부 획득 값 (적용 여부와 무관하게 항상 계산) ===
  // 히페리온(외부 획득) = 보스단계*10 + NPC친밀도합 (게이지 hyperion1 + hyperion2 입력 합)
  const hyperionGain = hyperionStageClears * 10 + npcAffinityGain;
  // 연구(외부 획득) = 미션*10 + 보스*25 (게이지 insight1 + insight2 입력 합)
  const researchGain = missionsCleared * 10 + bossesCleared * 25;
  // 영혼 — 보스 클리어 시 큰 보너스, 그 외 소량 (기존 공식 유지)
  const soulGain = bossesCleared * 5 + hyperionStageClears + Math.floor(npcAffinityGain / 10);

  // 이미 흡수된 런이면 *적용 없이* 표시값만 반환 — 재마운트/새로고침 중복 방지.
  if (run.metaAbsorbed) {
    return { granted: [], soulGain, hyperionGain, researchGain };
  }
  run.metaAbsorbed = true;

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

  meta.addSoul(soulGain);

  // UI 알림
  if (granted.length > 0) {
    ui.toast('success', `${granted.length}개의 해금이 풀렸습니다.`);
  }
  if (soulGain > 0) {
    ui.toast('info', `영혼 ${soulGain} 획득`);
  }

  return { granted, soulGain, hyperionGain, researchGain };
}
