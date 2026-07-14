const knownLabels: Record<string, string> = {
  AlertPrompt: '通知',
  AttachEnergyPrompt: 'エネルギーをつける',
  ChooseAttackPrompt: 'ワザを選ぶ',
  ChooseCardsPrompt: 'カードを選ぶ',
  ChooseEnergyPrompt: 'エネルギーを選ぶ',
  ChoosePokemonPrompt: 'ポケモンを選ぶ',
  ChoosePrizePrompt: 'サイドを選ぶ',
  CoinFlipPrompt: 'コイン判定',
  ConfirmCardsPrompt: 'カード確認',
  ConfirmPrompt: '確認',
  DiscardEnergyPrompt: 'エネルギーをトラッシュ',
  MoveDamagePrompt: 'ダメカンを移動',
  MoveEnergyPrompt: 'エネルギーを移動',
  OrderCardsPrompt: 'カード順を決める',
  PutDamagePrompt: 'ダメカンをのせる',
  RemoveDamagePrompt: 'ダメカンを取り除く',
  SelectOptionPrompt: '選択肢を選ぶ',
  SelectPrompt: '選ぶ',
  ShowCardsPrompt: 'カード',
  ShowMulliganPrompt: 'マリガン',
  ShuffleDeckPrompt: '山札を切る',
  WaitPrompt: '待機中',
  CANNOT_ATTACK_ON_FIRST_TURN: '先攻最初の番はワザを使えません',
  CANNOT_RETREAT: 'にげられません',
  CHOOSE_ATTACK_TO_DISABLE: '使えなくするワザを選ぶ',
  CHOOSE_CARD_TO_DISCARD: 'トラッシュするカードを選ぶ',
  CHOOSE_CARD_TO_HAND: '手札に加えるカードを選ぶ',
  CHOOSE_CARD_TO_PUT_ONTO_BENCH: 'ベンチに出すポケモンを選ぶ',
  CHOOSE_ENERGIES_TO_DISCARD: 'トラッシュするエネルギーを選ぶ',
  CHOOSE_ENERGIES_TO_HAND: '手札に加えるエネルギーを選ぶ',
  CHOOSE_ENERGY_FROM_DECK: '山札からエネルギーを選ぶ',
  CHOOSE_ENERGY_FROM_DISCARD: 'トラッシュからエネルギーを選ぶ',
  CHOOSE_ENERGY_TO_DISCARD: 'トラッシュするエネルギーを選ぶ',
  CHOOSE_ENERGY_TO_PAY_RETREAT_COST: 'にげるためのエネルギーを選ぶ',
  CHOOSE_ENERGY_TYPE: 'エネルギータイプを選ぶ',
  CHOOSE_STARTING_POKEMONS: '最初のポケモンを選ぶ',
  GO_FIRST: '先攻を選びますか？',
  LOG_PLAYER_ATTACHES_CARD: 'カードをつけました',
  LOG_PLAYER_DEALS_DAMAGE: 'ダメージを与えました',
  LOG_PLAYER_DISABLES_ATTACK: 'ワザを使えなくしました',
  LOG_PLAYER_DRAWS_CARD: 'カードを引きました',
  LOG_PLAYER_ENDS_TURN: '番を終えました',
  LOG_PLAYER_CONCEDED: '投了しました',
  LOG_GAME_FINISHED: '試合終了',
  LOG_GAME_FINISHED_DRAW: '引き分けで試合終了',
  LOG_GAME_FINISHED_WINNER: '試合終了',
  LOG_PLAYER_PLAYS_BASIC_POKEMON: 'たねポケモンを出しました',
  LOG_PLAYER_RETREATS: 'にげました',
  LOG_PLAYER_USES_ATTACK: 'ワザを使いました',
  LOG_PLAYER_USES_ABILITY: '特性を使いました',
  LOG_TURN: '新しい番',
  RETREAT_ALREADY_USED: 'この番はすでににげています',
  SETUP_WHO_BEGINS_FLIP: '先攻を決めるコイン判定',
  WANT_TO_DISCARD_ENERGY: 'エネルギーをトラッシュしますか？',
};

export function labelFor(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  if (knownLabels[value]) {
    return knownLabels[value];
  }
  if (/^[A-Z0-9_]+$/.test(value)) {
    return value
      .replace(/^LOG_/, '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }
  return value;
}
