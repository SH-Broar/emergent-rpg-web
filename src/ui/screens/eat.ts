import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { computeEatEffect, applyDailyMealBuff, getRemainingMeals, mealBuffLabel } from '../../types/eat-system';
import { getItemDef, type ItemDef } from '../../types/item-defs';
import { getRaceCapabilitySet, parseTags } from '../../types/tag-system';
import { ItemType, Element, ELEMENT_COUNT, elementName } from '../../types/enums';

/** 아이템 카테고리 → 열화 시 방출되는 원소 */
function degradeElement(cat: ItemType): Element {
  switch (cat) {
    case ItemType.Food: return Element.Fire;
    case ItemType.Herb: return Element.Earth;
    case ItemType.Potion: return Element.Water;
    case ItemType.MonsterLoot: return Element.Dark;
    case ItemType.Equipment: return Element.Iron;
    case ItemType.OreCommon: return Element.Iron;
    case ItemType.OreRare: return Element.Electric;
    case ItemType.GuildCard: return Element.Light;
    default: return Element.Earth;
  }
}

function buffLabel(type: string): string {
  switch (type) {
    case 'attack': return '공격력';
    case 'defense': return '방어력';
    case 'vigor_regen': return 'TP 재생';
    case 'mp_regen': return 'MP 재생';
    case 'speed': return '이동속도';
    default: return type;
  }
}

export function createEatScreen(
  session: GameSession,
  onDone: (statusMessage: string) => void,
): Screen {
  const p = session.player;
  let resultMsg = '';
  let resultStats: string[] = [];
  let showResult = false;

  function getInventoryItems(): { id: string; qty: number; label: string; def: ItemDef | undefined }[] {
    const items: { id: string; qty: number; label: string; def: ItemDef | undefined }[] = [];
    for (const [id, qty] of p.items) {
      if (qty > 0) {
        const def = getItemDef(id);
        items.push({ id, qty, label: def?.name ?? id, def });
      }
    }
    return items;
  }

  function renderEat(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    // 식사 결과 화면
    if (showResult) {
      let html = '<h2>식사</h2>';
      html += `<div class="trade-message" style="color:var(--success);font-size:15px;margin-bottom:12px">${resultMsg}</div>`;
      if (resultStats.length > 0) {
        html += `<div style="color:var(--warning);font-size:13px;margin-bottom:16px">${resultStats.join(' · ')}</div>`;
      }
      html += `<div style="color:var(--text-dim);font-size:12px;margin-bottom:4px">HP ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())} · MP ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>`;
      html += '<button class="btn btn-primary" data-ok style="min-width:140px;margin-top:8px">확인 [Enter]</button>';
      wrap.innerHTML = html;
      const statusLine = resultStats.length > 0 ? `${resultMsg} · ${resultStats.join(' · ')}` : resultMsg;
      wrap.querySelector('[data-ok]')?.addEventListener('click', () => onDone(statusLine));
      el.appendChild(wrap);
      return;
    }

    // 식품 선택 화면
    const items = getInventoryItems();
    let html = '<button class="btn back-btn" data-back>← 뒤로 [Esc]</button>';
    html += '<h2>식사</h2>';

    if (resultMsg) {
      html += `<div class="trade-message" style="color:var(--warning);margin-bottom:8px">${resultMsg}</div>`;
    }

    if (items.length === 0) {
      html += '<p style="text-align:center;color:var(--text-dim)">가방이 비어 있다.</p>';
    } else {
      html += '<p style="color:var(--text-dim);font-size:12px;margin-bottom:6px">무엇을 먹을까?</p>';
      html += '<div class="npc-list">';
      items.forEach((item, i) => {
        const raceTags = getRaceCapabilitySet(p.base.race);
        const itemTags = parseTags(item.def?.tags ?? '');
        let warning = '';
        if (raceTags.has('potion_only') && !itemTags.has('liquid')) {
          warning = '비물질 존재라 섭취할 수 없다.';
        } else if (!raceTags.has('digest_all') && itemTags.has('inedible')) {
          warning = '⚠ 먹을 수 있는 것이 아닌 것 같다...';
        } else if (itemTags.has('raw')) {
          warning = '⚠ 날것이다.';
        }
        const itemDeg = session.knowledge.withdrawnItemDegradation.get(item.id) ?? 0;
        if (itemDeg > 0) {
          warning += (warning ? ' · ' : '') + `⚠ 열화 -${Math.round(itemDeg)}%`;
        }
        html += `<button class="btn npc-item" data-eat="${item.id}">
          <span class="npc-num">${i + 1}</span>
          <span class="npc-name">${item.label} x${item.qty}</span>
          <span class="npc-detail">${warning}</span>
        </button>`;
      });
      html += '</div>';
    }
    html += '<p class="hint">1~9 선택, Esc 뒤로</p>';

    wrap.innerHTML = html;
    wrap.querySelector('[data-back]')?.addEventListener('click', () => onDone(''));
    wrap.querySelectorAll<HTMLButtonElement>('[data-eat]').forEach(btn => {
      btn.addEventListener('click', () => {
        doEat(btn.dataset.eat!, el);
      });
    });
    el.appendChild(wrap);
  }

  function doEat(itemId: string, el: HTMLElement) {
    // 하루 3식 제한 체크 (Food 카테고리만)
    const eatDef = getItemDef(itemId);
    if (!eatDef || eatDef.category === ItemType.Food) {
      if (getRemainingMeals(p) <= 0) {
        resultMsg = '오늘은 더 이상 먹을 수 없다. (하루 3식 제한)';
        showResult = true;
        resultStats = [];
        renderEat(el);
        return;
      }
    }

    if (!p.removeItemById(itemId, 1)) {
      resultMsg = '아이템이 없다!';
      renderEat(el);
      return;
    }

    const def = getItemDef(itemId);
    let hp = 0, mp = 0, mood = 0, message = '', statusEffect: 'poison' | 'stomachache' | undefined;
    let pendingBuffType = '', pendingBuffAmount = 0, pendingBuffDuration = 0;

    const isNight = session.gameTime.hour >= 21 || session.gameTime.hour < 5;

    if (def && (def.eatHp !== 0 || def.eatMp !== 0 || def.eatMood !== 0 || def.eatMessage)) {
      hp = def.eatHp;
      mp = def.eatMp;
      mood = def.eatMood;
      message = def.eatMessage || `${def.name}을(를) 먹었다.`;
      statusEffect = def.eatStatus as 'poison' | 'stomachache' | undefined || undefined;
      if (def.eatBuffType && def.eatBuffDuration > 0) {
        pendingBuffType = def.eatBuffType;
        pendingBuffAmount = def.eatBuffAmount;
        pendingBuffDuration = def.eatBuffDuration;
      }
    } else {
      const fallbackType = def?.category ?? 0;
      const result = computeEatEffect(fallbackType, p.base.race, def?.tags ?? '', isNight);
      hp = result.hp;
      mp = result.mp;
      mood = result.mood;
      message = result.message;
      statusEffect = result.statusEffect;
      if (result.buffType && result.buffDuration) {
        pendingBuffType = result.buffType;
        pendingBuffAmount = result.buffAmount ?? 0;
        pendingBuffDuration = result.buffDuration;
      }
    }

    // 보관 열화도 적용
    const deg = session.knowledge.withdrawnItemDegradation.get(itemId) ?? 0;
    if (deg > 0) {
      const mul = 1 - deg / 100;
      hp = Math.round(hp * mul);
      mp = Math.round(mp * mul);
      mood = Math.round(mood * mul);
      pendingBuffAmount = Math.round(pendingBuffAmount * mul * 10) / 10;
      // 소비 후 열화도 정리
      const remaining = p.getItemCount(itemId);
      if (remaining <= 0) {
        session.knowledge.withdrawnItemDegradation.delete(itemId);
      }
    }

    if (hp) p.adjustHp(hp);
    if (mp) p.adjustMp(mp);
    if (mood) p.adjustMood(mood);

    session.gameTime.advance(10);
    session.backlog.add(session.gameTime, `${p.name}: ${message}`, '행동');

    if (statusEffect === 'poison') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 중독되었다!`, '시스템');
    } else if (statusEffect === 'stomachache') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 배탈이 났다!`, '시스템');
    }

    // 결과 요약 구성
    const statLines: string[] = [];
    if (hp > 0) statLines.push(`HP +${hp}`);
    else if (hp < 0) statLines.push(`HP ${hp}`);
    if (mp > 0) statLines.push(`MP +${mp}`);
    else if (mp < 0) statLines.push(`MP ${mp}`);
    if (statusEffect === 'poison') statLines.push('⚠ 중독!');
    if (statusEffect === 'stomachache') statLines.push('⚠ 배탈!');

    if (deg > 0) {
      statLines.push(`⚠ 보관 열화 -${Math.round(deg)}%`);
      // 열화 컬러 영향: 카테고리 원소에 비례하는 컬러 시프트
      const cat = def?.category ?? 0;
      const elem = degradeElement(cat);
      const colorShift = deg * 0.003;
      const influence = new Array(ELEMENT_COUNT).fill(0);
      influence[elem] = colorShift;
      p.color.applyInfluence(influence);
      statLines.push(`🎨 ${elementName(elem)} +${colorShift.toFixed(2)}`);
    }

    // 버프 적용
    if (pendingBuffType && pendingBuffDuration > 0) {
      session.playerBuffs.push({
        type: pendingBuffType,
        amount: pendingBuffAmount,
        remainingTurns: pendingBuffDuration,
      });
      statLines.push(`✨ ${buffLabel(pendingBuffType)} +${pendingBuffAmount} (${pendingBuffDuration}턴)`);
    }

    // 하루 지속 식사 버프 적용 및 표시
    if (def && def.category === ItemType.Food) {
      applyDailyMealBuff(p, def);
      const mealLabel = mealBuffLabel(def);
      if (mealLabel) statLines.push(mealLabel);
      statLines.push(`오늘 남은 식사: ${getRemainingMeals(p)}/3`);
    }

    // 결과 화면으로 전환 (즉시 닫지 않음)
    resultMsg = message;
    resultStats = statLines;
    showResult = true;
    renderEat(el);
  }

  return {
    id: 'eat',
    render: renderEat,
    onKey(key) {
      const container = document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (showResult) {
        if (key === 'Enter' || key === ' ' || key === 'Escape') {
          const statusLine = resultStats.length > 0 ? `${resultMsg} · ${resultStats.join(' · ')}` : resultMsg;
          onDone(statusLine);
        }
        return;
      }

      if (key === 'Escape') { onDone(''); return; }
      if (/^[1-9]$/.test(key)) {
        const items = getInventoryItems();
        const idx = parseInt(key, 10) - 1;
        if (idx < items.length) doEat(items[idx].id, container);
      }
    },
  };
}
