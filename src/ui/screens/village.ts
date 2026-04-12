// village.ts — 마을 메인 화면 (정보 + 시설 관리)

import type { Screen } from '../screen-manager';
import type { ScreenManager } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getAllFacilityDefs, getAllRoadDefs, getFacilityDef, getVillageEventDef, DUNGEON_MATERIAL_ITEM_IDS, VILLAGE_BUILD_ITEM_IDS } from '../../data/village-defs';
import { recalcVillageFinance, recalcVillageStats } from '../../models/village';
import { locationName } from '../../types/registry';
import { createVillageBenzenScreen } from './village-benzen';
import { createVillageEventScreen } from './village-event';

const FACILITY_CATEGORY_LABEL: Record<string, string> = {
  production: '생산',
  amenity: '편의',
  defense: '방어',
  admin: '행정',
  culture: '문화',
  special: '특수',
};

const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];

export function createVillageScreen(
  session: GameSession,
  onDone: () => void,
  screenManager?: ScreenManager,
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

    // 건설된 시설 HTML (티어 + 업그레이드 버튼 포함)
    let builtHtml = '';
    if (village.facilities.length === 0) {
      builtHtml = '<p style="color:var(--text-dim);text-align:center;font-size:12px">건설된 시설 없음</p>';
    } else {
      builtHtml = village.facilities.map(inst => {
        const def = getFacilityDef(inst.facilityId);
        if (!def) return '';
        const tier = inst.tier ?? 1;
        const statusColor = inst.status === 'active' ? 'var(--success)' : 'var(--warning)';
        const statusLabel = inst.status === 'active' ? '운영중' : '정지';

        // 현재 티어 수치
        const tierDef = def.tiers?.[tier - 1];
        const incomeNow = tierDef ? tierDef.incomePerDay : def.incomePerDay;
        const maintNow = tierDef ? tierDef.maintenancePerDay : def.maintenancePerDay;

        // 업그레이드 버튼
        let upgradeBtn = '';
        if (tier < 3 && def.tiers && def.tiers.length > tier) {
          const nextTier = def.tiers[tier]; // 0-indexed next
          const costGold = nextTier.upgradeCostGold;
          const costWood = nextTier.upgradeCostWood;
          const costStone = nextTier.upgradeCostStone;
          const costWheat = nextTier.upgradeCostWheat;
          const costHerb = nextTier.upgradeCostHerb;

          const costParts: string[] = [];
          if (costGold > 0) costParts.push(`${costGold}G`);
          if (costWood > 0) costParts.push(`목재×${costWood}`);
          if (costStone > 0) costParts.push(`석재×${costStone}`);
          if (costWheat > 0) costParts.push(`밀×${costWheat}`);
          if (costHerb > 0) costParts.push(`약초×${costHerb}`);
          if (nextTier.upgradeCostMonsterBone > 0) costParts.push(`뼈조각×${nextTier.upgradeCostMonsterBone}`);
          if (nextTier.upgradeCostMagicStone > 0) costParts.push(`문스톤×${nextTier.upgradeCostMagicStone}`);
          if (nextTier.upgradeCostRareMetal > 0) costParts.push(`은광석×${nextTier.upgradeCostRareMetal}`);

          const canAffordGold = gold >= costGold;
          const canAffordBone = nextTier.upgradeCostMonsterBone === 0 || p.getItemCount(DUNGEON_MATERIAL_ITEM_IDS.upgradeCostMonsterBone) >= nextTier.upgradeCostMonsterBone;
          const canAffordMagic = nextTier.upgradeCostMagicStone === 0 || p.getItemCount(DUNGEON_MATERIAL_ITEM_IDS.upgradeCostMagicStone) >= nextTier.upgradeCostMagicStone;
          const canAffordRare = nextTier.upgradeCostRareMetal === 0 || p.getItemCount(DUNGEON_MATERIAL_ITEM_IDS.upgradeCostRareMetal) >= nextTier.upgradeCostRareMetal;
          const canAfford = canAffordGold && canAffordBone && canAffordMagic && canAffordRare;
          upgradeBtn = `
            <button class="btn" data-upgrade-facility="${inst.facilityId}"
              style="font-size:10px;padding:2px 6px;margin-left:6px;${canAfford ? '' : 'opacity:0.5'}">
              Lv.${tier + 1}으로 업그레이드 (${costParts.join(' · ')})
            </button>`;
        }

        const tierBadgeColor = tier === 3 ? 'var(--success)' : tier === 2 ? 'var(--info)' : 'var(--text-dim)';

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:6px 8px;border-radius:6px;background:var(--bg-panel);margin-bottom:4px;font-size:12px">
            <span>
              <strong>${def.name}</strong>
              <span style="color:${tierBadgeColor};margin-left:4px">[Lv.${tier}]</span>
              <span style="color:var(--text-dim);margin-left:4px">[${FACILITY_CATEGORY_LABEL[def.category] ?? def.category}]</span>
            </span>
            <span style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end">
              ${incomeNow > 0 ? `<span style="color:var(--success)">+${incomeNow}G/일</span>` : ''}
              ${maintNow > 0 ? `<span style="color:var(--warning)">-${maintNow}G/일</span>` : ''}
              <span style="color:${statusColor}">${statusLabel}</span>
              ${upgradeBtn}
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
      const adjacentRoutes = session.world.getOutgoingRoutes(village.locationId, session.gameTime.day);
      roadHtml = buildableRoads.map(def => {
        const costParts: string[] = [`${def.buildCostGold}G`];
        if (def.buildCostWood > 0) costParts.push(`목재×${def.buildCostWood}`);
        if (def.buildCostStone > 0) costParts.push(`석재×${def.buildCostStone}`);
        if (def.buildCostIron > 0) costParts.push(`철광석×${def.buildCostIron}`);
        const canAffordGoldRoad = gold >= def.buildCostGold;
        const canAffordIronRoad = def.buildCostIron === 0 || p.getItemCount('iron_ore') >= def.buildCostIron;
        const canAfford = canAffordGoldRoad && canAffordIronRoad;
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

    // 활성 이벤트 배너
    const activeEventBanner = village.activeEvent
      ? `<div style="padding:10px;background:rgba(255,80,80,0.15);border:1px solid var(--accent);
                  border-radius:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:bold;font-size:13px;color:var(--accent)">마을 이벤트 발생!</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
              ${getVillageEventDef(village.activeEvent.eventId)?.name ?? village.activeEvent.eventId}
            </div>
          </div>
          <button class="btn" data-open-event style="border-color:var(--accent);font-size:12px">[이벤트 처리]</button>
        </div>`
      : '';

    // 벤젠 버튼
    const benzenBtn = village.benzenAppeared
      ? `<button class="btn" data-open-benzen
            style="margin-bottom:10px;border-color:var(--info);font-size:13px;width:100%">
          [벤젠과 대화]
        </button>`
      : '';

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>🏘 ${village.name}</h2>
      ${statusMessage ? `<div style="color:var(--warning);text-align:center;margin-bottom:8px">${statusMessage}</div>` : ''}

      ${activeEventBanner}
      ${benzenBtn}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">단계</div>
          <div style="font-size:16px;font-weight:bold">${STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`} <span style="font-size:12px;color:var(--text-dim)">(${village.stage})</span></div>
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
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">명성</div>
          <div style="font-size:16px;font-weight:bold;color:var(--info)">${village.reputation}/100</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">전문화</div>
          <div style="font-size:14px;font-weight:bold">${village.specialization === 'none' ? '없음' : village.specialization}</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">오늘 방문자</div>
          <div style="font-size:16px;font-weight:bold;color:var(--success)">${village.visitingNpcCount ?? 0}명</div>
        </div>
        <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
          <div style="font-size:11px;color:var(--text-dim)">설립 경과</div>
          <div style="font-size:14px;font-weight:bold">${session.gameTime.day - village.foundedDay}일</div>
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

    // 벤젠 화면 열기
    wrap.querySelector('[data-open-benzen]')?.addEventListener('click', () => {
      if (!screenManager) return;
      const benzenScreen = createVillageBenzenScreen(
        session,
        () => { screenManager.pop(); render(el); },
        () => {
          screenManager.pop();
          openEventScreen(el);
        },
      );
      screenManager.push(benzenScreen);
    });

    // 이벤트 처리 화면 열기
    wrap.querySelector('[data-open-event]')?.addEventListener('click', () => {
      openEventScreen(el);
    });

    function openEventScreen(el: HTMLElement): void {
      if (!screenManager || !village || !village.activeEvent) return;
      const eventDef = getVillageEventDef(village.activeEvent.eventId);
      if (!eventDef) return;
      const eventScreen = createVillageEventScreen(
        session,
        village,
        eventDef,
        () => { screenManager.pop(); render(el); },
      );
      screenManager.push(eventScreen);
    }

    // 시설 업그레이드 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-upgrade-facility]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!village) return;
        const facilityId = btn.dataset.upgradeFacility!;
        const inst = village.facilities.find(f => f.facilityId === facilityId);
        const def = getFacilityDef(facilityId);
        if (!inst || !def || !def.tiers) return;

        const currentTier = inst.tier ?? 1;
        if (currentTier >= 3) {
          statusMessage = '이미 최고 티어입니다.';
          render(el);
          return;
        }

        const nextTierDef = def.tiers[currentTier]; // 0-indexed
        if (!nextTierDef) return;

        if (gold < nextTierDef.upgradeCostGold) {
          statusMessage = '골드가 부족합니다.';
          render(el);
          return;
        }

        // 던전재료 보유량 확인
        const dungeonChecks: [keyof typeof DUNGEON_MATERIAL_ITEM_IDS, number][] = [
          ['upgradeCostMonsterBone', nextTierDef.upgradeCostMonsterBone],
          ['upgradeCostMagicStone', nextTierDef.upgradeCostMagicStone],
          ['upgradeCostRareMetal', nextTierDef.upgradeCostRareMetal],
        ];
        const ITEM_NAMES: Record<keyof typeof DUNGEON_MATERIAL_ITEM_IDS, string> = {
          upgradeCostMonsterBone: '뼈 조각',
          upgradeCostMagicStone: '문스톤',
          upgradeCostRareMetal: '은광석',
        };
        for (const [key, amount] of dungeonChecks) {
          if (amount > 0 && p.getItemCount(DUNGEON_MATERIAL_ITEM_IDS[key]) < amount) {
            statusMessage = `재료 부족: ${ITEM_NAMES[key]} ×${amount} 필요`;
            render(el);
            return;
          }
        }

        // 골드 차감
        p.addGold(-nextTierDef.upgradeCostGold);
        knowledge.trackGoldSpent(nextTierDef.upgradeCostGold);

        // 던전재료 차감
        for (const [key, amount] of dungeonChecks) {
          if (amount > 0) {
            p.removeItemById(DUNGEON_MATERIAL_ITEM_IDS[key], amount);
          }
        }

        // 티어 업
        inst.tier = (currentTier + 1) as 1 | 2 | 3;
        inst.upgradedDay = session.gameTime.day;

        // 명성 증가
        village.reputation = Math.min(100, village.reputation + 3);

        // 재무 + stats 갱신
        recalcVillageFinance(village, getFacilityDef);
        recalcVillageStats(village, getFacilityDef);

        session.backlog.add(
          session.gameTime,
          `마을 "${village.name}"의 ${def.name}이(가) Lv.${inst.tier}로 업그레이드됐다.`,
          '마을',
        );
        statusMessage = `${def.name} Lv.${inst.tier} 업그레이드 완료!`;
        render(el);
      });
    });

    // 시설 건설 버튼
    wrap.querySelectorAll<HTMLButtonElement>('[data-build-facility]').forEach(btn => {
      btn.addEventListener('click', () => {
        const facilityId = btn.dataset.buildFacility!;
        const def = getFacilityDef(facilityId);
        if (!def || !village) return;
        if (gold < def.buildCostGold) {
          statusMessage = '골드가 부족합니다.';
          render(el);
          return;
        }
        // C5: 재료 보유량 확인
        if (def.buildCostWood > 0 && p.getItemCount(VILLAGE_BUILD_ITEM_IDS.buildCostWood) < def.buildCostWood) {
          statusMessage = `재료 부족: 목재 ×${def.buildCostWood} 필요`;
          render(el);
          return;
        }
        if (def.buildCostStone > 0 && p.getItemCount(VILLAGE_BUILD_ITEM_IDS.buildCostStone) < def.buildCostStone) {
          statusMessage = `재료 부족: 석재 ×${def.buildCostStone} 필요`;
          render(el);
          return;
        }
        if (def.buildCostWheat > 0 && p.getItemCount(VILLAGE_BUILD_ITEM_IDS.buildCostWheat) < def.buildCostWheat) {
          statusMessage = `재료 부족: 밀 ×${def.buildCostWheat} 필요`;
          render(el);
          return;
        }
        p.addGold(-def.buildCostGold);
        knowledge.trackGoldSpent(def.buildCostGold);
        // C5: 재료 차감
        if (def.buildCostWood > 0) p.removeItemById(VILLAGE_BUILD_ITEM_IDS.buildCostWood, def.buildCostWood);
        if (def.buildCostStone > 0) p.removeItemById(VILLAGE_BUILD_ITEM_IDS.buildCostStone, def.buildCostStone);
        if (def.buildCostWheat > 0) p.removeItemById(VILLAGE_BUILD_ITEM_IDS.buildCostWheat, def.buildCostWheat);
        village.facilities.push({
          facilityId: def.id,
          builtDay: session.gameTime.day,
          status: 'active',
          tier: 1,
        });
        recalcVillageFinance(village, getFacilityDef);
        recalcVillageStats(village, getFacilityDef);
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
        if (!def || !village) return;
        if (gold < def.buildCostGold) {
          statusMessage = '골드가 부족합니다.';
          render(el);
          return;
        }
        // iron_ore 보유량 확인 (등급 3~4)
        if (def.buildCostWood > 0 && p.getItemCount(VILLAGE_BUILD_ITEM_IDS.buildCostWood) < def.buildCostWood) {
          statusMessage = `재료 부족: 목재 ×${def.buildCostWood} 필요`;
          render(el);
          return;
        }
        if (def.buildCostStone > 0 && p.getItemCount(VILLAGE_BUILD_ITEM_IDS.buildCostStone) < def.buildCostStone) {
          statusMessage = `재료 부족: 석재 ×${def.buildCostStone} 필요`;
          render(el);
          return;
        }
        if (def.buildCostIron > 0 && p.getItemCount('iron_ore') < def.buildCostIron) {
          statusMessage = `재료 부족: 철광석 ×${def.buildCostIron} 필요`;
          render(el);
          return;
        }
        p.addGold(-def.buildCostGold);
        knowledge.trackGoldSpent(def.buildCostGold);
        // C6: 재료 차감
        if (def.buildCostWood > 0) p.removeItemById(VILLAGE_BUILD_ITEM_IDS.buildCostWood, def.buildCostWood);
        if (def.buildCostStone > 0) p.removeItemById(VILLAGE_BUILD_ITEM_IDS.buildCostStone, def.buildCostStone);
        if (def.buildCostIron > 0) {
          p.removeItemById('iron_ore', def.buildCostIron);
        }
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
