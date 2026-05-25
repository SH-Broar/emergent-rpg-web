/**
 * 몬스터 스키마 — 전투 노드의 적.
 *
 * 보스와 다름: 보스는 다단계 + 시그니처 양상, 몬스터는 단순 의도 + 드롭.
 * 사용자 정의:
 *   - 골드 + 시간의 조각을 떨어뜨림
 *   - 시간의 조각은 *런 내 카드/유물 제작*에 사용
 */

import type { NamedEntity } from './base';

/**
 * 몬스터 의도 — 매 턴 *슬롯 한 개*. 한 슬롯은 1개 이상 행동을 담는다.
 *
 * encoded 형식(combat 시스템이 해석):
 *  - 단일 행동: 'attack:5' | 'defend:3' | 'buff:1' | 'lockin:block:30:조준'
 *  - 분기:      'attack:22~unlocked=attack:6' (활성 락 0개면 약공격, 아니면 강공격+전체 해제)
 *  - 가변 묶음: 'attack:5+lockin:no-attack:1:정전' (한 턴 2행동 — `+`로 동시 묶음)
 * `+`는 한 *슬롯 안의 여러 행동*을 잇고, 콤마(intents 리스트)는 *턴 슬롯*을 가른다.
 */
export interface MonsterIntent {
  /** combat 시스템이 해석하는 슬롯 인코딩(가변 묶음 `+`·분기 `~unlocked=` 포함, verbatim 보존). */
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

  /** 적 등급. UI 표기·드롭 풀에 영향. ('minion' 티어는 작업 29에서 폐지 — normal/elite만.) */
  tier?: 'normal' | 'elite';

  /**
   * 몬무스 종족 — all-gimmick(만물의 송곳니) 카오스가 *종족 대표 기믹*을 주입할 때 참조.
   * 예: spider, arachne, slime, succubus, fox, golem, dragon, lamia, mermaid, siren,
   *     orca, centaur, moth, phantom, beast, plant, undead, construct, spirit, harpy, bird ...
   * 미지정이면 SPECIES_GIMMICK 폴백 기믹이 쓰인다(누락 안전).
   */
  species?: string;

  hp: number;
  attack: number;
  defense?: number;

  /** 턴마다 순회하는 의도 패턴. */
  intents: MonsterIntent[];

  /**
   * @deprecated *레거시* 고정 멀티액션 — 항상 N개. 신규 저작은 슬롯 안 `+` 묶음을 쓴다.
   * 옛 데이터 호환: 설정돼 있으면 *그 슬롯을 N회 묶음*으로 fallback 해석(쌍바늘 태엽기 등 안 깨짐).
   * 미설정/1이면 일반(슬롯당 행동 1개, `+` 묶음만큼만 늘어남).
   */
  actions?: number;

  /**
   * @deprecated *레거시* 락인(전역 단일 락) 수치 — INI `lock_in`. `<special>~unlocked=attack:<weak>`와
   * 짝지어, 플레이어가 그 턴 방어 ≥ lockIn을 쌓으면 special→약공격. lockin 행동을 쓰지 *않는* 옛 몹 전용.
   * 신규 저작은 `lockin:<condition>:<value>:<label>` 행동 + `~unlocked=`(활성 락 0개) 분기를 쓴다(lock_in 불필요).
   */
  lockIn?: number;

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
