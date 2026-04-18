// skill-shop.ts — 마법학교 루나: 전투 직업 설정 + 스킬 학습

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getShopSkillsForLocation, type SkillDef } from '../../models/skill';
import { parseItemType, itemTypeName, ALL_COMBAT_JOBS, COMBAT_JOB_NAMES, COMBAT_JOB_DESC } from '../../types/enums';
import type { CombatJob } from '../../types/enums';

export function createSkillShopScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const loc = p.currentLocation;
  const shopSkills = getShopSkillsForLocation(loc);

  let tab: 'job' | 'skill' = 'job';

  // ============================================================
  // 스킬 학습 로직
  // ============================================================
  interface SkillLine {
    name: string;
    tiers: SkillDef[];
  }

  function buildSkillLines(): SkillLine[] {
    const tier1s = shopSkills.filter(s => !s.replacesSkill || s.replacesSkill === '');
    const lines: SkillLine[] = [];
    for (const base of tier1s) {
      const tiers: SkillDef[] = [base];
      const t2 = shopSkills.find(s => s.replacesSkill === base.id);
      if (t2) {
        tiers.push(t2);
        const t3 = shopSkills.find(s => s.replacesSkill === t2.id);
        if (t3) tiers.push(t3);
      }
      lines.push({ name: base.name.split(' ')[0] || base.name, tiers });
    }
    return lines;
  }

  function getPlayerCurrentTier(line: SkillLine): number {
    for (let i = line.tiers.length - 1; i >= 0; i--) {
      if (p.learnedSkills.has(line.tiers[i].id)) return i + 1;
    }
    return 0;
  }

  function getNextTier(line: SkillLine): SkillDef | null {
    const current = getPlayerCurrentTier(line);
    if (current >= line.tiers.length) return null;
    return line.tiers[current] ?? null;
  }

  function canAfford(skill: SkillDef): boolean {
    for (const cost of skill.learnCost ?? []) {
      const itemType = parseItemType(cost.item);
      const count = p.getItemCountByType(itemType);
      if (count < cost.amount) return false;
    }
    return true;
  }

  function meetsHyperion(skill: SkillDef): boolean {
    return p.hyperionLevel >= (skill.learnMinHyperion ?? 0);
  }

  function purchaseSkill(skill: SkillDef): boolean {
    if (!canAfford(skill) || !meetsHyperion(skill)) return false;
    for (const cost of skill.learnCost ?? []) {
      const itemType = parseItemType(cost.item);
      p.consumeItem(itemType, cost.amount);
    }
    p.replaceSkill(skill.replacesSkill ?? '', skill.id);
    session.backlog.add(session.gameTime, `${skill.name} 스킬을 습득했다!`, '행동');
    return true;
  }

  // ============================================================
  // 렌더링
  // ============================================================
  function renderJobTab(): string {
    const currentJob = (p.combatJob || '') as CombatJob;
    const jobCards = ALL_COMBAT_JOBS.map(job => {
      const isCurrent = currentJob === job;
      const borderStyle = isCurrent ? 'border-color:var(--success)' : '';
      return `
        <div style="padding:10px 12px;background:var(--bg-card);border-radius:6px;margin-bottom:6px;border:1px solid var(--border);${borderStyle}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:14px">${COMBAT_JOB_NAMES[job]}</span>
            ${isCurrent ? '<span style="color:var(--success);font-size:12px">현재 직업</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${COMBAT_JOB_DESC[job]}</div>
          <div style="font-size:11px;color:#6ba3d6;margin-top:2px">동일 직업 스킬: 위력 +20%, 등장 확률 +15%</div>
          ${!isCurrent ? `<button class="btn" data-set-job="${job}" style="margin-top:6px;font-size:12px;padding:4px 12px">${COMBAT_JOB_NAMES[job]} 선택</button>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div style="margin-bottom:8px">
        <div style="padding:8px 12px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border)">
          <span style="font-size:12px;color:var(--text-dim)">현재 전투 직업:</span>
          <span style="font-weight:600;margin-left:4px">${COMBAT_JOB_NAMES[currentJob] || '없음'}</span>
          ${currentJob ? `<button class="btn" data-set-job="" style="margin-left:8px;font-size:11px;padding:2px 8px">해제</button>` : ''}
        </div>
      </div>
      ${jobCards}
    `;
  }

  function renderSkillTab(): string {
    const lines = buildSkillLines();
    if (lines.length === 0) return '<p class="hint">이 장소에서 학습 가능한 스킬이 없습니다.</p>';

    return lines.map((line, li) => {
      const currentTier = getPlayerCurrentTier(line);
      const next = getNextTier(line);

      const tierDisplay = line.tiers.map((t, ti) => {
        const owned = ti < currentTier;
        const isNext = ti === currentTier;
        const color = owned ? 'var(--success)' : isNext ? 'var(--warning)' : 'var(--text-dim)';
        const jobTag = t.jobAffinity ? ` <span style="font-size:10px;color:#6ba3d6">[${COMBAT_JOB_NAMES[t.jobAffinity as CombatJob] ?? t.jobAffinity}]</span>` : '';
        return `<span style="color:${color};font-weight:${owned || isNext ? '600' : '400'}">${t.name}${jobTag}</span>`;
      }).join(' → ');

      let actionHtml = '';
      if (!next) {
        actionHtml = '<span style="color:var(--success);font-size:12px">최대 단계</span>';
      } else {
        const affordable = canAfford(next);
        const hyp = meetsHyperion(next);
        const costText = (next.learnCost ?? []).map(c => `${itemTypeName(parseItemType(c.item))} ${c.amount}개`).join(', ');
        const hypText = (next.learnMinHyperion ?? 0) > 0 ? `히페리온 ${next.learnMinHyperion}+` : '';
        const canBuy = affordable && hyp;

        actionHtml = `
          <div style="font-size:12px;margin-top:4px">
            <span style="color:${affordable ? 'var(--text-dim)' : 'var(--accent)'}">${costText}</span>
            ${hypText ? `<span style="color:${hyp ? 'var(--text-dim)' : 'var(--accent)'}"> · ${hypText}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${next.description}</div>
          <button class="btn${canBuy ? ' btn-primary' : ''}" data-buy="${li}" ${canBuy ? '' : 'disabled'} style="margin-top:6px;font-size:12px;padding:4px 12px">
            ${canBuy ? `${next.name} 습득` : '조건 부족'}
          </button>
        `;
      }

      return `
        <div style="padding:10px 12px;background:var(--bg-card);border-radius:6px;margin-bottom:8px">
          <div style="font-size:13px">${tierDisplay}</div>
          ${actionHtml}
        </div>
      `;
    }).join('');
  }

  return {
    id: 'skill_shop',
    render(el) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>마법학교 루나</h2>
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="btn${tab === 'job' ? ' active' : ''}" data-tab="job">전투 직업</button>
          <button class="btn${tab === 'skill' ? ' active' : ''}" data-tab="skill">스킬 학습</button>
        </div>
        <div style="overflow-y:auto;flex:1">
          ${tab === 'job' ? renderJobTab() : renderSkillTab()}
        </div>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      wrap.querySelector('[data-tab="job"]')?.addEventListener('click', () => { tab = 'job'; this.render(el); });
      wrap.querySelector('[data-tab="skill"]')?.addEventListener('click', () => { tab = 'skill'; this.render(el); });

      // 직업 설정
      wrap.querySelectorAll<HTMLButtonElement>('[data-set-job]').forEach(btn => {
        btn.addEventListener('click', () => {
          const job = btn.dataset.setJob!;
          p.combatJob = job;
          if (job) {
            session.backlog.add(session.gameTime, `전투 직업을 ${COMBAT_JOB_NAMES[job as CombatJob]}(으)로 설정했다.`, '행동');
          } else {
            session.backlog.add(session.gameTime, '전투 직업을 해제했다.', '행동');
          }
          this.render(el);
        });
      });

      // 스킬 구매
      wrap.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const li = parseInt(btn.dataset.buy!, 10);
          const lines = buildSkillLines();
          const line = lines[li];
          if (!line) return;
          const next = getNextTier(line);
          if (next && purchaseSkill(next)) this.render(el);
        });
      });

      el.appendChild(wrap);
    },
    onKey(key) {
      if (key === 'Escape') onDone();
      if (key === '1') { tab = 'job'; }
      if (key === '2') { tab = 'skill'; }
    },
  };
}
