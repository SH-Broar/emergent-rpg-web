// game-screen.ts — 메인 게임 HUD + 액션 버튼

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { GameAction } from '../../systems/game-loop';
import type { Actor } from '../../models/actor';
import { processTurn } from '../../systems/game-loop';
import { moveCompanions } from '../../systems/npc-interaction';
import { locationName } from '../../types/registry';
import { weatherName, seasonName, raceName, spiritRoleName, elementName, Element, ELEMENT_COUNT, ItemType } from '../../types/enums';
import { getItemDef, getWeaponDef, getArmorDef, categoryName } from '../../types/item-defs';

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
  { key: '3', label: '살펴보기', action: 'look', icon: '👁' },
  { key: '4', label: '대화', action: 'talk', icon: '💬', visible: hasNpcsHere },
  { key: '5', label: '거래', action: 'trade', icon: '💰', visible: canTrade },
  { key: '6', label: '식사', action: 'eat', icon: '🍖' },
  { key: '7', label: '휴식', action: 'rest', icon: '💤' },
  { key: '8', label: '던전', action: 'dungeon', icon: '⚔', visible: nearDungeon },
  { key: '9', label: '채집', action: 'gather', icon: '🌿' },
  { key: '0', label: '퀘스트', action: 'quest', icon: '📜', visible: atGuildHall },
  { key: 'a', label: '활동', action: 'activity', icon: '🔨', visible: hasActivities },
  { key: 'g', label: '선물', action: 'gift', icon: '🎁', visible: hasNpcsHere },
  { key: 'h', label: '자택', action: 'home', icon: '🏠', visible: atHome },
  { key: 'j', label: '창고', action: 'storage' as GameAction, icon: '📦', visible: atBase },
  { key: 'n', label: '부동산', action: 'realestate' as GameAction, icon: '🏘', visible: atGuildHall },
  { key: 'x', label: '요리', action: 'cooking' as GameAction, icon: '🍳', visible: atBase },
  { key: 'f', label: '초대', action: 'npc_invite' as GameAction, icon: '🏡', visible: atBase },
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
  { key: 'e', label: '도감', action: 'info_encyclopedia', icon: '📚' },
  { key: 'k', label: '스킬', action: 'info_skills' as GameAction, icon: '⚡' },
  { key: 'v', label: '소지품', action: 'info_inventory' as GameAction, icon: '🎒' },
  { key: 'S', label: '저장', action: 'save', icon: '💾' },
];

export function createGameScreen(
  session: GameSession,
  onScreenChange: (target: string) => void,
  onAfterTurn?: () => void,
): Screen {
  let accumulatedLog: { time: string; text: string }[] = [];
  let lastLocation = session.player?.currentLocation ?? '';
  let statusMessage = '';

  function renderHud(el: HTMLElement) {
    const p = session.player;
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);

    // 지역 이동 시 로그 초기화
    if (p.currentLocation !== lastLocation) {
      accumulatedLog = [];
      lastLocation = p.currentLocation;
    }

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
            <div class="bar"><div class="bar-fill vigor-bar" style="width:${Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100)}%"></div></div>
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
          <div class="hud-mini">Lv.${p.base.level} · ${raceName(p.base.race)} · ${spiritRoleName(p.spirit.role)} · 💰${p.spirit.gold}G</div>
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

        <div class="hud-nearby">
          ${(() => {
            const npcsHere = session.actors.filter(a =>
              a !== p && a.currentLocation === p.currentLocation && a.isAlive() && !a.base.sleeping
            );
            return npcsHere.length > 0
              ? npcsHere.map(a => {
                  const known = session.knowledge.isKnown(a.name);
                  const displayName = known ? a.name : '???';
                  const title = known ? `${raceName(a.base.race)} ${spiritRoleName(a.spirit.role)}` : '';
                  return `<span class="nearby-npc" title="${title}">${displayName}</span>`;
                }).join('')
              : '<span style="color:var(--text-dim);font-size:11px">주변에 아무도 없다</span>';
          })()}
        </div>

        <div class="log-area">
          ${accumulatedLog.map(m => `
            <div class="log-entry">
              <span class="log-time">${m.time}</span>
              <span class="log-text">${m.text}</span>
            </div>
          `).join('')}
        </div>

        <div class="status-bar">${statusMessage ? `${session.gameTime.toString()} ${statusMessage}` : session.gameTime.toString()}</div>

        <div class="action-grid">
          ${MAIN_ACTIONS.map(a => {
            const show = !a.visible || a.visible(session);
            return `
              <button class="btn action-btn" data-action="${a.action}" title="[${a.key}]"
                style="${show ? '' : 'visibility:hidden;pointer-events:none'}">
                <span class="action-icon">${a.icon}</span>
                <span class="action-label">${a.label}</span>
                <span class="action-key">${a.key}</span>
              </button>`;
          }).join('')}
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
        case 'info_status': {
          const gridCells: string[] = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const on = p.coreMatrix.getCell(r, c);
              const bg = on ? `var(--el-${r})` : 'var(--bg-card)';
              const border = on ? 'transparent' : 'var(--border)';
              gridCells.push(`<div class="cm-cell" style="background:${bg};border:1px solid ${border}"></div>`);
            }
          }
          html += `<h2>${p.name} 상태</h2>
            <div class="info-grid">
              <div>종족: ${raceName(p.base.race)}</div>
              <div>역할: ${spiritRoleName(p.spirit.role)}</div>
              <div>레벨: ${p.base.level} (EXP ${p.base.exp})</div>
              <div>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</div>
              <div>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>
              <div>공격: ${p.getEffectiveAttack().toFixed(1)}</div>
              <div>방어: ${p.getEffectiveDefense().toFixed(1)}</div>
              <div>골드: ${p.spirit.gold}G</div>
              <div>히페리온: Lv.${p.hyperionLevel}</div>
            </div>
            <div class="cm-grid">${gridCells.join('')}</div>`;
          break;
        }

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

// --- Location type colors ---
const LOCATION_TYPE_COLORS: Record<string, string> = {
  home: '#ff9ff3',     // 자택 - 분홍
  town: '#4ecca3',     // 마을 중심 - 초록
  guild: '#ffc857',    // 길드 - 주황
  trade: '#f9ca24',    // 상업 - 금색
  craft: '#cd6133',    // 공방 - 구리
  nature: '#7bed9f',   // 자연 - 연두
  water: '#74b9ff',    // 물가 - 파랑
  mountain: '#a29bfe', // 산 - 보라
  dungeon: '#e94560',  // 던전 - 빨강
  special: '#ffe66d',  // 특수 - 노랑
  holy: '#dfe6e9',     // 신성 - 흰색
};

const LOCATION_TYPES: Record<string, string> = {
  Town_Elimes: 'town', Guild_Hall: 'guild', Market_Square: 'trade',
  Tavern: 'town', Church: 'holy', Farm: 'nature', Blacksmith: 'craft',
  Herb_Garden: 'nature', Lake: 'water', Wilderness: 'nature',
  Mountain_Path: 'mountain', Trade_Route: 'trade', Memory_Spring: 'special',
  Wizard_Tower: 'special', Falcon_Garden: 'nature', Starfall_Basin: 'special',
  Mirage_Oasis: 'water', Ancient_Tree_Crown: 'special', Crystal_Cavern: 'dungeon',
  Limun_Ruins: 'dungeon', Dungeon_Entrance: 'dungeon', Dungeon_Interior: 'dungeon',
  Abandoned_Mine: 'dungeon', Bandit_Hideout: 'dungeon', Twilight_Spire: 'dungeon',
};

function getLocationColor(locId: string, homeLocation?: string): string {
  if (homeLocation && locId === homeLocation) return LOCATION_TYPE_COLORS.home;
  const type = LOCATION_TYPES[locId] ?? 'nature';
  return LOCATION_TYPE_COLORS[type] ?? LOCATION_TYPE_COLORS.nature;
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
            ${routes.map(([loc, mins], i) => {
              const color = getLocationColor(loc, p.homeLocation);
              // 던전 입구인 경우 표시
              const isDungeon = session.dungeonSystem.isDungeonEntrance(loc);
              const dungeonBadge = isDungeon ? ' <span style="color:var(--accent)">⚔</span>' : '';
              return `
              <button class="btn" data-loc="${loc}" style="border-left:4px solid ${color}">${i + 1}. ${locationName(loc)} (${mins}분)${dungeonBadge}</button>
            `;}).join('')}
          </div>
        </div>`;
      el.querySelector('[data-back]')?.addEventListener('click', onDone);
      el.querySelectorAll<HTMLButtonElement>('[data-loc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const loc = btn.dataset.loc!;
          const mins = routes.find(r => r[0] === loc)?.[1] ?? 30;
          p.currentLocation = loc;
          moveCompanions(session.actors, session.knowledge, loc);
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
          moveCompanions(session.actors, session.knowledge, loc);
          session.gameTime.advance(mins);
          session.backlog.add(session.gameTime, `${session.player.name}이(가) ${locationName(loc)}(으)로 이동했다.`, '행동');
          onDone();
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
