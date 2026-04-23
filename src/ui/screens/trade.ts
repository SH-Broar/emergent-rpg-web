// trade.ts — 거래 화면 (NPC 상인 선택 + 구매/판매)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType, SpiritRole, raceName, spiritRoleName, itemTypeToId, itemIdToType } from '../../types/enums';
import { itemName, basePrice } from '../../types/registry';
import { Actor } from '../../models/actor';
import { checkAndAwardTitles } from '../../systems/title-system';
import { getLifeJobModifiers } from '../../systems/life-job-system';
import { getItemDef, getWeaponDef, getArmorDef } from '../../types/item-defs';
import { RARITY_COLORS } from '../item-labels';

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
  let selectedNpc: Actor | null = null;
  let tab: TradeTab = 'buy';
  let message = '';

  function getRepMultiplier(): number {
    const rep = session.knowledge.getReputation(loc);
    return 1.0 + (0.5 - rep) * 0.4; // 평판 높으면 싸게, 낮으면 비싸게
  }

  function getBuyPrice(type: ItemType): number {
    const ljMod = getLifeJobModifiers(session);
    return Math.max(1, Math.round(basePrice(type) * getRepMultiplier() * (1 - ljMod.buyPriceDiscount)));
  }

  function getSellPrice(type: ItemType): number {
    const ljMod = getLifeJobModifiers(session);
    return Math.max(1, Math.round(basePrice(type) * 0.6 / getRepMultiplier() * (1 + ljMod.sellPriceBonus)));
  }

  function getSellPriceForPrice(priceBase: number): number {
    const ljMod = getLifeJobModifiers(session);
    return Math.max(1, Math.round(priceBase * 0.6 / getRepMultiplier() * (1 + ljMod.sellPriceBonus)));
  }

  // 판매 엔트리: 카테고리 묶음 또는 개별 itemId
  interface SellEntry {
    key: string;          // 'cat:N' 또는 itemId
    display: string;      // UI 표시 이름
    count: number;        // 보유 수량
    price: number;        // 개당 판매가
    rarityColor?: string; // 희귀도 표시 색 (개별 아이템 한정)
    consume: () => boolean;
  }

  function buildSellEntries(): SellEntry[] {
    const entries: SellEntry[] = [];
    for (const [id, count] of p.items) {
      if (count <= 0) continue;
      const type = itemIdToType(id);
      if (type !== undefined) {
        entries.push({
          key: `cat:${type}`,
          display: itemName(type),
          count,
          price: getSellPrice(type),
          consume: () => p.consumeItem(type, 1),
        });
        continue;
      }
      // 장비/무기는 판매 UI에서 제외 (별도 해체 등으로 처리)
      if (getWeaponDef(id) || getArmorDef(id)) continue;
      const def = getItemDef(id);
      if (!def) continue;
      entries.push({
        key: id,
        display: def.name,
        count,
        price: getSellPriceForPrice(def.price),
        rarityColor: RARITY_COLORS[def.rarity],
        consume: () => p.removeItemById(id, 1),
      });
    }
    return entries;
  }

  function renderNpcSelect(el: HTMLElement) {
    el.innerHTML = `
      <div class="screen info-screen trade-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>거래 상대 선택</h2>
        ${merchantNpcs.length === 0
          ? '<p>이곳에 거래할 수 있는 상대가 없습니다.</p>'
          : `<div class="npc-list">${merchantNpcs.map((a, i) => {
              const known = session.knowledge.isKnown(a.name);
              return `<button class="btn npc-item" data-idx="${i}">
                <span class="npc-num">${i + 1}</span>
                <span class="npc-name">${known ? a.name : '???'}</span>
                <span class="npc-detail">${known ? raceName(a.base.race) : '???'} · ${known ? spiritRoleName(a.spirit.role) : '???'}</span>
              </button>`;
            }).join('')}</div>`
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

  // NPC 인벤토리에서 특수 아이템(itemId 기반) 추출
  // cat_* 접두사 ID는 ItemType 카테고리이므로 제외
  function getNpcSpecialItems(npc: Actor): { itemId: string; name: string; qty: number; price: number }[] {
    const result: { itemId: string; name: string; qty: number; price: number }[] = [];
    for (const [itemId, qty] of npc.items) {
      if (qty <= 0) continue;
      if (itemId.startsWith('cat_')) continue; // 일반 카테고리 아이템 제외
      const def = getItemDef(itemId);
      result.push({
        itemId,
        name: def?.name ?? itemId,
        qty,
        price: def?.price ?? 500,
      });
    }
    return result;
  }

  function renderTrade(el: HTMLElement) {
    if (selectedNpc && !session.knowledge.isKnown(selectedNpc.name)) {
      session.knowledge.addKnownName(selectedNpc.name);
    }
    const isBuy = tab === 'buy';
    const shopItems = [ItemType.Food, ItemType.Herb, ItemType.Potion, ItemType.Equipment];
    const buyItems = shopItems.map(type => ({
      type,
      name: itemName(type),
      price: getBuyPrice(type),
    }));
    const sellItems = buildSellEntries();

    // NPC 특산품 (선택된 NPC가 있을 때만)
    const specialItems = selectedNpc ? getNpcSpecialItems(selectedNpc) : [];

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
                  <span class="item-name"${item.rarityColor ? ` style="color:${item.rarityColor}"` : ''}>${item.display}</span>
                  <span class="item-count">x${item.count}</span>
                  <span class="item-price">${item.price}G</span>
                </button>`).join('')
          }
        </div>
        ${isBuy && specialItems.length > 0 ? `
          <div class="trade-specialty-header" style="margin-top:14px;padding:4px 8px;color:var(--accent,#ffc857);font-size:13px;font-weight:bold;border-top:1px solid var(--border,#444)">
            ✦ 특산품
          </div>
          <div class="item-grid">
            ${specialItems.map(item => `
              <button class="btn item-cell" data-buy-special="${item.itemId}">
                <span class="item-name">${item.name}</span>
                <span class="item-count">x${item.qty}</span>
                <span class="item-price">${item.price}G</span>
              </button>`).join('')}
          </div>` : ''}
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
        else if (p.isBagFull(session.knowledge.bagCapacity, itemTypeToId(item.type))) { message = '⚠ 인벤토리가 가득 찼습니다!'; }
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
    // 특산품 구매 핸들러
    el.querySelectorAll<HTMLButtonElement>('[data-buy-special]').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.buySpecial!;
        const specialItem = specialItems.find(s => s.itemId === itemId);
        if (!specialItem || !selectedNpc) return;
        if (p.spirit.gold < specialItem.price) { message = '골드가 부족합니다!'; }
        else if (p.isBagFull(session.knowledge.bagCapacity, itemId)) { message = '⚠ 인벤토리가 가득 찼습니다!'; }
        else if (!selectedNpc.removeItemById(itemId, 1)) { message = '재고가 없습니다!'; }
        else {
          p.addGold(-specialItem.price);
          p.addItemById(itemId, 1);
          p.spirit.tradeCount++;
          session.knowledge.adjustReputation(loc, 0.01);
          p.adjustRelationship(selectedNpc.name, 0.03, 0.02);
          selectedNpc.adjustRelationship(p.name, 0.03, 0.02);
          session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedNpc.name}에게서 ${specialItem.name}을(를) 구매했다. (-${specialItem.price}G)`, '행동');
          message = `${specialItem.name} 구매! -${specialItem.price}G`;
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
        const entry = sellItems[idx];
        if (!entry) return;
        if (entry.consume()) {
          p.addGold(entry.price);
          p.spirit.tradeCount++;
          session.knowledge.trackItemSold();
          if (selectedNpc) { p.adjustRelationship(selectedNpc.name, 0.01, 0.01); }
          session.backlog.add(session.gameTime, `${p.name}이(가) ${entry.display}을(를) 판매했다. (+${entry.price}G)`, '행동');
          // 아이템 판매: Water-, Iron+, Dark+
          const sellInfluence = new Array(8).fill(0);
          sellInfluence[1] = -0.005;
          sellInfluence[3] = 0.008;
          sellInfluence[7] = 0.005;
          p.color.applyInfluence(sellInfluence);
          const sellTitles = checkAndAwardTitles(session);
          for (const t of sellTitles) {
            session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
          }
          message = `${entry.display} 판매! +${entry.price}G${sellTitles.length > 0 ? ' ✦ 칭호: "' + sellTitles[sellTitles.length - 1] + '"' : ''}`;
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
