// puchi-tower-defs.ts — 푸치 탑 층별 보스 정의

export interface TowerFloorDef {
  floor: number;
  bossId: string;
  floorName: string;
  sourceDungeon: string; // flavor text
}

export const TOWER_FLOOR_DEFS: TowerFloorDef[] = [
  { floor: 1,  bossId: 'Tower_Sentinel',      floorName: '1층 — 탑의 관문',         sourceDungeon: '탑 외곽 잔해' },
  { floor: 2,  bossId: 'Floor_Phantom',        floorName: '2층 — 환영의 복도',        sourceDungeon: '탑 외곽 잔해' },
  { floor: 3,  bossId: 'Lunar_Stag',           floorName: '3층 — 달빛 사슴뿔',        sourceDungeon: '달빛 숲' },
  { floor: 4,  bossId: 'Clockwork_Knight',     floorName: '4층 — 태엽 기사의 방',    sourceDungeon: '탑 중간층 회랑' },
  { floor: 5,  bossId: 'Canyon_Harpy',         floorName: '5층 — 협곡의 하르피',      sourceDungeon: '해안 절벽 길' },
  { floor: 6,  bossId: 'Bagreat_Giant',        floorName: '6층 — 광부의 거인',        sourceDungeon: '고대 광부의 길' },
  { floor: 7,  bossId: 'Fog_Panther',          floorName: '7층 — 안개표범의 영역',    sourceDungeon: '안개나무 길' },
  { floor: 8,  bossId: 'Crystal_Serpent',      floorName: '8층 — 수정 해안의 뱀',    sourceDungeon: '유리 해안' },
  { floor: 9,  bossId: 'Blizzard_Stag',        floorName: '9층 — 설원의 사슴',        sourceDungeon: '서리 고리' },
  { floor: 10, bossId: 'Icebound_Sentry',      floorName: '10층 — 빙원 초소병',       sourceDungeon: '영구동토층 베이스' },
  { floor: 11, bossId: 'Pack_Tyrant',          floorName: '11층 — 무리의 폭군',       sourceDungeon: '오데 늑대 영역' },
  { floor: 12, bossId: 'Trial_Golem',          floorName: '12층 — 시련 골렘',         sourceDungeon: '탑 상층 파사드' },
  { floor: 13, bossId: 'Cloud_Leaper',         floorName: '13층 — 구름 도약자',       sourceDungeon: '허공 구름잎' },
  { floor: 14, bossId: 'Void_Hornet',          floorName: '14층 — 허공 말벌',         sourceDungeon: '허공 말벌 둥지' },
  { floor: 15, bossId: 'Ruin_Scout',           floorName: '15층 — 구역 척후병',       sourceDungeon: '리아그랄타 99구역' },
  { floor: 16, bossId: 'Siege_Golem',          floorName: '16층 — 공성 골렘',         sourceDungeon: '에니챰 855GV' },
  { floor: 17, bossId: 'Corruption_Specter',   floorName: '17층 — 오염 유령',         sourceDungeon: '하라티쿠스 지하' },
  { floor: 18, bossId: 'Ruin_Crawler',         floorName: '18층 — 폐허 배회자',       sourceDungeon: '하라티쿠스 표층' },
  { floor: 19, bossId: 'Relic_Golem',          floorName: '19층 — 유물 골렘',         sourceDungeon: '하라티쿠스 금고' },
  { floor: 20, bossId: 'Ancient_Automaton',    floorName: '20층 — 고대 자동인형',     sourceDungeon: '하라티쿠스 지하' },
  { floor: 21, bossId: 'Haratikus_Colossus',   floorName: '21층 — 하라티쿠스 거인상', sourceDungeon: '하라티쿠스 지하' },
  { floor: 22, bossId: 'Demon_Chamberlain',    floorName: '22층 — 마왕성 시종장',    sourceDungeon: '마왕의 옥좌 방' },
  { floor: 23, bossId: 'Sun_Colossus',         floorName: '23층 — 태양 거상',         sourceDungeon: '이카르 태양 정상' },
  { floor: 24, bossId: 'Sector_Overseer',      floorName: '24층 — 구역 감독관',       sourceDungeon: '나브리트 아크 코어' },
  { floor: 25, bossId: 'Ember_Tyrant',         floorName: '25층 — 불씨 폭군',         sourceDungeon: '트리플라워 분화구' },
  { floor: 26, bossId: 'Lava_Golem',           floorName: '26층 — 용암 골렘',         sourceDungeon: '트리플라워 분화구' },
  { floor: 27, bossId: 'Storm_Giant',          floorName: '27층 — 폭풍 거인',         sourceDungeon: '리엘 내성' },
  { floor: 28, bossId: 'Ancient_Leviathan',    floorName: '28층 — 고대 레비아탄',    sourceDungeon: '세계수 심목' },
  { floor: 29, bossId: 'Verdant_Colossus',     floorName: '29층 — 녹생 거상',         sourceDungeon: '세계수 수관' },
  { floor: 30, bossId: 'Tower_Revenant',       floorName: '30층 — 탑의 망령',         sourceDungeon: '푸치 탑 전용' },
  { floor: 31, bossId: 'Abyss_Crawler',        floorName: '31층 — 심연 배회자',       sourceDungeon: '푸치 탑 전용' },
  { floor: 32, bossId: 'Sky_Titan',            floorName: '32층 — 천공 거인',         sourceDungeon: '푸치 탑 전용' },
  { floor: 33, bossId: 'Stone_Revenant',       floorName: '33층 — 석조 망령',         sourceDungeon: '푸치 탑 전용' },
  { floor: 34, bossId: 'Iron_Colossus',        floorName: '34층 — 철제 거상',         sourceDungeon: '푸치 탑 전용' },
  { floor: 35, bossId: 'Shadow_Drake',         floorName: '35층 — 그림자 용',         sourceDungeon: '푸치 탑 전용' },
  { floor: 36, bossId: 'Eternal_Warden',       floorName: '36층 — 영원의 수호자',     sourceDungeon: '푸치 탑 전용' },
  { floor: 37, bossId: 'Void_Reaper',          floorName: '37층 — 공허 낫잡이',       sourceDungeon: '푸치 탑 전용' },
  { floor: 38, bossId: 'Thunder_Golem',        floorName: '38층 — 뇌격 골렘',         sourceDungeon: '푸치 탑 전용' },
  { floor: 39, bossId: 'Crystal_Titan',        floorName: '39층 — 수정 거인',         sourceDungeon: '푸치 탑 전용' },
  { floor: 40, bossId: 'Hyperion_Shade',       floorName: '40층 — 히페리온의 잔상',   sourceDungeon: '푸치 탑 전용' },
  { floor: 41, bossId: 'Ruin_Sovereign',       floorName: '41층 — 폐허의 군주',       sourceDungeon: '푸치 탑 전용' },
  { floor: 42, bossId: 'Storm_Titan',          floorName: '42층 — 폭풍 거인왕',       sourceDungeon: '푸치 탑 전용' },
  { floor: 43, bossId: 'Abyss_Knight',         floorName: '43층 — 심연 기사',         sourceDungeon: '푸치 탑 전용' },
  { floor: 44, bossId: 'Shadow_Colossus',      floorName: '44층 — 그림자 거상',       sourceDungeon: '푸치 탑 전용' },
  { floor: 45, bossId: 'Ancient_Guardian',     floorName: '45층 — 고대 수호신',       sourceDungeon: '푸치 탑 전용' },
  { floor: 46, bossId: 'Celestial_Golem',      floorName: '46층 — 천상 골렘',         sourceDungeon: '푸치 탑 전용' },
  { floor: 47, bossId: 'World_Eater',          floorName: '47층 — 세계 삼키는 자',    sourceDungeon: '푸치 탑 전용' },
  { floor: 48, bossId: 'Tower_Sovereign',      floorName: '48층 — 탑의 군주',         sourceDungeon: '푸치 탑 전용' },
  { floor: 49, bossId: 'Prime_Revenant',       floorName: '49층 — 원초의 망령',       sourceDungeon: '푸치 탑 전용' },
  { floor: 50, bossId: 'Hyperion_Avatar',      floorName: '50층 — 히페리온의 화신',   sourceDungeon: '푸치 탑 전용' },
  { floor: 51, bossId: 'Tower_Deity',          floorName: '51층 — 탑의 신격',         sourceDungeon: '푸치 탑 전용' },
  { floor: 52, bossId: 'Dragon_Rize',          floorName: '52층 — 드래곤 리제',        sourceDungeon: '푸치 탑 전용' },
];

export const TOWER_TOTAL_FLOORS = 52;
export const TOWER_CHECKPOINT_LOCK_FLOOR = 40; // 40+ 도달 시 항상 40층부터만 시작

/**
 * 해금된 최대 시작 층 계산 (단일 값).
 * ex) highestFloor=37 → 30, highestFloor=10 → 5
 */
export function getTowerMaxStartFloor(highestFloor: number): number {
  if (highestFloor <= 0) return 1;
  if (highestFloor >= TOWER_CHECKPOINT_LOCK_FLOOR) return TOWER_CHECKPOINT_LOCK_FLOOR;
  const nearestCheckpoint = Math.floor(highestFloor / 5) * 5;
  if (nearestCheckpoint <= 0) return 1;
  return Math.max(1, nearestCheckpoint - 5);
}

/**
 * 선택 가능한 시작 층 목록 반환.
 * - 40층 이상 도달: [40] 고정
 * - 그 외: 1, 5, 10, … 해금 최대치까지 5층 단위
 */
export function getAvailableStartFloors(highestFloor: number): number[] {
  if (highestFloor >= TOWER_CHECKPOINT_LOCK_FLOOR) return [TOWER_CHECKPOINT_LOCK_FLOOR];
  const maxStart = getTowerMaxStartFloor(highestFloor);
  const floors: number[] = [1];
  for (let f = 5; f <= maxStart; f += 5) {
    floors.push(f);
  }
  return floors;
}
