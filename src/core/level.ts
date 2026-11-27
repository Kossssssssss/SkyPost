export type Theme = 'meadow' | 'sea' | 'mountain' | 'storm' | 'night';

export interface Mover
{
  dx: number;
  dy: number;
  period: number;
  phase?: number;
}

export interface WindLayer
{
  top: number;
  wind: number;
  gust?: number;
  period?: number;
  phase?: number;
}

export interface Rect
{
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HazardKind = 'bird' | 'gull' | 'spike' | 'storm';

export interface Hazard
{
  kind: HazardKind;
  x: number;
  y: number;
  r: number;
  move?: Mover;
}

export interface Updraft extends Rect
{
  force: number;
}

export interface Target
{
  x: number;
  y: number;
  w: number;
}

// Відрізок рівня в одній темі (Доставка дня): діє від x до початку наступного; перший — з x = 0
export interface Biome
{
  x: number;
  theme: Theme;
  water?: boolean;
}

export interface LevelData
{
  id: string;
  name: string;
  // З біомами — тема й вода першого відрізка (на них дивляться карта й картка рівня)
  theme: Theme;
  biomes?: Biome[];
  width: number;
  height: number;
  start: { x: number; y: number };
  layers: WindLayer[];
  blocks: Rect[];
  hazards: Hazard[];
  updrafts: Updraft[];
  targets: Target[];
  stamp: { x: number; y: number };
  water?: boolean;
  fuel?: number;
  gasStar: number;
  tip?: string;
  // Позначка на карті й на картці рівня: важкий або надважкий
  difficulty?: 'hard' | 'super';
  hint?: number[];
  best?: { gas: number; stampGas?: number; time?: number };
}

// Підказки, що знайомлять з новою механікою (а не просто пояснюють керування чи зірки):
// на карті такий рівень позначено, доки його не пройдено
export const MECHANIC_TIPS = new Set( [ 'layers', 'birds', 'order', 'islands', 'gusts', 'fuel', 'updraft', 'pass' ] );

export interface WorldData
{
  id: number;
  name: string;
  theme: Theme;
  levels: LevelData[];
}

export const GROUND_H = 40;

export function groundY( lvl: LevelData ): number
{
  return lvl.height - GROUND_H;
}

// Номер біома в точці x (без біомів — 0). Без виділення пам'яті: зветься з кроку фізики
export function biomeIndexAt( lvl: LevelData, x: number ): number
{
  const b = lvl.biomes;
  let i = 0;
  if ( b )
  {
    while ( i + 1 < b.length && b[ i + 1 ].x <= x )
    {
      i++;
    }
  }
  return i;
}

export function themeAt( lvl: LevelData, x: number ): Theme
{
  return lvl.biomes ? lvl.biomes[ biomeIndexAt( lvl, x ) ].theme : lvl.theme;
}

export function waterAt( lvl: LevelData, x: number ): boolean
{
  return lvl.biomes ? !!lvl.biomes[ biomeIndexAt( lvl, x ) ].water : !!lvl.water;
}

// Відрізки рівня з межами; без біомів — один відрізок на весь рівень
export function biomeSpans( lvl: LevelData ): { x0: number; x1: number; theme: Theme; water: boolean }[]
{
  const b = lvl.biomes ?? [ { x: 0, theme: lvl.theme, water: lvl.water } ];
  return b.map( ( k, i ) => ( { x0: k.x, x1: i + 1 < b.length ? b[ i + 1 ].x : lvl.width, theme: k.theme, water: !!k.water } ) );
}

// Ширина переходу між біомами (одиниць рівня): небо й пейзаж фону перетікають, поки середина кадру її минає
export const BIOME_BLEND = 700;

// Що показує фон у точці x: тема a, і наскільки вже проступила тема b (0..1, плавний старт і фініш)
export function biomeBlend( lvl: LevelData, x: number ): { a: Theme; b: Theme; mix: number }
{
  const bs = lvl.biomes ?? [ { x: 0, theme: lvl.theme } ];
  for ( let i = 1; i < bs.length; i++ )
  {
    const d = x - ( bs[ i ].x - BIOME_BLEND / 2 );
    if ( d < 0 )
    {
      return { a: bs[ i - 1 ].theme, b: bs[ i - 1 ].theme, mix: 0 };
    }
    if ( d < BIOME_BLEND )
    {
      const k = d / BIOME_BLEND;
      return { a: bs[ i - 1 ].theme, b: bs[ i ].theme, mix: k * k * ( 3 - 2 * k ) };
    }
  }
  const last = bs[ bs.length - 1 ].theme;
  return { a: last, b: last, mix: 0 };
}

export function moverOffset( m: Mover | undefined, t: number ): { x: number; y: number }
{
  if ( !m )
  {
    return { x: 0, y: 0 };
  }
  const a = Math.sin( ( t / m.period + ( m.phase ?? 0 ) ) * Math.PI * 2 );
  return { x: m.dx * a, y: m.dy * a };
}

export function windAt( lvl: LevelData, y: number, t: number ): number
{
  const layer = layerAt( lvl, y );
  if ( !layer )
  {
    return 0;
  }
  if ( layer.gust && layer.period )
  {
    return layer.wind + layer.gust * Math.sin( ( t / layer.period + ( layer.phase ?? 0 ) ) * Math.PI * 2 );
  }
  return layer.wind;
}

export function layerIndexAt( lvl: LevelData, y: number ): number
{
  let idx = 0;
  for ( let i = 0; i < lvl.layers.length; i++ )
  {
    if ( lvl.layers[ i ].top <= y )
    {
      idx = i;
    }
  }
  return idx;
}

export function layerAt( lvl: LevelData, y: number ): WindLayer | undefined
{
  return lvl.layers[ layerIndexAt( lvl, y ) ];
}

export function layerBottom( lvl: LevelData, i: number ): number
{
  return i + 1 < lvl.layers.length ? lvl.layers[ i + 1 ].top : groundY( lvl );
}
