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

export const TUMBANG_COLLECTION_SKINS = [
  { id: 'skin_4', name: 'Guyabanos', rarity: 'Common', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_guyabanos.webp' },
  { id: 'skin_3', name: 'Sike!', rarity: 'Rare', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_sike.webp' },
  { id: 'skin_2', name: 'Gatorz', rarity: 'Epic', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_gatorz.webp' },
  { id: 'skin_1', name: 'Aldugo', rarity: 'Legendary', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_aldugo.webp' },
] as const;

export function gameSkinUrl(game: GameId, id?: string): string {
  const collectible = game === 'tumbang-preso' && TUMBANG_COLLECTION_SKINS.find(skin => skin.id === id);
  if (collectible) return collectible.imageUrl;
  const valid = game === 'tumbang-preso'
    ? SLIPPER_COLORS.map(color => `slipper_${color}`)
    : SHOOTER_STYLES.map(style => `shooter_${style}`);
  const safeId = id && valid.includes(id) ? id : DEFAULT_GAME_SKINS[game];
  const directory = game === 'tumbang-preso' ? 'slippers' : 'shooters';
  return `assets/${game}-assets/${directory}/${safeId}.png`;
}

export interface GameSkin { id: string; name: string; game: GameId; imageUrl: string; rarity?: string; }
export interface Collectible { id: string; name: string; imageUrl: string; }
