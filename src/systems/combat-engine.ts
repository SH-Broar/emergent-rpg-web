// combat-engine.ts — 실시간 틱 기반 전투 엔진

import { Actor } from '../models/actor';
import { MonsterDef, rollMonsterEvasionMiss } from '../models/dungeon';
import { SkillDef, SkillType, getSkillDef, getSkillLevelMultiplier, getSkillCostReduction, checkSkillLevelUp, SKILL_MAX_LEVEL } from '../models/skill';
import {
  CombatSkillState, rollInitialSkills, canUseSkill, rerollSlot,
  tickPreDelay, tickEffects, getBuffedAttack, getBuffedDefense, getEnemyAttackMod,
  type SkillUseOptions,
} from './skill-combat';
import { randomFloat } from '../types/rng';
import { getActionText } from './npc-interaction';
import { iGa, eulReul } from '../data/josa';
import { getEquippedAccessoryEffects } from '../types/item-defs';

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
  skillUsedThisTurn: boolean;
  lastTickTime: number;
  /** openingAttackMultiplier 적용 여부(첫 본 공격 1회) */
  openingEnemyStrikeDone: boolean;
  /** burstOnce 연속타 적용 완료 여부 */
  enemyBurstVolleyDone: boolean;
}

const BASE_TICK_MS = 1500;
const DEFAULT_COMBAT_SLOWDOWN = 10;

export function getCombatSpeedMultiplier(player: Actor): number {
  // 향후 악세서리/옵션에서 2배, 3배 가속을 붙일 때 이 변수만 바꾸면 된다.
  const configured = player.getVariable('combat_speed_multiplier');
  const mealSpeed  = player.getVariable('meal_combat_speed');
  const base = Number.isFinite(configured) && configured > 0 ? configured : 1;
  const meal = Number.isFinite(mealSpeed)  && mealSpeed  > 0 ? mealSpeed  : 1;

  // 악세서리 combatSpeed: 추가 가속 배수 (예: 0.3 = +30% 속도)
  const fx = getEquippedAccessoryEffects(player);
  const accSpeed = fx.combatSpeed && fx.combatSpeed > 0 ? 1 + fx.combatSpeed : 1;

  return base * meal * accSpeed;
}

/** 하한선: 아무리 가속해도 400ms 미만으로는 내려가지 않는다 */
const MIN_TICK_MS = 400;

export function getCombatTickMs(player: Actor): number {
  const raw = Math.round((BASE_TICK_MS * DEFAULT_COMBAT_SLOWDOWN) / getCombatSpeedMultiplier(player));
  return Math.max(MIN_TICK_MS, raw);
}

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
    combatLog: [`${enemy.name}${isBoss ? ' (보스)' : ''}${iGa(enemy.name)} 나타났다!`],
    turn: 0,
    playerSkills,
    partySlots,
    partyBonus,
    tickTimer: null,
    paused: false,
    finished: false,
    victory: false,
    isBoss,
    skillUsedThisTurn: false,
    lastTickTime: Date.now(),
    openingEnemyStrikeDone: false,
    enemyBurstVolleyDone: false,
  };
}

export function stopCombatTimer(state: RealtimeCombatState): void {
  if (state.tickTimer !== null) {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
  }
}

// ============================================================
// 악세서리 특수 효과 헬퍼
// ============================================================

/** Element 숫자 → 저항 키. 없으면 빈 문자열 반환. */
const ELEMENT_RESIST_KEYS: Record<number, string> = {
  0: 'fireResist',   1: 'waterResist', 2: 'electricResist', 3: 'ironResist',
  4: 'earthResist',  5: 'windResist',  6: 'lightResist',    7: 'darkResist',
};

/** 적이 가하는 공격/스킬 대미지에 악세서리 원소 저항을 적용 (element ∈ 0..7 또는 -1) */
function applyElementResist(player: Actor, rawDmg: number, element: number): number {
  if (element < 0) return rawDmg;
  const key = ELEMENT_RESIST_KEYS[element];
  if (!key) return rawDmg;
  const fx = getEquippedAccessoryEffects(player);
  const resist = fx[key];
  if (!resist || resist <= 0) return rawDmg;
  const factor = Math.max(0.1, 1 - resist); // 최대 90% 경감
  return Math.max(1, Math.round(rawDmg * factor));
}

/** 플레이어의 공격 대미지에 악세서리 critChance를 적용 (1.5배 치명) */
function applyCritChance(player: Actor, rawDmg: number): { dmg: number; crit: boolean } {
  const fx = getEquippedAccessoryEffects(player);
  const chance = fx.critChance ?? 0;
  if (chance > 0 && randomFloat(0, 1) < chance) {
    return { dmg: Math.max(1, Math.round(rawDmg * 1.5)), crit: true };
  }
  return { dmg: rawDmg, crit: false };
}

/**
 * autoReviveOnce: HP 0 도달 시 1회 부활. variables['revive_used_today'] 플래그로 하루 1회 제한.
 * 부활 시 HP 50% 회복 후 true 반환. 이미 사용했거나 효과 없음이면 false.
 */
function tryAutoRevive(player: Actor): boolean {
  const fx = getEquippedAccessoryEffects(player);
  if (!fx.autoReviveOnce || fx.autoReviveOnce <= 0) return false;
  if (player.getVariable('revive_used_today') > 0) return false;
  player.setVariable('revive_used_today', 1);
  const maxHp = player.getEffectiveMaxHp();
  player.base.hp = Math.max(1, Math.round(maxHp * 0.5));
  return true;
}

/**
 * 방 이동(다음 전투 진입 등) 시 악세서리 hpRegen/mpRegen 적용.
 * 음수 값은 페널티(예: Void_Eye의 hpRegen:-0.2)로 동작.
 * 최종 HP/MP는 1/0 미만으로 내려가지 않도록 clamp.
 */
export function applyRoomTransitionRegen(player: Actor): string[] {
  const msgs: string[] = [];
  const fx = getEquippedAccessoryEffects(player);
  if (fx.hpRegen && fx.hpRegen !== 0) {
    const maxHp = player.getEffectiveMaxHp();
    const delta = Math.round(maxHp * fx.hpRegen);
    if (delta !== 0) {
      player.base.hp = Math.max(1, Math.min(maxHp, player.base.hp + delta));
      msgs.push(delta > 0
        ? `악세서리 효과: HP +${delta}`
        : `악세서리 페널티: HP ${delta}`);
    }
  }
  if (fx.mpRegen && fx.mpRegen !== 0) {
    const maxMp = player.getEffectiveMaxMp();
    const delta = Math.round(maxMp * fx.mpRegen);
    if (delta !== 0) {
      player.base.mp = Math.max(0, Math.min(maxMp, player.base.mp + delta));
      msgs.push(delta > 0
        ? `악세서리 효과: MP +${delta}`
        : `악세서리 페널티: MP ${delta}`);
    }
  }
  return msgs;
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
  state.skillUsedThisTurn = false;
  state.lastTickTime = Date.now();
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
  const atkTxt = getActionText(['combat.player_attack']) || '공격했다.';
  if (rollMonsterEvasionMiss(state.enemy)) {
    messages.push(`${player.name}의 ${atkTxt} 그러나 ${state.enemy.name}이(가) 잔상으로 회피했다!`);
  } else {
    const basePlayerDmg = Math.max(1, Math.round(buffedAtk - enemyDef * 0.5));
    const critRes = applyCritChance(player, basePlayerDmg);
    state.enemyHp -= critRes.dmg;
    if (critRes.crit) {
      messages.push(`${player.name}의 ${atkTxt} 치명타! ${critRes.dmg} 데미지`);
    } else {
      messages.push(`${player.name}의 ${atkTxt} ${critRes.dmg} 데미지`);
    }
  }

  // 승리 체크
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    const defeatTxt1 = getActionText(['combat.enemy_defeated']) || '처치했다.';
    messages.push(`${state.enemy.name}${eulReul(state.enemy.name)} ${defeatTxt1}`);
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
        if (rollMonsterEvasionMiss(state.enemy)) {
          messages.push(`★ ${slot.actor.name}: ${skill.name}! 그러나 ${state.enemy.name}이(가) 회피했다.`);
          continue;
        }
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
    messages.push(`${state.enemy.name}${eulReul(state.enemy.name)} ${defeatTxt2}`);
    return messages;
  }

  // --- 4. 적 자동 공격 ---
  const buffedDef = getBuffedDefense(
    player.getEffectiveDefense() + state.partyBonus.defense,
    state.playerSkills,
  );
  const burstN = state.enemy.burstHitCount ?? 0;
  const burstD = state.enemy.burstHitDamage ?? 0;
  const burstOnce = state.enemy.burstOnce === true;
  const shouldBurst = burstN > 0 && burstD > 0 && (!burstOnce || !state.enemyBurstVolleyDone);

  // 몬스터 데이터에 element(0~7)가 존재하면 원소 저항 적용 (없으면 -1 = 무속성)
  const enemyElement = (state.enemy as { element?: number }).element ?? -1;

  if (shouldBurst) {
    let sum = 0;
    for (let i = 0; i < burstN; i++) {
      const each = applyElementResist(player, burstD, enemyElement);
      player.adjustHp(-each);
      sum += each;
    }
    messages.push(`${state.enemy.name}의 연속타! ${burstN}회 = ${sum} 데미지`);
    if (burstOnce) state.enemyBurstVolleyDone = true;
  } else {
    let effAtk = state.enemy.attack;
    const oam = state.enemy.openingAttackMultiplier ?? 0;
    if (oam > 0 && !state.openingEnemyStrikeDone) {
      effAtk = Math.round(state.enemy.attack * oam);
      state.openingEnemyStrikeDone = true;
      messages.push(`${state.enemy.name}의 단발 충전 사격!`);
    }
    const enemyAtkMod = getEnemyAttackMod(state.playerSkills);
    const rawEnemyDmg = Math.max(0, Math.round(effAtk * enemyAtkMod - buffedDef * 0.5));
    if (rawEnemyDmg > 0) {
      const mitigated = applyElementResist(player, rawEnemyDmg, enemyElement);
      player.adjustHp(-mitigated);
      const hitTxt = getActionText(['combat.player_hit']) || '피격당했다.';
      messages.push(`${state.enemy.name}의 공격! ${hitTxt} ${mitigated} 데미지`);
    }
  }

  // --- 5. 적 스킬 발동 ---
  if (state.enemy.skills.length > 0 && state.enemy.skillChance > 0) {
    if (randomFloat(0, 1) < state.enemy.skillChance) {
      const skill = state.enemy.skills[Math.floor(randomFloat(0, state.enemy.skills.length))];
      if (skill.type === 'attack') {
        const skillElem = (skill as { element?: number }).element ?? enemyElement;
        const rawSkillDmg = Math.max(1, Math.round(state.enemy.attack * skill.value - buffedDef * 0.3));
        const mitigated = applyElementResist(player, rawSkillDmg, skillElem);
        player.adjustHp(-mitigated);
        messages.push(`${state.enemy.name}의 ${skill.name}! ${mitigated} 데미지`);
      } else if (skill.type === 'heal') {
        const healAmt = Math.round(skill.value);
        state.enemyHp = Math.min(state.enemyMaxHp, state.enemyHp + healAmt);
        messages.push(`${state.enemy.name}의 ${skill.name}! HP ${healAmt} 회복`);
      }
    }
  }

  const tickPress = state.enemy.tickPressureDamage ?? 0;
  if (tickPress > 0) {
    const mitigated = applyElementResist(player, tickPress, enemyElement);
    player.adjustHp(-mitigated);
    messages.push(`${state.enemy.name}의 이상 신호! ${mitigated} 데미지`);
  }

  // --- 6. 효과 틱 (독 등) ---
  const dummyCombatState = {
    dungeonId: state.dungeonId, combatTurn: state.turn,
    currentEnemy: state.enemy, enemyHp: state.enemyHp, combatLog: [],
  };
  const effectMsgs = tickEffects(state.playerSkills, dummyCombatState);
  state.enemyHp = dummyCombatState.enemyHp; // 독 데미지 반영
  messages.push(...effectMsgs);

  // --- 8. 최종 승패 체크 ---
  if (state.enemyHp <= 0) {
    state.finished = true;
    state.victory = true;
    const defeatTxt3 = getActionText(['combat.enemy_defeated']) || '처치했다.';
    messages.push(`${state.enemy.name}${eulReul(state.enemy.name)} ${defeatTxt3}`);
  } else if (player.base.hp <= 0) {
    if (tryAutoRevive(player)) {
      messages.push(`✨ 부활의 부적이 발동했다! ${player.name}${iGa(player.name)} 다시 일어섰다. (HP ${player.base.hp})`);
    } else {
      state.finished = true;
      state.victory = false;
      messages.push(`${player.name}${iGa(player.name)} 쓰러졌다...`);
    }
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
  options?: SkillUseOptions,
): string[] {
  if (state.finished) return [];
  if (state.skillUsedThisTurn) return ['이번 턴에는 이미 스킬을 사용했다.'];

  const ss = state.playerSkills;
  const skill = ss.slots[slotIndex];
  if (!skill) return ['스킬 슬롯이 비어 있습니다.'];

  const check = canUseSkill(skill, player, ss, options);
  if (!check.ok) return [check.reason ?? '스킬 사용 불가'];

  state.skillUsedThisTurn = true;

  // 스킬 타입/원소별 컬러 영향
  // Fire=0, Water=1, Electric=2, Iron=3, Earth=4, Wind=5, Light=6, Dark=7
  const cv = player.color.values;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  switch (skill.type) {
    case SkillType.Attack:
      cv[0] = clamp01((cv[0] ?? 0.5) + 0.003); // Fire+
      break;
    case SkillType.Defense:
      cv[4] = clamp01((cv[4] ?? 0.5) + 0.003); // Earth+
      cv[3] = clamp01((cv[3] ?? 0.5) + 0.003); // Iron+
      break;
    case SkillType.Buff:
      cv[1] = clamp01((cv[1] ?? 0.5) + 0.003); // Water+
      cv[6] = clamp01((cv[6] ?? 0.5) + 0.003); // Light+
      break;
    case SkillType.Debuff:
      cv[7] = clamp01((cv[7] ?? 0.5) + 0.003); // Dark+
      break;
  }
  if (skill.element >= 0 && skill.element < 8) {
    cv[skill.element] = clamp01((cv[skill.element] ?? 0.5) + 0.005); // 스킬 원소+
  }

  const messages: string[] = [];

  // 자원 소모 (레벨별 코스트 감소)
  const skillLevel = player.learnedSkills.get(skill.id) ?? 1;
  const costMult = getSkillCostReduction(skillLevel);
  const jobMismatchMult = (skill.jobAffinity && player.combatJob !== skill.jobAffinity) ? 2 : 1;
  const effectiveMpCost = Math.max(0, Math.ceil(skill.mpCost * costMult * (options?.mpCostMultiplier ?? 1) * jobMismatchMult));
  player.adjustMp(-effectiveMpCost);
  if (skill.hpCost > 0) player.adjustHp(-skill.hpCost);

  // 사용 횟수
  ss.usesThisCombat.set(skill.id, (ss.usesThisCombat.get(skill.id) ?? 0) + 1);
  const newUsage = (player.skillUsage.get(skill.id) ?? 0) + 1;
  player.skillUsage.set(skill.id, newUsage);

  const levelMult = getSkillLevelMultiplier(skillLevel);
  // 전투 직업 보너스: 동일 직업군 스킬 +20%
  const jobBonus = (player.combatJob && skill.jobAffinity === player.combatJob) ? 1.20 : 1.0;

  if (skill.preDelay > 0) {
    ss.pendingSkill = skill;
    ss.preDelayTurns = skill.preDelay;
    messages.push(`${skill.name} 준비 중...`);
  } else {
    // 즉시 발동
    const e = skill.effect;
    switch (skill.type) {
      case SkillType.Attack: {
        if (rollMonsterEvasionMiss(state.enemy)) {
          messages.push(`${skill.name}: ${state.enemy.name}이(가) 잔상으로 회피했다!`);
          break;
        }
        const buffedAtk = getBuffedAttack(
          player.getEffectiveAttack() + state.partyBonus.attack,
          ss,
        );
        let dmg = 0;
        if (e.damageMultiplier !== undefined) dmg += Math.round(buffedAtk * e.damageMultiplier * levelMult * jobBonus);
        if (e.flatDamage !== undefined) dmg += Math.round(e.flatDamage * levelMult * jobBonus);
        // 악세서리 magicPower: 원소가 있는 스킬(element ≥ 0)에만 적용
        if (skill.element >= 0) {
          const fx = getEquippedAccessoryEffects(player);
          const mp = fx.magicPower ?? 0;
          if (mp > 0) dmg = Math.round(dmg * (1 + mp));
        }
        const finalDmg = Math.max(1, dmg - state.enemy.defense * 0.5);
        state.enemyHp -= finalDmg;
        messages.push(`${skill.name}: ${state.enemy.name}에게 ${Math.round(finalDmg)} 데미지!`);
        break;
      }
      case SkillType.Defense: {
        const duration = e.buffDuration ?? 1;
        const mult = (e.defenseMultiplier ?? 1.0) * (jobBonus > 1 ? 1 + (jobBonus - 1) * 0.5 : 1); // 방어는 절반 보너스
        ss.activeBuffs.push({ type: 'defense', multiplier: mult, turnsLeft: duration });
        messages.push(`${skill.name}: 방어력 ${mult}배 (${duration}턴)`);
        break;
      }
      case SkillType.Buff: {
        if (e.healHp !== undefined && e.healHp > 0) {
          const amt = Math.round(e.healHp * levelMult * jobBonus);
          player.adjustHp(amt);
          messages.push(`${skill.name}: HP ${amt} 회복`);
        }
        if (e.healMp !== undefined && e.healMp > 0) {
          const amt = Math.round(e.healMp * levelMult * jobBonus);
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
    messages.push(`${state.enemy.name}${eulReul(state.enemy.name)} 쓰러뜨렸다!`);
  }

  return messages;
}
