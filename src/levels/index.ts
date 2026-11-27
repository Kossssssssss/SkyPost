import type { LevelData, WorldData } from '../core/level.ts';
import { record, starsOf, totalStars } from '../core/save.ts';
import world1 from './world1.json';
import world2 from './world2.json';
import world3 from './world3.json';
import world4 from './world4.json';
import world5 from './world5.json';
import daily from './daily.json';

export const WORLDS: WorldData[] = [ world1 as WorldData, world2 as WorldData, world3 as WorldData, world4 as WorldData, world5 as WorldData ];

// Рівні Доставки дня (daily-N): поза світами, картою й зірками; знаходить їх лише findLevel
export const DAILY = daily as WorldData;

// Світи, які вийдуть оновленням: на карті вони «скоро». Зараз таких немає
export const FUTURE_WORLDS: { id: number; name: string }[] = [];

export const WORLD_UNLOCK = [ 0, 10, 26, 44, 64 ];

export function allLevels(): LevelData[]
{
  return WORLDS.flatMap( ( w ) => w.levels );
}

export function findLevel( id: string ): { world: WorldData; index: number; level: LevelData } | undefined
{
  for ( const world of [ ...WORLDS, DAILY ] )
  {
    const index = world.levels.findIndex( ( l ) => l.id === id );
    if ( index >= 0 )
    {
      return { world, index, level: world.levels[ index ] };
    }
  }
  return undefined;
}

export function nextLevelId( id: string ): string | undefined
{
  const list = allLevels();
  const i = list.findIndex( ( l ) => l.id === id );
  return i >= 0 && i + 1 < list.length ? list[ i + 1 ].id : undefined;
}

export function worldUnlocked( worldId: number ): boolean
{
  return totalStars() >= ( WORLD_UNLOCK[ worldId - 1 ] ?? Infinity );
}

export function levelUnlocked( id: string ): boolean
{
  const f = findLevel( id );
  if ( !f || !worldUnlocked( f.world.id ) )
  {
    return false;
  }
  if ( f.index === 0 )
  {
    return true;
  }
  return record( f.world.levels[ f.index - 1 ].id ).done;
}

export function worldPerfect( worldId: number ): boolean
{
  const w = WORLDS.find( ( x ) => x.id === worldId );
  return !!w && w.levels.length > 0 && w.levels.every( ( l ) => starsOf( l.id ) === 3 );
}

export function maxStars(): number
{
  return allLevels().length * 3;
}
