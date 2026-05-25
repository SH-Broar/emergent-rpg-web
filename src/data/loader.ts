/**
 * 데이터 로더 — INI 텍스트를 도메인 모델로 변환.
 *
 * 분기 A (하이브리드): INI 입력 → JSON 내부 모델.
 * 각 데이터 종류별 변환 함수 + 전체 부트스트랩 loadAllData().
 *
 * INI 섹션 = 한 항목. 키 = 필드. effects/intents 등은 콤마+콜론 인코딩.
 * 예: effects = damage:5:enemy, draw:1:self
 */

import {
  fetchIni,
  parseList,
  parseNumber,
  parseBool,
  parseIni,
  type IniData,
  type IniSection,
} from './parser';
import { validateCardBaseline } from './schemas/card';
import { DEFAULT_BALANCE } from './schemas';
import type {
  AffinityReward,
  Balance,
  Boss,
  BossIntent,
  BossPhase,
  Card,
  CardEffect,
  CardEffectKind,
  CardSource,
  CardTriggerKind,
  Chaos,
  ChaosEffectKind,
  ChaosLevel,
  ChaosModifier,
  ChaosTier,
  ChaosType,
  ColorValues,
  Companion,
  CompanionBonuses,
  CompanionSkill,
  EffectTarget,
  Event,
  EventChoice,
  EventChoiceEffect,
  GiftPreference,
  Item,
  ItemEffect,
  ItemEffectKind,
  Equipment,
  EquipmentSlot,
  ColorEffect,
  Element,
  MetaResource,
  MetaUnlock,
  Monster,
  MonsterIntent,
  NodeMap,
  Node,
  NodeKind,
  Npc,
  Race,
  Rank,
  Region,
  Relic,
  RelicEffect,
  RelicSource,
  RelicTriggerKind,
  Timeline,
} from './schemas';

const VALID_RANKS = ['basic', 'common', 'rare', 'legendary'] as const;
const VALID_NODE_KINDS = ['village', 'combat', 'event', 'elite', 'boss', 'rest', 'shop', 'workshop', 'gather', 'activity'] as const;

function isRank(v: string): v is Rank {
  return (VALID_RANKS as readonly string[]).includes(v);
}

function isNodeKind(v: string): v is NodeKind {
  return (VALID_NODE_KINDS as readonly string[]).includes(v);
}

/**
 * "damage:5:enemy" → CardEffect.
 * "draw:1" → CardEffect (target 생략).
 * "apply-status:2:enemy:vulnerable" → CardEffect (4번째 토큰 = params.status).
 *   4번째 토큰이 없으면 params 미생성 — 기존 카드 호환 ('unknown' 유지).
 * "draw-if-color:2:self:wind:5" → 특수: 4번째=params.color, 5번째=params.threshold.
 *   (draw-if-color 핸들러는 params.status가 아니라 color/threshold를 읽기 때문.
 *    5번째 토큰 생략 시 핸들러 기본값 threshold=5 사용.)
 */
function parseCardEffect(token: string): CardEffect | null {
  const parts = token.split(':').map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;
  const kind = parts[0] as CardEffectKind;
  const value = parts[1] ? Number(parts[1]) : undefined;
  const target = parts[2] as EffectTarget | undefined;
  // draw-if-color 전용: 4번째=color, 5번째=threshold(선택).
  if (kind === 'draw-if-color' && parts[3]) {
    const params: Record<string, unknown> = { color: parts[3] };
    if (parts[4]) params.threshold = Number(parts[4]);
    return { kind, value, target, params };
  }
  // 4번째 토큰: apply-status의 status 이름 등 추가 파라미터.
  if (parts[3]) {
    return { kind, value, target, params: { status: parts[3] } };
  }
  return { kind, value, target };
}

/** "card.001" → "001" */
function sectionIdSuffix(section: string): string {
  const dot = section.indexOf('.');
  return dot >= 0 ? section.slice(dot + 1) : section;
}

// ========== Card ==========

export function parseCards(ini: IniData, prefix = 'card'): Map<string, Card> {
  const result = new Map<string, Card>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith(prefix + '.')) continue;
    const id = sectionIdSuffix(section);
    const card = parseOneCard(id, fields);
    if (card) result.set(card.id, card);
  }
  // 강화판 자동 연결: `c-X-plus` 카드가 존재하면 `c-X.upgradeToId`를 자동 설정.
  // 명명 규칙(`-plus` 접미사)으로 모든 카드가 강화판을 갖도록 — 데이터의 명시 upgrade_to가 우선.
  // 강화판 자신(`c-X-plus`)은 `c-X-plus-plus`가 없으므로 재강화되지 않음.
  for (const [id, card] of result) {
    if (card.upgradeToId) continue;
    const plusId = `${id}-plus`;
    if (result.has(plusId)) card.upgradeToId = plusId;
  }
  // 등급별 최소 한도 검증 — race/character 출처만. 게임 로직에 영향 X, console.warn으로 안내.
  for (const card of result.values()) {
    const v = validateCardBaseline(card);
    if (!v.ok) {
      console.warn(`[card baseline] ${card.id} (${card.name}): ${v.reason}`);
    }
  }
  return result;
}

function parseOneCard(id: string, f: IniSection): Card | null {
  const rank = f.rank as Rank;
  if (!isRank(rank)) return null;

  const effects = parseList(f.effects)
    .map(parseCardEffect)
    .filter((e): e is CardEffect => e !== null);

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    rank,
    source: (f.source as CardSource) ?? 'event',
    element: f.element as Card['element'],
    cost: parseNumber(f.cost, 1),
    unplayable: f.unplayable === 'true' ? true : undefined,
    possession: f.possession === 'true' ? true : undefined,
    possessionMax: f.possession_max !== undefined ? parseNumber(f.possession_max, 8) : undefined,
    curse: f.curse === 'true' ? true : undefined,
    trigger: (f.trigger as CardTriggerKind) ?? 'manual',
    effects,
    customEffectId: f.custom_effect,
    flavor: f.flavor,
    unlockHint: f.unlock_hint,
    upgradeToId: f.upgrade_to,
  };
}

// ========== Relic ==========

export function parseRelics(ini: IniData, prefix = 'relic'): Map<string, Relic> {
  const result = new Map<string, Relic>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith(prefix + '.')) continue;
    const id = sectionIdSuffix(section);
    const relic = parseOneRelic(id, fields);
    if (relic) {
      result.set(relic.id, relic);
      // 임시 유물 경고 — id에 '-tbd' 포함하면 차후 교체 필요.
      if (id.includes('-tbd')) {
        console.warn(`[relic] 임시 유물 '${id}' (${relic.name}) — 정식 유물로 교체 필요.`);
      }
    }
  }
  return result;
}

/**
 * 옛 데이터 호환: effect.kind / trigger 문자열을 새 modifier kind / trigger로 정규화.
 * 데이터 파일은 옛 표기(`bonus-damage`, `on-card-play`) 그대로 두고 *로더에서* 변환.
 * 단, `relic.ts`의 modifier 조회 함수도 alias를 인식하므로 옛 세이브의 직렬화된 kind도 안전.
 */
const RELIC_KIND_ALIASES: Record<string, string> = {
  'bonus-damage': 'damage-out-add',
};
const RELIC_TRIGGER_ALIASES: Record<string, RelicTriggerKind> = {
  'on-card-play': 'on-card-played-after',
};

function parseOneRelic(id: string, f: IniSection): Relic | null {
  const rank = f.rank as Rank;
  if (!isRank(rank)) return null;

  const effects: RelicEffect[] = parseList(f.effects).map((tok) => {
    const parts = tok.split(':');
    const rawKind = parts[0];
    const valueStr = parts[1];
    const kind = RELIC_KIND_ALIASES[rawKind] ?? rawKind;
    const value = valueStr ? Number(valueStr) : undefined;
    // 3·4번째 토큰: 일반 파라미터 arg/arg2.
    //  예) combat-start-status:2:frail (arg=상태), boost-color:8:fire (arg=컬러),
    //      block-from-metric:10:def (arg=지표), turn-after-strength:1:5 (arg=턴).
    if (parts[2] || parts[3]) {
      const params: Record<string, unknown> = {};
      if (parts[2]) params.arg = parts[2];
      if (parts[3]) params.arg2 = parts[3];
      return { kind, value, params };
    }
    return { kind, value };
  });

  const rawTrigger = (f.trigger as string) ?? 'passive';
  const trigger = (RELIC_TRIGGER_ALIASES[rawTrigger] ?? rawTrigger) as RelicTriggerKind;

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    rank,
    source: (f.source as RelicSource) ?? 'event',
    trigger,
    effects,
    customEffectId: f.custom_effect,
    flavor: f.flavor,
  };
}

// ========== Race ==========

export function parseRaces(ini: IniData): Map<string, Race> {
  const result = new Map<string, Race>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('race.')) continue;
    const id = sectionIdSuffix(section);
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      category: fields.category ?? 'unknown',
      primaryElement: fields.primary_element as Race['primaryElement'],
      secondaryElement: fields.secondary_element as Race['secondaryElement'],
      baseStats: {
        hp: parseNumber(fields.hp, 30),
        mp: parseNumber(fields.mp, 10),
        attack: parseNumber(fields.attack, 5),
        defense: parseNumber(fields.defense, 2),
        vigor: parseNumber(fields.vigor, 10),
      },
      startingDeck: parseList(fields.starting_deck),
      seedCardIds: parseList(fields.seed_cards),
      seedRelicIds: parseList(fields.seed_relics),
      startHpBonus: parseNumber(fields.hp_bonus, 0),
      startMpBonus: parseNumber(fields.mp_bonus, 0),
      maxLivesBonus: fields.max_lives_bonus ? parseNumber(fields.max_lives_bonus, 0) : undefined,
      deckSize: fields.deck_size ? parseNumber(fields.deck_size, 10) : undefined,
      seedColors: parseKeyNum(fields.seed_colors) as Race['seedColors'],
    });
  }
  return result;
}

// ========== Event ==========

export function parseEvents(ini: IniData): Map<string, Event> {
  const result = new Map<string, Event>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('event.')) continue;
    if (section.includes('.choice.')) continue; // 자식 섹션
    const id = sectionIdSuffix(section);
    const ev = parseOneEvent(id, fields, ini);
    if (ev) result.set(ev.id, ev);
  }
  return result;
}

function parseOneEvent(id: string, f: IniSection, ini: IniData): Event {
  // 선택지는 [event.{id}.choice.{i}] 형태로 정의
  const choices: EventChoice[] = [];
  for (let i = 1; i <= 6; i++) {
    const sectionName = `event.${id}.choice.${i}`;
    const cf = ini[sectionName];
    if (!cf) break;
    choices.push(parseChoice(cf));
  }

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    body: f.body ?? '',
    trigger: {
      nodeKinds: parseList(f.node_kinds) as Event['trigger']['nodeKinds'],
      seasons: parseList(f.seasons) as Event['trigger']['seasons'],
      unlockKey: f.unlock_key,
      oncePerRun: parseBool(f.once_per_run, true),
      weight: parseNumber(f.weight, 1),
      condition: f.condition,
    },
    choices,
    featuredNpcIds: parseList(f.featured_npcs),
  };
}

function parseChoice(f: IniSection): EventChoice {
  const effects: EventChoiceEffect[] = [];

  // 단일 효과들을 키별로 추출 (간단한 표현)
  const eff: EventChoiceEffect = {};
  if (f.hp !== undefined) eff.hpDelta = parseNumber(f.hp, 0);
  if (f.gold !== undefined) eff.goldDelta = parseNumber(f.gold, 0);
  if (f.draw !== undefined) eff.drawCards = parseNumber(f.draw, 0);
  if (f.time_shards !== undefined) eff.timeShardsDelta = parseNumber(f.time_shards, 0);
  // %기반 회복 — `heal_pct = 35|50|100`. round(maxHp×%) 회복.
  if (f.heal_pct !== undefined) eff.healPct = parseNumber(f.heal_pct, 0);
  // 컬러 보상 — `color = fire:5` | `color = all:2` | `color = random:5`.
  if (f.color) {
    const [color, amtStr] = f.color.split(':');
    eff.colorDelta = { color: (color ?? '').trim(), amount: parseNumber(amtStr, 0) };
  }
  // 컬러 댓가 — `color_cost = water:3` (색 water를 3 차감).
  if (f.color_cost) {
    const [color, amtStr] = f.color_cost.split(':');
    eff.colorCost = { color: (color ?? '').trim(), amount: parseNumber(amtStr, 0) };
  }
  // 카드 댓가 — `lose_card = c-X` (지정 카드 1장 소비, has-card 게이트 동반).
  if (f.lose_card) eff.loseCardId = f.lose_card;
  if (f.grant_card) eff.grantCardId = f.grant_card;
  if (f.grant_relic) eff.grantRelicId = f.grant_relic;
  if (f.affinity) {
    const [npcId, deltaStr] = f.affinity.split(':');
    eff.affinityDelta = { npcId, delta: parseNumber(deltaStr, 0) };
  }
  if (f.followup) eff.followupEventId = f.followup;
  if (f.custom) eff.customEffectId = f.custom;
  if (f.clue) eff.grantClueId = f.clue;
  if (f.result_text) eff.resultText = f.result_text;

  if (Object.keys(eff).length > 0) effects.push(eff);

  return {
    label: f.label ?? '???',
    condition: f.condition,
    effects,
    hidden: parseBool(f.hidden, false),
  };
}

// ========== Monster ==========

export function parseMonsters(ini: IniData): Map<string, Monster> {
  const result = new Map<string, Monster>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('monster.')) continue;
    const id = sectionIdSuffix(section);
    const intents: MonsterIntent[] = parseList(fields.intents).map((encoded) => ({
      encoded,
    }));
    const cardDrops = parseList(fields.card_drops).map((tok) => {
      const [cardId, chanceStr] = tok.split(':');
      return { cardId, chance: parseNumber(chanceStr, 0.1) };
    });
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      tier: (fields.tier as Monster['tier']) ?? 'normal',
      species: fields.species && fields.species.length > 0 ? fields.species : undefined,
      hp: parseNumber(fields.hp, 15),
      attack: parseNumber(fields.attack, 5),
      defense: parseNumber(fields.defense, 0),
      splitCount: fields.split_count !== undefined ? parseNumber(fields.split_count, 0) : undefined,
      actions: fields.actions !== undefined ? parseNumber(fields.actions, 1) : undefined,
      lockIn: fields.lock_in !== undefined ? parseNumber(fields.lock_in, 0) : undefined,
      intents,
      drop: {
        gold: parseNumber(fields.gold, 0),
        timeShards: parseNumber(fields.time_shards, 0),
        cardDrops: cardDrops.length > 0 ? cardDrops : undefined,
      },
      appearsIn: parseList(fields.appears_in),
      // 동료 영입 (Item 37-② Stage B) — recruitable 플래그 + companion 합성(NPC와 동일 companion_* 키 재사용).
      recruitable: parseBool(fields.recruitable, false) || undefined,
      companion: parseCompanion(fields),
    });
  }
  return result;
}

// ========== Boss ==========

export function parseBosses(ini: IniData): Map<string, Boss> {
  const result = new Map<string, Boss>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('boss.')) continue;
    if (section.includes('.phase.') || section.includes('.signature.')) continue;
    const id = sectionIdSuffix(section);
    result.set(id, parseOneBoss(id, fields, ini));
  }
  return result;
}

function parseOneBoss(id: string, f: IniSection, ini: IniData): Boss {
  // phase 섹션 수집
  const phases: BossPhase[] = [];
  for (let i = 1; i <= 5; i++) {
    const pf = ini[`boss.${id}.phase.${i}`];
    if (!pf) break;
    const intents: BossIntent[] = parseList(pf.intents).map((tok) => {
      const [kind, valueStr] = tok.split(':');
      return {
        kind: (kind as BossIntent['kind']) ?? 'attack',
        value: valueStr ? Number(valueStr) : undefined,
        description: tok,
        encoded: tok, // 다중 토큰 보존 — 어댑터가 그대로 combat 엔진에 전달.
      };
    });
    const mechanic = pf.mechanic as ('anchor' | 'stillness' | 'rewind' | undefined);
    phases.push({
      startsAtHpRatio: parseNumber(pf.starts_at, i === 1 ? 1.0 : 0.5),
      intents,
      mechanic: mechanic || undefined,
    });
  }

  // signature variant 섹션 수집 — [boss.{id}.signature.{signatureId}]
  const prefix = `boss.${id}.signature.`;
  const signatureVariants: import('@/data/schemas').BossSignatureVariant[] = [];
  for (const [section, sf] of Object.entries(ini)) {
    if (!section.startsWith(prefix)) continue;
    const sigId = section.slice(prefix.length);
    const overrideIntents = parseList(sf.intent_overrides).map((tok) => {
      const [kind, valueStr] = tok.split(':');
      return {
        kind: (kind as BossIntent['kind']) ?? 'attack',
        value: valueStr ? Number(valueStr) : undefined,
        description: tok,
        encoded: tok, // 다중 토큰 보존.
      };
    });
    signatureVariants.push({
      signatureId: sigId,
      dialogue: parseList(sf.dialogue),
      intentOverrides: overrideIntents.length > 0 ? overrideIntents : undefined,
    });
  }

  // arc 전용 특전 보상 — 비어 있으면 undefined(일반 보스).
  const arcRelics = parseList(f.arc_reward_relics);
  const arcCards = parseList(f.arc_reward_cards);
  const arcItems = parseList(f.arc_reward_items);
  const arcGold = f.arc_reward_gold ? parseNumber(f.arc_reward_gold, 0) : 0;
  const hasArcReward = arcRelics.length > 0 || arcCards.length > 0 || arcItems.length > 0 || arcGold > 0;

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    // kind — 'arc'면 arc 보스, 그 외(미지정 포함)는 'boss'.
    kind: f.kind === 'arc' ? 'arc' : 'boss',
    timelineId: f.timeline ?? '',
    hp: parseNumber(f.hp, 50),
    attack: parseNumber(f.attack, 8),
    defense: parseNumber(f.defense, 2),
    phases,
    signatureVariants: signatureVariants.length > 0 ? signatureVariants : undefined,
    rewards: {
      unlockKeys: parseList(f.reward_unlocks),
      soulGain: parseNumber(f.reward_soul, 5),
      grantCodexEntries: parseList(f.reward_codex),
    },
    introText: f.intro,
    defeatText: f.defeat_text,
    // arc 대화 회피 + 특전.
    dialogue: parseList(f.dialogue),
    challengeLabel: f.challenge_label,
    declineLabel: f.decline_label,
    arcReward: hasArcReward
      ? {
          relicIds: arcRelics.length > 0 ? arcRelics : undefined,
          cardIds: arcCards.length > 0 ? arcCards : undefined,
          itemIds: arcItems.length > 0 ? arcItems : undefined,
          gold: arcGold > 0 ? arcGold : undefined,
        }
      : undefined,
    // 동료화 (Item 37-② Stage B) — arc 보스 동료. companion_* 키(NPC/몬스터와 동일) 재사용.
    companion: parseCompanion(f),
  };
}

// ========== Node Map ==========

export function parseNodeMap(ini: IniData, id: string): NodeMap | null {
  const headerSection = `nodemap.${id}`;
  const header = ini[headerSection];
  if (!header) return null;

  const nodes: Node[] = [];
  const regions: Region[] = [];

  for (const [section, fields] of Object.entries(ini)) {
    // 권역 섹션: [nodemap.{id}.region.{regionId}]
    if (section.startsWith(`nodemap.${id}.region.`)) {
      const regionId = sectionIdSuffix(section.slice(headerSection.length + 1));
      // sectionIdSuffix는 첫 dot 이후를 자르는데 region.X 같은 경우 X만 와야 함.
      // section.slice(headerSection.length + 1) = "region.iluneon", sectionIdSuffix → "iluneon".
      regions.push({
        id: regionId,
        name: fields.name ?? regionId,
        description: fields.description,
        enemyPool: parseList(fields.enemy_pool),
        eliteEnemyPool: parseList(fields.elite_enemy_pool),
        eventPool: parseList(fields.event_pool),
        tier: fields.tier ? parseNumber(fields.tier, 1) : undefined,
        primaryColor: fields.primary_color as Region['primaryColor'],
        specialtyItemId: fields.specialty_item,
        gatherThreshold: fields.gather_threshold ? parseNumber(fields.gather_threshold, 80) : undefined,
        parentRegionName: fields.parent_region,
        legendaryCardIds: parseList(fields.legendary_cards),
      });
      continue;
    }
    if (!section.startsWith(`nodemap.${id}.node.`)) continue;
    const nodeId = sectionIdSuffix(section.slice(headerSection.length + 1)); // node.001 → 001
    const kind = (fields.kind as NodeKind) ?? 'village';
    if (!isNodeKind(kind)) continue;
    nodes.push({
      id: nodeId,
      kind,
      region: fields.region,
      label: fields.label ?? nodeId,
      description: fields.description,
      position: {
        x: parseNumber(fields.x, 0.5),
        y: parseNumber(fields.y, 0.5),
      },
      neighbors: parseList(fields.neighbors),
      contentRef: {
        enemyGroupId: fields.enemy,
        bossId: fields.boss,
        eventIdPool: parseList(fields.events),
        npcIdPool: parseList(fields.npcs),
      },
      isStart: parseBool(fields.is_start, false),
      isBossGate: parseBool(fields.is_boss_gate, false),
    });
  }

  return {
    id,
    name: header.name ?? id,
    description: header.description,
    nodes,
    regions,
    startNodeId: header.start_node ?? nodes.find((n) => n.isStart)?.id ?? nodes[0]?.id ?? '',
    bossGateNodeId: header.boss_gate ?? nodes.find((n) => n.isBossGate)?.id ?? '',
  };
}

// ========== NPC ==========

const COLOR_KEYS: Array<keyof ColorValues> = [
  'fire',
  'water',
  'electric',
  'iron',
  'earth',
  'wind',
  'light',
  'dark',
];

/** legacy colorValues "0.3,0.5,..." (8개) → ColorValues. 8개 미만이면 0으로 채움. */
function parseColorValues(raw: string | undefined): ColorValues | undefined {
  if (!raw) return undefined;
  const nums = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
  if (nums.length === 0) return undefined;
  const cv = {} as ColorValues;
  for (let i = 0; i < COLOR_KEYS.length; i++) {
    cv[COLOR_KEYS[i]] = Number.isFinite(nums[i]) ? nums[i] : 0;
  }
  return cv;
}

/** colorValues에서 최댓값 원소를 signatureElement로 추출. */
function pickSignatureElement(cv: ColorValues | undefined): keyof ColorValues | undefined {
  if (!cv) return undefined;
  let bestKey: keyof ColorValues = 'fire';
  let bestVal = -Infinity;
  for (const k of COLOR_KEYS) {
    if (cv[k] > bestVal) {
      bestVal = cv[k];
      bestKey = k;
    }
  }
  return bestKey;
}

/** "1:c-strike:3" → AffinityReward(threshold=1, rewardCardId=c-strike, gaugeBoost=3) */
function parseAffinityReward(token: string): AffinityReward | null {
  const parts = token.split(':').map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;
  const threshold = Number(parts[0]);
  if (!Number.isFinite(threshold)) return null;
  const reward: AffinityReward = { threshold };
  const tail = parts.slice(1);
  for (const p of tail) {
    if (p.startsWith('card=')) reward.rewardCardId = p.slice(5);
    else if (p.startsWith('relic=')) reward.rewardRelicId = p.slice(6);
    else if (p.startsWith('gauge=')) reward.gaugeBoost = Number(p.slice(6));
    else if (p.startsWith('hint=')) reward.hint = p.slice(5);
    else if (p.startsWith('color=')) {
      // 형식: color=fire:5  → colorBoost { color: 'fire', value: 5 }
      const body = p.slice(6);
      const sep = body.indexOf(':');
      if (sep > 0) {
        reward.colorBoost = {
          color: body.slice(0, sep),
          value: Number(body.slice(sep + 1)),
        };
      }
    }
    else if (p.startsWith('specialty=')) reward.grantSpecialtyRegionId = p.slice(10);
    else if (p === 'rare-material') reward.grantRareMaterial = true;
  }
  return reward;
}

/** "weakness:1, all:1" → { weakness:1, all:1 }. 빈 입력이면 undefined. */
function parseKeyNum(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  const out: Record<string, number> = {};
  for (const tok of parseList(raw)) {
    const [k, v] = tok.split(':').map((s) => s.trim());
    if (!k) continue;
    out[k] = Number(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * NPC 섹션의 recruit_* 패시브 필드 → CompanionBonuses(축소판: 4종 패시브만).
 * Item 37-② Stage A: 영입 1회 보너스(deck/cards/relics/colors)는 제거 — 더 이상 파싱하지 않는다.
 * (데이터 파일에 옛 필드가 남아 있어도 무시되므로 안전.)
 */
function parseRecruitBonuses(f: IniSection): CompanionBonuses | undefined {
  if (!parseBool(f.recruit_enabled, false)) return undefined;
  const statusResist = parseKeyNum(f.recruit_status_resist);
  const combatStartRaw = parseKeyNum(f.recruit_combat_start);
  const perTurnRaw = parseKeyNum(f.recruit_per_turn);
  const rewardRaw = parseKeyNum(f.recruit_reward_mul);
  const combatStart = combatStartRaw
    ? { block: combatStartRaw.block, strength: combatStartRaw.strength, draw: combatStartRaw.draw }
    : undefined;
  const perTurn = perTurnRaw ? { heal: perTurnRaw.heal, block: perTurnRaw.block } : undefined;
  const rewardMul = rewardRaw
    ? { gold: rewardRaw.gold, shards: rewardRaw.shards, gather: rewardRaw.gather }
    : undefined;
  return { statusResist, combatStart, perTurn, rewardMul };
}

/**
 * NPC 섹션 → 통합 Companion 정의 (Item 37-② Stage A).
 *
 * 우선순위:
 *   1) `companion_kind` 가 명시되면 그 타입으로 파싱(신규 스키마).
 *      - skill : companion_skill_name / companion_skill_cooldown / companion_skill_effects(+desc/target).
 *      - card  : companion_card_ids.
 *      - passive: companion_passive_* 또는 recruit_* 폴백.
 *   2) `companion_kind` 가 없고 recruit_enabled=true 면 *legacy passive*로 합성.
 * 어느 쪽도 아니면 undefined(영입 불가).
 */
function parseCompanionSkill(f: IniSection): CompanionSkill | undefined {
  const name = f.companion_skill_name;
  if (!name) return undefined;
  const effects: CardEffect[] = parseList(f.companion_skill_effects)
    .map(parseCardEffect)
    .filter((e): e is CardEffect => e !== null);
  return {
    name,
    cooldown: parseNumber(f.companion_skill_cooldown, 3),
    description: f.companion_skill_desc,
    effects,
    target: f.companion_skill_target as EffectTarget | undefined,
  };
}

function parseCompanion(f: IniSection): Companion | undefined {
  const kind = f.companion_kind as Companion['kind'] | undefined;
  if (kind === 'skill') {
    const skill = parseCompanionSkill(f);
    if (!skill) return undefined;
    return { kind: 'skill', skill };
  }
  if (kind === 'card') {
    const cardIds = parseList(f.companion_card_ids);
    return { kind: 'card', cardIds: cardIds.length > 0 ? cardIds : undefined };
  }
  // passive (명시 'passive' 또는 legacy recruit 폴백).
  const passive = parseRecruitBonuses(f);
  if (kind === 'passive') {
    return { kind: 'passive', passive: passive ?? {} };
  }
  // kind 미지정 + recruit_enabled=true → legacy passive 동료.
  if (passive) return { kind: 'passive', passive };
  return undefined;
}

function parseGiftPrefs(f: IniSection): GiftPreference | undefined {
  const loved = parseList(f.gift_loved);
  const liked = parseList(f.gift_liked);
  const disliked = parseList(f.gift_disliked);
  if (loved.length + liked.length + disliked.length === 0) return undefined;
  return {
    loved: loved.length > 0 ? loved : undefined,
    liked: liked.length > 0 ? liked : undefined,
    disliked: disliked.length > 0 ? disliked : undefined,
  };
}

// ========== Item ==========

/** "heal:10" | "color-boost:fire:10" | "grant-card:c-strike" → ItemEffect. */
function parseItemEffect(token: string): ItemEffect | null {
  const parts = token.split(':').map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;
  const kind = parts[0] as ItemEffectKind;
  // color-boost와 grant-* 등은 param이 *문자열*(예: 'fire' / 'c-strike').
  // 나머지는 value가 숫자 (예: heal:10).
  if (kind === 'color-boost') {
    return { kind, param: parts[1], value: parts[2] ? Number(parts[2]) : 0 };
  }
  if (kind === 'grant-card' || kind === 'grant-relic') {
    return { kind, param: parts[1] };
  }
  // cleanse-group:GROUP — param이 그룹명 문자열('low'|'mid'|'high'|'all').
  if (kind === 'cleanse-group') {
    return { kind, param: parts[1] ?? 'all' };
  }
  if (kind === 'teleport-village' || kind === 'cleanse-transform' || kind === 'combat-free-grapple') {
    return { kind };
  }
  // 전투 status 부여 — param:value (예: combat-enemy-status:vulnerable:2).
  if (kind === 'combat-enemy-status' || kind === 'combat-self-status') {
    return { kind, param: parts[1], value: parts[2] ? Number(parts[2]) : 1 };
  }
  // heal / gold / time-shards / color-all / combat-mana / combat-draw / combat-block
  return { kind, value: parts[1] ? Number(parts[1]) : 0 };
}

export function parseItems(ini: IniData): Map<string, Item> {
  const result = new Map<string, Item>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('item.')) continue;
    const id = sectionIdSuffix(section);
    const rank = fields.rank as Rank;
    if (!isRank(rank)) continue;
    const effects = parseList(fields.effects)
      .map(parseItemEffect)
      .filter((e): e is ItemEffect => e !== null);
    // 옛 별칭 'rare-material' → 'material' 정규화(데이터 파일은 그대로 둬도 안전).
    const rawCat = fields.category;
    const category = (rawCat === 'rare-material' ? 'material' : rawCat ?? 'consumable') as Item['category'];
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      rank,
      category,
      combat: fields.combat === 'true' ? true : undefined,
      effects,
      consumable: parseBool(fields.consumable, true),
      flavor: fields.flavor,
      regionId: fields.region_id,
    });
  }
  return result;
}

// ========== NPC ==========

export function parseNpcs(ini: IniData): Map<string, Npc> {
  const result = new Map<string, Npc>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('npc.')) continue;
    const id = sectionIdSuffix(section);
    const cv = parseColorValues(fields.color_values);
    const sigEl = pickSignatureElement(cv);
    const affinityRewards = parseList(fields.affinity_rewards)
      .map(parseAffinityReward)
      .filter((r): r is AffinityReward => r !== null);
    // 연표별 배경 변주 수집 — `background.<timelineId> = ...` 키.
    const backgroundByTimeline: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      const m = /^background\.(.+)$/.exec(k);
      if (m && v) backgroundByTimeline[m[1]] = v;
    }
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      raceId: fields.race ?? 'human',
      role: fields.role ?? 'Villager',
      homeNodeId: fields.home_node,
      presenceNodeIds: parseList(fields.presence_nodes),
      age: fields.age !== undefined ? parseNumber(fields.age, 0) : undefined,
      colorValues: cv,
      domainHigh: parseList(fields.domain_high),
      domainLow: parseList(fields.domain_low),
      background: fields.background,
      backgroundByTimeline: Object.keys(backgroundByTimeline).length > 0 ? backgroundByTimeline : undefined,
      affinityRewards: affinityRewards.length > 0 ? affinityRewards : undefined,
      giftPrefs: parseGiftPrefs(fields),
      tags: parseList(fields.tags),
      signatureElement: sigEl,
      tagline: fields.tagline,
      portrait: fields.portrait,
      recruit: parseRecruitBonuses(fields),
      companion: parseCompanion(fields),
    });
  }
  return result;
}

// ========== Timeline ==========

export function parseTimelines(ini: IniData): Map<string, Timeline> {
  const result = new Map<string, Timeline>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('timeline.')) continue;
    const id = sectionIdSuffix(section);
    const thresholds = parseList(fields.deck_expansion).map((s) => Number(s));
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      year: parseNumber(fields.year, 0),
      era: fields.era,
      nodeMapId: fields.node_map ?? '',
      availableEventIds: parseList(fields.events),
      availableRaceIds: parseList(fields.races),
      availableNpcIds: parseList(fields.npcs),
      timeLimit: parseNumber(fields.time_limit, 15),
      deckExpansionThresholds: [
        thresholds[0] ?? 5,
        thresholds[1] ?? 10,
      ],
      bossId: fields.boss ?? '',
      missionGoal: fields.mission_goal ?? '',
      unlockRequirement: fields.unlock,
      isShareable: parseBool(fields.shareable, true),
      thumbnail: fields.thumbnail,
      tagline: fields.tagline,
    });
  }
  return result;
}

// ========== 통합 로딩 ==========

/** 게임 시작 시 한 번 호출되는 데이터 부트스트랩. */
export interface GameData {
  timelines: Map<string, Timeline>;
  races: Map<string, Race>;
  cards: Map<string, Card>;
  relics: Map<string, Relic>;
  events: Map<string, Event>;
  bosses: Map<string, Boss>;
  monsters: Map<string, Monster>;
  nodeMaps: Map<string, NodeMap>;
  npcs: Map<string, Npc>;
  items: Map<string, Item>;
  equipments: Map<string, Equipment>;
  /** 레거시 r4 카오스 placeholder (name/description/affectsMeta 토글). */
  chaos: Map<string, ChaosModifier>;
  /** 신규 도전-점수 카오스 정의 (Phase A). */
  chaosDefs: Map<string, Chaos>;
  clues: Map<string, import('@/data/schemas').Clue>;
  unlocks: Map<string, MetaUnlock>;
  /** 상점·공방 밸런스 튜닝 (config/balance.txt). 누락 시 DEFAULT_BALANCE. */
  balance: Balance;
}

// ========== Balance (상점/공방 튜닝) ==========

export function parseBalance(ini: IniData): Balance {
  const f = ini['config.balance'] ?? {};
  const n = (v: string | undefined, d: number) => parseNumber(v, d);
  return {
    shopCardPriceBasic: n(f.shop_card_price_basic, DEFAULT_BALANCE.shopCardPriceBasic),
    shopCardPriceCommon: n(f.shop_card_price_common, DEFAULT_BALANCE.shopCardPriceCommon),
    shopCardPriceRare: n(f.shop_card_price_rare, DEFAULT_BALANCE.shopCardPriceRare),
    shopCardPriceLegendary: n(f.shop_card_price_legendary, DEFAULT_BALANCE.shopCardPriceLegendary),
    shopRelicPriceBasic: n(f.shop_relic_price_basic, DEFAULT_BALANCE.shopRelicPriceBasic),
    shopRelicPriceCommon: n(f.shop_relic_price_common, DEFAULT_BALANCE.shopRelicPriceCommon),
    shopRelicPriceRare: n(f.shop_relic_price_rare, DEFAULT_BALANCE.shopRelicPriceRare),
    shopRelicPriceLegendary: n(f.shop_relic_price_legendary, DEFAULT_BALANCE.shopRelicPriceLegendary),
    shopCardRemovalPrice: n(f.shop_card_removal_price, DEFAULT_BALANCE.shopCardRemovalPrice),
    shopNumCards: n(f.shop_num_cards, DEFAULT_BALANCE.shopNumCards),
    shopNumRelics: n(f.shop_num_relics, DEFAULT_BALANCE.shopNumRelics),
    shopMaterialCommonPrice: n(f.shop_material_common_price, DEFAULT_BALANCE.shopMaterialCommonPrice),
    shopMaterialCommonStock: n(f.shop_material_common_stock, DEFAULT_BALANCE.shopMaterialCommonStock),
    upgradeCostShards: n(f.upgrade_cost_shards, DEFAULT_BALANCE.upgradeCostShards),
    upgradeRareCostShards: n(f.upgrade_rare_cost_shards, DEFAULT_BALANCE.upgradeRareCostShards),
    upgradeLegendaryCostShards: n(f.upgrade_legendary_cost_shards, DEFAULT_BALANCE.upgradeLegendaryCostShards),
    forgePriceShards: n(f.forge_price_shards, DEFAULT_BALANCE.forgePriceShards),
    legendaryCostShards: n(f.legendary_cost_shards, DEFAULT_BALANCE.legendaryCostShards),
    forgeNumOffers: n(f.forge_num_offers, DEFAULT_BALANCE.forgeNumOffers),
    potionCommonCostShards: n(f.potion_common_cost_shards, DEFAULT_BALANCE.potionCommonCostShards),
    potionRareCostShards: n(f.potion_rare_cost_shards, DEFAULT_BALANCE.potionRareCostShards),
  };
}

// ========== Clue ==========

export function parseClues(ini: IniData): Map<string, import('@/data/schemas').Clue> {
  const result = new Map<string, import('@/data/schemas').Clue>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('clue.')) continue;
    const id = sectionIdSuffix(section);
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      body: fields.body ?? '',
      source: fields.source,
    });
  }
  return result;
}

// ========== Equipment ==========

const VALID_EQUIPMENT_SLOTS = ['weapon', 'chest', 'accessory'] as const;
function isEquipmentSlot(v: string): v is EquipmentSlot {
  return (VALID_EQUIPMENT_SLOTS as readonly string[]).includes(v);
}

export function parseEquipments(ini: IniData, prefix = 'equipment'): Map<string, Equipment> {
  const result = new Map<string, Equipment>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith(prefix + '.')) continue;
    const id = sectionIdSuffix(section);
    const eq = parseOneEquipment(id, fields);
    if (eq) result.set(eq.id, eq);
  }
  return result;
}
function parseOneEquipment(id: string, f: IniSection): Equipment | null {
  const slot = f.slot;
  if (!slot || !isEquipmentSlot(slot)) return null;
  const rank = f.rank;
  if (!rank || !isRank(rank)) return null;
  const colorEffects: ColorEffect[] = parseList(f.color_effects ?? '')
    .map((tok) => {
      const [color, valStr] = tok.split(':').map((s) => s.trim());
      if (!color || !valStr) return null;
      const value = Number(valStr);
      if (Number.isNaN(value)) return null;
      return { color: color as Element, value };
    })
    .filter((e): e is ColorEffect => e !== null);
  return {
    id,
    name: f.name ?? id,
    description: f.description,
    slot,
    rank,
    colorEffects,
    flavor: f.flavor,
  };
}

// ========== Chaos (r4) ==========

/**
 * 카오스 modifier 데이터 — 매 런 단위 토글 가능한 특수 기능 정의.
 * INI 섹션 [chaos.<id>]. r4에서는 이름/설명/메타영향 토글까지만 데이터화.
 * 효과 표현은 다음 라운드 — modifier kind/value 도입 시 확장.
 */
export function parseChaos(ini: IniData): Map<string, ChaosModifier> {
  const result = new Map<string, ChaosModifier>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('chaos.')) continue;
    const id = sectionIdSuffix(section);
    // 신규 도전-점수 카오스(ch-*)는 별도 시스템(parseChaosDefs) 소유 — 레거시 파서는 건너뜀.
    if (id.startsWith('ch-')) continue;
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description ?? '',
      unlockKey: fields.unlock_key && fields.unlock_key.length > 0 ? fields.unlock_key : undefined,
      affectsMeta: parseBool(fields.affects_meta, false),
    });
  }
  return result;
}

// ========== Chaos (도전-점수 시스템 — Phase A) ==========

const VALID_CHAOS_TIERS = [1, 2, 3, 4] as const;
function asChaosTier(v: number): ChaosTier {
  return (VALID_CHAOS_TIERS as readonly number[]).includes(v) ? (v as ChaosTier) : 1;
}

const VALID_CHAOS_TYPES = ['numeric', 'binary', 'start-hp', 'legend'] as const;
function asChaosType(v: string): ChaosType {
  return (VALID_CHAOS_TYPES as readonly string[]).includes(v) ? (v as ChaosType) : 'binary';
}

/**
 * `levels` 한 항목 → { param, score }.
 * 형식: `<param>:<score>` — *마지막 콜론*에서 분리한다(param 안에 콜론이 있어도 안전).
 *   예) '0.20:2'                          → param '0.20',  score 2
 *   예) '-0.5:2' / 'hp1:3'                → param '-0.5',  score 2
 *   예) 'c-junk-curse=1;c-junk-blank=5:4' → param 'c-junk-curse=1;c-junk-blank=5', score 4
 *       (start-inject-card는 카드쌍을 ';'로, 개수를 '='로 인코딩 — levels 콤마/콜론과 무충돌.)
 */
function parseChaosLevel(token: string): ChaosLevel | null {
  const t = token.trim();
  if (!t) return null;
  const lastColon = t.lastIndexOf(':');
  if (lastColon < 0) return { param: t, score: 1 }; // 점수 누락 폴백 = 1점.
  const param = t.slice(0, lastColon).trim();
  const score = Number(t.slice(lastColon + 1).trim());
  return { param, score: Number.isFinite(score) ? score : 1 };
}

/**
 * 신규 도전-점수 카오스 정의 — INI 섹션 [chaos.ch-*] (id가 `ch-`로 시작).
 * 레거시 r4 ChaosModifier(parseChaos)와 별개. snake_case → camelCase 파싱.
 *
 * 키: name, description, tier, category, chaos_type, effect_kind, levels.
 *   levels = `param:score, param:score, ...` (콤마 구분, 강도 순서).
 */
export function parseChaosDefs(ini: IniData): Map<string, Chaos> {
  const result = new Map<string, Chaos>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('chaos.')) continue;
    const id = sectionIdSuffix(section);
    // 신규 시스템은 `ch-` 접두만 소유 — 레거시 c-* placeholder는 건너뜀.
    if (!id.startsWith('ch-')) continue;
    const levels: ChaosLevel[] = parseList(fields.levels)
      .map(parseChaosLevel)
      .filter((l): l is ChaosLevel => l !== null);
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description ?? '',
      tier: asChaosTier(parseNumber(fields.tier, 1)),
      category: fields.category ?? 'misc',
      chaosType: asChaosType(fields.chaos_type ?? 'binary'),
      effectKind: (fields.effect_kind ?? 'enemy-hp-mul') as ChaosEffectKind,
      levels,
    });
  }
  return result;
}

// ========== Meta Unlock ==========

const VALID_META_RESOURCES = ['hyperion', 'insight', 'soul'] as const;
function isMetaResource(v: string): v is MetaResource {
  return (VALID_META_RESOURCES as readonly string[]).includes(v);
}

/**
 * 메타 해금 항목 — INI 섹션 [unlock.<id>].
 * resource(hyperion|insight|soul) + cost + grants_* (콤마 구분 id).
 * resource가 유효하지 않으면 해당 항목은 건너뜀.
 */
export function parseUnlocks(ini: IniData): Map<string, MetaUnlock> {
  const result = new Map<string, MetaUnlock>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('unlock.')) continue;
    const id = sectionIdSuffix(section);
    const resource = fields.resource ?? '';
    if (!isMetaResource(resource)) {
      console.warn(`[unlock] '${id}' — 알 수 없는 resource '${resource}', 건너뜀.`);
      continue;
    }
    const grantsRaceIds = parseList(fields.grants_race);
    const grantsCardIds = parseList(fields.grants_card);
    const grantsRelicIds = parseList(fields.grants_relic);
    const grantsTimelineIds = parseList(fields.grants_timeline);
    result.set(id, {
      id,
      name: fields.name ?? id,
      description: fields.description,
      resource,
      cost: parseNumber(fields.cost, 0),
      grantsRaceIds: grantsRaceIds.length > 0 ? grantsRaceIds : undefined,
      grantsCardIds: grantsCardIds.length > 0 ? grantsCardIds : undefined,
      grantsRelicIds: grantsRelicIds.length > 0 ? grantsRelicIds : undefined,
      grantsTimelineIds: grantsTimelineIds.length > 0 ? grantsTimelineIds : undefined,
    });
  }
  return result;
}

/** 데이터 파일들. 이후 확장 시 파일 추가만. */
const DATA_FILES = [
  // === 1장 (제 4시대 61년) — main 연표 ===
  'data/timelines/act-1-era4-061.txt',
  'data/node-maps/act-1-map.txt',
  'data/bosses/act-1-boss.txt',
  // === arc 보스 3종 (작업 29) — 던·티프레·타마모 (kind='arc'). 강 엘리트 승격, 런 도중 보스 프레임. ===
  'data/bosses/act-1-arc.txt',
  'data/npcs/act-1-iluneon.txt',
  'data/npcs/act-1-stray.txt',
  'data/npcs/act-1-windfall.txt',
  'data/npcs/act-1-luna.txt',
  'data/npcs/act-1-mosswood.txt',
  'data/npcs/act-1-tacomi.txt',
  'data/npcs/act-1-manonickla.txt',
  'data/npcs/act-1-alimes.txt',
  'data/npcs/act-1-martin.txt',
  'data/npcs/act-1-enicham.txt',
  'data/npcs/act-1-triflower.txt',
  'data/npcs/act-1-falcon.txt',
  'data/npcs/act-1-tradepost.txt',
  'data/npcs/act-1-diropel.txt',
  'data/npcs/act-1-coral.txt',
  'data/npcs/act-1-mythicbeast.txt',
  // === 공용 ===
  'data/races/race-human.txt',
  'data/races/race-moth.txt',
  'data/races/race-phantom.txt',
  'data/races/race-arcana.txt',
  // 변신 폼 race (Stage 5) — timeline available_race_ids에 없어 선택 화면 미노출.
  'data/races/race-form-fox.txt',
  'data/cards/cards-mvr.txt',
  // === 종족 전용 시작 카드 (2026-05-22) — source=race, 시작 덱 전용(상점/이벤트 풀 제외). ===
  'data/cards/cards-race.txt',
  // === 잡카드 (Stage 2 몬스터 교란) — 상처/저주/빈. 전투 종료 시 소멸. ===
  'data/cards/junk-cards.txt',
  // === 변신 폼 카드 (Stage 5 체인지/TSF) — source=form, 풀 제외. 변신 시에만 덱 등장. ===
  'data/cards/transform-forms.txt',
  // === 빙의 카드 (재설계) — source=possession, 풀 제외. 빙의로만 획득, 각성 시 축복/저주로 변신. ===
  'data/cards/cards-possession.txt',
  // === arc 보스 시그니처 카드 (작업 29) — rank=legendary + source=boss, arc 승리 자동 드롭 전용(일반 풀 제외). ===
  'data/cards/cards-arc.txt',
  'data/relics/relics-mvr.txt',
  // === 종족 시그니처 유물 (2026-05-22) — source=race, 시작 전용(상점/드롭 풀 제외). ===
  'data/relics/relics-race.txt',
  // === 유물 2차 확장 (2026-05-21) — 컬러·스탯·턴·아이템·획득즉시 가족. ===
  'data/relics/relics-color.txt',
  'data/relics/relics-stat.txt',
  'data/relics/relics-turn.txt',
  'data/relics/relics-acquire.txt',
  'data/relics/relics-combat.txt',
  'data/relics/relics-cmech.txt',
  // === 활동(주사위) 유물 (2026-05-22) — 성공률/보상/추가 활동권. trigger=passive(조회형). ===
  'data/relics/relics-activity.txt',
  // === arc 보스 시그니처 유물 (작업 29) — source=boss, arc 승리 자동 드롭 전용(상점/엘리트 풀 제외). ===
  'data/relics/relics-arc.txt',
  'data/events/events-mvr.txt',
  'data/events/act-1-region-events.txt',
  // 필러 사건 (2026-05-22) — 반복형·조건無. 사건 노드 빈노드 폴백 + 컬러 보상 다양성.
  'data/events/events-filler.txt',
  // 지속 요소 사건 (2026-05-23) — 2일차+(condition day>=2) 축복·방울표식·드래곤화. tier2+ 권역 풀에 배선.
  'data/events/events-persistent.txt',
  // 빙의 획득 사건 (2026-05-23) — day>=2, grant-possession/grant-possession-guardian. tier2+ 권역 풀에 배선.
  'data/events/events-possession.txt',
  'data/monsters/mvr-monsters.txt',
  // 구 38종(act-1-region-monsters.txt)은 특별 기믹 없는 attack/defend류라 로스터 v2로 전면 대체 후 삭제됨(2026-05-25).
  // === 몬스터 로스터 v2 (Stage 3, 2026-05-21) — 권역별 ~147종, 지리 4티어 HP + 종족 기믹. ===
  'data/monsters/act-1-roster-t1.txt',
  'data/monsters/act-1-roster-t2.txt',
  'data/monsters/act-1-roster-t3.txt',
  'data/monsters/act-1-roster-t4.txt',
  'data/items/act-1-items.txt',
  // === arc 보스 시그니처 아이템 (작업 29) — rank=legendary 전투 포션, arc 승리 자동 드롭 전용(공방/마을 제작 풀 제외). ===
  'data/items/act-1-arc-items.txt',
  'data/equipment/equipment-mvr.txt',
  // === 카오스 (r4) — 매 런 단위 토글 가능한 특수 기능 (레거시 placeholder). ===
  'data/chaos/chaos-mvr.txt',
  // === 카오스 도전-점수 시스템 (Phase A) — [chaos.ch-*] 정의. ===
  'data/chaos/act-chaos.txt',
  // === 단서 (2026-05-19) — 간접 스토리 + 조건부 chain. ===
  'data/clues/act-1-clues.txt',
  // === 메타 해금 (A단계) — 자원 소비 투자 카탈로그. ===
  'data/meta/unlocks.txt',
  // === 밸런스 설정 — 상점/공방 가격·슬롯·제작비 (RPGEditor 편집). ===
  'data/config/balance.txt',
  // === peace-310 (MVR) — 파일은 학습용으로 보존, 로딩에서는 제외. ===
  // 'data/timelines/peace-310.txt',
  // 'data/node-maps/peace-310-map.txt',
  // 'data/bosses/boss-shadow.txt',
  // 'data/characters/transcendent-01.txt',
] as const;

/** 모든 데이터 fetch + 파싱 + 통합. baseUrl 생략 시 Vite의 BASE_URL 사용. */
export async function loadAllData(baseUrl?: string): Promise<GameData> {
  // BASE_URL은 vite의 base 설정 ('/emergent-rpg-web/' 등). 항상 '/'로 끝나거나 './'.
  const base = baseUrl ?? import.meta.env.BASE_URL ?? '/';

  // 모든 파일 병렬 fetch
  const inis = await Promise.all(
    DATA_FILES.map(async (path) => {
      const url = base.endsWith('/') ? base + path : base + '/' + path;
      try {
        return await fetchIni(url);
      } catch (err) {
        console.warn(`[loader] failed to load ${url}:`, err);
        return {};
      }
    }),
  );

  // 모든 INI를 하나로 병합 (섹션 이름이 충돌하지 않도록 prefix로 분리되어 있음)
  const merged: IniData = {};
  for (const ini of inis) {
    for (const [section, fields] of Object.entries(ini)) {
      merged[section] = { ...(merged[section] ?? {}), ...fields };
    }
  }

  // 노드 맵: 여러 맵이 있을 수 있음 — 헤더 섹션을 찾아 각각 파싱
  const nodeMaps = new Map<string, NodeMap>();
  for (const section of Object.keys(merged)) {
    if (section.startsWith('nodemap.') && !section.includes('.node.')) {
      const id = sectionIdSuffix(section);
      const map = parseNodeMap(merged, id);
      if (map) nodeMaps.set(id, map);
    }
  }

  return {
    timelines: parseTimelines(merged),
    races: parseRaces(merged),
    cards: parseCards(merged),
    relics: parseRelics(merged),
    events: parseEvents(merged),
    bosses: parseBosses(merged),
    monsters: parseMonsters(merged),
    nodeMaps,
    npcs: parseNpcs(merged),
    items: parseItems(merged),
    equipments: parseEquipments(merged),
    chaos: parseChaos(merged),
    chaosDefs: parseChaosDefs(merged),
    clues: parseClues(merged),
    unlocks: parseUnlocks(merged),
    balance: parseBalance(merged),
  };
}

/** 테스트용: 문자열 입력 직접 파싱 (네트워크 없이). */
export function loadFromText(text: string): GameData {
  const ini = parseIni(text);
  const nodeMaps = new Map<string, NodeMap>();
  for (const section of Object.keys(ini)) {
    if (section.startsWith('nodemap.') && !section.includes('.node.')) {
      const id = sectionIdSuffix(section);
      const map = parseNodeMap(ini, id);
      if (map) nodeMaps.set(id, map);
    }
  }
  return {
    timelines: parseTimelines(ini),
    races: parseRaces(ini),
    cards: parseCards(ini),
    relics: parseRelics(ini),
    events: parseEvents(ini),
    bosses: parseBosses(ini),
    monsters: parseMonsters(ini),
    nodeMaps,
    npcs: parseNpcs(ini),
    items: parseItems(ini),
    equipments: parseEquipments(ini),
    chaos: parseChaos(ini),
    chaosDefs: parseChaosDefs(ini),
    clues: parseClues(ini),
    unlocks: parseUnlocks(ini),
    balance: parseBalance(ini),
  };
}
