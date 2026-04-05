// action-button.ts — 키보드 힌트 포함 액션 버튼

export interface ActionButtonConfig {
  key: string;
  label: string;
  action: string;
  onClick: (action: string) => void;
}

export function createActionButton(config: ActionButtonConfig): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn action-button';
  btn.dataset.action = config.action;
  btn.title = `[${config.key}]`;
  btn.innerHTML = `
    <span class="action-label">${config.label}</span>
    <span class="key-hint">[${config.key}]</span>
  `;
  btn.style.minHeight = '44px';
  btn.addEventListener('click', () => config.onClick(config.action));
  return btn;
}
