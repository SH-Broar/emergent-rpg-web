# Village Tycoon 시스템 Phase 1 구현 계획서

작성일: 2026-04-12  
대상 브랜치: emergent-rpg-web  
기준 코드: 현재 main (SAVE_VERSION = 1)

---

## 0. 범위 요약

Phase 1은 마을 건설 흐름의 최소 작동 루프를 구현한다:
"개척 계획서 구매 → 아이템 사용 → 위치·이름 선택 → 마을 생성 → 이동 화면 버튼 교체 → 일일 수입 틱 → 마을 메인 화면 진입"

구현하지 않는 것: NPC 방문 시뮬레이션, 인구 성장 로직, 도로 여행속도 실제 반영, 단계 전환 연출, 이벤트 시스템.

---

## 1. 변경 파일 목록

### 신규 파일

| 파일 경로 | 유형 | 설명 |
|---|---|---|
| `src/models/village.ts` | 신규 | VillageState 인터페이스 + 헬퍼 함수 |
| `src/data/village-defs.ts` | 신규 | 시설 정의(VillageFacilityDef) + 도로 정의(VillageRoadDef) 파서·레지스트리 |
| `src/data/village-init.ts` | 신규 | village-facilities.txt / village-roads.txt → 레지스트리 초기화 함수 |
| `src/ui/screens/village.ts` | 신규 | 마을 메인 화면 (정보 + 시설 관리) |
| `src/ui/screens/village-build.ts` | 신규 | 마을 건설 팝업 (위치 선택 + 이름 입력) |
| `public/data/village-facilities.txt` | 신규 | 시설 10개 데이터 파일 |
| `public/data/village-roads.txt` | 신규 | 도로 2등급 데이터 파일 |

### 수정 파일

| 파일 경로 | 변경 내용 |
|---|---|
| `public/data/items.txt` | `[pioneer_plan]` 섹션 추가 |
| `src/data/loader.ts` | `GameDataFiles`에 `villageFacilities`, `villageRoads` 추가, `loadAllData()`에 로딩 추가 |
| `src/data/data-init.ts` | `initVillage()` 호출 연결 (village-init.ts 위임) |
| `src/models/knowledge.ts` | `villageState: VillageState | null` 필드 추가 |
| `src/systems/world-simulation.ts` | 일일 틱 블록에 `applyDailyVillageEffects()` 추가 |
| `src/systems/save-system.ts` | `serializeKnowledge` / `deserializeKnowledge`에 `villageState` 직렬화 추가, `SAVE_VERSION` 2로 변경 |
| `src/systems/game-loop.ts` | `GameAction` 타입에 `'village'` 추가 |
| `src/ui/screens/game-screen.ts` | 이동 화면 내 `dockedHomeRoute` 하단 버튼 교체 로직 추가 |
| `src/ui/screens/inventory.ts` | `pioneer_plan` 아이템 사용 분기 추가 (`onSpecialUse` 콜백) |
| `src/main.ts` | `case 'village':` 스위치 추가, village-build 팝업 연결, 신규 import 추가 |

---

## 2. 구현 순서 (의존성 고려)

```
Step 1: public/data/village-facilities.txt
Step 1: public/data/village-roads.txt
        ↓
Step 2: public/data/items.txt  (+pioneer_plan 섹션)
        ↓
Step 3: src/models/village.ts  (VillageState 타입)
        ↓
Step 4: src/data/village-defs.ts  (VillageFacilityDef, VillageRoadDef, 레지스트리)
        ↓
Step 5: src/data/village-init.ts  (파일 → 레지스트리 초기화)
        ↓
Step 6: src/data/loader.ts  (villageFacilities, villageRoads 필드 추가)
        ↓
Step 7: src/data/data-init.ts  (initVillage 호출 연결)
        ↓
Step 8: src/models/knowledge.ts  (villageState 필드 추가)
        ↓
Step 9: src/systems/world-simulation.ts  (applyDailyVillageEffects 추가)
        ↓
Step 10: src/systems/save-system.ts  (직렬화, SAVE_VERSION 2)
         ↓
Step 11: src/systems/game-loop.ts  (GameAction에 'village' 추가)
         ↓
Step 12: src/ui/screens/village.ts  (마을 메인 화면)
Step 12: src/ui/screens/village-build.ts  (건설 팝업)
         ↓
Step 13: src/ui/screens/inventory.ts  (pioneer_plan 사용 분기)
Step 13: src/ui/screens/game-screen.ts  (이동 화면 버튼 교체)
         ↓
Step 14: src/main.ts  (import + case 'village' 추가)
```

---

## 3. 파일별 구체적 변경 내용

---

### Step 1-A: `public/data/village-facilities.txt`

INI 포맷. 기존 items.txt와 동일한 `[섹션명]` 스타일. 10개 시설.

```ini
# village-facilities.txt — Phase 1 시설 정의

[lumber_mill]
name = 목재소
category = production
unlockStage = 1
buildCostGold = 500
buildCostWood = 15
buildCostStone = 5
incomePerDay = 15
description = 인근 숲 자원으로 목재를 생산한다.
maintenancePerDay = 3

[village_farm]
name = 농장
category = production
unlockStage = 1
buildCostGold = 400
buildCostWood = 20
buildCostWheat = 10
incomePerDay = 10
description = 마을 식량을 공급한다. 수확도 가능하다.
maintenancePerDay = 2

[well]
name = 우물
category = amenity
unlockStage = 1
buildCostGold = 200
buildCostStone = 15
incomePerDay = 0
description = 마을 위생도 +10. 주민 HP 회복 속도를 높인다.
maintenancePerDay = 1

[inn]
name = 여관
category = amenity
unlockStage = 1
buildCostGold = 800
buildCostWood = 30
buildCostStone = 10
incomePerDay = 20
description = NPC 방문 빈도 +30%. 숙박 수입을 얻는다.
maintenancePerDay = 5

[palisade]
name = 목책
category = defense
unlockStage = 1
buildCostGold = 100
buildCostWood = 20
incomePerDay = 0
description = 기본 방어도를 부여하고 마을 경계를 설정한다.
maintenancePerDay = 1

[watchtower]
name = 감시탑
category = defense
unlockStage = 1
buildCostGold = 400
buildCostWood = 30
buildCostStone = 10
incomePerDay = 0
description = 위기 이벤트 조기 경보. 방어도 +5.
maintenancePerDay = 2

[notice_board]
name = 마을 게시판
category = admin
unlockStage = 1
buildCostGold = 50
buildCostWood = 10
incomePerDay = 0
description = 마을 퀘스트를 발생시키고 소문을 공유한다.
maintenancePerDay = 0

[warehouse]
name = 창고
category = admin
unlockStage = 1
buildCostGold = 500
buildCostWood = 25
buildCostStone = 10
incomePerDay = 0
description = 마을 자원을 공동 보관한다. 생산 효율을 높인다.
maintenancePerDay = 2

[music_hall]
name = 음악당
category = culture
unlockStage = 1
buildCostGold = 300
buildCostWood = 20
incomePerDay = 5
description = 행복도 +8. 음유시인 NPC를 유치한다.
maintenancePerDay = 2

[mill]
name = 방앗간
category = production
unlockStage = 1
buildCostGold = 500
buildCostWood = 20
buildCostStone = 10
incomePerDay = 12
description = 밀을 밀가루로 변환한다. 요리 효율 보너스.
maintenancePerDay = 3
```

---

### Step 1-B: `public/data/village-roads.txt`

```ini
# village-roads.txt — Phase 1 도로 등급

[dirt_path]
name = 오솔길
grade = 1
buildCostGold = 200
buildCostWood = 5
travelSpeedMultiplier = 0.9
description = 좁고 울퉁불퉁한 흙길. 이동 시간을 약간 단축시킨다.
maintenancePerDay = 1

[unpaved_road]
name = 비포장도로
grade = 2
buildCostGold = 500
buildCostWood = 10
buildCostStone = 5
travelSpeedMultiplier = 0.75
description = 정비된 비포장 도로. 이동 시간을 상당히 단축시킨다.
maintenancePerDay = 2
```

---

### Step 2: `public/data/items.txt` 추가 섹션

기존 파일 끝에 추가. category는 `Special`(기존 `Equipment`와 구분). tags에 `/special/document/` 추가로 인벤토리 사용 분기 트리거에 활용.

```ini
[pioneer_plan]
name = 개척 계획서
category = Special
price = 3000
tags = /special/document/pioneer/
description = 미개척 땅에 마을을 세울 권리가 기록된 계획서. 사용하면 마을 건설 절차가 시작된다. 게임당 한 번만 사용 가능.
rarity = rare
source = shop:Guild_Hall
```

- `source = shop:Guild_Hall` — 인근 마을 상점(Guild_Hall)에서 구매 가능. 3000G.
- `price = 3000` — 구매가 및 표시가.

---

### Step 3: `src/models/village.ts` (신규)

```typescript
// village.ts — 마을 상태 모델

export type VillageFacilityStatus = 'active' | 'suspended'; // suspended = 유지비 미납

export interface VillageFacilityInstance {
  facilityId: string;   // village-facilities.txt 섹션 ID
  builtDay: number;     // 건설 완료 일자
  status: VillageFacilityStatus;
}

export type VillageRoadStatus = 'active' | 'suspended';

export interface VillageRoadInstance {
  roadId: string;       // village-roads.txt 섹션 ID
  connectedLocationId: string; // 연결 대상 LocationID
  builtDay: number;
  status: VillageRoadStatus;
}

export type VillageStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface VillageFinance {
  totalIncomePerDay: number;     // 활성 시설 합산 수입
  totalMaintenancePerDay: number;// 활성 시설 합산 유지비
  treasury: number;              // 마을 금고 (플레이어 골드와 별개)
  lastSettledDay: number;        // 마지막 정산일
}

export interface VillageState {
  locationId: string;         // 월드에 등록된 LocationID (예: "PlayerVillage_Aster")
  name: string;               // 플레이어가 입력한 마을 이름
  foundedDay: number;         // 건설 완료 일자
  stage: VillageStage;        // 현재 성장 단계 (1~7)
  population: number;         // 현재 인구
  happiness: number;          // 행복도 (0~100)
  defense: number;            // 방어도 (0~100)
  facilities: VillageFacilityInstance[];
  roads: VillageRoadInstance[];
  finance: VillageFinance;
}

export function createVillageState(
  locationId: string,
  name: string,
  foundedDay: number,
): VillageState {
  return {
    locationId,
    name,
    foundedDay,
    stage: 1,
    population: 1,
    happiness: 50,
    defense: 0,
    facilities: [],
    roads: [],
    finance: {
      totalIncomePerDay: 0,
      totalMaintenancePerDay: 0,
      treasury: 0,
      lastSettledDay: foundedDay,
    },
  };
}

/** 활성 시설 목록 */
export function getActiveFacilities(v: VillageState): VillageFacilityInstance[] {
  return v.facilities.filter(f => f.status === 'active');
}

/** 일일 수입 재계산 (시설 추가/제거 시 호출) */
export function recalcVillageFinance(
  v: VillageState,
  getFacilityDef: (id: string) => { incomePerDay: number; maintenancePerDay: number } | undefined,
): void {
  let income = 0;
  let maintenance = 0;
  for (const f of v.facilities) {
    if (f.status !== 'active') continue;
    const def = getFacilityDef(f.facilityId);
    if (!def) continue;
    income += def.incomePerDay;
    maintenance += def.maintenancePerDay;
  }
  v.finance.totalIncomePerDay = income;
  v.finance.totalMaintenancePerDay = maintenance;
}

/** 단계 승급 조건 체크 (Phase 1: stage 1만 존재하므로 stub) */
export function checkVillageStageUp(v: VillageState): boolean {
  // Phase 2에서 구현
  return false;
}
```

---

### Step 4: `src/data/village-defs.ts` (신규)

```typescript
// village-defs.ts — 시설/도로 정의 레지스트리

export interface VillageFacilityDef {
  id: string;
  name: string;
  category: 'production' | 'amenity' | 'defense' | 'admin' | 'culture' | 'special';
  unlockStage: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  buildCostWheat: number;
  incomePerDay: number;
  maintenancePerDay: number;
  description: string;
}

export interface VillageRoadDef {
  id: string;
  name: string;
  grade: number;
  buildCostGold: number;
  buildCostWood: number;
  buildCostStone: number;
  travelSpeedMultiplier: number; // 1.0 = 변화 없음, 0.75 = 25% 단축
  maintenancePerDay: number;
  description: string;
}

const facilityRegistry = new Map<string, VillageFacilityDef>();
const roadRegistry = new Map<string, VillageRoadDef>();

export function registerFacilityDef(def: VillageFacilityDef): void {
  facilityRegistry.set(def.id, def);
}

export function getFacilityDef(id: string): VillageFacilityDef | undefined {
  return facilityRegistry.get(id);
}

export function getAllFacilityDefs(): VillageFacilityDef[] {
  return [...facilityRegistry.values()];
}

export function registerRoadDef(def: VillageRoadDef): void {
  roadRegistry.set(def.id, def);
}

export function getRoadDef(id: string): VillageRoadDef | undefined {
  return roadRegistry.get(id);
}

export function getAllRoadDefs(): VillageRoadDef[] {
  return [...roadRegistry.values()];
}
```

---

### Step 5: `src/data/village-init.ts` (신규)

기존 `data-init.ts`의 `initItems()`, `initLocations()` 패턴을 그대로 따른다.

```typescript
// village-init.ts — village-facilities.txt / village-roads.txt 파싱

import { DataSection } from './parser';
import { registerFacilityDef, registerRoadDef } from './village-defs';

export function initVillageFacilities(sections: DataSection[]): void {
  for (const s of sections) {
    registerFacilityDef({
      id: s.name,
      name: s.get('name', s.name),
      category: s.get('category', 'production') as any,
      unlockStage: s.getInt('unlockStage', 1),
      buildCostGold: s.getInt('buildCostGold', 0),
      buildCostWood: s.getInt('buildCostWood', 0),
      buildCostStone: s.getInt('buildCostStone', 0),
      buildCostWheat: s.getInt('buildCostWheat', 0),
      incomePerDay: s.getInt('incomePerDay', 0),
      maintenancePerDay: s.getInt('maintenancePerDay', 0),
      description: s.get('description', ''),
    });
  }
}

export function initVillageRoads(sections: DataSection[]): void {
  for (const s of sections) {
    registerRoadDef({
      id: s.name,
      name: s.get('name', s.name),
      grade: s.getInt('grade', 1),
      buildCostGold: s.getInt('buildCostGold', 0),
      buildCostWood: s.getInt('buildCostWood', 0),
      buildCostStone: s.getInt('buildCostStone', 0),
      travelSpeedMultiplier: s.getFloat('travelSpeedMultiplier', 1.0),
      maintenancePerDay: s.getInt('maintenancePerDay', 0),
      description: s.get('description', ''),
    });
  }
}
```

---

### Step 6: `src/data/loader.ts` 수정

`GameDataFiles` 인터페이스에 두 필드 추가:

```typescript
// 기존 필드들 끝에 추가
villageFacilities: DataSection[];
villageRoads: DataSection[];
```

`loadAllData()` 내 `Promise.all` 배열에 추가:

```typescript
// Promise.all 배열 끝에 추가
loadDataFile('village-facilities'),
loadDataFile('village-roads'),
```

반환 객체에도 추가:

```typescript
villageFacilities, villageRoads,
```

---

### Step 7: `src/data/data-init.ts` 수정

파일 상단 import 추가:

```typescript
import { initVillageFacilities, initVillageRoads } from './village-init';
```

`initAll()` 또는 최상위 초기화 함수에서 호출 추가:

```typescript
initVillageFacilities(dataFiles.villageFacilities);
initVillageRoads(dataFiles.villageRoads);
```

- 기존 `initItems()`, `initLocations()` 호출 바로 뒤에 위치시킨다.
- `dataFiles` 파라미터 타입 `GameDataFiles`를 통해 자동으로 타입 체크된다.

---

### Step 8: `src/models/knowledge.ts` 수정

기존 `ownedBases` 필드 선언 아래에 추가:

```typescript
import { VillageState } from './village'; // 상단 import 추가

// 개척 마을 상태 (game당 1개, null = 미건설)
villageState: VillageState | null = null;

hasVillage(): boolean { return this.villageState !== null; }
```

---

### Step 9: `src/systems/world-simulation.ts` 수정

파일 상단 import 추가:

```typescript
import { recalcVillageFinance } from '../models/village';
import { getFacilityDef } from '../data/village-defs';
```

일일 틱 블록(`const curDay > prevDay` 분기) 내 기존 farm 틱 처리 블록 **뒤에** 추가:

```typescript
// 마을 일일 정산
if (knowledge.villageState) {
  const village = knowledge.villageState;
  if (village.finance.lastSettledDay < curDay) {
    recalcVillageFinance(village, getFacilityDef);
    const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;
    if (net !== 0) {
      village.finance.treasury += net;
      // 유지비 > 수입 → 시설 정지 처리는 Phase 2
    }
    village.finance.lastSettledDay = curDay;
    if (net !== 0) {
      log.add(
        gameTime,
        `[개척 마을] ${village.name} 정산: ${net > 0 ? '+' : ''}${net}G (금고 ${village.finance.treasury}G)`,
        '마을',
      );
    }
  }
}
```

---

### Step 10: `src/systems/save-system.ts` 수정

#### SAVE_VERSION 변경

```typescript
// 변경 전
export const SAVE_VERSION = 1;
// 변경 후
export const SAVE_VERSION = 2;
```

#### serializeKnowledge 수정

기존 `lastNapDay: k.lastNapDay,` 뒤에 추가:

```typescript
villageState: k.villageState ? serializeVillageState(k.villageState) : null,
```

#### deserializeKnowledge 수정

기존 `if (d.lastNapDay !== undefined)` 블록 뒤에 추가:

```typescript
if (d.villageState) {
  k.villageState = deserializeVillageState(d.villageState);
}
```

#### 직렬화 헬퍼 함수 추가 (파일 내 적절한 위치)

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
  };
}

function deserializeVillageState(d: any): VillageState {
  return {
    locationId: d.locationId ?? '',
    name: d.name ?? '이름없는 마을',
    foundedDay: d.foundedDay ?? 1,
    stage: d.stage ?? 1,
    population: d.population ?? 1,
    happiness: d.happiness ?? 50,
    defense: d.defense ?? 0,
    facilities: (d.facilities ?? []).map((f: any) => ({ ...f })),
    roads: (d.roads ?? []).map((r: any) => ({ ...r })),
    finance: {
      totalIncomePerDay: d.finance?.totalIncomePerDay ?? 0,
      totalMaintenancePerDay: d.finance?.totalMaintenancePerDay ?? 0,
      treasury: d.finance?.treasury ?? 0,
      lastSettledDay: d.finance?.lastSettledDay ?? d.foundedDay ?? 1,
    },
  };
}
```

import 추가 (파일 상단):

```typescript
import { VillageState } from '../models/village';
```

#### 마이그레이션 전략

`loadFromSlot()`에서 `data.version !== SAVE_VERSION` 체크 시 현재는 `null`을 반환한다. 기존 버전 1 세이브는 로드 불가 처리 — `villageState`가 없는 구버전 데이터이므로 별도 마이그레이션 없이 새 게임을 권장한다. 단, `deserializeKnowledge`에서 `villageState`가 없으면 `null`로 기본값 처리하므로 **버전 체크를 완화**하는 선택지도 있다. 구현자 판단으로 버전 체크를 `data.version < SAVE_VERSION`으로 변경하면 구버전 로드 + villageState=null 동작이 가능하다.

---

### Step 11: `src/systems/game-loop.ts` 수정

GameAction 타입에 `'village'` 추가:

```typescript
export type GameAction =
  | 'idle' | 'move' | 'talk' | 'trade' | 'eat'
  | 'rest' | 'dungeon' | 'gather' | 'quest' | 'activity'
  | 'gift' | 'home' | 'memory_spring'
  | 'storage' | 'realestate' | 'cooking'
  | 'info_status' | 'info_color' | 'info_relations' | 'info_world'
  | 'info_backlog' | 'info_hyperion' | 'info_party' | 'info_titles' | 'info_map' | 'info_encyclopedia'
  | 'info_skills' | 'info_inventory'
  | 'save'
  | 'skill_shop' | 'guild_dungeon' | 'life_job' | 'ferry'
  | 'village';          // 추가
```

`processTurn` switch 블록에 추가 (기존 `'ferry':` 케이스 뒤):

```typescript
case 'village': result.screenChange = 'village'; return result;
```

---

### Step 12-A: `src/ui/screens/village-build.ts` (신규)

Screen 인터페이스를 구현한다. 기존 `createRealEstateScreen` 의 구조를 참고한다.

**기능:**
1. 건설 조건 검사 표시 (레벨 15 이상, 2000G 이상, 거점 1개 이상, pioneer_plan 소지)
2. 현재 위치 기준 인접 위치 목록 표시 (world.getNeighbors 활용)
3. 위치 선택 후 마을 이름 입력 `<input>` 표시
4. 확정 시: `pioneer_plan` 아이템 제거 + LocationData 등록 + VillageState 생성 + knowledge.villageState 설정
5. 마을 LocationID 규칙: `"PlayerVillage_" + villageName.replace(/\s/g,'_')`

```typescript
export function createVillageBuildScreen(
  session: GameSession,
  onDone: () => void,
  onBuilt: () => void,  // 건설 완료 시 콜백
): Screen
```

**건설 완료 시 world 등록 로직:**

```typescript
// 1. LocationData 생성
const locData = createLocationData(newLocId);
locData.description = `${villageName} — 플레이어의 개척 마을.`;
locData.gridX = selectedLoc.gridX + 1;  // 인접 위치 기반 오프셋
locData.gridY = selectedLoc.gridY;
// 2. 기존 위치와 양방향 링크
locData.linksBidirectional.push({ target: selectedLocId, minutesOverride: 30 });
world.setLocation(newLocId, locData);
world.rebuildTravelGraph();
// 3. locationNames 레지스트리 등록
GameRegistry.I.locationNames.set(newLocId, villageName);
// 4. VillageState 생성
knowledge.villageState = createVillageState(newLocId, villageName, gameTime.day);
// 5. pioneer_plan 아이템 제거
player.removeItemById('pioneer_plan', 1);
```

---

### Step 12-B: `src/ui/screens/village.ts` (신규)

기존 `createRealEstateScreen` 레이아웃 스타일을 따른다.

**표시 내용:**
- 마을 이름, 단계, 인구, 행복도, 방어도
- 금고 잔액, 일일 수입/유지비
- 건설된 시설 목록 (이름, 상태, 수입/일)
- 시설 건설 버튼 목록 (단계 조건 미충족 시 잠금 표시)
- 도로 건설 섹션 (연결 가능 위치 목록)

```typescript
export function createVillageScreen(
  session: GameSession,
  onDone: () => void,
): Screen
```

---

### Step 13-A: `src/ui/screens/inventory.ts` 수정

`doConsume()` 함수 내 아이템 소비 처리 전에 `pioneer_plan` 특수 아이템 분기 추가.

`createInventoryScreen` 시그니처에 optional 콜백 추가:

```typescript
export function createInventoryScreen(
  session: GameSession,
  onDone: () => void,
  onSpecialItemUse?: (itemId: string) => void,  // 추가
): Screen
```

`doConsume()` 내 분기:

```typescript
// pioneer_plan 특수 처리
if (entry.kind === 'item' && entry.id === 'pioneer_plan') {
  if (session.knowledge.hasVillage()) {
    statusMessage = '이미 개척 마을이 존재한다. 다시 건설할 수 없다.';
    render(el);
    return;
  }
  if (onSpecialItemUse) {
    onSpecialItemUse('pioneer_plan');
  }
  return;
}
```

---

### Step 13-B: `src/ui/screens/game-screen.ts` 수정

#### 이동 화면 하단 버튼 교체

`getMoveRouteSections()` 결과를 렌더링하는 블록에서 `dockedHomeRoute` 하단 버튼을 조건부로 교체.

현재 코드 (718~728줄):
```typescript
${dockedHomeRoute ? (() => {
  const { loc, mins } = dockedHomeRoute;
  ...
  return `<div class="move-home-dock">
    <button class="btn" data-loc="${loc}" data-mins="${mins}" ...>
      ... 🏠</button>
  </div>`;
})() : ''}
```

변경 방향: `dockedHomeRoute` 렌더링 블록 **뒤에** 마을 버튼 추가.

```typescript
${session.knowledge.villageState ? (() => {
  const vs = session.knowledge.villageState!;
  const villageLoc = vs.locationId;
  const mins = session.world.getShortestMinutes(
    p.currentLocation, villageLoc, session.gameTime.day
  );
  if (mins >= 9999) return ''; // 경로 없음
  const travelBadge = mins > TRAVEL_OVERLAY_THRESHOLD_MINUTES
    ? ` <span style="color:var(--text-dim);font-size:11px">🚶 ${mins}분</span>`
    : ` <span style="color:var(--text-dim);font-size:11px">${mins}분</span>`;
  return `
    <div class="move-village-dock">
      <button class="btn" data-loc="${villageLoc}" data-mins="${mins}"
        style="border-left:4px solid #ffd700">
        개척 마을: ${vs.name}${travelBadge} <span style="color:#ffd700">🏘</span>
      </button>
    </div>`;
})() : ''}
```

#### MAIN_ACTIONS에 마을 버튼 추가

마을 건설 후 현재 위치가 마을인 경우 진입 버튼 노출:

```typescript
function atVillage(session: GameSession) {
  return session.knowledge.villageState?.locationId === session.player.currentLocation;
}

// MAIN_ACTIONS 배열에 추가 (ferry 다음)
{ key: 'v', label: '마을', action: 'village' as GameAction, icon: '🏘', visible: atVillage },
```

---

### Step 14: `src/main.ts` 수정

#### import 추가

```typescript
import { createVillageScreen } from './ui/screens/village';
import { createVillageBuildScreen } from './ui/screens/village-build';
```

#### onScreenChange 스위치에 케이스 추가

기존 `case 'realestate':` 블록 뒤에:

```typescript
case 'village':
  if (!session.knowledge.villageState) {
    // 마을 미건설 상태 — 혹시 village 액션이 호출되면 무시 (atVillage가 false일 때 막힘)
    break;
  }
  sm.push(createVillageScreen(session, () => sm.pop()));
  break;
```

#### inventory 화면 등록 수정

기존:
```typescript
case 'info_inventory':
  sm.push(createInventoryScreen(session, () => sm.pop()));
  break;
```

변경:
```typescript
case 'info_inventory':
  sm.push(createInventoryScreen(session, () => sm.pop(), (itemId) => {
    sm.pop(); // inventory 닫기
    if (itemId === 'pioneer_plan') {
      sm.push(createVillageBuildScreen(session, () => sm.pop(), () => {
        sm.pop(); // build 화면 닫기
        sm.render(); // game-screen 갱신
      }));
    }
  }));
  break;
```

---

## 4. 데이터 파일 변경 요약

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `public/data/items.txt` | 섹션 추가 | `[pioneer_plan]` — category=Special, price=3000 |
| `public/data/village-facilities.txt` | 신규 | 10개 시설 INI 정의 |
| `public/data/village-roads.txt` | 신규 | 2개 도로 등급 INI 정의 |

---

## 5. 타입/enum 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `src/systems/game-loop.ts` | `GameAction`에 `'village'` 유니온 추가 |
| `src/types/enums.ts` | 변경 없음 — `ItemType`에 새 enum 불필요 (pioneer_plan은 items.txt의 id 기반 개별 아이템) |

> **주의**: `pioneer_plan`은 기존 `ItemType` enum을 사용하지 않고 `p.items` Map (id→count) 구조에 직접 저장된다. `getItemDef('pioneer_plan')`으로 정의를 조회한다. 이는 기존 무기/방어구 아이템들과 동일한 패턴이다.

---

## 6. 세이브 호환성

| 항목 | 변경 |
|---|---|
| `SAVE_VERSION` | 1 → 2 |
| 기존 버전 1 세이브 | 버전 불일치로 로드 거부 (기본 동작) |
| 완화 옵션 | `data.version < SAVE_VERSION` 체크로 변경 시 구버전 로드 가능 + villageState=null 기본값 |
| 신규 필드 | `knowledge.villageState: VillageState | null` — 없으면 null 기본값 처리 |

---

## 7. 위험 요소 및 리그레션 포인트

| 위험 | 영향 | 대응 |
|---|---|---|
| `world.rebuildTravelGraph()` 호출 타이밍 | 마을 건설 후 즉시 호출 필수. 미호출 시 마을 이동 불가 | `village-build.ts`에서 건설 완료 직후 호출 보장 |
| `locationId` 중복 | 마을 이름에 특수문자 포함 시 LocationID 충돌 가능 | ID 생성 시 `replace(/[^a-zA-Z0-9가-힣_]/g, '_')` 처리 |
| `dockedHomeRoute` 기존 버튼 교체 vs 추가 | 기획서는 "교체"이나 코드 변경 최소화 위해 "추가"로 구현. 기존 homeLocation 버튼은 유지됨 | 기획 의도와 차이 — 기획자 확인 필요 |
| `game-loop.ts`의 `processTurn` 미처리 액션 | `'village'` case 누락 시 아무 동작 없음 (screenChange 미발생) | Step 11에서 명시적 case 추가로 해결 |
| `pioneer_plan` category = Special | 기존 `categoryName()` 함수가 Special을 처리 못하면 undefined 표시 | `categoryName()` 함수 확인 후 필요 시 Special 케이스 추가 |
| SAVE_VERSION 2 변경 | 기존 자동저장(slot 0) 로드 불가 | 플레이어 안내 필요, 또는 완화 옵션 채택 |

---

## 8. game-qa 검증 포인트

### 데이터 검증
- `village-facilities.txt` 10개 섹션이 모두 파싱되는지 확인
- `village-roads.txt` 2개 섹션이 모두 파싱되는지 확인
- `items.txt`의 `pioneer_plan`이 `getItemDef('pioneer_plan')`으로 조회 가능한지 확인

### 아이템 구매 흐름
- Guild_Hall 상점에서 pioneer_plan 3000G 구매 가능 여부
- 인벤토리에서 pioneer_plan 사용 시 village-build 팝업이 열리는지
- 마을 보유 상태에서 pioneer_plan 재사용 시 오류 메시지 표시 여부

### 마을 건설 흐름
- 건설 조건 미충족 시 적절한 오류 메시지 표시
- 마을 이름 입력 후 확정 시 LocationData가 월드에 등록되는지
- `knowledge.villageState !== null` 확인
- `world.getNeighbors(newLocId)` 에 selectedLocId가 포함되는지 (양방향 링크 확인)

### 이동 화면 연동
- 마을 건설 후 이동 화면에 "개척 마을" 버튼 표시 여부
- 버튼 클릭 시 이동 시작 여부

### 마을 화면
- `atVillage()` 조건 충족 시 `[v] 마을` 버튼 표시
- 마을 메인 화면에서 시설 건설 버튼 클릭 → 골드 차감 + 시설 추가 확인

### 일일 수입 틱
- 시설 건설 후 하루 경과 시 금고에 수입 반영 여부
- backlog에 `[개척 마을]` 정산 로그 기록 여부

### 세이브/로드
- 마을 건설 후 저장 → 로드 시 `villageState` 복원 확인
- 마을 이름, 시설 목록, 금고 잔액이 유지되는지 확인
- SAVE_VERSION 1 세이브 로드 시 적절한 처리(거부 또는 완화 옵션 동작)
