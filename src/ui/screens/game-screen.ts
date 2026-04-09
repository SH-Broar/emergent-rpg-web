// game-screen.ts — 메인 게임 HUD + 액션 버튼

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { GameAction } from '../../systems/game-loop';
import type { Actor } from '../../models/actor';
import { processTurn } from '../../systems/game-loop';
import { moveCompanions, getRelationshipStage, tryNpcInitiatedConversation } from '../../systems/npc-interaction';
import { locationName } from '../../types/registry';
import { getZoneColor } from './world-map';
import { weatherName, seasonName, raceName, spiritRoleName, elementName, Element, ELEMENT_COUNT, ItemType } from '../../types/enums';
import { getItemDef, getWeaponDef, getArmorDef, categoryName } from '../../types/item-defs';
import { applyTimeTheme } from '../time-theme';
import { TRAVEL_OVERLAY_THRESHOLD_MINUTES } from './travel';
import { canNotifyRandomEvent } from '../../systems/world-simulation';

interface ActionDef {
  key: string;
  label: string;
  action: GameAction;
  icon: string;
  /** 이 액션이 보이려면 true를 반환해야 함. 없으면 항상 표시. */
  visible?: (session: GameSession) => boolean;
}

function atHome(session: GameSession) {
  return session.player.currentLocation === session.player.homeLocation
    || session.knowledge.ownedBases.has(session.player.currentLocation);
}
function atMemorySpring(session: GameSession) { return session.player.currentLocation === 'Memory_Spring'; }
function atBase(session: GameSession) {
  return session.knowledge.ownedBases.has(session.player.currentLocation);
}
function canTrade(session: GameSession) {
  const loc = session.player.currentLocation;
  // 시장에서는 항상 거래 가능, 그 외에는 주변 상인 NPC가 있을 때만
  if (loc === 'Market_Square') return true;
  return session.actors.some(a =>
    a !== session.player && a.currentLocation === loc && a.spirit.role === 1 /* Merchant */);
}
function nearDungeon(session: GameSession) {
  return session.dungeonSystem.getAllDungeons().some(d => d.accessFrom === session.player.currentLocation);
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
  { key: '3', label: '대화', action: 'talk', icon: '💬', visible: hasNpcsHere },
  { key: '4', label: '거래', action: 'trade', icon: '💰', visible: canTrade },
  { key: '5', label: '소지품', action: 'info_inventory' as GameAction, icon: '🎒' },
  { key: '6', label: '휴식', action: 'rest', icon: '💤' },
  { key: '7', label: '던전', action: 'dungeon', icon: '⚔', visible: nearDungeon },
  { key: '8', label: '채집', action: 'gather', icon: '🌿' },
  { key: '9', label: '퀘스트', action: 'quest', icon: '📜', visible: atGuildHall },
  { key: '0', label: '활동', action: 'activity', icon: '🔨', visible: hasActivities },
  { key: 'g', label: '선물', action: 'gift', icon: '🎁', visible: hasNpcsHere },
  { key: 'h', label: '자택', action: 'home', icon: '🏠', visible: atHome },
  { key: 'n', label: '부동산', action: 'realestate' as GameAction, icon: '🏘', visible: atGuildHall },
  { key: 'f', label: '초대', action: 'npc_invite' as GameAction, icon: '🏡', visible: atBase },
  { key: 'm', label: '기억의 샘', action: 'memory_spring', icon: '💧', visible: atMemorySpring },
];

const INFO_ACTIONS: ActionDef[] = [
  { key: 'i', label: '상태', action: 'info_status', icon: '📊' },
  { key: 'r', label: '관계', action: 'info_relations', icon: '💕' },
  { key: 'b', label: '백로그', action: 'info_backlog', icon: '📖' },
  { key: 'y', label: '히페리온', action: 'info_hyperion', icon: '✦' },
  { key: 'p', label: '동료', action: 'info_party', icon: '👥' },
  { key: 't', label: '칭호', action: 'info_titles', icon: '🏅' },
  { key: 'M', label: '지도', action: 'info_map', icon: '🧭' },
  { key: 'e', label: '도감', action: 'info_encyclopedia', icon: '📚' },
  { key: 'k', label: '스킬', action: 'info_skills' as GameAction, icon: '⚡' },
  { key: 'S', label: '저장', action: 'save', icon: '💾' },
];

const ACTION_TP_COST: Partial<Record<GameAction, number>> = {
  rest: 1,
  gather: 1,
};

function renderTpCostPips(tpCost: number): string {
  if (tpCost <= 0) return '';
  return `<span class="tp-cost-stack" aria-label="TP ${tpCost}" title="TP ${tpCost}">${Array.from(
    { length: tpCost },
    () => '<span class="tp-cost-pip"></span>'
  ).join('')}</span>`;
}

// ============================================================
// HUD 미니맵 — 현재 위치 중심 BFS 2홉 이내 장소
// ============================================================
function buildMiniMapSvg(session: GameSession, W = 200, H = 120): string {
  const playerLoc = session.player.currentLocation;
  const world = session.world;
  const allLocs = world.getAllLocations();
  const playerData = allLocs.get(playerLoc);
  if (!playerData) return '';

  // BFS 깊이 ≤ 2로 주변 장소 수집
  const nearby = new Map(allLocs);
  // 실제로는 2홉 이내만 표시
  const inRange = new Map<string, typeof playerData>();
  inRange.set(playerLoc, playerData);
  const queue: [string, number][] = [[playerLoc, 0]];
  while (queue.length > 0) {
    const [locId, depth] = queue.shift()!;
    if (depth >= 2) continue;
    const loc = allLocs.get(locId);
    if (!loc) continue;
    for (const link of [...loc.linksBidirectional, ...loc.linksOneWayOut]) {
      if (!inRange.has(link.target)) {
        const target = allLocs.get(link.target);
        if (target) { inRange.set(link.target, target); queue.push([link.target, depth + 1]); }
      }
    }
  }
  void nearby;

  const locs = [...inRange.values()];
  if (locs.length <= 1) return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;border-radius:4px;background:rgba(5,5,20,0.85);border:1px solid #2a2a4a;flex-shrink:0"><text x="${W/2}" y="${H/2+4}" text-anchor="middle" font-size="9" fill="#555577" font-family="monospace">연결 없음</text></svg>`;

  // 좌표 범위 계산
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const loc of locs) {
    if (loc.gridX < minX) minX = loc.gridX;
    if (loc.gridX > maxX) maxX = loc.gridX;
    if (loc.gridY < minY) minY = loc.gridY;
    if (loc.gridY > maxY) maxY = loc.gridY;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.18;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;

  const M = 10;
  function toSvg(gx: number, gy: number): [number, number] {
    const sx = M + ((gx - minX) / (maxX - minX)) * (W - M * 2);
    const sy = (H - M) - ((gy - minY) / (maxY - minY)) * (H - M * 2);
    return [+sx.toFixed(1), +sy.toFixed(1)];
  }

  let svg = '';

  // 연결선
  const drawn = new Set<string>();
  for (const loc of locs) {
    const [x1, y1] = toSvg(loc.gridX, loc.gridY);
    for (const link of [...loc.linksBidirectional, ...loc.linksOneWayOut]) {
      if (!inRange.has(link.target)) continue;
      const key = [loc.id, link.target].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const t = allLocs.get(link.target);
      if (!t) continue;
      const [x2, y2] = toSvg(t.gridX, t.gridY);
      const isOneWay = loc.linksOneWayOut.some(l => l.target === link.target);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2a2a4a" stroke-width="1"${isOneWay ? ' stroke-dasharray="3,2"' : ''}/>`;
    }
  }

  // 장소 점
  for (const loc of locs) {
    const [cx, cy] = toSvg(loc.gridX, loc.gridY);
    const isPlayer = loc.id === playerLoc;
    const isVisited = session.knowledge.visitedLocations.has(loc.id);
    const color = isPlayer ? '#e94560' : getZoneColor(loc.id);
    const r = isPlayer ? 5 : 3;
    const opacity = isPlayer || isVisited ? 1 : 0.25;
    if (isPlayer) svg += `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#e94560" stroke-width="0.7" opacity="0.35"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}" stroke="${isPlayer ? '#fff' : '#0a0a1a'}" stroke-width="${isPlayer ? 1.2 : 0.4}"/>`;
  }

  // 현재 위치 이름
  const [pcx, pcy] = toSvg(playerData.gridX, playerData.gridY);
  const name = locationName(playerLoc);
  const ly = pcy - 8 > M + 4 ? pcy - 8 : pcy + 14;
  svg += `<text x="${pcx}" y="${ly}" text-anchor="middle" font-size="8" fill="#e94560" font-family="monospace" font-weight="bold">${name}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;border-radius:4px;background:rgba(5,5,20,0.85);border:1px solid #2a2a4a;flex-shrink:0">${svg}</svg>`;
}

export function createGameScreen(
  session: GameSession,
  onScreenChange: (target: string) => void,
  onAfterTurn?: () => void,
): Screen {
  let accumulatedLog: { time: string; text: string }[] = [];
  let lastLocation = session.player?.currentLocation ?? '';
  let statusMessage = '';
  let lastBacklogSync = 0;
  let hudContainer: HTMLElement | null = null;
  let bgTickHandle: ReturnType<typeof setInterval> | null = null;

  /** 5초 백그라운드 틱: 시간 진행 + 이벤트·대사 롤 (조용히) */
  function bgTick(): void {
    const p = session.player;
    if (!p) return;

    // 5 게임 분 조용히 진행
    session.gameTime.advance(5);
    session.world.onTick(session.gameTime);
    applyTimeTheme(session.gameTime);

    // 랜덤 이벤트 롤
    const randomEv = session.events.rollRandomEvent(session.gameTime);
    const canHearRandomEvent = randomEv
      ? canNotifyRandomEvent(session.world, p.currentLocation, randomEv.location, session.gameTime.day)
      : false;
    if (randomEv) {
      const evText = `✦ ${randomEv.name}: ${randomEv.description}`;
      if (canHearRandomEvent) {
        session.backlog.add(session.gameTime, `[이벤트] ${randomEv.name}: ${randomEv.description}`, '이벤트');
        accumulatedLog.push({ time: session.gameTime.toString(), text: evText });
      }
      randomEv.worldScript?.(session.world, session.gameTime);
      for (const actor of session.actors) {
        if (actor.currentLocation === randomEv.location) {
          actor.receiveEventInfluence(randomEv.colorInfluence, randomEv.name, session.gameTime);
        }
      }
    }

    // NPC 자발 대사 롤 (8% 확률)
    let hasNewLog = canHearRandomEvent;
    if (Math.random() < 0.08) {
      const conv = tryNpcInitiatedConversation(p, session.actors, session.social, session.gameTime);
      if (conv) {
        const line = `${conv.npc.name}: 「${conv.greeting}」`;
        accumulatedLog.push({ time: session.gameTime.toString(), text: line });
        session.backlog.add(session.gameTime, line, '대사', p.name);
        if (conv.sharedRumor) {
          accumulatedLog.push({ time: session.gameTime.toString(), text: `소문: ${conv.sharedRumor}` });
        }
        hasNewLog = true;
      }
    }

    // HUD 시간 표시 갱신 (항상)
    if (hudContainer) {
      const timeEl = hudContainer.querySelector('.hud-time');
      if (timeEl) timeEl.textContent = session.gameTime.toString();
      const statusEl = hudContainer.querySelector('.status-bar');
      if (statusEl) statusEl.textContent = session.gameTime.toString();

      // 새 로그 항목이 추가된 경우에만 로그 영역 갱신
      if (hasNewLog) {
        const logEl = hudContainer.querySelector('.log-area');
        if (logEl) {
          logEl.innerHTML = [...accumulatedLog].reverse().map(m => `
            <div class="log-entry">
              <span class="log-time">${m.time}</span>
              <span class="log-text">${m.text}</span>
            </div>
          `).join('');
        }
      }
    }
  }

  /** 대사(dialogue) backlog 엔트리를 HUD 로그에 동기화 */
  function syncDialogueToLog(): void {
    const total = session.backlog.size();
    if (total <= lastBacklogSync) return;
    const all = session.backlog.getAll();
    for (let i = lastBacklogSync; i < all.length; i++) {
      const e = all[i];
      if (e.category === '대사') {
        accumulatedLog.push({ time: e.time.toString(), text: e.text });
      }
    }
    lastBacklogSync = total;
  }

  function renderHud(el: HTMLElement) {
    applyTimeTheme(session.gameTime);
    const p = session.player;
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);

    // 지역 이동 시 로그 초기화 + 자동 지역 설명 + 동료 대사
    if (p.currentLocation !== lastLocation) {
      // 이동 중 backlog에 쌓인 '이동' 이벤트를 먼저 수집 (여행 로그 보존)
      const allEntries = session.backlog.getAll();
      const travelEvents = allEntries.slice(lastBacklogSync)
        .filter(e => e.category === '이동')
        .map(e => ({ time: e.time.toString(), text: e.text }));
      accumulatedLog = travelEvents;
      lastLocation = p.currentLocation;

      // 지역 이름 및 설명 자동 표시
      const arrivedLoc = session.world.getLocation(p.currentLocation);
      const timeStr = session.gameTime.toString();
      accumulatedLog.push({ time: timeStr, text: `📍 ${locationName(p.currentLocation)}` });
      if (arrivedLoc?.description) {
        accumulatedLog.push({ time: timeStr, text: arrivedLoc.description });
      }

      // 동료 자동 한두마디
      const COMPANION_LINES: string[] = [
        '...조용하네요.',
        '어떤 곳인지 느껴지나요?',
        '여기서 잠깐 쉬어가도 좋을 것 같아요.',
        '계속 나아갈까요?',
        '이 근처는 조심해야 할 것 같아요.',
        '...바람이 불어오네요.',
        '이런 곳에도 이야기가 있겠죠.',
        '신기한 느낌이 나는 곳이에요.',
        '서두르지 않아도 괜찮을 것 같아요.',
        '뭔가... 기억에 남을 것 같아요.',
        '여기, 처음 오는 곳 같은 느낌이 들어요.',
        '발걸음이 절로 멈추게 되는 곳이네요.',
      ];
      const companions = session.actors.filter(
        a => a !== p && a.currentLocation === p.currentLocation && a.isAlive() && !a.base.sleeping
          && session.knowledge.isCompanion(a.name)
      );
      const shuffled = companions.sort(() => Math.random() - 0.5).slice(0, 2);
      for (const companion of shuffled) {
        if (Math.random() < 0.65) {
          const line = COMPANION_LINES[Math.floor(Math.random() * COMPANION_LINES.length)];
          const text = `${companion.name}: "${line}"`;
          accumulatedLog.push({ time: timeStr, text });
          session.backlog.add(session.gameTime, text, '대사', companion.name);
        }
      }

      // 동료 대사를 backlog에 추가한 뒤 sync 기준점 갱신
      // (이 시점 이전 항목은 이미 accumulatedLog에 직접 넣었으므로 syncDialogueToLog가 중복 읽지 않도록)
      lastBacklogSync = session.backlog.size();
    }

    // 서브화면(대화 등)에서 돌아올 때 대사 로그 동기화
    syncDialogueToLog();

    const INFO_ROW1 = INFO_ACTIONS.slice(0, 6);
    const INFO_ROW2 = INFO_ACTIONS.slice(6);

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
            <span class="stat-label">MP</span>
            <div class="bar"><div class="bar-fill mp-bar" style="width:${Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100)}%"></div></div>
            <span class="stat-val">${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</span>
          </div>
          <div class="stat-bar">
            <span class="stat-label">TP</span>
            <div class="ap-bar">
              ${Array.from({length: p.getEffectiveMaxAp()}, (_, i) =>
                `<div class="ap-pip ${i < p.base.ap ? 'ap-full' : 'ap-empty'}"></div>`
              ).join('')}
            </div>
            <span class="stat-val">${p.base.ap}/${p.getEffectiveMaxAp()}</span>
          </div>
          <div class="hud-mini"><strong>${p.name}</strong> · ${raceName(p.base.race)} · ${spiritRoleName(p.spirit.role)} · 💰${p.spirit.gold}G</div>
          <div class="hud-colors" style="justify-content:center;gap:12px">
            ${(() => {
              // 가장 높은 속성 계산
              const scaled = p.color.values.map((v, i) => ({ i, s: Math.round((v - 0.5) * 200) }));
              scaled.sort((a, b) => b.s - a.s);
              const top = scaled[0].s;
              const near = scaled.filter(x => top - x.s <= 1);
              let elemLabel: string;
              if (near.length >= 3) {
                elemLabel = '<span style="color:var(--text-dim)">속성 : 무속성</span>';
              } else if (near.length === 2) {
                elemLabel = `<span>속성 : <span style="color:var(--el-${near[0].i})">${elementName(near[0].i as Element)}</span> · <span style="color:var(--el-${near[1].i})">${elementName(near[1].i as Element)}</span></span>`;
              } else {
                elemLabel = `<span>속성 : <span style="color:var(--el-${near[0].i})">${elementName(near[0].i as Element)}</span></span>`;
              }
              const totalHyperion = session.actors.reduce((sum, a) => sum + a.hyperionLevel, 0);
              const titleStr = session.knowledge.activeTitle ? ` · ${session.knowledge.activeTitle}` : '';
              return `${elemLabel} <span style="color:var(--warning)">✦Lv.${totalHyperion}</span>${titleStr}`;
            })()}
          </div>
        </div>

        <div style="display:flex;gap:6px;align-items:flex-start">
          <div class="hud-nearby" style="flex:1;min-width:0">
            <div style="color:var(--text-dim);font-size:10px;margin-bottom:3px">주변 인물</div>
            ${(() => {
              const partyHere = session.actors.filter(a =>
                a !== p && a.isAlive() && session.knowledge.isCompanion(a.name)
              );
              const npcsHere = session.actors.filter(a =>
                a !== p && a.currentLocation === p.currentLocation && a.isAlive() && !a.base.sleeping
                  && !session.knowledge.isCompanion(a.name)
              );
              const partySpans = partyHere.map(a => {
                const title = `${raceName(a.base.race)} ${spiritRoleName(a.spirit.role)}${a.base.sleeping ? ' (수면 중)' : ''}`;
                return `<span class="nearby-npc" style="color:var(--success)" title="${title}">★${a.name}</span>`;
              });
              const npcSpans = npcsHere.map(a => {
                const known = session.knowledge.isKnown(a.name);
                const displayName = known ? a.name : '???';
                const title = known ? `${raceName(a.base.race)} ${spiritRoleName(a.spirit.role)}` : '';
                return `<span class="nearby-npc" title="${title}">${displayName}</span>`;
              });
              const all = [...partySpans, ...npcSpans];
              return all.length > 0
                ? all.join('')
                : '<span style="color:var(--text-dim);font-size:11px">아무도 없다</span>';
            })()}
          </div>
        </div>

        <div class="log-area">
          ${[...accumulatedLog].reverse().map(m => `
            <div class="log-entry">
              <span class="log-time">${m.time}</span>
              <span class="log-text">${m.text}</span>
            </div>
          `).join('')}
        </div>

        <div class="status-bar">${statusMessage ? `${session.gameTime.toString()} ${statusMessage}` : session.gameTime.toString()}</div>

        <div class="action-grid">
          ${(() => {
            // 마지막으로 표시되는 버튼 인덱스까지만 렌더링
            // → 빈 행이 사라지고 log-area가 남은 공간을 채움
            const lastVisible = MAIN_ACTIONS.reduce(
              (last, a, i) => (!a.visible || a.visible(session)) ? i : last, -1,
            );
            return MAIN_ACTIONS.slice(0, lastVisible + 1).map(a => {
              const show = !a.visible || a.visible(session);
              const tpCost = ACTION_TP_COST[a.action] ?? 0;
              return `
                <button class="btn action-btn" data-action="${a.action}" title="[${a.key}]"
                  style="${show ? '' : 'visibility:hidden;pointer-events:none'}">
                  <span class="action-icon">${a.icon}</span>
                  <span class="action-label-row">
                    <span class="action-label">${a.label}</span>
                    ${renderTpCostPips(tpCost)}
                  </span>
                  <span class="action-key">${a.key}</span>
                </button>`;
            }).join('');
          })()}
        </div>

        <div class="info-bar">
          ${INFO_ROW1.map(a => `
            <button class="btn info-btn" data-action="${a.action}" title="[${a.key}]">${a.label}</button>
          `).join('')}
        </div>
        <div class="info-bar">
          ${INFO_ROW2.map(a => `
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
    // 상태바에 최근 행동 결과 표시
    if (result.messages.length > 0) {
      statusMessage = result.messages[result.messages.length - 1];
    }
    // 메시지를 로그 + 백로그에 동기화
    for (const m of result.messages) {
      accumulatedLog.push({ time: session.gameTime.toString(), text: m });
      // 백로그에 아직 없는 메시지만 추가
      const recent = session.backlog.getRecent(3);
      if (!recent.some(e => e.text === m)) {
        session.backlog.add(session.gameTime, m, '행동', session.player.name);
      }
    }
    if (result.screenChange) {
      if (result.gatherSim) (session as any)._pendingGatherSim = result.gatherSim;
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
  keyMap.set('c', 'info_status');
  keyMap.set('C', 'info_status');
  keyMap.set('S', 'save');
  keyMap.set('s', 'save');

  return {
    id: 'game',
    render(el) {
      hudContainer = el;
      renderHud(el);
    },
    onEnter() {
      if (bgTickHandle !== null) clearInterval(bgTickHandle);
      bgTickHandle = setInterval(bgTick, 5000);
    },
    onExit() {
      if (bgTickHandle !== null) { clearInterval(bgTickHandle); bgTickHandle = null; }
      hudContainer = null;
    },
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
        case 'info_color': {
          const gridCells: string[] = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const on = p.coreMatrix.getCell(r, c);
              const bg = on ? `var(--el-${r})` : 'var(--bg-card)';
              const border = on ? 'transparent' : 'var(--border)';
              gridCells.push(`<div class="cm-cell" style="background:${bg};border:1px solid ${border}"></div>`);
            }
          }
          const colorCols: string[] = [];
          for (let i = 0; i < ELEMENT_COUNT; i++) {
            const val = p.color.values[i];
            const scaled = Math.round((val - 0.5) * 200);
            const sign = scaled > 0 ? '+' : '';
            const barPct = Math.max(4, Math.round(val * 100));
            colorCols.push(`
              <div class="color-col">
                <div class="color-col-name" style="color:var(--el-${i})">${elementName(i as Element)}</div>
                <div class="color-bar-vertical">
                  <div class="color-bar-vertical-fill" style="height:${barPct}%;background:var(--el-${i})"></div>
                </div>
                <div class="color-col-value">${sign}${scaled}</div>
              </div>
            `);
          }
          html += `<h2>${p.name} 상태</h2>
            <div class="info-section-title">컬러 속성</div>
            <div class="color-list-vertical">${colorCols.join('')}</div>
            <div class="info-grid">
              <div>종족: ${raceName(p.base.race)}</div>
              <div>역할: ${spiritRoleName(p.spirit.role)}</div>
              <div>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</div>
              <div>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>
              <div>공격: ${p.getEffectiveAttack().toFixed(1)}</div>
              <div>방어: ${p.getEffectiveDefense().toFixed(1)}</div>
              <div>골드: ${p.spirit.gold}G</div>
              <div>히페리온: Lv.${p.hyperionLevel}</div>
            </div>
            <div class="info-section-title">코어 매트릭스</div>
            <div class="cm-grid">${gridCells.join('')}</div>`;
          break;
        }

        case 'info_relations': {
          html += `<h2>관계</h2><div class="rel-list">`;
          if (p.relationships.size === 0) {
            html += '<p>아직 형성된 관계가 없습니다.</p>';
          }
          for (const [name, rel] of p.relationships) {
            const stage = getRelationshipStage(p, name, session.knowledge, session.actors);
            const npcActor = session.actors.find(a => a.name === name);
            const isCompanionNow = session.knowledge.isCompanion(name);
            const showLoc = (stage === 'close' || stage === 'companion') && npcActor;
            const locLabel = isCompanionNow
              ? ' · 동행 중'
              : showLoc ? ` · 📍 ${locationName(npcActor.currentLocation)}` : '';
            html += `<div class="rel-row">
              <span>${name}${locLabel}</span>
              <span>신뢰 ${rel.trust.toFixed(2)} · 호감 ${rel.affinity.toFixed(2)}</span>
            </div>`;
          }
          html += '</div>';
          break;
        }

        case 'info_backlog': {
          html += `<h2>백로그</h2><div class="backlog-list">`;
          const allVisible = session.backlog.getPlayerVisible(p.name);
          const entries = allVisible.slice(-30);
          for (const e of entries.reverse()) {
            html += `<div class="backlog-entry"><span class="bl-time">${e.time.toString()}</span> ${e.text}</div>`;
          }
          html += '</div>';
          break;
        }

        case 'info_inventory': {
          const totalItemCount = [...p.items.values()].reduce((s, n) => s + n, 0)
            + [...p.spirit.inventory.entries()].filter(([, n]) => n > 0).reduce((s, [, n]) => s + n, 0);
          const bagCap = session.knowledge.bagCapacity ?? 10;
          html += `<h2>소지품</h2>`;
          html += `<p style="text-align:center;font-size:11px;color:${totalItemCount >= bagCap ? 'var(--accent)' : 'var(--text-dim)'}">가방 ${totalItemCount}/${bagCap}칸</p>`;

          // Equipped items
          const weapon = p.equippedWeapon ? getWeaponDef(p.equippedWeapon) : null;
          const armor = p.equippedArmor ? getArmorDef(p.equippedArmor) : null;
          const accessory = p.equippedAccessory ? getArmorDef(p.equippedAccessory) : null;
          html += `<div class="inv-section-title" style="color:var(--text-dim);font-size:12px;margin-bottom:4px">장착</div>`;
          html += `<div class="inv-grid">`;
          html += `<div class="inv-item"><span class="inv-name">⚔ 무기</span><span class="inv-count">${weapon ? weapon.name : '없음'}</span></div>`;
          html += `<div class="inv-item"><span class="inv-name">🛡 방어구</span><span class="inv-count">${armor ? armor.name : '없음'}</span></div>`;
          html += `<div class="inv-item"><span class="inv-name">💍 악세서리</span><span class="inv-count">${accessory ? accessory.name : '없음'}</span></div>`;
          html += `</div>`;

          // Gold
          html += `<div class="inv-item" style="margin-top:8px"><span class="inv-name">💰 골드</span><span class="inv-count">${p.spirit.gold}G</span></div>`;

          // Individual items (p.items Map<string, number>)
          if (p.items.size > 0) {
            html += `<div class="inv-section-title" style="color:var(--text-dim);font-size:12px;margin:8px 0 4px">아이템</div>`;
            html += `<div class="inv-grid">`;
            for (const [id, count] of p.items) {
              const def = getItemDef(id);
              const name = def ? def.name : id;
              html += `<div class="inv-item"><span class="inv-name">${name}</span><span class="inv-count">x${count}</span></div>`;
            }
            html += `</div>`;
          }

          // Category items (p.spirit.inventory Map<ItemType, number>)
          const invEntries = [...p.spirit.inventory.entries()].filter(([, n]) => n > 0);
          if (invEntries.length > 0) {
            html += `<div class="inv-section-title" style="color:var(--text-dim);font-size:12px;margin:8px 0 4px">재고</div>`;
            html += `<div class="inv-grid">`;
            for (const [type, count] of invEntries) {
              html += `<div class="inv-item"><span class="inv-name">${categoryName(type as ItemType)}</span><span class="inv-count">x${count}</span></div>`;
            }
            html += `</div>`;
          }

          if (p.items.size === 0 && invEntries.length === 0) {
            html += `<p style="color:var(--text-dim);font-size:13px">소지품이 없습니다.</p>`;
          }
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
  onTravel?: (fromId: string, toId: string, minutes: number) => void,
): Screen {
  function doMove(fromId: string, loc: string, mins: number) {
    if (onTravel && mins > TRAVEL_OVERLAY_THRESHOLD_MINUTES) {
      onTravel(fromId, loc, mins);
    } else {
      // 10분 이하: 즉시 이동
      session.player.currentLocation = loc;
      moveCompanions(session.actors, session.knowledge, loc);
      session.gameTime.advance(mins);
      session.backlog.add(session.gameTime, `${session.player.name}이(가) ${locationName(loc)}(으)로 이동했다.`, '행동');
      session.knowledge.trackVisit(loc);
      onDone();
    }
  }

  return {
    id: 'move',
    render(el) {
      const p = session.player;
      const baseRoutes = session.world.getOutgoingRoutes(p.currentLocation, session.gameTime.day);
      const routesWithoutHome = baseRoutes.filter(([loc]) => loc !== p.homeLocation);
      const homeAlreadyListed = p.currentLocation === p.homeLocation;
      const homeMins = homeAlreadyListed ? 0
        : session.world.getShortestMinutes(p.currentLocation, p.homeLocation, session.gameTime.day);
      const routes: [string, number][] = homeAlreadyListed
        ? routesWithoutHome
        : [...routesWithoutHome, [p.homeLocation, homeMins]];
      el.innerHTML = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>이동</h2>
          <p>현재: ${locationName(p.currentLocation)}</p>
          <div style="align-self:center">${buildMiniMapSvg(session)}</div>
          <div class="menu-buttons">
            ${routes.map(([loc, mins], i) => {
              const isHome = loc === p.homeLocation;
              const color = isHome ? '#ff9ff3' : getZoneColor(loc);
              const isDungeon = session.dungeonSystem.isDungeonEntrance(loc);
              const dungeonBadge = isDungeon ? ' <span style="color:var(--accent)">⚔</span>' : '';
              const homeBadge = isHome ? ' <span style="color:#ff9ff3">🏠</span>' : '';
              const travelBadge = mins > TRAVEL_OVERLAY_THRESHOLD_MINUTES
                ? ` <span style="color:var(--text-dim);font-size:11px">🚶 ${mins}분</span>`
                : ` <span style="color:var(--text-dim);font-size:11px">${mins}분</span>`;
              return `
              <button class="btn" data-loc="${loc}" data-mins="${mins}" style="border-left:4px solid ${color}">${i + 1}. ${locationName(loc)}${travelBadge}${dungeonBadge}${homeBadge}</button>
            `;}).join('')}
          </div>
        </div>`;
      el.querySelector('[data-back]')?.addEventListener('click', onDone);
      el.querySelectorAll<HTMLButtonElement>('[data-loc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const loc = btn.dataset.loc!;
          const mins = parseInt(btn.dataset.mins ?? '30', 10);
          doMove(p.currentLocation, loc, mins);
        });
      });
    },
    onKey(key) {
      if (key === 'Escape') onDone();
      if (/^[1-9]$/.test(key)) {
        const p = session.player;
        const baseRoutes = session.world.getOutgoingRoutes(p.currentLocation, session.gameTime.day);
        const routesWithoutHome = baseRoutes.filter(([loc]) => loc !== p.homeLocation);
        const homeAlreadyListed = p.currentLocation === p.homeLocation;
        const homeMins = homeAlreadyListed ? 0
          : session.world.getShortestMinutes(p.currentLocation, p.homeLocation, session.gameTime.day);
        const routes: [string, number][] = homeAlreadyListed
          ? routesWithoutHome
          : [...routesWithoutHome, [p.homeLocation, homeMins]];
        const i = parseInt(key, 10) - 1;
        if (i < routes.length) {
          const [loc, mins] = routes[i];
          doMove(p.currentLocation, loc, mins);
        }
      }
    },
  };
}

// --- NPC Info screen ---
export function createNpcInfoScreen(
  session: GameSession,
  npc: Actor,
  onBack: () => void,
): Screen {
  return {
    id: 'npc-info',
    render(el) {
      const p = session.player;
      const rel = p.relationships.get(npc.name);
      const overall = rel ? (rel.trust + rel.affinity) / 2 : 0;
      const gridCells: string[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const on = npc.coreMatrix.getCell(r, c);
          const bg = on ? `var(--el-${r})` : 'var(--bg-card)';
          const border = on ? 'transparent' : 'var(--border)';
          gridCells.push(`<div class="cm-cell" style="background:${bg};border:1px solid ${border}"></div>`);
        }
      }
      let html = '<div class="screen info-screen">';
      html += `<button class="btn back-btn" data-back>← 뒤로 [Esc]</button>`;
      // 입수 조건 표시
      let acqHtml = '';
      if (npc.acquisitionMethod) {
        const d = npc.acquisitionDifficulty;
        const stars = d > 0 ? '(난이도 ' + '\u2605'.repeat(Math.min(d, 6)) + ')' : '';
        const lines = npc.acquisitionMethod.split('|').map(l =>
          '<div style="color:var(--text-dim)">' + l.trim() + '</div>'
        ).join('');
        acqHtml = '<div style="margin-top:8px;padding:8px;background:var(--bg-panel);border-radius:8px;font-size:12px">'
          + '<div style="color:var(--warning);margin-bottom:4px">입수 조건 ' + stars + '</div>'
          + lines + '</div>';
      }
      html += `<h2>${npc.name} 정보</h2>
        <div class="info-grid">
          <div>종족: ${raceName(npc.base.race)}</div>
          <div>역할: ${spiritRoleName(npc.spirit.role)}</div>
          <div>레벨: ${npc.base.level}</div>
          <div>HP: ${Math.round(npc.base.hp)}/${Math.round(npc.getEffectiveMaxHp())}</div>
          <div>공격: ${npc.getEffectiveAttack().toFixed(1)}</div>
          <div>방어: ${npc.getEffectiveDefense().toFixed(1)}</div>
          <div>관계: ${overall.toFixed(2)}</div>
          <div>히페리온: Lv.${npc.hyperionLevel}</div>
        </div>
        ${acqHtml}
        <div class="cm-grid">${gridCells.join('')}</div>`;
      html += '</div>';
      el.innerHTML = html;
      el.querySelector('[data-back]')?.addEventListener('click', onBack);
    },
    onKey(key) {
      if (key === 'Escape' || key === 'q') onBack();
    },
  };
}
