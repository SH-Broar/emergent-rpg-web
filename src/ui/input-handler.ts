// input-handler.ts — 키보드 + 터치 통합 입력

import { ScreenManager } from './screen-manager';

export class InputHandler {
  private screenManager: ScreenManager;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onIdle: (() => void) | null = null;
  private idleMs = 10000;

  constructor(screenManager: ScreenManager) {
    this.screenManager = screenManager;
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.resetIdleTimer();
  }

  setIdleCallback(cb: () => void, ms = 10000): void {
    this.onIdle = cb;
    this.idleMs = ms;
    this.resetIdleTimer();
  }

  private handleKeydown(e: KeyboardEvent): void {
    this.resetIdleTimer();
    // Prevent default for game keys
    if (/^[0-9a-zA-Z]$/.test(e.key) || e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
    }
    this.screenManager.handleKey(e.key);
  }

  // 버튼 클릭에서 호출
  dispatchAction(key: string): void {
    this.resetIdleTimer();
    this.screenManager.handleKey(key);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.onIdle) {
      this.idleTimer = setTimeout(() => this.onIdle?.(), this.idleMs);
    }
  }

  destroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }
}
