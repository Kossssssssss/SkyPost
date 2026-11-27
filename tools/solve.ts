// Запуск: node tools/solve.ts world1 [1-3] [--write]
// --regas перераховує лише пороги газу із записаних best, без повторного пошуку
// Доставка дня: node tools/solve.ts daily [daily-2] [--write] [--winds 2] — розв'язує рівень і кожен його варіант вітру;
// --winds N заново створює N варіантів (сила кожного шару ×0.85…1.15), непрохідні замінює іншими;
// --beam N обмежує пошук N станами на крок (рівні дня — 20000 за замовчуванням, 0 — повний пошук)
import { readFileSync, writeFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { withWind, type LevelData, type WorldData, type WindVariant } from '../src/core/level.ts';
import { solve, applySolve, describe, gasThreshold } from '../src/core/solver.ts';
import { formatWorld } from '../src/core/levelJson.ts';

const args = process.argv.slice( 2 );
const files = args.filter( ( a ) => a.startsWith( 'world' ) || a === 'daily' );
const only = args.find( ( a ) => /^(\d+|daily)-\d+$/.test( a ) );
const regas = args.includes( '--regas' );
const write = args.includes( '--write' ) || regas;
const windsArg = args.includes( '--winds' ) ? Number( args[ args.indexOf( '--winds' ) + 1 ] ) : -1;
// Обмежений пошук для довгих рівнів: --beam N (для рівнів дня за замовчуванням 20000)
const beamArg = args.includes( '--beam' ) ? Number( args[ args.indexOf( '--beam' ) + 1 ] ) : -1;
const beamOf = ( lvl: LevelData ) => beamArg >= 0 ? beamArg : lvl.id.startsWith( 'daily-' ) ? 20000 : 0;

// Множники сили шарів для варіанта вітру: псевдовипадкові, але ті самі для того самого рівня й спроби
function windK( lvl: LevelData, n: number, attempt: number ): number[]
{
  let h = 2166136261;
  for ( const ch of `${ lvl.id }:${ n }:${ attempt }` )
  {
    h = Math.imul( h ^ ch.charCodeAt( 0 ), 16777619 );
  }
  return lvl.layers.map( () =>
  {
    h = Math.imul( h ^ ( h >>> 15 ), 2246822507 ) ^ Math.imul( h ^ ( h >>> 13 ), 3266489909 );
    return Math.round( ( 0.85 + ( ( h >>> 0 ) % 1000 ) / 1000 * 0.3 ) * 100 ) / 100;
  } );
}

// Розв'язує варіант вітру i рівня й записує в нього результат; false — непрохідний
function solveWind( lvl: LevelData, i: number, v: WindVariant ): boolean
{
  const w = structuredClone( withWind( lvl, i ) );
  const r = solve( w, beamOf( lvl ) );
  console.log( `  вітер ${ i } ×[${ v.k.join( ', ' ) }]: ` + describe( w, r ) );
  if ( !write || !applySolve( w, r ) )
  {
    return !!r.plain;
  }
  v.gasStar = w.gasStar;
  v.best = w.best;
  v.hint = w.hint;
  return true;
}

// Паралельні запуски пишуть файл по черзі: хто створив теку-замок, той і пише
function withLock( path: string, fn: () => void ): void
{
  const lock = path + '.lock';
  for ( ;; )
  {
    try
    {
      mkdirSync( lock );
      break;
    }
    catch
    {
      Atomics.wait( new Int32Array( new SharedArrayBuffer( 4 ) ), 0, 0, 100 );
    }
  }
  try
  {
    fn();
  }
  finally
  {
    rmdirSync( lock );
  }
}

for ( const file of files.length ? files : [ 'world1' ] )
{
  const path = resolve( import.meta.dirname, '../src/levels', file + '.json' );
  const world: WorldData = JSON.parse( readFileSync( path, 'utf8' ) );
  for ( const lvl of world.levels )
  {
    if ( only && lvl.id !== only )
    {
      continue;
    }
    if ( regas )
    {
      const was = lvl.gasStar;
      lvl.gasStar = gasThreshold( lvl );
      console.log( `${ lvl.id } ${ lvl.name }: поріг ${ was } → ${ lvl.gasStar } (найкраще ${ lvl.best?.gas }, з маркою ${ lvl.best?.stampGas ?? '—' })` );
      continue;
    }
    const r = solve( lvl, beamOf( lvl ) );
    console.log( describe( lvl, r ) );
    if ( write )
    {
      applySolve( lvl, r );
    }
    if ( windsArg >= 0 )
    {
      lvl.winds = [];
      for ( let n = 0; n < windsArg; n++ )
      {
        for ( let attempt = 0; attempt < 5; attempt++ )
        {
          const v: WindVariant = { k: windK( lvl, n, attempt ), gasStar: lvl.gasStar };
          lvl.winds.push( v );
          if ( solveWind( lvl, lvl.winds.length, v ) )
          {
            break;
          }
          lvl.winds.pop();
        }
      }
    }
    else
    {
      lvl.winds?.forEach( ( v, n ) => solveWind( lvl, n + 1, v ) );
    }
  }
  if ( write )
  {
    // Файл міг змінити паралельний запуск для іншого рівня: беремо свіжий і замінюємо в ньому лише свої рівні
    withLock( path, () =>
    {
      const fresh: WorldData = JSON.parse( readFileSync( path, 'utf8' ) );
      fresh.levels = fresh.levels.map( ( l ) => !only || l.id === only ? world.levels.find( ( w ) => w.id === l.id ) ?? l : l );
      writeFileSync( path, formatWorld( fresh ) );
    } );
    console.log( 'Записано ' + path );
  }
}
