// skill-combat.ts — 스킬 전투 시스템
// 실시간 자동 공격 전투에서 스킬을 인터럽트로 사용하는 시스템

import { SkillDef, SkillType, getSkillDef, getSkillLevelMultiplier, getSkillCostReduction, checkSkillLevelUp, SKILL_MAX_LEVEL } from '../models/skill';
import { Actor } from '../models/actor';
import { CombatState } from '../models/dungeon';

export interface ActiveBuff {
  type: string;
  multiplier: number;
  turnsLeft: number;
}

export interface ActiveDebuff {
  type: string;
  value: number;
  turnsLeft: number;
}

export interface CombatSkillState {
  slots: (SkillDef | null)[];          // 3개 스킬 슬롯
  usesThisCombat: Map<string, number>; // 전투 당 스킬 사용 횟수 추적
  activeBuffs: ActiveBuff[];
  activeDebuffs: ActiveDebuff[];
  preDelayTurns: number;               // >0이면 스킬 발동 대기 중
  postDelayTurns: number;              // >0이면 행동 불가
  pendingSkill: SkillDef | null;       // pre-delay 중 대기 스킬
}

export function createCombatSkillState(): CombatSkillState {
  return {
    slots: [null, null, null],
    usesThisCombat: new Map(),
    activeBuffs: [],
    activeDebuffs: [],
    preDelayTurns: 0,
    postDelayTurns: 0,
    pendingSkill: null,
  };
}

// actor.skillOrder에서 appear rate를 이용해 3개 슬롯 롤
export function rollInitialSkills(actor: Actor): CombatSkillState {
  const state = createCombatSkillState();
  const filled: SkillDef[] = [];
  const learnedSkills = actor.learnedSkills;
  const skillOrder = actor.skillOrder;

  // 1차 패스
  for (const skillId of skillOrder) {
    if (filled.length >= 3) break;
    const skill = getSkillDef(skillId);
    if (!skill) continue;
    const level = learnedSkills.get(skillId) ?? 1;
    const adjustedRate = skill.appearRate + (level - 1) * 0.05;
    if (Math.random() < adjustedRate) {
      filled.push(skill);
    }
  }

  // 2차 패스: 아직 3개 미만이면 나머지 스킬로 재시도
  if (filled.length < 3) {
    const filledIds = new Set(filled.map(s => s.id));
    for (const skillId of skillOrder) {
      if (filled.length >= 3) break;
      if (filledIds.has(skillId)) continue;
      const skill = getSkillDef(skillId);
      if (!skill) continue;
      const level = learnedSkills.get(skillId) ?? 1;
      const adjustedRate = skill.appearRate + (level - 1) * 0.05;
      if (Math.random() < adjustedRate) {
        filled.push(skill);
        filledIds.add(skillId);
      }
    }
  }

  // 슬롯 채우기 (부족하면 null 유지)
  for (let i = 0; i < 3; i++) {
    state.slots[i] = filled[i] ?? null;
  }

  return state;
}

// 단일 슬롯 재롤 (사용한 스킬 교체)
export function rerollSlot(slotIndex: number, actor: Actor, state: CombatSkillState): void {
  const currentSkillIds = new Set(
    state.slots
      .filter((s, i) => s !== null && i !== slotIndex)
      .map(s => s!.id)
  );
  const learnedSkills = actor.learnedSkills;
  const skillOrder = actor.skillOrder;

  for (const skillId of skillOrder) {
    if (currentSkillIds.has(skillId)) continue;
    const skill = getSkillDef(skillId);
    if (!skill) continue;
    const level = learnedSkills.get(skillId) ?? 1;
    const adjustedRate = skill.appearRate + (level - 1) * 0.05;
    if (Math.random() < adjustedRate) {
      state.slots[slotIndex] = skill;
      return;
    }
  }

  // 롤 실패 시 null (빈 슬롯)
  state.slots[slotIndex] = null;
}

// 스킬 사용 가능 여부 체크
export function canUseSkill(
  skill: SkillDef,
  actor: Actor,
  state: CombatSkillState,
): { ok: boolean; reason?: string } {
  if (state.postDelayTurns > 0) {
    return { ok: false, reason: '행동 불가 상태입니다.' };
  }
  if (state.preDelayTurns > 0) {
    return { ok: false, reason: '다른 스킬 준비 중입니다.' };
  }
  if (actor.base.mp < skill.mpCost) {
    return { ok: false, reason: `MP 부족 (필요: ${skill.mpCost}, 현재: ${actor.base.mp})` };
  }
  if (skill.tpCost > 0 && !actor.hasAp(skill.tpCost)) {
    return { ok: false, reason: `TP 부족 (필요: ${skill.tpCost})` };
  }
  if (skill.hpCost > 0 && actor.base.hp <= skill.hpCost) {
    return { ok: false, reason: `HP 부족 (필요: ${skill.hpCost + 1} 이상)` };
  }
  if (skill.maxUsesPerCombat !== -1) {
    const uses = state.usesThisCombat.get(skill.id) ?? 0;
    if (uses >= skill.maxUsesPerCombat) {
      return { ok: false, reason: `이번 전투에서 최대 사용 횟수 초과 (${skill.maxUsesPerCombat}회)` };
    }
  }
  return { ok: true };
}

// 스킬 효과 즉시 적용 (내부 헬퍼)
function applySkillEffect(
  skill: SkillDef,
  actor: Actor,
  combatState: CombatState,
  skillState: CombatSkillState,
): string[] {
  const messages: string[] = [];
  const e = skill.effect;
  const level = actor.learnedSkills.get(skill.id) ?? 1;
  const levelMult = getSkillLevelMultiplier(level);

  switch (skill.type) {
    case SkillType.Attack: {
      const baseAtk = actor.getEffectiveAttack();
      const buffedAtk = getBuffedAttack(baseAtk, skillState);
      let dmg = 0;
      if (e.damageMultiplier !== undefined) {
        dmg += Math.round(buffedAtk * e.damageMultiplier * levelMult);
      }
      if (e.flatDamage !== undefined) {
        dmg += Math.round(e.flatDamage * levelMult);
      }
      const finalDmg = Math.max(1, dmg - Math.floor(combatState.currentEnemy.defense * 0.5));
      combatState.enemyHp -= finalDmg;
      combatState.combatLog.push(`${skill.name}: ${combatState.currentEnemy.name}에게 ${finalDmg} 데미지!`);
      messages.push(`${skill.name}: ${combatState.currentEnemy.name}에게 ${finalDmg} 데미지!`);
      break;
    }

    case SkillType.Defense: {
      const duration = e.buffDuration ?? 1;
      const mult = e.defenseMultiplier ?? 1.0;
      skillState.activeBuffs.push({ type: 'defense', multiplier: mult, turnsLeft: duration });
      messages.push(`${skill.name}: 방어력 ${mult}배 (${duration}턴)`);
      break;
    }

    case SkillType.Buff: {
      if (e.healHp !== undefined && e.healHp > 0) {
        const healAmt = Math.round(e.healHp * levelMult);
        actor.adjustHp(healAmt);
        messages.push(`${skill.name}: HP ${healAmt} 회복`);
      }
      if (e.healMp !== undefined && e.healMp > 0) {
        const mpAmt = Math.round(e.healMp * levelMult);
        actor.adjustMp(mpAmt);
        messages.push(`${skill.name}: MP ${mpAmt} 회복`);
      }
      if (e.attackMultiplier !== undefined) {
        const duration = e.buffDuration ?? 1;
        skillState.activeBuffs.push({ type: 'attack', multiplier: e.attackMultiplier, turnsLeft: duration });
        messages.push(`${skill.name}: 공격력 ${e.attackMultiplier}배 (${duration}턴)`);
      }
      // TP 계열에서 MP 회복으로 전환된 스킬 폴백 처리
      if (skill.id === 'vigor_up' || (e.healHp === 0 && e.healMp === undefined && e.attackMultiplier === undefined && !e.healHp)) {
        if (skill.id.includes('vigor') || skill.id === 'vigor_up') {
          const vigorAmt = Math.round(15 * levelMult);
          actor.adjustMp(vigorAmt);
          messages.push(`${skill.name}: MP ${vigorAmt} 회복`);
        }
      }
      break;
    }

    case SkillType.Debuff: {
      if (e.debuffType !== undefined) {
        const duration = e.debuffDuration ?? 1;
        const value = e.debuffValue ?? 0;
        skillState.activeDebuffs.push({ type: e.debuffType, value, turnsLeft: duration });
        switch (e.debuffType) {
          case 'poison':
            messages.push(`${skill.name}: 독 적용 (${value} 데미지/${duration}턴)`);
            break;
          case 'weaken':
            messages.push(`${skill.name}: 약화 적용 (공격력 ${value}배/${duration}턴)`);
            break;
          case 'slow':
            messages.push(`${skill.name}: 둔화 적용 (후딜 +${value}/${duration}턴)`);
            break;
        }
      }
      break;
    }
  }

  return messages;
}

// 스킬 사용 — 전투 로그 메시지 반환
export function useSkill(
  slotIndex: number,
  actor: Actor,
  combatState: CombatState,
  skillState: CombatSkillState,
): string[] {
  const skill = skillState.slots[slotIndex];
  if (!skill) return ['스킬 슬롯이 비어 있습니다.'];

  const check = canUseSkill(skill, actor, skillState);
  if (!check.ok) return [check.reason ?? '스킬 사용 불가'];

  // 자원 소모 (레벨별 코스트 감소 적용)
  const skillLevel = actor.learnedSkills.get(skill.id) ?? 1;
  const costMult = getSkillCostReduction(skillLevel);
  actor.adjustMp(-Math.ceil(skill.mpCost * costMult));
  if (skill.hpCost > 0) actor.adjustHp(-skill.hpCost);

  // 사용 횟수 증가
  skillState.usesThisCombat.set(skill.id, (skillState.usesThisCombat.get(skill.id) ?? 0) + 1);
  const newUsage = (actor.skillUsage.get(skill.id) ?? 0) + 1;
  actor.skillUsage.set(skill.id, newUsage);

  let messages: string[];

  if (skill.preDelay > 0) {
    // 발동 전 대기
    skillState.pendingSkill = skill;
    skillState.preDelayTurns = skill.preDelay;
    messages = [`${skill.name} 준비 중...`];
  } else {
    // 즉시 발동
    messages = applySkillEffect(skill, actor, combatState, skillState);
    skillState.postDelayTurns = skill.postDelay;
  }

  // 스킬 레벨업 체크
  if (checkSkillLevelUp(skill.id, skillLevel, newUsage) && skillLevel < SKILL_MAX_LEVEL) {
    actor.learnedSkills.set(skill.id, skillLevel + 1);
    messages.push(`${skill.name} 숙련도 상승! Lv.${skillLevel + 1}`);
  }

  // 슬롯 재롤
  rerollSlot(slotIndex, actor, skillState);

  return messages;
}

// pre-delay 중인 스킬 발동 처리 (턴 시작 시 호출)
export function tickPreDelay(
  actor: Actor,
  combatState: CombatState,
  skillState: CombatSkillState,
): string[] {
  const messages: string[] = [];

  if (skillState.preDelayTurns > 0) {
    skillState.preDelayTurns--;
    if (skillState.preDelayTurns === 0 && skillState.pendingSkill) {
      const skill = skillState.pendingSkill;
      skillState.pendingSkill = null;
      const effectMessages = applySkillEffect(skill, actor, combatState, skillState);
      messages.push(...effectMessages);
      skillState.postDelayTurns = skill.postDelay;
    }
  } else if (skillState.postDelayTurns > 0) {
    skillState.postDelayTurns--;
  }

  return messages;
}

// 턴 종료 시 버프/디버프 지속시간 감소 및 독 데미지 처리
export function tickEffects(
  skillState: CombatSkillState,
  combatState?: CombatState,
): string[] {
  const messages: string[] = [];

  // 독 데미지 처리 (만료 전 적용)
  for (const debuff of skillState.activeDebuffs) {
    if (debuff.type === 'poison' && combatState) {
      combatState.enemyHp -= debuff.value;
      messages.push(`독: ${combatState.currentEnemy.name}에게 ${debuff.value} 데미지`);
    }
    debuff.turnsLeft--;
  }

  // 만료된 버프 제거 및 지속시간 감소
  const newBuffs: ActiveBuff[] = [];
  for (const buff of skillState.activeBuffs) {
    buff.turnsLeft--;
    if (buff.turnsLeft <= 0) {
      messages.push(`${buff.type === 'attack' ? '공격력' : '방어력'} 버프 종료`);
    } else {
      newBuffs.push(buff);
    }
  }
  skillState.activeBuffs = newBuffs;

  // 만료된 디버프 제거
  const newDebuffs: ActiveDebuff[] = [];
  for (const debuff of skillState.activeDebuffs) {
    if (debuff.turnsLeft <= 0) {
      messages.push(`${debuff.type} 디버프 종료`);
    } else {
      newDebuffs.push(debuff);
    }
  }
  skillState.activeDebuffs = newDebuffs;

  return messages;
}

// 활성 버프를 반영한 공격력 계산
export function getBuffedAttack(base: number, state: CombatSkillState): number {
  let mult = 1.0;
  for (const buff of state.activeBuffs) {
    if (buff.type === 'attack') mult *= buff.multiplier;
  }
  return Math.round(base * mult);
}

// 활성 버프를 반영한 방어력 계산
export function getBuffedDefense(base: number, state: CombatSkillState): number {
  let mult = 1.0;
  for (const buff of state.activeBuffs) {
    if (buff.type === 'defense') mult *= buff.multiplier;
  }
  return Math.round(base * mult);
}

// 적의 공격력 수정 계수 (weaken 디버프 반영)
export function getEnemyAttackMod(state: CombatSkillState): number {
  let mod = 1.0;
  for (const debuff of state.activeDebuffs) {
    if (debuff.type === 'weaken') mod *= debuff.value;
  }
  return mod;
}
