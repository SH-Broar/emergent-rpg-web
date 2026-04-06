// real-estate.ts — 부동산 구매 화면 (길드에서 거점 구매)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';

interface BaseOption {
  locationId: string;
  price: number;
  description: string;
}

const PURCHASABLE_BASES: BaseOption[] = [
  { locationId: 'Town_Elimes', price: 500, description: '엘리메스 마을 중심가의 작은 집' },
  { locationId: 'Luna_Academy', price: 800, description: '마법학교 루나 기숙사 한 칸' },
  { locationId: 'Manonickla', price: 600, description: '마노니클라의 아담한 거처' },
  { locationId: 'Martin_Port', price: 700, description: '마틴 항구 근처 선원 숙소' },
  { locationId: 'Halpia', price: 1200, description: '할퓌아 부유 섬의 구름 위 거처' },
  { locationId: 'Alimes', price: 1000, description: '알리메스 고지대의 전망 좋은 방' },
  { locationId: 'Lar_Forest', price: 400, description: '라르 숲 속 오두막' },
  { locationId: 'Enicham', price: 900, description: '에니챰 공방 옆 작업실 겸 거처' },
];

export function createRealEstateScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  function render(el: HTMLElement) {
    const k = session.knowledge;
    const gold = session.player.spirit.gold;

    let listHtml = '';
    for (let i = 0; i < PURCHASABLE_BASES.length; i++) {
      const base = PURCHASABLE_BASES[i];
      const owned = k.ownedBases.has(base.locationId)
        || session.player.homeLocation === base.locationId;
      const canAfford = gold >= base.price;
      const name = locationName(base.locationId) || base.locationId;
      const level = k.getBaseLevel(base.locationId);

      if (owned) {
        listHtml += `
          <button class="btn npc-item" disabled style="min-height:50px;border-left:3px solid var(--success);opacity:0.7">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <div>
                <span class="npc-num">${i + 1}</span>
                <span style="font-weight:bold">${name}</span>
                <span style="font-size:10px;color:var(--success);margin-left:4px">Lv.${level} 보유중</span>
              </div>
              <span style="font-size:12px;color:var(--success)">✓</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;text-align:left">${base.description}</div>
          </button>`;
      } else {
        listHtml += `
          <button class="btn npc-item" data-buy="${i}" style="min-height:50px;border-left:3px solid ${canAfford ? 'var(--warning)' : 'var(--border)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <div>
                <span class="npc-num">${i + 1}</span>
                <span style="font-weight:bold">${name}</span>
              </div>
              <span style="font-size:12px;font-weight:bold;color:${canAfford ? 'var(--warning)' : 'var(--text-dim)'}">${base.price}G</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;text-align:left">${base.description}</div>
          </button>`;
      }
    }

    // 거점 업그레이드 섹션
    const currentLoc = session.player.currentLocation;
    const currentOwned = k.ownedBases.has(currentLoc) || session.player.homeLocation === currentLoc;
    let upgradeHtml = '';
    if (currentOwned) {
      const level = k.getBaseLevel(currentLoc);
      const upgradeCost = level * 300 + 200;
      const canUpgrade = level < 5 && gold >= upgradeCost;
      upgradeHtml = `
        <div style="margin-top:12px;padding:8px;background:var(--bg-panel);border-radius:8px">
          <div style="font-size:13px;font-weight:bold;margin-bottom:4px">현재 거점 업그레이드</div>
          <div style="font-size:11px;color:var(--text-dim)">${locationName(currentLoc)} — Lv.${level}/5</div>
          ${level < 5
            ? `<button class="btn" data-upgrade style="margin-top:6px;font-size:12px;${canUpgrade ? '' : 'opacity:0.5'}"">
                업그레이드 → Lv.${level + 1} (${upgradeCost}G)
              </button>`
            : '<div style="font-size:11px;color:var(--success);margin-top:4px">최대 레벨 도달</div>'
          }
        </div>`;
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>🏘 부동산</h2>
      <p style="text-align:center;color:var(--text-dim);font-size:12px">
        소지금: ${gold}G · 보유 거점: ${k.ownedBases.size + 1}곳
      </p>
      <div class="npc-list" style="margin:12px 0">${listHtml}</div>
      ${upgradeHtml}
      <p class="hint">번호키로 구매 · Esc 뒤로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    wrap.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.buy!, 10);
        const base = PURCHASABLE_BASES[idx];
        if (session.player.spirit.gold >= base.price) {
          session.player.spirit.gold -= base.price;
          k.trackGoldSpent(base.price);
          k.purchaseBase(base.locationId);
          session.backlog.add(
            session.gameTime,
            `${locationName(base.locationId)}에 거점을 마련했다.`,
            '시스템',
          );
          render(el);
        }
      });
    });

    wrap.querySelector('[data-upgrade]')?.addEventListener('click', () => {
      const level = k.getBaseLevel(currentLoc);
      const cost = level * 300 + 200;
      if (level < 5 && session.player.spirit.gold >= cost) {
        session.player.spirit.gold -= cost;
        k.trackGoldSpent(cost);
        k.upgradeBase(currentLoc);
        session.backlog.add(
          session.gameTime,
          `${locationName(currentLoc)} 거점을 Lv.${level + 1}로 업그레이드했다.`,
          '시스템',
        );
        render(el);
      }
    });

    el.appendChild(wrap);
  }

  return {
    id: 'realestate',
    render,
    onKey(key) {
      if (key === 'Escape') { onDone(); return; }
      if (/^[1-8]$/.test(key)) {
        const idx = parseInt(key, 10) - 1;
        if (idx < PURCHASABLE_BASES.length) {
          const base = PURCHASABLE_BASES[idx];
          const k = session.knowledge;
          if (!k.ownedBases.has(base.locationId)
            && session.player.homeLocation !== base.locationId
            && session.player.spirit.gold >= base.price) {
            session.player.spirit.gold -= base.price;
            k.trackGoldSpent(base.price);
            k.purchaseBase(base.locationId);
            session.backlog.add(
              session.gameTime,
              `${locationName(base.locationId)}에 거점을 마련했다.`,
              '시스템',
            );
            const c = document.querySelector('.info-screen')?.parentElement;
            if (c instanceof HTMLElement) render(c);
          }
        }
      }
    },
  };
}
