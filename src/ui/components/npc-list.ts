// npc-list.ts — NPC 목록 (클릭으로 선택)

export interface NpcEntry {
  name: string;
  race: string;
  role: string;
}

export function createNpcList(
  npcs: NpcEntry[],
  onSelect: (index: number) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'npc-list';

  if (npcs.length === 0) {
    container.innerHTML = '<p class="hint">근처에 아무도 없습니다.</p>';
    return container;
  }

  npcs.forEach((npc, i) => {
    const btn = document.createElement('button');
    btn.className = 'btn npc-item';
    btn.dataset.idx = String(i);
    btn.innerHTML = `
      <span class="npc-num">${i + 1}.</span>
      <span class="npc-name">${npc.name}</span>
      <span class="npc-detail">${npc.race} / ${npc.role}</span>
    `;
    btn.addEventListener('click', () => onSelect(i));
    container.appendChild(btn);
  });

  return container;
}
