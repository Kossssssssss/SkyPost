import { platform } from '../platform/platform.ts';
import { cleared, setClears, setCoins, track, type Params } from '../platform/analytics.ts';

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
  v: 2;
  levels: Record<string, LevelRecord>;
  coins: number;
  owned: string[];
  equip: Record<SkinSlot, string>;
  fails: Record<string, number>;
  levelsSinceAd: number;
  // Звукові ефекти й музика вимикаються окремо
  sfx: boolean;
  music: boolean;
  seenTips: string[];
  lastLevel: string;
}

const KEY = 'skypost.save.v1';

// Стара валюта v1 — зірки на витрати; при переході на монети кожна зірка = 10 монет
const WALLET_TO_COINS = 10;

// Нарахування монет за рівень (стартові числа, ROADMAP п. 2)
export const COIN_RULES = {
  firstClear: 10,
  newStar: 7,
  replay: 2,
  mult: { hard: 1.5, super: 2 } as Record<string, number>
};

// Складові нагороди — для розбивки на екрані результату
export interface CoinParts
{
  first: number;
  replay: number;
  stars: number;
  mult: number;
  total: number;
}

// Перше проходження дає базу, кожна наступна нова зірка (газ, марка) — бонус; повтор без нових зірок — дрібниця.
// Важкі рівні множать суму
export function coinParts( firstClear: boolean, newStars: number, difficulty?: string ): CoinParts
{
  const first = firstClear ? COIN_RULES.firstClear : 0;
  const stars = ( firstClear ? Math.max( 0, newStars - 1 ) : newStars ) * COIN_RULES.newStar;
  const replay = !firstClear && newStars === 0 ? COIN_RULES.replay : 0;
  const mult = COIN_RULES.mult[ difficulty ?? '' ] ?? 1;
  return { first, replay, stars, mult, total: Math.round( ( first + stars + replay ) * mult ) };
}

export function coinsFor( firstClear: boolean, newStars: number, difficulty?: string ): number
{
  return coinParts( firstClear, newStars, difficulty ).total;
}

function fresh(): SaveData
{
  return {
    v: 2,
    levels: {},
    coins: 0,
    owned: [ 'env-classic', 'bas-wicker', 'trl-none', 'plt-fox' ],
    equip: { envelope: 'env-classic', basket: 'bas-wicker', trail: 'trl-none', pilot: 'plt-fox' },
    fails: {},
    levelsSinceAd: 0,
    sfx: true,
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
      const parsed = JSON.parse( raw ) as Partial<SaveData> & { wallet?: number; muted?: boolean };
      const base = fresh();
      const { wallet, muted, ...rest } = parsed;
      data = { ...base, ...rest, v: 2, equip: { ...base.equip, ...parsed.equip } };
      // Старий єдиний вимикач глушив усе — переносимо його в обидва нові
      if ( muted && typeof parsed.sfx !== 'boolean' )
      {
        data.sfx = false;
        data.music = false;
      }
      if ( typeof wallet === 'number' && typeof parsed.coins !== 'number' )
      {
        data.coins = Math.max( 0, Math.round( wallet * WALLET_TO_COINS ) );
        persist();
      }
    }
  }
  catch
  {
    data = fresh();
  }
  setClears( clearedCount() );
  setCoins( data.coins );
}

function clearedCount(): number
{
  return Object.values( data.levels ).filter( ( r ) => r.done ).length;
}

export function save(): SaveData
{
  return data;
}

export function persist(): void
{
  setCoins( data.coins );
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

// Зірки — лише прогрес (відкриття світів), їх рахуємо з рекордів рівнів; покупки йдуть за монети
export function totalStars(): number
{
  let n = 0;
  for ( const id of Object.keys( data.levels ) )
  {
    n += starsOf( id );
  }
  return n;
}

// stats — подробиці спроби для аналітики (спроба, час, рівень)
export function applyResult( id: string, gasOk: boolean, stampOk: boolean, gas: number, difficulty?: string, stats?: Params ): { gained: number; coins: number; parts: CoinParts; prev: LevelRecord }
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
  const parts = coinParts( !prev.done, gained, difficulty );
  const coins = parts.total;
  data.coins += coins;
  data.fails[ id ] = 0;
  persist();
  track( 'level_complete', { ...stats, level: id, stars: starsOf( id ), new_stars: gained, coins, first_clear: !prev.done, gas_ok: gasOk, stamp_ok: stampOk, difficulty: difficulty ?? 'normal' } );
  if ( !prev.done )
  {
    cleared( clearedCount(), id );
  }
  return { gained, coins, parts, prev };
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
