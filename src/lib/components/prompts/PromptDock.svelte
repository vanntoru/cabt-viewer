<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    mode?: 'default' | 'search' | 'attachEnergy' | 'boardChoice';
    children: Snippet;
  };

  let { mode = 'default', children }: Props = $props();
</script>

<div
  class="prompt-dock"
  class:search-prompt-dock={mode === 'search'}
  class:attach-energy-prompt-dock={mode === 'attachEnergy'}
  class:board-choice-prompt-dock={mode === 'boardChoice'}
>
  {@render children()}
</div>

<style>
  .prompt-dock {
    position: absolute;
    left: calc((100vw - var(--board-right-rail)) / 2);
    top: calc((var(--board-top-inset) + 100vh - var(--board-bottom-inset)) / 2);
    z-index: 14;
    width: min(560px, calc(100vw - 220px));
    max-height: min(72vh, 680px);
    transform: translate(-50%, -50%);
  }

  .prompt-dock.search-prompt-dock {
    width: min(1120px, calc(100vw - 220px));
    height: auto;
    max-height: min(88vh, 900px);
  }

  .prompt-dock.attach-energy-prompt-dock {
    top: 10px;
    bottom: auto;
    width: min(640px, calc(100vw - 190px));
    max-height: min(28vh, 230px);
    transform: translateX(-50%);
  }

  .prompt-dock.board-choice-prompt-dock {
    width: min(760px, calc(100vw - 220px));
    max-height: min(82vh, 760px);
  }

  .prompt-dock:has(:global(.prompt-panel-collapsed)) {
    left: calc((100vw - var(--board-right-rail)) / 2);
    top: calc(var(--board-top-inset) + 48px);
    width: max-content;
    transform: translate(-50%, -50%);
  }

  @media (max-width: 640px) {
    .prompt-dock,
    .prompt-dock.search-prompt-dock {
      left: 50%;
      width: calc(100vw - 16px);
    }

    .prompt-dock.attach-energy-prompt-dock {
      width: calc(100vw - 16px);
    }

    .prompt-dock.board-choice-prompt-dock {
      width: calc(100vw - 16px);
    }
  }
</style>
