// Запуск: node tools/solve.ts world1 [1-3] [--write]
// --regas перераховує лише пороги газу із записаних best, без повторного пошуку
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorldData } from '../src/core/level.ts';
import { solve, applySolve, describe, gasThreshold } from '../src/core/solver.ts';
import { formatWorld } from '../src/core/levelJson.ts';

const args = process.argv.slice( 2 );
const files = args.filter( ( a ) => a.startsWith( 'world' ) );
const only = args.find( ( a ) => /^\d+-\d+$/.test( a ) );
const regas = args.includes( '--regas' );
const write = args.includes( '--write' ) || regas;

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
    const r = solve( lvl );
    console.log( describe( lvl, r ) );
    if ( write )
    {
      applySolve( lvl, r );
    }
  }
  if ( write )
  {
    writeFileSync( path, formatWorld( world ) );
    console.log( 'Записано ' + path );
  }
}
