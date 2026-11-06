import Phaser from 'phaser';
import { audio } from '../core/audio.ts';

export let FONT = '"Trebuchet MS", "Segoe UI", Verdana, Arial, sans-serif';

export function setFont( family: string ): void
{
  FONT = `"${ family }", "Trebuchet MS", "Segoe UI", sans-serif`;
}

export const COLORS = {
  ink: 0x24304a,
  primary: 0xff8a2a,
  primaryDark: 0xc85a10,
  blue: 0x3a8ee8,
  blueDark: 0x22589e,
  green: 0x3fb56a,
  greenDark: 0x24804a,
  grey: 0x7a8098,
  greyDark: 0x4a5068,
  panel: 0xfff8ec,
  panelEdge: 0xe0c89a
};

export function inkHex(): string
{
  return '#' + COLORS.ink.toString( 16 ).padStart( 6, '0' );
}

// Масштаб інтерфейсу: на дрібних екранах телефонів кнопки більші, щоб влучати пальцем
export function uiScale(): number
{
  const el = document.getElementById( 'game' );
  const short = Math.min( el?.clientWidth || window.innerWidth, el?.clientHeight || window.innerHeight );
  return Phaser.Math.Clamp( 620 / Math.max( 1, short ), 1, 1.75 );
}

export function label( scene: Phaser.Scene, x: number, y: number, str: string, size: number, color = '#ffffff', stroke = true ): Phaser.GameObjects.Text
{
  const tx = scene.add.text( x, y, str, {
    fontFamily: FONT,
    fontSize: Math.round( size ) + 'px',
    fontStyle: 'bold',
    color,
    align: 'center',
    stroke: stroke ? inkHex() : undefined,
    strokeThickness: stroke ? Math.max( 3, size * 0.16 ) : 0
  } );
  tx.setOrigin( 0.5 );
  return tx;
}

export interface ButtonOpts
{
  w: number;
  h: number;
  text?: string;
  icon?: string;
  iconScale?: number;
  color?: number;
  dark?: number;
  size?: number;
  onClick: () => void;
}

export class Button extends Phaser.GameObjects.Container
{
  private bg: Phaser.GameObjects.Graphics;
  // Акварельна кнопка: знебарвлений мазок, тонований кольором кнопки; нижня копія темніша — товщина
  private face?: Phaser.GameObjects.NineSlice;
  private edge?: Phaser.GameObjects.NineSlice;
  private opts: ButtonOpts;
  txt?: Phaser.GameObjects.Text;
  ico?: Phaser.GameObjects.Image;
  enabled = true;

  constructor( scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts )
  {
    super( scene, x, y );
    this.opts = opts;
    this.bg = scene.add.graphics();
    this.add( this.bg );
    if ( scene.textures.exists( 'pk-btn' ) )
    {
      this.edge = painted( scene, opts.w, opts.h );
      this.face = painted( scene, opts.w, opts.h );
      this.add( [ this.edge, this.face ] );
    }
    const size = opts.size ?? Math.round( opts.h * 0.42 );
    if ( opts.icon )
    {
      this.ico = scene.add.image( 0, -2, opts.icon );
      this.ico.setScale( ( opts.iconScale ?? 1 ) * Math.min( opts.h, opts.w ) / 72 );
      this.add( this.ico );
    }
    if ( opts.text )
    {
      this.txt = label( scene, 0, -2, opts.text, size );
      this.add( this.txt );
    }
    this.arrange();
    this.draw( false );
    this.setSize( opts.w, opts.h );
    this.setInteractive( { useHandCursor: true } );
    this.on( 'pointerover', () => this.enabled && this.setScale( 1.05 ) );
    this.on( 'pointerout', () =>
    {
      this.setScale( 1 );
      this.draw( false );
    } );
    this.on( 'pointerdown', () =>
    {
      if ( this.enabled )
      {
        this.draw( true );
      }
    } );
    this.on( 'pointerup', () =>
    {
      this.draw( false );
      if ( this.enabled )
      {
        audio.click();
        opts.onClick();
      }
    } );
    scene.add.existing( this );
  }

  setText( s: string ): this
  {
    this.txt?.setText( s );
    this.arrange();
    return this;
  }

  // Іконка й текст стоять однією групою по центру кнопки, а не іконка біля краю й текст збоку
  private arrange(): void
  {
    if ( !this.ico || !this.txt )
    {
      return;
    }
    const gap = this.opts.h * 0.16;
    const iw = this.ico.displayWidth;
    const total = iw + gap + this.txt.width;
    this.ico.x = -total / 2 + iw / 2;
    this.txt.x = -total / 2 + iw + gap + this.txt.width / 2;
  }

  setEnabled( on: boolean ): this
  {
    this.enabled = on;
    this.setAlpha( on ? 1 : 0.55 );
    return this;
  }

  setColor( color: number, dark: number ): this
  {
    this.opts.color = color;
    this.opts.dark = dark;
    this.draw( false );
    return this;
  }

  private draw( pressed: boolean ): void
  {
    const { w, h } = this.opts;
    const c = this.opts.color ?? COLORS.primary;
    const d = this.opts.dark ?? COLORS.primaryDark;
    const r = Math.min( h / 2, 22 );
    const g = this.bg;
    g.clear();
    const off = pressed ? 4 : 0;
    if ( this.face && this.edge )
    {
      const fw = this.face.displayWidth;
      const fh = this.face.displayHeight;
      g.fillStyle( 0x000000, 0.14 );
      g.fillRoundedRect( -fw / 2 + 4, -fh / 2 + 10, fw - 8, fh - 4, Math.min( fh / 2, 22 ) );
      this.edge.setTint( d ).setY( 5 );
      this.face.setTint( c ).setY( off );
      this.txt?.setY( -2 + off - 2 );
      this.ico?.setY( -2 + off - 2 );
      return;
    }
    g.fillStyle( 0x000000, 0.18 );
    g.fillRoundedRect( -w / 2, -h / 2 + 8, w, h, r );
    g.fillStyle( d, 1 );
    g.fillRoundedRect( -w / 2, -h / 2 + 6, w, h - 2, r );
    g.fillStyle( c, 1 );
    g.fillRoundedRect( -w / 2, -h / 2 + off, w, h - 6, r );
    g.fillStyle( 0xffffff, 0.22 );
    g.fillRoundedRect( -w / 2 + 6, -h / 2 + off + 4, w - 12, ( h - 6 ) * 0.38, Math.min( r, ( h - 6 ) * 0.19 ) );
    if ( this.txt )
    {
      this.txt.y = -2 + off - 3;
    }
    if ( this.ico )
    {
      this.ico.y = -2 + off - 3;
    }
  }
}

// Мазок кнопки має товсті краї, тож будуємо його в масштабі текстури й зменшуємо однаково по обох осях:
// вузька кнопка стає меншим кругом, а не сплюснутим овалом
export function painted( scene: Phaser.Scene, w: number, h: number ): Phaser.GameObjects.NineSlice
{
  const src = scene.textures.get( 'pk-btn' ).getSourceImage();
  const cap = Math.min( src.width * 0.3, src.height * 0.5 );
  const k = Math.min( h / src.height, w / ( cap * 2 + 2 ) );
  const ns = scene.add.nineslice( 0, 0, 'pk-btn', undefined, Math.max( cap * 2 + 2, w / k ), src.height, cap, cap, 0, 0 );
  ns.setScale( k );
  return ns;
}

export function button( scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts ): Button
{
  return new Button( scene, x, y, opts );
}

export function panel( scene: Phaser.Scene, w: number, h: number, color = COLORS.panel, edge = COLORS.panelEdge ): Phaser.GameObjects.GameObject
{
  if ( scene.textures.exists( 'pk-panel' ) )
  {
    // Пергамент з акварельною рамкою; кути лишаються в рідному розмірі, тягнеться лише середина
    const src = scene.textures.get( 'pk-panel' ).getSourceImage();
    const cut = Math.min( 90, src.width / 3, src.height / 3, w / 2.2, h / 2.2 );
    const c = scene.add.container( 0, 0 );
    const sh = scene.add.nineslice( 4, 12, 'pk-panel', undefined, w, h, cut, cut, cut, cut ).setTint( 0x000000 ).setAlpha( 0.16 );
    const p = scene.add.nineslice( 0, 0, 'pk-panel', undefined, w, h, cut, cut, cut, cut );
    c.add( [ sh, p ] );
    return c;
  }
  const g = scene.add.graphics();
  g.fillStyle( 0x000000, 0.22 );
  g.fillRoundedRect( -w / 2, -h / 2 + 10, w, h, 34 );
  g.fillStyle( edge, 1 );
  g.fillRoundedRect( -w / 2, -h / 2, w, h, 34 );
  g.fillStyle( color, 1 );
  g.fillRoundedRect( -w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 28 );
  return g;
}

export function starsRow( scene: Phaser.Scene, x: number, y: number, n: number, size: number, gap = 1.1 ): Phaser.GameObjects.Image[]
{
  const out: Phaser.GameObjects.Image[] = [];
  for ( let i = 0; i < 3; i++ )
  {
    const img = scene.add.image( x + ( i - 1 ) * size * gap, y - ( i === 1 ? size * 0.12 : 0 ), i < n ? 'star' : 'starEmpty' );
    img.setDisplaySize( size, size );
    out.push( img );
  }
  return out;
}
