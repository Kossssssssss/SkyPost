// Сторінка звітів /report: запити до SQL API Analytics Engine і прості таблиці.
// Вхід — HTTP Basic, пароль із секрету REPORT_PASSWORD (ім'я будь-яке).
// Analytics Engine вибірково пише рядки під навантаженням, тож кількість — SUM(_sample_interval), а не count().
import { DATASET, col } from '../schema.ts';
import type { Env } from './index.ts';

type Row = Record<string, string | number>;

const C = {
  event: col( 'event' ), v: col( 'v' ), level: col( 'level' ), place: col( 'place' ), phase: col( 'phase' ),
  reason: col( 'reason' ), placement: col( 'placement' ), via: col( 'via' ), skin: col( 'skin' ), key: col( 'key' ),
  attempt: col( 'attempt' ), progress: col( 'progress' ), clears: col( 'clears' ), first: col( 'first' ), returning: col( 'returning' )
};

const FUNNEL: Array<[ string, string ]> = [
  [ 'f01_open', 'Відкрили гру' ], [ 'f02_load_done', 'Дочекались завантаження' ], [ 'f03_first_burn', 'Перший підйом' ],
  [ 'f04_first_letter', 'Перший лист' ], [ 'f05_clear_1', 'Пройшли 1 рівень' ], [ 'f06_clear_2', '2 рівні' ],
  [ 'f07_clear_3', '3 рівні' ], [ 'f08_clear_5', '5 рівнів' ], [ 'f09_clear_8', '8 рівнів' ], [ 'f10_clear_12', '12 рівнів' ],
  [ 'f11_clear_16', '16 рівнів' ], [ 'f12_clear_24', '24 рівні' ], [ 'f13_clear_32', '32 рівні' ], [ 'f14_clear_40', '40 рівнів' ]
];
// Версія тестових подій: у звітах лише за окремим фільтром
const QA = 'qa';

function unauthorized(): Response
{
  return new Response( 'Потрібен пароль', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="sky-post"' } } );
}

// Порівняння пароля за сталий час
function same( a: string, b: string ): boolean
{
  const x = new TextEncoder().encode( a );
  const y = new TextEncoder().encode( b );
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual( x, y );
}

function authorized( req: Request, password: string ): boolean
{
  const h = req.headers.get( 'authorization' ) ?? '';
  if ( !h.startsWith( 'Basic ' ) )
  {
    return false;
  }
  try
  {
    const pair = atob( h.slice( 6 ) );
    return same( pair.slice( pair.indexOf( ':' ) + 1 ), password );
  }
  catch
  {
    return false;
  }
}

async function query( env: Env, sql: string ): Promise<Row[]>
{
  const res = await fetch( `https://api.cloudflare.com/client/v4/accounts/${ env.CF_ACCOUNT_ID }/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ env.CF_API_TOKEN }` },
    body: sql
  } );
  if ( !res.ok )
  {
    throw new Error( `SQL ${ res.status }: ${ ( await res.text() ).slice( 0, 300 ) }` );
  }
  return ( ( await res.json() ) as { data: Row[] } ).data;
}

// ---------- Розмітка ----------

function esc( s: unknown ): string
{
  return String( s ).replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } )[ c ] ?? c );
}

function n( v: unknown ): number
{
  return Number( v ) || 0;
}

function int( v: number ): string
{
  return Math.round( v ).toLocaleString( 'uk-UA' );
}

function pct( a: number, b: number ): string
{
  return b > 0 ? Math.round( a / b * 100 ) + '%' : '—';
}

function table( head: string[], rows: Array<Array<string | number>>, note = '' ): string
{
  if ( !rows.length )
  {
    return '<p class="empty">Даних ще немає</p>';
  }
  return ( note ? `<p class="note">${ note }</p>` : '' ) + '<table><thead><tr>' + head.map( ( h ) => `<th>${ esc( h ) }</th>` ).join( '' ) +
    '</tr></thead><tbody>' + rows.map( ( r ) => '<tr>' + r.map( ( c ) => `<td>${ esc( c ) }</td>` ).join( '' ) + '</tr>' ).join( '' ) + '</tbody></table>';
}

// 1-2 < 1-10 < 2-1
function levelOrder( a: string, b: string ): number
{
  const [ aw, an ] = a.split( '-' ).map( Number );
  const [ bw, bn ] = b.split( '-' ).map( Number );
  return ( aw - bw ) || ( an - bn ) || a.localeCompare( b );
}

// ---------- Звіти ----------

function funnel( events: Map<string, number> ): string
{
  const start = events.get( FUNNEL[ 0 ][ 0 ] ) ?? 0;
  let prev = start;
  const rows = FUNNEL.map( ( [ id, label ] ) =>
  {
    const v = events.get( id ) ?? 0;
    const row = [ label, int( v ), pct( v, start ), pct( v, prev ) ];
    prev = v;
    return row;
  } );
  const tut = [ ...events ].filter( ( [ k ] ) => /^t\d_/.test( k ) ).sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) );
  const marks = [ ...events ].filter( ( [ k ] ) => k.startsWith( 'm_' ) ).sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) );
  const burn = events.get( 'f03_first_burn' ) ?? 0;
  return '<h2>Воронка</h2>' + table( [ 'Крок', 'Гравців', 'Від відкриття', 'Від попереднього' ], rows,
    'Кроки до першої перемоги рахуються раз на сесію гравця, який ще не пройшов жодного рівня (хто кинув і повернувся — ще раз). ' +
    '«Пройшли N рівнів» — раз на гравця, за сейвом гри.' ) +
    '<h3>Навчання на 1-1</h3>' + table( [ 'Крок', 'Гравців', 'Від першого підйому' ], tut.map( ( [ k, v ] ) => [ k, int( v ), pct( v, burn ) ] ),
    'Навчання йде, доки гравець його не закінчить; хто кинув посередині й повернувся — рахується ще раз.' ) +
    '<h3>Віхи</h3>' + table( [ 'Віха', 'Гравців', 'Від відкриття' ], marks.map( ( [ k, v ] ) => [ k, int( v ), pct( v, start ) ] ) );
}

// Вихід = exit мінус back: гравець сховав вкладку й повернувся — це не вихід
function netExits( rows: Row[], keyOf: ( r: Row ) => string ): Map<string, number>
{
  const out = new Map<string, number>();
  for ( const r of rows )
  {
    const k = keyOf( r );
    out.set( k, ( out.get( k ) ?? 0 ) + ( r.ev === 'exit' ? n( r.n ) : -n( r.n ) ) );
  }
  return out;
}

function levels( rows: Row[], exits: Row[] ): string
{
  interface L { win: number; fail: number; quit: number; firstClear: number; firstClearTries: number; failProgress: number; water: number; hazard: number; gas: number }
  const by = new Map<string, L>();
  for ( const r of rows )
  {
    const id = String( r.lvl );
    const l = by.get( id ) ?? { win: 0, fail: 0, quit: 0, firstClear: 0, firstClearTries: 0, failProgress: 0, water: 0, hazard: 0, gas: 0 };
    by.set( id, l );
    if ( r.ev === 'level_complete' )
    {
      l.win += n( r.n );
      l.firstClear += n( r.first_clear );
      l.firstClearTries += n( r.first_clear_tries );
    }
    else if ( r.ev === 'level_fail' )
    {
      l.fail += n( r.n );
      l.failProgress += n( r.progress_sum );
      l.water += n( r.water );
      l.hazard += n( r.hazard );
      l.gas += n( r.gas );
    }
    else
    {
      l.quit += n( r.n );
    }
  }
  const left = netExits( exits.filter( ( r ) => r.place === 'level' ), ( r ) => String( r.lvl ) );
  const out = [ ...by ].sort( ( a, b ) => levelOrder( a[ 0 ], b[ 0 ] ) ).map( ( [ id, l ] ) =>
  {
    const tries = l.win + l.fail + l.quit;
    return [
      id, int( tries ), pct( l.win, tries ), int( l.firstClear ),
      l.firstClear ? ( l.firstClearTries / l.firstClear ).toFixed( 1 ) : '—',
      l.fail ? Math.round( l.failProgress / l.fail ) + '%' : '—',
      `${ int( l.water ) } / ${ int( l.hazard ) } / ${ int( l.gas ) }`,
      int( l.quit ), int( Math.max( 0, left.get( id ) ?? 0 ) )
    ];
  } );
  return '<h2>Рівні</h2>' + table(
    [ 'Рівень', 'Спроб', 'Перемог', 'Пройшли вперше', 'Спроб до 1-ї перемоги', 'Маршруту при поразці', 'Поразки: вода / перешкода / газ', 'Кинули спробу', 'Закрили гру тут' ],
    out,
    'Спроба — кожен політ (зокрема з чекпойнта). «Кинули спробу» — перезапуск посеред польоту або вихід на карту. «Закрили гру тут» — сесія скінчилась на цьому рівні.'
  );
}

function exitsReport( rows: Row[] ): string
{
  const byPlace = netExits( rows, ( r ) => r.place === 'level' ? `level · ${ r.phase }` : String( r.place ) );
  const total = [ ...byPlace.values() ].reduce( ( a, b ) => a + Math.max( 0, b ), 0 );
  const places = [ ...byPlace ].filter( ( [ , v ] ) => v > 0 ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).map( ( [ k, v ] ) => [ k, int( v ), pct( v, total ) ] );
  const byClears = netExits( rows, ( r ) => String( n( r.clears ) ) );
  const clears = [ ...byClears ].filter( ( [ , v ] ) => v > 0 ).sort( ( a, b ) => Number( a[ 0 ] ) - Number( b[ 0 ] ) ).map( ( [ k, v ] ) => [ k, int( v ), pct( v, total ) ] );
  return '<h2>Де закінчують сесію</h2>' + table( [ 'Місце', 'Сесій', 'Частка' ], places,
    'Місце в момент, коли гравець закрив або сховав вкладку й не повернувся. На рівні: intro — картка рівня, play — політ, dead — екран поразки, won — екран перемоги, paused — пауза.' ) +
    '<h3>Скільки різних рівнів пройдено на момент виходу</h3>' + table( [ 'Пройдено рівнів', 'Сесій', 'Частка' ], clears );
}

// Analytics Engine зберігає лише частину рядків, коли подій одного типу приходить забагато за раз (кожен рядок тоді має вагу).
// Суми лишаються правильними, а дрібні розрізи стають приблизними
function sampling( rows: Row[], what: string ): string
{
  const read = rows.reduce( ( a, r ) => a + n( r.rows ), 0 );
  const est = rows.reduce( ( a, r ) => a + n( r.n ), 0 );
  return read < est ? `<p class="warn">Вибірка${ what }: прочитано ${ int( read ) } рядків, вони представляють ≈${ int( est ) } подій. ` +
    'Загальні суми надійні, дрібні розрізи — приблизні.</p>' : '';
}


function daily( rows: Row[] ): string
{
  return '<h2>По днях (UTC)</h2>' + table( [ 'День', 'Сесій', 'Нових гравців', 'Тих, що повернулись', 'Перемог на рівнях' ],
    rows.map( ( r ) => [ String( r.d ), int( n( r.sessions ) ), int( n( r.fresh ) ), int( n( r.back ) ), int( n( r.wins ) ) ] ),
    'Новий — сейву гри ще не було. Сесії тих, що повернулись, рахуються кожна. Утримання D1/D7 — у кабінеті CrazyGames.' );
}

function misc( rows: Row[] ): string
{
  const pick = ( ev: string, label: ( r: Row ) => string ) => rows.filter( ( r ) => r.ev === ev ).sort( ( a, b ) => n( b.n ) - n( a.n ) ).map( ( r ) => [ label( r ), int( n( r.n ) ) ] );
  return '<h2>Винагороди</h2>' + table( [ 'Кнопка · як', 'Разів' ], pick( 'reward', ( r ) => `${ r.placement } · ${ r.via }` ) ) +
    '<h2>Покупки скінів</h2>' + table( [ 'Скін', 'Разів' ], pick( 'skin_purchase', ( r ) => String( r.skin ) ) ) +
    '<h2>Помилки завантаження</h2>' + table( [ 'Файл', 'Разів' ], pick( 'load_error', ( r ) => String( r.file ) ) );
}

const STYLE = `body{margin:0;padding:16px;background:#f4ecd8;color:#3b2f2a;font:15px/1.4 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto}h1{margin:0 0 8px}h2{margin:32px 0 8px}h3{margin:20px 0 6px}
nav a{margin-right:12px;color:#7a3b2e}nav b{margin-right:12px}.note,.empty{color:#6b5a50;margin:4px 0 8px}.warn{background:#f1dcc4;border-left:4px solid #a0522d;padding:6px 10px}
.wrap{overflow-x:auto}table{border-collapse:collapse;background:#fbf6ea}th,td{border:1px solid #d9cbb0;padding:4px 8px;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{background:#ebdfc6}`;

export async function report( req: Request, env: Env ): Promise<Response>
{
  if ( !env.REPORT_PASSWORD || !env.CF_ACCOUNT_ID || !env.CF_API_TOKEN )
  {
    return new Response( null, { status: 404 } );
  }
  if ( !authorized( req, env.REPORT_PASSWORD ) )
  {
    return unauthorized();
  }
  const url = new URL( req.url );
  const days = Math.min( 90, Math.max( 1, Math.floor( Number( url.searchParams.get( 'days' ) ) || 7 ) ) );
  const v = url.searchParams.get( 'v' ) ?? '';
  const ver = /^[\w.-]{1,20}$/.test( v ) ? v : '';
  const W = `timestamp > NOW() - INTERVAL '${ days }' DAY AND ` + ( ver ? `${ C.v } = '${ ver }'` : `${ C.v } != '${ QA }'` );
  const ev = ( ...names: string[] ) => '(' + names.map( ( x ) => `${ C.event } = '${ x }'` ).join( ' OR ' ) + ')';
  const F = `FROM ${ DATASET } WHERE ${ W }`;

  let body: string;
  try
  {
    const [ events, lv, exits, day, other, versions ] = await Promise.all( [
      query( env, `SELECT ${ C.event } AS ev, SUM(_sample_interval) AS n, count() AS rows ${ F } GROUP BY ev` ),
      query( env, `SELECT ${ C.level } AS lvl, ${ C.event } AS ev, SUM(_sample_interval) AS n,
        sumIf(_sample_interval, ${ C.first } = 1) AS first_clear,
        sumIf(_sample_interval * ${ C.attempt }, ${ C.first } = 1) AS first_clear_tries,
        SUM(_sample_interval * ${ C.progress }) AS progress_sum,
        sumIf(_sample_interval, ${ C.reason } = 'water') AS water,
        sumIf(_sample_interval, ${ C.reason } = 'hazard') AS hazard,
        sumIf(_sample_interval, ${ C.reason } = 'gas') AS gas
        ${ F } AND ${ ev( 'level_complete', 'level_fail', 'level_quit' ) } GROUP BY lvl, ev` ),
      query( env, `SELECT ${ C.event } AS ev, ${ C.place } AS place, ${ C.level } AS lvl, ${ C.phase } AS phase, ${ C.clears } AS clears,
        SUM(_sample_interval) AS n ${ F } AND ${ ev( 'exit', 'back' ) } GROUP BY ev, place, lvl, phase, clears` ),
      query( env, `SELECT formatDateTime(timestamp, '%Y-%m-%d') AS d,
        sumIf(_sample_interval, ${ C.event } = 'game_start') AS sessions,
        sumIf(_sample_interval, ${ C.event } = 'game_start' AND ${ C.returning } = 0) AS fresh,
        sumIf(_sample_interval, ${ C.event } = 'game_start' AND ${ C.returning } = 1) AS back,
        sumIf(_sample_interval, ${ C.event } = 'level_complete') AS wins
        ${ F } GROUP BY d ORDER BY d DESC` ),
      query( env, `SELECT ${ C.event } AS ev, ${ C.placement } AS placement, ${ C.via } AS via, ${ C.skin } AS skin, ${ C.key } AS file,
        SUM(_sample_interval) AS n ${ F } AND ${ ev( 'reward', 'skin_purchase', 'load_error' ) } GROUP BY ev, placement, via, skin, file` ),
      query( env, `SELECT ${ C.v } AS v, SUM(_sample_interval) AS n FROM ${ DATASET } WHERE timestamp > NOW() - INTERVAL '90' DAY
        AND ${ C.event } = 'game_start' GROUP BY v ORDER BY v DESC` )
    ] );
    const map = new Map( events.map( ( r ) => [ String( r.ev ), n( r.n ) ] ) );
    const link = ( d: number, x: string, label: string ) => d === days && x === ver ? `<b>${ esc( label ) }</b>` :
      `<a href="?days=${ d }${ x ? '&v=' + encodeURIComponent( x ) : '' }">${ esc( label ) }</a>`;
    body = `<nav>${ [ 1, 7, 30, 90 ].map( ( d ) => link( d, ver, d + ' дн.' ) ).join( '' ) }</nav>` +
      `<nav>Версія: ${ link( days, '', 'усі, крім qa' ) }${ versions.map( ( r ) => link( days, String( r.v ), String( r.v ) ) ).join( '' ) }</nav>` +
      sampling( events, '' ) + daily( day ) + funnel( map ) + levels( lv, exits ) + exitsReport( exits ) + misc( other ) +
      '<h2>Усі події</h2>' + table( [ 'Подія', 'Разів' ], [ ...map ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).map( ( [ k, x ] ) => [ k, int( x ) ] ) );
  }
  catch ( e )
  {
    body = `<p>Не вдалося отримати дані: ${ esc( e instanceof Error ? e.message : e ) }</p>`;
  }
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sky Post · аналітика</title><style>${ STYLE }</style></head><body><main><h1>Sky Post · аналітика</h1>${ body.replace( /<table>/g, '<div class="wrap"><table>' ).replace( /<\/table>/g, '</table></div>' ) }</main></body></html>`;
  return new Response( html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } } );
}
