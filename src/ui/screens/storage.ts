// storage.ts — 거점 창고 관리 화면 (냉장/실온/온장)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { ItemType } from '../../types/enums';
import { getItemDef, categoryName, getStorageProfileForItem, type StorageZone } from '../../types/item-defs';

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

    // 창고 용량: 기본 20 + 레벨당 10
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

    // 현재 구역 아이템
    const zoneItems = storage[activeZone];
    const totalCount = [...zoneItems.values()].reduce((s, n) => s + n, 0);

    // 인벤토리 아이템 (통합: items 맵)
    const p = session.player;
    const invItems: { id: string; name: string; count: number }[] = [];
    for (const [id, count] of p.items) {
      if (count > 0) invItems.push({ id, name: getItemName(id), count });
    }

    // 구역 탭
    const tabHtml = (['cold', 'room', 'warm'] as StorageZone[]).map(z => {
      const items = storage[z];
      const cnt = [...items.values()].reduce((s, n) => s + n, 0);
      const active = z === activeZone;
      return `<button class="btn" data-zone="${z}" style="flex:1;font-size:11px;padding:4px;border-bottom:2px solid ${active ? ZONE_COLORS[z] : 'transparent'};color:${active ? ZONE_COLORS[z] : 'var(--text-dim)'}">${ZONE_LABELS[z]} (${cnt})</button>`;
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

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>📦 ${locLabel} 창고</h2>
      <p style="text-align:center;color:var(--text-dim);font-size:11px">
        Lv.${level} · 용량 ${totalCount}/${maxSlots} · 가방 ${invItems.reduce((s, it) => s + it.count, 0)}개
      </p>
      <div style="display:flex;gap:2px;margin-top:8px">${tabHtml}</div>
      ${modeHtml}
      ${contentHtml}
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
        // 1개씩 넣기
        if (p.getItemCount(item.id) > 0) {
          p.removeItemById(item.id, 1);
          k.addToStorage(loc, activeZone, item.id, 1);
        }
        render(el);
      });
    });

    // 빼기 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-withdraw]').forEach(btn => {
      btn.addEventListener('click', () => {
        const items = [...zoneItems.entries()];
        const idx = parseInt(btn.dataset.withdraw!, 10);
        const [id] = items[idx];
        if (!id) return;
        // 1개씩 빼기
        if (k.removeFromStorage(loc, activeZone, id, 1)) {
          p.addItemById(id, 1);
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
