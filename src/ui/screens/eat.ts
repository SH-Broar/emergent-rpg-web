import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType } from '../../types/enums';
import { canEatItem, computeEatEffect, itemEatLabel } from '../../types/eat-system';

export function createEatScreen(
  session: GameSession,
  onDone: (statusMessage: string) => void,
): Screen {
  const p = session.player;
  let resultMsg = '';

  function getInventoryItems(): { type: ItemType; qty: number; label: string }[] {
    const items: { type: ItemType; qty: number; label: string }[] = [];
    for (const [type, qty] of p.spirit.inventory) {
      if (qty > 0) {
        items.push({ type, qty, label: itemEatLabel(type) });
      }
    }
    return items;
  }

  function renderEat(el: HTMLElement) {
    const items = getInventoryItems();
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    let html = '<button class="btn back-btn" data-back>← 뒤로 [Esc]</button>';
    html += '<h2>식사</h2>';

    if (resultMsg) {
      html += `<div class="trade-message" style="color:var(--warning);margin-bottom:8px">${resultMsg}</div>`;
    }

    if (items.length === 0) {
      html += '<p style="text-align:center;color:var(--text-dim)">가방이 비어 있다.</p>';
    } else {
      html += '<p style="color:var(--text-dim);font-size:12px;margin-bottom:6px">무엇을 먹을까?</p>';
      html += '<div class="npc-list">';
      items.forEach((item, i) => {
        const { warning } = canEatItem(item.type, p.base.race);
        html += `<button class="btn npc-item" data-eat="${item.type}">
          <span class="npc-num">${i + 1}</span>
          <span class="npc-name">${item.label} x${item.qty}</span>
          <span class="npc-detail">${warning || ''}</span>
        </button>`;
      });
      html += '</div>';
    }
    html += '<p class="hint">1~9 선택, Esc 뒤로</p>';

    wrap.innerHTML = html;
    wrap.querySelector('[data-back]')?.addEventListener('click', () => onDone(''));
    wrap.querySelectorAll<HTMLButtonElement>('[data-eat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemType = parseInt(btn.dataset.eat!, 10) as ItemType;
        doEat(itemType, el);
      });
    });
    el.appendChild(wrap);
  }

  function doEat(item: ItemType, el: HTMLElement) {
    if (!p.consumeItem(item, 1)) {
      resultMsg = '아이템이 없다!';
      renderEat(el);
      return;
    }

    const result = computeEatEffect(item, p.base.race);
    if (result.vigor) p.adjustVigor(result.vigor);
    if (result.hp) p.adjustHp(result.hp);
    if (result.mp) p.adjustMp(result.mp);
    if (result.mood) p.adjustMood(result.mood);

    session.gameTime.advance(10);
    session.backlog.add(session.gameTime, `${p.name}: ${result.message}`, '행동');

    // Status effect logging
    if (result.statusEffect === 'poison') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 중독되었다!`, '시스템');
    } else if (result.statusEffect === 'stomachache') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 배탈이 났다!`, '시스템');
    }

    resultMsg = result.message;

    // Build status message for the status bar
    const statusParts: string[] = [result.message];
    if (result.vigor > 0) statusParts.push(`기력 +${result.vigor}`);
    if (result.vigor < 0) statusParts.push(`기력 ${result.vigor}`);
    if (result.hp > 0) statusParts.push(`HP +${result.hp}`);
    if (result.hp < 0) statusParts.push(`HP ${result.hp}`);
    if (result.mp > 0) statusParts.push(`MP +${result.mp}`);

    onDone(statusParts.join(' · '));
  }

  return {
    id: 'eat',
    render: renderEat,
    onKey(key) {
      if (key === 'Escape') { onDone(''); return; }
      const container = document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;
      if (/^[1-9]$/.test(key)) {
        const items = getInventoryItems();
        const idx = parseInt(key, 10) - 1;
        if (idx < items.length) doEat(items[idx].type, container);
      }
    },
  };
}
