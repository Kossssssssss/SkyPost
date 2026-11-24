// Оцінка складності рівнів: який шанс пройти рівень у гравця, що зазвичай діє правильно, але іноді помиляється.
// Будуємо граф станів кулі з рішеннями «гріти / не гріти» кожні 0.25 с (ті самі клітинки станів, що й у розв'язувача)
// і рахуємо для кожного стану шанс дійти до перемоги: гравець з імовірністю q натискає навмання, інакше обирає найкраще.
// Він бачить свою помилку й далі грає від нового стану, тож модель ближча до живої гри, ніж повтор готового маршруту.
// Час у клітинку не входить, тож рухомі небезпеки враховано приблизно (за першим відвідуванням клітинки).
// Числа годяться для порівняння рівнів між собою, а не як точний відсоток проходження.
// Запуск: node tools/difficulty.ts [world1 world2 ...] [1-3]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LevelData, WorldData } from '../src/core/level.ts';
import { SUB } from '../src/core/solver.ts';
import { createState, step, cloneState, type SimState } from '../src/core/sim.ts';

const args = process.argv.slice( 2 );
const files = args.filter( ( a ) => a.startsWith( 'world' ) );
const only = args.find( ( a ) => /^\d+-\d+$/.test( a ) );
// Частка рішень навмання: уважний гравець і новачок. Інші значення: --q 0.3,0.5.
// Після спрощення фізики (п. 14–15) при 10–40% майже всі рівні дають 100%, тож рахуємо 50% і 60%
const qArg = args[ args.indexOf( '--q' ) + 1 ];
const QS = args.includes( '--q' ) && qArg ? qArg.split( ',' ).map( Number ) : [ 0.5, 0.6 ];
// Стани, у які куля потрапляє пізніше, вважаємо програшем: гравець здався
const MAX_T = 150;

// Кінцеві вузли: програш, перемога без марки, перемога з маркою
const DEAD = 0;
const WIN = 1;
const WIN_STAMP = 2;

function key( s: SimState ): string
{
  return s.target + '|' + ( s.stamp ? 1 : 0 ) + '|' + ( s.grounded ? 1 : 0 ) + '|' +
    Math.round( s.x / 18 ) + '|' + Math.round( s.y / 18 ) + '|' +
    Math.round( s.vy / 18 ) + '|' + Math.round( s.vx / 14 ) + '|' + Math.round( s.heat * 12 );
}

interface Graph
{
  // Для кожного вузла два наступники: не гріти й гріти. Вузли 0..2 — кінцеві
  kids: Int32Array;
  size: number;
  firstWinT: number;
}

function build( lvl: LevelData ): Graph
{
  const ids = new Map<string, number>();
  const states: SimState[] = [];
  let kids = new Int32Array( 1 << 16 );
  let size = 3;
  let firstWinT = -1;
  const add = ( s: SimState ): number =>
  {
    const kk = key( s );
    let id = ids.get( kk );
    if ( id === undefined )
    {
      id = size++;
      ids.set( kk, id );
      states[ id ] = s;
      if ( id * 2 + 2 > kids.length )
      {
        const k2 = new Int32Array( kids.length * 2 );
        k2.set( kids );
        kids = k2;
      }
      kids[ id * 2 ] = kids[ id * 2 + 1 ] = -1;
    }
    return id;
  };
  const queue: number[] = [ add( createState( lvl ) ) ];
  for ( let qi = 0; qi < queue.length; qi++ )
  {
    const id = queue[ qi ];
    const base = states[ id ];
    for ( let a = 0; a < 2; a++ )
    {
      const s = cloneState( base );
      const burn = a === 1 && !( lvl.fuel !== undefined && s.gas >= lvl.fuel );
      for ( let i = 0; i < SUB && !s.dead && !s.won; i++ )
      {
        step( lvl, s, burn );
      }
      let to: number;
      if ( s.dead || s.t > MAX_T )
      {
        to = DEAD;
      }
      else if ( s.won )
      {
        to = s.stamp ? WIN_STAMP : WIN;
        if ( firstWinT < 0 )
        {
          firstWinT = s.t;
        }
      }
      else
      {
        const before = size;
        to = add( s );
        if ( to >= before )
        {
          queue.push( to );
        }
      }
      kids[ id * 2 + a ] = to;
    }
  }
  return { kids, size, firstWinT };
}

// Ітерації значень: імовірність колись перемогти з кожного вузла
function chance( g: Graph, q: number, needStamp: boolean ): number
{
  const p = new Float64Array( g.size );
  p[ WIN ] = needStamp ? 0 : 1;
  p[ WIN_STAMP ] = 1;
  for ( let it = 0; it < 2000; it++ )
  {
    let change = 0;
    for ( let i = g.size - 1; i >= 3; i-- )
    {
      const a = p[ g.kids[ i * 2 ] ];
      const b = p[ g.kids[ i * 2 + 1 ] ];
      const v = ( 1 - q ) * Math.max( a, b ) + q * ( a + b ) / 2;
      change = Math.max( change, Math.abs( v - p[ i ] ) );
      p[ i ] = v;
    }
    if ( change < 1e-5 )
    {
      break;
    }
  }
  return p[ 3 ];
}

const pct = ( x: number ): string => ( Math.round( x * 100 ) + '%' ).padStart( 5 );

console.log( `гравець помиляється в ${ QS.map( ( q ) => q * 100 + '%' ).join( ' / ' ) } рішень (рішення кожні 0.25 с)` );
console.log( 'рівень  назва                 час  листи небезп   доставка        з маркою      станів' );
for ( const file of files.length ? files : [ 'world1', 'world2', 'world3' ] )
{
  const world: WorldData = JSON.parse( readFileSync( resolve( import.meta.dirname, '../src/levels', file + '.json' ), 'utf8' ) );
  for ( const lvl of world.levels )
  {
    if ( only && lvl.id !== only )
    {
      continue;
    }
    const g = build( lvl );
    if ( g.firstWinT < 0 )
    {
      console.log( `${ lvl.id.padEnd( 6 ) } ${ lvl.name.padEnd( 20 ) } НЕ ПРОХОДИТЬСЯ` );
      continue;
    }
    const plain = QS.map( ( q ) => chance( g, q, false ) );
    const stamp = QS.map( ( q ) => chance( g, q, true ) );
    console.log( [
      lvl.id.padEnd( 6 ),
      lvl.name.padEnd( 20 ),
      ( g.firstWinT.toFixed( 0 ) + 'с' ).padStart( 4 ),
      String( lvl.targets.length ).padStart( 5 ),
      String( lvl.hazards.length ).padStart( 6 ),
      '   ' + plain.map( pct ).join( ' ' ),
      '    ' + stamp.map( pct ).join( ' ' ),
      String( g.size ).padStart( 10 )
    ].join( ' ' ) );
  }
}
