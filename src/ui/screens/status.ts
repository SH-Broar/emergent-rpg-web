// status.ts — 통합 상태 화면 (전투 + 생활 플레이)
// 코어매트릭스 표시 없음 (기억의 샘에서만 확인)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { elementName, Element, ELEMENT_COUNT, raceName, spiritRoleName } from '../../types/enums';
import { LIFE_JOB_NAMES } from '../../types/enums';
import type { LifeJob } from '../../types/enums';
import { getRelationshipStage } from '../../systems/npc-interaction';
import { locationName } from '../../types/registry';
import { getWeaponDef, getArmorDef } from '../../types/item-defs';

const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];

export function createStatusScreen(
  session: GameSession,
  onBack: () => void,
): Screen {
  return {
    id: 'info-status',
    render(el) {
      const p = session.player;
      const k = session.knowledge;

      // --- 1. 기본 정보 ---
      const dayElapsed = session.gameTime.day;
      const locLabel = locationName(p.currentLocation) || p.currentLocation;

      // --- 2. 컬러 속성 ---
      const dominantTrait = p.color.getDominantTrait();
      const colorCols: string[] = [];
      for (let i = 0; i < ELEMENT_COUNT; i++) {
        const val = p.color.values[i];
        const scaled = Math.round((val - 0.5) * 200);
        const sign = scaled > 0 ? '+' : '';
        const barPct = Math.max(4, Math.round(val * 100));
        colorCols.push(`
          <div class="color-col">
            <div class="color-col-name" style="color:var(--el-${i})">${elementName(i as Element)}</div>
            <div class="color-bar-vertical">
              <div class="color-bar-vertical-fill" style="height:${barPct}%;background:var(--el-${i})"></div>
            </div>
            <div class="color-col-value">${sign}${scaled}</div>
          </div>
        `);
      }

      // --- 3. 전투 플레이 ---
      const weapon = p.equippedWeapon ? getWeaponDef(p.equippedWeapon) : null;
      const armor = p.equippedArmor ? getArmorDef(p.equippedArmor) : null;
      const clearedCount = k.totalDungeonsCleared;
      const skillCount = p.learnedSkills.size;
      const hyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

      // --- 4. 생활 플레이 ---
      const lifeJobLabel = p.lifeJob
        ? (LIFE_JOB_NAMES[p.lifeJob as LifeJob] || p.lifeJob)
        : '미취득';
      const basesCount = k.ownedBases.size;
      const currentBaseLv = k.getBaseLevel(p.currentLocation);
      const village = k.villageState;
      let villageHtml = '미건설';
      if (village) {
        const stageName = STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`;
        villageHtml = `${village.name} · ${stageName} · 인구 ${village.population}명 · 금고 ${village.finance.treasury}G`;
      }
      const totalLifeActions = k.totalGathersDone + k.totalCooksDone + k.totalFarmHarvests;

      // --- 5. 관계 요약 ---
      const knownCount = k.knownActorNames.size;
      const companionCount = k.partyMembers.length;
      let closeCount = 0;
      let companionRelCount = 0;
      for (const name of k.knownActorNames) {
        if (k.isCompanion(name)) { companionRelCount++; continue; }
        const stage = getRelationshipStage(p, name, k, session.actors, session.dungeonSystem);
        if (stage === 'close') closeCount++;
        else if (stage === 'companion') companionRelCount++;
      }

      // --- 6. 칭호 ---
      const titlesHtml = k.earnedTitles.length > 0
        ? k.earnedTitles.map(t => `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;background:var(--bg-panel);border-radius:12px;font-size:12px">${t}</span>`).join('')
        : '<span style="color:var(--text-dim);font-size:12px">없음</span>';
      const activeTitleHtml = k.activeTitle
        ? `<div style="font-size:11px;color:var(--warning);margin-top:4px">활성 칭호: ${k.activeTitle}</div>`
        : '';

      const html = `
        <div class="screen info-screen">
          <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
          <h2>${p.name} 상태</h2>

          <!-- 1. 기본 정보 -->
          <div class="info-section-title">기본 정보</div>
          <div class="info-grid">
            <div>종족: ${raceName(p.base.race)}</div>
            <div>역할: ${spiritRoleName(p.spirit.role)}</div>
            <div>위치: ${locLabel}</div>
            <div>경과 일수: ${dayElapsed}일</div>
          </div>

          <!-- 2. 컬러 속성 -->
          <div class="info-section-title">컬러 속성</div>
          <div class="color-list-vertical">${colorCols.join('')}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-dim);margin-top:4px">
            지배 특성: <strong style="color:var(--warning)">${dominantTrait}</strong>
          </div>

          <!-- 3. 전투 플레이 -->
          <div class="info-section-title" style="margin-top:14px">⚔ 전투</div>
          <div class="info-grid">
            <div>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</div>
            <div>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>
            <div>공격: ${p.getEffectiveAttack().toFixed(1)}</div>
            <div>방어: ${p.getEffectiveDefense().toFixed(1)}</div>
            <div>히페리온: Lv.${hyperionTotal}</div>
            <div>완료 던전: ${clearedCount}개</div>
            <div>획득 스킬: ${skillCount}개</div>
          </div>
          <div style="font-size:12px;margin-top:4px;color:var(--text-dim)">
            무기: <span style="color:var(--text)">${weapon ? weapon.name : '미장착'}</span>
            &nbsp;·&nbsp;
            방어구: <span style="color:var(--text)">${armor ? armor.name : '미장착'}</span>
          </div>

          <!-- 4. 생활 플레이 -->
          <div class="info-section-title" style="margin-top:14px">🌿 생활</div>
          <div class="info-grid">
            <div>소지금: ${p.spirit.gold}G</div>
            <div>생활 직업: ${lifeJobLabel}</div>
            <div>보유 거점: ${basesCount}개</div>
            <div>현재 거점 Lv: ${currentBaseLv > 0 ? currentBaseLv : '-'}</div>
            <div>채집 횟수: ${k.totalGathersDone}</div>
            <div>요리 횟수: ${k.totalCooksDone}</div>
            <div>수확 횟수: ${k.totalFarmHarvests}</div>
            <div>합계: ${totalLifeActions}</div>
          </div>
          <div style="font-size:12px;margin-top:4px;color:var(--text-dim)">
            마을: <span style="color:var(--text)">${villageHtml}</span>
          </div>

          <!-- 5. 관계 요약 -->
          <div class="info-section-title" style="margin-top:14px">👥 관계</div>
          <div class="info-grid">
            <div>알려진 NPC: ${knownCount}명</div>
            <div>현재 동료: ${companionCount}명</div>
            <div>친한 사이: ${closeCount}명</div>
            <div>동료 단계: ${companionRelCount}명</div>
          </div>

          <!-- 6. 칭호 -->
          <div class="info-section-title" style="margin-top:14px">✦ 칭호</div>
          <div style="margin-bottom:4px">${titlesHtml}</div>
          ${activeTitleHtml}

          <p class="hint" style="margin-top:16px">Esc=뒤로</p>
        </div>`;

      el.innerHTML = html;
      el.querySelector('[data-back]')?.addEventListener('click', onBack);
    },
    onKey(key) {
      if (key === 'Escape' || key === 'q') onBack();
    },
  };
}
