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
