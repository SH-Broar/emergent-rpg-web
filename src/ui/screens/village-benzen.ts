// village-benzen.ts — 벤젠과의 대화 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { VillageSpecialization } from '../../models/village';
import { getFacilityDef, getBenzenLine } from '../../data/village-defs';

const SPEC_LABELS: Record<VillageSpecialization, string> = {
  none: '미선택',
  production: '생산 특화',
  trade: '무역 특화',
  defense: '방어 특화',
  culture: '문화 특화',
};

const SPEC_DESC: Record<VillageSpecialization, string> = {
  none: '',
  production: '생산 시설 수입 +30%, 기타 시설 수입 -10%',
  trade: '편의/행정 시설 수입 +30%, 기타 시설 수입 -10%',
  defense: '방어 시설 수입 +30%, 기타 시설 수입 -10%',
  culture: '문화 시설 수입 +30%, 기타 시설 수입 -10%',
};

export function createVillageBenzenScreen(
  session: GameSession,
  onDone: () => void,
  onEventRequested: () => void,
): Screen {
  let statusMessage = '';
  let currentView: 'main' | 'briefing' | 'upgrade' | 'spec' = 'main';

  function render(el: HTMLElement): void {
    const village = session.knowledge.villageState;
    if (!village) {
      el.innerHTML = '<div class="screen info-screen"><p>마을 정보 없음</p></div>';
      return;
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    if (currentView === 'main') {
      const hasEvent = village.activeEvent !== null;
      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2 style="text-align:center">벤젠</h2>
        <div style="padding:12px;background:var(--bg-panel);border-radius:10px;margin:10px 0;
                    font-size:13px;line-height:1.6;color:var(--text-dim);font-style:italic;text-align:center">
          "뭐, 이 정도 마을 관리야 당연하지. 특별히 봐주는 거라고."
        </div>
        ${statusMessage ? `<div style="color:var(--warning);text-align:center;margin-bottom:8px;font-size:13px">${statusMessage}</div>` : ''}
        ${hasEvent ? `
          <div style="padding:10px;background:rgba(255,80,80,0.15);border:1px solid var(--accent);
                      border-radius:8px;margin-bottom:10px;text-align:center;font-size:13px">
            <strong style="color:var(--accent)">처리 대기 이벤트 있음!</strong>
            <div style="font-size:11px;color:var(--text-dim);margin-top:3px">마을에 중요한 일이 생겼다.</div>
          </div>
        ` : ''}
        <div class="menu-buttons">
          <button class="btn" data-view="briefing">[1] 마을 현황 브리핑</button>
          <button class="btn" data-view="upgrade">[2] 시설 업그레이드 가이드</button>
          <button class="btn" data-view="spec">[3] 마을 전문화 선택</button>
          ${hasEvent ? `<button class="btn" style="border-color:var(--accent)" data-event>[!] 이벤트 처리하기</button>` : ''}
          <button class="btn" data-back>[4] 뒤로</button>
        </div>
        <p class="hint">1~4 키 또는 버튼 클릭</p>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      wrap.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentView = btn.dataset.view as any;
          statusMessage = '';
          render(el);
        });
      });
      wrap.querySelector('[data-event]')?.addEventListener('click', onEventRequested);

    } else if (currentView === 'briefing') {
      const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;

      // 부족 재료 경고: 업그레이드 가능 시설 중 재료가 부족한 것
      const warnings: string[] = [];
      for (const inst of village.facilities) {
        if (inst.tier >= 3) continue;
        const def = getFacilityDef(inst.facilityId);
        if (!def || !def.tiers) continue;
        const nextTier = def.tiers[inst.tier]; // tier는 1-indexed, 배열은 0-indexed
        if (!nextTier) continue;
        const gold = session.player.spirit.gold + village.finance.treasury;
        if (nextTier.upgradeCostGold > gold) {
          warnings.push(`${def.name}: 골드 부족 (필요 ${nextTier.upgradeCostGold}G)`);
        }
      }

      const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];
      const stageName = STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`;
      const currentDay = session.gameTime.day;
      const benzenComment = getBriefingComment(
        village.population,
        village.happiness,
        net,
        village.visitingNpcCount ?? 0,
        village.stage,
      );

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>마을 현황 브리핑</h2>
        <div style="padding:10px;background:var(--bg-panel);border-radius:8px;margin-bottom:10px;
                    font-size:13px;font-style:italic;color:var(--text-dim);text-align:center">
          "${benzenComment}"
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">일일 수입</div>
            <div style="font-size:16px;font-weight:bold;color:${net >= 0 ? 'var(--success)' : 'var(--accent)'}">
              ${net >= 0 ? '+' : ''}${net}G
            </div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">금고</div>
            <div style="font-size:16px;font-weight:bold;color:var(--warning)">${village.finance.treasury}G</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">인구</div>
            <div style="font-size:16px;font-weight:bold">${village.population}명</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">행복도</div>
            <div style="font-size:16px;font-weight:bold">${village.happiness}/100</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">명성</div>
            <div style="font-size:16px;font-weight:bold;color:var(--info)">${village.reputation}/100</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">전문화</div>
            <div style="font-size:14px;font-weight:bold">${SPEC_LABELS[village.specialization]}</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">단계</div>
            <div style="font-size:14px;font-weight:bold">${stageName} <span style="color:var(--text-dim);font-size:11px">(${village.stage})</span></div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">설립 / 경과</div>
            <div style="font-size:13px;font-weight:bold">${village.foundedDay}일차 / ${currentDay - village.foundedDay}일</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">오늘 방문자</div>
            <div style="font-size:16px;font-weight:bold;color:var(--success)">${village.visitingNpcCount ?? 0}명</div>
          </div>
          <div style="padding:8px;background:var(--bg-panel);border-radius:8px;text-align:center">
            <div style="font-size:11px;color:var(--text-dim)">도로 연결</div>
            <div style="font-size:16px;font-weight:bold">${village.roads.length}개</div>
          </div>
        </div>

        ${warnings.length > 0 ? `
          <div style="padding:10px;background:rgba(255,150,0,0.1);border:1px solid var(--warning);
                      border-radius:8px;margin-bottom:10px">
            <div style="font-size:12px;font-weight:bold;color:var(--warning);margin-bottom:6px">재료 부족 경고</div>
            ${warnings.map(w => `<div style="font-size:11px;color:var(--text-dim);margin-bottom:2px">• ${w}</div>`).join('')}
          </div>
        ` : ''}

        <button class="btn" data-back style="margin-top:8px">← 뒤로</button>
      `;
      wrap.querySelector('[data-back]')?.addEventListener('click', () => {
        currentView = 'main'; render(el);
      });

    } else if (currentView === 'upgrade') {
      const upgradable = village.facilities.filter(f => f.tier < 3);

      let upgradeHtml = '';
      if (upgradable.length === 0) {
        upgradeHtml = '<p style="color:var(--text-dim);text-align:center;font-size:12px">모든 시설이 최고 티어입니다.</p>';
      } else {
        upgradeHtml = upgradable.map(inst => {
          const def = getFacilityDef(inst.facilityId);
          if (!def || !def.tiers) return '';
          const nextTierIdx = inst.tier; // 0-indexed
          const nextTier = def.tiers[nextTierIdx];
          if (!nextTier) return '';

          const costs: string[] = [];
          if (nextTier.upgradeCostGold > 0) costs.push(`${nextTier.upgradeCostGold}G`);
          if (nextTier.upgradeCostWood > 0) costs.push(`목재×${nextTier.upgradeCostWood}`);
          if (nextTier.upgradeCostStone > 0) costs.push(`석재×${nextTier.upgradeCostStone}`);
          if (nextTier.upgradeCostWheat > 0) costs.push(`밀×${nextTier.upgradeCostWheat}`);
          if (nextTier.upgradeCostHerb > 0) costs.push(`약초×${nextTier.upgradeCostHerb}`);
          if (nextTier.upgradeCostMonsterBone > 0) costs.push(`몬스터뼈×${nextTier.upgradeCostMonsterBone}(던전)`);
          if (nextTier.upgradeCostMagicStone > 0) costs.push(`마법석×${nextTier.upgradeCostMagicStone}(던전)`);
          if (nextTier.upgradeCostRareMetal > 0) costs.push(`희귀광물×${nextTier.upgradeCostRareMetal}(던전)`);

          const totalGold = session.player.spirit.gold + village.finance.treasury;
          const canAfford = totalGold >= nextTier.upgradeCostGold;

          return `
            <div style="border:1px solid ${canAfford ? 'var(--warning)' : 'var(--border)'};
                        border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--bg-card)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-weight:bold;font-size:13px">${def.name}
                  <span style="font-size:11px;color:var(--info)"> Lv.${inst.tier} → Lv.${inst.tier + 1}</span>
                </span>
              </div>
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">
                수입: +${nextTier.incomePerDay}G/일 · 유지비: ${nextTier.maintenancePerDay}G/일
                ${nextTier.happinessBonus > 0 ? ` · 행복 +${nextTier.happinessBonus}` : ''}
                ${nextTier.defenseBonus > 0 ? ` · 방어 +${nextTier.defenseBonus}` : ''}
              </div>
              <div style="font-size:11px;color:${canAfford ? 'var(--warning)' : 'var(--text-dim)'};margin-bottom:5px">
                비용: ${costs.join(' · ') || '무료'}
              </div>
            </div>
          `;
        }).join('');
      }

      const benzenUpgradeQuip = village.facilities.length > 0
        ? '"업그레이드? 당연히 해야지. 내가 직접 설계해줄 테니까."'
        : '"일단 뭔가 지어야 업그레이드를 하지."';

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>시설 업그레이드 가이드</h2>
        <div style="padding:10px;background:var(--bg-panel);border-radius:8px;margin-bottom:10px;
                    font-size:13px;font-style:italic;color:var(--text-dim);text-align:center">
          ${benzenUpgradeQuip}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">
          실제 업그레이드는 마을 화면에서 가능합니다. 던전 재료는 Phase 3에서 연동됩니다.
        </div>
        ${upgradeHtml}
        <button class="btn" data-back style="margin-top:8px">← 뒤로</button>
      `;
      wrap.querySelector('[data-back]')?.addEventListener('click', () => {
        currentView = 'main'; render(el);
      });

    } else if (currentView === 'spec') {
      const current = village.specialization;
      const alreadyChosen = current !== 'none';

      const specs: VillageSpecialization[] = ['production', 'trade', 'defense', 'culture'];

      const specHtml = specs.map(spec => {
        const isActive = current === spec;
        return `
          <div style="border:1px solid ${isActive ? 'var(--success)' : 'var(--border)'};
                      border-radius:8px;padding:10px;margin-bottom:8px;background:var(--bg-card)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-weight:bold;font-size:13px">${SPEC_LABELS[spec]}
                ${isActive ? '<span style="color:var(--success);font-size:11px"> ✓ 선택됨</span>' : ''}
              </span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${SPEC_DESC[spec]}</div>
            ${!alreadyChosen ? `
              <button class="btn btn-primary" data-spec="${spec}" style="font-size:12px">
                이 방향으로 전문화
              </button>
            ` : ''}
          </div>
        `;
      }).join('');

      const benzenSpecQuip = alreadyChosen
        ? `"이미 ${SPEC_LABELS[current]}을 선택했군. 좋은 선택이야, 물론 내 판단이기도 하고."`
        : '"전문화? 흠, 중요한 결정이야. 신중하게 골라. 한 번 선택하면 되돌리기 어려워."';

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>마을 전문화 선택</h2>
        <div style="padding:10px;background:var(--bg-panel);border-radius:8px;margin-bottom:10px;
                    font-size:13px;font-style:italic;color:var(--text-dim);text-align:center">
          ${benzenSpecQuip}
        </div>
        ${alreadyChosen ? `
          <div style="padding:8px;background:rgba(0,200,100,0.1);border-radius:8px;margin-bottom:10px;
                      text-align:center;font-size:12px;color:var(--success)">
            현재 전문화: ${SPEC_LABELS[current]}
          </div>
        ` : ''}
        ${specHtml}
        <button class="btn" data-back style="margin-top:8px">← 뒤로</button>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', () => {
        currentView = 'main'; render(el);
      });

      if (!alreadyChosen) {
        wrap.querySelectorAll<HTMLButtonElement>('[data-spec]').forEach(btn => {
          btn.addEventListener('click', () => {
            const spec = btn.dataset.spec as VillageSpecialization;
            village.specialization = spec;
            village.reputation = Math.min(100, village.reputation + 5);
            session.backlog.add(
              session.gameTime,
              `마을 "${village.name}"이(가) ${SPEC_LABELS[spec]}으로 전문화됐다.`,
              '마을',
            );
            statusMessage = `${SPEC_LABELS[spec]}으로 전문화 완료!`;
            currentView = 'main';
            render(el);
          });
        });
      }
    }

    el.appendChild(wrap);
  }

  return {
    id: 'village-benzen',
    render,
    onKey(key) {
      if (key === 'Escape') {
        if (currentView !== 'main') {
          currentView = 'main';
          const el = document.querySelector<HTMLElement>('#app');
          if (el) render(el);
        } else {
          onDone();
        }
      } else if (currentView === 'main') {
        if (key === '1') { currentView = 'briefing'; const el = document.querySelector<HTMLElement>('#app'); if (el) render(el); }
        else if (key === '2') { currentView = 'upgrade'; const el = document.querySelector<HTMLElement>('#app'); if (el) render(el); }
        else if (key === '3') { currentView = 'spec'; const el = document.querySelector<HTMLElement>('#app'); if (el) render(el); }
        else if (key === '4') onDone();
      }
    },
  };
}

function getBriefingComment(
  population: number,
  happiness: number,
  net: number,
  visitingNpcCount: number,
  stage: number,
): string {
  if (net < 0) return getBenzenLine('net_negative');
  if (population < 5) return getBenzenLine('low_population');
  if (happiness < 30) return getBenzenLine('low_happiness');
  if (happiness >= 70 && population > 10) return getBenzenLine('high_happiness');
  if (visitingNpcCount >= 5) return getBenzenLine('visitor_many');
  if (visitingNpcCount === 0 && stage >= 3) return getBenzenLine('visitor_zero');
  return getBenzenLine('default');
}
