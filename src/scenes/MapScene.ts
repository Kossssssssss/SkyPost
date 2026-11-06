import Phaser from 'phaser';
import { t, tn, currentLang, type Lang } from '../core/i18n.ts';
import { save, starsOf, totalStars, record } from '../core/save.ts';
import { WORLDS, FUTURE_WORLDS, WORLD_UNLOCK, levelUnlocked, worldUnlocked, maxStars } from '../levels/index.ts';
import { SKINS } from '../core/skins.ts';
import { THEMES } from '../ui/worldView.ts';
import { audio } from '../core/audio.ts';
import { button, label, panel, painted, starsRow, uiScale, COLORS, inkHex } from '../ui/widgets.ts';
import { pack } from '../ui/pack.ts';
import type { BgScene } from './BgScene.ts';
import type { Theme } from '../core/level.ts';

const LANG_CODES: Record<Lang, string> = { uk: 'УКР', ru: 'РУС', en: 'ENG' };

export class MapScene extends Phaser.Scene
{
  private world = 1;
  private root!: Phaser.GameObjects.Container;

  constructor()
  {
    super( 'map' );
  }

  init( data: { world?: number } ): void
  {
    this.world = Phaser.Math.Clamp( data.world ?? 1, 1, WORLDS.length + FUTURE_WORLDS.length );
  }

  create(): void
  {
    this.root = this.add.container( 0, 0 );
    this.scale.on( 'resize', this.build, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.build, this ) );
    this.input.keyboard!.on( 'keydown-LEFT', () => this.flip( -1 ) );
    this.input.keyboard!.on( 'keydown-RIGHT', () => this.flip( 1 ) );
    this.input.on( 'pointerdown', () => audio.unlock() );
    this.build();
  }

  private flip( d: number ): void
  {
    const n = Phaser.Math.Clamp( this.world + d, 1, WORLDS.length + FUTURE_WORLDS.length );
    if ( n !== this.world )
    {
      this.world = n;
      this.build();
    }
  }

  private build(): void
  {
    this.root.removeAll( true );
    const w = this.scale.width;
    const h = this.scale.height;
    const u = uiScale();
    this.cameras.main.setSize( w, h );
    const wd = WORLDS.find( ( x ) => x.id === this.world );
    const future = FUTURE_WORLDS.find( ( x ) => x.id === this.world );
    const theme: Theme = wd?.theme ?? ( this.world === 4 ? 'storm' : 'night' );
    const th = THEMES[ theme ];

    if ( pack )
    {
      // Під картою летить той самий живий фон, що й у грі, з пейзажем світу
      if ( !this.scene.isActive( 'bg' ) )
      {
        this.scene.launch( 'bg' );
        this.scene.sendToBack( 'bg' );
      }
      const bg = this.scene.get( 'bg' ) as BgScene;
      if ( bg.sys.settings.status >= Phaser.Scenes.CREATING )
      {
        bg.setTheme( theme );
      }
      else
      {
        bg.events.once( 'create', () => bg.setTheme( theme ) );
      }
    }
    else
    {
      const sky = this.add.graphics();
      sky.fillGradientStyle( th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1 );
      sky.fillRect( 0, 0, w, h );
      this.root.add( sky );
    }
    if ( !pack && this.textures.exists( th.far ) )
    {
      const src = this.textures.get( th.far ).getSourceImage() as HTMLImageElement;
      const k = Math.max( ( h * 0.7 ) / src.height, w / src.width );
      this.root.add( this.add.image( w / 2, h, th.far ).setOrigin( 0.5, 1 ).setScale( k ).setAlpha( 0.95 ) );
    }

    const m = 22 * u;
    const bs = 84 * u;
    const total = totalStars();
    const top = this.add.container( 0, 0 );
    this.root.add( top );
    top.add( this.add.image( m + 30 * u, m + bs / 2, 'star' ).setDisplaySize( 60 * u, 60 * u ) );
    top.add( label( this, m + 70 * u, m + bs / 2, `${ total } / ${ maxStars() }`, 40 * u ).setOrigin( 0, 0.5 ) );
    const shop = button( this, w - m - 150 * u, m + bs / 2, {
      w: 280 * u, h: bs, text: `${ t( 'shop' ) }  ${ save().wallet }★`, icon: 'i-shop', size: 30 * u,
      onClick: () => this.scene.start( 'shop', { world: this.world } )
    } );
    top.add( shop );
    const mute = button( this, w - m - 340 * u, m + bs / 2, {
      w: bs, h: bs, icon: audio.muted ? 'i-mute' : 'i-sound', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleMute();
        mute.ico?.setTexture( audio.muted ? 'i-mute' : 'i-sound' );
      }
    } );
    top.add( mute );
    const lang = button( this, w - m - 454 * u, m + bs / 2, {
      w: 120 * u, h: bs, text: LANG_CODES[ currentLang() ], size: 30 * u, color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () => this.scene.start( 'lang', { world: this.world } )
    } );
    top.add( lang );

    const title = wd ? `${ t( 'world', wd.id ) } · ${ tn( wd.name ) }` : `${ t( 'world', this.world ) } · ${ tn( future?.name ?? '' ) }`;
    this.root.add( label( this, w / 2, m + bs + 70 * u, title, 56 * u ) );

    const maxW = WORLDS.length + FUTURE_WORLDS.length;
    if ( this.world > 1 )
    {
      this.root.add( button( this, m + bs * 0.6 + 10 * u, h / 2, { w: bs * 1.2, h: bs * 1.2, icon: 'i-back', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.flip( -1 ) } ) );
    }
    if ( this.world < maxW )
    {
      this.root.add( button( this, w - m - bs * 0.6 - 10 * u, h / 2, { w: bs * 1.2, h: bs * 1.2, icon: 'i-fwd', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.flip( 1 ) } ) );
    }

    const unlocked = wd ? worldUnlocked( wd.id ) : false;
    const levels = wd?.levels ?? [];
    const count = wd ? levels.length : 8;
    const x0 = w * 0.5 - Math.min( w * 0.36, 780 * u );
    const x1 = w * 0.5 + Math.min( w * 0.36, 780 * u );
    const cy = h * 0.56;
    const amp = Math.min( h * 0.13, 130 * u, ( x1 - x0 ) / ( count - 1 ) * 0.45 );
    const pos = ( i: number ) => ( { x: x0 + ( ( x1 - x0 ) * i ) / ( count - 1 ), y: cy + Math.sin( i * 1.25 ) * amp } );

    const path = this.add.graphics();
    this.root.add( path );
    path.fillStyle( 0xffffff, 0.7 );
    for ( let i = 0; i < count - 1; i++ )
    {
      const a = pos( i );
      const b = pos( i + 1 );
      for ( let k = 1; k < 6; k++ )
      {
        const f = k / 6;
        path.fillCircle( Phaser.Math.Linear( a.x, b.x, f ), Phaser.Math.Linear( a.y, b.y, f ) - Math.sin( f * Math.PI ) * 20 * u, 5 * u );
      }
    }

    let current = -1;
    for ( let i = 0; i < count; i++ )
    {
      const p = pos( i );
      const lvl = levels[ i ];
      const open = !!lvl && unlocked && levelUnlocked( lvl.id );
      if ( open && current < 0 && !record( lvl.id ).done )
      {
        current = i;
      }
      const r = Math.min( 62 * u, ( ( x1 - x0 ) / ( count - 1 ) ) * 0.34 );
      const node = this.add.container( p.x, p.y );
      this.root.add( node );
      const g = this.add.graphics();
      g.fillStyle( 0x000000, 0.2 );
      g.fillCircle( 0, 8 * u, r );
      node.add( g );
      if ( this.textures.exists( 'pk-btn' ) )
      {
        node.add( painted( this, r * 2, r * 2 ).setTint( open ? COLORS.primaryDark : COLORS.greyDark ).setY( 5 * u ) );
        node.add( painted( this, r * 2, r * 2 ).setTint( open ? COLORS.primary : COLORS.grey ) );
      }
      else
      {
        g.fillStyle( open ? COLORS.primaryDark : COLORS.greyDark, 1 );
        g.fillCircle( 0, 4 * u, r );
        g.fillStyle( open ? COLORS.primary : COLORS.grey, 1 );
        g.fillCircle( 0, 0, r - 4 * u );
        g.fillStyle( 0xffffff, 0.25 );
        g.fillEllipse( 0, -r * 0.4, r * 1.2, r * 0.5 );
      }
      if ( open )
      {
        node.add( label( this, 0, -2 * u, String( i + 1 ), r * 0.85 ) );
        starsRow( this, 0, r * 1.45, starsOf( lvl.id ), r * 0.7 ).forEach( ( s ) => node.add( s ) );
        node.setSize( r * 2, r * 2 );
        node.setInteractive( { useHandCursor: true } );
        node.on( 'pointerover', () => node.setScale( 1.07 ) );
        node.on( 'pointerout', () => node.setScale( 1 ) );
        node.on( 'pointerup', () =>
        {
          audio.click();
          this.play( lvl.id );
        } );
      }
      else
      {
        node.add( this.add.image( 0, 0, 'lock' ).setScale( r / 48 ).setAlpha( 0.9 ) );
      }
    }
    if ( current >= 0 )
    {
      const p = pos( current );
      const b = this.add.image( p.x, p.y - 120 * u, 'env:' + save().equip.envelope ).setScale( 0.7 * u );
      this.root.add( b );
      this.tweens.add( { targets: b, y: b.y - 16 * u, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
    }

    if ( future )
    {
      this.lockedPanel( w / 2, cy, t( 'soon' ), u );
    }
    else if ( wd && !unlocked )
    {
      this.lockedPanel( w / 2, cy, t( 'needStars', WORLD_UNLOCK[ wd.id - 1 ] ), u );
    }
    else if ( wd )
    {
      const sp = SKINS.find( ( s ) => s.world === wd.id );
      if ( sp )
      {
        const owned = save().owned.includes( sp.id );
        const y = h - 60 * u;
        this.root.add( this.add.image( w / 2 - 260 * u, y - 10 * u, 'env:' + sp.id ).setScale( 0.5 * u ).setAlpha( owned ? 1 : 0.8 ) );
        this.root.add( label( this, w / 2 - 210 * u, y, owned ? tn( sp.name ) + ' ✔' : t( 'special', wd.id ) + ' → ' + tn( sp.name ), 28 * u ).setOrigin( 0, 0.5 ) );
      }
    }
  }

  private lockedPanel( x: number, y: number, text: string, u: number ): void
  {
    const c = this.add.container( x, y );
    this.root.add( c );
    c.add( panel( this, 760 * u, 200 * u ) );
    c.add( this.add.image( -290 * u, 0, 'lock' ).setScale( 1.6 * u ).setTint( 0x6a7090 ) );
    c.add( label( this, 30 * u, 0, text, 40 * u, inkHex(), false ) );
  }

  private play( id: string ): void
  {
    if ( !this.scene.isActive( 'bg' ) )
    {
      this.scene.launch( 'bg' );
    }
    this.scene.start( 'game', { levelId: id } );
  }
}
