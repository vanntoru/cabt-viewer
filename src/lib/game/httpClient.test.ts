import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostedAvailableActionsScope, localGameApi } from './httpClient';

afterEach(() => {
  localGameApi.forgetSession();
  vi.unstubAllGlobals();
});

describe('hosted headless requests', () => {
  it('skips legality dry-runs for latency-sensitive mutation responses', () => {
    expect(hostedAvailableActionsScope({ type: 'playCard' })).toBe('none');
    expect(hostedAvailableActionsScope({ type: 'resolvePrompt' })).toBe('none');
    expect(hostedAvailableActionsScope({ type: 'attack' })).toBe('none');
    expect(hostedAvailableActionsScope({ type: 'retreat' })).toBe('none');
  });

  it('keeps default active-player legality for initial and explicit state requests', () => {
    expect(hostedAvailableActionsScope({ type: 'newGame' })).toBeUndefined();
    expect(hostedAvailableActionsScope({ type: 'state' })).toBeUndefined();
    expect(hostedAvailableActionsScope({ type: 'passTurn' })).toBeUndefined();
  });

  it('allows callers to opt back into scoped legality', () => {
    expect(hostedAvailableActionsScope({ type: 'playCard', availableActionsScope: 'active' })).toBe('active');
    expect(hostedAvailableActionsScope({ type: 'state', availableActionsScope: 'full' })).toBe('full');
  });

  it('resumes with an explicitly restored session id', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const command = JSON.parse(String(init.body));
      expect(command).toEqual({ type: 'state', payload: { sessionId: 'saved-session' } });
      return {
        json: async () => ({ ok: true, sessionId: 'saved-session', view: emptyView() }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await localGameApi.resume('saved-session');

    expect(response.ok).toBe(true);
    expect(localGameApi.currentSessionId()).toBe('saved-session');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('closes an explicitly named session and forgets it locally', async () => {
    const commands: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      commands.push(JSON.parse(String(init.body)));
      return {
        json: async () => ({ ok: true, sessionId: 'saved-session', view: emptyView() }),
      };
    }));

    await localGameApi.closeSession('saved-session');

    expect(commands).toEqual([{ type: 'closeGame', payload: { sessionId: 'saved-session' } }]);
    expect(localGameApi.currentSessionId()).toBe('');
  });
});

function emptyView() {
  return {
    ready: true,
    phase: 1,
    phaseLabel: 'play',
    turn: 1,
    activePlayerIndex: 0,
    players: [],
    prompts: [],
    logs: [],
    events: [],
  };
}
