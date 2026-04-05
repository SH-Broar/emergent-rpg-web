// memory-spring.ts — 기억의 샘 화면
// 플레이어의 여정과 기억을 되돌아보는 장소

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { raceName, spiritRoleName, elementName, Element } from '../../types/enums';
import { getItemDef } from '../../types/item-defs';

type SpringTab = 'journey' | 'relations' | 'knowledge';

export function createMemorySpringScreen(
  session: GameSession,
  onBack: () => void,
): Screen {
  let tab: SpringTab = 'journey';

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
    }

    wrap.appendChild(content);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1=\uc5ec\uc815 2=\uc778\uc5f0 3=\uc9c0\uc2dd Esc=\ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);

    // Event bindings
    wrap.querySelector('[data-back]')?.addEventListener('click', onBack);
    wrap.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as SpringTab;
        render(el);
      });
    });
  }

  return {
    id: 'memory-spring',
    render,
    onKey(key) {
      const container = document.querySelector('.memory-spring-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;
      if (key === 'Escape' || key === 'q') { onBack(); return; }
      if (key === '1') { tab = 'journey'; render(container); }
      else if (key === '2') { tab = 'relations'; render(container); }
      else if (key === '3') { tab = 'knowledge'; render(container); }
    },
  };
}
