import Phaser from 'phaser';
import { groundY, layerBottom, windAt, type LevelData, type Theme } from '../core/level.ts';
import { hazardPos } from '../core/sim.ts';
import { RES } from '../core/art.ts';
import { FONT, inkHex } from './widgets.ts';
import { cloudKey, pack } from './pack.ts';

export interface ThemeStyle
{
  skyTop: number;
  skyBottom: number;
  ground: number;
  groundTop: number;
  body: number;
  bodyDark: number;
  top: number;
  far: string;
}

export const THEMES: Record<Theme, ThemeStyle> = {
  meadow: { skyTop: 0x5cb8f8, skyBottom: 0xd4f1ff, ground: 0x8a5a32, groundTop: 0x6cc04a, body: 0x9a6a3e, bodyDark: 0x7a5030, top: 0x74c850, far: 'bg-meadow' },
  sea: { skyTop: 0x4aa0e8, skyBottom: 0xe6f6ff, ground: 0x1f78c0, groundTop: 0x4ab0e8, body: 0xb08e66, bodyDark: 0x8a6e4e, top: 0xf2dca0, far: 'bg-sea' },
  mountain: { skyTop: 0x7a9ee0, skyBottom: 0xf4e8f0, ground: 0x5e5a70, groundTop: 0x8a8aa0, body: 0x8a88a0, bodyDark: 0x625f78, top: 0xffffff, far: 'bg-mountain' },
  storm: { skyTop: 0x3a4060, skyBottom: 0x8a90a8, ground: 0x3a3a48, groundTop: 0x5a6a50, body: 0x5a5a6a, bodyDark: 0x404050, top: 0x6a8a5a, far: 'bg-mountain' },
  night: { skyTop: 0x0a1030, skyBottom: 0x2a3060, ground: 0x202030, groundTop: 0x303048, body: 0x303048, bodyDark: 0x202030, top: 0x404060, far: 'bg-meadow' }
};

interface Streak
{
  img: Phaser.GameObjects.Image;
  layer: number;
  speedK: number;
}

interface Cloud
{
  img: Phaser.GameObjects.Image;
  layer: number;
}

export class WorldView
{
  private scene: Phaser.Scene;
  private lvl: LevelData;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private streaks: Streak[] = [];
  private clouds: Cloud[] = [];
  private hazards: Phaser.GameObjects.Image[] = [];
  private motes: Phaser.GameObjects.Image[] = [];
  private water?: Phaser.GameObjects.Graphics;
  mailboxes: Phaser.GameObjects.Image[] = [];
  markers: Phaser.GameObjects.Graphics[] = [];
  stamp: Phaser.GameObjects.Image;
  stampGlow: Phaser.GameObjects.Image;

  constructor( scene: Phaser.Scene, lvl: LevelData )
  {
    this.scene = scene;
    this.lvl = lvl;
    const th = THEMES[ lvl.theme ];
    this.buildLayers();
    this.buildUpdrafts();
    this.buildClouds();

    const office = this.add( scene.add.image( lvl.start.x - 70, lvl.start.y + 2, 'office' ).setOrigin( 0.5, 1 ).setScale( 0.75 / RES ).setDepth( 2 ) );
    void office;

    const g = this.add( scene.add.graphics().setDepth( 5 ) );
    this.drawGround( g, th );
    for ( const b of lvl.blocks )
    {
      this.drawBlock( g, b.x, b.y, b.w, b.h, th );
    }

    lvl.targets.forEach( ( tg, i ) =>
    {
      const m = this.add( scene.add.graphics().setDepth( 6 ) );
      this.markers.push( m );
      const mb = this.add( scene.add.image( tg.x + tg.w / 2 - 14, tg.y + 2, 'mailbox' ).setOrigin( 0.5, 1 ).setScale( 0.8 / RES ).setDepth( 6 ) );
      this.mailboxes.push( mb );
      if ( lvl.targets.length > 1 )
      {
        const n = this.add( scene.add.text( mb.x, mb.y - 62, String( i + 1 ), {
          fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: inkHex(), strokeThickness: 5
        } ).setOrigin( 0.5 ).setDepth( 7 ) );
        void n;
      }
    } );
    this.setActiveTarget( 0 );

    this.stampGlow = this.add( scene.add.image( lvl.stamp.x, lvl.stamp.y, 'soft' ).setTint( 0xffe07a ).setScale( 1.6 ).setAlpha( 0.6 ).setDepth( 8 ).setBlendMode( Phaser.BlendModes.ADD ) );
    this.stamp = this.add( scene.add.image( lvl.stamp.x, lvl.stamp.y, 'stamp' ).setDepth( 9 ) );

    lvl.hazards.forEach( ( h ) =>
    {
      const key = h.kind === 'gull' ? 'gull0' : h.kind === 'spike' || h.kind === 'storm' ? 'spike' : 'bird0';
      const img = this.add( scene.add.image( h.x, h.y, key ).setDepth( 9 ) );
      img.setDisplaySize( h.r * 2.6, h.kind === 'spike' || h.kind === 'storm' ? h.r * 2.6 : h.r * 1.9 );
      this.hazards.push( img );
    } );
  }

  private add<T extends Phaser.GameObjects.GameObject>( o: T ): T
  {
    this.objects.push( o );
    return o;
  }

  private buildLayers(): void
  {
    const lvl = this.lvl;
    const band = this.add( this.scene.add.graphics().setDepth( 0 ) );
    lvl.layers.forEach( ( l, i ) =>
    {
      const y0 = l.top;
      const y1 = layerBottom( lvl, i );
      const col = l.wind > 0 ? 0xfff0c0 : l.wind < 0 ? 0xc0e0ff : 0xffffff;
      band.fillStyle( col, i % 2 ? 0.1 : 0.05 );
      // Смуги шарів виходять за край рівня на запас камери, інакше на краю видно шов
      band.fillRect( -400, y0, lvl.width + 800, y1 - y0 );
      if ( i > 0 )
      {
        band.fillStyle( 0xffffff, 0.35 );
        for ( let x = -396; x < lvl.width + 400; x += 36 )
        {
          band.fillRect( x, y0 - 1, 18, 2 );
        }
      }
      const area = lvl.width * ( y1 - y0 );
      const n = Math.abs( l.wind ) < 1 && !l.gust ? 0 : Math.round( area / 26000 );
      for ( let k = 0; k < n; k++ )
      {
        const img = this.add( this.scene.add.image(
          Math.random() * lvl.width, Phaser.Math.Between( y0 + 10, y1 - 10 ), 'streak' ).setDepth( 1 ) );
        img.setAlpha( 0.25 + Math.random() * 0.3 );
        img.setScale( 0.6 + Math.random() * 0.9, 1 );
        this.streaks.push( { img, layer: i, speedK: 1.3 + Math.random() * 0.8 } );
      }
      if ( n === 0 )
      {
        for ( let k = 0; k < Math.round( area / 40000 ); k++ )
        {
          const m = this.add( this.scene.add.image( Math.random() * lvl.width, Phaser.Math.Between( y0 + 10, y1 - 10 ), 'dot' )
            .setScale( 0.12 ).setAlpha( 0.5 ).setDepth( 1 ) );
          this.motes.push( m );
        }
      }
    } );
  }

  private buildClouds(): void
  {
    const lvl = this.lvl;
    lvl.layers.forEach( ( l, i ) =>
    {
      const y0 = l.top;
      const y1 = layerBottom( lvl, i );
      if ( y1 - y0 < 90 )
      {
        return;
      }
      const n = Math.max( 1, Math.round( lvl.width / 900 ) );
      for ( let k = 0; k < n; k++ )
      {
        const img = this.add( this.scene.add.image(
          ( k + Math.random() * 0.8 ) * ( lvl.width / n ), Phaser.Math.Between( y0 + 30, Math.max( y0 + 31, y1 - 40 ) ), cloudKey( ( k + i ) % 3 ) ).setDepth( 1 ) );
        const s = 0.45 + Math.random() * 0.4;
        // Хмари пакета більші за процедурні, тож зводимо їх до тієї ж ширини
        img.setScale( pack ? ( s * 260 ) / img.width : s );
        img.setAlpha( 0.75 );
        this.clouds.push( { img, layer: i } );
      }
    } );
  }

  private buildUpdrafts(): void
  {
    for ( const u of this.lvl.updrafts )
    {
      const g = this.add( this.scene.add.graphics().setDepth( 1 ) );
      g.fillGradientStyle( 0xfff0c0, 0xfff0c0, 0xffb060, 0xffb060, 0.0, 0.0, 0.25, 0.25 );
      g.fillRect( u.x, u.y, u.w, u.h );
      const em = this.add( this.scene.add.particles( 0, 0, 'dot', {
        x: { min: u.x + 10, max: u.x + u.w - 10 },
        y: u.y + u.h,
        speedY: { min: -140, max: -80 },
        lifespan: ( u.h / 110 ) * 1000,
        scale: { start: 0.25, end: 0.05 },
        alpha: { start: 0.7, end: 0 },
        tint: 0xffe0a0,
        frequency: 120
      } ).setDepth( 2 ) );
      void em;
    }
  }

  private drawGround( g: Phaser.GameObjects.Graphics, th: ThemeStyle ): void
  {
    const lvl = this.lvl;
    const gy = groundY( lvl );
    if ( lvl.water )
    {
      this.water = this.add( this.scene.add.graphics().setDepth( 4 ) );
      return;
    }
    g.fillStyle( th.ground, 1 );
    g.fillRect( -400, gy, lvl.width + 800, lvl.height - gy + 400 );
    g.fillStyle( th.groundTop, 1 );
    g.fillRect( -400, gy, lvl.width + 800, 12 );
    g.fillStyle( Phaser.Display.Color.ValueToColor( th.groundTop ).darken( 15 ).color, 1 );
    for ( let x = -400; x < lvl.width + 400; x += 22 )
    {
      g.fillTriangle( x, gy + 12, x + 11, gy + 20, x + 22, gy + 12 );
    }
  }

  private drawBlock( g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, th: ThemeStyle ): void
  {
    const onGround = y + h >= groundY( this.lvl ) - 1;
    if ( this.lvl.theme === 'sea' && h > w * 2.5 )
    {
      this.drawLighthouse( g, x, y, w, h );
      return;
    }
    const r = Math.min( 18, w / 3, h / 3 );
    const bottomR = onGround ? 0 : r;
    const hh = onGround ? h + 60 : h;
    g.fillStyle( th.bodyDark, 1 );
    g.fillRoundedRect( x, y, w, hh, { tl: r, tr: r, bl: bottomR, br: bottomR } );
    g.fillStyle( th.body, 1 );
    g.fillRoundedRect( x + 6, y, w - 12, hh - ( onGround ? 0 : 6 ), { tl: r, tr: r, bl: bottomR, br: bottomR } );
    g.fillStyle( th.bodyDark, 0.5 );
    const rand = new Phaser.Math.RandomDataGenerator( [ String( x * 31 + y ) ] );
    for ( let i = 0; i < ( w * h ) / 2500; i++ )
    {
      g.fillCircle( x + 12 + rand.frac() * ( w - 24 ), y + 24 + rand.frac() * Math.max( 1, h - 36 ), 3 + rand.frac() * 5 );
    }
    g.fillStyle( th.top, 1 );
    g.fillRoundedRect( x - 3, y - 3, w + 6, 14, { tl: r, tr: r, bl: 4, br: 4 } );
    for ( let px = x; px < x + w - 4; px += 16 )
    {
      g.fillTriangle( px, y + 10, px + 8, y + 18, px + 16, y + 10 );
    }
    if ( !onGround && this.lvl.theme === 'mountain' )
    {
      g.fillStyle( 0xdff4ff, 0.9 );
      for ( let px = x + 10; px < x + w - 10; px += 26 )
      {
        g.fillTriangle( px, y + h - 2, px + 10, y + h - 2, px + 5, y + h + 12 );
      }
    }
  }

  private drawLighthouse( g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number ): void
  {
    const base = y + h + 60;
    g.fillStyle( 0x8a6e4e, 1 );
    g.fillRoundedRect( x - 30, y + h - 30, w + 60, 90, 20 );
    const bands = 6;
    const bh = ( h - 50 ) / bands;
    for ( let i = 0; i < bands; i++ )
    {
      g.fillStyle( i % 2 ? 0xffffff : 0xd8332a, 1 );
      g.fillRect( x + 4, y + 50 + i * bh, w - 8, bh + 1 );
    }
    g.fillStyle( 0x24304a, 1 );
    g.fillRect( x - 6, y + 40, w + 12, 12 );
    g.fillStyle( 0xffe07a, 1 );
    g.fillRect( x + 10, y + 14, w - 20, 26 );
    g.fillStyle( 0xd8332a, 1 );
    g.fillTriangle( x - 4, y + 14, x + w + 4, y + 14, x + w / 2, y - 6 );
    g.fillStyle( 0x000000, 0.12 );
    g.fillRect( x + w * 0.6, y + 50, w * 0.4 - 4, h - 50 );
    void base;
  }

  setActiveTarget( idx: number ): void
  {
    this.lvl.targets.forEach( ( tg, i ) =>
    {
      const m = this.markers[ i ];
      m.clear();
      const done = i < idx;
      const active = i === idx;
      const col = done ? 0x3fb56a : active ? 0xffd23a : 0xffffff;
      m.fillStyle( col, active ? 0.9 : 0.45 );
      for ( let x = tg.x - tg.w / 2; x < tg.x + tg.w / 2 - 2; x += 18 )
      {
        m.fillRect( x, tg.y - 3, 11, 5 );
      }
      m.fillStyle( col, active ? 0.18 : 0.06 );
      m.fillRect( tg.x - tg.w / 2, tg.y - 80, tg.w, 77 );
      this.mailboxes[ i ].setTexture( done ? 'mailboxDone' : 'mailbox' );
    } );
  }

  update( t: number, dt: number ): void
  {
    const lvl = this.lvl;
    for ( const s of this.streaks )
    {
      const l = lvl.layers[ s.layer ];
      const w = windAt( lvl, ( l.top + layerBottom( lvl, s.layer ) ) / 2, t );
      s.img.x += w * s.speedK * dt;
      s.img.flipX = w < 0;
      if ( s.img.x > lvl.width + 60 )
      {
        s.img.x = -60;
      }
      else if ( s.img.x < -60 )
      {
        s.img.x = lvl.width + 60;
      }
    }
    for ( const c of this.clouds )
    {
      const l = lvl.layers[ c.layer ];
      const w = windAt( lvl, ( l.top + layerBottom( lvl, c.layer ) ) / 2, t );
      c.img.x += w * 0.9 * dt;
      const half = c.img.displayWidth / 2;
      if ( c.img.x > lvl.width + half )
      {
        c.img.x = -half;
      }
      else if ( c.img.x < -half )
      {
        c.img.x = lvl.width + half;
      }
    }
    for ( let i = 0; i < this.motes.length; i++ )
    {
      const m = this.motes[ i ];
      m.y += Math.sin( t * 0.8 + i ) * 6 * dt;
      m.x += Math.cos( t * 0.5 + i * 1.7 ) * 5 * dt;
    }
    lvl.hazards.forEach( ( h, i ) =>
    {
      const p = hazardPos( lvl, i, t );
      const img = this.hazards[ i ];
      const prevX = img.x;
      img.setPosition( p.x, p.y );
      if ( h.kind === 'bird' || h.kind === 'gull' )
      {
        const f = Math.floor( t * 6 + i ) % 2;
        const key = h.kind + f;
        if ( img.texture.key !== key )
        {
          img.setTexture( key );
        }
        if ( Math.abs( p.x - prevX ) > 0.05 )
        {
          img.flipX = p.x < prevX;
        }
      }
      else
      {
        img.rotation = t * 1.5;
      }
    } );
    if ( this.stamp.visible )
    {
      this.stamp.y = lvl.stamp.y + Math.sin( t * 2.2 ) * 5;
      this.stamp.rotation = Math.sin( t * 1.7 ) * 0.15;
      this.stampGlow.y = this.stamp.y;
      this.stampGlow.setScale( 1.5 + Math.sin( t * 3 ) * 0.15 );
    }
    if ( this.water )
    {
      const gy = groundY( lvl );
      const g = this.water;
      const th = THEMES[ lvl.theme ];
      g.clear();
      g.fillStyle( th.ground, 1 );
      g.fillRect( -400, gy + 8, lvl.width + 800, lvl.height - gy + 400 );
      g.fillStyle( th.groundTop, 1 );
      g.beginPath();
      g.moveTo( -400, gy + 30 );
      for ( let x = -400; x <= lvl.width + 400; x += 20 )
      {
        g.lineTo( x, gy + 6 + Math.sin( x / 40 + t * 2 ) * 4 );
      }
      g.lineTo( lvl.width + 400, gy + 30 );
      g.closePath();
      g.fillPath();
      g.fillStyle( 0xffffff, 0.5 );
      for ( let x = -400; x <= lvl.width + 400; x += 90 )
      {
        g.fillRect( x + ( ( t * 20 ) % 90 ), gy + 14 + Math.sin( x ) * 3, 26, 3 );
      }
    }
  }

  hideStamp(): void
  {
    this.stamp.setVisible( false );
    this.stampGlow.setVisible( false );
  }

  destroy(): void
  {
    for ( const o of this.objects )
    {
      o.destroy();
    }
    this.objects = [];
    this.streaks = [];
    this.clouds = [];
    this.hazards = [];
    this.motes = [];
    this.mailboxes = [];
    this.markers = [];
  }
}
