// party.ts — 동료 관리 화면
// 원본: PartyScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { raceName, spiritRoleName } from '../../types/enums';
import { PlayerKnowledge } from '../../models/knowledge';

export function createPartyScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  let message = '';

  function getPartyActors() {
    return session.knowledge.partyMembers
      .map(name => session.actors.find(a => a.name === name))
      .filter((a): a is NonNullable<typeof a> => a != null);
  }

  function renderParty(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen party-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = `\ub3d9\ub8cc \uad00\ub9ac (${session.knowledge.partyMembers.length}/${PlayerKnowledge.MAX_PARTY_SIZE})`;
    wrap.appendChild(title);

    if (message) {
      const msg = document.createElement('div');
      msg.className = 'trade-message';
      msg.textContent = message;
      wrap.appendChild(msg);
    }

    const members = getPartyActors();

    if (members.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '\ud604\uc7ac \ub3d9\ub8cc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4. NPC\uc640 \ub300\ud654\ud558\uc5ec \uc601\uc785\ud558\uc138\uc694.';
      wrap.appendChild(hint);
    } else {
      const list = document.createElement('div');
      list.className = 'npc-list';
      members.forEach((a, i) => {
        const item = document.createElement('div');
        item.className = 'npc-item';
        item.style.flexWrap = 'wrap';
        item.innerHTML = `
          <span class="npc-num">${i + 1}.</span>
          <span class="npc-name">${a.name}</span>
          <span class="npc-detail">${raceName(a.base.race)} \xb7 ${spiritRoleName(a.spirit.role)} \xb7 HP ${Math.round(a.base.hp)}/${Math.round(a.getEffectiveMaxHp())}</span>
        `;

        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'btn';
        dismissBtn.style.marginLeft = 'auto';
        dismissBtn.style.fontSize = '12px';
        dismissBtn.style.padding = '4px 8px';
        dismissBtn.style.minHeight = '32px';
        dismissBtn.textContent = '\ud574\uc81c';
        dismissBtn.dataset.dismiss = a.name;
        dismissBtn.addEventListener('click', () => dismissMember(a.name, el));
        item.appendChild(dismissBtn);

        list.appendChild(item);
      });
      wrap.appendChild(list);
    }

    // Total recruited ever
    const totalInfo = document.createElement('p');
    totalInfo.style.marginTop = '12px';
    totalInfo.style.fontSize = '13px';
    totalInfo.style.color = 'var(--text-dim)';
    totalInfo.textContent = `\ucd1d \uc601\uc785 \uacbd\ud5d8: ${session.knowledge.recruitedEver.size}\uba85`;
    wrap.appendChild(totalInfo);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  function dismissMember(name: string, el: HTMLElement): void {
    if (session.knowledge.dismissCompanion(name)) {
      session.backlog.add(
        session.gameTime,
        `${name}\uc774(\uac00) \ub3d9\ub8cc\uc5d0\uc11c \ud574\uc81c\ub418\uc5c8\ub2e4.`,
        '\ud589\ub3d9',
      );
      message = `${name}\uc744(\ub97c) \ub3d9\ub8cc\uc5d0\uc11c \ud574\uc81c\ud588\uc2b5\ub2c8\ub2e4.`;
    }
    renderParty(el);
  }

  return {
    id: 'party',
    render: renderParty,
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
