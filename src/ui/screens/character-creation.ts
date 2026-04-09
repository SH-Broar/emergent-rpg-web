// character-creation.ts — 캐릭터 생성 화면 (탄생 / 커스텀)
// 원본: CharacterCreation.cpp

import type { Screen } from '../screen-manager';
import { Actor } from '../../models/actor';
import {
  Race, SpiritRole, Element, ELEMENT_COUNT,
  raceName, spiritRoleName, elementName, ItemType, traitName, Trait,
} from '../../types/enums';
import { Loc, LocationID } from '../../types/location';
import { randomInt, randomFloat } from '../../types/rng';
import { getTraitPool } from '../../models/color';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RACE_COUNT = Race.Count as number;
const ROLE_COUNT = SpiritRole.Count as number;

const BIRTH_RANDOM_LOCATIONS = [
  Loc.Alimes, Loc.Guild_Hall, Loc.Market_Square,
  Loc.Farm, Loc.Erumen_Seoncheon, Loc.Cyan_Dunes,
] as const;

/** Re-render helper: finds the parent container and calls renderFn. */
function rerender(screenClass: string, renderFn: (el: HTMLElement) => void): void {
  const container = document.querySelector(`.${screenClass}`)?.parentElement;
  if (container instanceof HTMLElement) renderFn(container);
}

/** Build a grid of buttons for enum values. */
function enumGrid<T extends number>(
  count: T,
  labelFn: (v: T) => string,
): string {
  const buttons: string[] = [];
  for (let i = 0; i < (count as number); i++) {
    buttons.push(
      `<button class="btn enum-btn" data-val="${i}" style="min-height:44px">${labelFn(i as T)}</button>`,
    );
  }
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${buttons.join('')}</div>`;
}

function bindEnumGrid(
  el: HTMLElement,
  onPick: (val: number) => void,
): void {
  el.querySelectorAll<HTMLButtonElement>('.enum-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      onPick(parseInt(btn.dataset.val!, 10));
    });
  });
}

function nameInputHtml(currentName: string): string {
  return `
    <label style="display:block;margin-bottom:8px;font-weight:bold">이름을 입력하세요</label>
    <input
      type="text"
      class="name-input"
      value="${escapeHtml(currentName)}"
      placeholder="이름"
      maxlength="20"
      style="background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:16px;width:100%;box-sizing:border-box"
    />
    <div class="menu-buttons" style="margin-top:12px">
      <button class="btn" data-action="cancel">취소</button>
      <button class="btn btn-primary" data-action="confirm-name" style="min-height:44px">확인 [Enter]</button>
    </div>
    <p class="hint">Enter 확인, Esc 취소</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =========================================================================
// Birth creation flow (탄생)
// =========================================================================

type BirthStep = 'name' | 'race' | 'start-method';

export function createBirthScreen(
  actors: Actor[],
  onComplete: (newActorIdx: number) => void,
  onCancel: () => void,
): Screen {
  let step: BirthStep = 'name';
  let charName = '';
  let charRace = Race.Human;

  const SCREEN_CLASS = 'birth-screen';

  function renderStep(el: HTMLElement): void {
    let body = '';

    switch (step) {
      case 'name':
        body = `
          <h2>탄생 - 빈 영혼</h2>
          <p>새로운 영혼이 세계에 깨어납니다.</p>
          ${nameInputHtml(charName)}`;
        break;

      case 'race':
        body = `
          <h2>탄생 - 종족 선택</h2>
          <p>영혼의 그릇을 고르세요.</p>
          ${enumGrid(RACE_COUNT as Race, raceName)}
          <div class="menu-buttons" style="margin-top:12px">
            <button class="btn" data-action="back" style="min-height:44px">뒤로</button>
            <button class="btn btn-primary" data-action="random-race" style="min-height:44px">무작위 [Enter]</button>
          </div>
          <p class="hint">종족을 선택하거나 Enter로 무작위 선택</p>`;
        break;

      case 'start-method':
        body = `
          <h2>탄생 - 시작 방식</h2>
          <p>어디에서 눈을 뜨시겠습니까?</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn start-btn" data-start="npc" style="min-height:44px;text-align:left;padding:12px">
              <strong>가장 가까운 사람의 곁에서</strong><br>
              <span class="hint" style="margin:0">가까운 NPC 옆에서 시작합니다</span>
            </button>
            <button class="btn start-btn" data-start="random" style="min-height:44px;text-align:left;padding:12px">
              <strong>운명의 바람에 맡기기</strong><br>
              <span class="hint" style="margin:0">무작위 직업과 장소로 시작합니다</span>
            </button>
            <button class="btn start-btn" data-start="spring" style="min-height:44px;text-align:left;padding:12px">
              <strong>기억의 샘 앞에 홀로</strong><br>
              <span class="hint" style="margin:0">기억의 샘에서 주민으로 시작합니다</span>
            </button>
          </div>
          <div class="menu-buttons" style="margin-top:12px">
            <button class="btn" data-action="back" style="min-height:44px">뒤로</button>
          </div>`;
        break;
    }

    el.innerHTML = `<div class="screen info-screen ${SCREEN_CLASS}">${body}</div>`;
    bindStep(el);
  }

  function bindStep(el: HTMLElement): void {
    switch (step) {
      case 'name': {
        const input = el.querySelector<HTMLInputElement>('.name-input');
        input?.focus();
        el.querySelector('[data-action="confirm-name"]')?.addEventListener('click', () => confirmName(input));
        el.querySelector('[data-action="cancel"]')?.addEventListener('click', onCancel);
        break;
      }
      case 'race': {
        bindEnumGrid(el, val => { charRace = val as Race; step = 'start-method'; rerender(SCREEN_CLASS, renderStep); });
        el.querySelector('[data-action="back"]')?.addEventListener('click', () => { step = 'name'; rerender(SCREEN_CLASS, renderStep); });
        el.querySelector('[data-action="random-race"]')?.addEventListener('click', () => {
          charRace = randomInt(0, RACE_COUNT - 1) as Race;
          step = 'start-method';
          rerender(SCREEN_CLASS, renderStep);
        });
        break;
      }
      case 'start-method': {
        el.querySelectorAll<HTMLButtonElement>('.start-btn').forEach(btn => {
          btn.addEventListener('click', () => finalizeBirth(btn.dataset.start!));
        });
        el.querySelector('[data-action="back"]')?.addEventListener('click', () => { step = 'race'; rerender(SCREEN_CLASS, renderStep); });
        break;
      }
    }
  }

  function confirmName(input: HTMLInputElement | null): void {
    const val = input?.value.trim() ?? '';
    if (val.length === 0) return;
    charName = val;
    step = 'race';
    rerender(SCREEN_CLASS, renderStep);
  }

  function finalizeBirth(method: string): void {
    let role = SpiritRole.Villager;
    let location: LocationID = Loc.Alimes;

    switch (method) {
      case 'npc': {
        // Pick a random non-playable NPC and borrow role + homeLocation
        // homeLocation은 currentLocation보다 안정적 (이동 중 미정의 지역 방지)
        const npcs = actors.filter(a => !a.playable);
        if (npcs.length > 0) {
          const npc = npcs[randomInt(0, npcs.length - 1)];
          role = npc.spirit.role;
          location = npc.homeLocation;
        } else {
          role = randomInt(0, ROLE_COUNT - 1) as SpiritRole;
          location = BIRTH_RANDOM_LOCATIONS[randomInt(0, BIRTH_RANDOM_LOCATIONS.length - 1)];
        }
        break;
      }
      case 'random': {
        role = randomInt(0, ROLE_COUNT - 1) as SpiritRole;
        location = BIRTH_RANDOM_LOCATIONS[randomInt(0, BIRTH_RANDOM_LOCATIONS.length - 1)];
        break;
      }
      case 'spring': {
        role = SpiritRole.Villager;
        location = Loc.Memory_Spring;
        break;
      }
    }

    const actor = new Actor(charName, charRace, role);
    actor.playable = true;
    actor.isCustom = true;
    actor.currentLocation = location;
    actor.homeLocation = location;

    // Random color values
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      actor.color.values[i] = randomFloat(0.2, 0.6);
    }
    actor.color.randomizeDomains();

    // Starting inventory: Food x3
    actor.addItem(ItemType.Food, 3);

    actors.push(actor);
    onComplete(actors.length - 1);
  }

  return {
    id: 'birth-creation',
    render: renderStep,
    onKey(key) {
      switch (step) {
        case 'name':
          if (key === 'Enter') {
            const input = document.querySelector<HTMLInputElement>(`.${SCREEN_CLASS} .name-input`);
            confirmName(input);
          } else if (key === 'Escape') {
            onCancel();
          }
          break;
        case 'race':
          if (key === 'Enter') {
            charRace = randomInt(0, RACE_COUNT - 1) as Race;
            step = 'start-method';
            rerender(SCREEN_CLASS, renderStep);
          } else if (key === 'Escape') {
            step = 'name';
            rerender(SCREEN_CLASS, renderStep);
          }
          break;
        case 'start-method':
          if (key === 'Escape') {
            step = 'race';
            rerender(SCREEN_CLASS, renderStep);
          } else if (key === '1') {
            finalizeBirth('npc');
          } else if (key === '2') {
            finalizeBirth('random');
          } else if (key === '3') {
            finalizeBirth('spring');
          }
          break;
      }
    },
  };
}

// =========================================================================
// Custom character creation flow (나만의 캐릭터)
// =========================================================================

type CustomStep = 'name' | 'race' | 'role' | 'color';

interface ColorSetup {
  values: number[];
  highTraits: Trait[];
  lowTraits: Trait[];
}

export function createCustomCharScreen(
  actors: Actor[],
  onComplete: (newActorIdx: number) => void,
  onCancel: () => void,
): Screen {
  let step: CustomStep = 'name';
  let charName = '';
  let charRace = Race.Human;
  let charRole = SpiritRole.Villager;
  const colorSetup: ColorSetup = {
    values: new Array(ELEMENT_COUNT).fill(50),
    highTraits: new Array(ELEMENT_COUNT).fill(Trait.Calm),
    lowTraits: new Array(ELEMENT_COUNT).fill(Trait.Calm),
  };

  // Initialize default traits from pool
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const pool = getTraitPool(i as Element);
    if (pool.highCandidates.length > 0) colorSetup.highTraits[i] = pool.highCandidates[0];
    if (pool.lowCandidates.length > 0) colorSetup.lowTraits[i] = pool.lowCandidates[0];
  }

  const SCREEN_CLASS = 'custom-screen';

  function renderStep(el: HTMLElement): void {
    let body = '';

    switch (step) {
      case 'name':
        body = `
          <h2>나만의 캐릭터</h2>
          <p>당신만의 캐릭터를 만드세요.</p>
          ${nameInputHtml(charName)}`;
        break;

      case 'race':
        body = `
          <h2>나만의 캐릭터 - 종족 선택</h2>
          <p>종족을 선택하세요.</p>
          ${enumGrid(RACE_COUNT as Race, raceName)}
          <div class="menu-buttons" style="margin-top:12px">
            <button class="btn" data-action="back" style="min-height:44px">뒤로</button>
          </div>
          <p class="hint">종족을 터치하여 선택</p>`;
        break;

      case 'role':
        body = `
          <h2>나만의 캐릭터 - 직업 선택</h2>
          <p>직업을 선택하세요.</p>
          ${enumGrid(ROLE_COUNT as SpiritRole, spiritRoleName)}
          <div class="menu-buttons" style="margin-top:12px">
            <button class="btn" data-action="back" style="min-height:44px">뒤로</button>
          </div>
          <p class="hint">직업을 터치하여 선택</p>`;
        break;

      case 'color':
        body = renderColorStep();
        break;
    }

    el.innerHTML = `<div class="screen info-screen ${SCREEN_CLASS}">${body}</div>`;
    bindStep(el);
  }

  function renderColorStep(): string {
    const rows: string[] = [];
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const elem = i as Element;
      const pool = getTraitPool(elem);
      const val = colorSetup.values[i];

      const highOptions = pool.highCandidates.map(t =>
        `<option value="${t}" ${t === colorSetup.highTraits[i] ? 'selected' : ''}>${traitName(t)}</option>`,
      ).join('');
      const lowOptions = pool.lowCandidates.map(t =>
        `<option value="${t}" ${t === colorSetup.lowTraits[i] ? 'selected' : ''}>${traitName(t)}</option>`,
      ).join('');

      rows.push(`
        <div class="color-row" data-elem="${i}" style="margin-bottom:12px;padding:8px;border:1px solid var(--border);border-radius:8px">
          <div style="font-weight:bold;margin-bottom:4px">${elementName(elem)} (${val}%)</div>
          <input type="range" class="color-slider" data-elem="${i}" min="0" max="100" value="${val}"
            style="width:100%;accent-color:var(--primary)" />
          <div style="display:flex;gap:8px;margin-top:4px">
            <label style="flex:1">
              <span style="font-size:0.85em">High:</span>
              <select class="high-trait-select" data-elem="${i}"
                style="width:100%;padding:6px;background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:4px;min-height:44px">
                ${highOptions}
              </select>
            </label>
            <label style="flex:1">
              <span style="font-size:0.85em">Low:</span>
              <select class="low-trait-select" data-elem="${i}"
                style="width:100%;padding:6px;background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:4px;min-height:44px">
                ${lowOptions}
              </select>
            </label>
          </div>
        </div>`);
    }

    return `
      <h2>나만의 캐릭터 - 컬러 설정</h2>
      <p>원소별 수치와 특성을 조정하세요.</p>
      <div style="max-height:60vh;overflow-y:auto">${rows.join('')}</div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn" data-action="back" style="min-height:44px">뒤로</button>
        <button class="btn btn-primary" data-action="finish" style="min-height:44px">완료 [Enter]</button>
      </div>
      <p class="hint">슬라이더와 특성을 조정한 후 완료를 누르세요</p>`;
  }

  function bindStep(el: HTMLElement): void {
    switch (step) {
      case 'name': {
        const input = el.querySelector<HTMLInputElement>('.name-input');
        input?.focus();
        el.querySelector('[data-action="confirm-name"]')?.addEventListener('click', () => confirmName(input));
        el.querySelector('[data-action="cancel"]')?.addEventListener('click', onCancel);
        break;
      }
      case 'race': {
        bindEnumGrid(el, val => { charRace = val as Race; step = 'role'; rerender(SCREEN_CLASS, renderStep); });
        el.querySelector('[data-action="back"]')?.addEventListener('click', () => { step = 'name'; rerender(SCREEN_CLASS, renderStep); });
        break;
      }
      case 'role': {
        bindEnumGrid(el, val => { charRole = val as SpiritRole; step = 'color'; rerender(SCREEN_CLASS, renderStep); });
        el.querySelector('[data-action="back"]')?.addEventListener('click', () => { step = 'race'; rerender(SCREEN_CLASS, renderStep); });
        break;
      }
      case 'color': {
        // Bind sliders
        el.querySelectorAll<HTMLInputElement>('.color-slider').forEach(slider => {
          slider.addEventListener('input', () => {
            const idx = parseInt(slider.dataset.elem!, 10);
            colorSetup.values[idx] = parseInt(slider.value, 10);
            // Update displayed percentage
            const row = slider.closest('.color-row');
            const label = row?.querySelector('div');
            if (label) label.textContent = `${elementName(idx as Element)} (${colorSetup.values[idx]}%)`;
          });
        });
        // Bind trait selects
        el.querySelectorAll<HTMLSelectElement>('.high-trait-select').forEach(select => {
          select.addEventListener('change', () => {
            const idx = parseInt(select.dataset.elem!, 10);
            colorSetup.highTraits[idx] = parseInt(select.value, 10) as Trait;
          });
        });
        el.querySelectorAll<HTMLSelectElement>('.low-trait-select').forEach(select => {
          select.addEventListener('change', () => {
            const idx = parseInt(select.dataset.elem!, 10);
            colorSetup.lowTraits[idx] = parseInt(select.value, 10) as Trait;
          });
        });
        el.querySelector('[data-action="back"]')?.addEventListener('click', () => { step = 'role'; rerender(SCREEN_CLASS, renderStep); });
        el.querySelector('[data-action="finish"]')?.addEventListener('click', finalizeCustom);
        break;
      }
    }
  }

  function confirmName(input: HTMLInputElement | null): void {
    const val = input?.value.trim() ?? '';
    if (val.length === 0) return;
    charName = val;
    step = 'race';
    rerender(SCREEN_CLASS, renderStep);
  }

  function finalizeCustom(): void {
    const actor = new Actor(charName, charRace, charRole);
    actor.playable = true;
    actor.isCustom = true;
    actor.currentLocation = Loc.Alimes;
    actor.homeLocation = Loc.Alimes;

    // Apply color setup
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      actor.color.values[i] = colorSetup.values[i] / 100;
      actor.color.domains[i] = {
        highTrait: colorSetup.highTraits[i],
        lowTrait: colorSetup.lowTraits[i],
      };
    }

    actors.push(actor);
    onComplete(actors.length - 1);
  }

  return {
    id: 'custom-creation',
    render: renderStep,
    onKey(key) {
      switch (step) {
        case 'name':
          if (key === 'Enter') {
            const input = document.querySelector<HTMLInputElement>(`.${SCREEN_CLASS} .name-input`);
            confirmName(input);
          } else if (key === 'Escape') {
            onCancel();
          }
          break;
        case 'race':
          if (key === 'Escape') {
            step = 'name';
            rerender(SCREEN_CLASS, renderStep);
          }
          break;
        case 'role':
          if (key === 'Escape') {
            step = 'race';
            rerender(SCREEN_CLASS, renderStep);
          }
          break;
        case 'color':
          if (key === 'Enter') {
            finalizeCustom();
          } else if (key === 'Escape') {
            step = 'role';
            rerender(SCREEN_CLASS, renderStep);
          }
          break;
      }
    },
  };
}
