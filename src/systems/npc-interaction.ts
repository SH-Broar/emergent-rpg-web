// npc-interaction.ts — NPC 상호작용 시스템
// 원본: NpcInteraction.h/cpp, GameLoop.cpp (대화/선물/동료 영입)

import { Actor } from '../models/actor';
import { SocialHub, getRelationshipOverall } from '../models/social';
import { Backlog } from '../models/backlog';
import { PlayerKnowledge } from '../models/knowledge';
import { GameTime } from '../types/game-time';
import { Element, ItemType, Race, SpiritRole, ELEMENT_COUNT, elementName } from '../types/enums';
import { itemName, GameRegistry } from '../types/registry';
import { randomFloat, randomInt, weightedRandomChoice } from '../types/rng';
import { getDungeonSRankTurnLimit, resolveDungeonIdForSRankDisplayName } from '../models/dungeon-s-rank-registry';
import { getAllItemDefs } from '../types/item-defs';
import type { DungeonSystem } from '../models/dungeon';
import { getNpcQuestByTitle } from '../data/npc-quest-defs';

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

// ============================================================
// 선물 반응 풀 (10종 × 4단계)
// ============================================================
const GIFT_REACTION_POOLS: Record<string, string[]> = {
  loved: [
    '눈이 반짝이며 두 손으로 조심스럽게 받았다.',
    '기대 이상이라는 듯 잠시 말을 잃었다.',
    '천천히 고개를 끄덕이며 기쁜 기색을 감추지 못했다.',
    '이런 걸 어떻게 알았냐며 기뻐했다.',
    '뭐라 말하기 어렵다는 듯 환하게 미소를 지었다.',
    '눈가가 살짝 붉어지며 받았다.',
    '이걸 받게 될 줄은 몰랐다며 진심으로 기뻐했다.',
    '잠시 멍하니 바라보더니 기쁜 표정으로 고개를 들었다.',
    '마음이 전해졌다는 듯 따뜻하게 받았다.',
    '오래 쓸게, 라고 조용히 말하며 받았다.',
  ],
  liked: [
    '기쁜 표정으로 받았다.',
    '고맙다며 조용히 미소를 보였다.',
    '마음에 든다며 받아들었다.',
    '기분 좋게 챙겨들었다.',
    '좋은 선택이라며 고마워했다.',
    '마음 써줘서 고맙다고 했다.',
    '이게 마음에 든다고 말했다.',
    '반갑게 받아들었다.',
    '기쁜 기색으로 감사를 표했다.',
    '고마워, 잘 쓸게, 라고 했다.',
  ],
  disliked: [
    '살짝 난처한 표정을 지었다.',
    '어색하게 웃으며 받았다.',
    '고맙긴 한데 어색한 표정이었다.',
    '말없이 받아들었지만 내키지 않는 눈치였다.',
    '받긴 했지만 아쉬운 기색이 역력했다.',
    '잠시 망설이다 받았다.',
    '천천히 받으며 특별한 말이 없었다.',
    '감사하다고 했지만 반응이 미묘했다.',
    '더 말하려다 그냥 받아들었다.',
    '억지 미소를 보이며 고맙다고 했다.',
  ],
  neutral: [
    '고맙다며 받았다.',
    '조용히 고마움을 표했다.',
    '마음이 담겼다며 받았다.',
    '받아들고 미소를 보였다.',
    '정중하게 고마움을 표했다.',
    '담담하게 받으며 감사를 전했다.',
    '특별한 말 없이 받아들었다.',
    '고맙다고 간단히 말했다.',
    '차분하게 받아들었다.',
    '뭐든 고마운 법이라며 웃었다.',
  ],
};

function pickGiftReaction(tier: 'loved' | 'liked' | 'disliked' | 'neutral', actorName: string): string {
  const charLines = dialogueDB.get(actorName + '.gift.' + tier);
  if (charLines && charLines.length > 0) return pickRandom(charLines);
  return pickRandom(GIFT_REACTION_POOLS[tier]);
}

/**
 * NPC 상태/역할/성향/관계 단계에 따른 대사 선택
 * 조회 우선순위: status → 캐릭터명.stage → stage.X → 캐릭터명 → role → trait → default
 * context: 'travel' 시 이동 전용 키를 먼저 시도하고 상태 기반 대사를 건너뜀
 */
export function getDialogue(actor: Actor, stage: RelationshipStage = 'unknown', context: 'normal' | 'travel' = 'normal'): string {
  const base = actor.base;
  const spirit = actor.spirit;
  const dominant = actor.color.getDominantTrait();

  // 이동 컨텍스트: 캐릭터 전용 이동 대사 우선 (배고픔/상태 대사와 혼용 방지)
  if (context === 'travel') {
    const travelCharLines = dialogueDB.get(actor.name + '.travel');
    if (travelCharLines && travelCharLines.length > 0) return pickRandom(travelCharLines);
    const travelLines = dialogueDB.get('travel');
    if (travelLines && travelLines.length > 0) return pickRandom(travelLines);
    // 이동 중에는 상태 기반 대사(배고픔 등) 건너뜀 — 아래 캐릭터/역할 단계로 바로 진입
  } else {
    // 일반 대화: 상태 기반 대사 우선 적용
    if (actor.lifeData.daysSinceLastMeal > 1) {
      const lines = dialogueDB.get('status.starving');
      if (lines && lines.length > 0) return pickRandom(lines);
    }
    if (actor.lifeData.daysSinceLastMeal > 0) {
      const lines = dialogueDB.get('status.hungry');
      if (lines && lines.length > 0) return pickRandom(lines);
    }
    if (base.mood < -0.3) {
      const lines = dialogueDB.get('status.depressed');
      if (lines && lines.length > 0) return pickRandom(lines);
    }
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
    colorDelta = 0.03;
  } else if (diff >= 0.1) {
    const r = [
      `${dispName}의 이야기에 고개를 끄덕이게 된다.`,
      `${dispName}이(가) 조용히 미소 지으며 이야기를 이어갔다.`,
      `${dispName}의 시선에서 따뜻한 무언가를 느꼈다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.02;
  } else if (diff > -0.1) {
    const r = [
      '서로 비슷한 생각을 하고 있었다. 웃음이 번졌다.',
      '같은 감정을 나누는 것만으로도 마음이 따뜻해진다.',
      '말하지 않아도 통하는 순간이 있다.',
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.01;
  } else if (diff > -0.3) {
    const r = [
      `${dispName}은(는) 다른 관점으로 이야기했다. 생각해 볼 만하다.`,
      `${dispName}의 솔직한 반응이 오히려 신선했다.`,
      `${dispName}이(가) 고개를 갸웃거렸지만, 이야기는 즐거웠다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = 0.005;
  } else {
    const r = [
      `${dispName}과(와) 전혀 다른 세계의 이야기를 나눴다. 낯설지만 흥미롭다.`,
      `${dispName}은(는) 어리둥절한 표정이었지만, 진지하게 들어주었다.`,
      `${dispName}이(가) 한참을 생각하더니 '그런 생각도 있구나'라고 말했다.`,
    ];
    reaction = r[randomInt(0, 2)];
    colorDelta = -0.005;
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
  const stage = getRelationshipStage(player, target.name, knowledge);
  if (stage === 'unknown') {
    return {
      success: false,
      reaction: '',
      trustBoost: 0,
      affinityBoost: 0,
      messages: ['선물은 아는 사이부터 줄 수 있다. 먼저 대화를 나눠보자.'],
    };
  }

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
    reaction = pickGiftReaction('loved', target.name);
  } else if (pref.liked !== null && giftItem === pref.liked) {
    trustBoost = 0.05;
    affinityBoost = 0.08;
    reaction = pickGiftReaction('liked', target.name);
  } else if (pref.disliked !== null && giftItem === pref.disliked) {
    trustBoost = 0.00;
    affinityBoost = 0.01;
    reaction = pickGiftReaction('disliked', target.name);
  } else {
    reaction = pickGiftReaction('neutral', target.name);
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
// 모르는 사이 → 아는 사이(대화 1회) → 친한 사이(입수 조건 달성) → 동료 가능
// ============================================================
export type RelationshipStage = 'unknown' | 'known' | 'close' | 'companion';

/** 입수 조건 한 줄 평가 결과 */
export interface AcquisitionCheck {
  text: string;
  met: boolean;
  evaluable: boolean;
}

// ============================================================
// Acquisition 파서 보조 맵 — data-init에서 빌드
// ============================================================

/** 지역 display name → locationId (data-init.ts에서 rebuildLocationNameMap 호출) */
const locationNameMap = new Map<string, string>();

/** 칭호 display name → titleId */
const titleNameMap = new Map<string, string>();

/** 아이템 display name → itemId */
const itemNameMap = new Map<string, string>();

/** locations.txt 로딩 후 호출: GameRegistry의 locationNames를 역인덱싱하여 매핑 구축 */
export function rebuildLocationNameMap(): void {
  locationNameMap.clear();
  for (const [id, name] of GameRegistry.I.locationNames) {
    if (name) locationNameMap.set(name, id);
    // 지역 ID 자체도 키로 등록 (예: "Luna_Academy" → "Luna_Academy")
    locationNameMap.set(id, id);
  }
  // 특수 alias: 구버전 조건문 호환 ("마법학교 루나" 등)
  if (!locationNameMap.has('마법학교 루나')) {
    locationNameMap.set('마법학교 루나', 'Luna_Academy');
  }
  if (!locationNameMap.has('마틴 항')) {
    locationNameMap.set('마틴 항', 'Martin_Port');
  }
}

/** titles.txt 로딩 후 호출: title display name → titleId 매핑 구축 */
export function rebuildTitleNameMap(map: Map<string, string>): void {
  titleNameMap.clear();
  for (const [name, id] of map) titleNameMap.set(name, id);
}

/** items.txt 로딩 후 호출: item display name → itemId 매핑 구축 */
export function rebuildItemNameMap(): void {
  itemNameMap.clear();
  for (const [id, def] of getAllItemDefs()) {
    if (def.name) itemNameMap.set(def.name, id);
    itemNameMap.set(id, id);
  }
}

/** 주어진 지역명 문자열이 알려진 지역이면 해당 locationId 반환, 아니면 undefined */
function resolveLocationId(displayName: string): string | undefined {
  const clean = displayName.trim();
  return locationNameMap.get(clean);
}

/** 주어진 아이템 display name → itemId 반환, 없으면 undefined */
function resolveItemId(displayName: string): string | undefined {
  return itemNameMap.get(displayName.trim());
}

/** 주어진 칭호 display name → titleId 반환, 없으면 동일 문자열 반환 (title-system.ts는 한글 ID 사용) */
function resolveTitleId(displayName: string): string {
  const clean = displayName.trim();
  return titleNameMap.get(clean) ?? clean;
}

// ============================================================
// 한글 종족/속성 매핑 (입수 조건 파서용)
// ============================================================

const RACE_KR_TO_EN: Record<string, Race> = {
  '인간': Race.Human, '엘프': Race.Elf, '드워프': Race.Dwarf,
  '수인': Race.Beastkin, '하피': Race.Harpy, '켄타우로스': Race.Centaur,
  '네코미미': Race.Nekomimi, '정령': Race.Spirit, '여우': Race.Foxkin,
  '여우 수인': Race.Foxkin,
  '드래곤': Race.Dragon, '천사': Race.Angel, '악마': Race.Demon,
  '아르카나': Race.Arcana, '인공물': Race.Construct, '나방': Race.Moth,
  '나방족': Race.Moth,
  '드라이어드': Race.Dryad, '타천사': Race.FallenAngel, '유령': Race.Phantom,
  '팬텀': Race.Phantom, '조류': Race.Harpy,
  '인어': Race.Merfolk, '고블린': Race.Goblin, '뱀파이어': Race.Vampire,
  '라미아': Race.Lamia, '요정': Race.Fairy, '아라크네': Race.Arachne,
  '슬라임': Race.Slime, '리자드맨': Race.Lizardfolk, '미노타우로스': Race.Minotaur,
  '늑대인간': Race.Werewolf, '하프링': Race.Halfling, '사이렌': Race.Siren,
  '알라우네': Race.Alraune,
};

const ELEM_KR_TO_IDX: Record<string, number> = {
  '불': 0, '물': 1, '전기': 2, '철': 3,
  '땅': 4, '바람': 5, '빛': 6, '어둠': 7,
  '풍': 5, // "풍 속성" alias (시이드 조건 대응)
};

/** 특정 종족의 동료 수 집계 — recruitedEver 기준 */
function countCompanionsByRace(
  raceName: string,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
): number {
  const clean = raceName.trim();
  const race = RACE_KR_TO_EN[clean];
  if (race === undefined) return 0;
  let count = 0;
  for (const name of knowledge.recruitedEver) {
    const actor = allActors.find(a => a.name === name);
    if (actor && actor.base.race === race) count++;
  }
  return count;
}

/** 특정 속성의 동료 수 집계 — actor의 dominant element 기준 */
function countCompanionsByElement(
  elemName: string,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
): number {
  const clean = elemName.trim();
  const elemIdx = ELEM_KR_TO_IDX[clean];
  if (elemIdx === undefined) return 0;
  let count = 0;
  for (const name of knowledge.recruitedEver) {
    const actor = allActors.find(a => a.name === name);
    if (!actor) continue;
    // dominant element = 가장 높은 values 인덱스
    let maxIdx = 0;
    for (let i = 1; i < ELEMENT_COUNT; i++) {
      if (actor.color.values[i] > actor.color.values[maxIdx]) maxIdx = i;
    }
    if (maxIdx === elemIdx) count++;
  }
  return count;
}

/** 입수 조건 한 줄을 파싱하여 자동 평가 시도 (OR/원작 래퍼 포함).
 * targetActor: 라인이 평가되는 대상 NPC. "관계도 N 이상" 같은 NPC별 조건에 사용된다.
 */
export function evaluateAcquisitionLine(
  line: string,
  player: Actor,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
  dungeonSystem?: DungeonSystem,
  targetActor?: Actor,
): AcquisitionCheck {
  const t = line.trim();
  if (!t) return { text: t, met: true, evaluable: true };

  // "원작:" 주석 — 영입 조건에서 제외 (UI 표시 목적)
  if (t.startsWith('원작:')) return { text: t, met: true, evaluable: true };

  // "상기의..." 는 상위(evaluateAcquisitionConditions)에서 처리하지만,
  // evaluateAcquisitionLine이 단독 호출되는 경우를 대비해 기본적으로 met:true로 둔다.
  if (t.startsWith('상기의')) return { text: t, met: true, evaluable: true };

  // ── OR 처리 ("A 또는 B") ────────────────────────────────────
  if (t.includes(' 또는 ')) {
    const parts = t.split(' 또는 ');
    const subResults = parts.map((p, idx) => {
      // 첫 파트에만 선행 번호 "1. " 제거 (두 번째 이후는 본래 번호가 없음)
      const cleanP = p.trim().replace(idx === 0 ? /^\d+\.\s*/ : /^/, '');
      return evaluateAcquisitionLineInner(cleanP, player, allActors, knowledge, dungeonSystem, targetActor);
    });
    const anyMet = subResults.some(r => r.met);
    const allEvaluable = subResults.every(r => r.evaluable);
    return { text: t, met: anyMet, evaluable: allEvaluable };
  }

  return evaluateAcquisitionLineInner(t, player, allActors, knowledge, dungeonSystem, targetActor);
}

/** 단일 조건 평가 (OR/원작/상기의 등 래퍼 처리 후 본체 패턴 매칭) */
function evaluateAcquisitionLineInner(
  line: string,
  player: Actor,
  allActors: Actor[],
  knowledge: PlayerKnowledge,
  dungeonSystem?: DungeonSystem,
  targetActor?: Actor,
): AcquisitionCheck {
  const t = line.trim();
  if (!t) return { text: t, met: true, evaluable: true };

  // ── 이벤트 전투 승리 (event_done 리터럴) ──────────────────────
  // 예: "2. event_done:event_lienkai_recruit" / "event_done:event_lupin_recruit"
  const eventDoneMatch = t.match(/^(?:\d+\.\s*)?event_done\s*:\s*([a-zA-Z0-9_]+)/);
  if (eventDoneMatch) {
    const eventId = eventDoneMatch[1].trim();
    return { text: t, met: knowledge.isEventDone(eventId), evaluable: true };
  }

  // ── 대상 NPC와의 관계도 N 이상 ──────────────────────────────
  // 예: "3. 관계도 0.4 이상" / "호감도 0.5 이상"
  // 임계값은 (trust + affinity) / 2 ∈ [-1, 1] 기준. 일반적으로 0.2~0.6 범위.
  const relScore = t.match(/(?:관계도|호감도)\s*(-?\d+(?:\.\d+)?)\s*이상/);
  if (relScore) {
    const threshold = parseFloat(relScore[1]);
    if (!targetActor) {
      // 대상 NPC가 명확하지 않은 호출 경로(레거시) — 평가 불가로 표시
      return { text: t, met: false, evaluable: false };
    }
    const rel = player.relationships.get(targetActor.name);
    const overall = rel ? (rel.trust + rel.affinity) / 2 : 0;
    return { text: t, met: overall >= threshold, evaluable: true };
  }

  // ── 기존 패턴 ────────────────────────────────────────────────

  // 히페리온 레벨 N 이상 (전체)
  const hlTotal = t.match(/히페리온 레벨\s*(\d+)\s*이상/);
  if (hlTotal && !t.includes('의 히페리온')) {
    const total = allActors.reduce((s, a) => s + a.hyperionLevel, 0);
    return { text: t, met: total >= parseInt(hlTotal[1], 10), evaluable: true };
  }

  // X의 히페리온 레벨(이) N 이상
  const actorHl = t.match(/(.+?)의\s*히페리온\s*레벨이?\s*(\d+)\s*이상/);
  if (actorHl) {
    const name = actorHl[1].trim().replace(/^\d+\.\s*/, '');
    const actor = allActors.find(a => a.name === name);
    return { text: t, met: actor ? actor.hyperionLevel >= parseInt(actorHl[2], 10) : false, evaluable: true };
  }

  // X와/과 동행 중
  const comp = t.match(/(.+?)[와과이가]\s*동행\s*중/);
  if (comp) {
    const name = comp[1].trim().replace(/^\d+\.\s*/, '');
    return { text: t, met: knowledge.isCompanion(name), evaluable: true };
  }

  // X 종족의 동료가 N명 이상 — 종족별 동료 수 조건
  const raceCompMatch = t.match(/(.+?)\s*종족의\s*동료가?\s*(\d+)\s*명\s*이상/);
  if (raceCompMatch) {
    const raceName = raceCompMatch[1].trim().replace(/^\d+\.\s*/, '');
    const target = parseInt(raceCompMatch[2], 10);
    if (RACE_KR_TO_EN[raceName] === undefined) {
      return { text: t, met: false, evaluable: false };
    }
    const count = countCompanionsByRace(raceName, allActors, knowledge);
    return { text: t, met: count >= target, evaluable: true };
  }

  // X 속성의 동료가 N명 이상 — 속성별 동료 수 조건
  const elemCompMatch = t.match(/(.+?)\s*속성의\s*동료가?\s*(\d+)\s*명\s*이상/);
  if (elemCompMatch) {
    const elemName = elemCompMatch[1].trim().replace(/^\d+\.\s*/, '');
    const target = parseInt(elemCompMatch[2], 10);
    if (ELEM_KR_TO_IDX[elemName] === undefined) {
      return { text: t, met: false, evaluable: false };
    }
    const count = countCompanionsByElement(elemName, allActors, knowledge);
    return { text: t, met: count >= target, evaluable: true };
  }

  // 동료가 N명 이상
  const recCnt = t.match(/동료가?\s*(\d+)\s*명\s*이상/);
  if (recCnt) {
    return { text: t, met: knowledge.recruitedEver.size >= parseInt(recCnt[1], 10), evaluable: true };
  }

  // 사천왕이 모두 동료
  if (t.includes('사천왕') && t.includes('동료')) {
    const four = ['에코', '카시스', '시아', '리무'];
    return { text: t, met: four.every(n => knowledge.recruitedEver.has(n)), evaluable: true };
  }

  // X가/이 동료 (단일 이름)
  const singleRecruit = t.match(/^(?:\d+\.\s*)?(.+?)[가이]\s*동료$/);
  if (singleRecruit) {
    const name = singleRecruit[1].trim();
    return { text: t, met: knowledge.recruitedEver.has(name), evaluable: true };
  }

  // 방문한 마을 수 N곳 이상
  const visit = t.match(/방문한\s*마을\s*수\s*(\d+)\s*곳\s*이상/);
  if (visit) {
    return { text: t, met: knowledge.visitedLocations.size >= parseInt(visit[1], 10), evaluable: true };
  }

  // 몬스터 종류 N종 이상
  const monType = t.match(/몬스터\s*종류\s*(\d+)\s*종\s*이상/);
  if (monType) {
    return { text: t, met: knowledge.monsterTypesKilled.size >= parseInt(monType[1], 10), evaluable: true };
  }

  // 클리어한 던전 수 N 이상
  const dc = t.match(/클리어한\s*던전\s*수\s*(\d+)\s*이상/);
  if (dc) {
    return { text: t, met: knowledge.totalDungeonsCleared >= parseInt(dc[1], 10), evaluable: true };
  }

  // 획득 동료 수 N 이상
  const acqRec = t.match(/획득\s*동료\s*수\s*(\d+)\s*이상/);
  if (acqRec) {
    return { text: t, met: knowledge.recruitedEver.size >= parseInt(acqRec[1], 10), evaluable: true };
  }

  // 지금까지 잡은 몬스터 수 N 이상 (만 마리 표기 포함)
  const monKillTotal = t.match(/(?:지금까지\s*)?잡은\s*몬스터\s*수\s*(?:(\d+)|만)\s*마리?\s*이상/);
  if (monKillTotal) {
    const nStr = monKillTotal[1];
    const n = nStr ? parseInt(nStr, 10) : 10000; // "만 마리"
    return { text: t, met: knowledge.totalMonstersKilled >= n, evaluable: true };
  }

  // 탐사 완료한 지역 N 이상
  const explore = t.match(/탐사\s*완료한\s*지역\s*(\d+)/);
  if (explore) {
    return { text: t, met: knowledge.visitedLocations.size >= parseInt(explore[1], 10), evaluable: true };
  }

  // (루나:)던전이름 S랭크 클리어 — S랭크 = 해당 던전 sRankTurnLimit 턴 이내 클리어(최단 기록 기준)
  const sRank = t.match(/(?:^\d+\.\s*)?(?:루나[:：]\s*)?(.+?)\s*S랭크\s*클리어/);
  if (sRank) {
    const displayName = sRank[1].trim();
    const dungeonId = resolveDungeonIdForSRankDisplayName(displayName);
    const limit = dungeonId ? getDungeonSRankTurnLimit(dungeonId) : undefined;
    if (!dungeonId || limit == null) {
      return { text: t, met: false, evaluable: false };
    }
    const cleared = player.getDungeonProgress(dungeonId) >= 100;
    const best = player.dungeonBestTurns.get(dungeonId);
    const met = cleared && best != null && best <= limit;
    return { text: t, met, evaluable: true };
  }

  // ── 신규 패턴 ────────────────────────────────────────────────

  // "X" 장비 중 / "X"을(를) 장비 중 — 무기/방어구/장신구 장착 조건
  // 주의: "소지" 패턴보다 먼저 평가하여 오탐 방지.
  const equippedMatch = t.match(/["'「]([^"'」]+)["'」]\s*(?:을|를)?\s*장비\s*중/);
  if (equippedMatch) {
    const itemId = resolveItemId(equippedMatch[1]);
    if (!itemId) return { text: t, met: false, evaluable: false };
    const equipped = [
      player.equippedWeapon,
      player.equippedArmor,
      player.equippedAccessory,
      player.equippedAccessory2,
    ].filter(x => !!x);
    return { text: t, met: equipped.includes(itemId), evaluable: true };
  }

  // 칭호 "XXX" 소지 (따옴표 내부 문자열) — ", ', 「」 지원
  const titleMatch = t.match(/칭호\s*["'「]([^"'」]+)["'」]\s*소지/);
  if (titleMatch) {
    const titleId = resolveTitleId(titleMatch[1]);
    return { text: t, met: knowledge.hasTitle(titleId), evaluable: true };
  }

  // "XXX" N개 이상 소지 또는 "XXX" 소지 (아이템)
  // 예: "반딧불 머리핀" 소지 / "수상한 카드" 1개 이상 소지 / 오묘한 깃털 소지
  const itemPossess = t.match(/["'「]([^"'」]+)["'」]\s*(?:(\d+)개\s*이상)?\s*소지/);
  if (itemPossess) {
    const itemName = itemPossess[1];
    const qty = itemPossess[2] ? parseInt(itemPossess[2], 10) : 1;
    const itemId = resolveItemId(itemName);
    if (!itemId) {
      return { text: t, met: false, evaluable: false };
    }
    return { text: t, met: player.getItemCount(itemId) >= qty, evaluable: true };
  }

  // 따옴표 없는 "XXX 소지" (예: "오묘한 깃털 소지")
  const itemPossessBare = t.match(/^(?:\d+\.\s*)?(.+?)\s*소지$/);
  if (itemPossessBare) {
    const itemName = itemPossessBare[1].trim();
    const itemId = resolveItemId(itemName);
    if (itemId) {
      return { text: t, met: player.getItemCount(itemId) >= 1, evaluable: true };
    }
    // 알 수 없는 이름 → evaluable:false
  }

  // "XXX" 퀘스트 완료 (따옴표 내부) — ", ', 「」 지원
  const questComplete = t.match(/["'「]([^"'」]+)["'」]\s*(?:퀘스트\s*)?완료/);
  if (questComplete) {
    const questName = questComplete[1].trim();
    return { text: t, met: knowledge.completedQuestNames.has(questName), evaluable: true };
  }

  // 지역명 + "퀘스트 N개 이상 완료" (지역 필터 퀘스트 수)
  // npc-quest-defs의 location 필드와 completedQuestNames(title set)를 이용해 해당 지역에서 완료한 퀘스트만 카운트.
  // 지역명을 resolve 못하거나 data가 부족하면 총 완료 수로 폴백(안전).
  const locQuestCount = t.match(/(.+?)\s*(?:지역\s*)?퀘스트\s*(\d+)\s*개?\s*이상\s*완료/);
  if (locQuestCount) {
    const locName = locQuestCount[1].trim().replace(/^\d+\.\s*/, '');
    const target = parseInt(locQuestCount[2], 10);
    const locId = resolveLocationId(locName);
    if (locId) {
      let count = 0;
      for (const questTitle of knowledge.completedQuestNames) {
        const def = getNpcQuestByTitle(questTitle);
        if (def && def.location === locId) count++;
      }
      return { text: t, met: count >= target, evaluable: true };
    }
    // 지역명을 해석 못하면 총 완료 수로 폴백
    return { text: t, met: knowledge.completedQuestCount >= target, evaluable: true };
  }

  // 수락한 퀘스트 수 N개 이상
  const acceptedQuests = t.match(/수락한\s*퀘스트\s*수\s*(\d+)\s*개\s*이상/);
  if (acceptedQuests) {
    // 수락 카운터 부재 → 완료 카운터로 폴백 (과소 추정이지만 안전)
    return { text: t, met: knowledge.completedQuestCount >= parseInt(acceptedQuests[1], 10), evaluable: true };
  }

  // 클리어한 퀘스트 수 비율 N% 이상
  const questRatio = t.match(/클리어한?\s*퀘스트\s*수\s*비율\s*(\d+)\s*%\s*이상/);
  if (questRatio) {
    // 분모 불명 — completedQuestCount를 비율 형태로 판정 불가. 일단 완료 20개 이상이면 충족으로 간주.
    const threshold = parseInt(questRatio[1], 10);
    return { text: t, met: knowledge.completedQuestCount >= 20 && threshold <= 100, evaluable: true };
  }

  // 지역 진행률 N% 이상 — 예: "마노니클라 진행률 100% 달성", "홀로그램 필드 진행률 20% 이상"
  const locProgress = t.match(/(.+?)\s*(?:지역\s*)?진행률\s*(\d+)\s*%\s*(?:이상|달성)/);
  if (locProgress && dungeonSystem) {
    const placeName = locProgress[1].trim().replace(/^\d+\.\s*/, '');
    const requiredPct = parseInt(locProgress[2], 10);
    const locationId = resolveLocationId(placeName);
    if (locationId) {
      const dungeons = dungeonSystem.getAllDungeons().filter(d => d.accessFrom === locationId);
      if (dungeons.length === 0) {
        // 지역에 던전이 없으면 방문 여부로 간소 판정
        return { text: t, met: knowledge.visitedLocations.has(locationId), evaluable: true };
      }
      const avg = dungeons.reduce((sum, d) => sum + player.getDungeonProgress(d.id), 0) / dungeons.length;
      return { text: t, met: avg >= requiredPct, evaluable: true };
    }
  }

  // 던전 클리어 — 예: "라르 포레스트:도토리나무 숲 클리어"
  const dungeonClear = t.match(/(?:^\d+\.\s*)?(?:.+?[:：]\s*)?(.+?)\s*클리어$/);
  if (dungeonClear && !t.includes('진행률') && !t.includes('S랭크')) {
    const displayName = dungeonClear[1].trim();
    const dungeonId = resolveDungeonIdForSRankDisplayName(displayName);
    if (dungeonId) {
      const cleared = player.getDungeonProgress(dungeonId) >= 100;
      return { text: t, met: cleared, evaluable: true };
    }
  }

  // N회 이상 참여 — 현재 범용 카운터 없음
  // TODO(게임플래너 협의): 기투회장 참여, 요리 대회 참여 등 세부 카운터가 필요함
  const nTimes = t.match(/(\d+)\s*회\s*이상\s*참여/);
  if (nTimes) {
    return { text: t, met: false, evaluable: false };
  }

  // "X와 대화했다" / "X과 대화했다" — 대화 이력 기반
  const conversedMatch = t.match(/^(?:\d+\.\s*)?(.+?)[와과]\s*대화했?다?$/);
  if (conversedMatch) {
    const name = conversedMatch[1].trim();
    // 이름이 실제 NPC 이름일 때만 유효 (오탐 방지)
    if (allActors.some(a => a.name === name)) {
      return { text: t, met: knowledge.conversationPartners.has(name), evaluable: true };
    }
  }

  // 지역 방문 — "X 지역을 발견했다", "X를 방문했다", "X 방문"
  const locVisit = t.match(/(.+?)\s*(?:지역을?)?\s*(?:발견했다|방문했다|방문)$/);
  if (locVisit) {
    const placeName = locVisit[1].trim().replace(/^\d+\.\s*/, '');
    const locationId = resolveLocationId(placeName);
    if (locationId) {
      return { text: t, met: knowledge.visitedLocations.has(locationId), evaluable: true };
    }
  }

  // 자동 평가 불가능
  return { text: t, met: false, evaluable: false };
}

/**
 * NPC의 전체 입수 조건 평가.
 * "상기의..." 라인은 선행 라인들이 모두 met일 때만 met:true로 평가.
 * "원작:" 라인은 영입 조건에서 제외 (항상 met:true, 체인 선행 조건에도 영향 없음).
 */
export function evaluateAcquisitionConditions(
  actor: Actor, player: Actor, allActors: Actor[], knowledge: PlayerKnowledge,
  dungeonSystem?: DungeonSystem,
): AcquisitionCheck[] {
  if (!actor.acquisitionMethod) return [];
  const lines = actor.acquisitionMethod.split('|');
  const results: AcquisitionCheck[] = [];
  let allPrevMet = true;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      results.push({ text: t, met: true, evaluable: true });
      continue;
    }
    if (t.startsWith('원작:')) {
      // 원작 주석 — 표시만, 체인 상태엔 영향 없음
      results.push({ text: t, met: true, evaluable: true });
      continue;
    }
    if (t.startsWith('상기의')) {
      // 선행 라인들이 모두 met일 때만 met:true
      results.push({ text: t, met: allPrevMet, evaluable: true });
      continue;
    }
    const r = evaluateAcquisitionLine(t, player, allActors, knowledge, dungeonSystem, actor);
    results.push(r);
    if (!r.met) allPrevMet = false;
  }
  return results;
}

/** 입수 조건이 모두 충족되었는지 */
export function areAcquisitionConditionsMet(
  actor: Actor, player: Actor, allActors: Actor[], knowledge: PlayerKnowledge,
  dungeonSystem?: DungeonSystem,
): boolean {
  if (!actor.acquisitionMethod) return true;
  const checks = evaluateAcquisitionConditions(actor, player, allActors, knowledge, dungeonSystem);
  return checks.every(c => c.met);
}

export function getRelationshipStage(
  player: Actor,
  targetName: string,
  knowledge: PlayerKnowledge,
  allActors?: Actor[],
  dungeonSystem?: DungeonSystem,
): RelationshipStage {
  if (knowledge.isCompanion(targetName)) return 'companion';
  if (!knowledge.conversationPartners.has(targetName) && !knowledge.isKnown(targetName)) {
    return 'unknown';
  }
  if (knowledge.recruitedEver.has(targetName)) return 'close';

  if (allActors) {
    const target = allActors.find(a => a.name === targetName);

    // 히페리온 데이터가 없는 NPC → 영원히 아는 사이 (동료화 불가)
    if (target && !target.hasHyperion) return 'known';

    // 입수 조건만으로 close 판정. 관계도가 필요한 NPC는 acquisition method에
    // "관계도 N 이상" 라인을 명시한다(NPC별 임계값을 데이터로 노출).
    if (target && target.acquisitionMethod) {
      if (areAcquisitionConditionsMet(target, player, allActors, knowledge, dungeonSystem)) return 'close';
      return 'known';
    }
  }

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
  allActors?: Actor[],
  dungeonSystem?: DungeonSystem,
): RecruitResult {
  const tgtName = target.name;

  if (knowledge.isCompanion(tgtName) || target.stationary || tgtName === player.name) {
    return { success: false, messages: [] };
  }

  if (knowledge.partyMembers.length >= PlayerKnowledge.MAX_PARTY_SIZE) {
    return { success: false, messages: ['동료가 이미 가득 찼다.'] };
  }

  const stage = getRelationshipStage(player, tgtName, knowledge, allActors, dungeonSystem);
  if (stage === 'unknown') {
    return { success: false, messages: ['아직 모르는 사이다. 먼저 대화를 나눠보자.'] };
  }
  if (stage === 'known') {
    // 입수 조건 미충족 안내
    if (target.acquisitionMethod) {
      const checks = evaluateAcquisitionConditions(target, player, allActors ?? [], knowledge, dungeonSystem);
      const unmet = checks.filter(c => !c.met);
      if (unmet.length > 0) {
        return { success: false, messages: [`입수 조건을 달성해야 한다. (히페리온 메뉴에서 확인)`] };
      }
    }
    return { success: false, messages: ['아직 충분히 친하지 않다.'] };
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

/**
 * action_texts/combat_texts에서 우선순위 키 순으로 텍스트를 조회한다.
 * keys: ['action.wait.Lake.카엘', 'action.wait.카엘', 'action.wait.Lake', 'action.wait']
 */
export function getActionText(keys: string[]): string {
  for (const key of keys) {
    const lines = dialogueDB.get(key);
    if (lines && lines.length > 0) return pickRandom(lines);
  }
  return '';
}
