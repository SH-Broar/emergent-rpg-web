// storage.ts — 거점 창고 관리 화면 (냉장/실온/온장)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { ItemType } from '../../types/enums';
import { getItemDef, getStorageProfileForItem, type StorageZone } from '../../types/item-defs';
import { categoryName } from '../item-labels';
import { BASE_DEFS, getUpgradeCost } from '../../data/base-defs';

const ZONE_LABELS: Record<StorageZone, string> = {
  cold: '❄ 냉장',
  room: '📦 실온',
  warm: '🔥 온장',
};

const ZONE_COLORS: Record<StorageZone, string> = {
  cold: '#74b9ff',
  room: '#dfe6e9',
  warm: '#e17055',
};

export function createStorageScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const loc = session.player.currentLocation;
  let activeZone: StorageZone = 'room';
  let mode: 'view' | 'deposit' | 'withdraw' = 'view';
  let message = '';

  function getItemName(id: string): string {
    const def = getItemDef(id);
    if (def) return def.name;
    const numId = parseInt(id, 10);
    if (!isNaN(numId)) return categoryName(numId as ItemType);
    return id;
  }

  function getStorageHint(id: string, zone: StorageZone): string {
    const profile = getStorageProfileForItem(id);
    const preferred = profile.preferredStorage.map(z => ZONE_LABELS[z].replace(/^[^\s]+\s/, '')).join(', ');
    const avoided = profile.avoidedStorage.map(z => ZONE_LABELS[z].replace(/^[^\s]+\s/, '')).join(', ');

    const isAvoided = profile.avoidedStorage.includes(zone);
    const isPreferred = profile.preferredStorage.includes(zone);

    let stateHtml = '';
    if (isAvoided) {
      const reason = profile.badStorageEffect === 'spoil' ? '상함 위험'
        : profile.badStorageEffect === 'disable' ? '효과 감소' : '주의';
      stateHtml = ` · <span style="color:#e17055;font-weight:bold">⚠ 기피 (${reason})</span>`;
      // 기피 중 열화도 표시
      const deg = session.knowledge.getStorageDegradation(loc, zone, id);
      if (deg > 0) {
        stateHtml += ` <span style="color:#e17055">[-${Math.round(deg)}%]</span>`;
      }
    } else if (isPreferred) {
      stateHtml = ` · <span style="color:#00b894;font-weight:bold">✓ 적정</span>`;
    }

    const parts = [`권장: ${preferred || '없음'}`];
    if (avoided) parts.push(`기피: ${avoided}`);
    return parts.join(' / ') + stateHtml;
  }

  function render(el: HTMLElement) {
    const k = session.knowledge;
    const storage = k.getStorage(loc);
    const locLabel = locationName(loc) || loc;
    const level = k.getBaseLevel(loc);

    // 창고 용량: 기본 20 + 레벨당 10 종류 — 가방과 동일하게 종류(item type) 기준.
    // 이전에는 수량 합으로 셌으나 가방(items.size)과 단위가 달라 사용자에게 혼동을 주었다.
    const maxSlots = 20 + (level - 1) * 10;

    if (!storage) {
      el.innerHTML = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>📦 창고</h2>
          <p style="color:var(--text-dim)">이 거점에는 창고가 없습니다.</p>
        </div>`;
      el.querySelector('[data-back]')?.addEventListener('click', onDone);
      return;
    }

    // 현재 구역 아이템 — 칸 수는 '종류' 기준(가방과 동일)
    const zoneItems = storage[activeZone];
    const totalKinds = zoneItems.size;
    const totalQty = [...zoneItems.values()].reduce((s, n) => s + n, 0);

    // 인벤토리 아이템 (통합: items 맵)
    const p = session.player;
    const invItems: { id: string; name: string; count: number }[] = [];
    for (const [id, count] of p.items) {
      if (count > 0) invItems.push({ id, name: getItemName(id), count });
    }

    // 구역 탭 — 종류 수 표시 (가방과 동일 단위)
    const tabHtml = (['cold', 'room', 'warm'] as StorageZone[]).map(z => {
      const items = storage[z];
      const kinds = items.size;
      const active = z === activeZone;
      return `<button class="btn" data-zone="${z}" style="flex:1;font-size:11px;padding:4px;border-bottom:2px solid ${active ? ZONE_COLORS[z] : 'transparent'};color:${active ? ZONE_COLORS[z] : 'var(--text-dim)'}">${ZONE_LABELS[z]} (${kinds})</button>`;
    }).join('');

    // 모드 탭
    const modeHtml = `
      <div style="display:flex;gap:4px;margin:8px 0">
        <button class="btn" data-mode="view" style="flex:1;font-size:11px;${mode === 'view' ? 'color:var(--success)' : ''}">보기</button>
        <button class="btn" data-mode="deposit" style="flex:1;font-size:11px;${mode === 'deposit' ? 'color:var(--warning)' : ''}">넣기</button>
        <button class="btn" data-mode="withdraw" style="flex:1;font-size:11px;${mode === 'withdraw' ? 'color:var(--accent)' : ''}">빼기</button>
      </div>`;

    let contentHtml = '';

    if (mode === 'view') {
      if (zoneItems.size === 0) {
        contentHtml = '<p style="color:var(--text-dim);font-size:12px;text-align:center;padding:16px">비어 있습니다.</p>';
      } else {
        contentHtml = '<div class="inv-grid">';
        for (const [id, count] of zoneItems) {
          contentHtml += `
            <div class="inv-item" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">
              <div style="display:flex;justify-content:space-between;width:100%">
                <span class="inv-name">${getItemName(id)}</span>
                <span class="inv-count">x${count}</span>
              </div>
              <span style="font-size:11px;color:var(--text-dim)">${getStorageHint(id, activeZone)}</span>
            </div>`;
        }
        contentHtml += '</div>';
      }
    } else if (mode === 'deposit') {
      if (invItems.length === 0) {
        contentHtml = '<p style="color:var(--text-dim);font-size:12px;text-align:center;padding:16px">넣을 아이템이 없습니다.</p>';
      } else {
        contentHtml = '<div class="npc-list">';
        for (let i = 0; i < invItems.length; i++) {
          const item = invItems[i];
          contentHtml += `
            <button class="btn npc-item" data-deposit="${i}" style="min-height:36px">
              <div style="display:flex;flex-direction:column;gap:2px;width:100%">
                <div style="display:flex;justify-content:space-between;width:100%">
                  <span><span class="npc-num">${i + 1}</span> ${item.name}</span>
                  <span style="color:var(--text-dim)">x${item.count}</span>
                </div>
                <span style="font-size:11px;color:var(--text-dim);text-align:left">${getStorageHint(item.id, activeZone)}</span>
              </div>
            </button>`;
        }
        contentHtml += '</div>';
      }
    } else {
      // withdraw
      const items = [...zoneItems.entries()];
      if (items.length === 0) {
        contentHtml = '<p style="color:var(--text-dim);font-size:12px;text-align:center;padding:16px">꺼낼 아이템이 없습니다.</p>';
      } else {
        contentHtml = '<div class="npc-list">';
        for (let i = 0; i < items.length; i++) {
          const [id, count] = items[i];
          contentHtml += `
            <button class="btn npc-item" data-withdraw="${i}" style="min-height:36px">
              <div style="display:flex;flex-direction:column;gap:2px;width:100%">
                <div style="display:flex;justify-content:space-between;width:100%">
                  <span><span class="npc-num">${i + 1}</span> ${getItemName(id)}</span>
                  <span style="color:var(--text-dim)">x${count}</span>
                </div>
                <span style="font-size:11px;color:var(--text-dim);text-align:left">${getStorageHint(id, activeZone)}</span>
              </div>
            </button>`;
        }
        contentHtml += '</div>';
      }
    }

    // 거점 업그레이드 — 창고 화면 안에서 바로 가능 (접근성 개선)
    const baseDef = BASE_DEFS.find(b => b.locationId === loc);
    let upgradeHtml = '';
    if (baseDef && level > 0) {
      if (level < 5) {
        // base-defs.getUpgradeCost 가 이미 1/5 적용된 가격을 돌려준다.
        const cost = getUpgradeCost(baseDef, level);
        const canAfford = p.spirit.gold >= cost;
        upgradeHtml = `
          <div style="margin-top:10px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel)">
            <div style="font-size:12px;margin-bottom:4px">📈 거점 Lv.${level} → Lv.${level + 1}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">
              창고 용량 +10종 · 활동 효율 향상
            </div>
            <button class="btn" data-base-upgrade ${canAfford ? '' : 'disabled'} style="width:100%;font-size:12px;${canAfford ? '' : 'opacity:0.5'}">
              업그레이드 (${cost}G — 보유 ${p.spirit.gold}G)${canAfford ? '' : ' — 골드 부족'}
            </button>
          </div>`;
      } else {
        upgradeHtml = '<div style="margin-top:10px;text-align:center;color:var(--success);font-size:11px">거점 최대 레벨 도달</div>';
      }
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>📦 ${locLabel} 창고</h2>
      <p style="text-align:center;color:var(--text-dim);font-size:11px">
        Lv.${level} · 보관 ${totalKinds}/${maxSlots}종 (총 ${totalQty}개) · 가방 ${p.items.size}/${k.bagCapacity}종
      </p>
      ${message ? `<div class="trade-message" style="color:var(--accent)">${message}</div>` : ''}
      <div style="display:flex;gap:2px;margin-top:8px">${tabHtml}</div>
      ${modeHtml}
      ${contentHtml}
      ${upgradeHtml}
      <p class="hint">Q/W/E 구역 · 1/2/3 모드 · 번호키 아이템 · Esc 뒤로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    // 구역 탭 클릭
    wrap.querySelectorAll<HTMLButtonElement>('[data-zone]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeZone = btn.dataset.zone as StorageZone;
        render(el);
      });
    });

    // 모드 탭 클릭
    wrap.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode as 'view' | 'deposit' | 'withdraw';
        render(el);
      });
    });

    // 넣기 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-deposit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.deposit!, 10);
        const item = invItems[idx];
        if (!item) return;
        if (p.getItemCount(item.id) <= 0) return;
        // 창고 용량 가드(종류 기준): 새로운 종류를 넣으려는데 maxSlots 도달이면 거절.
        // 동일 ID 가 이미 보관 중이면 스택만 늘어나므로 통과.
        const isNewKind = !zoneItems.has(item.id);
        if (isNewKind && totalKinds >= maxSlots) {
          message = `⚠ 창고가 가득 찼습니다 (${totalKinds}/${maxSlots}종). 거점을 업그레이드하면 더 보관할 수 있습니다.`;
          render(el);
          return;
        }
        p.removeItemById(item.id, 1);
        k.addToStorage(loc, activeZone, item.id, 1);
        message = '';
        render(el);
      });
    });

    // 거점 업그레이드 버튼
    wrap.querySelector<HTMLButtonElement>('[data-base-upgrade]')?.addEventListener('click', () => {
      if (!baseDef || level < 1 || level >= 5) return;
      const cost = getUpgradeCost(baseDef, level);
      if (p.spirit.gold < cost) return;
      p.addGold(-cost);
      k.trackGoldSpent(cost);
      k.upgradeBase(loc);
      session.backlog.add(
        session.gameTime,
        `${locLabel} 거점을 Lv.${level + 1}로 업그레이드했다. (-${cost}G)`,
        '시스템',
      );
      message = `거점 업그레이드 완료! Lv.${level + 1} (-${cost}G)`;
      render(el);
    });

    // 빼기 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-withdraw]').forEach(btn => {
      btn.addEventListener('click', () => {
        const items = [...zoneItems.entries()];
        const idx = parseInt(btn.dataset.withdraw!, 10);
        const [id] = items[idx];
        if (!id) return;
        // 가방 용량 검사: 창고→가방 이동은 새 슬롯을 요구할 수 있으므로 isBagFull 체크 필수.
        // 이미 동일 ID 가 가방에 있으면 isBagFull(cap, id) 는 false 를 반환하여 스택된다.
        if (p.isBagFull(k.bagCapacity, id)) {
          message = '⚠ 가방이 가득 찼습니다. 공간을 비우고 다시 시도하세요.';
          render(el);
          return;
        }
        // 1개씩 빼기
        if (k.removeFromStorage(loc, activeZone, id, 1)) {
          p.addItemById(id, 1);
          message = '';
        }
        render(el);
      });
    });

    el.appendChild(wrap);
  }

  return {
    id: 'storage',
    render,
    onKey(key) {
      const c = document.querySelector('.info-screen')?.parentElement;
      if (!(c instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (key === 'q' || key === 'Q') { activeZone = 'cold'; render(c); }
      if (key === 'w' || key === 'W') { activeZone = 'room'; render(c); }
      if (key === 'e' || key === 'E') { activeZone = 'warm'; render(c); }
      if (key === '1' && mode === 'view') { mode = 'deposit'; render(c); }
      else if (key === '2' && mode === 'view') { mode = 'withdraw'; render(c); }
    },
  };
}
