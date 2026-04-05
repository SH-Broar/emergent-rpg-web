// main-menu.ts — 메인 메뉴 화면

import type { Screen } from '../screen-manager';

declare const __APP_VERSION__: string;

export type MenuChoice = 'new' | 'connect' | 'lore' | 'tutorial' | 'corematrix' | 'datapack';

export function createMainMenuScreen(
  hasAutosave: boolean,
  onSelect: (choice: MenuChoice) => void,
): Screen {
  return {
    id: 'main-menu',
    render(el) {
      const n = hasAutosave ? 1 : 0; // 오프셋
      el.innerHTML = `
        <div class="screen menu-screen">
          <h1 class="game-title">rove-due-colorz</h1>
          <div class="menu-buttons">
            <button class="btn btn-primary" data-action="new">1. 새 게임 (새 캐릭터)</button>
            ${hasAutosave ? '<button class="btn" data-action="connect">2. 접속 (이어하기)</button>' : ''}
            <button class="btn" data-action="lore">${n + 2}. 로어</button>
            <button class="btn" data-action="tutorial">${n + 3}. 튜토리얼</button>
            <button class="btn" data-action="corematrix">${n + 4}. 코어 매트릭스 진단</button>
            <button class="btn" data-action="datapack">${n + 5}. 데이터팩 설정</button>
          </div>
          <p class="hint">키보드: 1~${n + 5} 선택</p>
          <div style="position:fixed;right:8px;bottom:8px;font-size:10px;color:#555577">${__APP_VERSION__}</div>
        </div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => onSelect(btn.dataset.action as MenuChoice));
      });
    },
    onKey(key) {
      if (key === '1') onSelect('new');
      if (hasAutosave) {
        if (key === '2') onSelect('connect');
        if (key === '3') onSelect('lore');
        if (key === '4') onSelect('tutorial');
        if (key === '5') onSelect('corematrix');
        if (key === '6') onSelect('datapack');
      } else {
        if (key === '2') onSelect('lore');
        if (key === '3') onSelect('tutorial');
        if (key === '4') onSelect('corematrix');
        if (key === '5') onSelect('datapack');
      }
    },
  };
}
