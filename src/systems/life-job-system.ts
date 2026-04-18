// life-job-system.ts — 생활 직업 시스템 핵심 로직
// 직업 습득, 장착, 승단, 스킬 사용, 패시브 효과 조회

import { GameSession } from './game-session';
import type { LifeJob } from '../types/enums';
import { weatherName } from '../types/enums';
import { getLifeJobDef } from '../data/life-job-defs';
import type { LifeJobSkillDef, MissionCondition } from '../data/life-job-defs';
import { randomInt, randomFloat } from '../types/rng';
import { rollDailyWeather } from './weather';
import { locationName } from '../types/registry';

// ============================================================
// 미션 진행도 조회
// ============================================================

/** 미션 조건 키에 대한 현재 진행도 반환 */
export function getMissionProgress(session: GameSession, key: string): number {
  const k = session.knowledge;
  const p = session.player;

  // var:xxx → actor.getVariable(xxx)
  if (key.startsWith('var:')) {
    return p.getVariable(key.slice(4));
  }

  switch (key) {
    case 'activities':        return k.totalActivitiesDone;
    case 'conversations':     return k.totalConversations;
    case 'gifts':             return k.totalGiftsGiven;
    case 'gathers':           return k.totalGathersDone;
    case 'cooks':             return k.totalCooksDone;
    case 'fishCaught':        return k.totalFishCaught;
    case 'weatherChecked':    return k.totalWeatherChecked;
    case 'potionsMade':       return k.totalPotionsMade;
    case 'songsPlayed':       return k.totalSongsPlayed;
    case 'blessingsGiven':    return k.totalBlessingsGiven;
    case 'equipRepaired':     return k.totalEquipRepaired;
    case 'moves':             return k.totalMovesDone;
    case 'dungeons':          return k.totalDungeonsCleared;
    case 'monsters':          return k.totalMonstersKilled;
    case 'farmHarvests':      return k.totalFarmHarvests;
    case 'quests':            return k.completedQuestCount;
    case 'itemsSold':         return k.totalItemsSold;
    case 'visitedLocations':  return k.visitedLocations.size;
    case 'foodTypes':         return k.foodTypesEaten.size;
    case 'monsterTypes':      return k.monsterTypesKilled.size;
    case 'dungeonBattlesWithCompanion': return k.totalDungeonBattlesWithCompanion;
    default:                  return 0;
  }
}

/** 미션 조건 하나의 달성 여부 */
export function isConditionMet(session: GameSession, cond: MissionCondition): boolean {
  return getMissionProgress(session, cond.key) >= cond.target;
}

/** 승단 미션 전체 달성 여부 (missionIdx: 0 = Lv1→Lv2, 1 = Lv2→Lv3) */
export function checkMission(session: GameSession, jobId: string, missionIdx: number): boolean {
  const def = getLifeJobDef(jobId);
  if (!def || missionIdx < 0 || missionIdx > 1) return false;
  return def.missions[missionIdx].conditions.every(c => isConditionMet(session, c));
}

// ============================================================
// 직업 습득 / 장착 / 승단
// ============================================================

/** 직업 습득 가능 여부 (이미 배웠으면 false) */
export function canLearnJob(session: GameSession, jobId: string): boolean {
  const p = session.player;
  if (p.lifeJobLevels.has(jobId)) return false;

  const def = getLifeJobDef(jobId);
  if (!def) return false;

  // Villager는 어디서든 습득 가능
  if (jobId === 'Villager') return true;

  // 취득 장소에 있어야 함
  if (def.acquisitionLocation && p.currentLocation !== def.acquisitionLocation) return false;

  return true;
}

/** 직업 습득 (Lv1 획득) */
export function learnJob(session: GameSession, jobId: string): string[] {
  const p = session.player;
  const def = getLifeJobDef(jobId);
  if (!def) return ['알 수 없는 직업입니다.'];
  if (p.lifeJobLevels.has(jobId)) return ['이미 배운 직업입니다.'];

  p.lifeJobLevels.set(jobId, 1);
  p.lifeJob = jobId;

  const msgs = [`${def.name} 직업을 습득했다! (Lv.1)`];
  msgs.push(`스킬 해금: ${def.skills[0].name}`);
  session.backlog.add(session.gameTime, `생활 직업 "${def.name}" Lv.1을 습득했다.`, '시스템');
  return msgs;
}

/** 장착 직업 변경 (이미 배운 직업만, 하나브릿지 신전에서만 가능) */
export function equipJob(session: GameSession, jobId: string): string[] {
  const p = session.player;
  if (p.currentLocation !== 'Hanabridge') {
    return ['직업 전환은 하나브릿지 신전에서만 가능합니다.'];
  }
  if (jobId === '') {
    p.lifeJob = '';
    session.backlog.add(session.gameTime, '생활 직업을 해제했다.', '행동');
    return ['생활 직업을 해제했다.'];
  }
  if (!p.lifeJobLevels.has(jobId)) return ['아직 배우지 않은 직업입니다.'];
  const def = getLifeJobDef(jobId);
  if (!def) return ['알 수 없는 직업입니다.'];

  p.lifeJob = jobId;
  const lv = p.lifeJobLevels.get(jobId) ?? 1;
  session.backlog.add(session.gameTime, `생활 직업을 ${def.name} Lv.${lv}(으)로 변경했다.`, '행동');
  return [`${def.name} Lv.${lv}(으)로 전환했다.`];
}

/** 승단 시도 */
export function promoteJob(session: GameSession, jobId: string): string[] {
  const p = session.player;
  const def = getLifeJobDef(jobId);
  if (!def) return ['알 수 없는 직업입니다.'];

  const currentLv = p.lifeJobLevels.get(jobId) ?? 0;
  if (currentLv <= 0) return ['아직 배우지 않은 직업입니다.'];
  if (currentLv >= 3) return ['이미 최고 레벨입니다.'];

  const missionIdx = currentLv - 1; // Lv1→Lv2 = index 0, Lv2→Lv3 = index 1
  if (!checkMission(session, jobId, missionIdx)) {
    return ['승단 조건을 충족하지 못했습니다.'];
  }

  const newLv = currentLv + 1;
  p.lifeJobLevels.set(jobId, newLv);
  const newSkill = def.skills[newLv - 1];

  const msgs = [`${def.name} Lv.${newLv} 승단 성공!`];
  msgs.push(`새 스킬 해금: ${newSkill.name} — ${newSkill.description}`);
  session.backlog.add(session.gameTime, `생활 직업 "${def.name}" Lv.${newLv} 승단!`, '시스템');
  return msgs;
}

/** 현재 장착 직업의 레벨 */
export function getEquippedJobLevel(session: GameSession): number {
  const p = session.player;
  if (!p.lifeJob) return 0;
  return p.lifeJobLevels.get(p.lifeJob) ?? 0;
}

// ============================================================
// 스킬 사용 (액션 타입)
// ============================================================

/** 쿨다운 확인 */
function checkCooldown(session: GameSession, jobId: string, skillIdx: number, skill: LifeJobSkillDef): boolean {
  if (!skill.cooldown) return true;
  const p = session.player;
  const cdKey = `ljcd_${jobId}_${skillIdx}`;

  if (skill.cooldown === 'daily') {
    return p.getVariable(cdKey) !== session.gameTime.day;
  }
  if (skill.cooldown === 'weekly') {
    const lastUsedDay = p.getVariable(cdKey);
    return session.gameTime.day - lastUsedDay >= 7;
  }
  return true;
}

/** 쿨다운 기록 */
function setCooldown(session: GameSession, jobId: string, skillIdx: number): void {
  const cdKey = `ljcd_${jobId}_${skillIdx}`;
  session.player.setVariable(cdKey, session.gameTime.day);
}

/** 액션 스킬 사용 */
export function useLifeJobSkill(session: GameSession, skillIdx: number): string[] {
  const p = session.player;
  const jobId = p.lifeJob;
  if (!jobId) return ['장착된 생활 직업이 없습니다.'];

  const def = getLifeJobDef(jobId);
  if (!def) return ['직업 정보를 찾을 수 없습니다.'];

  const lv = p.lifeJobLevels.get(jobId) ?? 0;
  if (skillIdx >= lv) return ['아직 해금되지 않은 스킬입니다.'];

  const skill = def.skills[skillIdx];
  if (skill.type === 'passive') return ['패시브 스킬은 자동으로 적용됩니다.'];

  // TP 확인
  if (skill.tpCost > 0 && !p.hasAp(skill.tpCost)) {
    return ['TP가 부족합니다.'];
  }

  // 쿨다운 확인
  if (!checkCooldown(session, jobId, skillIdx, skill)) {
    const cdLabel = skill.cooldown === 'daily' ? '오늘은 이미 사용했습니다.' : '이번 주에 이미 사용했습니다.';
    return [cdLabel];
  }

  // TP 차감
  if (skill.tpCost > 0) {
    p.adjustAp(-skill.tpCost);
    session.knowledge.trackVigorSpent(skill.tpCost);
  }
  setCooldown(session, jobId, skillIdx);

  // 직업별 스킬 효과 실행
  return executeSkillEffect(session, jobId as LifeJob, skillIdx);
}

/** 직업별 스킬 효과 실행 */
function executeSkillEffect(session: GameSession, jobId: LifeJob, skillIdx: number): string[] {
  const p = session.player;
  const msgs: string[] = [];

  switch (jobId) {
    // ── 주민 ──
    case 'Villager': {
      if (skillIdx === 2) { // Lv3: 마을의 기둥
        const effects = ['채집', '요리', '활동'];
        const picked = effects[randomInt(0, effects.length - 1)];
        p.setVariable('villager_luck_type', effects.indexOf(picked));
        p.setVariable('villager_luck_day', session.gameTime.day);
        msgs.push(`오늘의 행운! ${picked} 효과가 2배가 된다.`);
        session.backlog.add(session.gameTime, `"오늘의 행운" 발동 → ${picked} 2배`, '행동');
      }
      break;
    }

    // ── 기상학자 ──
    case 'Meteorologist': {
      if (skillIdx === 0) { // Lv1: 날씨 예보
        const predicted = rollDailyWeather(session.world.getCurrentSeason(), session.world.weather);
        const tomorrow = weatherName(predicted);
        session.knowledge.trackWeatherChecked();
        msgs.push(`내일의 날씨: ${tomorrow}`);
        session.backlog.add(session.gameTime, `날씨 예보 → 내일: ${tomorrow}`, '행동');
      } else if (skillIdx === 2) { // Lv3: 폭풍의 눈
        const forecasts: string[] = [];
        let w = session.world.weather;
        for (let d = 1; d <= 3; d++) {
          w = rollDailyWeather(session.world.getCurrentSeason(), w);
          forecasts.push(`${d}일 후: ${weatherName(w)}`);
        }
        p.setVariable('weather_drop_bonus_day', session.gameTime.day);
        msgs.push('3일치 날씨 예보:');
        msgs.push(...forecasts);
        msgs.push('오늘 날씨 관련 아이템 드롭 +30%');
        session.backlog.add(session.gameTime, `3일 예보: ${forecasts.join(', ')}`, '행동');
      }
      break;
    }

    // ── 약초가 ──
    case 'Herbalist': {
      if (skillIdx === 1) { // Lv2: 포션 제조
        // HP 포션 재료: 약초 3개 → HP 포션 1개
        const herbCount = countItemsByTag(session, 'herb');
        if (herbCount < 3) {
          msgs.push('재료가 부족합니다. (약초류 3개 필요)');
          p.adjustAp(1); // TP 환불
          return msgs;
        }
        if (p.isBagFull(session.knowledge.bagCapacity, 'potion_hp_small')) {
          msgs.push('인벤토리가 가득 찼습니다!');
          p.adjustAp(1);
          return msgs;
        }
        consumeItemsByTag(session, 'herb', 3);
        p.addItemById('potion_hp_small', 1);
        session.knowledge.discoverItem('potion_hp_small');
        session.knowledge.trackPotionMade();
        msgs.push('HP 포션을 제조했다!');
        session.backlog.add(session.gameTime, 'HP 포션 제조 완료', '행동');
      }
      break;
    }

    // ── 광부 ──
    case 'Miner': {
      if (skillIdx === 1) { // Lv2: 광맥 감지
        msgs.push('주변의 광맥을 감지한다...');
        const loc = p.currentLocation;
        if (['Tiklit_Range', 'Abandoned_Mine', 'Moss_Forge', 'Manonickla_Forge'].includes(loc)) {
          msgs.push('이 지역에서 광석을 발견할 수 있다! 희귀 광석 확률 +15%');
          p.setVariable('miner_detect_day', session.gameTime.day);
        } else {
          msgs.push('이 지역에는 광맥이 없는 것 같다.');
        }
        session.backlog.add(session.gameTime, '광맥 감지 사용', '행동');
      } else if (skillIdx === 2) { // Lv3: 심층 굴착
        if (p.currentLocation !== 'Tiklit_Range') {
          msgs.push('티클릿 산맥에서만 사용할 수 있습니다.');
          p.adjustAp(2);
          return msgs;
        }
        if (p.isBagFull(session.knowledge.bagCapacity, 'ore_rare_tiklit')) {
          msgs.push('인벤토리가 가득 찼습니다!');
          p.adjustAp(2);
          return msgs;
        }
        p.addItemById('ore_rare_tiklit', 1);
        session.knowledge.discoverItem('ore_rare_tiklit');
        p.adjustVariable('rare_ore_obtained', 1);
        msgs.push('심층 굴착으로 희귀 광석을 발견했다!');
        session.backlog.add(session.gameTime, '심층 굴착 → 희귀 광석 획득', '행동');
      }
      break;
    }

    // ── 점성술사 ──
    case 'Astrologer': {
      if (skillIdx === 0) { // Lv1: 별자리 읽기
        const hints = ['탐색 위주', '전투 위주', '보물 위주', '함정 주의', '평화로운 구간'];
        const hint = hints[randomInt(0, hints.length - 1)];
        p.adjustVariable('astro_readings', 1);
        msgs.push(`별자리를 읽었다... 다음 던전 층은 "${hint}"일 것 같다.`);
        session.backlog.add(session.gameTime, `별자리 읽기 → ${hint}`, '행동');
      } else if (skillIdx === 1) { // Lv2: 운명 예지
        p.adjustVariable('fortune_readings', 1);
        const rooms = ['탐색', '전투', '보물'].map(() =>
          ['탐색', '전투', '보물', '이벤트'][randomInt(0, 3)],
        );
        msgs.push(`운명을 예지했다... 다음 3개 방: ${rooms.join(' → ')}`);
        session.backlog.add(session.gameTime, `운명 예지 → ${rooms.join(' → ')}`, '행동');
      } else if (skillIdx === 2) { // Lv3: 천체 조율
        const elements = ['불', '물', '전기', '철', '흙', '바람', '빛', '어둠'];
        const picked = elements[randomInt(0, elements.length - 1)];
        p.setVariable('astro_fix_element', elements.indexOf(picked));
        p.setVariable('astro_fix_day', session.gameTime.day);
        msgs.push(`별의 가호: 다음 24시간 동안 ${picked} 방향으로 컬러가 변화한다.`);
        session.backlog.add(session.gameTime, `천체 조율 → ${picked} 방향 고정`, '행동');
      }
      break;
    }

    // ── 길드직원 ──
    case 'GuildClerk': {
      if (skillIdx === 2) { // Lv3: 길드 인맥
        const bonusGold = 100 + randomInt(0, 200);
        p.addGold(bonusGold);
        msgs.push(`특별 의뢰를 수주했다! +${bonusGold}G`);
        session.backlog.add(session.gameTime, `길드 인맥 → 특별 보상 +${bonusGold}G`, '행동');
      }
      break;
    }

    // ── 경비병 ──
    case 'Guard': {
      if (skillIdx === 1) { // Lv2: 동료 보호
        p.setVariable('guard_escort_day', session.gameTime.day);
        msgs.push('동료를 호위한다! 다음 전투에서 동료 피해 -30%');
        session.backlog.add(session.gameTime, '동료 보호 발동', '행동');
      } else if (skillIdx === 2) { // Lv3: 불굴의 의지
        p.setVariable('guard_laststand_day', session.gameTime.day);
        msgs.push('불굴의 의지! 오늘 HP 0 시 HP 1로 버틴다.');
        session.backlog.add(session.gameTime, '불굴의 의지 발동', '행동');
      }
      break;
    }

    // ── 농부 ──
    case 'Farmer': {
      if (skillIdx === 1) { // Lv2: 퇴비 기술
        p.setVariable('farmer_fertilize_day', session.gameTime.day);
        msgs.push('퇴비를 뿌렸다! 다음 수확 시 해당 칸 수확량 2배');
        session.backlog.add(session.gameTime, '퇴비 기술 사용', '행동');
      } else if (skillIdx === 2) { // Lv3: 대지의 노래
        p.setVariable('farmer_special_day', session.gameTime.day);
        msgs.push('대지에 노래를 불렀다... 오늘 파종한 씨앗에서 희귀 작물이 나올 수 있다.');
        session.backlog.add(session.gameTime, '대지의 노래 사용', '행동');
      }
      break;
    }

    // ── 어부 ──
    case 'Fisher': {
      if (skillIdx === 0) { // Lv1: 낚시
        const waterLocs = ['Erumen_Seoncheon', 'Martin_Port', 'Halpia', 'Kishina', 'Valkyr_Canal', 'Lake'];
        if (!waterLocs.includes(p.currentLocation)) {
          msgs.push('물가 지역에서만 낚시할 수 있습니다.');
          p.adjustAp(1);
          return msgs;
        }
        const lv = p.lifeJobLevels.get('Fisher') ?? 1;
        const baseCount = lv >= 2 ? 2 : 1;
        const isRare = randomFloat(0, 1) < (lv >= 2 ? 0.2 : 0.05);
        const fishId = isRare ? 'fish_rare' : 'fish_common';
        const fishName = isRare ? '희귀 물고기' : '물고기';
        if (p.isBagFull(session.knowledge.bagCapacity, fishId)) {
          msgs.push('인벤토리가 가득 찼습니다!');
          p.adjustAp(1);
          return msgs;
        }
        p.addItemById(fishId, baseCount);
        session.knowledge.discoverItem(fishId);
        session.knowledge.trackFishCaught();
        if (isRare) p.adjustVariable('rare_fish', 1);
        p.adjustVariable('fish_types', isRare ? 1 : 0); // simplified
        msgs.push(`${fishName}을(를) ${baseCount}마리 잡았다!`);
        session.backlog.add(session.gameTime, `낚시 → ${fishName} ×${baseCount}`, '행동');
      } else if (skillIdx === 2) { // Lv3: 바다의 벗 (심해 낚시)
        if (p.currentLocation !== 'Martin_Port') {
          msgs.push('마틴 항에서만 심해 낚시를 할 수 있습니다.');
          p.adjustAp(2);
          return msgs;
        }
        const rareItems = ['fish_deep_sea', 'pearl', 'coral'];
        const pick = rareItems[randomInt(0, rareItems.length - 1)];
        if (p.isBagFull(session.knowledge.bagCapacity, pick)) {
          msgs.push('인벤토리가 가득 찼습니다!');
          p.adjustAp(2);
          return msgs;
        }
        p.addItemById(pick, 1);
        session.knowledge.discoverItem(pick);
        session.knowledge.trackFishCaught();
        p.adjustVariable('rare_fish', 1);
        msgs.push(`심해 낚시 성공! 특별 해양 아이템을 획득했다.`);
        session.backlog.add(session.gameTime, '심해 낚시 → 특별 아이템 획득', '행동');
      }
      break;
    }

    // ── 사제 ──
    case 'Priest': {
      if (skillIdx === 0) { // Lv1: 축복
        const companions = session.actors.filter(a =>
          a !== p && session.knowledge.isCompanion(a.name) && a.currentLocation === p.currentLocation,
        );
        if (companions.length === 0) {
          // 자기 자신 회복
          p.adjustHp(20);
          session.knowledge.trackBlessingGiven();
          msgs.push(`축복을 내렸다. HP +20 회복.`);
        } else {
          const target = companions[0];
          target.adjustHp(20);
          session.knowledge.trackBlessingGiven();
          msgs.push(`${target.name}에게 축복을 내렸다. HP +20 회복.`);
        }
        session.backlog.add(session.gameTime, '축복 사용', '행동');
      } else if (skillIdx === 2) { // Lv3: 신성한 가호
        msgs.push('신성한 가호! 파티 전체 상태이상이 해제된다.');
        p.setVariable('priest_holy_day', session.gameTime.day);
        session.backlog.add(session.gameTime, '신성한 가호 발동', '행동');
      }
      break;
    }

    // ── 장인 ──
    case 'Craftsman': {
      if (skillIdx === 0) { // Lv1: 장비 수리
        // 내구도 시스템: degrade_weapon, degrade_armor 변수 감소
        const oreCount = countItemsByTag(session, 'ore');
        if (oreCount < 2) {
          msgs.push('재료가 부족합니다. (광석류 2개 필요)');
          p.adjustAp(1);
          return msgs;
        }
        consumeItemsByTag(session, 'ore', 2);
        // 열화도 감소
        const weaponDeg = p.getVariable('degrade_weapon');
        const armorDeg = p.getVariable('degrade_armor');
        if (weaponDeg > 0) p.setVariable('degrade_weapon', Math.max(0, weaponDeg - 30));
        if (armorDeg > 0) p.setVariable('degrade_armor', Math.max(0, armorDeg - 30));
        session.knowledge.trackEquipRepaired();
        msgs.push('장비를 수리했다! 열화도가 감소했다.');
        session.backlog.add(session.gameTime, '장비 수리 완료', '행동');
      } else if (skillIdx === 2) { // Lv3: 명품 제작
        const oreCount = countItemsByTag(session, 'ore');
        if (oreCount < 5) {
          msgs.push('재료가 부족합니다. (광석류 5개 필요)');
          p.adjustAp(3);
          return msgs;
        }
        const craftItems = ['craft_ring', 'craft_charm', 'craft_tool'];
        const pick = craftItems[randomInt(0, craftItems.length - 1)];
        if (p.isBagFull(session.knowledge.bagCapacity, pick)) {
          msgs.push('인벤토리가 가득 찼습니다!');
          p.adjustAp(3);
          return msgs;
        }
        consumeItemsByTag(session, 'ore', 5);
        p.addItemById(pick, 1);
        session.knowledge.discoverItem(pick);
        msgs.push('명품 제작 성공! 특별 아이템을 만들었다.');
        session.backlog.add(session.gameTime, '명품 제작 → 특별 아이템', '행동');
      }
      break;
    }

    // ── 모험가 ──
    case 'Adventurer': {
      if (skillIdx === 2) { // Lv3: 야생 생존
        const healAmount = Math.round(p.getEffectiveMaxHp() * 0.3);
        p.adjustHp(healAmount);
        msgs.push(`야생 생존 기술로 HP를 ${healAmount} 회복했다!`);
        session.backlog.add(session.gameTime, `야생 생존 → HP +${healAmount}`, '행동');
      }
      break;
    }

    // ── 음유시인 ──
    case 'Bard': {
      if (skillIdx === 0) { // Lv1: 연주
        const npcsHere = session.actors.filter(a =>
          a !== p && a.currentLocation === p.currentLocation && !a.playable,
        );
        let boosted = 0;
        for (const npc of npcsHere) {
          p.adjustRelationship(npc.name, 0.02, 0.03);
          npc.adjustRelationship(p.name, 0.02, 0.03);
          boosted++;
        }
        session.knowledge.trackSongPlayed();
        msgs.push(`연주를 했다! ${boosted}명의 NPC 호감도가 소폭 상승.`);
        session.backlog.add(session.gameTime, `연주 → ${boosted}명 호감도 상승`, '행동');
      } else if (skillIdx === 2) { // Lv3: 전설의 가수
        const npcsHere = session.actors.filter(a =>
          a !== p && a.currentLocation === p.currentLocation && !a.playable,
        );
        for (const npc of npcsHere) {
          p.adjustRelationship(npc.name, 0.05, 0.08);
          npc.adjustRelationship(p.name, 0.05, 0.08);
        }
        session.knowledge.trackSongPlayed();
        msgs.push(`대공연! 모든 NPC의 호감도가 대폭 상승했다.`);
        session.backlog.add(session.gameTime, '대공연 → 전체 NPC 호감도 대폭 상승', '행동');
      }
      break;
    }

    // ── 지도제작자 ──
    case 'Cartographer': {
      if (skillIdx === 1) { // Lv2: 숨겨진 경로
        const routes = session.world.getOutgoingRoutes(p.currentLocation, session.gameTime.day);
        if (routes.length === 0) {
          msgs.push('이 지역에서 연결된 경로 정보가 없습니다.');
        } else {
          msgs.push('경로 탐색 결과:');
          for (const [locId, minutes] of routes) {
            msgs.push(`  → ${locationName(locId)} (${minutes}분)`);
          }
        }
        session.knowledge.trackMapDrawn();
        session.backlog.add(session.gameTime, '경로 탐색 사용', '행동');
      } else if (skillIdx === 2) { // Lv3: 세계 지도 완성 (비밀 경로)
        p.setVariable('carto_instant_day', session.gameTime.day);
        msgs.push('비밀 경로를 발견했다! 다음 이동 시 즉시 도착한다.');
        session.backlog.add(session.gameTime, '비밀 경로 활성화', '행동');
      }
      break;
    }

    // ── 수의사 ──
    case 'Veterinarian': {
      if (skillIdx === 1) { // Lv2: 야생 친화 (치료)
        const companions = session.actors.filter(a =>
          a !== p && session.knowledge.isCompanion(a.name),
        );
        if (companions.length === 0) {
          msgs.push('치료할 동료가 없습니다.');
          p.adjustAp(1);
          return msgs;
        }
        const target = companions[0];
        target.adjustHp(15);
        msgs.push(`${target.name}의 상태를 치료했다. HP +15`);
        session.backlog.add(session.gameTime, `${target.name} 치료`, '행동');
      } else if (skillIdx === 2) { // Lv3: 정령의 벗
        if (p.currentLocation !== 'Memory_Spring') {
          msgs.push('기억의 샘에서만 정령 영입을 시도할 수 있습니다.');
          p.adjustAp(2);
          return msgs;
        }
        msgs.push('정령과 교감을 시도한다... 특별한 기운이 느껴진다.');
        session.backlog.add(session.gameTime, '정령 영입 시도', '행동');
      }
      break;
    }

    default:
      msgs.push('스킬을 사용했다.');
      break;
  }

  return msgs;
}

// ============================================================
// 패시브 효과 수치 조회
// ============================================================

export interface LifeJobModifiers {
  gatherHerbBonus: number;      // 약초 추가 획득
  gatherOreBonus: number;       // 광석 추가 획득
  sellPriceBonus: number;       // 판매가 배율 보너스 (0.1 = +10%)
  buyPriceDiscount: number;     // 구매가 할인 (0.15 = -15%)
  cookSuccessBonus: number;     // 요리 성공률 보너스
  cookEffectBonus: number;      // 음식 효과 배율 보너스
  restHpBonus: number;          // 휴식 HP 회복 배율 보너스
  travelTimeReduction: number;  // 이동 시간 감소 (0.25 = -25%)
  questRewardBonus: number;     // 퀘스트 보상 배율 보너스
  dungeonHpCostReduction: number; // 던전 HP 비용 감소
  farmHarvestBonus: number;     // 농장 수확량 보너스
  farmGrowthBonus: number;      // 작물 성장 속도 보너스
  allyDefenseBonus: number;     // 동료 방어력 보너스
  monsterDropBonus: number;     // 몬스터 드롭률 보너스
  affinityGainBonus: number;    // 호감도 상승 보너스
  giftAffinityBonus: number;    // 선물 호감도 보너스
  activityTimeSave: number;     // 활동 시간 절약
  randomItemChance: number;     // 활동 후 랜덤 아이템 확률
  rareHerbBonus: number;        // 희귀 약초 확률 보너스
  rareOreBonus: number;         // 희귀 광석 확률 보너스
  fishYieldBonus: number;       // 낚시 수확량 보너스
  rareFishBonus: number;        // 희귀 물고기 확률 보너스
  materialSaveChance: number;   // 재료 절약 확률
}

function emptyModifiers(): LifeJobModifiers {
  return {
    gatherHerbBonus: 0, gatherOreBonus: 0,
    sellPriceBonus: 0, buyPriceDiscount: 0,
    cookSuccessBonus: 0, cookEffectBonus: 0,
    restHpBonus: 0, travelTimeReduction: 0,
    questRewardBonus: 0, dungeonHpCostReduction: 0,
    farmHarvestBonus: 0, farmGrowthBonus: 0,
    allyDefenseBonus: 0, monsterDropBonus: 0,
    affinityGainBonus: 0, giftAffinityBonus: 0,
    activityTimeSave: 0, randomItemChance: 0,
    rareHerbBonus: 0, rareOreBonus: 0,
    fishYieldBonus: 0, rareFishBonus: 0,
    materialSaveChance: 0,
  };
}

/** 현재 장착 직업의 패시브 효과 수치를 반환 */
export function getLifeJobModifiers(session: GameSession): LifeJobModifiers {
  const m = emptyModifiers();
  const p = session.player;
  const jobId = p.lifeJob as LifeJob;
  if (!jobId) return m;

  const lv = p.lifeJobLevels.get(jobId) ?? 0;
  if (lv < 1) return m;

  switch (jobId) {
    case 'Villager':
      m.randomItemChance = 0.05;
      if (lv >= 2) { m.giftAffinityBonus = 0.1; m.activityTimeSave = 0.1; }
      break;

    case 'Herbalist':
      m.gatherHerbBonus = 1;
      if (lv >= 3) { m.rareHerbBonus = 0.25; }
      break;

    case 'Merchant':
      m.sellPriceBonus = 0.1;
      if (lv >= 2) m.buyPriceDiscount = 0.15;
      if (lv >= 3) { m.sellPriceBonus = 0.2; m.buyPriceDiscount = 0.25; }
      break;

    case 'Cook':
      m.cookSuccessBonus = 0.15;
      if (lv >= 2) m.cookSuccessBonus = 0.3;
      if (lv >= 3) m.cookEffectBonus = 0.5;
      break;

    case 'Miner':
      m.gatherOreBonus = 1;
      if (lv >= 2) m.rareOreBonus = 0.15;
      if (lv >= 3) m.rareOreBonus = 0.3;
      break;

    case 'GuildClerk':
      m.questRewardBonus = 0.1;
      if (lv >= 2) m.questRewardBonus = 0.2;
      if (lv >= 3) m.questRewardBonus = 0.25;
      break;

    case 'Guard':
      m.allyDefenseBonus = 0.1;
      if (lv >= 2) m.allyDefenseBonus = 0.2;
      if (lv >= 3) m.allyDefenseBonus = 0.25;
      break;

    case 'Farmer':
      m.farmHarvestBonus = 0.2;
      if (lv >= 2) m.farmGrowthBonus = 0.3;
      if (lv >= 3) { m.farmHarvestBonus = 0.5; }
      break;

    case 'Fisher':
      if (lv >= 2) { m.fishYieldBonus = 1; m.rareFishBonus = 0.2; }
      if (lv >= 3) { m.rareFishBonus = 0.3; }
      break;

    case 'Priest':
      m.restHpBonus = 0.2;
      if (lv >= 2) m.restHpBonus = 0.5;
      break;

    case 'Craftsman':
      if (lv >= 2) m.materialSaveChance = 0.2;
      break;

    case 'Adventurer':
      m.dungeonHpCostReduction = 0.2;
      if (lv >= 2) m.dungeonHpCostReduction = 0.25;
      if (lv >= 3) m.dungeonHpCostReduction = 0.3;
      break;

    case 'Bard':
      if (lv >= 2) m.affinityGainBonus = 0.15;
      if (lv >= 3) m.affinityGainBonus = 0.25;
      break;

    case 'Cartographer':
      m.travelTimeReduction = 0.25;
      if (lv >= 2) m.travelTimeReduction = 0.35;
      if (lv >= 3) m.travelTimeReduction = 0.5;
      break;

    case 'Veterinarian':
      m.monsterDropBonus = 0.1;
      if (lv >= 2) m.monsterDropBonus = 0.2;
      break;

    case 'Meteorologist':
    case 'Astrologer':
      // 대부분 액션 스킬 기반, 패시브 효과 최소
      break;
  }

  return m;
}

// ============================================================
// 위치 방문 추적 (미션용)
// ============================================================

/** 위치 방문 시 카운터 증가 (game-loop에서 이동 완료 시 호출) */
export function trackLocationVisit(session: GameSession, locationId: string): void {
  const p = session.player;
  p.adjustVariable(`visit_${locationId}`, 1);
  session.knowledge.trackMoveDone();
}

// ============================================================
// 유틸리티: 아이템 태그 기반 카운트/소모
// ============================================================

function countItemsByTag(session: GameSession, tag: string): number {
  const p = session.player;
  let count = 0;
  for (const [id, qty] of p.items) {
    if (matchesTag(id, tag)) count += qty;
  }
  return count;
}

function consumeItemsByTag(session: GameSession, tag: string, amount: number): void {
  const p = session.player;
  let remaining = amount;
  for (const [id, qty] of p.items) {
    if (remaining <= 0) break;
    if (matchesTag(id, tag)) {
      const take = Math.min(qty, remaining);
      p.removeItemById(id, take);
      remaining -= take;
    }
  }
}

function matchesTag(itemId: string, tag: string): boolean {
  switch (tag) {
    case 'herb':
      return itemId.includes('herb') || itemId.includes('약초') || itemId.includes('flower');
    case 'ore':
      return itemId.includes('ore') || itemId.includes('광석') || itemId.includes('crystal');
    default:
      return false;
  }
}
