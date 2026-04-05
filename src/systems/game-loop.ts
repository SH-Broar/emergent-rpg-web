// game-loop.ts — 이벤트 기반 턴 루프
// 원본: GameLoop.cpp 핵심 분기

import { GameSession } from './game-session';
import { weatherName, seasonName } from '../types/enums';
import { locationName } from '../types/registry';
import { randomInt, randomFloat } from '../types/rng';
import { updateHyperionLevels } from './hyperion';
import { advanceTurn } from './world-simulation';
import { findItemsBySource } from '../types/item-defs';

export type GameAction =
  | 'idle' | 'move' | 'look' | 'talk' | 'trade' | 'eat'
  | 'rest' | 'dungeon' | 'gather' | 'quest' | 'activity'
  | 'gift' | 'home' | 'memory_spring'
  | 'info_status' | 'info_color' | 'info_relations' | 'info_world'
  | 'info_backlog' | 'info_hyperion' | 'info_party' | 'info_titles' | 'info_map' | 'info_encyclopedia'
  | 'info_skills' | 'info_inventory'
  | 'save';

const ACTION_TIME: Partial<Record<GameAction, number>> = {
  idle: 30, move: 0, talk: 20, trade: 15, eat: 10,
  rest: 60, dungeon: 60, gather: 30, quest: 10,
  activity: 30, gift: 20, home: 60,
};

const AP_COST: Partial<Record<GameAction, number>> = {
  idle: 0, move: 0, talk: 0, trade: 0, eat: 0,
  rest: 1, dungeon: 0, gather: 1, quest: 0,
  activity: 1, gift: 0, home: 0, memory_spring: 0,
};

export interface TurnResult {
  messages: string[];
  levelUp: boolean;
  screenChange?: string;
}

export function processTurn(session: GameSession, action: GameAction): TurnResult {
  const result: TurnResult = { messages: [], levelUp: false };
  const p = session.player;
  if (!p) return result;

  const minutes = ACTION_TIME[action] ?? 0;

  // AP 검사 및 차감
  const apCost = AP_COST[action] ?? 0;
  if (apCost > 0 && !p.hasAp(apCost)) {
    result.messages.push('기력(TP)이 부족합니다. 자택에서 잠을 자면 회복됩니다.');
    return result;
  }
  if (apCost > 0) {
    p.adjustAp(-apCost);
  }

  // 컬러 게이지 스냅샷
  session.gaugeState.snapshot(p.color.values);

  switch (action) {
    case 'idle':
      session.backlog.add(session.gameTime, `${p.name}은(는) 주변을 둘러보며 시간을 보냈다.`, '행동');
      result.messages.push('주변을 관찰하며 시간을 보냈다.');
      break;

    case 'look': {
      const loc = session.world.getLocation(p.currentLocation);
      const npcsHere = session.actors.filter(a => a !== p && a.currentLocation === p.currentLocation);
      result.messages.push(`📍 ${locationName(p.currentLocation)}`);
      if (loc.description) result.messages.push(loc.description);
      if (npcsHere.length > 0) {
        result.messages.push(`이곳에 있는 사람: ${npcsHere.map(a => a.name).join(', ')}`);
      }
      result.messages.push(`날씨: ${weatherName(session.world.weather)}, 계절: ${seasonName(session.world.getCurrentSeason())}`);
      break;
    }

    case 'eat': result.messages.push('식사를 준비한다...'); result.screenChange = 'eat'; break;

    case 'rest':
      p.adjustVigor(40);
      p.adjustHp(10);
      session.backlog.add(session.gameTime, `${p.name}이(가) 휴식을 취했다.`, '행동');
      result.messages.push('휴식을 취했다. 기력 +40, HP +10');
      break;

    case 'gather': {
      const loc = session.world.getLocation(p.currentLocation);
      // Find items with source matching this location
      const gatherItems = findItemsBySource('gather:' + p.currentLocation);
      // Also include items from the location's resource types
      if (gatherItems.length === 0) {
        // 채집 불가 시 TP 환불
        if (apCost > 0) p.adjustAp(apCost);
        result.messages.push('이 지역에는 채집할 자원이 없다.');
        break;
      }
      // Level-based success rate
      const levelDiff = p.base.level - (loc.monsterLevel || 1);
      const chance = Math.max(0.2, Math.min(0.95, 0.7 + levelDiff * 0.03));
      if (randomFloat(0, 1) > chance) {
        result.messages.push('채집에 실패했다...');
        break;
      }
      // Pick random item from available
      const picked = gatherItems[randomInt(0, gatherItems.length - 1)];
      const amount = picked.rarity === 'rare' ? 1 : randomInt(1, 2);
      p.addItemById(picked.id, amount);
      session.knowledge.discoverItem(picked.id);
      session.backlog.add(session.gameTime, `${p.name}이(가) ${picked.name}을(를) ${amount}개 채집했다.`, '행동');
      result.messages.push(`채집 완료! ${picked.name} +${amount}개`);
      break;
    }

    case 'move': result.messages.push('발걸음을 옮긴다.'); result.screenChange = 'move'; break;
    case 'talk': result.messages.push('대화를 시작한다.'); result.screenChange = 'talk'; break;
    case 'trade': result.messages.push('거래를 시작한다.'); result.screenChange = 'trade'; break;
    case 'dungeon': result.messages.push('던전으로 향한다.'); result.screenChange = 'dungeon'; break;
    case 'quest': result.messages.push('퀘스트 게시판을 확인한다.'); result.screenChange = 'quest'; break;
    case 'activity': result.messages.push('활동을 시작한다.'); result.screenChange = 'activity'; break;
    case 'gift': result.messages.push('선물을 고른다.'); result.screenChange = 'gift'; break;
    case 'home':
      if (p.currentLocation === p.homeLocation) {
        p.base.ap = p.getEffectiveMaxAp(); // Full AP recovery on sleeping at home
      }
      result.messages.push('자택으로 돌아간다.');
      result.screenChange = 'home';
      break;
    case 'memory_spring': result.messages.push('기억의 샘에 다가간다.'); result.screenChange = 'memory_spring'; break;

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

    // 월드 시뮬레이션: 시간 진행, 플레이어 기력 감소, 장소 컬러 영향, 이벤트, NPC 틱
    advanceTurn(
      minutes, session.gameTime, session.world, session.events,
      session.actors, session.playerIdx, session.backlog,
      session.social, session.knowledge,
    );

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

    // 히페리온 자동 판정
    const hyperionMsgs = updateHyperionLevels(p, session.actors, session.knowledge, session.gameTime);
    for (const msg of hyperionMsgs) {
      session.backlog.add(session.gameTime, msg, '시스템');
      result.messages.push(msg);
    }
  }

  // 컬러 게이지 델타
  session.gaugeState.calcDelta(p.color.values);

  return result;
}
