// game-screen.ts — 메인 게임 HUD + 액션 버튼

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { GameAction } from '../../systems/game-loop';
import { processTurn } from '../../systems/game-loop';
import { locationName } from '../../types/registry';
import { weatherName, seasonName, raceName, spiritRoleName, elementName, Element, ELEMENT_COUNT } from '../../types/enums';

interface ActionDef {
  key: string;
  label: string;
  action: GameAction;
  icon: string;
  /** 이 액션이 보이려면 true를 반환해야 함. 없으면 항상 표시. */
  visible?: (session: GameSession) => boolean;
}

function atHome(session: GameSession) { return session.player.currentLocation === session.player.homeLocation; }
function atMemorySpring(session: GameSession) { return session.player.currentLocation === 'Memory_Spring'; }
function hasMerchants(session: GameSession) {
  const loc = session.player.currentLocation;
  return loc === 'Market_Square' || session.actors.some(a =>
    a !== session.player && a.currentLocation === loc && a.spirit.role === 1 /* Merchant */);
}
function nearDungeon(session: GameSession) {
  return session.dungeonSystem.isDungeonEntrance(session.player.currentLocation) ||
    session.dungeonSystem.getAllDungeons().some(d => d.accessFrom === session.player.currentLocation);
}
function hasNpcsHere(session: GameSession) {
  return session.actors.some(a => a !== session.player && a.currentLocation === session.player.currentLocation && a.isAlive());
}
function hasActivities(session: GameSession) {
  return session.activitySystem.hasActivities(session.player.currentLocation);
}
function atGuildHall(session: GameSession) { return session.player.currentLocation === 'Guild_Hall'; }

const MAIN_ACTIONS: ActionDef[] = [
  { key: '1', label: '대기', action: 'idle', icon: '⏳' },
  { key: '2', label: '이동', action: 'move', icon: '🚶' },
  { key: '3', label: '살펴보기', action: 'look', icon: '👁' },
  { key: '4', label: '대화', action: 'talk', icon: '💬', visible: hasNpcsHere },
  { key: '5', label: '거래', action: 'trade', icon: '💰', visible: hasMerchants },
  { key: '6', label: '식사', action: 'eat', icon: '🍖' },
  { key: '7', label: '휴식', action: 'rest', icon: '💤' },
  { key: '8', label: '던전', action: 'dungeon', icon: '⚔', visible: nearDungeon },
  { key: '9', label: '채집', action: 'gather', icon: '🌿' },
  { key: '0', label: '퀘스트', action: 'quest', icon: '📜', visible: atGuildHall },
  { key: 'a', label: '활동', action: 'activity', icon: '🔨', visible: hasActivities },
  { key: 'g', label: '선물', action: 'gift', icon: '🎁', visible: hasNpcsHere },
  { key: 'h', label: '자택', action: 'home', icon: '🏠', visible: atHome },
  { key: 'm', label: '기억의 샘', action: 'memory_spring', icon: '💧', visible: atMemorySpring },
];

const INFO_ACTIONS: ActionDef[] = [
  { key: 'i', label: '상태', action: 'info_status', icon: '📊' },
  { key: 'c', label: '컬러', action: 'info_color', icon: '🎨' },
  { key: 'r', label: '관계', action: 'info_relations', icon: '💕' },
  { key: 'w', label: '월드', action: 'info_world', icon: '🗺' },
  { key: 'b', label: '백로그', action: 'info_backlog', icon: '📖' },
  { key: 'y', label: '히페리온', action: 'info_hyperion', icon: '✦' },
  { key: 'p', label: '동료', action: 'info_party', icon: '👥' },
  { key: 't', label: '칭호', action: 'info_titles', icon: '🏅' },
  { key: 'M', label: '지도', action: 'info_map', icon: '🧭' },
  { key: 'S', label: '저장', action: 'save', icon: '💾' },
];

export function createGameScreen(
  session: GameSession,
  onScreenChange: (target: string) => void,
  onAfterTurn?: () => void,
): Screen {
  let accumulatedLog: string[] = [];
  let lastLocation = session.player?.currentLocation ?? '';

  function renderHud(el: HTMLElement) {
    const p = session.player;
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);
    const vigorPct = Math.round((p.base.vigor / p.getEffectiveMaxVigor()) * 100);

    // 지역 이동 시 로그 초기화
    if (p.currentLocation !== lastLocation) {
      accumulatedLog = [];
      lastLocation = p.currentLocation;
    }

    el.innerHTML = `
      <div class="screen game-screen">
        <div class="hud-bar">
          <div class="hud-location">${locationName(p.currentLocation)}</div>
          <div class="hud-time">${session.gameTime.toString()}</div>
          <div class="hud-weather">${weatherName(session.world.weather)} · ${seasonName(session.world.getCurrentSeason())}</div>
        </div>

        <div class="hud-stats">
          <div class="stat-bar">
            <span class="stat-label">HP</span>
            <div class="bar"><div class="bar-fill hp-bar" style="width:${hpPct}%"></div></div>
            <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
          </div>
          <div class="stat-bar">
            <span class="stat-label">기력</span>
            <div class="bar"><div class="bar-fill vigor-bar" style="width:${vigorPct}%"></div></div>
            <span class="stat-val">${Math.round(p.base.vigor)}/${Math.round(p.getEffectiveMaxVigor())}</span>
          </div>
          <div class="hud-mini">Lv.${p.base.level} · ${raceName(p.base.race)} · ${spiritRoleName(p.spirit.role)} · 💰${p.spirit.gold}G</div>
          <div class="hud-colors">
            ${[0,1,2,3,4,5,6,7].map(i => {
              const val = p.color.values[i];
              const scaled = Math.round((val - 0.5) * 200);
              const sign = scaled > 0 ? '+' : '';
              const delta = session.gaugeState.deltas[i];
              const arrow = delta > 0.01 ? '▲' : delta < -0.01 ? '▼' : '';
              return `<span class="hud-color-pip" title="${elementName(i as Element)}"><span class="hud-color-dot" style="background:var(--el-${i})"></span>${sign}${scaled}${arrow}</span>`;
            }).join('')}
          </div>
        </div>

        <div class="log-area" style="max-height:30vh;overflow-y:auto">
          ${accumulatedLog.map(m => `<div class="log-msg">${m}</div>`).join('')}
        </div>

        <div class="action-grid">
          ${MAIN_ACTIONS.filter(a => !a.visible || a.visible(session)).map(a => `
            <button class="btn action-btn" data-action="${a.action}" title="[${a.key}]">
              <span class="action-icon">${a.icon}</span>
              <span class="action-label">${a.label}</span>
              <span class="action-key">${a.key}</span>
            </button>
          `).join('')}
        </div>

        <div class="info-bar">
          ${INFO_ACTIONS.map(a => `
            <button class="btn info-btn" data-action="${a.action}" title="[${a.key}]">${a.label}</button>
          `).join('')}
        </div>
      </div>`;

    // 버튼 이벤트
    el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action as GameAction, el));
    });
  }

  function handleAction(action: GameAction, el: HTMLElement) {
    const result = processTurn(session, action);
    // 새 메시지를 누적 로그 맨 위에 추가 (최신이 위)
    for (let i = result.messages.length - 1; i >= 0; i--) accumulatedLog.unshift(result.messages[i]);
    if (result.screenChange) {
      onScreenChange(result.screenChange);
      onAfterTurn?.();
      return;
    }
    renderHud(el);
    onAfterTurn?.();
  }

  // 키 매핑
  const keyMap = new Map<string, GameAction>();
  for (const a of [...MAIN_ACTIONS, ...INFO_ACTIONS]) {
    keyMap.set(a.key, a.action);
  }
  keyMap.set('S', 'save');
  keyMap.set('s', 'save');

  return {
    id: 'game',
    render: renderHud,
    onKey(key) {
      const action = keyMap.get(key);
      if (action) {
        const container = document.querySelector('.game-screen')?.parentElement;
        if (container instanceof HTMLElement) handleAction(action, container);
      }
    },
  };
}

// --- Info panel screens ---

export function createInfoScreen(
  session: GameSession,
  type: string,
  onBack: () => void,
): Screen {
  return {
    id: `info-${type}`,
    render(el) {
      const p = session.player;
      let html = '<div class="screen info-screen">';
      html += `<button class="btn back-btn" data-back>← 뒤로 [Esc]</button>`;

      switch (type) {
        case 'info_status':
          html += `<h2>${p.name} 상태</h2>
            <div class="info-grid">
              <div>종족: ${raceName(p.base.race)}</div>
              <div>역할: ${spiritRoleName(p.spirit.role)}</div>
              <div>레벨: ${p.base.level} (EXP ${p.base.exp})</div>
              <div>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</div>
              <div>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>
              <div>기력: ${Math.round(p.base.vigor)}/${Math.round(p.getEffectiveMaxVigor())}</div>
              <div>공격: ${p.getEffectiveAttack().toFixed(1)}</div>
              <div>방어: ${p.getEffectiveDefense().toFixed(1)}</div>
              <div>골드: ${p.spirit.gold}G</div>
              <div>히페리온: Lv.${p.hyperionLevel}</div>
            </div>`;
          break;

        case 'info_color':
          html += `<h2>컬러 속성</h2><div class="color-list">`;
          for (let i = 0; i < ELEMENT_COUNT; i++) {
            const val = p.color.values[i];
            const scaled = Math.round((val - 0.5) * 200);
            const sign = scaled > 0 ? '+' : '';
            const barPct = Math.round(val * 100);
            html += `<div class="color-row">
              <span class="el-name">${elementName(i as Element)}</span>
              <div class="bar"><div class="bar-fill" style="width:${barPct}%;background:var(--el-${i})"></div></div>
              <span>${sign}${scaled}</span>
            </div>`;
          }
          html += '</div>';
          break;

        case 'info_relations': {
          html += `<h2>관계</h2><div class="rel-list">`;
          if (p.relationships.size === 0) {
            html += '<p>아직 형성된 관계가 없습니다.</p>';
          }
          for (const [name, rel] of p.relationships) {
            html += `<div class="rel-row">
              <span>${name}</span>
              <span>신뢰 ${rel.trust.toFixed(2)} · 호감 ${rel.affinity.toFixed(2)}</span>
            </div>`;
          }
          html += '</div>';
          break;
        }

        case 'info_world': {
          html += `<h2>월드 정보</h2>`;
          html += `<div>계절: ${seasonName(session.world.getCurrentSeason())} (${session.world.seasonSchedule.daysLeft(session.gameTime.day)}일 남음)</div>`;
          html += `<div>날씨: ${weatherName(session.world.weather)}</div>`;
          html += `<div>장소 수: ${session.world.getAllLocations().size}</div>`;
          const neighbors = session.world.getNeighbors(p.currentLocation, session.gameTime.day);
          html += `<div>인접 장소: ${neighbors.map(n => locationName(n)).join(', ')}</div>`;
          break;
        }

        case 'info_backlog': {
          html += `<h2>백로그</h2><div class="backlog-list">`;
          const entries = session.backlog.getRecent(30);
          for (const e of entries.reverse()) {
            html += `<div class="backlog-entry"><span class="bl-time">${e.time.toString()}</span> ${e.text}</div>`;
          }
          html += '</div>';
          break;
        }

        default:
          html += `<h2>${type}</h2><p>준비 중...</p>`;
      }

      html += '</div>';
      el.innerHTML = html;
      el.querySelector('[data-back]')?.addEventListener('click', onBack);
    },
    onKey(key) {
      if (key === 'Escape' || key === 'q') onBack();
    },
  };
}

// --- Move screen ---
export function createMoveScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  return {
    id: 'move',
    render(el) {
      const p = session.player;
      const routes = session.world.getOutgoingRoutes(p.currentLocation, session.gameTime.day);
      el.innerHTML = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>이동</h2>
          <p>현재: ${locationName(p.currentLocation)}</p>
          <div class="menu-buttons">
            ${routes.map(([loc, mins], i) => `
              <button class="btn" data-loc="${loc}">${i + 1}. ${locationName(loc)} (${mins}분)</button>
            `).join('')}
          </div>
        </div>`;
      el.querySelector('[data-back]')?.addEventListener('click', onDone);
      el.querySelectorAll<HTMLButtonElement>('[data-loc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const loc = btn.dataset.loc!;
          const mins = routes.find(r => r[0] === loc)?.[1] ?? 30;
          p.currentLocation = loc;
          session.gameTime.advance(mins);
          session.backlog.add(session.gameTime, `${p.name}이(가) ${locationName(loc)}(으)로 이동했다.`, '행동');
          session.knowledge.trackVisit(loc);
          onDone();
        });
      });
    },
    onKey(key) {
      if (key === 'Escape') onDone();
      if (/^[1-9]$/.test(key)) {
        const routes = session.world.getOutgoingRoutes(session.player.currentLocation, session.gameTime.day);
        const i = parseInt(key, 10) - 1;
        if (i < routes.length) {
          const [loc, mins] = routes[i];
          session.player.currentLocation = loc;
          session.gameTime.advance(mins);
          session.backlog.add(session.gameTime, `${session.player.name}이(가) ${locationName(loc)}(으)로 이동했다.`, '행동');
          onDone();
        }
      }
    },
  };
}
