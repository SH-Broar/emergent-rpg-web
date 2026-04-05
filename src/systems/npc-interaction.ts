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
 * NPC 상태/역할/성향에 따른 대사 선택
 * 원본: GameData::GetDialogue
 */
export function getDialogue(actor: Actor): string {
  const base = actor.base;
  const spirit = actor.spirit;
  const dominant = actor.color.getDominantTrait();

  // 상태 기반 대사
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
export interface NpcConversationResult {
  occurred: boolean;
  npcName: string;
  dialogue: string;
  rumorShared: string;
  moodDescription: string;
  messages: string[];
}

export function tryNpcInitiatedConversation(
  actors: Actor[],
  playerIdx: number,
  gameTime: GameTime,
  social: SocialHub,
  backlog: Backlog,
  knowledge: PlayerKnowledge,
): NpcConversationResult {
  const noResult: NpcConversationResult = {
    occurred: false, npcName: '', dialogue: '', rumorShared: '', moodDescription: '', messages: [],
  };

  const player = actors[playerIdx];
  const playerColor = player.color.values;

  // 같은 장소, 깨어 있는 NPC 후보
  const candidates: number[] = [];
  for (let i = 0; i < actors.length; i++) {
    if (i === playerIdx) continue;
    if (actors[i].currentLocation !== player.currentLocation) continue;
    if (actors[i].base.sleeping) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return noResult;

  // 확률 계산: 물(Water) + 바람(Wind) 기반
  let baseChance = 0.03;
  const playerApproach =
    playerColor[Element.Water] * 0.02 +
    playerColor[Element.Wind] * 0.01;
  baseChance += playerApproach;
  baseChance = Math.max(0.02, Math.min(0.22, baseChance));

  if (randomFloat(0, 1) >= baseChance) return noResult;

  // NPC별 가중치 계산
  const weights: number[] = [];
  for (const idx of candidates) {
    const npc = actors[idx];
    const npcColor = npc.color.values;
    let w = 1.0;
    w += npcColor[Element.Water] * 0.5 + npcColor[Element.Light] * 0.3;
    w += npc.base.mood * 0.3;
    const rel = npc.relationships.get(player.name);
    if (rel) w += getRelationshipOverall(rel) * 0.5;
    if (w < 0.1) w = 0.1;
    weights.push(w);
  }

  const chosenIdx = weightedRandomChoice(weights);
  const npcActorIdx = candidates[chosenIdx];
  const npc = actors[npcActorIdx];
  const npcName = npc.name;

  // 이름 발견
  knowledge.addKnownName(npcName);

  // 대사 가져오기
  const dialogue = getDialogue(npc);

  const messages: string[] = [];
  messages.push(`${npcName}이(가) 말을 걸어왔다.`);
  messages.push(`${npcName}: ${dialogue}`);

  // 소문 공유
  let rumorShared = '';
  const unheard = social.getUnheardRumors(player.name);
  for (const rumor of unheard) {
    if (rumor.originActor === npcName || randomFloat(0, 1) < 0.3) {
      rumorShared = rumor.content;
      messages.push(`${npcName}: "참, ${rumor.content}"`);
      break;
    }
  }

  // 기분 표현
  let moodDescription = '';
  if (npc.base.mood > 0.3) {
    moodDescription = `(${npcName}의 표정이 밝다.)`;
    messages.push(moodDescription);
  } else if (npc.base.mood < -0.3) {
    moodDescription = `(${npcName}의 표정이 어둡다.)`;
    messages.push(moodDescription);
  }

  // 관계 변화 + 추적
  knowledge.trackConversation(npcName);
  player.adjustRelationship(npcName, 0.02, 0.03);
  npc.adjustRelationship(player.name, 0.02, 0.03);
  knowledge.adjustReputation(player.currentLocation, 0.005);

  backlog.add(gameTime, `${npcName}이(가) ${player.name}에게 말을 걸었다.`, '대화');

  return {
    occurred: true,
    npcName,
    dialogue,
    rumorShared,
    moodDescription,
    messages,
  };
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

/**
 * 대화 후 동료 영입 가능 여부 판정 + 실행
 * 조건: 호감도 >= threshold, 파티 여유, 비정주 NPC
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

  let overall = 0;
  const rel = player.relationships.get(tgtName);
  if (rel) overall = getRelationshipOverall(rel);

  const alreadyRecruited = knowledge.recruitedEver.has(tgtName);
  const threshold = alreadyRecruited ? 0.15 : 0.30;

  if (overall < threshold || knowledge.partyMembers.length >= PlayerKnowledge.MAX_PARTY_SIZE) {
    return { success: false, messages: [] };
  }

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
