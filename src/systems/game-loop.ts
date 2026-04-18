// game-loop.ts — 이벤트 기반 턴 루프
// 원본: GameLoop.cpp 핵심 분기

import { GameSession } from './game-session';
import { seasonName } from '../types/enums';
import { randomInt, randomFloat } from '../types/rng';
import { advanceTurn } from './world-simulation';
import { applyDailyBaseEffects, tickStoragePenalties } from './base-effects';
import { findItemsBySource, getEquippedAccessoryEffects } from '../types/item-defs';
import { tryNpcInitiatedConversation, getDialogue, getRelationshipStage, getActionText } from './npc-interaction';
import { checkAndAwardTitles } from './title-system';
import { getLifeJobModifiers } from './life-job-system';
import { SEA_ONLY_LOCATIONS } from './ferry';
import { checkAndQueueHyperionLevelUps, syncPlayerHyperionBonus } from './hyperion-trigger';

// syncPlayerHyperionBonus는 hyperion-trigger.ts로 이관됨 (다른 모듈에서도 사용)
// 하위 호환: 기존 코드가 game-loop에서 import할 경우를 대비해 re-export
export { syncPlayerHyperionBonus };

export type GameAction =
  | 'idle' | 'move' | 'talk' | 'trade' | 'eat'
  | 'rest' | 'dungeon' | 'gather' | 'quest' | 'activity'
  | 'gift' | 'home' | 'memory_spring'
  | 'storage' | 'realestate' | 'cooking'
  | 'info_status' | 'info_color' | 'info_relations' | 'info_world'
  | 'info_backlog' | 'info_hyperion' | 'info_party' | 'info_titles' | 'info_map' | 'info_encyclopedia'
  | 'info_skills' | 'info_inventory'
  | 'save'
  | 'skill_shop' | 'guild_dungeon' | 'life_job' | 'ferry'
  | 'village' | 'puchi_tower';

const ACTION_TIME: Partial<Record<GameAction, number>> = {
  idle: 30, move: 0, talk: 0, trade: 15, eat: 0,
  rest: 60, dungeon: 60, gather: 30, quest: 10,
  activity: 0, gift: 0, home: 60,
};

const AP_COST: Partial<Record<GameAction, number>> = {
  idle: 0, move: 0, talk: 0, trade: 0, eat: 0,
  rest: 1, dungeon: 0, gather: 1, quest: 0,
  activity: 0, gift: 0, home: 0, memory_spring: 0,
};

export interface GatherSimResult {
  icon: string;
  title: string;
  activityKey: string;  // 'gather_<locationId>'
  effectType: string;   // 항상 'random_loot'
  rewardText: string;
  isEmpty: boolean;
}

export interface TurnResult {
  messages: string[];
  levelUp: boolean;
  screenChange?: string;
  gatherSim?: GatherSimResult;
}

const GATHER_HINT_FALLBACK_ENV = ['풀숲', '덤불', '흙'];

const GATHER_ICON: Record<string, string> = {
  Lake: '🎣', Mountain_Path: '⛏️', Herb_Garden: '🌿',
  Wilderness: '🌾', Limun_Ruins: '🏛️', Bloom_Terrace: '🌸',
  Moonlit_Clearing: '🌙', Cyan_Dunes: '🏜️', Tiklit_Range: '⛰️',
  Bandit_Hideout: '🗡️', Trade_Route: '🛒',
};
const GATHER_TITLE: Record<string, string> = {
  Lake: '낚시', Mountain_Path: '채굴 · 채집', Herb_Garden: '약초 채집',
  Wilderness: '야생 채집', Limun_Ruins: '유적 탐사', Bloom_Terrace: '특수 약초 채집',
  Moonlit_Clearing: '야간 탐색', Cyan_Dunes: '황야 채집', Tiklit_Range: '고산 채집',
  Bandit_Hideout: '은신처 수색', Trade_Route: '노변 채집',
};

export function resolveGatherIcon(locationId: string): string {
  return GATHER_ICON[locationId] ?? '🌿';
}
export function resolveGatherTitle(locationId: string): string {
  return GATHER_TITLE[locationId] ?? '채집';
}

function pickGatherHint(templates: string[], envs: string[]): string {
  const pool = envs.length > 0 ? envs : GATHER_HINT_FALLBACK_ENV;
  const env = pool[randomInt(0, pool.length - 1)];
  const tpl = templates[randomInt(0, templates.length - 1)];
  return tpl.replace('{g}', env);
}

export function processTurn(session: GameSession, action: GameAction): TurnResult {
  const result: TurnResult = { messages: [], levelUp: false };
  const p = session.player;
  if (!p) return result;

  // hyperionBonus를 항상 최신 값으로 갱신 (로드 직후, 수면/휴식 전 포함)
  syncPlayerHyperionBonus(session);

  const minutes = ACTION_TIME[action] ?? 0;

  // AP 검사 및 차감
  const apCost = AP_COST[action] ?? 0;
  if (apCost > 0 && !p.hasAp(apCost)) {
    result.messages.push('TP가 부족합니다. 자택에서 잠을 자면 회복됩니다.');
    return result;
  }
  if (apCost > 0) {
    p.adjustAp(-apCost);
    session.knowledge.trackVigorSpent(apCost);
  }

  // 컬러 게이지 스냅샷
  session.gaugeState.snapshot(p.color.values);

  switch (action) {
    case 'idle': {
      // 우선순위: action.wait.장소.동료, action.wait.동료, action.wait.장소, action.wait
      const companions = session.actors
        .filter(a => a !== p && session.knowledge.isCompanion(a.name))
        .map(a => a.name);
      const loc = p.currentLocation;
      const keys: string[] = [];
      for (const c of companions) {
        keys.push(`action.wait.${loc}.${c}`, `action.wait.${c}`);
      }
      keys.push(`action.wait.${loc}`, 'action.wait');
      const txt = getActionText(keys) || '주변을 관찰하며 시간을 보냈다.';
      session.backlog.add(session.gameTime, `${p.name}은(는) ${txt}`, '행동');
      result.messages.push(txt);
      const idleConv = tryNpcInitiatedConversation(p, session.actors, session.social, session.gameTime);
      if (idleConv) {
        const line = `${idleConv.npc.name}: 「${idleConv.greeting}」`;
        result.messages.push(line);
        if (idleConv.sharedRumor) result.messages.push(`소문: ${idleConv.sharedRumor}`);
        session.backlog.add(session.gameTime, line, '대사', p.name);
      }
      break;
    }


    case 'eat': result.screenChange = 'info_inventory'; return result;

    case 'rest': {
      const accFx = getEquippedAccessoryEffects(p);
      const ljModRest = getLifeJobModifiers(session);
      let hpRecover = Math.round(p.getEffectiveMaxHp() * 0.2);
      let mpRecover = Math.round(p.getEffectiveMaxMp() * 0.2);
      hpRecover += Math.round(hpRecover * (accFx.hpRegen ?? 0));
      mpRecover += Math.round(mpRecover * (accFx.mpRegen ?? 0));
      // 사제 패시브: 휴식 HP 회복 보너스
      hpRecover += Math.round(hpRecover * ljModRest.restHpBonus);
      p.adjustHp(hpRecover);
      p.adjustMp(mpRecover);
      const companions = session.actors
        .filter(a => a !== p && session.knowledge.isCompanion(a.name))
        .map(a => a.name);
      const loc = p.currentLocation;
      const keys: string[] = [];
      for (const c of companions) {
        keys.push(`action.rest.${loc}.${c}`, `action.rest.${c}`);
      }
      keys.push(`action.rest.${loc}`, 'action.rest');
      const restTxt = getActionText(keys) || `휴식을 취했다. HP +${hpRecover}, MP +${mpRecover}`;
      const restMsg = restTxt.includes('HP') ? restTxt : `${restTxt} (HP +${hpRecover}, MP +${mpRecover})`;
      session.backlog.add(session.gameTime, `${p.name}이(가) ${restMsg}`, '행동', p.name);
      result.messages.push(restMsg);
      const restConv = tryNpcInitiatedConversation(p, session.actors, session.social, session.gameTime);
      if (restConv) {
        const line = `쉬는 동안 ${restConv.npc.name}이(가) 다가왔다. 「${restConv.greeting}」`;
        result.messages.push(line);
        if (restConv.sharedRumor) result.messages.push(`소문: ${restConv.sharedRumor}`);
        session.backlog.add(session.gameTime, `${restConv.npc.name}: 「${restConv.greeting}」`, '대사', p.name);
      }
      break;
    }

    case 'gather': {
      const loc = session.world.getLocation(p.currentLocation);
      const gatherItems = findItemsBySource('gather:' + p.currentLocation);
      if (gatherItems.length === 0) {
        if (apCost > 0) {
          p.adjustAp(apCost);
          // AP 환불: totalVigorSpent도 되돌린다
          session.knowledge.totalVigorSpent = Math.max(0, session.knowledge.totalVigorSpent - apCost);
        }
        result.messages.push('이 지역에는 채집할 자원이 없다.');
        return result; // 시간 경과 없이 리턴
      }

      // 히페리온 레벨 합계 계산
      const totalHyperion = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

      // 히페리온 레벨로 채집 가능한 아이템 필터
      const availableItems = gatherItems.filter(item => (item.minHyperion ?? 0) <= totalHyperion);
      const lockedItems = gatherItems.filter(item => (item.minHyperion ?? 0) > totalHyperion);

      if (availableItems.length === 0) {
        if (apCost > 0) {
          p.adjustAp(apCost);
          session.knowledge.totalVigorSpent = Math.max(0, session.knowledge.totalVigorSpent - apCost);
        }
        const minRequired = Math.min(...gatherItems.map(g => g.minHyperion ?? 0));
        result.messages.push(`이 지역은 히페리온 레벨 합계 ${minRequired} 이상이어야 채집할 수 있다. (현재 ✦${totalHyperion})`);
        return result; // 시간 경과 없이 리턴
      }

      // 성공률 계산 (레벨 기반)
      const levelDiff = p.base.level - (loc.monsterLevel || 1);
      const accFxGather = getEquippedAccessoryEffects(p);
      const gatherMod = accFxGather.gatherBonus ?? 0;
      const chance = Math.min(0.95, Math.max(0.2, 0.7 + levelDiff * 0.03) + gatherMod);
      if (randomFloat(0, 1) > chance) {
        result.messages.push('채집에 실패했다...');
        if (lockedItems.length > 0) {
          result.messages.push(pickGatherHint([
            '{g} 깊은 곳에 뭔가 있는 것 같았지만, 오늘은 아닌 것 같다.',
            '뭔가를 놓친 기분이 들었지만, 무엇인지는 알 수 없었다.',
            '{g} 너머에서 손이 닿을 듯 말 듯 무언가가 느껴졌다.',
            '{g} 속에서 뭔가가 스쳐 지나간 것 같았다.',
            '분명히 뭔가가 있었는데... 사라졌다.',
          ], loc.gatherEnv));
        }
        // 채집 실패: Earth-, Wind-
        const gatherFailInfluence = new Array(8).fill(0);
        gatherFailInfluence[4] = -0.003;
        gatherFailInfluence[5] = -0.005;
        p.color.applyInfluence(gatherFailInfluence);

        result.gatherSim = {
          icon: resolveGatherIcon(p.currentLocation),
          title: resolveGatherTitle(p.currentLocation),
          activityKey: `gather_${p.currentLocation}`,
          effectType: 'random_loot',
          rewardText: '수확 없음',
          isEmpty: true,
        };
        result.screenChange = 'gather';
        break;
      }

      // 희귀도 가중치로 아이템 선택 (common 4배, uncommon 2배, rare 1배)
      const weights = availableItems.map(item => {
        switch (item.rarity) {
          case 'common': return 4;
          case 'uncommon': return 2;
          case 'rare': return 1;
          default: return 3;
        }
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let rand = randomFloat(0, totalWeight);
      let picked = availableItems[0];
      for (let i = 0; i < availableItems.length; i++) {
        rand -= weights[i];
        if (rand <= 0) { picked = availableItems[i]; break; }
      }

      const amount = picked.rarity === 'rare' ? 1 : randomInt(1, 2);
      if (p.isBagFull(session.knowledge.bagCapacity, picked.id)) {
        result.messages.push('⚠ 인벤토리가 가득 찼습니다! 아이템을 획득할 수 없었다.');
        return result;
      }
      // 생활 직업 패시브 보너스: 약초가/광부 추가 획득
      const ljMod = getLifeJobModifiers(session);
      let bonusAmount = 0;
      if (picked.id.includes('herb') || picked.id.includes('flower')) bonusAmount += ljMod.gatherHerbBonus;
      if (picked.id.includes('ore') || picked.id.includes('crystal')) bonusAmount += ljMod.gatherOreBonus;
      const finalAmount = amount + bonusAmount;

      p.addItemById(picked.id, finalAmount);
      session.knowledge.discoverItem(picked.id);
      session.backlog.add(session.gameTime, `${p.name}이(가) ${picked.name}을(를) ${finalAmount}개 채집했다.`, '행동');

      // 채집 성공: Earth+, Wind+, Fire-
      const gatherSuccessInfluence = new Array(8).fill(0);
      gatherSuccessInfluence[0] = -0.003;
      gatherSuccessInfluence[4] = 0.008;
      gatherSuccessInfluence[5] = 0.005;
      p.color.applyInfluence(gatherSuccessInfluence);
      session.knowledge.trackGatherDone();
      const gatherTitles = checkAndAwardTitles(session);
      for (const t of gatherTitles) {
        session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
        result.messages.push(`✦ 칭호 획득: "${t}"`);
      }

      let rarityLabel = '';
      if (picked.rarity === 'uncommon') rarityLabel = ' [특산물]';
      else if (picked.rarity === 'rare') rarityLabel = ' [희귀]';
      const rewardText = `${picked.name}${rarityLabel} ×${finalAmount}`;
      result.messages.push(`채집 완료! ${rewardText}`);

      // 잠긴 자원 힌트 (30% 확률)
      if (lockedItems.length > 0 && randomFloat(0, 1) < 0.3) {
        result.messages.push(pickGatherHint([
          '무언가 반짝인 것 같았지만, 대수롭지 않게 넘겼다.',
          '{g} 깊은 곳에서 뭔가가 움직인 것 같았다... 착각이었을까.',
          '이상한 기운이 느껴졌다가 사라졌다.',
          '{g} 사이에서 무언가가 빛을 반사한 것 같았는데... 기분 탓인가.',
          '눈 끝에 무언가가 걸렸지만, 돌아봤을 땐 아무것도 없었다.',
          '{g} 어딘가에서 작은 소리가 들린 것 같았다.',
          '낯선 냄새가 코끝을 스쳤지만, 이내 사라졌다.',
          '손이 닿을 것 같은 곳에 뭔가가 있었지만, 그냥 지나쳤다.',
        ], loc.gatherEnv));
      }

      result.gatherSim = {
        icon: resolveGatherIcon(p.currentLocation),
        title: resolveGatherTitle(p.currentLocation),
        activityKey: `gather_${p.currentLocation}`,
        effectType: 'random_loot',
        rewardText,
        isEmpty: false,
      };
      result.screenChange = 'gather';
      break;
    }

    case 'move': result.messages.push('발걸음을 옮긴다.'); result.screenChange = 'move'; break;
    case 'talk': result.messages.push('대화를 시작한다.'); result.screenChange = 'talk'; break;
    case 'trade': result.messages.push('거래를 시작한다.'); result.screenChange = 'trade'; break;
    case 'dungeon': result.messages.push('던전으로 향한다.'); result.screenChange = 'dungeon'; break;
    case 'quest': result.messages.push('퀘스트 게시판을 확인한다.'); result.screenChange = 'quest'; break;
    case 'activity': result.screenChange = 'activity'; return result;
    case 'gift': result.screenChange = 'gift'; return result;
    case 'home':
      if (p.currentLocation === p.homeLocation || session.knowledge.ownedBases.has(p.currentLocation)) {
        p.base.ap = p.getEffectiveMaxAp();
      }
      result.messages.push('자택으로 돌아간다.');
      result.screenChange = 'home';
      break;
    case 'storage': result.screenChange = 'storage'; return result;
    case 'realestate': result.screenChange = 'realestate'; return result;
    case 'cooking': result.screenChange = 'cooking'; return result;
    case 'memory_spring': result.messages.push('기억의 샘에 다가간다.'); result.screenChange = 'memory_spring'; break;
    case 'skill_shop': result.screenChange = 'skill_shop'; return result;
    case 'guild_dungeon': result.screenChange = 'guild_dungeon'; return result;
    case 'life_job': result.screenChange = 'life_job'; return result;
    case 'ferry': result.messages.push('배편 창구로 향한다.'); result.screenChange = 'ferry'; break;
    case 'village': result.screenChange = 'village'; return result;

    // 정보 화면 (시간 소모 없음)
    case 'info_status':
    case 'info_color':
    case 'info_relations':
    case 'info_world':
    case 'info_backlog':
    case 'info_hyperion':
    case 'info_party':
    case 'info_titles':
    case 'info_map':
    case 'info_encyclopedia':
    case 'info_skills':
    case 'info_inventory':
      result.screenChange = action;
      return result; // 시간 경과 없이 리턴

    case 'save':
      result.screenChange = 'save';
      return result;

    default:
      break;
  }

  // 시간 경과 + NPC 시뮬레이션
  if (minutes > 0) {
    const prevSeason = session.world.getCurrentSeason();
    const prevDay = session.gameTime.day;

    // 월드 시뮬레이션: 시간 진행, 장소 컬러 영향, 이벤트, NPC 틱
    advanceTurn(
      minutes, session.gameTime, session.world, session.events,
      session.actors, session.playerIdx, session.backlog,
      session.social, session.knowledge,
    );

    // 날이 바뀌었으면 거점 패시브 효과 + 보관 패널티 적용
    if (session.gameTime.day !== prevDay) {
      const beMsgs = applyDailyBaseEffects(session);
      const storageMsgs = tickStoragePenalties(session);
      for (const msg of [...beMsgs, ...storageMsgs]) {
        session.backlog.add(session.gameTime, msg, '시스템');
        result.messages.push(msg);
      }
      // 농장 수확 후 칭호 체크
      const farmTitles = checkAndAwardTitles(session);
      for (const t of farmTitles) {
        session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
        result.messages.push(`✦ 칭호 획득: "${t}"`);
      }
    }

    // 버프 틱 처리
    if (session.playerBuffs.length > 0) {
      session.playerBuffs = session.playerBuffs.filter(b => {
        if (b.remainingTurns < 0) return true; // 영구 버프
        b.remainingTurns--;
        return b.remainingTurns >= 0;
      });
      // 버프 합산을 player variables에 반영
      const buffTotals: Record<string, number> = {};
      for (const b of session.playerBuffs) {
        buffTotals[b.type] = (buffTotals[b.type] ?? 0) + b.amount;
      }
      p.setVariable('buff_attack', buffTotals['attack'] ?? 0);
      p.setVariable('buff_defense', buffTotals['defense'] ?? 0);
      p.setVariable('buff_mp_regen', buffTotals['mp_regen'] ?? 0);
      // mp_regen 버프 즉시 적용
      const mRegen = buffTotals['mp_regen'] ?? 0;
      if (mRegen > 0) p.adjustMp(mRegen);
    }

    // HP 0 패배 처리
    if (p.base.hp <= 0) {
      if (SEA_ONLY_LOCATIONS.includes(p.currentLocation)) {
        // 해상 전용 지역: 그 자리에서 쓰러짐, 소량 회복, 자택으로 이동 불가
        p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.1));
        session.gameTime.advance(120); // 2시간 경과
        const defeatMsg = '쓰러졌다... 정신을 차려보니 여전히 같은 자리였다.';
        session.backlog.add(session.gameTime, `${p.name}이(가) 쓰러졌다가 제자리에서 깨어났다...`, '행동');
        result.messages.push(defeatMsg);
      } else {
        p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.5));
        const travelHome = session.world.getShortestMinutes(p.currentLocation, p.homeLocation, session.gameTime.day);
        const recoveryMinutes = 8 * 60; // 8시간 회복
        session.gameTime.advance(travelHome + recoveryMinutes);
        p.currentLocation = p.homeLocation;
        const defeatMsg = '쓰러졌다... 눈을 떠보니 자택이었다.';
        session.backlog.add(session.gameTime, `${p.name}이(가) 쓰러져 자택에서 깨어났다...`, '행동');
        result.messages.push(defeatMsg);
        result.screenChange = 'home';
      }
      return result;
    }

    // 이벤트 메시지 (backlog에서 최근 이벤트 확인)
    const recentLogs = session.backlog.getRecent(5);
    for (const entry of recentLogs) {
      if (entry.text.includes('[이벤트]') || entry.text.includes('이벤트 발생')) {
        const evName = entry.text.replace(/.*이벤트.*?:\s*/, '').split(':')[0];
        if (evName && !result.messages.includes(`✦ ${evName}`)) {
          result.messages.push(`✦ ${evName}`);
        }
      }
    }

    // 계절 변경 메시지
    const newSeason = session.world.getCurrentSeason();
    if (newSeason !== prevSeason) {
      result.messages.push(`🌿 ${seasonName(newSeason)} 시작`);
    }

    // 퀘스트 자동 완료 체크
    const activeQid = p.spirit.activeQuestId;
    if (activeQid >= 0) {
      const quest = session.social.getQuest(activeQid);
      if (quest && quest.currentAmount >= quest.targetAmount && quest.status === 1 /* Accepted */) {
        quest.status = 2; // Completed
        p.spirit.activeQuestId = -1;
        p.addGold(quest.rewardGold);
        session.knowledge.trackQuestCompleted(quest.title);
        session.backlog.add(session.gameTime, `퀘스트 "${quest.title}" 완료! +${quest.rewardGold}G`, '시스템', p.name);
        result.messages.push(`퀘스트 "${quest.title}" 완료! +${quest.rewardGold}G`);
        for (const t of checkAndAwardTitles(session)) {
          session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
          result.messages.push(`✦ 칭호 획득: "${t}"`);
        }
      }
    }

    // 히페리온 자동 판정 + 큐잉 + RDC 팩 해금 (공통 유틸)
    // 히페리온 레벨업 메시지는 오버레이에서만 표시 → result.messages에 푸시하지 않는다.
    // (단, 큐가 이미 외부 트리거로 채워졌다면 이번 턴에 오버레이를 띄운다.)
    const leveledNow = checkAndQueueHyperionLevelUps(session);
    const hasPending = session.pendingHyperionMsgs.length > 0;

    if (leveledNow) {
      // 히페리온 레벨업 시 동료 축하 대사 (result.messages + 백로그)
      const companions = session.actors.filter(a =>
        a !== p && session.knowledge.isCompanion(a.name) && a.currentLocation === p.currentLocation,
      );
      if (companions.length > 0) {
        const comp = companions[randomInt(0, companions.length - 1)];
        const stage = getRelationshipStage(p, comp.name, session.knowledge, session.actors, session.dungeonSystem);
        const raw = getDialogue(comp, stage);
        const celebLine = `${comp.name}: 「${raw}」`;
        result.messages.push(celebLine);
        session.backlog.add(session.gameTime, celebLine, '대사', p.name);
      }
    }

    // 외부(전투/상점/제작 등)에서 큐에 쌓인 메시지가 있거나 이번에 발생했으면 오버레이
    if (hasPending) {
      result.screenChange = 'hyperion_levelup';
    }
  }

  // 컬러 게이지 델타
  session.gaugeState.calcDelta(p.color.values);

  return result;
}
