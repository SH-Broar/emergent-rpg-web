// equipment.ts — 장비 관리 화면
// 무기 1슬롯, 방어구 1슬롯, 악세서리 2슬롯

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { getWeaponDef, getArmorDef } from '../../types/item-defs';
import { ELEMENT_COUNT } from '../../types/enums';

function degradeKey(slot: string): string { return `degrade_${slot}`; }

type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'accessory2';

export function createEquipmentScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let selectedSlot: EquipSlot | null = null;

  function getSlotLabel(slot: EquipSlot): string {
    switch (slot) {
      case 'weapon': return '\u2694 \ubb34\uae30';
      case 'armor': return '\ud83d\udee1 \ubc29\uc5b4\uad6c';
      case 'accessory': return '\ud83d\udc8d \uc545\uc138\uc11c\ub9ac 1';
      case 'accessory2': return '\ud83d\udc8d \uc545\uc138\uc11c\ub9ac 2';
    }
  }

  function getEquippedId(slot: EquipSlot): string {
    switch (slot) {
      case 'weapon': return p.equippedWeapon;
      case 'armor': return p.equippedArmor;
      case 'accessory': return p.equippedAccessory;
      case 'accessory2': return p.equippedAccessory2;
    }
  }

  function getEquippedName(slot: EquipSlot): string {
    const id = getEquippedId(slot);
    if (!id) return '\uc5c6\uc74c';
    if (slot === 'weapon') return getWeaponDef(id)?.name ?? id;
    return getArmorDef(id)?.name ?? id;
  }

  function getEquippedStats(slot: EquipSlot): string {
    const id = getEquippedId(slot);
    if (!id) return '';
    if (slot === 'weapon') {
      const w = getWeaponDef(id);
      if (!w) return '';
      return `\uacf5\uaca9+${w.attack}${w.magicBonus ? ' \ub9c8\ub825+' + w.magicBonus : ''}${w.speed ? ' \uc18d\ub3c4' + w.speed : ''}`;
    }
    const a = getArmorDef(id);
    if (!a) return '';
    return `\ubc29\uc5b4+${a.defense}${a.magicDefense ? ' \ub9c8\ubc29+' + a.magicDefense : ''}${a.evasion ? ' \ud68c\ud53c+' + a.evasion : ''}`;
  }

  function setEquip(slot: EquipSlot, id: string): void {
    switch (slot) {
      case 'weapon': p.equippedWeapon = id; break;
      case 'armor': p.equippedArmor = id; break;
      case 'accessory': p.equippedAccessory = id; break;
      case 'accessory2': p.equippedAccessory2 = id; break;
    }
  }

  function unequip(slot: EquipSlot): void {
    const id = getEquippedId(slot);
    if (id) {
      p.addItemById(id, 1);
      setEquip(slot, '');
      p.setVariable(degradeKey(slot), 0);
    }
  }

  function equip(slot: EquipSlot, itemId: string): void {
    // Unequip current first (return to inventory)
    const currentId = getEquippedId(slot);
    if (currentId) {
      p.addItemById(currentId, 1);
      p.setVariable(degradeKey(slot), 0);
    }
    // Remove from inventory and equip
    p.removeItemById(itemId, 1);
    setEquip(slot, itemId);

    // 보관 열화도 이전
    const deg = session.knowledge.withdrawnItemDegradation.get(itemId) ?? 0;
    p.setVariable(degradeKey(slot), deg);
    if (deg > 0) {
      const remaining = p.getItemCount(itemId);
      if (remaining <= 0) {
        session.knowledge.withdrawnItemDegradation.delete(itemId);
      }
      // 열화 컬러 영향: 장비 원소에 비례하는 컬러 시프트
      let elemIdx = -1;
      if (slot === 'weapon') {
        elemIdx = getWeaponDef(itemId)?.element ?? -1;
      } else {
        elemIdx = getArmorDef(itemId)?.element ?? -1;
      }
      if (elemIdx >= 0 && elemIdx < ELEMENT_COUNT) {
        const influence = new Array(ELEMENT_COUNT).fill(0);
        influence[elemIdx] = deg * 0.003;
        p.color.applyInfluence(influence);
      }
    }
  }

  function getEquipCandidates(slot: EquipSlot): { id: string; name: string; stats: string }[] {
    const candidates: { id: string; name: string; stats: string }[] = [];

    for (const [itemId, count] of p.items) {
      if (count <= 0) continue;
      if (slot === 'weapon') {
        const w = getWeaponDef(itemId);
        if (w) {
          candidates.push({
            id: itemId,
            name: w.name,
            stats: `\uacf5+${w.attack}${w.magicBonus ? ' \ub9c8+' + w.magicBonus : ''}`,
          });
        }
      } else {
        const a = getArmorDef(itemId);
        if (!a) continue;
        if (slot === 'armor' && (a.type === 'Accessory')) continue;
        if ((slot === 'accessory' || slot === 'accessory2') && a.type !== 'Accessory') continue;
        candidates.push({
          id: itemId,
          name: a.name,
          stats: `\ubc29+${a.defense}${a.magicDefense ? ' \ub9c8\ubc29+' + a.magicDefense : ''}${a.evasion ? ' \ud68c\ud53c+' + a.evasion : ''}`,
        });
      }
    }
    return candidates;
  }

  function renderMain(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>\uc7a5\ube44</h2>
      <div style="font-size:12px;color:var(--text-dim);text-align:center;margin-bottom:8px">
        \uacf5\uaca9: ${p.getEffectiveAttack().toFixed(1)} | \ubc29\uc5b4: ${p.getEffectiveDefense().toFixed(1)}
      </div>
    `;

    const slots: EquipSlot[] = ['weapon', 'armor', 'accessory', 'accessory2'];
    const slotList = document.createElement('div');
    slotList.className = 'menu-buttons';

    for (const slot of slots) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'text-align:left;display:flex;justify-content:space-between;align-items:center';
      const name = getEquippedName(slot);
      const stats = getEquippedStats(slot);
      btn.innerHTML = `
        <span><strong>${getSlotLabel(slot)}</strong></span>
        <span>${name} <span style="color:var(--text-dim);font-size:11px">${stats}</span></span>
      `;
      btn.addEventListener('click', () => { selectedSlot = slot; renderSlotDetail(el); });
      slotList.appendChild(btn);
    }
    wrap.appendChild(slotList);

    // Items summary
    const itemCount = [...p.items.values()].reduce((s, n) => s + n, 0);
    const itemSummary = document.createElement('p');
    itemSummary.style.cssText = 'font-size:12px;color:var(--text-dim);text-align:center;margin-top:8px';
    itemSummary.textContent = `\uc18c\uc9c0\ud488: ${itemCount}\uac1c | \ud83d\udcb0${p.spirit.gold}G`;
    wrap.appendChild(itemSummary);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '1~4 \uc2ac\ub86f \uc120\ud0dd, Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
  }

  function renderSlotDetail(el: HTMLElement): void {
    if (!selectedSlot) { renderMain(el); return; }

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const currentId = getEquippedId(selectedSlot);
    const currentName = getEquippedName(selectedSlot);
    const currentStats = getEquippedStats(selectedSlot);

    const slotDeg = p.getVariable(degradeKey(selectedSlot));
    const degHtml = slotDeg > 0
      ? `<div style="font-size:11px;color:#e17055">⚠ 보관 열화 -${Math.round(slotDeg)}%</div>`
      : '';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>${getSlotLabel(selectedSlot)}</h2>
      <div style="padding:8px;background:var(--bg-panel);border-radius:8px;margin-bottom:8px">
        <div style="font-size:13px">\ud604\uc7ac: <strong>${currentName}</strong></div>
        ${currentStats ? `<div style="font-size:12px;color:var(--text-dim)">${currentStats}</div>` : ''}
        ${degHtml}
      </div>
    `;

    // Unequip button
    if (currentId) {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'btn';
      unequipBtn.style.cssText = 'width:100%;margin-bottom:8px;color:var(--accent)';
      unequipBtn.textContent = '\ud574\uc81c\ud558\uae30';
      unequipBtn.addEventListener('click', () => {
        unequip(selectedSlot!);
        renderSlotDetail(el);
      });
      wrap.appendChild(unequipBtn);
    }

    // Candidates
    const candidates = getEquipCandidates(selectedSlot);
    if (candidates.length > 0) {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:4px';
      label.textContent = `\uc7a5\ucc29 \uac00\ub2a5 (${candidates.length})`;
      wrap.appendChild(label);

      const list = document.createElement('div');
      list.className = 'menu-buttons';
      candidates.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'text-align:left;display:flex;justify-content:space-between';
        const cDeg = session.knowledge.withdrawnItemDegradation.get(c.id) ?? 0;
        const cDegLabel = cDeg > 0 ? ` <span style="color:#e17055;font-size:11px">열화-${Math.round(cDeg)}%</span>` : '';
        btn.innerHTML = `<span>${i + 1}. ${c.name}${cDegLabel}</span><span style="color:var(--success);font-size:12px">${c.stats}</span>`;
        btn.addEventListener('click', () => {
          equip(selectedSlot!, c.id);
          renderSlotDetail(el);
        });
        list.appendChild(btn);
      });
      wrap.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '\uc7a5\ucc29 \uac00\ub2a5\ud55c \uc544\uc774\ud15c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.';
      wrap.appendChild(empty);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esc \ub4a4\ub85c';
    wrap.appendChild(hint);

    el.appendChild(wrap);
    wrap.querySelector('[data-back]')?.addEventListener('click', () => { selectedSlot = null; renderMain(el); });
  }

  return {
    id: 'equipment',
    render(el) {
      if (selectedSlot) renderSlotDetail(el);
      else renderMain(el);
    },
    onKey(key) {
      const container = document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (selectedSlot) { selectedSlot = null; renderMain(container); }
        else onDone();
        return;
      }

      if (!selectedSlot) {
        const slots: EquipSlot[] = ['weapon', 'armor', 'accessory', 'accessory2'];
        if (/^[1-4]$/.test(key)) {
          selectedSlot = slots[parseInt(key, 10) - 1];
          renderSlotDetail(container);
        }
      } else {
        if (/^[1-9]$/.test(key)) {
          const candidates = getEquipCandidates(selectedSlot);
          const idx = parseInt(key, 10) - 1;
          if (idx < candidates.length) {
            equip(selectedSlot, candidates[idx].id);
            renderSlotDetail(container);
          }
        }
      }
    },
  };
}
