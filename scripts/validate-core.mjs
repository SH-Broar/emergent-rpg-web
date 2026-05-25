/**
 * 데이터 검증 코어 — 재사용 가능한 순수 규칙 모듈 (Node ESM, 의존성 0).
 *
 * 목적: public/data 의 INI 데이터 정합성을 자동 검사한다.
 *   - CLI(scripts/validate-data.mjs)가 import 해서 main push 게이트로 사용.
 *   - RPGEditor 저장 게이트가 *같은 규칙*을 미러링할 수 있도록, 규칙을 명확한 함수/상수로 분리.
 *
 * 화이트리스트 동기화 규칙(중요):
 *   아래 화이트리스트들은 게임 *런타임 핸들러 맵의 키*와 일치해야 한다.
 *   런타임 코드를 정적 import 할 수 없으므로(Vue/Pinia/import.meta 의존), 여기 *유지 목록*으로 둔다.
 *   런타임에서 kind/trigger/status/intent 를 추가/삭제하면 *반드시 이 파일도 같은 작업에서* 갱신할 것.
 *   각 목록 옆에 진실원(코드 위치)을 주석으로 남긴다.
 *
 * 파서는 src/data/parser.ts 와 *의미적으로 동일*(주석 제거·콤마 리스트·키=값·섹션). 인라인 재현.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ===========================================================================
// 1. INI 파서 — src/data/parser.ts 와 동일 의미.
// ===========================================================================

const COMMENT_PREFIXES = ['#', ';'];

function stripComment(line) {
  let cut = -1;
  for (const prefix of COMMENT_PREFIXES) {
    const idx = line.indexOf(prefix);
    if (idx >= 0 && (cut === -1 || idx < cut)) cut = idx;
  }
  return cut >= 0 ? line.slice(0, cut) : line;
}

/**
 * INI 텍스트를 파싱. 섹션 → 키 → 값. 추가로 *라인 번호*를 sectionLines에 기록(에러 위치용).
 * 반환: { data: {section: {key: value}}, sectionLines: {section: lineNo} }
 */
export function parseIni(text) {
  const data = {};
  const sectionLines = {};
  let currentSection = '__default__';
  data[currentSection] = {};

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cleaned = stripComment(lines[i]).trim();
    if (cleaned.length === 0) continue;
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      currentSection = cleaned.slice(1, -1).trim();
      if (!data[currentSection]) data[currentSection] = {};
      if (sectionLines[currentSection] === undefined) sectionLines[currentSection] = i + 1;
      continue;
    }
    const eqIdx = cleaned.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = cleaned.slice(0, eqIdx).trim();
    const value = cleaned.slice(eqIdx + 1).trim();
    if (!key) continue;
    data[currentSection][key] = value;
  }
  if (Object.keys(data.__default__).length === 0) delete data.__default__;
  return { data, sectionLines };
}

export function parseList(value) {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** "card.c-strike" → "c-strike" (첫 dot 이후). */
function sectionIdSuffix(section) {
  const dot = section.indexOf('.');
  return dot >= 0 ? section.slice(dot + 1) : section;
}

// ===========================================================================
// 2. 데이터 파일 목록 — src/data/loader.ts 의 DATA_FILES 와 *동기화 필수*.
//    (loader.ts 가 import.meta 의존이라 정적 import 불가 → 미러.)
//    파일 추가/제거 시 양쪽을 같은 작업에서 갱신.
// ===========================================================================

export const DATA_FILES = [
  'timelines/act-1-era4-061.txt',
  'node-maps/act-1-map.txt',
  'bosses/act-1-boss.txt',
  'bosses/act-1-arc.txt',
  'npcs/act-1-iluneon.txt',
  'npcs/act-1-stray.txt',
  'npcs/act-1-windfall.txt',
  'npcs/act-1-luna.txt',
  'npcs/act-1-mosswood.txt',
  'npcs/act-1-tacomi.txt',
  'npcs/act-1-manonickla.txt',
  'npcs/act-1-alimes.txt',
  'npcs/act-1-martin.txt',
  'npcs/act-1-enicham.txt',
  'npcs/act-1-triflower.txt',
  'npcs/act-1-falcon.txt',
  'npcs/act-1-tradepost.txt',
  'npcs/act-1-diropel.txt',
  'npcs/act-1-coral.txt',
  'npcs/act-1-mythicbeast.txt',
  'races/race-human.txt',
  'races/race-moth.txt',
  'races/race-phantom.txt',
  'races/race-arcana.txt',
  'races/race-form-fox.txt',
  'cards/cards-mvr.txt',
  'cards/cards-race.txt',
  'cards/junk-cards.txt',
  'cards/transform-forms.txt',
  'cards/cards-possession.txt',
  'cards/cards-arc.txt',
  'relics/relics-mvr.txt',
  'relics/relics-race.txt',
  'relics/relics-color.txt',
  'relics/relics-stat.txt',
  'relics/relics-turn.txt',
  'relics/relics-acquire.txt',
  'relics/relics-combat.txt',
  'relics/relics-cmech.txt',
  'relics/relics-activity.txt',
  'relics/relics-arc.txt',
  'events/events-mvr.txt',
  'events/act-1-region-events.txt',
  'events/events-filler.txt',
  'events/events-persistent.txt',
  'events/events-possession.txt',
  'monsters/mvr-monsters.txt',
  'monsters/act-1-roster-t1.txt',
  'monsters/act-1-roster-t2.txt',
  'monsters/act-1-roster-t3.txt',
  'monsters/act-1-roster-t4.txt',
  'items/act-1-items.txt',
  'items/act-1-arc-items.txt',
  'equipment/equipment-mvr.txt',
  'chaos/chaos-mvr.txt',
  'chaos/act-chaos.txt',
  'clues/act-1-clues.txt',
  'meta/unlocks.txt',
  'config/balance.txt',
];

// ===========================================================================
// 3. 화이트리스트 — 런타임 핸들러 맵 키와 동기화.
// ===========================================================================

export const VALID_RANKS = ['basic', 'common', 'rare', 'legendary'];

export const VALID_NODE_KINDS = [
  // src/data/loader.ts VALID_NODE_KINDS
  'village', 'combat', 'event', 'elite', 'boss', 'rest', 'shop', 'workshop', 'gather', 'activity',
];

export const VALID_EQUIPMENT_SLOTS = ['weapon', 'chest', 'accessory']; // loader.ts VALID_EQUIPMENT_SLOTS

export const VALID_CARD_SOURCES = [
  // schemas/card.ts CardSource — 'shop'은 상점 풀 카드(시작덱/전설 외 모두 포함)에 쓰이는 런타임 출처.
  'race', 'character', 'npc', 'hyperion', 'event', 'relic', 'boss', 'junk', 'form', 'possession', 'shop',
];

export const VALID_CARD_TRIGGERS = [
  // schemas/card.ts CardTriggerKind
  'manual', 'on-draw', 'on-turn-end', 'on-take-damage', 'persistent',
];

export const VALID_RELIC_SOURCES = [
  // schemas/relic.ts RelicSource — 'npc'는 영입 NPC 시그니처 유물의 런타임 출처(상점 풀 포함됨).
  'race', 'character', 'event', 'elite', 'boss', 'shop', 'meta', 'npc',
];

export const VALID_RELIC_TRIGGERS = [
  // schemas/relic.ts RelicTriggerKind
  'passive', 'on-combat-start', 'on-combat-end', 'on-node-enter',
  'on-card-play', 'on-card-played-before', 'on-card-played-after',
  'on-turn-start', 'on-turn-end', 'on-draw', 'on-damage-taken',
  'on-block-gain', 'on-rest', 'on-acquire', 'on-item-use', 'on-color-gain',
];

export const VALID_ITEM_CATEGORIES = ['consumable', 'specialty', 'material', 'rare-material'];
// 'rare-material'은 옛 별칭(loader.ts가 'material'로 정규화) — 허용.

/**
 * 카드 효과 kind — src/systems/combat.ts EFFECT_HANDLERS 키 (= schemas/card.ts CardEffectKind).
 */
export const VALID_CARD_EFFECT_KINDS = [
  'damage', 'damage-min-color', 'heal', 'block', 'draw', 'apply-status',
  'return-hand-to-deck', 'next-turn-energy', 'growing-block',
  'damage-top-color', 'damage-color-count', 'block-top-color', 'draw-if-color',
  'damage-per-debuff', 'consume-vulnerable', 'damage-from-hp', 'damage-per-hand',
  'exhaust-self', 'return-self-to-hand', 'block-to-damage', 'spend-all-energy',
  'damage-per-companion', 'damage-per-relic', 'growing-damage', 'heal-per-hand',
  'next-card-double', 'ghost-self', 'curse-tick', 'release-transform',
];

/**
 * 유물 효과 kind — src/systems/relic.ts HANDLERS 키 + modifier/조회형 kind + alias.
 *   - HANDLERS(트리거형): combat.ts/relic.ts 의 HANDLERS 객체.
 *   - 합산형 modifier(RelicModifierKind): getModifierAdd/Mul 가 조회.
 *   - 조회형(트리거 무관): discount / skip-turn-every / activity-* + C 메커니즘 마커
 *     (block-carryover/mana-carryover/first-card-free/double-debuff/retain-hand) —
 *     핸들러 없이 combat.ts playerHasRelicEffect 조회로 동작.
 *   - alias: bonus-damage → damage-out-add (relic.ts RELIC_KIND_ALIASES).
 */
export const VALID_RELIC_EFFECT_KINDS = [
  // HANDLERS (relic.ts)
  'bonus-hp', 'bonus-mana', 'bonus-gold', 'bonus-damage', 'chance-random-color-1', 'discount',
  'combat-start-block', 'combat-start-draw', 'combat-start-hand-card',
  'combat-start-mana-from-metric', 'combat-start-draw-from-metric', 'combat-start-status',
  'turn-start-block', 'turn-start-hp-loss', 'combat-end-heal', 'node-enter-heal',
  'cards-to-draw', 'cards-to-color', 'attacks-to-strength', 'attacks-to-color',
  'hurt-to-color', 'retaliate', 'damage-enemy', 'hurt-to-block',
  'boost-color', 'boost-stat', 'block-from-metric', 'strength-from-metric',
  'turn-start-block-snowball', 'turn-after-strength', 'turn-before-block', 'turn-units-color',
  'gain-time-shards', 'heal-now', 'gain-card',
  // 합산형 modifier (relic.ts RelicModifierKind)
  'damage-out-add', 'damage-out-mul', 'damage-in-mul', 'block-out-add',
  'draw-extra-add', 'mana-extra-add', 'cost-mod-add',
  // 조회형 (트리거 무관)
  'skip-turn-every', 'activity-success-add', 'activity-reward-mul',
  // C 메커니즘 마커 (combat.ts playerHasRelicEffect)
  'block-carryover', 'mana-carryover', 'first-card-free', 'double-debuff', 'retain-hand',
];

/**
 * 아이템 효과 kind — src/systems/item.ts applyItemEffect switch + parseItemEffect (= schemas/item.ts).
 */
export const VALID_ITEM_EFFECT_KINDS = [
  'heal', 'gold', 'time-shards', 'color-boost', 'color-all',
  'grant-card', 'grant-relic', 'teleport-village', 'revive-node',
  'cleanse-transform', 'cleanse-group',
  'combat-mana', 'combat-draw', 'combat-block',
  'combat-enemy-status', 'combat-self-status', 'combat-free-grapple',
];

/**
 * 몬스터/보스 인텐트 kind — src/systems/combat.ts executeMonsterIntent switch.
 *   (보스는 schemas/boss.ts kind 유니온이 따로 있으나, encoded 가 그대로 combat 엔진으로 흐르므로
 *    실제 처리 집합은 combat.ts 의 case 목록이 진실원.)
 */
export const VALID_INTENT_KINDS = [
  'attack', 'defend', 'buff', 'debuff', 'heavy-feral',
  'absorb-emotion', 'feast-debuff', 'bind', 'bind-hard', 'devour', 'web',
  'drain-stat', 'grant-possession', 'drain', 'ghost',
  // charge = buff 의 *레거시 별칭*(Colorz 18-c). combat.ts 가 kind 정규화로 buff 와 동일 처리.
  // 기존 데이터(act-1 로스터/보스)에 charge:N 이 다수 남아 있어 화이트리스트에 유지한다.
  'charge',
  'add-card', 'add-card-draw', 'add-card-discard', 'add-card-hand',
  'obscure', 'cost-up', 'force-discard', 'transform-card', 'change', 'lockin',
];

/** 동적 의도 조건 플래그 — combat.ts intentConditionMet switch. (`base~flag=override`의 flag.) */
export const VALID_INTENT_FLAGS = ['feral', 'block', 'sleep', 'possession', 'unlocked', 'debuff'];

/** 락 조건 — schemas/run.ts LockCondition (combat.ts lockin case valid 목록). */
export const VALID_LOCK_CONDITIONS = ['block', 'damage', 'draw', 'no-attack', 'no-defense'];

/**
 * 상태(status) 키 — apply-status / combat-*-status / combat-start-status / debuff intent 의 status 이름.
 * 진실원: combat.ts (applyDamage 배수·decayTurnStatuses·tickPoison/Burn·applyPlayerStatusTurnStart) +
 *         item.ts CLEANSE_GROUPS + statusBonusForCardEffectKind.
 *   디버프: vulnerable/weakness/frail/poison/burn/regress/feral/feral-heavy/paralyze/spasm/
 *           ghost/sleep/slime/brainwash/imprint/possession/sap
 *   버프  : strength/dexterity
 *   이로운(버프, Colorz 18-c): regen/haste/ward/thorns/focus/resolve (combat.ts DECAYING_BUFFS)
 */
export const VALID_STATUS_KEYS = [
  'vulnerable', 'weakness', 'frail', 'poison', 'burn', 'regress', 'feral', 'feral-heavy',
  'paralyze', 'spasm', 'ghost', 'sleep', 'slime', 'brainwash', 'imprint', 'possession', 'sap',
  'strength', 'dexterity',
  // 이로운(버프) 상태 — apply-status:N:self:<key> / combat-self-status:<key>:N 로 부여.
  'regen', 'haste', 'ward', 'thorns', 'focus', 'resolve',
];

/** 8 컬러 + 메타지표(top-color/color-count) + 스탯(atk/def/mag) — boost-color/metric arg. */
export const VALID_COLORS = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];
export const VALID_METRIC_ARGS = [...VALID_COLORS, 'top-color', 'color-count', 'atk', 'def', 'mag', 'all', 'random'];

/** boost-stat arg. */
export const VALID_STAT_ARGS = ['atk', 'def', 'mag'];

// 규칙 카탈로그 — 보고/에디터 미러용. (각 규칙 ID + 한 줄 설명)
export const RULE_CATALOG = [
  ['parse', '모든 데이터 파일 파싱 성공 (INI 문법 오류 없음)'],
  ['required-fields', '섹션별 필수 필드 존재 (rank/name/slot/resource 등)'],
  ['whitelist-kind', 'effect/intent/trigger/status/flag/condition kind 가 화이트리스트에 존재 (오타·허구 스키마 차단)'],
  ['xref', '교차 참조 id 가 정의에 존재 (카드/유물/아이템/몬스터/보스/race/npc)'],
  ['dangling', '없는 id 참조 0 (enemy_pool/elite_pool/node enemy·boss/grant_*/-plus/seed/form/timeline boss)'],
  ['prose', '플레이어 노출 텍스트에 *강조*·em-dash(—)·"몬무스" 0'],
  ['balance', '(경고) 카드 등급 최소 한도·몬스터 HP 밴드 sanity'],
];

// ===========================================================================
// 4. 검증 실행기.
// ===========================================================================

/** 진단 1건. severity: 'error' | 'warn'. */
function diag(severity, rule, message, where) {
  return { severity, rule, message, where };
}

/** 프로즈 규칙 위반 검사 — 한 값에서 금지 패턴 탐지. 반환: 위반 문자열 목록. */
function prosePatternViolations(value) {
  const out = [];
  if (/\*[^*\n]+\*/.test(value)) out.push('*강조*');
  if (value.includes('—')) out.push('em-dash(—)');
  if (value.includes('몬무스')) out.push('"몬무스"');
  return out;
}

/** 플레이어 노출 prose 필드 — 이 키들의 값에 프로즈 규칙 적용. */
const PROSE_KEYS = new Set(['name', 'description', 'flavor', 'body', 'label', 'tagline', 'result_text', 'intro', 'defeat_text']);
// background.* (연표 변주)도 프로즈지만 background prefix 처리는 별도.

/**
 * 메인 검증. 옵션 dataDir = public/data 절대경로. readFile = (relPath)=>string|null (테스트 주입용).
 * 반환: { errors, warnings, diagnostics[], counts, ruleCatalog }
 */
export function validateData(dataDir, readFile) {
  const read = readFile ?? ((rel) => {
    try { return readFileSync(join(dataDir, rel), 'utf8'); } catch { return null; }
  });

  const diagnostics = [];
  const push = (d) => diagnostics.push(d);

  // ---- 4.1 모든 파일 파싱 + 섹션 병합 (loader.ts 와 동일: 같은 섹션 키 머지) ----
  const merged = {};              // section → fields
  const sectionFile = {};         // section → relPath (첫 등장)
  const sectionLine = {};         // section → 라인번호
  for (const rel of DATA_FILES) {
    const text = read(rel);
    if (text === null) {
      push(diag('error', 'parse', `파일을 읽지 못함: ${rel}`, rel));
      continue;
    }
    let parsed;
    try {
      parsed = parseIni(text);
    } catch (e) {
      push(diag('error', 'parse', `파싱 실패: ${e?.message ?? e}`, rel));
      continue;
    }
    for (const [section, fields] of Object.entries(parsed.data)) {
      if (!merged[section]) {
        merged[section] = {};
        sectionFile[section] = rel;
        sectionLine[section] = parsed.sectionLines[section];
      }
      Object.assign(merged[section], fields);
    }
  }

  const whereOf = (section) => {
    const f = sectionFile[section];
    const l = sectionLine[section];
    return f ? `${f}${l ? `:${l}` : ''} [${section}]` : `[${section}]`;
  };

  // ---- 4.2 정의 수집 (id 집합) ----
  const cardIds = new Set();
  const relicIds = new Set();
  const itemIds = new Set();
  const monsterIds = new Set();
  const bossIds = new Set();
  const raceIds = new Set();
  const npcIds = new Set();
  const eventIds = new Set();
  const equipmentIds = new Set();
  const clueIds = new Set();

  for (const section of Object.keys(merged)) {
    if (section.startsWith('card.')) cardIds.add(sectionIdSuffix(section));
    else if (section.startsWith('relic.')) relicIds.add(sectionIdSuffix(section));
    else if (section.startsWith('item.')) itemIds.add(sectionIdSuffix(section));
    else if (section.startsWith('monster.')) monsterIds.add(sectionIdSuffix(section));
    else if (section.startsWith('boss.') && !section.includes('.phase.') && !section.includes('.signature.')) bossIds.add(sectionIdSuffix(section));
    else if (section.startsWith('race.')) raceIds.add(sectionIdSuffix(section));
    else if (section.startsWith('npc.')) npcIds.add(sectionIdSuffix(section));
    else if (section.startsWith('event.') && !section.includes('.choice.')) eventIds.add(sectionIdSuffix(section));
    else if (section.startsWith('equipment.')) equipmentIds.add(sectionIdSuffix(section));
    else if (section.startsWith('clue.')) clueIds.add(sectionIdSuffix(section));
  }

  // 이벤트 customEffectId 화이트리스트 — event-effects.ts 에서 정적 추출(있으면), 없으면 빈 집합.
  const customEffectIds = extractEventCustomIds(dataDir, read);

  // ---- 4.3 프로즈 검사 (모든 섹션 prose 필드) ----
  for (const [section, fields] of Object.entries(merged)) {
    for (const [key, value] of Object.entries(fields)) {
      const isProse = PROSE_KEYS.has(key) || key.startsWith('background');
      if (!isProse) continue;
      const v = prosePatternViolations(value);
      if (v.length > 0) {
        push(diag('error', 'prose', `프로즈 금지 패턴 ${v.join(', ')} (필드 '${key}')`, whereOf(section)));
      }
    }
  }

  // ---- 4.4 카드 검증 ----
  for (const id of cardIds) {
    const f = merged[`card.${id}`];
    const w = whereOf(`card.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `카드 '${id}' name 누락`, w));
    if (!f.rank) push(diag('error', 'required-fields', `카드 '${id}' rank 누락`, w));
    else if (!VALID_RANKS.includes(f.rank)) push(diag('error', 'whitelist-kind', `카드 '${id}' 알 수 없는 rank '${f.rank}'`, w));
    if (f.source && !VALID_CARD_SOURCES.includes(f.source)) push(diag('error', 'whitelist-kind', `카드 '${id}' 알 수 없는 source '${f.source}'`, w));
    if (f.trigger && !VALID_CARD_TRIGGERS.includes(f.trigger)) push(diag('error', 'whitelist-kind', `카드 '${id}' 알 수 없는 trigger '${f.trigger}'`, w));
    if (f.element && !VALID_COLORS.includes(f.element)) push(diag('error', 'whitelist-kind', `카드 '${id}' 알 수 없는 element '${f.element}'`, w));
    // 효과 kind + apply-status status.
    for (const tok of parseList(f.effects)) {
      const parts = tok.split(':').map((s) => s.trim());
      const kind = parts[0];
      if (!kind) continue;
      if (!VALID_CARD_EFFECT_KINDS.includes(kind)) {
        push(diag('error', 'whitelist-kind', `카드 '${id}' 알 수 없는 효과 kind '${kind}'`, w));
        continue;
      }
      if (kind === 'apply-status') {
        const status = parts[3];
        if (status && !VALID_STATUS_KEYS.includes(status)) push(diag('error', 'whitelist-kind', `카드 '${id}' apply-status 알 수 없는 status '${status}'`, w));
      }
      if (kind === 'draw-if-color') {
        const color = parts[3];
        if (color && !VALID_COLORS.includes(color)) push(diag('error', 'whitelist-kind', `카드 '${id}' draw-if-color 알 수 없는 color '${color}'`, w));
      }
    }
    // upgrade_to (-plus 연결) 존재.
    if (f.upgrade_to && !cardIds.has(f.upgrade_to)) push(diag('error', 'dangling', `카드 '${id}' upgrade_to '${f.upgrade_to}' 카드 미정의`, w));
  }

  // ---- 4.5 유물 검증 ----
  for (const id of relicIds) {
    const f = merged[`relic.${id}`];
    const w = whereOf(`relic.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `유물 '${id}' name 누락`, w));
    if (!f.rank) push(diag('error', 'required-fields', `유물 '${id}' rank 누락`, w));
    else if (!VALID_RANKS.includes(f.rank)) push(diag('error', 'whitelist-kind', `유물 '${id}' 알 수 없는 rank '${f.rank}'`, w));
    if (f.source && !VALID_RELIC_SOURCES.includes(f.source)) push(diag('error', 'whitelist-kind', `유물 '${id}' 알 수 없는 source '${f.source}'`, w));
    if (f.trigger && !VALID_RELIC_TRIGGERS.includes(f.trigger)) push(diag('error', 'whitelist-kind', `유물 '${id}' 알 수 없는 trigger '${f.trigger}'`, w));
    for (const tok of parseList(f.effects)) {
      const parts = tok.split(':').map((s) => s.trim());
      const kind = parts[0];
      if (!kind) continue;
      if (!VALID_RELIC_EFFECT_KINDS.includes(kind)) {
        push(diag('error', 'whitelist-kind', `유물 '${id}' 알 수 없는 효과 kind '${kind}'`, w));
        continue;
      }
      // 일부 효과의 arg 검증.
      if (kind === 'combat-start-status') {
        const status = parts[2];
        if (status && !VALID_STATUS_KEYS.includes(status)) push(diag('error', 'whitelist-kind', `유물 '${id}' combat-start-status 알 수 없는 status '${status}'`, w));
      }
      if (kind === 'combat-start-hand-card') {
        const cardId = parts[2];
        if (cardId && !cardIds.has(cardId)) push(diag('error', 'dangling', `유물 '${id}' combat-start-hand-card 카드 '${cardId}' 미정의`, w));
      }
      if (kind === 'gain-card') {
        const cardId = parts[2];
        if (cardId && !cardIds.has(cardId)) push(diag('error', 'dangling', `유물 '${id}' gain-card 카드 '${cardId}' 미정의`, w));
      }
      if (kind === 'boost-stat') {
        const arg = parts[2];
        if (arg && !VALID_STAT_ARGS.includes(arg)) push(diag('error', 'whitelist-kind', `유물 '${id}' boost-stat 알 수 없는 arg '${arg}'`, w));
      }
      if (kind === 'boost-color') {
        const arg = parts[2];
        if (arg && !VALID_METRIC_ARGS.includes(arg)) push(diag('error', 'whitelist-kind', `유물 '${id}' boost-color 알 수 없는 arg '${arg}'`, w));
      }
    }
  }

  // ---- 4.6 아이템 검증 ----
  for (const id of itemIds) {
    const f = merged[`item.${id}`];
    const w = whereOf(`item.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `아이템 '${id}' name 누락`, w));
    if (!f.rank) push(diag('error', 'required-fields', `아이템 '${id}' rank 누락`, w));
    else if (!VALID_RANKS.includes(f.rank)) push(diag('error', 'whitelist-kind', `아이템 '${id}' 알 수 없는 rank '${f.rank}'`, w));
    if (f.category && !VALID_ITEM_CATEGORIES.includes(f.category)) push(diag('error', 'whitelist-kind', `아이템 '${id}' 알 수 없는 category '${f.category}'`, w));
    for (const tok of parseList(f.effects)) {
      const parts = tok.split(':').map((s) => s.trim());
      const kind = parts[0];
      if (!kind) continue;
      if (!VALID_ITEM_EFFECT_KINDS.includes(kind)) {
        push(diag('error', 'whitelist-kind', `아이템 '${id}' 알 수 없는 효과 kind '${kind}'`, w));
        continue;
      }
      if (kind === 'grant-card') {
        if (parts[1] && !cardIds.has(parts[1])) push(diag('error', 'dangling', `아이템 '${id}' grant-card 카드 '${parts[1]}' 미정의`, w));
      }
      if (kind === 'grant-relic') {
        if (parts[1] && !relicIds.has(parts[1])) push(diag('error', 'dangling', `아이템 '${id}' grant-relic 유물 '${parts[1]}' 미정의`, w));
      }
      if (kind === 'color-boost') {
        if (parts[1] && !VALID_COLORS.includes(parts[1])) push(diag('error', 'whitelist-kind', `아이템 '${id}' color-boost 알 수 없는 color '${parts[1]}'`, w));
      }
      if (kind === 'combat-enemy-status' || kind === 'combat-self-status') {
        if (parts[1] && !VALID_STATUS_KEYS.includes(parts[1])) push(diag('error', 'whitelist-kind', `아이템 '${id}' ${kind} 알 수 없는 status '${parts[1]}'`, w));
      }
    }
  }

  // ---- 4.7 몬스터 검증 (intent kind/flag/lock + 잡카드 add-card 참조) ----
  for (const id of monsterIds) {
    const f = merged[`monster.${id}`];
    const w = whereOf(`monster.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `몬스터 '${id}' name 누락`, w));
    validateIntentList(f.intents, w, `몬스터 '${id}'`, { cardIds, raceIds }, push);
    // card_drops 참조.
    for (const tok of parseList(f.card_drops)) {
      const cardId = tok.split(':')[0]?.trim();
      if (cardId && !cardIds.has(cardId)) push(diag('error', 'dangling', `몬스터 '${id}' card_drops 카드 '${cardId}' 미정의`, w));
    }
  }

  // ---- 4.8 보스 검증 (phase intents) ----
  for (const id of bossIds) {
    const f = merged[`boss.${id}`];
    const w = whereOf(`boss.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `보스 '${id}' name 누락`, w));
    if (f.kind && !['arc', 'boss'].includes(f.kind)) push(diag('error', 'whitelist-kind', `보스 '${id}' 알 수 없는 kind '${f.kind}'`, w));
    // arc 전용 특전 보상 dangling 검증 (에디터 validator.ts와 동일 규칙).
    for (const rid of parseList(f.arc_reward_relics)) {
      if (!relicIds.has(rid)) push(diag('error', 'dangling', `보스 '${id}' arc_reward_relics 유물 '${rid}' 미정의`, w));
    }
    for (const cid of parseList(f.arc_reward_cards)) {
      if (!cardIds.has(cid)) push(diag('error', 'dangling', `보스 '${id}' arc_reward_cards 카드 '${cid}' 미정의`, w));
    }
    for (const iid of parseList(f.arc_reward_items)) {
      if (!itemIds.has(iid)) push(diag('error', 'dangling', `보스 '${id}' arc_reward_items 아이템 '${iid}' 미정의`, w));
    }
    // phase 섹션 intents 검증.
    for (let i = 1; i <= 5; i++) {
      const pf = merged[`boss.${id}.phase.${i}`];
      if (!pf) continue;
      validateIntentList(pf.intents, whereOf(`boss.${id}.phase.${i}`), `보스 '${id}' phase ${i}`, { cardIds, raceIds }, push);
    }
    // signature intent_overrides 검증.
    for (const section of Object.keys(merged)) {
      if (!section.startsWith(`boss.${id}.signature.`)) continue;
      validateIntentList(merged[section].intent_overrides, whereOf(section), `보스 '${id}' ${section}`, { cardIds, raceIds }, push);
    }
  }

  // ---- 4.9 race 검증 (seed cards/relics, starting_deck) ----
  for (const id of raceIds) {
    const f = merged[`race.${id}`];
    const w = whereOf(`race.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `race '${id}' name 누락`, w));
    for (const cardId of parseList(f.starting_deck)) {
      if (!cardIds.has(cardId)) push(diag('error', 'dangling', `race '${id}' starting_deck 카드 '${cardId}' 미정의`, w));
    }
    for (const cardId of parseList(f.seed_cards)) {
      if (!cardIds.has(cardId)) push(diag('error', 'dangling', `race '${id}' seed_cards 카드 '${cardId}' 미정의`, w));
    }
    for (const relicId of parseList(f.seed_relics)) {
      if (!relicIds.has(relicId)) push(diag('error', 'dangling', `race '${id}' seed_relics 유물 '${relicId}' 미정의`, w));
    }
  }

  // ---- 4.10 NPC 검증 (affinity_rewards card/relic, recruit cards/relics, featured 없음) ----
  for (const id of npcIds) {
    const f = merged[`npc.${id}`];
    const w = whereOf(`npc.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `NPC '${id}' name 누락`, w));
    for (const tok of parseList(f.affinity_rewards)) {
      for (const p of tok.split(':').map((s) => s.trim())) {
        if (p.startsWith('card=') && !cardIds.has(p.slice(5))) push(diag('error', 'dangling', `NPC '${id}' affinity_rewards 카드 '${p.slice(5)}' 미정의`, w));
        else if (p.startsWith('relic=') && !relicIds.has(p.slice(6))) push(diag('error', 'dangling', `NPC '${id}' affinity_rewards 유물 '${p.slice(6)}' 미정의`, w));
      }
    }
    for (const cardId of parseList(f.recruit_cards)) {
      if (!cardIds.has(cardId)) push(diag('error', 'dangling', `NPC '${id}' recruit_cards 카드 '${cardId}' 미정의`, w));
    }
    for (const relicId of parseList(f.recruit_relics)) {
      if (!relicIds.has(relicId)) push(diag('error', 'dangling', `NPC '${id}' recruit_relics 유물 '${relicId}' 미정의`, w));
    }
  }

  // ---- 4.11 이벤트 검증 (choice grant_card/grant_relic/clue/affinity/followup/custom) ----
  for (const id of eventIds) {
    const f = merged[`event.${id}`];
    const w = whereOf(`event.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `이벤트 '${id}' name 누락`, w));
    for (const nk of parseList(f.node_kinds)) {
      if (!VALID_NODE_KINDS.includes(nk)) push(diag('error', 'whitelist-kind', `이벤트 '${id}' 알 수 없는 node_kind '${nk}'`, w));
    }
    for (const npcId of parseList(f.featured_npcs)) {
      if (!npcIds.has(npcId)) push(diag('error', 'dangling', `이벤트 '${id}' featured_npcs NPC '${npcId}' 미정의`, w));
    }
    // 선택지 섹션.
    for (let i = 1; i <= 6; i++) {
      const cf = merged[`event.${id}.choice.${i}`];
      if (!cf) continue;
      const cw = whereOf(`event.${id}.choice.${i}`);
      if (cf.grant_card && !cardIds.has(cf.grant_card)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} grant_card '${cf.grant_card}' 미정의`, cw));
      if (cf.grant_relic && !relicIds.has(cf.grant_relic)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} grant_relic '${cf.grant_relic}' 미정의`, cw));
      if (cf.clue && !clueIds.has(cf.clue)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} clue '${cf.clue}' 미정의`, cw));
      if (cf.followup && !eventIds.has(cf.followup)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} followup '${cf.followup}' 미정의`, cw));
      if (cf.affinity) {
        const npcId = cf.affinity.split(':')[0]?.trim();
        if (npcId && !npcIds.has(npcId)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} affinity NPC '${npcId}' 미정의`, cw));
      }
      if (cf.color) {
        const color = cf.color.split(':')[0]?.trim();
        if (color && !['all', 'random', ...VALID_COLORS].includes(color)) push(diag('error', 'whitelist-kind', `이벤트 '${id}' choice ${i} color '${color}' 알 수 없음`, cw));
      }
      // color_cost = water:3 — 8색만 허용(all/random은 댓가로 부적합).
      if (cf.color_cost) {
        const color = cf.color_cost.split(':')[0]?.trim();
        if (color && !VALID_COLORS.includes(color)) push(diag('error', 'whitelist-kind', `이벤트 '${id}' choice ${i} color_cost '${color}' 알 수 없음`, cw));
      }
      // lose_card = c-X — 카드 정의 존재 + has-card 게이트 동반 권장(없으면 경고).
      if (cf.lose_card) {
        if (!cardIds.has(cf.lose_card)) push(diag('error', 'dangling', `이벤트 '${id}' choice ${i} lose_card '${cf.lose_card}' 카드 미정의`, cw));
        const cond = cf.condition ?? '';
        if (!cond.includes(`has-card:${cf.lose_card}`)) push(diag('warn', 'balance', `이벤트 '${id}' choice ${i} lose_card '${cf.lose_card}' has-card 게이트 없음`, cw));
      }
      if (cf.custom && customEffectIds.size > 0 && !customEffectIds.has(cf.custom)) {
        push(diag('error', 'whitelist-kind', `이벤트 '${id}' choice ${i} custom '${cf.custom}' 미등록 (event-effects.ts)`, cw));
      }
    }
  }

  // ---- 4.12 equipment 검증 ----
  for (const id of equipmentIds) {
    const f = merged[`equipment.${id}`];
    const w = whereOf(`equipment.${id}`);
    if (!f.name) push(diag('error', 'required-fields', `장비 '${id}' name 누락`, w));
    if (!f.slot) push(diag('error', 'required-fields', `장비 '${id}' slot 누락`, w));
    else if (!VALID_EQUIPMENT_SLOTS.includes(f.slot)) push(diag('error', 'whitelist-kind', `장비 '${id}' 알 수 없는 slot '${f.slot}'`, w));
    if (!f.rank) push(diag('error', 'required-fields', `장비 '${id}' rank 누락`, w));
    else if (!VALID_RANKS.includes(f.rank)) push(diag('error', 'whitelist-kind', `장비 '${id}' 알 수 없는 rank '${f.rank}'`, w));
    for (const tok of parseList(f.color_effects)) {
      const color = tok.split(':')[0]?.trim();
      if (color && !VALID_COLORS.includes(color)) push(diag('error', 'whitelist-kind', `장비 '${id}' color_effects 알 수 없는 color '${color}'`, w));
    }
  }

  // ---- 4.13 node-map 검증 (region pool→monster, node enemy/boss/events/npcs, region specialty) ----
  for (const section of Object.keys(merged)) {
    if (!section.startsWith('nodemap.') || section.includes('.node.') || section.includes('.region.')) continue;
    const mapId = sectionIdSuffix(section);
    const prefix = `nodemap.${mapId}.`;
    for (const sub of Object.keys(merged)) {
      if (!sub.startsWith(prefix)) continue;
      const f = merged[sub];
      const w = whereOf(sub);
      if (sub.includes('.region.')) {
        for (const mid of parseList(f.enemy_pool)) if (!monsterIds.has(mid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} enemy_pool 몬스터 '${mid}' 미정의`, w));
        for (const mid of parseList(f.elite_enemy_pool)) if (!monsterIds.has(mid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} elite_enemy_pool 몬스터 '${mid}' 미정의`, w));
        for (const eid of parseList(f.event_pool)) if (!eventIds.has(eid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} event_pool 이벤트 '${eid}' 미정의`, w));
        for (const cid of parseList(f.legendary_cards)) if (!cardIds.has(cid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} legendary_cards 카드 '${cid}' 미정의`, w));
        if (f.specialty_item && !itemIds.has(f.specialty_item)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} specialty_item '${f.specialty_item}' 미정의`, w));
        if (f.primary_color && !VALID_COLORS.includes(f.primary_color)) push(diag('error', 'whitelist-kind', `맵 '${mapId}' ${sub} 알 수 없는 primary_color '${f.primary_color}'`, w));
      } else if (sub.includes('.node.')) {
        if (f.kind && !VALID_NODE_KINDS.includes(f.kind)) push(diag('error', 'whitelist-kind', `맵 '${mapId}' ${sub} 알 수 없는 kind '${f.kind}'`, w));
        if (f.enemy && !monsterIds.has(f.enemy)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} enemy '${f.enemy}' 몬스터 미정의`, w));
        if (f.boss && !bossIds.has(f.boss)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} boss '${f.boss}' 보스 미정의`, w));
        for (const eid of parseList(f.events)) if (!eventIds.has(eid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} events 이벤트 '${eid}' 미정의`, w));
        for (const nid of parseList(f.npcs)) if (!npcIds.has(nid)) push(diag('error', 'dangling', `맵 '${mapId}' ${sub} npcs NPC '${nid}' 미정의`, w));
      }
    }
  }

  // ---- 4.14 timeline 검증 (boss/race/event/npc/node_map 참조) ----
  for (const section of Object.keys(merged)) {
    if (!section.startsWith('timeline.')) continue;
    const id = sectionIdSuffix(section);
    const f = merged[section];
    const w = whereOf(section);
    if (!f.name) push(diag('error', 'required-fields', `연표 '${id}' name 누락`, w));
    if (f.boss && !bossIds.has(f.boss)) push(diag('error', 'dangling', `연표 '${id}' boss '${f.boss}' 미정의`, w));
    for (const rid of parseList(f.races)) if (!raceIds.has(rid)) push(diag('error', 'dangling', `연표 '${id}' races '${rid}' race 미정의`, w));
    for (const eid of parseList(f.events)) if (!eventIds.has(eid)) push(diag('error', 'dangling', `연표 '${id}' events '${eid}' 이벤트 미정의`, w));
    for (const nid of parseList(f.npcs)) if (!npcIds.has(nid)) push(diag('error', 'dangling', `연표 '${id}' npcs '${nid}' NPC 미정의`, w));
  }

  // ---- 4.15 meta unlock 검증 (resource + grants_*) ----
  for (const section of Object.keys(merged)) {
    if (!section.startsWith('unlock.')) continue;
    const id = sectionIdSuffix(section);
    const f = merged[section];
    const w = whereOf(section);
    const VALID_META = ['hyperion', 'insight', 'soul'];
    if (f.resource && !VALID_META.includes(f.resource)) push(diag('error', 'whitelist-kind', `해금 '${id}' 알 수 없는 resource '${f.resource}'`, w));
    for (const rid of parseList(f.grants_race)) if (!raceIds.has(rid)) push(diag('error', 'dangling', `해금 '${id}' grants_race '${rid}' 미정의`, w));
    for (const cid of parseList(f.grants_card)) if (!cardIds.has(cid)) push(diag('error', 'dangling', `해금 '${id}' grants_card '${cid}' 미정의`, w));
    for (const rid of parseList(f.grants_relic)) if (!relicIds.has(rid)) push(diag('error', 'dangling', `해금 '${id}' grants_relic '${rid}' 미정의`, w));
    for (const tid of parseList(f.grants_timeline)) {
      if (!merged[`timeline.${tid}`]) push(diag('error', 'dangling', `해금 '${id}' grants_timeline '${tid}' 미정의`, w));
    }
  }

  // ---- 4.16 (경고) 밸런스 sanity — 카드 등급 최소 한도 (validateCardBaseline 미러) ----
  const CARD_MIN_PEAK = { basic: 4, common: 6, rare: 9, legendary: 14 };
  for (const id of cardIds) {
    const f = merged[`card.${id}`];
    if (f.source !== 'race' && f.source !== 'character') continue;
    const baseline = CARD_MIN_PEAK[f.rank];
    if (baseline === undefined) continue;
    let peak = 0;
    for (const tok of parseList(f.effects)) {
      const parts = tok.split(':');
      if (['damage', 'heal', 'block'].includes(parts[0]?.trim())) {
        const v = Number(parts[1]);
        if (Number.isFinite(v)) peak = Math.max(peak, v);
      }
    }
    if (peak < baseline) push(diag('warn', 'balance', `카드 '${id}' (${f.rank}) 최소 한도 ${baseline} 미달 (peak ${peak})`, whereOf(`card.${id}`)));
  }
  // (경고) 몬스터 HP 밴드 — 0 이하 / 과도한 값 sanity.
  for (const id of monsterIds) {
    const f = merged[`monster.${id}`];
    const hp = Number(f.hp);
    if (!Number.isFinite(hp) || hp <= 0) push(diag('warn', 'balance', `몬스터 '${id}' hp 비정상 (${f.hp})`, whereOf(`monster.${id}`)));
    else if (hp > 2500) push(diag('warn', 'balance', `몬스터 '${id}' hp 과도 (${hp} > 2500)`, whereOf(`monster.${id}`)));
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warn');
  return {
    diagnostics,
    errors,
    warnings,
    counts: {
      files: DATA_FILES.length,
      cards: cardIds.size, relics: relicIds.size, items: itemIds.size,
      monsters: monsterIds.size, bosses: bossIds.size, races: raceIds.size,
      npcs: npcIds.size, events: eventIds.size, equipments: equipmentIds.size, clues: clueIds.size,
    },
    ruleCatalog: RULE_CATALOG,
  };
}

/**
 * 인텐트 리스트(콤마 구분 슬롯) 검증 — 슬롯은 `+`로 묶이고 `~flag=override` 분기 가능.
 * 각 행동 토큰의 kind 화이트리스트 + lockin condition + change formRace + add-card 카드 참조 + 분기 flag.
 */
function validateIntentList(raw, where, label, refs, push) {
  for (const slot of parseList(raw)) {
    // 분기 `base~flag=override` 분해 — flag 검증.
    const tilde = slot.indexOf('~');
    let bodyPart = slot;
    if (tilde >= 0) {
      bodyPart = slot.slice(0, tilde);
      const cond = slot.slice(tilde + 1); // "flag=override"
      const eq = cond.indexOf('=');
      const flag = eq < 0 ? cond : cond.slice(0, eq);
      if (flag && !VALID_INTENT_FLAGS.includes(flag)) {
        push(diag('error', 'whitelist-kind', `${label} 인텐트 분기 알 수 없는 flag '${flag}' (${slot})`, where));
      }
      // override(틸드 뒤)도 행동 토큰들 — `+` 묶음 검사에 포함.
      if (eq >= 0) bodyPart = `${bodyPart}+${cond.slice(eq + 1)}`;
    }
    // `+` 묶음 → 개별 행동.
    for (const action of bodyPart.split('+').map((s) => s.trim()).filter((s) => s.length > 0)) {
      const parts = action.split(':').map((s) => s.trim());
      const kind = parts[0];
      if (!kind) continue;
      if (!VALID_INTENT_KINDS.includes(kind)) {
        push(diag('error', 'whitelist-kind', `${label} 알 수 없는 인텐트 kind '${kind}' (${action})`, where));
        continue;
      }
      if (kind === 'debuff') {
        const status = parts[2];
        if (status && !VALID_STATUS_KEYS.includes(status)) push(diag('error', 'whitelist-kind', `${label} debuff 알 수 없는 status '${status}'`, where));
      }
      if (kind === 'lockin') {
        const condition = parts[1];
        if (condition && !VALID_LOCK_CONDITIONS.includes(condition)) push(diag('error', 'whitelist-kind', `${label} lockin 알 수 없는 condition '${condition}'`, where));
      }
      if (kind === 'change') {
        const formRace = parts[1];
        if (formRace && !refs.raceIds.has(formRace)) push(diag('error', 'dangling', `${label} change 변신 폼 race '${formRace}' 미정의`, where));
      }
      if (kind === 'add-card' || kind === 'add-card-draw' || kind === 'add-card-discard' || kind === 'add-card-hand') {
        const cardId = parts[1];
        if (cardId && !refs.cardIds.has(cardId)) push(diag('error', 'dangling', `${label} ${kind} 카드 '${cardId}' 미정의`, where));
      }
    }
  }
}

/**
 * event-effects.ts 에서 registerEventEffect('id', ...) 와 colorPushers/태그 루프로 생성되는 custom id 추출.
 * 정적 파일 파싱(정규식). 실패/미존재 시 빈 집합 → custom 검증 skip(false negative 방지).
 */
function extractEventCustomIds(dataDir, read) {
  const ids = new Set();
  // dataDir = .../public/data → src/systems/event-effects.ts 는 .../src/systems/...
  // read() 는 dataDir 상대이므로 직접 fs 로 src 를 읽는다(dataDir 기준 상대경로 계산).
  let text = null;
  try {
    // public/data → ../../src/systems/event-effects.ts
    text = readFileSync(join(dataDir, '..', '..', 'src', 'systems', 'event-effects.ts'), 'utf8');
  } catch {
    void read;
    return ids;
  }
  // 직접 등록: registerEventEffect('id', ...)
  for (const m of text.matchAll(/registerEventEffect\(\s*['"`]([a-z0-9-]+)['"`]/g)) ids.add(m[1]);
  for (const m of text.matchAll(/registerEventEffect\(\s*`\$\{tag\}-([a-z0-9-]+)`/g)) {
    for (const tag of ['atk', 'def', 'mag']) ids.add(`${tag}-${m[1]}`);
  }
  // colorPushers 객체 키.
  const pushBlock = /const colorPushers[^=]*=\s*{([^}]*)}/s.exec(text);
  if (pushBlock) for (const m of pushBlock[1].matchAll(/['"`]([a-z0-9-]+)['"`]\s*:/g)) ids.add(m[1]);
  return ids;
}
