# XP·카드 강화 시스템 — 변경 기록

정본 스펙: `.omc/specs/deep-interview-xp-card-enhancement.md` (현재 파일 부재 — 코드가 진실원).
구조 요약: 카드 인스턴스 `enhanceLevel`(0~10)/`awakened`, XP 1·3·9(레벨업 3), 레벨업 픽 모달,
공방 각성(`workshop.awakenCard` — upgrade류 제거), `enhance.ts`에 상수·비용·스케일 헬퍼.

---

## M3·M4 보충 (코드에서 역추적 — 계획 문서 부재로 간략 기록)

### M3 — XP·레벨업
- `src/systems/enhance.ts` 신규: `XP_PER_LEVEL=3`, `XP_NORMAL/ELITE/BOSS=1/3/9`, 강화 스케일 헬퍼.
- `src/stores/run.ts`: `gainXp(amount)` (누적 XP→레벨업, `pendingEnhancePicks` 증가),
  `enhanceCard(instanceId)` (강화권 1장 소비 → `enhanceLevel +1`, `canEnhance` 가드).
- `src/systems/combat-rewards.ts`: 전투 승리 시 `gainXp` + `rewardXp`/`rewardLevelUp` 피드.
- `src/components/EnhancePickModal.vue` 신규: 레벨업 시 강화 대상 카드 선택 모달.

### M4 — 각성·공방·스케일
- `src/data/schemas/card.ts`: `Card.enhanceLevel`(0~10)/`awakened` 인스턴스 필드 추가.
- `src/data/schemas/item.ts`: `Item.element`(8색, 특산물 각성 매칭축) 추가.
- `src/data/loader.ts`: item `element`/`region_id` 파싱(이미 반영).
- `src/systems/enhance.ts`: `enhanceMul`(1.12^lvl)·`scaledValue`(최소 +1 보장)·`canEnhance`·
  `needsAwakening`·`AWAKEN_COST`(등급별 특산물+사다리 재료)·`matchingSpecialties`.
- `src/systems/workshop.ts`: `awakenCard`(특산물 N+재료 소비 → plus 정의 교체/awakened), upgrade_to 교체 강화 제거.
- `src/stores/run.ts`: `awakenCard(instanceId, plusDef?)` 상태 전이 + `migratePlusCards`
  (구세이브 `-plus` 인스턴스 → `enhanceLevel 5`+`awakened`).
- `src/systems/combat.ts`: `previewCardEffectValue`가 실행 시점 스케일 적용.

게이트(M4 종료 시점): `npm run build` + `npm run validate` 통과 (작업 트리 미커밋).

---

## M5 — 풀 정리 · 특산물 8종 축소

### M5-1. `-plus` 풀 등장 0 전수 확인
**결론: 추가 코드 변경 불필요 — 중앙 게이트가 이미 차단.**
- `src/systems/unlocks.ts:40` `availableCards()`가 `c.id.endsWith('-plus')` 제외 → 모든 풀의 공통 게이트.
  이를 통과하는 풀: 상점(`shop.getShopCardPool`), 공방 제작(`workshop.getForgePool`),
  전투 보상(`combat-rewards`/`boss-rewards`의 `availableRelics`/legendaryCardIds=base).
- `src/systems/form-pool.ts:50` 폼 풀도 `-plus` 제외(기존).
- 시드 풀: `race seed_cards`는 전부 base id (race-moth/phantom/arcana/human 전수 확인, `-plus` 0).
  `ChaosSelectView`는 `r.seedCardIds`(base)를 instantiate — 안전.
- `combat.ts`의 `-plus` 참조(c-tripps-rage / c-rize-relay)는 카드 후처리 로직이라 풀 생성과 무관.

### M5-2. activity.ts 옛 강화 처리 → enhanceLevel +1 (리더 확정 방침)
`src/systems/activity.ts`:
- `ACTIVITY_UPGRADE_CHANCE`(0.3, upgradeToId=-plus 즉시 교체) → `ACTIVITY_ENHANCE_CHANCE`(0.3)로 개명.
- `grantSeedCard()`: base 카드를 `instantiateCard`로 인스턴스화 → 확률적으로 `enhanceLevel +1`.
  - 가드: `canEnhance(instance) && !needsAwakening(instance)` + `Math.min(MAX_ENHANCE_LEVEL, ...)`.
  - 갓 인스턴스(0강)라 보통 안전. 5강 잠김·10강 상한·needsAwakening 폴백(강화 스킵, 카드는 그대로 지급) 존중.
- import 추가: `instantiateCard`(deck), `canEnhance/needsAwakening/MAX_ENHANCE_LEVEL`(enhance).
- 표기: 강화판 별도 토스트 없이 base 이름으로 카드 지급(배지가 +N 표시). reward-feed 결 유지.

### M5-3. 특산물 8종 축소 (`public/data/items/act-1-items.txt`)
- **잔존 8종 element 부여 + rank=rare 통일**:

| id | element | 권역 | rank(변경) |
|---|---|---|---|
| i-lava-scale | fire | triflower | rare(유지) |
| i-salt-pearl | water | martin | common→**rare** |
| i-storm-fang | electric | riagralta | common→**rare** |
| i-emberforge-ore | iron | emberforge | rare(유지) |
| i-world-tree-bud | earth | lar-forest | common→**rare** |
| i-sky-shard | wind | falcon-garden | rare(유지) |
| i-shrine-relic | light | oldshrine→대표 | rare(유지) |
| i-grimoire-ink | dark | luna | common→**rare** |

- **제거 10종 섹션 삭제**: clockwork-cog, forge-ember, sunset-shard, mist-petal, neon-residue,
  anchor-link, yusezria-ore, trade-silk, diropel-pigment, coral-pearl.
- description은 보존(element만 추가). 단 i-shrine-relic 묘사 "정전기가 가볍게 튄다"→"빛이 가볍게 어린다"
  (light 속성 정합성 — electric 느낌 단어 제거).
- 헤더 주석을 "8종 8색" 안내로 갱신(매핑표 포함).
- 검증 결과 아이템 수: 55 → **45** (정확히 10종 삭제 반영).

### M5-4. 전 권역 specialty_item 재매핑 (`public/data/node-maps/act-1-map.txt`)
21개 region(데이터상 23 region 중 specialty_item 있는 21개)을 primary_color 매칭 8종으로 재지정.
**모든 region이 primary_color == 특산물 element 로 일치(각성 매칭 정합성 완벽).**

| region | primary_color | 변경 전 | 변경 후 |
|---|---|---|---|
| iluneon | light | i-clockwork-cog | **i-shrine-relic** |
| lar-forest | earth | i-world-tree-bud | i-world-tree-bud(유지) |
| moss-north | fire | i-forge-ember | **i-lava-scale** |
| moss-south | fire | i-forge-ember | **i-lava-scale** |
| manonickla | iron | i-sunset-shard | **i-emberforge-ore** |
| riagralta | electric | i-storm-fang | i-storm-fang(유지) |
| alimes | water | i-mist-petal | **i-salt-pearl** |
| luna | dark | i-grimoire-ink | i-grimoire-ink(유지) |
| tacomi | electric | i-neon-residue | **i-storm-fang** |
| demon-windfall | wind | i-anchor-link | **i-sky-shard** |
| martin | water | i-salt-pearl | i-salt-pearl(유지) |
| enicham | electric | i-neon-residue | **i-storm-fang** |
| reshud | electric | i-storm-fang | i-storm-fang(유지) |
| yusezria | iron | i-yusezria-ore | **i-emberforge-ore** |
| triflower | fire | i-lava-scale | i-lava-scale(유지) |
| falcon-garden | wind | i-sky-shard | i-sky-shard(유지) |
| tradepost | earth | i-trade-silk | **i-world-tree-bud** |
| diropel | earth | i-diropel-pigment | **i-world-tree-bud** |
| coral-coast | water | i-coral-pearl | **i-salt-pearl** |
| oldshrine | electric | i-shrine-relic | **i-storm-fang** |
| demon-castle | dark | i-grimoire-ink | i-grimoire-ink(유지) |

주: oldshrine은 primary_color=electric이라 i-storm-fang으로 매핑(특산물 element 일치 우선).
i-shrine-relic(light)은 iluneon(light)에서 드롭 — 8색 전부 어딘가 region에 매핑됨.

### M5-5. 제거 10종 참조 정리
- `activity.ts` `n-mano-night-market`: `grantItem('i-sunset-shard')` → `i-emberforge-ore`(마노니클라 iron).
- 이벤트 `specialty=` 토큰: **존재하지 않음**(grep 0) — 무영향 확인.
- getLegendaryRecipes 등 레시피: region.legendaryCardIds(base 카드)·region.specialtyItemId 참조라
  region 재매핑으로 자동 정합 — 별도 수정 불필요.
- **전수 grep: src + public/data 에서 제거 10종 id 참조 0 확인**(남은 참조는 `_workspace` 백업뿐, 비활성).

### M5 게이트
- `npm run build`: ✓ built in 867ms (exit 0)
- `npm run validate`: ✓ PASS 에러 0 (아이템 45)

---

## M6 — 검증기 · RPGEditor 동기화

### M6-1. `scripts/validate-core.mjs` 신규 검사 3종
- **VALID_SPECIALTY_ITEMS** 상수 추가(8종 화이트리스트, 진실원 주석).
- (a) region `specialty_item`이 8종 집합 소속 검사 (정의 존재 + 8종 화이트리스트) — `whitelist-kind`.
- (b) 풀 데이터 `-plus` 금지: region `legendary_cards` + race `seed_cards`에 `-plus` id 차단 — `dangling`.
  (forge 풀은 런타임 availableCards 기반이라 데이터 필드 없음 → legendary_cards가 forge 데이터 대표.)
- (c) `Item.element` 8색 유효성 — `whitelist-kind`.
- RULE_CATALOG의 whitelist-kind/dangling 설명 갱신(신규 검사 반영).

### M6-2. RPGEditor 동기화 (`C:\WorkStation\EmergentRPG\RPGEditor\src`)
- `metadata.ts` item FIELDS에 `element`(8색 COLOR_OPTIONS) 추가.
- `schemas.ts`(레거시) item 폼 블록에도 `element`(ELEMENT_OPTIONS) 추가 — 일관성.
- `validator.ts`: VALID_SPECIALTY_ITEMS 상수 + 검사 3종(item element / region specialty 8종 /
  legendary·seed `-plus` 금지) — **게임 validate-core와 동일 문구로 미러**. RULE_CATALOG도 동기화.
- 카드 인스턴스 필드(enhanceLevel/awakened)는 *정의 편집기*인 RPGEditor와 무관(런 휘발 인스턴스 필드).

### M6 게이트 (3종 전부)
- 게임 `npm run build`: ✓ 867ms
- 게임 `npm run validate`: ✓ PASS 에러 0
- RPGEditor `npm run build`: ✓ 913ms

### 추가 QA (회귀 + 음성 테스트)
- **validator-parity-test**: ✓ 완벽 패리티 (game core ↔ editor validator 동일 실데이터 동일 진단, 에러 0/경고 0).
- **음성 테스트**: element='flame'(오타) + region specialty=제거종 주입 → 검증기가 정확히 2건 탐지(PASS).
- **validator-gate-test**: ✓ 전부 통과 (QA 의도적 위반 데이터 차단).
- **validator-source-test**: ✓ 통과.
- **roundtrip-test**: 내가 편집한 act-1-items.txt/act-1-map.txt는 불일치 목록에 없음(파서 라운드트립 무손상).
  (41/63 불일치는 사전 존재 CRLF 차이로 내 변경과 무관.)

---

## 계획과 다른 결정 + 사유
1. **M5-1 코드 변경 0**: 지시서가 shop/combat-rewards/activity/workshop/form-pool/unlocks 전반에
   `-plus` 제외를 "확인/추가"하라 했으나, `unlocks.availableCards()`가 이미 중앙에서 `-plus`를 거르고
   모든 풀이 이를 통과하므로 **추가 코드 불필요**. activity만 별경로(M5-2)라 수정.
2. **잔존 8종 rank 전부 rare 통일**: 지시서 권장대로 5종 common→rare 승격(각성 재료 등급 일관).
   description 보존, element만 추가.
3. **oldshrine 특산물**: primary_color=electric이라 i-storm-fang 매핑(element 일치 우선). 원래 이 region이
   참조하던 i-shrine-relic(light)은 iluneon(light)으로 이동 — 8색 전부 어딘가에 매핑되도록.
4. **i-shrine-relic 묘사 1곳 수정**: light 속성과 안 맞는 "정전기" 표현 제거(element 정합성). 그 외 prose 불변.

## QA 중점 (다음 검증 단계 권장)
- 런타임: 활동 노드에서 카드 보상이 +1강(배지 표시)으로 나오는지, 강화판(-plus)이 상점/공방/보상/시드에
  절대 안 나오는지 (playwright).
- 각성: 공방에서 카드 element와 일치하는 특산물(권역 specialty)로 5강 카드 각성 가능한지.
- 특산물 드롭: 각 region 전투/채집에서 재매핑된 8종 특산물이 드롭되는지(element 매칭 각성 흐름 end-to-end).
- 세이브: 구 -plus 인스턴스 마이그레이션(enhanceLevel 5 + awakened) 정상 동작(이미 M4 구현, 회귀 확인).
