// main-menu.ts — 메인 메뉴 화면

import type { Screen } from '../screen-manager';
import type { GameTime } from '../../types/game-time';
import { applyTimeTheme, toggleColorMode, getColorMode } from '../time-theme';
import type { PackProgress } from '../../data/rdc-packs';

declare const __APP_VERSION__: string;

export type MenuChoice = 'new' | 'connect' | 'lore' | 'tutorial' | 'corematrix' | 'datapack' | 'debug_reset';

export function createMainMenuScreen(
  hasAutosave: boolean,
  onSelect: (choice: MenuChoice) => void,
  gameTime: GameTime,
  packProgress: PackProgress[] = [],
): Screen {
  let debugBuffer = '';
  let container: HTMLElement | null = null;

  function buildPackStatusHtml(): string {
    if (packProgress.length === 0) return '';
    const unlockedCount = packProgress.filter(p => p.unlocked).length;
    return `
      <div style="margin-top:12px;font-size:11px;color:var(--text-dim)">
        RDC 캐릭터팩 &nbsp;<span style="color:var(--success)">${unlockedCount}</span>/${packProgress.length} 해금
      </div>`;
  }

  function doRender(el: HTMLElement) {
    applyTimeTheme(gameTime);
    const isDark = getColorMode() === 'dark';
    const modeIcon  = isDark ? '☀️' : '🌙';
    const modeLabel = isDark ? '라이트 모드' : '다크 모드';
    const n = hasAutosave ? 1 : 0;

    el.innerHTML = `
      <div class="screen menu-screen">
        <h1 class="game-title">rove-due-colorz</h1>
        <div class="menu-buttons">
          ${hasAutosave
            ? '<button class="btn btn-primary" data-action="connect">1. 접속 (이어하기)</button>'
            : '<button class="btn btn-primary" data-action="new">1. 새 게임 (새 캐릭터)</button>'}
          <button class="btn" data-action="lore">${hasAutosave ? 2 : n + 2}. 로어</button>
          <button class="btn" data-action="tutorial">${hasAutosave ? 3 : n + 3}. 튜토리얼</button>
          <button class="btn" data-action="corematrix">${hasAutosave ? 4 : n + 4}. 코어 매트릭스 진단</button>
          <button class="btn" data-action="datapack">${hasAutosave ? 5 : n + 5}. 데이터팩 설정</button>
        </div>
        <p class="hint">키보드: 1~${hasAutosave ? 5 : n + 5} 선택</p>
        ${buildPackStatusHtml()}

        <!-- 모드 토글 + 버전 -->
        <div style="position:fixed;bottom:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 10px;pointer-events:none">
          <button class="btn" data-mode-toggle
            style="pointer-events:auto;font-size:12px;padding:4px 10px;min-height:0;opacity:0.75">
            ${modeIcon} ${modeLabel}
          </button>
          <span style="font-size:10px;color:var(--text-dim);align-self:flex-end;padding-bottom:2px">${__APP_VERSION__}</span>
        </div>
      </div>`;

    el.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => onSelect(btn.dataset.action as MenuChoice));
    });

    el.querySelector('[data-mode-toggle]')?.addEventListener('click', () => {
      toggleColorMode();
      if (container) doRender(container);
    });
  }

  return {
    id: 'main-menu',

    render(el) {
      container = el;
      doRender(el);
    },

    onKey(key) {
      // 디버그 커맨드: "debug" 입력 → 세계 리셋
      if (key.length === 1 && /^[a-z]$/i.test(key)) {
        debugBuffer += key.toLowerCase();
        if (debugBuffer.length > 10) debugBuffer = debugBuffer.slice(-10);
        if (debugBuffer.endsWith('debug')) {
          debugBuffer = '';
          onSelect('debug_reset');
          return;
        }
      }

      if (hasAutosave) {
        if (key === '1') onSelect('connect');
        if (key === '2') onSelect('lore');
        if (key === '3') onSelect('tutorial');
        if (key === '4') onSelect('corematrix');
        if (key === '5') onSelect('datapack');
      } else {
        if (key === '1') onSelect('new');
        if (key === '2') onSelect('lore');
        if (key === '3') onSelect('tutorial');
        if (key === '4') onSelect('corematrix');
        if (key === '5') onSelect('datapack');
      }
    },
  };
}
