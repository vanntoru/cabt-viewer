// @vitest-environment happy-dom
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReplaySnapshot } from '../game/replay';
import ReplayTimeline from './ReplayTimeline.svelte';

const replay: ReplaySnapshot = {
  id: 'keyboard-test',
  name: 'Keyboard test replay',
  created: 0,
  players: [
    { userId: 0, name: 'Player 1' },
    { userId: 1, name: 'Player 2' },
  ],
  winner: -1,
  stateCount: 3,
  actionCount: 2,
  turnCount: 2,
  cardNames: [],
  views: [],
  steps: [
    {
      index: 0,
      label: 'Initial',
      stateIndex: 0,
      actionIndex: null,
      turn: 0,
      phase: 0,
      activePlayerIndex: 0,
      type: 'initial',
      payload: null,
    },
    {
      index: 1,
      label: 'Action',
      stateIndex: 1,
      actionIndex: 0,
      turn: 1,
      phase: 0,
      activePlayerIndex: 1,
      type: 'action',
      payload: null,
    },
  ],
};

describe('ReplayTimeline keyboard and turn navigation', () => {
  let component: Record<string, unknown> | undefined;

  afterEach(() => {
    if (component) {
      unmount(component);
      component = undefined;
    }
    document.body.innerHTML = '';
  });

  function render() {
    const previousStep = vi.fn();
    const nextStep = vi.fn();
    const previousPlayerTurn = vi.fn();
    const nextPlayerTurn = vi.fn();
    const previousReplay = vi.fn();
    const nextReplay = vi.fn();
    component = mount(ReplayTimeline, {
      target: document.body,
      props: {
        replay,
        step: replay.steps[0],
        stepIndex: 0,
        setStep: vi.fn(),
        setStateIndex: vi.fn(),
        previousStep,
        nextStep,
        previousPlayerTurn,
        nextPlayerTurn,
        canPreviousPlayerTurn: true,
        canNextPlayerTurn: true,
        ownTurnsOnly: false,
        toggleOwnTurnsOnly: vi.fn(),
        firstStep: vi.fn(),
        lastStep: vi.fn(),
        togglePlayback: vi.fn(),
        backToReplayHome: vi.fn(),
        previousReplay,
        nextReplay,
        canPreviousReplay: true,
        canNextReplay: true,
        playlistPosition: '2 / 4',
        copyForkPoint: vi.fn(),
      },
    });
    flushSync();
    return { previousStep, nextStep, previousPlayerTurn, nextPlayerTurn, previousReplay, nextReplay };
  }

  it('uses plain arrow keys for single-step replay navigation', () => {
    const handlers = render();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(handlers.previousStep).toHaveBeenCalledOnce();
    expect(handlers.nextStep).toHaveBeenCalledOnce();
  });

  it('labels the single-step controls clearly for touch navigation', () => {
    render();

    expect(document.querySelector('[aria-label="Previous action"]')?.textContent).toBe('戻る');
    expect(document.querySelector('[aria-label="Next action"]')?.textContent).toBe('次へ');
  });

  it('offers a dedicated board-information copy control on mobile layouts', () => {
    const copyForkPoint = vi.fn();
    component = mount(ReplayTimeline, {
      target: document.body,
      props: {
        replay,
        step: replay.steps[0],
        stepIndex: 0,
        setStep: vi.fn(),
        setStateIndex: vi.fn(),
        previousStep: vi.fn(),
        nextStep: vi.fn(),
        previousPlayerTurn: vi.fn(),
        nextPlayerTurn: vi.fn(),
        firstStep: vi.fn(),
        lastStep: vi.fn(),
        togglePlayback: vi.fn(),
        backToReplayHome: vi.fn(),
        copyForkPoint,
      },
    });
    flushSync();

    const copyButton = document.querySelector<HTMLButtonElement>('[aria-label="盤面情報をコピー"]')!;
    expect(copyButton.textContent?.trim()).toBe('盤面コピー');
    copyButton.click();
    expect(copyForkPoint).toHaveBeenCalledOnce();
  });

  it('uses shift plus arrow keys and visible buttons for tracked-player turns', () => {
    const handlers = render();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    document.querySelector<HTMLButtonElement>('[aria-label="Previous tracked-player turn"]')!.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Next tracked-player turn"]')!.click();

    expect(handlers.previousPlayerTurn).toHaveBeenCalledTimes(2);
    expect(handlers.nextPlayerTurn).toHaveBeenCalledTimes(2);
  });

  it('does not intercept arrow keys typed in the state input', () => {
    const handlers = render();
    const input = document.querySelector<HTMLInputElement>('[aria-label="State index"]')!;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(handlers.nextStep).not.toHaveBeenCalled();
    expect(handlers.nextPlayerTurn).not.toHaveBeenCalled();
  });

  it('offers an own-turn-only mode and shows the tracked turn when enabled', () => {
    const toggleOwnTurnsOnly = vi.fn();
    component = mount(ReplayTimeline, {
      target: document.body,
      props: {
        replay,
        step: replay.steps[1],
        stepIndex: 1,
        setStep: vi.fn(),
        setStateIndex: vi.fn(),
        previousStep: vi.fn(),
        nextStep: vi.fn(),
        previousPlayerTurn: vi.fn(),
        nextPlayerTurn: vi.fn(),
        canPreviousPlayerTurn: true,
        canNextPlayerTurn: true,
        ownTurnsOnly: true,
        toggleOwnTurnsOnly,
        firstStep: vi.fn(),
        lastStep: vi.fn(),
        togglePlayback: vi.fn(),
        backToReplayHome: vi.fn(),
        copyForkPoint: vi.fn(),
      },
    });
    flushSync();

    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Show tracked-player turns only"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.own-turn-status')?.textContent).toContain('自分 Turn 1');
    toggle.click();
    expect(toggleOwnTurnsOnly).toHaveBeenCalledOnce();
  });

  it('moves directly between playlist replays', () => {
    const handlers = render();

    document.querySelector<HTMLButtonElement>('[aria-label="Previous replay"]')!.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Next replay"]')!.click();

    expect(handlers.previousReplay).toHaveBeenCalledOnce();
    expect(handlers.nextReplay).toHaveBeenCalledOnce();
    expect(document.querySelector('.replay-playlist-nav')?.textContent).toContain('2 / 4');
  });

  it('shows the saved turn-two attack probability and interval', () => {
    const step = {
      ...replay.steps[1],
      phantomDiveProbability: {
        playerIndex: 0,
        ownTurn: 2,
        status: 'estimated_complete',
        method: 'adaptive_native_macro_monte_carlo',
        probability: 0.375,
        confidenceInterval95: [0.31, 0.44] as [number, number],
        evaluationTrials: 256,
      },
    };
    component = mount(ReplayTimeline, {
      target: document.body,
      props: {
        replay,
        step,
        stepIndex: 1,
        setStep: vi.fn(),
        setStateIndex: vi.fn(),
        previousStep: vi.fn(),
        nextStep: vi.fn(),
        previousPlayerTurn: vi.fn(),
        nextPlayerTurn: vi.fn(),
        firstStep: vi.fn(),
        lastStep: vi.fn(),
        togglePlayback: vi.fn(),
        backToReplayHome: vi.fn(),
        copyForkPoint: vi.fn(),
      },
    });
    flushSync();

    const readout = document.querySelector('[aria-label="2ターン目攻撃成功率"]');
    expect(readout?.textContent).toContain('37.5%');
    expect(readout?.textContent).toContain('31.0%–44.0%');
    const mobileReadout = document.querySelector('[aria-label="モバイル 2ターン目攻撃成功率"]');
    expect(mobileReadout?.textContent).toContain('2T攻撃 37.5%');
  });
});
