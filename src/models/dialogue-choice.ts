// dialogue-choice.ts — NPC 대화 선택지 모델

export interface DialogueChoiceOption {
  text: string;
  response: string;
  relationshipDelta: number;
  colorEffects: { elementKey: string; delta: number }[];
}

export interface DialogueChoiceDef {
  id: string;
  npc: string;
  triggerRelationship: number;  // unlock_relationship 0~1
  context: string;              // 발동 상황 설명
  promptText: string;           // NPC 선제 대사
  options: [DialogueChoiceOption, DialogueChoiceOption, DialogueChoiceOption];
}
