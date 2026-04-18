// hyperion-trigger.ts — 히페리온 레벨업 판정 + 큐잉 공통 유틸
// 전투 종료/상점/제작/퀘스트/영입 등 모든 트리거 지점에서 공통으로 사용.

import { GameSession } from './game-session';
import { updateHyperionLevels } from './hyperion';
import { checkAndUnlockPacks, RDC_PACKS } from '../data/rdc-packs';

/** 히페리온 레벨 합계를 기반으로 플레이어의 hyperionBonus, HP/MP 재계산 */
export function syncPlayerHyperionBonus(session: GameSession): void {
  if (!session.isValid) return;
  const p = session.player;
  const oldMaxHp = Math.max(1, p.getEffectiveMaxHp());
  const oldMaxMp = Math.max(1, p.getEffectiveMaxMp());
  const hpRatio = Math.max(0, Math.min(1, p.base.hp / oldMaxHp));
  const mpRatio = Math.max(0, Math.min(1, p.base.mp / oldMaxMp));
  const hyperionTotal = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

  p.hyperionBonus = hyperionTotal - p.hyperionLevel;

  p.base.hp = Math.round(p.getEffectiveMaxHp() * hpRatio);
  p.base.mp = Math.round(p.getEffectiveMaxMp() * mpRatio);
}

/**
 * 히페리온 조건을 체크해 레벨업이 발생하면 pendingHyperionMsgs 큐에 추가.
 * 레벨업이 하나라도 발생하면 true 반환.
 * - 백로그에 시스템 메시지로 기록
 * - 플레이어 hyperionBonus 즉시 반영
 * - RDC 캐릭터팩 해금 체크 포함
 *
 * 호출부에서 true를 받으면 오버레이를 띄우거나, 오버레이가 어려운 컨텍스트면
 * 큐에만 쌓아두고 다음 processTurn 시점에 처리하도록 한다.
 */
export function checkAndQueueHyperionLevelUps(session: GameSession): boolean {
  if (!session.isValid) return false;
  const msgs = updateHyperionLevels(
    session.player,
    session.actors,
    session.knowledge,
    session.gameTime,
    session.dungeonSystem,
  );
  if (msgs.length === 0) return false;

  // 플레이어 보너스 즉시 반영
  syncPlayerHyperionBonus(session);

  for (const m of msgs) {
    session.backlog.add(session.gameTime, m, '시스템');
    session.pendingHyperionMsgs.push(m);
  }

  // RDC 캐릭터팩 해금 체크 (히페리온 변동 후)
  const newlyUnlocked = checkAndUnlockPacks(session.actors);
  for (const packId of newlyUnlocked) {
    const pack = RDC_PACKS.find(pk => pk.id === packId);
    if (pack) {
      const msg = `✦ RDC 캐릭터팩 해금: "${pack.label}" — ${pack.playableNames.join(', ')} 플레이 가능!`;
      session.backlog.add(session.gameTime, msg, '시스템');
      session.pendingHyperionMsgs.push(msg);
    }
  }

  return true;
}
