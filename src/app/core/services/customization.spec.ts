import { describe, expect, it } from 'vitest';
import { STARTER_SKINS, equippedSkinEffect, gameSkinUrl, JOLENS_COLLECTION_SKINS, TUMBANG_COLLECTION_SKINS } from './customization';

describe('Permanent skin archive', () => {
  it('keeps nine unique free starter IDs with artwork and standard effects', () => {
    expect(new Set(STARTER_SKINS.map(skin => skin.id)).size).toBe(9);
    for (const skin of STARTER_SKINS) {
      expect(gameSkinUrl(skin.game, skin.id)).toBe(skin.imageUrl);
      expect(equippedSkinEffect({ equippedSkins: { [skin.game]: skin.id }, ownedSkins: [] }, skin.game)).toBe('none');
      const otherGame = skin.game === 'tumbang-preso' ? 'jolens-blast' : 'tumbang-preso';
      expect(gameSkinUrl(otherGame, skin.id)).not.toBe(skin.imageUrl);
    }
  });
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
