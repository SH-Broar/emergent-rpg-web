// activity.ts — 활동 화면
// 원본: ActivityScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { ActivityDef, CropState } from '../../models/activity';
import { gameTimeToMinute, updateCropReady } from '../../models/activity';
import { itemName } from '../../types/registry';
import { randomFloat } from '../../types/rng';

export function createActivityScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let message = '';
  let activities: readonly ActivityDef[] = [];

  function refresh(): void {
    activities = session.activitySystem.getActivitiesForLocation(p.currentLocation);
  }

  function renderActivity(el: HTMLElement): void {
    refresh();
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen activity-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>\ud65c\ub3d9</h2>
      ${message ? `<div class="trade-message">${message}</div>` : ''}
    `;

    if (activities.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = '\uc774 \uc7a5\uc18c\uc5d0\uc11c \uac00\ub2a5\ud55c \ud65c\ub3d9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.';
      wrap.appendChild(hint);
    } else {
      const list = document.createElement('div');
      list.className = 'menu-buttons';
      activities.forEach((act, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn npc-item';
        btn.style.minHeight = '44px';
        btn.dataset.idx = String(i);
        btn.innerHTML = `
          <span class="npc-num">${i + 1}.</span>
          <span class="npc-name">${act.name}</span>
          <span class="npc-detail">${act.description} (\uc2dc\uac04:${act.timeCost}\ubd84, \uae30\ub825:${act.vigorCost}${act.goldCost > 0 ? `, ${act.goldCost}G` : ''})</span>
        `;
        btn.addEventListener('click', () => executeActivity(i, el));
        list.appendChild(btn);
      });
      wrap.appendChild(list);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~9 \uc120\ud0dd, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
    el.appendChild(wrap);
  }

  function checkRequirements(act: ActivityDef): string | null {
    if (p.base.vigor < act.vigorCost) return '\uae30\ub825\uc774 \ubd80\uc871\ud569\ub2c8\ub2e4!';
    if (act.goldCost > 0 && p.spirit.gold < act.goldCost) return '\uace8\ub4dc\uac00 \ubd80\uc871\ud569\ub2c8\ub2e4!';
    for (const req of act.itemReqs) {
      const have = p.spirit.inventory.get(req.item) ?? 0;
      if (have < req.amount) return `${itemName(req.item)}\uc774(\uac00) \ubd80\uc871\ud569\ub2c8\ub2e4!`;
    }
    return null;
  }

  function applyEffect(act: ActivityDef): void {
    const effect = act.effect;

    // give items
    for (const give of act.gives) {
      p.addItem(give.item, give.amount);
    }

    if (effect.startsWith('start_crop:')) {
      const growthMinutes = parseInt(effect.split(':')[1], 10) || 60;
      const currentMin = gameTimeToMinute(
        session.gameTime.day,
        session.gameTime.hour,
        session.gameTime.minute,
      );
      const crop: CropState = {
        locationId: p.currentLocation,
        activityKey: act.key,
        plantedGameMinute: currentMin,
        growthMinutes,
        ready: false,
      };
      session.playerCrops.push(crop);
    } else if (effect.startsWith('heal_hp:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustHp(amount);
    } else if (effect.startsWith('restore_vigor:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustVigor(amount);
    } else if (effect.startsWith('restore_mp:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustMp(amount);
    } else if (effect.startsWith('buff_attack:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      session.playerBuffs.push({ type: 'attack', amount, remainingTurns: -1 });
    } else if (effect.startsWith('buff_defense:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      session.playerBuffs.push({ type: 'defense', amount, remainingTurns: -1 });
    } else if (effect === 'random_loot') {
      for (const entry of act.lootTable) {
        if (randomFloat(0, 1) <= entry.chance) {
          p.addItem(entry.item, entry.amount);
        }
      }
    }

    // Apply color influence
    if (act.colorInfluence.length > 0) {
      p.color.applyInfluence(act.colorInfluence);
    }
  }

  function executeActivity(idx: number, el: HTMLElement): void {
    const act = activities[idx];
    if (!act) return;

    const failMsg = checkRequirements(act);
    if (failMsg) {
      message = failMsg;
      renderActivity(el);
      return;
    }

    // Consume resources
    p.adjustVigor(-act.vigorCost);
    if (act.goldCost > 0) p.addGold(-act.goldCost);
    for (const req of act.itemReqs) {
      p.consumeItem(req.item, req.amount);
    }

    // Apply effect
    applyEffect(act);

    // Advance time
    session.gameTime.advance(act.timeCost);

    // Update crops
    const currentMin = gameTimeToMinute(
      session.gameTime.day,
      session.gameTime.hour,
      session.gameTime.minute,
    );
    for (const crop of session.playerCrops) {
      updateCropReady(crop, currentMin);
    }

    // Track
    session.knowledge.trackActivityDone();
    session.knowledge.trackVigorSpent(act.vigorCost);

    // Backlog
    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) ${act.name} \ud65c\ub3d9\uc744 \uc218\ud589\ud588\ub2e4.`,
      '\ud589\ub3d9',
    );

    message = `${act.name} \uc644\ub8cc!`;
    renderActivity(el);
  }

  return {
    id: 'activity',
    render: renderActivity,
    onKey(key) {
      const container = document.querySelector('.activity-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') { onDone(); return; }
      if (/^[1-9]$/.test(key)) {
        executeActivity(parseInt(key, 10) - 1, container);
      }
    },
  };
}
