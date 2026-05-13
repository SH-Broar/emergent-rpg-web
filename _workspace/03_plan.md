# Village Tycoon Phase 3+4 구현 계획서

작성일: 2026-04-12  
대상 브랜치: emergent-rpg-web  
현재 SAVE_VERSION: 3 (save-system.ts 기준)

---

## 0. 코드베이스 현황 요약

| 항목 | 현재 상태 |
|------|-----------|
| 시설 정의 | 10개 (`village-facilities.txt`) |
| 도로 등급 | 2등급 (`village-roads.txt`) |
| 마을 단계 전환 | 1→2→3만 구현 (`checkVillageStageUp` in `village.ts`) |
| 던전재료 차감 | 미구현 (UI에 표시만, village.ts 업그레이드 로직에서 골드만 차감) |
| NPC 방문 시뮬레이션 | 없음 |
| 칭호 (village) | 없음 (title-system.ts에 마을 관련 칭호 없음) |
| 벤젠 대사 파일 | 없음 (village-benzen.ts에 하드코딩된 문자열만) |
| 세이브 버전 | `save-system.ts`: 3, `save-load.ts`: 6 (별개 시스템) |

### 플레이어 아이템 접근 패턴
- `player.items`: `Map<string, number>` (actor.ts L149)
- `player.getItemCount(id)`: 보유량 조회
- `player.removeItemById(id, amount)`: 차감 (boolean 반환)
- `player.addItemById(id, amount)`: 추가

### 던전 재료 아이템 ID (items.txt 확인)
| 논리명 | 실제 ID | 비고 |
|--------|---------|------|
| 몬스터뼈 | `bone_fragment` | MonsterLoot |
| 마법석 | `moonstone` 또는 `void_stone` | 추가 확인 필요, 계획서에서는 `magic_stone`을 신규 alias로 지정 |
| 희귀광물 | `silver_ore` (또는 `rare_ore` 신규) | 기존 items.txt에 `rare_ore`/`magic_stone` 없음 |
| 용린 | `dragon_scale` | MonsterLoot |

> **주의**: `FacilityTierDef`의 `upgradeCostMonsterBone`, `upgradeCostMagicStone`, `upgradeCostRareMetal` 필드명은 이미 정의되어 있지만, 실제 차감 시 매핑할 아이템 ID가 필요하다. 구현 시 상수 매핑 테이블을 `village-init.ts` 또는 `village.ts`에 추가한다.

---

## 1. 변경 파일 목록

### Phase 3

| # | 파일 경로 | 변경 유형 | 설명 |
|---|-----------|-----------|------|
| 1 | `public/data/village-facilities.txt` | 수정 | 시설 42개 추가 (총 52개) |
| 2 | `public/data/village-roads.txt` | 수정 | 도로 등급 3~4 추가 |
| 3 | `src/models/village.ts` | 수정 | 단계 4~7 전환 조건, NPC 방문 필드, 도로 이동시간 적용 헬퍼 |
| 4 | `src/data/village-defs.ts` | 수정 | `VillageRoadDef`에 `buildCostIron` 필드 추가 |
| 5 | `src/data/village-init.ts` | 수정 | 도로 파서에 `buildCostIron` 추가 |
| 6 | `src/systems/village-simulation.ts` | 수정 | 단계 4~7 승급 로직, NPC 방문 수입 처리 |
| 7 | `src/ui/screens/village.ts` | 수정 | 던전재료 실차감, 재료 부족 비활성화, 방문자 수 표시, 단계명 표시 |
| 8 | `src/systems/save-system.ts` | 수정 | SAVE_VERSION 4, `visitingNpcCount`/`totalVisitorIncome` 직렬화 |

### Phase 4

| # | 파일 경로 | 변경 유형 | 설명 |
|---|-----------|-----------|------|
| 9 | `src/systems/title-system.ts` | 수정 | 마을 관련 칭호 10종 추가 |
| 10 | `src/models/knowledge.ts` | 수정 | 칭호 조건 추적용 카운터 필드 추가 |
| 11 | `public/data/benzen-lines.txt` | 신규 | 벤젠 조건별 대사 INI 파일 |
| 12 | `src/data/benzen-init.ts` | 신규 | benzen-lines.txt 파서 |
| 13 | `src/data/village-defs.ts` | 수정 | `BenzenLineDef` 인터페이스 + 레지스트리 추가 |
| 14 | `src/ui/screens/village-benzen.ts` | 수정 | 하드코딩 대사 → 파일 기반 조건 대사 선택, 마을 polish |
| 15 | `src/data/loader.ts` | 수정 | benzen-lines.txt 로드 추가 |

---

## 2. 구현 순서 (의존성 기준)

```
[1단계] 데이터 파일 확장
  → village-facilities.txt (42개 추가)
  → village-roads.txt (등급 3~4)
  → benzen-lines.txt (신규)

[2단계] 타입/인터페이스 변경
  → village-defs.ts (VillageRoadDef 필드 추가, BenzenLineDef 추가)
  → knowledge.ts (추적 카운터 추가)

[3단계] 파서/로더 변경
  → village-init.ts (도로 파서 buildCostIron)
  → benzen-init.ts (신규)
  → loader.ts (benzen-lines.txt 로드)

[4단계] 모델 로직 변경
  → village.ts (단계 4~7 전환 조건, 방문 필드, 도로 헬퍼)

[5단계] 시스템 로직 변경
  → village-simulation.ts (단계 승급, NPC 방문 수입)

[6단계] UI 변경
  → village.ts (던전재료 차감, 방문자 표시, 단계명)
  → village-benzen.ts (파일 기반 대사)

[7단계] 칭호 시스템
  → title-system.ts (마을 칭호 10종)

[8단계] 세이브 시스템
  → save-system.ts (SAVE_VERSION 4, 신규 필드 직렬화)
```

---

## 3. Phase 3 상세 설계

### 3-1. village-facilities.txt — 42개 시설 추가

기존 10개 패턴 (`[id]` + 기본 필드 + `tier1_~tier3_`) 동일하게 유지.  
`unlockStage` 값으로 단계별 잠금을 처리한다.

**카테고리별 시설 목록과 unlockStage**

```
[생산 — production, 9개]
quarry           채석장       unlockStage=2
fish_market      어시장       unlockStage=2
herb_garden      약초원       unlockStage=2
mine             광산         unlockStage=3
brewery          양조장       unlockStage=3
pottery_workshop 도자기공방   unlockStage=3
textile_workshop 직물공방     unlockStage=3
stable           마구간       unlockStage=4
shipyard         조선소       unlockStage=6

[편의 — amenity, 9개]
temple           교회/신전    unlockStage=2
bathhouse        목욕탕       unlockStage=3
library          도서관       unlockStage=3
hospital         병원         unlockStage=3
school           학교         unlockStage=4
plaza            광장         unlockStage=2
permanent_market 상설시장     unlockStage=4
theater          극장         unlockStage=4
hot_spring       온천         unlockStage=5

[방어 — defense, 8개]
stone_wall       석벽         unlockStage=3
knight_barracks  기사단숙소   unlockStage=4
magic_tower      마법방어탑   unlockStage=4
castle_wall      성벽         unlockStage=5
armory           무기고       unlockStage=3
training_ground  훈련장       unlockStage=3
moat             해자         unlockStage=5
fortress_gate    요새 문      unlockStage=6

[행정 — admin, 5개]
town_hall        마을회관     unlockStage=3
customs          세관         unlockStage=4
courthouse       법원         unlockStage=5
lords_manor      영주관       unlockStage=6
tax_office       세무서       unlockStage=4

[문화 — culture, 7개]
art_gallery      미술관       unlockStage=4
myth_monument    신화기념비   unlockStage=5
festival_square  축제광장     unlockStage=3
adventurers_guild_branch 모험가길드분소 unlockStage=3
mage_tower       마법사탑     unlockStage=5
cultural_center  문화회관     unlockStage=4
grand_temple     대신전       unlockStage=6

[특수 — special, 8개]
post_office      우편배달소   unlockStage=2
immigrant_inn    이민자숙소   unlockStage=3
irrigation       관개시설     unlockStage=3
trade_hub        교역로허브   unlockStage=4
research_lab     연구소       unlockStage=5
signal_tower     신호탑       unlockStage=3
tourism_office   관광안내소   unlockStage=4
triumphal_arch   기념아치     unlockStage=5
```

**INI 예시 (채석장)**

```ini
[quarry]
name = 채석장
category = production
unlockStage = 2
buildCostGold = 600
buildCostWood = 10
buildCostStone = 5
incomePerDay = 18
maintenancePerDay = 4
description = 석재를 채굴한다. 건설 비용 절감 효과.

tier1_incomePerDay = 18
tier1_maintenancePerDay = 4
tier1_happinessBonus = 0
tier1_defenseBonus = 0
tier1_upgradeCostGold = 0

tier2_incomePerDay = 30
tier2_maintenancePerDay = 6
tier2_happinessBonus = 0
tier2_defenseBonus = 0
tier2_upgradeCostGold = 900
tier2_upgradeCostStone = 30
tier2_upgradeCostMonsterBone = 4

tier3_incomePerDay = 48
tier3_maintenancePerDay = 9
tier3_happinessBonus = 0
tier3_defenseBonus = 5
tier3_upgradeCostGold = 2200
tier3_upgradeCostStone = 60
tier3_upgradeCostRareMetal = 2
tier3_upgradeCostMagicStone = 2
```

**방어 시설 tier3 defenseBonus 가이드라인**

| 시설 | tier1 defense | tier2 defense | tier3 defense |
|------|--------------|--------------|--------------|
| stone_wall | 15 | 28 | 45 |
| castle_wall | 20 | 35 | 55 |
| knight_barracks | 8 | 18 | 32 |
| magic_tower | 10 | 22 | 38 |
| armory | 5 | 12 | 22 |
| training_ground | 3 | 8 | 15 |

---

### 3-2. village-roads.txt — 등급 3~4 추가

`buildCostIron` 필드 신규 추가 (기존 등급 1~2에는 0으로 처리).

```ini
[paved_road]
name = 포장도로
grade = 3
buildCostGold = 500
buildCostStone = 20
buildCostIron = 10
travelSpeedMultiplier = 0.6
maintenancePerDay = 4
description = 석재와 철로 포장된 도로. 이동 시간을 40% 단축한다.

[royal_highway]
name = 대로
grade = 4
buildCostGold = 1500
buildCostStone = 40
buildCostIron = 10
travelSpeedMultiplier = 0.4
maintenancePerDay = 8
description = 왕국급 대로. 이동 시간을 60% 단축한다.
```

---

### 3-3. village-defs.ts 변경

**VillageRoadDef에 `buildCostIron` 추가**

```typescript
export interface VillageRoadDef {
  // 기존 필드 유지...
  buildCostIron: number;   // 신규 — 등급 3~4에서 사용
}
```

**던전재료 ID 매핑 상수 추가 (village-defs.ts 하단)**

```typescript
// 업그레이드 비용 필드명 → 실제 items.txt 아이템 ID 매핑
export const DUNGEON_MATERIAL_ITEM_IDS = {
  upgradeCostMonsterBone: 'bone_fragment',
  upgradeCostMagicStone: 'moonstone',      // items.txt의 moonstone 활용
  upgradeCostRareMetal: 'silver_ore',      // items.txt의 silver_ore 활용
} as const;

export type DungeonMaterialKey = keyof typeof DUNGEON_MATERIAL_ITEM_IDS;
```

> **설계 결정**: items.txt에 `magic_stone`, `rare_ore`가 없으므로 기존 아이템(`moonstone`, `silver_ore`)에 매핑한다. 향후 던전 콘텐츠 확장 시 교체 가능하도록 상수로 분리.

---

### 3-4. village-init.ts 변경

도로 파서에 `buildCostIron` 추가:

```typescript
export function initVillageRoads(sections: DataSection[]): void {
  for (const s of sections) {
    registerRoadDef({
      // 기존 필드...
      buildCostIron: s.getInt('buildCostIron', 0),  // 신규
    });
  }
}
```

---

### 3-5. village.ts (models) 변경

#### 단계 4~7 전환 조건 추가

`checkVillageStageUp` 함수 확장:

```typescript
export function checkVillageStageUp(v: VillageState): boolean {
  const activeFacilityCount = getActiveFacilities(v).length;
  if (v.stage === 1 && activeFacilityCount >= 1) return true;
  if (v.stage === 2 && activeFacilityCount >= 3 && v.population >= 5) return true;
  if (v.stage === 3 && activeFacilityCount >= 8 && v.population >= 15) return true;
  // Phase 3 신규
  if (v.stage === 4 && activeFacilityCount >= 15 && v.population >= 35) return true;
  if (v.stage === 5 && activeFacilityCount >= 25 && v.population >= 70) return true;
  if (v.stage === 6 && activeFacilityCount >= 38 && v.population >= 120) return true;
  if (v.stage === 7) return false; // 최대 단계
  // stage=7 전환: 단계 6에서 조건 충족 시 7로
  // 위의 조건에서 stage===6 → 7 처리가 필요
  return false;
}
```

> 수정: `v.stage === 6` 조건이 이미 위에 있으므로 stage 7 전환은 `activeFacilityCount >= 50 && population >= 200` 조건으로 stage=6 분기에 작성.

**실제 구현 형태**:
```typescript
if (v.stage === 6 && activeFacilityCount >= 50 && v.population >= 200) return true;
```

#### NPC 방문 상태 필드 추가 (VillageState interface)

```typescript
export interface VillageState {
  // 기존 필드 유지...
  // Phase 3 신규
  visitingNpcCount: number;       // 오늘 방문 중인 NPC 수
  totalVisitorIncome: number;     // 누계 방문자 수입 (칭호용)
  crisisEventSuccessCount: number; // 위기 이벤트 성공 횟수 (칭호용)
  springFestivalCount: number;    // 봄 축제 성공 횟수 (칭호용)
}
```

`createVillageState` 초기값 추가:
```typescript
visitingNpcCount: 0,
totalVisitorIncome: 0,
crisisEventSuccessCount: 0,
springFestivalCount: 0,
```

#### 도로 등급별 이동시간 헬퍼 추가

```typescript
/**
 * 마을 도로 중 특정 연결에 적용되는 최고 등급 도로의 speedMultiplier 반환.
 * 도로가 없으면 1.0 반환.
 */
export function getVillageRoadMultiplier(
  v: VillageState,
  targetLocationId: string,
  getRoadDef: (id: string) => { grade: number; travelSpeedMultiplier: number } | undefined,
): number {
  const roadsToTarget = v.roads.filter(
    r => r.status === 'active' && r.connectedLocationId === targetLocationId,
  );
  if (roadsToTarget.length === 0) return 1.0;
  let best = 1.0;
  for (const r of roadsToTarget) {
    const def = getRoadDef(r.roadId);
    if (def && def.travelSpeedMultiplier < best) best = def.travelSpeedMultiplier;
  }
  return best;
}
```

> 이 헬퍼는 travel 시스템에서 `minutesOverride`를 계산할 때 호출한다. 도로 건설 시 `locData.linksBidirectional`의 `minutesOverride`를 즉시 갱신하거나, travel 시스템에서 동적으로 적용하는 두 가지 방식이 있다. 기존 `village-build.ts`가 `minutesOverride: 30`으로 고정이므로 **도로 건설 버튼 클릭 핸들러에서 링크를 업데이트**하는 방식을 채택한다 (travel 시스템 변경 최소화).

---

### 3-6. village-simulation.ts 변경

#### 단계 4~7 승급 메시지

`tickVillage` 내 단계 승급 섹션에 단계명 매핑 추가:

```typescript
const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];

if (checkVillageStageUp(village)) {
  village.stage = (village.stage + 1) as VillageStage;
  result.stageUp = true;
  result.newStage = village.stage;
  const stageName = STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`;
  log.add(gameTime, `[${village.name}] 마을이 "${stageName}"(으)로 성장했다!`, '마을');
}
```

#### NPC 방문 수입 처리 (tickVillage 내 추가 섹션)

```typescript
// 6. NPC 방문 수입 (단계 3+)
if (village.stage >= 3) {
  const visitCount = village.visitingNpcCount;
  if (visitCount > 0) {
    const income = visitCount * 2;
    village.finance.treasury += income;
    village.totalVisitorIncome += income;
    result.financeDelta += income;
  }
  // 방문자 수는 매일 재계산: party NPC 중 마을 위치에 있는 수
  // (실제 NPC 위치 조회는 UI/session에서 처리 후 village.visitingNpcCount 갱신)
}
```

> `visitingNpcCount` 갱신 책임: `tickVillage` 호출 전에 session 레벨에서 NPC 위치를 확인하여 세팅한다. `village-simulation.ts`는 값을 사용하기만 한다.

---

### 3-7. village.ts (UI screen) 변경

#### 던전재료 실차감 — 업그레이드 버튼 핸들러 수정

기존 골드만 차감하던 로직 뒤에 아이템 차감 추가:

```typescript
// 던전재료 차감
import { DUNGEON_MATERIAL_ITEM_IDS } from '../../data/village-defs';

const dungeonChecks: [keyof typeof DUNGEON_MATERIAL_ITEM_IDS, number][] = [
  ['upgradeCostMonsterBone', nextTierDef.upgradeCostMonsterBone],
  ['upgradeCostMagicStone', nextTierDef.upgradeCostMagicStone],
  ['upgradeCostRareMetal', nextTierDef.upgradeCostRareMetal],
];

// 먼저 보유량 확인
for (const [key, amount] of dungeonChecks) {
  if (amount > 0) {
    const itemId = DUNGEON_MATERIAL_ITEM_IDS[key];
    if (p.getItemCount(itemId) < amount) {
      statusMessage = `재료 부족: ${getItemDisplayName(key)} ×${amount} 필요`;
      render(el);
      return;
    }
  }
}

// 골드 차감 후 아이템 차감
p.addGold(-nextTierDef.upgradeCostGold);
knowledge.trackGoldSpent(nextTierDef.upgradeCostGold);
for (const [key, amount] of dungeonChecks) {
  if (amount > 0) {
    p.removeItemById(DUNGEON_MATERIAL_ITEM_IDS[key], amount);
  }
}
```

#### 업그레이드 버튼 비활성화 조건 확장

기존 `canAfford = gold >= costGold`를 확장:

```typescript
const canAffordGold = gold >= costGold;
const canAffordItems = dungeonChecks.every(([key, amount]) =>
  amount === 0 || p.getItemCount(DUNGEON_MATERIAL_ITEM_IDS[key]) >= amount
);
const canAfford = canAffordGold && canAffordItems;
```

#### 단계명 표시

```typescript
const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];
// 기존 "Lv.${village.stage}" → "${STAGE_NAMES[village.stage]} (단계 ${village.stage})"
```

#### 방문자 수 표시

stats 그리드에 카드 1개 추가:
```html
<div>오늘 방문자: ${village.visitingNpcCount}명</div>
```

#### 마을 설립일 + 경과 일수

```html
<div>설립: ${village.foundedDay}일차 (경과 ${currentDay - village.foundedDay}일)</div>
```

---

### 3-8. save-system.ts 변경

**SAVE_VERSION: 3 → 4**

`serializeVillageState`에 신규 필드 추가:
```typescript
visitingNpcCount: v.visitingNpcCount ?? 0,
totalVisitorIncome: v.totalVisitorIncome ?? 0,
crisisEventSuccessCount: v.crisisEventSuccessCount ?? 0,
springFestivalCount: v.springFestivalCount ?? 0,
```

`deserializeVillageState`에 기본값 처리 추가:
```typescript
visitingNpcCount: d.visitingNpcCount ?? 0,
totalVisitorIncome: d.totalVisitorIncome ?? 0,
crisisEventSuccessCount: d.crisisEventSuccessCount ?? 0,
springFestivalCount: d.springFestivalCount ?? 0,
```

---

## 4. Phase 4 상세 설계

### 4-1. knowledge.ts 변경 — 칭호 추적 카운터

```typescript
// Phase 4 마을 관련 칭호 추적
villageRoadsConnected: number = 0;   // 도로 연결 총 횟수 (건설 시마다 +1)
springFestivalCount: number = 0;     // 봄 축제 성공 횟수 (village.springFestivalCount에서 복사)
```

> `villageState` 필드가 이미 `knowledge.villageState`에 있으므로 title-system.ts에서 `session.knowledge.villageState`를 직접 참조하는 것으로도 충분하다. 별도 카운터보다 villageState 필드 참조를 우선한다.

---

### 4-2. title-system.ts 변경 — 마을 칭호 10종 추가

기존 `TITLE_CONDITIONS` 배열에 추가 (GameSession → villageState 접근):

```typescript
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
  // 도로 4개 이상 연결 (village.roads 배열 길이)
  check: s => (s.knowledge.villageState?.roads.length ?? 0) >= 4,
},
{
  id: '번영의 설계사',
  // 누계 방문자 수입 100000G
  check: s => (s.knowledge.villageState?.totalVisitorIncome ?? 0) >= 100000,
},
{
  id: '주민의 친구',
  // 방문 NPC 누계 10명 이상 (visitingNpcCount는 일일 값이므로 totalVisitorIncome > 0으로 대체하거나
  // 별도 누계 필드 사용 — Phase 4에서 village.totalUniqueVisitors 필드 추가 필요)
  check: s => (s.knowledge.villageState?.totalVisitorIncome ?? 0) > 0
    && (s.knowledge.villageState?.visitingNpcCount ?? 0) >= 10,
},
{
  id: '축제의 왕',
  check: s => (s.knowledge.villageState?.springFestivalCount ?? 0) >= 5,
},
{
  id: '위기를 넘은 자',
  check: s => (s.knowledge.villageState?.crisisEventSuccessCount ?? 0) >= 5,
},
```

> `주민의 친구` (방문 NPC 10명 누계) 조건은 일일 카운트인 `visitingNpcCount`로 정확히 표현하기 어렵다. `VillageState`에 `peakVisitorCount: number` (최대 동시 방문자) 또는 `totalVisitorDays: number` (누계 방문자-일) 필드를 추가하고 조건을 `totalVisitorDays >= 10`으로 재정의하는 것을 권장한다. 구현자는 이 결정을 채택할 것.

---

### 4-3. benzen-lines.txt — 신규 파일

**파일 위치**: `public/data/benzen-lines.txt`

**INI 구조**:
```ini
[id]
condition = <조건 키>
text = <대사 텍스트>
priority = <숫자, 높을수록 우선>
```

**condition 키 목록**:
- `net_negative` — 일일 수지 적자
- `low_population` — 인구 5 미만
- `low_happiness` — 행복도 30 미만
- `high_happiness` — 행복도 70+, 인구 10+
- `stage_up` — 단계 승급 직후 (트리거 기반)
- `upgrade_available` — 업그레이드 가능한 시설 있음
- `upgrade_maxed` — 모든 시설 최고 티어
- `no_specialization` — 전문화 미선택
- `specialization_chosen` — 전문화 선택 완료
- `visitor_zero` — 방문자 없음 (단계 3+)
- `visitor_many` — 방문자 5명+
- `default` — 조건 없음 (폴백)

**예시 데이터**:
```ini
[benzen_net_negative_1]
condition = net_negative
text = 수입보다 지출이 많군. 이래서야 마을이 유지가 되겠어? 빨리 수익 구조를 개선해.
priority = 10

[benzen_low_pop_1]
condition = low_population
text = 인구가 너무 적어. 시설을 더 지어서 사람들을 불러 모아야 해. 뭐, 당연한 소리지만.
priority = 8

[benzen_high_happiness_1]
condition = high_happiness
text = 오, 나쁘지 않은데? 뭐, 내가 관리하니까 당연한 결과지만.
priority = 5

[benzen_default_1]
condition = default
text = 현재 마을 상태는... 무난해. 더 잘할 수 있어. 내가 여기 있는 이상 최선을 다해야 해.
priority = 1

[benzen_stage_4]
condition = stage_4
text = 읍 단계라니. 제법이군. 하지만 아직 갈 길이 멀어. 계속해봐.
priority = 20

[benzen_maxed_1]
condition = upgrade_maxed
text = 모든 시설이 최고 수준이라고? ...인정하지. 이 정도면 나도 만족이야.
priority = 15

[benzen_visitor_many_1]
condition = visitor_many
text = 방문객이 많군. 여관을 더 업그레이드하면 수입이 더 늘 거야. 알아서 해.
priority = 7
```

---

### 4-4. benzen-init.ts — 신규 파서

```typescript
// benzen-init.ts — benzen-lines.txt 파서
import { DataSection } from './parser';
import { registerBenzenLine } from './village-defs';

export function initBenzenLines(sections: DataSection[]): void {
  for (const s of sections) {
    registerBenzenLine({
      id: s.name,
      condition: s.get('condition', 'default'),
      text: s.get('text', '...'),
      priority: s.getInt('priority', 1),
    });
  }
}
```

---

### 4-5. village-defs.ts 추가 — BenzenLineDef

```typescript
export interface BenzenLineDef {
  id: string;
  condition: string;
  text: string;
  priority: number;
}

const benzenLineRegistry: BenzenLineDef[] = [];

export function registerBenzenLine(def: BenzenLineDef): void {
  benzenLineRegistry.push(def);
}

export function getBenzenLine(condition: string): string {
  const matches = benzenLineRegistry
    .filter(d => d.condition === condition)
    .sort((a, b) => b.priority - a.priority);
  if (matches.length > 0) return matches[0].text;
  // 폴백: default
  const fallback = benzenLineRegistry
    .filter(d => d.condition === 'default')
    .sort((a, b) => b.priority - a.priority)[0];
  return fallback?.text ?? '...';
}

export function getBenzenLineForVillage(village: VillageState, net: number): string {
  if (net < 0) return getBenzenLine('net_negative');
  if (village.population < 5) return getBenzenLine('low_population');
  if (village.happiness < 30) return getBenzenLine('low_happiness');
  if (village.happiness >= 70 && village.population > 10) return getBenzenLine('high_happiness');
  if (village.visitingNpcCount >= 5) return getBenzenLine('visitor_many');
  return getBenzenLine('default');
}
```

> `VillageState` import 순환 참조 주의: `village-defs.ts`는 이미 `village-event.ts`를 import하고 있다. `VillageState`를 import할 경우 `village.ts → village-defs.ts` 순환이 생길 수 있으므로 `getBenzenLineForVillage`의 파라미터 타입을 인라인 구조체로 처리하거나, 별도 `benzen-defs.ts`로 분리한다.

**권장**: `getBenzenLineForVillage`를 `village-benzen.ts` (UI) 에 인라인으로 두고, `village-defs.ts`는 `registerBenzenLine`/`getBenzenLine`만 담는다.

---

### 4-6. village-benzen.ts — 대사 파일 연동

`getBriefingComment` 함수(현재 하드코딩)를 `getBenzenLine`/`getBenzenLineForVillage` 호출로 교체:

```typescript
import { getBenzenLine } from '../../data/village-defs';

// 기존 getBriefingComment 함수 제거 또는 래핑
function getBriefingComment(population: number, happiness: number, net: number): string {
  if (net < 0) return getBenzenLine('net_negative');
  if (population < 5) return getBenzenLine('low_population');
  if (happiness < 30) return getBenzenLine('low_happiness');
  if (happiness > 70 && population > 10) return getBenzenLine('high_happiness');
  return getBenzenLine('default');
}
```

**마을 polish 추가 (벤젠 briefing 화면)**

단계명 표시:
```typescript
const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];
const stageName = STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`;
// "Lv.${village.stage}" → "${stageName} (Lv.${village.stage})"
```

금고 잔액 (이미 briefing에 표시됨 — 확인 필요, 현재 village.ts UI에는 있음).

설립일 + 경과 일수, 도로 연결 현황을 briefing 하단에 추가:
```html
<div>설립: ${village.foundedDay}일차</div>
<div>경과: ${currentDay - village.foundedDay}일</div>
<div>도로 연결: ${village.roads.length}개</div>
```

---

### 4-7. loader.ts 변경

benzen-lines.txt 로드 추가. 기존 village-facilities.txt 로드 패턴을 따른다:

```typescript
// 기존 패턴:
// const facilityData = await fetchTxt('village-facilities.txt');
// initVillageFacilities(parseINI(facilityData));

// 추가:
const benzenData = await fetchTxt('benzen-lines.txt');
initBenzenLines(parseINI(benzenData));
```

> loader.ts의 실제 함수명과 패턴은 `src/data/loader.ts`의 현재 구조를 구현자가 확인하여 일치시킬 것.

---

## 5. 타입/enum 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `src/models/village.ts` | `VillageState`에 4개 필드 추가 (visitingNpcCount, totalVisitorIncome, crisisEventSuccessCount, springFestivalCount) |
| `src/data/village-defs.ts` | `VillageRoadDef.buildCostIron` 추가, `DUNGEON_MATERIAL_ITEM_IDS` 상수 추가, `BenzenLineDef` 인터페이스 + 레지스트리 추가 |
| `src/models/knowledge.ts` | 불필요 (villageState 직접 참조로 충분) |

---

## 6. 세이브 호환성

### SAVE_VERSION 변경: 3 → 4

**이유**: `VillageState`에 신규 필드 4개 추가 (`visitingNpcCount`, `totalVisitorIncome`, `crisisEventSuccessCount`, `springFestivalCount`)

**마이그레이션 전략**: 기존 `deserializeVillageState`의 패턴과 동일하게 `?? 0` 기본값 처리로 구버전 세이브 호환 유지. 별도 마이그레이션 함수 불필요.

```typescript
// deserializeVillageState 추가분
visitingNpcCount: d.visitingNpcCount ?? 0,
totalVisitorIncome: d.totalVisitorIncome ?? 0,
crisisEventSuccessCount: d.crisisEventSuccessCount ?? 0,
springFestivalCount: d.springFestivalCount ?? 0,
```

**`save-load.ts` (SAVE_VERSION: 6)**: 이 파일은 별개 시스템으로 보이며 village 관련 필드를 직접 저장하지 않는 것으로 판단된다. 수정 불필요하나 구현자가 연관성을 재확인할 것.

---

## 7. 위험 요소 및 주의사항

### 위험 1: 던전재료 아이템 ID 매핑 불일치
- **현상**: `upgradeCostMonsterBone`이 `bone_fragment`에 매핑되어 있지만, 기존 UI(village-benzen.ts L170)에서는 "몬스터뼈(던전)"으로 표시만 했다. 실제 플레이어 인벤토리에 `bone_fragment`가 없으면 항상 업그레이드 불가.
- **대응**: `DUNGEON_MATERIAL_ITEM_IDS` 상수를 통해 매핑을 한 곳에서 관리하고, UI 표시명도 items.txt의 실제 이름(`뼈 조각`, `문스톤`, `은광석`)으로 통일.

### 위험 2: 시설 52개 시 unlockStage 필터링 성능
- **현상**: `getAllFacilityDefs().filter(f => f.unlockStage <= village.stage)` 호출이 매 렌더 시 실행됨. 52개 정도는 무시할 수준이나 향후 확장 시 캐싱 고려.
- **대응**: 현재는 변경 없음. 추후 문제 시 메모이제이션 추가.

### 위험 3: 도로 등급 3~4의 `buildCostIron` — 아이템 차감 미구현
- **현상**: 도로 건설 시 현재 코드는 골드만 차감한다(village.ts L391). `buildCostIron`을 추가해도 실제 차감 로직이 없으면 무료로 건설 가능.
- **대응**: 도로 건설 버튼 핸들러에서 `iron_ore`(items.txt에 존재) 보유량 확인 + 차감 로직 추가. 철(iron_ore)이 없으면 버튼 비활성화.

### 위험 4: NPC 방문 수입 계산 — visitingNpcCount 갱신 책임
- **현상**: `village.visitingNpcCount`를 누가 언제 갱신하느냐가 명확하지 않으면 항상 0.
- **대응**: `tickVillage` 호출 직전에 session 레벨(game-screen.ts 또는 daily-tick 담당 시스템)에서 동료 NPC의 현재 위치를 확인하여 갱신. 구현자가 daily-tick 호출 지점을 찾아 삽입할 것.

### 위험 5: `주민의 친구` 칭호 조건 불명확
- **현상**: 일일 방문자 수(`visitingNpcCount`)는 매일 변하므로 "누계 10명"의 의미가 불명확.
- **대응**: `VillageState`에 `peakVisitorCount: number` (역대 최대 동시 방문자) 또는 `totalVisitorDays: number` (누계 방문자-일) 중 하나를 추가. 계획서는 `totalVisitorDays >= 10` 방식을 권장.

### 위험 6: 시설 42개 데이터 볼륨
- `village-facilities.txt` 파일이 약 5배 증가 (~1500줄 예상). 파싱 오류 가능성 증가.
- **대응**: INI 구조를 동일하게 유지하고, `tier1_upgradeCostGold = 0` 명시를 일관성 있게 작성.

### 위험 7: 벤젠 대사 순환 참조
- `village-defs.ts`에 `getBenzenLineForVillage(village: VillageState, ...)` 추가 시 `village.ts` ↔ `village-defs.ts` 순환 참조 발생 가능.
- **대응**: `getBenzenLineForVillage`는 `village-benzen.ts` (UI)에 인라인 구현. `village-defs.ts`에는 순수 레지스트리 함수(`registerBenzenLine`, `getBenzenLine`)만 배치.

---

## 8. game-qa 검증 포인트

### Phase 3 검증

1. **시설 52개 등록 확인**: 브라우저 콘솔에서 `getAllFacilityDefs().length === 52` 확인
2. **도로 4등급 등록 확인**: `getAllRoadDefs().length === 4` 확인
3. **단계 4~7 승급**: 시설 15개 + 인구 35 달성 시 단계 4 전환, 로그에 "읍" 표시
4. **던전재료 차감**: `bone_fragment` 0개 보유 시 해당 재료 요구 업그레이드 버튼 비활성화 확인
5. **던전재료 실차감**: 업그레이드 후 `player.getItemCount('bone_fragment')` 감소 확인
6. **NPC 방문 수입**: 방문자 3명 시 금고 +6G/일 확인
7. **도로 이동시간 단축**: 포장도로 건설 후 해당 경로 이동 시간이 기존 × 0.6인지 확인
8. **세이브/로드**: SAVE_VERSION 4 세이브 후 로드 시 신규 필드 정상 복원 확인
9. **구버전 세이브 로드**: SAVE_VERSION 3 세이브 로드 시 신규 필드가 0으로 기본값 처리되는지 확인

### Phase 4 검증

1. **칭호 10종 트리거**: 각 조건 충족 시 `earnedTitles` 배열에 해당 칭호 추가 확인
2. **벤젠 대사 조건 분기**: 수지 적자 상황에서 벤젠 briefing 열면 `net_negative` condition 대사 출력
3. **benzen-lines.txt 로드**: 파일 로드 실패 시 fallback 대사("...") 출력, 예외 미발생
4. **단계명 표시**: village.ts UI에서 단계 4 → "읍 (단계 4)" 표시
5. **설립일/경과일**: foundedDay와 currentDay 차이가 올바르게 계산되는지 확인

---

## 9. 구현자(game-implementer)에게

### 작업 시작 전 필수 확인
1. `src/data/loader.ts` 전체를 읽어 fetchTxt/parseINI 호출 패턴 파악 후 benzen-lines.txt 로드 삽입
2. `src/systems/game-session.ts` 또는 daily-tick 호출 지점을 찾아 `visitingNpcCount` 갱신 위치 결정
3. 도로 건설 핸들러에서 `iron_ore` 차감 추가 시 `p.removeItemById('iron_ore', amount)` 패턴 사용

### 구현 중 발견 시 계획 재검토 요청 항목
- `loader.ts`의 실제 비동기 로딩 패턴이 예상과 다른 경우
- `iron_ore` 아이템 ID가 items.txt에서 다른 이름으로 등록된 경우
- 도로 `minutesOverride` 동적 갱신 방식이 travel 시스템과 충돌하는 경우
