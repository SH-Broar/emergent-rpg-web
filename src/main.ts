import './styles/global.css';
import { loadAllData } from './data/loader';
import { initAll } from './data/data-init';
import { seedRNG } from './types/rng';
import { GameTime } from './types/game-time';
import { ScreenManager } from './ui/screen-manager';
import { InputHandler } from './ui/input-handler';
import { GameSession } from './systems/game-session';
import { processTurn } from './systems/game-loop';
import { createMainMenuScreen } from './ui/screens/main-menu';
import { createCharacterSelectScreen } from './ui/screens/character-select';
import { createGameScreen, createInfoScreen, createMoveScreen, createNpcInfoScreen } from './ui/screens/game-screen';
import { createDialogueScreen } from './ui/screens/dialogue';
import { createDungeonScreen } from './ui/screens/dungeon';
import { createTradeScreen } from './ui/screens/trade';
import { createQuestBoardScreen } from './ui/screens/quest-board';
import { createBacklogScreen } from './ui/screens/backlog';
import { createLevelUpScreen } from './ui/screens/level-up';
import { createBirthScreen, createCustomCharScreen } from './ui/screens/character-creation';
import { createActivityScreen } from './ui/screens/activity';
import { createActivitySimScreen } from './ui/screens/activity-sim';
import { createGiftScreen } from './ui/screens/gift';
import { createInventoryScreen } from './ui/screens/inventory';
import { createEncyclopediaScreen } from './ui/screens/encyclopedia';
import { createHomeScreen } from './ui/screens/home';
import { createHyperionScreen } from './ui/screens/hyperion';
import { createTitlesScreen } from './ui/screens/titles';
import { createPartyScreen } from './ui/screens/party';
import { createSaveLoadScreen, saveToSlot, loadFromSlot } from './ui/screens/save-load';
import { createWorldMapScreen } from './ui/screens/world-map';
import { createMemorySpringScreen } from './ui/screens/memory-spring';
import { createSkillManageScreen } from './ui/screens/skill-manage';
import { createLoreScreen } from './ui/screens/lore';
import { createRealEstateScreen } from './ui/screens/real-estate';
import { createStorageScreen } from './ui/screens/storage';
import { createCookingScreen } from './ui/screens/cooking';
import { createSkillShopScreen } from './ui/screens/skill-shop';
import { createGuildDungeonScreen } from './ui/screens/guild-dungeon';
import { createLifeJobScreen } from './ui/screens/life-job';
import { getHyperionEntry } from './systems/hyperion';
import { createFarmScreen } from './ui/screens/farm';
import { createTravelScreen, type TravelOptions } from './ui/screens/travel';
import { createFerryScreen } from './ui/screens/ferry';
import { createVillageScreen } from './ui/screens/village';
import { createPuchiTowerScreen } from './ui/screens/puchi-tower';
import { createVillageBuildScreen } from './ui/screens/village-build';
import { createStatusScreen } from './ui/screens/status';
import { createHyperionLevelupScreen, HYPERION_OVERLAY_ID } from './ui/screens/hyperion-levelup-overlay';
import { getAllItemDefs } from './types/item-defs';
import { getAllSkillDefs } from './models/skill';
import { ItemType } from './types/enums';

/** 플레이어 아이템/스킬에 따른 이동 속도 계산 (게임 1분당 실제 ms) */
function computeTravelSpeed(_session: GameSession): TravelOptions {
  // 기본값: 100ms/game-min (현실 1초 = 게임 10분)
  // 추후 이동속도 아이템/스킬 효과를 여기서 적용
  let msPerGameMinute = 100;
  // 예시 (추후 아이템 시스템 연동):
  // if (session.player.hasItem('swift_boots')) msPerGameMinute *= 0.5;
  return { msPerGameMinute };
}
import { createDataPackScreen } from './ui/screens/datapack-select';
import { fastForwardWorld } from './systems/world-simulation';
import { checkAndQueueHyperionLevelUps } from './systems/hyperion-trigger';
import { seasonName } from './types/enums';
import { CoreMatrix, PlayerKnowledge } from './models/knowledge';
import { locationName } from './types/registry';
import { markHasEverStarted, getGlobalSave } from './data/global-save';
import { getAllPackProgress, checkAndUnlockPacks, getActivePackPlayableNames } from './data/rdc-packs';

const app = document.getElementById('app')!;

async function boot() {
  app.innerHTML = '<div class="screen menu-screen"><p>데이터 로딩 중...</p></div>';
  seedRNG(Date.now());

  const data = await loadAllData();
  const initResult = initAll(data);

  const session = new GameSession();
  session.actors = initResult.actors;
  session.world = initResult.world;
  session.events = initResult.events;
  session.dungeonSystem = initResult.dungeonSystem;
  session.activitySystem = initResult.activitySystem;
  session.world.seasonSchedule.init(1);
  session.world.updateWeatherAndTemp();

  const sm = new ScreenManager(app);
  const input = new InputHandler(sm);

  /**
   * 화면 pop 후 pendingHyperionMsgs가 있으면 히페리온 오버레이 push.
   * 전투/상점/제작/영입 등 외부 UI에서 복귀할 때 사용.
   */
  function popThenMaybeHyperion(): void {
    sm.pop();
    if (session.pendingHyperionMsgs.length > 0 && sm.peek()?.id !== HYPERION_OVERLAY_ID) {
      sm.push(createHyperionLevelupScreen(session, sm));
    }
  }

  // 오토세이브 존재 여부 확인 (동적으로 매번 재평가)
  function checkHasAutosave(): boolean {
    return localStorage.getItem('emergent_save_0') !== null;
  }

  // --- 주민 수 지정 ---
  function showPopulationSelect(afterDone: () => void) {
    sm.push({
      id: 'population',
      render(el) {
        const totalNpcs = session.actors.filter(a => !a.playable && !getHyperionEntry(a.name)).length;
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center">
            <h2>마을 인구 밀도</h2>
            <p style="text-align:center;color:var(--text-dim)">NPC가 얼마나 활동할지 결정합니다.</p>
            <div class="menu-buttons" style="margin-top:12px">
              <button class="btn" data-pop="low">한적함 — NPC ${Math.floor(totalNpcs * 0.3)}명 활성</button>
              <button class="btn btn-primary" data-pop="normal">보통 — NPC ${Math.floor(totalNpcs * 0.6)}명 활성</button>
              <button class="btn" data-pop="high">붐빔 — NPC ${totalNpcs}명 전부 활성</button>
            </div>
            <p class="hint">1=한적함, 2=보통, 3=붐빔</p>
          </div>`;
        el.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pop = btn.dataset.pop!;
            const ratio = pop === 'low' ? 0.3 : pop === 'normal' ? 0.6 : 1.0;
            // 비플레이어블 NPC 중 일부만 활성 위치에 배치
            // RDC(히페리온) 캐릭터는 비율과 무관하게 항상 활성 유지
            const npcs = session.actors.filter(a => !a.playable);
            const regularNpcs = npcs.filter(npc => !getHyperionEntry(npc.name));
            const activeCount = Math.floor(regularNpcs.length * ratio);
            regularNpcs.forEach((npc, i) => {
              if (i >= activeCount) {
                npc.stationary = true; // 비활성 NPC는 고정
              }
            });
            sm.pop();
            afterDone();
          });
        });
      },
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === '2' || key === '3') {
          const btn = c.querySelector(`[data-pop="${key === '1' ? 'low' : key === '2' ? 'normal' : 'high'}"]`) as HTMLButtonElement | null;
          btn?.click();
        }
      },
    });
  }

  // --- 배경 스토리 화면 → 게임 시작 ---
  function showBackgroundThenGame() {
    const p = session.player;
    const bg = p.background;
    if (bg) {
      const lines = bg.split('|').map((l: string) => l.trim()).filter((l: string) => l);
      sm.push({
        id: 'background',
        render(el) {
          el.innerHTML = `
            <div class="screen info-screen" style="justify-content:center;text-align:center">
              <h2>${p.name}</h2>
              <div class="text-display" style="text-align:left;line-height:1.8">
                ${lines.map((l: string) => `<p>${l}</p>`).join('')}
              </div>
              <button class="btn btn-primary" data-start>시작하기 [Enter]</button>
              <p class="hint">Enter 또는 터치로 계속</p>
            </div>`;
          el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); enterGame(); });
        },
        onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); enterGame(); } },
      });
    } else {
      enterGame();
    }
  }

  function autosave() {
    if (session.isValid) saveToSlot(0, session);
  }

  /** 플레이어의 hyperionBonus를 전체 총합 기준으로 초기화/갱신 */
  function syncHyperionBonus() {
    if (!session.isValid) return;
    const player = session.player;
    const oldMaxHp = Math.max(1, player.getEffectiveMaxHp());
    const oldMaxMp = Math.max(1, player.getEffectiveMaxMp());
    const hpRatio = Math.max(0, Math.min(1, player.base.hp / oldMaxHp));
    const mpRatio = Math.max(0, Math.min(1, player.base.mp / oldMaxMp));
    const total = session.actors.reduce((s, a) => s + a.hyperionLevel, 0);

    player.hyperionBonus = total - player.hyperionLevel;
    player.base.hp = Math.round(player.getEffectiveMaxHp() * hpRatio);
    player.base.mp = Math.round(player.getEffectiveMaxMp() * mpRatio);
  }

  function ensureHomeBase() {
    if (!session.isValid) return;
    const homeLocId = session.player.homeLocation;
    if (!homeLocId) return;
    if (!session.knowledge.ownedBases.has(homeLocId)) {
      session.knowledge.purchaseBase(homeLocId);
    }
  }

  /** 디버그 캐릭터 "디버그-모노" 초기 세팅: 모든 아이템·스킬·동료, 히페리온 200 */
  function setupDebugCharacter() {
    const p = session.player;

    // 인벤토리 무제한 (디버그 전용)
    session.knowledge.bagCapacity = 9999;

    // 골드 99999G
    p.addGold(99999);

    // 모든 개별 아이템 (ID 기반) 지급
    for (const [id] of getAllItemDefs()) {
      p.addItemById(id, 99);
      session.knowledge.discoverItem(id);
    }

    // 모든 스택형 아이템 타입 지급
    for (let t = 0; t < (ItemType.Count as number); t++) {
      p.addItem(t as ItemType, 99);
    }

    // 모든 스킬 최대 레벨(5)로 습득
    for (const [id] of getAllSkillDefs()) {
      p.learnedSkills.set(id, 5);
      if (!p.skillOrder.includes(id)) p.skillOrder.push(id);
    }

    // 모든 NPC를 동료로 등록 (파티 제한 우회)
    for (const actor of session.actors) {
      if (!actor.playable && !session.knowledge.partyMembers.includes(actor.name)) {
        session.knowledge.partyMembers.push(actor.name);
        session.knowledge.recruitedEver.add(actor.name);
      }
    }

    // 히페리온 레벨 200
    p.hyperionLevel = 200;
    p.hasHyperion = true;
  }

  function showWelcomePopup() {
    const p = session.player;
    const locDisplay = locationName(p.currentLocation) || p.currentLocation;
    const homeDisplay = locationName(p.homeLocation) || p.homeLocation;

    sm.push({
      id: 'welcome',
      render(el) {
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center">
            <h2>⭐ ${p.name}의 이야기</h2>
            <p style="text-align:center;color:var(--text-dim);margin-bottom:12px">
              세계에 오신 것을 환영합니다.
            </p>
            <div style="font-size:13px;margin-bottom:12px;padding:8px 12px;background:var(--bg-card);border-radius:6px">
              <p>📍 현재 위치: <b>${locDisplay}</b></p>
              <p style="margin-top:4px">🏠 첫 거점: <b>${homeDisplay}</b> <span style="color:var(--text-dim);font-size:11px">(길드에서 업그레이드 가능)</span></p>
            </div>

            <div style="margin:8px 0;padding:8px 12px;background:var(--bg-card);border-radius:6px;border-left:3px solid var(--accent)">
              <p style="font-weight:600;margin-bottom:6px">⚔ 전투 플레이</p>
              <p style="font-size:12px;color:var(--text-dim)">NPC와 대화해 <b>동료로 영입</b>하고, <b>히페리온 레벨</b>을 높여 능력치를 강화하세요.</p>
              <p style="font-size:12px;color:var(--text-dim);margin-top:4px">장비를 갖추고 던전에 도전해 더 깊은 층을 클리어하는 것이 목표입니다.</p>
            </div>

            <div style="margin:8px 0;padding:8px 12px;background:var(--bg-card);border-radius:6px;border-left:3px solid var(--success)">
              <p style="font-weight:600;margin-bottom:6px">🌿 생활 플레이</p>
              <p style="font-size:12px;color:var(--text-dim)">채집·요리·농장으로 <b>돈을 모으고</b>, <b>생활 직업 레벨</b>을 올려 수익을 높이세요.</p>
              <p style="font-size:12px;color:var(--text-dim);margin-top:4px">NPC들과 친밀도를 쌓아 영향력을 높이고, 여러 <b>거점을 구매·업그레이드</b>하는 것이 목표입니다.</p>
            </div>

            <button class="btn btn-primary" data-start style="margin-top:12px;min-height:44px">시작하기 [Enter]</button>
            <p class="hint">Enter 또는 터치로 계속</p>
          </div>
        `;
        el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); showGame(); });
      },
      onKey(key) {
        if (key === 'Enter' || key === ' ' || key === 'Escape') {
          sm.pop();
          showGame();
        }
      },
    });
  }

  function enterGame() {
    // 코어 매트릭스 진단 결과 적용
    const diagColors = (session as any)._diagColorValues as number[] | undefined;
    const diagScoresStored = (session as any)._diagScores as number[][] | undefined;
    if (diagColors) {
      for (let i = 0; i < 8; i++) {
        session.player.color.values[i] = Math.max(0, Math.min(1,
          (session.player.color.values[i] + diagColors[i]) / 2
        ));
      }
    }
    if (diagScoresStored) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          session.player.coreMatrix.diagScores[r][c] = diagScoresStored[r][c];
        }
      }
    }
    session.player.coreMatrix.recalculate(session.player.color.values);
    // 진단 결과 소비 후 제거
    delete (session as any)._diagColorValues;
    delete (session as any)._diagScores;

    markHasEverStarted();
    session.knowledge.addKnownName(session.player.name);
    session.knowledge.trackVisit(session.player.currentLocation);
    // 시작 거점: homeLocation을 Lv.1 거점으로 자동 등록
    ensureHomeBase();

    if (session.player.name === '디버그-모노') {
      // 디버그 캐릭터: 모든 아이템, 스킬, 동료, 히페리온 레벨 200 세팅
      setupDebugCharacter();
    } else {
      // Give starter items
      const starterItems = ['wheat_bread', 'wheat_bread', 'wheat_bread', 'fresh_water', 'fresh_water', 'common_herb'];
      for (const id of starterItems) {
        session.player.addItemById(id, 1);
        session.knowledge.discoverItem(id);
      }
    }
    session.backlog.add(session.gameTime, `${session.player.name}의 이야기가 시작된다.`, '시스템');
    autosave();
    if (session.player.name === '디버그-모노') {
      showGame();
    } else {
      showWelcomePopup();
    }
  }

  // --- 게임 메인 화면 ---
  function showGame() {
    syncHyperionBonus();
    ensureHomeBase();
    // 미정의/링크 없는 지역에 있으면 Alimes로 이동 (레거시 저장 파일 대응)
    const p = session.player;
    const locData = session.world.getAllLocations().get(p.currentLocation);
    if (!locData || (locData.linksBidirectional.length === 0 && locData.linksOneWayOut.length === 0)) {
      p.currentLocation = p.homeLocation;
      // homeLocation도 미정의면 Alimes로
      const homeData = session.world.getAllLocations().get(p.homeLocation);
      if (!homeData) { p.currentLocation = 'Alimes'; p.homeLocation = 'Alimes'; }
    }
    sm.replace(createGameScreen(session, (target) => {
      switch (target) {
        case 'move':
          sm.push(createMoveScreen(session, () => sm.pop(), (fromId, toId, minutes) => {
            sm.pop(); // move 화면 닫기
            sm.push(createTravelScreen(session, fromId, toId, minutes, () => sm.pop(), computeTravelSpeed(session)));
          }));
          break;
        case 'talk':
          sm.push(createDialogueScreen(session, {
            onTalk() { /* backlog에 이미 기록됨 */ },
            onRecruit(_npcName) {
              // 영입은 dialogue 내부에서 tryRecruitCompanion으로 처리됨
              // 영입 직후 히페리온 조건이 충족되었을 수 있으니 오버레이 체크
              popThenMaybeHyperion();
            },
            onInfo(_npcName, npcActor) {
              sm.push(createNpcInfoScreen(session, npcActor, () => sm.pop()));
            },
            onBack() { popThenMaybeHyperion(); },
          }));
          break;
        case 'eat':
          sm.push(createInventoryScreen(session, () => sm.pop(), (itemId) => {
            sm.pop();
            if (itemId === 'pioneer_plan') {
              sm.push(createVillageBuildScreen(session, () => sm.pop(), () => {
                sm.pop();
                sm.render();
              }));
            }
          }));
          break;
        case 'trade':
          sm.push(createTradeScreen(session, () => { session.gameTime.advance(15); popThenMaybeHyperion(); }));
          break;
        case 'dungeon':
          sm.push(createDungeonScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'quest':
          sm.push(createQuestBoardScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'activity':
          sm.push(createActivityScreen(session, () => sm.pop(), (config) => {
            sm.pop(); // 활동 목록 닫기
            sm.push(createActivitySimScreen(session, config, () => popThenMaybeHyperion()));
          }));
          break;
        case 'gather': {
          const gs = (session as any)._pendingGatherSim;
          delete (session as any)._pendingGatherSim;
          if (gs) sm.push(createActivitySimScreen(session, gs, () => sm.pop()));
          break;
        }
        case 'gift':
          sm.push(createGiftScreen(session, () => sm.pop()));
          break;
        case 'home':
          sm.push(createHomeScreen(session, () => sm.pop(), (screen) => {
            if (screen === 'storage') sm.push(createStorageScreen(session, () => sm.pop()));
            else if (screen === 'cooking') sm.push(createCookingScreen(session, () => popThenMaybeHyperion()));
            else if (screen === 'farm') sm.push(createFarmScreen(session, session.player.currentLocation, () => sm.pop()));
          }));
          break;
        case 'storage':
          sm.push(createStorageScreen(session, () => sm.pop()));
          break;
        case 'realestate':
          sm.push(createRealEstateScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'cooking':
          sm.push(createCookingScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'skill_shop':
          sm.push(createSkillShopScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'guild_dungeon':
          sm.push(createGuildDungeonScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'puchi_tower':
          sm.push(createPuchiTowerScreen(session, () => popThenMaybeHyperion()));
          break;
        case 'life_job':
          sm.push(createLifeJobScreen(session, () => sm.pop()));
          break;
        case 'ferry':
          sm.push(createFerryScreen(session, () => sm.pop(), (fromId, toId, minutes) => {
            sm.pop(); // ferry 화면 닫기
            sm.push(createTravelScreen(session, fromId, toId, minutes, () => sm.pop(), computeTravelSpeed(session)));
          }));
          break;
        case 'memory_spring':
          sm.push(createMemorySpringScreen(session, {
            onBack: () => sm.pop(),
            onSoulImprint: () => {
              // 영혼 각인: 현재 캐릭터를 NPC로 변환 후 캐릭터 선택
              const current = session.player;
              current.playable = false;
              current.isCustom = false;
              current.coreMatrix.recalculate(current.color.values);
              session.playerIdx = -1;
              // 오토세이브 삭제 (이어하기 방지)
              localStorage.removeItem('emergent_save_0');
              sm.pop(); // memory spring 닫기
              proceedToCharCreate();
            },
            onDeparture: () => {
              // 이탈: 현재 캐릭터를 NPC로 복귀 (새 데이터 생성 없음)
              const current = session.player;
              current.playable = false;
              session.playerIdx = -1;
              // 오토세이브 삭제 (이어하기 방지)
              localStorage.removeItem('emergent_save_0');
              sm.pop(); // memory spring 닫기
              proceedToCharCreate();
            },
            onRebirth: () => {
              // 천도제: 현재 캐릭터 제거 후 캐릭터 선택
              const current = session.player;
              const idx = session.actors.indexOf(current);
              if (idx >= 0) session.actors.splice(idx, 1);
              session.playerIdx = -1;
              // 오토세이브 삭제 (이어하기 방지)
              localStorage.removeItem('emergent_save_0');
              sm.pop(); // memory spring 닫기
              proceedToCharCreate();
            },
          }));
          break;
        case 'info_backlog':
          sm.push(createBacklogScreen(session, () => sm.pop()));
          break;
        case 'info_hyperion':
          sm.push(createHyperionScreen(session, () => sm.pop()));
          break;
        case 'info_party':
          sm.push(createPartyScreen(session, () => sm.pop()));
          break;
        case 'info_titles':
          sm.push(createTitlesScreen(session, () => sm.pop()));
          break;
        case 'info_map':
          sm.push(createWorldMapScreen(session, () => sm.pop()));
          break;
        case 'info_encyclopedia':
          sm.push(createEncyclopediaScreen(session, () => sm.pop()));
          break;
        case 'info_skills':
          sm.push(createSkillManageScreen(session, () => sm.pop()));
          break;
        case 'info_inventory':
          sm.push(createInventoryScreen(session, () => sm.pop(), (itemId) => {
            sm.pop(); // inventory 닫기
            if (itemId === 'pioneer_plan') {
              sm.push(createVillageBuildScreen(session, () => sm.pop(), () => {
                sm.pop(); // build 화면 닫기
                sm.render(); // game-screen 갱신
              }));
            }
          }));
          break;
        case 'village':
          if (!session.knowledge.villageState) break;
          sm.push(createVillageScreen(session, () => popThenMaybeHyperion(), sm));
          break;
        case 'save':
          sm.push(createSaveLoadScreen(session, true, () => sm.pop()));
          break;
        case 'level_up':
          sm.push(createLevelUpScreen(session, () => sm.pop()));
          break;
        case 'hyperion_levelup':
          // pendingHyperionMsgs 큐가 비어있으면 무시 (방어 로직)
          if (session.pendingHyperionMsgs.length === 0) break;
          // 이미 오버레이가 최상단이면 중복 push 방지
          if (sm.peek()?.id === HYPERION_OVERLAY_ID) break;
          sm.push(createHyperionLevelupScreen(session, sm));
          break;
        case 'info_status':
        case 'info_color':
          sm.push(createStatusScreen(session, () => sm.pop()));
          break;
        default:
          if (target.startsWith('info_')) {
            sm.push(createInfoScreen(session, target, () => sm.pop()));
          }
          break;
      }
    }, autosave));
    input.setIdleCallback(() => {
      processTurn(session, 'idle');
      autosave();
      sm.render();
    }, 30000);

    // 로드/오프라인 시뮬레이션 등으로 쌓인 pending 히페리온 메시지가 있으면 오버레이
    if (session.pendingHyperionMsgs.length > 0 && sm.peek()?.id !== HYPERION_OVERLAY_ID) {
      sm.push(createHyperionLevelupScreen(session, sm));
    }
  }

  // --- 새 게임: 이전 캐릭터 NPC화 선택 후 캐릭터 생성으로 이동 ---
  function proceedToCharCreate() {
    // 플레이어별 상태 초기화 (세계는 유지)
    session.backlog.clear();
    session.knowledge = new PlayerKnowledge();
    session.playerIdx = -1;

    const gs = getGlobalSave();
    const isFirstPlay = !gs.hasEverStarted;
    const extraPlayableNames = isFirstPlay ? new Set<string>() : getActivePackPlayableNames(session.actors);

    sm.replace(createCharacterSelectScreen(
      session.actors,
      (idx) => {
        session.playerIdx = idx;
        if (isFirstPlay) session.actors[idx].flags.set('first_run_hako', true);
        showPopulationSelect(() => showBackgroundThenGame());
      },
      () => {
        // 탄생
        sm.push(createBirthScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => {
        // 커스텀
        sm.push(createCustomCharScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => showMainMenu(),
      { isFirstPlay, extraPlayableNames },
    ));
  }

  // --- 캐릭터 선택 (새 게임 진입점) ---
  function showCharSelect() {
    const currentPlayer = session.isValid ? session.player : null;

    if (currentPlayer && currentPlayer.isCustom) {
      // 커스텀 캐릭터 → NPC화 여부 묻기
      sm.push({
        id: 'npc-choice',
        render(el) {
          el.innerHTML = `
            <div class="screen info-screen" style="justify-content:center;text-align:center">
              <h2>새로운 시작</h2>
              <p>${currentPlayer.name}을(를) 이 세계의 주민으로 남기시겠습니까?</p>
              <p class="hint">NPC로 남기면 이 세계에서 계속 살아갑니다.</p>
              <div class="menu-buttons" style="margin-top:16px">
                <button class="btn btn-primary" data-choice="npc">1. 주민으로 남긴다</button>
                <button class="btn" data-choice="remove">2. 떠나보낸다</button>
              </div>
              <p class="hint">1=주민으로, 2=떠나보내기, Esc=취소</p>
            </div>`;
          el.querySelector('[data-choice="npc"]')?.addEventListener('click', () => {
            currentPlayer.playable = false;
            currentPlayer.isCustom = false;
            currentPlayer.coreMatrix.recalculate(currentPlayer.color.values);
            sm.pop();
            proceedToCharCreate();
          });
          el.querySelector('[data-choice="remove"]')?.addEventListener('click', () => {
            const idx = session.actors.indexOf(currentPlayer);
            if (idx >= 0) session.actors.splice(idx, 1);
            sm.pop();
            proceedToCharCreate();
          });
        },
        onKey(key) {
          if (key === '1') {
            const btn = document.querySelector<HTMLButtonElement>('[data-choice="npc"]');
            btn?.click();
          } else if (key === '2') {
            const btn = document.querySelector<HTMLButtonElement>('[data-choice="remove"]');
            btn?.click();
          } else if (key === 'Escape') {
            sm.pop();
          }
        },
      });
    } else {
      // 기존 NPC를 플레이어로 했거나 세션 없음 → 조용히 복귀
      if (currentPlayer) {
        currentPlayer.playable = false;
        currentPlayer.coreMatrix.recalculate(currentPlayer.color.values);
      }
      proceedToCharCreate();
    }
  }

  // --- 로어 화면 ---
  function showLore() {
    sm.push(createLoreScreen(data.lore, () => sm.pop()));
  }

  // --- 튜토리얼 화면 ---
  function showTutorial() {
    sm.push({
      id: 'tutorial',
      render(el) {
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
            <h2>튜토리얼</h2>
            <div class="text-display" style="font-size:13px;line-height:1.8">
              <p><b>기본 조작</b></p>
              <p>• 숫자 키 또는 버튼으로 행동 선택 · Esc = 뒤로/취소</p>
              <p></p>
              <p><b>행동 키 (상황에 따라 표시됨)</b></p>
              <p>• 1=대기 · 2=이동 · 3=대화 · 4=거래 · 5=소지품</p>
              <p>• 6=휴식 · 7=던전 · 8=채집 · 9=퀘스트 · 0=활동</p>
              <p>• g=선물 · h=자택 · n=부동산 · j=던전 정보</p>
              <p>• m=기억의 샘 · f=배편 · v=마을 · l=학습/생활 직업</p>
              <p></p>
              <p><b>정보 단축키 (언제든 사용 가능)</b></p>
              <p>• i=상태 · y=히페리온 · p=동료 · r=관계 · b=백로그</p>
              <p>• t=칭호 · M=지도 · e=도감 · k=스킬 · S=저장/불러오기</p>
              <p></p>
              <p><b>기력(TP) 시스템</b></p>
              <p>• 화면의 노란 칸이 TP(행동력), 최대 3칸</p>
              <p>• 채집·휴식 등 일부 행동은 TP를 소모합니다</p>
              <p>• 자택에서 잠자기를 하면 TP가 완전히 회복됩니다</p>
              <p></p>
              <p><b>시간과 세계</b></p>
              <p>• 행동마다 시간이 경과하고 NPC들도 각자 움직입니다</p>
              <p>• 30초간 입력이 없으면 자동으로 대기합니다</p>
              <p>• 밤에는 일부 장소가 닫히고 특별한 NPC가 등장합니다</p>
              <p></p>
              <p><b>컬러 시스템</b></p>
              <p>• 8속성(불/물/전기/철/흙/바람/빛/어둠)이 캐릭터 성향을 결정</p>
              <p>• 이벤트·대화·활동에 따라 컬러가 서서히 변화합니다</p>
              <p>• 화면 우측 게이지 바에서 실시간 확인 가능</p>
              <p></p>
              <p><b>성장 시스템</b></p>
              <p>• 레벨업 시 스탯·컬러·스킬 중 하나를 선택해 강화합니다</p>
              <p>• 히페리온(y): 캐릭터별 고유 과제 달성으로 HP·MP·공격·방어 영구 상승</p>
              <p>• 스킬(k): 사용할수록 숙련도가 오르며 레벨업 시 위력 증가</p>
              <p></p>
              <p><b>관계와 동료</b></p>
              <p>• NPC와 대화·선물(g)로 친밀도를 쌓으세요</p>
              <p>• 처음 만난 NPC는 ???로 표시됩니다 (대화하면 이름을 알게 됨)</p>
              <p>• 친밀도가 충분하면 동료로 초대 가능, 최대 3명 동행</p>
              <p></p>
              <p><b>거점과 생활</b></p>
              <p>• 부동산(n)에서 자택 구입 시 요리·농장·창고를 이용할 수 있습니다</p>
              <p>• 농장에서 작물을 키워 판매하거나 요리 재료로 활용하세요</p>
              <p>• 거점 레벨을 높이면 채집 효율·요리 효과 향상 등이 해금됩니다</p>
              <p></p>
              <p><b>던전과 전투</b></p>
              <p>• 던전은 방 기반 탐색: 좌/우/샛길/되돌아가기를 선택하며 진행</p>
              <p>• 전투는 자동 공격 + 스킬 슬롯 3개로 실시간 진행됩니다</p>
              <p>• 패배하면 자택으로 돌아가고 하루가 경과합니다</p>
              <p></p>
              <p><b>기억의 샘</b></p>
              <p>• 영혼 보존: 캐릭터를 NPC로 각인하고 새 캐릭터를 시작합니다</p>
              <p>• 천도제: 캐릭터를 완전히 삭제하고 새 캐릭터를 시작합니다</p>
              <p>• 세계는 하나뿐 — 새 캐릭터도 같은 세계를 살아갑니다</p>
            </div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => sm.pop());
      },
      onKey(key) { if (key === 'Escape') sm.pop(); },
    });
  }

  // --- 코어 매트릭스 진단 ---
  function showCoreMatrix() {
    const questions = initResult.diagnosticQuestions;
    let qIdx = 0;
    const colorValues = new Array(8).fill(0.5);
    const diagScores: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));

    function renderQ(el: HTMLElement) {
      if (qIdx >= questions.length) {
        // 완료 — 8x8 결과 매트릭스 표시 (diagScores 적용)
        const matrix = new CoreMatrix();
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            matrix.diagScores[r][c] = diagScores[r][c];
          }
        }
        matrix.recalculate(colorValues);
        // 결과 저장 (캐릭터 생성 시 적용)
        (session as any)._diagColorValues = colorValues.slice();
        (session as any)._diagScores = diagScores.map(row => row.slice());
        const gridCells: string[] = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const on = matrix.getCell(r, c);
            const bg = on ? `var(--el-${r})` : 'var(--bg-card)';
            const border = on ? 'transparent' : 'var(--border)';
            gridCells.push(`<div class="cm-cell" style="background:${bg};border:1px solid ${border}"></div>`);
          }
        }
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center;text-align:center">
            <h2>진단 완료</h2>
            <div class="cm-grid">${gridCells.join('')}</div>
            <p>이 결과는 탄생 시 캐릭터에 적용됩니다.</p>
            <button class="btn btn-primary" data-done>확인 [Enter]</button>
          </div>`;
        el.querySelector('[data-done]')?.addEventListener('click', () => sm.pop());
        return;
      }
      const q = questions[qIdx];
      el.innerHTML = `
        <div class="screen info-screen" style="justify-content:center">
          <h2>코어 매트릭스 진단 (${qIdx + 1}/${questions.length})</h2>
          <p style="font-size:16px;text-align:center;margin:16px 0">${q.text}</p>
          <div class="menu-buttons" style="width:100%">
            <button class="btn" data-choice="a">A. ${q.optionA}</button>
            <button class="btn" data-choice="b">B. ${q.optionB}</button>
          </div>
          <button class="btn back-btn" data-cancel style="margin-top:12px">취소하고 나가기 [Esc]</button>
          <p class="hint">1=A, 2=B, Esc=취소</p>
        </div>`;
      el.querySelector('[data-choice="a"]')?.addEventListener('click', () => { applyChoice('a'); renderQ(el); });
      el.querySelector('[data-choice="b"]')?.addEventListener('click', () => { applyChoice('b'); renderQ(el); });
      el.querySelector('[data-cancel]')?.addEventListener('click', () => sm.pop());
    }

    function applyChoice(choice: 'a' | 'b') {
      const q = questions[qIdx];
      if (choice === 'a') {
        for (const { element, value } of q.colorA) {
          colorValues[element] = Math.max(0, Math.min(1, colorValues[element] + value));
        }
        for (const { row, col, weight } of q.influences) {
          diagScores[row][col] += weight;
        }
      } else {
        for (const { element, value } of q.colorB) {
          colorValues[element] = Math.max(0, Math.min(1, colorValues[element] + value));
        }
        for (const { row, col, weight } of q.influences) {
          diagScores[row][col] -= weight;
        }
      }
      qIdx++;
    }

    sm.push({
      id: 'corematrix',
      render: renderQ,
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === 'a') { applyChoice('a'); renderQ(c); }
        else if (key === '2' || key === 'b') { applyChoice('b'); renderQ(c); }
        else if (key === 'Enter' && qIdx >= questions.length) sm.pop();
        else if (key === 'Escape') sm.pop();
      },
    });
  }

  // --- 메인 메뉴용 시간 계산 ---
  function getMenuGameTime(): GameTime {
    const raw = localStorage.getItem('emergent_save_0');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const t = new GameTime();
        t.day    = parsed.gameTimeDay    ?? 1;
        t.hour   = parsed.gameTimeHour   ?? 6;
        t.minute = parsed.gameTimeMinute ?? 0;
        return t;
      } catch { /* fallthrough */ }
    }
    // 세이브 없으면 실제 KST(UTC+9) 시간
    const t = new GameTime();
    const now = new Date();
    t.hour   = (now.getUTCHours() + 9) % 24;
    t.minute = now.getUTCMinutes();
    return t;
  }

  // --- 메인 메뉴 ---
  function showMainMenu() {
    // 메인 메뉴 진입 시 팩 해금 상태 재확인 (오프라인 중 조건 달성 가능성)
    checkAndUnlockPacks(session.actors);
    const packProgress = getAllPackProgress(session.actors);
    const menu = createMainMenuScreen(checkHasAutosave(), (choice) => {
      switch (choice) {
        case 'new': showCharSelect(); break;
        case 'connect': {
          if (!loadFromSlot(0, session)) { showCharSelect(); break; }
          if (!session.isValid) { showCharSelect(); break; }
          syncHyperionBonus();
          ensureHomeBase();

          // 경과 시간 계산 (세이브 시각 → 현재)
          const raw = localStorage.getItem('emergent_save_0');
          let elapsedMinutes = 0;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const savedAt = parsed?.meta?.savedAt as string | undefined;
              if (savedAt) {
                const savedDate = new Date(savedAt);
                if (!isNaN(savedDate.getTime())) {
                  elapsedMinutes = Math.floor((Date.now() - savedDate.getTime()) / 60000);
                }
              }
            } catch { /* ignore */ }
          }

          // 최소 5분 경과 시 오프라인 시뮬레이션 실행
          if (elapsedMinutes >= 5) {
            const prevDay = session.gameTime.day;
            const prevLevel = session.player.base.level;
            const prevSeason = session.world.getCurrentSeason();

            fastForwardWorld(
              elapsedMinutes, session.gameTime, session.world,
              session.events, session.actors, session.social,
              session.backlog, session.knowledge,
            );

            // 오프라인 시뮬레이션 중 히페리온 조건이 충족됐을 수 있으므로 큐잉
            checkAndQueueHyperionLevelUps(session);

            const daysPassed = session.gameTime.day - prevDay;
            const levelsGained = session.player.base.level - prevLevel;
            const newSeason = session.world.getCurrentSeason();
            const seasonChanged = newSeason !== prevSeason;

            // 요약 화면 표시
            sm.push({
              id: 'offline-summary',
              render(el) {
                let summary = '';
                summary += `<p>부재 시간: 약 ${elapsedMinutes >= 60 ? Math.floor(elapsedMinutes / 60) + '시간 ' + (elapsedMinutes % 60) + '분' : elapsedMinutes + '분'}</p>`;
                if (daysPassed > 0) summary += `<p>${daysPassed}일이 흘렀다.</p>`;
                if (levelsGained > 0) summary += `<p>레벨이 ${levelsGained} 올랐다! (Lv.${session.player.base.level})</p>`;
                if (seasonChanged) summary += `<p>계절이 ${seasonName(newSeason)}(으)로 바뀌었다.</p>`;
                summary += `<p>현재: ${session.gameTime.toString()}</p>`;
                summary += `<p>HP: ${Math.round(session.player.base.hp)}/${Math.round(session.player.getEffectiveMaxHp())} · MP: ${Math.round(session.player.base.mp)}/${Math.round(session.player.getEffectiveMaxMp())} · TP: ${session.player.base.ap}/${session.player.getEffectiveMaxAp()}</p>`;

                el.innerHTML = `
                  <div class="screen info-screen" style="justify-content:center;text-align:center">
                    <h2>재접속</h2>
                    <div class="text-display" style="line-height:1.8">${summary}</div>
                    <button class="btn btn-primary" data-start>계속하기 [Enter]</button>
                  </div>`;
                el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); autosave(); showGame(); });
              },
              onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); autosave(); showGame(); } },
            });
          } else {
            showGame();
          }
          break;
        }
        case 'lore': showLore(); break;
        case 'tutorial': showTutorial(); break;
        case 'corematrix':
          showCoreMatrix();
          break;
        case 'datapack':
          sm.push(createDataPackScreen((_config) => {
            sm.pop();
            // 설정 저장 후 메뉴로 복귀 (새 게임 시 반영됨)
          }, session.actors));
          break;
        case 'debug_reset':
          sm.push({
            id: 'debug-reset',
            render(el) {
              el.innerHTML = `
                <div class="screen info-screen" style="justify-content:center;text-align:center">
                  <h2 style="color:var(--accent)">⚠ 세계 리셋 (디버그)</h2>
                  <p style="color:var(--text-dim);line-height:1.8;margin:16px 0">
                    모든 NPC의 관계, 히페리온, 컬러, 레벨 등<br>
                    세계 전체를 초기 상태로 되돌립니다.<br>
                    오토세이브 데이터도 삭제됩니다.<br><br>
                    <strong style="color:var(--accent)">이 작업은 되돌릴 수 없습니다.</strong>
                  </p>
                  <div style="display:flex;gap:8px;justify-content:center">
                    <button class="btn" data-cancel style="min-width:120px">취소 [Esc]</button>
                    <button class="btn btn-primary" data-confirm style="min-width:120px">리셋 실행 [Enter]</button>
                  </div>
                </div>`;
              el.querySelector('[data-cancel]')?.addEventListener('click', () => sm.pop());
              el.querySelector('[data-confirm]')?.addEventListener('click', executeDebugReset);
            },
            onKey(key) {
              if (key === 'Escape') sm.pop();
              if (key === 'Enter') executeDebugReset();
            },
          });
          break;
      }
    }, getMenuGameTime(), packProgress);
    sm.replace(menu);
  }

  function executeDebugReset(): void {
    // 세이브 데이터 삭제
    localStorage.removeItem('emergent_save_0');
    // 세계 완전 재초기화
    const freshResult = initAll(data);
    session.actors = freshResult.actors;
    session.world = freshResult.world;
    session.events = freshResult.events;
    session.dungeonSystem = freshResult.dungeonSystem;
    session.activitySystem = freshResult.activitySystem;
    session.world.seasonSchedule.init(1);
    session.world.updateWeatherAndTemp();
    session.playerIdx = -1;
    session.backlog.clear();
    session.knowledge = new PlayerKnowledge();
    sm.pop(); // debug-reset 화면 닫기
    showMainMenu();
  }

  showMainMenu();
}

boot().catch(err => {
  app.innerHTML = `<div class="screen menu-screen"><p style="color:#e94560">에러: ${err}</p></div>`;
});
