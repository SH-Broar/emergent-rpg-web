// hyperion.ts — 하이페리온 진행 화면
// 원본: HyperionScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';

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

  function renderHyperion(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen hyperion-screen';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn back-btn';
    backBtn.dataset.back = '';
    backBtn.textContent = '\u2190 \ub4a4\ub85c [Esc]';
    backBtn.style.minHeight = '44px';
    backBtn.addEventListener('click', onDone);
    wrap.appendChild(backBtn);

    const title = document.createElement('h2');
    title.textContent = '\ud788\ud398\ub9ac\uc628';
    wrap.appendChild(title);

    // Player hyperion level
    const playerLevel = p.hyperionLevel;
    const bonus = getBonusForLevel(playerLevel);

    const playerInfo = document.createElement('div');
    playerInfo.className = 'hyperion-player';
    const levelBar = '\u2605'.repeat(playerLevel) + '\u2606'.repeat(HYPERION_MAX_LEVEL - playerLevel);
    playerInfo.innerHTML = `
      <p><strong>${p.name}</strong> \ud788\ud398\ub9ac\uc628 \ub808\ubca8: ${playerLevel}/${HYPERION_MAX_LEVEL}</p>
      <p class="hyperion-bar">${levelBar}</p>
      <div class="hyperion-bonus">
        <p>\uc2a4\ud0ef \ubcf4\ub108\uc2a4:</p>
        <p>HP +${bonus.maxHp} | MP +${bonus.maxMp} | \uacf5\uaca9 +${bonus.attack} | \ubc29\uc5b4 +${bonus.defense} | \uae30\ub825 +${bonus.maxVigor}</p>
      </div>
    `;
    wrap.appendChild(playerInfo);

    // All actors hyperion list
    const knownActors = session.actors.filter(a =>
      a === p || session.knowledge.knownActorNames.has(a.name)
    );

    const listTitle = document.createElement('h3');
    listTitle.textContent = `\uc54c\uace0 \uc788\ub294 \uc778\ubb3c (${knownActors.length}\uba85)`;
    wrap.appendChild(listTitle);

    const list = document.createElement('div');
    list.className = 'npc-list';
    for (const actor of knownActors) {
      const item = document.createElement('div');
      item.className = 'npc-item';
      const stars = '\u2605'.repeat(actor.hyperionLevel) + '\u2606'.repeat(HYPERION_MAX_LEVEL - actor.hyperionLevel);
      const actorBonus = getBonusForLevel(actor.hyperionLevel);
      item.innerHTML = `
        <span class="npc-name">${actor.name}</span>
        <span class="npc-detail">${stars} Lv.${actor.hyperionLevel} (HP+${actorBonus.maxHp}, \uacf5+${actorBonus.attack}, \ubc29+${actorBonus.defense})</span>
      `;
      list.appendChild(item);
    }
    wrap.appendChild(list);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
  }

  return {
    id: 'hyperion',
    render: renderHyperion,
    onKey(key) {
      if (key === 'Escape') onDone();
    },
  };
}
