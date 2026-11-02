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

// Permanent free IDs: keep these even when names, artwork or shop collections change.
export const STARTER_SKINS = [
  { id: 'slipper_pink', name: 'Pink Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_pink.png' },
  { id: 'slipper_blue', name: 'Blue Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_blue.png' },
  { id: 'slipper_green', name: 'Green Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_green.png' },
  { id: 'slipper_orange', name: 'Orange Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_orange.png' },
  { id: 'slipper_red', name: 'Red Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_red.png' },
  { id: 'slipper_yellow', name: 'Yellow Slipper', game: 'tumbang-preso', imageUrl: 'assets/tumbang-preso-assets/slippers/slipper_yellow.png' },
  { id: 'shooter_chrome', name: 'Classic Chrome', game: 'jolens-blast', imageUrl: 'assets/jolens-blast-assets/shooters/shooter_chrome.png' },
  { id: 'shooter_gold', name: 'Golden Jolens', game: 'jolens-blast', imageUrl: 'assets/jolens-blast-assets/shooters/shooter_gold.png' },
  { id: 'shooter_blue_swirl', name: 'Blue Swirl', game: 'jolens-blast', imageUrl: 'assets/jolens-blast-assets/shooters/shooter_blue_swirl.png' },
] as const;

// Permanent archive: append new IDs; never remove or reuse IDs during shop rotation.
export const TUMBANG_COLLECTION_SKINS = [
  { id: 'skin_4', name: 'Guyabanos', rarity: 'Common', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_guyabanos.webp' },
  { id: 'skin_3', name: 'Sike!', rarity: 'Rare', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_sike.webp' },
  { id: 'skin_2', name: 'Gatorz', rarity: 'Epic', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_gatorz.webp' },
  { id: 'skin_1', name: 'Aldugo', rarity: 'Legendary', imageUrl: 'assets/tumbang-preso-skins-assets/slipper_aldugo.webp' },
] as const;

export const JOLENS_COLLECTION_SKINS = [
  { id: 'shooter_8ball', name: '8ball', rarity: 'Common', imageUrl: 'assets/jolens-blast-skin-assets/marble_skin_8ball.webp' },
  { id: 'shooter_golf', name: 'Golf', rarity: 'Rare', imageUrl: 'assets/jolens-blast-skin-assets/marble_skin_golf.webp' },
  { id: 'shooter_jupiter', name: 'Jupiter', rarity: 'Epic', imageUrl: 'assets/jolens-blast-skin-assets/marble_skin_jupiter.webp' },
  { id: 'shooter_steel_ball', name: 'Steel Ball', rarity: 'Legendary', imageUrl: 'assets/jolens-blast-skin-assets/marble_skin_steel_ball.webp' },
] as const;

export function gameSkinUrl(game: GameId, id?: string): string {
  const collectible = (game === 'tumbang-preso' ? TUMBANG_COLLECTION_SKINS : JOLENS_COLLECTION_SKINS).find(skin => skin.id === id);
  if (collectible) return collectible.imageUrl;
  const starter = STARTER_SKINS.find(skin => skin.game === game && skin.id === id)
    ?? STARTER_SKINS.find(skin => skin.id === DEFAULT_GAME_SKINS[game])!;
  return starter.imageUrl;
}

export interface GameSkin { id: string; name: string; game: GameId; imageUrl: string; rarity?: string; }
export interface Collectible { id: string; name: string; imageUrl: string; }

/** Permanent effect identity is independent of shop listings, names and rarity. */
export const SKIN_EFFECTS = {
  slipper_pink: 'none', slipper_blue: 'none', slipper_green: 'none',
  slipper_orange: 'none', slipper_red: 'none', slipper_yellow: 'none',
  shooter_chrome: 'none', shooter_gold: 'none', shooter_blue_swirl: 'none',
  skin_4: 'none', skin_3: 'none', skin_2: 'gatorz', skin_1: 'aldugo',
  shooter_8ball: 'none', shooter_golf: 'none', shooter_jupiter: 'jupiter', shooter_steel_ball: 'steel',
} as const;

export function equippedSkinEffect(user: { ownedSkins?: string[]; equippedSkins?: Partial<Record<GameId, string>> } | null | undefined,
  game: GameId): typeof SKIN_EFFECTS[keyof typeof SKIN_EFFECTS] {
  const id = user?.equippedSkins?.[game];
  const archive = game === 'tumbang-preso' ? TUMBANG_COLLECTION_SKINS : JOLENS_COLLECTION_SKINS;
  if (!id || !user?.ownedSkins?.includes(id) || !archive.some(skin => skin.id === id)) return 'none';
  return SKIN_EFFECTS[id as keyof typeof SKIN_EFFECTS] ?? 'none';
}
