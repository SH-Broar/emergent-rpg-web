# EmergentRPG Village Tycoon Phase 2 구현 계획서

작성일: 2026-04-12
대상: game-implementer

---

## 0. Phase 1 현황 요약

| 파일 | 역할 | Phase 2 변경 필요성 |
|------|------|---------------------|
| `src/models/village.ts` | VillageState, 헬퍼 함수 | 대규모 확장 필요 |
| `src/data/village-defs.ts` | FacilityDef, RoadDef 레지스트리 | 확장 필요 |
| `src/data/village-init.ts` | INI 파싱 → 레지스트리 등록 | 신규 파일 파싱 추가 |
| `src/ui/screens/village.ts` | 마을 메인 화면 | 벤젠 버튼, 단계 표시, 업그레이드 UI 추가 |
| `src/ui/screens/village-build.ts` | 건설 팝업 | 변경 없음 |
| `public/data/village-facilities.txt` | 10개 시설 정의 | 티어 필드 추가 |
| `public/data/village-roads.txt` | 2등급 도로 | 변경 없음 |
| `src/systems/world-simulation.ts` | 일일 틱, 마을 정산 | 인구 성장, 단계 전환, 이벤트 트리거 추가 |
| `src/systems/save-system.ts` | 직렬화/역직렬화 | VillageState 확장분 반영 |
| `src/data/loader.ts` | 데이터 파일 로드 | 신규 파일 2개 추가 |

---

## 1. 변경 파일 목록

### 신규 파일

| 파일 | 계층 | 설명 |
|------|------|------|
| `public/data/village-events.txt` | Data | 마을 이벤트 15종 INI 정의 |
| `public/data/village-npcs.txt` | Data | 벤젠 NPC 데이터 |
| `src/models/village-event.ts` | Models | VillageEventDef, VillageEventInstance 타입 |
| `src/data/village-event-defs.ts` | Data | 이벤트 레지스트리 |
| `src/data/village-event-init.ts` | Data | village-events.txt 파싱 |
| `src/systems/village-simulation.ts` | Systems | 마을 전용 일일 틱 로직 분리 |
| `src/ui/screens/village-benzen.ts` | UI | 벤젠 대화 화면 |
| `src/ui/screens/village-event.ts` | UI | 마을 이벤트 선택지 화면 |

### 수정 파일

| 파일 | 변경 유형 |
|------|-----------|
| `public/data/village-facilities.txt` | 티어 필드(tier1/2/3 비용, 효과) 추가 |
| `src/models/village.ts` | VillageFacilityInstance 티어 필드, VillageState 확장 필드, 헬퍼 함수 |
| `src/data/village-defs.ts` | VillageFacilityDef 티어 배열 필드 추가 |
| `src/data/village-init.ts` | 티어 필드 파싱 로직 추가 |
| `src/data/loader.ts` | villageEvents, villageNpcs 로드 추가 |
| `src/data/data-init.ts` | initVillageEvents, initVillageNpcs 호출 추가 |
| `src/systems/world-simulation.ts` | tickVillage() 호출 추가 |
| `src/systems/save-system.ts` | VillageState 확장분 직렬화/역직렬화, SAVE_VERSION 3 |
| `src/models/knowledge.ts` | benzenAffinity, villageReputation, villageSpecialization 필드 추가 |
| `src/ui/screens/village.ts` | 벤젠 버튼, 티어 업그레이드 버튼, 단계/명성 표시, 이벤트 알림 추가 |

---

## 2. 구현 순서 (의존성 기준)

```
[Step 1] 데이터 모델 확장
  → src/models/village.ts
  → src/models/village-event.ts (신규)

[Step 2] 데이터 정의 레지스트리 확장
  → src/data/village-defs.ts
  → src/data/village-event-defs.ts (신규)

[Step 3] INI 데이터 파일 작성
  → public/data/village-facilities.txt (티어 필드 추가)
  → public/data/village-events.txt (신규)
  → public/data/village-npcs.txt (신규)

[Step 4] 파서/초기화 확장
  → src/data/village-init.ts (티어 파싱)
  → src/data/village-event-init.ts (신규)
  → src/data/loader.ts (신규 파일 로드 추가)
  → src/data/data-init.ts (신규 init 함수 호출)

[Step 5] 마을 시뮬레이션 시스템
  → src/systems/village-simulation.ts (신규 — 인구, 단계, 이벤트 틱)
  → src/systems/world-simulation.ts (tickVillage 호출 추가)

[Step 6] 세이브 시스템 마이그레이션
  → src/systems/save-system.ts

[Step 7] UI
  → src/ui/screens/village-benzen.ts (신규)
  → src/ui/screens/village-event.ts (신규)
  → src/ui/screens/village.ts (벤젠/업그레이드/이벤트 통합)

[Step 8] knowledge.ts 필드 추가
```

---

## 3. 각 파일 상세 변경 내용

---

### 3-1. `src/models/village.ts` (수정)

#### 추가할 타입

```typescript
// 시설 티어 업그레이드 재료 한 세트
export interface FacilityTierCost {
  gold: number;
  wood: number;
  stone: number;
  wheat: number;
  herb: number;          // 약초 (생활 재료)
  monsterBone: number;   // 던전 재료
  magicStone: number;    // 던전 재료
  rareMetal: number;     // 던전 재료
}

// VillageFacilityInstance 에 tier 필드 추가
export interface VillageFacilityInstance {
  facilityId: string;
  builtDay: number;
  status: VillageFacilityStatus;
  tier: 1 | 2 | 3;       // Phase 2 추가: 기본 1
  upgradedDay?: number;   // 마지막 업그레이드 일자
}

// 마을 이벤트 인스턴스 (활성 이벤트)
export interface VillageActiveEvent {
  eventId: string;
  triggeredDay: number;
  resolvedDay?: number;
  outcome?: 'success' | 'failure';
}

// 마을 전문화
export type VillageSpecialization = 'none' | 'production' | 'trade' | 'defense' | 'culture';

// VillageState 확장
export interface VillageState {
  locationId: string;
  name: string;
  foundedDay: number;
  stage: VillageStage;
  population: number;
  happiness: number;
  defense: number;
  facilities: VillageFacilityInstance[];
  roads: VillageRoadInstance[];
  finance: VillageFinance;
  // Phase 2 추가
  reputation: number;               // 명성 0~100
  specialization: VillageSpecialization;
  activeEvent: VillageActiveEvent | null;  // 현재 진행 중인 이벤트
  eventHistory: VillageActiveEvent[];
  benzenAppeared: boolean;          // 벤젠 첫 등장 여부
  lastPopGrowthDay: number;         // 마지막 인구 증가 처리일
}
```

#### 수정/추가 헬퍼 함수

```typescript
// checkVillageStageUp 실제 구현
export function checkVillageStageUp(v: VillageState): boolean {
  const activeFacilityCount = getActiveFacilities(v).length;
  if (v.stage === 1 && activeFacilityCount >= 1) return true;
  if (v.stage === 2 && activeFacilityCount >= 3 && v.population >= 5) return true;
  if (v.stage === 3 && activeFacilityCount >= 8 && v.population >= 15) return true;
  return false;
}

// 매력도 계산
export function calcVillageAttraction(v: VillageState): number {
  const activeFacCount = getActiveFacilities(v).length;
  return activeFacCount * 3 + v.happiness * 0.5;
}

// 일일 인구 증가량 계산
export function calcPopGrowth(v: VillageState): number {
  const attraction = calcVillageAttraction(v);
  const raw = (attraction - v.population * 1.5) * 0.08;
  return Math.min(2, Math.max(0, Math.floor(raw)));
}

// recalcVillageFinance 시그니처 확장 — 티어 반영
export function recalcVillageFinance(
  v: VillageState,
  getFacilityDef: (id: string) => VillageFacilityDef | undefined,
): void
// 내부: def.tiers[inst.tier - 1].incomePerDay 사용
```

#### createVillageState 확장

```typescript
export function createVillageState(locationId, name, foundedDay): VillageState {
  return {
    // 기존 필드 유지...
    reputation: 0,
    specialization: 'none',
    activeEvent: null,
    eventHistory: [],
    benzenAppeared: false,
    lastPopGrowthDay: foundedDay,
  };
}
```

---

### 3-2. `src/models/village-event.ts` (신규)

```typescript
export interface VillageEventChoice {
  label: string;            // 선택지 텍스트
  goldCost: number;         // 선택지 비용 (선택적)
  successMsg: string;       // 성공 결과 메시지
  failureMsg: string;       // 실패 결과 메시지
  successChance: number;    // 0.0~1.0
  // 결과 효과
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
  triggerCondition: string;  // 조건 서술 (파싱용 키: stage/population/season/reputation)
  triggerStageMin: number;
  triggerStageMax: number;
  triggerPopMin: number;
  triggerSeason: string;     // 'spring'|'summer'|'autumn'|'winter'|'' (비어있으면 무관)
  triggerRepMin: number;
  choices: [VillageEventChoice, VillageEventChoice];
  cooldownDays: number;      // 이 이벤트 재발생 최소 간격
}
```

---

### 3-3. `src/data/village-defs.ts` (수정)

VillageFacilityDef에 tiers 배열 추가:

```typescript
export interface FacilityTierDef {
  incomePerDay: number;
  maintenancePerDay: number;
  happinessBonus: number;
  defenseBonus: number;
  // 업그레이드 비용 (이 티어로 올리는 비용)
  upgradeCostGold: number;
  upgradeCostWood: number;
  upgradeCostStone: number;
  upgradeCostWheat: number;
  upgradeCostHerb: number;
  upgradeCostMonsterBone: number;
  upgradeCostMagicStone: number;
  upgradeCostRareMetal: number;
}

export interface VillageFacilityDef {
  // 기존 필드 유지
  id: string;
  name: string;
  category: 'production' | 'amenity' | 'defense' | 'admin' | 'culture' | 'special';
  unlockStage: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  buildCostWheat: number;
  // Phase 1의 incomePerDay, maintenancePerDay는 tiers[0]으로 이전
  // 하위 호환: 여전히 최상위에 유지 (Tier 1 기본값)
  incomePerDay: number;
  maintenancePerDay: number;
  description: string;
  // Phase 2 추가
  tiers: FacilityTierDef[];  // [tier1, tier2, tier3] — 길이 3 고정
}
```

VillageEventDef 레지스트리 추가:
```typescript
const eventRegistry = new Map<string, VillageEventDef>();
export function registerVillageEventDef(def: VillageEventDef): void
export function getVillageEventDef(id: string): VillageEventDef | undefined
export function getAllVillageEventDefs(): VillageEventDef[]
```

---

### 3-4. `public/data/village-facilities.txt` (수정)

기존 10개 섹션에 티어 필드 추가. 예시:

```ini
[lumber_mill]
name = 목재소
category = production
unlockStage = 1
buildCostGold = 500
buildCostWood = 15
buildCostStone = 5
incomePerDay = 15
maintenancePerDay = 3
description = 인근 숲 자원으로 목재를 생산한다.

# 티어별 효과 (tier1은 기존값과 동일)
tier1_incomePerDay = 15
tier1_maintenancePerDay = 3
tier1_happinessBonus = 0
tier1_defenseBonus = 0
tier1_upgradeCostGold = 0

tier2_incomePerDay = 25
tier2_maintenancePerDay = 5
tier2_happinessBonus = 2
tier2_defenseBonus = 0
tier2_upgradeCostGold = 800
tier2_upgradeCostWood = 30
tier2_upgradeCostStone = 10
tier2_upgradeCostMonsterBone = 5

tier3_incomePerDay = 40
tier3_maintenancePerDay = 8
tier3_happinessBonus = 5
tier3_defenseBonus = 0
tier3_upgradeCostGold = 2000
tier3_upgradeCostWood = 60
tier3_upgradeCostStone = 20
tier3_upgradeCostMagicStone = 3
tier3_upgradeCostRareMetal = 1
```

전체 10개 시설에 동일 패턴으로 적용. 카테고리별 특성:
- production 계열: incomePerDay 위주 증가
- amenity 계열: happinessBonus 위주 증가
- defense 계열: defenseBonus 위주 증가
- culture 계열: happiness + reputation 효과

---

### 3-5. `public/data/village-events.txt` (신규)

INI 포맷. 선택지 2개는 choice1_*, choice2_* 접두사로 표현.

```ini
# village-events.txt — 마을 이벤트 15종

# ============================================================
# 계절 이벤트 4종
# ============================================================

[spring_festival]
name = 봄 축제
category = seasonal
triggerSeason = spring
triggerStageMin = 2
triggerPopMin = 3
triggerRepMin = 0
cooldownDays = 90
description = 봄 햇살 아래 주민들이 축제를 열고 싶어 한다. 허락하겠는가?
choice1_label = 축제를 열어라 (50G)
choice1_goldCost = 50
choice1_successChance = 0.9
choice1_successMsg = 축제가 성황리에 끝났다. 주민들의 행복도가 크게 올랐다.
choice1_failureMsg = 예상치 못한 비로 축제가 망쳤다. 주민들이 실망했다.
choice1_success_happinessDelta = 15
choice1_success_reputationDelta = 5
choice1_success_populationDelta = 1
choice1_failure_happinessDelta = -5
choice1_failure_reputationDelta = -2
choice2_label = 지금은 아니다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 주민들이 아쉬워하지만 이해한다.
choice2_failureMsg = 주민들이 아쉬워하지만 이해한다.
choice2_success_happinessDelta = -3
choice2_success_reputationDelta = 0

[summer_drought]
name = 여름 가뭄
category = seasonal
triggerSeason = summer
triggerStageMin = 1
triggerPopMin = 1
triggerRepMin = 0
cooldownDays = 90
description = 무더위와 가뭄이 마을을 위협한다. 비상 식량을 비축하겠는가?
choice1_label = 식량 비축 (200G)
choice1_goldCost = 200
choice1_successChance = 1.0
choice1_successMsg = 비축 덕분에 가뭄을 무사히 넘겼다.
choice1_failureMsg = 비축 덕분에 가뭄을 무사히 넘겼다.
choice1_success_happinessDelta = 5
choice1_success_treasuryDelta = -200
choice2_label = 그냥 버틴다
choice2_goldCost = 0
choice2_successChance = 0.5
choice2_successMsg = 운 좋게 비가 내렸다. 위기를 넘겼다.
choice2_failureMsg = 가뭄이 심해졌다. 주민들이 고통받고 있다.
choice2_success_happinessDelta = 0
choice2_failure_happinessDelta = -12
choice2_failure_populationDelta = -1

[autumn_harvest]
name = 가을 풍년
category = seasonal
triggerSeason = autumn
triggerStageMin = 2
triggerPopMin = 5
triggerRepMin = 0
cooldownDays = 90
description = 풍년이 들었다. 잉여 작물을 어떻게 처리하겠는가?
choice1_label = 시장에 판다
choice1_goldCost = 0
choice1_successChance = 0.85
choice1_successMsg = 작물이 좋은 가격에 팔렸다.
choice1_failureMsg = 시장 가격이 좋지 않아 이익이 적었다.
choice1_success_treasuryDelta = 300
choice1_success_reputationDelta = 3
choice1_failure_treasuryDelta = 80
choice2_label = 주민에게 나눠준다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 주민들의 행복도가 크게 올랐다.
choice2_failureMsg = 주민들의 행복도가 크게 올랐다.
choice2_success_happinessDelta = 20
choice2_success_reputationDelta = 5

[winter_blizzard]
name = 겨울 눈보라
category = seasonal
triggerSeason = winter
triggerStageMin = 1
triggerPopMin = 1
triggerRepMin = 0
cooldownDays = 90
description = 강한 눈보라가 마을을 덮쳤다. 주민들을 어떻게 보호하겠는가?
choice1_label = 창고 식량을 개방한다 (100G)
choice1_goldCost = 100
choice1_successChance = 1.0
choice1_successMsg = 주민들이 따뜻하게 겨울을 났다.
choice1_failureMsg = 주민들이 따뜻하게 겨울을 났다.
choice1_success_happinessDelta = 10
choice1_success_defenseDelta = 2
choice2_label = 각자도생을 권한다
choice2_goldCost = 0
choice2_successChance = 0.4
choice2_successMsg = 주민들이 스스로 버텼다.
choice2_failureMsg = 눈보라로 주민 일부가 마을을 떠났다.
choice2_failure_populationDelta = -2
choice2_failure_happinessDelta = -15

# ============================================================
# 위기 이벤트 6종
# ============================================================

[bandit_raid]
name = 도적 습격
category = crisis
triggerSeason =
triggerStageMin = 1
triggerPopMin = 3
triggerRepMin = 0
cooldownDays = 40
description = 도적 무리가 마을 주변에 출몰하고 있다. 어떻게 대응하겠는가?
choice1_label = 의용대를 조직한다 (150G)
choice1_goldCost = 150
choice1_successChance = 0.75
choice1_successMsg = 의용대가 도적을 격퇴했다. 마을 방어도가 올랐다.
choice1_failureMsg = 도적과 싸웠지만 패배했다. 마을이 약탈당했다.
choice1_success_defenseDelta = 8
choice1_success_reputationDelta = 5
choice1_failure_treasuryDelta = -200
choice1_failure_happinessDelta = -10
choice2_label = 도적에게 통행세를 낸다 (300G)
choice2_goldCost = 300
choice2_successChance = 0.9
choice2_successMsg = 도적들이 물러났다. 일시적인 평화가 찾아왔다.
choice2_failureMsg = 통행세를 냈지만 도적이 더 요구한다.
choice2_success_treasuryDelta = -300
choice2_failure_treasuryDelta = -500
choice2_failure_reputationDelta = -5

[plague]
name = 전염병 창궐
category = crisis
triggerSeason =
triggerStageMin = 2
triggerPopMin = 8
triggerRepMin = 0
cooldownDays = 60
description = 마을에 열병이 돌기 시작했다. 즉각 대응하겠는가?
choice1_label = 약초를 구해 치료한다 (약초×10)
choice1_goldCost = 0
choice1_successChance = 0.8
choice1_successMsg = 치료에 성공했다. 전염병이 잡혔다.
choice1_failureMsg = 약초로는 역부족이었다. 전염병이 확산됐다.
choice1_success_happinessDelta = 10
choice1_success_reputationDelta = 8
choice1_failure_populationDelta = -3
choice1_failure_happinessDelta = -20
choice2_label = 격리 구역을 설치한다
choice2_goldCost = 0
choice2_successChance = 0.65
choice2_successMsg = 격리 조치로 확산을 막았다.
choice2_failureMsg = 격리가 너무 늦었다. 주민 여럿이 쓰러졌다.
choice2_success_happinessDelta = -5
choice2_success_populationDelta = 0
choice2_failure_populationDelta = -2
choice2_failure_happinessDelta = -15

[poor_harvest]
name = 흉작
category = crisis
triggerSeason = autumn
triggerStageMin = 2
triggerPopMin = 5
triggerRepMin = 0
cooldownDays = 90
description = 올해 수확이 형편없다. 식량 부족이 우려된다.
choice1_label = 인근 마을에서 식량을 사온다 (400G)
choice1_goldCost = 400
choice1_successChance = 0.95
choice1_successMsg = 식량을 확보해 위기를 넘겼다.
choice1_failureMsg = 식량을 확보해 위기를 넘겼다.
choice1_success_happinessDelta = 0
choice1_success_treasuryDelta = -400
choice2_label = 배급제를 시행한다
choice2_goldCost = 0
choice2_successChance = 0.6
choice2_successMsg = 배급제 덕분에 겨울을 났다. 주민들이 다소 불만이다.
choice2_failureMsg = 배급제도 역부족이었다. 주민들이 마을을 떠났다.
choice2_success_happinessDelta = -10
choice2_failure_populationDelta = -2
choice2_failure_happinessDelta = -20

[storm_damage]
name = 폭풍 피해
category = crisis
triggerSeason =
triggerStageMin = 1
triggerPopMin = 1
triggerRepMin = 0
cooldownDays = 45
description = 큰 폭풍이 마을 시설 일부를 망가뜨렸다. 복구하겠는가?
choice1_label = 즉시 복구한다 (300G)
choice1_goldCost = 300
choice1_successChance = 1.0
choice1_successMsg = 신속히 복구해 피해를 최소화했다.
choice1_failureMsg = 신속히 복구해 피해를 최소화했다.
choice1_success_happinessDelta = 5
choice1_success_reputationDelta = 3
choice2_label = 천천히 복구한다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 시간이 걸렸지만 복구됐다. 그동안 수입이 줄었다.
choice2_failureMsg = 시간이 걸렸지만 복구됐다.
choice2_success_treasuryDelta = -150
choice2_success_happinessDelta = -5

[migration_crisis]
name = 이민 위기
category = crisis
triggerSeason =
triggerStageMin = 3
triggerPopMin = 10
triggerRepMin = 0
cooldownDays = 50
description = 인근 지역 난민들이 마을 앞에 모여들었다. 받아들이겠는가?
choice1_label = 난민을 받아들인다
choice1_goldCost = 0
choice1_successChance = 0.7
choice1_successMsg = 난민들이 정착해 마을 인구가 늘었다.
choice1_failureMsg = 난민 유입으로 식량 부족과 갈등이 생겼다.
choice1_success_populationDelta = 3
choice1_success_reputationDelta = 10
choice1_failure_happinessDelta = -15
choice1_failure_treasuryDelta = -200
choice2_label = 정중히 돌려보낸다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 마을 질서는 유지됐다.
choice2_failureMsg = 마을 질서는 유지됐다.
choice2_success_reputationDelta = -8
choice2_success_happinessDelta = -3

[merchant_conflict]
name = 상인 갈등
category = crisis
triggerSeason =
triggerStageMin = 2
triggerPopMin = 5
triggerRepMin = 10
cooldownDays = 40
description = 두 상인 집단이 마을 시장 이권을 두고 다툰다. 중재하겠는가?
choice1_label = 공개 경쟁을 허용한다
choice1_goldCost = 0
choice1_successChance = 0.75
choice1_successMsg = 공정한 경쟁으로 시장이 활성화됐다.
choice1_failureMsg = 과열 경쟁으로 약자가 쫓겨나 마을 분위기가 험악해졌다.
choice1_success_treasuryDelta = 200
choice1_success_reputationDelta = 5
choice1_failure_happinessDelta = -10
choice1_failure_reputationDelta = -5
choice2_label = 한쪽 편을 든다 (뇌물 100G)
choice2_goldCost = 0
choice2_successChance = 0.6
choice2_successMsg = 지지한 상인이 고마움을 표했다.
choice2_successMsg = 지지를 받은 상인이 독점을 시작했다.
choice2_success_treasuryDelta = 100
choice2_failure_happinessDelta = -8
choice2_failure_reputationDelta = -8

# ============================================================
# 성장 이벤트 3종 (인구 도달 시 1회성)
# ============================================================

[growth_pop10]
name = 마을이 커지다 (인구 10)
category = growth
triggerSeason =
triggerStageMin = 1
triggerPopMin = 10
triggerRepMin = 0
cooldownDays = 999
description = 마을 인구가 10명에 달했다. 주민들이 마을의 미래를 논하고 있다.
choice1_label = 마을 발전 계획을 발표한다
choice1_goldCost = 0
choice1_successChance = 1.0
choice1_successMsg = 주민들이 환호했다. 마을의 방향이 정해졌다.
choice1_failureMsg = 주민들이 환호했다.
choice1_success_happinessDelta = 10
choice1_success_reputationDelta = 10
choice2_label = 조용히 넘어간다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 평온한 일상이 계속된다.
choice2_failureMsg = 평온한 일상이 계속된다.
choice2_success_happinessDelta = 0

[growth_pop50]
name = 중견 마을 (인구 50)
category = growth
triggerSeason =
triggerStageMin = 1
triggerPopMin = 50
triggerRepMin = 0
cooldownDays = 999
description = 마을 인구가 50명을 넘었다. 이제 작은 마을이 아니다.
choice1_label = 마을 전문화를 선언한다
choice1_goldCost = 0
choice1_successChance = 1.0
choice1_successMsg = 마을의 정체성이 확립됐다.
choice1_failureMsg = 마을의 정체성이 확립됐다.
choice1_success_happinessDelta = 15
choice1_success_reputationDelta = 15
choice2_label = 균형 발전을 유지한다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 안정된 성장이 계속된다.
choice2_failureMsg = 안정된 성장이 계속된다.
choice2_success_happinessDelta = 5
choice2_success_reputationDelta = 5

[growth_pop100]
name = 도시로의 발걸음 (인구 100)
category = growth
triggerSeason =
triggerStageMin = 1
triggerPopMin = 100
triggerRepMin = 0
cooldownDays = 999
description = 인구 100명. 마을은 이제 도시로 발전할 기로에 섰다.
choice1_label = 도시 선포식을 연다 (500G)
choice1_goldCost = 500
choice1_successChance = 1.0
choice1_successMsg = 세계 각지에 마을의 이름이 알려졌다.
choice1_failureMsg = 세계 각지에 마을의 이름이 알려졌다.
choice1_success_reputationDelta = 30
choice1_success_happinessDelta = 20
choice2_label = 내실을 다진다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 마을이 조용히 강해졌다.
choice2_failureMsg = 마을이 조용히 강해졌다.
choice2_success_reputationDelta = 10
choice2_success_happinessDelta = 10

# ============================================================
# 특수 이벤트 2종 — 벤젠 관련
# ============================================================

[benzen_arrival]
name = 수상한 요정의 방문
category = special
triggerSeason =
triggerStageMin = 1
triggerPopMin = 0
triggerRepMin = 0
cooldownDays = 999
description = 어느 날 아침, 이상한 요정 하나가 마을 광장 한가운데 앉아 있다. "여기가 내가 관리할 마을이냐? 흠, 기대 이하군." 받아들이겠는가?
choice1_label = "...환영합니다"
choice1_goldCost = 0
choice1_successChance = 1.0
choice1_successMsg = 벤젠이 마을 관리인으로 취임했다. 어딘가 불안하지만, 믿어보기로 했다.
choice1_failureMsg = 벤젠이 마을 관리인으로 취임했다.
choice1_success_happinessDelta = 0
choice1_success_reputationDelta = 5
choice2_label = "당신은 누구입니까?"
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 벤젠이 콧방귀를 뀌며 "어쨌든 여기 있을 거야"라고 답했다.
choice2_failureMsg = 벤젠이 콧방귀를 뀌며 "어쨌든 여기 있을 거야"라고 답했다.
choice2_success_happinessDelta = 0

[benzen_special_quest]
name = 벤젠의 특별 의뢰
category = special
triggerSeason =
triggerStageMin = 2
triggerPopMin = 5
triggerRepMin = 20
cooldownDays = 30
description = 벤젠이 심각한 표정으로 말한다. "마법진 재료가 필요해. 마법석 5개를 구해주면... 마을에 특별한 보호막을 쳐 줄게."
choice1_label = 마법석을 구해드린다 (마법석×5)
choice1_goldCost = 0
choice1_successChance = 1.0
choice1_successMsg = 벤젠이 마법진을 완성했다. 마을 방어도가 크게 올랐다.
choice1_failureMsg = 벤젠이 마법진을 완성했다. 마을 방어도가 크게 올랐다.
choice1_success_defenseDelta = 15
choice1_success_happinessDelta = 5
choice1_success_reputationDelta = 10
choice2_label = 지금은 어렵다
choice2_goldCost = 0
choice2_successChance = 1.0
choice2_successMsg = 벤젠이 어깨를 으쓱하며 "그래, 나중에 부탁이나 해" 한다.
choice2_failureMsg = 벤젠이 어깨를 으쓱하며 말한다.
choice2_success_happinessDelta = -2
```

---

### 3-6. `public/data/village-npcs.txt` (신규)

actors.txt와 동일한 INI 포맷. 단, `villageResident = 1` 필드로 마을 상주 NPC 구분.

```ini
# village-npcs.txt — 마을 상주 NPC 정의

[벤젠]
race = Elf
role = Villager
villageResident = 1
strength = 0.8
gold = 0
location =
homeLocation =
age = 312
colorValues = 0.3,0.6,0.7,0.3,0.3,0.8,0.9,0.2
domainHigh = Calm,Inventive,Reliable,Righteous,Methodical,Adaptable,Honest,Cunning
domainLow = Melancholy,Flexible,Patient,Generous,Passionate,Grounded,Apathetic,Naive
background = 자칭 세계 최고의 요정 마법사.|어쩌다 한 마을의 관리인을 맡게 됐지만, 사실 이 일에 은근히 흥미를 느끼고 있다.|천재지만 오만하며 직설적이다. 그러나 맡은 일은 완벽하게 해낸다.|마을이 성장할수록 조금씩 애정이 생기는 중이지만, 절대 티 내지 않는다.
```

주의: village-npcs.txt는 actors.txt 파싱과 동일한 `initActors` 함수로 처리 가능. 단, villageResident 필드를 읽어 Actor에 `isVillageResident: boolean` 속성 추가 필요. 단순화 방안으로 actors+village.txt 애드온 파일로 처리할 수도 있음 — loader에서 actors 애드온에 'village' 태그 추가.

> 구현 단순화 권장: actors+village.txt 파일로 만들고, loader의 actorTags에 'village' 항상 추가.  
> 별도 시스템 없이 기존 NPC로 취급, 단 location을 마을 건설 시 동적으로 마을 locationId로 설정.

---

### 3-7. `src/data/village-event-init.ts` (신규)

```typescript
import { DataSection } from './parser';
import { VillageEventDef, VillageEventChoice } from '../models/village-event';
import { registerVillageEventDef } from './village-defs';

function parseEventChoice(s: DataSection, prefix: string): VillageEventChoice {
  return {
    label: s.get(`${prefix}_label`, ''),
    goldCost: s.getInt(`${prefix}_goldCost`, 0),
    successMsg: s.get(`${prefix}_successMsg`, ''),
    failureMsg: s.get(`${prefix}_failureMsg`, ''),
    successChance: s.getFloat(`${prefix}_successChance`, 1.0),
    onSuccess: {
      populationDelta: s.getInt(`${prefix}_success_populationDelta`, 0),
      happinessDelta: s.getInt(`${prefix}_success_happinessDelta`, 0),
      defenseDelta: s.getInt(`${prefix}_success_defenseDelta`, 0),
      reputationDelta: s.getInt(`${prefix}_success_reputationDelta`, 0),
      treasuryDelta: s.getInt(`${prefix}_success_treasuryDelta`, 0),
    },
    onFailure: {
      populationDelta: s.getInt(`${prefix}_failure_populationDelta`, 0),
      happinessDelta: s.getInt(`${prefix}_failure_happinessDelta`, 0),
      defenseDelta: s.getInt(`${prefix}_failure_defenseDelta`, 0),
      reputationDelta: s.getInt(`${prefix}_failure_reputationDelta`, 0),
      treasuryDelta: s.getInt(`${prefix}_failure_treasuryDelta`, 0),
    },
  };
}

export function initVillageEvents(sections: DataSection[]): void {
  for (const s of sections) {
    const def: VillageEventDef = {
      id: s.name,
      name: s.get('name', s.name),
      category: s.get('category', 'crisis') as any,
      description: s.get('description', ''),
      triggerCondition: '',
      triggerStageMin: s.getInt('triggerStageMin', 1),
      triggerStageMax: s.getInt('triggerStageMax', 7),
      triggerPopMin: s.getInt('triggerPopMin', 0),
      triggerSeason: s.get('triggerSeason', ''),
      triggerRepMin: s.getInt('triggerRepMin', 0),
      choices: [
        parseEventChoice(s, 'choice1'),
        parseEventChoice(s, 'choice2'),
      ],
      cooldownDays: s.getInt('cooldownDays', 30),
    };
    registerVillageEventDef(def);
  }
}
```

---

### 3-8. `src/data/loader.ts` (수정)

`GameDataFiles` 인터페이스에 추가:
```typescript
villageEvents: DataSection[];
```

`loadAllData()` 내 Promise.all에 추가:
```typescript
loadDataFile('village-events'),
```

actors 로드에 'village' 태그 추가 (벤젠 NPC를 actors+village.txt로 처리하는 경우):
```typescript
actors: ['first', 'extra', 'newrace', 'village']  // 'village' 추가
```

---

### 3-9. `src/data/data-init.ts` (수정)

`initAll` 또는 이에 해당하는 함수에 다음 추가:
```typescript
import { initVillageEvents } from './village-event-init';

// 기존 village 관련 초기화 라인 뒤에 추가:
initVillageEvents(data.villageEvents);
```

---

### 3-10. `src/systems/village-simulation.ts` (신규)

세계 시뮬레이션에서 분리한 마을 전용 일일 틱 함수. world-simulation.ts의 일일 정산 블록을 이 파일로 이전하고 확장.

```typescript
import { VillageState, calcPopGrowth, checkVillageStageUp, recalcVillageFinance } from '../models/village';
import { getAllVillageEventDefs } from '../data/village-defs';
import { VillageEventDef } from '../models/village-event';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';
import { getFacilityDef } from '../data/village-defs';

export interface VillageTickResult {
  stageUp: boolean;
  newStage: number;
  popGrowth: number;
  eventTriggered: VillageEventDef | null;
  financeDelta: number;
}

export function tickVillage(
  village: VillageState,
  currentDay: number,
  currentSeason: string,   // 'spring'|'summer'|'autumn'|'winter'
  log: Backlog,
  gameTime: GameTime,
): VillageTickResult {
  const result: VillageTickResult = {
    stageUp: false,
    newStage: village.stage,
    popGrowth: 0,
    eventTriggered: null,
    financeDelta: 0,
  };

  // 1. 재무 정산 (기존 로직 이전)
  recalcVillageFinance(village, getFacilityDef);
  const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;
  if (net !== 0) {
    village.finance.treasury += net;
    result.financeDelta = net;
  }
  village.finance.lastSettledDay = currentDay;

  // 2. 인구 성장
  if (village.lastPopGrowthDay < currentDay) {
    const growth = calcPopGrowth(village);
    if (growth > 0) {
      village.population += growth;
      result.popGrowth = growth;
      log.add(gameTime, `[${village.name}] 인구 ${growth}명 증가 → 총 ${village.population}명`, '마을');
    }
    village.lastPopGrowthDay = currentDay;
  }

  // 3. 단계 승급 체크
  if (checkVillageStageUp(village)) {
    village.stage = (village.stage + 1) as any;
    result.stageUp = true;
    result.newStage = village.stage;
    log.add(gameTime, `[${village.name}] 마을이 단계 ${village.stage}로 성장했다!`, '마을');
  }

  // 4. 이벤트 트리거 체크 (activeEvent 없을 때만)
  if (!village.activeEvent) {
    const triggered = rollVillageEvent(village, currentDay, currentSeason);
    if (triggered) {
      village.activeEvent = {
        eventId: triggered.id,
        triggeredDay: currentDay,
      };
      result.eventTriggered = triggered;
      log.add(gameTime, `[${village.name}] 이벤트 발생: ${triggered.name}`, '마을');
    }
  }

  // 5. 벤젠 등장 트리거 (마을 완성 직후 1회)
  if (!village.benzenAppeared && village.facilities.length >= 1) {
    village.benzenAppeared = true;
    // benzen_arrival 이벤트가 등록되어 있으면 활성화
    const benzenEvent = getAllVillageEventDefs().find(e => e.id === 'benzen_arrival');
    if (benzenEvent && !village.activeEvent) {
      village.activeEvent = {
        eventId: 'benzen_arrival',
        triggeredDay: currentDay,
      };
      result.eventTriggered = benzenEvent;
    }
  }

  return result;
}

function rollVillageEvent(
  village: VillageState,
  currentDay: number,
  currentSeason: string,
): VillageEventDef | null {
  const defs = getAllVillageEventDefs();
  const completedIds = new Set(village.eventHistory.map(e => e.eventId));
  const candidates = defs.filter(def => {
    // 성장 이벤트: 1회성
    if (def.category === 'growth') {
      if (completedIds.has(def.id)) return false;
      return village.population >= def.triggerPopMin;
    }
    // 쿨다운 체크
    const lastOccurrence = village.eventHistory
      .filter(e => e.eventId === def.id)
      .sort((a, b) => b.triggeredDay - a.triggeredDay)[0];
    if (lastOccurrence && currentDay - lastOccurrence.triggeredDay < def.cooldownDays) return false;
    // 조건 체크
    if (village.stage < def.triggerStageMin) return false;
    if (village.stage > def.triggerStageMax) return false;
    if (village.population < def.triggerPopMin) return false;
    if (village.reputation < def.triggerRepMin) return false;
    if (def.triggerSeason && def.triggerSeason !== currentSeason) return false;
    // special 이벤트는 별도 트리거
    if (def.category === 'special') return false;
    return true;
  });

  if (candidates.length === 0) return null;
  // 5% 확률로 이벤트 발생 (일일)
  if (Math.random() > 0.05) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
```

---

### 3-11. `src/systems/world-simulation.ts` (수정)

기존 마을 정산 블록을 `tickVillage()` 호출로 교체:

```typescript
import { tickVillage } from './village-simulation';

// 기존 블록 (lines 240-258) 교체:
if (knowledge.villageState) {
  const village = knowledge.villageState;
  if (village.finance.lastSettledDay < curDay + 1) {
    const result = tickVillage(
      village,
      curDay + 1,
      seasonName(world.getCurrentSeason()).toLowerCase(), // 'spring'|'summer'|'autumn'|'winter'
      log,
      gameTime,
    );
    if (result.financeDelta !== 0) {
      log.add(
        gameTime,
        `[${village.name}] 정산: ${result.financeDelta > 0 ? '+' : ''}${result.financeDelta}G (금고 ${village.finance.treasury}G)`,
        '마을',
      );
    }
    // 이벤트 발생 시 UI 알림은 village.activeEvent로 처리
  }
}
```

주의: seasonName 반환값이 한국어이므로 영어 매핑 함수 추가 필요:
```typescript
function toSeasonKey(season: number): string {
  const map = ['spring', 'summer', 'autumn', 'winter'];
  return map[season % 4] ?? 'spring';
}
```

---

### 3-12. `src/systems/save-system.ts` (수정)

#### SAVE_VERSION 3으로 변경

```typescript
export const SAVE_VERSION = 3;
```

#### serializeVillageState 확장

```typescript
function serializeVillageState(v: VillageState): object {
  return {
    locationId: v.locationId,
    name: v.name,
    foundedDay: v.foundedDay,
    stage: v.stage,
    population: v.population,
    happiness: v.happiness,
    defense: v.defense,
    facilities: v.facilities.map(f => ({ ...f })),
    roads: v.roads.map(r => ({ ...r })),
    finance: { ...v.finance },
    // Phase 2 추가
    reputation: v.reputation,
    specialization: v.specialization,
    activeEvent: v.activeEvent ? { ...v.activeEvent } : null,
    eventHistory: v.eventHistory.map(e => ({ ...e })),
    benzenAppeared: v.benzenAppeared,
    lastPopGrowthDay: v.lastPopGrowthDay,
  };
}
```

#### deserializeVillageState 마이그레이션

```typescript
function deserializeVillageState(d: any): VillageState {
  return {
    locationId: d.locationId ?? '',
    name: d.name ?? '이름없는 마을',
    foundedDay: d.foundedDay ?? 1,
    stage: d.stage ?? 1,
    population: d.population ?? 1,
    happiness: d.happiness ?? 50,
    defense: d.defense ?? 0,
    facilities: (d.facilities ?? []).map((f: any) => ({
      ...f,
      tier: f.tier ?? 1,             // Phase 1 세이브 마이그레이션: tier 없으면 1
      upgradedDay: f.upgradedDay,
    })),
    roads: (d.roads ?? []).map((r: any) => ({ ...r })),
    finance: {
      totalIncomePerDay: d.finance?.totalIncomePerDay ?? 0,
      totalMaintenancePerDay: d.finance?.totalMaintenancePerDay ?? 0,
      treasury: d.finance?.treasury ?? 0,
      lastSettledDay: d.finance?.lastSettledDay ?? d.foundedDay ?? 1,
    },
    // Phase 2 필드 — 구버전 세이브는 기본값
    reputation: d.reputation ?? 0,
    specialization: d.specialization ?? 'none',
    activeEvent: d.activeEvent ?? null,
    eventHistory: d.eventHistory ?? [],
    benzenAppeared: d.benzenAppeared ?? false,
    lastPopGrowthDay: d.lastPopGrowthDay ?? d.foundedDay ?? 1,
  };
}
```

---

### 3-13. `src/models/knowledge.ts` (수정)

```typescript
// 기존 villageState 필드 아래에 추가
benzenAffinity: number = 0;       // 벤젠 친밀도 0~100
villageReputation: number = 0;    // 마을 명성 (villageState.reputation 미러, 빠른 접근용)
```

---

### 3-14. `src/ui/screens/village-benzen.ts` (신규)

벤젠과의 대화 화면. 다음 메뉴 구성:

```
[1] 마을 현황 브리핑
    - 오늘 수입/지출
    - 부족 재료 목록 (업그레이드 가능 시설 체크)
    - 인구 성장 추이

[2] 재료 수집 의뢰 (TODO: 향후 quest 시스템 연동)
    - 현재는 텍스트 안내로 처리

[3] 시설 업그레이드 가이드
    - 업그레이드 가능한 시설 목록 + 필요 재료 표시

[4] 마을 전문화 선택
    - 'production' | 'trade' | 'defense' | 'culture' 중 선택
    - 선택 시 해당 분야 +30%, 다른 분야 -10% 버프 적용
    - 한 번 선택하면 변경 불가 (또는 고비용)
```

화면 구조: `createVillageScreen`과 동일 패턴 (Screen 인터페이스 구현)

---

### 3-15. `src/ui/screens/village-event.ts` (신규)

마을 이벤트 선택지 화면.

```typescript
// createVillageEventScreen(session, village, event, onResolved): Screen
// - 이벤트 설명 표시
// - choice1 / choice2 버튼
// - 버튼 클릭 시 Math.random() vs successChance 판정
// - 결과 메시지 표시 후 village 상태 갱신
// - onResolved 콜백으로 village 화면으로 복귀
```

---

### 3-16. `src/ui/screens/village.ts` (수정)

추가할 UI 요소:

1. **벤젠 버튼**: `benzenAppeared` 가 true이면 화면 상단에 `[벤젠과 대화]` 버튼 표시
2. **활성 이벤트 알림**: `activeEvent` 있으면 경고 배너 + `[이벤트 처리]` 버튼
3. **명성 표시**: 기존 4칸 그리드에 명성(reputation) 추가 → 5칸 또는 레이아웃 조정
4. **시설 업그레이드 버튼**: 건설된 시설 각 행에 `[Tier 2로 업그레이드]` 버튼 추가
   - 현재 tier < 3이고 골드/재료 충족 시 활성화
   - 클릭 시 비용 차감 + tier 증가 + recalcVillageFinance 호출
5. **단계 전환 알림**: stageUp 발생 후 statusMessage로 표시

---

## 4. 재료 아이템 ID 매핑

던전 재료는 기존 items.txt에 등록된 ItemType enum 값을 사용해야 합니다. 구현 전 확인 필요:

| 재료 | 예상 items.txt ID | 비고 |
|------|-------------------|------|
| 몬스터 뼈 | `MonsterBone` 또는 기존 loot 아이템 | 확인 필요 |
| 마법석 | `MagicStone` 또는 기존 아이템 | 확인 필요 |
| 희귀 광물 | `RareMetal` 또는 기존 아이템 | 확인 필요 |
| 약초 | `Herb` 또는 기존 아이템 | 확인 필요 |

> game-implementer 주의: items.txt를 먼저 확인하고 실제 ID를 사용할 것. ID가 없으면 items.txt에 추가하거나 FacilityTierCost에서 재료 필드를 goldCost로 단순화하는 것을 고려.

Phase 2 우선 단순화 방안: 업그레이드 비용을 goldCost + 기존 buildCost 재료만 사용하고, 던전 재료는 Phase 3으로 이연. 이 경우 `upgradeCostMonsterBone`, `upgradeCostMagicStone`, `upgradeCostRareMetal` 필드는 파싱만 하되 실제 체크는 생략.

---

## 5. 세이브 호환성

- SAVE_VERSION: 2 → 3
- 마이그레이션: `deserializeVillageState`에서 Phase 2 필드 기본값 자동 적용 (하위 호환)
- VillageState의 `facilities[].tier` 필드: 구버전 세이브는 기본값 1로 마이그레이션
- VillageState가 없는 세이브(마을 미건설 캐릭터): 영향 없음
- knowledge.ts 신규 필드(`benzenAffinity`, `villageReputation`): 세이브에 반영 필요
  - `serializeKnowledge` / `deserializeKnowledge` 함수에 해당 필드 추가

---

## 6. 위험 요소 및 주의사항

### 위험 1: recalcVillageFinance 시그니처 변경
`getFacilityDef` 반환 타입이 `VillageFacilityDef`로 변경되어 tiers 배열을 참조함. 호출부 전체 확인 필요:
- `src/systems/world-simulation.ts` (기존 직접 호출 → tickVillage로 이전)
- `src/ui/screens/village.ts` (건설 완료 후 호출)

### 위험 2: world-simulation.ts의 seasonName 반환값
현재 `seasonName()` 함수가 한국어 문자열을 반환하는지 영어를 반환하는지 확인 후 `toSeasonKey()` 매핑 함수 적용.

### 위험 3: 벤젠 NPC의 위치 관리
벤젠을 actors+village.txt 애드온으로 처리할 경우, 마을 건설 완료 시점에 `Actor.currentLocation`을 마을 locationId로 동적 설정해야 함. 이 설정 시점은 `village-build.ts`의 `tryBuild()` 완료 직후가 적절. `session.actors.find(a => a.name === '벤젠')?.currentLocation = village.locationId`

### 위험 4: 이벤트 선택지 비용 — 재료 차감
`choice1_goldCost`만 goldCost로 처리 가능하지만, "약초×10" 같은 아이템 비용은 별도 필드(`choice1_itemCost = Herb:10` 형태)로 확장 필요. Phase 2에서는 goldCost 체크만 구현하고 아이템 비용 텍스트는 설명에만 포함.

### 위험 5: VillageStage 타입 범위
현재 `VillageStage = 1 | 2 | 3 | 4 | 5 | 6 | 7` — Phase 2에서 3단계까지만 구현하므로 타입은 그대로 유지.

### 위험 6: 단계 승급과 성장 이벤트 동시 처리
`checkVillageStageUp` 결과로 stage 승급 시 `growth_pop*` 이벤트도 조건을 충족할 수 있음. 같은 틱에 두 이벤트가 겹치지 않도록 `tickVillage` 내에서 성장 이벤트를 승급 체크 이전에 처리하거나 activeEvent가 null일 때만 트리거.

### 위험 7: 전문화 UI 접근 경로
마을 전문화는 `village-benzen.ts` 내 메뉴에서만 접근 가능하도록 제한. village.ts 메인 화면에서는 현재 전문화 표시만.

---

## 7. game-qa 검증 포인트

| 항목 | 검증 방법 |
|------|-----------|
| 시설 티어 파싱 | village-facilities.txt 로드 후 `getFacilityDef('lumber_mill').tiers.length === 3` |
| 인구 성장 공식 | 매력도 20, 인구 5 → calcPopGrowth 반환값 = `Math.min(2, Math.floor((20 - 7.5) * 0.08))` = 0 → 확인 |
| 단계 2→3 전환 | 시설 8개 + 인구 15 시 stage 3 되는지 |
| 이벤트 파싱 | 15개 이벤트 모두 레지스트리 등록 확인 |
| 세이브 하위 호환 | SAVE_VERSION=2 세이브 로드 시 villageState.tier 기본값 1 적용 확인 |
| 벤젠 등장 | 시설 1개 건설 후 다음 일일 틱 시 benzenAppeared=true, activeEvent.eventId='benzen_arrival' |
| 이벤트 결과 적용 | spring_festival choice1 성공 시 happiness +15, reputation +5 |
| 일일 정산 이전 | world-simulation.ts에서 기존 정산 블록이 tickVillage로 완전히 교체됐는지 |
