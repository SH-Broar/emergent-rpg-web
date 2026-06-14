# 생성된 콘텐츠 파일 기록

---

## [flavor 최종 정제 2026-06-11] cards/ 5파일 flavor 라인 금칙·공식 정제

- 대상: `public/data/cards/` 의 cards-mvr.txt(196) · transform-forms.txt(91) · cards-possession.txt(3) · cards-arc.txt(3) · junk-cards.txt(3).
- 적용 기준: v1.3.1 R1(해방 원칙) + 절대 금칙(짙/옅/두 배/두껍·두둑·두툼/통째로/더 깊(물리 외)/과거형 종결/묵직하게 등). flavor 라인만 수정.
- cards-mvr.txt 재작성 18건: c-prism-strike(깊→크게), c-prism-guard(짙→높이 쌓인), c-blood-pact(곱절 정리), c-bastion-counter(두껍→단단), c-doom-mark(깊·무거워→무뎌), c-shared-breath(두툼→넉넉), c-prism-overload(짙·깊), c-color-surge(짙→높이 쌓인), c-diropel-totem(짙→매섭게), c-prism-strike-plus(두 배·짙), c-prism-guard-plus(짙·두 배), c-prism-overload-plus(무게 명료화), c-color-surge-plus(두 배), c-double-hex-plus(짙→무겁게), c-soul-harvest-plus(짙→독한 씨앗), c-shell-slam-plus(두 배→무겁게), c-soft-ward-plus(두껍→단단), c-bastion-counter-plus(두껍→단단), c-growing-leaf-plus(두껍→단단), c-shared-breath-plus(깊이→길게), c-shop-heavy/+(묵직하게 부사 정리).
- transform-forms.txt 재작성 9건: c-fox-illusion-plus(두껍→빽빽), c-fox-veil-plus(짙·두껍→자욱·단단), c-fox-devour(통째로→한꺼번에), c-fox-emberstoke(두 배→더 크게), c-fox-fogwall/+(두꺼운·짙→자욱), c-fox-dreamhaze-plus(짙→아득), c-fox-enthrall-plus(짙→세 가지 거짓 단단히), c-fox-collect(통째로→한꺼번에).
- cards-possession.txt / cards-arc.txt / junk-cards.txt: 전수 검토 결과 금칙·공식 위반 0 → 전부 유지.
- 불변 보호 17문장 전부 무수정 확인. 어휘 반복 관리(자욱/그럴듯한 거짓) 적용.
- `npm run validate` PASS (에러 0). prose 규칙(별표·em-dash·몬무스) 0.

---

## [보상 밸런스 재조정 2026-05-22] 사건(이벤트) 선택지 보상 투명화 대응

배경: EventView가 선택 전 각 선택지 효과를 미리보기(투명). 순수 손해 금지 + hidden 도박 분포 + 컬러 보상 강화.
대상(값/자연어만, 키·id·헤더·event id·node_kinds·weight·once_per_run 무변경):
- `public/data/events/act-1-region-events.txt` (588 헤더 / 148 events / 440 choices)
- `public/data/events/events-filler.txt` (40 헤더 / 12 events / 28 choices)

### 손본 선택지 수
- region: custom `*-color-1`(+1) -> `color = random:6` 강화 = 146 choices(148줄). 이중-custom 2개는 단일 thematic 컬러로 정리(중복 color 키 방지): lava-vein-spark.choice.3=fire:7, yuse-iron-vein.choice.2=iron:7.
- region: 순수 손해 보정 2개 — yuse-dead-end.choice.1(hp-10)+iron:12, falcon-core.choice.1(hp-10)+wind:12.
- region: hidden=true 85개 추가 (good 50 : bad 35 = 19.3%/440).
- filler: 마이너스-업사이드 보정 0(이미 전부 비례 컬러 보유). hidden 1->5 (good 3:bad 2 = 17.9%/28).

### 마이너스-업사이드 보정: region 2건(+이미 91건은 카드/유물/골드/affinity로 보정 보유, 그중 다수가 weak custom이었으나 위 컬러 강화로 미리보기 가시화됨).
### hidden 분포: region 85(good:bad=50:35), filler 5(3:2). 합계 90, 좋음:나쁨=53:37 (나쁨만 가리지 않음).
### 컬러 보상 강화: 148(region) + 0신규(filler 기존 유지) = colorDelta 주력화.

### 무결성
- 헤더/event id 동일(region 588·148, filler 40·12), 모든 choice label 존재, event meta 무변경, result_text 무변경(440=440).
- 변경/추가 줄은 전부 color(148)/hidden(90)뿐. 금지문자 0. npm run build ✓ 627ms. EventView color random/all/specific+hidden 지원 확인.

### !! 사용자 확인 필요 (키 변경 금지 조항이라 미수정) — 잠재 키 버그 4건(선택지가 아무것도 안 줌):
- `relic =` (grant_relic 이어야): yuse-dead-end.choice.1, falcon-core.choice.1
- `card =` (grant_card 이어야): lar-caliburn-elnest-meet-2.choice.2, lar-twins-talk-3.choice.2
두 dead-end은 color 업사이드 추가로 순수 손해는 해소. 단 의도된 유물/카드는 키 수정 전까지 미지급.

### 작업 산출물(public 밖): _workspace/content/{mutate_events.py, analyze_events.py, backup/*.bak.txt}

---

## [prose 정리 2026-05-22] act-1-region-events.txt 시적 크러치 감축

대상: `public/data/events/act-1-region-events.txt` (단일 대형 파일, 3930줄, 588 섹션)
값(등호 오른쪽 자연어: body/result_text/label/name)만 수정. 키/id/숫자/effects/condition/grant/섹션헤더 무수정.

### 단어 before -> after
| 단어 | before | after |
|------|--------|-------|
| 한 호흡 | 25 | 3 |
| 호흡(전체) | 28 | 6 |
| 박자(prose, 주석제외) | 6 | 0 |
| 한 마디 | 21 | 19 (정상 수량사만 잔존) |
| 마디(전체) | 38 | 27 |
| 한 결 | 0 | 0 (도입분 회수) |
| 한 자락 | 151 | 49 |
| 자락(전체) | 174 | 66 |
| 한 겹 | 6 | 5 |
| 겹(전체) | 19 | 16 |
| "한 +" 총 | 1019 | 904 |

방식: 반복 closer 템플릿(한 자락이 어깨에 닿았다 / 가슴 안쪽이 한 자락 가벼워졌다 / 한 호흡 늦게)을
평범한 한국어(빛/숨/목소리/기운/조금/잠시)로 치환하거나 크러치 수량사 제거. 명사 본뜻 있는 곳은 자연
수량사(잎 한 장 / 옷감 한 필 / 물줄기)로 교체. 정상 수량사(한 명/한 잔/한 손가락 마디)는 유지.
박자 클러스터(로크)는 걸음/속도/흐름으로, 추상 마디/겹/틈은 구체 명사로. 금지어(박자/한 박/결) 신규 0.

무결성(backup 대비): 줄수 동일 3930 / 섹션 588 byte-identical / 키 2280 동일 / 값 내 `#;*`em-dash 0 / BOM 없음.
backup: `_workspace/act-1-region-events.bak.txt` / 스크립트: `_workspace/reduce_crutch.py`~`reduce_crutch5.py`

---

## [재튜닝 2026-05-21] 몬스터 인텐트 강도/빈도 조정 (intents 라인만)

작업: 일반 몬스터에서 강한 상태이상/기믹 제거, 엘리트는 시그니처 1종 + 빈도 1~2회/사이클로 제한.
수치(HP/attack/gold/time_shards/card_drops)는 **전혀 변경하지 않음**. `intents` 라인만 수정.
검증: `npm run build` ✓ (579ms, 오류 없음). 사후 grep: 잔존 강기믹 라인은 전부 elite.

강기믹 정의: bind / devour / obscure / cost-up / transform-card / add-card-* / force-discard / paralyze / spasm / 큰 charge.

변경 파일: act-1-roster-t1~t4.txt. mvr-monsters.txt는 보호 픽스처(데모5+shadow2+ninetails)만 있어 **무수정**.

- **T1**: 일반 7종 강기믹 제거, 엘리트 4종 빈도 조정(thunder-wolf·ancient-dryad는 원래 1강기믹이라 유지).
- **T2**: 일반 13종 강기믹 제거, 엘리트 2종(kishina-siren·limun-sovereign) 조정.
- **T3**: 일반 24종 강기믹/과다디버프 제거, 엘리트 9종 전부 강기믹 3~4→2종 이하로 조정.
- **T4**: 일반 12종 제거, 엘리트 3종(sky-empress·lightning-archon·toramimi신수) 조정. 신수 kumamimi/magma-titan/core-colossus 등은 1~2강기믹 이내라 유지.

---

# (이하 원본 생성 기록)

## act-1-roster-t2.txt
- 경로: `public/data/monsters/act-1-roster-t2.txt`
- 생성일: 2026-05-21
- 내용: T2 중간 티어 몬스터 로스터 — 5개 권역
- 섹션 수: 40개 (일반 32 + 엘리트 8)

### 권역별 섹션 목록

#### moss (fire) — 10개
- mr-moss-fireworm (normal)
- mr-moss-cindermoth (normal)
- mr-moss-anvil-arachne (normal, 기믹: bind+charge)
- mr-moss-slag-golem (normal)
- mr-moss-flame-lizard (normal)
- mr-moss-forge-imp (normal, 기믹: charge)
- mr-moss-char-wraith (normal, 기믹: drain)
- mr-moss-iron-guardian (normal)
- mr-moss-forge-titan (elite, 기믹: charge+buff)
- mr-moss-smelter-queen (elite, 기믹: bind+charge+drain)

#### riagralta (electric) — 6개
- mr-ria-storm-sheep (normal, 기믹: charge)
- mr-ria-thunder-fox (normal, 기믹: paralyze+spasm)
- mr-ria-spark-wasp (normal, 기믹: spasm)
- mr-ria-voltage-goat (normal, 기믹: charge)
- mr-ria-gale-serpent (normal, 기믹: paralyze)
- mr-ria-arc-wolf (elite, 기믹: charge+paralyze+buff)

#### alimes (water) — 8개
- mr-ali-mist-deer (normal, 기믹: obscure)
- mr-ali-herb-bandit (normal, 기믹: drain)
- mr-ali-fog-sprite (normal, 기믹: obscure+weakness)
- mr-ali-stone-bear (normal)
- mr-ali-dew-moth (normal)
- mr-ali-marsh-creeper (normal, 기믹: weakness+obscure)
- mr-ali-fog-sovereign (elite, 기믹: obscure+weakness+drain)
- mr-ali-ancient-treant (elite, 기믹: buff+vulnerable)

#### martin (water) — 6개
- mr-martin-dock-rat (normal, 기믹: drain)
- mr-martin-sea-thug (normal, 기믹: charge)
- mr-martin-kelp-creeper (normal, 기믹: bind)
- mr-martin-tide-spirit (normal, 기믹: weakness)
- mr-martin-gull-raider (normal)
- mr-kishina-siren (elite, 기믹: weakness+vulnerable+bind)

#### manonickla (iron) — 10개
- mr-mano-cliff-crab (normal)
- mr-mano-sand-wraith (normal, 기믹: devour)
- mr-mano-sunset-raven (normal, 기믹: obscure)
- mr-mano-limun-ward (normal, 기믹: add-card-discard curse)
- mr-mano-iron-scorpion (normal, 기믹: poison)
- mr-mano-dusk-shade (normal, 기믹: obscure+drain)
- mr-mano-ruin-lurker (normal, 기믹: add-card-discard curse+wound)
- mr-mano-tide-golem (normal)
- mr-mano-limun-sovereign (elite, 기믹: add-card-discard curse+buff)
- mr-mano-sunset-drake (elite, 기믹: charge+buff)

---

## act-1-roster-t3.txt
- 경로: `public/data/monsters/act-1-roster-t3.txt`
- 생성일: 2026-05-21
- 내용: T3 심화 티어 몬스터 로스터 — 7개 권역
- 섹션 수: 46개 (일반 37 + 엘리트 9)

### 권역별 섹션 목록

#### luna (dark) — 9개
- mr-luna-ink-fiend (normal, 기믹: add-card-draw curse+obscure)
- mr-luna-grimoire-shadow (normal, 기믹: obscure+add-card-hand curse+cost-up)
- mr-luna-phantom-scribe (normal, 기믹: add-card-draw wound+obscure)
- mr-luna-cursed-page (normal, 기믹: add-card-hand curse×2+cost-up)
- mr-luna-mirror-shade (normal)
- mr-luna-forbidden-wisp (normal, 기믹: cost-up+obscure)
- mr-luna-corridor-phantom (normal)
- mr-luna-arcane-devourer (elite, 기믹: obscure+add-card curse×2+cost-up+transform-card)
- mr-luna-headmaster-shade (elite, 기믹: cost-up+add-card curse+obscure+buff)

#### tacomi (electric) — 9개
- mr-tacomi-pixel-beast (normal)
- mr-tacomi-hologram-jester (normal, 기믹: obscure×2)
- mr-tacomi-barrier-sprite (normal, 기믹: cost-up×2)
- mr-tacomi-neon-hornet (normal, 기믹: paralyze×2)
- mr-tacomi-festival-mimic (normal)
- mr-tacomi-circuit-prowler (normal, 기믹: spasm+cost-up)
- mr-tacomi-voltage-dancer (normal, 기믹: vulnerable)
- mr-tacomi-hologram-titan (elite, 기믹: obscure+cost-up+paralyze)
- mr-tacomi-grand-circuit (elite, 기믹: cost-up+spasm+buff+paralyze)

#### demon-windfall (wind) — 5개
- mr-demon-windfall-paper-ghost (normal, 기믹: add-card-draw blank+paralyze)
- mr-demon-windfall-gale-blade (normal, 기믹: charge)
- mr-demon-windfall-time-freezer (normal, 기믹: paralyze×2)
- mr-demon-windfall-anchor-wraith (normal)
- mr-demon-windfall-storm-tyrant (elite, 기믹: charge+add-card blank+paralyze)

#### enicham (electric) — 6개
- mr-enicham-sparking-drone (normal, 기믹: spasm)
- mr-enicham-relay-crawler (normal, 기믹: cost-up+paralyze)
- mr-enicham-capacitor-golem (normal, 기믹: defend+buff)
- mr-enicham-circuit-hound (normal, 기믹: vulnerable)
- mr-enicham-overload-wraith (normal, 기믹: spasm×2+cost-up)
- mr-enicham-proto-agi (elite, 기믹: cost-up+spasm+buff+paralyze)

#### triflower (fire) — 6개
- mr-triflower-ember-arachne (normal, 기믹: bind+poison)
- mr-triflower-lava-salamander (normal, 기믹: charge)
- mr-triflower-flame-spirit (normal, 기믹: transform-card+cost-up)
- mr-triflower-magma-crab (normal, 기믹: defend+charge)
- mr-triflower-scorchling (normal, 기믹: poison)
- mr-triflower-ignia-queen (elite, 기믹: bind+poison+charge)

#### diropel (earth) — 5개
- mr-diropel-long-ear-sentinel (normal, 기믹: bind)
- mr-diropel-short-ear-dancer (normal, 기믹: weakness+frail)
- mr-diropel-totem-warden (normal, 기믹: defend×2)
- mr-diropel-pattern-shaman (normal, 기믹: weakness+frail+add-card curse)
- mr-diropel-grove-elder (elite, 기믹: bind+weakness+frail+buff)

#### coral-coast (water) — 6개
- mr-coral-coast-jellyfish-drifter (normal, 기믹: devour×2)
- mr-coral-coast-siren-charmer (normal, 기믹: weakness+vulnerable)
- mr-coral-coast-coral-grappler (normal, 기믹: bind×2)
- mr-coral-coast-mermaid-hunter (normal)
- mr-coral-coast-tide-specter (normal, 기믹: paralyze+obscure)
- mr-coral-coast-abyss-queen (elite, 기믹: devour+weakness+bind+vulnerable+drain)

---

## act-1-roster-t4.txt
- 경로: `public/data/monsters/act-1-roster-t4.txt`
- 생성일: 2026-05-21
- 내용: T4 고위험 몬스터 로스터 — 4개 권역 (dead end + 도전 사냥터)
- 섹션 수: 28개 (일반 21 + 엘리트 7, 신수 2 포함)

### 권역별 섹션 목록

#### yusezria (iron+water · dead end) — 8개
- mr-yusezria-iron-sentinel (normal, 기믹: defend+강공)
- mr-yusezria-tide-wraith (normal, 기믹: devour)
- mr-yusezria-rust-hound (normal, 기믹: charge)
- mr-yusezria-pressure-mite (normal, 기믹: frail+weakness)
- mr-yusezria-deep-leech (normal, 기믹: drain)
- mr-yusezria-ore-spike (normal, 기믹: add-card-discard+vulnerable)
- mr-yusezria-core-colossus (elite, 기믹: charge+devour+defend)
- mr-yusezria-abyssal-warden (elite, 기믹: bind+drain+charge+vulnerable)

#### falcon-garden (wind · 공중 군도) — 7개
- mr-falcon-garden-gust-harpy (normal, 기믹: frail+charge)
- mr-falcon-garden-talon-striker (normal, 기믹: charge+강공)
- mr-falcon-garden-wind-lancer (normal, 기믹: frail+charge)
- mr-falcon-garden-sky-raven (normal, 기믹: force-discard+weakness)
- mr-falcon-garden-gale-sentry (normal, 기믹: defend+frail)
- mr-falcon-garden-storm-sovereign (elite, 기믹: charge+frail+weakness+buff)
- mr-falcon-garden-sky-empress (elite, 기믹: force-discard+charge+frail+weakness+buff)

#### emberforge (iron · 용암 광맥) — 7개
- mr-emberforge-ash-hound (normal, 기믹: poison+charge)
- mr-emberforge-furnace-golem (normal, 기믹: defend+charge)
- mr-emberforge-lava-crawler (normal, 기믹: devour+poison)
- mr-emberforge-cinder-bat (normal, 기믹: poison+drain)
- mr-emberforge-slag-crusher (normal, 기믹: charge+add-card-discard)
- mr-emberforge-magma-titan (elite, 기믹: charge+poison+drain)
- mr-emberforge-kumamimi (elite 신수, 기믹: buff+charge+poison+drain+devour, HP 960)

#### oldshrine (electric · 번개 신전) — 7개
- mr-oldshrine-spirit-flame (normal, 기믹: obscure+paralyze)
- mr-oldshrine-shrine-warden (normal, 기믹: cost-up+spasm)
- mr-oldshrine-thunder-wraith (normal, 기믹: paralyze+obscure+spasm)
- mr-oldshrine-barrier-golem (normal, 기믹: cost-up+defend)
- mr-oldshrine-relic-hunter (normal, 기믹: force-discard+weakness+charge)
- mr-oldshrine-lightning-archon (elite, 기믹: cost-up+paralyze+charge+obscure+spasm)
- mr-oldshrine-toramimi (elite 신수, 기믹: buff+paralyze+charge+cost-up+obscure+spasm+drain, HP 1000)
