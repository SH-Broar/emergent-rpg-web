// memory-spring.ts — 기억의 샘 화면
// 플레이어의 여정과 기억을 되돌아보는 장소
// 영혼 각인(NPC화 후 새 캐릭터) / 천도제(완전 새 게임) 기능 포함

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { eunNeun } from '../../data/josa';
import { raceName, spiritRoleName, elementName, Element } from '../../types/enums';
import { getItemDef } from '../../types/item-defs';
import { checkAndQueueHyperionLevelUps } from '../../systems/hyperion-trigger';

type SpringTab = 'journey' | 'relations' | 'knowledge' | 'soul' | 'restore';

interface RepairResult {
  fixedItems: string[];
  hyperionRaised: boolean;
}

/**
 * 옛날 세이브에서 누락되었을 수 있는 기억 데이터를 보정한다.
 * - 현재/홈 위치, 동료 위치를 visitedLocations에 추가
 * - partyMembers를 recruitedEver / knownActorNames에 추가
 * - 같은 위치 NPC를 knownActorNames에 추가
 * - relationships(interactionCount>0)를 knownActorNames / conversationPartners에 추가
 * 보정 후 히페리온 조건을 즉시 재평가한다.
 */
function repairSave(session: GameSession): RepairResult {
  const k = session.knowledge;
  const p = session.player;
  const fixed: string[] = [];

  const tryAddVisit = (loc: string | undefined): void => {
    if (!loc) return;
    if (k.visitedLocations.has(loc)) return;
    k.visitedLocations.add(loc);
    fixed.push(`방문 기록 추가: ${locationName(loc) || loc}`);
  };

  tryAddVisit(p.currentLocation);
  tryAddVisit(p.homeLocation);

  for (const name of k.partyMembers) {
    if (!k.recruitedEver.has(name)) {
      k.recruitedEver.add(name);
      fixed.push(`영입 기록 추가: ${name}`);
    }
    if (!k.knownActorNames.has(name)) {
      k.knownActorNames.add(name);
      fixed.push(`만난 기록 추가: ${name}`);
    }
    const comp = session.actors.find(a => a.name === name);
    if (comp) tryAddVisit(comp.currentLocation);
  }

  for (const a of session.actors) {
    if (a === p) continue;
    if (a.currentLocation === p.currentLocation && !k.knownActorNames.has(a.name)) {
      k.knownActorNames.add(a.name);
      fixed.push(`만난 기록 추가: ${a.name}`);
    }
  }

  for (const [name, rel] of p.relationships) {
    if (rel.interactionCount <= 0) continue;
    if (!k.knownActorNames.has(name)) {
      k.knownActorNames.add(name);
      fixed.push(`만난 기록 추가: ${name}`);
    }
    if (!k.conversationPartners.has(name)) {
      k.conversationPartners.add(name);
      fixed.push(`대화 기록 추가: ${name}`);
    }
  }

  const hyperionRaised = checkAndQueueHyperionLevelUps(session);

  return { fixedItems: fixed, hyperionRaised };
}

export interface MemorySpringCallbacks {
  onBack: () => void;
  /** 영혼 각인: 현재 캐릭터를 NPC화하고 새 캐릭터 선택으로 */
  onSoulImprint: () => void;
  /** 이탈: 현재 캐릭터를 NPC로만 변환 (새 데이터 생성 없음) */
  onDeparture: () => void;
  /** 천도제: 세계를 유지하되 새 캐릭터로 시작 */
  onRebirth: () => void;
}

export function createMemorySpringScreen(
  session: GameSession,
  callbacks: MemorySpringCallbacks,
): Screen {
  let tab: SpringTab = 'journey';
  let confirmMode: 'none' | 'imprint' | 'rebirth' | 'departure' | 'imprint_final' | 'rebirth_final' | 'departure_final' = 'none';

  function render(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen memory-spring-screen';

    const p = session.player;
    const k = session.knowledge;

    // Header
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>\uae30\uc5b5\uc758 \uc0d8</h2>
      <p class="hint" style="margin:0">\uc794\uc794\ud55c \uc0d8\ubb3c\uc5d0 \ub2f9\uc2e0\uc758 \uc774\uc57c\uae30\uac00 \ube44\ucdc9\ub2e4...</p>

      <div class="info-bar" style="margin-top:8px">
        <button class="btn info-btn ${tab === 'journey' ? 'active' : ''}" data-tab="journey">1. \uc5ec\uc815</button>
        <button class="btn info-btn ${tab === 'relations' ? 'active' : ''}" data-tab="relations">2. \uc778\uc5f0</button>
        <button class="btn info-btn ${tab === 'knowledge' ? 'active' : ''}" data-tab="knowledge">3. \uc9c0\uc2dd</button>
        <button class="btn info-btn ${tab === 'soul' ? 'active' : ''}" data-tab="soul">4. \uc601\ud63c</button>
        <button class="btn info-btn ${tab === 'restore' ? 'active' : ''}" data-tab="restore">5. \ubcf4\uc815</button>
      </div>
    `;

    const content = document.createElement('div');
    content.className = 'text-display';
    content.style.flex = '1';

    switch (tab) {
      case 'journey': {
        const lines: string[] = [];
        lines.push(`<div style="margin-bottom:8px"><b>${p.name}\uc758 \uc5ec\uc815</b></div>`);
        const hyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);
        lines.push(`<div>\ud788\ud398\ub9ac\uc628: Lv.${hyperionTotal}</div>`);
        lines.push(`<div>\ubc29\ubb38\ud55c \uc7a5\uc18c: ${k.visitedLocations.size}\uacf3</div>`);
        if (k.visitedLocations.size > 0) {
          const locNames = [...k.visitedLocations].map(id => locationName(id)).join(', ');
          lines.push(`<div style="color:var(--text-dim);font-size:12px;margin-left:8px">${locNames}</div>`);
        }
        lines.push(`<div>\ub300\ud654 \ud69f\uc218: ${k.totalConversations}\ud68c (\ub300\ud654 \uc0c1\ub300: ${k.conversationPartners.size}\uba85)</div>`);
        lines.push(`<div>\ub358\uc804 \ud074\ub9ac\uc5b4: ${k.totalDungeonsCleared}\ud68c</div>`);
        lines.push(`<div>\ubab0\ub9ac\uce5c \ubab0\uc2a4\ud130: ${k.totalMonstersKilled}\ub9c8\ub9ac (${k.monsterTypesKilled.size}\uc885)</div>`);
        lines.push(`<div>\ucd1d \ub370\ubbf8\uc9c0: ${Math.round(k.totalDamageDealt)} | \ucd5c\ub300 \ud55c\ubc29: ${Math.round(k.maxSingleDamage)}</div>`);
        lines.push(`<div>\uc120\ubb3c: ${k.totalGiftsGiven}\ud68c | \ud65c\ub3d9: ${k.totalActivitiesDone}\ud68c</div>`);
        if (k.earnedTitles.length > 0) {
          lines.push(`<div style="margin-top:8px"><b>\ud68d\ub4dd \uce6d\ud638</b></div>`);
          for (const t of k.earnedTitles) {
            lines.push(`<div style="margin-left:8px">\ud83c\udfc5 ${t}</div>`);
          }
        }
        // Recent memorable events from backlog
        const recentEvents = session.backlog.getPlayerVisible(p.name)
          .filter(e => e.category === '\ud589\ub3d9')
          .slice(-10);
        if (recentEvents.length > 0) {
          lines.push(`<div style="margin-top:8px"><b>\ucd5c\uadfc \uae30\uc5b5</b></div>`);
          for (const e of recentEvents.reverse()) {
            lines.push(`<div style="font-size:12px;color:var(--text-dim)">${e.time.toString()} ${e.text}</div>`);
          }
        }
        content.innerHTML = lines.join('');
        break;
      }

      case 'relations': {
        const lines: string[] = [];
        lines.push(`<div style="margin-bottom:8px"><b>\uc778\uc5f0\uc758 \uae30\uc5b5</b></div>`);
        const sorted = [...p.relationships.entries()]
          .filter(([, rel]) => rel.interactionCount > 0)
          .sort((a, b) => (b[1].trust + b[1].affinity) - (a[1].trust + a[1].affinity));
        if (sorted.length === 0) {
          lines.push(`<div style="color:var(--text-dim)">\uc544\uc9c1 \ud615\uc131\ub41c \uad00\uacc4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</div>`);
        } else {
          for (const [name, rel] of sorted) {
            const npc = session.actors.find(a => a.name === name);
            const roleStr = npc ? `${raceName(npc.base.race)} ${spiritRoleName(npc.spirit.role)}` : '';
            const overall = ((rel.trust + rel.affinity) / 2).toFixed(2);
            const label = Number(overall) >= 0.5 ? '\u2665' : Number(overall) >= 0 ? '\u25cb' : '\u25bd';
            lines.push(`<div class="rel-row" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span>${label} ${name} <span style="color:var(--text-dim);font-size:11px">${roleStr}</span></span>
              <span>\uc2e0\ub8b0 ${rel.trust.toFixed(2)} \u00b7 \ud638\uac10 ${rel.affinity.toFixed(2)}</span>
            </div>`);
          }
        }
        // Companions
        if (k.partyMembers.length > 0) {
          lines.push(`<div style="margin-top:12px"><b>\ud604\uc7ac \ub3d9\ub8cc</b></div>`);
          for (const name of k.partyMembers) {
            const days = k.companionDaysMap.get(name) ?? 0;
            lines.push(`<div style="margin-left:8px">\ud83d\udc65 ${name} (${days}\uc77c \ub3d9\ud589)</div>`);
          }
        }
        content.innerHTML = lines.join('');
        break;
      }

      case 'knowledge': {
        const lines: string[] = [];
        lines.push(`<div style="margin-bottom:8px"><b>\uc9c0\uc2dd\uc758 \uc0d8</b></div>`);
        lines.push(`<div>\uc54c\uace0 \uc788\ub294 \uc774\ub984: ${k.knownActorNames.size}\uba85</div>`);
        lines.push(`<div>\ubc1c\uacac\ud55c \uc544\uc774\ud15c: ${k.discoveredItems.size}\uc885</div>`);
        if (k.discoveredItems.size > 0) {
          const itemNames = [...k.discoveredItems]
            .map(id => { const def = getItemDef(id); return def ? def.name : id; })
            .join(', ');
          lines.push(`<div style="color:var(--text-dim);font-size:12px;margin-left:8px">${itemNames}</div>`);
        }
        lines.push(`<div>\ub9db\ubcf8 \uc74c\uc2dd: ${k.foodTypesEaten.size}\uc885</div>`);
        // Color profile
        lines.push(`<div style="margin-top:12px"><b>\uc601\ud63c\uc758 \uc0c9\ucc44</b></div>`);
        for (let i = 0; i < 8; i++) {
          const val = p.color.values[i];
          const scaled = Math.round((val - 0.5) * 200);
          const sign = scaled > 0 ? '+' : '';
          const barPct = Math.round(val * 100);
          lines.push(`<div style="display:flex;align-items:center;gap:8px;font-size:13px">
            <span style="width:32px">${elementName(i as Element)}</span>
            <div class="bar" style="flex:1;height:10px"><div class="bar-fill" style="width:${barPct}%;background:var(--el-${i})"></div></div>
            <span style="width:40px;text-align:right;font-size:12px">${sign}${scaled}</span>
          </div>`);
        }
        content.innerHTML = lines.join('');
        break;
      }

      case 'soul': {
        if (confirmMode !== 'none') {
          renderConfirm(content);
        } else {
          renderSoulTab(content);
        }
        break;
      }

      case 'restore': {
        renderRestoreTab(content);
        break;
      }
    }

    wrap.appendChild(content);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1=\uc5ec\uc815 2=\uc778\uc5f0 3=\uc9c0\uc2dd 4=\uc601\ud63c 5=\ubcf4\uc815 Esc=\ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);

    // Event bindings
    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      if (confirmMode !== 'none') { confirmMode = 'none'; render(el); }
      else callbacks.onBack();
    });
    wrap.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmMode = 'none';
        tab = btn.dataset.tab as SpringTab;
        render(el);
      });
    });
  }

  function renderSoulTab(content: HTMLElement): void {
    const p = session.player;
    const k = session.knowledge;
    const hyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

    // 캐릭터 유형 판별
    // - 닉네임(커스텀/탄생) 캐릭터: isCustom === true → 영혼 각인 + 천도제
    // - 1회차 하코: 플래그로 구분 → 영혼 각인만
    // - 2회차+ 하코 / NPC 캐릭터: 이탈만
    const isCustomChar = p.isCustom;
    const isFirstHako = p.name === '하코' && p.flags.get('first_run_hako') === true;
    const isDepartureOnly = !isCustomChar && !isFirstHako;

    const lines: string[] = [];
    lines.push(`<div style="margin-bottom:12px"><b>영혼의 의식</b></div>`);
    lines.push(`<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.6">
      잔잔한 샘물이 당신의 영혼에 속삭입니다.<br>
      이곳에서 현재의 여정을 마무리하고 새로운 시작을 할 수 있습니다.
    </div>`);

    // 여정 요약
    lines.push(`<div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:12px;font-size:12px;line-height:1.8">
      <div>${p.name} · 히페리온 Lv.${hyperionTotal}</div>
      <div>여정 ${session.gameTime.day}일차 · 방문 ${k.visitedLocations.size}곳 · 던전 클리어 ${k.totalDungeonsCleared}회</div>
      <div>동료 ${k.recruitedEver.size}명 영입 · 대화 ${k.totalConversations}회</div>
      ${k.earnedTitles.length > 0 ? `<div>칭호 ${k.earnedTitles.length}개 획득</div>` : ''}
    </div>`);

    content.innerHTML = lines.join('');

    const getContainer = () => content.closest('.memory-spring-screen')?.parentElement as HTMLElement;

    if (!isDepartureOnly) {
      // 영혼 각인 버튼 (1회차 하코 또는 커스텀 캐릭터)
      const imprintBtn = document.createElement('button');
      imprintBtn.className = 'btn';
      imprintBtn.style.cssText = 'width:100%;text-align:left;padding:12px;margin-bottom:8px;border-left:4px solid var(--warning)';
      imprintBtn.innerHTML = `
        <div style="font-weight:bold;color:var(--warning)">✦ 영혼 각인</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
          ${p.name}의 영혼을 세계에 각인합니다.<br>
          ${p.name}은(는) 이 세계의 주민(NPC)이 되어 살아가며,<br>
          당신은 새로운 캐릭터로 여정을 시작합니다.
        </div>`;
      imprintBtn.addEventListener('click', () => { confirmMode = 'imprint'; render(getContainer()); });
      content.appendChild(imprintBtn);
    }

    if (isDepartureOnly) {
      // 이탈 버튼 (2회차+ 하코 / NPC 캐릭터)
      const departureBtn = document.createElement('button');
      departureBtn.className = 'btn';
      departureBtn.style.cssText = 'width:100%;text-align:left;padding:12px;margin-bottom:8px;border-left:4px solid var(--warning)';
      departureBtn.innerHTML = `
        <div style="font-weight:bold;color:var(--warning)">✦ 이탈</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
          ${p.name}의 여정이 끝납니다.<br>
          ${p.name}은(는) 이 세계의 주민으로 돌아가며,<br>
          당신은 새로운 캐릭터로 여정을 시작합니다.
        </div>`;
      departureBtn.addEventListener('click', () => { confirmMode = 'departure'; render(getContainer()); });
      content.appendChild(departureBtn);
    }

    if (isCustomChar) {
      // 천도제 버튼 (커스텀/탄생 캐릭터만)
      const rebirthBtn = document.createElement('button');
      rebirthBtn.className = 'btn';
      rebirthBtn.style.cssText = 'width:100%;text-align:left;padding:12px;margin-bottom:8px;border-left:4px solid var(--accent)';
      rebirthBtn.innerHTML = `
        <div style="font-weight:bold;color:var(--accent)">☽ 천도제</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
          ${p.name}의 영혼을 떠나보냅니다.<br>
          캐릭터는 세계에서 사라지며,<br>
          당신은 새로운 캐릭터로 여정을 시작합니다.
        </div>`;
      rebirthBtn.addEventListener('click', () => { confirmMode = 'rebirth'; render(getContainer()); });
      content.appendChild(rebirthBtn);
    }
  }

  let lastRepairResult: RepairResult | null = null;

  function renderRestoreTab(content: HTMLElement): void {
    const k = session.knowledge;
    const p = session.player;

    // 진단: 의심되는 누락 항목 카운트
    const partyMissingRecruit = k.partyMembers.filter(n => !k.recruitedEver.has(n)).length;
    const partyMissingKnown = k.partyMembers.filter(n => !k.knownActorNames.has(n)).length;
    const currentLocMissing = !k.visitedLocations.has(p.currentLocation);
    const homeLocMissing = p.homeLocation && !k.visitedLocations.has(p.homeLocation);
    const interactedMissingKnown = [...p.relationships.entries()]
      .filter(([n, rel]) => rel.interactionCount > 0 && !k.knownActorNames.has(n)).length;
    const interactedMissingConv = [...p.relationships.entries()]
      .filter(([n, rel]) => rel.interactionCount > 0 && !k.conversationPartners.has(n)).length;

    const totalSuspicious = partyMissingRecruit + partyMissingKnown
      + (currentLocMissing ? 1 : 0) + (homeLocMissing ? 1 : 0)
      + interactedMissingKnown + interactedMissingConv;

    const lines: string[] = [];
    lines.push(`<div style="margin-bottom:12px"><b>기억 보정</b></div>`);
    lines.push(`<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.6">
      옛 세이브에서 누락된 기억을 다시 새깁니다.<br>
      방문 기록·동료 영입·만난 인연이 흐려져 있다면 이곳에서 보정할 수 있습니다.<br>
      <span style="color:var(--warning)">※ 보정은 누락된 기록을 추가하는 방향으로만 작동하며, 기존 진행은 잃지 않습니다.</span>
    </div>`);

    lines.push(`<div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:12px;font-size:12px;line-height:1.8">
      <div><b>현재 상태</b></div>
      <div>방문한 장소: ${k.visitedLocations.size}곳</div>
      <div>알고 있는 이름: ${k.knownActorNames.size}명</div>
      <div>대화한 적 있는 인연: ${k.conversationPartners.size}명</div>
      <div>영입한 적 있는 동료: ${k.recruitedEver.size}명 (현재 파티: ${k.partyMembers.length}명)</div>
    </div>`);

    if (totalSuspicious > 0) {
      lines.push(`<div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:12px;font-size:12px;line-height:1.8;border-left:4px solid var(--warning)">
        <div style="color:var(--warning)"><b>의심되는 누락 ${totalSuspicious}건</b></div>
        ${currentLocMissing ? `<div>· 현재 위치(${locationName(p.currentLocation) || p.currentLocation})가 방문 기록에 없습니다.</div>` : ''}
        ${homeLocMissing ? `<div>· 거점 위치가 방문 기록에 없습니다.</div>` : ''}
        ${partyMissingRecruit > 0 ? `<div>· 현재 파티 동료 ${partyMissingRecruit}명이 영입 기록에 없습니다.</div>` : ''}
        ${partyMissingKnown > 0 ? `<div>· 현재 파티 동료 ${partyMissingKnown}명이 만난 기록에 없습니다.</div>` : ''}
        ${interactedMissingKnown > 0 ? `<div>· 호감도가 형성된 인연 ${interactedMissingKnown}명이 만난 기록에 없습니다.</div>` : ''}
        ${interactedMissingConv > 0 ? `<div>· 호감도가 형성된 인연 ${interactedMissingConv}명이 대화 기록에 없습니다.</div>` : ''}
      </div>`);
    } else {
      lines.push(`<div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--text-dim)">
        보정이 필요한 명백한 누락은 보이지 않습니다. 그래도 보정을 실행하면 같은 위치의 NPC를 만난 기록에 새깁니다.
      </div>`);
    }

    if (lastRepairResult) {
      const r = lastRepairResult;
      if (r.fixedItems.length === 0) {
        lines.push(`<div style="padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--text-dim)">
          이전 보정에서 추가된 항목이 없었습니다.
        </div>`);
      } else {
        const head = r.fixedItems.slice(0, 12);
        const more = r.fixedItems.length - head.length;
        lines.push(`<div style="padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;font-size:12px;line-height:1.7">
          <div style="color:var(--success)"><b>보정 결과: ${r.fixedItems.length}건 추가</b></div>
          ${head.map(s => `<div style="color:var(--text-dim)">· ${s}</div>`).join('')}
          ${more > 0 ? `<div style="color:var(--text-dim)">… 외 ${more}건</div>` : ''}
          ${r.hyperionRaised ? `<div style="color:var(--warning);margin-top:4px">✦ 히페리온 조건이 새로 충족되었습니다.</div>` : ''}
        </div>`);
      }
    }

    content.innerHTML = lines.join('');

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.cssText = 'width:100%;padding:12px';
    btn.textContent = '기억 보정 실행 [Enter]';
    btn.addEventListener('click', () => {
      lastRepairResult = repairSave(session);
      session.backlog.add(session.gameTime,
        lastRepairResult.fixedItems.length > 0
          ? `기억의 샘에서 ${lastRepairResult.fixedItems.length}건의 기억을 보정했다.`
          : '기억의 샘을 들여다봤지만 보정할 것이 없었다.',
        '시스템');
      const container = content.closest('.memory-spring-screen')?.parentElement as HTMLElement | null;
      if (container) render(container);
    });
    content.appendChild(btn);
  }

  function renderConfirm(content: HTMLElement): void {
    const p = session.player;
    const isFinal = confirmMode === 'imprint_final' || confirmMode === 'rebirth_final' || confirmMode === 'departure_final';
    const isImprint = confirmMode === 'imprint' || confirmMode === 'imprint_final';
    const isDeparture = confirmMode === 'departure' || confirmMode === 'departure_final';
    const container = () => content.closest('.memory-spring-screen')?.parentElement as HTMLElement;

    const lines: string[] = [];

    if (!isFinal) {
      // 1차 확인
      if (isImprint) {
        lines.push(`<div style="text-align:center;font-size:28px;margin-bottom:8px">✦</div>`);
        lines.push(`<div style="text-align:center;font-weight:bold;color:var(--warning);margin-bottom:12px;font-size:16px">영혼 각인</div>`);
        lines.push(`<div style="text-align:center;color:var(--text-dim);line-height:1.8;margin-bottom:16px">
          ${p.name}의 영혼이 이 세계에 각인됩니다.<br>
          ${p.name}${eunNeun(p.name)} NPC로서 이 세계에서 계속 살아갑니다.<br>
          당신은 새로운 캐릭터를 선택하게 됩니다.
        </div>`);
      } else if (isDeparture) {
        lines.push(`<div style="text-align:center;font-size:28px;margin-bottom:8px">✦</div>`);
        lines.push(`<div style="text-align:center;font-weight:bold;color:var(--warning);margin-bottom:12px;font-size:16px">이탈</div>`);
        lines.push(`<div style="text-align:center;color:var(--text-dim);line-height:1.8;margin-bottom:16px">
          ${p.name}의 여정이 끝납니다.<br>
          ${p.name}${eunNeun(p.name)} 이 세계의 주민으로 돌아갑니다.<br>
          당신은 새로운 캐릭터를 선택하게 됩니다.
        </div>`);
      } else {
        lines.push(`<div style="text-align:center;font-size:28px;margin-bottom:8px">☽</div>`);
        lines.push(`<div style="text-align:center;font-weight:bold;color:var(--accent);margin-bottom:12px;font-size:16px">천도제</div>`);
        lines.push(`<div style="text-align:center;color:var(--text-dim);line-height:1.8;margin-bottom:16px">
          ${p.name}의 영혼이 세계를 떠납니다.<br>
          캐릭터는 이 세계에서 완전히 사라집니다.<br>
          당신은 새로운 캐릭터를 선택하게 됩니다.
        </div>`);
      }
    } else {
      // 2차 최종 확인
      lines.push(`<div style="text-align:center;font-size:22px;margin-bottom:8px">⚠</div>`);
      lines.push(`<div style="text-align:center;font-weight:bold;color:var(--accent);margin-bottom:12px;font-size:15px">정말 실행하시겠습니까?</div>`);
      const finalMsg = isImprint
        ? `${p.name}${eunNeun(p.name)} NPC가 됩니다.`
        : isDeparture
          ? `${p.name}이(가) 주민으로 돌아갑니다.`
          : `${p.name}${eunNeun(p.name)} 영원히 사라집니다.`;
      lines.push(`<div style="text-align:center;color:var(--accent);font-size:14px;line-height:1.8;margin-bottom:16px">
        이 선택은 <b>되돌릴 수 없습니다.</b><br>
        ${finalMsg}
      </div>`);
    }

    content.innerHTML = lines.join('');

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.style.minWidth = '120px';
    cancelBtn.textContent = '취소 [Esc]';
    cancelBtn.addEventListener('click', () => { confirmMode = 'none'; render(container()); });
    btnWrap.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.style.minWidth = '120px';
    if (!isFinal) {
      confirmBtn.textContent = '계속 [Enter]';
      confirmBtn.addEventListener('click', () => {
        confirmMode = isImprint ? 'imprint_final' : isDeparture ? 'departure_final' : 'rebirth_final';
        render(container());
      });
    } else {
      confirmBtn.textContent = isImprint ? '각인한다 [Enter]' : isDeparture ? '이탈한다 [Enter]' : '떠나보낸다 [Enter]';
      confirmBtn.style.background = 'var(--accent)';
      confirmBtn.addEventListener('click', () => {
        if (isImprint) {
          session.backlog.add(session.gameTime, `${p.name}의 영혼이 기억의 샘에 각인되었다.`, '시스템');
          callbacks.onSoulImprint();
        } else if (isDeparture) {
          session.backlog.add(session.gameTime, `${p.name}이(가) 기억의 샘을 떠났다.`, '시스템');
          callbacks.onDeparture();
        } else {
          session.backlog.add(session.gameTime, `${p.name}의 영혼이 세계를 떠났다.`, '시스템');
          callbacks.onRebirth();
        }
      });
    }
    btnWrap.appendChild(confirmBtn);
    content.appendChild(btnWrap);
  }

  return {
    id: 'memory-spring',
    render,
    onKey(key) {
      const container = document.querySelector('.memory-spring-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;
      if (key === 'Escape' || key === 'q') {
        if (confirmMode !== 'none') { confirmMode = 'none'; render(container); }
        else callbacks.onBack();
        return;
      }
      if (confirmMode !== 'none') {
        if (key === 'Enter') {
          const p = session.player;
          if (confirmMode === 'imprint') {
            confirmMode = 'imprint_final'; render(container);
          } else if (confirmMode === 'rebirth') {
            confirmMode = 'rebirth_final'; render(container);
          } else if (confirmMode === 'departure') {
            confirmMode = 'departure_final'; render(container);
          } else if (confirmMode === 'imprint_final') {
            session.backlog.add(session.gameTime, `${p.name}의 영혼이 기억의 샘에 각인되었다.`, '시스템');
            callbacks.onSoulImprint();
          } else if (confirmMode === 'rebirth_final') {
            session.backlog.add(session.gameTime, `${p.name}의 영혼이 세계를 떠났다.`, '시스템');
            callbacks.onRebirth();
          } else if (confirmMode === 'departure_final') {
            session.backlog.add(session.gameTime, `${p.name}이(가) 기억의 샘을 떠났다.`, '시스템');
            callbacks.onDeparture();
          }
        }
        return;
      }
      if (key === '1') { tab = 'journey'; render(container); }
      else if (key === '2') { tab = 'relations'; render(container); }
      else if (key === '3') { tab = 'knowledge'; render(container); }
      else if (key === '4') { tab = 'soul'; render(container); }
      else if (key === '5') { tab = 'restore'; render(container); }
    },
  };
}
