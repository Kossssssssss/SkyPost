import Phaser from 'phaser';
import { queueGameAssets, worldUrl } from './BootScene.ts';
import { FONT } from '../ui/widgets.ts';
import { currentLang, type Lang } from '../core/i18n.ts';
import { gameDataReady } from '../core/startup.ts';

// Розміри макета: гра в режимі EXPAND, тож одна сторона екрана завжди дорівнює базовій, а інша не менша
const BW = 1920;
const BH = 1080;
const SEPIA = '#3b2f2a';
const CREAM = '#fbf1dc';
// Внутрішній канал тубуса на bar.webp (1018x115). Заливка bar_fill.webp того ж розміру повторює його хвилясту форму
// (scripts/make_bar_fill.py), тож її лише обрізаємо по x від x0 до x1
const CH = { x0: 86, x1: 936, y0: 22 };
// Пальник на balloon.webp (604x1024): звідси б'є полум'я, а з кошика сиплеться шлейф
const BURNER = { x: 302, y: 722 };
const BASKET = { x: 302, y: 940 };
// Найшвидше смуга заповнюється за стільки секунд, навіть коли все вже в кеші: інакше екран лише блимне
const MIN_FILL_S = 1.7;

const TIPS: Record<Lang, string[]> = {
  uk: [ 'Розгортаємо карту…', 'Розпалюємо пальник…', 'Сортуємо листи…', 'Ловимо попутний вітер…', 'Летимо!' ],
  ru: [ 'Разворачиваем карту…', 'Разжигаем горелку…', 'Сортируем письма…', 'Ловим попутный ветер…', 'Летим!' ],
  en: [ 'Unfolding the map…', 'Lighting the burner…', 'Sorting the letters…', 'Catching a tailwind…', 'Let’s fly!' ]
};

// Екран завантаження: спершу береться лише кілька легких малюнків для нього самого, далі під ним вантажиться вся гра
export class LoadScene extends Phaser.Scene
{
  private target = 0;
  private shown = 0;
  private done = false;
  private tipIdx = -1;
  private t0 = 0;
  private map!: Phaser.GameObjects.Image;
  private shadowsLayer!: Phaser.GameObjects.Container;
  private hero!: Phaser.GameObjects.Container;
  private heroShadow!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private ui!: Phaser.GameObjects.Container;
  private fill!: Phaser.GameObjects.Image;
  private rider!: Phaser.GameObjects.Image;
  private pct!: Phaser.GameObjects.Text;
  private tip!: Phaser.GameObjects.Text;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private letterTimer?: Phaser.Time.TimerEvent;
  private heroBase = { x: 0, y: 0 };

  constructor()
  {
    super( 'load' );
  }

  preload(): void
  {
    const L = 'assets/loading/';
    this.load.image( 'ld-map', L + 'map.webp' );
    this.load.image( 'ld-balloon', L + 'balloon.webp' );
    this.load.image( 'ld-bar', L + 'bar.webp' );
    this.load.image( 'ld-barfill', L + 'bar_fill.webp' );
    this.load.image( 'ld-ribbon', L + 'ribbon.webp' );
    // Ці ключі збігаються з ключами гри: BootScene потім підмінить ними намальовані кодом текстури
    for ( const id of [ 'flame', 'flame1', 'flame2', 'bird0', 'bird1', 'letter', 'gaugefill' ] )
    {
      this.load.image( 'pk-' + id, worldUrl( id ) );
    }
    for ( const id of [ 'cloud_wisp', 'cloud_puff', 'cloud_bank' ] )
    {
      this.load.image( 'pw-' + id, worldUrl( id ) );
    }
    this.load.image( 'p-puff', 'assets/trail/p-puff.png' );
    // Під ключем гри: кулька на смузі — той самий скін, тож гра не вантажить його вдруге
    this.load.image( 'pk-env-classic', 'assets/balloon/env-classic.png' );
  }

  create(): void
  {
    document.getElementById( 'loading' )?.remove();
    this.t0 = this.time.now;
    this.cameras.main.setBackgroundColor( '#efe4cc' );

    this.buildWorld();
    this.buildUi();
    this.layout();
    this.scale.on( 'resize', this.layout, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.layout, this ) );

    // Тепер решта гри, з відсотками на смузі
    this.load.on( 'progress', ( p: number ) => { this.target = p; } );
    this.load.once( 'complete', () => { this.target = 1; } );
    // Файли гри ставимо в чергу, щойно готові SDK, сейв і мова (мова могла змінитися — перемальовуємо підказку)
    void gameDataReady().then( () =>
    {
      if ( !this.sys.isActive() )
      {
        return;
      }
      this.tipIdx = -1;
      queueGameAssets( this );
      if ( this.load.totalToLoad === 0 )
      {
        this.target = 1;
      }
      else
      {
        this.load.start();
      }
    } );
  }

  private buildWorld(): void
  {
    // Карта повільно пливе під кулею: так здається, що ми летимо над нею
    this.map = this.add.image( 0, 0, 'ld-map' );
    this.tweens.add( { targets: this.map, x: '-=70', y: '-=24', duration: 14000, ease: 'Sine.InOut', yoyo: true, repeat: -1 } );

    // Тіні хмар на землі: ті самі хмари, затоновані сепією й майже прозорі
    this.shadowsLayer = this.add.container( 0, 0 );
    for ( let i = 0; i < 4; i++ )
    {
      const s = this.add.image( 0, 0, i % 2 ? 'pw-cloud_puff' : 'pw-cloud_bank' ).setTint( 0x3b2f2a ).setAlpha( 0.1 ).setScale( 1.6 + i * 0.3 );
      this.shadowsLayer.add( s );
      this.drift( s, 26000 + i * 7000, i / 4, 0.62 + 0.38 * ( ( i * 37 ) % 10 ) / 10 );
    }

    // Птахи далеко внизу, між картою й кулею
    if ( !this.anims.exists( 'ld-flap' ) )
    {
      this.anims.create( { key: 'ld-flap', frames: [ { key: 'pk-bird0' }, { key: 'pk-bird1' } ], frameRate: 5, repeat: -1 } );
    }
    for ( let i = 0; i < 3; i++ )
    {
      const b = this.add.sprite( 0, 0, 'pk-bird0' ).setScale( 0.32 - i * 0.05 ).play( { key: 'ld-flap', startFrame: i % 2 } );
      b.setFlipX( true );
      this.flyBird( b, 2600 + i * 1900 );
    }

    // Тінь кулі на карті: що вище піднімається куля, то менша й блідіша тінь
    this.heroShadow = this.add.image( 0, 0, 'ld-balloon' ).setTint( 0x3b2f2a ).setAlpha( 0.16 ).setScale( 0.22, 0.12 );

    // Шлейф з кошика: клубочки диму відстають і тануть позаду кулі
    this.trail = this.add.particles( 0, 0, 'p-puff', {
      speedX: { min: -150, max: -90 },
      speedY: { min: -14, max: 26 },
      scale: { start: 0.5, end: 1.5 },
      alpha: { start: 0.55, end: 0 },
      rotate: { min: 0, max: 360 },
      lifespan: 2400,
      frequency: 130,
      tint: 0xf3e7d0
    } );

    this.hero = this.add.container( 0, 0 );
    const balloon = this.add.image( 0, 0, 'ld-balloon' ).setOrigin( 0.5, 0 );
    // Тепле світло полум'я на оболонці: збільшене полум'я в режимі ADD, ледь видиме
    this.glow = this.add.image( BURNER.x - 302, BURNER.y - 70, 'pk-flame' ).setOrigin( 0.5, 0.5 ).setScale( 3.2, 2.4 ).setBlendMode( Phaser.BlendModes.ADD ).setAlpha( 0.22 );
    this.flame = this.add.image( BURNER.x - 302, BURNER.y, 'pk-flame' ).setOrigin( 0.5, 1 ).setScale( 0.62 );
    this.hero.add( [ balloon, this.glow, this.flame ] );
    const frames = [ 'pk-flame', 'pk-flame1', 'pk-flame2' ].filter( ( k ) => this.textures.exists( k ) );
    let f = 0;
    this.time.addEvent( { delay: 90, loop: true, callback: () =>
    {
      f = ( f + 1 ) % frames.length;
      this.flame.setTexture( frames[ f ] );
    } } );

    // Хмари перед кулею: пролітають швидше за карту, звідси відчуття висоти й швидкості
    for ( let i = 0; i < 3; i++ )
    {
      const c = this.add.image( 0, 0, [ 'pw-cloud_wisp', 'pw-cloud_puff', 'pw-cloud_wisp' ][ i ] ).setAlpha( 0.9 ).setScale( 1.1 + i * 0.35 );
      this.drift( c, 9000 + i * 4200, ( i * 0.37 ) % 1, [ 0.16, 0.86, 0.5 ][ i ] );
    }

    // Час від часу з кошика вилітає лист і, крутячись, відлітає назад
    this.letterTimer = this.time.addEvent( { delay: 900, loop: true, callback: () => this.dropLetter() } );
  }

  // Об'єкт безкінечно пропливає справа наліво; phase — звідки починає перший прохід, yk — висота в частках екрана
  private drift( o: Phaser.GameObjects.Image, duration: number, phase: number, yk: number ): void
  {
    const run = ( from: number ) =>
    {
      const w = this.scale.width;
      const pad = o.displayWidth * 0.6 + 200;
      const x0 = w + pad;
      const x1 = -pad;
      o.setPosition( x0 + ( x1 - x0 ) * from, this.scale.height * yk );
      this.tweens.add( { targets: o, x: x1, duration: duration * ( 1 - from ), onComplete: () => run( 0 ) } );
    };
    run( phase );
  }

  private flyBird( b: Phaser.GameObjects.Sprite, delay: number ): void
  {
    const w = this.scale.width;
    const h = this.scale.height;
    const y = h * Phaser.Math.FloatBetween( 0.25, 0.7 );
    b.setPosition( w + 120, y );
    this.tweens.add( {
      targets: b, x: -120, y: y + Phaser.Math.Between( -90, 60 ), duration: Phaser.Math.Between( 9000, 12000 ), delay, ease: 'Linear',
      onComplete: () => this.flyBird( b, Phaser.Math.Between( 1500, 5000 ) )
    } );
  }

  private dropLetter(): void
  {
    if ( this.done || Math.random() < 0.45 )
    {
      return;
    }
    const k = this.hero.scale;
    const x = this.hero.x + ( BASKET.x - 302 ) * k;
    const y = this.hero.y + ( BASKET.y - 60 ) * k;
    const l = this.add.image( x, y, 'pk-letter' ).setScale( 0.28 * k ).setAngle( Phaser.Math.Between( -20, 20 ) );
    this.children.moveBelow( l, this.hero );
    this.tweens.add( {
      targets: l,
      x: x - Phaser.Math.Between( 380, 620 ) * k,
      y: y + Phaser.Math.Between( 120, 320 ) * k,
      angle: l.angle + Phaser.Math.Between( 200, 420 ) * ( Math.random() < 0.5 ? -1 : 1 ),
      scale: 0.16 * k,
      alpha: { from: 1, to: 0 },
      duration: Phaser.Math.Between( 2600, 3400 ),
      ease: 'Sine.Out',
      onComplete: () => l.destroy()
    } );
  }

  private buildUi(): void
  {
    this.ui = this.add.container( 0, 0 );

    const ribbon = this.add.image( 0, -440, 'ld-ribbon' ).setScale( 0.92 );
    // Назва гри на стрічці — завжди англійською, як бренд, незалежно від мови
    const title = this.add.text( 0, -446, 'Sky Post', {
      fontFamily: FONT, fontSize: '78px', fontStyle: 'bold', color: CREAM, align: 'center'
    } ).setOrigin( 0.5 ).setStroke( SEPIA, 9 );
    // Довга назва (укр.) не має вилазити за стрічку
    title.setScale( Math.min( 1, 620 / title.width ) );
    this.tweens.add( { targets: [ ribbon, title ], y: '+=8', duration: 2200, ease: 'Sine.InOut', yoyo: true, repeat: -1 } );

    const barY = 400;
    const bar = this.add.image( 0, barY, 'ld-bar' ).setScale( 0.82 );
    const bk = bar.scale;
    const bx0 = -bar.displayWidth / 2;
    const by0 = barY - bar.displayHeight / 2;
    // Заливка за формою каналу лежить точно поверх смуги; росте обрізанням, а не масштабом, щоб мазки не пливли
    this.fill = this.add.image( 0, barY, 'ld-barfill' ).setScale( bk ).setTint( 0xe9b98a );
    this.fill.setCrop( 0, 0, 0, this.fill.height );
    // Маленька кулька їде по смузі на краю заливки
    this.rider = this.add.image( bx0 + CH.x0 * bk, by0 + CH.y0 * bk - 4, 'pk-env-classic' ).setOrigin( 0.5, 1 ).setScale( 0.62 );
    this.tweens.add( { targets: this.rider, angle: { from: -6, to: 6 }, duration: 900, ease: 'Sine.InOut', yoyo: true, repeat: -1 } );

    this.pct = this.add.text( 0, barY + 2, '0%', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: SEPIA
    } ).setOrigin( 0.5 );
    this.tip = this.add.text( 0, barY + 86, '', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: SEPIA, align: 'center'
    } ).setOrigin( 0.5 ).setStroke( CREAM, 8 );

    this.ui.add( [ ribbon, title, bar, this.fill, this.rider, this.pct, this.tip ] );
  }

  // Статична копія першого кадру цього екрана є в index.html (видно, поки вантажиться код): розкладку й числа міняти разом
  private layout(): void
  {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize( w, h );
    // Карта накриває весь екран із запасом на панорамування
    const cover = Math.max( w / BW, h / BH ) * 1.08;
    this.tweens.killTweensOf( this.map );
    this.map.setScale( cover ).setPosition( w / 2 + 35, h / 2 + 12 );
    this.tweens.add( { targets: this.map, x: '-=70', y: '-=24', duration: 14000, ease: 'Sine.InOut', yoyo: true, repeat: -1 } );

    // На вузькому портретному екрані середня смуга вища, тож рознесемо назву й смугу далі
    const tall = h / w > 1.2;
    this.ui.setPosition( w / 2, h / 2 + ( tall ? -40 : 0 ) ).setScale( tall ? 1.6 : 1 );

    const k = tall ? 1.05 : 0.6;
    this.hero.setScale( k );
    this.heroBase.x = w / 2 + ( tall ? 0 : 40 );
    this.heroBase.y = h / 2 - 1024 * k * 0.5 - ( tall ? 40 : 20 );
  }

  update( time: number, dt: number ): void
  {
    // Куля погойдується й ледь хилиться, тінь повторює рух унизу
    const s = ( time - this.t0 ) / 1000;
    const bob = Math.sin( s * 1.3 ) * 16 + Math.sin( s * 0.47 ) * 10;
    const k = this.hero.scale;
    this.hero.setPosition( this.heroBase.x, this.heroBase.y + bob * k / 0.6 );
    this.hero.setAngle( Math.sin( s * 0.9 ) * 2.2 );
    this.heroShadow.setPosition( this.heroBase.x + 160 * k, this.heroBase.y + 1024 * k * 1.12 );
    this.heroShadow.setScale( ( 0.22 - bob * 0.0016 ) * k / 0.6, ( 0.1 - bob * 0.0008 ) * k / 0.6 );
    this.heroShadow.setAlpha( 0.15 - bob * 0.0015 );
    this.glow.setAlpha( 0.18 + Math.sin( s * 9 ) * 0.05 + Math.random() * 0.04 );
    this.flame.setScale( 0.62 + Math.sin( s * 11 ) * 0.04, 0.62 + Math.sin( s * 13 ) * 0.06 );
    this.trail.setPosition( this.hero.x + ( BASKET.x - 302 ) * k - 60 * k, this.hero.y + BASKET.y * k - 30 * k );

    // Смуга наздоганяє справжній прогрес, але не швидше за MIN_FILL_S на всю довжину
    this.shown = Math.min( this.target, this.shown + dt / 1000 / MIN_FILL_S );
    const cut = CH.x0 + ( CH.x1 - CH.x0 ) * this.shown;
    this.fill.setCrop( 0, 0, this.shown > 0 ? cut : 0, this.fill.height );
    this.rider.x = this.fill.x - this.fill.displayWidth / 2 + cut * this.fill.scaleX;
    this.pct.setText( Math.round( this.shown * 100 ) + '%' );

    const tips = TIPS[ currentLang() ];
    const idx = this.shown >= 1 ? tips.length - 1 : Math.min( tips.length - 2, Math.floor( this.shown * ( tips.length - 1 ) ) );
    if ( idx !== this.tipIdx )
    {
      this.tipIdx = idx;
      this.tip.setText( tips[ idx ] ).setAlpha( 0 );
      this.tweens.add( { targets: this.tip, alpha: 1, duration: 260 } );
    }

    if ( this.shown >= 1 && !this.done )
    {
      this.done = true;
      this.finish();
    }
  }

  // Гра стартує під цим екраном, а він тане, поки куля злітає вгору
  private finish(): void
  {
    this.letterTimer?.remove();
    this.time.delayedCall( 450, () =>
    {
      this.scene.launch( 'boot' );
      this.scene.bringToTop();
      this.trail.stop();
      this.tweens.add( { targets: this.heroBase, y: '-=420', duration: 1100, ease: 'Sine.In' } );
      // Після зникнення великі текстури екрана більше не потрібні
      this.events.once( 'shutdown', () => setTimeout( () =>
      {
        for ( const k of [ 'ld-map', 'ld-balloon', 'ld-bar', 'ld-barfill', 'ld-ribbon' ] )
        {
          this.textures.remove( k );
        }
      }, 0 ) );
      this.tweens.add( { targets: this.cameras.main, alpha: 0, duration: 800, delay: 250, ease: 'Sine.In', onComplete: () => this.scene.stop() } );
    } );
  }
}
