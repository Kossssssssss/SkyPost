#!/usr/bin/env node
// Генерація музики й звуків на Runware (audioInference).
// node scripts/gen_audio.mjs --prompt "..." [--model runware:ace-step@v1.5-xl-base | mirelo:1@1] [--duration 90]
//                           [--steps 20] [--seed 11] [--bitrate 192] [--channels 2] --out assets/raw/music_s11.mp3
// Ключ Runware: RUNWARE_API_KEY, інакше ../image-mcp/runware_key.txt.
// Кожен запуск дописується в assets/prompts.md.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve( import.meta.dirname, '..' );
const MCP = resolve( ROOT, '..', 'image-mcp' );

const { values: a } = parseArgs( {
  options: {
    prompt: { type: 'string' },
    model: { type: 'string', default: 'runware:ace-step@v1.5-xl-base' },
    duration: { type: 'string', default: '90' },
    steps: { type: 'string' },
    seed: { type: 'string' },
    bitrate: { type: 'string', default: '192' },
    channels: { type: 'string', default: '2' },
    out: { type: 'string' }
  }
} );

function fail( msg )
{
  console.error( msg );
  process.exit( 1 );
}

if ( !a.prompt || !a.out ) fail( 'Потрібні --prompt і --out' );

function runwareKey()
{
  let key = process.env.RUNWARE_API_KEY?.trim();
  if ( !key && existsSync( join( MCP, 'runware_key.txt' ) ) ) key = readFileSync( join( MCP, 'runware_key.txt' ), 'utf8' ).trim();
  if ( !key ) fail( 'Немає ключа Runware: задайте RUNWARE_API_KEY або покладіть його в ../image-mcp/runware_key.txt' );
  return key;
}

const task = {
  taskType: 'audioInference',
  taskUUID: crypto.randomUUID(),
  model: a.model,
  positivePrompt: a.prompt,
  duration: Number( a.duration ),
  outputType: 'base64Data',
  outputFormat: 'MP3',
  audioSettings: { bitrate: Number( a.bitrate ), channels: Number( a.channels ), sampleRate: 44100 },
  includeCost: true
};
if ( a.steps !== undefined ) task.steps = Number( a.steps );
if ( a.seed !== undefined ) task.seed = Number( a.seed );

let res;
for ( let attempt = 1; ; attempt++ )
{
  res = await fetch( 'https://api.runware.ai/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ runwareKey() }` },
    body: JSON.stringify( [ task ] )
  } );
  if ( ( res.status < 500 && res.status !== 429 ) || attempt === 4 ) break;
  console.error( `Runware ${ res.status }, повтор ${ attempt }/3` );
  await new Promise( ( r ) => setTimeout( r, attempt * 4000 ) );
}
const json = await res.json().catch( () => ( {} ) );
const item = json.data?.find( ( d ) => d.taskUUID === task.taskUUID );
if ( !res.ok || !item?.audioBase64Data ) fail( `Runware ${ res.status }: ${ JSON.stringify( json.errors ?? json.error ?? json ).slice( 0, 800 ) }` );

const out = resolve( ROOT, a.out );
mkdirSync( dirname( out ), { recursive: true } );
writeFileSync( out, Buffer.from( item.audioBase64Data, 'base64' ) );

const rel = ( p ) => relative( ROOT, p ).replaceAll( '\\', '/' );
const log = resolve( ROOT, 'assets/prompts.md' );
appendFileSync( log, [
  '',
  `## ${ rel( out ) }`,
  `- дата: ${ new Date().toLocaleString( 'sv-SE' ).slice( 0, 16 ) }`,
  `- модель: runware ${ a.model }, ${ a.duration } с, seed ${ a.seed ?? item.seed ?? 'випадковий' }${ a.steps ? `, steps ${ a.steps }` : '' }${ item.cost !== undefined ? `, ціна $${ item.cost }` : '' }`,
  `- промпт: ${ a.prompt }`,
  ''
].join( '\n' ) );

console.log( rel( out ) + ( item.cost !== undefined ? ` ($${ item.cost })` : '' ) );
