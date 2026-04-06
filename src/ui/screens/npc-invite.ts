// npc-invite.ts — NPC 거점 초대 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';

export function createNpcInviteScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const loc = p.currentLocation;
  let message = '';

  function renderInvite(el: HTMLElement) {
    const invited = session.knowledge.getBaseNpcs(loc);
    const companions = session.knowledge.partyMembers;
    // Companions not already invited here
    const available = companions.filter(name => !invited.includes(name));

    el.innerHTML = `
      <div class="screen info-screen npc-invite-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🏡 NPC 초대</h2>
        ${message ? `<div class="trade-message">${message}</div>` : ''}

        ${invited.length > 0 ? `
          <div style="margin-bottom:12px">
            <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">이 거점에 초대된 NPC</div>
            ${invited.map(name => `
              <div class="inv-item" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px">
                <span>${name}</span>
                <button class="btn" data-dismiss="${name}" style="font-size:11px;padding:2px 8px">해제</button>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:var(--text-dim);font-size:13px">초대된 NPC가 없습니다.</p>'}

        ${available.length > 0 ? `
          <div>
            <div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">초대 가능한 동료</div>
            <div class="menu-buttons">
              ${available.map((name, i) => `
                <button class="btn" data-invite="${name}">${i + 1}. ${name} 초대</button>
              `).join('')}
            </div>
          </div>
        ` : companions.length === 0
          ? '<p style="color:var(--text-dim);font-size:13px">동료가 없습니다.</p>'
          : '<p style="color:var(--text-dim);font-size:13px">모든 동료가 이미 초대되어 있습니다.</p>'
        }
        <p class="hint">1~9 초대, Esc 뒤로</p>
      </div>`;

    el.querySelector('[data-back]')?.addEventListener('click', onDone);

    el.querySelectorAll<HTMLButtonElement>('[data-invite]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.invite!;
        session.knowledge.inviteNpcToBase(loc, name);
        session.backlog.add(session.gameTime, `${name}을(를) 거점에 초대했다.`, '행동');
        message = `${name}을(를) 초대했습니다!`;
        renderInvite(el);
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.dismiss!;
        const list = session.knowledge.getBaseNpcs(loc).filter(n => n !== name);
        session.knowledge.baseInvitedNpcs.set(loc, list);
        session.backlog.add(session.gameTime, `${name}의 초대를 해제했다.`, '행동');
        message = `${name}의 초대를 해제했습니다.`;
        renderInvite(el);
      });
    });
  }

  return {
    id: 'npc-invite',
    render: renderInvite,
    onKey(key) {
      const c = document.querySelector('.npc-invite-screen')?.parentElement;
      if (!(c instanceof HTMLElement)) return;
      if (key === 'Escape') { onDone(); return; }
      if (/^[1-9]$/.test(key)) {
        const invited = session.knowledge.getBaseNpcs(loc);
        const available = session.knowledge.partyMembers.filter(name => !invited.includes(name));
        const idx = parseInt(key, 10) - 1;
        if (idx < available.length) {
          const name = available[idx];
          session.knowledge.inviteNpcToBase(loc, name);
          session.backlog.add(session.gameTime, `${name}을(를) 거점에 초대했다.`, '행동');
          message = `${name}을(를) 초대했습니다!`;
          renderInvite(c);
        }
      }
    },
  };
}
