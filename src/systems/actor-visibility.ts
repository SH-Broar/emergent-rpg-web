import type { Actor } from '../models/actor';
import type { GameSession } from './game-session';

function sawBetelgeuseSignalYesterday(session: GameSession): boolean {
  const targetDay = session.gameTime.day - 1;
  if (targetDay < 1) return false;
  return session.backlog.getAll().some(entry =>
    entry.category === '이벤트'
    && entry.time.day === targetDay
    && entry.text.includes('빛이 쏟아지는 날'),
  );
}

export function isActorVisibleToPlayer(session: GameSession, actor: Actor): boolean {
  if (actor.name !== '베텔게우스') return true;
  return sawBetelgeuseSignalYesterday(session);
}
