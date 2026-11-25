import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene.ts';
import type { LevelData } from '../core/level.ts';
import { findLevel } from '../levels/index.ts';
import { createState, cloneState, step, type SimState } from '../core/sim.ts';
import { SUB } from '../core/solver.ts';
import { audio } from '../core/audio.ts';
import { currentLang, setLang } from '../core/i18n.ts';
import { save } from '../core/save.ts';

// Відео-прев'ю для порталу (лише dev): гра летить маршрутом розв'язувача, кадри знімаються покадрово
// з фіксованим кроком 1/60 с і кодуються WebCodecs у MP4. Від швидкості браузера чи прихованої вкладки
// результат не залежить: час гри рахуємо самі, а не беремо з requestAnimationFrame.
// Запуск у консолі: video.record( 1920, 1080 ) — файл ляже в art/video-1920x1080.mp4.
// Кадр для вибору моменту: video.peek( '2-8', 60 ) → .shots/peek.jpg

export interface Shot
{
  level: string;
  // Секунда польоту, з якої знімаємо; від'ємна — стільки секунд до кінця маршруту
  from: number;
  dur: number;
  // Блискавка за стільки секунд від початку кадру (тема «Гроза»)
  bolt?: number;
}

// Луг: зліт; море: посадка на другу скриньку; гроза: марка й блискавка; ніч: марка під місяцем;
// фінал: доставка біля маяка й перші ★★★ з конфеті. Разом з обкладинкою ≈ 19.9 с
export const SHOTS: Shot[] = [
  { level: '1-4', from: 0.5, dur: 3.3 },
  { level: '2-8', from: 60.4, dur: 3.3 },
  { level: '4-6', from: 18.4, dur: 3.3, bolt: 1.2 },
  { level: '5-3', from: 17.6, dur: 3.3 },
  { level: '2-5', from: -2.6, dur: 6 }
];

const FPS = 60;
const STEP_MS = 1000 / FPS;
const COVER = 0.7;
const FADE = 0.35;

// Рішення «гріти / не гріти» відновлюємо з записаного маршруту: симуляція детермінована,
// тож на кожному відрізку з двох варіантів підходить той, що веде в наступну точку hint
export function hintActions( lvl: LevelData ): number[] | null
{
  const h = lvl.hint;
  if ( !h )
  {
    return null;
  }
  const n = h.length / 2 - 1;
  const acts: number[] = [];
  const go = ( s: SimState, k: number ): boolean =>
  {
    if ( k === n )
    {
      return true;
    }
    for ( const a of [ 0, 1 ] )
    {
      const s2 = cloneState( s );
      for ( let i = 0; i < SUB && !s2.won; i++ )
      {
        step( lvl, s2, a === 1 );
      }
      if ( !s2.dead && Math.round( s2.x ) === h[ 2 * k + 2 ] && Math.round( s2.y ) === h[ 2 * k + 3 ] )
      {
        acts[ k ] = a;
        if ( go( s2, k + 1 ) )
        {
          return true;
        }
      }
    }
    return false;
  };
  return go( createState( lvl ), 0 ) ? acts : null;
}

class Rig
{
  private game: Phaser.Game;
  private now = 0;
  status = 'idle';

  // Анімації Phaser (tween) рахують час через Date.now(), а не з кроку гри, тож на час зйомки годинник віртуальний:
  // +1/60 с на кадр. Після зйомки він іде далі від того ж моменту, щоб час не стрибнув назад
  private virt = 0;
  private manual = false;
  private offset = 0;
  private realNow = Date.now.bind( Date );

  constructor( game: Phaser.Game )
  {
    this.game = game;
    Date.now = () => this.manual ? this.virt : this.realNow() + this.offset;
  }

  private get gs(): GameScene
  {
    return this.game.scene.getScene( 'game' ) as GameScene;
  }

  private tick( render = true ): void
  {
    this.now += STEP_MS;
    this.virt += STEP_MS;
    if ( render )
    {
      this.game.step( this.now, STEP_MS );
    }
    else
    {
      this.game.headlessStep( this.now, STEP_MS );
    }
  }

  private lang = currentLang();

  // Ролик для порталу — англійською, без звуку
  private takeOver(): void
  {
    this.game.loop.stop();
    this.now = this.game.loop.now;
    this.virt = Date.now();
    this.manual = true;
    audio.setAdMuted( true );
    this.lang = currentLang();
    setLang( 'en' );
  }

  private release(): void
  {
    setLang( this.lang );
    audio.setAdMuted( false );
    this.offset = this.virt - this.realNow();
    this.manual = false;
    this.game.loop.start( this.game.step.bind( this.game ) as FrameRequestCallback );
  }

  // Рівень з автопілотом, прокручений без рендеру до потрібної секунди польоту
  private setup( shot: Shot ): number
  {
    const lvl = findLevel( shot.level )?.level;
    const acts = lvl && hintActions( lvl );
    if ( !lvl || !acts )
    {
      throw new Error( 'немає маршруту для ' + shot.level );
    }
    // Підказки механік не закривають кадр; рівень ще не пройдено, тож у кінці — перші ★★★ з конфеті, без реклами
    const sv = save();
    if ( lvl.tip && !sv.seenTips.includes( lvl.tip ) )
    {
      sv.seenTips.push( lvl.tip );
    }
    delete sv.levels[ shot.level ];
    delete sv.fails[ shot.level ];
    sv.levelsSinceAd = 0;
    const total = acts.length * SUB / FPS;
    const from = shot.from < 0 ? total + shot.from : shot.from;
    if ( this.gs.sys.isActive() )
    {
      this.gs.scene.restart( { levelId: shot.level } );
    }
    else
    {
      // Гра на мапі чи в магазині: рівень запускаємо звідти, як це робить сама мапа
      const from = [ 'map', 'shop' ].map( ( k ) => this.game.scene.getScene( k ) ).find( ( sc ) => sc?.sys.isActive() );
      ( from ?? this.gs ).scene.start( 'game', { levelId: shot.level } );
    }
    for ( let i = 0; i < 600 && !( this.gs.sys.isActive() && this.gs.lvl?.id === shot.level && this.gs.phase === 'intro' && this.gs.s?.t === 0 ); i++ )
    {
      this.tick( false );
    }
    // UI збирає картку рівня на кадр пізніше за гру: стартуємо, коли вона вже є, інакше вона лишиться в кадрі
    for ( let i = 0; i < 10; i++ )
    {
      this.tick( false );
    }
    const gs = this.gs;
    gs.autopilot = acts.flatMap( ( a ) => new Array( SUB ).fill( a ) );
    gs.press();
    // Останні 1.5 с з рендером: камера оновлює worldView лише в рендері, а дощ і світлячки з'являються навколо нього
    while ( gs.s.t < from && !gs.s.won && !gs.s.dead )
    {
      this.tick( gs.s.t > from - 1.5 );
    }
    if ( shot.bolt !== undefined )
    {
      ( this.game.scene.getScene( 'bg' ) as unknown as { boltIn: number } ).boltIn = shot.bolt;
    }
    return from;
  }

  async peek( level: string, from: number, after = 0 ): Promise<string>
  {
    this.takeOver();
    try
    {
      const at = this.setup( { level, from, dur: 0 } );
      for ( let i = 0; i <= after * FPS; i++ )
      {
        this.tick();
      }
      const url = this.game.canvas.toDataURL( 'image/jpeg', 0.85 );
      await fetch( '/__save-shot?name=peek', { method: 'POST', body: url } );
      return `${ level } @ ${ at.toFixed( 1 ) } с, x ${ Math.round( this.gs.s.x ) }`;
    }
    finally
    {
      this.release();
    }
  }

  // Вертикальний ролик: гра лише ландшафтна, тож рендеримо її в 4:3 і вирізаємо вікно 2:3, що стежить за кулею
  // (на екрані результату — по центру). Бічні елементи HUD у вузьке вікно не влазять, тому там HUD ховаємо
  async record( w: number, h: number, shots: Shot[] = SHOTS, hud = w > h ): Promise<string>
  {
    this.status = 'starting';
    this.takeOver();
    const out = document.createElement( 'canvas' );
    out.width = w;
    out.height = h;
    const ctx = out.getContext( '2d' )!;
    const prev = document.createElement( 'canvas' );
    prev.width = w;
    prev.height = h;
    const pctx = prev.getContext( '2d' )!;
    const cover = await loadImage( w > h ? '/art/cover-1920x1080.jpg' : '/art/cover-1080x1620.jpg' );

    const mux = new Mp4( w, h, FPS );
    const enc = new VideoEncoder( {
      output: ( chunk, meta ) => mux.add( chunk, meta ),
      error: ( e ) =>
      {
        this.status = 'error ' + e.message;
      }
    } );
    const config: VideoEncoderConfig = { codec: 'avc1.64002A', width: w, height: h, bitrate: 10_000_000, framerate: FPS, avc: { format: 'avc' } };
    if ( !( await VideoEncoder.isConfigSupported( config ) ).supported )
    {
      this.release();
      throw new Error( 'H.264 ' + w + 'x' + h + ' не підтримується' );
    }
    enc.configure( config );
    let frame = 0;
    const emit = async () =>
    {
      const vf = new VideoFrame( out, { timestamp: Math.round( frame * 1e6 / FPS ), duration: Math.round( 1e6 / FPS ) } );
      enc.encode( vf, { keyFrame: frame % FPS === 0 } );
      vf.close();
      frame++;
      if ( frame % 20 === 0 )
      {
        await enc.flush();
      }
    };
    const fit = ( c: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number ) =>
    {
      const k = Math.max( w / iw, h / ih );
      c.drawImage( img, ( w - iw * k ) / 2, ( h - ih * k ) / 2, iw * k, ih * k );
    };

    try
    {
      // Перший кадр — обкладинка, потім вона розчиняється в першу сцену
      fit( pctx, cover, cover.naturalWidth, cover.naturalHeight );
      ctx.drawImage( prev, 0, 0 );
      for ( let i = 0; i < COVER * FPS; i++ )
      {
        await emit();
      }
      const ui = this.game.scene.getScene( 'ui' ) as unknown as { hud?: Phaser.GameObjects.Container };
      // Куди дивиться вікно 2:3: на кулю в польоті, на центр екрана після перемоги
      const focusX = () =>
      {
        const gs = this.gs;
        const cam = gs.cameras.main;
        return gs.s.won ? this.game.canvas.width / 2 : ( gs.s.x - cam.worldView.x ) * cam.zoom;
      };
      for ( const [ si, shot ] of shots.entries() )
      {
        this.status = `shot ${ si + 1 }/${ shots.length } ${ shot.level }`;
        this.setup( shot );
        const n = Math.round( shot.dur * FPS );
        const fade = Math.round( FADE * FPS );
        let cx = -1;
        for ( let i = 0; i < n; i++ )
        {
          ui.hud?.setVisible( hud );
          this.tick();
          const cw = this.game.canvas.width;
          const ch = this.game.canvas.height;
          if ( Math.abs( cw / ch - w / h ) < 0.01 )
          {
            fit( ctx, this.game.canvas, cw, ch );
          }
          else
          {
            const win = Math.min( cw, ch * w / h );
            cx = cx < 0 ? focusX() : cx + ( focusX() - cx ) * 0.06;
            const sx = Phaser.Math.Clamp( cx - win / 2, 0, cw - win );
            ctx.drawImage( this.game.canvas, sx, 0, win, ch, 0, 0, w, h );
          }
          if ( i < fade )
          {
            ctx.globalAlpha = 1 - i / fade;
            ctx.drawImage( prev, 0, 0 );
            ctx.globalAlpha = 1;
          }
          await emit();
        }
        pctx.drawImage( out, 0, 0 );
      }
      await enc.flush();
      enc.close();
      const name = `video-${ w }x${ h }`;
      const body = mux.finish();
      await fetch( '/__save-video?name=' + name, { method: 'POST', body: new Blob( [ body as Uint8Array<ArrayBuffer> ] ) } );
      this.status = `done ${ name }.mp4: ${ frame } кадрів, ${ ( frame / FPS ).toFixed( 2 ) } с, ${ ( body.byteLength / 1e6 ).toFixed( 1 ) } МБ`;
      return this.status;
    }
    catch ( e )
    {
      this.status = 'error ' + ( e as Error ).message;
      throw e;
    }
    finally
    {
      ( this.game.scene.getScene( 'ui' ) as unknown as { hud?: Phaser.GameObjects.Container } ).hud?.setVisible( true );
      this.release();
    }
  }
}

function loadImage( src: string ): Promise<HTMLImageElement>
{
  return new Promise( ( res, rej ) =>
  {
    const img = new Image();
    img.onload = () => res( img );
    img.onerror = () => rej( new Error( 'не завантажилась ' + src ) );
    img.src = src;
  } );
}

// Мінімальний MP4 (ISO BMFF) з однією відеодоріжкою H.264, moov на початку (fast start)
class Mp4
{
  private samples: Uint8Array[] = [];
  private keys: number[] = [];
  private lastTs = -1;
  private avcC?: Uint8Array;

  private w: number;
  private h: number;
  private fps: number;

  constructor( w: number, h: number, fps: number )
  {
    this.w = w;
    this.h = h;
    this.fps = fps;
  }

  add( chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata ): void
  {
    if ( chunk.timestamp <= this.lastTs )
    {
      throw new Error( 'кадри не по порядку (B-кадри) — потрібен ctts' );
    }
    this.lastTs = chunk.timestamp;
    const desc = meta?.decoderConfig?.description;
    if ( desc && !this.avcC )
    {
      this.avcC = ArrayBuffer.isView( desc )
        ? new Uint8Array( desc.buffer.slice( desc.byteOffset, desc.byteOffset + desc.byteLength ) )
        : new Uint8Array( desc.slice( 0 ) );
    }
    const data = new Uint8Array( chunk.byteLength );
    chunk.copyTo( data );
    if ( chunk.type === 'key' )
    {
      this.keys.push( this.samples.length + 1 );
    }
    this.samples.push( data );
  }

  finish(): Uint8Array
  {
    if ( !this.avcC )
    {
      throw new Error( 'енкодер не віддав avcC' );
    }
    const ftyp = box( 'ftyp', str( 'isom' ), u32( 512 ), str( 'isom' ), str( 'iso2' ), str( 'avc1' ), str( 'mp41' ) );
    const dataLen = this.samples.reduce( ( a, s ) => a + s.length, 0 );
    const probe = this.moov( 0 );
    const offset = ftyp.length + probe.length + 8;
    const moov = this.moov( offset );
    const mdatHead = cat( u32( dataLen + 8 ), str( 'mdat' ) );
    return cat( ftyp, moov, mdatHead, ...this.samples );
  }

  private moov( offset: number ): Uint8Array
  {
    const n = this.samples.length;
    const delta = 1000;
    const mediaScale = this.fps * delta;
    const ms = Math.round( n * 1000 / this.fps );
    const matrix = cat( u32( 0x10000 ), u32( 0 ), u32( 0 ), u32( 0 ), u32( 0x10000 ), u32( 0 ), u32( 0 ), u32( 0 ), u32( 0x40000000 ) );
    const mvhd = full( 'mvhd', 0, 0, u32( 0 ), u32( 0 ), u32( 1000 ), u32( ms ), u32( 0x10000 ), u16( 0x100 ), zeros( 10 ), matrix, zeros( 24 ), u32( 2 ) );
    const tkhd = full( 'tkhd', 0, 3, u32( 0 ), u32( 0 ), u32( 1 ), u32( 0 ), u32( ms ), zeros( 8 ), u16( 0 ), u16( 0 ), u16( 0 ), u16( 0 ), matrix, u32( this.w << 16 ), u32( this.h << 16 ) );
    const mdhd = full( 'mdhd', 0, 0, u32( 0 ), u32( 0 ), u32( mediaScale ), u32( n * delta ), u16( 0x55c4 ), u16( 0 ) );
    const hdlr = full( 'hdlr', 0, 0, u32( 0 ), str( 'vide' ), zeros( 12 ), str( 'VideoHandler\0' ) );
    const vmhd = full( 'vmhd', 0, 1, zeros( 8 ) );
    const dinf = box( 'dinf', full( 'dref', 0, 0, u32( 1 ), full( 'url ', 0, 1 ) ) );
    const avc1 = box( 'avc1', zeros( 6 ), u16( 1 ), u16( 0 ), u16( 0 ), zeros( 12 ), u16( this.w ), u16( this.h ),
      u32( 0x480000 ), u32( 0x480000 ), u32( 0 ), u16( 1 ), zeros( 32 ), u16( 0x18 ), u16( 0xffff ), box( 'avcC', this.avcC! ) );
    const stsd = full( 'stsd', 0, 0, u32( 1 ), avc1 );
    const stts = full( 'stts', 0, 0, u32( 1 ), u32( n ), u32( delta ) );
    const stss = full( 'stss', 0, 0, u32( this.keys.length ), ...this.keys.map( u32 ) );
    const stsc = full( 'stsc', 0, 0, u32( 1 ), u32( 1 ), u32( n ), u32( 1 ) );
    const stsz = full( 'stsz', 0, 0, u32( 0 ), u32( n ), ...this.samples.map( ( s ) => u32( s.length ) ) );
    const stco = full( 'stco', 0, 0, u32( 1 ), u32( offset ) );
    const stbl = box( 'stbl', stsd, stts, stss, stsc, stsz, stco );
    const minf = box( 'minf', vmhd, dinf, stbl );
    const mdia = box( 'mdia', mdhd, hdlr, minf );
    return box( 'moov', mvhd, box( 'trak', tkhd, mdia ) );
  }
}

function u32( v: number ): Uint8Array
{
  return new Uint8Array( [ ( v >>> 24 ) & 255, ( v >>> 16 ) & 255, ( v >>> 8 ) & 255, v & 255 ] );
}

function u16( v: number ): Uint8Array
{
  return new Uint8Array( [ ( v >>> 8 ) & 255, v & 255 ] );
}

function zeros( n: number ): Uint8Array
{
  return new Uint8Array( n );
}

function str( s: string ): Uint8Array
{
  return new Uint8Array( [ ...s ].map( ( c ) => c.charCodeAt( 0 ) ) );
}

function cat( ...parts: Uint8Array[] ): Uint8Array
{
  const out = new Uint8Array( parts.reduce( ( a, p ) => a + p.length, 0 ) );
  let o = 0;
  for ( const p of parts )
  {
    out.set( p, o );
    o += p.length;
  }
  return out;
}

function box( type: string, ...parts: Uint8Array[] ): Uint8Array
{
  const body = cat( ...parts );
  return cat( u32( body.length + 8 ), str( type ), body );
}

function full( type: string, version: number, flags: number, ...parts: Uint8Array[] ): Uint8Array
{
  return box( type, u32( ( version << 24 ) | flags ), ...parts );
}

export function installVideo( game: Phaser.Game ): void
{
  ( window as unknown as { video: Rig } ).video = new Rig( game );
}
