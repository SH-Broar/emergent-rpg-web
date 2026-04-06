// home.ts — 집/수면 화면
// 원본: HomeScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { seasonName } from '../../types/enums';

export function createHomeScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let phase: 'menu' | 'sleeping' | 'wakeup' = 'menu';

  function renderMenu(el: HTMLElement): void {
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

    const isHome = p.currentLocation === p.homeLocation;

    if (isHome) {
      const info = document.createElement('p');
      info.textContent = `HP: ${Math.round(p.base.hp)}/${p.getEffectiveMaxHp()} | MP: ${Math.round(p.base.mp)}/${p.getEffectiveMaxMp()} | TP: ${p.base.ap}/${p.getEffectiveMaxAp()}`;
      wrap.appendChild(info);

      const sleepBtn = document.createElement('button');
      sleepBtn.className = 'btn btn-primary';
      sleepBtn.style.minHeight = '44px';
      sleepBtn.innerHTML = `<span>\uc7a0\uc790\uae30</span> <span class="key-hint">[1]</span>`;
      sleepBtn.addEventListener('click', () => startSleep(el));
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

  function startSleep(el: HTMLElement): void {
    phase = 'sleeping';

    // 화면 전체 가림 (수면 연출)
    el.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'screen';
    overlay.style.cssText = 'justify-content:center;align-items:center;text-align:center;background:var(--bg);transition:opacity 0.5s;';
    overlay.innerHTML = `
      <div style="font-size:24px;color:var(--text-dim);margin-bottom:16px">\ud83c\udf19</div>
      <p style="font-size:16px;color:var(--text-dim)">\ub208\uc744 \uac10\ub294\ub2e4...</p>
    `;
    el.appendChild(overlay);

    // 1.2초 후 시간 경과 처리 및 기상 화면
    setTimeout(() => {
      executeSleep();
      phase = 'wakeup';
      renderWakeup(el);
    }, 1200);
  }

  function executeSleep(): void {
    const gt = session.gameTime;
    let hoursUntilMorning: number;
    if (gt.hour >= 6) {
      hoursUntilMorning = (24 - gt.hour) + 6;
    } else {
      hoursUntilMorning = 6 - gt.hour;
    }
    const minuteAdvance = hoursUntilMorning * 60 - gt.minute;

    p.base.sleeping = true;
    session.gameTime.advance(minuteAdvance);
    p.base.sleeping = false;

    // 전체 회복
    p.base.hp = p.getEffectiveMaxHp();
    p.base.vigor = p.getEffectiveMaxVigor();
    p.base.mp = p.getEffectiveMaxMp();
    p.base.ap = p.getEffectiveMaxAp();

    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) \uc7a0\uc5d0\uc11c \uae68\uc5b4\ub0ac\ub2e4.`,
      '\uc2dc\uc2a4\ud15c',
    );
  }

  function renderWakeup(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen';
    wrap.style.cssText = 'justify-content:center;align-items:center;text-align:center;background:var(--bg);';

    const gt = session.gameTime;
    const seasonStr = seasonName(session.world.getCurrentSeason());

    wrap.innerHTML = `
      <div style="font-size:32px;margin-bottom:12px">\u2600\ufe0f</div>
      <h2 style="color:var(--success);margin-bottom:8px">\uc544\uce68\uc774 \ubc1d\uc558\ub2e4</h2>
      <p style="font-size:18px;margin-bottom:4px">${gt.day}\uc77c\uc9f8 \u00b7 ${seasonStr}</p>
      <p style="color:var(--text-dim);margin-bottom:16px">${gt.toString()}</p>
      <div style="font-size:14px;color:var(--text-dim);margin-bottom:20px">
        <p>HP ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())} \u00b7 MP ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())} \u00b7 TP ${p.base.ap}/${p.getEffectiveMaxAp()}</p>
        <p style="color:var(--success)">\ubaa8\ub4e0 \uc0c1\ud0dc\uac00 \ud68c\ubcf5\ub418\uc5c8\ub2e4!</p>
      </div>
      <button class="btn btn-primary" data-ok style="min-width:160px">\ubc16\uc73c\ub85c [Enter]</button>
    `;

    wrap.querySelector('[data-ok]')?.addEventListener('click', () => onDone());
    el.appendChild(wrap);
  }

  return {
    id: 'home',
    render(el) {
      if (phase === 'wakeup') renderWakeup(el);
      else renderMenu(el);
    },
    onKey(key) {
      const container = document.querySelector('.home-screen')?.parentElement
        ?? document.querySelector('.screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (phase === 'menu') {
        if (key === 'Escape') { onDone(); return; }
        if (key === '1' && p.currentLocation === p.homeLocation) {
          startSleep(container);
        }
      } else if (phase === 'wakeup') {
        if (key === 'Enter' || key === ' ' || key === 'Escape') {
          onDone();
        }
      }
    },
  };
}
