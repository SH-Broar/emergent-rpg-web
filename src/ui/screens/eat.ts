import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { computeEatEffect } from '../../types/eat-system';
import { getItemDef, type ItemDef } from '../../types/item-defs';
import { getRaceCapabilitySet, parseTags } from '../../types/tag-system';

export function createEatScreen(
  session: GameSession,
  onDone: (statusMessage: string) => void,
): Screen {
  const p = session.player;
  let resultMsg = '';

  function getInventoryItems(): { id: string; qty: number; label: string; def: ItemDef | undefined }[] {
    const items: { id: string; qty: number; label: string; def: ItemDef | undefined }[] = [];
    for (const [id, qty] of p.items) {
      if (qty > 0) {
        const def = getItemDef(id);
        items.push({ id, qty, label: def?.name ?? id, def });
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
        const raceTags = getRaceCapabilitySet(p.base.race);
        const itemTags = parseTags(item.def?.tags ?? '');
        let warning = '';
        if (raceTags.has('potion_only') && !itemTags.has('liquid')) {
          warning = '비물질 존재라 섭취할 수 없다.';
        } else if (!raceTags.has('digest_all') && itemTags.has('inedible')) {
          warning = '⚠ 먹을 수 있는 것이 아닌 것 같다...';
        } else if (itemTags.has('raw')) {
          warning = '⚠ 날것이다.';
        }
        html += `<button class="btn npc-item" data-eat="${item.id}">
          <span class="npc-num">${i + 1}</span>
          <span class="npc-name">${item.label} x${item.qty}</span>
          <span class="npc-detail">${warning}</span>
        </button>`;
      });
      html += '</div>';
    }
    html += '<p class="hint">1~9 선택, Esc 뒤로</p>';

    wrap.innerHTML = html;
    wrap.querySelector('[data-back]')?.addEventListener('click', () => onDone(''));
    wrap.querySelectorAll<HTMLButtonElement>('[data-eat]').forEach(btn => {
      btn.addEventListener('click', () => {
        doEat(btn.dataset.eat!, el);
      });
    });
    el.appendChild(wrap);
  }

  function doEat(itemId: string, el: HTMLElement) {
    if (!p.removeItemById(itemId, 1)) {
      resultMsg = '아이템이 없다!';
      renderEat(el);
      return;
    }

    const def = getItemDef(itemId);
    let vigor = 0, hp = 0, mp = 0, mood = 0, message = '', statusEffect: 'poison' | 'stomachache' | undefined;

    if (def && (def.eatVigor !== 0 || def.eatHp !== 0 || def.eatMp !== 0 || def.eatMood !== 0 || def.eatMessage)) {
      // Use ItemDef fields directly
      vigor = def.eatVigor;
      hp = def.eatHp;
      mp = def.eatMp;
      mood = def.eatMood;
      message = def.eatMessage || `${def.name}을(를) 먹었다.`;
      statusEffect = def.eatStatus as 'poison' | 'stomachache' | undefined || undefined;
    } else {
      // Fall back to category-based eat-system
      const fallbackType = def?.category ?? 0;
      const result = computeEatEffect(fallbackType, p.base.race);
      vigor = result.vigor;
      hp = result.hp;
      mp = result.mp;
      mood = result.mood;
      message = result.message;
      statusEffect = result.statusEffect;
    }

    if (vigor) p.adjustVigor(vigor);
    if (hp) p.adjustHp(hp);
    if (mp) p.adjustMp(mp);
    if (mood) p.adjustMood(mood);

    session.gameTime.advance(10);
    session.backlog.add(session.gameTime, `${p.name}: ${message}`, '행동');

    // Status effect logging
    if (statusEffect === 'poison') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 중독되었다!`, '시스템');
    } else if (statusEffect === 'stomachache') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 배탈이 났다!`, '시스템');
    }

    resultMsg = message;

    // Build status message for the status bar
    const statusParts: string[] = [message];
    if (vigor > 0) statusParts.push(`MP +${vigor}`);
    if (vigor < 0) statusParts.push(`MP ${vigor}`);
    if (hp > 0) statusParts.push(`HP +${hp}`);
    if (hp < 0) statusParts.push(`HP ${hp}`);
    if (mp > 0) statusParts.push(`MP +${mp}`);

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
        if (idx < items.length) doEat(items[idx].id, container);
      }
    },
  };
}
