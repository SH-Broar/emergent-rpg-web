// combat-engine.ts — 실시간 틱 기반 전투 엔진

import { Actor } from '../models/actor';
import { MonsterDef } from '../models/dungeon';
import { SkillDef, SkillType, getSkillDef, getSkillLevelMultiplier, getSkillCostReduction, checkSkillLevelUp, SKILL_MAX_LEVEL } from '../models/skill';
import {
  CombatSkillState, rollInitialSkills, canUseSkill, rerollSlot,
  tickPreDelay, tickEffects, getBuffedAttack, getBuffedDefense, getEnemyAttackMod,
} from './skill-combat';
import { randomFloat } from '../types/rng';
import { getActionText } from './npc-interaction';

// ============================================================
// 동료 슬롯
// ============================================================

export interface PartyStatBonus {
  hp: number; mp: number; attack: number; defense: number;
}

export interface PartyMemberSlot {
  actor: Actor;
  hyperionLevel: number;
  activeSkill: SkillDef | null;
  skillChance: number;
  statBonus: PartyStatBonus;
}

const PARTY_HYPERION_TABLE: { chance: number; bonus: PartyStatBonus }[] = [
  { chance: 0,    bonus: { hp: 0,  mp: 0,  attack: 0, defense: 0 } },  // Lv0
  { chance: 0.10, bonus: { hp: 0,  mp: 0,  attack: 0, defense: 0 } },  // Lv1
  { chance: 0.15, bonus: { hp: 0,  mp: 0,  attack: 0, defense: 0 } },  // Lv2
  { chance: 0.20, bonus: { hp: 10, mp: 0,  attack: 2, defense: 1 } },  // Lv3
  { chance: 0.25, bonus: { hp: 20, mp: 5,  attack: 4, defense: 2 } },  // Lv4
  { chance: 0.30, bonus: { hp: 30, mp: 10, attack: 6, defense: 3 } },  // Lv5
];

function getPartyHyperionData(level: number) {
  return PARTY_HYPERION_TABLE[Math.min(level, 5)] ?? PARTY_HYPERION_TABLE[0];
}

/** 동료의 전투용 슬롯 생성 */
export function createPartySlot(actor: Actor): PartyMemberSlot {
  const hl = actor.hyperionLevel;
  const data = getPartyHyperionData(hl);

  // 동료 첫 번째 공격 스킬을 activeSkill로
  let activeSkill: SkillDef | null = null;
  for (const skillId of actor.skillOrder) {
    const def = getSkillDef(skillId);
    if (def && def.type === SkillType.Attack) {
      activeSkill = def;
      break;
    }
  }
  // 공격 스킬 없으면 아무 스킬이나
  if (!activeSkill && actor.skillOrder.length > 0) {
    activeSkill = getSkillDef(actor.skillOrder[0]) ?? null;
  }

  return {
    actor,
    hyperionLevel: hl,
    activeSkill,
    skillChance: data.chance,
    statBonus: { ...data.bonus },
  };
}

/** 전체 동료 스탯 보너스 합산 */
export function calcPartyBonuses(slots: PartyMemberSlot[]): PartyStatBonus {
  const total: PartyStatBonus = { hp: 0, mp: 0, attack: 0, defense: 0 };
  for (const s of slots) {
    total.hp += s.statBonus.hp;
    total.mp += s.statBonus.mp;
    total.attack += s.statBonus.attack;
    total.defense += s.statBonus.defense;
  }
  return total;
}

// ============================================================
// 실시간 전투 상태
// ============================================================

export interface RealtimeCombatState {
  dungeonId: string;
  enemy: MonsterDef;
  enemyHp: number;
  enemyMaxHp: number;
  combatLog: string[];
  turn: number;

  playerSkills: CombatSkillState;
  partySlots: PartyMemberSlot[];
  partyBonus: PartyStatBonus;

  tickTimer: ReturnType<typeof setInterval> | null;
  paused: boolean;
  finished: boolean;
  victory: boolean;
  isBoss: boolean;
}

export const TICK_MS = 1500;

// ============================================================
// 전투 시작/종료
// ============================================================

export function createCombatState(
  player: Actor,
  enemy: MonsterDef,
  partyActors: Actor[],
  dungeonId: string,
  isBoss: boolean,
): RealtimeCombatState {
  const playerSkills = rollInitialSkills(player);
  const partySlots = partyActors.map(createPartySlot);
  const partyBonus = calcPartyBonuses(partySlots);

  // 보스 체력 1.5배
  const hp = isBoss ? Math.round(enemy.hp * 1.5) : enemy.hp;

  return {
    dungeonId,
    enemy,
    enemyHp: hp,
    enemyMaxHp: hp,
    combatLog: [`${enemy.name}${isBoss ? ' (보스)' : ''}이(가) 나타났다!`],
    turn: 0,
    playerSkills,
    partySlots,
    partyBonus,
    tickTimer: null,
    paused: false,
    finished: false,
    victory: false,
    isBoss,
  };
}

export function stopCombatTimer(state: RealtimeCombatState): void {
  if (state.tickTimer !== null) {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }
}

// ============================================================
// 전투 틱 처리
// ============================================================

export function processTick(
  state: RealtimeCombatState,
  player: Actor,
): string[] {
  if (state.finished || state.paused) return [];
  state.turn++;
  const messages: string[] = [];

  // --- 1. Pre-delay 틱 (대기 스킬 발동) ---
  const preDelayMsgs = tickPreDelay(player, {
    dungeonId: state.dungeonId, combatTurn: state.turn,
    currentEnemy: state.enemy, enemyHp: state.enemyHp, combatLog: [],
  }, state.playerSkills);
  messages.push(...preDelayMsgs);

  // --- 2. 플레이어 자동 공격 ---
  const buffedAtk = getBuffedAttack(
    player.getEffectiveAttack() + state.partyBonus.attack,
    state.playerSkills,
  );
  const enemyDef = state.enemy.defense;
  const playerDmg = Math.max(1, Math.round(buffedAtk - enemyDef * 0.5));
  state.enemyHp -= playerDmg;
  const atkTxt = getActionText(['combat.player_attack']) || '공격했다.';
  messages.push(`${player.name}의 ${atkTxt} ${playerDmg} 데미지`);

  // 승리 체크
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    const defeatTxt1 = getActionText(['combat.enemy_defeated']) || '처치했다.';
    messages.push(`${state.enemy.name}을(를) ${defeatTxt1}`);
    return messages;
  }

  // --- 3. 동료 스킬 발동 ---
  for (const slot of state.partySlots) {
    if (slot.skillChance <= 0 || !slot.activeSkill) continue;
    if (randomFloat(0, 1) < slot.skillChance) {
      const skill = slot.activeSkill;
      const companionAtk = slot.actor.getEffectiveAttack();
      const level = slot.actor.learnedSkills.get(skill.id) ?? 1;
      const mult = getSkillLevelMultiplier(level);

      if (skill.type === SkillType.Attack) {
        let dmg = 0;
        if (skill.effect.damageMultiplier !== undefined) {
          dmg += Math.round(companionAtk * skill.effect.damageMultiplier * mult);
        }
        if (skill.effect.flatDamage !== undefined) {
          dmg += Math.round(skill.effect.flatDamage * mult);
        }
        const finalDmg = Math.max(1, dmg - enemyDef * 0.5);
        state.enemyHp -= finalDmg;
        messages.push(`★ ${slot.actor.name}: ${skill.name}! ${Math.round(finalDmg)} 데미지`);
      } else if (skill.type === SkillType.Buff && skill.effect.healHp) {
        const healAmt = Math.round(skill.effect.healHp * mult);
        player.adjustHp(healAmt);
        messages.push(`★ ${slot.actor.name}: ${skill.name}! HP ${healAmt} 회복`);
      } else if (skill.type === SkillType.Defense) {
        const duration = skill.effect.buffDuration ?? 1;
        const defMult = skill.effect.defenseMultiplier ?? 2.0;
        state.playerSkills.activeBuffs.push({ type: 'defense', multiplier: defMult, turnsLeft: duration });
        messages.push(`★ ${slot.actor.name}: ${skill.name}! 방어력 ${defMult}배 (${duration}턴)`);
      }
    }
  }

  // 승리 체크 (동료 공격으로)
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    const defeatTxt2 = getActionText(['combat.enemy_defeated']) || '처치했다.';
    messages.push(`${state.enemy.name}을(를) ${defeatTxt2}`);
    return messages;
  }

  // --- 4. 적 자동 공격 ---
  const buffedDef = getBuffedDefense(
    player.getEffectiveDefense() + state.partyBonus.defense,
    state.playerSkills,
  );
  const enemyAtkMod = getEnemyAttackMod(state.playerSkills);
  const rawEnemyDmg = Math.max(0, Math.round(state.enemy.attack * enemyAtkMod - buffedDef * 0.5));
  if (rawEnemyDmg > 0) {
    player.adjustHp(-rawEnemyDmg);
    const hitTxt = getActionText(['combat.player_hit']) || '피격당했다.';
    messages.push(`${state.enemy.name}의 공격! ${hitTxt} ${rawEnemyDmg} 데미지`);
  }

  // --- 5. 적 스킬 발동 ---
  if (state.enemy.skills.length > 0 && state.enemy.skillChance > 0) {
    if (randomFloat(0, 1) < state.enemy.skillChance) {
      const skill = state.enemy.skills[Math.floor(randomFloat(0, state.enemy.skills.length))];
      if (skill.type === 'attack') {
        const skillDmg = Math.max(1, Math.round(state.enemy.attack * skill.value - buffedDef * 0.3));
        player.adjustHp(-skillDmg);
        messages.push(`${state.enemy.name}의 ${skill.name}! ${skillDmg} 데미지`);
      } else if (skill.type === 'heal') {
        const healAmt = Math.round(skill.value);
        state.enemyHp = Math.min(state.enemyMaxHp, state.enemyHp + healAmt);
        messages.push(`${state.enemy.name}의 ${skill.name}! HP ${healAmt} 회복`);
      }
    }
  }

  // --- 6. 효과 틱 (독 등) ---
  const dummyCombatState = {
    dungeonId: state.dungeonId, combatTurn: state.turn,
    currentEnemy: state.enemy, enemyHp: state.enemyHp, combatLog: [],
  };
  const effectMsgs = tickEffects(state.playerSkills, dummyCombatState);
  state.enemyHp = dummyCombatState.enemyHp; // 독 데미지 반영
  messages.push(...effectMsgs);

  // --- 7. MP 소모 ---
  player.adjustMp(-3);

  // --- 8. 최종 승패 체크 ---
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    const defeatTxt3 = getActionText(['combat.enemy_defeated']) || '처치했다.';
    messages.push(`${state.enemy.name}을(를) ${defeatTxt3}`);
  } else if (player.base.hp <= 0) {
    state.finished = true;
    state.victory = false;
    messages.push(`${player.name}이(가) 쓰러졌다...`);
  }

  return messages;
}

// ============================================================
// 플레이어 스킬 사용 (수동)
// ============================================================

export function usePlayerSkill(
  state: RealtimeCombatState,
  slotIndex: number,
  player: Actor,
): string[] {
  if (state.finished) return [];

  const ss = state.playerSkills;
  const skill = ss.slots[slotIndex];
  if (!skill) return ['스킬 슬롯이 비어 있습니다.'];

  const check = canUseSkill(skill, player, ss);
  if (!check.ok) return [check.reason ?? '스킬 사용 불가'];

  const messages: string[] = [];

  // 자원 소모 (레벨별 코스트 감소)
  const skillLevel = player.learnedSkills.get(skill.id) ?? 1;
  const costMult = getSkillCostReduction(skillLevel);
  player.adjustMp(-Math.ceil(skill.mpCost * costMult));
  if (skill.hpCost > 0) player.adjustHp(-skill.hpCost);

  // 사용 횟수
  ss.usesThisCombat.set(skill.id, (ss.usesThisCombat.get(skill.id) ?? 0) + 1);
  const newUsage = (player.skillUsage.get(skill.id) ?? 0) + 1;
  player.skillUsage.set(skill.id, newUsage);

  const levelMult = getSkillLevelMultiplier(skillLevel);

  if (skill.preDelay > 0) {
    ss.pendingSkill = skill;
    ss.preDelayTurns = skill.preDelay;
    messages.push(`${skill.name} 준비 중...`);
  } else {
    // 즉시 발동
    const e = skill.effect;
    switch (skill.type) {
      case SkillType.Attack: {
        const buffedAtk = getBuffedAttack(
          player.getEffectiveAttack() + state.partyBonus.attack,
          ss,
        );
        let dmg = 0;
        if (e.damageMultiplier !== undefined) dmg += Math.round(buffedAtk * e.damageMultiplier * levelMult);
        if (e.flatDamage !== undefined) dmg += Math.round(e.flatDamage * levelMult);
        const finalDmg = Math.max(1, dmg - state.enemy.defense * 0.5);
        state.enemyHp -= finalDmg;
        messages.push(`${skill.name}: ${state.enemy.name}에게 ${Math.round(finalDmg)} 데미지!`);
        break;
      }
      case SkillType.Defense: {
        const duration = e.buffDuration ?? 1;
        const mult = e.defenseMultiplier ?? 1.0;
        ss.activeBuffs.push({ type: 'defense', multiplier: mult, turnsLeft: duration });
        messages.push(`${skill.name}: 방어력 ${mult}배 (${duration}턴)`);
        break;
      }
      case SkillType.Buff: {
        if (e.healHp !== undefined && e.healHp > 0) {
          const amt = Math.round(e.healHp * levelMult);
          player.adjustHp(amt);
          messages.push(`${skill.name}: HP ${amt} 회복`);
        }
        if (e.healMp !== undefined && e.healMp > 0) {
          const amt = Math.round(e.healMp * levelMult);
          player.adjustMp(amt);
          messages.push(`${skill.name}: MP ${amt} 회복`);
        }
        if (e.attackMultiplier !== undefined) {
          const duration = e.buffDuration ?? 1;
          ss.activeBuffs.push({ type: 'attack', multiplier: e.attackMultiplier, turnsLeft: duration });
          messages.push(`${skill.name}: 공격력 ${e.attackMultiplier}배 (${duration}턴)`);
        }
        if (skill.id.includes('vigor') || skill.id === 'vigor_up') {
          const amt = Math.round(15 * levelMult);
          player.adjustMp(amt);
          messages.push(`${skill.name}: MP ${amt} 회복`);
        }
        break;
      }
      case SkillType.Debuff: {
        if (e.debuffType !== undefined) {
          const duration = e.debuffDuration ?? 1;
          const value = e.debuffValue ?? 0;
          ss.activeDebuffs.push({ type: e.debuffType, value, turnsLeft: duration });
          messages.push(`${skill.name}: ${e.debuffType} 적용 (${duration}턴)`);
        }
        break;
      }
    }
    ss.postDelayTurns = skill.postDelay;
  }

  // 스킬 레벨업 체크
  if (checkSkillLevelUp(skill.id, skillLevel, newUsage) && skillLevel < SKILL_MAX_LEVEL) {
    player.learnedSkills.set(skill.id, skillLevel + 1);
    messages.push(`${skill.name} 숙련도 상승! Lv.${skillLevel + 1}`);
  }

  // 슬롯 재롤
  rerollSlot(slotIndex, player, ss);

  // 승리 체크
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    messages.push(`${state.enemy.name}을(를) 쓰러뜨렸다!`);
  }

  return messages;
}
