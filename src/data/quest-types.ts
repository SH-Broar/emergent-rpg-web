export interface JourneyGoal {
  kind: 'visit' | 'talk' | 'deliver' | 'count' | 'dungeon' | 'boss' | 'read' | 'ally';
  key: string;
  label: string;
  amount?: number;
  testimony?: string;
  whenChoice?: { questId: string; choiceId: string };
}
export interface JourneyChoice {
  id: string;
  label: string;
  reply: string;
  requiresChaos?: boolean;
  stock?: Record<string, number>;
}
export interface JourneyQuest {
  id: string;
  main?: boolean;
  chapter?: string;
  series?: string;
  title: string;
  npcId: string;
  turnInNpcId?: string;
  /** Physical records where this investigation can be started and filed. */
  reportRecords?: string[];
  reportText?: string;
  after?: string[];
  offer: string[];
  reminder: string;
  finish: string;
  goals: JourneyGoal[];
  choices?: JourneyChoice[];
  /** Finish at the actual final victory, before the run is archived. */
  completeOnBoss?: string;
  completeOnAccept?: boolean;
  encounter?: { bossId: string; lines: string[] };
  lessonCard?: string;
  reward: { xp?: number; life?: number; card?: string; stock?: Record<string, number> };
}
