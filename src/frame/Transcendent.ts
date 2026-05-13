/**
 * 전생자 (Transcendent) — 플레이어 본체.
 *
 * spec v2 Round 9: 전생자는 *시간대 캐릭터에 깃들어* 그 인생을 산다.
 * 한 런 동안은 그 캐릭터의 정체성으로 행동하나, 런 종료 시 *전생자 본체*로 돌아온다.
 *
 * 이 모듈은 *전생자 식별과 활동 메타*를 관리.
 */

import { useMetaStore } from '@/stores/meta';
import { useRunStore } from '@/stores/run';

export const TRANSCENDENT_TITLE = '전생자';

/** 전생자가 지금 어떤 캐릭터에 깃들어 있는가? null = 메인 메뉴. */
export function currentVessel(): string | null {
  const run = useRunStore();
  return run.active ? run.data.characterId : null;
}

/** 총 전생 횟수 (모노 입장에서 그가 본 횟수). */
export function totalDescents(): number {
  return useMetaStore().totalRuns;
}

/** 전생자의 *현재 영향력 점수* — 모든 게이지 + 영혼 자원. */
export function influenceScore(): number {
  const meta = useMetaStore();
  const g = meta.gauges;
  return (
    g.hyperion1.current +
    g.hyperion2.current +
    g.insight1.current +
    g.insight2.current +
    meta.soulResource * 2
  );
}
