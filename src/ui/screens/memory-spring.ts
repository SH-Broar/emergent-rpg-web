// memory-spring.ts — 기억의 샘 화면
// 플레이어의 여정과 기억을 되돌아보는 장소
// 영혼 각인(NPC화 후 새 캐릭터) / 천도제(완전 새 게임) 기능 포함

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { raceName, spiritRoleName, elementName, Element } from '../../types/enums';
import { getItemDef } from '../../types/item-defs';

type SpringTab = 'journey' | 'relations' | 'knowledge' | 'soul';

export interface MemorySpringCallbacks {
  onBack: () => void;
  /** 영혼 각인: 현재 캐릭터를 NPC화하고 새 캐릭터 선택으로 */
  onSoulImprint: () => void;
  /** 천도제: 세계를 유지하되 새 캐릭터로 시작 */
  onRebirth: () => void;
}

export function createMemorySpringScreen(
  session: GameSession,
  callbacks: MemorySpringCallbacks,
): Screen {
  let tab: SpringTab = 'journey';
  let confirmMode: 'none' | 'imprint' | 'rebirth' = 'none';

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
      </div>
    `;

    const content = document.createElement('div');
    content.className = 'text-display';
    content.style.flex = '1';

    switch (tab) {
      case 'journey': {
        const lines: string[] = [];
        lines.push(`<div style="margin-bottom:8px"><b>${p.name}\uc758 \uc5ec\uc815</b></div>`);
        lines.push(`<div>\ub808\ubca8: ${p.base.level} | \ud788\ud398\ub9ac\uc628: Lv.${p.hyperionLevel}</div>`);
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
        if (p.relationships.size === 0) {
          lines.push(`<div style="color:var(--text-dim)">\uc544\uc9c1 \ud615\uc131\ub41c \uad00\uacc4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</div>`);
        } else {
          const sorted = [...p.relationships.entries()].sort((a, b) =>
            (b[1].trust + b[1].affinity) - (a[1].trust + a[1].affinity)
          );
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
    }

    wrap.appendChild(content);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1=\uc5ec\uc815 2=\uc778\uc5f0 3=\uc9c0\uc2dd 4=\uc601\ud63c Esc=\ub4a4\ub85c';
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

    const lines: string[] = [];
    lines.push(`<div style="margin-bottom:12px"><b>영혼의 의식</b></div>`);
    lines.push(`<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.6">
      잔잔한 샘물이 당신의 영혼에 속삭입니다.<br>
      이곳에서 현재의 여정을 마무리하고 새로운 시작을 할 수 있습니다.
    </div>`);

    // 여정 요약
    lines.push(`<div style="padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:12px;font-size:12px;line-height:1.8">
      <div>${p.name} · Lv.${p.base.level} · 히페리온 Lv.${p.hyperionLevel}</div>
      <div>여정 ${session.gameTime.day}일차 · 방문 ${k.visitedLocations.size}곳 · 던전 클리어 ${k.totalDungeonsCleared}회</div>
      <div>동료 ${k.recruitedEver.size}명 영입 · 대화 ${k.totalConversations}회</div>
      ${k.earnedTitles.length > 0 ? `<div>칭호 ${k.earnedTitles.length}개 획득</div>` : ''}
    </div>`);

    content.innerHTML = lines.join('');

    // 영혼 각인 버튼
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
    imprintBtn.addEventListener('click', () => { confirmMode = 'imprint'; render(content.closest('.memory-spring-screen')?.parentElement as HTMLElement); });
    content.appendChild(imprintBtn);

    // 천도제 버튼
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
    rebirthBtn.addEventListener('click', () => { confirmMode = 'rebirth'; render(content.closest('.memory-spring-screen')?.parentElement as HTMLElement); });
    content.appendChild(rebirthBtn);
  }

  function renderConfirm(content: HTMLElement): void {
    const p = session.player;
    const isImprint = confirmMode === 'imprint';

    const lines: string[] = [];
    if (isImprint) {
      lines.push(`<div style="text-align:center;font-size:28px;margin-bottom:8px">✦</div>`);
      lines.push(`<div style="text-align:center;font-weight:bold;color:var(--warning);margin-bottom:12px;font-size:16px">영혼 각인</div>`);
      lines.push(`<div style="text-align:center;color:var(--text-dim);line-height:1.8;margin-bottom:16px">
        ${p.name}의 영혼이 이 세계에 각인됩니다.<br>
        ${p.name}은(는) NPC로서 이 세계에서 계속 살아갑니다.<br>
        당신은 새로운 캐릭터를 선택하게 됩니다.<br><br>
        <span style="color:var(--accent)">이 선택은 되돌릴 수 없습니다.</span>
      </div>`);
    } else {
      lines.push(`<div style="text-align:center;font-size:28px;margin-bottom:8px">☽</div>`);
      lines.push(`<div style="text-align:center;font-weight:bold;color:var(--accent);margin-bottom:12px;font-size:16px">천도제</div>`);
      lines.push(`<div style="text-align:center;color:var(--text-dim);line-height:1.8;margin-bottom:16px">
        ${p.name}의 영혼이 세계를 떠납니다.<br>
        캐릭터는 이 세계에서 완전히 사라집니다.<br>
        당신은 새로운 캐릭터를 선택하게 됩니다.<br><br>
        <span style="color:var(--accent)">이 선택은 되돌릴 수 없습니다.</span>
      </div>`);
    }

    content.innerHTML = lines.join('');

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.style.minWidth = '120px';
    cancelBtn.textContent = '취소 [Esc]';
    cancelBtn.addEventListener('click', () => { confirmMode = 'none'; render(content.closest('.memory-spring-screen')?.parentElement as HTMLElement); });
    btnWrap.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.style.minWidth = '120px';
    confirmBtn.textContent = isImprint ? '각인한다 [Enter]' : '떠나보낸다 [Enter]';
    confirmBtn.addEventListener('click', () => {
      if (isImprint) {
        // 영혼 각인: 현재 캐릭터를 NPC로 변환
        session.backlog.add(session.gameTime, `${p.name}의 영혼이 기억의 샘에 각인되었다.`, '시스템');
        callbacks.onSoulImprint();
      } else {
        // 천도제: 캐릭터 제거
        session.backlog.add(session.gameTime, `${p.name}의 영혼이 세계를 떠났다.`, '시스템');
        callbacks.onRebirth();
      }
    });
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
            session.backlog.add(session.gameTime, `${p.name}의 영혼이 기억의 샘에 각인되었다.`, '시스템');
            callbacks.onSoulImprint();
          } else {
            session.backlog.add(session.gameTime, `${p.name}의 영혼이 세계를 떠났다.`, '시스템');
            callbacks.onRebirth();
          }
        }
        return;
      }
      if (key === '1') { tab = 'journey'; render(container); }
      else if (key === '2') { tab = 'relations'; render(container); }
      else if (key === '3') { tab = 'knowledge'; render(container); }
      else if (key === '4') { tab = 'soul'; render(container); }
    },
  };
}
