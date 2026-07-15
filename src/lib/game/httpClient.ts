import type { GameCommandApi } from './gameApi';
import type { CardTarget, EngineResponse } from './types';
import { clearActiveSessionPointer, writeActiveSessionPointer } from './activeMatchCheckpoint';

type Command = {
  type: string;
  payload?: unknown;
  availableActionsScope?: AvailableActionsScope;
};

type AvailableActionsScope = 'none' | 'active' | 'full';

let currentSessionId = '';

async function send(command: Command, sessionIdOverride = ''): Promise<EngineResponse> {
  const sessionId = sessionIdOverride || currentSessionId;
  const commandWithSession = command.type === 'startGame' || !sessionId
    ? command
    : {
        ...command,
        payload: {
          ...(command.payload && typeof command.payload === 'object' ? command.payload : {}),
          sessionId,
        },
      };
  const response = await fetch('/local-engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commandWithSession),
  });
  const body = await response.json() as EngineResponse;
  if (body.ok && body.sessionId) {
    currentSessionId = body.sessionId;
    writeActiveSessionPointer(body.sessionId);
  } else if (!body.ok && body.error.includes('session')) {
    currentSessionId = '';
  }
  return body;
}

export function hostedAvailableActionsScope(command: Command): AvailableActionsScope | undefined {
  if (command.availableActionsScope) {
    return command.availableActionsScope;
  }

  switch (command.type) {
    case 'playCard':
    case 'attack':
    case 'useAbility':
    case 'useStadium':
    case 'concede':
    case 'retreat':
    case 'resolvePrompt':
      return 'none';
    default:
      return undefined;
  }
}

function hostedAvailableActionsOptions(command: Command): { availableActionsScope?: AvailableActionsScope } {
  const availableActionsScope = hostedAvailableActionsScope(command);
  return availableActionsScope ? { availableActionsScope } : {};
}

export const localGameApi: GameCommandApi & {
  start(player1Deck: string[], player2Deck: string[], agentId?: string): Promise<EngineResponse>;
  state(): Promise<EngineResponse>;
  resume(sessionId: string): Promise<EngineResponse>;
  closeSession(sessionId?: string): Promise<EngineResponse | null>;
  currentSessionId(): string;
  forgetSession(): void;
} = {
  start(player1Deck: string[], player2Deck: string[], agentId?: string) {
    return send({
      type: 'startGame',
      payload: {
        player1: { name: 'Player 1', deck: player1Deck },
        player2: { name: 'AI Opponent', deck: player2Deck, agentId },
      },
    });
  },

  state() {
    return send({ type: 'state' });
  },

  resume(sessionId: string) {
    return send({ type: 'state' }, sessionId);
  },

  async closeSession(sessionId = currentSessionId) {
    if (!sessionId) {
      return null;
    }
    try {
      return await send({ type: 'closeGame' }, sessionId);
    } finally {
      currentSessionId = '';
      clearActiveSessionPointer();
    }
  },

  currentSessionId() {
    return currentSessionId;
  },

  forgetSession() {
    currentSessionId = '';
    clearActiveSessionPointer();
  },

  playCard(playerIndex: number, handIndex: number, target: CardTarget) {
    return send({ type: 'playCard', payload: { playerIndex, handIndex, target } });
  },

  attack(playerIndex: number, attack: string) {
    return send({ type: 'attack', payload: { playerIndex, attack } });
  },

  useAbility(playerIndex: number, ability: string, target: CardTarget) {
    return send({ type: 'useAbility', payload: { playerIndex, ability, target } });
  },

  useStadium(playerIndex: number) {
    return send({ type: 'useStadium', payload: { playerIndex } });
  },

  concede(playerIndex: number) {
    return send({ type: 'concede', payload: { playerIndex } });
  },

  retreat(playerIndex: number, to: number) {
    return send({ type: 'retreat', payload: { playerIndex, to } });
  },

  passTurn(playerIndex: number) {
    return send({ type: 'passTurn', payload: { playerIndex } });
  },

  resolvePrompt(id: number, result: unknown) {
    return send({ type: 'resolvePrompt', payload: { id, result } });
  },

  replayFromStep(stepIndex: number, historyLength?: number) {
    return send({ type: 'rewindTo', payload: { stepIndex, historyLength } });
  },
};
