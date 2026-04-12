// village-event.ts — 마을 이벤트 선택지 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { VillageState } from '../../models/village';
import { VillageEventDef } from '../../models/village-event';
import { applyVillageEventChoice } from '../../systems/village-simulation';

export function createVillageEventScreen(
  session: GameSession,
  village: VillageState,
  eventDef: VillageEventDef,
  onResolved: () => void,
): Screen {
  let resultMessage = '';
  let resolved = false;

  function render(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    if (resolved) {
      wrap.innerHTML = `
        <h2 style="text-align:center">${eventDef.name}</h2>
        <div style="padding:16px;background:var(--bg-panel);border-radius:10px;margin:12px 0;
                    font-size:14px;line-height:1.7;text-align:center">
          ${resultMessage}
        </div>
        <div style="text-align:center;margin-top:16px">
          <button class="btn btn-primary" data-close>확인 [Enter]</button>
        </div>
      `;
      wrap.querySelector('[data-close]')?.addEventListener('click', onResolved);
    } else {
      const c1 = eventDef.choices[0];
      const c2 = eventDef.choices[1];

      const choice1CostText = c1.goldCost > 0 ? ` (${c1.goldCost}G)` : '';
      const choice2CostText = c2.goldCost > 0 ? ` (${c2.goldCost}G)` : '';

      wrap.innerHTML = `
        <h2 style="text-align:center;color:var(--warning)">${eventDef.name}</h2>
        <div style="padding:14px;background:var(--bg-panel);border-radius:10px;margin:12px 0;
                    font-size:13px;line-height:1.7;color:var(--text)">
          ${eventDef.description}
        </div>
        <div style="font-size:11px;color:var(--text-dim);text-align:center;margin-bottom:10px">
          선택지를 고르세요
        </div>
        <div class="menu-buttons">
          <button class="btn" data-choice="0"
            style="text-align:left;padding:10px 14px;margin-bottom:8px;border:1px solid var(--warning)">
            <div style="font-weight:bold">[1] ${c1.label}${choice1CostText}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:3px">
              성공 확률: ${Math.round(c1.successChance * 100)}%
            </div>
          </button>
          <button class="btn" data-choice="1"
            style="text-align:left;padding:10px 14px;border:1px solid var(--border)">
            <div style="font-weight:bold">[2] ${c2.label}${choice2CostText}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:3px">
              성공 확률: ${Math.round(c2.successChance * 100)}%
            </div>
          </button>
        </div>
        <p class="hint">1=첫 번째, 2=두 번째</p>
      `;

      wrap.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.choice ?? '0', 10) as 0 | 1;
          resultMessage = applyVillageEventChoice(
            village,
            idx,
            session.gameTime.day,
            session.backlog,
            session.gameTime,
          );
          resolved = true;
          render(el);
        });
      });
    }

    el.appendChild(wrap);
  }

  return {
    id: 'village-event',
    render,
    onKey(key) {
      if (resolved) {
        if (key === 'Enter' || key === 'Escape') onResolved();
      } else {
        if (key === '1') {
          resultMessage = applyVillageEventChoice(
            village, 0, session.gameTime.day, session.backlog, session.gameTime,
          );
          resolved = true;
          const el = document.querySelector<HTMLElement>('#app');
          if (el) render(el);
        } else if (key === '2') {
          resultMessage = applyVillageEventChoice(
            village, 1, session.gameTime.day, session.backlog, session.gameTime,
          );
          resolved = true;
          const el = document.querySelector<HTMLElement>('#app');
          if (el) render(el);
        }
      }
    },
  };
}
