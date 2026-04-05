// game-session.ts — 전체 게임 상태 컨테이너
// 원본: GameSession.h

import { Actor } from '../models/actor';
import { World } from '../models/world';
import { EventSystem } from '../models/event';
import { DungeonSystem } from '../models/dungeon';
import { ActivitySystem } from '../models/activity';
import { Backlog } from '../models/backlog';
import { SocialHub } from '../models/social';
import { PlayerKnowledge } from '../models/knowledge';
import { ColorGaugeState } from '../models/color';
import { GameTime } from '../types/game-time';
import type { CropState, BuffState } from '../models/activity';

export class GameSession {
  actors: Actor[] = [];
  playerIdx = -1;
  gameTime = new GameTime();
  world = new World();
  events = new EventSystem();
  dungeonSystem = new DungeonSystem();
  activitySystem = new ActivitySystem();
  backlog = new Backlog();
  social = new SocialHub();
  knowledge = new PlayerKnowledge();
  gaugeState = new ColorGaugeState();
  playerCrops: CropState[] = [];
  playerBuffs: BuffState[] = [];

  get player(): Actor { return this.actors[this.playerIdx]; }
  get playerName(): string { return this.player?.name ?? ''; }
  get isValid(): boolean { return this.playerIdx >= 0 && this.playerIdx < this.actors.length; }
}
