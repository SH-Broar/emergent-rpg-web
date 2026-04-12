// farm.ts — 거점 농장 관리 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { tendFarm, type FarmCell, type FarmPlan, FARM_PLANS } from '../../models/farming';
import { getAvailableCrops, getCropDef } from '../../data/crop-defs';
import { checkAndAwardTitles } from '../../systems/title-system';

export function createFarmScreen(
  session: GameSession,
  locationId: string,
  onDone: () => void,
): Screen {
  const k = session.knowledge;
  let selectedCellIdx = -1;
  let mode: 'grid' | 'plant' | 'plan' = 'grid';

  function getFarm() {
    return k.getFarm(locationId);
  }

  function renderFarm(el: HTMLElement) {
    const farm = getFarm();
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    if (!farm) {
      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🌾 농장</h2>
        <p style="text-align:center;color:var(--text-dim);padding:20px">거점 Lv.3 달성 시 농장이 활성화됩니다.</p>
      `;
      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      el.appendChild(wrap);
      return;
    }

    const currentDay = session.gameTime.day;
    const availableCrops = getAvailableCrops(locationId);

    if (mode === 'grid') {
      // 농장 격자 화면
      let gridHtml = `<div style="display:grid;grid-template-columns:repeat(${farm.gridWidth},1fr);gap:6px;margin:12px 0">`;
      farm.cells.forEach((cell: FarmCell, i: number) => {
        const isSelected = i === selectedCellIdx;
        const isReady = cell.cropId && currentDay >= cell.plantedDay + cell.growthDays;
        const daysLeft = cell.cropId ? Math.max(0, cell.plantedDay + cell.growthDays - currentDay) : 0;
        const crop = cell.cropId ? getCropDef(cell.cropId) : null;
        const managePct = Math.round(cell.managementScore);

        let cellContent = '';
        let cellBg = 'var(--bg-card)';
        let cellBorder = 'var(--border)';

        if (cell.destroyed) {
          cellContent = '🐛 피해';
          cellBg = '#3a1a1a';
          cellBorder = 'var(--accent)';
        } else if (!cell.cropId) {
          cellContent = '<span style="font-size:11px;color:var(--text-dim)">빈 밭<br>[클릭해 파종]</span>';
        } else if (isReady) {
          cellContent = `🌾 ${crop?.name ?? cell.cropId}<br><span style="font-size:10px;color:var(--success)">수확 완료!</span>`;
          cellBg = '#1a3a1a';
          cellBorder = 'var(--success)';
        } else {
          const planLabel = FARM_PLANS.find(p => p.id === cell.plan)?.name ?? cell.plan;
          cellContent = `${crop?.name ?? cell.cropId}<br>
            <span style="font-size:10px;color:var(--text-dim)">D-${daysLeft} · 관리 ${managePct}%</span><br>
            <span style="font-size:9px;color:var(--warning)">${planLabel}</span>`;
        }

        if (isSelected) { cellBorder = 'var(--accent)'; }

        gridHtml += `
          <button class="btn" data-cell="${i}" style="
            min-height:80px;flex-direction:column;padding:6px;
            background:${cellBg};border:2px solid ${cellBorder};
            font-size:12px;line-height:1.4;word-break:keep-all
          ">${cellContent}</button>`;
      });
      gridHtml += '</div>';

      // 관리 버튼
      const tendLeft = 3 - (farm.tendCountToday ?? 0);
      const canTend = tendLeft > 0 && farm.cells.some((c: FarmCell) => c.cropId && !c.destroyed);

      let actionHtml = `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn" data-tend style="${canTend ? '' : 'opacity:0.5'}">
            🌿 관리하기 (오늘 ${tendLeft}회 남음)
          </button>
        </div>
      `;

      // 선택된 셀 액션
      if (selectedCellIdx >= 0) {
        const cell = farm.cells[selectedCellIdx];
        if (!cell.destroyed && !cell.cropId) {
          actionHtml += `<button class="btn btn-primary" data-plant>🌱 파종하기</button> `;
          actionHtml += `<button class="btn" data-setplan>📋 계획 변경</button>`;
        } else if (cell.cropId && !cell.destroyed) {
          actionHtml += `<button class="btn" data-setplan>📋 계획 변경</button>`;
        } else if (cell.destroyed) {
          actionHtml += `<button class="btn" data-clear>🗑 잔해 제거</button>`;
        }
      }

      const activeCells = farm.cells.filter((c: FarmCell) => c.cropId);
      const avgManagement = activeCells.length > 0
        ? Math.round(activeCells.reduce((s: number, c: FarmCell) => s + c.managementScore, 0) / activeCells.length)
        : 0;

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🌾 농장 — ${locationId}</h2>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">
          格자: ${farm.gridWidth}×${farm.gridHeight} ·
          관리도 전체 평균: ${avgManagement}%
        </div>
        ${gridHtml}
        ${actionHtml}
        <p class="hint">셀 선택 후 파종/계획 변경 · Esc 뒤로</p>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

      wrap.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCellIdx = parseInt(btn.dataset.cell!);
          renderFarm(el);
        });
      });

      wrap.querySelector('[data-tend]')?.addEventListener('click', () => {
        if (tendFarm(farm, currentDay)) {
          session.backlog.add(session.gameTime, `${locationId} 농장을 관리했다. (오늘 ${farm.tendCountToday}회)`, '농장');
          // 농장 관리: Iron+, Earth+, Wind-
          const tendInfluence = new Array(8).fill(0);
          tendInfluence[3] = 0.005;
          tendInfluence[4] = 0.01;
          tendInfluence[5] = -0.007;
          session.player.color.applyInfluence(tendInfluence);
          const tendTitles = checkAndAwardTitles(session);
          for (const t of tendTitles) {
            session.backlog.add(session.gameTime, `✦ 칭호 획득: "${t}"`, '시스템');
          }
          renderFarm(el);
        }
      });

      wrap.querySelector('[data-plant]')?.addEventListener('click', () => {
        mode = 'plant';
        renderFarm(el);
      });

      wrap.querySelector('[data-setplan]')?.addEventListener('click', () => {
        mode = 'plan';
        renderFarm(el);
      });

      wrap.querySelector('[data-clear]')?.addEventListener('click', () => {
        if (selectedCellIdx >= 0) {
          farm.cells[selectedCellIdx].destroyed = false;
          renderFarm(el);
        }
      });

    } else if (mode === 'plant') {
      // 작물 선택 화면
      let cropHtml = '';
      availableCrops.forEach((crop, i) => {
        const cell = selectedCellIdx >= 0 ? farm.cells[selectedCellIdx] : null;
        const planDef = FARM_PLANS.find(p => p.id === (cell?.plan ?? 'natural'));
        const costMod = planDef?.costModifier ?? 0;
        const extraCost = Math.round(crop.basePrice * costMod);
        const planNote = costMod > 0 ? ` (+${extraCost}G 계획 비용)` : '';
        cropHtml += `
          <button class="btn npc-item" data-crop="${crop.id}">
            <span class="npc-num">${i + 1}</span>
            <span class="npc-name">${crop.name}</span>
            <span class="npc-detail">${crop.growthDays}일 · 기본 ${crop.basePrice}G${planNote}</span>
          </button>`;
      });

      wrap.innerHTML = `
        <button class="btn back-btn" data-back-grid>← 뒤로</button>
        <h2>🌱 파종할 작물 선택</h2>
        <div class="npc-list">${cropHtml}</div>
        <p class="hint">1~9 선택 · Esc 뒤로</p>
      `;

      wrap.querySelector('[data-back-grid]')?.addEventListener('click', () => {
        mode = 'grid';
        renderFarm(el);
      });

      wrap.querySelectorAll<HTMLButtonElement>('[data-crop]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cropId = btn.dataset.crop!;
          const crop = getCropDef(cropId);
          if (!crop || selectedCellIdx < 0) return;
          const cell = farm.cells[selectedCellIdx];
          cell.cropId = cropId;
          cell.plantedDay = currentDay;
          cell.growthDays = crop.growthDays;
          cell.managementScore = 100;
          cell.destroyed = false;
          session.backlog.add(session.gameTime, `${locationId} 농장 ${selectedCellIdx + 1}번 밭에 ${crop.name}을(를) 심었다.`, '농장');
          mode = 'grid';
          renderFarm(el);
        });
      });

    } else if (mode === 'plan') {
      // 계획 선택 화면
      let planHtml = '';
      FARM_PLANS.forEach((plan, i) => {
        const isSpecialty = plan.id === 'specialty';
        const hasSpecialty = availableCrops.some(c => c.regional);
        const disabled = isSpecialty && !hasSpecialty;
        planHtml += `
          <button class="btn npc-item" data-plan="${plan.id}" ${disabled ? 'disabled style="opacity:0.4"' : ''}>
            <span class="npc-num">${i + 1}</span>
            <span class="npc-name">${plan.name}</span>
            <span class="npc-detail">${plan.description}</span>
          </button>`;
      });

      wrap.innerHTML = `
        <button class="btn back-btn" data-back-grid>← 뒤로</button>
        <h2>📋 농사 계획 선택</h2>
        <div class="npc-list">${planHtml}</div>
        <p class="hint">셀의 농사 방식을 선택하세요. Esc 뒤로</p>
      `;

      wrap.querySelector('[data-back-grid]')?.addEventListener('click', () => {
        mode = 'grid';
        renderFarm(el);
      });

      wrap.querySelectorAll<HTMLButtonElement>('[data-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
          const plan = btn.dataset.plan as FarmPlan;
          if (selectedCellIdx >= 0) {
            farm.cells[selectedCellIdx].plan = plan;
          } else {
            // 전체 셀에 적용
            for (const cell of farm.cells) cell.plan = plan;
          }
          mode = 'grid';
          renderFarm(el);
        });
      });
    }

    el.appendChild(wrap);
  }

  return {
    id: 'farm',
    render: renderFarm,
    onKey(key) {
      if (key === 'Escape') {
        if (mode !== 'grid') { mode = 'grid'; }
        else onDone();
        const c = document.querySelector('.info-screen')?.parentElement;
        if (c instanceof HTMLElement) renderFarm(c);
      }
      if (mode === 'plant' && /^[1-9]$/.test(key)) {
        const farm = getFarm();
        if (!farm) return;
        const crops = getAvailableCrops(locationId);
        const idx = parseInt(key) - 1;
        if (idx < crops.length && selectedCellIdx >= 0) {
          const crop = crops[idx];
          const cell = farm.cells[selectedCellIdx];
          cell.cropId = crop.id;
          cell.plantedDay = session.gameTime.day;
          cell.growthDays = crop.growthDays;
          cell.managementScore = 100;
          cell.destroyed = false;
          mode = 'grid';
          const c = document.querySelector('.info-screen')?.parentElement;
          if (c instanceof HTMLElement) renderFarm(c);
        }
      }
    },
  };
}
