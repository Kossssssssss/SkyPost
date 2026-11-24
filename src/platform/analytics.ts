// Аналітика ByteBrew. Ключі беруться з .env.local (VITE_BYTEBREW_APP_ID, VITE_BYTEBREW_SDK_KEY);
// без них, а в dev-збірці без ?bb у адресі, події нікуди не йдуть (у dev вони лише пишуться в консоль).
// SDK вантажиться окремим чанком після старту, тож не затримує екран завантаження;
// події до його готовності чекають у черзі.
//
// Де відвалюються гравці:
// - воронка f01…f14: кожен крок раз на гравця, по порядку від відкриття гри до 40 пройдених рівнів;
// - exit / back: гравець сховав або закрив вкладку — де саме (place), скільки там пробув, на якому рівні й наскільки далеко;
// - level_start / level_fail / level_complete / level_quit: номер спроби, час, пройдена частина маршруту.
import { version } from '../../package.json';
import { crashCrumb, setCrashContext } from './crash.ts';

export type Params = Record<string, string | number | boolean>;
type Sdk = typeof import( 'bytebrew-web-sdk' ).ByteBrew;

const APP_ID = import.meta.env.VITE_BYTEBREW_APP_ID as string | undefined;
const SDK_KEY = import.meta.env.VITE_BYTEBREW_SDK_KEY as string | undefined;
const QUEUE_MAX = 50;
const INIT_POLL_MS = 250;
const INIT_POLLS = 80;
const ERRORS_MAX = 10;
const STORE_KEY = 'skypost.bb';
const DAY_MS = 86400000;

// Скільки пройдених рівнів (уперше) дає крок воронки
const CLEAR_STEPS: Record<number, string> = {
  1: 'f05_clear_1', 2: 'f06_clear_2', 3: 'f07_clear_3', 5: 'f08_clear_5', 8: 'f09_clear_8',
  12: 'f10_clear_12', 16: 'f11_clear_16', 24: 'f12_clear_24', 32: 'f13_clear_32', 40: 'f14_clear_40'
};

let sdk: Sdk | null = null;
let enabled = false;
let started = false;
const queue: Array<[ string, Params | undefined ]> = [];

// ---------- Локальний облік гравця (окремо від сейву гри) ----------

interface Store
{
  steps: string[];
  sessions: number;
  first: number;
  starts: Record<string, number>;
}

function loadStore(): Store
{
  try
  {
    const s = JSON.parse( localStorage.getItem( STORE_KEY ) ?? 'null' ) as Partial<Store> | null;
    if ( s && Array.isArray( s.steps ) )
    {
      return { steps: s.steps, sessions: Number( s.sessions ) || 0, first: Number( s.first ) || Date.now(), starts: s.starts ?? {} };
    }
  }
  catch
  {
    // Немає сховища — рахуємо з нуля
  }
  return { steps: [], sessions: 0, first: Date.now(), starts: {} };
}

const store = loadStore();

function keep(): void
{
  try
  {
    localStorage.setItem( STORE_KEY, JSON.stringify( store ) );
  }
  catch
  {
    // Приватний режим: облік живе до кінця сесії
  }
}

function sec( ms: number ): number
{
  return Math.round( ms / 1000 );
}

// Номер сесії гравця й день від першого запуску (0 — той самий день)
function who(): Params
{
  return { session: store.sessions, day: Math.floor( ( Date.now() - store.first ) / DAY_MS ) };
}

// ---------- Відправка ----------

// ByteBrew не приймає пробілів, крапок і двокрапок у назвах; значення шлемо рядками, як у прикладах документації
function clean( s: string ): string
{
  return s.replace( /[^A-Za-z0-9_]/g, '_' );
}

function send( name: string, params?: Params ): void
{
  if ( !sdk )
  {
    return;
  }
  try
  {
    if ( params )
    {
      const out: Record<string, string> = {};
      for ( const [ k, v ] of Object.entries( params ) )
      {
        out[ clean( k ) ] = String( v );
      }
      sdk.newCustomEvent( clean( name ), out );
    }
    else
    {
      sdk.newCustomEvent( clean( name ) );
    }
  }
  catch
  {
    // Аналітика ніколи не ламає гру
  }
}

export function initAnalytics(): void
{
  if ( started )
  {
    return;
  }
  started = true;
  store.sessions++;
  keep();
  listen();
  setCrashContext( where );
  const forced = new URLSearchParams( location.search ).has( 'bb' );
  if ( !APP_ID || !SDK_KEY || ( import.meta.env.DEV && !forced ) )
  {
    return;
  }
  enabled = true;
  import( 'bytebrew-web-sdk' ).then( ( m ) =>
  {
    const bb = m.ByteBrew;
    bb.initializeByteBrew( APP_ID, SDK_KEY, version );
    // Ініціалізація асинхронна й без колбека, а події до її кінця SDK мовчки викидає: чекаємо прапорця
    let tries = 0;
    const timer = setInterval( () =>
    {
      if ( bb.isByteBrewInitialized() )
      {
        clearInterval( timer );
        sdk = bb;
        for ( const [ name, params ] of queue.splice( 0 ) )
        {
          send( name, params );
        }
      }
      else if ( ++tries >= INIT_POLLS )
      {
        // Невірні ключі або сервер недоступний
        clearInterval( timer );
        enabled = false;
        queue.length = 0;
      }
    }, INIT_POLL_MS );
  } ).catch( () =>
  {
    // Блокувальник або офлайн: працюємо без аналітики
    enabled = false;
    queue.length = 0;
  } );
}

export function track( name: string, params?: Params ): void
{
  if ( import.meta.env.DEV )
  {
    console.debug( '[bb]', name, params ?? '' );
  }
  crashCrumb( name, params );
  if ( !enabled )
  {
    return;
  }
  if ( sdk )
  {
    send( name, params );
  }
  else if ( queue.length < QUEUE_MAX )
  {
    queue.push( [ name, params ] );
  }
}

// ---------- Воронка ----------

// Крок воронки або віха: раз на гравця
export function milestone( step: string, params?: Params ): void
{
  if ( store.steps.includes( step ) )
  {
    return;
  }
  store.steps.push( step );
  keep();
  track( step, { ...who(), session_sec: sec( performance.now() ), ...params } );
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

// Новий старт рівня: номер спроби за весь час гри
export function nextAttempt( level: string ): number
{
  const n = ( store.starts[ level ] ?? 0 ) + 1;
  store.starts[ level ] = n;
  keep();
  return n;
}

export function gameStartParams(): Params
{
  return { ...who(), first: store.sessions === 1 };
}

// ---------- Де гравець зараз (для exit і помилок) ----------

let place = 'load';
let placeSince = 0;
let placeInfo: ( () => Params ) | undefined;
let clears = 0;
let coins = 0;
let hiddenAt = 0;

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
  return { place, place_sec: sec( performance.now() - placeSince ), session_sec: sec( performance.now() ), clears, coins, ...who(), ...extra };
}

function onHide(): void
{
  if ( hiddenAt )
  {
    return;
  }
  hiddenAt = performance.now();
  // SDK шле кожну подію одразу fetch-ем із keepalive, тож вона доходить і при закритті вкладки
  track( 'exit', where() );
}

function onShow(): void
{
  if ( !hiddenAt )
  {
    return;
  }
  const away = sec( performance.now() - hiddenAt );
  hiddenAt = 0;
  track( 'back', { place, away_sec: away } );
}

// ---------- Помилки ----------

const errors = new Set<string>();

function reportError( msg: string, src: string ): void
{
  if ( errors.size >= ERRORS_MAX || errors.has( msg ) )
  {
    return;
  }
  errors.add( msg );
  track( 'js_error', { msg: msg.slice( 0, 120 ), src: src.slice( -80 ), place, v: version } );
}

function listen(): void
{
  document.addEventListener( 'visibilitychange', () => document.visibilityState === 'hidden' ? onHide() : onShow() );
  window.addEventListener( 'pagehide', onHide );
  window.addEventListener( 'error', ( e ) =>
  {
    const file = ( e.filename ?? '' ).split( '/' ).pop() ?? '';
    reportError( String( e.message || 'error' ), `${ file }:${ e.lineno }:${ e.colno }` );
  } );
  window.addEventListener( 'unhandledrejection', ( e ) =>
  {
    const r: unknown = e.reason;
    const err = r instanceof Error ? r : undefined;
    reportError( 'promise: ' + ( err ? err.message : String( r ) ), err?.stack?.split( '\n' )[ 1 ]?.trim() ?? '' );
  } );
}
