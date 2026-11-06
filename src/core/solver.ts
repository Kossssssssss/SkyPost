// Розв'язувач рівнів: пошук у ширину за часом по рішеннях «гріти / не гріти» кожні 0.25 с.
// Перевіряє проходимість, дає мінімум газу (для порогу зірки) і маршрут з маркою (для підказки).
import type { LevelData } from './level.ts';
import { createState, step, cloneState, DT, type SimState } from './sim.ts';

export const SUB = 15;
const MAX_T = 200;
// Поріг зірки — найкраще проходження із запасом: людина гріє не так ощадно, як пошук
export const GAS_MARGIN = 1.3;

export interface SolveRoute
{
  gas: number;
  time: number;
  actions: number[];
}

export interface SolveResult
{
  plain?: SolveRoute;
  stamp?: SolveRoute;
  nodes: number;
  ms: number;
}

function key( s: SimState ): string
{
  return s.target + '|' + ( s.stamp ? 1 : 0 ) + '|' + ( s.grounded ? 1 : 0 ) + '|' +
    Math.round( s.x / 18 ) + '|' + Math.round( s.y / 18 ) + '|' +
    Math.round( s.vy / 18 ) + '|' + Math.round( s.vx / 14 ) + '|' + Math.round( s.heat * 12 );
}

export function solve( lvl: LevelData ): SolveResult
{
  const t0 = performance.now();
  const parent: number[] = [ -1 ];
  const act: number[] = [ 0 ];
  const visited = new Map<string, number>();
  let frontier: { s: SimState; n: number }[] = [ { s: createState( lvl ), n: 0 } ];
  let plain: SolveRoute | undefined;
  let stamp: SolveRoute | undefined;

  const path = ( n: number ): number[] =>
  {
    const out: number[] = [];
    while ( n > 0 )
    {
      out.push( act[ n ] );
      n = parent[ n ];
    }
    return out.reverse();
  };

  const steps = Math.round( MAX_T / ( SUB * DT ) );
  for ( let k = 0; k < steps && frontier.length > 0; k++ )
  {
    const next: { s: SimState; n: number }[] = [];
    for ( const f of frontier )
    {
      for ( let a = 0; a < 2; a++ )
      {
        if ( a === 1 && lvl.fuel !== undefined && f.s.gas >= lvl.fuel )
        {
          continue;
        }
        const s = cloneState( f.s );
        for ( let i = 0; i < SUB && !s.dead && !s.won; i++ )
        {
          step( lvl, s, a === 1 );
        }
        if ( s.dead )
        {
          continue;
        }
        const n = parent.length;
        parent.push( f.n );
        act.push( a );
        if ( s.won )
        {
          const r = { gas: s.gas, time: s.t, actions: path( n ) };
          if ( !plain || r.gas < plain.gas )
          {
            plain = r;
          }
          if ( s.stamp && ( !stamp || r.gas < stamp.gas ) )
          {
            stamp = r;
          }
          continue;
        }
        const kk = key( s );
        const prev = visited.get( kk );
        if ( prev !== undefined && prev <= s.gas + 1e-6 )
        {
          continue;
        }
        visited.set( kk, s.gas );
        next.push( { s, n } );
      }
    }
    // Гілки, дорожчі за вже знайдені рішення, далі не розвиваємо
    if ( plain && stamp )
    {
      const cap = Math.max( plain.gas, stamp.gas );
      frontier = next.filter( ( f ) => f.s.gas < cap );
    }
    else
    {
      frontier = next;
    }
  }
  return { plain, stamp, nodes: parent.length, ms: Math.round( performance.now() - t0 ) };
}

export function trace( lvl: LevelData, actions: number[] ): number[]
{
  const s = createState( lvl );
  const out = [ Math.round( s.x ), Math.round( s.y ) ];
  for ( const a of actions )
  {
    for ( let i = 0; i < SUB && !s.won; i++ )
    {
      step( lvl, s, a === 1 );
    }
    out.push( Math.round( s.x ), Math.round( s.y ) );
  }
  return out;
}

export function gasThreshold( bestGas: number ): number
{
  return Math.ceil( ( bestGas * GAS_MARGIN + 0.8 ) * 2 ) / 2;
}

// Записує в рівень поріг газу, найкращі показники й маршрут підказки (з маркою, якщо вона досяжна)
export function applySolve( lvl: LevelData, r: SolveResult ): boolean
{
  if ( !r.plain )
  {
    return false;
  }
  lvl.gasStar = gasThreshold( r.plain.gas );
  lvl.best = { gas: +r.plain.gas.toFixed( 2 ), stampGas: r.stamp ? +r.stamp.gas.toFixed( 2 ) : undefined, time: +r.plain.time.toFixed( 1 ) };
  lvl.hint = trace( lvl, ( r.stamp ?? r.plain ).actions );
  return true;
}

export function describe( lvl: LevelData, r: SolveResult ): string
{
  if ( !r.plain )
  {
    return `${ lvl.id } ${ lvl.name }: НЕ ПРОХОДИТЬСЯ (${ r.nodes } вузлів, ${ r.ms } мс)`;
  }
  const stampInfo = r.stamp ? `марка: газ ${ r.stamp.gas.toFixed( 2 ) }` : 'МАРКА НЕДОСЯЖНА';
  const fuelInfo = lvl.fuel !== undefined ? ` бак ${ lvl.fuel }` : '';
  return `${ lvl.id } ${ lvl.name }: газ ${ r.plain.gas.toFixed( 2 ) } час ${ r.plain.time.toFixed( 1 ) } → поріг ${ gasThreshold( r.plain.gas ) }${ fuelInfo }; ${ stampInfo } (${ r.nodes } вузлів, ${ r.ms } мс)`;
}
