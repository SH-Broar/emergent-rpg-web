// home.ts — 집/수면 화면
// 원본: HomeScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { seasonName } from '../../types/enums';
import { advanceTurn } from '../../systems/world-simulation';
import { applyTimeTheme } from '../time-theme';

export function createHomeScreen(
  session: GameSession,
  onDone: () => void,
  onNavigate?: (screen: 'storage' | 'cooking' | 'farm') => void,
): Screen {
  const p = session.player;
  let phase: 'menu' | 'sleeping' | 'wakeup' | 'nap_done' = 'menu';

  function renderMenu(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen home-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '← 뒤로 [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    const isOwned = session.knowledge.ownedBases.has(p.currentLocation);
    title.textContent = isOwned ? '거점' : '집';
    wrap.appendChild(title);

    const isHome = p.currentLocation === p.homeLocation;

    if (isOwned) {
      const info = document.createElement('p');
      info.textContent = `HP: ${Math.round(p.base.hp)}/${p.getEffectiveMaxHp()} | MP: ${Math.round(p.base.mp)}/${p.getEffectiveMaxMp()} | TP: ${p.base.ap}/${p.getEffectiveMaxAp()}`;
      wrap.appendChild(info);

      // 잠자기 (다음 날 아침, 완전 회복)
      const sleepBtn = document.createElement('button');
      sleepBtn.className = 'btn btn-primary';
      sleepBtn.style.minHeight = '44px';
      sleepBtn.innerHTML = `<span>🌙 잠자기 — 다음 날 아침까지 (완전 회복)</span> <span class="key-hint">[1]</span>`;
      sleepBtn.addEventListener('click', () => startSleep(el));
      wrap.appendChild(sleepBtn);

      // 짧은 휴식 (2시간, 30% 회복)
      const napBtn = document.createElement('button');
      napBtn.className = 'btn';
      napBtn.style.minHeight = '44px';
      napBtn.innerHTML = `<span>💤 짧은 휴식 — 2시간 (HP·MP 30% 회복)</span> <span class="key-hint">[2]</span>`;
      napBtn.addEventListener('click', () => doNap(el));
      wrap.appendChild(napBtn);

      // 창고 (항상 표시)
      const storageBtn = document.createElement('button');
      storageBtn.className = 'btn';
      storageBtn.style.minHeight = '44px';
      storageBtn.innerHTML = `<span>📦 창고 확인</span> <span class="key-hint">[3]</span>`;
      storageBtn.dataset.homeAction = 'storage';
      wrap.appendChild(storageBtn);

      // 요리 (항상 표시)
      const cookBtn = document.createElement('button');
      cookBtn.className = 'btn';
      cookBtn.style.minHeight = '44px';
      cookBtn.innerHTML = `<span>🍳 요리하기</span> <span class="key-hint">[4]</span>`;
      cookBtn.dataset.homeAction = 'cooking';
      wrap.appendChild(cookBtn);

      // 농장 (Lv.3 이상)
      const baseLevel = session.knowledge.getBaseLevel(p.currentLocation);
      if (baseLevel >= 3 && onNavigate) {
        const farmBtn = document.createElement('button');
        farmBtn.className = 'btn';
        farmBtn.style.minHeight = '44px';
        farmBtn.innerHTML = `<span>🌾 농장 관리</span> <span class="key-hint">[5]</span>`;
        farmBtn.dataset.homeAction = 'farm';
        wrap.appendChild(farmBtn);
      }

    } else if (isHome) {
      // 기본 homeLocation (소유 거점 아님): 하루 1번 짧은 휴식만
      const lastNapDay = session.knowledge.lastNapDay;
      const todayDay = session.gameTime.day;
      const canNap = lastNapDay !== todayDay;

      const napBtn = document.createElement('button');
      napBtn.className = 'btn';
      napBtn.style.minHeight = '44px';
      napBtn.innerHTML = canNap
        ? `<span>💤 짧은 휴식 — 2시간 (HP·MP 30% 회복)</span> <span class="key-hint">[1]</span>`
        : `<span style="color:var(--text-dim)">💤 오늘은 이미 쉬었다. (낮잠 1회/일)</span>`;
      if (canNap) napBtn.addEventListener('click', () => {
        session.knowledge.lastNapDay = todayDay;
        doNap(el);
      });
      wrap.appendChild(napBtn);

    } else {
      // 아무 거점도 아닌 곳
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '거점이 아닌 장소입니다. 마을 길드에서 거점을 구매할 수 있습니다.';
      wrap.appendChild(hint);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc 뒤로';
    wrap.appendChild(hint);

    el.appendChild(wrap);

    // 거점 액션 버튼 이벤트
    wrap.querySelectorAll<HTMLButtonElement>('[data-home-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.homeAction! as 'storage' | 'cooking' | 'farm';
        onDone();
        onNavigate?.(act);
      });
    });
  }

  function doNap(el: HTMLElement): void {
    const napMinutes = 120; // 2시간
    // 회복 전 hyperionBonus 갱신 (스탯 제공자 동기화)
    const napHyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);
    p.hyperionBonus = napHyperionTotal - p.hyperionLevel;
    advanceTurn(
      napMinutes, session.gameTime, session.world, session.events,
      session.actors, session.playerIdx, session.backlog,
      session.social, session.knowledge,
    );
    const hpRecover = Math.round(p.getEffectiveMaxHp() * 0.3);
    const mpRecover = Math.round(p.getEffectiveMaxMp() * 0.3);
    p.adjustHp(hpRecover);
    p.adjustMp(mpRecover);
    session.backlog.add(session.gameTime, `${p.name}이(가) 잠시 휴식을 취했다.`, '행동');
    phase = 'nap_done';

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen';
    wrap.style.cssText = 'justify-content:center;align-items:center;text-align:center;background:var(--bg);';
    wrap.innerHTML = `
      <div style="font-size:28px;margin-bottom:12px">💤</div>
      <h2 style="color:var(--success);margin-bottom:8px">잠시 쉬었다</h2>
      <p style="color:var(--text-dim);margin-bottom:16px">${session.gameTime.toString()}</p>
      <div style="font-size:14px;color:var(--text-dim);margin-bottom:20px">
        <p>HP +${hpRecover} · MP +${mpRecover}</p>
      </div>
      <button class="btn btn-primary" data-ok style="min-width:160px">확인 [Enter]</button>
    `;
    wrap.querySelector('[data-ok]')?.addEventListener('click', () => onDone());
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

    // 회복 전 hyperionBonus 갱신 (스탯 제공자 동기화)
    const sleepHyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);
    p.hyperionBonus = sleepHyperionTotal - p.hyperionLevel;

    // 전체 회복
    p.base.hp = p.getEffectiveMaxHp();
    p.base.mp = p.getEffectiveMaxMp();
    p.base.ap = p.getEffectiveMaxAp();

    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) \uc7a0\uc5d0\uc11c \uae68\uc5b4\ub0ac\ub2e4.`,
      '\uc2dc\uc2a4\ud15c',
    );
  }

  function renderWakeup(el: HTMLElement): void {
    applyTimeTheme(session.gameTime);
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

      const isOwned = session.knowledge.ownedBases.has(p.currentLocation);
      const isHome = p.currentLocation === p.homeLocation;

      if (phase === 'menu') {
        if (key === 'Escape') { onDone(); return; }
        if (key === '1' && isOwned) { startSleep(container); }
        if (key === '2' && isOwned) { doNap(container); }
        if (key === '1' && isHome && !isOwned) {
          const lastNapDay = session.knowledge.lastNapDay;
          const todayDay = session.gameTime.day;
          if (lastNapDay !== todayDay) {
            session.knowledge.lastNapDay = todayDay;
            doNap(container);
          }
        }
        if (key === '5' && isOwned && onNavigate) {
          const level = session.knowledge.getBaseLevel(p.currentLocation);
          if (level >= 3) { onDone(); onNavigate('farm'); }
        }
      } else if (phase === 'wakeup' || phase === 'nap_done') {
        if (key === 'Enter' || key === ' ' || key === 'Escape') {
          onDone();
        }
      }
    },
  };
}
