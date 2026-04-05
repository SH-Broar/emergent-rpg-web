// hyperion.ts — 히페리온 조건 판정 시스템
// 원본: GameData::CheckHyperionCondition, LoadHyperion

import { DataSection, parseStringList } from '../data/parser';
import { Actor } from '../models/actor';
import { PlayerKnowledge } from '../models/knowledge';
import { GameTime } from '../types/game-time';

export interface HyperionCondition {
  description: string;
  type: string; // "manual", "days_passed:N", etc.
}

export interface HyperionEntry {
  actorName: string;
  conditions: HyperionCondition[]; // 5 levels
}

const hyperionDB = new Map<string, HyperionEntry>();

export function loadHyperion(sections: DataSection[]): void {
  hyperionDB.clear();
  for (const s of sections) {
    const entry: HyperionEntry = { actorName: s.name, conditions: [] };
    for (let i = 1; i <= 5; i++) {
      entry.conditions.push({
        description: s.get(`condition_${i}`, ''),
        type: s.get(`condition_${i}_type`, 'manual'),
      });
    }
    hyperionDB.set(s.name, entry);
  }
}

export function getHyperionEntry(actorName: string): HyperionEntry | undefined {
  return hyperionDB.get(actorName) ?? hyperionDB.get('__default__');
}

export function checkHyperionCondition(
  cond: HyperionCondition,
  _targetActorName: string,
  player: Actor,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
  gameTime: GameTime,
): boolean {
  const t = cond.type.trim();
  if (!t || t === 'manual') return false;

  const colonIdx = t.indexOf(':');
  const cmd = colonIdx === -1 ? t : t.slice(0, colonIdx);
  const param = colonIdx === -1 ? '' : t.slice(colonIdx + 1);

  switch (cmd) {
    case 'days_passed':
      return gameTime.day >= parseInt(param, 10);

    case 'hyperion_total': {
      const total = allActors.reduce((sum, a) => sum + a.hyperionLevel, 0);
      return total >= parseInt(param, 10);
    }

    case 'actor_recruited':
      return knowledge.recruitedEver.has(param.trim());

    case 'all_recruited': {
      const names = parseStringList(param);
      return names.every(n => knowledge.recruitedEver.has(n));
    }

    case 'recruited_count':
      return knowledge.recruitedEver.size >= parseInt(param, 10);

    case 'gold_owned':
      return player.spirit.gold >= parseInt(param, 10);

    case 'location_visited':
      return knowledge.visitedLocations.has(param.trim());

    case 'all_locations_visited':
      // Simplified: check if visited > 10 locations
      return knowledge.visitedLocations.size >= 10;

    case 'visited_count':
      return knowledge.visitedLocations.size >= parseInt(param, 10);

    case 'conversation_with':
      return knowledge.conversationPartners.has(param.trim());

    case 'conversation_count':
      return knowledge.totalConversations >= parseInt(param, 10);

    case 'dungeon_clear_count':
      return knowledge.totalDungeonsCleared >= parseInt(param, 10);

    case 'monsters_killed':
      return knowledge.totalMonstersKilled >= parseInt(param, 10);

    case 'monster_types':
      return knowledge.monsterTypesKilled.size >= parseInt(param, 10);

    case 'damage_dealt':
      return knowledge.totalDamageDealt >= parseInt(param, 10);

    case 'damage_taken':
      return knowledge.totalDamageTaken >= parseInt(param, 10);

    case 'max_damage':
      return knowledge.maxSingleDamage >= parseInt(param, 10);

    case 'treasure_found':
      return knowledge.totalTreasureFound >= parseInt(param, 10);

    case 'gold_spent':
      return knowledge.totalGoldSpent >= parseInt(param, 10);

    case 'items_sold':
      return knowledge.totalItemsSold >= parseInt(param, 10);

    case 'items_crafted':
      return knowledge.totalItemsCrafted >= parseInt(param, 10);

    case 'activities_done':
      return knowledge.totalActivitiesDone >= parseInt(param, 10);

    case 'hyperion_levels': {
      // "이름1:N1,이름2:N2"
      const pairs = param.split(',');
      return pairs.every(pair => {
        const [name, lvlStr] = pair.split(':').map(s => s.trim());
        const requiredLvl = parseInt(lvlStr, 10);
        const actor = allActors.find(a => a.name === name);
        return actor ? actor.hyperionLevel >= requiredLvl : false;
      });
    }

    default:
      return false;
  }
}

/** 매 턴 호출: 모든 NPC의 히페리온 조건을 체크하고 레벨업 */
export function updateHyperionLevels(
  player: Actor,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
  gameTime: GameTime,
): string[] {
  const messages: string[] = [];

  for (const actor of allActors) {
    // 플레이어 자신이거나, 플레이어가 만난 NPC만 히페리온 판정
    if (actor !== player && !knowledge.knownActorNames.has(actor.name)) continue;

    const entry = getHyperionEntry(actor.name);
    if (!entry) continue;

    const currentLevel = actor.hyperionLevel;
    if (currentLevel >= 5) continue;

    // 현재 레벨의 다음 조건 확인
    const nextCond = entry.conditions[currentLevel];
    if (!nextCond) continue;

    // 수동 완료 플래그 확인
    if (nextCond.type === 'manual') {
      if (actor.hyperionFlags[currentLevel]) {
        actor.hyperionLevel = currentLevel + 1;
        messages.push(`${actor.name}의 히페리온이 Lv.${actor.hyperionLevel}로 상승했다!`);
      }
      continue;
    }

    if (checkHyperionCondition(nextCond, actor.name, player, allActors, knowledge, gameTime)) {
      actor.hyperionLevel = currentLevel + 1;
      messages.push(`${actor.name}의 히페리온이 Lv.${actor.hyperionLevel}로 상승했다!`);
    }
  }

  return messages;
}
