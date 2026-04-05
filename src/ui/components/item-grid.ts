// item-grid.ts — 아이템 그리드 (인벤토리/상점)

export interface ItemEntry {
  name: string;
  count: number;
  price?: number;
}

export function createItemGrid(
  items: ItemEntry[],
  onSelect: (index: number) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'item-grid-container';

  if (items.length === 0) {
    container.innerHTML = '<p class="hint">아이템이 없습니다.</p>';
    return container;
  }

  const grid = document.createElement('div');
  grid.className = 'item-grid';

  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn item-cell';
    btn.dataset.idx = String(i);
    const priceHtml = item.price !== undefined
      ? `<span class="item-price">${item.price}G</span>`
      : '';
    btn.innerHTML = `
      <span class="item-name">${item.name}</span>
      <span class="item-count">x${item.count}</span>
      ${priceHtml}
    `;
    btn.addEventListener('click', () => onSelect(i));
    grid.appendChild(btn);
  });

  container.appendChild(grid);
  return container;
}
