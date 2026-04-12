// village-build.ts — 마을 건설 팝업 (위치 선택 + 이름 입력)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { createLocationData } from '../../models/world';
import { createVillageState } from '../../models/village';
import { GameRegistry, locationName } from '../../types/registry';

export function createVillageBuildScreen(
  session: GameSession,
  onDone: () => void,
  onBuilt: () => void,
): Screen {
  let statusMessage = '';
  let selectedLocId = '';
  let villageName = '';
  let step: 'select' | 'name' = 'select';

  function getAdjacentLocations(): { id: string; name: string; mins: number }[] {
    const p = session.player;
    const routes = session.world.getOutgoingRoutes(p.currentLocation, session.gameTime.day);
    return routes.map(([id, mins]) => ({
      id,
      name: locationName(id) || id,
      mins,
    }));
  }

  function tryBuild(el: HTMLElement): void {
    const name = villageName.trim();
    if (!name) {
      statusMessage = '마을 이름을 입력해주세요.';
      render(el);
      return;
    }
    if (!selectedLocId) {
      statusMessage = '건설 위치를 선택해주세요.';
      render(el);
      return;
    }

    const p = session.player;
    const knowledge = session.knowledge;

    // 이미 마을이 있으면 거부
    if (knowledge.hasVillage()) {
      statusMessage = '이미 개척 마을이 존재한다. 다시 건설할 수 없다.';
      render(el);
      return;
    }

    // pioneer_plan 소지 확인
    if ((p.items.get('pioneer_plan') ?? 0) < 1) {
      statusMessage = '개척 계획서가 없다.';
      render(el);
      return;
    }

    // LocationID 생성
    const safeNamePart = name.replace(/[^a-zA-Z0-9가-힣_]/g, '_');
    const newLocId = 'PlayerVillage_' + safeNamePart;

    // 이미 동일 ID가 존재하는 경우 방지
    if (session.world.getAllLocations().has(newLocId)) {
      statusMessage = '같은 이름의 마을이 이미 존재한다. 다른 이름을 사용해주세요.';
      render(el);
      return;
    }

    // 선택된 위치 데이터 확인
    const selectedLoc = session.world.getLocation(selectedLocId);

    // 1. LocationData 생성
    const locData = createLocationData(newLocId);
    locData.description = `${name} — 플레이어의 개척 마을.`;
    locData.gridX = selectedLoc.gridX + 1;
    locData.gridY = selectedLoc.gridY;

    // 2. 기존 위치와 양방향 링크
    locData.linksBidirectional.push({ target: selectedLocId, minutesOverride: 30 });
    session.world.setLocation(newLocId, locData);
    session.world.rebuildTravelGraph();

    // 3. locationNames 레지스트리 등록
    GameRegistry.I.locationNames.set(newLocId, name);

    // 4. VillageState 생성
    knowledge.villageState = createVillageState(newLocId, name, session.gameTime.day);

    // 5. pioneer_plan 아이템 제거
    p.removeItemById('pioneer_plan', 1);

    session.backlog.add(
      session.gameTime,
      `개척 마을 "${name}"이(가) ${locationName(selectedLocId)} 인근에 건설되었다!`,
      '마을',
    );

    onBuilt();
  }

  function render(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    if (step === 'select') {
      const adjacent = getAdjacentLocations();
      let listHtml = '';
      if (adjacent.length === 0) {
        listHtml = '<p style="color:var(--text-dim);text-align:center">이동 가능한 인접 위치가 없습니다.</p>';
      } else {
        listHtml = adjacent.map((loc, i) => `
          <button class="btn" data-loc="${loc.id}"
            style="${selectedLocId === loc.id ? 'border-left:4px solid #ffd700' : ''}">
            ${i + 1}. ${loc.name}
            <span style="color:var(--text-dim);font-size:11px"> (${loc.mins}분)</span>
          </button>
        `).join('');
      }

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>개척 마을 건설</h2>
        ${statusMessage ? `<div style="color:var(--warning);text-align:center;margin-bottom:8px">${statusMessage}</div>` : ''}
        <p style="text-align:center;color:var(--text-dim);font-size:12px">
          마을을 건설할 인접 위치를 선택하세요.<br>
          마을은 선택한 위치 옆에 생성됩니다.
        </p>
        <div class="menu-buttons">${listHtml}</div>
        ${selectedLocId ? `
          <div style="margin-top:8px;padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            선택: <strong>${locationName(selectedLocId)}</strong>
          </div>
          <button class="btn btn-primary" data-next style="margin-top:8px">이름 입력으로 →</button>
        ` : ''}
        <p class="hint">위치 선택 후 이름 입력</p>
      `;
    } else {
      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>마을 이름 입력</h2>
        ${statusMessage ? `<div style="color:var(--warning);text-align:center;margin-bottom:8px">${statusMessage}</div>` : ''}
        <p style="text-align:center;color:var(--text-dim);font-size:12px">
          건설 위치: <strong>${locationName(selectedLocId)}</strong> 인근
        </p>
        <div style="margin:12px 0;text-align:center">
          <input type="text" id="village-name-input" placeholder="마을 이름 (최대 20자)"
            maxlength="20" value="${villageName}"
            style="font-size:16px;padding:8px 12px;border-radius:6px;border:1px solid var(--border);
                   background:var(--bg-panel);color:var(--text);width:80%;max-width:300px;text-align:center">
        </div>
        <div style="text-align:center">
          <button class="btn btn-primary" data-build style="min-width:160px">마을 건설 확정</button>
        </div>
        <p class="hint">Enter=확정, Esc=뒤로</p>
      `;
    }

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      if (step === 'name') {
        step = 'select';
        statusMessage = '';
        render(el);
      } else {
        onDone();
      }
    });

    if (step === 'select') {
      wrap.querySelectorAll<HTMLButtonElement>('[data-loc]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedLocId = btn.dataset.loc!;
          statusMessage = '';
          render(el);
        });
      });
      wrap.querySelector('[data-next]')?.addEventListener('click', () => {
        if (!selectedLocId) { statusMessage = '위치를 선택해주세요.'; render(el); return; }
        step = 'name';
        statusMessage = '';
        render(el);
      });
    } else {
      const input = wrap.querySelector<HTMLInputElement>('#village-name-input');
      if (input) {
        input.focus();
        input.addEventListener('input', () => { villageName = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            villageName = input.value;
            tryBuild(el);
          }
        });
      }
      wrap.querySelector('[data-build]')?.addEventListener('click', () => {
        const input2 = el.querySelector<HTMLInputElement>('#village-name-input');
        if (input2) villageName = input2.value;
        tryBuild(el);
      });
    }

    el.appendChild(wrap);
  }

  return {
    id: 'village-build',
    render,
    onKey(key) {
      if (key === 'Escape') {
        if (step === 'name') {
          step = 'select';
          statusMessage = '';
          const el = document.querySelector<HTMLElement>('#app');
          if (el) render(el);
        } else {
          onDone();
        }
      }
    },
  };
}
