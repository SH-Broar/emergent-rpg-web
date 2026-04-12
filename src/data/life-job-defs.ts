// life-job-defs.ts — 17개 생활 직업 정의
// 스킬, 승단 미션 조건, 취득 장소 등 모든 데이터

import type { LifeJob } from '../types/enums';

export type LifeJobSkillType = 'passive' | 'action';

export interface LifeJobSkillDef {
  name: string;
  description: string;
  tpCost: number;
  type: LifeJobSkillType;
  /** 사용 제한: 'weekly' = 주 1회, 'daily' = 하루 1회, undefined = 무제한 */
  cooldown?: 'daily' | 'weekly';
}

/** 승단 미션 개별 조건 */
export interface MissionCondition {
  /** 시스템이 해석할 조건 키 (knowledge 필드명 또는 'var:xxx' 등) */
  key: string;
  /** 달성해야 할 목표 수치 */
  target: number;
  /** UI 표시용 텍스트 */
  label: string;
}

/** 승단 미션 (Lv1→Lv2, Lv2→Lv3) */
export interface LifeJobMissionDef {
  conditions: MissionCondition[];
}

export interface LifeJobDef {
  id: LifeJob;
  name: string;
  concept: string;
  /** 취득 가능 장소 (LocationID). '' = 어디서든 */
  acquisitionLocation: string;
  /** 취득 NPC 이름 (표시용). '' = 혼자 터득 */
  acquisitionNpc: string;
  /** Lv1, Lv2, Lv3 스킬 */
  skills: [LifeJobSkillDef, LifeJobSkillDef, LifeJobSkillDef];
  /** [Lv1→Lv2 미션, Lv2→Lv3 미션] */
  missions: [LifeJobMissionDef, LifeJobMissionDef];
}

// ============================================================
// 17개 직업 정의
// ============================================================

export const LIFE_JOB_DEFS: Record<Exclude<LifeJob, ''>, LifeJobDef> = {

  // ── 1. 주민 ──────────────────────────────────────────────
  Villager: {
    id: 'Villager', name: '주민',
    concept: '평범한 일상의 달인. 어떤 일이든 무난하게 해낸다.',
    acquisitionLocation: '', acquisitionNpc: '',
    skills: [
      { name: '일상의 감각', description: '모든 활동 완료 후 5% 확률로 랜덤 소량 아이템 획득', tpCost: 0, type: 'passive' },
      { name: '이웃의 정', description: '선물 시 호감도 +10% 추가 / 활동 소요 시간 -10%', tpCost: 0, type: 'passive' },
      { name: '마을의 기둥', description: '채집/요리/활동 중 하나 랜덤 2배 효과 (당일)', tpCost: 1, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'activities', target: 50, label: '활동 50회' },
        { key: 'conversations', target: 30, label: '대화 30회' },
        { key: 'gifts', target: 10, label: '선물 10회' },
      ]},
      { conditions: [
        { key: 'visitedLocations', target: 15, label: '15개 이상 지역 방문' },
        { key: 'gifts', target: 50, label: '선물 총 50회' },
        { key: 'quests', target: 10, label: '퀘스트 10개 완료' },
      ]},
    ],
  },

  // ── 2. 기상학자 ──────────────────────────────────────────
  Meteorologist: {
    id: 'Meteorologist', name: '기상학자',
    concept: '날씨를 읽고 예측한다.',
    acquisitionLocation: 'Hanabridge', acquisitionNpc: '기상대 학자',
    skills: [
      { name: '날씨 예보', description: '내일 날씨를 미리 확인한다.', tpCost: 1, type: 'action' },
      { name: '기상 분석', description: '날씨와 맞는 속성 채집 시 +1개 추가 / 악천후 피해 -50%', tpCost: 0, type: 'passive' },
      { name: '폭풍의 눈', description: '3일치 날씨 예보 + 특정 날씨 아이템 드롭 +30% (당일)', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'weatherChecked', target: 20, label: '날씨 예보 20회 사용' },
        { key: 'var:visit_Cyan_Dunes', target: 3, label: '씨안 사막 방문 3회' },
        { key: 'conversations', target: 50, label: '대화 50회' },
      ]},
      { conditions: [
        { key: 'var:weather_types_seen', target: 6, label: '모든 날씨 종류 경험' },
        { key: 'moves', target: 50, label: '이동 50회' },
        { key: 'quests', target: 5, label: '퀘스트 5개 완료' },
      ]},
    ],
  },

  // ── 3. 약초가 ──────────────────────────────────────────
  Herbalist: {
    id: 'Herbalist', name: '약초가',
    concept: '약초와 포션에 정통하다.',
    acquisitionLocation: 'Luna_Academy', acquisitionNpc: '약학 교수',
    skills: [
      { name: '채집 숙련', description: '채집 시 약초류 +1개 추가 획득', tpCost: 0, type: 'passive' },
      { name: '포션 제조', description: '약초 재료로 HP포션 또는 MP포션을 제조한다.', tpCost: 1, type: 'action' },
      { name: '대지의 비밀', description: '희귀 약초 발견 확률 +25% + 포션 효과 +50%', tpCost: 0, type: 'passive' },
    ],
    missions: [
      { conditions: [
        { key: 'gathers', target: 100, label: '채집 100회' },
        { key: 'var:herb_items_obtained', target: 50, label: '약초류 아이템 50개 획득' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'potionsMade', target: 30, label: '포션 제조 30회' },
        { key: 'visitedLocations', target: 10, label: '10개 이상 지역 방문' },
        { key: 'var:rare_herbs_found', target: 5, label: '희귀 약초 5종 발견' },
      ]},
    ],
  },

  // ── 4. 상인 ──────────────────────────────────────────
  Merchant: {
    id: 'Merchant', name: '상인',
    concept: '거래와 흥정의 달인.',
    acquisitionLocation: 'Market_Square', acquisitionNpc: '상인 조합장',
    skills: [
      { name: '흥정 기술', description: '판매가 +10%', tpCost: 0, type: 'passive' },
      { name: '도매 루트', description: '구매가 -15%', tpCost: 0, type: 'passive' },
      { name: '상업 네트워크', description: '판매가 +20% / 구매가 -25% + 하루 1회 희귀 아이템 구매 기회', tpCost: 0, type: 'passive' },
    ],
    missions: [
      { conditions: [
        { key: 'itemsSold', target: 100, label: '아이템 판매 100개' },
        { key: 'var:visit_Market_Square', target: 20, label: '시장 광장 방문 20회' },
        { key: 'conversations', target: 40, label: '대화 40회' },
      ]},
      { conditions: [
        { key: 'itemsSold', target: 500, label: '총 판매 500개' },
        { key: 'var:total_gold_earned', target: 50000, label: '총 수입 50,000G' },
        { key: 'visitedLocations', target: 10, label: '10개 이상 지역 방문' },
      ]},
    ],
  },

  // ── 5. 요리사 ──────────────────────────────────────────
  Cook: {
    id: 'Cook', name: '요리사',
    concept: '음식으로 사람을 살린다.',
    acquisitionLocation: 'Hanabridge', acquisitionNpc: '식당 주인',
    skills: [
      { name: '요리 기초', description: '요리 성공률 +15% / 음식 버프 지속 +10%', tpCost: 0, type: 'passive' },
      { name: '특제 레시피', description: '고급 레시피 해금 + 요리 성공률 +30%', tpCost: 0, type: 'passive' },
      { name: '명인의 맛', description: '음식 효과 +50% + NPC에게 대접 시 호감도 대폭 상승', tpCost: 2, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'cooks', target: 50, label: '요리 50회' },
        { key: 'foodTypes', target: 10, label: '10종류 음식 제조' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'cooks', target: 200, label: '요리 200회' },
        { key: 'foodTypes', target: 20, label: '20종류 음식 제조' },
        { key: 'var:food_gifts', target: 30, label: 'NPC에게 음식 선물 30회' },
      ]},
    ],
  },

  // ── 6. 광부 ──────────────────────────────────────────
  Miner: {
    id: 'Miner', name: '광부',
    concept: '광석을 캐는 전문가.',
    acquisitionLocation: 'Tiklit_Range', acquisitionNpc: '광부 두목',
    skills: [
      { name: '채굴 기초', description: '채집 시 광석류 +1개 추가 획득', tpCost: 0, type: 'passive' },
      { name: '광맥 감지', description: '채집 가능 광석 목록 미리 보기 / 희귀 광석 확률 +15%', tpCost: 1, type: 'action' },
      { name: '심층 굴착', description: '티클릿 산맥에서 희귀 광석 보장 획득', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'gathers', target: 100, label: '채집 100회' },
        { key: 'var:ore_items_obtained', target: 80, label: '광석류 80개 획득' },
        { key: 'var:visit_Tiklit_Range', target: 10, label: '티클릿 산맥 10회 방문' },
      ]},
      { conditions: [
        { key: 'var:rare_ore_obtained', target: 20, label: '희귀 광석 20개 획득' },
        { key: 'quests', target: 5, label: '퀘스트 5개 완료' },
        { key: 'gathers', target: 300, label: '채집 300회' },
      ]},
    ],
  },

  // ── 7. 점성술사 ──────────────────────────────────────────
  Astrologer: {
    id: 'Astrologer', name: '점성술사',
    concept: '별을 읽어 운명을 점친다.',
    acquisitionLocation: 'Luna_Academy', acquisitionNpc: '천문학 교수',
    skills: [
      { name: '별자리 읽기', description: '던전 입장 전 현재 층 이벤트 타입 힌트 표시', tpCost: 1, type: 'action' },
      { name: '운명 예지', description: '하루 1회 던전 다음 3룸 타입 미리 보기', tpCost: 1, type: 'action', cooldown: 'daily' },
      { name: '천체 조율', description: '다음 24시간 컬러 변화 방향을 1개 원소로 고정', tpCost: 3, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'var:astro_readings', target: 30, label: '별자리 읽기 30회' },
        { key: 'moves', target: 20, label: '이동 20회' },
        { key: 'var:visit_Luna_Academy', target: 10, label: '루나 아카데미 10회 방문' },
      ]},
      { conditions: [
        { key: 'var:fortune_readings', target: 20, label: '운명 예지 20회' },
        { key: 'dungeons', target: 10, label: '던전 10회 클리어' },
        { key: 'quests', target: 5, label: '퀘스트 5개 완료' },
      ]},
    ],
  },

  // ── 8. 길드직원 ──────────────────────────────────────────
  GuildClerk: {
    id: 'GuildClerk', name: '길드직원',
    concept: '길드 업무의 전문가.',
    acquisitionLocation: 'Guild_Hall', acquisitionNpc: '길드 지부장',
    skills: [
      { name: '퀘스트 분석', description: '퀘스트 보상 골드 +10%', tpCost: 0, type: 'passive' },
      { name: '내부 정보', description: '퀘스트 보상 +20%', tpCost: 0, type: 'passive' },
      { name: '길드 인맥', description: '퀘스트 보상 +25% + 하루 1회 고수익 특별 퀘스트 수락', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'quests', target: 20, label: '퀘스트 20개 완료' },
        { key: 'var:visit_Guild_Hall', target: 30, label: '길드 홀 30회 방문' },
        { key: 'conversations', target: 30, label: '대화 30회' },
      ]},
      { conditions: [
        { key: 'quests', target: 50, label: '퀘스트 50개 완료' },
        { key: 'dungeons', target: 20, label: '던전 20회 클리어' },
        { key: 'var:visit_Guild_Branch', target: 10, label: '길드 지부 방문 10회' },
      ]},
    ],
  },

  // ── 9. 경비병 ──────────────────────────────────────────
  Guard: {
    id: 'Guard', name: '경비병',
    concept: '마을과 동료를 지킨다.',
    acquisitionLocation: 'Alimes', acquisitionNpc: '경비대장',
    skills: [
      { name: '경계 태세', description: '전투 시 선제 방어 확률 +15% / 동료 방어력 +10%', tpCost: 0, type: 'passive' },
      { name: '동료 보호', description: '동료 방어력 +20% + 동료 1명 방어 집중 (다음 전투 피해 -30%)', tpCost: 1, type: 'action' },
      { name: '불굴의 의지', description: 'HP 0 시 HP 1로 버티기 + 즉시 반격', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'dungeons', target: 30, label: '던전 30회 클리어' },
        { key: 'dungeonBattlesWithCompanion', target: 20, label: '동료와 함께한 전투 20회' },
        { key: 'quests', target: 5, label: '퀘스트 5개 완료' },
      ]},
      { conditions: [
        { key: 'dungeons', target: 100, label: '던전 100회 클리어' },
        { key: 'var:survive_ko', target: 5, label: '동료 HP 0 상황에서 생존 5회' },
        { key: 'monsters', target: 200, label: '몬스터 200마리 처치' },
      ]},
    ],
  },

  // ── 10. 농부 ──────────────────────────────────────────
  Farmer: {
    id: 'Farmer', name: '농부',
    concept: '땅을 일구는 사람.',
    acquisitionLocation: 'Farm', acquisitionNpc: '농장 관리인',
    skills: [
      { name: '풍작의 손', description: '농장 수확량 +20% / 수확 시 씨앗 유지 확률 +10%', tpCost: 0, type: 'passive' },
      { name: '퇴비 기술', description: '작물 성장 속도 +30% + 특정 작물칸 수확량 2배', tpCost: 1, type: 'action' },
      { name: '대지의 노래', description: '수확량 +50% + 일반 씨앗으로 희귀 작물 생산 확률', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'farmHarvests', target: 30, label: '농장 수확 30회' },
        { key: 'var:crop_types_grown', target: 5, label: '5종류 이상 작물 재배' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'farmHarvests', target: 100, label: '농장 수확 100회' },
        { key: 'var:crop_types_grown', target: 10, label: '10종류 작물 재배' },
        { key: 'var:total_harvest_items', target: 500, label: '총 수확량 500개 이상' },
      ]},
    ],
  },

  // ── 11. 어부 ──────────────────────────────────────────
  Fisher: {
    id: 'Fisher', name: '어부',
    concept: '물가의 달인.',
    acquisitionLocation: 'Erumen_Seoncheon', acquisitionNpc: '어부 장인',
    skills: [
      { name: '낚시', description: '물가 지역에서 낚시 → 무작위 물고기/아이템 획득', tpCost: 1, type: 'action' },
      { name: '물고기 감지', description: '낚시 수확량 +1 + 희귀 물고기 확률 +20%', tpCost: 0, type: 'passive' },
      { name: '바다의 벗', description: '낚시 최고급 아이템 확률 +30% + 마틴 항 심해 낚시', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'fishCaught', target: 30, label: '낚시 30회' },
        { key: 'var:fish_types', target: 10, label: '10종류 물고기 획득' },
        { key: 'var:visit_Erumen_Seoncheon', target: 10, label: '에루멘 선천 10회 방문' },
      ]},
      { conditions: [
        { key: 'fishCaught', target: 100, label: '낚시 100회' },
        { key: 'var:rare_fish', target: 10, label: '희귀 물고기 10마리' },
        { key: 'var:visit_Martin_Port', target: 3, label: '마틴 항 방문 3회' },
      ]},
    ],
  },

  // ── 12. 사제 ──────────────────────────────────────────
  Priest: {
    id: 'Priest', name: '사제',
    concept: '기도와 축복으로 사람을 돕는다.',
    acquisitionLocation: 'Hanabridge', acquisitionNpc: '신전 사제장',
    skills: [
      { name: '축복', description: '동료 1명 HP +20 회복 / 본인 휴식 HP 회복 +20%', tpCost: 1, type: 'action' },
      { name: '성스러운 빛', description: '휴식 HP 회복 +50% + Light 컬러 서서히 상승', tpCost: 0, type: 'passive' },
      { name: '신성한 가호', description: '파티 전체 상태이상 해제 + 던전 저주 이벤트 무효화 확률 +30%', tpCost: 2, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'blessingsGiven', target: 30, label: '축복 30회 사용' },
        { key: 'var:visit_Hanabridge', target: 20, label: '하나브릿지 20회 방문' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'blessingsGiven', target: 100, label: '축복 100회' },
        { key: 'var:light_color_high', target: 1, label: 'Light 컬러 0.7 이상 도달' },
        { key: 'var:visit_Memory_Spring', target: 3, label: '기억의 샘 방문 3회' },
      ]},
    ],
  },

  // ── 13. 장인 ──────────────────────────────────────────
  Craftsman: {
    id: 'Craftsman', name: '장인',
    concept: '손재주의 달인.',
    acquisitionLocation: 'Alimes', acquisitionNpc: '장인 조합장',
    skills: [
      { name: '장비 수리', description: '보유 장비 내구도 수리 (광석 재료 소모)', tpCost: 1, type: 'action' },
      { name: '재료 절약', description: '요리/수리 시 재료 1개 절약 확률 20% + 수리 효율 +30%', tpCost: 0, type: 'passive' },
      { name: '명품 제작', description: '희귀 재료 소모 → 특별 장비/아이템 제작', tpCost: 3, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'equipRepaired', target: 20, label: '장비 수리 20회' },
        { key: 'var:ore_items_obtained', target: 100, label: '광석 100개 획득' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'equipRepaired', target: 80, label: '수리 80회' },
        { key: 'var:rare_ore_obtained', target: 30, label: '희귀 광석 30개' },
        { key: 'gathers', target: 200, label: '채집 200회' },
      ]},
    ],
  },

  // ── 14. 모험가 ──────────────────────────────────────────
  Adventurer: {
    id: 'Adventurer', name: '모험가',
    concept: '끝없이 떠도는 자.',
    acquisitionLocation: 'Guild_Hall', acquisitionNpc: '베테랑 모험가',
    skills: [
      { name: '탐험 감각', description: '던전 탐색 HP 비용 -20% / 처음 방문하는 지역에서 소량 골드 발견', tpCost: 0, type: 'passive' },
      { name: '위험 감지', description: '던전 위험 이벤트 사전 경고 / 미탐험 던전 보상 +15%', tpCost: 0, type: 'passive' },
      { name: '미지의 개척자', description: '히든 지역 발견 확률 +25% + 던전 HP 응급 회복', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'dungeons', target: 50, label: '던전 50회 클리어' },
        { key: 'visitedLocations', target: 10, label: '10개 이상 지역 방문' },
        { key: 'quests', target: 5, label: '퀘스트 5개 완료' },
      ]},
      { conditions: [
        { key: 'dungeons', target: 200, label: '던전 200회 클리어' },
        { key: 'visitedLocations', target: 25, label: '25개 이상 지역 방문' },
        { key: 'monsters', target: 500, label: '몬스터 500마리 처치' },
      ]},
    ],
  },

  // ── 15. 음유시인 ──────────────────────────────────────────
  Bard: {
    id: 'Bard', name: '음유시인',
    concept: '노래와 이야기로 분위기를 바꾼다.',
    acquisitionLocation: 'Alimes', acquisitionNpc: '여관 음유시인',
    skills: [
      { name: '연주', description: '현재 위치 NPC 전원 호감도 소량 상승', tpCost: 1, type: 'action' },
      { name: '매력적인 이야기', description: 'NPC 호감도 상승량 +15% + 대화 시 특별 선택지 확률 +20%', tpCost: 0, type: 'passive' },
      { name: '전설의 가수', description: '현재 마을/지역 모든 NPC 호감도 대폭 상승', tpCost: 2, type: 'action', cooldown: 'weekly' },
    ],
    missions: [
      { conditions: [
        { key: 'songsPlayed', target: 30, label: '연주 30회' },
        { key: 'conversations', target: 80, label: '대화 80회' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'songsPlayed', target: 100, label: '연주 100회' },
        { key: 'gifts', target: 50, label: '선물 50회' },
        { key: 'conversations', target: 200, label: '대화 200회' },
      ]},
    ],
  },

  // ── 16. 지도제작자 ──────────────────────────────────────────
  Cartographer: {
    id: 'Cartographer', name: '지도제작자',
    concept: '세상을 지도에 담는다.',
    acquisitionLocation: 'Luna_Academy', acquisitionNpc: '지리학 교수',
    skills: [
      { name: '지름길 발견', description: '모든 이동 시간 -25%', tpCost: 0, type: 'passive' },
      { name: '숨겨진 경로', description: '이동 시간 -35% + 현재 지역의 연결 지역 전체 및 소요 시간 표시', tpCost: 1, type: 'action' },
      { name: '세계 지도 완성', description: '이동 시간 -50% + 하루 1회 비밀 경로 (이동 즉시 완료)', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'visitedLocations', target: 15, label: '15개 이상 지역 방문' },
        { key: 'moves', target: 100, label: '이동 100회' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'visitedLocations', target: 30, label: '30개 이상 지역 방문' },
        { key: 'moves', target: 300, label: '이동 300회' },
        { key: 'dungeons', target: 10, label: '던전 10회 클리어' },
      ]},
    ],
  },

  // ── 17. 수의사 ──────────────────────────────────────────
  Veterinarian: {
    id: 'Veterinarian', name: '수의사',
    concept: '동물과 정령을 돌본다.',
    acquisitionLocation: 'Memory_Spring', acquisitionNpc: '정령 치유사',
    skills: [
      { name: '동물 교감', description: '킨·정령 계열 동료 전투 스킬 발동 확률 +15% / 야생 몬스터 드롭률 +10%', tpCost: 0, type: 'passive' },
      { name: '야생 친화', description: '드롭률 +20% + 동료 상태이상 1개 해제', tpCost: 1, type: 'action' },
      { name: '정령의 벗', description: '모든 동료 전투 발동 확률 +10% 추가 + 특별 정령 동료 영입 시도', tpCost: 2, type: 'action', cooldown: 'daily' },
    ],
    missions: [
      { conditions: [
        { key: 'dungeonBattlesWithCompanion', target: 30, label: '동료와 함께한 전투 30회' },
        { key: 'var:visit_Memory_Spring', target: 3, label: '기억의 샘 방문 3회' },
        { key: 'quests', target: 3, label: '퀘스트 3개 완료' },
      ]},
      { conditions: [
        { key: 'monsters', target: 200, label: '야생 몬스터 200마리 처치' },
        { key: 'dungeonBattlesWithCompanion', target: 100, label: '동료와 함께한 전투 100회' },
        { key: 'conversations', target: 100, label: '대화 100회' },
      ]},
    ],
  },
};

/** 직업 정의 가져오기 (빈 문자열 → undefined) */
export function getLifeJobDef(jobId: string): LifeJobDef | undefined {
  if (!jobId) return undefined;
  return LIFE_JOB_DEFS[jobId as Exclude<LifeJob, ''>];
}

/** 현재 레벨에서 사용 가능한 스킬 목록 가져오기 */
export function getAvailableSkills(jobId: string, level: number): LifeJobSkillDef[] {
  const def = getLifeJobDef(jobId);
  if (!def || level < 1) return [];
  return def.skills.slice(0, Math.min(level, 3));
}
