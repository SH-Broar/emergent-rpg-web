// home.ts — 집/수면 화면
// 원본: HomeScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';

export function createHomeScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';

  function renderHome(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen home-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\uc9d1';
    wrap.appendChild(title);

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'trade-message';
      msg.textContent = message;
      wrap.appendChild(msg);
    }

    const isHome = p.currentLocation === p.homeLocation;

    if (isHome) {
      const info = document.createElement('p');
      info.textContent = `HP: ${Math.round(p.base.hp)}/${p.getEffectiveMaxHp()} | \uae30\ub825: ${Math.round(p.base.vigor)}/${p.getEffectiveMaxVigor()}`;
      wrap.appendChild(info);

      const sleepBtn = document.createElement('button');
      sleepBtn.className = 'btn';
      sleepBtn.style.minHeight = '44px';
      sleepBtn.innerHTML = `<span>\uc7a0\uc790\uae30</span> <span class="key-hint">[1]</span>`;
      sleepBtn.addEventListener('click', () => executeSleep(el));
      wrap.appendChild(sleepBtn);
    } else {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '\uc9d1\uc774 \uc544\ub2cc \uc7a5\uc18c\uc5d0\uc11c\ub294 \uc7a0\uc744 \uc794 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.';
      wrap.appendChild(hint);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  function executeSleep(el: HTMLElement): void {
    // Calculate hours until 06:00 next day
    const gt = session.gameTime;
    let hoursUntilMorning: number;
    if (gt.hour >= 6) {
      // Sleep until next day 06:00
      hoursUntilMorning = (24 - gt.hour) + 6;
    } else {
      // Already before 06:00, sleep until 06:00
      hoursUntilMorning = 6 - gt.hour;
    }
    const minuteAdvance = hoursUntilMorning * 60 - gt.minute;

    // Apply sleep
    p.base.sleeping = true;
    session.gameTime.advance(minuteAdvance);
    p.base.sleeping = false;

    // Restore
    p.base.vigor = p.getEffectiveMaxVigor();
    p.adjustHp(20);

    // Backlog
    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) \uc7a0\uc5d0\uc11c \uae68\uc5b4\ub0ac\ub2e4.`,
      '\uc2dc\uc2a4\ud15c',
    );

    message = '\uc7a0\uc5d0\uc11c \uae68\uc5b4\ub0ac\ub2e4. \uae30\ub825\uc774 \ud68c\ubcf5\ub418\uc5c8\ub2e4!';
    renderHome(el);
  }

  return {
    id: 'home',
    render: renderHome,
    onKey(key) {
      const container = document.querySelector('.home-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (key === '1' && p.currentLocation === p.homeLocation) {
        executeSleep(container);
      }
    },
  };
}
