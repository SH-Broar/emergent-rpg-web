// main-menu.ts — 메인 메뉴 화면
// 원본: GameScreens.h MenuResult — NewGame, Connect, Transition, Lore, Tutorial, CoreMatrix, Quit

import type { Screen } from '../screen-manager';

declare const __APP_VERSION__: string;

export type MenuChoice = 'new' | 'connect' | 'transition' | 'lore' | 'tutorial' | 'corematrix';

export function createMainMenuScreen(
  hasAutosave: boolean,
  onSelect: (choice: MenuChoice) => void,
): Screen {
  return {
    id: 'main-menu',
    render(el) {
      el.innerHTML = `
        <div class="screen menu-screen">
          <h1 class="game-title">rove-due-colorz</h1>
          <p class="subtitle">엘리메스 마을의 이야기</p>
          <div class="menu-buttons">
            <button class="btn btn-primary" data-action="new">1. 새 게임</button>
            ${hasAutosave ? '<button class="btn" data-action="connect">2. 접속 (이어하기)</button>' : ''}
            <button class="btn" data-action="transition">3. 천도제 (세계 전환)</button>
            <button class="btn" data-action="lore">4. 로어</button>
            <button class="btn" data-action="tutorial">5. 튜토리얼</button>
            <button class="btn" data-action="corematrix">6. 코어 매트릭스 진단</button>
          </div>
          <p class="hint">키보드: 1~6 선택</p>
          <div style="position:fixed;right:8px;bottom:8px;font-size:10px;color:#555577">${__APP_VERSION__}</div>
        </div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => onSelect(btn.dataset.action as MenuChoice));
      });
    },
    onKey(key) {
      if (key === '1') onSelect('new');
      if (key === '2' && hasAutosave) onSelect('connect');
      if (key === '3') onSelect('transition');
      if (key === '4') onSelect('lore');
      if (key === '5') onSelect('tutorial');
      if (key === '6') onSelect('corematrix');
    },
  };
}
