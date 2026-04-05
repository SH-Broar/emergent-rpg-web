// gift.ts — 선물 화면
// 원본: GiftScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { raceName, spiritRoleName, ItemType } from '../../types/enums';
import { itemName } from '../../types/registry';
import { createNpcList, type NpcEntry } from '../components/npc-list';
import { createItemGrid, type ItemEntry } from '../components/item-grid';

type GiftStep = 'select-npc' | 'select-item' | 'result';

interface GiftPreference {
  loved: ItemType[];
  liked: ItemType[];
  disliked: ItemType[];
}

function getPreference(_actorName: string): GiftPreference {
  // 기본 선호도 (향후 데이터 파일에서 로드 가능)
  return {
    loved: [ItemType.Equipment, ItemType.OreRare],
    liked: [ItemType.Food, ItemType.Potion],
    disliked: [ItemType.MonsterLoot],
  };
}

export function createGiftScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let step: GiftStep = 'select-npc';
  let selectedNpcIdx = -1;
  let message = '';

  function getNpcsAtLocation(): { actor: typeof session.actors[number]; idx: number }[] {
    const result: { actor: typeof session.actors[number]; idx: number }[] = [];
    for (let i = 0; i < session.actors.length; i++) {
      if (i === session.playerIdx) continue;
      const a = session.actors[i];
      if (a.currentLocation === p.currentLocation && a.isAlive()) {
        result.push({ actor: a, idx: i });
      }
    }
    return result;
  }

  function getInventoryItems(): { type: ItemType; count: number }[] {
    const items: { type: ItemType; count: number }[] = [];
    for (const [type, count] of p.spirit.inventory) {
      if (count > 0) items.push({ type, count });
    }
    return items;
  }

  function renderGift(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen gift-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', () => {
      if (step === 'select-item') { step = 'select-npc'; renderGift(el); }
      else onDone();
    });
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\uc120\ubb3c';
    wrap.appendChild(title);

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'trade-message';
      msg.textContent = message;
      wrap.appendChild(msg);
    }

    if (step === 'select-npc') {
      const sub = document.createElement('p');
      sub.className = 'hint';
      sub.textContent = '\uc120\ubb3c\uc744 \uc904 NPC\ub97c \uc120\ud0dd\ud558\uc138\uc694.';
      wrap.appendChild(sub);

      const npcsHere = getNpcsAtLocation();
      const entries: NpcEntry[] = npcsHere.map(n => ({
        name: n.actor.name,
        race: raceName(n.actor.base.race),
        role: spiritRoleName(n.actor.spirit.role),
      }));
      const list = createNpcList(entries, (i) => {
        selectedNpcIdx = i;
        step = 'select-item';
        message = '';
        renderGift(el);
      });
      wrap.appendChild(list);
    } else if (step === 'select-item') {
      const npcsHere = getNpcsAtLocation();
      const npc = npcsHere[selectedNpcIdx];
      if (!npc) { step = 'select-npc'; renderGift(el); return; }

      const sub = document.createElement('p');
      sub.className = 'hint';
      sub.textContent = `${npc.actor.name}\uc5d0\uac8c \uc904 \uc544\uc774\ud15c\uc744 \uc120\ud0dd\ud558\uc138\uc694.`;
      wrap.appendChild(sub);

      const inv = getInventoryItems();
      const entries: ItemEntry[] = inv.map(it => ({
        name: itemName(it.type),
        count: it.count,
      }));
      const grid = createItemGrid(entries, (i) => {
        executeGift(i, el);
      });
      wrap.appendChild(grid);
    } else if (step === 'result') {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Enter/Esc \ub4a4\ub85c';
      wrap.appendChild(hint);
    }

    el.appendChild(wrap);
  }

  function executeGift(itemIdx: number, el: HTMLElement): void {
    const npcsHere = getNpcsAtLocation();
    const npc = npcsHere[selectedNpcIdx];
    if (!npc) return;

    const inv = getInventoryItems();
    const selected = inv[itemIdx];
    if (!selected) return;

    // Consume item
    if (!p.consumeItem(selected.type, 1)) return;

    // Determine preference
    const pref = getPreference(npc.actor.name);
    let trustDelta = 0.04;
    let affinityDelta = 0.03;
    let reaction = '';

    if (pref.loved.includes(selected.type)) {
      trustDelta = 0.15;
      affinityDelta = 0.10;
      reaction = `${npc.actor.name}: "\uc815\ub9d0 \uac10\uc0ac\ud569\ub2c8\ub2e4! \uc774\uac74 \uc81c\uac00 \uc815\ub9d0 \uc88b\uc544\ud558\ub294 \uac70\uc608\uc694!"`;
    } else if (pref.liked.includes(selected.type)) {
      trustDelta = 0.08;
      affinityDelta = 0.05;
      reaction = `${npc.actor.name}: "\uace0\ub9c8\uc6cc\uc694, \uc88b\uc740 \uc120\ubb3c\uc774\ub124\uc694."`;
    } else if (pref.disliked.includes(selected.type)) {
      trustDelta = 0.01;
      affinityDelta = 0.00;
      reaction = `${npc.actor.name}: "\uc74c... \uace0\ub9d9\uae34 \ud558\uc9c0\ub9cc..."`;
    } else {
      reaction = `${npc.actor.name}: "\uace0\ub9c8\uc6cc\uc694."`;
    }

    // Adjust relationship
    npc.actor.adjustRelationship(p.name, trustDelta, affinityDelta);
    p.adjustRelationship(npc.actor.name, trustDelta * 0.5, affinityDelta * 0.5);

    // Track
    session.knowledge.trackGiftGiven();
    session.gameTime.advance(20);

    // Backlog
    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) ${npc.actor.name}\uc5d0\uac8c ${itemName(selected.type)}\uc744(\ub97c) \uc120\ubb3c\ud588\ub2e4.`,
      '\ud589\ub3d9',
    );

    message = reaction;
    step = 'result';
    renderGift(el);
  }

  return {
    id: 'gift',
    render: renderGift,
    onKey(key) {
      const container = document.querySelector('.gift-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (step === 'select-item') { step = 'select-npc'; message = ''; renderGift(container); }
        else onDone();
        return;
      }

      if (step === 'result' && (key === 'Enter' || key === 'Escape')) {
        onDone();
        return;
      }

      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        if (step === 'select-npc') {
          const npcsHere = getNpcsAtLocation();
          if (idx < npcsHere.length) {
            selectedNpcIdx = idx;
            step = 'select-item';
            message = '';
            renderGift(container);
          }
        } else if (step === 'select-item') {
          executeGift(idx, container);
        }
      }
    },
  };
}
