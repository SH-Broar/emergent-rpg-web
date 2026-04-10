// gift.ts — 선물 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { raceName, spiritRoleName, ItemType, raceToKey, SpiritRole } from '../../types/enums';
import { itemName } from '../../types/registry';
import { createNpcList, type NpcEntry } from '../components/npc-list';
import { createItemGrid, type ItemEntry } from '../components/item-grid';
import { isActorVisibleToPlayer } from '../../systems/actor-visibility';
import { getRelationshipStage, giveGift } from '../../systems/npc-interaction';

type GiftStep = 'select-npc' | 'select-item' | 'result';

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
      // 동료는 위치 무관, 일반 NPC는 같은 위치
      const isCompanion = session.knowledge.isCompanion(a.name);
      const stage = getRelationshipStage(p, a.name, session.knowledge, session.actors);
      if ((isCompanion || a.currentLocation === p.currentLocation) && a.isAlive() && stage !== 'unknown' && isActorVisibleToPlayer(session, a)) {
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
    backBtn.textContent = '← 뒤로 [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', () => {
      if (step === 'select-item') { step = 'select-npc'; renderGift(el); }
      else onDone();
    });
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '선물';
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
      sub.textContent = '선물을 줄 상대를 선택하세요. 아는 사이부터 선물이 가능합니다.';
      wrap.appendChild(sub);

      const npcsHere = getNpcsAtLocation();
      if (npcsHere.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = '선물을 줄 수 있는 상대가 없습니다. 먼저 대화를 나눠보세요.';
        wrap.appendChild(empty);
      }
      if (npcsHere.length > 0) {
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
      }
    } else if (step === 'select-item') {
      const npcsHere = getNpcsAtLocation();
      const npc = npcsHere[selectedNpcIdx];
      if (!npc) { step = 'select-npc'; renderGift(el); return; }

      const sub = document.createElement('p');
      sub.className = 'hint';
      sub.textContent = `${npc.actor.name}에게 줄 아이템을 선택하세요.`;
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
      hint.textContent = 'Enter/Esc 뒤로';
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

    const raceKey = raceToKey(npc.actor.base.race);
    const roleKey = SpiritRole[npc.actor.spirit.role] ?? 'Villager';

    const result = giveGift(
      p, npc.actor, selected.type,
      raceKey, roleKey,
      session.knowledge, session.backlog, session.gameTime,
    );

    if (!result.success) {
      message = result.messages[0] ?? '선물에 실패했다.';
      renderGift(el);
      return;
    }

    // 선물은 시간 소모 없음
    message = result.messages.join(' ');
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
