<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ActiveFocus from './lib/components/ActiveFocus.svelte';
  import AppHeader from './lib/components/AppHeader.svelte';
  import BoardLayer from './lib/components/BoardLayer.svelte';
  import BoardPromptStrip from './lib/components/prompts/BoardPromptStrip.svelte';
  import CardPreview from './lib/components/CardPreview.svelte';
  import EndGamePrompt from './lib/components/EndGamePrompt.svelte';
  import GameBoard from './lib/components/GameBoard.svelte';
  import GameStatus from './lib/components/GameStatus.svelte';
  import Hand from './lib/components/Hand.svelte';
  import ImportScreen from './lib/components/ImportScreen.svelte';
  import LogPanel from './lib/components/LogPanel.svelte';
  import ManualLabelPanel from './lib/components/ManualLabelPanel.svelte';
  import PlayerPanel from './lib/components/PlayerPanel.svelte';
  import PromptGallery from './lib/components/prompt-gallery/PromptGallery.svelte';
  import PromptDock from './lib/components/prompts/PromptDock.svelte';
  import PromptHost from './lib/components/prompts/PromptHost.svelte';
  import ReplayTimeline from './lib/components/ReplayTimeline.svelte';
  import SetupDock from './lib/components/SetupDock.svelte';
  import TableShell from './lib/components/TableShell.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import ZoneViewer from './lib/components/ZoneViewer.svelte';
  import type { GameCommandApi } from './lib/game/gameApi';
  import { localGameApi } from './lib/game/httpClient';
  import {
    activeMatchCheckpointRepository,
    readActiveSessionPointer,
    type ActiveMatchCheckpointV1,
  } from './lib/game/activeMatchCheckpoint';
  import { resolveCardImageUrl } from './lib/game/cardImages';
  import { formatCanonicalDeckList } from './lib/game/deckImport';
  import {
    extractUploadedDeckFromZipFile,
    loadUploadedDecks,
  } from './lib/game/uploadedDecks';
  import {
    createUserDeck,
    deleteUserDeck,
    fetchUserDecks,
    migrateLegacyUploadedDecks,
    requestedUserDeckId,
    urlWithoutUserDeck,
    userDeckCardsForCabt,
    userDeckChoiceKey,
    userDeckUsesKnownCards,
    type UserDeck,
  } from './lib/game/userDecks';
  import { labelFor } from './lib/game/labels';
  import cardRows from './lib/cabt/cardData.generated.json';
  import { CabtAreaType } from './lib/cabt/types';
  import type { BoardInteractionStrategy } from './lib/game/boardInteraction';
  import {
    canPlayCardToBoardArea,
    canPlayCardToPlayArea,
    canPlayCardToSlot,
    canPlayerAct,
    canRetreatToSlot,
    playableBenchSlot,
    type BoardPlayAreaContext,
  } from './lib/game/playTargets';
  import { benchSlotsFor, previewAttachEnergySlot, previewSlot } from './lib/game/preview';
  import {
    autoResolvablePromptResult,
    extractPromptCards,
    promptBlockedIndexes,
    promptInstanceKey,
    promptOptions,
    shouldAutoResolvePrompt,
  } from './lib/game/prompts';
  import { getSetupPromptUiState, promptLimit, setupPromptResult } from './lib/game/setupPrompt';
  import { getAttachPromptTargets, getBoardPromptTargets, sameTarget, targetForPromptSlot } from './lib/game/targets';
  import { createChoosePokemonStrategy } from './lib/game/strategies/choosePokemonStrategy';
  import { createDamageTransferStrategy } from './lib/game/strategies/damageTransferStrategy';
  import { createPutDamageStrategy } from './lib/game/strategies/putDamageStrategy';
  import {
    loadAgentOptions,
    loadGameLogs,
    loadRoundRobinDeckCatalog,
    type AgentOption,
    type GameLogEntry,
    type RoundRobinDeckCatalog,
  } from './lib/home/catalog';
  import {
    SlotType,
    targetFor,
    type CardTarget,
    type CardView,
    type GameView,
    type PlayerView,
    type PokemonSlotView,
    type PromptView,
  } from './lib/game/types';
  import { deckImportStore } from './state/deckImport.svelte';
  import { gameStore } from './state/game.svelte';
  import { gameSessionStore } from './state/gameSession.svelte';
  import { liveTimelineStore } from './state/liveTimeline.svelte';
  import { promptLifecycleStore } from './state/promptLifecycle.svelte';
  import { damageTransferStore } from './state/damageTransfer.svelte';
  import { promptSelectionStore } from './state/promptSelection.svelte';
  import { replayStore } from './state/replay.svelte';
  import { cardPreviewStore } from './state/cardPreview.svelte';
  import {
    canAssignAttachTarget,
    isAttachEnergyAvailable as isAttachEnergyAvailableModel,
  } from './state/promptSelectionModel';
  import { selectionStore, type HandSelection } from './state/selection.svelte';
  import { setupSelectionStore } from './state/setupSelection.svelte';
  import {
    canPlaceSetupActive as canPlaceSetupActiveModel,
    canPlaceSetupBench as canPlaceSetupBenchModel,
    isSetupStartable as isSetupStartableModel,
    type SetupPlacementContext,
  } from './state/setupSelectionModel';
  import { viewSettingsStore } from './state/viewSettings.svelte';
  import { zoneViewerStore } from './state/zoneViewer.svelte';

  type HomeMode = 'play' | 'logs' | 'decks';
  type KnownDeckMemory = {
    cards: CardView[];
    complete: boolean;
  };
  type CabtCardRef = {
    id?: number;
    cardId?: number;
    serial?: number;
  };
  type CabtMoveLog = {
    type?: string | number;
    playerIndex?: number;
    fromArea?: number;
    toArea?: number;
    cardId?: number;
    serial?: number;
  };
  type ActiveMatchRestoreState = 'checking' | 'ready' | 'reconnecting' | 'invalid';

  let showPromptGallery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'prompt-gallery';
  const initialReplayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'replay';
  const initialRequestedUserDeckId = typeof window !== 'undefined' ? requestedUserDeckId(window.location.search) : '';
  let homeMode = $state<HomeMode>(initialReplayMode ? 'logs' : 'play');
  let agents = $state<AgentOption[]>([]);
  let gameLogs = $state<GameLogEntry[]>([]);
  let roundRobinDeckCatalog = $state<RoundRobinDeckCatalog>({ decks: [] });
  let userDecks = $state<UserDeck[]>([]);
  let pendingRequestedUserDeckId = $state(initialRequestedUserDeckId);
  let selectedAgentId = $state('');
  let selectedPlayerDeckId = $state('');
  let selectedOpponentDeckId = $state('');
  let lastAppliedReplayViewPreference = $state('');
  let catalogBusy = $state(false);
  let catalogError = $state('');
  let uploadBusy = $state(false);
  let uploadError = $state('');
  let userDeckBusy = $state(false);
  let userDeckError = $state('');
  let knownDecksByPlayer = $state<Record<number, KnownDeckMemory>>({});
  let appliedKnownDeckLogKeys = $state<string[]>([]);
  let activeMatchRestoreState = $state<ActiveMatchRestoreState>(
    initialReplayMode || showPromptGallery ? 'ready' : 'checking',
  );
  let activeMatchRestoreMessage = $state('');
  let checkpointSaveError = $state('');
  let restoredCheckpoint: ActiveMatchCheckpointV1 | null = null;
  let checkpointSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let checkpointWriteChain = Promise.resolve();
  let restoreRequestInFlight = false;
  let replayMode = $derived(homeMode === 'logs' && !!replayStore.replay);
  let liveTimelineMode = $derived(!replayMode && !!liveTimelineStore.replay);
  let liveTimelineBrowsingPast = $derived(liveTimelineMode && liveTimelineStore.isBrowsingPast);
  let game = $derived(replayMode ? replayStore.currentView : (liveTimelineStore.currentView ?? gameStore.game));
  let error = $derived(homeMode === 'logs' ? replayStore.error : gameStore.error);
  let busy = $derived(replayMode ? replayStore.loading : gameStore.busy);
  let sessionBusy = $derived(
    replayMode ? replayStore.loading : (busy || liveTimelineBrowsingPast || activeMatchRestoreState === 'reconnecting'),
  );
  let commandApi = $derived<GameCommandApi>(localGameApi);
  let resolvingPrompt = $derived(gameStore.resolvingPrompt);
  let promptInputSuppressed = $state(false);
  let promptInputSuppressTimer: ReturnType<typeof setTimeout> | null = null;
  let promptResolvingBlocked = $derived(
    resolvingPrompt || promptInputSuppressed || activeMatchRestoreState === 'reconnecting',
  );
  let selectedHand = $derived(selectionStore.selectedHand);
  let draggingHand = $derived(selectionStore.draggingHand);
  let focusedSlot = $derived(selectionStore.focusedSlot);
  let setupActiveIndex = $derived(setupSelectionStore.activeIndex);
  let setupBenchIndexes = $derived(setupSelectionStore.benchIndexes);
  let attachPromptEnergyIndex = $derived(promptSelectionStore.activeAttachEnergyIndex);
  let attachPromptAssignments = $derived(promptSelectionStore.attachAssignments);
  let followActive = $derived(viewSettingsStore.followActive);
  let autoConfirmPrompts = $derived(viewSettingsStore.autoConfirmPrompts);
  let viewIndex = $derived(viewSettingsStore.viewIndex);
  let boardTilt = $derived(viewSettingsStore.boardTilt);
  let boardPerspective = $derived(viewSettingsStore.boardPerspective);
  let boardScaleY = $derived(viewSettingsStore.boardScaleY);
  let boardLift = $derived(viewSettingsStore.boardLift);
  let debugZones = $derived(viewSettingsStore.debugZones);
  let showLogs = $derived(viewSettingsStore.showLogs);
  let theme = $derived(viewSettingsStore.theme);
  let themePreference = $derived(viewSettingsStore.themePreference);
  let selectedAgent = $derived(agents.find((agent) => agent.id === selectedAgentId));
  let workbenchReturnUrl = $derived(resolveWorkbenchReturnUrl());
  onMount(() => {
    const stopThemeSync = viewSettingsStore.startThemeSync();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeMatchRestoreState === 'reconnecting') {
        void retryActiveMatchRestore();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void initializeApp();
    return () => {
      stopThemeSync();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });
  onDestroy(() => {
    if (promptInputSuppressTimer) {
      clearTimeout(promptInputSuppressTimer);
    }
    if (checkpointSaveTimer) {
      clearTimeout(checkpointSaveTimer);
    }
  });
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = themePreference;
    document.documentElement.style.colorScheme = theme;
  });
  $effect(() => {
    document.body.classList.toggle('prompt-gallery-page', showPromptGallery);
    return () => {
      document.body.classList.remove('prompt-gallery-page');
    };
  });
  $effect(() => {
    const playerChoices = availablePlayerDeckChoiceKeys();
    const opponentChoices = availableOpponentDeckChoiceKeys();
    if (!playerChoices.length) {
      selectedPlayerDeckId = '';
    } else {
      const playerDeckId = playerChoices.includes(selectedPlayerDeckId) ? selectedPlayerDeckId : playerChoices[0];
      if (selectedPlayerDeckId !== playerDeckId) {
        selectedPlayerDeckId = playerDeckId;
      }
    }
    if (!opponentChoices.length) {
      selectedOpponentDeckId = '';
    } else {
      const opponentDeckId = opponentChoices.includes(selectedOpponentDeckId)
      ? selectedOpponentDeckId
        : opponentChoices.find((key) => key !== selectedPlayerDeckId) ?? opponentChoices[0];
      if (selectedOpponentDeckId !== opponentDeckId) {
        selectedOpponentDeckId = opponentDeckId;
      }
    }
  });
  $effect(() => {
    const deckText = deckTextForChoice(selectedPlayerDeckId);
    if (!deckText) {
      return;
    }
    deckImportStore.deck1Text = deckText;
  });
  $effect(() => {
    const deckText = deckTextForChoice(selectedOpponentDeckId);
    if (!deckText) {
      return;
    }
    deckImportStore.deck2Text = deckText;
  });
  $effect(() => {
    const replay = replayStore.replay;
    if (!replay) {
      lastAppliedReplayViewPreference = '';
      return;
    }
    const preferredPlayerIndex = replay.preferredPlayerIndex;
    if (typeof preferredPlayerIndex !== 'number') {
      return;
    }
    const replayIdentity = replayStore.currentReplayId || replay.id;
    const key = `${replayIdentity}:${preferredPlayerIndex}`;
    if (key === lastAppliedReplayViewPreference) {
      return;
    }
    lastAppliedReplayViewPreference = key;
    viewSettingsStore.switchToPlayer(preferredPlayerIndex);
  });
  let zoneViewerOpen = $derived(zoneViewerStore.open);
  let zoneViewerTitle = $derived(displayZoneViewerTitle());
  let zoneViewerFaceDown = $derived(displayZoneViewerFaceDown());
  let zoneViewerZone = $derived(zoneViewerStore.zone);
  let zoneViewerIsStadium = $derived(zoneViewerStore.zone === 'stadium');
  let projectedPileHover = $state('');
  let bottomHandForceCollapsed = $derived(projectedPileHover.endsWith('-discard') || (zoneViewerOpen && zoneViewerZone === 'discard'));
  let activePlayer = $derived(game?.players[game.activePlayerIndex]);
  let bottomPlayer = $derived(game?.players[viewIndex] ?? game?.players[0]);
  let topPlayer = $derived(game?.players.find((player) => player.index !== bottomPlayer?.index));
  let currentPrompt = $derived(replayMode || liveTimelineBrowsingPast ? null : game?.prompts[0]);
  let boardTargetPrompt = $derived(currentPrompt?.className === 'ChoosePokemonPrompt' ? currentPrompt : null);
  let attachPrompt = $derived(currentPrompt?.className === 'AttachEnergyPrompt' ? currentPrompt : null);
  let damagePrompt = $derived(currentPrompt?.className === 'PutDamagePrompt' ? currentPrompt : null);
  let attachPromptCards = $derived(attachPrompt ? extractPromptCards(attachPrompt.fields) : []);
  let attachPromptMin = $derived(normalizePromptLimit(promptOptions(attachPrompt).min, 0));
  let attachPromptMax = $derived(normalizePromptLimit(promptOptions(attachPrompt).max, attachPromptCards.length || 1));
  let attachPromptTargets = $derived(attachPrompt && game ? getAttachPromptTargets(game, attachPrompt) : []);
  let damagePromptTargets = $derived(damagePrompt && game ? getBoardPromptTargets(game, damagePrompt) : []);
  let damagePromptInstanceKey = $derived(promptInstanceKey(damagePrompt));
  let lastDamagePromptInstanceKey = $state('');
  $effect(() => {
    promptSelectionStore.pruneAttachAssignments(attachPromptCards, attachPromptTargets, attachPromptMax);
  });
  $effect(() => {
    promptSelectionStore.clearUnavailableAttachEnergy(isAttachEnergyAvailable);
  });
  $effect(() => {
    promptSelectionStore.pruneDamagePlacements(damagePromptTargets);
  });
  $effect(() => {
    if (damagePromptInstanceKey !== lastDamagePromptInstanceKey) {
      promptSelectionStore.resetDamagePlacements();
      lastDamagePromptInstanceKey = damagePromptInstanceKey;
    }
  });

  let transferPrompt = $derived(
    currentPrompt?.className === 'MoveDamagePrompt' || currentPrompt?.className === 'RemoveDamagePrompt'
      ? currentPrompt
      : null,
  );
  let transferPromptInstanceKey = $derived(promptInstanceKey(transferPrompt));
  let lastTransferPromptInstanceKey = $state('');
  $effect(() => {
    if (transferPromptInstanceKey !== lastTransferPromptInstanceKey) {
      damageTransferStore.reset();
      lastTransferPromptInstanceKey = transferPromptInstanceKey;
    }
  });
  let boardTargetPromptInstanceKey = $derived(promptInstanceKey(boardTargetPrompt));
  let lastBoardTargetPromptInstanceKey = $state('');
  $effect(() => {
    if (boardTargetPromptInstanceKey !== lastBoardTargetPromptInstanceKey) {
      promptSelectionStore.resetBoardTargets();
      lastBoardTargetPromptInstanceKey = boardTargetPromptInstanceKey;
    }
  });
  let boardStrategy = $derived<BoardInteractionStrategy | null>(
    game && currentPrompt ? createBoardStrategy(game, currentPrompt) : null,
  );
  $effect(() => {
    if (!boardStrategy || !game) {
      return;
    }
    window.addEventListener('click', clickBoardPromptSlotAtPoint, true);
    return () => {
      window.removeEventListener('click', clickBoardPromptSlotAtPoint, true);
    };
  });
  let autoResolvePromptResult = $derived(autoResolvablePromptResult(currentPrompt, game));
  let autoResolvePrompt = $derived(shouldAutoResolvePrompt(currentPrompt, autoConfirmPrompts, autoResolvePromptResult));
  let setupPrompt = $derived(
    currentPrompt?.className === 'ChooseCardsPrompt' && currentPrompt.message === 'CHOOSE_STARTING_POKEMONS'
      ? currentPrompt
      : null,
  );
  let setupPlayer = $derived(setupPrompt && game ? game.players[setupPrompt.playerIndex] : undefined);
  let setupBlockedIndexes = $derived(new Set<number>(promptBlockedIndexes(setupPrompt)));
  let setupUi = $derived(getSetupPromptUiState(promptOptions(setupPrompt), setupPlayer, setupActiveIndex));
  let setupMinSelections = $derived(setupUi.minSelections);
  let setupMaxSelections = $derived(setupUi.maxSelections);
  let setupHasEngineActive = $derived(setupUi.hasEngineActive);
  let setupNeedsActive = $derived(!!setupPrompt && setupUi.needsActive);
  let setupCanConfirm = $derived(!!setupPrompt && setupUi.canConfirm);
  let setupPlayableIndexes = $derived(setupPlayer
    ? setupPlayer.hand
        .map((card, index) => ({ card, index }))
        .filter(({ card, index }) => isSetupStartable(card, index))
        .map(({ index }) => index)
    : []);
  let setupPlacedIndexes = $derived(setupSelectionStore.placedIndexes);
  let setupSelectedIndex = $derived(
    selectedHand && setupPrompt?.playerIndex === selectedHand.playerIndex && setupPlayableIndexes.includes(selectedHand.handIndex)
      ? selectedHand.handIndex
      : undefined,
  );
  let setupPlacementContext = $derived<SetupPlacementContext>({
    promptPlayerIndex: setupPrompt?.playerIndex,
    selectedHandIndex: setupSelectedIndex,
    hasEngineActive: setupHasEngineActive,
    activeIndex: setupActiveIndex,
    benchIndexes: setupBenchIndexes,
    minSelections: setupMinSelections,
    benchCapacity: setupUi.benchCapacity,
  });

  function resetPerspective() {
    viewSettingsStore.resetPerspective();
  }

  function createBoardStrategy(currentGame: GameView, prompt: PromptView) {
    if (prompt.className === 'PutDamagePrompt') {
      return createPutDamageStrategy({
        game: currentGame,
        prompt,
        store: promptSelectionStore,
        resolve: (value) => void resolvePrompt(value),
      });
    }
    if (prompt.className === 'MoveDamagePrompt' || prompt.className === 'RemoveDamagePrompt') {
      return createDamageTransferStrategy({
        game: currentGame,
        prompt,
        store: damageTransferStore,
        resolve: (value) => void resolvePrompt(value),
      });
    }
    if (prompt.className === 'ChoosePokemonPrompt') {
      return createChoosePokemonStrategy({
        game: currentGame,
        prompt,
        store: promptSelectionStore,
        resolve: (value) => void resolvePrompt(value),
      });
    }
    return null;
  }

  $effect(() => {
    if (game && followActive && !replayMode) {
      viewSettingsStore.followPlayer(currentPrompt?.playerIndex ?? game.activePlayerIndex);
    }
  });
  let gameFinished = $derived(game?.phase === 7);
  let winnerName = $derived(
    game?.winner === 0 || game?.winner === 1
      ? game.players[game.winner]?.name
      : undefined,
  );
  let gameResultLabel = $derived(
    game?.winner === 3
      ? '引き分け'
      : winnerName
        ? `${winnerName}の勝ち`
        : gameFinished
          ? '試合終了'
          : '',
  );
  let currentPromptDockMode = $derived<'default' | 'search' | 'attachEnergy' | 'boardChoice'>(
    currentPrompt?.className === 'ChooseCardsPrompt'
      ? 'search'
      : currentPrompt?.className === 'CabtBoardChoicePrompt'
        ? 'boardChoice'
      : currentPrompt?.className === 'AttachEnergyPrompt'
        ? 'attachEnergy'
        : 'default',
  );
  let retreatSource = $state<PokemonSlotView | null>(null);
  let selectedCard = $derived(selectedHand && game ? game.players[selectedHand.playerIndex]?.hand[selectedHand.handIndex] : undefined);
  let draggingCard = $derived(draggingHand && game ? game.players[draggingHand.playerIndex]?.hand[draggingHand.handIndex] : undefined);
  let currentStadium = $derived(game ? game.players.flatMap((player) => player.stadium)[0] : undefined);
  let currentStadiumOwner = $derived(game?.players.find((player) => player.stadium.length));
  let viewedCards = $derived(cardsForOpenZone(game));
  let focusedPlayer = $derived(focusedSlot && game ? game.players[focusedSlot.ownerIndex] : undefined);
  let focusedIsActive = $derived(focusedSlot?.slot === 'active');
  let focusedCanAct = $derived(!!focusedPlayer && canAct(focusedPlayer.index));
  let focusedBenchTargets = $derived(focusedPlayer?.bench.filter((slot) => !slot.empty) ?? []);
  let topActiveSlot = $derived(topPlayer
    ? previewAttachEnergySlot(
        previewSlot(
          topPlayer.active,
          topPlayer.index === setupPrompt?.playerIndex && setupActiveIndex !== null ? topPlayer.hand[setupActiveIndex] : undefined,
        ),
        attachPrompt,
        attachPromptAssignments,
        attachPromptCards,
      )
    : undefined);
  let bottomActiveSlot = $derived(bottomPlayer
    ? previewAttachEnergySlot(
        previewSlot(
          bottomPlayer.active,
          bottomPlayer.index === setupPrompt?.playerIndex && setupActiveIndex !== null ? bottomPlayer.hand[setupActiveIndex] : undefined,
        ),
        attachPrompt,
        attachPromptAssignments,
        attachPromptCards,
      )
    : undefined);
  let topBenchSlots = $derived(topPlayer
    ? benchSlotsFor(topPlayer, setupPrompt, setupBenchIndexes).map((slot) =>
        previewAttachEnergySlot(slot, attachPrompt, attachPromptAssignments, attachPromptCards),
      )
    : []);
  let bottomBenchSlots = $derived(bottomPlayer
    ? benchSlotsFor(bottomPlayer, setupPrompt, setupBenchIndexes).map((slot) =>
        previewAttachEnergySlot(slot, attachPrompt, attachPromptAssignments, attachPromptCards),
      )
    : []);
  let topPlayerWithKnownDeck = $derived(topPlayer ? playerWithKnownDeck(topPlayer) : undefined);
  let bottomPlayerWithKnownDeck = $derived(bottomPlayer ? playerWithKnownDeck(bottomPlayer) : undefined);
  let canPlayOnBoard = $derived(
    !!bottomPlayer &&
    canPlayCardToBoardArea({
      selected: selectedCard,
      selectedPlayerIndex: selectedHand?.playerIndex,
      dragging: draggingCard,
      draggingPlayerIndex: draggingHand?.playerIndex,
      activePlayerIndex: game?.activePlayerIndex,
      hasPrompt: !!currentPrompt,
      finished: gameFinished,
      inSetup: !!setupPrompt,
    } satisfies BoardPlayAreaContext),
  );
  $effect(() => {
    if (currentPrompt || gameFinished) {
      selectionStore.clearFocus();
    }
  });
  $effect(() => {
    if (replayMode || liveTimelineBrowsingPast) {
      return;
    }
    rememberVisibleDecks(game, currentPrompt);
  });
  $effect(() => {
    if (activeMatchRestoreState === 'ready'
      && promptLifecycleStore.shouldAutoConfirm(currentPrompt, autoResolvePrompt, resolvingPrompt)) {
      void resolvePrompt(autoResolvePromptResult);
    }
  });
  $effect(() => {
    const currentGame = gameStore.game;
    const sessionId = localGameApi.currentSessionId();
    const timeline = liveTimelineStore.checkpoint();
    const knownDecks = knownDecksByPlayer;
    const appliedLogKeys = appliedKnownDeckLogKeys;
    const playerDeckId = selectedPlayerDeckId;
    const opponentDeckId = selectedOpponentDeckId;
    const agentId = selectedAgentId;
    if (replayMode || activeMatchRestoreState !== 'ready' || !currentGame || !sessionId) {
      return;
    }
    scheduleActiveMatchCheckpointSave({
      version: 1,
      sessionId,
      savedAt: new Date().toISOString(),
      finished: currentGame.phase === 7,
      game: currentGame,
      timeline,
      knownDecksByPlayer: knownDecks,
      appliedKnownDeckLogKeys: appliedLogKeys,
      selection: { playerDeckId, opponentDeckId, agentId },
    });
  });

  async function initializeApp() {
    const catalogPromise = Promise.all([refreshCatalog(), refreshUserDecks()]);
    if (initialReplayMode) {
      await Promise.all([catalogPromise, replayStore.loadSaved()]);
      return;
    }
    if (showPromptGallery) {
      await catalogPromise;
      return;
    }

    let checkpoint: ActiveMatchCheckpointV1 | null = null;
    try {
      checkpoint = await activeMatchCheckpointRepository.load();
    } catch {
      // A localStorage session pointer can still recover the current server state.
    }
    restoredCheckpoint = checkpoint;
    const sessionId = checkpoint?.sessionId ?? readActiveSessionPointer()?.sessionId ?? '';
    if (sessionId) {
      await restoreActiveMatch(sessionId, checkpoint);
    } else {
      activeMatchRestoreState = 'ready';
    }

    await catalogPromise;
    if (checkpoint) {
      applyCheckpointSelection(checkpoint);
    }
  }

  async function restoreActiveMatch(sessionId: string, checkpoint: ActiveMatchCheckpointV1 | null) {
    if (restoreRequestInFlight) {
      return;
    }
    restoreRequestInFlight = true;
    if (!gameStore.game) {
      activeMatchRestoreState = 'checking';
    }
    activeMatchRestoreMessage = '保存された対戦へ接続しています。';
    try {
      const response = await localGameApi.resume(sessionId);
      if (!response.ok) {
        gameSessionStore.reset();
        activeMatchRestoreState = 'invalid';
        activeMatchRestoreMessage = '以前の対戦セッションは終了しているため再開できません。';
        return;
      }

      if (checkpoint) {
        applyCheckpointClientState(checkpoint);
      } else {
        liveTimelineStore.reset();
        knownDecksByPlayer = {};
        appliedKnownDeckLogKeys = [];
      }
      gameStore.apply(response);
      if (checkpoint?.timeline.replay) {
        liveTimelineStore.replaceLatestView(response.view);
        syncRestoredPrompt(response.view);
      } else {
        gameSessionStore.syncExternalUpdate();
      }
      replayStore.clear();
      homeMode = 'play';
      activeMatchRestoreState = 'ready';
      activeMatchRestoreMessage = '';
      checkpointSaveError = '';
    } catch (restoreError) {
      if (checkpoint) {
        applyCheckpointClientState(checkpoint);
        gameStore.apply({ ok: true, view: checkpoint.game, sessionId: checkpoint.sessionId });
        liveTimelineStore.replaceLatestView(checkpoint.game);
        syncRestoredPrompt(checkpoint.game);
        replayStore.clear();
        homeMode = 'play';
      }
      activeMatchRestoreState = 'reconnecting';
      activeMatchRestoreMessage = restoreError instanceof Error
        ? `対戦エンジンへ接続できません。${restoreError.message}`
        : '対戦エンジンへ接続できません。';
    } finally {
      restoreRequestInFlight = false;
    }
  }

  function applyCheckpointClientState(checkpoint: ActiveMatchCheckpointV1) {
    restoredCheckpoint = checkpoint;
    liveTimelineStore.restore(checkpoint.timeline);
    knownDecksByPlayer = checkpoint.knownDecksByPlayer;
    appliedKnownDeckLogKeys = [...checkpoint.appliedKnownDeckLogKeys];
    applyCheckpointSelection(checkpoint);
    selectionStore.clearAll();
    zoneViewerStore.close();
  }

  function applyCheckpointSelection(checkpoint: ActiveMatchCheckpointV1) {
    selectedPlayerDeckId = checkpoint.selection.playerDeckId;
    selectedOpponentDeckId = checkpoint.selection.opponentDeckId;
    selectedAgentId = checkpoint.selection.agentId;
  }

  function syncRestoredPrompt(restoredGame: GameView) {
    promptLifecycleStore.syncPromptScopedState(restoredGame.prompts[0]);
    promptLifecycleStore.resetCommandSelection(restoredGame.prompts.length);
  }

  async function retryActiveMatchRestore() {
    const sessionId = restoredCheckpoint?.sessionId ?? readActiveSessionPointer()?.sessionId ?? '';
    if (!sessionId) {
      activeMatchRestoreState = 'invalid';
      activeMatchRestoreMessage = '再開に必要な対戦セッション情報がありません。';
      return;
    }
    activeMatchRestoreMessage = '対戦へ再接続しています。';
    await restoreActiveMatch(sessionId, restoredCheckpoint);
  }

  function scheduleActiveMatchCheckpointSave(checkpoint: ActiveMatchCheckpointV1) {
    restoredCheckpoint = checkpoint;
    if (checkpointSaveTimer) {
      clearTimeout(checkpointSaveTimer);
    }
    checkpointSaveTimer = setTimeout(() => {
      checkpointSaveTimer = null;
      checkpointWriteChain = checkpointWriteChain
        .catch(() => undefined)
        .then(() => activeMatchCheckpointRepository.save(checkpoint))
        .then(() => {
          checkpointSaveError = '';
        })
        .catch((saveError) => {
          checkpointSaveError = saveError instanceof Error
            ? `対戦の復帰用履歴を保存できません: ${saveError.message}`
            : '対戦の復帰用履歴を保存できません。';
        });
    }, 0);
  }

  async function discardActiveMatch() {
    activeMatchRestoreState = 'checking';
    activeMatchRestoreMessage = '対戦を終了しています。';
    const sessionId = localGameApi.currentSessionId()
      || restoredCheckpoint?.sessionId
      || readActiveSessionPointer()?.sessionId
      || '';
    localGameApi.forgetSession();
    restoredCheckpoint = null;
    if (checkpointSaveTimer) {
      clearTimeout(checkpointSaveTimer);
      checkpointSaveTimer = null;
    }
    try {
      await checkpointWriteChain.catch(() => undefined);
      await activeMatchCheckpointRepository.clear();
    } catch (clearError) {
      checkpointSaveError = clearError instanceof Error
        ? `保存された対戦を削除できません: ${clearError.message}`
        : '保存された対戦を削除できません。';
    }
    if (sessionId) {
      void localGameApi.closeSession(sessionId).catch(() => undefined);
    }
    gameSessionStore.reset();
    knownDecksByPlayer = {};
    appliedKnownDeckLogKeys = [];
    zoneViewerStore.close();
    viewSettingsStore.resetView();
    activeMatchRestoreState = 'ready';
    activeMatchRestoreMessage = '';
    homeMode = 'play';
  }

  async function startGame() {
    if (selectedPlayerDeckId.startsWith('user:')) {
      const selectedDeck = userDecks.find((deck) => userDeckChoiceKey(deck.id) === selectedPlayerDeckId);
      if (!selectedDeck || !userDeckUsesKnownCards(selectedDeck, cardRows)) {
        gameStore.setError('選択したマイデッキは現在のカードデータでは対戦に使えません。Card Viewerで内容を確認してください。');
        return;
      }
    }
    const decks = deckImportStore.parseLocalGameDecks();
    if (!decks.ok) {
      gameStore.setError(decks.error);
      return;
    }

    selectionStore.setSelectedHand(null);
    gameSessionStore.reset();
    knownDecksByPlayer = {};
    appliedKnownDeckLogKeys = [];
    replayStore.clear();
    homeMode = 'play';
    await gameSessionStore.run(() => localGameApi.start(decks.player1Cards, decks.player2Cards, selectedAgentId));
  }

  async function replayLiveFromCurrentStep() {
    const stepIndex = liveTimelineStore.stepIndex;
    const historyLength = liveTimelineStore.currentStep?.liveHistoryLength;
    selectionStore.setSelectedHand(null);
    const response = await gameSessionStore.run(() => localGameApi.replayFromStep?.(stepIndex, historyLength) ?? Promise.resolve({
      ok: false,
      error: 'この環境ではやり直しに対応していません。',
    }));
    if (response.ok && response.view) {
      liveTimelineStore.trimFutureFromStep(stepIndex, response.view);
    }
  }

  async function refreshCatalog() {
    catalogBusy = true;
    catalogError = '';
    try {
      const [nextAgents, nextLogs, nextDeckCatalog] = await Promise.all([
        loadAgentOptions(),
        loadGameLogs(),
        loadRoundRobinDeckCatalog(),
      ]);
      agents = nextAgents;
      gameLogs = nextLogs;
      roundRobinDeckCatalog = nextDeckCatalog;
      if (!selectedAgentId || !nextAgents.some((agent) => agent.id === selectedAgentId)) {
        selectedAgentId = nextAgents[0]?.id ?? '';
      }
    } catch (error) {
      catalogError = error instanceof Error ? error.message : String(error);
    } finally {
      catalogBusy = false;
    }
  }

  async function refreshUserDecks() {
    userDeckBusy = true;
    userDeckError = '';
    try {
      const sharedDecks = await fetchUserDecks();
      userDecks = await migrateLegacyUploadedDecks(loadUploadedDecks(), sharedDecks);
      if (pendingRequestedUserDeckId) {
        const requestedKey = userDeckChoiceKey(pendingRequestedUserDeckId);
        if (userDecks.some((deck) => userDeckChoiceKey(deck.id) === requestedKey)) {
          selectedPlayerDeckId = requestedKey;
          homeMode = 'play';
        } else {
          userDeckError = `指定されたマイデッキが見つかりません: ${pendingRequestedUserDeckId}`;
        }
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', urlWithoutUserDeck(new URL(window.location.href)));
        }
        pendingRequestedUserDeckId = '';
      }
    } catch (error) {
      userDeckError = error instanceof Error ? error.message : String(error);
    } finally {
      userDeckBusy = false;
    }
  }

  function roundRobinDeckKey(id: string): string {
    return `round:${id}`;
  }

  function availablePlayerDeckChoiceKeys(): string[] {
    return [
      ...roundRobinDeckCatalog.decks.map((deck) => roundRobinDeckKey(deck.id)),
      ...userDecks.map((deck) => userDeckChoiceKey(deck.id)),
    ];
  }

  function availableOpponentDeckChoiceKeys(): string[] {
    return roundRobinDeckCatalog.decks.map((deck) => roundRobinDeckKey(deck.id));
  }

  function deckTextForChoice(choiceKey: string): string {
    if (choiceKey.startsWith('user:')) {
      const deck = userDecks.find((item) => userDeckChoiceKey(item.id) === choiceKey);
      if (!deck || !userDeckUsesKnownCards(deck, cardRows)) {
        return '';
      }
      try {
        return formatCanonicalDeckList(userDeckCardsForCabt(deck), cardRows);
      } catch (error) {
        userDeckError = error instanceof Error ? error.message : String(error);
        return '';
      }
    }
    const roundRobinId = choiceKey.startsWith('round:') ? choiceKey.slice('round:'.length) : choiceKey;
    const deck = roundRobinDeckCatalog.decks.find((item) => item.id === roundRobinId);
    if (!deck) {
      return '';
    }
    try {
      return formatCanonicalDeckList(deck.cards, cardRows);
    } catch (error) {
      catalogError = error instanceof Error ? error.message : String(error);
      return '';
    }
  }

  async function uploadDeckFiles(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.zip'));
    if (!fileArray.length) {
      uploadError = 'ZIPファイルを選択してください。';
      return;
    }
    uploadBusy = true;
    uploadError = '';
    try {
      const imported = [] as UserDeck[];
      for (const file of fileArray) {
        const extracted = await extractUploadedDeckFromZipFile(file, cardRows);
        imported.push(await createUserDeck({
          name: extracted.name,
          cards: extracted.cards.map((card) => ({ card_id: card.cardId, count: card.count })),
          source: 'cabt-zip',
        }));
      }
      userDecks = [...imported, ...userDecks];
      const latest = imported.at(-1);
      if (latest) {
        selectedPlayerDeckId = userDeckChoiceKey(latest.id);
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : String(error);
    } finally {
      uploadBusy = false;
    }
  }

  async function deleteSharedUserDeck(id: string) {
    const deck = userDecks.find((item) => item.id === id);
    if (!deck) {
      return;
    }
    uploadBusy = true;
    uploadError = '';
    try {
      await deleteUserDeck(deck);
      userDecks = userDecks.filter((item) => item.id !== id);
      if (selectedPlayerDeckId === userDeckChoiceKey(id)) {
        selectedPlayerDeckId = availablePlayerDeckChoiceKeys()[0] ?? '';
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : String(error);
    } finally {
      uploadBusy = false;
    }
  }

  async function loadGameLog(log: GameLogEntry) {
    gameSessionStore.reset();
    knownDecksByPlayer = {};
    appliedKnownDeckLogKeys = [];
    zoneViewerStore.close();
    viewSettingsStore.resetView();
    homeMode = 'logs';
    await replayStore.loadSaved(log.file || log.id);
  }

  function suppressPromptInputBriefly() {
    promptInputSuppressed = true;
    if (promptInputSuppressTimer) {
      clearTimeout(promptInputSuppressTimer);
    }
    promptInputSuppressTimer = setTimeout(() => {
      promptInputSuppressed = false;
      promptInputSuppressTimer = null;
    }, 450);
  }

  function stopDropEvent(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handCardForSelection(selection: HandSelection | null | undefined) {
    return selection && game ? game.players[selection.playerIndex]?.hand[selection.handIndex] : undefined;
  }

  async function playSelectionToTarget(selection: HandSelection, target: CardTarget) {
    if (!game || !canAct(selection.playerIndex)) {
      return;
    }
    suppressPromptInputBriefly();
    selectionStore.clearHandAndFocus();
    await gameSessionStore.run(() => commandApi.playCard(selection.playerIndex, selection.handIndex, target));
    suppressPromptInputBriefly();
  }

  async function playToTarget(target: CardTarget) {
    if (!selectedHand) {
      return;
    }
    await playSelectionToTarget(selectedHand, target);
  }

  function playToSlot(slot: PokemonSlotView) {
    if (!selectedHand || !isPlayableTargetForSelection(slot, selectedHand)) {
      return;
    }
    void playSelectionToTarget(selectedHand, slot.target);
  }

  function clickSlot(slot: PokemonSlotView) {
    if (promptInputSuppressed && currentPrompt) {
      return;
    }

    if (attachPrompt && isBoardPromptSelectable(slot)) {
      assignAttachPromptTarget(slot);
      return;
    }

    if (dispatchBoardClick(slot)) {
      return;
    }

    if (canPlaceSetupActive(slot)) {
      placeSetupActive();
      return;
    }

    if (setupPrompt && slot.ownerIndex === setupPrompt.playerIndex && !selectedHand) {
      if (slot.slot === 'active' && setupActiveIndex !== null) {
        removeSetupIndex(setupActiveIndex);
        return;
      }
      if (slot.slot === 'bench' && setupBenchIndexes[slot.index] !== undefined) {
        removeSetupIndex(setupBenchIndexes[slot.index]);
        return;
      }
    }

    if (isPlayableTarget(slot)) {
      playToSlot(slot);
      return;
    }

    if (canPlayOnBoard) {
      playSelectedToBoard();
      return;
    }

    if (!slot.empty && slot.pokemon) {
      selectionStore.focusSlot(slot);
    }
  }

  async function attack(name: string) {
    if (!game || !focusedPlayer || !focusedIsActive || !focusedCanAct) return;
    await gameSessionStore.run(() => commandApi.attack(focusedPlayer!.index, name));
  }

  async function useAbility(name: string, target: CardTarget) {
    if (!game || !focusedPlayer || !focusedCanAct) return;
    await gameSessionStore.run(() => commandApi.useAbility(focusedPlayer!.index, name, target));
  }

  async function useStadium() {
    if (!game || !activePlayer || !canAct(activePlayer.index)) return;
    zoneViewerStore.close();
    await gameSessionStore.run(() => commandApi.useStadium(activePlayer.index));
  }

  async function concede() {
    if (!game || !activePlayer || gameFinished) return;
    await gameSessionStore.run(() => commandApi.concede(game.activePlayerIndex));
  }

  async function passTurn() {
    if (!game) return;
    await gameSessionStore.run(() => commandApi.passTurn(game.activePlayerIndex));
  }

  async function retreat(to: number) {
    if (!game) return;
    retreatSource = null;
    await gameSessionStore.run(() => commandApi.retreat(game.activePlayerIndex, to));
  }

  function canRetreatToSelectedTarget(slot: PokemonSlotView) {
    if (!game || !retreatSource || slot.slot !== 'bench' || slot.empty || slot.ownerIndex !== retreatSource.ownerIndex) {
      return false;
    }
    const retreatAction = game.players[retreatSource.ownerIndex]?.availableActions?.active?.retreat;
    if (retreatAction) {
      return retreatAction.targets.includes(slot.index);
    }
    return canRetreatToSlot(retreatSource, slot);
  }

  function startRetreatSelection() {
    if (!focusedSlot || focusedSlot.slot !== 'active') {
      return;
    }
    retreatSource = focusedSlot;
    selectionStore.clearFocus();
  }

  async function resolvePrompt(value: unknown) {
    if (!currentPrompt) return;
    await gameSessionStore.resolve(() => commandApi.resolvePrompt(currentPrompt.id, value));
  }

  function selectHandCard(playerIndex: number, handIndex: number) {
    if (setupPrompt && playerIndex === setupPrompt.playerIndex) {
      if (!isSetupStartable(game?.players[playerIndex]?.hand[handIndex], handIndex)) {
        return;
      }
      selectionStore.toggleSelectedHand({ playerIndex, handIndex });
      selectionStore.clearFocus();
      return;
    }

    if (!canAct(playerIndex)) {
      return;
    }
    selectionStore.toggleSelectedHand({ playerIndex, handIndex });
    selectionStore.clearFocus();
  }

  function onHandDrag(playerIndex: number, handIndex: number, event: DragEvent) {
    if (setupPrompt && playerIndex === setupPrompt.playerIndex) {
      if (!isSetupStartable(game?.players[playerIndex]?.hand[handIndex], handIndex)) {
        return;
      }
    } else if (!canAct(playerIndex)) {
      return;
    }
    selectionStore.startDragging({ playerIndex, handIndex });
    event.dataTransfer?.setData('text/plain', `${playerIndex}:${handIndex}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function clearDragState() {
    selectionStore.clearDragging();
  }

  function allowDrop(event: DragEvent, slot: PokemonSlotView) {
    if (isPlayableTarget(slot) || canPlaceSetupActive(slot) || (attachPrompt && isBoardPromptSelectable(slot))) {
      event.preventDefault();
    }
  }

  function allowBoardPlayDrop(event: DragEvent) {
    if (canPlayOnBoard) {
      event.preventDefault();
    }
  }

  function allowBenchDrop(event: DragEvent, player: PlayerView) {
    if (canPlayToBenchArea(player) || canPlaceSetupBench(player)) {
      event.preventDefault();
    }
  }

  function switchSides() {
    viewSettingsStore.switchToPlayer(topPlayer?.index ?? 0);
  }

  function resetGame() {
    if (replayMode) {
      replayStore.clear();
      knownDecksByPlayer = {};
      appliedKnownDeckLogKeys = [];
      zoneViewerStore.close();
      viewSettingsStore.resetView();
      homeMode = 'logs';
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'replay') {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }
    void discardActiveMatch();
  }

  function dropToSlot(slot: PokemonSlotView, event: DragEvent) {
    const handSelection = draggingHand ?? selectedHand;
    stopDropEvent(event);
    clearDragState();
    if (attachPrompt && isBoardPromptSelectable(slot)) {
      assignAttachPromptTarget(slot);
      return;
    }
    if (canPlaceSetupActive(slot)) {
      placeSetupActive();
      return;
    }
    if (handSelection && isPlayableTargetForSelection(slot, handSelection)) {
      void playSelectionToTarget(handSelection, slot.target);
      return;
    }
  }

  function dropToBoardPlay(event: DragEvent) {
    const handSelection = draggingHand ?? selectedHand;
    if (!handSelection || !game || !activePlayer || !canPlayToAreaForSelection(activePlayer, handSelection)) {
      return;
    }
    stopDropEvent(event);
    clearDragState();
    playSelectionToBoard(handSelection);
  }

  function clickBoardPlay(event: MouseEvent) {
    if (!canPlayOnBoard) {
      return;
    }
    event.preventDefault();
    playSelectedToBoard();
  }

  function dropToBenchArea(player: PlayerView, event: DragEvent) {
    const handSelection = draggingHand ?? selectedHand;
    stopDropEvent(event);
    clearDragState();
    if (canPlaceSetupBench(player)) {
      placeSetupBench();
      return;
    }
    if (handSelection) {
      playSelectionToBenchArea(player, handSelection);
    }
  }

  function isPlayableTarget(slot: PokemonSlotView) {
    return isPlayableTargetForSelection(slot, selectedHand);
  }

  function isPlayableTargetForSelection(slot: PokemonSlotView, handSelection: HandSelection | null | undefined) {
    if (setupPrompt) {
      return false;
    }
    return canPlayCardToSlot(handCardForSelection(handSelection), handSelection?.playerIndex, slot);
  }

  function benchAreaTarget(player: PlayerView) {
    return benchAreaTargetForSelection(player, selectedHand);
  }

  function benchAreaTargetForSelection(player: PlayerView, handSelection: HandSelection | null | undefined) {
    return playableBenchSlot(player, handCardForSelection(handSelection), handSelection?.playerIndex, !!setupPrompt);
  }

  function canPlayToBenchArea(player: PlayerView) {
    if (setupPrompt) {
      return false;
    }
    return !!benchAreaTarget(player);
  }

  function playToBenchArea(player: PlayerView) {
    if (!selectedHand) {
      return;
    }
    playSelectionToBenchArea(player, selectedHand);
  }

  function playSelectionToBenchArea(player: PlayerView, handSelection: HandSelection) {
    const target = benchAreaTargetForSelection(player, handSelection);
    if (!target) {
      return;
    }
    void playSelectionToTarget(handSelection, target.target);
  }

  function canPlayToArea(player: PlayerView) {
    return canPlayToAreaForSelection(player, selectedHand);
  }

  function canPlayToAreaForSelection(player: PlayerView, handSelection: HandSelection | null | undefined) {
    if (setupPrompt) {
      return false;
    }
    return canAct(player.index) && canPlayCardToPlayArea(handCardForSelection(handSelection), handSelection?.playerIndex);
  }

  function playSelectedToBoard() {
    if (!selectedHand) {
      return;
    }
    playSelectionToBoard(selectedHand);
  }

  function playSelectionToBoard(handSelection: HandSelection) {
    if (!game || !activePlayer || !canPlayToAreaForSelection(activePlayer, handSelection)) {
      return;
    }
    void playSelectionToTarget(handSelection, targetFor(game.activePlayerIndex, game.activePlayerIndex, SlotType.ACTIVE));
  }

  function showZone(playerIndex: number, zone: 'deck' | 'discard' | 'lostZone' | 'prize' | 'stadium' | 'playZone', title: string, faceDown = false) {
    zoneViewerStore.show(playerIndex, zone, title, faceDown);
  }

  function rememberVisibleDecks(currentGame: GameView | null | undefined, prompt: PromptView | null | undefined) {
    if (!currentGame) {
      return;
    }

    for (const player of currentGame.players) {
      if (player.deck?.length) {
        rememberKnownDeck(player.index, player.deck, player.deck.length >= player.deckCount);
      }
    }

    const promptDeck = promptDeckCards(prompt);
    if (promptDeck.length && typeof prompt?.playerIndex === 'number') {
      const deckCount = currentGame.players[prompt.playerIndex]?.deckCount ?? promptDeck.length;
      rememberKnownDeck(prompt.playerIndex, promptDeck, promptDeck.length >= deckCount);
    }

    const observation = currentGame.events.at(-1) as {
      current?: { yourIndex?: number; looking?: unknown[] | null };
      select?: { deck?: unknown[] | null };
    } | undefined;
    const viewerIndex = observation?.current?.yourIndex;
    if (typeof viewerIndex !== 'number') {
      return;
    }

    const selectDeck = rawDeckCards(observation?.select?.deck);
    if (selectDeck.length) {
      const deckCount = currentGame.players[viewerIndex]?.deckCount ?? selectDeck.length;
      rememberKnownDeck(viewerIndex, selectDeck, selectDeck.length >= deckCount);
    }

    const lookingCards = rawDeckCards(observation?.current?.looking);
    if (lookingCards.length) {
      const deckCount = currentGame.players[viewerIndex]?.deckCount ?? lookingCards.length;
      rememberKnownDeck(viewerIndex, lookingCards, lookingCards.length >= deckCount);
    }

    applyKnownDeckMovementLogs(currentGame);
    trimKnownDecksToCurrentCounts(currentGame);
  }

  function promptDeckCards(prompt: PromptView | null | undefined): CardView[] {
    const cabtSelect = prompt?.fields?.cabtSelect as { deck?: unknown[] | null } | undefined;
    return rawDeckCards(cabtSelect?.deck);
  }

  function rawDeckCards(rawCards: unknown): CardView[] {
    if (!Array.isArray(rawCards)) {
      return [];
    }
    return rawCards
      .map(cardRefToView)
      .filter((card): card is CardView => !!card);
  }

  function cardRefToView(rawCard: unknown): CardView | null {
    if (!rawCard || typeof rawCard !== 'object') {
      return null;
    }
    const ref = rawCard as CabtCardRef;
    const id = typeof ref.id === 'number' ? ref.id : ref.cardId;
    if (typeof id !== 'number') {
      return null;
    }
    const row = cardRows.find((card) => card.id === id);
    if (!row) {
      const unknown: CardView = {
        id,
        serial: ref.serial,
        name: `Card ${id}`,
        fullName: `Card ${id}`,
      };
      return {
        ...unknown,
        imageUrl: resolveCardImageUrl(unknown),
      };
    }
    const card: CardView = {
      id: row.id,
      serial: ref.serial,
      name: row.name,
      fullName: row.name,
      set: row.set,
      setNumber: row.setNumber,
      superType: row.cardType === 0 ? 'Pokemon' : row.cardType === 5 ? 'Energy' : 'Trainer',
      trainerType: row.cardType >= 1 && row.cardType <= 4 ? row.cardType : undefined,
      energyType: row.cardType === 5 ? row.energyType : undefined,
      stage: row.basic ? 2 : row.stage1 ? 3 : row.stage2 ? 4 : undefined,
      hp: row.hp ?? undefined,
    };
    return {
      ...card,
      imageUrl: resolveCardImageUrl(card),
    };
  }

  function rememberKnownDeck(playerIndex: number, cards: CardView[], complete: boolean) {
    if (!cards.length) {
      return;
    }
    const current = knownDecksByPlayer[playerIndex];
    if (
      current
      && current.complete === complete
      && deckSignature(current.cards) === deckSignature(cards)
    ) {
      return;
    }
    knownDecksByPlayer = {
      ...knownDecksByPlayer,
      [playerIndex]: { cards, complete },
    };
  }

  function deckSignature(cards: CardView[]) {
    return cards.map((card) => card.serial ?? card.id ?? card.fullName).join(',');
  }

  function applyKnownDeckMovementLogs(currentGame: GameView) {
    const observation = currentGame.events.at(-1) as {
      logs?: unknown[];
      current?: { turn?: number; turnActionCount?: number };
    } | undefined;
    const logs = observation?.logs;
    if (!Array.isArray(logs)) {
      return;
    }

    let nextDecks = knownDecksByPlayer;
    const nextApplied = [...appliedKnownDeckLogKeys];
    for (const rawLog of logs) {
      if (!rawLog || typeof rawLog !== 'object') {
        continue;
      }
      const log = rawLog as CabtMoveLog;
      const key = knownDeckLogKey(log, observation?.current);
      if (!key || nextApplied.includes(key)) {
        continue;
      }
      nextApplied.push(key);

      if (isKnownDeckSource(log.fromArea) && !isKnownDeckSource(log.toArea) && typeof log.playerIndex === 'number') {
        const updated = removeKnownDeckCard(nextDecks[log.playerIndex], log);
        if (updated) {
          nextDecks = {
            ...nextDecks,
            [log.playerIndex]: updated,
          };
        }
      }
      if (isKnownDeckSource(log.toArea) && !isKnownDeckSource(log.fromArea) && typeof log.playerIndex === 'number') {
        const updated = addKnownDeckCard(nextDecks[log.playerIndex], log);
        if (updated) {
          nextDecks = {
            ...nextDecks,
            [log.playerIndex]: updated,
          };
        }
      }
    }

    if (nextDecks !== knownDecksByPlayer) {
      knownDecksByPlayer = nextDecks;
    }
    if (nextApplied.length !== appliedKnownDeckLogKeys.length) {
      appliedKnownDeckLogKeys = nextApplied.slice(-300);
    }
  }

  function isKnownDeckSource(area: unknown) {
    return area === CabtAreaType.DECK || area === CabtAreaType.LOOKING;
  }

  function knownDeckLogKey(log: CabtMoveLog, current: { turn?: number; turnActionCount?: number } | undefined) {
    if (typeof log.playerIndex !== 'number' || typeof log.fromArea !== 'number' || typeof log.toArea !== 'number') {
      return '';
    }
    return [
      current?.turn ?? '',
      current?.turnActionCount ?? '',
      log.type ?? '',
      log.playerIndex,
      log.fromArea,
      log.toArea,
      log.serial ?? '',
      log.cardId ?? '',
    ].join(':');
  }

  function removeKnownDeckCard(memory: KnownDeckMemory | undefined, log: CabtMoveLog): KnownDeckMemory | undefined {
    if (!memory?.cards.length) {
      return undefined;
    }
    const index = knownDeckCardIndex(memory.cards, log);
    const removeIndex = index >= 0 ? index : 0;
    return {
      ...memory,
      cards: memory.cards.filter((_card, cardIndex) => cardIndex !== removeIndex),
    };
  }

  function addKnownDeckCard(memory: KnownDeckMemory | undefined, log: CabtMoveLog): KnownDeckMemory | undefined {
    const card = cardRefToView({ id: log.cardId, serial: log.serial });
    if (!memory || !card) {
      return undefined;
    }
    if (knownDeckCardIndex(memory.cards, log) >= 0) {
      return memory;
    }
    return {
      cards: [...memory.cards, card],
      complete: false,
    };
  }

  function knownDeckCardIndex(cards: CardView[], log: CabtMoveLog) {
    if (typeof log.serial === 'number') {
      const bySerial = cards.findIndex((card) => card.serial === log.serial);
      if (bySerial >= 0) {
        return bySerial;
      }
    }
    if (typeof log.cardId === 'number') {
      return cards.findIndex((card) => card.id === log.cardId);
    }
    return -1;
  }

  function trimKnownDecksToCurrentCounts(currentGame: GameView) {
    let nextDecks = knownDecksByPlayer;
    for (const player of currentGame.players) {
      const memory = nextDecks[player.index];
      if (!memory?.cards.length) {
        continue;
      }
      if (player.deckCount < memory.cards.length) {
        nextDecks = {
          ...nextDecks,
          [player.index]: {
            ...memory,
            cards: memory.cards.slice(memory.cards.length - player.deckCount),
          },
        };
      } else if (player.deckCount > memory.cards.length && memory.complete) {
        nextDecks = {
          ...nextDecks,
          [player.index]: {
            ...memory,
            complete: false,
          },
        };
      }
    }
    if (nextDecks !== knownDecksByPlayer) {
      knownDecksByPlayer = nextDecks;
    }
  }

  function playerWithKnownDeck(player: PlayerView): PlayerView {
    const memory = knownDecksByPlayer[player.index];
    if (!memory?.cards.length) {
      return player;
    }
    return {
      ...player,
      deck: memory.cards,
    };
  }

  function cardsForOpenZone(currentGame: GameView | null | undefined) {
    const openZone = zoneViewerStore.openZone;
    if (!openZone || !currentGame) {
      return [];
    }
    if (openZone.zone === 'deck') {
      const memory = knownDecksByPlayer[openZone.playerIndex];
      if (memory?.cards.length) {
        return memory.cards;
      }
    }
    return zoneViewerStore.cardsFor(currentGame);
  }

  function displayZoneViewerTitle() {
    const openZone = zoneViewerStore.openZone;
    if (openZone?.zone !== 'deck') {
      return zoneViewerStore.title;
    }
    const memory = knownDecksByPlayer[openZone.playerIndex];
    if (!memory?.cards.length) {
      return zoneViewerStore.title;
    }
    return memory.complete
      ? `${zoneViewerStore.title}（確認済み）`
      : `${zoneViewerStore.title}で確認したカード`;
  }

  function displayZoneViewerFaceDown() {
    const openZone = zoneViewerStore.openZone;
    if (openZone?.zone === 'deck' && knownDecksByPlayer[openZone.playerIndex]?.cards.length) {
      return false;
    }
    return zoneViewerStore.faceDown;
  }

  function resolveWorkbenchReturnUrl() {
    if (typeof window === 'undefined') {
      return 'http://127.0.0.1:8787/';
    }
    const explicit = new URLSearchParams(window.location.search).get('workbench')
      ?? new URLSearchParams(window.location.search).get('returnTo')
      ?? new URLSearchParams(window.location.search).get('return_url');
    if (explicit) {
      try {
        const explicitUrl = new URL(explicit);
        if (explicitUrl.protocol === 'http:' || explicitUrl.protocol === 'https:') {
          return explicitUrl.toString();
        }
      } catch {
        // Ignore malformed return URLs and fall back to the current host.
      }
    }
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.hostname === window.location.hostname && referrer.port === '8787') {
        return referrer.toString();
      }
    } catch {
      // Ignore malformed referrers and fall back to the current host.
    }
    const fallback = new URL(window.location.href);
    fallback.port = '8787';
    fallback.pathname = '/';
    fallback.search = '';
    fallback.hash = '';
    return fallback.toString();
  }

  function normalizePromptLimit(value: unknown, fallback: number) {
    return promptLimit(value, fallback);
  }

  function canAct(playerIndex: number) {
    if (replayMode || liveTimelineBrowsingPast || activeMatchRestoreState !== 'ready') {
      return false;
    }
    return canPlayerAct({
      playerIndex,
      activePlayerIndex: game?.activePlayerIndex,
      hasPrompt: !!currentPrompt,
      finished: gameFinished,
    });
  }

  function isAttachEnergyAvailable(index: number) {
    const blocked = new Set<number>(promptBlockedIndexes(attachPrompt));
    return isAttachEnergyAvailableModel(index, [...blocked], attachPromptAssignments);
  }

  function canAssignAttachPromptTarget(target: CardTarget, energyIndex = attachPromptEnergyIndex) {
    if (!attachPrompt) {
      return false;
    }
    return canAssignAttachTarget(
      target,
      energyIndex,
      attachPromptAssignments,
      attachPromptTargets,
      attachPromptMax,
      promptOptions(attachPrompt),
      isAttachEnergyAvailable,
    );
  }

  function isBoardPromptSelectable(slot: PokemonSlotView) {
    if (promptInputSuppressed) {
      return false;
    }
    if (attachPrompt) {
      if (slot.empty) {
        return false;
      }
      const target = targetForPromptSlot(attachPrompt, slot);
      return canAssignAttachPromptTarget(target);
    }
    if (!currentPrompt && canRetreatToSelectedTarget(slot)) {
      return true;
    }
    if (!boardStrategy || !currentPrompt || slot.empty) {
      return false;
    }
    return boardStrategy.isEligible(targetForPromptSlot(currentPrompt, slot));
  }

  function isBoardPromptSelected(slot: PokemonSlotView) {
    if (!currentPrompt && retreatSource) {
      return slot.slot === 'active' && slot.ownerIndex === retreatSource.ownerIndex;
    }
    if (attachPrompt) {
      if (slot.empty) {
        return false;
      }
      const target = targetForPromptSlot(attachPrompt, slot);
      return attachPromptAssignments.some((assignment) => sameTarget(assignment.target, target));
    }
    if (!boardStrategy || !currentPrompt || slot.empty) {
      return false;
    }
    return boardStrategy.isSelected(targetForPromptSlot(currentPrompt, slot));
  }

  function boardSlotDelta(slot: PokemonSlotView) {
    if (!boardStrategy || !currentPrompt || slot.empty) {
      return 0;
    }
    return boardStrategy.deltaFor(targetForPromptSlot(currentPrompt, slot));
  }

  function damageQuickAmounts(slot: PokemonSlotView) {
    if (!boardStrategy?.adjustDamage || !boardStrategy.quickAmounts || !currentPrompt || slot.empty) {
      return [];
    }
    const target = targetForPromptSlot(currentPrompt, slot);
    return boardStrategy.isEligible(target) ? boardStrategy.quickAmounts : [];
  }

  function canAdjustSlotDamage(slot: PokemonSlotView, amount: number) {
    if (!boardStrategy?.canAdjustDamage || !currentPrompt || slot.empty || promptResolvingBlocked) {
      return false;
    }
    return boardStrategy.canAdjustDamage(targetForPromptSlot(currentPrompt, slot), amount);
  }

  function adjustSlotDamage(slot: PokemonSlotView, amount: number) {
    if (!boardStrategy?.adjustDamage || !currentPrompt || slot.empty || promptResolvingBlocked) {
      return;
    }
    const target = targetForPromptSlot(currentPrompt, slot);
    if (boardStrategy.canAdjustDamage && !boardStrategy.canAdjustDamage(target, amount)) {
      return;
    }
    boardStrategy.adjustDamage(target, amount);
  }

  function dispatchBoardClick(slot: PokemonSlotView) {
    if (!currentPrompt && retreatSource) {
      if (canRetreatToSelectedTarget(slot)) {
        void retreat(slot.index);
        return true;
      }
      retreatSource = null;
      return false;
    }
    if (promptInputSuppressed) {
      return false;
    }
    if (!boardStrategy || !currentPrompt || slot.empty) {
      return false;
    }
    const target = targetForPromptSlot(currentPrompt, slot);
    if (!boardStrategy.isEligible(target)) {
      return false;
    }
    boardStrategy.activate(target);
    return true;
  }

  function clickBoardPromptSlotAtPoint(event: MouseEvent) {
    if (!boardStrategy || promptResolvingBlocked) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('.prompt-dock, .prompt-strip, .damage-quick-controls')) {
      return;
    }
    const slot = boardPromptSlotAtPoint(event.clientX, event.clientY);
    if (!slot || !dispatchBoardClick(slot)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function boardPromptSlotAtPoint(x: number, y: number) {
    const slotElement = document.elementsFromPoint(x, y).find((element) =>
      element instanceof HTMLElement
        && element.classList.contains('board-slot')
        && element.classList.contains('prompt-selectable'),
    );
    return slotElement instanceof HTMLElement ? boardSlotFromElement(slotElement) : null;
  }

  function boardSlotFromElement(element: HTMLElement): PokemonSlotView | null {
    if (!game) {
      return null;
    }
    const ownerIndex = Number(element.dataset.ownerIndex);
    const slotKind = element.dataset.slotKind;
    const slotIndex = Number(element.dataset.slotIndex);
    const player = game.players.find((item) => item.index === ownerIndex);
    if (!player || !Number.isFinite(slotIndex)) {
      return null;
    }
    if (slotKind === 'active') {
      return player.active;
    }
    if (slotKind === 'bench') {
      return player.bench.find((slot) => slot.index === slotIndex) ?? null;
    }
    return null;
  }

  function assignAttachPromptTarget(slot: PokemonSlotView) {
    if (!attachPrompt || attachPromptEnergyIndex === null || !isBoardPromptSelectable(slot)) {
      return;
    }
    const target = targetForPromptSlot(attachPrompt, slot);
    promptSelectionStore.assignAttachTarget(target, attachPromptMax);
  }

  function selectAttachPromptEnergy(index: number | null) {
    promptSelectionStore.toggleAttachEnergy(index);
  }

  function removeAttachPromptAssignment(index: number) {
    promptSelectionStore.removeAttachAssignment(index);
  }

  function resetAttachPromptAssignments() {
    promptSelectionStore.resetAttachAssignments();
  }

  function isSetupStartable(card: CardView | undefined, handIndex: number) {
    return isSetupStartableModel(card, handIndex, setupBlockedIndexes, !!setupPrompt);
  }

  function selectedSetupHandIndex() {
    return setupPlacementContext.selectedHandIndex;
  }

  function canPlaceSetupActive(slot: PokemonSlotView) {
    return canPlaceSetupActiveModel(slot, setupPlacementContext);
  }

  function placeSetupActive() {
    const handIndex = selectedSetupHandIndex();
    if (handIndex === undefined) {
      return;
    }
    setupSelectionStore.placeActive(handIndex);
    selectionStore.setSelectedHand(null);
  }

  function canPlaceSetupBench(player: PlayerView) {
    return canPlaceSetupBenchModel(player, setupPlacementContext);
  }

  function placeSetupBench() {
    const handIndex = selectedSetupHandIndex();
    if (handIndex === undefined || !setupPlayer || !canPlaceSetupBench(setupPlayer)) {
      return;
    }
    setupSelectionStore.placeBench(handIndex);
    selectionStore.setSelectedHand(null);
  }

  function removeSetupIndex(handIndex: number) {
    setupSelectionStore.remove(handIndex);
  }

  async function confirmSetupPokemon() {
    if (!setupPrompt || !setupCanConfirm) {
      return;
    }
    await resolvePrompt(setupPromptResult(setupHasEngineActive, setupActiveIndex, setupBenchIndexes));
  }

  function isTextInputTarget(target: EventTarget | null) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'))
    );
  }

  function handleReplayKeydown(event: KeyboardEvent) {
    if (!replayMode || !replayStore.replay || cardPreviewStore.open || isTextInputTarget(event.target)) {
      return;
    }
    if (event.shiftKey && event.key === 'ArrowRight' && replayStore.nextReplay) {
      event.preventDefault();
      void replayStore.nextSavedReplay();
      return;
    }
    if (event.shiftKey && event.key === 'ArrowLeft' && replayStore.previousReplay) {
      event.preventDefault();
      void replayStore.previousSavedReplay();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      replayStore.nextStep();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      replayStore.previousStep();
      return;
    }
    if (event.key === 'ArrowDown' && bottomPlayer && replayStore.canSkipOpponentTurn(bottomPlayer.index)) {
      event.preventDefault();
      replayStore.skipOpponentTurn(bottomPlayer.index);
    }
  }

</script>

<svelte:window onkeydown={handleReplayKeydown} />

{#if showPromptGallery}
  <PromptGallery />
{:else}
<main>
  {#if replayMode && !game}
    <AppHeader workbenchUrl={workbenchReturnUrl} />
    <section class="replay-loading-screen">
      <div class="replay-loading-panel">
        <strong>{replayStore.loading ? 'リプレイ読み込み中' : 'リプレイを表示できません'}</strong>
        <span>{replayStore.loading ? '対戦リプレイの盤面を準備しています。' : labelFor(error || 'リプレイを読み込めません。')}</span>
      </div>
    </section>
  {:else if activeMatchRestoreState === 'checking' && !game}
    <AppHeader workbenchUrl={workbenchReturnUrl} />
    <section class="replay-loading-screen">
      <div class="replay-loading-panel" role="status">
        <strong>対戦を再開中</strong>
        <span>{activeMatchRestoreMessage || '進行中の対戦を確認しています。'}</span>
      </div>
    </section>
  {:else if activeMatchRestoreState === 'invalid' && !game}
    <AppHeader workbenchUrl={workbenchReturnUrl} />
    <section class="replay-loading-screen">
      <div class="replay-loading-panel" role="alert">
        <strong>以前の対戦を再開できません</strong>
        <span>{activeMatchRestoreMessage}</span>
        <button type="button" onclick={() => void discardActiveMatch()}>破棄してデッキ選択へ</button>
      </div>
    </section>
  {:else if activeMatchRestoreState === 'reconnecting' && !game}
    <AppHeader workbenchUrl={workbenchReturnUrl} />
    <section class="replay-loading-screen">
      <div class="replay-loading-panel" role="alert">
        <strong>対戦へ接続できません</strong>
        <span>{activeMatchRestoreMessage}</span>
        <div class="restore-actions">
          <button type="button" onclick={() => void retryActiveMatchRestore()}>再接続</button>
          <button type="button" class="secondary" onclick={() => void discardActiveMatch()}>対戦を破棄</button>
        </div>
      </div>
    </section>
  {:else if !game}
    <AppHeader workbenchUrl={workbenchReturnUrl} />

      <ImportScreen
        {homeMode}
        bind:deck1Text={deckImportStore.deck1Text}
        bind:deck2Text={deckImportStore.deck2Text}
        bind:selectedAgentId
        bind:selectedPlayerDeckId
        bind:selectedOpponentDeckId
        {agents}
        {gameLogs}
        {roundRobinDeckCatalog}
        {userDecks}
        busy={sessionBusy}
        {catalogBusy}
        uploadBusy={uploadBusy || userDeckBusy}
        {error}
        {catalogError}
        uploadError={uploadError || userDeckError}
        setHomeMode={(nextMode) => {
          homeMode = nextMode;
          if (nextMode === 'logs') {
            gameStore.reset();
          } else {
            replayStore.clear();
          }
        }}
        startGame={startGame}
        {uploadDeckFiles}
        deleteUserDeck={(id) => void deleteSharedUserDeck(id)}
        {loadGameLog}
        refreshCatalog={() => {
          void refreshCatalog();
          void refreshUserDecks();
        }}
      />
  {:else if bottomPlayer && topPlayer}
    <TableShell {debugZones} {replayMode}>
      <GameStatus
        phaseLabel={game.phaseLabel}
        turn={game.turn}
        activePlayerName={activePlayer?.name}
        resultLabel={gameResultLabel}
        {gameFinished}
      />

      <Toolbar
        bind:boardTilt={viewSettingsStore.boardTilt}
        bind:boardPerspective={viewSettingsStore.boardPerspective}
        bind:boardScaleY={viewSettingsStore.boardScaleY}
        bind:boardLift={viewSettingsStore.boardLift}
        bind:followActive={viewSettingsStore.followActive}
        bind:autoConfirmPrompts={viewSettingsStore.autoConfirmPrompts}
        bind:debugZones={viewSettingsStore.debugZones}
        bind:showLogs={viewSettingsStore.showLogs}
        bind:themePreference={viewSettingsStore.themePreference}
        busy={sessionBusy}
        promptActive={replayMode || !!currentPrompt}
        {gameFinished}
        {error}
        {resetPerspective}
        {passTurn}
        {concede}
        {switchSides}
        switchDisabled={false}
        {resetGame}
        resetLabel={replayMode ? 'リプレイを終了' : '元の画面に戻る'}
      />

      {#if replayMode && replayStore.replay && replayStore.currentStep}
        <ReplayTimeline
          replay={replayStore.replay}
          step={replayStore.currentStep}
          stepIndex={replayStore.stepIndex}
          copiedForkPoint={replayStore.copiedForkPoint}
          copiedQuestionContext={replayStore.copiedQuestionContext}
          questionContextText={replayStore.questionContextText}
          setStep={(index) => replayStore.setStep(index)}
          setStateIndex={(index) => replayStore.setStateIndex(index)}
          previousStep={() => replayStore.previousStep()}
          nextStep={() => replayStore.nextStep()}
          firstStep={() => replayStore.firstStep()}
          lastStep={() => replayStore.lastStep()}
          canSkipOpponentTurn={replayStore.canSkipOpponentTurn(bottomPlayer.index)}
          canReplayFromStep={false}
          skipOpponentTurn={() => replayStore.skipOpponentTurn(bottomPlayer.index)}
          replayFromStep={() => {}}
          copyForkPoint={() => void replayStore.copyForkPoint()}
          copyQuestionContext={() => void replayStore.copyQuestionContext()}
          clearQuestionContextText={() => replayStore.clearQuestionContextText()}
          workbenchUrl={workbenchReturnUrl}
          previousReplayLabel={replayStore.previousReplay?.label}
          nextReplayLabel={replayStore.nextReplay?.label}
          previousReplay={() => void replayStore.previousSavedReplay()}
          nextReplay={() => void replayStore.nextSavedReplay()}
        />
        <ManualLabelPanel
          replay={replayStore.replay}
          step={replayStore.currentStep}
          view={replayStore.currentView}
          replayId={replayStore.currentReplayId}
        />
      {/if}

      {#if liveTimelineMode && liveTimelineStore.replay && liveTimelineStore.currentStep && bottomPlayer}
        <ReplayTimeline
          replay={liveTimelineStore.replay}
          step={liveTimelineStore.currentStep}
          stepIndex={liveTimelineStore.stepIndex}
          copiedQuestionContext={liveTimelineStore.copiedQuestionContext}
          questionContextText={liveTimelineStore.questionContextText}
          setStep={(index) => liveTimelineStore.setStep(index)}
          setStateIndex={(index) => liveTimelineStore.setStateIndex(index)}
          previousStep={() => liveTimelineStore.previousStep()}
          nextStep={() => liveTimelineStore.nextStep()}
          firstStep={() => liveTimelineStore.firstStep()}
          lastStep={() => liveTimelineStore.lastStep()}
          canSkipOpponentTurn={liveTimelineStore.canSkipOpponentTurn(bottomPlayer.index)}
          canReplayFromStep={liveTimelineStore.isBrowsingPast}
          skipOpponentTurn={() => liveTimelineStore.skipOpponentTurn(bottomPlayer.index)}
          replayFromStep={() => void replayLiveFromCurrentStep()}
          copyForkPoint={() => {}}
          copyQuestionContext={() => void liveTimelineStore.copyQuestionContext()}
          clearQuestionContextText={() => liveTimelineStore.clearQuestionContextText()}
          showMatchControls={false}
          showStateControls={false}
          workbenchUrl=""
          previousReplay={() => {}}
          nextReplay={() => {}}
        />
      {/if}

      {#if gameFinished && !replayMode}
        <EndGamePrompt resultLabel={gameResultLabel} turn={game.turn} onBack={resetGame} onRematch={() => void startGame()} />
      {/if}

      {#if setupPrompt}
        <SetupDock
          needsActive={setupNeedsActive}
          canConfirm={setupCanConfirm}
          resolving={promptResolvingBlocked}
          confirm={confirmSetupPokemon}
        />
      {:else if boardStrategy}
        <BoardPromptStrip strategy={boardStrategy} resolving={promptResolvingBlocked} />
      {:else if currentPrompt && !autoResolvePrompt}
        <PromptDock mode={currentPromptDockMode}>
          {#key promptInstanceKey(currentPrompt)}
            <PromptHost
              game={game}
              prompt={currentPrompt}
              resolving={promptResolvingBlocked}
              activeAttachEnergyIndex={attachPromptEnergyIndex}
              attachAssignments={attachPromptAssignments}
              onresolve={resolvePrompt}
              onattachEnergySelect={selectAttachPromptEnergy}
              onattachEnergyUnassign={removeAttachPromptAssignment}
              onattachEnergyReset={resetAttachPromptAssignments}
            />
          {/key}
        </PromptDock>
      {/if}

      <BoardLayer>
        <PlayerPanel side="top">
          <Hand
            player={topPlayer}
            selectedHand={selectedHand}
            disabled={!canAct(topPlayer.index) && setupPrompt?.playerIndex !== topPlayer.index}
            playableIndexes={setupPrompt?.playerIndex === topPlayer.index ? setupPlayableIndexes : []}
            placedIndexes={setupPrompt?.playerIndex === topPlayer.index ? setupPlacedIndexes : []}
            concealed
            onSelect={selectHandCard}
            onDrag={onHandDrag}
            onDragEnd={clearDragState}
          />
        </PlayerPanel>

        <GameBoard
          topPlayer={topPlayerWithKnownDeck ?? topPlayer}
          bottomPlayer={bottomPlayerWithKnownDeck ?? bottomPlayer}
          {topBenchSlots}
          {bottomBenchSlots}
          {topActiveSlot}
          {bottomActiveSlot}
          {currentStadium}
          {currentStadiumOwner}
          {canPlayToBenchArea}
          {canPlaceSetupBench}
          {playToBenchArea}
          {placeSetupBench}
          {allowBenchDrop}
          {dropToBenchArea}
          {isPlayableTarget}
          {isBoardPromptSelectable}
          {isBoardPromptSelected}
          {boardSlotDelta}
          {damageQuickAmounts}
          {canAdjustSlotDamage}
          {adjustSlotDamage}
          {clickSlot}
          {allowDrop}
          {dropToSlot}
          {canPlaceSetupActive}
          {placeSetupActive}
          {showZone}
          {canPlayOnBoard}
          {clickBoardPlay}
          {allowBoardPlayDrop}
          {dropToBoardPlay}
          {boardTilt}
          {boardPerspective}
          {boardScaleY}
          {boardLift}
          onProjectedPileHoverChange={(pileKey) => {
            projectedPileHover = pileKey;
          }}
        />

        <PlayerPanel side="bottom">
          <Hand
            player={bottomPlayer}
            selectedHand={selectedHand}
            disabled={!canAct(bottomPlayer.index) && setupPrompt?.playerIndex !== bottomPlayer.index}
            playableIndexes={setupPrompt?.playerIndex === bottomPlayer.index ? setupPlayableIndexes : []}
            placedIndexes={setupPrompt?.playerIndex === bottomPlayer.index ? setupPlacedIndexes : []}
            expandable
            forceCollapsed={bottomHandForceCollapsed}
            onSelect={selectHandCard}
            onDrag={onHandDrag}
            onDragEnd={clearDragState}
          />
        </PlayerPanel>

        {#if focusedSlot}
          <ActiveFocus
            slot={focusedSlot}
            availableActions={focusedPlayer?.availableActions}
            benchTargets={focusedBenchTargets}
	            busy={sessionBusy}
	            promptActive={!!currentPrompt}
	            {replayMode}
	            canAct={focusedCanAct}
            {canRetreatToSlot}
            close={() => {
              selectionStore.clearFocus();
            }}
            {useAbility}
            {attack}
            startRetreat={startRetreatSelection}
          />
        {/if}

        {#if showLogs}
          <LogPanel logs={game.logs} />
        {/if}

        <ZoneViewer
          open={zoneViewerOpen}
          title={zoneViewerTitle}
	          cards={viewedCards}
	          faceDown={zoneViewerFaceDown}
	          actionLabel={zoneViewerIsStadium && viewedCards.length && !replayMode ? 'スタジアムを使う' : ''}
	          actionDisabled={sessionBusy || !!currentPrompt || gameFinished || replayMode}
	          actionTitle="このスタジアムの効果を使う"
          onAction={useStadium}
          close={() => zoneViewerStore.close()}
        />
      </BoardLayer>
    </TableShell>
    {#if activeMatchRestoreState === 'reconnecting'}
      <div class="session-reconnect-overlay" role="alert" aria-live="assertive">
        <div class="session-reconnect-panel">
          <strong>対戦へ再接続してください</strong>
          <span>{activeMatchRestoreMessage}</span>
          <div class="restore-actions">
            <button type="button" onclick={() => void retryActiveMatchRestore()}>再接続</button>
            <button type="button" class="secondary" onclick={() => void discardActiveMatch()}>対戦を破棄</button>
          </div>
        </div>
      </div>
    {/if}
    {#if checkpointSaveError}
      <div class="checkpoint-warning" role="status">{checkpointSaveError}</div>
    {/if}
  {:else}
    <AppHeader workbenchUrl={workbenchReturnUrl} />
    <section class="replay-loading-screen">
      <div class="replay-loading-panel">
        <strong>対戦を開始できません</strong>
        <span>{labelFor(error || game.logs.at(-1)?.message || 'エンジンが不正な開始前状態を返しました。')}</span>
        <button type="button" onclick={resetGame}>デッキ変更</button>
      </div>
    </section>
  {/if}
  <CardPreview />
</main>
{/if}

<style>
  .replay-loading-screen {
    min-height: 100vh;
    display: grid;
    align-content: center;
    justify-content: center;
    padding: 72px 24px 24px;
  }

  .replay-loading-panel {
    display: grid;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    padding: 16px;
    border-radius: 8px;
    border: 1px solid rgba(26, 31, 39, 0.16);
    background: #f7f8fa;
    color: #1d232b;
    box-shadow: 0 12px 32px rgba(12, 15, 19, 0.18);
  }

  .replay-loading-panel strong {
    font-size: 14px;
  }

  .replay-loading-panel span {
    color: #566272;
    font-size: 13px;
  }

  .restore-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .restore-actions button,
  .replay-loading-panel button {
    min-height: 40px;
    padding: 8px 14px;
    border: 0;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .restore-actions button.secondary {
    background: #e5e7eb;
    color: #1f2937;
  }

  .session-reconnect-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(10, 14, 20, 0.58);
    backdrop-filter: blur(3px);
  }

  .session-reconnect-panel {
    display: grid;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    padding: 18px;
    border-radius: 12px;
    background: #f7f8fa;
    color: #1d232b;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
  }

  .session-reconnect-panel span {
    color: #566272;
    font-size: 13px;
  }

  .checkpoint-warning {
    position: fixed;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    z-index: 900;
    max-width: min(420px, calc(100vw - 24px));
    padding: 10px 12px;
    border-radius: 8px;
    background: #7f1d1d;
    color: #fff;
    font-size: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  }

</style>
