// item-confirm-modal.ts — 아이템 사용/정보 확인 모달
// async Promise 패턴: 사용자가 '먹는다' 버튼을 누르면 true, '취소'/'닫기' false 반환

import type { Actor } from '../../models/actor';
import type { ItemDef } from '../../types/item-defs';
import { mealBuffLabel, getRemainingMeals } from '../../types/eat-system';

export type ItemConfirmMode = 'eat' | 'info';

export interface ItemConfirmOptions {
  def: ItemDef;
  actor: Actor;
  mode: ItemConfirmMode;
  /** 추가 경고 메시지 (예: 종족이 먹을 수 없음, 배탈 위험 등) */
  extraWarning?: string;
}

/**
 * 아이템 확인 모달을 띄운다.
 * - eat 모드: 섭취 효과 요약 + 확인/취소 버튼
 * - info 모드: 설명과 제한 사유만 표시 + 닫기 버튼
 * 사용자가 '먹는다'를 누르면 true, 아니면 false.
 */
export function openItemConfirmModal(opts: ItemConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'item-confirm-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.55)',
      'z-index:9000',
      'display:flex',
      'justify-content:center',
      'align-items:center',
      'padding:20px',
    ].join(';');

    const box = document.createElement('div');
    box.className = 'item-confirm-box info-screen';
    box.style.cssText = [
      'background:var(--bg-panel, #1a1a2a)',
      'border:1px solid var(--border, #444)',
      'border-radius:10px',
      'max-width:440px',
      'width:100%',
      'padding:20px',
      'box-shadow:0 12px 40px rgba(0,0,0,0.5)',
      'display:flex',
      'flex-direction:column',
      'gap:10px',
    ].join(';');

    const def = opts.def;
    const title = document.createElement('h3');
    title.style.cssText = 'margin:0 0 4px;font-size:17px;';
    title.textContent = def.name;
    box.appendChild(title);

    if (def.description) {
      const desc = document.createElement('p');
      desc.style.cssText = 'margin:0;font-size:13px;color:var(--text-dim);line-height:1.5;';
      desc.textContent = def.description;
      box.appendChild(desc);
    }

    // eat 모드: 남은 식사 횟수 + 섭취 효과 요약
    const remainingMeals = opts.mode === 'eat' ? getRemainingMeals(opts.actor) : 3;
    const mealExhausted = opts.mode === 'eat' && remainingMeals <= 0;
    if (opts.mode === 'eat') {
      const mealCountLine = document.createElement('div');
      mealCountLine.style.cssText = mealExhausted
        ? 'font-size:12px;color:var(--warning, #e94560);font-weight:600;'
        : 'font-size:12px;color:var(--text-dim);';
      const used = 3 - remainingMeals;
      mealCountLine.textContent = mealExhausted
        ? `오늘은 더 먹을 수 없습니다. (${used}/3 사용)`
        : `남은 식사 ${remainingMeals}/3`;
      box.appendChild(mealCountLine);

      const effects: string[] = [];
      if (def.eatVigor) effects.push(`TP ${def.eatVigor >= 0 ? '+' : ''}${Math.round(def.eatVigor / 10)}`);
      if (def.eatHp)    effects.push(`HP ${def.eatHp >= 0 ? '+' : ''}${def.eatHp}`);
      if (def.eatMp)    effects.push(`MP ${def.eatMp >= 0 ? '+' : ''}${def.eatMp}`);
      if (def.eatMood)  effects.push(`기분 ${def.eatMood >= 0 ? '+' : ''}${def.eatMood.toFixed(2)}`);
      if (effects.length > 0) {
        const line = document.createElement('div');
        line.style.cssText = 'font-size:13px;color:var(--success, #4ecca3);';
        line.textContent = `즉시 효과: ${effects.join(' · ')}`;
        box.appendChild(line);
      }

      const mealLabel = mealBuffLabel(def);
      if (mealLabel) {
        const mealLine = document.createElement('div');
        mealLine.style.cssText = 'font-size:12px;color:var(--accent, #ffc857);';
        mealLine.textContent = mealLabel;
        box.appendChild(mealLine);
      }

      if (def.eatStatus) {
        const warn = document.createElement('div');
        warn.style.cssText = 'font-size:12px;color:var(--warning, #e94560);';
        warn.textContent = def.eatStatus === 'poison'
          ? '⚠ 중독 위험이 있다.'
          : def.eatStatus === 'stomachache'
            ? '⚠ 배탈 위험이 있다.'
            : `⚠ 이상 효과: ${def.eatStatus}`;
        box.appendChild(warn);
      }
    } else {
      // info 모드: 섭취 불가 메시지
      const info = document.createElement('div');
      info.style.cssText = 'font-size:13px;color:var(--warning, #e94560);';
      info.textContent = '이 종족은 이것을 먹을 수 없다.';
      box.appendChild(info);
    }

    if (opts.extraWarning) {
      const extra = document.createElement('div');
      extra.style.cssText = 'font-size:12px;color:var(--warning, #e94560);';
      extra.textContent = opts.extraWarning;
      box.appendChild(extra);
    }

    // 버튼 영역
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
    box.appendChild(btnRow);

    function close(result: boolean): void {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      resolve(result);
    }

    if (opts.mode === 'eat') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn';
      cancelBtn.textContent = '취소 [Esc]';
      cancelBtn.style.minWidth = '100px';
      cancelBtn.addEventListener('click', () => close(false));
      btnRow.appendChild(cancelBtn);

      const okBtn = document.createElement('button');
      okBtn.className = 'btn btn-primary';
      okBtn.textContent = '먹는다 [Enter]';
      okBtn.style.minWidth = '120px';
      if (mealExhausted) {
        okBtn.disabled = true;
        okBtn.style.opacity = '0.45';
        okBtn.style.cursor = 'not-allowed';
        okBtn.title = '오늘은 더 먹을 수 없습니다.';
      } else {
        okBtn.addEventListener('click', () => close(true));
      }
      btnRow.appendChild(okBtn);
    } else {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-primary';
      closeBtn.textContent = '닫기 [Esc]';
      closeBtn.style.minWidth = '120px';
      closeBtn.addEventListener('click', () => close(false));
      btnRow.appendChild(closeBtn);
    }

    function onKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') { ev.preventDefault(); close(false); }
      else if (ev.key === 'Enter' && opts.mode === 'eat') {
        ev.preventDefault();
        if (!mealExhausted) close(true);
      }
      else if (ev.key === 'Enter' && opts.mode === 'info') { ev.preventDefault(); close(false); }
    }
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close(false);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}
