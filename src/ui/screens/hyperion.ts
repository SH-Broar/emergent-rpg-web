// hyperion.ts — 히페리온 진행 화면
// 원본: HyperionScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getHyperionEntry, getHyperionEntryWithDefault } from '../../systems/hyperion';
import { evaluateAcquisitionConditions, getRelationshipStage, getRelationshipStageLabel } from '../../systems/npc-interaction';

const HYPERION_MAX_LEVEL = 5;

interface HyperionBonus {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
  maxVigor: number;
}

function getBonusForLevel(level: number): HyperionBonus {
  return {
    maxHp: level * 10,
    maxMp: level * 5,
    attack: level * 2,
    defense: level * 1,
    maxVigor: level * 5,
  };
}

export function createHyperionScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let selectedActor: string | null = null;
  let savedScrollTop = 0;

  function renderHyperion(el: HTMLElement): void {
    // Save scroll
    const prevList = el.querySelector('.npc-list') as HTMLElement | null;
    if (prevList) savedScrollTop = prevList.scrollTop;

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen hyperion-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', () => {
      if (selectedActor) { selectedActor = null; renderHyperion(el); }
      else onDone();
    });
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\ud788\ud398\ub9ac\uc628';
    wrap.appendChild(title);

    if (selectedActor) {
      renderActorDetail(wrap, el);
    } else {
      renderList(wrap, el);
    }

    el.appendChild(wrap);

    // Restore scroll
    requestAnimationFrame(() => {
      const list = el.querySelector('.npc-list') as HTMLElement | null;
      if (list && savedScrollTop > 0) list.scrollTop = savedScrollTop;
    });
  }

  function renderList(wrap: HTMLElement, el: HTMLElement): void {
    // Player hyperion level
    const playerLevel = p.hyperionLevel;
    const bonus = getBonusForLevel(playerLevel);

    const playerInfo = document.createElement('div');
    const levelBar = '\u2605'.repeat(playerLevel) + '\u2606'.repeat(HYPERION_MAX_LEVEL - playerLevel);
    playerInfo.innerHTML = `
      <p><strong>${p.name}</strong> \ud788\ud398\ub9ac\uc628 Lv.${playerLevel}/${HYPERION_MAX_LEVEL}</p>
      <p style="font-size:14px">${levelBar}</p>
      <p style="font-size:12px;color:var(--text-dim)">HP+${bonus.maxHp} MP+${bonus.maxMp} \uacf5+${bonus.attack} \ubc29+${bonus.defense} \uae30\ub825+${bonus.maxVigor}</p>
    `;
    wrap.appendChild(playerInfo);

    // NPC list — 플레이어 + 히페리온이 있고 이름을 아는 NPC만 표시
    const knownActors = session.actors.filter(a =>
      a === p || (a.hasHyperion && session.knowledge.knownActorNames.has(a.name))
    );

    const listTitle = document.createElement('h3');
    listTitle.textContent = `\uc778\ubb3c \ubaa9\ub85d (${knownActors.length}\uba85) \u2014 \ud130\uce58\ud558\uc5ec \uc0c1\uc138 \ubcf4\uae30`;
    listTitle.style.fontSize = '13px';
    wrap.appendChild(listTitle);

    const list = document.createElement('div');
    list.className = 'npc-list';
    list.style.cssText = 'max-height:45vh;overflow-y:auto;';

    for (const actor of knownActors) {
      const item = document.createElement('button');
      item.className = 'btn npc-item';
      item.style.cssText = 'cursor:pointer;text-align:left;width:100%';
      const stars = '\u2605'.repeat(actor.hyperionLevel) + '\u2606'.repeat(HYPERION_MAX_LEVEL - actor.hyperionLevel);
      const stage = actor === p ? '' : getRelationshipStageLabel(
        session.knowledge.isCompanion(actor.name) ? 'companion' :
        getRelationshipStage(p, actor.name, session.knowledge, session.actors)
      );
      item.innerHTML = `
        <span class="npc-name">${actor.name}</span>
        <span class="npc-detail">${stars} ${stage}</span>
      `;
      item.addEventListener('click', () => { selectedActor = actor.name; renderHyperion(el); });
      list.appendChild(item);
    }
    wrap.appendChild(list);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);
  }

  function renderActorDetail(wrap: HTMLElement, el: HTMLElement): void {
    const actor = session.actors.find(a => a.name === selectedActor);
    if (!actor) { selectedActor = null; renderList(wrap, el); return; }

    const level = actor.hyperionLevel;
    const bonus = getBonusForLevel(level);
    const stars = '\u2605'.repeat(level) + '\u2606'.repeat(HYPERION_MAX_LEVEL - level);
    const stage = actor === p ? '' : getRelationshipStageLabel(
      session.knowledge.isCompanion(actor.name) ? 'companion' :
      getRelationshipStage(p, actor.name, session.knowledge, session.actors)
    );

    // Hyperion info
    const info = document.createElement('div');
    const diffLabel = actor.acquisitionDifficulty > 0
      ? `<p style="font-size:12px;color:var(--warning);margin-top:4px">영입 난이도 ${'★'.repeat(Math.min(actor.acquisitionDifficulty, 6))}${'☆'.repeat(Math.max(0, 6 - actor.acquisitionDifficulty))}</p>`
      : '';
    info.innerHTML = `
      <h3>${actor.name} ${stars}</h3>
      <p style="font-size:13px;color:var(--text-dim)">\ud788\ud398\ub9ac\uc628 Lv.${level} ${stage ? '· ' + stage : ''}</p>
      <p style="font-size:12px;color:var(--text-dim)">HP+${bonus.maxHp} MP+${bonus.maxMp} \uacf5+${bonus.attack} \ubc29+${bonus.defense}</p>
      ${actor !== p ? diffLabel : ''}
    `;
    wrap.appendChild(info);

    // Hyperion missions — 친한 사이/동행 이상만 공개
    const isPlayer = actor === p;
    const entry = isPlayer ? getHyperionEntryWithDefault(actor.name) : getHyperionEntry(actor.name);
    const isCloseOrCompanion = isPlayer || stage === '\uce5c\ud55c \uc0ac\uc774' || stage === '\ub3d9\ud589 \uc911';
    if (entry) {
      const mTitle = document.createElement('div');
      mTitle.style.cssText = 'margin-top:12px;font-weight:600;font-size:13px;color:var(--warning)';
      mTitle.textContent = '\ud788\ud398\ub9ac\uc628 \ubbf8\uc158';
      wrap.appendChild(mTitle);

      if (!isCloseOrCompanion && !isPlayer) {
        const locked = document.createElement('p');
        locked.style.cssText = 'font-size:12px;color:var(--text-dim);padding:4px 8px';
        locked.textContent = '\uce5c\ud55c \uc0ac\uc774\uac00 \ub418\uba74 \ubbf8\uc158\uc774 \uacf5\uac1c\ub429\ub2c8\ub2e4.';
        wrap.appendChild(locked);
      } else {
        const mList = document.createElement('div');
        mList.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:4px';
        for (let i = 0; i < entry.conditions.length; i++) {
          const cond = entry.conditions[i];
          const cleared = i < level;
          const isCurrent = i === level;
          // 클리어한 것과 현재 목표만 공개, 나머지는 ???
          const revealed = cleared || isCurrent;
          const desc = revealed ? (cond.description || '???') : '???';
          const row = document.createElement('div');
          row.style.cssText = `font-size:12px;padding:4px 8px;border-radius:4px;background:${cleared ? 'rgba(78,204,163,0.15)' : isCurrent ? 'rgba(255,200,87,0.15)' : 'var(--bg-card)'};color:${cleared ? 'var(--success)' : isCurrent ? 'var(--warning)' : 'var(--text-dim)'}`;
          const icon = cleared ? '\u2713' : isCurrent ? '\u25b6' : '\u25cb';
          row.textContent = `${icon} Lv.${i + 1}: ${desc}`;
          mList.appendChild(row);
        }
        wrap.appendChild(mList);
      }
    }

    // Acquisition conditions (입수 조건)
    if (actor.acquisitionMethod && actor !== p) {
      const acqTitle = document.createElement('div');
      acqTitle.style.cssText = 'margin-top:12px;font-weight:600;font-size:13px;color:var(--accent)';
      const diffLabel = actor.acquisitionDifficulty > 0
        ? ' (\ub09c\uc774\ub3c4 ' + '\u2605'.repeat(Math.min(actor.acquisitionDifficulty, 6)) + ')'
        : '';
      acqTitle.textContent = '\uc785\uc218 \uc870\uac74' + diffLabel;
      wrap.appendChild(acqTitle);

      const checks = evaluateAcquisitionConditions(actor, p, session.actors, session.knowledge);
      const acqList = document.createElement('div');
      acqList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:4px';

      for (const check of checks) {
        if (!check.text) continue;
        const row = document.createElement('div');
        const icon = check.met ? '\u2713' : (check.evaluable ? '\u2717' : '\u25cb');
        const color = check.met ? 'var(--success)' : (check.evaluable ? 'var(--accent)' : 'var(--text-dim)');
        row.style.cssText = `font-size:12px;padding:3px 8px;border-radius:4px;color:${color};background:${check.met ? 'rgba(78,204,163,0.1)' : 'var(--bg-card)'}`;
        row.textContent = `${icon} ${check.text}`;
        acqList.appendChild(row);
      }
      wrap.appendChild(acqList);

      const metCount = checks.filter(c => c.met).length;
      const totalCount = checks.filter(c => c.text).length;
      const summary = document.createElement('p');
      summary.style.cssText = 'font-size:11px;color:var(--text-dim);margin-top:4px;text-align:center';
      summary.textContent = `\uc9c4\ud589: ${metCount}/${totalCount}`;
      wrap.appendChild(summary);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);
  }

  return {
    id: 'hyperion',
    render: renderHyperion,
    onKey(key) {
      const container = document.querySelector('.hyperion-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;
      if (key === 'Escape') {
        if (selectedActor) { selectedActor = null; renderHyperion(container); }
        else onDone();
      }
    },
  };
}
