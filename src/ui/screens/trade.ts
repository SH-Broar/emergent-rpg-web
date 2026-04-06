// trade.ts — 거래 화면 (NPC 상인 선택 + 구매/판매)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType, SpiritRole, raceName, spiritRoleName } from '../../types/enums';
import { itemName, basePrice } from '../../types/registry';
import { Actor } from '../../models/actor';

type TradePhase = 'npc-select' | 'trade';
type TradeTab = 'buy' | 'sell';

export function createTradeScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const loc = p.currentLocation;
  // 시장이면 일반 상점, 아니면 같은 위치의 상인 NPC
  const isMarket = loc === 'Market_Square';
  const merchantNpcs = session.actors.filter(a =>
    a !== p && a.currentLocation === loc && a.isAlive() &&
    (a.spirit.role === SpiritRole.Merchant || isMarket)
  );

  let phase: TradePhase = isMarket ? 'trade' : (merchantNpcs.length > 0 ? 'npc-select' : 'trade');
  let selectedNpc: Actor | null = isMarket ? null : null;
  let tab: TradeTab = 'buy';
  let message = '';

  function getRepMultiplier(): number {
    const rep = session.knowledge.getReputation(loc);
    return 1.0 + (0.5 - rep) * 0.4; // 평판 높으면 싸게, 낮으면 비싸게
  }

  function getBuyPrice(type: ItemType): number {
    return Math.round(basePrice(type) * getRepMultiplier());
  }

  function getSellPrice(type: ItemType): number {
    return Math.max(1, Math.round(basePrice(type) * 0.6 / getRepMultiplier()));
  }

  function renderNpcSelect(el: HTMLElement) {
    el.innerHTML = `
      <div class="screen info-screen trade-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>거래 상대 선택</h2>
        ${merchantNpcs.length === 0
          ? '<p>이곳에 거래할 수 있는 상대가 없습니다.</p>'
          : `<div class="npc-list">${merchantNpcs.map((a, i) => `
              <button class="btn npc-item" data-idx="${i}">
                <span class="npc-num">${i + 1}</span>
                <span class="npc-name">${a.name}</span>
                <span class="npc-detail">${raceName(a.base.race)} · ${spiritRoleName(a.spirit.role)}</span>
              </button>`).join('')}</div>`
        }
        ${isMarket ? '' : '<p class="hint">시장에서는 상인 없이도 거래 가능</p>'}
      </div>`;
    el.querySelector('[data-back]')?.addEventListener('click', onDone);
    el.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedNpc = merchantNpcs[parseInt(btn.dataset.idx!, 10)];
        phase = 'trade';
        renderTrade(el);
      });
    });
  }

  function renderTrade(el: HTMLElement) {
    const isBuy = tab === 'buy';
    const shopItems = [ItemType.Food, ItemType.Herb, ItemType.Potion, ItemType.Equipment];
    const buyItems = shopItems.map(type => ({
      type,
      name: itemName(type),
      price: getBuyPrice(type),
    }));
    const sellItems: { type: ItemType; name: string; count: number; price: number }[] = [];
    for (const [type, count] of p.spirit.inventory) {
      if (count > 0) sellItems.push({ type, name: itemName(type), count, price: getSellPrice(type) });
    }

    const tradeWith = selectedNpc ? selectedNpc.name : '시장';
    el.innerHTML = `
      <div class="screen info-screen trade-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>거래 — ${tradeWith}</h2>
        <div class="trade-tabs">
          <button class="btn ${isBuy ? 'active' : ''}" data-tab="buy">구매</button>
          <button class="btn ${!isBuy ? 'active' : ''}" data-tab="sell">판매</button>
        </div>
        <div class="trade-gold">내 골드: ${p.spirit.gold}G · 평판: ${Math.round(session.knowledge.getReputation(loc) * 100)}%</div>
        ${message ? `<div class="trade-message">${message}</div>` : ''}
        <div class="item-grid">
          ${isBuy
            ? buyItems.map((item, i) => `
                <button class="btn item-cell" data-buy="${i}">
                  <span class="item-name">${item.name}</span>
                  <span class="item-price">${item.price}G</span>
                </button>`).join('')
            : sellItems.map((item, i) => `
                <button class="btn item-cell" data-sell="${i}">
                  <span class="item-name">${item.name}</span>
                  <span class="item-count">x${item.count}</span>
                  <span class="item-price">${item.price}G</span>
                </button>`).join('')
          }
        </div>
        ${(() => {
          const bagCap = session.knowledge.bagCapacity;
          if (bagCap >= 40) return '<div style="margin-top:8px;color:var(--text-dim);font-size:12px;text-align:center">가방 최대 확장 완료 (40칸)</div>';
          const price = (bagCap - 5) * 40 + 200;
          const canAfford = p.spirit.gold >= price;
          return `<div style="margin-top:12px;text-align:center">
            <button class="btn" data-bag-upgrade ${canAfford ? '' : 'disabled'} style="opacity:${canAfford ? '1' : '0.5'}">
              가방 확장 (+5칸) — ${price}G (현재 ${bagCap}칸)
            </button>
          </div>`;
        })()}
        <p class="hint">Tab=탭 전환, 1~9 선택, Esc 뒤로</p>
      </div>`;

    el.querySelector('[data-back]')?.addEventListener('click', () => {
      if (phase === 'trade' && !isMarket && merchantNpcs.length > 0) {
        phase = 'npc-select'; selectedNpc = null; message = ''; renderNpcSelect(el);
      } else { onDone(); }
    });
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab as TradeTab; message = ''; renderTrade(el); });
    });
    el.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.buy!, 10);
        const item = buyItems[idx];
        if (!item) return;
        if (p.spirit.gold < item.price) { message = '골드가 부족합니다!'; }
        else {
          p.addGold(-item.price);
          p.addItem(item.type, 1);
          p.spirit.tradeCount++;
          session.knowledge.adjustReputation(loc, 0.01);
          if (selectedNpc) { p.adjustRelationship(selectedNpc.name, 0.02, 0.01); selectedNpc.adjustRelationship(p.name, 0.02, 0.01); }
          session.backlog.add(session.gameTime, `${p.name}이(가) ${item.name}을(를) 구매했다. (-${item.price}G)`, '행동');
          message = `${item.name} 구매! -${item.price}G`;
        }
        renderTrade(el);
      });
    });
    el.querySelector<HTMLButtonElement>('[data-bag-upgrade]')?.addEventListener('click', () => {
      const bagCap = session.knowledge.bagCapacity;
      if (bagCap >= 40) return;
      const price = (bagCap - 5) * 40 + 200;
      if (p.spirit.gold < price) { message = '골드가 부족합니다!'; }
      else {
        p.addGold(-price);
        session.knowledge.bagCapacity += 5;
        session.knowledge.trackGoldSpent(price);
        session.backlog.add(session.gameTime, `가방을 확장했다. (${session.knowledge.bagCapacity}칸) -${price}G`, '행동');
        message = `가방 확장 완료! ${session.knowledge.bagCapacity}칸 (-${price}G)`;
      }
      renderTrade(el);
    });
    el.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.sell!, 10);
        const item = sellItems[idx];
        if (!item) return;
        if (p.consumeItem(item.type, 1)) {
          p.addGold(item.price);
          p.spirit.tradeCount++;
          session.knowledge.trackItemSold();
          if (selectedNpc) { p.adjustRelationship(selectedNpc.name, 0.01, 0.01); }
          session.backlog.add(session.gameTime, `${p.name}이(가) ${item.name}을(를) 판매했다. (+${item.price}G)`, '행동');
          message = `${item.name} 판매! +${item.price}G`;
        }
        renderTrade(el);
      });
    });
  }

  return {
    id: 'trade',
    render(el) { phase === 'npc-select' ? renderNpcSelect(el) : renderTrade(el); },
    onKey(key) {
      const c = document.querySelector('.trade-screen')?.parentElement;
      if (!(c instanceof HTMLElement)) return;
      if (key === 'Escape') {
        if (phase === 'trade' && !isMarket && merchantNpcs.length > 0) { phase = 'npc-select'; selectedNpc = null; message = ''; renderNpcSelect(c); }
        else onDone();
        return;
      }
      if (key === 'Tab') { tab = tab === 'buy' ? 'sell' : 'buy'; message = ''; renderTrade(c); return; }
      if (phase === 'npc-select' && /^[1-9]$/.test(key)) {
        const i = parseInt(key, 10) - 1;
        if (i < merchantNpcs.length) { selectedNpc = merchantNpcs[i]; phase = 'trade'; renderTrade(c); }
      }
    },
  };
}
