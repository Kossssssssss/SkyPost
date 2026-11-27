import { themeAt, type LevelData, type Rect } from './level.ts';

// Маяк (lighthouse.webp, 221x768): ліхтар зверху (215 рядків) і основа знизу (80) не тягнуться, тіло вежі посередині
// тягнеться у висоту; body — ширина тіла в текстурі для підбору масштабу, sink — скільки вежі занурено у воду
export const LIGHTHOUSE_ART = { w: 221, h: 768, top: 215, bottom: 80, body: 116, sink: 30 };

// Силует маяка за альфою текстури: [рядок, лівий край, правий край] у пікселях текстури, між точками — лінійно.
// Шпиль, конус даху, ліхтар, галерея (ширша за все вгорі), вежа, що розширюється донизу, і цоколь
const LIGHTHOUSE_PROFILE: [ number, number, number ][] = [
  [ 3, 118, 123 ], [ 6, 115, 125 ], [ 23, 113, 128 ], [ 66, 71, 166 ], [ 74, 73, 163 ], [ 76, 76, 161 ],
  [ 149, 74, 164 ], [ 151, 67, 169 ], [ 152, 63, 179 ], [ 153, 58, 181 ], [ 155, 55, 182 ], [ 201, 58, 179 ],
  [ 205, 64, 175 ], [ 212, 68, 170 ], [ 217, 71, 168 ], [ 261, 68, 170 ], [ 323, 65, 175 ], [ 430, 60, 179 ],
  [ 513, 55, 184 ], [ 608, 51, 189 ], [ 714, 43, 193 ], [ 726, 38, 198 ], [ 740, 29, 211 ], [ 751, 1, 218 ],
  [ 756, 21, 210 ], [ 764, 80, 80 ]
];

export function isLighthouse( lvl: LevelData, b: Rect ): boolean
{
  return themeAt( lvl, b.x + b.w / 2 ) === 'sea' && b.h > b.w * 2.5;
}

// Як маяк лягає на блок: масштаб — середнє між «тіло в ширину блока» і «весь маяк у висоту блока»,
// по горизонталі центр текстури на центрі блока, верх — на верху блока; texH — висота NineSlice у пікселях текстури
export function lighthouseLayout( b: Rect ): { s: number; cx: number; texH: number }
{
  const a = LIGHTHOUSE_ART;
  const hh = b.h + a.sink;
  const s = Math.sqrt( ( b.w / a.body ) * ( hh / a.h ) );
  return { s, cx: b.x + b.w / 2, texH: Math.max( hh / s, a.top + a.bottom ) };
}

function profileAt( ty: number ): [ number, number ]
{
  const p = LIGHTHOUSE_PROFILE;
  if ( ty <= p[ 0 ][ 0 ] )
  {
    return [ p[ 0 ][ 1 ], p[ 0 ][ 2 ] ];
  }
  for ( let i = 1; i < p.length; i++ )
  {
    if ( ty <= p[ i ][ 0 ] )
    {
      const k = ( ty - p[ i - 1 ][ 0 ] ) / ( p[ i ][ 0 ] - p[ i - 1 ][ 0 ] );
      return [ p[ i - 1 ][ 1 ] + ( p[ i ][ 1 ] - p[ i - 1 ][ 1 ] ) * k, p[ i - 1 ][ 2 ] + ( p[ i ][ 2 ] - p[ i - 1 ][ 2 ] ) * k ];
    }
  }
  const last = p[ p.length - 1 ];
  return [ last[ 1 ], last[ 2 ] ];
}

// Колайдер маяка — стос тонких прямокутників за силуетом у тому самому масштабі й розтягуванні, що й малюнок.
// Смуга закінчується, коли набрала висоту або край зсунувся більше ніж на 1.5 px; ширина — найбільша в смузі
function lighthouseRects( b: Rect ): Rect[]
{
  const a = LIGHTHOUSE_ART;
  const { s, cx, texH } = lighthouseLayout( b );
  const midSrc = a.h - a.top - a.bottom;
  const midDst = texH - a.top - a.bottom;
  // Рядок текстури → y у світі за правилами NineSlice: верх і низ 1:1, середина тягнеться
  const worldY = ( ty: number ): number =>
  {
    const ny = ty <= a.top ? ty : ty >= a.h - a.bottom ? texH - ( a.h - ty ) : a.top + ( ty - a.top ) * midDst / midSrc;
    return b.y + ny * s;
  };
  const worldX = ( tx: number ): number => cx + ( tx - a.w / 2 ) * s;
  const bottom = b.y + b.h;
  const out: Rect[] = [];
  let y0 = -1;
  let l = 0;
  let r = 0;
  const flush = ( y1: number ) =>
  {
    const top = Math.max( y0, b.y );
    const bot = Math.min( y1, bottom );
    if ( bot > top )
    {
      out.push( { x: worldX( l ), y: top, w: ( r - l ) * s, h: bot - top } );
    }
  };
  const first = LIGHTHOUSE_PROFILE[ 0 ][ 0 ];
  const last = LIGHTHOUSE_PROFILE[ LIGHTHOUSE_PROFILE.length - 1 ][ 0 ];
  for ( let ty = first; ty <= last; ty++ )
  {
    const y = worldY( ty );
    if ( y >= bottom )
    {
      break;
    }
    const [ pl, pr ] = profileAt( ty );
    if ( y0 < 0 )
    {
      y0 = y;
      l = pl;
      r = pr;
      continue;
    }
    if ( y - y0 >= 10 || Math.abs( pl - l ) * s > 1.5 || Math.abs( pr - r ) * s > 1.5 )
    {
      flush( y );
      y0 = y;
      l = pl;
      r = pr;
    }
    else
    {
      l = Math.min( l, pl );
      r = Math.max( r, pr );
    }
  }
  if ( y0 >= 0 )
  {
    flush( bottom );
  }
  return out;
}

export interface BlockShape
{
  rects: Rect[];
  // Спільна рамка всіх смуг — для швидкої попередньої перевірки
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Кеш за самим блоком і його розмірами (редактор рухає й тягне блоки на льоту); перевірка без виділення пам'яті
const cache = new WeakMap<Rect, { x: number; y: number; w: number; h: number; shape: BlockShape }>();

// Форма блока за картинкою: маяк — стос смуг за силуетом; звичайний блок — null, його колайдер — він сам
export function blockShape( lvl: LevelData, b: Rect ): BlockShape | null
{
  if ( !isLighthouse( lvl, b ) )
  {
    return null;
  }
  const hit = cache.get( b );
  if ( hit && hit.x === b.x && hit.y === b.y && hit.w === b.w && hit.h === b.h )
  {
    return hit.shape;
  }
  const rects = lighthouseRects( b );
  const shape: BlockShape = { rects, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for ( const r of rects )
  {
    shape.x0 = Math.min( shape.x0, r.x );
    shape.y0 = Math.min( shape.y0, r.y );
    shape.x1 = Math.max( shape.x1, r.x + r.w );
    shape.y1 = Math.max( shape.y1, r.y + r.h );
  }
  cache.set( b, { x: b.x, y: b.y, w: b.w, h: b.h, shape } );
  return shape;
}
