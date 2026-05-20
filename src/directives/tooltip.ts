/**
 * v-tooltip — 포인터 기반 설명 툴팁.
 *
 *  - 마우스: 호버(pointerenter)로 표시, 떠나면 숨김.
 *  - 터치/펜: ~400ms 롱프레스로 표시, 2.5초 후 자동 숨김.
 *
 * 공유 플로팅 요소(body 직속) 1개를 재사용해 텍스트만 갈아끼운다.
 * 라벨이 간결한 만큼, 효과/상태의 자세한 의미를 이 툴팁이 담는다.
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

interface TipState { text: string; timer?: number; hideTimer?: number;
  onEnter: (e: PointerEvent) => void; onLeave: (e: PointerEvent) => void;
  onDown: (e: PointerEvent) => void; onUp: () => void; onMove: () => void; }
interface TipEl extends HTMLElement { __tip?: TipState; }

export const vTooltip: Directive<TipEl, string> = {
  mounted(el, binding) {
    const s: TipState = {
      text: binding.value ?? '',
      onEnter: (e) => { if (e.pointerType === 'mouse') showTip(el, s.text); },
      onLeave: (e) => { if (e.pointerType === 'mouse') hideTip(); },
      onDown: (e) => { if (e.pointerType !== 'mouse') { s.timer = window.setTimeout(() => { showTip(el, s.text); s.hideTimer = window.setTimeout(hideTip, 2500); }, 400); } },
      onUp: () => { window.clearTimeout(s.timer); },
      onMove: () => { window.clearTimeout(s.timer); },
    };
    el.addEventListener('pointerenter', s.onEnter);
    el.addEventListener('pointerleave', s.onLeave);
    el.addEventListener('pointerdown', s.onDown);
    el.addEventListener('pointerup', s.onUp);
    el.addEventListener('pointercancel', s.onUp);
    el.addEventListener('pointermove', s.onMove);
    el.__tip = s;
  },
  updated(el, binding) { if (el.__tip) el.__tip.text = binding.value ?? ''; },
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
