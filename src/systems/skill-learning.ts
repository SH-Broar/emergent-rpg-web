// skill-learning.ts — 스킬 학습/습득 시스템

import { Actor } from '../models/actor';
import { SkillDef, getAllSkillDefs, getSkillDef } from '../models/skill';
import { evaluateTagExpr, getRaceCapabilityTags } from '../types/tag-system';
import { raceToKey, spiritRoleToKey } from '../types/enums';

/** 스킬 학습 가능 여부 판정 */
export function canLearnSkill(actor: Actor, skillDef: SkillDef): { ok: boolean; reason?: string } {
  // 이미 학습한 스킬
  if (actor.learnedSkills.has(skillDef.id)) {
    return { ok: false, reason: '이미 습득한 스킬입니다.' };
  }

  // 다른 종족 전용 기본 스킬
  if (skillDef.basicForRace && skillDef.basicForRace !== raceToKey(actor.base.race)) {
    return { ok: false, reason: '다른 종족 전용 스킬입니다.' };
  }

  // 종족 태그 표현식 체크
  if (skillDef.raceTagExpr) {
    const raceTags = getRaceCapabilityTags(actor.base.race);
    if (!evaluateTagExpr(skillDef.raceTagExpr, raceTags)) {
      return { ok: false, reason: '종족 조건을 충족하지 않습니다.' };
    }
  }

  // 레벨 체크
  if (skillDef.minLevel > 0 && actor.base.level < skillDef.minLevel) {
    return { ok: false, reason: `레벨 ${skillDef.minLevel} 이상 필요합니다. (현재 Lv.${actor.base.level})` };
  }

  // 컬러 체크 (학습 시점만, 이후 변해도 사용 가능)
  if (skillDef.colorReq && skillDef.colorReq.length > 0) {
    for (let i = 0; i < skillDef.colorReq.length; i++) {
      if (skillDef.colorReq[i] > 0 && (actor.color.values[i] ?? 0) < skillDef.colorReq[i]) {
        return { ok: false, reason: '컬러 조건을 충족하지 않습니다.' };
      }
    }
  }

  return { ok: true };
}

/** 학습 가능한 비기본 스킬 목록 */
export function getLearnableSkills(actor: Actor): SkillDef[] {
  const result: SkillDef[] = [];
  for (const [, def] of getAllSkillDefs()) {
    if (def.isBasicSkill) continue;
    if (canLearnSkill(actor, def).ok) {
      result.push(def);
    }
  }
  return result;
}

/** 스킬 습득 */
export function learnSkill(actor: Actor, skillId: string): boolean {
  const def = getSkillDef(skillId);
  if (!def) return false;
  if (!canLearnSkill(actor, def).ok) return false;
  actor.learnedSkills.set(skillId, 1);
  actor.skillOrder.push(skillId);
  return true;
}

/** NPC 역할 기반 스킬 배정 */
export function assignNpcSkills(actor: Actor): void {
  const roleKey = spiritRoleToKey(actor.spirit.role);
  const raceKey = raceToKey(actor.base.race);
  const allSkills = [...getAllSkillDefs().values()];

  // 학습 가능한 비기본 스킬 필터
  const learnable = allSkills.filter(s => {
    if (s.isBasicSkill) return false;
    if (s.basicForRace && s.basicForRace !== raceKey) return false;
    if (s.raceTagExpr) {
      const raceTags = getRaceCapabilityTags(actor.base.race);
      if (!evaluateTagExpr(s.raceTagExpr, raceTags)) return false;
    }
    if (s.minLevel > 0 && actor.base.level < s.minLevel) return false;
    // 컬러 체크는 NPC에게 관대하게 적용 (50% 충족이면 OK)
    if (s.colorReq && s.colorReq.length > 0) {
      let met = 0;
      let total = 0;
      for (let i = 0; i < s.colorReq.length; i++) {
        if (s.colorReq[i] > 0) {
          total++;
          if ((actor.color.values[i] ?? 0) >= s.colorReq[i] * 0.8) met++;
        }
      }
      if (total > 0 && met < Math.ceil(total * 0.5)) return false;
    }
    return true;
  });

  // 역할 친화 스킬 우선
  const preferred = learnable.filter(s => s.roleAffinity.includes(roleKey));
  const others = learnable.filter(s => !s.roleAffinity.includes(roleKey));

  // NPC는 레벨 기반 1~3개 추가 스킬
  const extraCount = Math.min(3, 1 + Math.floor(actor.base.level / 5));
  let assigned = 0;

  for (const skill of preferred) {
    if (assigned >= extraCount) break;
    if (!actor.learnedSkills.has(skill.id)) {
      actor.learnedSkills.set(skill.id, 1);
      actor.skillOrder.push(skill.id);
      assigned++;
    }
  }

  for (const skill of others) {
    if (assigned >= extraCount) break;
    if (!actor.learnedSkills.has(skill.id)) {
      actor.learnedSkills.set(skill.id, 1);
      actor.skillOrder.push(skill.id);
      assigned++;
    }
  }
}
