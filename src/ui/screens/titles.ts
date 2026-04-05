// titles.ts — 칭호 화면
// 원본: TitleScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';

export function createTitlesScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  let message = '';

  function renderTitles(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen titles-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\uce6d\ud638';
    wrap.appendChild(title);

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'trade-message';
      msg.textContent = message;
      wrap.appendChild(msg);
    }

    // Active title display
    const activeTitle = session.knowledge.activeTitle;
    const activeInfo = document.createElement('p');
    activeInfo.innerHTML = `<strong>\ud604\uc7ac \uce6d\ud638:</strong> ${activeTitle || '\uc5c6\uc74c'}`;
    wrap.appendChild(activeInfo);

    // Count display
    const countInfo = document.createElement('p');
    countInfo.style.fontSize = '13px';
    countInfo.style.color = 'var(--text-dim)';
    countInfo.textContent = `\ud68d\ub4dd\ud55c \uce6d\ud638: ${session.knowledge.earnedTitles.length}\uac1c`;
    wrap.appendChild(countInfo);

    // Earned titles
    const earned = session.knowledge.earnedTitles;
    if (earned.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '\uc544\uc9c1 \ud68d\ub4dd\ud55c \uce6d\ud638\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.';
      wrap.appendChild(hint);
    } else {
      const list = document.createElement('div');
      list.className = 'npc-list';
      earned.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = `btn npc-item${t === activeTitle ? ' active' : ''}`;
        btn.style.minHeight = '44px';
        btn.dataset.idx = String(i);
        btn.innerHTML = `
          <span class="npc-num">${i + 1}.</span>
          <span class="npc-name">${t}</span>
          ${t === activeTitle ? '<span class="npc-detail">[\ud65c\uc131]</span>' : ''}
        `;
        btn.addEventListener('click', () => selectTitle(i, el));
        list.appendChild(btn);
      });
      wrap.appendChild(list);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~9 \uce6d\ud638 \uc120\ud0dd, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  function selectTitle(idx: number, el: HTMLElement): void {
    const earned = session.knowledge.earnedTitles;
    const selected = earned[idx];
    if (!selected) return;

    if (session.knowledge.activeTitle === selected) {
      session.knowledge.activeTitle = '';
      message = '\uce6d\ud638\ub97c \ud574\uc81c\ud588\uc2b5\ub2c8\ub2e4.';
    } else {
      session.knowledge.activeTitle = selected;
      message = `"${selected}" \uce6d\ud638\ub97c \uc7a5\ucc29\ud588\uc2b5\ub2c8\ub2e4.`;
    }

    session.backlog.add(
      session.gameTime,
      message,
      '\uc2dc\uc2a4\ud15c',
    );

    renderTitles(el);
  }

  return {
    id: 'titles',
    render: renderTitles,
    onKey(key) {
      const container = document.querySelector('.titles-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (/^[1-9]$/.test(key)) {
        selectTitle(parseInt(key, 10) - 1, container);
      }
    },
  };
}
