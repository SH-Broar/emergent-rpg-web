// travel.ts — 이동 오버레이 화면 (이동 애니메이션 + 여행 이벤트)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { LocationID } from '../../types/location';
import { locationName } from '../../types/registry';
import { applyTimeTheme } from '../time-theme';
import { moveCompanions } from '../../systems/npc-interaction';
import { randomInt, randomFloat } from '../../types/rng';

// 현실 1초 = 게임 10분
const TICK_MS = 1000;
const GAME_MINS_PER_TICK = 10;

// ============================================================
// 여행 이벤트 — 지역 특성 기반
// ============================================================

interface TravelEvent {
  text: string;
  hpDelta?: number;
  goldDelta?: number;
}

const SCENERY_EVENTS: Record<string, string[]> = {
  Wilderness: [
    '황야에 바람이 세차게 분다.',
    '멀리서 야생 동물의 울음소리가 들린다.',
    '풀숲 사이로 작은 짐승이 스쳐 지나간다.',
    '광활한 하늘 아래 발걸음이 가벼워진다.',
  ],
  Mountain_Path: [
    '험준한 산길을 오른다. 숨이 가빠진다.',
    '바위 틈에서 신선한 샘물이 흘러내린다.',
    '안개가 자욱해 앞이 잘 보이지 않는다.',
    '정상에서 부는 바람이 땀을 식혀준다.',
  ],
  Lake: [
    '수면 위로 물새 한 마리가 날아오른다.',
    '맑은 호수에 하늘이 비친다.',
    '물가에서 잠시 발을 담그고 싶어진다.',
    '물안개가 주변을 부드럽게 감싼다.',
  ],
  Herb_Garden: [
    '향긋한 풀내음이 코를 간지럽힌다.',
    '이슬에 젖은 허브잎이 빛을 받아 반짝인다.',
    '꽃벌레 소리가 가득한 길을 걷는다.',
  ],
  Trade_Route: [
    '행상인의 마차가 반대 방향으로 지나간다.',
    '길가에 오래된 이정표가 서 있다.',
    '먼지가 자욱한 도로 위를 묵묵히 걷는다.',
    '멀리서 마차 바퀴 소리가 들려온다.',
  ],
  Bandit_Hideout: [
    '어디선가 시선이 느껴지는 것 같다.',
    '낡은 칼자국이 남아있는 바위가 눈에 띈다.',
    '빠르게 지나치는 것이 좋겠다는 생각이 든다.',
  ],
  _default: [
    '길을 따라 묵묵히 발걸음을 옮긴다.',
    '바람이 등 뒤에서 살며시 밀어준다.',
    '지나온 길을 뒤돌아보니 꽤 멀리 왔다.',
    '새소리를 들으며 천천히 걷는다.',
    '낯선 풍경이 눈앞에 펼쳐진다.',
  ],
};

const MONSTER_EVENTS_BY_LEVEL: [number, string][] = [
  [1, '작은 슬라임이 길을 막아섰지만, 쉽게 물리쳤다.'],
  [3, '고블린 무리와 맞닥뜨렸다. 짧은 전투 끝에 격퇴했다.'],
  [5, '산적 하나가 덤벼들었다. 상처를 입었지만 쫓아냈다.'],
  [8, '야수가 느닷없이 튀어나왔다. 가까스로 물리쳤지만 체력을 잃었다.'],
  [12, '강력한 마물과 마주쳤다! 혼신의 힘으로 격퇴했지만 크게 다쳤다.'],
];

function getMonsterText(monsterLevel: number): string {
  let text = MONSTER_EVENTS_BY_LEVEL[0][1];
  for (const [lvl, t] of MONSTER_EVENTS_BY_LEVEL) {
    if (monsterLevel >= lvl) text = t;
  }
  return text;
}

function rollTravelEvent(
  session: GameSession,
  fromId: LocationID,
  toId: LocationID,
): TravelEvent | null {
  const fromLoc = session.world.getLocation(fromId);
  const toLoc   = session.world.getLocation(toId);
  const avgDanger  = (fromLoc.dangerLevel  + toLoc.dangerLevel)  / 2;
  const avgMonster = (fromLoc.monsterLevel + toLoc.monsterLevel) / 2;

  // 이벤트 발생 확률: 기본 20% + 위험도당 5%
  const eventChance = 0.20 + avgDanger * 0.05;
  if (randomFloat(0, 1) > eventChance) return null;

  // 몬스터 vs 풍경 비율
  const monsterChance = Math.min(0.7, avgDanger * 0.08);

  if (randomFloat(0, 1) < monsterChance) {
    // 몬스터 이벤트
    const p = session.player;
    const monsterLvl = Math.max(1, Math.round(avgMonster + randomInt(-1, 1)));
    const text = getMonsterText(monsterLvl);

    // 플레이어 레벨 대비 피해량 결정
    const lvlDiff = monsterLvl - p.base.level;
    const baseDmg = Math.max(1, Math.round(avgMonster * 2 + lvlDiff * 3));
    const hpDmg = lvlDiff > 3
      ? randomInt(baseDmg, baseDmg * 2)
      : randomInt(0, baseDmg);
    p.adjustHp(-hpDmg);

    // 전리품: 골드 또는 HP 손실만
    let goldGain = 0;
    if (monsterLvl >= 3) {
      goldGain = randomInt(monsterLvl * 2, monsterLvl * 5);
      p.addGold(goldGain);
    }

    const details: string[] = [];
    if (hpDmg > 0) details.push(`HP -${hpDmg}`);
    if (goldGain > 0) details.push(`+${goldGain}G`);
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';

    return { text: text + suffix, hpDelta: -hpDmg, goldDelta: goldGain };
  }

  // 풍경/일반 이벤트
  const pool = SCENERY_EVENTS[fromId] ?? SCENERY_EVENTS[toId] ?? SCENERY_EVENTS._default;
  const all  = [...pool, ...SCENERY_EVENTS._default];
  const text = all[randomInt(0, all.length - 1)];
  return { text };
}

// ============================================================
// 이동 화면 생성
// ============================================================

export const TRAVEL_OVERLAY_THRESHOLD = 10; // 이 분 이하면 오버레이 없음

export function createTravelScreen(
  session: GameSession,
  fromId: LocationID,
  toId: LocationID,
  totalMinutes: number,
  onDone: () => void,
): Screen {
  let elapsed = 0;
  let tickHandle: ReturnType<typeof setInterval> | null = null;
  const eventLog: { time: string; text: string; isMonster: boolean }[] = [];
  let container: HTMLElement | null = null;
  let done = false;

  function finalize() {
    if (done) return;
    done = true;
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
    session.player.currentLocation = toId;
    moveCompanions(session.actors, session.knowledge, toId);
    session.knowledge.trackVisit(toId);
    session.backlog.add(
      session.gameTime,
      `${session.player.name}이(가) ${locationName(toId)}(으)로 이동했다.`,
      '행동',
    );
    onDone();
  }

  function skipAll() {
    if (done) return;
    const remaining = totalMinutes - elapsed;
    if (remaining > 0) session.gameTime.advance(remaining);
    applyTimeTheme(session.gameTime);
    finalize();
  }

  function tick() {
    if (done) return;
    const remaining = totalMinutes - elapsed;
    const step = Math.min(GAME_MINS_PER_TICK, remaining);
    session.gameTime.advance(step);
    elapsed += step;
    applyTimeTheme(session.gameTime);

    // 이벤트 롤
    const evt = rollTravelEvent(session, fromId, toId);
    if (evt) {
      const entry = {
        time: session.gameTime.toString(),
        text: evt.text,
        isMonster: (evt.hpDelta ?? 0) < 0,
      };
      eventLog.push(entry);
      session.backlog.add(session.gameTime, evt.text, '이동');
    }

    if (elapsed >= totalMinutes) {
      finalize();
      return;
    }

    if (container) redraw(container);
  }

  function redraw(el: HTMLElement) {
    const pct = Math.min(100, Math.round((elapsed / totalMinutes) * 100));
    const fromName = locationName(fromId);
    const toName   = locationName(toId);
    const logHtml  = eventLog.slice(-6).map(e =>
      `<div class="log-entry">
        <span class="log-time">${e.time}</span>
        <span class="log-text" style="color:${e.isMonster ? 'var(--accent)' : 'var(--warning)'}">${e.text}</span>
      </div>`
    ).join('');

    el.innerHTML = `
      <div class="screen" style="justify-content:space-between;padding:16px 12px;gap:12px">
        <div style="text-align:center">
          <div style="font-size:32px;margin-bottom:6px">🚶</div>
          <h2 style="margin-bottom:2px">이동 중</h2>
          <p style="color:var(--text-dim);font-size:14px">${fromName} → ${toName}</p>
          <p style="color:var(--warning);font-size:13px;margin-top:6px">${session.gameTime.toString()}</p>

          <div style="margin:14px auto 4px;max-width:340px">
            <div style="background:var(--bg-card);border-radius:8px;height:10px;overflow:hidden;border:1px solid var(--border)">
              <div style="background:var(--accent);height:100%;width:${pct}%;transition:width 0.7s ease;border-radius:8px"></div>
            </div>
            <p style="font-size:11px;color:var(--text-dim);margin-top:4px">${elapsed}분 경과 / 총 ${totalMinutes}분</p>
          </div>
        </div>

        <div class="log-area" style="flex:1;min-height:60px">
          ${logHtml || '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding-top:10px">이동 중...</p>'}
        </div>

        <button class="btn" data-skip style="flex-shrink:0">건너뜀 [Enter]</button>
      </div>`;

    el.querySelector('[data-skip]')?.addEventListener('click', skipAll);
  }

  return {
    id: 'travel',

    render(el) {
      container = el;
      redraw(el);
    },

    onEnter() {
      done = false;
      tickHandle = setInterval(tick, TICK_MS);
    },

    onExit() {
      if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
    },

    onKey(key) {
      if (key === 'Enter' || key === ' ') skipAll();
    },
  };
}
