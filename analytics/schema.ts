// Колонки Workers Analytics Engine: спільні для гри (що можна слати) і Worker (куди писати).
// Порядок не міняти: blobN і doubleN у вже записаних даних прив'язані до позиції
// (востаннє перебудовано до версії 1.0.1, коли справжніх даних ще не було — лише тестові qa).
// Нове поле — лише в кінець і лише якщо є місце (ліміт: 20 рядків і 20 чисел на подію).

// Рядки. event — назва події, v — версія гри
export const BLOBS = [
  'event', 'v', 'level', 'world', 'place', 'phase', 'reason', 'action', 'placement', 'via',
  'platform', 'locale', 'letters', 'difficulty', 'skin', 'slot', 'key', 'url'
] as const;

// Числа; true/false пишуться як 1/0
export const DOUBLES = [
  'attempt', 'sec', 'progress', 'gas', 'hint', 'bonus_gas', 'checkpoint', 'returning', 'session_sec',
  'place_sec', 'clears', 'coins', 'stars', 'new_stars', 'first', 'gas_ok', 'stamp_ok', 'price'
] as const;

export type BlobKey = typeof BLOBS[ number ];
export type DoubleKey = typeof DOUBLES[ number ];

// Назва колонки в SQL для поля: blobN або doubleN
export function col( key: BlobKey | DoubleKey ): string
{
  const b = ( BLOBS as readonly string[] ).indexOf( key );
  return b >= 0 ? `blob${ b + 1 }` : `double${ ( DOUBLES as readonly string[] ).indexOf( key ) + 1 }`;
}

// Пачка подій від гри: v — версія, e — [назва, параметри]
export interface Batch
{
  v: string;
  e: Array<[ string, Record<string, string | number | boolean> ]>;
}

export const BATCH_MAX = 50;
export const DATASET = 'sky_post_events';
