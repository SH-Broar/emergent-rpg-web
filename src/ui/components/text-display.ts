// text-display.ts — 스크롤 가능한 텍스트 영역 (백로그)

export function createTextDisplay(
  lines: string[],
  maxVisible = 50,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'text-display';

  const visible = lines.slice(-maxVisible);

  if (visible.length === 0) {
    container.innerHTML = '<p class="hint">표시할 내용이 없습니다.</p>';
    return container;
  }

  for (const line of visible) {
    const row = document.createElement('div');
    row.className = 'text-display-line';
    row.textContent = line;
    container.appendChild(row);
  }

  // 자동 스크롤 - 마지막 줄로
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });

  return container;
}
