// Запуск: node tools/solve.ts world1 [1-3] [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WorldData } from '../src/core/level.ts';
import { solve, applySolve, describe } from '../src/core/solver.ts';
import { formatWorld } from '../src/core/levelJson.ts';

const args = process.argv.slice( 2 );
const files = args.filter( ( a ) => a.startsWith( 'world' ) );
const only = args.find( ( a ) => /^\d+-\d+$/.test( a ) );
const write = args.includes( '--write' );

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
