// dialogue.ts — NPC 대화 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { isActorVisibleToPlayer } from '../../systems/actor-visibility';
import type { Actor } from '../../models/actor';
import { raceName, spiritRoleName } from '../../types/enums';
import { getRelationshipOverall } from '../../models/social';
import { getDialogue, getContinueDialogue, tryRecruitCompanion, getRelationshipStage, getRelationshipStageLabel } from '../../systems/npc-interaction';
import { triggerNpcQuestEvent } from '../../data/npc-quest-defs';
import { createNpcList } from '../components/npc-list';

type DialogueAction = 'continue' | 'recruit' | 'info';

interface DialogueCallbacks {
  onTalk: (npcName: string) => void;
  onRecruit: (npcName: string) => void;
  onInfo: (npcName: string, npcActor: Actor) => void;
  onBack: () => void;
}

/** 한 대화 행동당 최대 대사 줄 수 (첫 대사 1 + 계속 3) */
const MAX_DIALOGUE_LINES = 4;

export function createDialogueScreen(
  session: GameSession,
  callbacks: DialogueCallbacks,
): Screen {
  const p = session.player;
  const npcsHere = session.actors.filter(
    a => a !== p && a.isAlive() && !a.base.sleeping &&
    isActorVisibleToPlayer(session, a) &&
    (a.currentLocation === p.currentLocation || session.knowledge.isCompanion(a.name)),
  );

  let selectedIdx = -1;
  let dialogueLines: string[] = [];
  let actionMessage = '';

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

    const npcEntries = npcsHere.map(a => {
      const known = session.knowledge.isKnown(a.name);
      return {
        name: known ? a.name : '???',
        race: known ? raceName(a.base.race) : '???',
        role: known ? spiritRoleName(a.spirit.role) : '',
      };
    });

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

    if (dialogueLines.length === 0) {
      // 대화하면 이름을 알게 됨
      session.knowledge.addKnownName(npc.name);
      session.knowledge.trackConversation(npc.name);
      triggerNpcQuestEvent(session.knowledge, { type: 'talk', npcName: npc.name });
      if (npc.name === '베텔게우스' && !session.knowledge.hasTitle('대지의 목격자')) {
        session.knowledge.addTitle('대지의 목격자');
        session.backlog.add(session.gameTime, '칭호 "대지의 목격자"를 획득했다.', '시스템', p.name);
      }
      const isCompanion = session.knowledge.isCompanion(npc.name);
      const effectiveStage = isCompanion ? 'companion' as const : getRelationshipStage(p, npc.name, session.knowledge, session.actors);
      const line = getDialogue(npc, effectiveStage);
      dialogueLines = [
        `\u300c${line}\u300d`,
      ];
      session.backlog.add(session.gameTime, `${p.name}\uc774(\uac00) ${npc.name}\uc640(\uacfc) \ub300\ud654\ud588\ub2e4.`, '\ud589\ub3d9', p.name);
      session.backlog.add(session.gameTime, `${npc.name}: \u300c${line}\u300d`, '\ub300\uc0ac', p.name);
      callbacks.onTalk(npc.name);
    }

    const rel = p.relationships.get(npc.name);
    const overall = rel ? getRelationshipOverall(rel) : 0;
    const stage = session.knowledge.isCompanion(npc.name)
      ? 'companion' as const
      : getRelationshipStage(p, npc.name, session.knowledge, session.actors);
    const stageLabel = getRelationshipStageLabel(stage);

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dialogue-screen';

    // NPC header
    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <div class="dialogue-header">
        <h2>${npc.name}</h2>
        <span class="dialogue-npc-info">${raceName(npc.base.race)} / ${spiritRoleName(npc.spirit.role)}</span>
        <span class="dialogue-affinity">${stageLabel} (${overall.toFixed(2)})</span>
      </div>
      ${actionMessage ? `<div class="trade-message">${actionMessage}</div>` : ''}
      <div class="dialogue-box">
        ${[...dialogueLines].reverse().map(l => `<div class="dialogue-line">${l}</div>`).join('')}
      </div>
      <div class="button-grid dialogue-actions">
        <button class="btn action-button" data-daction="continue" ${dialogueLines.length >= MAX_DIALOGUE_LINES ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
          <span class="action-label">\ub300\ud654 \uacc4\uc18d</span>
          <span class="key-hint">[1]</span>
        </button>
        ${!session.knowledge.isCompanion(npc.name) ? `<button class="btn action-button" data-daction="recruit">
          <span class="action-label">동료 영입</span>
          <span class="key-hint">[2]</span>
        </button>` : ''}
        <button class="btn action-button" data-daction="info">
          <span class="action-label">\uc815\ubcf4</span>
          <span class="key-hint">[3]</span>
        </button>
      </div>
      <p class="hint">${dialogueLines.length >= MAX_DIALOGUE_LINES ? '충분히 대화를 나눈 것 같다.' : '1=대화 2=영입 3=정보 Esc=뒤로'}</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      selectedIdx = -1;
      dialogueLines = [];
      actionMessage = '';
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
      case 'continue': {
        actionMessage = '';
        const npcAct = npcsHere[selectedIdx];
        if (npcAct) {
          const isComp = session.knowledge.isCompanion(npcName);
          const curStage = isComp ? 'companion' as const : getRelationshipStage(p, npcName, session.knowledge, session.actors);
          const contLine = getContinueDialogue(npcAct, curStage);
          dialogueLines.push(`\u300c${contLine}\u300d`);
          session.backlog.add(session.gameTime, `${npcName}: \u300c${contLine}\u300d`, '\ub300\uc0ac', p.name);
        }
        p.adjustRelationship(npcName, 0.02, 0.01);
        renderDialogue(el);
        break;
      }
      case 'recruit': {
        const npcActor = npcsHere[selectedIdx];
        if (npcActor) {
          const result = tryRecruitCompanion(p, npcActor, session.knowledge, session.backlog, session.gameTime, session.actors);
          if (result.success) {
            actionMessage = '';
            callbacks.onRecruit(npcName);
          } else if (result.messages.length > 0) {
            actionMessage = result.messages[0];
            renderDialogue(el);
          }
        }
        break;
      }
      case 'info': {
        actionMessage = '';
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
          actionMessage = '';
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
            actionMessage = '';
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
