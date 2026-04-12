import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { ItemType } from '../../types/enums';
import { applyRecovery, computeEatEffect } from '../../types/eat-system';
import { getArmorDef, getItemDef, getWeaponDef, categoryName, type ItemDef } from '../../types/item-defs';
import { getRaceCapabilitySet, parseTags } from '../../types/tag-system';
import { advanceTurn } from '../../systems/world-simulation';

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

function getEquipSlotForItemId(itemId: string): EquipSlot | null {
  const weapon = getWeaponDef(itemId);
  if (weapon) return 'weapon';
  const armor = getArmorDef(itemId);
  if (!armor) return null;
  return armor.type === 'Accessory' ? 'accessory' : 'armor';
}

export function createInventoryScreen(
  session: GameSession,
  onDone: () => void,
  onSpecialItemUse?: (itemId: string) => void,
): Screen {
  const p = session.player;
  let selectedSlot: EquipSlot | null = null;
  let consumeSection: 'food' | 'other' | null = null;
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

  function getCarryEntryDetail(entry: CarryEntry): string {
    if (entry.consumable) {
      const warning = getConsumeWarning(entry);
      return warning ? `사용/식사 가능 · ${warning}` : '사용/식사 가능';
    }
    return entry.detail || '장비는 위 슬롯에서 변경';
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

  function isEquipmentEntry(entry: CarryEntry): boolean {
    return entry.kind === 'item' && getEquipSlotForItemId(entry.id) !== null;
  }

  function isFoodEntry(entry: CarryEntry): boolean {
    if (isEquipmentEntry(entry)) return false;
    if (entry.kind === 'category') return entry.itemType === ItemType.Food;
    return entry.def?.category === ItemType.Food;
  }

  function getSectionEntries(section: 'food' | 'other'): CarryEntry[] {
    return getCarryEntries().filter(entry => {
      if (isEquipmentEntry(entry)) return false;
      return section === 'food' ? isFoodEntry(entry) : !isFoodEntry(entry);
    });
  }

  function getSectionSummary(section: 'food' | 'other'): string {
    const entries = getSectionEntries(section);
    if (entries.length === 0) return '비어 있음';
    const preview = entries.slice(0, 2).map(entry => entry.label).join(', ');
    const extra = entries.length > 2 ? ` 외 ${entries.length - 2}종` : '';
    return `${preview}${extra}`;
  }

  function closeResult(el: HTMLElement): void {
    const statusLine = resultStats.length > 0 ? `${resultMessage} · ${resultStats.join(' · ')}` : resultMessage;
    statusMessage = statusLine;
    showResult = false;
    resultMessage = '';
    resultStats = [];
    if (consumeSection === null) consumeSection = 'food';
    render(el);
  }

  function doConsume(entry: CarryEntry, el: HTMLElement): void {
    // pioneer_plan 특수 처리
    if (entry.kind === 'item' && entry.id === 'pioneer_plan') {
      if (session.knowledge.hasVillage()) {
        statusMessage = '이미 개척 마을이 존재한다. 다시 건설할 수 없다.';
        render(el);
        return;
      }
      if (onSpecialItemUse) {
        onSpecialItemUse('pioneer_plan');
      }
      return;
    }

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

    const applied = applyRecovery(p, { tp, hp, mp, mood });

    advanceTurn(
      10,
      session.gameTime,
      session.world,
      session.events,
      session.actors,
      session.playerIdx,
      session.backlog,
      session.social,
      session.knowledge,
    );
    session.backlog.add(session.gameTime, `${p.name}: ${message}`, '행동');

    if (statusEffect === 'poison') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 중독되었다!`, '시스템');
    } else if (statusEffect === 'stomachache') {
      session.backlog.add(session.gameTime, `${p.name}이(가) 배탈이 났다!`, '시스템');
    }

    const statLines: string[] = [];
    if (applied.tp > 0) statLines.push(`TP +${applied.tp}`);
    else if (applied.tp < 0) statLines.push(`TP ${applied.tp}`);
    if (applied.hp > 0) statLines.push(`HP +${applied.hp}`);
    else if (applied.hp < 0) statLines.push(`HP ${applied.hp}`);
    if (applied.mp > 0) statLines.push(`MP +${applied.mp}`);
    else if (applied.mp < 0) statLines.push(`MP ${applied.mp}`);
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
      <div style="font-size:12px;color:var(--text-dim)">장비</div>
      <div class="menu-buttons">
        ${slots.map((slot, index) => `
          <button class="btn inventory-main-btn" data-slot="${slot}">
            <span class="inventory-main-title">${index + 1}. ${getSlotLabel(slot)}</span>
            <span class="inventory-main-subtitle">${getEquippedName(slot)}</span>
            <span class="inventory-main-subtitle">${getEquippedStats(slot) || '장착 없음'}</span>
          </button>
        `).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-dim)">음식</div>
      <div class="menu-buttons">
        <button class="btn inventory-main-btn" data-open-section="food">
          <span class="inventory-main-title">5. 음식 목록</span>
          <span class="inventory-main-subtitle">${getSectionSummary('food')}</span>
        </button>
      </div>
      <div style="font-size:12px;color:var(--text-dim)">기타</div>
      <div class="menu-buttons">
        <button class="btn inventory-main-btn" data-open-section="other">
          <span class="inventory-main-title">6. 기타 목록</span>
          <span class="inventory-main-subtitle">${getSectionSummary('other')}</span>
        </button>
      </div>
      <p class="hint">1~4=장비, 5=음식, 6=기타, Esc=닫기</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
    wrap.querySelectorAll<HTMLButtonElement>('[data-open-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        consumeSection = (btn.dataset.openSection as 'food' | 'other') ?? null;
        render(el);
      });
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
    const section = consumeSection ?? 'food';
    const entries = getSectionEntries(section);
    const title = section === 'food' ? '음식' : '기타';

    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>${title}</h2>
      ${entries.length === 0 ? '<p class="hint">가방이 비어 있다.</p>' : `
        <div class="inventory-entry-list">
          ${entries.map((entry, index) => `
            <button class="btn inventory-entry-btn" data-carry-entry="${index}">
              <span class="inventory-entry-top">
                <span class="inventory-entry-title">${index + 1}. ${entry.label}</span>
                <span class="inventory-entry-count">x${entry.qty}</span>
              </span>
              <span class="inventory-entry-detail">${getCarryEntryDetail(entry)}</span>
            </button>
          `).join('')}
        </div>
      `}
      <p class="hint">1~9 선택, Esc=소지품으로</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      consumeSection = null;
      render(el);
    });
    wrap.querySelectorAll<HTMLButtonElement>('[data-carry-entry]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.carryEntry ?? '-1', 10);
        if (idx < 0 || idx >= entries.length) return;
        const entry = entries[idx];
        if (entry.consumable) {
          doConsume(entry, el);
          return;
        }
        if (entry.kind === 'item') {
          const slot = getEquipSlotForItemId(entry.id);
          if (slot) {
            selectedSlot = slot;
            consumeSection = null;
            render(el);
            return;
          }
        }
        statusMessage = '이 소지품은 바로 사용할 수 없다.';
        render(el);
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
            <button class="btn inventory-main-btn" data-equip="${index}">
              <span class="inventory-main-title">${index + 1}. ${candidate.name}</span>
              <span class="inventory-main-subtitle" style="color:var(--success)">${candidate.stats}</span>
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
    if (consumeSection) {
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

      if (consumeSection) {
        if (key === 'Escape') {
          consumeSection = null;
          render(container);
          return;
        }
        if (/^[1-9]$/.test(key)) {
          const entries = getSectionEntries(consumeSection);
          const idx = parseInt(key, 10) - 1;
          if (idx < entries.length) {
            const entry = entries[idx];
            if (entry.consumable) {
              doConsume(entry, container);
              return;
            }
            if (entry.kind === 'item') {
              const slot = getEquipSlotForItemId(entry.id);
              if (slot) {
                selectedSlot = slot;
                consumeSection = null;
                render(container);
                return;
              }
            }
            statusMessage = '이 소지품은 바로 사용할 수 없다.';
            render(container);
          }
        }
        return;
      }

      if (key === 'Escape') {
        onDone();
        return;
      }
      const slotMap: Record<string, EquipSlot> = {
        '1': 'weapon',
        '2': 'armor',
        '3': 'accessory',
        '4': 'accessory2',
      };
      const slot = slotMap[key];
      if (slot) {
        selectedSlot = slot;
        render(container);
        return;
      }
      if (key === '5') {
        consumeSection = 'food';
        render(container);
        return;
      }
      if (key === '6') {
        consumeSection = 'other';
        render(container);
      }
    },
  };
}
