import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Редактор рівнів у dev-режимі зберігає JSON прямо в src/levels, щоб не копіювати руками
function levelSaver(): Plugin
{
  return {
    name: 'level-saver',
    apply: 'serve',
    configureServer( server )
    {
      server.middlewares.use( '/__save-level', ( req, res ) =>
      {
        const file = new URL( req.url ?? '', 'http://x' ).searchParams.get( 'file' ) ?? '';
        if ( req.method !== 'POST' || !/^world\d+$/.test( file ) )
        {
          res.statusCode = 400;
          res.end( 'bad request' );
          return;
        }
        let body = '';
        req.on( 'data', ( c ) => { body += c; } );
        req.on( 'end', () =>
        {
          JSON.parse( body );
          writeFileSync( resolve( import.meta.dirname, 'src/levels', file + '.json' ), body );
          res.end( 'ok' );
        } );
      } );
      // Знімки канви для перевірки верстки на різних розмірах без видимого вікна браузера
      server.middlewares.use( '/__save-shot', ( req, res ) =>
      {
        const name = new URL( req.url ?? '', 'http://x' ).searchParams.get( 'name' ) ?? '';
        if ( req.method !== 'POST' || !/^[\w-]+$/.test( name ) )
        {
          res.statusCode = 400;
          res.end( 'bad request' );
          return;
        }
        let body = '';
        req.on( 'data', ( c ) => { body += c; } );
        req.on( 'end', () =>
        {
          const dir = resolve( import.meta.dirname, '.shots' );
          mkdirSync( dir, { recursive: true } );
          writeFileSync( resolve( dir, name + '.jpg' ), Buffer.from( body.replace( /^data:image\/\w+;base64,/, '' ), 'base64' ) );
          res.end( 'ok' );
        } );
      } );
      // Очищені в браузері ассети пакетів пишемо в public, щоб гра брала вже готові PNG
      server.middlewares.use( '/__save-asset', ( req, res ) =>
      {
        const path = new URL( req.url ?? '', 'http://x' ).searchParams.get( 'path' ) ?? '';
        if ( req.method !== 'POST' || !/^packs\/[\w-]+\/[\w-]+\.png$/.test( path ) )
        {
          res.statusCode = 400;
          res.end( 'bad request' );
          return;
        }
        const chunks: Buffer[] = [];
        req.on( 'data', ( c: Buffer ) => chunks.push( c ) );
        req.on( 'end', () =>
        {
          const file = resolve( import.meta.dirname, 'public/assets', path );
          mkdirSync( dirname( file ), { recursive: true } );
          writeFileSync( file, Buffer.concat( chunks ) );
          res.end( 'ok' );
        } );
      } );
    }
  };
}

export default defineConfig( {
  base: './',
  plugins: [ levelSaver() ],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000
  },
  server: { port: 5180 }
} );
