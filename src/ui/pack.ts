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
  // Префікс файлів шарів: '' для лук, 'sea-', 'mountain-', 'storm-', 'night-' для інших тем
  prefix: string;
  // Своє небо (зупинки градієнта згори вниз), тонування хмар і шарів, світило; без них — денне небо пака й сонце
  sky?: number[];
  cloudTint?: number;
  layerTint?: number;
  // 'pk-sun', 'pk-moon' або '' — без світила (гроза)
  sun?: string;
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
  themes: Record<Theme, ThemeArt>;
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
    },
    // Гроза: мокрі пагорби під сірим низьким небом, сонця не видно
    storm: {
      prefix: 'storm-', ground: 0x4a3c2e, groundTop: 0x6f8466, body: 0x6a6e70, bodyDark: 0x4c5052, top: 0x7e9470,
      sky: [ 0x6f7a8e, 0xa3abb6, 0xd6d3c8 ], cloudTint: 0x9aa0ac, sun: '',
      far: L( 0.06, 0.84, 0.28 ), mid: L( 0.16, 0.93, 0.32 ), near: L( 0.34, 1.02, 0.26 )
    },
    // Ніч: містечко під місяцем; видно все, як удень, темніє лише картинка
    night: {
      prefix: 'night-', ground: 0x2e2a36, groundTop: 0x6c7488, body: 0x8a6a64, bodyDark: 0x5e4a4a, top: 0x5a6274,
      sky: [ 0x1e2a4a, 0x34466e, 0x66749a ], cloudTint: 0x7480a4, layerTint: 0xaab4d8, sun: 'pk-moon',
      far: L( 0.06, 0.84, 0.26 ), mid: L( 0.16, 0.93, 0.26 ), near: L( 0.34, 1.03, 0.3 )
    }
  }
};

export let pack: PackStyle | null = null;

export function themeArt( theme: Theme ): ThemeArt
{
  return pack!.themes[ theme ] ?? pack!.themes.meadow;
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
    const art = themeArt( name as Theme );
    const sky = art.sky ?? pack.sky;
    th.skyTop = sky[ 0 ];
    th.skyBottom = sky[ sky.length - 1 ];
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
