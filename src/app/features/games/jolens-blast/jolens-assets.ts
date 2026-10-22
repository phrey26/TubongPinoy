const ROOT = 'assets/jolens-blast-assets/';
export const JOLENS_ASSETS = {
  background: `${ROOT}background/dirt_bg_clean.png`,
  preview: `${ROOT}background/dirt_bg.png`,
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

export const JOLENS_ASSET_PATHS = [JOLENS_ASSETS.background, JOLENS_ASSETS.preview,
  JOLENS_ASSETS.shadow, ...JOLENS_ASSETS.marbles, ...JOLENS_ASSETS.shooters.map(s => s.path),
  JOLENS_ASSETS.arrow, JOLENS_ASSETS.dot, ...JOLENS_ASSETS.dust, ...JOLENS_ASSETS.sparks];
