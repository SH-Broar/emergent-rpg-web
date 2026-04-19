// event-battle.ts — 스토리 이벤트 내 단발 전투 시스템
//
// 목적: acquisition 조건 "이벤트 전투 승리"를 실제 게임 경험으로 연결.
// 기존 던전 전투 엔진(combat-engine.ts)을 재활용하여 단발 전투를 실행한다.

import type { DataSection } from '../data/parser';
import { parseStringList } from '../data/parser';
import { MonsterDef, MonsterSkillDef } from './dungeon';
import { getSkillDef, SkillType } from './skill';
import { Element } from '../types/enums';
import { parseLocationID, type LocationID } from '../types/location';

/** 이벤트 전투 한 건의 정의. 승리/패배 후처리와 대사를 포함한다. */
export interface EventBattleDef {
  id: string;
  name: string;
  description: string;
  location: LocationID;

  // 적 스탯
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  enemyAttack: number;
  enemyDefense: number;
  enemySkills: string[];     // skills.txt id 목록
  enemyElement: Element;     // 보상/연출용 (현재는 description·로그용)
  enemyLevel: number;        // 표기용

  // 보상
  rewardGold: number;
  rewardItem: string;        // 빈 값 허용 (ItemID)

  // 후처리
  onVictoryEvent: string;         // completedEvents에 추가할 이벤트 ID
  onVictoryHyperionFlag: string;  // "actor:level" 형식 (0-indexed). 빈 값 허용

  // 대사
  preBattleDialogue: string;
  postVictoryDialogue: string;
  postDefeatDialogue: string;

  // 플래그
  retryAllowed: boolean;
}

/** 전역 이벤트 전투 DB */
const eventBattleDB = new Map<string, EventBattleDef>();

export function clearEventBattles(): void {
  eventBattleDB.clear();
}

export function registerEventBattle(def: EventBattleDef): void {
  eventBattleDB.set(def.id, def);
}

export function getEventBattle(id: string): EventBattleDef | undefined {
  return eventBattleDB.get(id);
}

/** 특정 지역에 정의된 이벤트 전투 목록 반환 */
export function getEventBattlesAtLocation(locationId: string): EventBattleDef[] {
  const out: EventBattleDef[] = [];
  for (const def of eventBattleDB.values()) {
    if (def.location === locationId) out.push(def);
  }
  return out;
}

export function getAllEventBattles(): EventBattleDef[] {
  return [...eventBattleDB.values()];
}

/** 이벤트 전투의 적을 기존 전투 엔진의 MonsterDef로 변환한다. */
export function toMonsterDef(def: EventBattleDef): MonsterDef {
  // skills.txt 스킬 id를 MonsterSkillDef 배열로 매핑
  const skills: MonsterSkillDef[] = [];
  for (const skillId of def.enemySkills) {
    if (!skillId) continue;
    const s = getSkillDef(skillId);
    if (!s) continue;
    // 공격 스킬만 heal/buff 변환 없이 바로 등록 (간단한 반영)
    const value = s.effect.damageMultiplier ?? s.effect.flatDamage ?? 1.5;
    skills.push({
      name: s.name,
      type: s.type === SkillType.Attack ? 'attack' : (s.type === SkillType.Buff ? 'buff' : 'attack'),
      value,
      description: s.description,
    });
  }

  return {
    id: `event_battle_enemy_${def.id}`,
    name: def.enemyName,
    attack: def.enemyAttack,
    defense: def.enemyDefense,
    hp: def.enemyHp,
    lootTable: [], // 이벤트 전투는 보상을 별도 처리
    skills,
    skillChance: skills.length > 0 ? 0.25 : 0,
  };
}

function parseElementSafe(raw: string): Element {
  const clean = raw.trim();
  const map: Record<string, Element> = {
    Fire: Element.Fire, Water: Element.Water, Electric: Element.Electric,
    Iron: Element.Iron, Earth: Element.Earth, Wind: Element.Wind,
    Light: Element.Light, Dark: Element.Dark,
  };
  return map[clean] ?? Element.Fire;
}

/** event_battles.txt DataSection[] → DB 로드 */
export function loadEventBattles(sections: DataSection[]): void {
  clearEventBattles();
  for (const s of sections) {
    const def: EventBattleDef = {
      id: s.name,
      name: s.get('name', s.name),
      description: s.get('description', ''),
      location: parseLocationID(s.get('location', '')),

      enemyName: s.get('enemy_name', s.name),
      enemyHp: s.getInt('enemy_hp', 100),
      enemyMaxHp: s.getInt('enemy_maxHp', s.getInt('enemy_hp', 100)),
      enemyAttack: s.getInt('enemy_attack', 15),
      enemyDefense: s.getInt('enemy_defense', 8),
      enemySkills: parseStringList(s.get('enemy_skills', '')),
      enemyElement: parseElementSafe(s.get('enemy_element', 'Fire')),
      enemyLevel: s.getInt('enemy_level', 1),

      rewardGold: s.getInt('reward_gold', 0),
      rewardItem: s.get('reward_item', '').trim(),

      onVictoryEvent: s.get('on_victory_event', '').trim(),
      onVictoryHyperionFlag: s.get('on_victory_hyperion_flag', '').trim(),

      preBattleDialogue: s.get('pre_battle_dialogue', ''),
      postVictoryDialogue: s.get('post_victory_dialogue', ''),
      postDefeatDialogue: s.get('post_defeat_dialogue', ''),

      retryAllowed: s.getInt('retry_allowed', 1) !== 0,
    };
    registerEventBattle(def);
  }
}
