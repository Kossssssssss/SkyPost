// Своя аналітика: пачки подій ідуть на Cloudflare Worker (analytics/), той пише їх у Workers Analytics Engine.
// Адреса — VITE_ANALYTICS_URL у .env.local; без неї, а в dev-збірці без ?an у адресі, події нікуди не йдуть
// (у dev вони лише пишуться в консоль).
// Жодного ID гравця чи сесії: лише назва події й параметри. І нічого не зберігаємо на пристрої саме для аналітики:
// «раз на гравця» виводиться із сейву гри (пройдені рівні, бачене навчання), «раз на сесію» — пам'ять сторінки.
// Утримання (D1/D7) — у кабінеті CrazyGames.
// Параметри — лише поля зі схеми analytics/schema.ts (у dev про зайві попереджає консоль).
//
// Де відвалюються гравці:
// - воронка f01…f14: f01…f04 — поки гравець не пройшов жодного рівня (раз на сесію: хто кинув до першої перемоги
//   й повернувся, рахується знову); f05…f14 — уперше пройдено 1…40 різних рівнів (раз на гравця за сейвом);
// - exit / back: гравець сховав або закрив вкладку — де саме (place), скільки там пробув, на якому рівні й наскільки далеко;
//   back шле той самий стан, тож справжні виходи = exit мінус back;
// - level_fail / level_complete / level_quit: номер спроби, час, пройдена частина маршруту (старт спроби окремо не шлемо:
//   кожна спроба закінчується однією з цих подій або exit із place=level).
// Подій мінімум, бо кожна подія — запис у безкоштовному ліміті. Решта (старт рівня, реклама) іде лише в Sentry
// як breadcrumbs через note(); помилки ловить сам Sentry.
import { version } from '../../package.json';
import { BATCH_MAX, BLOBS, DOUBLES, type Batch } from '../../analytics/schema.ts';
import { crashCrumb, setCrashContext } from './crash.ts';

export type Params = Record<string, string | number | boolean>;

const URL_ = import.meta.env.VITE_ANALYTICS_URL as string | undefined;
// Пачку шлемо, коли назбиралось стільки подій, при прихованій вкладці або через FLUSH_MS після першої події в черзі
const FLUSH_AT = 25;
const FLUSH_MS = 120000;
const PENDING_MAX = 200;
// Старий облік гравця в localStorage (до відмови від зберігання на пристрої для аналітики): стираємо
const OLD_STORE_KEY = 'skypost.bb';
const KEYS = new Set<string>( [ ...BLOBS, ...DOUBLES ] );

// Скільки пройдених рівнів (уперше) дає крок воронки
const CLEAR_STEPS: Record<number, string> = {
  1: 'f05_clear_1', 2: 'f06_clear_2', 3: 'f07_clear_3', 5: 'f08_clear_5', 8: 'f09_clear_8',
  12: 'f10_clear_12', 16: 'f11_clear_16', 24: 'f12_clear_24', 32: 'f13_clear_32', 40: 'f14_clear_40'
};

let enabled = false;
let started = false;
let timer = 0;
const queue: Batch[ 'e' ] = [];
// Що вже відправлено за цю сесію (кроки воронки, віхи)
const sent = new Set<string>();

function sec( ms: number ): number
{
  return Math.round( ms / 1000 );
}

// ---------- Відправка ----------

function flush(): void
{
  clearTimeout( timer );
  timer = 0;
  while ( queue.length && URL_ )
  {
    const body = JSON.stringify( { v: version, e: queue.splice( 0, BATCH_MAX ) } satisfies Batch );
    try
    {
      // Рядок іде як text/plain: без CORS-запиту наперед, і доходить навіть із закритої вкладки
      if ( !navigator.sendBeacon( URL_, body ) )
      {
        void fetch( URL_, { method: 'POST', body, keepalive: true, mode: 'no-cors' } ).catch( () => undefined );
      }
    }
    catch
    {
      // Аналітика ніколи не ламає гру
    }
  }
}

export function initAnalytics(): void
{
  if ( started )
  {
    return;
  }
  started = true;
  try
  {
    localStorage.removeItem( OLD_STORE_KEY );
  }
  catch
  {
    // Сховище недоступне — стирати нічого
  }
  listen();
  setCrashContext( where );
  const forced = new URLSearchParams( location.search ).has( 'an' );
  enabled = !!URL_ && ( !import.meta.env.DEV || forced );
}

export function track( name: string, params?: Params ): void
{
  if ( import.meta.env.DEV )
  {
    console.debug( '[an]', name, params ?? '' );
    const extra = Object.keys( params ?? {} ).filter( ( k ) => !KEYS.has( k ) );
    if ( extra.length )
    {
      console.warn( `[an] ${ name }: поля ${ extra.join( ', ' ) } немає в analytics/schema.ts, вони не збережуться` );
    }
  }
  crashCrumb( name, params );
  if ( !enabled || queue.length >= PENDING_MAX )
  {
    return;
  }
  queue.push( [ name, params ?? {} ] );
  if ( queue.length >= FLUSH_AT || document.visibilityState === 'hidden' )
  {
    flush();
  }
  else if ( !timer )
  {
    timer = window.setTimeout( flush, FLUSH_MS );
  }
}

// Лише для контексту помилок у Sentry, в аналітику не йде
export function note( name: string, params?: Params ): void
{
  if ( import.meta.env.DEV )
  {
    console.debug( '[note]', name, params ?? '' );
  }
  crashCrumb( name, params );
}

// ---------- Воронка ----------

// Крок воронки або віха: раз на сесію. Раз на гравця це стає там, де сама подія буває один раз
// (перша перемога на рівні, відкритий світ) або де її показ залежить від сейву (навчання)
export function milestone( step: string, params?: Params ): void
{
  if ( sent.has( step ) )
  {
    return;
  }
  sent.add( step );
  track( step, { session_sec: sec( performance.now() ), ...params } );
}

// Ранній крок воронки (f01…f04): лише поки гравець не пройшов жодного рівня
export function early( step: string, params?: Params ): void
{
  if ( clears === 0 )
  {
    milestone( step, params );
  }
}

// Гравець уперше пройшов рівень; n — скільки різних рівнів пройдено тепер
export function cleared( n: number, level: string ): void
{
  clears = n;
  const step = CLEAR_STEPS[ n ];
  if ( step )
  {
    milestone( step, { level } );
  }
}


// ---------- Де гравець зараз (для exit і помилок) ----------

let place = 'load';
let placeSince = 0;
let placeInfo: ( () => Params ) | undefined;
let clears = 0;
let coins = 0;
let hidden = false;

// Скільки різних рівнів пройдено (з сейву при старті)
export function setClears( n: number ): void
{
  clears = n;
}

// Монети на руках (сейв повідомляє при кожному збереженні)
export function setCoins( n: number ): void
{
  coins = n;
}

// load, map, shop, lang, level, final; info — подробиці на момент виходу (рівень, фаза, прогрес)
export function setPlace( name: string, info?: () => Params ): void
{
  place = name;
  placeInfo = info;
  placeSince = performance.now();
}

function where(): Params
{
  let extra: Params = {};
  try
  {
    extra = placeInfo?.() ?? {};
  }
  catch
  {
    // Сцена вже розібрана
  }
  return { place, place_sec: sec( performance.now() - placeSince ), session_sec: sec( performance.now() ), clears, coins, ...extra };
}

function onHide(): void
{
  if ( hidden )
  {
    return;
  }
  hidden = true;
  // Вкладку могли закрити: відправляємо все, що назбиралось, разом із exit
  track( 'exit', where() );
  flush();
}

function onShow(): void
{
  if ( !hidden )
  {
    return;
  }
  hidden = false;
  // Той самий стан, що й у exit: гравець повернувся, тож цей exit не вихід
  track( 'back', where() );
}

function listen(): void
{
  document.addEventListener( 'visibilitychange', () => document.visibilityState === 'hidden' ? onHide() : onShow() );
  window.addEventListener( 'pagehide', onHide );
}
