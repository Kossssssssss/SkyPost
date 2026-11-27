// Оцінка складності рівнів: який шанс пройти рівень у гравця, що зазвичай діє правильно, але іноді помиляється.
// Будуємо граф станів кулі з рішеннями «гріти / не гріти» кожні 0.25 с (ті самі клітинки станів, що й у розв'язувача)
// і рахуємо для кожного стану шанс дійти до перемоги: гравець з імовірністю q натискає навмання, інакше обирає найкраще.
// Він бачить свою помилку й далі грає від нового стану, тож модель ближча до живої гри, ніж повтор готового маршруту.
// Час у клітинку не входить, тож рухомі небезпеки враховано приблизно (за першим відвідуванням клітинки).
// Числа годяться для порівняння рівнів між собою, а не як точний відсоток проходження.
// Рівні дня довгі, і повний граф їхніх станів не вміщається в пам'ять. У грі ж після кожної доставки чекпойнт,
// тож такий рівень рахуємо по відрізках «скринька → наступна скринька», кожен від стану кулі на попередній скриньці.
// Запуск: node tools/difficulty.ts [world1 world2 ... | daily] [1-3 | daily-2] [--seg]; у рівнів дня — кожен варіант вітру окремо,
// і завжди по відрізках; --seg рахує по відрізках і звичайні рівні (щоб порівняти з рівнями дня)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDaily, windCount, withWind, type LevelData, type WorldData } from '../src/core/level.ts';
import { SUB } from '../src/core/solver.ts';
import { createState, step, cloneState, type SimState } from '../src/core/sim.ts';

const args = process.argv.slice( 2 );
const files = args.filter( ( a ) => a.startsWith( 'world' ) || a === 'daily' );
const only = args.find( ( a ) => /^(\d+|daily)-\d+$/.test( a ) );
// Частка рішень навмання: уважний гравець і новачок. Інші значення: --q 0.3,0.5.
// Після спрощення фізики при 10–40% майже всі рівні дають 100%, тож рахуємо 50% і 60%
const qArg = args[ args.indexOf( '--q' ) + 1 ];
const QS = args.includes( '--q' ) && qArg ? qArg.split( ',' ).map( Number ) : [ 0.5, 0.6 ];
// Стани, у які куля потрапляє пізніше, вважаємо програшем: гравець здався
const MAX_T = 150;
// Відрізок обмежено по x: далі цього від старту й від своєї скриньки куля вважається загубленою (граф лишається малим)
const SEG_PAD = 600;
const SEG = args.includes( '--seg' );

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
  // Час від старту відрізка до першої доставки
  firstWinT: number;
  // Куля на скриньці після першої доставки (з маркою і без) — старт наступного відрізка
  first?: SimState;
  firstStamp?: SimState;
}

// Що рахуємо: від стану from до доставки листа goal, не виходячи за x0..x1 (весь рівень — від старту до останнього листа)
interface Span
{
  from: SimState;
  goal: number;
  x0: number;
  x1: number;
}

function build( lvl: LevelData, sp: Span ): Graph
{
  const ids = new Map<string, number>();
  const states: SimState[] = [];
  let kids = new Int32Array( 1 << 16 );
  let size = 3;
  let firstWinT = -1;
  let first: SimState | undefined;
  let firstStamp: SimState | undefined;
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
  const queue: number[] = [ add( cloneState( sp.from ) ) ];
  for ( let qi = 0; qi < queue.length; qi++ )
  {
    const id = queue[ qi ];
    const base = states[ id ];
    for ( let a = 0; a < 2; a++ )
    {
      const s = cloneState( base );
      const burn = a === 1 && !( lvl.fuel !== undefined && s.gas >= lvl.fuel );
      for ( let i = 0; i < SUB && !s.dead && !s.won && s.target <= sp.goal; i++ )
      {
        step( lvl, s, burn );
      }
      let to: number;
      if ( s.dead || s.t - sp.from.t > MAX_T || s.x < sp.x0 || s.x > sp.x1 )
      {
        to = DEAD;
      }
      else if ( s.target > sp.goal )
      {
        to = s.stamp ? WIN_STAMP : WIN;
        if ( firstWinT < 0 )
        {
          firstWinT = s.t - sp.from.t;
        }
        // Як у грі: чекпойнт — куля на скриньці без швидкості
        const cp = { ...s, vx: 0, vy: 0, settle: 0 };
        if ( s.stamp && !firstStamp )
        {
          firstStamp = cp;
        }
        if ( !first )
        {
          first = cp;
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
  return { kids, size, firstWinT, first, firstStamp };
}

// Ітерації значень: імовірність колись перемогти з кожного вузла.
// Граф майже весь — одна велика петля (куля може повернутися майже в будь-який стан), і при 60% помилок
// 2000 проходів не вистачає, щоб зійтися: число при 60% — те, що встигло набратися за 2000 проходів, а не межа.
// Саме за ним вибудувано криву складності світів, тож рівні дня рахуємо так само, щоб числа були порівнянні
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

// Рядок таблиці: шанси доставки й доставки з маркою (stamp = undefined — марки на відрізку немає)
function row( id: string, name: string, g: Graph, letters: string, hazards: number, plain: number[], stamp: number[] | undefined ): string
{
  return [
    id.padEnd( 10 ),
    name.padEnd( 20 ),
    ( g.firstWinT.toFixed( 0 ) + 'с' ).padStart( 4 ),
    letters.padStart( 5 ),
    String( hazards ).padStart( 6 ),
    '   ' + plain.map( pct ).join( ' ' ),
    '    ' + ( stamp ? stamp.map( pct ).join( ' ' ) : '    —      ' ),
    String( g.size ).padStart( 10 )
  ].join( ' ' );
}

// Рівень по відрізках: кожен від кулі на попередній скриньці (з маркою, якщо її вже можна мати); наприкінці — найважчий
function bySegments( lvl: LevelData & { base: string } ): void
{
  let from = createState( lvl );
  let worst = { k: 0, p: [ 1, 1 ] };
  for ( let k = 0; k < lvl.targets.length; k++ )
  {
    const tx = lvl.targets[ k ].x;
    const lo = Math.min( from.x, tx );
    const hi = Math.max( from.x, tx );
    const g = build( lvl, { from, goal: k, x0: lo - SEG_PAD, x1: hi + SEG_PAD } );
    const tag = `${ k + 1 }/${ lvl.targets.length }`;
    if ( g.firstWinT < 0 )
    {
      console.log( `${ lvl.id.padEnd( 10 ) } ${ ( lvl.name + ' ' + tag ).padEnd( 20 ) } НЕ ПРОХОДИТЬСЯ` );
      return;
    }
    const stamp = !from.stamp && g.firstStamp ? QS.map( ( q ) => chance( g, q, true ) ) : undefined;
    const hazards = lvl.hazards.filter( ( h ) => h.x >= lo && h.x <= hi ).length;
    const p = QS.map( ( q ) => chance( g, q, false ) );
    console.log( row( k ? '' : lvl.id, k ? '' : lvl.name, g, tag, hazards, p, stamp ) );
    if ( p[ 0 ] < worst.p[ 0 ] )
    {
      worst = { k, p };
    }
    from = g.firstStamp ?? g.first!;
  }
  console.log( `${ ''.padEnd( 10 ) } ${ ( '  найважчий ' + ( worst.k + 1 ) ).padEnd( 20 ) }                    ${ worst.p.map( pct ).join( ' ' ) }` );
}

console.log( `гравець помиляється в ${ QS.map( ( q ) => q * 100 + '%' ).join( ' / ' ) } рішень (рішення кожні 0.25 с)` );
console.log( 'рівень     назва                 час  листи небезп   доставка        з маркою      станів' );
for ( const file of files.length ? files : [ 'world1', 'world2', 'world3' ] )
{
  const world: WorldData = JSON.parse( readFileSync( resolve( import.meta.dirname, '../src/levels', file + '.json' ), 'utf8' ) );
  const list = world.levels.flatMap( ( l ) => Array.from( { length: windCount( l ) }, ( _, i ) => ( { ...withWind( l, i ), id: i ? `${ l.id }/${ i }` : l.id, base: l.id } ) ) );
  for ( const lvl of list )
  {
    if ( only && lvl.base !== only )
    {
      continue;
    }
    if ( SEG || isDaily( lvl.base ) )
    {
      bySegments( lvl );
      continue;
    }
    const g = build( lvl, { from: createState( lvl ), goal: lvl.targets.length - 1, x0: -Infinity, x1: Infinity } );
    if ( g.firstWinT < 0 )
    {
      console.log( `${ lvl.id.padEnd( 10 ) } ${ lvl.name.padEnd( 20 ) } НЕ ПРОХОДИТЬСЯ` );
      continue;
    }
    console.log( row( lvl.id, lvl.name, g, String( lvl.targets.length ), lvl.hazards.length, QS.map( ( q ) => chance( g, q, false ) ), QS.map( ( q ) => chance( g, q, true ) ) ) );
  }
}
