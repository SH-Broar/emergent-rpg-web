// hyperion.ts — 히페리온 조건 판정 시스템
// 원본: GameData::CheckHyperionCondition, LoadHyperion

import { DataSection, parseStringList } from '../data/parser';
import { Actor } from '../models/actor';
import { PlayerKnowledge } from '../models/knowledge';
import { DungeonSystem } from '../models/dungeon';
import { GameTime } from '../types/game-time';
import { areAcquisitionConditionsMet } from './npc-interaction';
import { getNpcQuestByTitle } from '../data/npc-quest-defs';

export interface HyperionCondition {
  description: string;
  type: string; // "manual", "days_passed:N", etc.
}

export interface HyperionEntry {
  actorName: string;
  conditions: HyperionCondition[]; // 5 levels
}

const hyperionDB = new Map<string, HyperionEntry>();

/** 로딩된 모든 locationId 집합 — all_locations_visited 판정용. initLocations 완료 후 세팅됨 */
let loadedLocationIds: Set<string> = new Set();

export function setLoadedLocationIds(ids: Iterable<string>): void {
  loadedLocationIds = new Set(ids);
}

export function getLoadedLocationIds(): ReadonlySet<string> {
  return loadedLocationIds;
}

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
  return hyperionDB.get(actorName);
}

/** __default__ 포함 폴백 (플레이어 전용) */
export function getHyperionEntryWithDefault(actorName: string): HyperionEntry | undefined {
  return hyperionDB.get(actorName) ?? hyperionDB.get('__default__');
}

export function checkHyperionCondition(
  cond: HyperionCondition,
  _targetActorName: string,
  player: Actor,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
  gameTime: GameTime,
  dungeonSystem?: DungeonSystem,
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

    case 'all_locations_visited': {
      // 로딩된 모든 location을 방문했는지 확인.
      // 아직 location 로딩 전이거나 데이터 없음 = 안전하게 false 반환.
      if (loadedLocationIds.size === 0) return false;
      for (const id of loadedLocationIds) {
        if (!knowledge.visitedLocations.has(id)) return false;
      }
      return true;
    }

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

    // --- 기력(AP/TP) 총 소비량 ---
    case 'vigor_spent':
      return knowledge.totalVigorSpent >= parseInt(param, 10);

    // --- 이벤트 완료 플래그 ---
    case 'event_done':
      return knowledge.completedEvents.has(param.trim());

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

    // --- 아이템 소지 ---
    case 'has_item': {
      // "아이템ID" 또는 "아이템ID:수량"
      const parts = param.split(':').map(s => s.trim());
      const itemId = parts[0];
      const amount = parts.length > 1 ? parseInt(parts[1], 10) : 1;
      return player.getItemCount(itemId) >= amount;
    }

    // --- 퀘스트 완료 수 ---
    // "quest_count:N"        = 전체 완료 수 >= N
    // "quest_count:locId:N"  = 해당 지역에서 완료한 퀘스트 수 >= N (npc-quest의 location 필드 기반)
    case 'quest_count': {
      const parts = param.split(':').map(s => s.trim());
      if (parts.length === 1) {
        return knowledge.completedQuestCount >= parseInt(parts[0], 10);
      }
      const locId = parts[0];
      const target = parseInt(parts[1], 10);
      let count = 0;
      for (const questTitle of knowledge.completedQuestNames) {
        const def = getNpcQuestByTitle(questTitle);
        if (def && def.location === locId) count++;
      }
      return count >= target;
    }

    // --- 칭호 소지 ---
    case 'has_title':
      return knowledge.hasTitle(param.trim());

    // --- 지역 진행률 (해당 지역 던전 평균 진행도) ---
    case 'location_progress': {
      // "지역ID:N" (N은 퍼센트)
      const [locId, pctStr] = param.split(':').map(s => s.trim());
      const requiredPct = parseInt(pctStr, 10);
      if (!dungeonSystem) return false;
      const dungeons = dungeonSystem.getAllDungeons().filter(d => d.accessFrom === locId);
      if (dungeons.length === 0) return false;
      const avg = dungeons.reduce((sum, d) => sum + player.getDungeonProgress(d.id), 0) / dungeons.length;
      return avg >= requiredPct;
    }

    // --- 관계 호감도 ---
    case 'relationship': {
      // "이름:F"
      const [rName, fStr] = param.split(':').map(s => s.trim());
      const threshold = parseFloat(fStr);
      const rel = player.relationships.get(rName);
      if (!rel) return false;
      return (rel.trust + rel.affinity) / 2 >= threshold;
    }

    // --- 스탯 합 ---
    case 'stat_total':
      return (player.getEffectiveAttack() + player.getEffectiveDefense()) >= parseInt(param, 10);

    case 'party_stat_total': {
      let total = player.getEffectiveAttack() + player.getEffectiveDefense();
      for (const compName of knowledge.partyMembers) {
        const comp = allActors.find(a => a.name === compName);
        if (comp) total += comp.getEffectiveAttack() + comp.getEffectiveDefense();
      }
      return total >= parseInt(param, 10);
    }

    // --- 컬러 속성 값 ---
    case 'color_value': {
      // "속성이름:F"
      const [elemName, valStr] = param.split(':').map(s => s.trim());
      const elemIdx = ['Fire','Water','Electric','Iron','Earth','Wind','Light','Dark'].indexOf(elemName);
      if (elemIdx < 0) return false;
      return (player.color.values[elemIdx] ?? 0.5) >= parseFloat(valStr);
    }

    // --- 음식 종류 ---
    case 'food_eaten':
      return knowledge.foodTypesEaten.size >= parseInt(param, 10);

    // --- 동료 동행 일수 ---
    case 'companion_days': {
      // "이름:N"
      const [cdName, cdDays] = param.split(':').map(s => s.trim());
      return (knowledge.companionDaysMap.get(cdName) ?? 0) >= parseInt(cdDays, 10);
    }

    // --- 모든 종족/속성 동료 ---
    case 'all_races_recruited': {
      const races = new Set(allActors.filter(a => knowledge.recruitedEver.has(a.name)).map(a => a.base.race));
      return races.size >= 8;
    }
    case 'all_elements_recruited': {
      const elems = new Set<number>();
      for (const a of allActors) {
        if (!knowledge.recruitedEver.has(a.name)) continue;
        const dom = a.color.getDominantTrait();
        elems.add(dom);
      }
      return elems.size >= 8;
    }

    // --- 호감도 높은 NPC 수 ---
    case 'friend_count': {
      let cnt = 0;
      for (const [, rel] of player.relationships) {
        if ((rel.trust + rel.affinity) / 2 >= 0.3) cnt++;
      }
      return cnt >= parseInt(param, 10);
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
  dungeonSystem?: DungeonSystem,
): string[] {
  const messages: string[] = [];

  for (const actor of allActors) {
    // 플레이어 자신이거나, 플레이어가 만난 NPC만 히페리온 판정
    if (actor !== player && !knowledge.knownActorNames.has(actor.name)) continue;

    // 친한 사이(입수 조건 달성) 또는 동료가 아닌 NPC는 히페리온 레벨업 불가
    if (actor !== player) {
      const isCompanion = knowledge.isCompanion(actor.name);
      const isRecruited = knowledge.recruitedEver.has(actor.name);
      const acqMet = !actor.acquisitionMethod
        || areAcquisitionConditionsMet(actor, player, allActors, knowledge, dungeonSystem);
      if (!isCompanion && !isRecruited && !acqMet) continue;
    }

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

    if (checkHyperionCondition(nextCond, actor.name, player, allActors, knowledge, gameTime, dungeonSystem)) {
      actor.hyperionLevel = currentLevel + 1;
      messages.push(`${actor.name}의 히페리온이 Lv.${actor.hyperionLevel}로 상승했다!`);
    }
  }

  return messages;
}
