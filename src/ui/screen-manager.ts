// screen-manager.ts — 화면 전환 상태 머신

export interface Screen {
  id: string;
  render(container: HTMLElement): void;
  onKey?(key: string): void;
  onEnter?(): void;
  onExit?(): void;
}

export class ScreenManager {
  private stack: Screen[] = [];
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  get current(): Screen | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** 스택 최상단 화면 반환 (current alias) */
  peek(): Screen | null {
    return this.current;
  }

  push(screen: Screen): void {
    this.current?.onExit?.();
    this.stack.push(screen);
    screen.onEnter?.();
    this.render();
  }

  pop(): void {
    const old = this.stack.pop();
    old?.onExit?.();
    this.current?.onEnter?.();
    this.render();
  }

  replace(screen: Screen): void {
    const old = this.stack.pop();
    old?.onExit?.();
    this.stack.push(screen);
    screen.onEnter?.();
    this.render();
  }

  render(): void {
    this.container.innerHTML = '';
    this.current?.render(this.container);
  }

  handleKey(key: string): void {
    this.current?.onKey?.(key);
  }
}
