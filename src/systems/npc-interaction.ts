// npc-interaction.ts — NPC 상호작용 시스템
// 원본: NpcInteraction.h/cpp, GameLoop.cpp (대화/선물/동료 영입)

import { Actor } from '../models/actor';
import { SocialHub, getRelationshipOverall } from '../models/social';
import { Backlog } from '../models/backlog';
import { PlayerKnowledge } from '../models/knowledge';
import { GameTime } from '../types/game-time';
import { Element, ItemType, SpiritRole, ELEMENT_COUNT, elementName } from '../types/enums';
import { itemName } from '../types/registry';
import { randomFloat, randomInt, weightedRandomChoice } from '../types/rng';

// ============================================================
// 선물 선호도
// ============================================================
export interface GiftPreference {
  loved: ItemType | null;
  liked: ItemType | null;
  disliked: ItemType | null;
}

/** 선물 선호도 DB (data-init에서 채움) */
const giftPrefDB = new Map<string, GiftPreference>();

export function clearGiftPreferences(): void {
  giftPrefDB.clear();
}

export function setGiftPreference(key: string, pref: GiftPreference): void {
  giftPrefDB.set(key, pref);
}

/**
 * 선물 선호도 조회: 캐릭터 이름 > 종족 > 역할 우선순위
 * 원본: GameData::GetGiftPreference
 */
export function getGiftPreference(
  raceKey: string,
  roleKey: string,
  actorName: string,
): GiftPreference {
  // 캐릭터 고유 선호 (최우선)
  if (actorName) {
    const nameEntry = giftPrefDB.get(actorName);
    if (nameEntry) return { ...nameEntry };
  }

  let result: GiftPreference = { loved: null, liked: null, disliked: null };

  // 종족 키 조회
  const raceEntry = giftPrefDB.get('Race_' + raceKey);
  if (raceEntry) result = { ...raceEntry };

  // 역할 키 조회 -- loved/liked가 아직 없으면 보충
  const roleEntry = giftPrefDB.get('Role_' + roleKey);
  if (roleEntry) {
    if (result.loved === null && roleEntry.loved !== null) result.loved = roleEntry.loved;
    if (result.liked === null && roleEntry.liked !== null) result.liked = roleEntry.liked;
  }

  return result;
}

// ============================================================
// 대사(dialogues) DB
// ============================================================
const dialogueDB = new Map<string, string[]>();

export function clearDialogues(): void {
  dialogueDB.clear();
}

export function setDialogueLines(category: string, lines: string[]): void {
  dialogueDB.set(category, lines);
}

function pickRandom(lines: string[]): string {
  if (lines.length === 0) return '';
  return lines[randomInt(0, lines.length - 1)];
}

/**
 * NPC 상태/역할/성향/관계 단계에 따른 대사 선택
 * 조회 우선순위: status → 캐릭터명.stage → stage.X → 캐릭터명 → role → trait → default
 */
export function getDialogue(actor: Actor, stage: RelationshipStage = 'unknown'): string {
  const base = actor.base;
  const spirit = actor.spirit;
  const dominant = actor.color.getDominantTrait();

  // 상태 기반 대사 (모든 단계에서 우선)
  if (base.vigor < 15) {
    const lines = dialogueDB.get('status.starving');
    if (lines && lines.length > 0) return pickRandom(lines);
  }
  if (base.vigor < 40) {
    const lines = dialogueDB.get('status.hungry');
    if (lines && lines.length > 0) return pickRandom(lines);
  }
  if (base.mood < -0.3) {
    const lines = dialogueDB.get('status.depressed');
    if (lines && lines.length > 0) return pickRandom(lines);
  }

  // 캐릭터별 단계 대사 (최우선)
  const charStageLines = dialogueDB.get(actor.name + '.' + stage);
  if (charStageLines && charStageLines.length > 0) return pickRandom(charStageLines);

  // 범용 단계 대사
  const stageLines = dialogueDB.get('stage.' + stage);
  if (stageLines && stageLines.length > 0 && randomFloat(0, 1) < 0.6) {
    return pickRandom(stageLines);
  }

  // 캐릭터 고유 대사 (단계 무관)
  const charLines = dialogueDB.get(actor.name);
  if (charLines && charLines.length > 0) return pickRandom(charLines);

  // 역할 기반 대사
  const roleKey = spiritRoleKey(spirit.role);
  const roleLines = dialogueDB.get('role.' + roleKey);
  if (roleLines && roleLines.length > 0 && randomFloat(0, 1) < 0.5) {
    return pickRandom(roleLines);
  }

  // 성향 기반 대사
  const traitKey = String(dominant);
  const traitLines = dialogueDB.get('trait.' + traitKey);
  if (traitLines && traitLines.length > 0) return pickRandom(traitLines);

  // 기본 대사
  const defaultLines = dialogueDB.get('default');
  if (defaultLines && defaultLines.length > 0) return pickRandom(defaultLines);

  return '...';
}

/** 대화 계속 시 단계별 응답 생성 */
export function getContinueDialogue(actor: Actor, stage: RelationshipStage): string {
  // 캐릭터별 계속 대사
  const charContLines = dialogueDB.get(actor.name + '.continue.' + stage);
  if (charContLines && charContLines.length > 0) return pickRandom(charContLines);

  // 범용 계속 대사
  const contLines = dialogueDB.get('continue.' + stage);
  if (contLines && contLines.length > 0) return pickRandom(contLines);

  // 폴백: 일반 대사
  return getDialogue(actor, stage);
}

function spiritRoleKey(role: SpiritRole): string {
  const keys = [
    'GuildClerk', 'Adventurer', 'Merchant', 'Farmer', 'Guard',
    'Villager', 'Meteorologist', 'Miner', 'Fisher', 'Priest', 'Craftsman',
  ];
  return keys[role] ?? 'Villager';
}

// ============================================================
// NPC가 먼저 말을 거는 시스템
// 원본: TryNpcInitiatedConversation()
// ============================================================

// --- 인사말 템플릿 ---
const GREETINGS_BRIGHT = [
  '안녕하세요! 오늘 기분이 정말 좋아요!',
  '반가워요! 좋은 하루 보내고 계신가요?',
  '어머, 마침 만났네요! 이야기 좀 할까요?',
];

const GREETINGS_NEUTRAL = [
  '안녕하세요.',
  '좋은 하루예요.',
  '만나서 반가워요.',
];

const GREETINGS_GLOOMY = [
  '...안녕하세요. 조금 힘든 하루예요.',
  '아, 반가워요... 좀 지쳤지만 괜찮아요.',
  '...고마워요, 말 걸어줘서.',
];

export interface NpcConversationResult {
  npc: Actor;
  greeting: string;
  sharedRumor?: string;
  moodDisplay: 'bright' | 'neutral' | 'gloomy';
}

export function tryNpcInitiatedConversation(
  player: Actor,
  allActors: Actor[],
  social: SocialHub,
  _time: GameTime,
): NpcConversationResult | null {
  // 1. Base chance
  let chance = 0.03;

  // 2. Player color adjustment
  chance += player.color.values[Element.Water] * 0.02;  // Water = sociability
  chance += player.color.values[Element.Wind]  * 0.01;  // Wind  = openness

  // Clamp to [0.02, 0.22]
  chance = Math.max(0.02, Math.min(0.22, chance));

  // 3. Roll
  if (randomFloat(0, 1) > chance) return null;

  // 4. Find candidate NPCs (same location, alive, not sleeping, not player)
  const candidates: Actor[] = [];
  const weights: number[] = [];

  for (const actor of allActors) {
    if (actor.name === player.name) continue;
    if (actor.currentLocation !== player.currentLocation) continue;
    if (!actor.isAlive()) continue;
    if (actor.base.sleeping) continue;

    let w = 1.0;
    w += actor.color.values[Element.Water] * 0.5;
    w += actor.color.values[Element.Light] * 0.3;
    w += actor.base.mood * 0.3;

    const rel = actor.relationships.get(player.name);
    if (rel) w += getRelationshipOverall(rel) * 0.5;

    if (w < 0.1) w = 0.1;
    candidates.push(actor);
    weights.push(w);
  }

  if (candidates.length === 0) return null;

  // 5. Weighted random selection
  const chosenIdx = weightedRandomChoice(weights);
  const npc = candidates[chosenIdx];

  // 6. Relationship update (both directions)
  player.adjustRelationship(npc.name, 0.02, 0.03);
  npc.adjustRelationship(player.name, 0.02, 0.03);

  // 7. Rumor sharing (30% chance)
  let sharedRumor: string | undefined;
  if (randomFloat(0, 1) < 0.3) {
    const unheard = social.getUnheardRumors(player.name);
    if (unheard.length > 0) {
      const rumor = unheard[randomInt(0, unheard.length - 1)];
      sharedRumor = rumor.content;
      const allRumors = social.getRumors();
      const rumorIndex = (allRumors as readonly typeof rumor[]).indexOf(rumor);
      if (rumorIndex >= 0) social.markRumorHeard(player.name, rumorIndex);
    }
  }

  // 8. Mood display
  const mood = npc.base.mood;
  let moodDisplay: 'bright' | 'neutral' | 'gloomy';
  if (mood > 0.3) {
    moodDisplay = 'bright';
  } else if (mood < -0.3) {
    moodDisplay = 'gloomy';
  } else {
    moodDisplay = 'neutral';
  }

  // 9. Greeting based on mood
  let pool: string[];
  if (moodDisplay === 'bright') pool = GREETINGS_BRIGHT;
  else if (moodDisplay === 'gloomy') pool = GREETINGS_GLOOMY;
  else pool = GREETINGS_NEUTRAL;

  const greeting = pool[randomInt(0, pool.length - 1)];

  return { npc, greeting, sharedRumor, moodDisplay };
}

// ============================================================
// 대화 주제 시스템
// 원본: GameLoop.cpp case '4' 대화 분기
// ============================================================
export interface TalkTopicResult {
  topic: string;
  elementIndex: number;
  reaction: string;
  colorDelta: number;
  messages: string[];
}

const TALK_TOPICS: [string, number][] = [
  ['모험', Element.Fire],
  ['바다와 강', Element.Water],
  ['기술과 발명', Element.Electric],
  ['무기와 방어구', Element.Iron],
  ['자연과 대지', Element.Earth],
  ['여행과 자유', Element.Wind],
  ['희망과 정의', Element.Light],
  ['비밀과 밤', Element.Dark],
];

export function generateTalkTopic(
  player: Actor,
  target: Actor,
  knowledge: PlayerKnowledge,
): TalkTopicResult {
  // 랜덤 주제 선택
  const topicIdx = randomInt(0, TALK_TOPICS.length - 1);
  const [topic, topicElement] = TALK_TOPICS[topicIdx];

  // 대화 컬러 차이에 따른 반응
  const playerVal = player.color.values[topicElement] ?? 0.5;
  const npcVal = target.color.values[topicElement] ?? 0.5;
  const diff = npcVal - playerVal;

  const dispName = knowledge.isKnown(target.name) ? target.name : '???';
  let reaction: string;
  let colorDelta: number;

  if (diff >= 0.3) {
    const r = [
      `${dispName}이(가) 깊은 이야기를 들려주었다. 처음 알게 된 세계가 있다.`,
      `${dispName}의 말에서 오랜 경험의 무게가 느껴진다.`,
      `${dispName}이(가) 눈을 빛내며 이야기했다. 가슴 깊이 와닿았다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.06;
  } else if (diff >= 0.1) {
    const r = [
      `${dispName}의 이야기에 고개를 끄덕이게 된다.`,
      `${dispName}이(가) 조용히 미소 지으며 이야기를 이어갔다.`,
      `${dispName}의 시선에서 따뜻한 무언가를 느꼈다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.04;
  } else if (diff > -0.1) {
    const r = [
      '서로 비슷한 생각을 하고 있었다. 웃음이 번졌다.',
      '같은 감정을 나누는 것만으로도 마음이 따뜻해진다.',
      '말하지 않아도 통하는 순간이 있다.',
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.02;
  } else if (diff > -0.3) {
    const r = [
      `${dispName}은(는) 다른 관점으로 이야기했다. 생각해 볼 만하다.`,
      `${dispName}의 솔직한 반응이 오히려 신선했다.`,
      `${dispName}이(가) 고개를 갸웃거렸지만, 이야기는 즐거웠다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.01;
  } else {
    const r = [
      `${dispName}과(와) 전혀 다른 세계의 이야기를 나눴다. 낯설지만 흥미롭다.`,
      `${dispName}은(는) 어리둥절한 표정이었지만, 진지하게 들어주었다.`,
      `${dispName}이(가) 한참을 생각하더니 '그런 생각도 있구나'라고 말했다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = -0.01;
  }

  // 컬러 영향 적용
  const influence = new Array(ELEMENT_COUNT).fill(0);
  influence[topicElement] = colorDelta;
  player.color.applyInfluence(influence);

  // 관계 변화
  player.adjustRelationship(target.name, 0.03, 0.04);
  target.adjustRelationship(player.name, 0.03, 0.04);

  const messages: string[] = [];
  messages.push(`대화 주제: ${topic} (${elementName(topicElement as Element)})`);
  messages.push(reaction);
  if (colorDelta > 0) {
    messages.push(`(${elementName(topicElement as Element)} +${Math.round(colorDelta * 100)}%)`);
  } else if (colorDelta < 0) {
    messages.push(`(${elementName(topicElement as Element)} ${Math.round(colorDelta * 100)}%)`);
  }

  return { topic, elementIndex: topicElement, reaction, colorDelta, messages };
}

// ============================================================
// 선물 주기
// 원본: GameLoop.cpp case 'g'
// ============================================================
export interface GiftResult {
  success: boolean;
  reaction: string;
  trustBoost: number;
  affinityBoost: number;
  messages: string[];
}

export function giveGift(
  player: Actor,
  target: Actor,
  giftItem: ItemType,
  raceKey: string,
  roleKey: string,
  knowledge: PlayerKnowledge,
  backlog: Backlog,
  gameTime: GameTime,
): GiftResult {
  if (!player.consumeItem(giftItem, 1)) {
    return { success: false, reaction: '', trustBoost: 0, affinityBoost: 0, messages: ['아이템이 부족하다.'] };
  }

  const pref = getGiftPreference(raceKey, roleKey, target.name);
  let trustBoost = 0.03;
  let affinityBoost = 0.04;
  let reaction: string;

  if (pref.loved !== null && giftItem === pref.loved) {
    trustBoost = 0.10;
    affinityBoost = 0.15;
    reaction = '매우 기뻐하며 받았다!';
  } else if (pref.liked !== null && giftItem === pref.liked) {
    trustBoost = 0.05;
    affinityBoost = 0.08;
    reaction = '기쁜 표정으로 받았다.';
  } else if (pref.disliked !== null && giftItem === pref.disliked) {
    trustBoost = 0.00;
    affinityBoost = 0.01;
    reaction = '살짝 난처한 표정을 짓는다.';
  } else {
    reaction = '고맙다며 받았다.';
  }

  player.adjustRelationship(target.name, trustBoost, affinityBoost);
  target.adjustRelationship(player.name, trustBoost, affinityBoost);
  target.addItem(giftItem, 1);
  knowledge.trackGiftGiven();

  const iName = itemName(giftItem);
  const messages: string[] = [];
  messages.push(`${target.name}에게 ${iName}을(를) 선물했다.`);
  messages.push(reaction);

  backlog.add(
    gameTime,
    `${player.name}이(가) ${target.name}에게 ${iName}을(를) 선물했다. ${reaction}`,
    '행동',
  );

  return { success: true, reaction, trustBoost, affinityBoost, messages };
}

// ============================================================
// 동료 영입/해제
// 원본: GameLoop.cpp 동료 관련 분기
// ============================================================
export interface RecruitResult {
  success: boolean;
  messages: string[];
}

// ============================================================
// 관계 단계 시스템
// 모르는 사이 → 아는 사이(대화 1회) → 친한 사이(상호작용 5회+호감도) → 동료 가능
// ============================================================
export type RelationshipStage = 'unknown' | 'known' | 'close' | 'companion';

export function getRelationshipStage(
  player: Actor,
  targetName: string,
  knowledge: PlayerKnowledge,
): RelationshipStage {
  // 대화한 적 없으면 모르는 사이
  if (!knowledge.conversationPartners.has(targetName) && !knowledge.isKnown(targetName)) {
    return 'unknown';
  }
  // 대화한 적 있으면 아는 사이, 친밀도 조건 충족 시 친한 사이
  const rel = player.relationships.get(targetName);
  if (!rel) return 'known';
  const overall = getRelationshipOverall(rel);
  const alreadyRecruited = knowledge.recruitedEver.has(targetName);
  // 친한 사이 조건: 상호작용 5회 이상 + 호감도 0.30 이상 (재영입은 0.15)
  const threshold = alreadyRecruited ? 0.15 : 0.30;
  if (rel.interactionCount >= 5 && overall >= threshold) return 'close';
  return 'known';
}

export function getRelationshipStageLabel(stage: RelationshipStage): string {
  switch (stage) {
    case 'unknown': return '모르는 사이';
    case 'known': return '아는 사이';
    case 'close': return '친한 사이';
    case 'companion': return '동행 중';
  }
}

/**
 * 대화 후 동료 영입 가능 여부 판정 + 실행
 * 조건: 친한 사이 이상, 파티 여유, 비정주 NPC
 */
export function tryRecruitCompanion(
  player: Actor,
  target: Actor,
  knowledge: PlayerKnowledge,
  backlog: Backlog,
  gameTime: GameTime,
): RecruitResult {
  const tgtName = target.name;

  if (knowledge.isCompanion(tgtName) || target.stationary || tgtName === player.name) {
    return { success: false, messages: [] };
  }

  if (knowledge.partyMembers.length >= PlayerKnowledge.MAX_PARTY_SIZE) {
    return { success: false, messages: ['동료가 이미 가득 찼다.'] };
  }

  const stage = getRelationshipStage(player, tgtName, knowledge);
  if (stage === 'unknown') {
    return { success: false, messages: ['아직 모르는 사이다. 먼저 대화를 나눠보자.'] };
  }
  if (stage === 'known') {
    const rel = player.relationships.get(tgtName);
    const count = rel?.interactionCount ?? 0;
    if (count < 5) {
      return { success: false, messages: [`아직 친하지 않다. (대화 ${count}/5)`] };
    }
    return { success: false, messages: ['좀 더 친해져야 한다. 호감을 높여보자.'] };
  }

  // 친한 사이 → 영입 가능
  if (knowledge.recruitCompanion(tgtName)) {
    backlog.add(gameTime, `${tgtName}이(가) 동료로 합류했다.`, '시스템');
    return {
      success: true,
      messages: [`${tgtName}이(가) 동료가 되었다!`],
    };
  }

  return { success: false, messages: [] };
}

export function dismissCompanion(
  name: string,
  knowledge: PlayerKnowledge,
  backlog: Backlog,
  gameTime: GameTime,
): boolean {
  if (knowledge.dismissCompanion(name)) {
    backlog.add(gameTime, `${name}이(가) 동료에서 해제되었다.`, '시스템');
    return true;
  }
  return false;
}

/**
 * 동료를 플레이어와 같은 장소로 이동
 * 원본: GameLoop.cpp 이동 시 동료 동행
 */
export function moveCompanions(
  actors: Actor[],
  knowledge: PlayerKnowledge,
  destination: string,
): void {
  for (const compName of knowledge.partyMembers) {
    const companion = actors.find(a => a.name === compName);
    if (companion) companion.currentLocation = destination;
  }
}

// ============================================================
// NPC 목록 조회 (같은 장소, 깨어 있는 NPC)
// ============================================================
export function getNearbyNpcs(
  actors: Actor[],
  playerIdx: number,
): Actor[] {
  const player = actors[playerIdx];
  return actors.filter((a, i) =>
    i !== playerIdx &&
    a.currentLocation === player.currentLocation &&
    !a.base.sleeping,
  );
}
