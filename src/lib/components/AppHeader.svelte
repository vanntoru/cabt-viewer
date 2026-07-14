<script lang="ts">
  type Props = {
    workbenchUrl?: string;
  };

  let { workbenchUrl = '' }: Props = $props();
</script>

<header class="app-header">
  <div>
    <h1>対戦リプレイビューア</h1>
    <p>対戦とリプレイ確認</p>
  </div>
  {#if workbenchUrl}
    <a class="workbench-link" href={workbenchUrl}>Workbenchへ戻る</a>
  {/if}
</header>

<style>
  .app-header {
    position: absolute;
    top: 10px;
    left: 14px;
    right: 14px;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: none;
  }

  .app-header h1 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0;
  }

  .app-header p {
    display: none;
  }

  .workbench-link {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--surface-toolbar-border);
    border-radius: 999px;
    background: var(--surface-toolbar-bg);
    color: var(--accent-strong);
    box-shadow: var(--surface-toolbar-shadow);
    backdrop-filter: blur(var(--backdrop-blur));
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    touch-action: manipulation;
  }

  @media (max-width: 640px) {
    .app-header {
      align-items: flex-start;
    }

    .app-header h1 {
      max-width: 180px;
      font-size: 14px;
      line-height: 1.25;
    }

    .workbench-link {
      min-height: 38px;
      padding: 7px 10px;
      font-size: 11px;
    }
  }
</style>
