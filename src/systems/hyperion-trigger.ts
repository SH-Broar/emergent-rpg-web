// hyperion-trigger.ts — 히페리온 레벨업 판정 + 큐잉 공통 유틸
// 전투 종료/상점/제작/퀘스트/영입 등 모든 트리거 지점에서 공통으로 사용.

import { GameSession } from './game-session';
import { updateHyperionLevels } from './hyperion';
import { checkAndUnlockPacks, RDC_PACKS } from '../data/rdc-packs';
import { raceToKey } from '../types/enums';

/** 종족별 히페리온 레벨 3 언락 스킬 (공격) */
const HYPERION_ATTACK_SKILL: Record<string, string> = {
  Human:     'human_slash',
  Elf:       'elf_spirit_slash',
  Dwarf:     'dwarf_hammer_swing',
  Beastkin:  'keen_claw_strike',
  Nekomimi:  'keen_claw_strike_neko',
  Foxkin:    'keen_fox_strike',
  Lamia:     'keen_fang_strike',
  Werewolf:  'keen_wolf_fang',
};

/** 종족별 히페리온 레벨 5 언락 스킬 (회복) */
const HYPERION_HEAL_SKILL: Record<string, string> = {
  Human:     'human_heal',
  Elf:       'elf_nature_heal',
  Dwarf:     'dwarf_forge_mend',
  Beastkin:  'keen_lick_wound',
  Nekomimi:  'keen_purr_heal',
  Foxkin:    'keen_fox_heal',
  Lamia:     'keen_shed_heal',
  Werewolf:  'keen_howl_heal',
};

/**
 * 히페리온 레벨업 후 플레이어의 종족 기반 기본 스킬을 자동 언락.
 * - 레벨 3: 공격 기본 스킬
 * - 레벨 5: 회복 기본 스킬
 * 이미 보유한 스킬은 중복 추가하지 않는다.
 */
export function checkHyperionSkillUnlock(session: GameSession): string[] {
  if (!session.isValid) return [];
  const player = session.player;
  const raceKey = raceToKey(player.base.race);
  const unlocked: string[] = [];

  if (player.hyperionLevel >= 3) {
    const attackSkill = HYPERION_ATTACK_SKILL[raceKey];
    if (attackSkill && !player.learnedSkills.has(attackSkill)) {
      player.learnedSkills.set(attackSkill, 1);
      player.skillOrder.push(attackSkill);
      unlocked.push(attackSkill);
    }
  }

  if (player.hyperionLevel >= 5) {
    const healSkill = HYPERION_HEAL_SKILL[raceKey];
    if (healSkill && !player.learnedSkills.has(healSkill)) {
      player.learnedSkills.set(healSkill, 1);
      player.skillOrder.push(healSkill);
      unlocked.push(healSkill);
    }
  }

  return unlocked;
}

/** 히페리온 레벨 합계를 기반으로 플레이어의 hyperionBonus, HP/MP 재계산 */
export function syncPlayerHyperionBonus(session: GameSession): void {
  if (!session.isValid) return;
  const p = session.player;
  const oldMaxHp = Math.max(1, p.getEffectiveMaxHp());
  const oldMaxMp = Math.max(1, p.getEffectiveMaxMp());
  const hpRatio = Math.max(0, Math.min(1, p.base.hp / oldMaxHp));
  const mpRatio = Math.max(0, Math.min(1, p.base.mp / oldMaxMp));
  const hyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

  p.hyperionBonus = hyperionTotal - p.hyperionLevel;

  p.base.hp = Math.round(p.getEffectiveMaxHp() * hpRatio);
  p.base.mp = Math.round(p.getEffectiveMaxMp() * mpRatio);
}

/**
 * 히페리온 조건을 체크해 레벨업이 발생하면 pendingHyperionMsgs 큐에 추가.
 * 레벨업이 하나라도 발생하면 true 반환.
 * - 백로그에 시스템 메시지로 기록
 * - 플레이어 hyperionBonus 즉시 반영
 * - RDC 캐릭터팩 해금 체크 포함
 *
 * 호출부에서 true를 받으면 오버레이를 띄우거나, 오버레이가 어려운 컨텍스트면
 * 큐에만 쌓아두고 다음 processTurn 시점에 처리하도록 한다.
 */
export function checkAndQueueHyperionLevelUps(session: GameSession): boolean {
  if (!session.isValid) return false;
  const msgs = updateHyperionLevels(
    session.player,
    session.actors,
    session.knowledge,
    session.gameTime,
    session.dungeonSystem,
  );
  if (msgs.length === 0) return false;

  // 플레이어 보너스 즉시 반영
  syncPlayerHyperionBonus(session);

  for (const m of msgs) {
    session.backlog.add(session.gameTime, m, '시스템');
    session.pendingHyperionMsgs.push(m);
  }

  // 히페리온 레벨 3/5 기본 스킬 언락
  const unlockedSkills = checkHyperionSkillUnlock(session);
  for (const skillId of unlockedSkills) {
    const msg = `✦ 스킬 습득: "${skillId}"`;
    session.backlog.add(session.gameTime, msg, '시스템');
    session.pendingHyperionMsgs.push(msg);
  }

  // RDC 캐릭터팩 해금 체크 (히페리온 변동 후)
  const newlyUnlocked = checkAndUnlockPacks(session.actors);
  for (const packId of newlyUnlocked) {
    const pack = RDC_PACKS.find(pk => pk.id === packId);
    if (pack) {
      const msg = `✦ RDC 캐릭터팩 해금: "${pack.label}" — ${pack.playableNames.join(', ')} 플레이 가능!`;
      session.backlog.add(session.gameTime, msg, '시스템');
      session.pendingHyperionMsgs.push(msg);
    }
  }

  return true;
}
