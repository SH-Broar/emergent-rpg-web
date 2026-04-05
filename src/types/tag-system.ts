// tag-system.ts — 태그 기반 속성/능력 매칭 엔진
//
// 태그 문자열: /tag1/tag2/tag3/ — 슬래시로 감싼 태그 집합
// 표현식: /a/ & /b/ | /c/ — AND/OR 불리언 논리
//   - & (AND)는 |보다 우선순위 높음
//   - /a/ & /b/ | /c/ = (/a/ AND /b/) OR /c/
//
// 사용 예:
//   아이템: /mineral/metallic/toxic/
//   종족 능력: /mineral/ & /metallic/ | /edible/
//   → /mineral/ AND /metallic/ 둘 다 있으므로 → true

// ============================================================
// 태그 파싱
// ============================================================

/** /tag1/tag2/tag3/ 문자열에서 태그 Set 추출 */
export function parseTags(tagString: string): Set<string> {
  const tags = new Set<string>();
  if (!tagString) return tags;
  const matches = tagString.match(/\/([^/]+)\//g);
  if (matches) {
    for (const m of matches) {
      const tag = m.slice(1, -1).trim().toLowerCase();
      if (tag) tags.add(tag);
    }
  }
  return tags;
}

/** Set<string>을 /tag1/tag2/ 형식으로 직렬화 */
export function serializeTags(tags: Set<string>): string {
  if (tags.size === 0) return '';
  return '/' + [...tags].join('/') + '/';
}

/** 태그 문자열에 특정 태그가 있는지 빠른 확인 */
export function hasTag(tagString: string, tag: string): boolean {
  return tagString.includes(`/${tag.toLowerCase()}/`);
}

/** 태그 추가 */
export function addTag(tagString: string, tag: string): string {
  const tags = parseTags(tagString);
  tags.add(tag.toLowerCase());
  return serializeTags(tags);
}

/** 태그 제거 */
export function removeTag(tagString: string, tag: string): string {
  const tags = parseTags(tagString);
  tags.delete(tag.toLowerCase());
  return serializeTags(tags);
}

// ============================================================
// 표현식 파서 + 평가기
// ============================================================

interface TagExprNode {
  type: 'tag' | 'and' | 'or';
  tag?: string;       // type === 'tag' 일 때
  left?: TagExprNode; // type === 'and' | 'or' 일 때
  right?: TagExprNode;
}

/** 토큰화: /tag/, &, | 를 추출 */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '&') { tokens.push('&'); i++; continue; }
    if (ch === '|') { tokens.push('|'); i++; continue; }
    if (ch === '(') { tokens.push('('); i++; continue; }
    if (ch === ')') { tokens.push(')'); i++; continue; }
    if (ch === '!') { tokens.push('!'); i++; continue; }
    if (ch === '/') {
      const end = expr.indexOf('/', i + 1);
      if (end === -1) { i++; continue; }
      const tag = expr.slice(i + 1, end).trim().toLowerCase();
      if (tag) tokens.push(`/${tag}/`);
      i = end + 1;
      continue;
    }
    i++;
  }
  return tokens;
}

/**
 * 재귀 하강 파서
 * 문법:
 *   expr     → orExpr
 *   orExpr   → andExpr ('|' andExpr)*
 *   andExpr  → unaryExpr ('&' unaryExpr)*
 *   unaryExpr → '!' primary | primary
 *   primary  → '/tag/' | '(' expr ')'
 */
function parseExpr(tokens: string[], pos: { i: number }): TagExprNode {
  return parseOr(tokens, pos);
}

function parseOr(tokens: string[], pos: { i: number }): TagExprNode {
  let left = parseAnd(tokens, pos);
  while (pos.i < tokens.length && tokens[pos.i] === '|') {
    pos.i++; // consume '|'
    const right = parseAnd(tokens, pos);
    left = { type: 'or', left, right };
  }
  return left;
}

function parseAnd(tokens: string[], pos: { i: number }): TagExprNode {
  let left = parseUnary(tokens, pos);
  while (pos.i < tokens.length && tokens[pos.i] === '&') {
    pos.i++; // consume '&'
    const right = parseUnary(tokens, pos);
    left = { type: 'and', left, right };
  }
  return left;
}

function parseUnary(tokens: string[], pos: { i: number }): TagExprNode {
  if (pos.i < tokens.length && tokens[pos.i] === '!') {
    pos.i++; // consume '!'
    const inner = parsePrimary(tokens, pos);
    // NOT은 tag 노드를 반전 — 간단히 특수 태그로 처리
    return { type: 'tag', tag: '!' + (inner.tag ?? '') };
  }
  return parsePrimary(tokens, pos);
}

function parsePrimary(tokens: string[], pos: { i: number }): TagExprNode {
  if (pos.i >= tokens.length) return { type: 'tag', tag: '__empty__' };

  const token = tokens[pos.i];

  if (token === '(') {
    pos.i++; // consume '('
    const node = parseExpr(tokens, pos);
    if (pos.i < tokens.length && tokens[pos.i] === ')') pos.i++; // consume ')'
    return node;
  }

  if (token.startsWith('/') && token.endsWith('/')) {
    pos.i++;
    return { type: 'tag', tag: token.slice(1, -1) };
  }

  // 알 수 없는 토큰 → 빈 태그
  pos.i++;
  return { type: 'tag', tag: '__unknown__' };
}

/** AST 평가 */
function evaluateNode(node: TagExprNode, tags: Set<string>): boolean {
  switch (node.type) {
    case 'tag': {
      const t = node.tag ?? '';
      if (t === '__empty__' || t === '__unknown__') return false;
      if (t.startsWith('!')) return !tags.has(t.slice(1));
      return tags.has(t);
    }
    case 'and':
      return evaluateNode(node.left!, tags) && evaluateNode(node.right!, tags);
    case 'or':
      return evaluateNode(node.left!, tags) || evaluateNode(node.right!, tags);
  }
}

// ============================================================
// 공개 API
// ============================================================

/** 표현식을 태그 집합에 대해 평가
 * @param expression  "/a/ & /b/ | /c/" 형식의 불리언 표현식
 * @param tagString   "/tag1/tag2/tag3/" 형식의 태그 문자열
 * @returns 표현식이 참이면 true
 *
 * @example
 * evaluateTagExpr('/mineral/ & /metallic/', '/mineral/metallic/toxic/')  // true
 * evaluateTagExpr('/edible/ | /mineral/', '/toxic/')                      // false
 * evaluateTagExpr('/edible/ | /mineral/', '/mineral/')                    // true
 * evaluateTagExpr('!/toxic/', '/mineral/')                                // true (toxic 없으므로)
 * evaluateTagExpr('!/toxic/', '/mineral/toxic/')                          // false
 */
export function evaluateTagExpr(expression: string, tagString: string): boolean {
  if (!expression.trim()) return true; // 빈 표현식 = 항상 통과
  const tokens = tokenize(expression);
  if (tokens.length === 0) return true;
  const tags = parseTags(tagString);
  const ast = parseExpr(tokens, { i: 0 });
  return evaluateNode(ast, tags);
}

/** 표현식을 태그 Set에 대해 평가 (이미 파싱된 태그 사용) */
export function evaluateTagExprWithSet(expression: string, tags: Set<string>): boolean {
  if (!expression.trim()) return true;
  const tokens = tokenize(expression);
  if (tokens.length === 0) return true;
  const ast = parseExpr(tokens, { i: 0 });
  return evaluateNode(ast, tags);
}

// ============================================================
// 종족 능력 태그 정의
// ============================================================

import { Race } from './enums';

/** 종족별 내재 능력 태그 문자열 */
const RACE_CAPABILITY_TAGS: Partial<Record<Race, string>> = {
  [Race.Human]:       '/organic/bipedal/omnivore/',
  [Race.Elf]:         '/organic/bipedal/omnivore/magic_affinity/',
  [Race.Dwarf]:       '/organic/bipedal/omnivore/mineral_resist/forge_affinity/',
  [Race.Beastkin]:    '/organic/bipedal/omnivore/keen_senses/',
  [Race.Harpy]:       '/organic/bipedal/omnivore/flight/',
  [Race.Centaur]:     '/organic/quadruped/omnivore/keen_senses/',
  [Race.Nekomimi]:    '/organic/bipedal/omnivore/keen_senses/',
  [Race.Spirit]:      '/ethereal/bipedal/magic_affinity/elemental/',
  [Race.Foxkin]:      '/organic/bipedal/omnivore/keen_senses/',
  [Race.Dragon]:      '/organic/quadruped/omnivore/flight/fire_resist/toxic_immune/mineral_digest/',
  [Race.Angel]:       '/ethereal/bipedal/omnivore/flight/holy/magic_affinity/',
  [Race.Demon]:       '/organic/bipedal/omnivore/dark_affinity/toxic_resist/',
  [Race.Arcana]:      '/construct/bipedal/mineral_digest/toxic_immune/magic_affinity/',
  [Race.Construct]:   '/construct/bipedal/mineral_digest/toxic_immune/metallic_digest/',
  [Race.Moth]:        '/organic/flight/omnivore/',
  [Race.Dryad]:       '/organic/bipedal/herb_affinity/plant/',
  [Race.FallenAngel]: '/ethereal/bipedal/omnivore/flight/dark_affinity/',
  [Race.Phantom]:     '/ethereal/bipedal/incorporeal/potion_only/',
  [Race.Merfolk]:     '/organic/bipedal/omnivore/aquatic/',
  [Race.Goblin]:      '/organic/bipedal/omnivore/scavenger/',
  [Race.Vampire]:     '/organic/bipedal/blood_diet/nocturnal/toxic_resist/',
  [Race.Lamia]:       '/organic/bipedal/omnivore/keen_senses/',
  [Race.Fairy]:       '/ethereal/flight/omnivore/magic_affinity/',
  [Race.Arachne]:     '/organic/bipedal/omnivore/web_craft/',
  [Race.Slime]:       '/amorphous/digest_all/toxic_immune/acid_body/',
  [Race.Lizardfolk]:  '/organic/bipedal/omnivore/cold_blood/',
  [Race.Minotaur]:    '/organic/bipedal/omnivore/strength/',
  [Race.Werewolf]:    '/organic/bipedal/omnivore/keen_senses/nocturnal/',
  [Race.Halfling]:    '/organic/bipedal/omnivore/',
  [Race.Siren]:       '/organic/bipedal/omnivore/aquatic/voice/',
  [Race.Alraune]:     '/organic/bipedal/herb_affinity/plant/',
};

const DEFAULT_RACE_TAGS = '/organic/bipedal/omnivore/';

/** 종족의 능력 태그 문자열 반환 */
export function getRaceCapabilityTags(race: Race): string {
  return RACE_CAPABILITY_TAGS[race] ?? DEFAULT_RACE_TAGS;
}

/** 종족의 능력 태그 Set 반환 */
export function getRaceCapabilitySet(race: Race): Set<string> {
  return parseTags(getRaceCapabilityTags(race));
}

// ============================================================
// 아이템 속성 태그 정의
// ============================================================

import { ItemType } from './enums';

/** 아이템별 속성 태그 문자열 */
const ITEM_PROPERTY_TAGS: Record<number, string> = {
  [ItemType.Food]:        '/edible/organic/cooked/',
  [ItemType.Herb]:        '/edible/organic/raw/medicine/herb/',
  [ItemType.Potion]:      '/edible/liquid/medicine/magical/',
  [ItemType.OreCommon]:   '/inedible/mineral/metallic/',
  [ItemType.OreRare]:     '/inedible/mineral/metallic/toxic/rare/',
  [ItemType.MonsterLoot]: '/raw/organic/monster/',
  [ItemType.Equipment]:   '/inedible/metallic/crafted/',
  [ItemType.GuildCard]:   '/inedible/paper/',
};

/** 아이템의 속성 태그 문자열 반환 */
export function getItemPropertyTags(item: ItemType): string {
  return ITEM_PROPERTY_TAGS[item] ?? '/unknown/';
}

/** 아이템의 속성 태그 Set 반환 */
export function getItemPropertySet(item: ItemType): Set<string> {
  return parseTags(getItemPropertyTags(item));
}

// ============================================================
// 식용 가능 판정 (태그 기반)
// ============================================================

/** 종족이 아이템을 식용할 수 있는지 태그 기반 판정 */
export function canConsumeByTags(race: Race, item: ItemType): { allowed: boolean; warning: string } {
  const raceTags = getRaceCapabilitySet(race);
  const itemTags = getItemPropertySet(item);

  // 유령: 물약만
  if (raceTags.has('potion_only')) {
    if (itemTags.has('liquid')) return { allowed: true, warning: '' };
    if (raceTags.has('incorporeal')) return { allowed: false, warning: '비물질 존재라 섭취할 수 없다.' };
  }

  // 슬라임: 뭐든 먹을 수 있음
  if (raceTags.has('digest_all')) {
    return { allowed: true, warning: itemTags.has('inedible') ? '⚠ 소화는 되지만...' : '' };
  }

  // 광물 소화 가능 종족
  if (itemTags.has('mineral') && raceTags.has('mineral_digest')) {
    return { allowed: true, warning: '' };
  }
  if (itemTags.has('metallic') && raceTags.has('metallic_digest')) {
    return { allowed: true, warning: '' };
  }

  // 기본 inedible 체크
  if (itemTags.has('inedible')) {
    return { allowed: true, warning: '⚠ 먹을 수 있는 것이 아닌 것 같다...' };
  }

  // edible이면 OK
  if (itemTags.has('edible')) {
    return { allowed: true, warning: '' };
  }

  // raw 아이템
  if (itemTags.has('raw')) {
    return { allowed: true, warning: '⚠ 날것이다.' };
  }

  return { allowed: true, warning: '' };
}

/** 종족의 독 면역 여부 */
export function isToxicImmune(race: Race): boolean {
  return getRaceCapabilitySet(race).has('toxic_immune');
}

/** 종족의 약초 친화 여부 */
export function hasHerbAffinity(race: Race): boolean {
  return getRaceCapabilitySet(race).has('herb_affinity');
}

/** 종족의 피식 여부 (뱀파이어) */
export function isBloodDiet(race: Race): boolean {
  return getRaceCapabilitySet(race).has('blood_diet');
}
