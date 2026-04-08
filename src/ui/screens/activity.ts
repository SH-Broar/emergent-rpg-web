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
    // 재고 보충 체크
    session.activitySystem.restockIfNewDay(session.gameTime.day);
    // unique 아이템을 이미 소지 중이면 숨기고, 재고 0이면 숨김
    activities = session.activitySystem.getActivitiesForLocation(p.currentLocation)
      .filter(act => {
        // unique 활동: gives 아이템을 이미 소지 중이면 숨김
        if (act.unique && act.gives.length > 0) {
          const alreadyHas = act.gives.every(g => (p.spirit.inventory.get(g.item) ?? 0) >= g.amount);
          if (alreadyHas) return false;
        }
        // 재고가 0이면 숨김 (재고 무제한 = -1은 표시)
        if (act.stock > 0 && !session.activitySystem.hasStock(p.currentLocation, act.key)) {
          return false;
        }
        return true;
      });
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
        const stockNum = session.activitySystem.getStock(p.currentLocation, act.key);
        const stockLabel = stockNum >= 0 ? ` [재고:${stockNum}]` : '';
        btn.innerHTML = `
          <span class="npc-num">${i + 1}.</span>
          <span class="npc-name">${act.name}${stockLabel}</span>
          <span class="npc-detail">${act.description} (\uc2dc\uac04:${act.timeCost}\ubd84, TP:${Math.ceil(act.vigorCost / 10)}${act.goldCost > 0 ? `, ${act.goldCost}G` : ''})</span>
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
    const tpCost = Math.ceil(act.vigorCost / 10);
    if (!p.hasAp(tpCost)) return 'TP\uac00 \ubd80\uc871\ud569\ub2c8\ub2e4!';
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

    // 재고 체크
    if (act.stock > 0 && !session.activitySystem.hasStock(p.currentLocation, act.key)) {
      message = '재고가 없습니다!';
      renderActivity(el);
      return;
    }

    // Consume TP
    const tpNeeded = Math.ceil(act.vigorCost / 10);
    p.adjustAp(-tpNeeded);
    if (act.goldCost > 0) p.addGold(-act.goldCost);
    for (const req of act.itemReqs) {
      p.consumeItem(req.item, req.amount);
    }

    // 재고 소모
    if (act.stock > 0) {
      session.activitySystem.consumeStock(p.currentLocation, act.key);
    }

    // 효과 적용 전 스냅샷
    const hpBefore = p.base.hp;
    const mpBefore = p.base.mp;
    const vigorBefore = p.base.vigor;
    const invBefore = new Map(p.spirit.inventory);

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
    session.knowledge.trackVigorSpent(Math.ceil(act.vigorCost / 10));

    // Backlog
    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) ${act.name} \ud65c\ub3d9\uc744 \uc218\ud589\ud588\ub2e4.`,
      '\ud589\ub3d9',
    );

    // 결과 메시지 구성
    const lines: string[] = [`\u2713 ${act.name} \uc644\ub8cc (${act.timeCost}\ubd84 \uacbd\uacfc)`];

    // 확정 아이템 지급
    if (act.gives.length > 0) {
      lines.push('\ud68d\ub4dd: ' + act.gives.map(g => `${itemName(g.item)} \xd7${g.amount}`).join(', '));
    }

    // 인벤토리 변화 감지 (random_loot 등)
    if (act.effect === 'random_loot') {
      const gained: string[] = [];
      for (const [type, count] of p.spirit.inventory) {
        const before = invBefore.get(type) ?? 0;
        if (count > before) gained.push(`${itemName(type)} \xd7${count - before}`);
      }
      lines.push(gained.length > 0 ? '\ubc1c\uacac: ' + gained.join(', ') : '\ud2b9\ubcc4\ud55c \uc218\ud655\uc740 \uc5c6\uc5c8\ub2e4.');
    }

    // HP/MP/기력 변화
    const hpDelta = Math.round(p.base.hp - hpBefore);
    const mpDelta = Math.round(p.base.mp - mpBefore);
    const vigorDelta = Math.round(p.base.vigor - vigorBefore);
    if (hpDelta > 0) lines.push(`HP +${hpDelta}`);
    if (mpDelta > 0) lines.push(`MP +${mpDelta}`);
    if (vigorDelta > 0) lines.push(`\uae30\ub825 +${vigorDelta}`);

    // 버프
    if (act.effect.startsWith('buff_attack:')) lines.push('\uacf5\uaca9\ub825 \ubc84\ud504 \uc801\uc6a9');
    if (act.effect.startsWith('buff_defense:')) lines.push('\ubc29\uc5b4\ub825 \ubc84\ud504 \uc801\uc6a9');
    if (act.effect.startsWith('start_crop:')) lines.push('\uc791\ubb3c\uc744 \uc2ec\uc5c8\ub2e4. \uc2dc\uac04\uc774 \uc9c0\ub098\uba74 \uc218\ud655\ud560 \uc218 \uc788\ub2e4.');

    message = lines.join(' \xb7 ');
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
