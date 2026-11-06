import Phaser from 'phaser';
import { SKINS, type Skin } from './skins.ts';

// Текстури малюються на canvas у 2× роздільності, у грі показуються зі scale 0.5 — чітко на будь-якому DPI
export const RES = 2;

type Draw = ( g: CanvasRenderingContext2D, w: number, h: number ) => void;

function hex( c: number, a = 1 ): string
{
  const r = ( c >> 16 ) & 255;
  const g = ( c >> 8 ) & 255;
  const b = c & 255;
  return `rgba(${ r },${ g },${ b },${ a })`;
}

function shade( c: number, k: number ): number
{
  const f = ( v: number ) => Math.max( 0, Math.min( 255, Math.round( k > 0 ? v + ( 255 - v ) * k : v * ( 1 + k ) ) ) );
  return ( f( ( c >> 16 ) & 255 ) << 16 ) | ( f( ( c >> 8 ) & 255 ) << 8 ) | f( c & 255 );
}

export function canvasTex( scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw ): void
{
  if ( scene.textures.exists( key ) )
  {
    scene.textures.remove( key );
  }
  const tex = scene.textures.createCanvas( key, w, h );
  if ( !tex )
  {
    return;
  }
  const g = tex.context;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw( g, w, h );
  tex.refresh();
}

function roundRect( g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number ): void
{
  g.beginPath();
  g.roundRect( x, y, w, h, r );
}

function rng( seed: number ): () => number
{
  let s = seed >>> 0;
  return () =>
  {
    s = ( s * 1664525 + 1013904223 ) >>> 0;
    return s / 4294967296;
  };
}

// ---------- Куля ----------

export const ENV_TEX_W = 68;
export const ENV_TEX_H = 84;

function envelopePath( g: CanvasRenderingContext2D, cx: number, cy: number, R: number, mouthY: number, mouthW: number ): void
{
  g.beginPath();
  g.arc( cx, cy, R, Math.PI * 0.78, Math.PI * 2.22 );
  const ex = cx + Math.cos( Math.PI * 2.22 ) * R;
  const ey = cy + Math.sin( Math.PI * 2.22 ) * R;
  g.quadraticCurveTo( ex - R * 0.12, ey + R * 0.45, cx + mouthW, mouthY );
  g.lineTo( cx - mouthW, mouthY );
  g.quadraticCurveTo( cx - ( ex - cx ) + R * 0.12, ey + R * 0.45, cx - ( ex - cx ), ey );
  g.closePath();
}

function fillPattern( g: CanvasRenderingContext2D, s: Skin, cx: number, R: number, w: number, h: number ): void
{
  const c = s.colors;
  const gores = 8;
  const goreX = ( k: number ) => cx + Math.sin( -Math.PI / 2 + ( Math.PI * k ) / gores ) * R * 1.02;
  switch ( s.style )
  {
    case 'stripes':
      for ( let k = 0; k < gores; k++ )
      {
        g.fillStyle = hex( c[ k % 2 ] );
        g.fillRect( goreX( k ), 0, goreX( k + 1 ) - goreX( k ) + 0.5, h );
      }
      break;
    case 'gradient':
    {
      const lg = g.createLinearGradient( 0, 0, 0, h * 0.85 );
      c.forEach( ( col, i ) => lg.addColorStop( i / ( c.length - 1 ), hex( col ) ) );
      g.fillStyle = lg;
      g.fillRect( 0, 0, w, h );
      break;
    }
    case 'dots':
    {
      g.fillStyle = hex( c[ 0 ] );
      g.fillRect( 0, 0, w, h );
      g.fillStyle = hex( c[ 1 ] );
      for ( let y = 8; y < h; y += 22 )
      {
        for ( let x = ( ( y / 22 ) | 0 ) % 2 ? 4 : 15; x < w; x += 22 )
        {
          g.beginPath();
          g.arc( x, y, 6, 0, Math.PI * 2 );
          g.fill();
        }
      }
      break;
    }
    case 'checker':
    {
      for ( let k = 0; k < gores; k++ )
      {
        for ( let r = 0; r < 9; r++ )
        {
          g.fillStyle = hex( c[ ( k + r ) % 2 ] );
          g.fillRect( goreX( k ), r * 18, goreX( k + 1 ) - goreX( k ) + 0.5, 18.5 );
        }
      }
      break;
    }
    case 'patch':
    {
      const rand = rng( 7 );
      for ( let y = 0; y < h; y += 20 )
      {
        for ( let x = 0; x < w; x += 22 )
        {
          g.fillStyle = hex( c[ ( rand() * c.length ) | 0 ] );
          g.fillRect( x, y, 22.5, 20.5 );
        }
      }
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.setLineDash( [ 3, 3 ] );
      g.lineWidth = 1.5;
      for ( let y = 0; y < h; y += 20 )
      {
        g.beginPath();
        g.moveTo( 0, y );
        g.lineTo( w, y );
        g.stroke();
      }
      g.setLineDash( [] );
      break;
    }
    case 'bloom':
    {
      g.fillStyle = hex( c[ 0 ] );
      g.fillRect( 0, 0, w, h );
      const rand = rng( 3 );
      for ( let i = 0; i < 16; i++ )
      {
        const x = rand() * w;
        const y = rand() * h * 0.9;
        g.fillStyle = hex( c[ 1 ] );
        for ( let p = 0; p < 5; p++ )
        {
          const a = ( p / 5 ) * Math.PI * 2;
          g.beginPath();
          g.arc( x + Math.cos( a ) * 6, y + Math.sin( a ) * 6, 5, 0, Math.PI * 2 );
          g.fill();
        }
        g.fillStyle = hex( c[ 2 ] );
        g.beginPath();
        g.arc( x, y, 4, 0, Math.PI * 2 );
        g.fill();
      }
      break;
    }
    case 'rings':
      for ( let r = 0; r < 8; r++ )
      {
        g.fillStyle = hex( c[ r % 2 ] );
        g.fillRect( 0, r * 22, w, 22.5 );
      }
      break;
    case 'aurora':
    {
      g.fillStyle = hex( c[ 0 ] );
      g.fillRect( 0, 0, w, h );
      for ( let b = 0; b < 3; b++ )
      {
        g.strokeStyle = hex( c[ 1 + ( b % 2 ) ], 0.75 );
        g.lineWidth = 12;
        g.beginPath();
        for ( let x = 0; x <= w; x += 4 )
        {
          const y = 34 + b * 34 + Math.sin( x / 14 + b ) * 9;
          if ( x === 0 )
          {
            g.moveTo( x, y );
          }
          else
          {
            g.lineTo( x, y );
          }
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.9)';
      const rand = rng( 11 );
      for ( let i = 0; i < 20; i++ )
      {
        g.fillRect( rand() * w, rand() * h, 2, 2 );
      }
      break;
    }
    default:
      g.fillStyle = hex( c[ 0 ] ?? 0xff0000 );
      g.fillRect( 0, 0, w, h );
  }
}

export function makeEnvelope( scene: Phaser.Scene, s: Skin ): string
{
  const key = 'env:' + s.id;
  const w = ENV_TEX_W * RES;
  const h = ENV_TEX_H * RES;
  canvasTex( scene, key, w, h, ( g ) =>
  {
    const cx = w / 2;
    const cy = 64;
    const R = 63;
    const mouthY = 144;
    const mouthW = 14;
    // Стропи до кутів кошика
    g.strokeStyle = '#5a3a22';
    g.lineWidth = 2.5;
    for ( const sx of [ -1, 1 ] )
    {
      g.beginPath();
      g.moveTo( cx + sx * mouthW, mouthY - 2 );
      g.lineTo( cx + sx * 24, h - 1 );
      g.stroke();
    }
    g.save();
    envelopePath( g, cx, cy, R, mouthY, mouthW );
    g.clip();
    fillPattern( g, s, cx, R, w, h );
    const rg = g.createRadialGradient( cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R * 1.25 );
    rg.addColorStop( 0, 'rgba(255,255,255,.45)' );
    rg.addColorStop( 0.45, 'rgba(255,255,255,0)' );
    rg.addColorStop( 1, 'rgba(0,0,20,.38)' );
    g.fillStyle = rg;
    g.fillRect( 0, 0, w, h );
    g.restore();
    envelopePath( g, cx, cy, R, mouthY, mouthW );
    g.strokeStyle = 'rgba(40,20,30,.55)';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#5a3a22';
    roundRect( g, cx - mouthW - 2, mouthY - 6, ( mouthW + 2 ) * 2, 8, 3 );
    g.fill();
  } );
  return key;
}

export function makeBasket( scene: Phaser.Scene, s: Skin ): string
{
  const key = 'bas:' + s.id;
  const w = 30 * RES;
  const h = 20 * RES;
  canvasTex( scene, key, w, h, ( g ) =>
  {
    const [ c0, c1 ] = s.colors;
    g.save();
    roundRect( g, 4, 6, w - 8, h - 7, 6 );
    g.clip();
    g.fillStyle = hex( c0 );
    g.fillRect( 0, 0, w, h );
    g.strokeStyle = hex( c1, 0.7 );
    g.lineWidth = 2;
    for ( let x = -h; x < w; x += 7 )
    {
      g.beginPath();
      g.moveTo( x, 6 );
      g.lineTo( x + h, h );
      g.stroke();
      g.beginPath();
      g.moveTo( x + h, 6 );
      g.lineTo( x, h );
      g.stroke();
    }
    const lg = g.createLinearGradient( 0, 0, w, 0 );
    lg.addColorStop( 0, 'rgba(0,0,0,.25)' );
    lg.addColorStop( 0.4, 'rgba(255,255,255,.15)' );
    lg.addColorStop( 1, 'rgba(0,0,0,.3)' );
    g.fillStyle = lg;
    g.fillRect( 0, 0, w, h );
    g.restore();
    g.fillStyle = hex( shade( c1, -0.2 ) );
    roundRect( g, 0, 2, w, 9, 4 );
    g.fill();
    g.fillStyle = hex( shade( c0, 0.3 ), 0.8 );
    roundRect( g, 3, 3, w - 6, 3, 2 );
    g.fill();
  } );
  return key;
}

export function makePilot( scene: Phaser.Scene, s: Skin ): string
{
  const key = 'plt:' + s.id;
  const w = 26 * RES;
  const h = 26 * RES;
  canvasTex( scene, key, w, h, ( g ) =>
  {
    const cx = w / 2;
    const cy = 30;
    const circle = ( x: number, y: number, r: number, col: string ) =>
    {
      g.fillStyle = col;
      g.beginPath();
      g.arc( x, y, r, 0, Math.PI * 2 );
      g.fill();
    };
    const tri = ( pts: number[], col: string ) =>
    {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo( pts[ 0 ], pts[ 1 ] );
      for ( let i = 2; i < pts.length; i += 2 )
      {
        g.lineTo( pts[ i ], pts[ i + 1 ] );
      }
      g.closePath();
      g.fill();
    };
    const eyes = ( dy = 0, r = 3 ) =>
    {
      circle( cx - 8, cy - 2 + dy, r, '#1d1420' );
      circle( cx + 8, cy - 2 + dy, r, '#1d1420' );
      circle( cx - 7, cy - 3 + dy, r * 0.35, '#fff' );
      circle( cx + 9, cy - 3 + dy, r * 0.35, '#fff' );
    };
    // Шарф пілота — спільна деталь, щоб усі персонажі читались як «поштарі»
    const scarf = () =>
    {
      g.fillStyle = '#e8443a';
      roundRect( g, cx - 15, cy + 13, 30, 8, 4 );
      g.fill();
      g.fillRect( cx + 6, cy + 16, 7, 12 );
    };
    switch ( s.id )
    {
      case 'plt-cat':
        tri( [ cx - 17, cy - 4, cx - 13, cy - 24, cx - 3, cy - 14 ], '#8a8ea0' );
        tri( [ cx + 17, cy - 4, cx + 13, cy - 24, cx + 3, cy - 14 ], '#8a8ea0' );
        circle( cx, cy, 17, '#9aa0b4' );
        circle( cx, cy + 7, 8, '#e8eaf0' );
        eyes( 0, 3.5 );
        circle( cx, cy + 4, 2.5, '#ff7a9a' );
        scarf();
        break;
      case 'plt-owl':
        tri( [ cx - 15, cy - 10, cx - 15, cy - 26, cx - 5, cy - 15 ], '#8a5a32' );
        tri( [ cx + 15, cy - 10, cx + 15, cy - 26, cx + 5, cy - 15 ], '#8a5a32' );
        circle( cx, cy, 18, '#a66e3e' );
        circle( cx - 8, cy - 2, 8, '#f6e6c8' );
        circle( cx + 8, cy - 2, 8, '#f6e6c8' );
        eyes( 0, 4.5 );
        tri( [ cx - 3, cy + 5, cx + 3, cy + 5, cx, cy + 11 ], '#f0a020' );
        scarf();
        break;
      case 'plt-frog':
        circle( cx - 9, cy - 12, 8, '#5cc05a' );
        circle( cx + 9, cy - 12, 8, '#5cc05a' );
        circle( cx, cy + 2, 17, '#5cc05a' );
        circle( cx - 9, cy - 13, 5, '#fff' );
        circle( cx + 9, cy - 13, 5, '#fff' );
        circle( cx - 9, cy - 12, 3, '#1d1420' );
        circle( cx + 9, cy - 12, 3, '#1d1420' );
        g.strokeStyle = '#2a6a2a';
        g.lineWidth = 2;
        g.beginPath();
        g.arc( cx, cy + 4, 8, 0.2, Math.PI - 0.2 );
        g.stroke();
        scarf();
        break;
      default:
        tri( [ cx - 17, cy - 2, cx - 14, cy - 25, cx - 2, cy - 14 ], '#e07020' );
        tri( [ cx + 17, cy - 2, cx + 14, cy - 25, cx + 2, cy - 14 ], '#e07020' );
        tri( [ cx - 13, cy - 7, cx - 12, cy - 19, cx - 6, cy - 13 ], '#3a2018' );
        tri( [ cx + 13, cy - 7, cx + 12, cy - 19, cx + 6, cy - 13 ], '#3a2018' );
        circle( cx, cy, 17, '#f08030' );
        tri( [ cx - 15, cy + 2, cx + 15, cy + 2, cx, cy + 15 ], '#fff4e8' );
        eyes( -1, 3.2 );
        circle( cx, cy + 9, 2.8, '#1d1420' );
        scarf();
    }
    // Льотні окуляри на лобі
    g.fillStyle = '#6a4a2a';
    g.fillRect( cx - 16, cy - 12, 32, 4 );
    circle( cx - 7, cy - 10, 5, '#a8e0ff' );
    circle( cx + 7, cy - 10, 5, '#a8e0ff' );
  } );
  return key;
}

export function makeSkins( scene: Phaser.Scene ): void
{
  for ( const s of SKINS )
  {
    if ( s.slot === 'envelope' )
    {
      makeEnvelope( scene, s );
    }
    else if ( s.slot === 'basket' )
    {
      makeBasket( scene, s );
    }
    else if ( s.slot === 'pilot' )
    {
      makePilot( scene, s );
    }
  }
}

// ---------- Дрібні текстури ----------

function star5( g: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number ): void
{
  g.beginPath();
  for ( let i = 0; i < 10; i++ )
  {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + ( i * Math.PI ) / 5;
    const x = cx + Math.cos( a ) * r;
    const y = cy + Math.sin( a ) * r;
    if ( i === 0 )
    {
      g.moveTo( x, y );
    }
    else
    {
      g.lineTo( x, y );
    }
  }
  g.closePath();
}

export function makeCommon( scene: Phaser.Scene ): void
{
  canvasTex( scene, 'px', 4, 4, ( g ) =>
  {
    g.fillStyle = '#fff';
    g.fillRect( 0, 0, 4, 4 );
  } );

  canvasTex( scene, 'soft', 64, 64, ( g ) =>
  {
    const rg = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
    rg.addColorStop( 0, 'rgba(255,255,255,1)' );
    rg.addColorStop( 0.5, 'rgba(255,255,255,.6)' );
    rg.addColorStop( 1, 'rgba(255,255,255,0)' );
    g.fillStyle = rg;
    g.fillRect( 0, 0, 64, 64 );
  } );

  canvasTex( scene, 'dot', 32, 32, ( g ) =>
  {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc( 16, 16, 15, 0, Math.PI * 2 );
    g.fill();
  } );

  canvasTex( scene, 'spark', 32, 32, ( g ) =>
  {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo( 16, 0 );
    g.quadraticCurveTo( 18, 14, 32, 16 );
    g.quadraticCurveTo( 18, 18, 16, 32 );
    g.quadraticCurveTo( 14, 18, 0, 16 );
    g.quadraticCurveTo( 14, 14, 16, 0 );
    g.fill();
  } );

  canvasTex( scene, 'heart', 32, 32, ( g ) =>
  {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo( 16, 29 );
    g.bezierCurveTo( 0, 18, 2, 3, 16, 10 );
    g.bezierCurveTo( 30, 3, 32, 18, 16, 29 );
    g.fill();
  } );

  canvasTex( scene, 'streak', 64, 6, ( g ) =>
  {
    const lg = g.createLinearGradient( 0, 0, 64, 0 );
    lg.addColorStop( 0, 'rgba(255,255,255,0)' );
    lg.addColorStop( 0.7, 'rgba(255,255,255,.9)' );
    lg.addColorStop( 1, 'rgba(255,255,255,0)' );
    g.fillStyle = lg;
    roundRect( g, 0, 1, 64, 4, 2 );
    g.fill();
  } );

  for ( let v = 0; v < 3; v++ )
  {
    canvasTex( scene, 'cloud' + v, 220, 110, ( g ) =>
    {
      const rand = rng( 20 + v * 13 );
      const puffs: number[][] = [];
      for ( let i = 0; i < 7; i++ )
      {
        const x = 40 + rand() * 140;
        const r = 22 + rand() * 22;
        puffs.push( [ x, 80 - r * 0.7 - rand() * 14, r ] );
      }
      g.fillStyle = 'rgba(205,220,240,1)';
      for ( const [ x, y, r ] of puffs )
      {
        g.beginPath();
        g.arc( x, y + 6, r, 0, Math.PI * 2 );
        g.fill();
      }
      g.fillStyle = '#fff';
      for ( const [ x, y, r ] of puffs )
      {
        g.beginPath();
        g.arc( x, y, r, 0, Math.PI * 2 );
        g.fill();
      }
      g.fillRect( 40, 70, 140, 12 );
    } );
  }

  canvasTex( scene, 'star', 64, 64, ( g ) =>
  {
    star5( g, 32, 34, 30, 13 );
    g.fillStyle = '#ffd23a';
    g.fill();
    g.strokeStyle = '#c47a10';
    g.lineWidth = 4;
    g.stroke();
    star5( g, 28, 28, 12, 5 );
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fill();
  } );

  canvasTex( scene, 'starEmpty', 64, 64, ( g ) =>
  {
    star5( g, 32, 34, 30, 13 );
    g.fillStyle = 'rgba(30,40,70,.35)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.6)';
    g.lineWidth = 4;
    g.stroke();
  } );

  canvasTex( scene, 'stamp', 48 * RES / 2, 56 * RES / 2, ( g, w, h ) =>
  {
    g.fillStyle = '#fffaf0';
    g.fillRect( 3, 3, w - 6, h - 6 );
    g.fillStyle = 'rgba(0,0,0,0)';
    g.globalCompositeOperation = 'destination-out';
    for ( let x = 3; x <= w - 3; x += 7 )
    {
      g.beginPath();
      g.arc( x, 3, 3, 0, Math.PI * 2 );
      g.arc( x, h - 3, 3, 0, Math.PI * 2 );
      g.fill();
    }
    for ( let y = 3; y <= h - 3; y += 7 )
    {
      g.beginPath();
      g.arc( 3, y, 3, 0, Math.PI * 2 );
      g.arc( w - 3, y, 3, 0, Math.PI * 2 );
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#4aa8e8';
    g.fillRect( 9, 9, w - 18, h - 18 );
    g.fillStyle = '#e8443a';
    g.beginPath();
    g.arc( w / 2, h / 2 - 5, 11, 0, Math.PI * 2 );
    g.fill();
    g.fillStyle = '#a8723a';
    g.fillRect( w / 2 - 5, h / 2 + 10, 10, 6 );
    g.strokeStyle = '#5a3a22';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo( w / 2 - 7, h / 2 + 2 );
    g.lineTo( w / 2 - 4, h / 2 + 10 );
    g.moveTo( w / 2 + 7, h / 2 + 2 );
    g.lineTo( w / 2 + 4, h / 2 + 10 );
    g.stroke();
  } );

  canvasTex( scene, 'mailbox', 48 * RES, 64 * RES, ( g, w, h ) =>
  {
    const s = RES;
    g.fillStyle = '#7a5232';
    g.fillRect( w / 2 - 3 * s, 26 * s, 6 * s, h - 26 * s );
    g.fillStyle = '#3a6ee8';
    roundRect( g, w / 2 - 15 * s, 8 * s, 30 * s, 20 * s, 9 * s );
    g.fill();
    g.fillStyle = '#2a4ea8';
    g.fillRect( w / 2 - 15 * s, 20 * s, 30 * s, 8 * s );
    g.fillStyle = '#1d2a50';
    roundRect( g, w / 2 - 9 * s, 14 * s, 18 * s, 3 * s, 1.5 * s );
    g.fill();
    g.fillStyle = '#7a5232';
    g.fillRect( w / 2 + 13 * s, 2 * s, 2.5 * s, 18 * s );
    g.fillStyle = '#e8443a';
    g.fillRect( w / 2 + 15 * s, 2 * s, 10 * s, 7 * s );
  } );

  canvasTex( scene, 'mailboxDone', 48 * RES, 64 * RES, ( g, w, h ) =>
  {
    const s = RES;
    g.fillStyle = '#7a5232';
    g.fillRect( w / 2 - 3 * s, 26 * s, 6 * s, h - 26 * s );
    g.fillStyle = '#3fb56a';
    roundRect( g, w / 2 - 15 * s, 8 * s, 30 * s, 20 * s, 9 * s );
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo( w / 2 - 6 * s, 17 * s );
    g.lineTo( w / 2 - 1 * s, 22 * s );
    g.lineTo( w / 2 + 8 * s, 12 * s );
    g.stroke();
  } );

  canvasTex( scene, 'letter', 40, 28, ( g, w, h ) =>
  {
    g.fillStyle = '#fffaf0';
    roundRect( g, 1, 1, w - 2, h - 2, 4 );
    g.fill();
    g.strokeStyle = '#c4a070';
    g.lineWidth = 2;
    g.stroke();
    g.beginPath();
    g.moveTo( 2, 3 );
    g.lineTo( w / 2, h * 0.6 );
    g.lineTo( w - 2, 3 );
    g.stroke();
    g.fillStyle = '#e8443a';
    g.beginPath();
    g.arc( w / 2, h * 0.6, 4, 0, Math.PI * 2 );
    g.fill();
  } );

  canvasTex( scene, 'flame', 24, 40, ( g, w, h ) =>
  {
    const lg = g.createLinearGradient( 0, h, 0, 0 );
    lg.addColorStop( 0, 'rgba(255,240,140,1)' );
    lg.addColorStop( 0.5, 'rgba(255,150,40,.95)' );
    lg.addColorStop( 1, 'rgba(255,60,20,0)' );
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo( w / 2, 0 );
    g.quadraticCurveTo( w, h * 0.6, w / 2, h );
    g.quadraticCurveTo( 0, h * 0.6, w / 2, 0 );
    g.fill();
  } );

  canvasTex( scene, 'gas', 32, 32, ( g ) =>
  {
    g.fillStyle = '#ff8a2a';
    g.beginPath();
    g.moveTo( 16, 2 );
    g.quadraticCurveTo( 30, 16, 26, 22 );
    g.quadraticCurveTo( 22, 31, 16, 31 );
    g.quadraticCurveTo( 10, 31, 6, 22 );
    g.quadraticCurveTo( 2, 16, 16, 2 );
    g.fill();
    g.fillStyle = '#ffe07a';
    g.beginPath();
    g.moveTo( 16, 14 );
    g.quadraticCurveTo( 23, 22, 20, 26 );
    g.quadraticCurveTo( 16, 30, 12, 26 );
    g.quadraticCurveTo( 9, 22, 16, 14 );
    g.fill();
  } );

  for ( const [ key, body, wing ] of [ [ 'bird', '#3a3048', '#5a4a6a' ], [ 'gull', '#f4f4f8', '#b8c0d0' ] ] )
  {
    for ( let f = 0; f < 2; f++ )
    {
      canvasTex( scene, key + f, 56, 40, ( g ) =>
      {
        g.fillStyle = wing;
        g.beginPath();
        if ( f === 0 )
        {
          g.moveTo( 22, 20 );
          g.quadraticCurveTo( 14, 0, 2, 4 );
          g.quadraticCurveTo( 12, 14, 18, 24 );
          g.moveTo( 32, 20 );
          g.quadraticCurveTo( 40, 0, 52, 4 );
          g.quadraticCurveTo( 42, 14, 36, 24 );
        }
        else
        {
          g.moveTo( 22, 22 );
          g.quadraticCurveTo( 12, 36, 2, 36 );
          g.quadraticCurveTo( 12, 24, 18, 20 );
          g.moveTo( 32, 22 );
          g.quadraticCurveTo( 42, 36, 52, 36 );
          g.quadraticCurveTo( 42, 24, 36, 20 );
        }
        g.fill();
        g.fillStyle = body;
        g.beginPath();
        g.ellipse( 27, 22, 12, 8, 0, 0, Math.PI * 2 );
        g.fill();
        g.beginPath();
        g.arc( 38, 18, 6, 0, Math.PI * 2 );
        g.fill();
        g.fillStyle = '#f0a020';
        g.beginPath();
        g.moveTo( 43, 16 );
        g.lineTo( 51, 19 );
        g.lineTo( 43, 21 );
        g.fill();
        g.fillStyle = key === 'gull' ? '#1d1420' : '#fff';
        g.beginPath();
        g.arc( 39, 16, 1.8, 0, Math.PI * 2 );
        g.fill();
      } );
    }
  }

  canvasTex( scene, 'spike', 64, 64, ( g ) =>
  {
    g.fillStyle = '#4a4258';
    star5( g, 32, 32, 31, 16 );
    g.fill();
    g.fillStyle = '#6a6080';
    g.beginPath();
    g.arc( 32, 32, 15, 0, Math.PI * 2 );
    g.fill();
    g.fillStyle = '#ff5a4a';
    g.beginPath();
    g.arc( 32, 32, 5, 0, Math.PI * 2 );
    g.fill();
  } );

  canvasTex( scene, 'office', 120 * RES, 100 * RES, ( g, w, h ) =>
  {
    const s = RES;
    g.fillStyle = '#f2e2c4';
    g.fillRect( 10 * s, 40 * s, 100 * s, 60 * s );
    g.fillStyle = '#c84a3a';
    g.beginPath();
    g.moveTo( 0, 44 * s );
    g.lineTo( 60 * s, 6 * s );
    g.lineTo( w, 44 * s );
    g.closePath();
    g.fill();
    g.fillStyle = '#7a5232';
    g.fillRect( 50 * s, 64 * s, 20 * s, 36 * s );
    g.fillStyle = '#9ad0f0';
    g.fillRect( 20 * s, 56 * s, 20 * s, 16 * s );
    g.fillRect( 80 * s, 56 * s, 20 * s, 16 * s );
    g.fillStyle = '#ffd23a';
    roundRect( g, 38 * s, 26 * s, 44 * s, 14 * s, 4 * s );
    g.fill();
    g.fillStyle = '#c84a3a';
    g.font = `bold ${ 10 * s }px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText( 'POST', 60 * s, 33.5 * s );
    void h;
  } );

  canvasTex( scene, 'tv', 40, 32, ( g ) =>
  {
    g.fillStyle = '#fff';
    roundRect( g, 2, 6, 36, 24, 5 );
    g.fill();
    g.fillStyle = '#3a6ee8';
    g.beginPath();
    g.moveTo( 16, 12 );
    g.lineTo( 26, 18 );
    g.lineTo( 16, 24 );
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo( 12, 1 );
    g.lineTo( 20, 6 );
    g.lineTo( 28, 1 );
    g.stroke();
  } );

  canvasTex( scene, 'lock', 40, 48, ( g ) =>
  {
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc( 20, 20, 11, Math.PI, 0 );
    g.stroke();
    g.fillStyle = '#fff';
    roundRect( g, 4, 20, 32, 26, 6 );
    g.fill();
    g.fillStyle = '#6a7090';
    g.beginPath();
    g.arc( 20, 31, 4, 0, Math.PI * 2 );
    g.fill();
  } );

  makeIcons( scene );
}

function makeIcons( scene: Phaser.Scene ): void
{
  const icon = ( key: string, draw: ( g: CanvasRenderingContext2D ) => void ) =>
  {
    canvasTex( scene, key, 48, 48, ( g ) =>
    {
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      draw( g );
    } );
  };
  icon( 'i-pause', ( g ) =>
  {
    roundRect( g, 13, 11, 8, 26, 2 );
    g.fill();
    roundRect( g, 27, 11, 8, 26, 2 );
    g.fill();
  } );
  icon( 'i-play', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 16, 10 );
    g.lineTo( 37, 24 );
    g.lineTo( 16, 38 );
    g.closePath();
    g.fill();
  } );
  icon( 'i-retry', ( g ) =>
  {
    g.beginPath();
    g.arc( 24, 25, 12, -Math.PI * 0.3, Math.PI * 1.4 );
    g.stroke();
    g.beginPath();
    g.moveTo( 30, 6 );
    g.lineTo( 38, 16 );
    g.lineTo( 26, 18 );
    g.closePath();
    g.fill();
  } );
  icon( 'i-map', ( g ) =>
  {
    for ( let i = 0; i < 3; i++ )
    {
      roundRect( g, 9, 11 + i * 10, 30, 6, 3 );
      g.fill();
    }
  } );
  icon( 'i-next', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 12, 10 );
    g.lineTo( 28, 24 );
    g.lineTo( 12, 38 );
    g.closePath();
    g.fill();
    roundRect( g, 30, 10, 6, 28, 2 );
    g.fill();
  } );
  icon( 'i-back', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 30, 10 );
    g.lineTo( 16, 24 );
    g.lineTo( 30, 38 );
    g.stroke();
  } );
  icon( 'i-fwd', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 18, 10 );
    g.lineTo( 32, 24 );
    g.lineTo( 18, 38 );
    g.stroke();
  } );
  icon( 'i-sound', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 8, 18 );
    g.lineTo( 16, 18 );
    g.lineTo( 26, 9 );
    g.lineTo( 26, 39 );
    g.lineTo( 16, 30 );
    g.lineTo( 8, 30 );
    g.closePath();
    g.fill();
    g.lineWidth = 4;
    g.beginPath();
    g.arc( 26, 24, 9, -0.9, 0.9 );
    g.stroke();
    g.beginPath();
    g.arc( 26, 24, 16, -0.8, 0.8 );
    g.stroke();
  } );
  icon( 'i-mute', ( g ) =>
  {
    g.beginPath();
    g.moveTo( 6, 18 );
    g.lineTo( 14, 18 );
    g.lineTo( 24, 9 );
    g.lineTo( 24, 39 );
    g.lineTo( 14, 30 );
    g.lineTo( 6, 30 );
    g.closePath();
    g.fill();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo( 30, 18 );
    g.lineTo( 42, 30 );
    g.moveTo( 42, 18 );
    g.lineTo( 30, 30 );
    g.stroke();
  } );
  icon( 'i-music', ( g ) =>
  {
    g.beginPath();
    g.arc( 15, 34, 6, 0, Math.PI * 2 );
    g.arc( 33, 30, 6, 0, Math.PI * 2 );
    g.fill();
    g.fillRect( 18, 10, 4, 24 );
    g.fillRect( 36, 6, 4, 24 );
    g.beginPath();
    g.moveTo( 18, 10 );
    g.lineTo( 40, 5 );
    g.lineTo( 40, 12 );
    g.lineTo( 18, 17 );
    g.closePath();
    g.fill();
  } );
  icon( 'i-shop', ( g ) =>
  {
    roundRect( g, 9, 18, 30, 22, 4 );
    g.fill();
    g.lineWidth = 4;
    g.beginPath();
    g.arc( 24, 18, 8, Math.PI, 0 );
    g.stroke();
  } );
  icon( 'i-route', ( g ) =>
  {
    g.setLineDash( [ 5, 5 ] );
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo( 6, 38 );
    g.bezierCurveTo( 14, 4, 30, 44, 40, 10 );
    g.stroke();
    g.setLineDash( [] );
    g.beginPath();
    g.arc( 40, 10, 5, 0, Math.PI * 2 );
    g.fill();
  } );
}
