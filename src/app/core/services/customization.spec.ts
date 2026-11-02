import { describe, expect, it } from 'vitest';
import { equippedSkinEffect, gameSkinUrl, JOLENS_COLLECTION_SKINS, TUMBANG_COLLECTION_SKINS } from './customization';

describe('Permanent skin archive', () => {
  for (const [game, skins, effects] of [
    ['tumbang-preso', TUMBANG_COLLECTION_SKINS, ['none', 'none', 'gatorz', 'aldugo']],
    ['jolens-blast', JOLENS_COLLECTION_SKINS, ['none', 'none', 'jupiter', 'steel']],
  ] as const) {
    it(`retains all ${game} artwork and effects without a shop catalog`, () => {
      skins.forEach((skin, index) => {
        const owner = { ownedSkins: [skin.id], equippedSkins: { [game]: skin.id } };
        expect(gameSkinUrl(game, skin.id)).toBe(skin.imageUrl);
        expect(equippedSkinEffect(owner, game)).toBe(effects[index]);
        expect(equippedSkinEffect({ ...owner, ownedSkins: [] }, game)).toBe('none');
        expect(equippedSkinEffect({ ...owner, equippedSkins: {} }, game)).toBe('none');
        expect(equippedSkinEffect(owner, game === 'jolens-blast' ? 'tumbang-preso' : 'jolens-blast')).toBe('none');
      });
    });
  }
});
