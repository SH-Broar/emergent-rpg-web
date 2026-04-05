// quest-board.ts — 퀘스트 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { QuestStatus } from '../../models/social';

type QuestTab = 'available' | 'active' | 'completed';

export function createQuestBoardScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let tab: QuestTab = 'available';
  let message = '';

  function getQuestsByTab() {
    const all = session.social.getAllQuests();
    switch (tab) {
      case 'available':
        return all.filter(q => q.status === QuestStatus.Posted);
      case 'active':
        return all.filter(q => q.status === QuestStatus.Accepted && q.acceptedBy === p.name);
      case 'completed':
        return all.filter(q =>
          q.status === QuestStatus.Completed || q.status === QuestStatus.Failed || q.status === QuestStatus.Expired,
        );
    }
  }

  function statusLabel(status: QuestStatus): string {
    switch (status) {
      case QuestStatus.Posted: return '\uc218\ub77d \uac00\ub2a5';
      case QuestStatus.Accepted: return '\uc9c4\ud589 \uc911';
      case QuestStatus.Completed: return '\uc644\ub8cc';
      case QuestStatus.Failed: return '\uc2e4\ud328';
      case QuestStatus.Expired: return '\ub9cc\ub8cc';
    }
  }

  function renderBoard(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen quest-screen';

    const quests = getQuestsByTab();
    const tabLabels: Record<QuestTab, string> = {
      available: '\uc218\ub77d \uac00\ub2a5',
      active: '\uc9c4\ud589 \uc911',
      completed: '\uc644\ub8cc',
    };

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>퀘스트 \uac8c\uc2dc\ud310</h2>
      <div class="trade-tabs">
        ${(['available', 'active', 'completed'] as QuestTab[]).map(t =>
          `<button class="btn ${t === tab ? 'active' : ''}" data-tab="${t}">${tabLabels[t]}</button>`
        ).join('')}
      </div>
      ${message ? `<div class="trade-message">${message}</div>` : ''}
    `;

    if (quests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '퀘스트\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.';
      wrap.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'quest-list';

      quests.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn quest-item';
        btn.dataset.idx = String(i);
        btn.innerHTML = `
          <div class="quest-header">
            <span class="quest-num">${i + 1}.</span>
            <span class="quest-title">${q.title}</span>
            <span class="quest-status">${statusLabel(q.status)}</span>
          </div>
          <div class="quest-desc">${q.description}</div>
          <div class="quest-reward">\ubcf4\uc0c1: ${q.rewardGold}G${q.rewardReputation > 0 ? ` / \ud3c9\ud310+${q.rewardReputation}` : ''}</div>
          ${q.status === QuestStatus.Accepted
            ? `<div class="quest-progress">\uc9c4\ud589: ${q.currentAmount}/${q.targetAmount}</div>`
            : ''}
        `;
        btn.addEventListener('click', () => handleQuestAction(i, el));
        list.appendChild(btn);
      });

      wrap.appendChild(list);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tab=\ud0ed \uc804\ud658, 1~9 \uc120\ud0dd, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
    wrap.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab as QuestTab;
        message = '';
        renderBoard(el);
      });
    });

    el.appendChild(wrap);
  }

  function handleQuestAction(idx: number, el: HTMLElement) {
    const quests = getQuestsByTab();
    const quest = quests[idx];
    if (!quest) return;

    if (tab === 'available') {
      const accepted = session.social.acceptQuest(quest.id, p.name);
      if (accepted) {
        p.spirit.activeQuestId = quest.id;
        session.backlog.add(session.gameTime, `${p.name}\uc774(\uac00) 퀘스트 "${quest.title}"\uc744(\ub97c) \uc218\ub77d\ud588\ub2e4.`, '\ud589\ub3d9');
        message = `"${quest.title}" \uc218\ub77d!`;
      } else {
        message = '\uc218\ub77d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.';
      }
      renderBoard(el);
    }
  }

  return {
    id: 'quest-board',
    render: renderBoard,
    onKey(key) {
      const container = document.querySelector('.quest-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (key === 'Tab') {
        const tabs: QuestTab[] = ['available', 'active', 'completed'];
        const curIdx = tabs.indexOf(tab);
        tab = tabs[(curIdx + 1) % tabs.length];
        message = '';
        renderBoard(container);
        return;
      }
      if (/^[1-9]$/.test(key)) {
        handleQuestAction(parseInt(key, 10) - 1, container);
      }
    },
  };
}
