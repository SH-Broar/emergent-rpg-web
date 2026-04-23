// title-system.ts — 칭호 조건 체크 및 부여
//
// 칭호 정의는 두 경로에서 제공된다:
//   1) 이 파일의 TITLE_CONDITIONS (구형, 한국어 ID) — 기존 세이브 호환성 유지
//   2) public/data/titles.txt (데이터) — hyperion DSL 로 조건 평가
// checkAndAwardTitles 는 두 소스를 모두 평가해 아직 획득하지 않은 칭호를 수여한다.
// 데이터 칭호는 표시 이름(name= 필드, 한국어)으로 earnedTitles 에 저장되므로
// UI 에서는 기존 한국어 칭호와 동일한 방식으로 표시된다.

import type { GameSession } from './game-session';
import type { DataSection } from '../data/parser';
import { checkHyperionCondition, type HyperionCondition } from './hyperion';

interface TitleCondition {
  id: string;
  check: (session: GameSession) => boolean;
}

// 단일 조건 칭호는 titles.txt 로 이관되었다. 여기엔 hyperion DSL 이 아직 AND 합성을
// 지원하지 않아 코드로 남겨야 하는 복합 조건 칭호만 유지한다. 이관된 타이틀의 설명은
// 아래 TITLE_DESCRIPTIONS 에 참조용으로 남겨둔다 (UI/도움말 호환).
const TITLE_CONDITIONS: TitleCondition[] = [
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

// ============================================================
// 데이터 기반 칭호 (public/data/titles.txt)
// ============================================================

interface DataTitleRule {
  /** 섹션 ID (e.g. 'beginner_explorer') */
  sectionId: string;
  /** 표시 이름 (한국어). earnedTitles 에도 이 값이 저장된다. */
  displayName: string;
  description: string;
  condition: HyperionCondition;
  priority: number;
}

const dataTitleRules: DataTitleRule[] = [];

/** titles.txt 로드. data-init.ts 가 호출한다. */
export function loadTitleDefs(sections: DataSection[]): void {
  dataTitleRules.length = 0;
  for (const s of sections) {
    if (s.name.startsWith('#') || s.name === 'Meta') continue;
    const displayName = s.get('name', s.name).trim();
    const condStr = s.get('condition', '').trim();
    if (!displayName || !condStr) continue;
    dataTitleRules.push({
      sectionId: s.name,
      displayName,
      description: s.get('description', ''),
      condition: { description: s.get('description', ''), type: condStr },
      priority: s.getInt('priority', 0),
    });
  }
}

/** 데이터 칭호 전체 rule 반환 */
export function getDataTitleRules(): readonly DataTitleRule[] {
  return dataTitleRules;
}

/** 특정 (레거시 또는 데이터) 칭호의 획득 방법 설명 반환 */
export function getTitleDescription(titleId: string): string {
  const legacy = TITLE_DESCRIPTIONS[titleId];
  if (legacy) return legacy;
  // 데이터 칭호의 경우 earnedTitles 에는 displayName 이 저장됨
  const dataRule = dataTitleRules.find(r => r.displayName === titleId || r.sectionId === titleId);
  return dataRule?.description ?? '';
}

/** 전체 칭호 표시 이름 목록 (UI 용) — 레거시 한국어 ID + 데이터 displayName 합집합 */
export function getAllTitleDisplayNames(): string[] {
  const set = new Set<string>(Object.keys(TITLE_DESCRIPTIONS));
  for (const rule of dataTitleRules) set.add(rule.displayName);
  return [...set];
}

/**
 * 조건을 충족한 미획득 칭호를 부여하고 새로 획득한 칭호 목록을 반환한다.
 * 하드코딩 규칙과 titles.txt 데이터 규칙을 모두 평가한다.
 */
export function checkAndAwardTitles(session: GameSession): string[] {
  const newTitles: string[] = [];

  // 1) 레거시 하드코딩 규칙
  for (const cond of TITLE_CONDITIONS) {
    if (!session.knowledge.hasTitle(cond.id) && cond.check(session)) {
      session.knowledge.addTitle(cond.id);
      newTitles.push(cond.id);
    }
  }

  // 2) 데이터 규칙 (titles.txt) — hyperion DSL 평가기 재사용
  for (const rule of dataTitleRules) {
    if (session.knowledge.hasTitle(rule.displayName)) continue;
    const ok = checkHyperionCondition(
      rule.condition,
      session.player.name,
      session.player,
      session.actors,
      session.knowledge,
      session.gameTime,
      session.dungeonSystem,
    );
    if (ok) {
      session.knowledge.addTitle(rule.displayName);
      newTitles.push(rule.displayName);
    }
  }

  return newTitles;
}
