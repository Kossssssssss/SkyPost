import Phaser from 'phaser';
import { t, tn, currentLang, type Lang } from '../core/i18n.ts';
import { save, starsOf, totalStars, record } from '../core/save.ts';
import { WORLDS, FUTURE_WORLDS, WORLD_UNLOCK, levelUnlocked, worldUnlocked } from '../levels/index.ts';
import { MECHANIC_TIPS } from '../core/level.ts';
import { SKINS, skin, trailLook, canBuySomething } from '../core/skins.ts';
import { BalloonView } from '../ui/balloonView.ts';
import { THEMES } from '../ui/worldView.ts';
import { audio } from '../core/audio.ts';
import { milestone, setPlace } from '../platform/analytics.ts';
import { button, label, panel, painted, starsRow, uiScale, fitText, fadeIn, shade, COLORS, inkHex } from '../ui/widgets.ts';
import { pack } from '../ui/pack.ts';
import type { BgScene } from './BgScene.ts';
import type { Theme } from '../core/level.ts';

const LANG_CODES: Record<Lang, string> = { uk: 'УКР', ru: 'РУС', en: 'ENG' };

// Рівні, які вже показувались на карті відкритими в цій сесії, і світи ('w' + номер), чию карту вже бачили
const seenOpen = new Set<string>();

// Колір вузла рівня за складністю: [основний, тінь]
const DIFF_COLORS: Record<string, [ number, number ]> = {
  hard: [ 0x9a5aa0, 0x6a3a72 ],
  super: [ 0x34406e, 0x1e2648 ]
};

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
    setPlace( 'map', () => ( { world: this.world } ) );
    milestone( 'm_map' );
    this.root = this.add.container( 0, 0 );
    this.scale.on( 'resize', this.build, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.build, this ) );
    this.input.keyboard!.on( 'keydown-LEFT', () => this.flip( -1 ) );
    this.input.keyboard!.on( 'keydown-RIGHT', () => this.flip( 1 ) );
    this.input.on( 'pointerdown', () => audio.unlock() );
    this.build();
    fadeIn( this, this.root );
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
    const starsTxt = label( this, m + 70 * u, m + bs / 2, `${ total }`, 40 * u ).setOrigin( 0, 0.5 );
    top.add( starsTxt );
    // Гаманець поруч із зірками: зірки — прогрес, монети — на покупки
    const coinX = starsTxt.x + starsTxt.width + 50 * u;
    top.add( this.add.image( coinX, m + bs / 2, 'coin' ).setScale( 64 * u / 256 ) );
    top.add( label( this, coinX + 38 * u, m + bs / 2, String( save().coins ), 40 * u ).setOrigin( 0, 0.5 ) );
    const shop = button( this, w - m - 150 * u, m + bs / 2, {
      w: 280 * u, h: bs, text: t( 'shop' ), icon: 'i-shop', size: 30 * u,
      onClick: () => this.scene.start( 'shop', { world: this.world } )
    } );
    top.add( shop );
    // Печатка «!» на куті кнопки, коли монет вистачає хоч на один скін; легенько пульсує, щоб її помітили
    if ( canBuySomething( save().coins, save().owned ) && this.textures.exists( 'badge' ) )
    {
      const bd = this.add.image( 140 * u - 14 * u, -bs / 2 + 10 * u, 'badge' );
      bd.setScale( 52 * u / bd.height );
      shop.add( bd );
      this.tweens.add( { targets: bd, scale: bd.scale * 1.12, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' } );
    }
    const mute = button( this, w - m - 340 * u, m + bs / 2, {
      w: bs, h: bs, icon: save().sfx ? 'i-sound' : 'i-mute', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleSfx();
        mute.ico?.setTexture( save().sfx ? 'i-sound' : 'i-mute' );
      }
    } );
    top.add( mute );
    // Музика вимикається окремо від ефектів: нота / перекреслена нота, як динамік поруч
    const mus = button( this, w - m - 436 * u, m + bs / 2, {
      w: bs, h: bs, icon: save().music ? 'i-music' : 'i-musicoff', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleMusic();
        mus.ico?.setTexture( save().music ? 'i-music' : 'i-musicoff' );
      }
    } );
    top.add( mus );
    const lang = button( this, w - m - 550 * u, m + bs / 2, {
      w: 120 * u, h: bs, text: LANG_CODES[ currentLang() ], size: 30 * u, color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () => this.scene.start( 'lang', { world: this.world } )
    } );
    top.add( lang );

    const title = wd ? `${ t( 'world', wd.id ) } · ${ tn( wd.name ) }` : `${ t( 'world', this.world ) } · ${ tn( future?.name ?? '' ) }`;
    // Заголовок між стрілками гортання: довга назва світу зменшується, а не налазить на них
    this.root.add( fitText( label( this, w / 2, m + bs + 70 * u, title, 56 * u ), w - 2 * ( m + bs * 1.2 + 30 * u ) ) );

    const maxW = WORLDS.length + FUTURE_WORLDS.length;
    if ( this.world > 1 )
    {
      this.root.add( button( this, m + bs * 0.6 + 10 * u, h / 2, { w: bs * 1.2, h: bs * 1.2, icon: 'i-back', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.flip( -1 ) } ) );
    }
    if ( this.world < maxW )
    {
      this.root.add( button( this, w - m - bs * 0.6 - 10 * u, h / 2, { w: bs * 1.2, h: bs * 1.2, icon: 'i-back', flipIcon: true, color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.flip( 1 ) } ) );
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
      // Важкі рівні — сливові, надважкі — темно-чорнильні, щоб винна печатка над ними не зливалась
      const [ col, dark ] = !open ? [ COLORS.grey, COLORS.greyDark ] : DIFF_COLORS[ lvl.difficulty ?? '' ] ?? [ COLORS.primary, COLORS.primaryDark ];
      if ( this.textures.exists( 'node' ) )
      {
        // Намальований поштовий штемпель: темніша копія трохи нижче — тінь, зверху штемпель кольору стану
        const k = ( r * 2 ) / this.textures.get( 'node' ).getSourceImage().height;
        node.add( this.add.image( 0, 5 * u, 'node' ).setScale( k ).setTint( shade( dark, 0.8 ) ) );
        node.add( this.add.image( 0, 0, 'node' ).setScale( k ).setTint( col ) );
      }
      else if ( this.textures.exists( 'pk-btn' ) )
      {
        node.add( painted( this, r * 2, r * 2 ).setTint( dark ).setY( 5 * u ) );
        node.add( painted( this, r * 2, r * 2 ).setTint( col ) );
      }
      else
      {
        const g = this.add.graphics();
        node.add( g );
        g.fillStyle( dark, 1 );
        g.fillCircle( 0, 4 * u, r );
        g.fillStyle( col, 1 );
        g.fillCircle( 0, 0, r - 4 * u );
        g.fillStyle( 0xffffff, 0.25 );
        g.fillEllipse( 0, -r * 0.4, r * 1.2, r * 0.5 );
      }
      if ( open )
      {
        node.add( label( this, 0, -r * 0.04, String( i + 1 ), r * 0.85, '#ffffff', shade( dark, 0.8 ) ) );
        starsRow( this, 0, r * 1.45, starsOf( lvl.id ), r * 0.7 ).forEach( ( s ) => node.add( s ) );
        // Знак нової механіки — у лівому верхньому куті, доки рівень не пройдено
        if ( lvl.tip && MECHANIC_TIPS.has( lvl.tip ) && !record( lvl.id ).done && this.textures.exists( 'mk-new' ) )
        {
          const img = this.add.image( -r * 0.8, -r * 0.8, 'mk-new' );
          node.add( img.setScale( r * 1.0 / img.width ).setAngle( -10 ) );
          this.tweens.add( { targets: img, scale: img.scale * 1.12, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
        }
        node.setSize( r * 2, r * 2 );
        node.setInteractive( { useHandCursor: true } );
        const zoom = ( to: number ) =>
        {
          this.tweens.killTweensOf( node );
          this.tweens.add( { targets: node, scale: to, duration: 160, ease: 'Sine.out' } );
        };
        node.on( 'pointerover', () => zoom( 1.07 ) );
        node.on( 'pointerout', () => zoom( 1 ) );
        node.on( 'pointerdown', () => zoom( 0.95 ) );
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
      // Печатка складності — у правому верхньому куті, навіть на закритому рівні: видно, що попереду
      const seal = lvl?.difficulty ? 'mk-' + lvl.difficulty : '';
      if ( seal && this.textures.exists( seal ) )
      {
        const img = this.add.image( r * 0.78, -r * 0.78, seal );
        node.add( img.setScale( r * 1.15 / img.width ).setAngle( 12 ) );
      }
      // Рівень відкрився, відколи карту показували востаннє: вузол вискакує з іскрами
      if ( open && seenOpen.has( 'w' + this.world ) && !seenOpen.has( lvl.id ) )
      {
        node.setScale( 0 );
        this.tweens.add( { targets: node, scale: 1, duration: 420, delay: 350, ease: 'Back.out' } );
        if ( this.textures.exists( 'p-star' ) )
        {
          const em = this.add.particles( p.x, p.y, 'p-star', {
            speed: { min: 60, max: 220 * u }, lifespan: 700, scale: { start: 0.35 * u, end: 0 }, alpha: { start: 1, end: 0 },
            tint: [ 0xffe07a, 0xffffff ], emitting: false
          } );
          this.root.add( em );
          this.time.delayedCall( 450, () => em.explode( 14 ) );
          this.time.delayedCall( 1300, () => em.destroy() );
        }
      }
    }
    // Запам'ятовуємо відкриті рівні; перший показ світу за сесію нічого не анімує
    levels.forEach( ( l ) =>
    {
      if ( unlocked && levelUnlocked( l.id ) )
      {
        seenOpen.add( l.id );
      }
    } );
    seenOpen.add( 'w' + this.world );
    if ( current >= 0 )
    {
      // Над поточним рівнем — уся вдягнена збірка: оболонка, пілот, кошик і шлейф
      const p = pos( current );
      const k = 1.4 * u;
      const b = new BalloonView( this, p.x, p.y - 85 * u );
      b.setScale( k );
      this.makeTrail( b, k );
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
        // Куля й підпис стоять однією групою по центру екрана
        const img = this.add.image( 0, y - 10 * u, 'env:' + sp.id ).setScale( 0.5 * u ).setAlpha( owned ? 1 : 0.8 );
        const tx = label( this, 0, y, owned ? tn( sp.name ) + ' ✔' : t( 'special', wd.id ) + ' → ' + tn( sp.name ), 28 * u ).setOrigin( 0, 0.5 );
        const gap = 14 * u;
        fitText( tx, w - 2 * m - img.displayWidth - gap );
        const total = img.displayWidth + gap + tx.width;
        img.x = w / 2 - total / 2 + img.displayWidth / 2;
        tx.x = w / 2 - total / 2 + img.displayWidth + gap;
        this.root.add( [ img, tx ] );
      }
    }
  }

  private makeTrail( target: BalloonView, k: number ): void
  {
    const id = save().equip.trail;
    const look = trailLook( this, skin( id ) );
    if ( !look )
    {
      return;
    }
    // Шлейф тягнеться ліворуч, наче куля пливе до наступного рівня
    const sz = k * 0.2 * look.k * ( look.painted ? 2 : 1 );
    this.root.add( this.add.particles( 0, 0, look.tex, {
      follow: target, followOffset: { x: 0, y: -3.3 * k },
      speedX: { min: -110 * k, max: -70 * k }, speedY: { min: -12, max: 12 },
      lifespan: 1100, frequency: id === 'trl-rainbow' ? 35 : 90,
      scale: { start: sz, end: sz * 0.25 }, alpha: { start: 0.9, end: 0 },
      ...( look.tint ? { tint: look.tint } : {} )
    } ) );
  }

  private lockedPanel( x: number, y: number, text: string, u: number ): void
  {
    const c = this.add.container( x, y );
    this.root.add( c );
    const pw = 760 * u;
    c.add( panel( this, pw, 200 * u ) );
    // Замок і напис — одна група по центру панелі з проміжком між ними
    const lock = this.add.image( 0, 0, 'lock' ).setScale( 1.6 * u ).setTint( 0x6a7090 );
    const gap = 24 * u;
    const tx = fitText( label( this, 0, 0, text, 40 * u, inkHex(), false ), pw - 140 * u - lock.displayWidth - gap );
    const total = lock.displayWidth + gap + tx.width;
    lock.x = -total / 2 + lock.displayWidth / 2;
    tx.x = -total / 2 + lock.displayWidth + gap + tx.width / 2;
    c.add( [ lock, tx ] );
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
