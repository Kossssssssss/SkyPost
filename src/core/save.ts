import { platform } from '../platform/platform.ts';

export interface LevelRecord
{
  done: boolean;
  gas: boolean;
  stamp: boolean;
  bestGas?: number;
}

export type SkinSlot = 'envelope' | 'basket' | 'trail' | 'pilot';

export interface SaveData
{
  v: 1;
  levels: Record<string, LevelRecord>;
  wallet: number;
  owned: string[];
  equip: Record<SkinSlot, string>;
  fails: Record<string, number>;
  levelsSinceAd: number;
  muted: boolean;
  music: boolean;
  seenTips: string[];
  lastLevel: string;
}

const KEY = 'skypost.save.v1';

function fresh(): SaveData
{
  return {
    v: 1,
    levels: {},
    wallet: 0,
    owned: [ 'env-classic', 'bas-wicker', 'trl-none', 'plt-fox' ],
    equip: { envelope: 'env-classic', basket: 'bas-wicker', trail: 'trl-none', pilot: 'plt-fox' },
    fails: {},
    levelsSinceAd: 0,
    muted: false,
    music: true,
    seenTips: [],
    lastLevel: '1-1'
  };
}

let data: SaveData = fresh();

export function loadSave(): void
{
  try
  {
    const raw = platform.storage.getItem( KEY );
    if ( raw )
    {
      const parsed = JSON.parse( raw ) as Partial<SaveData>;
      const base = fresh();
      data = { ...base, ...parsed, equip: { ...base.equip, ...parsed.equip } };
    }
  }
  catch
  {
    data = fresh();
  }
}

export function save(): SaveData
{
  return data;
}

export function persist(): void
{
  try
  {
    platform.storage.setItem( KEY, JSON.stringify( data ) );
  }
  catch
  {
    // Приватний режим або переповнене сховище — гра має йти далі й без збереження
  }
}

export function record( id: string ): LevelRecord
{
  return data.levels[ id ] ?? { done: false, gas: false, stamp: false };
}

export function starsOf( id: string ): number
{
  const r = data.levels[ id ];
  if ( !r || !r.done )
  {
    return 0;
  }
  return 1 + ( r.gas ? 1 : 0 ) + ( r.stamp ? 1 : 0 );
}

// «Зібрано всього» рахуємо з рекордів рівнів, а гаманець — окремо, щоб покупки не закривали світи
export function totalStars(): number
{
  let n = 0;
  for ( const id of Object.keys( data.levels ) )
  {
    n += starsOf( id );
  }
  return n;
}

export function applyResult( id: string, gasOk: boolean, stampOk: boolean, gas: number ): { gained: number; prev: LevelRecord }
{
  const prev = record( id );
  const before = starsOf( id );
  const next: LevelRecord = {
    done: true,
    gas: prev.gas || gasOk,
    stamp: prev.stamp || stampOk,
    bestGas: Math.min( prev.bestGas ?? Infinity, gas )
  };
  data.levels[ id ] = next;
  const gained = starsOf( id ) - before;
  data.wallet += gained;
  data.fails[ id ] = 0;
  persist();
  return { gained, prev };
}

export function addFail( id: string ): number
{
  data.fails[ id ] = ( data.fails[ id ] ?? 0 ) + 1;
  persist();
  return data.fails[ id ];
}

export function resetSave(): void
{
  data = fresh();
  persist();
}
