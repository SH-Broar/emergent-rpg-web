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

import type { RunState, RunSummary } from '@/data/schemas';
import { useMetaStore } from '@/stores/meta';
import { useCodexStore } from '@/stores/codex';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { computeChaosScore } from '@/systems/chaos';

/** absorb가 산정한 외부 획득 표시값 — buildRunSummary가 그대로 박제. */
interface AbsorbGains {
  hyperionGain: number;
  researchGain: number;
  soulGain: number;
}

/**
 * 런 한 판의 영구 기록(RunSummary)을 만든다 — absorb 시점에 1회 호출.
 *
 * 위치 라벨·도달 권역 수는 데이터 맵에서 계산해 박제(맵 데이터 휘발 대비). 나머지는 id 위주 슬림 저장.
 * 데이터 미로드 가능성 방어: 맵/노드 조회 실패 시 위치 필드만 생략한다.
 * newRecord는 RunEndView의 isNewRecord와 동일 의미 — 보스 클리어 경로(recordBestChaos)가 이미
 *   bestChaosScore를 갱신한 *뒤* 호출되므로, 클리어 + 점수>0 + 현재 최고 기록 이상이면 신기록.
 */
export function buildRunSummary(run: RunState, gains: AbsorbGains): RunSummary {
  const data = useDataStore();
  const meta = useMetaStore();

  const timeline = data.timelines.get(run.timelineId);
  const map = data.nodeMaps.get(timeline?.nodeMapId ?? '');

  // 종료 위치 — 노드 라벨 + 권역명 (맵/노드 조회 실패 시 생략).
  let endNodeLabel: string | undefined;
  let endRegionName: string | undefined;
  const endNode = map?.nodes.find((n) => n.id === run.currentNodeId);
  if (endNode) {
    endNodeLabel = endNode.label;
    endRegionName = map?.regions.find((rg) => rg.id === endNode.region)?.name;
  }

  // 도달 권역 — 방문 노드들이 속한 distinct 권역 수.
  let regions = 0;
  if (map) {
    const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    for (const nid of run.visitedNodes) {
      const regionId = nodeById.get(nid)?.region;
      if (regionId) seen.add(regionId);
    }
    regions = seen.size;
  }

  // 전투 클리어 수.
  const combats = Object.values(run.nodeStates).filter((s) => s.combatCleared).length;

  // 카오스 점수 — 캐시 우선, 없으면 활성 카오스로 재계산.
  const chaosScore = run.chaosScore ?? computeChaosScore(run.activeChaos ?? []);
  const wasClear = run.endReason === 'boss-cleared' || (run.bossesCleared ?? []).length > 0;
  const best = meta.bestChaosScore[run.timelineId] ?? 0;
  const newRecord = wasClear && chaosScore > 0 && chaosScore >= best;

  // 카드 — collection을 id별 그룹(같은 카드 ×N). 강화판(-plus)은 별도 id이므로 별도 묶음.
  const cardGroups = new Map<string, number>();
  for (const c of run.collection ?? []) {
    cardGroups.set(c.id, (cardGroups.get(c.id) ?? 0) + 1);
  }

  return {
    endedAt: Date.now(),
    timelineId: run.timelineId,
    raceId: run.raceId,
    endReason: (run.endReason ?? 'free-end') as RunSummary['endReason'],
    endNodeLabel,
    endRegionName,
    days: run.currentDay,
    turns: (run.visitedNodes ?? []).length,
    regions,
    combats,
    bossIds: [...(run.bossesCleared ?? [])],
    chaosScore,
    chaos: (run.activeChaos ?? []).map((a) => ({ ...a })),
    newRecord,
    companions: (run.roster ?? []).map((e) => ({ id: e.id, src: e.src })),
    relicIds: (run.relics ?? []).map((r) => r.id),
    cards: [...cardGroups.entries()].map(([id, count]) => ({ id, count })),
    gold: run.gold,
    hp: run.hp,
    maxHp: run.maxHp,
    hyperionGain: gains.hyperionGain,
    researchGain: gains.researchGain,
    soulGain: gains.soulGain,
  };
}

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

  // NPC 친밀도 — Item 37-② Stage C(1B): 친밀도는 *영속 메타*(meta.npcAffinity)로 직접 누적되며
  //   런 종료 흡수를 더 이상 하지 않는다(lore화). run.npcAffinity는 메타값의 working mirror라
  //   여기서 합산하면 *cross-run 누적분이 매 런마다 게이지에 재투입*되어 부풀므로 0으로 둔다.
  const npcAffinityGain = 0;

  // 시대 미션 / 보스 클리어 카운트 (필드 누락 방어).
  const missionsCleared = (run.missionsCleared ?? []).length;
  const bossesCleared = (run.bossesCleared ?? []).length;

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

  // 도감 등록 (휘발 재화 → 영구 기록). 옛 세이브 필드 누락 방어.
  codex.absorbRunEncounters({
    cards: run.newCardEncounters ?? [],
    relics: run.newRelicEncounters ?? [],
    npcs: run.newNpcEncounters ?? [],
    bosses: run.bossesCleared ?? [],
  });

  meta.addSoul(soulGain);

  // 런 한 판의 영구 기록 (v5) — *최초 적용 분기 안에서만* 기록(중복 방지).
  //   recordBestChaos(보스 클리어 경로)가 이미 bestChaosScore를 갱신한 뒤 호출되므로,
  //   buildRunSummary의 newRecord 비교는 RunEndView의 isNewRecord와 같은 의미를 갖는다.
  //   방어: 기록 생성이 실패해도 게이지/영혼 흡수와 표시값 반환은 막지 않는다.
  try {
    meta.recordRunSummary(buildRunSummary(run, { hyperionGain, researchGain, soulGain }));
  } catch (err) {
    console.error('[progression] buildRunSummary 실패 — 기록만 건너뜀:', err);
  }

  // UI 알림
  if (granted.length > 0) {
    ui.toast('success', `${granted.length}개의 해금이 풀렸습니다.`);
  }
  if (soulGain > 0) {
    ui.toast('info', `영혼 +${soulGain}`);
  }

  return { granted, soulGain, hyperionGain, researchGain };
}
