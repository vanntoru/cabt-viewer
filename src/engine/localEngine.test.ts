import { describe, expect, it } from 'vitest';
import { LocalEngineController } from './localEngine';
import { SlotType, targetFor } from '../lib/game/types';
import { CabtAreaType, CabtOptionType, CabtSelectContext } from '../lib/cabt/types';

describe('LocalEngineController', () => {
  it('closes the one active session when requested with the matching id', async () => {
    const previousEngineMode = process.env.CABT_ENGINE_MODE;
    delete process.env.CABT_ENGINE_MODE;
    const engine = new LocalEngineController() as any;
    let bridgeClosed = false;
    engine.sessionId = 'test-session';
    engine.viewResponse = () => ({
      ok: true,
      sessionId: engine.sessionId,
      view: {
        ready: true,
        phase: 1,
        phaseLabel: 'play',
        turn: 1,
        activePlayerIndex: 0,
        players: [],
        prompts: [],
        logs: [],
        events: [],
      },
    });
    engine.bridge = {
      close: () => {
        bridgeClosed = true;
      },
    };

    try {
      const response = await engine.handle({ type: 'closeGame', payload: { sessionId: 'test-session' } });

      expect(response.ok).toBe(true);
      expect(response.sessionId).toBe('test-session');
      expect(bridgeClosed).toBe(true);
      expect(engine.sessionId).toBe('');
    } finally {
      process.env.CABT_ENGINE_MODE = previousEngineMode;
    }
  });

  process.env.CABT_ENGINE_MODE = 'demo';

  it('starts a CABT-shaped demo game and exposes a playable view', async () => {
    const engine = new LocalEngineController();
    const res = await engine.handle({
      type: 'startGame',
      payload: {
        player1: { deck: [] },
        player2: { deck: [] },
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.view.players).toHaveLength(2);
    expect(res.view.phaseLabel).toBe('Player turn');
    expect(res.view.players[0]?.active.pokemon?.name).toBe('Charmander');
    expect(res.view.players[0]?.availableActions?.active?.attacks[0]?.name).toBe('Ember');
  });

  it('accepts existing UI commands through the CABT adapter scaffold', async () => {
    const engine = new LocalEngineController();
    let res = await engine.handle({ type: 'startGame' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    res = await engine.handle({
      type: 'playCard',
      payload: {
        playerIndex: 0,
        handIndex: 0,
        target: targetFor(0, 0, SlotType.ACTIVE),
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.view.players[0]?.active.energy).toHaveLength(2);

    res = await engine.handle({ type: 'attack', payload: { playerIndex: 0, attack: 'Ember' } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.view.activePlayerIndex).toBe(1);
      expect(res.view.logs.at(-2)?.message).toContain('Ember');
    }
  });

  it('matches real CABT main-phase hand options with omitted source fields', () => {
    const engine = new LocalEngineController() as any;
    const payload = {
      playerIndex: 0,
      handIndex: 3,
      target: targetFor(0, 0, SlotType.ACTIVE),
    };

    expect(engine.matchesPlayCardOption({ type: CabtOptionType.PLAY, index: 3 }, payload)).toBe(true);
    expect(engine.matchesPlayCardOption({
      type: CabtOptionType.ATTACH,
      area: CabtAreaType.HAND,
      index: 3,
      inPlayArea: CabtAreaType.ACTIVE,
      inPlayIndex: 0,
    }, payload)).toBe(true);
    expect(engine.matchesPlayCardOption({
      type: CabtOptionType.ATTACH,
      area: CabtAreaType.HAND,
      index: 3,
      inPlayArea: CabtAreaType.BENCH,
      inPlayIndex: 0,
    }, payload)).toBe(false);
  });

  it('matches CABT ability options to the clicked board slot and ability name', () => {
    const engine = new LocalEngineController() as any;
    engine.observation = {
      current: {
        players: [
          {
            active: [null],
            bench: [{ id: 96 }],
            hand: [],
          },
        ],
      },
    };
    engine.dataMaps = {
      cardData: {
        96: { cardId: 96, name: 'Teal Mask Ogerpon ex', cardType: 0, skills: [{ name: 'Teal Dance' }] },
      },
      attacks: {},
    };

    expect(engine.matchesAbilityOption({
      type: CabtOptionType.ABILITY,
      area: CabtAreaType.BENCH,
      index: 0,
    }, {
      playerIndex: 0,
      ability: 'Teal Dance',
      target: targetFor(0, 0, SlotType.BENCH, 0),
    })).toBe(true);
    expect(engine.matchesAbilityOption({
      type: CabtOptionType.ABILITY,
      area: CabtAreaType.BENCH,
      index: 0,
    }, {
      playerIndex: 0,
      ability: 'Wrong Ability',
      target: targetFor(0, 0, SlotType.BENCH, 0),
    })).toBe(false);
  });

  it('keeps a selected retreat target across intermediate CABT prompts', () => {
    const engine = new LocalEngineController() as any;
    engine.pendingRetreatTarget = { playerIndex: 0, benchIndex: 1 };
    engine.observation = {
      select: {
        option: [
          { area: CabtAreaType.BENCH, index: 0 },
          { area: CabtAreaType.BENCH, index: 1 },
        ],
      },
    };

    expect(engine.findPendingRetreatTargetOption()).toBe(1);
  });

  it('rejects invalid manual option selections before calling the CABT bridge', async () => {
    const engine = new LocalEngineController() as any;
    engine.sessionId = 'test-session';
    engine.dataMaps = { cardData: {}, attacks: {} };
    engine.observation = {
      logs: [],
      current: null,
      select: {
        type: 1,
        context: CabtSelectContext.TO_ACTIVE,
        minCount: 1,
        maxCount: 1,
        remainDamageCounter: 0,
        remainEnergyCost: 0,
        option: [{ type: CabtOptionType.CARD }],
        deck: null,
        contextCard: null,
        effect: null,
      },
    };
    engine.bridge = {
      request: async () => {
        throw new Error('bridge should not be called');
      },
    };

    await expect(engine.applySelection([1])).rejects.toThrow('out-of-range option indexes');
    await expect(engine.applySelection([0, 0])).rejects.toThrow('Selection must contain 1-1 option');
  });

  it('sends an empty optional setup bench selection to the CABT bridge', async () => {
    const previousEngineMode = process.env.CABT_ENGINE_MODE;
    delete process.env.CABT_ENGINE_MODE;
    try {
      const engine = new LocalEngineController() as any;
      const selections: number[][] = [];
      const select = {
        type: 1,
        context: CabtSelectContext.SETUP_BENCH_POKEMON,
        minCount: 0,
        maxCount: 1,
        remainDamageCounter: 0,
        remainEnergyCost: 0,
        option: [{ type: CabtOptionType.CARD, area: CabtAreaType.HAND, index: 0, playerIndex: 0 }],
        deck: null,
        contextCard: null,
        effect: null,
      };
      engine.sessionId = 'test-session';
      engine.dataMaps = { cardData: {}, attacks: {} };
      engine.observation = { select, logs: [], current: null };
      engine.bridge = {
        request: async ({ selection }: { selection: number[] }) => {
          selections.push(selection);
          return {
            ok: true,
            observation: { select: null, logs: [], current: null },
          };
        },
      };

      const response = await engine.handle({
        type: 'resolvePrompt',
        payload: { sessionId: 'test-session', result: [] },
      });

      expect(response.ok).toBe(true);
      expect(selections).toEqual([[]]);
    } finally {
      process.env.CABT_ENGINE_MODE = previousEngineMode;
    }
  });

  it('batches repeated single-energy retreat payment prompts', async () => {
    const engine = new LocalEngineController() as any;
    const selections: number[][] = [];
    const activeWithFourEnergy = {
      id: 723,
      hp: 350,
      maxHp: 350,
      appearThisTurn: false,
      energies: [3, 3, 3, 3],
      energyCards: [10, 11, 12, 13].map((serial) => ({ id: 3, serial, playerIndex: 0 })),
      tools: [],
      preEvolution: [],
    };
    const current = {
      turn: 1,
      turnActionCount: 0,
      yourIndex: 0,
      firstPlayer: 0,
      supporterPlayed: false,
      stadiumPlayed: false,
      energyAttached: true,
      retreated: false,
      result: -1,
      stadium: [],
      looking: null,
      players: [
        {
          active: [activeWithFourEnergy],
          bench: [{ id: 722, hp: 90, maxHp: 90, appearThisTurn: false, energies: [], energyCards: [], tools: [], preEvolution: [] }],
          benchMax: 5,
          deckCount: 47,
          discard: [],
          prize: [],
          handCount: 0,
          hand: [],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        {
          active: [null],
          bench: [],
          benchMax: 5,
          deckCount: 47,
          discard: [],
          prize: [],
          handCount: 0,
          hand: [],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
      ],
    };
    const energySelect = (energyCards: typeof activeWithFourEnergy.energyCards) => ({
      type: 1,
      context: CabtSelectContext.DISCARD_ENERGY_CARD,
      minCount: 1,
      maxCount: 1,
      remainDamageCounter: 0,
      remainEnergyCost: energyCards.length,
      option: energyCards.map((_card, energyIndex) => ({
        type: CabtOptionType.ENERGY_CARD,
        area: CabtAreaType.ACTIVE,
        index: 0,
        energyIndex,
        playerIndex: 0,
      })),
      deck: null,
      contextCard: null,
      effect: null,
    });

    engine.sessionId = 'test-session';
    engine.pendingRetreatTarget = { playerIndex: 0, benchIndex: 0 };
    engine.dataMaps = { cardData: {}, attacks: {} };
    engine.observation = {
      select: energySelect(activeWithFourEnergy.energyCards),
      logs: [],
      current,
    };
    engine.bridge = {
      request: async ({ selection }: { selection: number[] }) => {
        selections.push(selection);
        activeWithFourEnergy.energyCards.shift();
        activeWithFourEnergy.energies.shift();
        if (activeWithFourEnergy.energyCards.length) {
          return {
            ok: true,
            observation: { select: energySelect(activeWithFourEnergy.energyCards), logs: [], current },
          };
        }
        return {
          ok: true,
          observation: {
            select: {
              type: 1,
              context: CabtSelectContext.TO_ACTIVE,
              minCount: 1,
              maxCount: 1,
              remainDamageCounter: 0,
              remainEnergyCost: 0,
              option: [{ type: CabtOptionType.CARD, area: CabtAreaType.BENCH, index: 0, playerIndex: 0 }],
              deck: null,
              contextCard: null,
              effect: null,
            },
            logs: [],
            current,
          },
        };
      },
    };

    await engine.applySelection([0, 1, 2, 3]);

    expect(selections).toEqual([[0], [0], [0], [0], [0]]);
  });

  it('expands board damage placements into repeated CABT damage counter selections', async () => {
    const engine = new LocalEngineController() as any;
    const selections: number[][] = [];
    let remainingCounters = 6;
    const current = {
      turn: 3,
      turnActionCount: 2,
      yourIndex: 0,
      firstPlayer: 0,
      supporterPlayed: false,
      stadiumPlayed: false,
      energyAttached: true,
      retreated: false,
      result: -1,
      stadium: [],
      looking: null,
      players: [
        {
          active: [null],
          bench: [],
          benchMax: 5,
          deckCount: 47,
          discard: [],
          prize: [],
          handCount: 0,
          hand: [],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
        {
          active: [null],
          bench: [
            { id: 305, hp: 70, maxHp: 70, appearThisTurn: false, energies: [], energyCards: [], tools: [], preEvolution: [] },
            { id: 646, hp: 70, maxHp: 70, appearThisTurn: false, energies: [], energyCards: [], tools: [], preEvolution: [] },
          ],
          benchMax: 5,
          deckCount: 47,
          discard: [],
          prize: [],
          handCount: 0,
          hand: [],
          poisoned: false,
          burned: false,
          asleep: false,
          paralyzed: false,
          confused: false,
        },
      ],
    };
    const damageSelect = () => ({
      type: 1,
      context: CabtSelectContext.DAMAGE_COUNTER_ANY,
      minCount: 1,
      maxCount: 1,
      remainDamageCounter: remainingCounters,
      remainEnergyCost: 0,
      option: [
        { type: CabtOptionType.CARD, area: CabtAreaType.BENCH, index: 0, playerIndex: 1 },
        { type: CabtOptionType.CARD, area: CabtAreaType.BENCH, index: 1, playerIndex: 1 },
      ],
      deck: null,
      contextCard: null,
      effect: null,
    });

    engine.sessionId = 'test-session';
    engine.dataMaps = { cardData: {}, attacks: {} };
    engine.observation = {
      select: damageSelect(),
      logs: [],
      current,
    };
    engine.bridge = {
      request: async ({ selection }: { selection: number[] }) => {
        selections.push(selection);
        remainingCounters -= 1;
        return {
          ok: true,
          observation: {
            select: remainingCounters > 0 ? damageSelect() : null,
            logs: [],
            current,
          },
        };
      },
    };

    await engine.applyDamagePlacementSelections([
      { target: targetFor(0, 1, SlotType.BENCH, 0), damage: 30 },
      { target: targetFor(0, 1, SlotType.BENCH, 1), damage: 30 },
    ]);

    expect(selections).toEqual([[0], [0], [0], [1], [1], [1]]);
  });
});
