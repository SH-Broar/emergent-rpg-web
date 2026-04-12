// quest-board.ts — 퀘스트 화면 (길드 퀘스트 + NPC 개인 퀘스트)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { QuestStatus } from '../../models/social';
import { getAllNpcQuestNpcs, getNpcQuestsForNpc, getNpcQuestDef } from '../../data/npc-quest-defs';
import { getRelationshipOverall } from '../../models/social';
import type { NpcQuestDef } from '../../models/npc-quest';

type QuestTab = 'available' | 'active' | 'completed' | 'npc';

export function createQuestBoardScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const k = session.knowledge;
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
      default:
        return [];
    }
  }

  function statusLabel(status: QuestStatus): string {
    switch (status) {
      case QuestStatus.Posted: return '수락 가능';
      case QuestStatus.Accepted: return '진행 중';
      case QuestStatus.Completed: return '완료';
      case QuestStatus.Failed: return '실패';
      case QuestStatus.Expired: return '만료';
    }
  }

  /** NPC 퀘스트 탭용: 수락 가능한 퀘스트 목록 */
  function getAvailableNpcQuests(): NpcQuestDef[] {
    const result: NpcQuestDef[] = [];
    for (const npcName of getAllNpcQuestNpcs()) {
      // 이미 해당 NPC와 진행 중인 퀘스트가 있으면 건너뜀
      if (k.getActiveQuestForNpc(npcName)) continue;
      const rel = p.relationships.get(npcName);
      const overall = rel ? getRelationshipOverall(rel) : 0;
      const quests = getNpcQuestsForNpc(npcName);
      for (const def of quests) {
        if (k.isNpcQuestCompleted(def.id)) continue;
        if (overall < def.unlockRelationship) continue;
        // 이전 단계 퀘스트가 완료되었는지 확인
        if (def.stage > 1) {
          const prevId = def.npc + '_Q' + (def.stage - 1);
          if (!k.isNpcQuestCompleted(prevId)) continue;
        }
        result.push(def);
        break; // NPC당 하나만
      }
    }
    return result;
  }

  /** 진행 중인 NPC 퀘스트 목록 (gather 목표 실시간 체크 포함) */
  function getActiveNpcQuests() {
    const result: Array<{ def: NpcQuestDef; progressMet: boolean }> = [];
    for (const state of k.activeNpcQuests.values()) {
      if (!state.accepted || state.completed) continue;
      const def = getNpcQuestDef(state.questId);
      if (!def) continue;
      // gather 타입: 인벤토리 실시간 체크
      let progressMet = state.progressMet;
      if (!progressMet && def.objectiveType.type === 'gather') {
        const obj = def.objectiveType;
        const have = p.spirit.inventory.get(obj.itemKey as any) ?? 0;
        if (have >= obj.amount) {
          k.markNpcQuestProgress(state.questId);
          progressMet = true;
        }
      }
      // companion 타입: companionDaysMap 실시간 체크
      if (!progressMet && def.objectiveType.type === 'companion') {
        const obj = def.objectiveType;
        const days = k.companionDaysMap.get(obj.npcName) ?? 0;
        if (days >= obj.days) {
          k.markNpcQuestProgress(state.questId);
          progressMet = true;
        }
      }
      result.push({ def, progressMet });
    }
    return result;
  }

  /** 완료된 NPC 퀘스트 목록 */
  function getCompletedNpcQuestDefs(): NpcQuestDef[] {
    const result: NpcQuestDef[] = [];
    for (const id of k.completedNpcQuestIds) {
      const def = getNpcQuestDef(id);
      if (def) result.push(def);
    }
    return result;
  }

  function renderNpcTab(wrap: HTMLElement, el: HTMLElement) {
    const available = getAvailableNpcQuests();
    const active = getActiveNpcQuests();
    const completed = getCompletedNpcQuestDefs();

    let html = '';

    if (active.length > 0) {
      html += '<h3 style="font-size:13px;color:var(--warning);margin:8px 0 4px">진행 중</h3>';
      active.forEach(({ def, progressMet }) => {
        html += `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--bg-panel)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-weight:bold">${def.npc} — ${def.title}</span>
              <span style="font-size:11px;color:${progressMet ? 'var(--success)' : 'var(--text-dim)'}">
                ${progressMet ? '✓ 목표 달성' : '진행 중'}
              </span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">${def.objective}</div>
            <div style="font-size:11px;color:var(--text-dim)">보상: ${def.rewardGold > 0 ? def.rewardGold + 'G' : ''} 관계+${Math.round(def.rewardRelationship * 100)}</div>
            ${progressMet
              ? `<button class="btn" style="margin-top:6px;font-size:12px" data-npc-complete="${def.id}">완료 보고</button>`
              : ''}
          </div>`;
      });
    }

    if (available.length > 0) {
      html += '<h3 style="font-size:13px;color:var(--accent);margin:8px 0 4px">수락 가능</h3>';
      available.forEach((def) => {
        html += `
          <div style="border:1px solid var(--warning);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--bg-card)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-weight:bold">${def.npc} — ${def.title}</span>
              <span style="font-size:11px;color:var(--text-dim)">단계 ${def.stage}/3</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px;white-space:pre-line">${def.introText}</div>
            <div style="font-size:11px;color:var(--accent);margin-bottom:6px">목표: ${def.objective}</div>
            <div style="font-size:11px;color:var(--text-dim)">보상: ${def.rewardGold > 0 ? def.rewardGold + 'G' : ''} 관계+${Math.round(def.rewardRelationship * 100)}</div>
            <button class="btn" style="margin-top:6px;font-size:12px" data-npc-accept="${def.id}">수락</button>
          </div>`;
      });
    }

    if (completed.length > 0) {
      html += '<h3 style="font-size:13px;color:var(--success);margin:8px 0 4px">완료됨</h3>';
      completed.forEach(def => {
        html += `
          <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;opacity:0.7">
            <span style="font-weight:bold">${def.npc} — ${def.title}</span>
            <span style="font-size:11px;color:var(--success);margin-left:8px">✓</span>
          </div>`;
      });
    }

    if (active.length === 0 && available.length === 0 && completed.length === 0) {
      html = '<p style="text-align:center;color:var(--text-dim);padding:20px">아직 해금된 NPC 퀘스트가 없습니다.<br>NPC와 관계를 쌓아보세요.</p>';
    }

    const container = document.createElement('div');
    container.innerHTML = html;

    // 수락 버튼
    container.querySelectorAll<HTMLButtonElement>('[data-npc-accept]').forEach(btn => {
      btn.addEventListener('click', () => {
        const questId = btn.dataset.npcAccept!;
        const def = getNpcQuestDef(questId);
        if (!def) return;
        k.acceptNpcQuest(questId, def.npc, session.gameTime.day);
        session.backlog.add(session.gameTime, `${def.npc}의 의뢰 "${def.title}"을(를) 수락했다.`, '퀘스트');
        message = `"${def.title}" 수락!`;
        renderBoard(el);
      });
    });

    // 완료 버튼
    container.querySelectorAll<HTMLButtonElement>('[data-npc-complete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const questId = btn.dataset.npcComplete!;
        const def = getNpcQuestDef(questId);
        if (!def) return;
        // 보상 지급
        if (def.rewardGold > 0) {
          p.addGold(def.rewardGold);
        }
        // 관계 보상
        if (def.rewardRelationship > 0) {
          const rel = p.relationships.get(def.npc);
          if (rel) {
            rel.trust = Math.min(1, rel.trust + def.rewardRelationship * 0.5);
            rel.affinity = Math.min(1, rel.affinity + def.rewardRelationship * 0.5);
            rel.interactionCount++;
          }
        }
        k.completeNpcQuest(questId);
        session.backlog.add(session.gameTime, `${def.npc}의 의뢰 "${def.title}"을(를) 완료했다.\n${def.completionText}`, '퀘스트');
        message = `"${def.title}" 완료! +${def.rewardGold}G`;
        renderBoard(el);
      });
    });

    wrap.appendChild(container);
  }

  function renderBoard(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen quest-screen';

    const tabLabels: Record<QuestTab, string> = {
      available: '수락 가능',
      active: '진행 중',
      completed: '완료',
      npc: 'NPC 퀘스트',
    };

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>퀘스트 게시판</h2>
      <div class="trade-tabs">
        ${(['available', 'active', 'completed', 'npc'] as QuestTab[]).map(t =>
          `<button class="btn ${t === tab ? 'active' : ''}" data-tab="${t}">${tabLabels[t]}</button>`
        ).join('')}
      </div>
      ${message ? `<div class="trade-message">${message}</div>` : ''}
    `;

    if (tab === 'npc') {
      renderNpcTab(wrap, el);
    } else {
      const quests = getQuestsByTab();
      if (quests.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = '퀘스트가 없습니다.';
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
            <div class="quest-reward">보상: ${q.rewardGold}G${q.rewardReputation > 0 ? ` / 평판+${q.rewardReputation}` : ''}</div>
            ${q.status === QuestStatus.Accepted
              ? `<div class="quest-progress">진행: ${q.currentAmount}/${q.targetAmount}</div>`
              : ''}
          `;
          btn.addEventListener('click', () => handleQuestAction(i, el));
          list.appendChild(btn);
        });
        wrap.appendChild(list);
      }
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tab=탭 전환, 1~9 선택, Esc 뒤로';
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
        session.backlog.add(session.gameTime, `${p.name}이(가) 퀘스트 "${quest.title}"을(를) 수락했다.`, '행동');
        message = `"${quest.title}" 수락!`;
      } else {
        message = '수락할 수 없습니다.';
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
        const tabs: QuestTab[] = ['available', 'active', 'completed', 'npc'];
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
