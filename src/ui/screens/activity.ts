// activity.ts — 활동 화면
// 원본: ActivityScreen (C++)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { ActivityDef, CropState } from '../../models/activity';
import { gameTimeToMinute, updateCropReady } from '../../models/activity';

/** 활동 기반 농작물 추적 (구형 CropState; 세션 외부 유지) */
const _sessionCrops = new Map<GameSession, CropState[]>();
function getSessionCrops(session: GameSession): CropState[] {
  if (!_sessionCrops.has(session)) _sessionCrops.set(session, []);
  return _sessionCrops.get(session)!;
}
import { itemName } from '../../types/registry';
import { randomFloat } from '../../types/rng';
import type { ActivitySimConfig } from './activity-sim';
import { getItemDef } from '../../types/item-defs';

/** 활동 실행 아이콘 (effectType 기반) */
const ACTIVITY_ICON: Record<string, string> = {
  random_loot: '🔍', give: '📦', heal_hp: '💚',
  restore_vigor: '💛', restore_mp: '💙', gain_gold: '💰',
  start_crop: '🌱', buff_attack: '⚔️', buff_defense: '🛡️',
  hear_rumor: '💬', learn_spell: '✨',
};
function resolveActivityIcon(effectType: string): string {
  return ACTIVITY_ICON[effectType] ?? '🔨';
}

function renderTpCostPips(tpCost: number): string {
  if (tpCost <= 0) return '';
  return `<span class="tp-cost-stack" aria-label="TP ${tpCost}" title="TP ${tpCost}">${Array.from(
    { length: tpCost },
    () => '<span class="tp-cost-pip"></span>'
  ).join('')}</span>`;
}

export function createActivityScreen(
  session: GameSession,
  onDone: () => void,
  onSimulate: (config: ActivitySimConfig) => void,
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
      list.className = 'menu-buttons activity-list';
      activities.forEach((act, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn npc-item activity-item';
        btn.style.minHeight = '44px';
        btn.dataset.idx = String(i);
        const stockNum = session.activitySystem.getStock(p.currentLocation, act.key);
        const stockLabel = stockNum >= 0 ? ` [재고:${stockNum}]` : '';
        const tpCost = Math.ceil(act.vigorCost / 10);
        const costParts = [`시간:${act.timeCost}분`];
        if (act.goldCost > 0) costParts.push(`${act.goldCost}G`);
        btn.innerHTML = `
          <span class="npc-num">${i + 1}.</span>
          <span class="npc-name-row">
            <span class="npc-name">${act.name}${stockLabel}</span>
            ${renderTpCostPips(tpCost)}
          </span>
          <span class="npc-detail">${act.description} (${costParts.join(', ')})</span>
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
    for (const req of act.itemReqsById) {
      const have = p.getItemCount(req.itemId);
      if (have < req.amount) return `${getItemDef(req.itemId)?.name ?? req.itemId}\uc774(\uac00) \ubd80\uc871\ud569\ub2c8\ub2e4!`;
    }
    return null;
  }

  function applyEffect(act: ActivityDef): void {
    const effect = act.effect;

    // give items
    for (const give of act.gives) {
      p.addItem(give.item, give.amount);
    }
    for (const give of act.givesById) {
      p.addItemById(give.itemId, give.amount);
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
      getSessionCrops(session).push(crop);
    } else if (effect.startsWith('heal_hp:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustHp(amount);
    } else if (effect.startsWith('restore_vigor:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustAp(Math.ceil(amount / 10));
    } else if (effect.startsWith('restore_mp:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.adjustMp(amount);
    } else if (effect.startsWith('gain_gold:')) {
      const amount = parseInt(effect.split(':')[1], 10) || 0;
      p.addGold(amount);
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
      for (const entry of act.lootTableById) {
        if (randomFloat(0, 1) <= entry.chance) {
          p.addItemById(entry.itemId, entry.amount);
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
    for (const req of act.itemReqsById) {
      p.removeItemById(req.itemId, req.amount);
    }

    // 재고 소모
    if (act.stock > 0) {
      session.activitySystem.consumeStock(p.currentLocation, act.key);
    }

    // 효과 적용 전 스냅샷
    const hpBefore = p.base.hp;
    const mpBefore = p.base.mp;
    const invBefore = new Map(p.spirit.inventory);
    const itemIdBefore = new Map(p.items);

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
    for (const crop of getSessionCrops(session)) {
      updateCropReady(crop, currentMin);
    }

    // Track
    session.knowledge.trackActivityDone();

    // Backlog
    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) ${act.name} \ud65c\ub3d9\uc744 \uc218\ud589\ud588\ub2e4.`,
      '\ud589\ub3d9',
    );

    // 결과 텍스트 구성 (시뮬레이션 화면에 표시할 요약)
    const rewardParts: string[] = [];

    // 확정 아이템
    if (act.gives.length > 0) {
      rewardParts.push(act.gives.map(g => `${itemName(g.item)} ×${g.amount}`).join(', '));
    }
    if (act.givesById.length > 0) {
      rewardParts.push(act.givesById.map(g => `${getItemDef(g.itemId)?.name ?? g.itemId} ×${g.amount}`).join(', '));
    }

    // 랜덤 루트 결과
    if (act.effect === 'random_loot') {
      const gained: string[] = [];
      for (const [type, count] of p.spirit.inventory) {
        const before = invBefore.get(type) ?? 0;
        if (count > before) gained.push(`${itemName(type)} ×${count - before}`);
      }
      for (const [id, count] of p.items) {
        const before = itemIdBefore.get(id) ?? 0;
        if (count > before) gained.push(`${getItemDef(id)?.name ?? id} ×${count - before}`);
      }
      rewardParts.push(gained.length > 0 ? gained.join(', ') : '수확 없음');
    }

    // HP/MP 변화
    const hpDelta = Math.round(p.base.hp - hpBefore);
    const mpDelta = Math.round(p.base.mp - mpBefore);
    if (hpDelta > 0) rewardParts.push(`HP +${hpDelta}`);
    if (mpDelta > 0) rewardParts.push(`MP +${mpDelta}`);
    if (act.effect.startsWith('restore_vigor:')) {
      const amount = parseInt(act.effect.split(':')[1], 10) || 0;
      rewardParts.push(`TP +${Math.ceil(amount / 10)}`);
    }
    if (act.effect.startsWith('gain_gold:')) {
      const amount = parseInt(act.effect.split(':')[1], 10) || 0;
      rewardParts.push(`${amount}G 획득`);
    }

    // 버프·작물
    if (act.effect.startsWith('buff_attack:'))  rewardParts.push('공격력 버프 적용');
    if (act.effect.startsWith('buff_defense:')) rewardParts.push('방어력 버프 적용');
    if (act.effect.startsWith('start_crop:'))   rewardParts.push('작물을 심었다.');
    if (act.effect === 'hear_rumor')             rewardParts.push('소문을 들었다.');
    if (act.effect === 'learn_spell')            rewardParts.push('새로운 마법을 배웠다.');

    const effectType = act.effect.split(':')[0];
    const isEmpty = act.effect === 'random_loot'
      && rewardParts.length === 1 && rewardParts[0] === '수확 없음';

    onSimulate({
      icon:        resolveActivityIcon(effectType),
      title:       act.name,
      activityKey: act.key,
      effectType,
      rewardText:  rewardParts.join(' · ') || `${act.name} 완료`,
      isEmpty,
    });
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
