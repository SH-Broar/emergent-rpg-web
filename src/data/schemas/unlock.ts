/**
 * 메타 해금 항목 (MetaUnlock) — 메타 자원을 *소비해 콘텐츠를 개방*하는 투자 카탈로그.
 *
 * 각 자원이 한 도메인을 전담한다.
 *   - hyperion → 종족 해금 (grantsRaceIds)
 *   - insight  → 카드 풀·유물 해금 (grantsCardIds / grantsRelicIds; B단계에서 런 풀 필터링)
 *   - soul     → 시간대 해금 (grantsTimelineIds; 미래)
 *
 * 데이터: public/data/meta/unlocks.txt, INI 섹션 [unlock.<id>].
 */

import type { CardId, RaceId, RelicId, TimelineId } from './base';

/** 메타 자원 종류 — 한 항목은 한 자원만 소비. */
export type MetaResource = 'hyperion' | 'insight' | 'soul';

/** 메타 해금 한 항목. */
export interface MetaUnlock {
  id: string;
  name: string;
  description?: string;
  /** 소비할 자원 종류. */
  resource: MetaResource;
  /** 소비 비용. */
  cost: number;
  /** 구매 시 개방되는 콘텐츠 id들. */
  grantsRaceIds?: RaceId[];
  grantsCardIds?: CardId[];
  grantsRelicIds?: RelicId[];
  grantsTimelineIds?: TimelineId[];
}
