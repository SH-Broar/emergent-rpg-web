// title-system.ts — 칭호 조건 체크 및 부여

import type { GameSession } from './game-session';

interface TitleCondition {
  id: string;
  check: (session: GameSession) => boolean;
}

const TITLE_CONDITIONS: TitleCondition[] = [
  // 채집
  { id: '첫 수확',     check: s => s.knowledge.totalGathersDone >= 1 },
  { id: '야생 수집가', check: s => s.knowledge.totalGathersDone >= 50 },
  { id: '대지의 손길', check: s => s.knowledge.totalGathersDone >= 200 },

  // 요리
  { id: '첫 요리',   check: s => s.knowledge.totalCooksDone >= 1 },
  { id: '가정의 맛', check: s => s.knowledge.totalCooksDone >= 30 },
  { id: '마을 요리사', check: s => s.knowledge.totalCooksDone >= 100 },

  // 농장
  { id: '새싹 농부', check: s => s.knowledge.totalFarmHarvests >= 1 },
  { id: '황금 밭',   check: s => s.knowledge.totalFarmHarvests >= 50 },

  // 거래/판매
  { id: '장사 수완',   check: s => s.knowledge.totalItemsSold >= 30 },
  { id: '시장의 고수', check: s => s.knowledge.totalItemsSold >= 150 },
  { id: '상인의 계보', check: s => s.knowledge.totalItemsSold >= 500 },

  // 선물
  { id: '다정한 손길', check: s => s.knowledge.totalGiftsGiven >= 10 },
  { id: '선물의 달인', check: s => s.knowledge.totalGiftsGiven >= 50 },
  { id: '이웃의 빛',   check: s => s.knowledge.totalGiftsGiven >= 100 },

  // 활동
  { id: '생활인',       check: s => s.knowledge.totalActivitiesDone >= 20 },
  { id: '부지런한 시민', check: s => s.knowledge.totalActivitiesDone >= 80 },
  { id: '삶의 예술가',  check: s => s.knowledge.totalActivitiesDone >= 200 },

  // 관계
  { id: '친근한 사람',   check: s => s.knowledge.conversationPartners.size >= 5 },
  { id: '수다쟁이',      check: s => s.knowledge.totalConversations >= 100 },
  { id: '마을의 얼굴',   check: s => s.knowledge.totalConversations >= 500 },
  { id: '모두의 친구',   check: s => s.knowledge.conversationPartners.size >= 20 },

  // 거점
  { id: '집주인',      check: s => s.knowledge.ownedBases.size >= 3 },
  { id: '부동산 감각', check: s => s.knowledge.ownedBases.size >= 5 },
  { id: '안락한 제국', check: s => s.knowledge.ownedBases.size >= 7 },

  // 여행
  { id: '호기심 많은 자', check: s => s.knowledge.visitedLocations.size >= 5 },
  { id: '발 넓은 여행자', check: s => s.knowledge.visitedLocations.size >= 15 },
  { id: '세계를 아는 자', check: s => s.knowledge.visitedLocations.size >= 30 },

  // 음식
  { id: '미식가',        check: s => s.knowledge.foodTypesEaten.size >= 10 },
  { id: '모험적인 입맛', check: s => s.knowledge.foodTypesEaten.size >= 20 },

  // 퀘스트
  { id: '도움을 주는 사람', check: s => s.knowledge.completedQuestCount >= 5 },
  { id: '길드의 일꾼',      check: s => s.knowledge.completedQuestCount >= 20 },

  // === 마을 관련 칭호 ===
  {
    id: '개척자',
    check: s => s.knowledge.villageState !== null,
  },
  {
    id: '마을 촌장',
    check: s => (s.knowledge.villageState?.stage ?? 0) >= 2,
  },
  {
    id: '읍장',
    check: s => (s.knowledge.villageState?.stage ?? 0) >= 4,
  },
  {
    id: '도시의 설계자',
    check: s => (s.knowledge.villageState?.stage ?? 0) >= 6,
  },
  {
    id: '왕도의 지배자',
    check: s => (s.knowledge.villageState?.stage ?? 0) >= 7,
  },
  {
    id: '교통왕',
    check: s => (s.knowledge.villageState?.roads.length ?? 0) >= 4,
  },
  {
    id: '번영의 설계사',
    check: s => (s.knowledge.villageState?.totalVisitorIncome ?? 0) >= 100000,
  },
  {
    id: '주민의 친구',
    check: s => (s.knowledge.villageState?.totalVisitorDays ?? 0) >= 10,
  },
  {
    id: '축제의 왕',
    check: s => (s.knowledge.villageState?.springFestivalCount ?? 0) >= 5,
  },
  {
    id: '위기를 넘은 자',
    check: s => (s.knowledge.villageState?.crisisEventSuccessCount ?? 0) >= 5,
  },

  // 종합
  {
    id: '여유로운 나날',
    check: s =>
      s.knowledge.totalGiftsGiven >= 30 &&
      s.knowledge.totalActivitiesDone >= 50 &&
      s.knowledge.totalCooksDone >= 30,
  },
  {
    id: '이 세계의 시민',
    check: s =>
      s.knowledge.visitedLocations.size >= 10 &&
      s.knowledge.totalConversations >= 200 &&
      s.knowledge.ownedBases.size >= 2,
  },
];

/** 칭호 ID → 획득 방법 설명 */
export const TITLE_DESCRIPTIONS: Record<string, string> = {
  '첫 수확':       '채집을 1번 성공한다',
  '야생 수집가':   '채집을 50번 성공한다',
  '대지의 손길':   '채집을 200번 성공한다',
  '첫 요리':       '요리를 1번 완성한다',
  '가정의 맛':     '요리를 30번 완성한다',
  '마을 요리사':   '요리를 100번 완성한다',
  '새싹 농부':     '농장에서 수확을 1번 한다',
  '황금 밭':       '농장에서 수확을 50번 한다',
  '장사 수완':     '아이템을 30개 판매한다',
  '시장의 고수':   '아이템을 150개 판매한다',
  '상인의 계보':   '아이템을 500개 판매한다',
  '다정한 손길':   'NPC에게 선물을 10번 준다',
  '선물의 달인':   'NPC에게 선물을 50번 준다',
  '이웃의 빛':     'NPC에게 선물을 100번 준다',
  '생활인':        '활동을 20번 완료한다',
  '부지런한 시민': '활동을 80번 완료한다',
  '삶의 예술가':   '활동을 200번 완료한다',
  '친근한 사람':   '5명의 NPC와 대화한다',
  '수다쟁이':      '대화를 총 100번 한다',
  '마을의 얼굴':   '대화를 총 500번 한다',
  '모두의 친구':   '20명의 NPC와 대화한다',
  '집주인':        '거점을 3곳 이상 소유한다',
  '부동산 감각':   '거점을 5곳 이상 소유한다',
  '안락한 제국':   '거점을 7곳 이상 소유한다',
  '호기심 많은 자': '5곳 이상의 지역을 방문한다',
  '발 넓은 여행자': '15곳 이상의 지역을 방문한다',
  '세계를 아는 자': '30곳 이상의 지역을 방문한다',
  '미식가':        '10종류 이상의 음식을 먹는다',
  '모험적인 입맛': '20종류 이상의 음식을 먹는다',
  '도움을 주는 사람': '퀘스트를 5개 완료한다',
  '길드의 일꾼':   '퀘스트를 20개 완료한다',
  '개척자':        '마을을 건설한다',
  '마을 촌장':     '마을을 2단계로 성장시킨다',
  '읍장':          '마을을 4단계로 성장시킨다',
  '도시의 설계자': '마을을 6단계로 성장시킨다',
  '왕도의 지배자': '마을을 7단계로 성장시킨다',
  '교통왕':        '마을 도로를 4개 이상 건설한다',
  '번영의 설계사': '마을 방문객 수입 합계 100,000G 달성',
  '주민의 친구':   '마을 방문객 누적 10일 이상',
  '축제의 왕':     '봄 축제를 5회 이상 개최한다',
  '위기를 넘은 자': '마을 위기 이벤트를 5회 이상 성공한다',
  '여유로운 나날': '선물 30번 + 활동 50번 + 요리 30번',
  '이 세계의 시민': '지역 10곳 방문 + 대화 200번 + 거점 2곳',
};

/**
 * 조건을 충족한 미획득 칭호를 부여하고 새로 획득한 칭호 목록을 반환한다.
 */
export function checkAndAwardTitles(session: GameSession): string[] {
  const newTitles: string[] = [];
  for (const cond of TITLE_CONDITIONS) {
    if (!session.knowledge.hasTitle(cond.id) && cond.check(session)) {
      session.knowledge.addTitle(cond.id);
      newTitles.push(cond.id);
    }
  }
  return newTitles;
}
