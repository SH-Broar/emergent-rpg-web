/**
 * 몬스터 스키마 — 전투 노드의 적.
 *
 * 보스와 다름: 보스는 다단계 + 시그니처 양상, 몬스터는 단순 의도 + 드롭.
 * 사용자 정의:
 *   - 골드 + 시간의 조각을 떨어뜨림
 *   - 시간의 조각은 *런 내 카드/유물 제작*에 사용
 */

import type { NamedEntity } from './base';

/** 몬스터 의도 — 매 턴 행동 패턴 한 개. */
export interface MonsterIntent {
  /** combat 시스템이 해석하는 형식: 'attack:5' | 'defend:3' | 'buff:1' */
  encoded: string;
  /** UI 표시용 (선택). */
  description?: string;
}

/** 드롭 항목 — 골드·시간의 조각 + 확률 카드. */
export interface MonsterDrop {
  gold: number;
  timeShards: number;
  /** 카드 드롭 후보 (확률 기반). */
  cardDrops?: Array<{
    cardId: string;
    chance: number;     // 0.0 ~ 1.0
  }>;
}

export interface Monster extends NamedEntity {
  id: string;

  /** 적 등급. UI 표기·드롭 풀에 영향. */
  tier?: 'minion' | 'normal' | 'elite';

  hp: number;
  attack: number;
  defense?: number;

  /** 턴마다 순회하는 의도 패턴. */
  intents: MonsterIntent[];

  /**
   * 분열 횟수 — 처치(hp<=0) 시 *진짜 죽지 않고* maxHp의 절반으로 부활하는 횟수.
   * 0/미설정이면 일반 사망. 2면 총 3번 잡아야 진짜 패배(부활할 때마다 1 감소).
   * 1v1 엔진이라 동시에 여러 적이 생기진 않고, 같은 적이 다시 일어선다.
   */
  splitCount?: number;

  drop: MonsterDrop;

  /** 등장 가능한 노드/시즌 조건 (선택). */
  appearsIn?: string[];
}

/** 전투 시점에 적 객체를 만드는 결과. combat.ts가 사용. */
export interface MonsterInstance {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  intents: string[];     // encoded 문자열들
  drop: MonsterDrop;
}
