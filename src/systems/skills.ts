/**
 * 동료 액티브 스킬 — 쿨다운 + 슬롯 (Item 37-② Stage A).
 *
 * 설계(인터뷰 확정 2026-05-25):
 *  - 쿨다운 기반: 스킬마다 고유 쿨다운(플레이어 턴 수). 전투 중 버튼으로 *아무때나* 발동(쿨다운 0).
 *  - 매 전투 시작 시 초기화(0 = 준비됨). combat.ts startCombat가 [0,0,0]으로 셋.
 *  - 매 플레이어 턴 시작 -1. combat.ts finishEnemyTurn에서 처리.
 *  - 슬롯 1(activeSlots[0])의 스킬은 사용 시 쿨다운 -1(편성 순서가 전략).
 *  - 효과 실행은 카드 효과 핸들러 재사용(combat.executeSkillEffects).
 *
 * 이 모듈은 *쿨다운/슬롯 회계*만 담당. 효과 실행은 combat.ts가 한다(중복 구현 금지).
 */

import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { companionForEntry } from '@/systems/companion';
import { executeSkillEffects } from '@/systems/combat';
import type { CompanionSkill, RosterEntry } from '@/data/schemas';

/** 활성 슬롯(0..2)에 편성된 *skill 타입* 동료 한 칸의 스킬 + 표시 정보. */
export interface ActiveSkillSlot {
  /** 슬롯 인덱스 (0=슬롯1, 쿨다운 -1 적용 대상). */
  slot: number;
  /** 동료 이름(버튼 보조 표시). */
  companionName: string;
  skill: CompanionSkill;
  /** 현재 남은 쿨다운(0=사용 가능). */
  cooldown: number;
  /** 사용 가능 여부(전투 중 · 쿨다운 0 · 정지 아님). */
  ready: boolean;
}

/** RosterEntry → 동료 표시 이름. npc 정의에서 가져옴. */
function entryName(slotEntry: RosterEntry | null): string {
  if (!slotEntry) return '';
  const data = useDataStore();
  if (slotEntry.src === 'npc') return data.npcs.get(slotEntry.id)?.name ?? slotEntry.id;
  return slotEntry.id;
}

/**
 * 현재 전투에서 사용 가능한 *스킬 슬롯 목록* (skill 타입 동료가 편성된 칸만, 최대 3).
 * 빈 칸/passive/card 타입 슬롯은 제외. 슬롯 인덱스(순서)는 보존된다.
 */
export function activeSkillSlots(): ActiveSkillSlot[] {
  const run = useRunStore();
  const c = run.data.combat;
  const slots = run.data.activeSlots ?? [];
  const cooldowns = c?.skillCooldowns ?? [0, 0, 0];
  const out: ActiveSkillSlot[] = [];
  for (let i = 0; i < slots.length; i++) {
    const comp = companionForEntry(slots[i]);
    if (comp?.kind !== 'skill' || !comp.skill) continue;
    const cd = cooldowns[i] ?? 0;
    const ready = !!c && cd <= 0 && !c.frozenTurn;
    out.push({
      slot: i,
      companionName: entryName(slots[i]),
      skill: comp.skill,
      cooldown: cd,
      ready,
    });
  }
  return out;
}

/** 그 슬롯의 스킬을 *지금 쓸 수 있는가* — 전투 중 · 쿨다운 0 · 정지 아님. */
export function canUseSkill(slot: number): boolean {
  const run = useRunStore();
  const c = run.data.combat;
  if (!c || c.frozenTurn) return false;
  const comp = companionForEntry((run.data.activeSlots ?? [])[slot]);
  if (comp?.kind !== 'skill' || !comp.skill) return false;
  const cd = (c.skillCooldowns ?? [])[slot] ?? 0;
  return cd <= 0;
}

/**
 * 그 슬롯의 스킬 발동 — 효과 실행(카드 핸들러 재사용) + 쿨다운 set.
 * 쿨다운 = cooldown - (slot===0 ? 1 : 0)(최소 1, 즉시 재사용 불가).
 * 반환: { used, enemyDefeated }. used=false면 발동 실패(쿨다운/정지 등).
 */
export function useSkill(slot: number): { used: boolean; enemyDefeated: boolean } {
  const run = useRunStore();
  const ui = useUiStore();
  const c = run.data.combat;
  if (!c) return { used: false, enemyDefeated: false };
  const comp = companionForEntry((run.data.activeSlots ?? [])[slot]);
  if (comp?.kind !== 'skill' || !comp.skill) return { used: false, enemyDefeated: false };
  if (c.frozenTurn) {
    ui.toast('warning', '몸이 굳어 스킬을 쓸 수 없다.');
    return { used: false, enemyDefeated: false };
  }
  const cooldowns = c.skillCooldowns ?? [0, 0, 0];
  if ((cooldowns[slot] ?? 0) > 0) {
    ui.toast('warning', '아직 쿨다운 중이다.');
    return { used: false, enemyDefeated: false };
  }

  const skill = comp.skill;
  const result = executeSkillEffects(skill);

  // 쿨다운 set — 슬롯1(인덱스 0)이면 -1(최소 1, 같은 턴 즉시 재사용은 막는다).
  const reduction = slot === 0 ? 1 : 0;
  const next = [...cooldowns];
  while (next.length < (run.data.activeSlots?.length ?? 3)) next.push(0);
  next[slot] = Math.max(1, skill.cooldown - reduction);
  c.skillCooldowns = next;

  ui.toast('success', `${skill.name} 발동`);
  return { used: true, enemyDefeated: result.enemyDefeated };
}
