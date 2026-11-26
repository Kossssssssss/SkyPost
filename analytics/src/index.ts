// Приймає пачки подій від гри й пише кожну подію рядком у Workers Analytics Engine.
// Ні IP, ні User-Agent, ні ID гравця не зберігаються: лише назва події, версія й параметри зі схеми.
import { BATCH_MAX, BLOBS, DOUBLES, type Batch } from '../schema.ts';
import { report } from './report.ts';

export interface Env
{
  EVENTS: AnalyticsEngineDataset;
  // Для сторінки звітів (wrangler secret put …); без них /report недоступний
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  REPORT_PASSWORD?: string;
}

const BODY_MAX = 64 * 1024;
const TEXT_MAX = 100;
const NAME = /^[a-z0-9_]{1,40}$/;
const VERSION = /^[\w.-]{1,20}$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function reply( status: number ): Response
{
  return new Response( null, { status, headers: CORS } );
}

function text( v: unknown ): string
{
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String( v ).slice( 0, TEXT_MAX ) : '';
}

function num( v: unknown ): number
{
  if ( typeof v === 'boolean' )
  {
    return v ? 1 : 0;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number( v ) : NaN;
  return Number.isFinite( n ) ? n : 0;
}

async function collect( req: Request, env: Env ): Promise<Response>
{
  if ( Number( req.headers.get( 'content-length' ) ?? 0 ) > BODY_MAX )
  {
    return reply( 413 );
  }
  const body = await req.text();
  if ( body.length > BODY_MAX )
  {
    return reply( 413 );
  }
  let batch: Batch;
  try
  {
    batch = JSON.parse( body ) as Batch;
  }
  catch
  {
    return reply( 400 );
  }
  if ( !batch || !VERSION.test( String( batch.v ) ) || !Array.isArray( batch.e ) )
  {
    return reply( 400 );
  }
  for ( const item of batch.e.slice( 0, BATCH_MAX ) )
  {
    if ( !Array.isArray( item ) || typeof item[ 0 ] !== 'string' || !NAME.test( item[ 0 ] ) )
    {
      continue;
    }
    const name = item[ 0 ];
    const p: Record<string, unknown> = item[ 1 ] && typeof item[ 1 ] === 'object' ? item[ 1 ] : {};
    env.EVENTS.writeDataPoint( {
      indexes: [ name ],
      blobs: BLOBS.map( ( k ) => k === 'event' ? name : k === 'v' ? batch.v : text( p[ k ] ) ),
      doubles: DOUBLES.map( ( k ) => num( p[ k ] ) )
    } );
  }
  return reply( 204 );
}

export default {
  async fetch( req: Request, env: Env ): Promise<Response>
  {
    const url = new URL( req.url );
    if ( req.method === 'OPTIONS' )
    {
      return reply( 204 );
    }
    if ( req.method === 'POST' && url.pathname === '/e' )
    {
      return collect( req, env );
    }
    if ( req.method === 'GET' && url.pathname === '/report' )
    {
      return report( req, env );
    }
    return reply( 404 );
  }
} satisfies ExportedHandler<Env>;
