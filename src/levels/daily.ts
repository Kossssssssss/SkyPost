import { windCount, withWind, type LevelData } from '../core/level.ts';
import { DAILY } from './index.ts';

// Доставка дня: рівень за локальною датою гравця. Рівні йдуть по колу, а з кожним колом той самий рівень
// приходить з іншим варіантом вітру, тож повтор настає лише через (рівнів × варіантів) днів

// День 0 — 1 січня 2026 року
const EPOCH = Date.UTC( 2026, 0, 1 );
const DAY_MS = 86400000;

// Номер дня за місцевим календарем гравця (опівночі змінюється на наступний)
export function dayNumber( d = new Date() ): number
{
  return Math.floor( ( Date.UTC( d.getFullYear(), d.getMonth(), d.getDate() ) - EPOCH ) / DAY_MS );
}

// Скільки мілісекунд до наступної місцевої півночі (таймер до нової доставки)
export function msToNextDay( d = new Date() ): number
{
  const next = new Date( d.getFullYear(), d.getMonth(), d.getDate() + 1 );
  return next.getTime() - d.getTime();
}

export interface DailyPick
{
  day: number;
  id: string;
  wind: number;
}

// Який рівень і варіант вітру випадають на день
export function dailyPick( day = dayNumber() ): DailyPick | undefined
{
  const list = DAILY.levels;
  if ( !list.length )
  {
    return undefined;
  }
  const n = ( ( day % list.length ) + list.length ) % list.length;
  const lvl = list[ n ];
  const round = Math.floor( day / list.length );
  return { day, id: lvl.id, wind: ( ( round % windCount( lvl ) ) + windCount( lvl ) ) % windCount( lvl ) };
}

// Дані рівня дня з вітром сьогоднішнього (або заданого) дня; для інших id — undefined
export function dailyLevel( id: string, day = dayNumber() ): LevelData | undefined
{
  const lvl = DAILY.levels.find( ( l ) => l.id === id );
  if ( !lvl )
  {
    return undefined;
  }
  const pick = dailyPick( day );
  return withWind( lvl, pick?.id === id ? pick.wind : 0 );
}
