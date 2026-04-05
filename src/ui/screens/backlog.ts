// backlog.ts — 백로그 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { createTextDisplay } from '../components/text-display';

export function createBacklogScreen(
  session: GameSession,
  onBack: () => void,
): Screen {
  return {
    id: 'backlog',
    render(el) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen backlog-screen';

      const backBtn = document.createElement('button');
      backBtn.className = 'btn back-btn';
      backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
      backBtn.addEventListener('click', onBack);
      wrap.appendChild(backBtn);

      const title = document.createElement('h2');
      title.textContent = '\ubc31\ub85c\uadf8';
      wrap.appendChild(title);

      const entries = session.backlog.getPlayerVisible(session.player.name);
      const lines = entries.map(e => `${e.time.toString()} [${e.category}] ${e.text}`);

      const display = createTextDisplay(lines, 100);
      wrap.appendChild(display);

      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Esc \ub4a4\ub85c';
      wrap.appendChild(hint);

      el.appendChild(wrap);
    },
    onKey(key) {
      if (key === 'Escape' || key === 'q') onBack();
    },
  };
}
