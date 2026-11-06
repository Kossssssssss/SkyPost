import type { Theme } from '../core/level.ts';
import { COLORS } from './widgets.ts';
import { THEMES } from './worldView.ts';

// Арт-пакет: шари живого фону, хмари й палітра інтерфейсу в одному стилі

export interface LayerSpec
{
  // Частка руху камери, яку повторює шар: що далі шар, то повільніше він їде
  scroll: number;
  // Низ і висота шару в частках висоти екрана
  bottom: number;
  height: number;
  alpha: number;
}

interface ThemeArt
{
  // Префікс файлів шарів: '' для лук, 'sea-' і 'mountain-' для інших тем
  prefix: string;
  ground: number;
  groundTop: number;
  body: number;
  bodyDark: number;
  top: number;
  far: LayerSpec;
  mid: LayerSpec;
  near: LayerSpec;
}

export interface PackStyle
{
  id: string;
  sky: number[];
  sun: number;
  streak: number;
  ink: number;
  grain: boolean;
  primary: number;
  primaryDark: number;
  blue: number;
  blueDark: number;
  green: number;
  greenDark: number;
  panel: number;
  panelEdge: number;
  themes: Record<'meadow' | 'sea' | 'mountain', ThemeArt>;
}

const L = ( scroll: number, bottom: number, height: number, alpha = 1 ): LayerSpec => ( { scroll, bottom, height, alpha } );

export const WATERCOLOR: PackStyle = {
  id: 'd-watercolor',
  sky: [ 0x93c6e8, 0xd4eaf3, 0xfbf2e0 ], sun: 0xfff8e0, streak: 0xffffff, ink: 0x3a4e3a, grain: true,
  primary: 0xe8604a, primaryDark: 0xa6402e, blue: 0x4f94c8, blueDark: 0x346a94, green: 0x5aa86a, greenDark: 0x3c7a4a,
  panel: 0xfff8ea, panelEdge: 0xd8c3a0,
  themes: {
    meadow: {
      prefix: '', ground: 0x6b5a40, groundTop: 0x8fb874, body: 0x9a8262, bodyDark: 0x7a6448, top: 0xa4cc86,
      far: L( 0.06, 0.82, 0.3 ), mid: L( 0.16, 0.92, 0.32 ), near: L( 0.34, 1.02, 0.34 )
    },
    sea: {
      prefix: 'sea-', ground: 0x2a8ea8, groundTop: 0x5cc0cc, body: 0xc9a77e, bodyDark: 0xa6845c, top: 0xeedcb0,
      far: L( 0.06, 0.86, 0.26 ), mid: L( 0.16, 0.95, 0.3 ), near: L( 0.34, 1.04, 0.3 )
    },
    mountain: {
      prefix: 'mountain-', ground: 0x5f6672, groundTop: 0x92a37e, body: 0x8e93a6, bodyDark: 0x6c7184, top: 0xf4f6fa,
      far: L( 0.05, 0.8, 0.36 ), mid: L( 0.15, 0.87, 0.34 ), near: L( 0.34, 1.03, 0.38 )
    }
  }
};

export let pack: PackStyle | null = null;

export function themeArt( theme: Theme ): ThemeArt
{
  const th = pack!.themes;
  return theme === 'sea' || theme === 'mountain' ? th[ theme ] : th.meadow;
}

// Акварель — основний стиль; ?pack=0 повертає старий процедурний вигляд для порівняння
export function choosePack(): void
{
  if ( new URLSearchParams( location.search ).get( 'pack' ) === '0' )
  {
    return;
  }
  pack = WATERCOLOR;
  Object.assign( COLORS, {
    ink: pack.ink, primary: pack.primary, primaryDark: pack.primaryDark, blue: pack.blue, blueDark: pack.blueDark,
    green: pack.green, greenDark: pack.greenDark, panel: pack.panel, panelEdge: pack.panelEdge,
    grey: 0x9aa3b4, greyDark: 0x6f7890
  } );
  for ( const [ name, th ] of Object.entries( THEMES ) )
  {
    th.skyTop = pack.sky[ 0 ];
    th.skyBottom = pack.sky[ pack.sky.length - 1 ];
    const art = themeArt( name as Theme );
    Object.assign( th, { ground: art.ground, groundTop: art.groundTop, body: art.body, bodyDark: art.bodyDark, top: art.top } );
  }
}

export function packLayers(): string[]
{
  const out: string[] = [];
  for ( const th of Object.values( pack!.themes ) )
  {
    out.push( th.prefix + 'far', th.prefix + 'mid', th.prefix + 'near' );
  }
  return out;
}

export function cloudKey( i: number ): string
{
  return pack ? 'pk-cloud' + i : 'cloud' + i;
}
