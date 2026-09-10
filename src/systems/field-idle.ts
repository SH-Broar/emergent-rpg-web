/** Wall-clock inactivity only; pausing never accumulates catch-up turns. */
export function createFieldIdleClock(interval = 5000) {
  let since = 0;
  return {
    reset(now: number) { since = now; },
    progress(now: number) { return Math.max(0, Math.min(1, (now - since) / interval)); },
    poll(now: number, paused: boolean) {
      if (paused || now < since) { since = now; return false; }
      if (now - since < interval) return false;
      since = now;
      return true;
    },
  };
}
