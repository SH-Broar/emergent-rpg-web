/**
 * 히페리온 자동 트리거 시스템.
 *
 * spec v2: 캐릭터마다 5단계 미션 — 단계 클리어 시 스펙 +5 + 카드 보상.
 *
 * requirement 평가 가능한 *표준 형식*:
 *   node_visits:N           — 방문 노드 수 N 이상
 *   combat_clears:N         — 클리어한 전투 수 N 이상
 *   boss_clear              — 보스 클리어
 *   affinity:<npc-id>:N     — 특정 NPC 친밀도 N 이상
 *   missions:N              — 시대 미션 클리어 N건
 *
 * 그 외 자유 텍스트는 *수동 트리거* (이벤트/카드 효과에서 직접 호출).
 */

import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import type { Character, HyperionStage, RunState } from '@/data/schemas';

/** 한 단계의 requirement가 현재 run state에서 만족되는가? */
function evaluateRequirement(req: string, run: RunState): boolean {
  const parts = req.split(':');
  const kind = parts[0];

  switch (kind) {
    case 'node_visits': {
      const n = Number(parts[1]) || 0;
      return run.visitedNodes.length >= n;
    }
    case 'combat_clears': {
      const n = Number(parts[1]) || 0;
      const cleared = Object.values(run.nodeStates).filter((s) => s.combatCleared).length;
      return cleared >= n;
    }
    case 'boss_clear':
      return run.bossesCleared.length > 0;
    case 'affinity': {
      const npcId = parts[1] ?? '';
      const n = Number(parts[2]) || 0;
      return (run.npcAffinity[npcId] ?? 0) >= n;
    }
    case 'missions': {
      const n = Number(parts[1]) || 0;
      return run.missionsCleared.length >= n;
    }
    default:
      // 자유 텍스트 — 자동 평가 불가. *수동 트리거* 대상.
      return false;
  }
}

/** 단계 클리어 처리 — 스펙/카드 보상 적용 + 토스트. */
function clearStage(character: Character, stage: HyperionStage) {
  const run = useRunStore();
  const data = useDataStore();
  const ui = useUiStore();
  const r = run.data;

  // 진행도 마킹
  r.hyperionProgress[stage.stage] = true;

  // 스펙 보너스
  const b = stage.statBoost;
  if (b.hp) {
    r.maxHp += b.hp;
    r.hp = Math.min(r.maxHp, r.hp + b.hp);
  }
  if (b.mp) {
    r.maxMp += b.mp;
    r.mp = Math.min(r.maxMp, r.mp + b.mp);
  }
  // attack / defense / vigor는 *캐릭터 스탯에 직접 누적되는 코드는 없음*. 추후 운영.

  // 카드 보상 — 컬렉션에 추가, 덱 슬롯 등록은 사용자가 덱 편집에서.
  let cardName: string | null = null;
  if (stage.rewardCardId) {
    const card = data.cards.get(stage.rewardCardId);
    if (card) {
      run.addCardToCollection(card);
      cardName = `${card.name} (컬렉션)`;
    }
  }

  // 유물 보상
  if (stage.rewardRelicId) {
    const relic = data.relics.get(stage.rewardRelicId);
    if (relic) {
      r.relics.push(relic);
      if (!r.newRelicEncounters.includes(relic.id)) {
        r.newRelicEncounters.push(relic.id);
      }
    }
  }

  void character;

  const parts = [`히페리온 ${stage.stage}단계`];
  if (b.hp) parts.push(`HP +${b.hp}`);
  if (b.attack) parts.push(`공격 +${b.attack}`);
  if (b.defense) parts.push(`방어 +${b.defense}`);
  if (cardName) parts.push(`카드: ${cardName}`);
  ui.toast('success', parts.join(' · '), 4500);
}

/**
 * 모든 미클리어 단계의 requirement를 평가. 만족한 단계 클리어 적용.
 * 게임 흐름의 *주요 이벤트* (노드 진입, 전투 클리어, 보스 클리어) 후에 호출.
 */
export function evaluateHyperion() {
  const run = useRunStore();
  const data = useDataStore();
  const character = data.characters.get(run.data.characterId);
  if (!character) return;

  for (const stage of character.hyperion) {
    if (run.data.hyperionProgress[stage.stage]) continue;
    if (!stage.requirement) continue;
    if (evaluateRequirement(stage.requirement, run.data)) {
      clearStage(character, stage);
    }
  }
}

/**
 * 수동 트리거 — 자유 텍스트 requirement에 대응. 이벤트/카드 효과가 호출.
 * 예: 특정 NPC와 깊은 대화 → trackManualClear(characterId, 3).
 */
export function clearStageManually(stageNumber: 1 | 2 | 3 | 4 | 5) {
  const run = useRunStore();
  const data = useDataStore();
  const character = data.characters.get(run.data.characterId);
  if (!character) return;
  if (run.data.hyperionProgress[stageNumber]) return;
  const stage = character.hyperion.find((s) => s.stage === stageNumber);
  if (stage) clearStage(character, stage);
}
