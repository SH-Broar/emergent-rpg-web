/**
 * NPC 친밀도 변동 + 임계 보상 발사.
 *
 * 사용자 명확화 (2026-05-19 정정): 친밀도 시스템 *자체는 유지*.
 * 하피와 친해지면 *당연히 선물을 받아야* 한다 — 임계 보상은 그대로 작동.
 *
 * *변경된 것*: 이벤트 trigger.condition / choice.condition은 affinity 기반을 *지양*.
 * chain 이벤트는 has-clue로 대체. 친밀도는 *순수 보상 시스템*으로 남음.
 *
 * 임계(1, 3, 5 등) 통과 시 NPC.affinityRewards 발사:
 *   - rewardCardId → collection 추가
 *   - rewardRelicId → 유물 보유 + newRelicEncounters
 *   - gaugeBoost → meta.hyperion2 게이지(UI "연구") 즉시 누적
 *   - colorBoost → 런 내 컬러 부스트
 *   - grantSpecialtyRegionId → 권역 특산물 1개
 *   - grantRareMaterial → 희소 재료 1개 (i-time-answer)
 *   - + 자동 부가 (친밀도 깊이 비례 HP·골드·시간조각)
 *
 * 중복 발사 방지: run.data.affinityRewardsClaimed[npcId]에 발사된 임계 기록.
 * 친밀도가 감소 후 다시 올라도 *같은 임계는 한 런에 한 번*만.
 */

import type { AffinityReward } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { acquireRelic } from './relic';

export function applyAffinityDelta(
  npcId: string,
  delta: number,
  lines?: string[],
): number {
  const run = useRunStore();
  const r = run.data;
  if (!r.affinityRewardsClaimed) r.affinityRewardsClaimed = {};

  const oldVal = r.npcAffinity[npcId] ?? 0;
  const newVal = oldVal + delta;
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
    fireAffinityReward(npc.name, reward, lines);
    claimed.push(reward.threshold);
    fired++;
  }
  return fired;
}

function fireAffinityReward(npcName: string, reward: AffinityReward, lines?: string[]): void {
  const run = useRunStore();
  const data = useDataStore();
  const meta = useMetaStore();
  const r = run.data;

  if (reward.rewardCardId) {
    const card = data.cards.get(reward.rewardCardId);
    if (card) {
      run.addCardToCollection(card);
      lines?.push(`${npcName} ${reward.threshold}단계 — 카드 '${card.name}' 획득`);
    }
  }
  if (reward.rewardRelicId) {
    const relic = data.relics.get(reward.rewardRelicId);
    if (relic) {
      acquireRelic(relic); // 중앙 진입점 — on-acquire/passive 즉시 발동 포함.
      lines?.push(`${npcName} ${reward.threshold}단계 — 유물 '${relic.name}' 획득`);
    }
  }
  if (reward.gaugeBoost && reward.gaugeBoost > 0) {
    meta.addToGauge('hyperion2', reward.gaugeBoost);
    lines?.push(`${npcName} ${reward.threshold}단계 — 연구 +${reward.gaugeBoost}`);
  }
  if (reward.colorBoost) {
    void import('@/systems/colors').then(({ applyColorBoost }) => {
      applyColorBoost(
        reward.colorBoost!.color as Parameters<typeof applyColorBoost>[0],
        reward.colorBoost!.value,
      );
    });
    lines?.push(`${npcName} ${reward.threshold}단계 — ${reward.colorBoost.color} +${reward.colorBoost.value}`);
  }
  if (reward.grantSpecialtyRegionId) {
    for (const map of data.nodeMaps.values()) {
      const region = map.regions.find((rg) => rg.id === reward.grantSpecialtyRegionId);
      if (!region?.specialtyItemId) continue;
      const itm = data.items.get(region.specialtyItemId);
      if (itm) {
        run.addItem(itm);
        lines?.push(`${npcName} ${reward.threshold}단계 — 특산물 '${itm.name}'`);
      }
      break;
    }
  }
  if (reward.grantRareMaterial) {
    const rare = data.items.get('i-time-answer');
    if (rare) {
      run.addItem(rare);
      lines?.push(`${npcName} ${reward.threshold}단계 — *희소 재료* '${rare.name}'`);
    }
  }
  if (reward.hint) {
    lines?.push(`${npcName} — ${reward.hint}`);
  }

  // 자동 부가 보상 — 친밀도 깊이 비례.
  const bonusHp = reward.threshold * 2;
  const bonusGold = reward.threshold * 3;
  r.hp = Math.min(r.maxHp, r.hp + bonusHp);
  r.gold += bonusGold;
  const parts = [`HP +${bonusHp}`, `골드 +${bonusGold}`];
  if (reward.threshold >= 3) {
    r.timeShards += 1;
    parts.push('시간의 조각 +1');
  }
  if (reward.threshold >= 5) {
    r.timeShards += 1;
    parts.push('시간의 조각 +1 (5단계 깊이)');
  }
  lines?.push(`(${npcName}과의 깊이 — ${parts.join(', ')})`);
}
