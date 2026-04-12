// village.ts — 마을 메인 화면 (정보 + 시설 관리)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getAllFacilityDefs, getAllRoadDefs } from '../../data/village-defs';
import { recalcVillageFinance } from '../../models/village';
import { getFacilityDef } from '../../data/village-defs';
import { locationName } from '../../types/registry';

const FACILITY_CATEGORY_LABEL: Record<string, string> = {
  production: '생산',
  amenity: '편의',
  defense: '방어',
  admin: '행정',
  culture: '문화',
  special: '특수',
};

export function createVillageScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  let statusMessage = '';

  function render(el: HTMLElement): void {
    const knowledge = session.knowledge;
    const village = knowledge.villageState;

    if (!village) {
      el.innerHTML = '<div class="screen info-screen"><p>마을 정보 없음</p></div>';
      return;
    }

    const p = session.player;
    const gold = p.spirit.gold;
    const allFacilities = getAllFacilityDefs().filter(f => f.unlockStage <= village.stage);
    const allRoads = getAllRoadDefs();

    // 건설된 시설 목록
    const builtIds = new Set(village.facilities.map(f => f.facilityId));

    // 시설 목록 HTML
    let builtHtml = '';
    if (village.facilities.length === 0) {
      builtHtml = '<p style="color:var(--text-dim);text-align:center;font-size:12px">건설된 시설 없음</p>';
    } else {
      builtHtml = village.facilities.map(inst => {
        const def = getFacilityDef(inst.facilityId);
        if (!def) return '';
        const statusColor = inst.status === 'active' ? 'var(--success)' : 'var(--warning)';
        const statusLabel = inst.status === 'active' ? '운영중' : '정지';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:6px 8px;border-radius:6px;background:var(--bg-panel);margin-bottom:4px;font-size:12px">
            <span><strong>${def.name}</strong>
              <span style="color:var(--text-dim);margin-left:6px">[${FACILITY_CATEGORY_LABEL[def.category] ?? def.category}]</span>
            </span>
            <span>
              ${def.incomePerDay > 0 ? `<span style="color:var(--success)">+${def.incomePerDay}G/일</span> ` : ''}
              ${def.maintenancePerDay > 0 ? `<span style="color:var(--warning)">-${def.maintenancePerDay}G/일</span> ` : ''}
              <span style="color:${statusColor}">${statusLabel}</span>
            </span>
          </div>`;
      }).join('');
    }

    // 건설 가능한 시설 목록
    let buildHtml = '';
    const buildable = allFacilities.filter(f => !builtIds.has(f.id));
    if (buildable.length === 0) {
      buildHtml = '<p style="color:var(--text-dim);text-align:center;font-size:12px">건설 가능한 시설 없음</p>';
    } else {
      buildHtml = buildable.map(def => {
        const costParts: string[] = [`${def.buildCostGold}G`];
        if (def.buildCostWood > 0) costParts.push(`목재×${def.buildCostWood}`);
        if (def.buildCostStone > 0) costParts.push(`석재×${def.buildCostStone}`);
        if (def.buildCostWheat > 0) costParts.push(`밀×${def.buildCostWheat}`);
        const canAfford = gold >= def.buildCostGold;
        return `
          <div style="border:1px solid ${canAfford ? 'var(--warning)' : 'var(--border)'};
                      border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--bg-card)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <span style="font-weight:bold;font-size:13px">${def.name}
                <span style="font-size:11px;color:var(--text-dim)">[${FACILITY_CATEGORY_LABEL[def.category] ?? def.category}]</span>
              </span>
              <span style="font-size:12px;color:${canAfford ? 'var(--warning)' : 'var(--text-dim)'}">
                ${costParts.join(' · ')}
              </span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${def.description}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:5px">
              ${def.incomePerDay > 0 ? `수입 +${def.incomePerDay}G/일 · ` : ''}유지비 ${def.maintenancePerDay}G/일
            </div>
            <button class="btn" data-build-facility="${def.id}"
              style="${canAfford ? '' : 'opacity:0.5'}">
              건설 (${def.buildCostGold}G)${canAfford ? '' : ' — 골드 부족'}
            </button>
          </div>`;
      }).join('');
    }

    // 도로 건설 섹션
    let roadHtml = '';
    const builtRoadIds = new Set(village.roads.map(r => r.roadId));
    const buildableRoads = allRoads.filter(r => !builtRoadIds.has(r.id));
    if (buildableRoads.length === 0) {
      roadHtml = '<p style="color:var(--text-dim);text-align:center;font-size:12px">건설 가능한 도로 없음</p>';
    } else {
      // 연결 가능 위치들 (마을과 인접한 위치)
      const adjacentRoutes = session.world.getOutgoingRoutes(village.locationId, session.gameTime.day);
      roadHtml = buildableRoads.map(def => {
        const costParts: string[] = [`${def.buildCostGold}G`];
        if (def.buildCostWood > 0) costParts.push(`목재×${def.buildCostWood}`);
        if (def.buildCostStone > 0) costParts.push(`석재×${def.buildCostStone}`);
        const canAfford = gold >= def.buildCostGold;
        let targetHtml = '';
        if (adjacentRoutes.length > 0) {
          targetHtml = adjacentRoutes.map(([locId]) => {
            const alreadyConnected = village.roads.some(r => r.connectedLocationId === locId && r.roadId === def.id);
            if (alreadyConnected) return '';
            return `<button class="btn" data-build-road="${def.id}" data-road-target="${locId}"
              style="font-size:11px;margin:2px;${canAfford ? '' : 'opacity:0.5'}">
              → ${locationName(locId) || locId}
            </button>`;
          }).join('');
        }
        return `
          <div style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--bg-card)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <span style="font-weight:bold;font-size:13px">${def.name}</span>
              <span style="font-size:12px;color:var(--text-dim)">${costParts.join(' · ')}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">${def.description}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:5px">
              이동속도 ×${def.travelSpeedMultiplier} · 유지비 ${def.maintenancePerDay}G/일
            </div>
            ${targetHtml || '<span style="font-size:11px;color:var(--text-dim)">연결 가능한 위치 없음</span>'}
          </div>`;
      }).join('');
    }

    const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>🏘 ${village.name}</h2>
      ${statusMessage ? `<div style="color:var(--warning);text-align:center;margin-bottom:8px">${statusMessage}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">단계</div>
          <div style="font-size:18px;font-weight:bold">Lv.${village.stage}</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">인구</div>
          <div style="font-size:18px;font-weight:bold">${village.population}명</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">행복도</div>
          <div style="font-size:16px;font-weight:bold">${village.happiness}/100</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">방어도</div>
          <div style="font-size:16px;font-weight:bold">${village.defense}/100</div>
        </div>
      </div>

      <div style="padding:8px 10px;background:var(--bg-panel);border-radius:8px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <span>금고: <strong style="color:var(--warning)">${village.finance.treasury}G</strong></span>
          <span>일일 수입: <strong style="color:${net >= 0 ? 'var(--success)' : 'var(--accent)'}">
            ${net >= 0 ? '+' : ''}${net}G
          </strong></span>
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px">
          수입 ${village.finance.totalIncomePerDay}G · 유지비 ${village.finance.totalMaintenancePerDay}G
        </div>
      </div>

      <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">건설된 시설 (${village.facilities.length}개)</div>
      ${builtHtml}

      <div style="font-size:12px;color:var(--text-dim);margin-top:10px;margin-bottom:4px">시설 건설</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">소지금: ${gold}G</div>
      ${buildHtml}

      <div style="font-size:12px;color:var(--text-dim);margin-top:10px;margin-bottom:4px">도로 건설</div>
      ${roadHtml}

      <p class="hint">Esc=뒤로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    // 시설 건설 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-build-facility]').forEach(btn => {
      btn.addEventListener('click', () => {
        const facilityId = btn.dataset.buildFacility!;
        const def = getFacilityDef(facilityId);
        if (!def) return;
        if (gold < def.buildCostGold) {
          statusMessage = '골드가 부족합니다.';
          render(el);
          return;
        }
        // 골드 차감
        p.addGold(-def.buildCostGold);
        knowledge.trackGoldSpent(def.buildCostGold);
        // 시설 추가
        village.facilities.push({
          facilityId: def.id,
          builtDay: session.gameTime.day,
          status: 'active',
        });
        // 재무 갱신
        recalcVillageFinance(village, getFacilityDef);
        session.backlog.add(
          session.gameTime,
          `개척 마을 "${village.name}"에 ${def.name}을(를) 건설했다. (-${def.buildCostGold}G)`,
          '마을',
        );
        statusMessage = `${def.name} 건설 완료!`;
        render(el);
      });
    });

    // 도로 건설 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-build-road]').forEach(btn => {
      btn.addEventListener('click', () => {
        const roadId = btn.dataset.buildRoad!;
        const targetLocId = btn.dataset.roadTarget!;
        const def = getAllRoadDefs().find(r => r.id === roadId);
        if (!def) return;
        if (gold < def.buildCostGold) {
          statusMessage = '골드가 부족합니다.';
          render(el);
          return;
        }
        p.addGold(-def.buildCostGold);
        knowledge.trackGoldSpent(def.buildCostGold);
        village.roads.push({
          roadId: def.id,
          connectedLocationId: targetLocId,
          builtDay: session.gameTime.day,
          status: 'active',
        });
        session.backlog.add(
          session.gameTime,
          `개척 마을 "${village.name}"에서 ${locationName(targetLocId) || targetLocId}까지 ${def.name}을(를) 건설했다.`,
          '마을',
        );
        statusMessage = `${def.name} 건설 완료!`;
        render(el);
      });
    });

    el.appendChild(wrap);
  }

  return {
    id: 'village',
    render,
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
