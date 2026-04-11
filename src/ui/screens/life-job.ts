// life-job.ts — 하나브릿지 신전: 생활 직업 설정

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ALL_LIFE_JOBS, LIFE_JOB_NAMES, LIFE_JOB_DESC } from '../../types/enums';
import type { LifeJob } from '../../types/enums';

export function createLifeJobScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;

  return {
    id: 'life_job',
    render(el) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';

      const currentJob = (p.lifeJob || '') as LifeJob;

      const jobCards = ALL_LIFE_JOBS.map((job, i) => {
        const isCurrent = currentJob === job;
        const borderStyle = isCurrent ? 'border-color:var(--success)' : '';
        return `
          <div style="padding:10px 12px;background:var(--bg-card);border-radius:6px;margin-bottom:6px;border:1px solid var(--border);${borderStyle}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:600;font-size:14px">${i + 1}. ${LIFE_JOB_NAMES[job]}</span>
              ${isCurrent ? '<span style="color:var(--success);font-size:12px">현재 직업</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${LIFE_JOB_DESC[job]}</div>
            ${!isCurrent ? `<button class="btn" data-set-job="${job}" style="margin-top:6px;font-size:12px;padding:4px 12px">${LIFE_JOB_NAMES[job]} 선택</button>` : ''}
          </div>
        `;
      }).join('');

      wrap.innerHTML = `
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>하나브릿지 신전 — 생활 직업</h2>
        <p class="hint" style="margin-bottom:12px">생활 직업을 선택하면 고유한 능력을 사용할 수 있습니다. 동료가 가진 직업의 기능은 대화에서 접근할 수 있습니다.</p>
        <div style="margin-bottom:8px">
          <div style="padding:8px 12px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border)">
            <span style="font-size:12px;color:var(--text-dim)">현재 생활 직업:</span>
            <span style="font-weight:600;margin-left:4px">${LIFE_JOB_NAMES[currentJob] || '없음'}</span>
            ${currentJob ? `<button class="btn" data-set-job="" style="margin-left:8px;font-size:11px;padding:2px 8px">해제</button>` : ''}
          </div>
        </div>
        <div style="overflow-y:auto;flex:1">
          ${jobCards}
        </div>
      `;

      wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
      wrap.querySelectorAll<HTMLButtonElement>('[data-set-job]').forEach(btn => {
        btn.addEventListener('click', () => {
          const job = btn.dataset.setJob!;
          p.lifeJob = job;
          if (job) {
            session.backlog.add(session.gameTime, `생활 직업을 ${LIFE_JOB_NAMES[job as LifeJob]}(으)로 설정했다.`, '행동');
          } else {
            session.backlog.add(session.gameTime, '생활 직업을 해제했다.', '행동');
          }
          this.render(el);
        });
      });

      el.appendChild(wrap);
    },
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
