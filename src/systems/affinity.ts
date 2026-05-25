/**
 * NPC 친밀도 변동 + 임계 lore/도감 등록 (Item 37-② Stage C, 1B — 격하판).
 *
 * 변경 (2026-05-26, 1B):
 *  - 친밀도는 *영속 메타*(meta.npcAffinity)에 직접 누적된다(cross-run, 0..10 클램프).
 *    런 종료 흡수가 아니라 *대화할 때마다* 바로 메타에 쌓인다.
 *  - run.npcAffinity는 *그 런의 working mirror* — 조건 DSL(`affinity:`)·UI 표시·게이지 입력 호환용.
 *    영속값(meta)으로 동기화한다.
 *  - affinityRewards의 *게임플레이 보상(카드/유물/컬러/특산물/재료/자동 HP·골드·조각)은 제거*.
 *    이제 임계 통과는 **lore/도감(codex npc) 등록 + 안내 라인(hint)** 만 한다.
 *    게이지(hyperion2) 연동은 유지 가능하나 affinity 자체는 lore 시스템으로 남는다.
 *
 * 중복 발사 방지: run.data.affinityRewardsClaimed[npcId]에 발사된 임계 기록(런 단위).
 */

import type { AffinityReward } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { useCodexStore } from '@/stores/codex';
import { josa } from '@/systems/labels';

export function applyAffinityDelta(
  npcId: string,
  delta: number,
  lines?: string[],
): number {
  const run = useRunStore();
  const meta = useMetaStore();
  const r = run.data;
  if (!r.affinityRewardsClaimed) r.affinityRewardsClaimed = {};

  // 영속 메타에 직접 누적(0..10 클램프) — cross-run 보존.
  const newVal = meta.addNpcAffinity(npcId, delta);
  // 런 working mirror 동기화 — DSL(affinity:)·UI·게이지 입력 호환.
  r.npcAffinity[npcId] = newVal;

  if (delta <= 0) return 0;

  const data = useDataStore();
  const npc = data.npcs.get(npcId);
  if (!npc?.affinityRewards) return 0;

  const claimed = r.affinityRewardsClaimed[npcId] ?? (r.affinityRewardsClaimed[npcId] = []);
  let fired = 0;
  for (const reward of npc.affinityRewards) {
    if (newVal < reward.threshold) continue;
    if (claimed.includes(reward.threshold)) continue;
    fireAffinityReward(npc.id, npc.name, reward, lines);
    claimed.push(reward.threshold);
    fired++;
  }
  return fired;
}

/**
 * 친밀도 임계 보상 — *lore/도감 격하판*. 게임플레이 보상(카드/유물/컬러/자원)은 더 이상 주지 않는다.
 *  - codex에 NPC를 등록(처음이면 발견, 이후 만남 횟수 +1) — *흔적이 쌓이는* 도감 표현.
 *  - hint(안내 라인)가 있으면 표시.
 */
function fireAffinityReward(npcId: string, npcName: string, reward: AffinityReward, lines?: string[]): void {
  const codex = useCodexStore();

  // 도감(lore) 등록 — 친밀도 깊이가 새 단계에 닿을 때마다 NPC 흔적을 기록.
  codex.register('npc', npcId);

  if (reward.hint) {
    lines?.push(`${npcName}: ${reward.hint}`);
  } else {
    lines?.push(`${npcName}${josa(npcName, '과', '와')} 한층 가까워졌다 (도감에 새겨졌다).`);
  }
}
