import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType } from '../../types/enums';
import { computeEatEffect } from '../../types/eat-system';
import { getArmorDef, getItemDef, getWeaponDef, categoryName, type ItemDef } from '../../types/item-defs';
import { getRaceCapabilitySet, parseTags } from '../../types/tag-system';

type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'accessory2';
type CarryEntry =
  | {
    kind: 'item';
    id: string;
    qty: number;
    label: string;
    detail: string;
    consumable: boolean;
    sortGroup: number;
    def?: ItemDef;
  }
  | {
    kind: 'category';
    itemType: ItemType;
    qty: number;
    label: string;
    detail: string;
    consumable: boolean;
    sortGroup: number;
  };

function buffLabel(type: string): string {
  switch (type) {
    case 'attack': return '공격력';
    case 'defense': return '방어력';
    case 'tp_regen': return 'TP 재생';
    case 'mp_regen': return 'MP 재생';
    case 'speed': return '이동속도';
    default: return type;
  }
}

function getSlotLabel(slot: EquipSlot): string {
  switch (slot) {
    case 'weapon': return '⚔ 무기';
    case 'armor': return '🛡 방어구';
    case 'accessory': return '💍 악세서리 1';
    case 'accessory2': return '💍 악세서리 2';
  }
}

export function createInventoryScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let selectedSlot: EquipSlot | null = null;
  let consumeMode = false;
  let showResult = false;
  let statusMessage = '';
  let resultMessage = '';
  let resultStats: string[] = [];

  function getEquippedId(slot: EquipSlot): string {
    switch (slot) {
      case 'weapon': return p.equippedWeapon;
      case 'armor': return p.equippedArmor;
      case 'accessory': return p.equippedAccessory;
      case 'accessory2': return p.equippedAccessory2;
    }
  }

  function setEquip(slot: EquipSlot, id: string): void {
    switch (slot) {
      case 'weapon': p.equippedWeapon = id; break;
      case 'armor': p.equippedArmor = id; break;
      case 'accessory': p.equippedAccessory = id; break;
      case 'accessory2': p.equippedAccessory2 = id; break;
    }
  }

  function getEquippedName(slot: EquipSlot): string {
    const id = getEquippedId(slot);
    if (!id) return '없음';
    if (slot === 'weapon') return getWeaponDef(id)?.name ?? id;
    return getArmorDef(id)?.name ?? id;
  }

  function getEquippedStats(slot: EquipSlot): string {
    const id = getEquippedId(slot);
    if (!id) return '';
    if (slot === 'weapon') {
      const w = getWeaponDef(id);
      if (!w) return '';
      return `공격+${w.attack}${w.magicBonus ? ` 마력+${w.magicBonus}` : ''}${w.speed ? ` 속도${w.speed}` : ''}`;
    }
    const a = getArmorDef(id);
    if (!a) return '';
    return `방어+${a.defense}${a.magicDefense ? ` 마방+${a.magicDefense}` : ''}${a.evasion ? ` 회피+${a.evasion}` : ''}`;
  }

  function unequip(slot: EquipSlot): void {
    const id = getEquippedId(slot);
    if (!id) return;
    p.addItemById(id, 1);
    setEquip(slot, '');
    statusMessage = `${getSlotLabel(slot)} 장비를 해제했다.`;
  }

  function equip(slot: EquipSlot, itemId: string): void {
    const currentId = getEquippedId(slot);
    if (currentId) p.addItemById(currentId, 1);
    if (!p.removeItemById(itemId, 1)) return;
    setEquip(slot, itemId);
    const itemName = slot === 'weapon'
      ? (getWeaponDef(itemId)?.name ?? itemId)
      : (getArmorDef(itemId)?.name ?? itemId);
    statusMessage = `${itemName} 장비 완료`;
  }

  function getEquipCandidates(slot: EquipSlot): { id: string; name: string; stats: string }[] {
    const candidates: { id: string; name: string; stats: string }[] = [];
    for (const [itemId, count] of p.items) {
      if (count <= 0) continue;
      if (slot === 'weapon') {
        const w = getWeaponDef(itemId);
        if (!w) continue;
        candidates.push({
          id: itemId,
          name: w.name,
          stats: `공+${w.attack}${w.magicBonus ? ` 마+${w.magicBonus}` : ''}${w.speed ? ` 속도${w.speed}` : ''}`,
        });
        continue;
      }
      const a = getArmorDef(itemId);
      if (!a) continue;
      if (slot === 'armor' && a.type === 'Accessory') continue;
      if ((slot === 'accessory' || slot === 'accessory2') && a.type !== 'Accessory') continue;
      candidates.push({
        id: itemId,
        name: a.name,
        stats: `방+${a.defense}${a.magicDefense ? ` 마방+${a.magicDefense}` : ''}${a.evasion ? ` 회피+${a.evasion}` : ''}`,
      });
    }
    return candidates;
  }

  function getCarryEntries(): CarryEntry[] {
    const entries: CarryEntry[] = [];

    for (const [id, qty] of p.items) {
      if (qty <= 0) continue;
      const def = getItemDef(id);
      const weapon = getWeaponDef(id);
      const armor = getArmorDef(id);
      const isEquipment = !!weapon || !!armor;
      const detail = weapon
        ? `장비 · 공+${weapon.attack}${weapon.magicBonus ? ` · 마+${weapon.magicBonus}` : ''}`
        : armor
          ? `장비 · 방+${armor.defense}${armor.magicDefense ? ` · 마방+${armor.magicDefense}` : ''}`
          : def?.description ?? '';
      entries.push({
        kind: 'item',
        id,
        qty,
        label: weapon?.name ?? armor?.name ?? def?.name ?? id,
        detail,
        consumable: !isEquipment,
        sortGroup: isEquipment ? 10 : 100 + (def?.category ?? 0),
        def,
      });
    }

    for (const [itemType, qty] of p.spirit.inventory) {
      if (qty <= 0) continue;
      entries.push({
        kind: 'category',
        itemType,
        qty,
        label: categoryName(itemType),
        detail: '분류형 소지품',
        consumable: itemType !== ItemType.Equipment && itemType !== ItemType.GuildCard,
        sortGroup: 200 + itemType,
      });
    }

    entries.sort((a, b) => {
      if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
      return a.label.localeCompare(b.label, 'ko');
    });
    return entries;
  }

  function getConsumableEntries(): CarryEntry[] {
    return getCarryEntries().filter(entry => entry.consumable);
  }

  function getConsumeWarning(entry: CarryEntry): string {
    if (entry.kind !== 'item') return entry.detail;
    const def = entry.def;
    const raceTags = getRaceCapabilitySet(p.base.race);
    const itemTags = parseTags(def?.tags ?? '');
    if (raceTags.has('potion_only') && !itemTags.has('liquid')) return '비물질 존재라 섭취할 수 없다.';
    if (!raceTags.has('digest_all') && itemTags.has('inedible')) return '먹기에 적합해 보이지 않는다.';
    if (itemTags.has('raw')) return '날것이다.';
    return def?.description ?? '';
  }

  function closeResult(el: HTMLElement): void {
    const statusLine = resultStats.length > 0 ? `${resultMessage} · ${resultStats.join(' · ')}` : resultMessage;
    statusMessage = statusLine;
    showResult = false;
    resultMessage = '';
    resultStats = [];
    consumeMode = false;
    render(el);
  }

  function doConsume(entry: CarryEntry, el: HTMLElement): void {
    const removed = entry.kind === 'item'
      ? p.removeItemById(entry.id, 1)
      : p.consumeItem(entry.itemType, 1);
    if (!removed) {
      statusMessage = '아이템이 없다!';
      render(el);
      return;
    }

    const def = entry.kind === 'item' ? getItemDef(entry.id) : undefined;
    let tp = 0;
    let hp = 0;
    let mp = 0;
    let mood = 0;
    let message = '';
    let statusEffect: 'poison' | 'stomachache' | undefined;
    let pendingBuffType = '';
    let pendingBuffAmount = 0;
    let pendingBuffDuration = 0;
    const isNight = session.gameTime.hour >= 21 || session.gameTime.hour < 5;

    if (def && (def.eatVigor !== 0 || def.eatHp !== 0 || def.eatMp !== 0 || def.eatMood !== 0 || def.eatMessage)) {
      tp = Math.round(def.eatVigor / 10);
      hp = def.eatHp;
      mp = def.eatMp;
      mood = def.eatMood;
      message = def.eatMessage || `${def.name}을(를) 사용했다.`;
      statusEffect = (def.eatStatus as 'poison' | 'stomachache' | undefined) || undefined;
      if (def.eatBuffType && def.eatBuffDuration > 0) {
        pendingBuffType = def.eatBuffType;
        pendingBuffAmount = def.eatBuffAmount;
        pendingBuffDuration = def.eatBuffDuration;
      }
    } else {
      const fallbackType = entry.kind === 'category' ? entry.itemType : (def?.category ?? ItemType.Food);
      const result = computeEatEffect(fallbackType, p.base.race, def?.tags ?? '', isNight);
      tp = result.tp;
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

    if (tp) p.adjustAp(tp);
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

    const statLines: string[] = [];
    if (tp > 0) statLines.push(`TP +${tp}`);
    else if (tp < 0) statLines.push(`TP ${tp}`);
    if (hp > 0) statLines.push(`HP +${hp}`);
    else if (hp < 0) statLines.push(`HP ${hp}`);
    if (mp > 0) statLines.push(`MP +${mp}`);
    else if (mp < 0) statLines.push(`MP ${mp}`);
    if (statusEffect === 'poison') statLines.push('중독!');
    if (statusEffect === 'stomachache') statLines.push('배탈!');

    if (pendingBuffType && pendingBuffDuration > 0) {
      session.playerBuffs.push({
        type: pendingBuffType,
        amount: pendingBuffAmount,
        remainingTurns: pendingBuffDuration,
      });
      statLines.push(`${buffLabel(pendingBuffType)} +${pendingBuffAmount} (${pendingBuffDuration}턴)`);
    }

    resultMessage = message;
    resultStats = statLines;
    showResult = true;
    render(el);
  }

  function renderMain(el: HTMLElement): void {
    const entries = getCarryEntries();
    const bagCount = entries.reduce((sum, entry) => sum + entry.qty, 0);
    const bagCap = session.knowledge.bagCapacity ?? 10;
    const slots: EquipSlot[] = ['weapon', 'armor', 'accessory', 'accessory2'];

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>소지품</h2>
      ${statusMessage ? `<div class="trade-message" style="color:var(--warning)">${statusMessage}</div>` : ''}
      <div style="font-size:12px;color:var(--text-dim);text-align:center">
        가방 ${bagCount}/${bagCap}칸 · 공격 ${p.getEffectiveAttack().toFixed(1)} · 방어 ${p.getEffectiveDefense().toFixed(1)} · 💰${p.spirit.gold}G
      </div>
      <div class="menu-buttons" style="margin-top:4px">
        <button class="btn" data-consume>1. 사용 / 식사</button>
      </div>
      <div style="font-size:12px;color:var(--text-dim)">장착 중</div>
      <div class="menu-buttons">
        ${slots.map((slot, index) => `
          <button class="btn" data-slot="${slot}" style="text-align:left">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <span>${index + 2}. <strong>${getSlotLabel(slot)}</strong></span>
              <span>${getEquippedName(slot)}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${getEquippedStats(slot) || '장착 없음'}</div>
          </button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-dim)">전체 보유품</div>
      ${entries.length === 0 ? '<p class="hint">가방이 비어 있다.</p>' : `
        <div class="inv-grid" style="max-height:38vh;overflow-y:auto">
          ${entries.map(entry => `
            <div class="inv-item">
              <span class="inv-name">${entry.label}</span>
              <span class="inv-count">x${entry.qty}${entry.detail ? ` · ${entry.detail}` : ''}</span>
            </div>
          `).join('')}
        </div>
      `}
      <p class="hint">1=사용/식사, 2~5=장비 슬롯, Esc=닫기</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
    wrap.querySelector('[data-consume]')?.addEventListener('click', () => {
      consumeMode = true;
      render(el);
    });
    wrap.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSlot = btn.dataset.slot as EquipSlot;
        render(el);
      });
    });

    el.appendChild(wrap);
  }

  function renderConsume(el: HTMLElement): void {
    const entries = getConsumableEntries();

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>사용 / 식사</h2>
      <p style="color:var(--text-dim);font-size:12px;text-align:center">음식, 재료, 약초, 물약 등을 여기서 사용한다.</p>
      ${entries.length === 0 ? '<p class="hint">사용할 수 있는 소지품이 없습니다.</p>' : `
        <div class="npc-list">
          ${entries.map((entry, index) => `
            <button class="btn npc-item" data-consume-entry="${index}">
              <span class="npc-num">${index + 1}.</span>
              <span class="npc-name-row">
                <span class="npc-name">${entry.label} x${entry.qty}</span>
              </span>
              <span class="npc-detail">${getConsumeWarning(entry)}</span>
            </button>
          `).join('')}
        </div>
      `}
      <p class="hint">1~9 선택, Esc=소지품으로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      consumeMode = false;
      render(el);
    });
    wrap.querySelectorAll<HTMLButtonElement>('[data-consume-entry]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.consumeEntry ?? '-1', 10);
        if (idx >= 0 && idx < entries.length) doConsume(entries[idx], el);
      });
    });

    el.appendChild(wrap);
  }

  function renderSlotDetail(el: HTMLElement): void {
    if (!selectedSlot) {
      renderMain(el);
      return;
    }

    const currentId = getEquippedId(selectedSlot);
    const currentName = getEquippedName(selectedSlot);
    const currentStats = getEquippedStats(selectedSlot);
    const candidates = getEquipCandidates(selectedSlot);

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>${getSlotLabel(selectedSlot)}</h2>
      ${statusMessage ? `<div class="trade-message" style="color:var(--warning)">${statusMessage}</div>` : ''}
      <div style="padding:8px;background:var(--bg-panel);border-radius:8px">
        <div style="font-size:13px">현재: <strong>${currentName}</strong></div>
        ${currentStats ? `<div style="font-size:12px;color:var(--text-dim)">${currentStats}</div>` : ''}
      </div>
      ${currentId ? '<button class="btn" data-unequip style="color:var(--accent)">장비 해제</button>' : ''}
      ${candidates.length > 0 ? `
        <div style="font-size:12px;color:var(--text-dim)">장착 가능 (${candidates.length})</div>
        <div class="menu-buttons">
          ${candidates.map((candidate, index) => `
            <button class="btn" data-equip="${index}" style="text-align:left">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <span>${index + 1}. ${candidate.name}</span>
                <span style="color:var(--success);font-size:12px">${candidate.stats}</span>
              </div>
            </button>
          `).join('')}
        </div>
      ` : '<p class="hint">장착 가능한 아이템이 없습니다.</p>'}
      <p class="hint">1~9 장착, Esc=소지품으로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      selectedSlot = null;
      render(el);
    });
    wrap.querySelector('[data-unequip]')?.addEventListener('click', () => {
      if (!selectedSlot) return;
      unequip(selectedSlot);
      render(el);
    });
    wrap.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.equip ?? '-1', 10);
        if (idx >= 0 && idx < candidates.length) {
          equip(selectedSlot!, candidates[idx].id);
          render(el);
        }
      });
    });

    el.appendChild(wrap);
  }

  function renderResult(el: HTMLElement): void {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <h2>사용 결과</h2>
      <div class="trade-message" style="color:var(--success);font-size:15px">${resultMessage}</div>
      ${resultStats.length > 0 ? `<div style="color:var(--warning);font-size:13px;text-align:center">${resultStats.join(' · ')}</div>` : ''}
      <div style="color:var(--text-dim);font-size:12px;text-align:center">
        HP ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}
        · MP ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}
        · TP ${p.base.ap}/${p.getEffectiveMaxAp()}
      </div>
      <button class="btn btn-primary" data-ok style="min-width:140px;align-self:center">확인 [Enter]</button>
    `;
    wrap.querySelector('[data-ok]')?.addEventListener('click', () => closeResult(el));
    el.appendChild(wrap);
  }

  function render(el: HTMLElement): void {
    if (showResult) {
      renderResult(el);
      return;
    }
    if (selectedSlot) {
      renderSlotDetail(el);
      return;
    }
    if (consumeMode) {
      renderConsume(el);
      return;
    }
    renderMain(el);
  }

  return {
    id: 'inventory',
    render,
    onKey(key) {
      const container = document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (showResult) {
        if (key === 'Enter' || key === ' ' || key === 'Escape') closeResult(container);
        return;
      }

      if (selectedSlot) {
        if (key === 'Escape') {
          selectedSlot = null;
          render(container);
          return;
        }
        if (key === 'u' || key === 'U') {
          unequip(selectedSlot);
          render(container);
          return;
        }
        if (/^[1-9]$/.test(key)) {
          const candidates = getEquipCandidates(selectedSlot);
          const idx = parseInt(key, 10) - 1;
          if (idx < candidates.length) {
            equip(selectedSlot, candidates[idx].id);
            render(container);
          }
        }
        return;
      }

      if (consumeMode) {
        if (key === 'Escape') {
          consumeMode = false;
          render(container);
          return;
        }
        if (/^[1-9]$/.test(key)) {
          const entries = getConsumableEntries();
          const idx = parseInt(key, 10) - 1;
          if (idx < entries.length) doConsume(entries[idx], container);
        }
        return;
      }

      if (key === 'Escape') {
        onDone();
        return;
      }
      if (key === '1') {
        consumeMode = true;
        render(container);
        return;
      }
      const slotMap: Record<string, EquipSlot> = {
        '2': 'weapon',
        '3': 'armor',
        '4': 'accessory',
        '5': 'accessory2',
      };
      const slot = slotMap[key];
      if (slot) {
        selectedSlot = slot;
        render(container);
      }
    },
  };
}
