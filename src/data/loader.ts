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
import type {
  Boss,
  BossIntent,
  BossPhase,
  Card,
  CardEffect,
  CardEffectKind,
  CardSource,
  CardTriggerKind,
  Character,
  EffectTarget,
  Event,
  EventChoice,
  EventChoiceEffect,
  HyperionStage,
  Monster,
  MonsterIntent,
  NodeMap,
  Node,
  NodeKind,
  Race,
  Rank,
  Relic,
  RelicEffect,
  RelicSource,
  RelicTriggerKind,
  Timeline,
} from './schemas';

const VALID_RANKS = ['basic', 'common', 'rare', 'legendary'] as const;
const VALID_NODE_KINDS = ['village', 'combat', 'event', 'elite', 'boss', 'rest', 'shop', 'workshop'] as const;

function isRank(v: string): v is Rank {
  return (VALID_RANKS as readonly string[]).includes(v);
}

function isNodeKind(v: string): v is NodeKind {
  return (VALID_NODE_KINDS as readonly string[]).includes(v);
}

/**
 * "damage:5:enemy" → CardEffect.
 * "draw:1" → CardEffect (target 생략).
 */
function parseCardEffect(token: string): CardEffect | null {
  const parts = token.split(':').map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;
  const kind = parts[0] as CardEffectKind;
  const value = parts[1] ? Number(parts[1]) : undefined;
  const target = parts[2] as EffectTarget | undefined;
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
    trigger: (f.trigger as CardTriggerKind) ?? 'manual',
    effects,
    customEffectId: f.custom_effect,
    flavor: f.flavor,
    unlockHint: f.unlock_hint,
  };
}

// ========== Relic ==========

export function parseRelics(ini: IniData, prefix = 'relic'): Map<string, Relic> {
  const result = new Map<string, Relic>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith(prefix + '.')) continue;
    const id = sectionIdSuffix(section);
    const relic = parseOneRelic(id, fields);
    if (relic) result.set(relic.id, relic);
  }
  return result;
}

function parseOneRelic(id: string, f: IniSection): Relic | null {
  const rank = f.rank as Rank;
  if (!isRank(rank)) return null;

  const effects: RelicEffect[] = parseList(f.effects).map((tok) => {
    const [kind, valueStr] = tok.split(':');
    return { kind, value: valueStr ? Number(valueStr) : undefined };
  });

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    rank,
    source: (f.source as RelicSource) ?? 'event',
    trigger: (f.trigger as RelicTriggerKind) ?? 'passive',
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
      seedCardIds: parseList(fields.seed_cards),
      seedRelicIds: parseList(fields.seed_relics),
      startHpBonus: parseNumber(fields.hp_bonus, 0),
      startMpBonus: parseNumber(fields.mp_bonus, 0),
    });
  }
  return result;
}

// ========== Character ==========

export function parseCharacters(ini: IniData): Map<string, Character> {
  const result = new Map<string, Character>();
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith('character.')) continue;
    const id = sectionIdSuffix(section);
    const ch = parseOneCharacter(id, fields, ini);
    if (ch) result.set(ch.id, ch);
  }
  return result;
}

function parseOneCharacter(id: string, f: IniSection, ini: IniData): Character | null {
  if (!f.race) return null;

  // 히페리온 5단계는 별도 섹션 [character.{id}.hyperion.1] 형태로 정의
  const stages: HyperionStage[] = [];
  for (let s = 1; s <= 5; s++) {
    const sectionName = `character.${id}.hyperion.${s}`;
    const hf = ini[sectionName];
    if (hf) {
      stages.push({
        stage: s as 1 | 2 | 3 | 4 | 5,
        requirement: hf.requirement ?? '',
        statBoost: {
          hp: parseNumber(hf.hp, 0),
          mp: parseNumber(hf.mp, 0),
          attack: parseNumber(hf.attack, 0),
          defense: parseNumber(hf.defense, 0),
          vigor: parseNumber(hf.vigor, 0),
        },
        rewardCardId: hf.reward_card,
        rewardRelicId: hf.reward_relic,
        bossSignatureId: hf.boss_signature,
      });
    } else {
      // 누락 단계는 placeholder
      stages.push({
        stage: s as 1 | 2 | 3 | 4 | 5,
        requirement: 'placeholder',
        statBoost: {},
      });
    }
  }

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    raceId: f.race,
    baseNpcId: f.base_npc,
    baseStats: {
      hp: parseNumber(f.hp, 30),
      mp: parseNumber(f.mp, 10),
      attack: parseNumber(f.attack, 5),
      defense: parseNumber(f.defense, 2),
      vigor: parseNumber(f.vigor, 10),
    },
    startingDeck: parseList(f.starting_deck),
    hyperion: stages as Character['hyperion'],
    unlockRequirement: f.unlock,
    portrait: f.portrait,
    tagline: f.tagline,
  };
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
  if (f.grant_card) eff.grantCardId = f.grant_card;
  if (f.grant_relic) eff.grantRelicId = f.grant_relic;
  if (f.affinity) {
    const [npcId, deltaStr] = f.affinity.split(':');
    eff.affinityDelta = { npcId, delta: parseNumber(deltaStr, 0) };
  }
  if (f.followup) eff.followupEventId = f.followup;
  if (f.custom) eff.customEffectId = f.custom;
  if (f.result_text) eff.resultText = f.result_text;

  if (Object.keys(eff).length > 0) effects.push(eff);

  return {
    label: f.label ?? '???',
    condition: f.condition,
    effects,
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
      hp: parseNumber(fields.hp, 15),
      attack: parseNumber(fields.attack, 5),
      defense: parseNumber(fields.defense, 0),
      intents,
      drop: {
        gold: parseNumber(fields.gold, 0),
        timeShards: parseNumber(fields.time_shards, 0),
        cardDrops: cardDrops.length > 0 ? cardDrops : undefined,
      },
      appearsIn: parseList(fields.appears_in),
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
      };
    });
    phases.push({
      startsAtHpRatio: parseNumber(pf.starts_at, i === 1 ? 1.0 : 0.5),
      intents,
    });
  }

  return {
    id,
    name: f.name ?? id,
    description: f.description,
    timelineId: f.timeline ?? '',
    hp: parseNumber(f.hp, 50),
    attack: parseNumber(f.attack, 8),
    defense: parseNumber(f.defense, 2),
    phases,
    rewards: {
      unlockKeys: parseList(f.reward_unlocks),
      soulGain: parseNumber(f.reward_soul, 5),
      grantCodexEntries: parseList(f.reward_codex),
    },
    introText: f.intro,
    defeatText: f.defeat_text,
  };
}

// ========== Node Map ==========

export function parseNodeMap(ini: IniData, id: string): NodeMap | null {
  const headerSection = `nodemap.${id}`;
  const header = ini[headerSection];
  if (!header) return null;

  const nodes: Node[] = [];
  for (const [section, fields] of Object.entries(ini)) {
    if (!section.startsWith(`nodemap.${id}.node.`)) continue;
    const nodeId = sectionIdSuffix(section.slice(headerSection.length + 1)); // node.001 → 001
    const kind = (fields.kind as NodeKind) ?? 'village';
    if (!isNodeKind(kind)) continue;
    nodes.push({
      id: nodeId,
      kind,
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
    startNodeId: header.start_node ?? nodes.find((n) => n.isStart)?.id ?? nodes[0]?.id ?? '',
    bossGateNodeId: header.boss_gate ?? nodes.find((n) => n.isBossGate)?.id ?? '',
  };
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
      availableCharacterIds: parseList(fields.characters),
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
  characters: Map<string, Character>;
  races: Map<string, Race>;
  cards: Map<string, Card>;
  relics: Map<string, Relic>;
  events: Map<string, Event>;
  bosses: Map<string, Boss>;
  monsters: Map<string, Monster>;
  nodeMaps: Map<string, NodeMap>;
}

/** MVR 단계 데이터 파일들. 이후 확장 시 파일 추가만. */
const DATA_FILES = [
  'data/timelines/peace-310.txt',
  'data/races/race-human.txt',
  'data/characters/transcendent-01.txt',
  'data/cards/cards-mvr.txt',
  'data/relics/relics-mvr.txt',
  'data/events/events-mvr.txt',
  'data/bosses/boss-shadow.txt',
  'data/monsters/mvr-monsters.txt',
  'data/node-maps/peace-310-map.txt',
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
    characters: parseCharacters(merged),
    races: parseRaces(merged),
    cards: parseCards(merged),
    relics: parseRelics(merged),
    events: parseEvents(merged),
    bosses: parseBosses(merged),
    monsters: parseMonsters(merged),
    nodeMaps,
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
    characters: parseCharacters(ini),
    races: parseRaces(ini),
    cards: parseCards(ini),
    relics: parseRelics(ini),
    events: parseEvents(ini),
    bosses: parseBosses(ini),
    monsters: parseMonsters(ini),
    nodeMaps,
  };
}
