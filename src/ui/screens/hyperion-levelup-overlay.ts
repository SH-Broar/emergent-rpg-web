// hyperion-levelup-overlay.ts — 히페리온 레벨업 강조 오버레이
// GameSession.pendingHyperionMsgs를 소스로 사용. 오버레이가 닫힐 때 큐를 비운다.

import type { Screen } from '../screen-manager';
import type { ScreenManager } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';

export const HYPERION_OVERLAY_ID = 'hyperion-levelup';

/** 히페리온 레벨업 오버레이 Screen 생성 */
export function createHyperionLevelupScreen(
  session: GameSession,
  sm: ScreenManager,
): Screen {
  // 스냅샷: 오버레이가 표시되는 동안 큐에 새 메시지가 추가되더라도
  // 이번 오버레이는 현재 시점의 메시지만 보여준다.
  const msgs = [...session.pendingHyperionMsgs];
  session.pendingHyperionMsgs.length = 0;

  return {
    id: HYPERION_OVERLAY_ID,
    render(el) {
      el.innerHTML = `
        <div class="screen" style="justify-content:center;align-items:center;text-align:center;background:var(--bg)">
          <div style="font-size:40px;margin-bottom:12px">\u2728</div>
          <h2 style="color:var(--warning);margin-bottom:16px">\ud788\ud398\ub9ac\uc628 \ub808\ubca8 \uc0c1\uc2b9!</h2>
          <div style="margin-bottom:20px">
            ${msgs.map(m => '<p style="font-size:15px;margin:4px 0;color:var(--success)">' + m + '</p>').join('')}
          </div>
          <p style="color:var(--text-dim);font-size:13px;margin-bottom:16px">HP, MP, \uacf5\uaca9, \ubc29\uc5b4\uac00 \uc0c1\uc2b9\ud569\ub2c8\ub2e4!</p>
          <button class="btn btn-primary" data-ok style="min-width:160px">\ud655\uc778 [Enter]</button>
        </div>`;
      el.querySelector('[data-ok]')?.addEventListener('click', () => sm.pop());
    },
    onKey(key) { if (key === 'Enter' || key === ' ' || key === 'Escape') sm.pop(); },
  };
}

/**
 * 외부 트리거 지점(전투 종료/상점/제작 등)에서 호출.
 * pendingHyperionMsgs가 있고, 히페리온 오버레이가 이미 스택 최상단이 아니면 push.
 * 큐가 비어있으면 no-op.
 */
export function showHyperionOverlayIfPending(
  session: GameSession,
  sm: ScreenManager,
): void {
  if (session.pendingHyperionMsgs.length === 0) return;
  if (sm.peek()?.id === HYPERION_OVERLAY_ID) return; // 중복 push 방지
  sm.push(createHyperionLevelupScreen(session, sm));
}
