// travel.ts — 이동 오버레이 화면
// - rAF 기반 부드러운 진행 바
// - 상호작용 이벤트 발생 시 일시정지
// - 이동속도를 msPerGameMinute 으로 추상화 (아이템/스킬 연동 대비)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { LocationID } from '../../types/location';
import { locationName } from '../../types/registry';
import { applyTimeTheme } from '../time-theme';
import { moveCompanions, getDialogue, getRelationshipStage } from '../../systems/npc-interaction';
import { randomInt, randomFloat } from '../../types/rng';
import { advanceTurnByChunks } from '../../systems/world-simulation';

// ============================================================
// 이동 설정
// ============================================================

/** 이 분 이하 이동은 오버레이 없이 즉시 처리 */
export const TRAVEL_OVERLAY_THRESHOLD_MINUTES = 5;

/** 게임 1분당 실제 소요 밀리초 (기본값: 100ms → 현실 1초 = 게임 10분) */
const DEFAULT_MS_PER_GAME_MINUTE = 100;

/** 게임 시간 틱 단위 (분) */
const GAME_MINS_PER_TICK = 10;

export interface TravelOptions {
  /**
   * 게임 1분당 실제 소요 밀리초.
   * 이동속도 아이템/스킬로 조정 가능. 기본값 100.
   * 예) 빠른 부츠 아이템 → 50 (현실 1초 = 게임 20분)
   */
  msPerGameMinute?: number;
}

// ============================================================
// 여행 이벤트 정의
// ============================================================

/** auto: 로그에만 추가, interactive: 일시정지 후 플레이어 확인 필요 */
type EventKind = 'auto' | 'interactive';

interface TravelEvent {
  kind: EventKind;
  icon: string;
  title: string;
  body: string;
  hpDelta?: number;
  goldDelta?: number;
}

const SCENERY_POOL: Record<string, string[]> = {
  Cyan_Dunes:      ['황야에 바람이 세차게 분다.', '멀리서 야생 동물의 울음소리가 들린다.', '풀숲 사이로 작은 짐승이 스쳐 지나간다.', '광활한 하늘 아래 발걸음이 가벼워진다.'],
  Tiklit_Range:    ['험준한 산길을 오른다. 숨이 가빠진다.', '바위 틈에서 신선한 샘물이 흘러내린다.', '안개가 자욱해 앞이 잘 보이지 않는다.', '정상에서 부는 바람이 땀을 식혀준다.'],
  Erumen_Seoncheon: ['수면 위로 물새 한 마리가 날아오른다.', '맑은 호수에 하늘이 비친다.', '물안개가 주변을 부드럽게 감싼다.'],
  Herb_Garden:     ['향긋한 풀내음이 코를 간지럽힌다.', '이슬에 젖은 허브잎이 빛을 받아 반짝인다.'],
  Ekres:           ['행상인의 마차가 반대 방향으로 지나간다.', '길가에 오래된 이정표가 서 있다.', '먼지가 자욱한 도로 위를 묵묵히 걷는다.'],
  Bandit_Hideout:  ['어디선가 시선이 느껴지는 것 같다.', '낡은 칼자국이 남아있는 바위가 눈에 띈다.'],
  _default:        ['길을 따라 묵묵히 발걸음을 옮긴다.', '바람이 등 뒤에서 살며시 밀어준다.', '지나온 길을 뒤돌아보니 꽤 멀리 왔다.', '새소리를 들으며 천천히 걷는다.', '낯선 풍경이 눈앞에 펼쳐진다.'],
};

const MONSTER_TABLE: [number, string, string][] = [
  [1,  '슬라임 출현',   '작은 슬라임이 길을 막아섰다. 간단히 처치했다.'],
  [3,  '고블린 무리',   '고블린 무리와 맞닥뜨렸다. 짧은 교전 끝에 격퇴했다.'],
  [5,  '산적',          '산적 하나가 덤벼들었다. 상처를 입었지만 쫓아냈다.'],
  [8,  '야수',          '야수가 느닷없이 튀어나왔다. 가까스로 물리쳤지만 체력을 잃었다.'],
  [12, '강화 마물',     '강력한 마물과 마주쳤다! 혼신의 힘으로 격퇴했지만 크게 다쳤다.'],
];

function rollMonsterEvent(session: GameSession, avgMonster: number, avgDanger: number): TravelEvent {
  const p = session.player;
  const monsterLvl = Math.max(1, Math.round(avgMonster + randomInt(-1, 1)));

  let title = MONSTER_TABLE[0][1];
  let desc  = MONSTER_TABLE[0][2];
  for (const [lvl, t, d] of MONSTER_TABLE) {
    if (monsterLvl >= lvl) { title = t; desc = d; }
  }

  const lvlDiff = monsterLvl - p.base.level;
  const baseDmg = Math.max(1, Math.round(avgMonster * 2 + lvlDiff * 3));
  const hpDmg   = lvlDiff > 3 ? randomInt(baseDmg, baseDmg * 2) : randomInt(0, baseDmg);
  p.adjustHp(-hpDmg);

  let goldGain = 0;
  if (monsterLvl >= 3) {
    goldGain = randomInt(monsterLvl * 2, monsterLvl * 5);
    p.addGold(goldGain);
  }

  const outcomeLines: string[] = [desc];
  if (hpDmg > 0)   outcomeLines.push(`HP -${hpDmg}`);
  if (goldGain > 0) outcomeLines.push(`전리품 +${goldGain}G`);

  // 위험도가 높을수록 상호작용 이벤트로 처리
  const isInteractive = avgDanger >= 3 || monsterLvl >= 5;

  return {
    kind:      isInteractive ? 'interactive' : 'auto',
    icon:      '⚔️',
    title,
    body:      outcomeLines.join(' · '),
    hpDelta:   -hpDmg,
    goldDelta: goldGain,
  };
}

function rollTravelEvent(
  session: GameSession,
  fromId: LocationID,
  toId:   LocationID,
): TravelEvent | null {
  const fromLoc = session.world.getLocation(fromId);
  const toLoc   = session.world.getLocation(toId);
  const avgDanger  = (fromLoc.dangerLevel  + toLoc.dangerLevel)  / 2;
  const avgMonster = (fromLoc.monsterLevel + toLoc.monsterLevel) / 2;

  const eventChance = 0.20 + avgDanger * 0.05;
  if (randomFloat(0, 1) > eventChance) return null;

  const monsterChance = Math.min(0.7, avgDanger * 0.08);
  if (randomFloat(0, 1) < monsterChance) {
    return rollMonsterEvent(session, avgMonster, avgDanger);
  }

  // 풍경 이벤트 (auto)
  const pool = SCENERY_POOL[fromId] ?? SCENERY_POOL[toId] ?? SCENERY_POOL._default;
  const all  = [...pool, ...SCENERY_POOL._default];
  const text = all[randomInt(0, all.length - 1)];
  return { kind: 'auto', icon: '🌿', title: '풍경', body: text };
}

// ============================================================
// 이동 화면
// ============================================================

export function createTravelScreen(
  session: GameSession,
  fromId:  LocationID,
  toId:    LocationID,
  totalMinutes: number,
  onDone:  () => void,
  options?: TravelOptions,
): Screen {
  const msPerGameMinute = options?.msPerGameMinute ?? DEFAULT_MS_PER_GAME_MINUTE;
  const totalRealMs     = totalMinutes * msPerGameMinute;
  const tickRealMs      = GAME_MINS_PER_TICK * msPerGameMinute;

  // ── 실시간 추적 ──────────────────────────────────────────────
  let accumulatedRealMs = 0;   // 현재 run 이전까지 누적 실제 경과 ms
  let runStartTime      = 0;   // 현재 run의 Date.now() 기준점
  let paused            = false;
  let done              = false;

  // ── 게임 시간 틱 ────────────────────────────────────────────
  let gameElapsedMinutes = 0;  // 게임에서 실제로 advance된 분
  let tickHandle: ReturnType<typeof setInterval> | null = null;

  // ── rAF ─────────────────────────────────────────────────────
  let rafHandle: number | null = null;

  // ── 동료 대사 (이동 중 1회만) ───────────────────────────────
  let companionSpoke = false;

  // ── DOM refs ────────────────────────────────────────────────
  let progressBarEl: HTMLElement | null = null;
  let timeDisplayEl: HTMLElement | null = null;
  let elapsedLabelEl: HTMLElement | null = null;
  let logAreaEl: HTMLElement | null = null;
  let overlayEl: HTMLElement | null = null;
  const eventLog: { time: string; text: string; isMonster: boolean }[] = [];

  // ── 현재 실제 경과 ms ────────────────────────────────────────
  function realElapsedMs(): number {
    if (paused || runStartTime === 0) return accumulatedRealMs;
    return accumulatedRealMs + (Date.now() - runStartTime);
  }

  // ── 완료 처리 ────────────────────────────────────────────────
  function finalize() {
    if (done) return;
    done = true;
    stopTimers();
    // 남은 게임 시간 보정
    const remaining = totalMinutes - gameElapsedMinutes;
    if (remaining > 0) {
      advanceTurnByChunks(
        remaining,
        session.gameTime,
        session.world,
        session.events,
        session.actors,
        session.playerIdx,
        session.backlog,
        session.social,
        session.knowledge,
      );
      gameElapsedMinutes += remaining;
    }
    applyTimeTheme(session.gameTime);
    session.player.currentLocation = toId;
    moveCompanions(session.actors, session.knowledge, toId);
    session.knowledge.trackVisit(toId);
    session.backlog.add(session.gameTime, `${session.player.name}이(가) ${locationName(toId)}(으)로 이동했다.`, '행동');
    onDone();
  }

  function stopTimers() {
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
    if (rafHandle  !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
  }

  // ── 일시정지 / 재개 ──────────────────────────────────────────
  function pause() {
    if (paused || done) return;
    paused = true;
    accumulatedRealMs += Date.now() - runStartTime;
    if (tickHandle !== null) { clearInterval(tickHandle); tickHandle = null; }
  }

  function resume() {
    if (!paused || done) return;
    paused = false;
    runStartTime = Date.now();
    startTick();
  }

  // ── 게임 시간 틱 ────────────────────────────────────────────
  function startTick() {
    if (tickHandle !== null) return;
    tickHandle = setInterval(() => {
      if (paused || done) return;
      session.player.adjustMp(1);
      const step = Math.min(GAME_MINS_PER_TICK, totalMinutes - gameElapsedMinutes);
      advanceTurnByChunks(
        step,
        session.gameTime,
        session.world,
        session.events,
        session.actors,
        session.playerIdx,
        session.backlog,
        session.social,
        session.knowledge,
      );
      gameElapsedMinutes += step;
      applyTimeTheme(session.gameTime);

      const evt = rollTravelEvent(session, fromId, toId);
      if (evt) {
        session.backlog.add(session.gameTime, evt.body, '이동');
        if (evt.kind === 'interactive') {
          eventLog.push({ time: session.gameTime.toString(), text: evt.body, isMonster: true });
          updateLog();
          showInteractiveOverlay(evt);
        } else {
          eventLog.push({ time: session.gameTime.toString(), text: evt.body, isMonster: (evt.hpDelta ?? 0) < 0 });
          updateLog();
        }
      }

      // 동료 대사 — 이동 중 1회, 30% 확률
      if (!companionSpoke && randomFloat(0, 1) < 0.30) {
        const companions = session.actors.filter(a =>
          a !== session.player && session.knowledge.isCompanion(a.name),
        );
        if (companions.length > 0) {
          const comp = companions[randomInt(0, companions.length - 1)];
          const stage = getRelationshipStage(session.player, comp.name, session.knowledge, session.actors);
          const line = getDialogue(comp, stage, 'travel');
          const entry = `${comp.name}: 「${line}」`;
          eventLog.push({ time: session.gameTime.toString(), text: entry, isMonster: false });
          session.backlog.add(session.gameTime, entry, '대사', session.player.name);
          updateLog();
          companionSpoke = true;
        }
      }

      if (gameElapsedMinutes >= totalMinutes) finalize();
    }, tickRealMs);
  }

  // ── rAF 루프 — 진행 바 + 시간 표시 부드럽게 업데이트 ─────────
  function rafLoop() {
    if (done) return;
    rafHandle = requestAnimationFrame(rafLoop);

    const elapsed = Math.min(realElapsedMs(), totalRealMs);
    const pct     = (elapsed / totalRealMs) * 100;

    if (progressBarEl) progressBarEl.style.width = `${pct.toFixed(2)}%`;
    if (timeDisplayEl) timeDisplayEl.textContent  = session.gameTime.toString();

    // 경과 분 표시 (게임 시간 기준)
    if (elapsedLabelEl) {
      elapsedLabelEl.textContent = `${gameElapsedMinutes}분 경과 / 총 ${totalMinutes}분`;
    }
  }

  // ── 로그 영역 업데이트 (전체 재렌더 없이) ───────────────────
  function updateLog() {
    if (!logAreaEl) return;
    const recent = eventLog.slice(-6);
    if (recent.length === 0) return;
    logAreaEl.innerHTML = recent.map(e =>
      `<div class="log-entry">
        <span class="log-time">${e.time}</span>
        <span class="log-text" style="color:${e.isMonster ? 'var(--accent)' : 'var(--warning)'}">${e.text}</span>
      </div>`
    ).join('');
  }

  // ── 상호작용 이벤트 오버레이 ────────────────────────────────
  function showInteractiveOverlay(evt: TravelEvent) {
    pause();
    if (!overlayEl) return;

    const hpLine   = evt.hpDelta   ? `<p style="color:var(--accent);font-size:13px">HP ${evt.hpDelta}</p>` : '';
    const goldLine = evt.goldDelta  ? `<p style="color:var(--warning);font-size:13px">+${evt.goldDelta}G</p>` : '';

    overlayEl.innerHTML = `
      <div style="font-size:40px;margin-bottom:8px">${evt.icon}</div>
      <h3 style="margin-bottom:6px;color:var(--accent)">${evt.title}</h3>
      <p style="font-size:14px;text-align:center;line-height:1.6;margin-bottom:8px;color:var(--text)">${evt.body.split(' · ')[0]}</p>
      ${hpLine}${goldLine}
      <button class="btn btn-primary" data-resume style="margin-top:16px;min-width:140px">계속 이동 [Enter]</button>`;
    overlayEl.style.display = 'flex';

    overlayEl.querySelector('[data-resume]')?.addEventListener('click', () => {
      overlayEl!.style.display = 'none';
      resume();
    });
  }

  // ── 초기 DOM 구성 ────────────────────────────────────────────
  function buildShell(el: HTMLElement) {
    const fromName = locationName(fromId);
    const toName   = locationName(toId);

    el.innerHTML = `
      <div style="width:100%;height:100%;position:relative;display:flex;flex-direction:column">
        <div class="screen" style="justify-content:space-between;padding:16px 12px;gap:12px">
          <div style="text-align:center">
            <div style="font-size:32px;margin-bottom:6px">🚶</div>
            <h2 style="margin-bottom:2px">이동 중</h2>
            <p style="color:var(--text-dim);font-size:14px">${fromName} → ${toName}</p>
            <p data-time style="color:var(--warning);font-size:13px;margin-top:6px">${session.gameTime.toString()}</p>
            <div style="margin:14px auto 0;max-width:340px">
              <div style="background:var(--bg-card);border-radius:8px;height:10px;overflow:hidden;border:1px solid var(--border)">
                <div data-bar style="background:var(--accent);height:100%;width:0%;border-radius:8px"></div>
              </div>
              <p data-elapsed style="font-size:11px;color:var(--text-dim);margin-top:4px">0분 경과 / 총 ${totalMinutes}분</p>
            </div>
          </div>
          <div class="log-area" data-log style="flex:1;min-height:60px">
            <p style="color:var(--text-dim);font-size:13px;text-align:center;padding-top:10px">이동 중...</p>
          </div>
        </div>
        <div data-overlay style="
          display:none; position:absolute; inset:0;
          background:rgba(0,0,0,0.88); border-radius:8px;
          flex-direction:column; align-items:center; justify-content:center;
          gap:6px; padding:28px 20px; z-index:10;
        "></div>
      </div>`;

    progressBarEl  = el.querySelector('[data-bar]');
    timeDisplayEl  = el.querySelector('[data-time]');
    elapsedLabelEl = el.querySelector('[data-elapsed]');
    logAreaEl      = el.querySelector('[data-log]');
    overlayEl      = el.querySelector('[data-overlay]');
  }

  // ── Screen 반환 ──────────────────────────────────────────────
  return {
    id: 'travel',

    render(el) {
      buildShell(el);
    },

    onEnter() {
      done   = false;
      paused = false;
      runStartTime = Date.now();
      startTick();
      rafLoop();
    },

    onExit() {
      stopTimers();
    },

    onKey(key) {
      if ((key === 'Enter' || key === ' ') && overlayEl && overlayEl.style.display !== 'none') {
        // 오버레이가 열려있을 때만 Enter로 확인
        overlayEl.style.display = 'none';
        resume();
      }
    },
  };
}
