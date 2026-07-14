export function playerNameJa(name: string | undefined, fallbackIndex?: number): string {
  const trimmed = (name ?? '').trim();
  const playerMatch = trimmed.match(/^Player\s+(\d+)$/i);
  if (playerMatch) {
    return `プレイヤー${playerMatch[1]}`;
  }
  if (/^AI opponent$/i.test(trimmed)) {
    return 'AI相手';
  }
  if (trimmed) {
    return trimmed;
  }
  return fallbackIndex === undefined ? 'プレイヤー' : `プレイヤー${fallbackIndex + 1}`;
}

export function versusJa(names: string[]): string {
  return names.map((name, index) => playerNameJa(name, index)).join(' 対 ');
}

export function zoneNameJa(zone: string): string {
  return ({
    active: 'バトル場',
    bench: 'ベンチ',
    deck: '山札',
    discard: 'トラッシュ',
    energy: 'エネルギー',
    hand: '手札',
    lostZone: 'ロストゾーン',
    playZone: '場',
    player: 'プレイヤー',
    prize: 'サイド',
    selection: '選択',
    stadium: 'スタジアム',
    tool: 'どうぐ',
    zone: 'ゾーン',
    'evolution stack': '進化元',
  } as Record<string, string>)[zone] ?? zone;
}

export function slotNameJa(slot: 'active' | 'bench', index = 0): string {
  return slot === 'active' ? 'バトル場' : `ベンチ${index + 1}`;
}

export function cardCountJa(count: number): string {
  return `${count}枚`;
}

export function energyNameJa(value: string): string {
  return value
    .replaceAll('{G}', '草')
    .replaceAll('{R}', '炎')
    .replaceAll('{W}', '水')
    .replaceAll('{L}', '雷')
    .replaceAll('{P}', '超')
    .replaceAll('{F}', '闘')
    .replaceAll('{D}', '悪')
    .replaceAll('{M}', '鋼')
    .replaceAll('{C}', '無')
    .replace(/\bGrass\b/g, '草')
    .replace(/\bFire\b/g, '炎')
    .replace(/\bWater\b/g, '水')
    .replace(/\bLightning\b/g, '雷')
    .replace(/\bPsychic\b/g, '超')
    .replace(/\bFighting\b/g, '闘')
    .replace(/\bDarkness\b/g, '悪')
    .replace(/\bMetal\b/g, '鋼')
    .replace(/\bColorless\b/g, '無')
    .replace(/\bEnergy\b/g, 'エネルギー');
}

export function specialConditionJa(condition: string): string {
  return ({
    Poisoned: 'どく',
    Burned: 'やけど',
    Asleep: 'ねむり',
    Paralyzed: 'マヒ',
    Confused: 'こんらん',
  } as Record<string, string>)[condition] ?? condition;
}
