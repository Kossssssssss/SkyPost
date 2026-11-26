// Звіти про падіння в Sentry. DSN береться з .env.local (VITE_SENTRY_DSN); без нього, а в dev-збірці без ?sentry
// у адресі, нічого не відправляється. SDK вантажиться окремим чанком, тож не затримує екран завантаження;
// помилки до його готовності чекають у черзі. Стек у Sentry читається через source maps, які завантажує
// @sentry/vite-plugin при збірці (див. vite.config.ts), а з dist вони видаляються.
import { version } from '../../package.json';

type Params = Record<string, string | number | boolean>;
type Sdk = typeof import( './crashSdk.ts' );

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
// Ліміт на сесію, щоб одна зациклена помилка не з'їла місячну квоту
const EVENTS_MAX = 10;
const EARLY_MAX = 10;
const CRUMBS_MAX = 30;

let sdk: Sdk | null = null;
let enabled = false;
let sent = 0;
let context: () => Params = () => ( {} );
const early: unknown[] = [];
const crumbs: Array<[ string, Params | undefined ]> = [];
const tags: Record<string, string> = {};

// Query і hash в адресах портал може використати під свої параметри: у звіт іде лише шлях
function stripQuery<T>( url: T ): T
{
  return ( typeof url === 'string' ? url.replace( /[?#].*$/s, '' ) : url ) as T;
}

function onError( e: ErrorEvent ): void
{
  if ( early.length < EARLY_MAX )
  {
    early.push( e.error ?? new Error( String( e.message || 'error' ) ) );
  }
}

function onRejection( e: PromiseRejectionEvent ): void
{
  if ( early.length < EARLY_MAX )
  {
    early.push( e.reason );
  }
}

export function initCrash(): void
{
  const forced = new URLSearchParams( location.search ).has( 'sentry' );
  if ( enabled || !DSN || ( import.meta.env.DEV && !forced ) )
  {
    return;
  }
  enabled = true;
  // Поки SDK вантажиться, помилки ловимо самі; далі їх ловить Sentry
  window.addEventListener( 'error', onError );
  window.addEventListener( 'unhandledrejection', onRejection );
  import( './crashSdk.ts' ).then( ( S ) =>
  {
    S.init( {
      dsn: DSN,
      release: version,
      // MODE: 'production' у звичайній збірці, 'qa' у збірці для QA Tool (vite build --mode qa)
      environment: import.meta.env.DEV ? 'dev' : import.meta.env.MODE,
      // Лише наші скрипти: помилки SDK порталу й розширень браузера не цікаві
      allowUrls: [ location.origin ],
      maxBreadcrumbs: CRUMBS_MAX,
      // Жодних даних гравця: лише браузер, версія гри й контекст сцени
      dataCollection: { userInfo: false, cookies: false },
      beforeBreadcrumb( crumb )
      {
        const data = crumb.data;
        if ( data )
        {
          for ( const key of [ 'url', 'from', 'to' ] )
          {
            if ( key in data )
            {
              data[ key ] = stripQuery( data[ key ] );
            }
          }
        }
        return crumb;
      },
      beforeSend( event )
      {
        if ( sent >= EVENTS_MAX )
        {
          return null;
        }
        sent++;
        const request = event.request;
        if ( request )
        {
          request.url = stripQuery( request.url );
          delete request.query_string;
          if ( request.headers?.Referer )
          {
            request.headers.Referer = stripQuery( request.headers.Referer );
          }
        }
        try
        {
          event.contexts = { ...event.contexts, game: context() };
        }
        catch
        {
          // Сцена вже розібрана
        }
        return event;
      }
    } );
    S.setTags( tags );
    for ( const [ name, params ] of crumbs.splice( 0 ) )
    {
      S.addBreadcrumb( { category: 'game', message: name, data: params } );
    }
    window.removeEventListener( 'error', onError );
    window.removeEventListener( 'unhandledrejection', onRejection );
    sdk = S;
    for ( const err of early.splice( 0 ) )
    {
      S.captureException( err );
    }
  } ).catch( () =>
  {
    // Блокувальник або офлайн: працюємо без звітів
    enabled = false;
    window.removeEventListener( 'error', onError );
    window.removeEventListener( 'unhandledrejection', onRejection );
    early.length = 0;
    crumbs.length = 0;
  } );
}

// Де гравець зараз (сцена, рівень, прогрес): додається до кожного звіту
export function setCrashContext( fn: () => Params ): void
{
  context = fn;
}

export function crashTag( key: string, value: string ): void
{
  tags[ key ] = value;
  sdk?.setTag( key, value );
}

// Не падіння, але збій, про який треба знати (застрягла реклама, втрата WebGL)
export function crashReport( message: string, params?: Params ): void
{
  if ( !enabled )
  {
    return;
  }
  if ( sdk )
  {
    sdk.captureMessage( message, { level: 'warning', extra: params } );
  }
  else if ( early.length < EARLY_MAX )
  {
    early.push( new Error( message ) );
  }
}

// Подія гри як хлібна крихта: що гравець робив перед падінням
export function crashCrumb( name: string, params?: Params ): void
{
  if ( !enabled )
  {
    return;
  }
  if ( sdk )
  {
    sdk.addBreadcrumb( { category: 'game', message: name, data: params } );
  }
  else
  {
    if ( crumbs.length >= CRUMBS_MAX )
    {
      crumbs.shift();
    }
    crumbs.push( [ name, params ] );
  }
}
