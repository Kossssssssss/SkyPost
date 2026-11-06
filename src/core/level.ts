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

export interface LevelData
{
  id: string;
  name: string;
  theme: Theme;
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
  hint?: number[];
  best?: { gas: number; stampGas?: number; time?: number };
}

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
