// real-estate.ts — 부동산 구매/업그레이드 화면 (현재 마을 기준 필터)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { locationName } from '../../types/registry';
import { BASE_DEFS, getUpgradeCost, type BaseDef } from '../../data/base-defs';

/** 현재 위치가 속한 마을 그룹 결정 */
function getVillageForLocation(locationId: string): string {
  // base-defs의 village 필드와 매핑
  for (const def of BASE_DEFS) {
    if (def.locationId === locationId || def.village === locationId) {
      return def.village;
    }
  }
  // 위치 ID로 village 추론 (접두사 매칭)
  if (locationId.startsWith('Alimes')) return 'Alimes';
  if (locationId.startsWith('Luna')) return 'Luna';
  if (locationId.startsWith('Martin')) return 'Martin';
  if (locationId.startsWith('Manonickla')) return 'Manonickla';
  if (locationId.startsWith('Halpia')) return 'Halpia';
  if (locationId.startsWith('Lar')) return 'LarForest';
  if (locationId.startsWith('Enicham')) return 'Enicham';
  if (locationId === 'Market_Square') return 'Iluneon';
  return '';
}

/** 레벨별 기능 설명 */
function getLevelFeatures(level: number, def: BaseDef): string {
  const lines: string[] = [];
  if (level >= 1) lines.push('수면, 창고, 요리');
  if (level >= 2) lines.push('농장 활성화 (2×2 격자)');
  if (level >= 3) lines.push('채집 효율 +10%, 요리 효과 +20% (해당 지역)');
  if (level >= 4) lines.push('농장 확장 (+2칸), 짧은 휴식 TP 회복');
  if (level >= 5) lines.push(`✨ 특수: ${def.lv5Ability.description}`);
  return lines.join(' · ');
}

export function createRealEstateScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  function render(el: HTMLElement) {
    const k = session.knowledge;
    const gold = session.player.spirit.gold;
    const currentLoc = session.player.currentLocation;
    const village = getVillageForLocation(currentLoc);

    // 현재 마을의 매물만 필터
    const localBases = village
      ? BASE_DEFS.filter(b => b.village === village)
      : BASE_DEFS; // 마을 특정 불가 시 전체 표시 (길드 홀 등)

    let listHtml = '';
    for (const def of localBases) {
      const owned = k.ownedBases.has(def.locationId) || session.player.homeLocation === def.locationId;
      const level = k.getBaseLevel(def.locationId);
      const name = locationName(def.locationId) || def.locationId;

      if (owned) {
        // 소유 중 — 업그레이드 버튼
        const upgradeCost = level < 5 ? getUpgradeCost(def, level) : 0;
        const canUpgrade = level < 5 && gold >= upgradeCost;
        listHtml += `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--bg-panel)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-weight:bold;color:var(--success)">✓ ${name} — Lv.${level}/5</span>
              <span style="font-size:11px;color:var(--text-dim)">${def.description}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${getLevelFeatures(level, def)}</div>
            ${level < 5
              ? `<button class="btn" data-upgrade="${def.locationId}" style="font-size:12px;${canUpgrade ? '' : 'opacity:0.5'}">
                  Lv.${level + 1}로 업그레이드 (${upgradeCost}G) ${canUpgrade ? '' : '— 골드 부족'}
                </button>`
              : '<span style="font-size:11px;color:var(--success)">최대 레벨 도달</span>'
            }
          </div>`;
      } else {
        // 미구매 — 구매 버튼
        const canAfford = gold >= def.contractPrice;
        listHtml += `
          <div style="border:1px solid ${canAfford ? 'var(--warning)' : 'var(--border)'};border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--bg-card)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-weight:bold">${name}</span>
              <span style="font-weight:bold;color:${canAfford ? 'var(--warning)' : 'var(--text-dim)'}">${def.contractPrice}G</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${def.description}</div>
            <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">Lv.1: ${getLevelFeatures(1, def)}</div>
            <button class="btn" data-buy="${def.locationId}" style="${canAfford ? '' : 'opacity:0.5'}">
              계약 (${def.contractPrice}G)${canAfford ? '' : ' — 골드 부족'}
            </button>
          </div>`;
      }
    }

    if (localBases.length === 0) {
      listHtml = '<p style="text-align:center;color:var(--text-dim);padding:20px">이 지역에 매물이 없습니다.<br>길드 홀이나 각 마을에서 확인하세요.</p>';
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>🏘 부동산</h2>
      <p style="text-align:center;color:var(--text-dim);font-size:12px;margin-bottom:8px">
        소지금: ${gold}G · 보유 거점: ${k.ownedBases.size + 1}곳 · 현재 지역: ${locationName(currentLoc)}
      </p>
      <div>${listHtml}</div>
      <p class="hint" style="text-align:center">Esc 뒤로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    // 구매 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const locId = btn.dataset.buy!;
        const def = BASE_DEFS.find(b => b.locationId === locId);
        if (!def) return;
        if (session.player.spirit.gold < def.contractPrice) return;
        session.player.addGold(-def.contractPrice);
        k.trackGoldSpent(def.contractPrice);
        k.purchaseBase(locId);
        session.backlog.add(session.gameTime, `${locationName(locId)}에 거점을 마련했다.`, '시스템');
        render(el);
      });
    });

    // 업그레이드 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => {
        const locId = btn.dataset.upgrade!;
        const def = BASE_DEFS.find(b => b.locationId === locId);
        if (!def) return;
        const level = k.getBaseLevel(locId);
        const cost = getUpgradeCost(def, level);
        if (level >= 5 || session.player.spirit.gold < cost) return;
        session.player.addGold(-cost);
        k.trackGoldSpent(cost);
        k.upgradeBase(locId);
        session.backlog.add(
          session.gameTime,
          `${locationName(locId)} 거점을 Lv.${level + 1}로 업그레이드했다.`,
          '시스템',
        );
        render(el);
      });
    });

    el.appendChild(wrap);
  }

  return {
    id: 'realestate',
    render,
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
