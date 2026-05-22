/**
 * v-tooltip — 포인터 기반 설명 툴팁.
 *
 *  - 마우스: 호버(pointerenter)로 표시, 떠나면 숨김. (모드 무관)
 *  - 터치/펜 기본: *탭 한 번*으로 표시(짧게 누르고 떼면), 2.5초 후 자동 숨김. 클릭은 그대로 통과.
 *      → 클릭이 곧바로 실행되지 않는 정보용 요소(상점/공방 항목·상태·의도)에 적합.
 *  - 터치/펜 `v-tooltip.hold`: *길게 눌러야* 표시(~400ms) + 뒤따르는 click 1회 억제.
 *      → 탭이 곧 실행인 요소(전투 카드=사용, 포션=사용, 사건 선택지=확정)에 적합.
 *        길게 눌러 정보를 보고, 탭으로 실행.
 *
 * 공유 플로팅 요소(body 직속) 1개를 재사용해 텍스트만 갈아끼운다.
 */

import type { Directive } from 'vue';

let tipEl: HTMLDivElement | null = null;
function ensureTip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'app-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
function showTip(target: HTMLElement, text: string) {
  if (!text) return;
  const tip = ensureTip();
  tip.textContent = text;
  tip.style.display = 'block';
  const r = target.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  let top = r.top - tr.height - 8;
  if (top < 4) top = r.bottom + 8;
  let left = r.left + r.width / 2 - tr.width / 2;
  left = Math.max(4, Math.min(left, window.innerWidth - tr.width - 4));
  tip.style.top = `${top + window.scrollY}px`;
  tip.style.left = `${left + window.scrollX}px`;
}
function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

interface TipState {
  text: string;
  hold: boolean;
  timer?: number;
  hideTimer?: number;
  downAt?: number;
  moved?: boolean;
  onEnter: (e: PointerEvent) => void;
  onLeave: (e: PointerEvent) => void;
  onDown: (e: PointerEvent) => void;
  onUp: () => void;
  onMove: () => void;
}
interface TipEl extends HTMLElement { __tip?: TipState; }

/** 롱프레스로 정보가 떴을 때, 손 뗄 때 뒤따르는 click(카드 사용/확정 등)을 1회 억제. */
function suppressNextClick() {
  const blockNextClick = (ev: Event) => {
    ev.stopImmediatePropagation();
    ev.preventDefault();
    document.removeEventListener('click', blockNextClick, true);
  };
  document.addEventListener('click', blockNextClick, true);
  window.setTimeout(() => document.removeEventListener('click', blockNextClick, true), 1300);
}

function reveal(el: HTMLElement, s: TipState) {
  if (!s.text) return;
  showTip(el, s.text);
  window.clearTimeout(s.hideTimer);
  s.hideTimer = window.setTimeout(hideTip, 2500);
}

export const vTooltip: Directive<TipEl, string> = {
  mounted(el, binding) {
    const s: TipState = {
      text: binding.value ?? '',
      hold: !!binding.modifiers.hold,
      onEnter: (e) => { if (e.pointerType === 'mouse') showTip(el, s.text); },
      onLeave: (e) => { if (e.pointerType === 'mouse') hideTip(); },
      onDown: (e) => {
        if (e.pointerType === 'mouse') return;
        s.downAt = Date.now();
        s.moved = false;
        if (s.hold) {
          // 길게 누름 모드: 400ms 유지 시 표시 + 다음 click 억제.
          s.timer = window.setTimeout(() => {
            reveal(el, s);
            suppressNextClick();
          }, 400);
        }
      },
      onUp: () => {
        window.clearTimeout(s.timer);
        // 기본(탭) 모드: 짧게 누르고 떼면(움직임 없음) 표시. click은 억제하지 않는다.
        if (!s.hold && !s.moved && s.downAt && Date.now() - s.downAt < 500) {
          reveal(el, s);
        }
      },
      onMove: () => { s.moved = true; window.clearTimeout(s.timer); },
    };
    el.addEventListener('pointerenter', s.onEnter);
    el.addEventListener('pointerleave', s.onLeave);
    el.addEventListener('pointerdown', s.onDown);
    el.addEventListener('pointerup', s.onUp);
    el.addEventListener('pointercancel', s.onUp);
    el.addEventListener('pointermove', s.onMove);
    el.__tip = s;
  },
  updated(el, binding) {
    if (el.__tip) {
      el.__tip.text = binding.value ?? '';
      el.__tip.hold = !!binding.modifiers.hold;
    }
  },
  beforeUnmount(el) {
    const s = el.__tip; if (!s) return;
    el.removeEventListener('pointerenter', s.onEnter);
    el.removeEventListener('pointerleave', s.onLeave);
    el.removeEventListener('pointerdown', s.onDown);
    el.removeEventListener('pointerup', s.onUp);
    el.removeEventListener('pointercancel', s.onUp);
    el.removeEventListener('pointermove', s.onMove);
    hideTip();
  },
};
