// Аналітика ByteBrew. Ключі беруться з .env.local (VITE_BYTEBREW_APP_ID, VITE_BYTEBREW_SDK_KEY);
// без них, а в dev-збірці без ?bb у адресі, події нікуди не йдуть.
// SDK вантажиться окремим чанком після старту, тож не затримує екран завантаження;
// події до його готовності чекають у черзі.
import { version } from '../../package.json';

type Params = Record<string, string | number | boolean>;
type Sdk = typeof import( 'bytebrew-web-sdk' ).ByteBrew;

const APP_ID = import.meta.env.VITE_BYTEBREW_APP_ID as string | undefined;
const SDK_KEY = import.meta.env.VITE_BYTEBREW_SDK_KEY as string | undefined;
const QUEUE_MAX = 50;
const INIT_POLL_MS = 250;
const INIT_POLLS = 80;

let sdk: Sdk | null = null;
let enabled = false;
const queue: Array<[ string, Params | undefined ]> = [];

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
