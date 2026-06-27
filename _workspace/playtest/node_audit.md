# 노드-컬러 역할 감사 (코드 기반)

작성: 2026-06-20. 대상: `emergent-rpg-web` (TypeScript + Vue).
원칙: 현행 동작만 file:line 증거로 기술. 변경 제안 없음. 추측 금지(불확실하면 명시).

NodeKind 정의: `src/data/schemas/base.ts:11` — village, combat, event, elite, boss, rest, shop, workshop, gather, activity.

라우팅: `MapView.vue`가 노드 종류에 따라 분기. village→`/game/village`, workshop→`/game/workshop`, combat/elite→격자 전투(`enterGridCombat`), boss→`/game/boss-intro`, rest는 MapView 내 인라인 처리, shop→ShopView, event→EventView, gather→GatherView, activity→ActivityView (`src/views/MapView.vue:269` 분기).

---

## 노드별 역할 표

| 노드 | 컬러 IN | 컬러 USE | 주 보상/역할 | 시간 | 중복 |
|---|---|---|---|---|---|
| **village** (마을) | 없음 | 없음 | **카드 제작** — 일반 등급 풀에서 3장 추첨 → 1장 선택, 시간조각 5. 포션 제작(일반). NPC 대화. | 노드당 -1 (visitNode) | 카드 획득: shop·workshop·activity·event·전투드롭 |
| **shop** (상점) | 없음 | 없음 | **골드 소비** 구매: 카드 5슬롯/유물 2슬롯/일반재료/카드제거 1회. (no-respite 카오스 시 HP 회복 슬롯) | 노드당 -1 | 카드/유물 획득: village·workshop·전투; 카드제거: workshop |
| **workshop** (공방) | 없음 | 없음 | **카드 각성(5강 게이트 돌파)** + 희귀+ 제작 + 전설 제작 + 희귀 포션 + 카드제거(deckSize-1). 자원=특산물+사다리재료+시간조각. | 노드당 -1 | 카드획득: shop·village; 카드제거: shop |
| **rest** (휴식) | 없음 | 없음 | **HP 회복** = floor(maxHp×0.3×restHealMul). 수화(feral-heavy) 해제. on-rest 유물. 노드당 1회(restDone). | 노드당 -1 | HP회복: event(hpDelta/healPct)·activity·전투후유물·shop(no-respite) |
| **event** (사건) | **있음** — colorDelta(특정/all/random), 사건 보상의 주력 | **있음** — 선택지 게이트 `color:fire>=3`(베이스 컬러) + colorCost(컬러 차감 비용) | 다양: HP/골드/시간조각/컬러/카드/유물/단서/친밀도/동료영입/커스텀 | 노드당 -1 | 컬러획득: 전투·gather·activity·boss; 카드/유물: 다수 |
| **combat** (일반전투) | **있음** — 승리 시 권역 primaryColor +2~5 (티어별) | 없음(전투 중 컬러 소비/판정 없음) | XP +1(레벨업→강화권) / 골드·시간조각(몬스터drop) / 특산물·재료 / 권역컬러 | 노드당 -1 (전투 자체는 추가 시간 X) | XP: elite·boss; 컬러: event·gather·activity·boss |
| **elite** (엘리트) | **있음** — 권역 primaryColor +4~10 (티어별, combat의 2배) | 없음 | XP +3 / **영혼 +1(메타)** / 희귀유물(T3+) / 전설카드 / 희귀·전설재료 / 특산물 | 노드당 -1 | combat의 상위판 |
| **boss** (보스) | **있음** — 권역 primaryColor +5 (fragile-glory 카오스 시 ×2) | 없음 | **연표보스: 런 종료(승리)** + 메타해금/영혼/도감 + XP+9 + 희소재료. **아크보스: 런 지속** + 전용특전(유물/카드/아이템/골드). | 노드당 -1 | XP: combat·elite; 컬러: 동일 |
| **gather** (채집) | **있음**(후반 풀) — 권역 primaryColor +round(3×scoreMul) | **없음 직접** — 단, 점수 임계가 권역 tier와 무관(`gatherScoreThreshold`는 상수 0.55). 컬러로 난이도 판정 **안 함**(미니게임 점수만). | **시간조각·골드** 주력 + 특산물 + 일반/희귀/전설 재료. 점수(미니게임)로 배수. 노드당 1회. | 노드당 -1 | 시간조각/골드: activity; 특산물/재료: 전투·activity |
| **activity** (활동) | **있음** — d100 성공 시 건 컬러 대폭(+12×배수), 기본풀 35% 무작위 컬러 +1~2 | **있음** — 건 컬러값이 d100 성공확률(`colorValue + 15`). 컬러가 높을수록 성공률↑. | 골드/시간조각/**race 시드 카드**(30%, 가끔 +1강)/재료/HP. 노드당 1회. | 노드당 -1 | 카드획득: village; 컬러: event·전투 |

증거 모음:
- village 제작: `VillageView.vue:35`(VILLAGE_CRAFT_COST=5), `:36`(3후보), `:37`(common만), `:207` rollCraft.
- shop: `shop.ts:147-176` 재고 생성(카드/유물/재료/제거/restPurchase), `:236`/`:261`/`:285` 구매·제거.
- workshop: `workshop.ts:87` awakenCard(각성), `:217` getOrCreateForgeOffer(희귀제작), `:362` craftLegendary, `:307` removeCardAtWorkshop(deckSize-1).
- rest: `MapView.vue:309-327` (heal=floor(maxHp*0.3*restHealMul), feral-heavy 해제, onRest 유물).
- event: 컬러 IN `EventView.vue:147-160`, colorCost `:134-138`, 게이트 `event-runner.ts:113-118`(베이스 컬러).
- combat 보상: `combat-rewards.ts:58` applyCombatVictoryReward (컬러·XP·재료·질).
- elite 영혼: `combat-rewards.ts:138` addSoul(1).
- boss: `boss-rewards.ts:27` applyBossRewards(컬러+5, XP+9, 종료), `:121` applyArcRewards(런 지속).
- gather: `gathering.ts:65` performGather(점수 배수·후반 컬러), `:50` 임계 상수 0.55.
- activity: `activity.ts:180` activitySuccessChance(컬러+15), `:195` applyActivitySuccess.

---

## A. 전투 패배 모델

**목숨(lives) 시스템이 존재한다.** 마리오식: 패배 시 목숨 1 소모 → 남으면 도망(맵 복귀), 0이면 런 종료.

- HUD 표시 확인: `GameHUD.vue:96-99` `lives = run.data.lives ?? 2`, `maxLives ?? 2`, 하트 `❤`/`🤍` 렌더. `:177-181` "목숨 {lives}/{maxLives}" 툴팁 — **HUD에 '목숨 2/2' 표시 사실**.
- 기본값: `stores/run.ts:173-174` `lives: 2, maxLives: 2`.
- 패배 신호: `grid-combat.ts:3384-3386` `checkOutcome` — `state.player.hp <= 0` → `state.outcome = 'lose'`.
- 패배 처리(핵심 분기): `stores/run.ts:1121-1128` `endGridCombat('lose')`:
  ```
  r.gridCombat = undefined;
  if (this.loseLife()) {        // 목숨 -1, 남으면 true
    this.flee(nodeId);          // 도망: 노드 미클리어 유지 + HP를 maxHp 30%로 회복
    return true;                // 맵 복귀
  }
  this.endRun('hp-zero');       // 목숨 0 → 런 종료
  return false;
  ```
- `loseLife` (`stores/run.ts:852-857`): `r.lives -= 1; return r.lives > 0`.
- `flee` (`stores/run.ts:890-901`): 노드 combatCleared/Stealthed=false(재도전), HP를 `max(1, ceil(maxHp*0.3))`로 회복(현재가 더 높으면 유지). 변신/스택은 안 건드림.
- `endRun` (`stores/run.ts:1132-1138`): `ended=true; endReason='hp-zero'; active=false; clearSavedRun()`.

**패배→차감/종료 요약**: 전투 패배 = 즉시 런 종료(死)가 **아니다**. 목숨 1 차감이 먼저. 목숨이 남으면 HP 30% 회복 후 같은 노드를 미클리어로 둔 채 맵 복귀(재도전 가능). 목숨이 0이면 그때 `endRun('hp-zero')`로 런 종료. (목숨 회복=희귀 포션 `gainLife` `:863`, 최대목숨 증가=유물/종족 `raiseMaxLives` `:876`.)

**연표 보스 승리도 런을 종료한다**(패배와 별개): `stores/run.ts:1090-1093` 연표 종말 보스 승리 → `applyBossRewards` + `endRun('boss-cleared')`. 아크 보스는 종료 안 함(`:1079-1087` 맵 복귀).

---

## B. 컬러 → 전투 (변환 공식)

핵심 모듈 `src/systems/stats.ts`. **주의: 기획서 가설의 VIT→최대HP는 코드에서 은퇴(F5, 2026-06-18).** `colors.ts:57` 주석 "색→최대 HP(VIT)는 은퇴", `stats.ts:1-13` 헤더, 마이그레이션 `stores/run.ts:97-104` `migrateColorHp`(구세이브 maxHp에 박힌 colorHpBonus 환원).

페어 산출 공식 `calculateStat(a,b)` (`stats.ts:38-49`):
```
balance = min(A,B)/max(A,B);  k=1.5; p=1.5
multiplier = 1 + k*pow(balance,p)
return (A+B)*multiplier        // 범위 0~500 (A,B∈[0,100])
```

색→스탯 매핑 (`stats.ts:67-74` deriveStats):
- ATK = calculateStat(**불, 전기**)
- DEF = calculateStat(**흙, 철**)
- MAG = calculateStat(**빛, 어둠**)
- VIT = calculateStat(**물, 바람**) — 수치만 유지(표시·유물 호환), **최대HP 효과 없음**.

스탯→전투 보너스 (`stats.ts:104-115` bonusesFromColors, 임계 `:90-94`):
- **damage** = floor(ATK/33)  (최대 ~+15) — 카드 damage 효과값에 정적 가산
- **block** = floor(DEF/33)   (최대 ~+15) — 카드 block 효과값에 정적 가산
- **manaExtra** = floor(MAG/150) (최대 ~+3) — 빛·어둠 → 라운드 마나 한도
- **drawExtra** = floor(물/40)  (단색, 최대 +2) — 손패 보충량
- **moveBonus** = floor(바람/50) (단색, 최대 +2) — 이동 사거리

전투 적용 위치 (`grid-combat.ts`):
- 전투 시작 손패/마나: `:1049-1050`, `:1264-1265` `handSize=5+drawExtra(+유물)`, `maxMana=DEFAULT+manaExtra(+유물)`.
- 이동 사거리: `:1057`/`:1270` `playerMoveProfile(run, bonus.moveBonus)`, `:1132-1136` range에 가산.
- damage/block 정적 가산: `stats.ts:124-131` `colorBonusForCardEffectKind` (damage→bonuses.damage, block→bonuses.block, 그 외 0). 실제 전투 보너스는 `currentBonuses()`/`bonusesFromEffective`(장비 포함)로 묶임 `grid-combat.ts:708`.

**전투 중 컬러 소비/판정은 없음** — 컬러는 전투 *시작 시 1회* 정적 변환되어 적용되는 입력값.

---

## C. 컬러 → 비전투 (활동·채집)

**활동(activity): 컬러로 성공/난이도를 판정한다.** d100 굴림.
- `activity.ts:177` `ACTIVITY_BASE_BONUS = 15`.
- `activity.ts:180-183` `activitySuccessChance(colorValue) = clamp(round(colorValue) + 15 + 유물보정, 0, 100)`. roll ≤ n 이면 성공.
- 즉 **건 컬러값이 높을수록 성공확률↑** (컬러 0이어도 15%). 실패해도 기본보상은 받음(`applyActivityBaseline` `:186`), 성공하면 특수보상(건 컬러 대폭 +12×배수 + 골드/조각/카드, `applyActivitySuccess` `:195`).
- 성공 시 건 컬러가 다시 오름(`grantColor(color, boost)` `:201`) — 컬러 IN이기도 함.

**채집(gather): 컬러로 난이도 판정 안 함.** 미니게임 점수만.
- `gathering.ts:50-52` `gatherScoreThreshold`는 tier 무관 **상수 0.55** 반환(주석: 난이도는 미니게임 요소로만 오름).
- `gathering.ts:81-82` 후반 풀 개방 = `score >= lateThreshold`(0.55 + 카오스가산). 컬러 미관여.
- 컬러는 *보상*으로만 등장: 후반 풀에서 권역 primaryColor +round(3×scoreMul) (`:104-107`).
- 명시: 채집은 컬러를 **입력으로 쓰지 않음**(점수가 입력). region.tier는 보상 풀(전설재료 T3+ 등)과 배수에만 영향(`:117`).

(기획서 추정 "채집=권역tier 색 난이도"는 코드에서 확인 못함 — 현행은 tier가 난이도가 아니라 보상 등급에만 작용.)

---

## D. 카드 강화 터치포인트 매핑

XP/강화 모델: `enhance.ts` — XP 3/레벨(`:19`), 전투승리만 적립(`:21-23` 일반1/엘리트3/보스9, 비전투 XP 없음). 0~10강(공격카드 30강 `:37`), 5강 각성게이트(`:39`).

**① 더 강한 카드를 얻는 곳 (신규/희귀/전설 카드)**
- village: 일반 등급 제작 (`VillageView.vue:37` common).
- shop: 카드 5슬롯(전설 제외, 골드) (`shop.ts:73-92`, `:236`).
- workshop: 희귀+ 제작(시간조각+특산물) + 전설 제작(시간조각25+특산물+희소재료) (`workshop.ts:217`, `:362`).
- elite/boss/event 드롭: 전설카드(권역 legendaryCardIds, `combat-rewards.ts:156-169`), 이벤트 grantCard (`EventView.vue:179`).
- activity: race 시드 카드(`activity.ts:36-53` grantSeedCard, 30% + 가끔 +1강).

**② 기존 카드를 강화/각성하는 곳**
- **레벨업 강화권**(1~5강): 전투 승리 XP→레벨업→`pendingEnhancePicks`. `stores/run.ts:552` gainXp, `:573` enhanceCard(+1강). 발급은 `combat-rewards.ts:81-84`/`boss-rewards.ts:45-48`. **즉 강화권의 유일한 입력원=전투(일반/엘리트/보스).** UI는 별도 픽 화면(reward-feed rewardLevelUp).
- **각성**(5강→6강 게이트 돌파, plus 진화): workshop만. `workshop.ts:87` awakenCard — 속성특산물 N + 사다리재료. `stores/run.ts:592` awakenCard 상태전이.
- activity 부수 강화: 시드 카드를 30% 확률 +1강으로 지급(`activity.ts:47-49`) — 갓 만든 0강 인스턴스 한정.
- (구 -plus 카드: 마이그레이션으로 5강+각성 처리, `stores/run.ts:77-89`.)

**③ 컬러를 얻는 곳**
- combat: 권역 primaryColor +2~5 (`combat-rewards.ts:88-93`).
- elite: 권역 primaryColor +4~10 (`combat-rewards.ts:89` ELITE_COLOR_BY_TIER).
- boss: 권역 primaryColor +5 (×카오스) (`boss-rewards.ts:63-66`).
- event: colorDelta 특정/all/random (`EventView.vue:147-160`) — 사건 보상의 주력.
- gather: 후반 풀 권역 primaryColor (`gathering.ts:104-107`).
- activity: 성공 시 건 컬러 대폭 + 기본풀 무작위 컬러 (`activity.ts:139-142`, `:201`).
- 시드: 종족 시작 컬러 1회 (`colors.ts:72` applySeedColors).
- village/shop/workshop/rest: **컬러 IN 없음**.

요약: 컬러는 전투·event·gather·activity에서 들어오고, 카드 *수치 강화*는 (a)전투 XP 레벨업 강화권, (b)workshop 각성 두 경로뿐. 컬러는 카드를 강화하지 않고 전투 시작 시 보너스로만 환산된다(B절).

---

## E. 시간(턴) 경제

**단위**: 노드 진입 1회 = 시간 1 소모. `stores/run.ts:407` `visitNode` → `:424` `r.remainingTime = max(0, remainingTime - 1)`.
- 전투/비전투 **차이 없음** — 모든 노드 종류가 진입 시 `visitNode`로 동일하게 -1. 전투·채집 미니게임·활동이 추가 턴을 소모하지 않는다(코드에서 노드 종류별 추가 시간차감 확인 못함).
- 예외(시간 미카운트): skip-turn-every 유물(r-postman-mail) — N번째 방문마다 시간 카운트 생략 (`stores/run.ts:411-420`). 카오스 attrition은 반대로 시간카운트된 이동에 HP -N (`:425-428`).

**하루 경과**: `stores/run.ts:129` `TURNS_PER_DAY = 100`. `:441` 방문수가 100의 배수면 `advanceDay`.
- `advanceDay` (`:455`): currentDay+1, deckSize+10, 혼란 해제, **비보호 노드(village/boss/shop/workshop 제외) cleared/event/activity/rest/gather 초기화 + content 권역 풀 재추첨**(`:472` protectedKinds, `:504-530`). 지도 모양(노드 kind)은 고정.

**타임아웃 종료**: 사용자 사양 "즉시 종료".
- `MapView.vue:261-265`: `if (run.data.remainingTime <= 0) { run.endRun('time-up'); → /game/end }`.
- 보스 게이트 강제: `map.ts:103-105` `isTimeUp(visitedCount, timeLimit) = visitedCount >= timeLimit`, `MapView.vue:51` 사용.
- HUD 시간 표시 `GameHUD.vue:217` remainingTime, 임박 경고 `:74` (≤ max(3, timeLimit×0.1)).
- 시작 timeLimit은 timeline에서 주입 (`stores/run.ts:277`).

---

## 불확실/확인 못한 항목
- 채집의 "권역 tier 색 난이도"(기획 추정): **코드에서 확인 못함**. 현행 채집 난이도 임계는 tier 무관 상수 0.55, 컬러 미관여(C절).
- 전투/비전투 노드의 시간 소모 차등: **없음**(전부 진입 -1). 코드상 종류별 추가 시간 비용 미발견.
- event-runner.ts에는 colorDelta 적용 코드가 없음(grep no match) — 컬러 보상 적용은 `EventView.vue`가 담당(이중 경로: applyChoice in view). event-runner는 조건 판정·미리보기·일부 colorCost 적용만.
