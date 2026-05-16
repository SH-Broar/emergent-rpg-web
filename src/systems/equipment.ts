/**
 * 장비 시스템 (M9 + Round2).
 *
 * 장착/해제/검증/카스케이드/effectiveColors/bonusesFromEffective.
 *
 * 핵심 사양:
 *  - RunState.colors는 *베이스* 유지 (이벤트/유물 누적). 건드리지 않음.
 *  - effective = base + 장착 장비 colorEffects 합산 (음수 가능).
 *  - 장착 시점에 *해당 슬롯 교체 후 effective*가 모든 8 컬러 ≥ 0 이어야 허용.
 *  - 해제로 음수 컬러 발생 시 카스케이드: 가장 큰 음수 절댓값 → 슬롯 알파벳 역순.
 *  - culprit 없을 때까지 반복 (while). 단조 감소 — 무한루프 불가.
 *
 * 토스트는 UI 호출자가 처리. 시스템은 mutation + 결과 데이터 반환.
 *
 * Round2 (2026-05-16):
 *  - B1 fix: bonusesFromEffective 헬퍼 추가 — combat/CombatView/BossView/DeckPanel이 base 대신 effective 사용해야 장비 효과가 실제 전투에 반영.
 *  - W1 fix: cascade `for (let i = 0; i < 3; i++)` → `while (true)` + 단조성 주석.
 */

import type {
  ColorValues,
  Element,
  Equipment,
  EquipmentSlot,
  RunState,
} from '@/data/schemas';
import { bonusesFromColors, type CombatBonuses } from './stats';

/** 8 컬러 키 (장비 효과는 8키 어디든 허용). */
const EIGHT_COLORS: Element[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];

/** UI 표시용 6 컬러 (계획서: 불·전기·흙·철·물·바람). 절대 순서 보존. */
export const SIX_COLORS_UI: Element[] = ['fire', 'electric', 'earth', 'iron', 'water', 'wind'];

const COLOR_LABELS: Record<Element, string> = {
  fire: '불',
  electric: '전기',
  earth: '흙',
  iron: '철',
  water: '물',
  wind: '바람',
  light: '빛',
  dark: '어둠',
};

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: '무기',
  chest: '상의',
  accessory: '악세서리',
};

export function labelOfColor(c: Element): string {
  return COLOR_LABELS[c] ?? c;
}

export function labelOfSlot(s: EquipmentSlot): string {
  return SLOT_LABELS[s] ?? s;
}

/** 슬롯 키 매핑. */
function slotField(slot: EquipmentSlot): 'equippedWeapon' | 'equippedChest' | 'equippedAccessory' {
  switch (slot) {
    case 'weapon': return 'equippedWeapon';
    case 'chest': return 'equippedChest';
    case 'accessory': return 'equippedAccessory';
  }
}

/** 인벤토리 + 장착 슬롯 양쪽 조회용 — equipmentId → Equipment. */
function findEquipment(run: RunState, equipments: Map<string, Equipment>, id: string | null): Equipment | undefined {
  if (!id) return undefined;
  const inMap = equipments.get(id);
  if (inMap) return inMap;
  return run.equipmentInventory.find((e) => e.id === id);
}

/** 현재 장착 중인 장비 목록. */
function equippedList(run: RunState, equipments: Map<string, Equipment>): Equipment[] {
  const out: Equipment[] = [];
  for (const slot of ['weapon', 'chest', 'accessory'] as EquipmentSlot[]) {
    const id = run[slotField(slot)];
    const eq = findEquipment(run, equipments, id);
    if (eq) out.push(eq);
  }
  return out;
}

/** 지정 슬롯 제외한 장착 장비 (가상 장착 비교용). */
function equippedListExcept(run: RunState, equipments: Map<string, Equipment>, exceptSlot: EquipmentSlot): Equipment[] {
  return equippedList(run, equipments).filter((e) => e.slot !== exceptSlot);
}

function getEquipped(run: RunState, equipments: Map<string, Equipment>, slot: EquipmentSlot): Equipment | undefined {
  return findEquipment(run, equipments, run[slotField(slot)]);
}

function setSlot(run: RunState, slot: EquipmentSlot, id: string | null) {
  run[slotField(slot)] = id;
}

/**
 * 베이스 + 장착 합산 — 음수 가능.
 * calculateStat이 Math.max(0,...) 처리하므로 stats 도출에 안전.
 */
export function effectiveColors(run: RunState, equipments: Map<string, Equipment>): ColorValues {
  const base: ColorValues = { ...run.colors };
  for (const eq of equippedList(run, equipments)) {
    for (const ce of eq.colorEffects) {
      base[ce.color] = (base[ce.color] ?? 0) + ce.value;
    }
  }
  return base;
}

/**
 * 전투/카드 표시용 — effective(베이스+장비) 컬러로부터 CombatBonuses 도출.
 *
 * combat.ts / CombatView / BossView / DeckPanel에서 베이스가 아닌 *effective*를 써야
 * 장비 효과가 실제 전투에 반영된다 (B1 fix, 2026-05-16).
 */
export function bonusesFromEffective(
  run: RunState,
  equipments: Map<string, Equipment>,
): CombatBonuses {
  return bonusesFromColors(effectiveColors(run, equipments));
}

/** 가상 장착 결과 effective (slot 교체 가정). */
function trialEffective(run: RunState, equipments: Map<string, Equipment>, newEq: Equipment): ColorValues {
  const trial: ColorValues = { ...run.colors };
  for (const eq of equippedListExcept(run, equipments, newEq.slot)) {
    for (const ce of eq.colorEffects) {
      trial[ce.color] = (trial[ce.color] ?? 0) + ce.value;
    }
  }
  for (const ce of newEq.colorEffects) {
    trial[ce.color] = (trial[ce.color] ?? 0) + ce.value;
  }
  return trial;
}

/**
 * 장착 시도. 성공 시 인벤토리에서 제거 + 슬롯에 장착, 기존 슬롯 장비는 인벤토리로.
 * 실패 시 reason과 부족 컬러 반환 — 호출자가 토스트.
 */
export function tryEquip(
  run: RunState,
  equipments: Map<string, Equipment>,
  newEq: Equipment,
): { ok: true } | { ok: false; failingColor: Element } {
  const trial = trialEffective(run, equipments, newEq);
  for (const k of EIGHT_COLORS) {
    if ((trial[k] ?? 0) < 0) {
      return { ok: false, failingColor: k };
    }
  }
  const prev = getEquipped(run, equipments, newEq.slot);
  if (prev) run.equipmentInventory.push(prev);
  // 정책 (Round3 W3/⚠1): 인벤토리에 같은 id 최대 1개 보장 → 참조 또는 id 매칭으로 한 점만 제거.
  // 만약 중복이 들어와 있다면 호출자 책임이며 여기서는 *처음 매칭 1개*만 제거한다.
  const idx = run.equipmentInventory.findIndex((e) => e === newEq || e.id === newEq.id);
  if (idx >= 0) run.equipmentInventory.splice(idx, 1);
  setSlot(run, newEq.slot, newEq.id);
  return { ok: true };
}

/**
 * 해제. 인벤토리로 돌리고 카스케이드 평가.
 * 카스케이드로 추가 해제된 장비 목록을 반환 — 호출자가 토스트.
 */
export function unequip(
  run: RunState,
  equipments: Map<string, Equipment>,
  slot: EquipmentSlot,
): { removed: Equipment[] } {
  const prev = getEquipped(run, equipments, slot);
  if (!prev) return { removed: [] };
  run.equipmentInventory.push(prev);
  setSlot(run, slot, null);
  return { removed: recomputeAndCascadeUnequip(run, equipments) };
}

/**
 * 카스케이드 자동 해제 — effective의 음수 컬러를 만든 장비를 우선순위 따라 해제.
 *
 * 우선순위:
 *   1) 가장 큰 음수 절댓값 컬러
 *   2) 그 컬러에 음수 효과를 가진 장비 중 *절댓값 가장 큰 것*
 *   3) 동률은 슬롯 알파벳 역순 (accessory → chest → weapon)
 *
 * 종료 조건 (W1, Round2): culprit 없을 때까지 반복 (while).
 * 단조성: 매 반복에서 *culprit이 발견되면 1개 해제* → 그 컬러 effective 합계가 단조 증가.
 * culprit 없으면 즉시 break — 슬롯 수와 무관하게 안전, 무한루프 불가.
 */
export function recomputeAndCascadeUnequip(
  run: RunState,
  equipments: Map<string, Equipment>,
): Equipment[] {
  const removed: Equipment[] = [];
  while (true) {
    const eff = effectiveColors(run, equipments);
    let worstColor: Element | null = null;
    let worstValue = 0;
    for (const k of EIGHT_COLORS) {
      const v = eff[k] ?? 0;
      if (v < worstValue) {
        worstValue = v;
        worstColor = k;
      }
    }
    if (!worstColor) break;
    const culpritsRanked = equippedList(run, equipments)
      .filter((eq) => eq.colorEffects.some((ce) => ce.color === worstColor && ce.value < 0))
      .map((eq) => {
        const effForColor = eq.colorEffects.find((ce) => ce.color === worstColor)?.value ?? 0;
        return { eq, absVal: Math.abs(effForColor) };
      })
      .sort((a, b) => {
        if (b.absVal !== a.absVal) return b.absVal - a.absVal;
        return b.eq.slot.localeCompare(a.eq.slot);
      });
    const culprit = culpritsRanked[0]?.eq;
    if (!culprit) break; // 안전장치: 베이스 컬러가 음수인 경우 (장비 해제로도 해소 불가)
    run.equipmentInventory.push(culprit);
    setSlot(run, culprit.slot, null);
    removed.push(culprit);
  }
  return removed;
}
