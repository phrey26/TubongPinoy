import { JOLENS_COLLECTION_SKINS } from '../../../core/services/customization';

export const STEEL_BALL_FX_ATLAS = 'assets/jolens-blast-skin-assets/steel-ball-chain-fx-atlas.png';
const ROOT = 'assets/jolens-blast-assets/';
export const JOLENS_ASSETS = {
  background: `${ROOT}background/dirt_bg_clean.png`,
  shadow: `${ROOT}marbles/marble_shadow.png`,
  marbles: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'swirl_red',
    'swirl_blue', 'swirl_green', 'cat_blue', 'galaxy', 'core_pink']
    .map(name => `${ROOT}marbles/marble_${name}.png`),
  shooters: ['chrome', 'gold', 'blue_swirl'].map(name => ({
    name: name.replaceAll('_', ' '), path: `${ROOT}shooters/shooter_${name}.png`,
  })),
  arrow: `${ROOT}ui/aim_arrow.png`,
  dot: `${ROOT}ui/aim_dot.png`,
  dust: [1, 2, 3, 4].map(frame => `${ROOT}effects/dust_${frame}.png`),
  sparks: [1, 2, 3].map(frame => `${ROOT}effects/hit_spark_${frame}.png`),
};

export const JOLENS_ASSET_PATHS = [STEEL_BALL_FX_ATLAS, JOLENS_ASSETS.background,
  JOLENS_ASSETS.shadow, ...JOLENS_ASSETS.marbles, ...JOLENS_ASSETS.shooters.map(s => s.path),
  ...JOLENS_COLLECTION_SKINS.map(skin => skin.imageUrl),
  JOLENS_ASSETS.arrow, JOLENS_ASSETS.dot, ...JOLENS_ASSETS.dust, ...JOLENS_ASSETS.sparks];
