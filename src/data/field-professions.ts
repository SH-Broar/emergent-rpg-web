/** Combat packages describe the existing character choices; they are separate from life professions. */
export interface FieldCombatStyle {
  raceId: string;
  name: string;
  prepare: string;
  release: string;
  risk: string;
  /** The two novice glyphs teach this pair before the rest of the collection. */
  starter: [string,string];
  cardIds: string[];
}
export const FIELD_COMBAT_STYLES: Record<string, FieldCombatStyle> = {
  human: {
    starter: ["c-defend","c-human-riposte"],
    raceId: 'human', name: '검과 방패', prepare: '방어를 세우고 빈틈을 기다린다.',
    release: '남은 방어를 소모해 받아친다.', risk: '방어가 깨지면 반격할 수 없다.',
    cardIds: ['c-defend', 'c-human-riposte', 'c-human-balance', 'c-human-step'],
  },
  moth: {
    starter: ["c-moth-snipe","c-moth-flit"],
    raceId: 'moth', name: '거리와 조준', prepare: '거리를 벌리고 적의 다음 자리를 겨눈다.',
    release: '자리를 지키며 겨눈 화살을 쏜다.', risk: '조준 중 이동하거나 다치면 놓친다.',
    cardIds: ['c-moth-flit', 'c-moth-snipe', 'c-moth-glide', 'c-moth-volley'],
  },
  whitefang: {
    starter: ["c-wf-afterimage","c-wf-doublecast"],
    raceId: 'whitefang', name: '잔상 검술', prepare: '베일 자리에 잔상을 남긴다.',
    release: '다음 검격을 같은 순간에 겹친다.', risk: '적이 자리를 벗어나면 잔상이 빗나간다.',
    cardIds: ['c-wf-afterimage', 'c-wf-doublecast', 'c-wf-slash', 'c-wf-blink'],
  },
  slime: {
    starter: ["c-sl-corrode","c-sl-spread"],
    raceId: 'slime', name: '점액과 연쇄', prepare: '독을 묻히고 점액을 번지게 한다.',
    release: '쌓인 약화를 한 번에 터뜨린다.', risk: '묻힌 것이 사라지면 폭발도 약해진다.',
    cardIds: ['c-sl-corrode', 'c-sl-spread', 'c-sl-chainpop', 'c-sl-bounce'],
  },
  sminthus: {
    starter: ["c-smi-firetrap","c-smi-hook"],
    raceId: 'sminthus', name: '설치와 유도', prepare: '빈 칸에 깔개와 폭약을 놓는다.',
    release: '적을 밀거나 당겨 준비한 칸을 밟게 한다.', risk: '자신과 동료도 함정을 밟을 수 있다.',
    cardIds: ['c-smi-firetrap', 'c-smi-spiketrap', 'c-smi-hook', 'c-smi-bomb', 'c-smi-scurry'],
  },
};
export const fieldCombatStyle = (raceId: string) => FIELD_COMBAT_STYLES[raceId];
