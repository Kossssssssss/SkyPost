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
  { id: 'env-bloom', slot: 'envelope', name: 'Bloom', price: 0, world: 1, style: 'bloom', colors: [ 0xffd6e8, 0xff6fa8, 0xffe14a ] },
  { id: 'env-light', slot: 'envelope', name: 'Lighthouse', price: 0, world: 2, style: 'rings', colors: [ 0xffffff, 0xd8332a ] },
  { id: 'env-aurora', slot: 'envelope', name: 'Aurora', price: 0, world: 3, style: 'aurora', colors: [ 0x1a2a6a, 0x3affc8, 0xb06aff ] },

  { id: 'bas-wicker', slot: 'basket', name: 'Wicker', price: 0, colors: [ 0xa8723a, 0x6e4422 ] },
  { id: 'bas-blue', slot: 'basket', name: 'Painted', price: 4, colors: [ 0x3a6ee8, 0x22408e ] },
  { id: 'bas-gold', slot: 'basket', name: 'Golden', price: 10, colors: [ 0xf2c23a, 0xa87a12 ] },

  { id: 'trl-none', slot: 'trail', name: 'None', price: 0, colors: [] },
  { id: 'trl-puff', slot: 'trail', name: 'Puffs', price: 3, colors: [ 0xffffff ] },
  { id: 'trl-spark', slot: 'trail', name: 'Sparkles', price: 6, colors: [ 0xfff08a, 0xffffff ] },
  { id: 'trl-heart', slot: 'trail', name: 'Hearts', price: 8, colors: [ 0xff6f9a, 0xffb0c8 ] },
  { id: 'trl-rainbow', slot: 'trail', name: 'Rainbow', price: 11, colors: [ 0xff4a4a, 0xffa53a, 0xffe14a, 0x4ad86a, 0x4aa8ff, 0xa66aff ] },

  { id: 'plt-fox', slot: 'pilot', name: 'Fox', price: 0, colors: [] },
  { id: 'plt-cat', slot: 'pilot', name: 'Cat', price: 5, colors: [] },
  { id: 'plt-owl', slot: 'pilot', name: 'Owl', price: 8, colors: [] },
  { id: 'plt-frog', slot: 'pilot', name: 'Frog', price: 12, colors: [] }
];

export function skin( id: string ): Skin
{
  return SKINS.find( ( s ) => s.id === id ) ?? SKINS[ 0 ];
}

export function skinsOf( slot: SkinSlot ): Skin[]
{
  return SKINS.filter( ( s ) => s.slot === slot );
}
