/**
 * 몬스터 스키마 — 전투 노드의 적.
 *
 * 보스와 다름: 보스는 다단계 + 시그니처 양상, 몬스터는 단순 의도 + 드롭.
 * 사용자 정의:
 *   - 골드 + 시간의 조각을 떨어뜨림
 *   - 시간의 조각은 *런 내 카드/유물 제작*에 사용
 */

import type { CastSpeed, GridOffset, NamedEntity } from './base';
import type { MoveProfile } from './move-profile';
import type { Companion } from './npc';

/**
 * 격자 공격 정의 — 신규 엔진 전용. 적의 한 행동(공격/디버프).
 * 자기(적) 기준 *고정 패턴*. 플레이어가 그 칸에 있으면 피해.
 */
export interface GridAttack {
  /** 의도 인스펙트 표시 이름(선택). */
  name?: string;
  /** 자기 기준 고정 패턴(적용 칸 상대 오프셋). */
  shape: GridOffset[];
  /** shape 정렬 칸별 데미지 배율(기본 1). */
  perTileMul?: number[];
  /** 기본 피해(배율 곱 전). 미설정 시 monster.attack. */
  damage?: number;
  /** 발동 속도. 미설정 시 monster.speed 또는 'normal'. */
  castSpeed?: CastSpeed;
  /**
   * 사용하려면 플레이어가 패턴 칸 안에 들어와야 하는가.
   * true(기본): 사거리 밖이면 접근 이동을 우선. false: 위치 무관(자기 버프 등).
   */
  requiresInRange?: boolean;
  /** 부여 상태이상(선택) — "vulnerable:2" 형태. */
  applyStatus?: string;
}

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

  /**
   * 동료 영입 가능 여부 (Item 37-② Stage B).
   * true 이고 `companion` 정의가 있으면, 처치(onVictory) 시 *자동 영입*된다(roster 추가·중복 스킵).
   * 미설정/false 면 일반 적(영입 X). 광범위 태깅은 Stage C.
   */
  recruitable?: boolean;

  /**
   * 통합 동료 정의 (Item 37-② Stage B) — passive/skill/card 택1. NPC와 동일 타입 재사용.
   * 로더가 `companion_*` 필드(NPC와 동일 키)로부터 합성한다. recruitable=true 와 짝지어 자동 영입.
   */
  companion?: Companion;

  // === 격자 전투(grid-combat) 필드 — 전부 optional. 미설정 시 엔진 폴백. ===
  /** 격자 이동 프로필(행마법). 미설정 시 근접 추격(orthogonal1) 폴백. */
  moveProfile?: MoveProfile;
  /**
   * 스피드(템포) — "플레이어 N행동마다 이 적 1턴". INI `tempo`. 미설정 시 엔진 기본(보통 4, 보스 낮게).
   * 대부분 3~5, 매우 강한 적 2, 이벤트 1. min 1. (구 CastSpeed `speed` 필드는 폐지.)
   */
  tempo?: number;
  /**
   * 격자 공격 목록 — 신규 엔진 전용. AI가 이 중 사용 가능한 것을 고른다.
   * 미설정 시 레거시 attack/intents 기반 단순 근접 1칸 공격으로 폴백.
   */
  gridBehavior?: GridAttack[];

  /**
   * 고정(스크립트형) AI 플래그 — INI `fixed_ai = true`.
   * true면 게임트리(lookahead) AI를 *끄고* 단순 그리디(사거리 안→공격, 밖→접근) 폴백을 쓴다.
   * 스크립트형 적·보스 페이즈처럼 *예측 가능한 고정 움직임*이 필요한 경우용.
   * 미설정/false 면 기본 게임트리 AI(분기/깊이 캡 lookahead). gridBehavior가 없으면 어차피 그리디.
   * (RPGEditor metadata.ts 동기화는 후속 작업 — 현재는 데이터/엔진만 인지.)
   */
  fixedAi?: boolean;
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
