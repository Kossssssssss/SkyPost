#!/usr/bin/env node
// Генерація асетів з референс-зображеннями через Cloudflare Workers AI або Runware
//
// node scripts/gen.mjs --prompt "..." --ref assets/ref/style_ref_512.png [--ref2 <файл>] [--seed 123]
//                      [--width 1024] [--height 1024] [--steps N] [--guidance G]
//                      [--provider cloudflare|runware] [--model flux-2-klein-9b] --out assets/raw/balloon_1.png
//
// Ключі Cloudflare: CLOUDFLARE_ACCOUNT_ID і CLOUDFLARE_API_TOKEN, інакше з ../image-mcp (config.json, token.txt).
// Ключ Runware: RUNWARE_API_KEY, інакше ../image-mcp/runware_key.txt.
// Кожен запуск дописується в assets/prompts.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join, extname, relative } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve( import.meta.dirname, '..' );
const MCP = resolve( ROOT, '..', 'image-mcp' );
const PROVIDERS = {
  cloudflare: {
    'flux-2-klein-9b': '@cf/black-forest-labs/flux-2-klein-9b',
    'flux-2-klein-4b': '@cf/black-forest-labs/flux-2-klein-4b',
    'flux-2-dev': '@cf/black-forest-labs/flux-2-dev'
  },
  runware: {
    'flux-2-klein-9b': 'runware:400@2',
    'flux-2-klein-9b-base': 'runware:400@3',
    'flux-2-klein-9b-kv': 'runware:400@6'
  }
};

const { values: a } = parseArgs( {
  options: {
    prompt: { type: 'string' },
    ref: { type: 'string' },
    ref2: { type: 'string' },
    seed: { type: 'string' },
    width: { type: 'string', default: '1024' },
    height: { type: 'string', default: '1024' },
    steps: { type: 'string' },
    guidance: { type: 'string' },
    provider: { type: 'string', default: 'cloudflare' },
    model: { type: 'string', default: 'flux-2-klein-9b' },
    out: { type: 'string' }
  }
} );

function fail( msg )
{
  console.error( msg );
  process.exit( 1 );
}

if ( !a.prompt || !a.out ) fail( 'Потрібні --prompt і --out' );
const MODELS = PROVIDERS[ a.provider ];
if ( !MODELS ) fail( `Невідомий провайдер ${ a.provider }: ${ Object.keys( PROVIDERS ).join( ', ' ) }` );
if ( !MODELS[ a.model ] ) fail( `Невідома модель ${ a.model } для ${ a.provider }: ${ Object.keys( MODELS ).join( ', ' ) }` );

function credentials()
{
  let account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  let token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if ( !account && existsSync( join( MCP, 'config.json' ) ) ) account = JSON.parse( readFileSync( join( MCP, 'config.json' ), 'utf8' ) ).accountId;
  if ( !token && existsSync( join( MCP, 'token.txt' ) ) ) token = readFileSync( join( MCP, 'token.txt' ), 'utf8' ).trim();
  if ( !account || !token ) fail( 'Немає ключів: задайте CLOUDFLARE_ACCOUNT_ID і CLOUDFLARE_API_TOKEN' );
  return { account, token };
}

function runwareKey()
{
  let key = process.env.RUNWARE_API_KEY?.trim();
  if ( !key && existsSync( join( MCP, 'runware_key.txt' ) ) ) key = readFileSync( join( MCP, 'runware_key.txt' ), 'utf8' ).trim();
  if ( !key ) fail( 'Немає ключа Runware: задайте RUNWARE_API_KEY або покладіть його в ../image-mcp/runware_key.txt' );
  return key;
}

function mimeOf( b )
{
  if ( b[ 0 ] === 0x89 && b[ 1 ] === 0x50 ) return { mime: 'image/png', ext: '.png' };
  if ( b[ 0 ] === 0x52 && b[ 1 ] === 0x49 && b[ 8 ] === 0x57 ) return { mime: 'image/webp', ext: '.webp' };
  return { mime: 'image/jpeg', ext: '.jpg' };
}

// Розмір PNG або JPEG із заголовка, без сторонніх бібліотек
function sizeOf( b )
{
  if ( b[ 0 ] === 0x89 && b[ 1 ] === 0x50 ) return [ b.readUInt32BE( 16 ), b.readUInt32BE( 20 ) ];
  for ( let i = 2; i < b.length - 9; )
  {
    if ( b[ i ] !== 0xff ) return null;
    const m = b[ i + 1 ];
    if ( m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc ) return [ b.readUInt16BE( i + 7 ), b.readUInt16BE( i + 5 ) ];
    i += 2 + b.readUInt16BE( i + 2 );
  }
  return null;
}

// Workers AI падає з 500 на референсах, більших за 512 px по стороні
const MAX_REF = 512;

function readRef( path )
{
  const full = resolve( ROOT, path );
  if ( !existsSync( full ) ) fail( `Немає файлу ${ path }` );
  const bytes = readFileSync( full );
  const size = sizeOf( bytes );
  if ( size && Math.max( ...size ) > MAX_REF ) fail( `Референс ${ path } має ${ size.join( 'x' ) }; потрібно не більше ${ MAX_REF } px по стороні` );
  return bytes;
}

// Повторюємо запит на 429 і 5xx: обидва сервіси іноді відмовляють на коректні запити
async function post( url, init, name )
{
  for ( let attempt = 1; ; attempt++ )
  {
    const res = await fetch( url, init );
    if ( ( res.status < 500 && res.status !== 429 ) || attempt === 4 ) return res;
    console.error( `${ name } ${ res.status }, повтор ${ attempt }/3` );
    await new Promise( ( r ) => setTimeout( r, attempt * 4000 ) );
  }
}

async function cloudflare()
{
  const form = new FormData();
  form.append( 'prompt', a.prompt );
  form.append( 'width', a.width );
  form.append( 'height', a.height );
  if ( a.seed !== undefined ) form.append( 'seed', a.seed );
  if ( a.steps !== undefined ) form.append( 'steps', a.steps );
  if ( a.guidance !== undefined ) form.append( 'guidance', a.guidance );
  [ a.ref, a.ref2 ].forEach( ( p, i ) =>
  {
    if ( !p ) return;
    const bytes = readRef( p );
    form.append( 'input_image_' + i, new Blob( [ bytes ], { type: mimeOf( bytes ).mime } ), 'ref' + i );
  } );

  const { account, token } = credentials();
  const url = `https://api.cloudflare.com/client/v4/accounts/${ account }/ai/run/${ MODELS[ a.model ] }`;
  const res = await post( url, { method: 'POST', headers: { Authorization: `Bearer ${ token }` }, body: form }, 'Cloudflare' );
  if ( !( res.headers.get( 'content-type' ) ?? '' ).includes( 'json' ) )
  {
    if ( !res.ok ) fail( `Cloudflare ${ res.status }: ${ ( await res.text() ).slice( 0, 400 ) }` );
    return { bytes: Buffer.from( await res.arrayBuffer() ) };
  }
  const json = await res.json();
  if ( !res.ok || json.success === false ) fail( `Cloudflare ${ res.status }: ${ JSON.stringify( json.errors ?? json ) }` );
  const image = json.result?.image ?? json.image;
  if ( !image ) fail( `У відповіді немає картинки: ${ JSON.stringify( json ).slice( 0, 400 ) }` );
  return { bytes: Buffer.from( image, 'base64' ) };
}

async function runware()
{
  const task = {
    taskType: 'imageInference',
    taskUUID: crypto.randomUUID(),
    model: MODELS[ a.model ],
    positivePrompt: a.prompt,
    width: Number( a.width ),
    height: Number( a.height ),
    outputType: 'base64Data',
    // PNG без артефактів JPEG на межі з зеленим тлом: хромакей ріже чистіше
    outputFormat: 'PNG',
    includeCost: true
  };
  if ( a.seed !== undefined ) task.seed = Number( a.seed );
  if ( a.steps !== undefined ) task.steps = Number( a.steps );
  if ( a.guidance !== undefined ) task.CFGScale = Number( a.guidance );
  const refs = [ a.ref, a.ref2 ].filter( Boolean ).map( ( p ) =>
  {
    const bytes = readRef( p );
    return `data:${ mimeOf( bytes ).mime };base64,${ bytes.toString( 'base64' ) }`;
  } );
  if ( refs.length ) task.inputs = { referenceImages: refs };

  const res = await post( 'https://api.runware.ai/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ runwareKey() }` },
    body: JSON.stringify( [ task ] )
  }, 'Runware' );
  const json = await res.json().catch( () => ( {} ) );
  const item = json.data?.find( ( d ) => d.taskUUID === task.taskUUID );
  if ( !res.ok || !item?.imageBase64Data ) fail( `Runware ${ res.status }: ${ JSON.stringify( json.errors ?? json.error ?? json ).slice( 0, 600 ) }` );
  return { bytes: Buffer.from( item.imageBase64Data, 'base64' ), cost: item.cost, seed: item.seed };
}

const result = a.provider === 'runware' ? await runware() : await cloudflare();
const bytes = result.bytes;

// Розширення ставимо за справжнім форматом: Cloudflare віддає JPEG, Runware — PNG
const { ext } = mimeOf( bytes );
const out = resolve( ROOT, a.out ).slice( 0, -extname( a.out ).length || undefined ) + ext;
mkdirSync( dirname( out ), { recursive: true } );
writeFileSync( out, bytes );

const log = resolve( ROOT, 'assets/prompts.md' );
if ( !existsSync( log ) ) writeFileSync( log, '# Журнал генерацій\n' );
const rel = ( p ) => relative( ROOT, resolve( ROOT, p ) ).replaceAll( '\\', '/' );
appendFileSync( log, [
  '',
  `## ${ rel( out ) }`,
  `- дата: ${ new Date().toLocaleString( 'sv-SE' ).slice( 0, 16 ) }`,
  `- модель: ${ a.provider } ${ a.model }, ${ a.width }x${ a.height }, seed ${ a.seed ?? result.seed ?? 'випадковий' }${ a.steps ? `, steps ${ a.steps }` : '' }${ a.guidance ? `, guidance ${ a.guidance }` : '' }${ result.cost !== undefined ? `, ціна $${ result.cost }` : '' }`,
  `- input_image_0: ${ a.ref ? rel( a.ref ) : '—' }`,
  `- input_image_1: ${ a.ref2 ? rel( a.ref2 ) : '—' }`,
  `- промпт: ${ a.prompt }`,
  ''
].join( '\n' ) );

console.log( rel( out ) + ( result.cost !== undefined ? ` ($${ result.cost })` : '' ) );
