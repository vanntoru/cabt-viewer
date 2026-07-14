<script lang="ts">
  import type { AgentOption, GameLogEntry, RoundRobinDeckCatalog } from '../home/catalog';
  import { userDeckCardCount, userDeckChoiceKey, type UserDeck } from '../game/userDecks';
  import cardNamesJa from '../cabt/cardNamesJa.generated.json';

  type HomeMode = 'play' | 'logs' | 'decks';

  type Props = {
    homeMode: HomeMode;
    deck1Text: string;
    deck2Text: string;
    selectedAgentId: string;
    selectedPlayerDeckId: string;
    selectedOpponentDeckId: string;
    agents?: AgentOption[];
    gameLogs?: GameLogEntry[];
    roundRobinDeckCatalog?: RoundRobinDeckCatalog;
    userDecks?: UserDeck[];
    busy?: boolean;
    catalogBusy?: boolean;
    uploadBusy?: boolean;
    error?: string;
    catalogError?: string;
    uploadError?: string;
    setHomeMode: (mode: HomeMode) => void;
    startGame: () => void;
    uploadDeckFiles: (files: FileList | File[]) => void | Promise<void>;
    deleteUserDeck: (id: string) => void;
    loadGameLog: (log: GameLogEntry) => void;
    refreshCatalog: () => void;
  };

  let {
    homeMode,
    deck1Text = $bindable(),
    deck2Text = $bindable(),
    selectedAgentId = $bindable(),
    selectedPlayerDeckId = $bindable(),
    selectedOpponentDeckId = $bindable(),
    agents = [],
    gameLogs = [],
    roundRobinDeckCatalog = { decks: [] },
    userDecks = [],
    busy = false,
    catalogBusy = false,
    uploadBusy = false,
    error = '',
    catalogError = '',
    uploadError = '',
    setHomeMode,
    startGame,
    uploadDeckFiles,
    deleteUserDeck,
    loadGameLog,
    refreshCatalog,
  }: Props = $props();

  let selectedRoundRobinDeckId = $state('');
  let selectedUserDeckId = $state('');
  let roundRobinDecks = $derived(roundRobinDeckCatalog.decks);
  let playerDeckChoiceCount = $derived(roundRobinDecks.length + userDecks.length);
  let opponentDeckChoiceCount = $derived(roundRobinDecks.length);
  let selectedPlayerDeck = $derived(deckChoiceSummary(selectedPlayerDeckId));
  let selectedOpponentDeck = $derived(deckChoiceSummary(selectedOpponentDeckId));
  let selectedRoundRobinDeck = $derived(
    roundRobinDecks.find((deck) => deck.id === selectedRoundRobinDeckId) ?? roundRobinDecks[0],
  );
  let selectedUserDeck = $derived(userDecks.find((deck) => deck.id === selectedUserDeckId) ?? userDecks[0]);
  const japaneseCardNames = cardNamesJa as Record<string, string>;

  $effect(() => {
    if (!roundRobinDecks.length) {
      selectedRoundRobinDeckId = '';
      return;
    }
    if (!roundRobinDecks.some((deck) => deck.id === selectedRoundRobinDeckId)) {
      selectedRoundRobinDeckId = roundRobinDecks[0].id;
    }
  });

  $effect(() => {
    if (!userDecks.length) {
      selectedUserDeckId = '';
      return;
    }
    if (!userDecks.some((deck) => deck.id === selectedUserDeckId)) {
      selectedUserDeckId = userDecks[0].id;
    }
  });

  function logPlayerLabel(log: GameLogEntry): string {
    return log.players?.length ? log.players.join(' 対 ') : 'AI対AI';
  }

  function totalCards() {
    return selectedRoundRobinDeck?.cards.reduce((sum, card) => sum + card.count, 0) ?? 0;
  }

  function displayCardName(card: { cardId: number; cardName: string }) {
    return japaneseCardNames[String(card.cardId)] ?? card.cardName;
  }

  function roundRobinDeckKey(id: string) {
    return `round:${id}`;
  }

  function deckOptionLabel(deck: { id: string; name: string }) {
    return `${deck.id} / ${deck.name}`;
  }

  function deckChoiceSummary(choiceKey: string) {
    if (choiceKey.startsWith('user:')) {
      const deck = userDecks.find((item) => userDeckChoiceKey(item.id) === choiceKey);
      if (!deck) {
        return 'デッキを選択してください';
      }
      return `${userDeckCardCount(deck)}枚 · マイデッキ · ${deck.validation.valid ? '使用可能' : '要修正'}`;
    }

    const roundRobinId = choiceKey.startsWith('round:') ? choiceKey.slice('round:'.length) : choiceKey;
    const deck = roundRobinDecks.find((item) => item.id === roundRobinId);
    if (!deck) {
      return 'デッキを選択してください';
    }
    const count = deck.cards.reduce((sum, card) => sum + card.count, 0);
    return `${count}枚${deck.role ? ` · ${deck.role}` : ''}`;
  }

  function userDeckSummary(deck: UserDeck) {
    return `${userDeckCardCount(deck)}枚 · ${deck.deck_hash} · revision ${deck.revision}`;
  }

  function userDeckCardName(cardId: number) {
    return japaneseCardNames[String(cardId)] ?? `不明なカード ${cardId}`;
  }

  function useUserDeck(deck: UserDeck) {
    selectedPlayerDeckId = userDeckChoiceKey(deck.id);
    setHomeMode('play');
  }

  function confirmDeleteUserDeck(deck: UserDeck) {
    if (window.confirm(`${deck.name} を削除しますか？この操作は元に戻せません。`)) {
      deleteUserDeck(deck.id);
    }
  }

  function onUploadChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      void uploadDeckFiles(input.files);
      input.value = '';
    }
  }
</script>

<section class="import-screen">
  <div class="home-tabs" role="tablist" aria-label="表示モード">
    <button class:active={homeMode === 'play'} type="button" onclick={() => setHomeMode('play')}>対戦</button>
    <button class:active={homeMode === 'logs'} type="button" onclick={() => setHomeMode('logs')}>試合ログ</button>
    <button class:active={homeMode === 'decks'} type="button" onclick={() => setHomeMode('decks')}>デッキ</button>
  </div>

  {#if homeMode === 'play'}
    <div class="upload-panel">
      <label class="zip-upload">
        <span>ZIPからマイデッキへ取り込み</span>
        <input type="file" accept=".zip,application/zip" multiple disabled={busy || uploadBusy} onchange={onUploadChange} />
      </label>
      <span class="upload-hint">{uploadBusy ? '読み込み中...' : 'ZIP内の60枚デッキをMac共通のマイデッキへ保存します。'}</span>
    </div>
    {#if uploadError}
      <pre class="error">{uploadError}</pre>
    {/if}
    {#if userDecks.length}
      <div class="uploaded-deck-list" aria-label="マイデッキ一覧">
        {#each userDecks as deck}
          <div class="uploaded-deck-row">
            <span>
              <strong>{deck.name}</strong>
              <small>{userDeckSummary(deck)}</small>
            </span>
            <button type="button" disabled={busy || uploadBusy} onclick={() => confirmDeleteUserDeck(deck)}>削除</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="deck-select-grid">
      <label>
        自分のデッキ
        <select bind:value={selectedPlayerDeckId} disabled={busy || playerDeckChoiceCount === 0}>
          <optgroup label="総当たりの正本">
            {#each roundRobinDecks as deck}
              <option value={roundRobinDeckKey(deck.id)}>{deckOptionLabel(deck)}</option>
            {/each}
          </optgroup>
          {#if userDecks.length}
            <optgroup label="マイデッキ">
              {#each userDecks as deck}
                <option value={userDeckChoiceKey(deck.id)} disabled={!deck.validation.valid}>{deck.name}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
        <small>{selectedPlayerDeck}</small>
      </label>
      <label>
        対戦相手のデッキ
        <select bind:value={selectedOpponentDeckId} disabled={busy || opponentDeckChoiceCount === 0}>
          <optgroup label="総当たりの正本">
            {#each roundRobinDecks as deck}
              <option value={roundRobinDeckKey(deck.id)}>{deckOptionLabel(deck)}</option>
            {/each}
          </optgroup>
        </select>
        <small>{selectedOpponentDeck}</small>
      </label>
    </div>

    {#if playerDeckChoiceCount === 0 || opponentDeckChoiceCount === 0}
      <p class="empty">自分のデッキと、対戦相手に使う総当たりの正本デッキを読み込み中です。</p>
    {/if}
    <button class="primary start-action" disabled={busy || uploadBusy || !selectedAgentId || !selectedPlayerDeckId || !selectedOpponentDeckId} onclick={startGame}>
      {busy ? '開始中...' : '対戦開始'}
    </button>

    <div class="deck-import two-column">
      <label>
        自分のデッキ
        <textarea bind:value={deck1Text} readonly class="locked" spellcheck="false"></textarea>
      </label>
      <label>
        <span class="deck-label-row">
          対戦相手のデッキ
          <small>{selectedOpponentDeck}</small>
        </span>
        <textarea
          bind:value={deck2Text}
          readonly
          class="locked"
          spellcheck="false"
        ></textarea>
      </label>
    </div>
    {#if error}
      <pre class="error">{error}</pre>
    {/if}
  {:else if homeMode === 'logs'}
    <div class="log-toolbar">
      <strong>試合ログ</strong>
      <button type="button" disabled={catalogBusy} onclick={refreshCatalog}>
        {catalogBusy ? '更新中...' : '更新'}
      </button>
    </div>

    {#if catalogError || error}
      <pre class="error">{catalogError || error}</pre>
    {/if}

    {#if catalogBusy && gameLogs.length === 0}
      <p class="empty">試合ログを読み込み中...</p>
    {:else if gameLogs.length === 0}
      <p class="empty"><code>public/game-logs</code> に試合ログがありません。</p>
    {:else}
      <div class="log-list">
        {#each gameLogs as log}
          <button type="button" disabled={busy || !log.file} class:note-only={!log.file} onclick={() => log.file && loadGameLog(log)}>
            <span>
              <strong>{log.name}</strong>
              <small>{logPlayerLabel(log)}</small>
              {#if log.description}
                <small>{log.description}</small>
              {/if}
            </span>
            <span>
              {#if log.createdAt}
                <small>{log.createdAt}</small>
              {/if}
              <small>{log.file || 'メモのみ'}</small>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="log-toolbar">
      <strong>マイデッキ</strong>
      <span class="deck-section-actions">
        <a href="http://127.0.0.1:8766/index.html#deckbuilder" target="_blank" rel="noreferrer">Card Viewerで新規作成</a>
        <button type="button" disabled={catalogBusy || uploadBusy} onclick={refreshCatalog}>
          {catalogBusy || uploadBusy ? '更新中...' : '更新'}
        </button>
      </span>
    </div>

    {#if uploadError}
      <pre class="error">{uploadError}</pre>
    {/if}

    {#if userDecks.length === 0}
      <p class="empty">マイデッキはまだありません。Card Viewerで作成するか、対戦タブからZIPを取り込めます。</p>
    {:else}
      <div class="deck-browser my-deck-browser">
        <div class="round-robin-deck-list" aria-label="マイデッキ一覧">
          {#each userDecks as deck}
            <button
              type="button"
              class:active={deck.id === selectedUserDeck?.id}
              class:invalid={!deck.validation.valid}
              onclick={() => {
                selectedUserDeckId = deck.id;
              }}
            >
              <strong>{deck.name}</strong>
              <small>{userDeckSummary(deck)}</small>
            </button>
          {/each}
        </div>

        {#if selectedUserDeck}
          <section class="round-robin-deck-detail" aria-label="選択中のマイデッキ">
            <header>
              <span>
                <strong>{selectedUserDeck.name}</strong>
                <small>{selectedUserDeck.deck_hash} · revision {selectedUserDeck.revision}</small>
              </span>
              <span class="deck-count">{userDeckCardCount(selectedUserDeck)}枚</span>
            </header>

            <div class="my-deck-actions">
              <button type="button" disabled={!selectedUserDeck.validation.valid} onclick={() => useUserDeck(selectedUserDeck)}>対戦で使う</button>
              <a href={`http://127.0.0.1:8766/index.html#mydeck=${encodeURIComponent(selectedUserDeck.id)}`} target="_blank" rel="noreferrer">Card Viewerで編集</a>
              <button type="button" onclick={() => confirmDeleteUserDeck(selectedUserDeck)}>削除</button>
            </div>

            {#if !selectedUserDeck.validation.valid}
              <div class="deck-validation-error">
                <strong>現在は対戦に使えません。</strong>
                {#each selectedUserDeck.validation.errors as validationError}
                  <span>{validationError.message}</span>
                {/each}
              </div>
            {/if}

            <div class="deck-card-table" role="table" aria-label="マイデッキ内カード">
              <div class="deck-card-row deck-card-head" role="row">
                <span role="columnheader">枚数</span>
                <span role="columnheader">カード</span>
                <span role="columnheader">ID</span>
              </div>
              {#each selectedUserDeck.cards as card}
                <div class="deck-card-row" role="row">
                  <span role="cell">{card.count}</span>
                  <span role="cell">
                    <a href={`http://127.0.0.1:8766/index.html#id=${card.card_id}`} target="_blank" rel="noreferrer">{userDeckCardName(card.card_id)}</a>
                  </span>
                  <span role="cell">{card.card_id}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {/if}

    <div class="deck-section-divider"></div>

    <div class="log-toolbar">
      <span>
        <strong>総当たりデッキ</strong>
        {#if roundRobinDeckCatalog.sourceRunId}
          <small>{roundRobinDeckCatalog.sourceRunId}</small>
        {/if}
      </span>
      <button type="button" disabled={catalogBusy} onclick={refreshCatalog}>
        {catalogBusy ? '更新中...' : '更新'}
      </button>
    </div>

    {#if catalogError || error}
      <pre class="error">{catalogError || error}</pre>
    {/if}

    {#if catalogBusy && roundRobinDecks.length === 0}
      <p class="empty">デッキ一覧を読み込み中...</p>
    {:else if roundRobinDecks.length === 0}
      <p class="empty"><code>public/round-robin-decks</code> にデッキ一覧がありません。</p>
    {:else}
      <div class="deck-browser">
        <div class="round-robin-deck-list" aria-label="総当たりデッキ一覧">
          {#each roundRobinDecks as deck}
            <button
              type="button"
              class:active={deck.id === selectedRoundRobinDeck?.id}
              onclick={() => {
                selectedRoundRobinDeckId = deck.id;
              }}
            >
              <strong>{deck.id}</strong>
              <small>{deck.name}</small>
            </button>
          {/each}
        </div>

        {#if selectedRoundRobinDeck}
          <section class="round-robin-deck-detail" aria-label="選択中の総当たりデッキ">
            <header>
              <span>
                <strong>{selectedRoundRobinDeck.id}</strong>
                <small>{selectedRoundRobinDeck.name}</small>
              </span>
              <span class="deck-count">{totalCards()}枚</span>
            </header>

            <dl>
              {#if selectedRoundRobinDeck.role}
                <div>
                  <dt>役割</dt>
                  <dd>{selectedRoundRobinDeck.role}</dd>
                </div>
              {/if}
              {#if selectedRoundRobinDeck.datasetSource}
                <div>
                  <dt>データセット</dt>
                  <dd>{selectedRoundRobinDeck.datasetSource}</dd>
                </div>
              {/if}
              {#if selectedRoundRobinDeck.source}
                <div>
                  <dt>出典</dt>
                  <dd>{selectedRoundRobinDeck.source}</dd>
                </div>
              {/if}
            </dl>

            <div class="deck-card-table" role="table" aria-label="デッキ内カード">
              <div class="deck-card-row deck-card-head" role="row">
                <span role="columnheader">枚数</span>
                <span role="columnheader">カード</span>
                <span role="columnheader">ID</span>
              </div>
              {#each selectedRoundRobinDeck.cards as card}
                <div class="deck-card-row" role="row">
                  <span role="cell">{card.count}</span>
                  <span role="cell">
                    {#if card.cardViewerUrl}
                      <a href={card.cardViewerUrl} target="_blank" rel="noreferrer">{displayCardName(card)}</a>
                    {:else}
                      {displayCardName(card)}
                    {/if}
                  </span>
                  <span role="cell">{card.cardId}</span>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .import-screen {
    min-height: 100vh;
    display: grid;
    gap: 14px;
    align-content: start;
    padding: 92px 24px 24px;
  }

  .home-tabs {
    justify-self: center;
    display: inline-grid;
    grid-template-columns: repeat(3, minmax(96px, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--surface-inset-border);
    background: var(--surface-inset-bg);
  }

  .home-tabs button {
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
  }

  .home-tabs button.active {
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--surface-toolbar-shadow);
  }

  .log-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
  }

  .upload-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--surface-inset-border);
    border-radius: 8px;
    background: var(--surface-inset-bg);
  }

  .zip-upload {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    color: var(--text-primary);
    font-weight: 800;
  }

  .zip-upload input {
    max-width: min(360px, 52vw);
  }

  .upload-hint {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    text-align: right;
  }

  .uploaded-deck-list {
    display: grid;
    gap: 8px;
  }

  .uploaded-deck-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 8px 10px;
    border: 1px solid var(--surface-inset-border);
    border-radius: 8px;
    background: var(--surface-bg);
  }

  .uploaded-deck-row span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .uploaded-deck-row strong,
  .uploaded-deck-row small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .uploaded-deck-row small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .uploaded-deck-row button {
    flex: 0 0 auto;
    min-height: 34px;
  }

  .deck-select-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .deck-select-grid label {
    display: grid;
    gap: 8px;
    min-width: 0;
    color: var(--text-primary);
    font-weight: 800;
  }

  .deck-select-grid small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    min-height: 16px;
  }

  .deck-import {
    display: grid;
    gap: 16px;
  }

  .start-action {
    justify-self: start;
    min-width: 180px;
  }

  .deck-import.two-column {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .deck-import label {
    display: grid;
    gap: 8px;
    color: var(--text-primary);
    font-weight: 800;
  }

  .deck-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .deck-label-row small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  textarea {
    width: 100%;
    min-height: clamp(180px, 30vh, 320px);
    resize: vertical;
    border-radius: 8px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--input-text);
    padding: 12px;
  }

  textarea.locked {
    background: var(--surface-inset-bg);
    color: var(--text-secondary);
    cursor: default;
  }

  select {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid var(--input-border);
    background: var(--input-bg);
    color: var(--input-text);
    padding: 0 12px;
  }

  .log-toolbar strong {
    font-size: 16px;
  }

  .log-toolbar span {
    display: grid;
    gap: 2px;
  }

  .log-toolbar small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .log-list {
    display: grid;
    gap: 8px;
    max-height: min(72vh, 820px);
    overflow: auto;
  }

  .log-list button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(140px, auto);
    gap: 12px;
    align-items: center;
    min-height: 58px;
    border-radius: 8px;
    text-align: left;
    background: var(--button-bg);
  }

  .log-list button.note-only {
    cursor: default;
    opacity: 1;
  }

  .log-list span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .log-list strong,
  .log-list small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-list small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .deck-section-actions,
  .my-deck-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .deck-section-actions a,
  .my-deck-actions a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--button-border);
    border-radius: 7px;
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 800;
    text-decoration: none;
  }

  .deck-section-divider {
    height: 1px;
    margin: 6px 0;
    background: var(--surface-inset-border);
  }

  .my-deck-browser {
    padding: 14px;
    border: 1px solid var(--surface-inset-border);
    border-radius: 10px;
    background: var(--surface-inset-bg);
  }

  .round-robin-deck-list button.invalid {
    border-color: var(--danger-border);
  }

  .deck-validation-error {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--danger-border);
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-strong);
    font-size: 12px;
  }

  .deck-browser {
    display: grid;
    grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
    gap: 16px;
    min-height: 0;
  }

  .round-robin-deck-list {
    display: grid;
    align-content: start;
    gap: 8px;
    max-height: min(72vh, 820px);
    overflow: auto;
  }

  .round-robin-deck-list button {
    display: grid;
    gap: 3px;
    min-height: 58px;
    border-radius: 8px;
    text-align: left;
    background: var(--button-bg);
  }

  .round-robin-deck-list button.active {
    border-color: var(--button-primary-bg);
    box-shadow: inset 3px 0 0 var(--button-primary-bg);
  }

  .round-robin-deck-list strong,
  .round-robin-deck-list small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .round-robin-deck-list small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .round-robin-deck-detail {
    display: grid;
    align-content: start;
    gap: 14px;
    min-width: 0;
  }

  .round-robin-deck-detail header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-inset-border);
  }

  .round-robin-deck-detail header span:first-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .round-robin-deck-detail header strong {
    font-size: 18px;
  }

  .round-robin-deck-detail header small,
  .round-robin-deck-detail dd {
    color: var(--text-secondary);
  }

  .deck-count {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }

  dl div {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--surface-inset-border);
    background: var(--surface-inset-bg);
  }

  dt {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .deck-card-table {
    display: grid;
    max-height: min(62vh, 700px);
    overflow: auto;
    border: 1px solid var(--surface-inset-border);
    border-radius: 8px;
  }

  .deck-card-row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 80px;
    gap: 12px;
    align-items: center;
    min-height: 36px;
    padding: 0 12px;
    border-bottom: 1px solid var(--surface-inset-border);
    background: var(--surface-bg);
    font-size: 13px;
  }

  .deck-card-row:last-child {
    border-bottom: 0;
  }

  .deck-card-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-inset-bg);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .deck-card-row a {
    color: var(--text-primary);
    font-weight: 800;
    text-decoration: none;
  }

  .deck-card-row a:hover {
    text-decoration: underline;
  }

  .empty {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .error {
    margin: 0;
    padding: 12px;
    border-radius: 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    color: var(--danger-strong);
    white-space: pre-wrap;
  }

  @media (max-width: 980px) {
    .deck-import.two-column,
    .deck-select-grid,
    .log-list button,
    .deck-browser,
    dl {
      grid-template-columns: 1fr;
    }

    .upload-panel,
    .log-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .upload-hint {
      text-align: left;
    }
  }

  @media (max-width: 640px) {
    .import-screen {
      gap: 12px;
      padding: 72px 12px 18px;
    }

    .home-tabs {
      width: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .home-tabs button {
      min-width: 0;
      padding-inline: 6px;
    }

    .upload-panel {
      padding: 10px;
    }

    .zip-upload {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
      gap: 6px;
    }

    .zip-upload input {
      max-width: 100%;
    }

    .start-action {
      width: 100%;
    }

    .deck-select-grid {
      gap: 12px;
    }

    .deck-select-grid small,
    .deck-label-row small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    textarea {
      min-height: 170px;
      font-size: 13px;
    }

    .log-list {
      max-height: none;
    }

    .log-list button {
      gap: 6px;
      padding: 9px 10px;
    }
  }
</style>
