// village-event.ts — 마을 이벤트 모델

export interface VillageEventChoice {
  label: string;            // 선택지 텍스트
  goldCost: number;         // 선택지 비용
  successMsg: string;       // 성공 결과 메시지
  failureMsg: string;       // 실패 결과 메시지
  successChance: number;    // 0.0~1.0
  onSuccess: {
    populationDelta: number;
    happinessDelta: number;
    defenseDelta: number;
    reputationDelta: number;
    treasuryDelta: number;
  };
  onFailure: {
    populationDelta: number;
    happinessDelta: number;
    defenseDelta: number;
    reputationDelta: number;
    treasuryDelta: number;
  };
}

export type VillageEventCategory = 'seasonal' | 'crisis' | 'growth' | 'special';

export interface VillageEventDef {
  id: string;
  name: string;
  category: VillageEventCategory;
  description: string;
  triggerCondition: string;  // 조건 서술
  triggerStageMin: number;
  triggerStageMax: number;
  triggerPopMin: number;
  triggerSeason: string;     // 'spring'|'summer'|'autumn'|'winter'|''
  triggerRepMin: number;
  choices: [VillageEventChoice, VillageEventChoice];
  cooldownDays: number;
}
