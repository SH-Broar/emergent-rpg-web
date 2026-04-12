// life-job.ts — 생활 직업 화면
// 현재 직업 + 스킬 사용 + 승단 조건 + 직업 변경 + 신규 습득

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ALL_LIFE_JOBS, LIFE_JOB_NAMES } from '../../types/enums';
import type { LifeJob } from '../../types/enums';
import { getLifeJobDef, getAvailableSkills } from '../../data/life-job-defs';
import {
  canLearnJob, learnJob, equipJob, promoteJob,
  useLifeJobSkill, getMissionProgress,
} from '../../systems/life-job-system';

export function createLifeJobScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';
  let messageType: 'success' | 'error' | 'info' = 'info';
  let subView: 'main' | 'list' | 'learn' = 'main';

  function showMessage(msgs: string[], type: 'success' | 'error' | 'info' = 'success'): void {
    message = msgs.join(' ');
    messageType = type;
  }

  function renderMain(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const jobId = (p.lifeJob || '') as LifeJob;
    const jobLv = jobId ? (p.lifeJobLevels.get(jobId) ?? 0) : 0;
    const def = jobId ? getLifeJobDef(jobId) : undefined;

    // 메시지 배너
    const msgHtml = message
      ? `<div style="padding:6px 10px;margin-bottom:8px;border-radius:4px;font-size:12px;background:${messageType === 'error' ? 'var(--danger-bg,#3a1111)' : messageType === 'success' ? 'var(--success-bg,#0f3a0f)' : 'var(--bg-card)'};color:${messageType === 'error' ? 'var(--danger,#ff6b6b)' : 'var(--success,#6bff6b)'}">${message}</div>`
      : '';

    // 현재 직업 카드
    let currentJobHtml: string;
    if (def && jobLv > 0) {
      const skills = getAvailableSkills(jobId, jobLv);
      const skillsHtml = skills.map((skill, i) => {
        const isAction = skill.type === 'action';
        const cdLabel = skill.cooldown === 'daily' ? ' (일 1회)' : skill.cooldown === 'weekly' ? ' (주 1회)' : '';
        const tpLabel = skill.tpCost > 0 ? `TP ${skill.tpCost}` : '패시브';
        const useBtn = isAction
          ? `<button class="btn" data-use-skill="${i}" style="margin-top:4px;font-size:11px;padding:3px 10px">사용${cdLabel}</button>`
          : `<span style="font-size:11px;color:var(--text-dim)">자동 적용${cdLabel}</span>`;

        return `
          <div style="padding:8px 10px;background:var(--bg-card);border-radius:4px;margin-bottom:4px;border-left:3px solid ${isAction ? 'var(--accent,#4a9eff)' : 'var(--success,#6bff6b)'}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:13px">Lv.${i + 1} ${skill.name}</span>
              <span style="font-size:11px;color:var(--text-dim)">${tpLabel}</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px">${skill.description}</div>
            <div style="margin-top:4px">${useBtn}</div>
          </div>`;
      }).join('');

      // 승단 조건
      let missionHtml = '';
      if (jobLv < 3) {
        const missionIdx = jobLv - 1; // Lv1→Lv2 = 0, Lv2→Lv3 = 1
        const mission = def.missions[missionIdx];
        const allMet = mission.conditions.every(c => getMissionProgress(session, c.key) >= c.target);

        const condHtml = mission.conditions.map(c => {
          const cur = getMissionProgress(session, c.key);
          const met = cur >= c.target;
          const icon = met ? '■' : '□';
          const color = met ? 'var(--success,#6bff6b)' : 'var(--text-dim)';
          return `<div style="font-size:12px;color:${color}">${icon} ${c.label} (${Math.min(cur, c.target)}/${c.target})</div>`;
        }).join('');

        const promoteBtn = allMet
          ? `<button class="btn" data-promote="${jobId}" style="margin-top:6px;font-size:12px;padding:4px 12px;background:var(--success-bg,#0f3a0f);border-color:var(--success,#6bff6b)">Lv.${jobLv + 1} 승단하기</button>`
          : '';

        missionHtml = `
          <div style="margin-top:10px;padding:8px 10px;background:var(--bg-card);border-radius:4px;border:1px solid var(--border)">
            <div style="font-weight:600;font-size:13px;margin-bottom:6px">Lv.${jobLv + 1} 승단 조건</div>
            ${condHtml}
            ${promoteBtn}
          </div>`;
      } else {
        missionHtml = `<div style="margin-top:10px;padding:8px 10px;background:var(--bg-card);border-radius:4px;text-align:center;color:var(--success,#6bff6b);font-size:12px">최고 레벨 달성!</div>`;
      }

      currentJobHtml = `
        <div style="padding:10px 12px;background:var(--bg-card);border-radius:6px;border:1px solid var(--success,#6bff6b);margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-weight:700;font-size:15px">${LIFE_JOB_NAMES[jobId]} Lv.${jobLv}</span>
            <span style="font-size:11px;color:var(--text-dim)">${def.concept}</span>
          </div>
          ${skillsHtml}
          ${missionHtml}
        </div>`;
    } else {
      currentJobHtml = `
        <div style="padding:12px;background:var(--bg-card);border-radius:6px;border:1px dashed var(--border);margin-bottom:10px;text-align:center">
          <div style="color:var(--text-dim);font-size:13px">장착된 생활 직업이 없습니다.</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:4px">아래에서 직업을 선택하세요.</div>
        </div>`;
    }

    // 보유 직업 목록
    const learnedJobs = ALL_LIFE_JOBS.filter(j => p.lifeJobLevels.has(j));
    const learnedHtml = learnedJobs.length > 0
      ? learnedJobs.map(j => {
        const jLv = p.lifeJobLevels.get(j) ?? 1;
        const isCurrent = j === jobId;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg-card);border-radius:4px;margin-bottom:3px;${isCurrent ? 'border-left:3px solid var(--success,#6bff6b)' : ''}">
            <span style="font-size:13px">${LIFE_JOB_NAMES[j as LifeJob]} Lv.${jLv}${isCurrent ? ' (현재)' : ''}</span>
            ${!isCurrent ? `<button class="btn" data-equip="${j}" style="font-size:11px;padding:2px 8px">전환</button>` : ''}
          </div>`;
      }).join('')
      : '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:8px">배운 직업이 없습니다.</div>';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back style="min-height:44px">← 뒤로 [Esc]</button>
      <h2>생활 직업</h2>
      ${msgHtml}
      ${currentJobHtml}
      <div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:600;font-size:14px">보유 직업</span>
          ${jobId ? `<button class="btn" data-equip="" style="font-size:11px;padding:2px 8px">직업 해제</button>` : ''}
        </div>
        ${learnedHtml}
      </div>
      <div style="margin-top:8px">
        <button class="btn" data-show-learn style="width:100%;font-size:13px;padding:6px 0">새 직업 배우기</button>
      </div>
    `;

    // 이벤트 바인딩
    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);

    wrap.querySelectorAll<HTMLButtonElement>('[data-use-skill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.useSkill!, 10);
        const msgs = useLifeJobSkill(session, idx);
        showMessage(msgs, msgs[0]?.includes('부족') || msgs[0]?.includes('이미') || msgs[0]?.includes('없습니다') ? 'error' : 'success');
        renderMain(el);
      });
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgs = equipJob(session, btn.dataset.equip!);
        showMessage(msgs);
        renderMain(el);
      });
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-promote]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgs = promoteJob(session, btn.dataset.promote!);
        showMessage(msgs, msgs[0]?.includes('못했') ? 'error' : 'success');
        renderMain(el);
      });
    });

    wrap.querySelector('[data-show-learn]')?.addEventListener('click', () => {
      subView = 'learn';
      message = '';
      renderLearn(el);
    });

    el.appendChild(wrap);
  }

  function renderLearn(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const msgHtml = message
      ? `<div style="padding:6px 10px;margin-bottom:8px;border-radius:4px;font-size:12px;background:${messageType === 'error' ? 'var(--danger-bg,#3a1111)' : 'var(--success-bg,#0f3a0f)'};color:${messageType === 'error' ? 'var(--danger,#ff6b6b)' : 'var(--success,#6bff6b)'}">${message}</div>`
      : '';

    const jobCards = ALL_LIFE_JOBS.map((job, i) => {
      const def = getLifeJobDef(job)!;
      const learned = p.lifeJobLevels.has(job);
      const available = canLearnJob(session, job);
      const lv = p.lifeJobLevels.get(job) ?? 0;

      let statusLabel: string;
      let actionBtn = '';

      if (learned) {
        statusLabel = `<span style="color:var(--success,#6bff6b);font-size:11px">습득 완료 Lv.${lv}</span>`;
      } else if (available) {
        statusLabel = `<span style="color:var(--accent,#4a9eff);font-size:11px">습득 가능!</span>`;
        actionBtn = `<button class="btn" data-learn="${job}" style="margin-top:4px;font-size:11px;padding:3px 10px">배우기</button>`;
      } else {
        const locReq = def.acquisitionLocation
          ? `장소: ${def.acquisitionLocation}`
          : '어디서든';
        statusLabel = `<span style="color:var(--text-dim);font-size:11px">${locReq}</span>`;
      }

      return `
        <div style="padding:8px 10px;background:var(--bg-card);border-radius:4px;margin-bottom:4px;border:1px solid var(--border);${learned ? 'opacity:0.6' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:13px">${i + 1}. ${LIFE_JOB_NAMES[job as LifeJob]}</span>
            ${statusLabel}
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${def.concept}</div>
          ${def.acquisitionNpc ? `<div style="font-size:11px;color:var(--text-dim)">취득 NPC: ${def.acquisitionNpc}</div>` : ''}
          ${actionBtn}
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <button class="btn back-btn" data-back-to-main style="min-height:44px">← 뒤로</button>
      <h2>새 직업 배우기</h2>
      <p class="hint" style="margin-bottom:8px;font-size:12px">해당 장소를 방문하면 새 직업을 배울 수 있습니다.</p>
      ${msgHtml}
      <div style="overflow-y:auto;flex:1">
        ${jobCards}
      </div>
    `;

    wrap.querySelector('[data-back-to-main]')?.addEventListener('click', () => {
      subView = 'main';
      message = '';
      renderMain(el);
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-learn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgs = learnJob(session, btn.dataset.learn!);
        showMessage(msgs, msgs[0]?.includes('알 수 없') || msgs[0]?.includes('이미') ? 'error' : 'success');
        subView = 'main';
        renderMain(el);
      });
    });

    el.appendChild(wrap);
  }

  return {
    id: 'life_job',
    render(el) {
      if (subView === 'learn') renderLearn(el);
      else renderMain(el);
    },
    onKey(key) {
      if (key === 'Escape') {
        if (subView === 'learn') {
          subView = 'main';
          message = '';
          const container = document.querySelector('.info-screen')?.parentElement;
          if (container instanceof HTMLElement) renderMain(container);
        } else {
          onDone();
        }
      }
    },
  };
}
