// dialogue.ts — NPC 대화 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { Actor } from '../../models/actor';
import { raceName, spiritRoleName } from '../../types/enums';
import { getRelationshipOverall } from '../../models/social';
import { getDialogue } from '../../systems/npc-interaction';
import { createNpcList } from '../components/npc-list';

type DialogueAction = 'continue' | 'recruit' | 'info';

interface DialogueCallbacks {
  onTalk: (npcName: string) => void;
  onRecruit: (npcName: string) => void;
  onInfo: (npcName: string, npcActor: Actor) => void;
  onBack: () => void;
}

export function createDialogueScreen(
  session: GameSession,
  callbacks: DialogueCallbacks,
): Screen {
  const p = session.player;
  const npcsHere = session.actors.filter(
    a => a !== p && a.currentLocation === p.currentLocation && a.isAlive(),
  );

  let selectedIdx = -1;
  let dialogueLines: string[] = [];

  function renderNpcSelect(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.addEventListener('click', callbacks.onBack);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\ub300\ud654 \uc0c1\ub300 \uc120\ud0dd';
    wrap.appendChild(title);

    const npcEntries = npcsHere.map(a => ({
      name: a.name,
      race: raceName(a.base.race),
      role: spiritRoleName(a.spirit.role),
    }));

    const list = createNpcList(npcEntries, (idx) => {
      selectedIdx = idx;
      renderDialogue(el);
    });
    wrap.appendChild(list);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~9 \uc120\ud0dd, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  function renderDialogue(el: HTMLElement) {
    const npc = npcsHere[selectedIdx];
    if (!npc) { renderNpcSelect(el); return; }

    const rel = p.relationships.get(npc.name);
    const overall = rel ? getRelationshipOverall(rel) : 0;
    const affinityLabel = overall >= 0.5 ? '\u2665 \uce5c\ubc00' :
      overall >= 0 ? '\u25cb \ubcf4\ud1b5' : '\u25cb \ub0ae\uc74c';

    if (dialogueLines.length === 0) {
      const line = getDialogue(npc);
      dialogueLines = [
        `\u300c${line}\u300d`,
      ];
      session.backlog.add(
        session.gameTime,
        `${p.name}\uc774(\uac00) ${npc.name}\uc640(\uacfc) \ub300\ud654\ud588\ub2e4.`,
        '\ud589\ub3d9',
      );
      callbacks.onTalk(npc.name);
    }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dialogue-screen';

    // NPC header
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <div class="dialogue-header">
        <h2>${npc.name}</h2>
        <span class="dialogue-npc-info">${raceName(npc.base.race)} / ${spiritRoleName(npc.spirit.role)}</span>
        <span class="dialogue-affinity">${affinityLabel} (${overall.toFixed(2)})</span>
      </div>
      <div class="dialogue-box">
        ${dialogueLines.map(l => `<div class="dialogue-line">${l}</div>`).join('')}
      </div>
      <div class="button-grid dialogue-actions">
        <button class="btn action-button" data-daction="continue">
          <span class="action-label">\ub300\ud654 \uacc4\uc18d</span>
          <span class="key-hint">[1]</span>
        </button>
        <button class="btn action-button" data-daction="recruit">
          <span class="action-label">\ub3d9\ub8cc \uc601\uc785</span>
          <span class="key-hint">[2]</span>
        </button>
        <button class="btn action-button" data-daction="info">
          <span class="action-label">\uc815\ubcf4</span>
          <span class="key-hint">[3]</span>
        </button>
      </div>
      <p class="hint">1=\ub300\ud654 2=\uc601\uc785 3=\uc815\ubcf4 Esc=\ub4a4\ub85c</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      selectedIdx = -1;
      dialogueLines = [];
      renderNpcSelect(el);
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-daction]').forEach(btn => {
      btn.addEventListener('click', () => {
        handleDialogueAction(btn.dataset.daction as DialogueAction, npc.name, el);
      });
    });

    el.appendChild(wrap);
  }

  function handleDialogueAction(action: DialogueAction, npcName: string, el: HTMLElement) {
    switch (action) {
      case 'continue':
        dialogueLines.push(`\u300c...\ub610 \ubb34\uc2a8 \uc774\uc57c\uae30\ub97c \ud560\uae4c?\u300d`);
        p.adjustRelationship(npcName, 0.02, 0.01);
        renderDialogue(el);
        break;
      case 'recruit':
        callbacks.onRecruit(npcName);
        break;
      case 'info': {
        const npcActor = npcsHere[selectedIdx];
        if (npcActor) callbacks.onInfo(npcName, npcActor);
        break;
      }
    }
  }

  return {
    id: 'dialogue',
    render(el) {
      if (selectedIdx >= 0) renderDialogue(el);
      else renderNpcSelect(el);
    },
    onKey(key) {
      const container = document.querySelector('.dialogue-screen')?.parentElement
        ?? document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (selectedIdx >= 0) {
          selectedIdx = -1;
          dialogueLines = [];
          renderNpcSelect(container);
        } else {
          callbacks.onBack();
        }
        return;
      }

      if (selectedIdx < 0) {
        // NPC 선택 모드
        if (/^[1-9]$/.test(key)) {
          const idx = parseInt(key, 10) - 1;
          if (idx < npcsHere.length) {
            selectedIdx = idx;
            renderDialogue(container);
          }
        }
      } else {
        // 대화 모드
        const npc = npcsHere[selectedIdx];
        if (!npc) return;
        if (key === '1') handleDialogueAction('continue', npc.name, container);
        else if (key === '2') handleDialogueAction('recruit', npc.name, container);
        else if (key === '3') handleDialogueAction('info', npc.name, container);
      }
    },
  };
}
