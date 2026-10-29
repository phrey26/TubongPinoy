import type { GameId } from './game';

export const PROFILE_AVATARS = [
  { id: 'sunny', name: 'Sunny', description: 'Tousled hair and a sunny yellow shirt' },
  { id: 'lila', name: 'Lila', description: 'A ponytail and a purple shirt' },
  { id: 'miko', name: 'Miko', description: 'Curly hair, teal glasses and a turquoise shirt' },
  { id: 'maya', name: 'Maya', description: 'A bob haircut, yellow clip and a coral shirt' },
] as const;

export function avatarUrl(id?: string): string {
  const safeId = PROFILE_AVATARS.find(avatar => avatar.id === id)?.id ?? 'sunny';
  return `assets/avatars/${safeId}.webp`;
}

export const SLIPPER_COLORS = ['pink', 'blue', 'green', 'orange', 'red', 'yellow'] as const;
export const SHOOTER_STYLES = ['chrome', 'gold', 'blue_swirl'] as const;
export const DEFAULT_GAME_SKINS: Record<GameId, string> = {
  'tumbang-preso': 'slipper_pink', 'jolens-blast': 'shooter_chrome',
};

export function gameSkinUrl(game: GameId, id?: string): string {
  const valid = game === 'tumbang-preso'
    ? SLIPPER_COLORS.map(color => `slipper_${color}`)
    : SHOOTER_STYLES.map(style => `shooter_${style}`);
  const safeId = id && valid.includes(id) ? id : DEFAULT_GAME_SKINS[game];
  const directory = game === 'tumbang-preso' ? 'slippers' : 'shooters';
  return `assets/${game}-assets/${directory}/${safeId}.png`;
}

export interface GameSkin { id: string; name: string; game: GameId; imageUrl: string; }
export interface Collectible { id: string; name: string; imageUrl: string; }
