import type Phaser from 'phaser';
import type { SkinSlot } from './save.ts';

export type EnvelopeStyle = 'stripes' | 'gradient' | 'dots' | 'patch' | 'bloom' | 'rings' | 'aurora' | 'checker';

export interface Skin
{
  id: string;
  slot: SkinSlot;
  name: string;
  price: number;
  // Особливий скін відкривається не за зірки, а за ★★★ на всіх рівнях світу
  world?: number;
  style?: EnvelopeStyle;
  colors: number[];
}

export const SKINS: Skin[] = [
  { id: 'env-classic', slot: 'envelope', name: 'Classic', price: 0, style: 'stripes', colors: [ 0xe8443a, 0xfff3e0 ] },
  { id: 'env-sky', slot: 'envelope', name: 'Sky', price: 3, style: 'stripes', colors: [ 0x3a8ee8, 0xffffff ] },
  { id: 'env-sunset', slot: 'envelope', name: 'Sunset', price: 5, style: 'gradient', colors: [ 0xffb03a, 0xe8436e, 0x7a3ad0 ] },
  { id: 'env-polka', slot: 'envelope', name: 'Polka', price: 7, style: 'dots', colors: [ 0x3fb56a, 0xfff6c8 ] },
  { id: 'env-checker', slot: 'envelope', name: 'Racer', price: 9, style: 'checker', colors: [ 0x2b2b3a, 0xf2f2f2 ] },
  { id: 'env-patch', slot: 'envelope', name: 'Patchwork', price: 12, style: 'patch', colors: [ 0xe8443a, 0xf0c03a, 0x3a8ee8, 0x3fb56a, 0xb05ad8 ] },
  { id: 'env-airmail', slot: 'envelope', name: 'Airmail', price: 14, style: 'stripes', colors: [ 0xf3e6cc, 0xb8483a ] },
  { id: 'env-bloom', slot: 'envelope', name: 'Bloom', price: 0, world: 1, style: 'bloom', colors: [ 0xffd6e8, 0xff6fa8, 0xffe14a ] },
  { id: 'env-light', slot: 'envelope', name: 'Lighthouse', price: 0, world: 2, style: 'rings', colors: [ 0xffffff, 0xd8332a ] },
  { id: 'env-aurora', slot: 'envelope', name: 'Aurora', price: 0, world: 3, style: 'aurora', colors: [ 0x1a2a6a, 0x3affc8, 0xb06aff ] },

  { id: 'bas-wicker', slot: 'basket', name: 'Wicker', price: 0, colors: [ 0xa8723a, 0x6e4422 ] },
  { id: 'bas-blue', slot: 'basket', name: 'Painted', price: 4, colors: [ 0x3a6ee8, 0x22408e ] },
  { id: 'bas-crate', slot: 'basket', name: 'Crate', price: 6, colors: [ 0xb8483a, 0x7a2e24 ] },
  { id: 'bas-flower', slot: 'basket', name: 'Flowery', price: 8, colors: [ 0x9a7aa8, 0x5e4468 ] },
  { id: 'bas-gold', slot: 'basket', name: 'Golden', price: 10, colors: [ 0xf2c23a, 0xa87a12 ] },
  { id: 'bas-barrel', slot: 'basket', name: 'Barrel', price: 12, colors: [ 0x6e4428, 0x3a2414 ] },
  { id: 'bas-airmail', slot: 'basket', name: 'Airmail', price: 14, colors: [ 0xf3e6cc, 0xb8483a ] },
  { id: 'bas-picnic', slot: 'basket', name: 'Picnic', price: 15, colors: [ 0xc8a060, 0xb8483a ] },
  { id: 'bas-tin', slot: 'basket', name: 'Tin', price: 16, colors: [ 0x9aa0a6, 0x5e646a ] },
  { id: 'bas-quilt', slot: 'basket', name: 'Quilt', price: 18, colors: [ 0x8aa8c8, 0xe0a040 ] },

  { id: 'trl-none', slot: 'trail', name: 'None', price: 0, colors: [] },
  { id: 'trl-puff', slot: 'trail', name: 'Puffs', price: 3, colors: [ 0xffffff ] },
  { id: 'trl-letter', slot: 'trail', name: 'Letters', price: 4, colors: [ 0xfff3e0 ] },
  { id: 'trl-leaf', slot: 'trail', name: 'Leaves', price: 5, colors: [ 0xe0a040 ] },
  { id: 'trl-spark', slot: 'trail', name: 'Sparkles', price: 6, colors: [ 0xfff08a, 0xffffff ] },
  { id: 'trl-feather', slot: 'trail', name: 'Feathers', price: 7, colors: [ 0xa8bcd8 ] },
  { id: 'trl-heart', slot: 'trail', name: 'Hearts', price: 8, colors: [ 0xff6f9a, 0xffb0c8 ] },
  { id: 'trl-snow', slot: 'trail', name: 'Snowflakes', price: 9, colors: [ 0xd8e4f0 ] },
  { id: 'trl-flower', slot: 'trail', name: 'Flowers', price: 10, colors: [ 0xffb0c8, 0xffe14a ] },
  { id: 'trl-rainbow', slot: 'trail', name: 'Rainbow', price: 11, colors: [ 0xff4a4a, 0xffa53a, 0xffe14a, 0x4ad86a, 0x4aa8ff, 0xa66aff ] },

  { id: 'plt-fox', slot: 'pilot', name: 'Fox', price: 0, colors: [] },
  { id: 'plt-cat', slot: 'pilot', name: 'Cat', price: 5, colors: [] },
  { id: 'plt-owl', slot: 'pilot', name: 'Owl', price: 8, colors: [] },
  { id: 'plt-frog', slot: 'pilot', name: 'Frog', price: 12, colors: [] },
  { id: 'plt-bunny', slot: 'pilot', name: 'Bunny', price: 14, colors: [] },
  { id: 'plt-hedgehog', slot: 'pilot', name: 'Hedgehog', price: 16, colors: [] },
  { id: 'plt-bear', slot: 'pilot', name: 'Bear', price: 18, colors: [] },
  { id: 'plt-raccoon', slot: 'pilot', name: 'Raccoon', price: 20, colors: [] },
  { id: 'plt-mouse', slot: 'pilot', name: 'Mouse', price: 22, colors: [] },
  { id: 'plt-penguin', slot: 'pilot', name: 'Penguin', price: 24, colors: [] }
];

// Мальована частинка шлейфу (64 px) і кодова на випадок, коли мальованих немає
const TRAIL_TEX: Record<string, [ string, string ]> = {
  'trl-puff': [ 'p-puff', 'soft' ], 'trl-spark': [ 'p-star', 'spark' ], 'trl-heart': [ 'p-heart', 'heart' ], 'trl-rainbow': [ 'p-blob', 'dot' ],
  'trl-letter': [ 'p-letter', 'dot' ], 'trl-leaf': [ 'p-leaf', 'dot' ], 'trl-feather': [ 'p-feather', 'dot' ], 'trl-snow': [ 'p-snow', 'spark' ], 'trl-flower': [ 'p-flower', 'heart' ]
};

export const TRAIL_PARTICLES = [ 'p-puff', 'p-star', 'p-heart', 'p-blob', 'p-letter', 'p-leaf', 'p-feather', 'p-snow', 'p-flower' ];

export interface TrailLook
{
  tex: string;
  // Множник масштабу: конфіги шлейфів розраховані на кодові текстури 32 px
  k: number;
  painted: boolean;
  // Мальовані частинки вже кольорові; тонуємо лише кодові й знебарвлену пляму веселки
  tint?: number[];
}

export function trailLook( scene: Phaser.Scene, s: Skin ): TrailLook | undefined
{
  const pair = TRAIL_TEX[ s.id ];
  if ( !pair )
  {
    return undefined;
  }
  const painted = scene.textures.exists( pair[ 0 ] );
  const tex = painted ? pair[ 0 ] : pair[ 1 ];
  const w = ( scene.textures.get( tex ).getSourceImage() as HTMLImageElement ).width;
  return { tex, k: 32 / w, painted, tint: !painted || s.id === 'trl-rainbow' ? s.colors : undefined };
}

export function skin( id: string ): Skin
{
  return SKINS.find( ( s ) => s.id === id ) ?? SKINS[ 0 ];
}

export function skinsOf( slot: SkinSlot ): Skin[]
{
  return SKINS.filter( ( s ) => s.slot === slot );
}
