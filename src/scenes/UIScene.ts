import Phaser from 'phaser';
import { GameScene } from './GameScene.ts';
import { BgScene } from './BgScene.ts';
import { t, tn, hasText } from '../core/i18n.ts';
import { biomeBlend, groundY, layerBottom, layerIndexAt, windAt } from '../core/level.ts';
import { MID_OFF } from '../core/sim.ts';
import { save, persist, applyResult, addFail, record, starsOf, totalStars, type CoinParts } from '../core/save.ts';
import { audio } from '../core/audio.ts';
import { platform } from '../platform/platform.ts';
import { milestone, setPlace, track } from '../platform/analytics.ts';
import { findLevel, nextLevelId, levelUnlocked, worldPerfect, allLevels, WORLD_UNLOCK, worldUnlocked, maxStars } from '../levels/index.ts';
import { SKINS } from '../core/skins.ts';
import { button, label, panel, hintPanel, starsRow, uiScale, fitText, fadeIn, popIn, COLORS, inkHex, type Button } from '../ui/widgets.ts';
import { pack } from '../ui/pack.ts';
import { baseScale } from '../core/art.ts';
import { Tutorial, type TutStep } from '../ui/tutorial.ts';
import { BalloonView } from '../ui/balloonView.ts';

type Overlay = '' | 'pause' | 'fail' | 'result' | 'final';

const FREE_AFTER = 3;
const AD_EVERY = 3;

export const gasUnits = ( sec: number ) => Math.round( sec * 10 );

interface ResultInfo
{
  delivered: boolean;
  gasOk: boolean;
  stampOk: boolean;
  gas: number;
  gained: number;
  coins: number;
  parts: CoinParts;
  prevStars: number;
  newSkin?: string;
  newWorld?: number;
  // Гравець подивився рекламу «×2»: монети за рівень подвоєно
  doubled?: boolean;
}

interface Wallet
{
  num: Phaser.GameObjects.Text;
  at: { x: number; y: number };
}

export class UIScene extends Phaser.Scene
{
  private game2?: GameScene;
  private hud!: Phaser.GameObjects.Container;
  private layer!: Phaser.GameObjects.Container;
  private windG!: Phaser.GameObjects.Graphics;
  private windMarker!: Phaser.GameObjects.Image;
  private windNums: Phaser.GameObjects.Text[] = [];
  private altScale?: Phaser.GameObjects.Image;
  private gasG!: Phaser.GameObjects.Graphics;
  private gasFill?: Phaser.GameObjects.Image;
  private gasText!: Phaser.GameObjects.Text;
  private stampIcon!: Phaser.GameObjects.Image;
  private guideG?: Phaser.GameObjects.Graphics;
  private guideIcon?: Phaser.GameObjects.Image;
  private guideNum?: Phaser.GameObjects.Text;
  private guideT = 0;
  private letterIcons: Phaser.GameObjects.Image[] = [];
  private card?: Phaser.GameObjects.Container;
  private tip?: Phaser.GameObjects.Container;
  private overlay: Overlay = '';
  private result?: ResultInfo;
  private pointers = new Set<number>();
  private u = 1;
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };
  private gasRect = { x: 0, y: 0, w: 0, h: 0 };
  private busy = false;
  // Щойно показали рекламу між рівнями: до старту наступного рівня rewarded не пропонуємо (правило CrazyGames)
  private afterMidgame = false;
  // Наступна перебудова екрана результату анімує подвоєні монети
  private popGain = false;
  private tut?: Tutorial;
  private tutStep: TutStep = 'done';
  // Скільки секунд ще блимає панель вітру, коли підказка вперше пояснює шари
  private windPulse = 0;
  // Наступне вікно чи картка щойно відкриваються й мають виринути плавно; перебудова при зміні розміру — без анімації
  private pop = false;

  constructor()
  {
    super( 'ui' );
  }

  private get gs(): GameScene
  {
    return this.game2 ?? ( this.scene.get( 'game' ) as GameScene );
  }

  create(): void
  {
    this.hud = this.add.container( 0, 0 );
    this.layer = this.add.container( 0, 0 ).setDepth( 10 );
    this.input.addPointer( 2 );

    this.input.on( 'pointerdown', ( p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] ) =>
    {
      audio.unlock();
      // Тап по підказці ховає її, але не забирає тягу: гравець у повітрі
      if ( this.tip?.getBounds().contains( p.x, p.y ) )
      {
        this.hideTip();
      }
      if ( over.length > 0 || this.overlay || !this.gs || this.busy )
      {
        return;
      }
      const ph = this.gs.phase;
      if ( ph === 'intro' || ph === 'play' )
      {
        this.pointers.add( p.id );
        this.gs.setPointerBurn( true );
      }
    } );
    const release = ( p: Phaser.Input.Pointer ) =>
    {
      this.pointers.delete( p.id );
      if ( this.pointers.size === 0 )
      {
        this.gs?.setPointerBurn( false );
      }
    };
    this.input.on( 'pointerup', release );
    this.input.on( 'pointerupoutside', release );
    this.input.on( 'gameout', () =>
    {
      this.pointers.clear();
      this.gs?.setPointerBurn( false );
    } );

    const kb = this.input.keyboard!;
    kb.on( 'keydown-P', () => this.togglePause() );
    kb.on( 'keydown-R', () =>
    {
      if ( this.gs.phase !== 'editor' )
      {
        this.restart();
      }
    } );
    kb.on( 'keydown-ENTER', () =>
    {
      if ( this.overlay === 'result' )
      {
        this.goNext();
      }
      else if ( this.overlay === 'final' )
      {
        this.toMap();
      }
      else if ( this.overlay === 'fail' )
      {
        if ( this.gs.canResume() )
        {
          this.continueCheckpoint();
        }
        else
        {
          this.restart();
        }
      }
    } );

    const ev = this.game.events;
    const onReady = ( g: GameScene ) => this.bind( g );
    const onWon = () => this.onWon();
    const onFail = () => this.onFail();
    const onPlay = () => this.onPlay();
    const onDeliver = () => this.refreshIcons();
    const onStamp = () => this.refreshIcons();
    // Згорнули вкладку чи перемкнулись на іншу програму посеред польоту: ставимо паузу, щоб після повернення
    // політ не продовжився сам, а палець чи пробіл, відпущені поза грою, не лишились «натиснутими»
    const onHidden = () =>
    {
      if ( !this.overlay && this.gs?.phase === 'play' )
      {
        this.togglePause();
      }
    };
    ev.on( Phaser.Core.Events.HIDDEN, onHidden );
    ev.on( 'level-ready', onReady );
    ev.on( 'level-won', onWon );
    ev.on( 'level-failed', onFail );
    ev.on( 'play-started', onPlay );
    ev.on( 'deliver', onDeliver );
    ev.on( 'stamp', onStamp );
    this.events.once( 'shutdown', () =>
    {
      ev.off( 'level-ready', onReady );
      ev.off( 'level-won', onWon );
      ev.off( 'level-failed', onFail );
      ev.off( 'play-started', onPlay );
      ev.off( 'deliver', onDeliver );
      ev.off( 'stamp', onStamp );
      ev.off( Phaser.Core.Events.HIDDEN, onHidden );
    } );
    this.scale.on( 'resize', this.rebuild, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.rebuild, this ) );

    const g = this.scene.get( 'game' ) as GameScene;
    if ( g && g.lvl )
    {
      this.bind( g );
    }
  }

  private bind( g: GameScene ): void
  {
    this.game2 = g;
    this.overlay = '';
    this.result = undefined;
    this.pointers.clear();
    this.busy = false;
    this.windPulse = 0;
    this.tutStep = g.lvl.id === '1-1' && !save().seenTips.includes( 'tutorial' ) ? 'hold' : 'done';
    ( this.scene.get( 'bg' ) as BgScene ).setTheme( g.lvl.theme );
    this.pop = true;
    this.rebuild();
    this.pop = false;
    if ( g.resumed )
    {
      this.showTip( t( 'cpResume' ) );
    }
  }

  private rebuild(): void
  {
    if ( !this.gs?.lvl )
    {
      return;
    }
    this.u = uiScale();
    // Відкладені анімації зірок посилаються на старі об'єкти; після перебудови вони б упали й зупинили гру
    this.time.removeAllEvents();
    this.hud.removeAll( true );
    this.layer.removeAll( true );
    this.card = undefined;
    this.tip = undefined;
    this.tut = undefined;
    this.buildHud();
    // Під час навчання картка рівня не потрібна: перший крок сам пояснює, що робити
    if ( this.tutStep !== 'done' && !this.overlay )
    {
      this.tut = new Tutorial( this, this.layer, this.u, this.tutStep );
      // Без картки рівень грабельний одразу, тож «гра почалась» — уже зараз, а не на першому жарі:
      // за першою gameplayStart CrazyGames рахує час завантаження
      if ( this.gs.phase === 'intro' )
      {
        platform.gameplayStart();
      }
    }
    else if ( this.gs.phase === 'intro' && !this.gs.resumed )
    {
      // З чекпойнта картки немає: бонуси й опис рівня — для старту з початку
      this.buildCard();
    }
    else if ( this.gs.phase === 'intro' && !this.overlay )
    {
      platform.gameplayStart();
    }
    if ( this.overlay === 'pause' )
    {
      this.buildPause();
    }
    else if ( this.overlay === 'fail' )
    {
      this.buildFail();
    }
    else if ( this.overlay === 'result' && this.result )
    {
      this.buildResult( this.result, false );
    }
    else if ( this.overlay === 'final' )
    {
      this.buildFinal();
    }
  }

  // ---------- HUD ----------

  private buildHud(): void
  {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const lvl = this.gs.lvl;
    const m = 22 * u;
    const bs = 84 * u;

    const pauseBtn = button( this, m + bs / 2, m + bs / 2, { w: bs, h: bs, icon: 'i-pause', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.togglePause() } );
    this.hud.add( pauseBtn );
    const name = fitText( label( this, m * 2 + bs, m + bs / 2 - 3, lvl.id + '  ' + tn( lvl.name ), 34 * u ).setOrigin( 0, 0.5 ), w * 0.3 );
    this.hud.add( name );

    const muteBtn = button( this, w - m - bs / 2, m + bs / 2, {
      w: bs, h: bs, icon: save().sfx ? 'i-sound' : 'i-mute', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleSfx();
        muteBtn.ico?.setTexture( save().sfx ? 'i-sound' : 'i-mute' );
      }
    } );
    this.hud.add( muteBtn );
    // Музика поруч зі звуком, як на карті: обидва перемикачі в одному місці
    const musBtn = button( this, w - m - bs * 1.5 - 12 * u, m + bs / 2, {
      w: bs, h: bs, icon: save().music ? 'i-music' : 'i-musicoff', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleMusic();
        musBtn.ico?.setTexture( save().music ? 'i-music' : 'i-musicoff' );
      }
    } );
    this.hud.add( musBtn );

    const gh = 30 * u;
    // Смуга газу по центру, але не налазить на назву рівня ліворуч і на іконки праворуч
    const minX = name.x + name.width + 60 * u;
    const maxX = w - m * 2 - bs * 2 - 12 * u - 70 * u - lvl.targets.length * 62 * u - 40 * u;
    const gw = Math.max( 160 * u, Math.min( 520 * u, w * 0.34, ( maxX - minX ) ) );
    const gx = Phaser.Math.Clamp( w / 2 - gw / 2, minX, Math.max( minX, maxX - gw ) );
    this.gasRect = { x: gx, y: m + 22 * u, w: gw, h: gh };
    if ( this.textures.exists( 'gauge' ) && this.textures.exists( 'gaugefill-w' ) )
    {
      // Паперова смужка з рисками під заливкою; тягнеться лише середина, рвані торці лишаються
      const cap = Math.min( 40, this.textures.get( 'gauge' ).getSourceImage().width / 4 );
      this.hud.add( this.add.nineslice( gx + gw / 2, this.gasRect.y + gh / 2, 'gauge', undefined, gw + gh * 0.9, gh * 1.4, cap, cap, 0, 0 ) );
      // Мазок заливки обрізаємо за рівнем газу, а не стискаємо: текстура мазка лишається тією самою
      this.gasFill = this.add.image( gx, this.gasRect.y + gh / 2, 'gaugefill-w' ).setOrigin( 0, 0.5 ).setDisplaySize( gw, gh * 1.15 );
      this.hud.add( this.gasFill );
    }
    this.gasG = this.add.graphics();
    this.hud.add( this.gasG );
    const gasIcon = this.add.image( this.gasRect.x - 24 * u, this.gasRect.y + gh / 2, 'gas' );
    this.hud.add( gasIcon.setScale( 1.5 * u * baseScale( gasIcon ) ) );
    // Паперова шкала вища за кодову смугу, тож підпис трохи нижче, щоб не налазив на її край
    this.gasText = label( this, gx + gw / 2, this.gasRect.y + gh + ( this.gasFill ? 31 : 24 ) * u, '', 26 * u );
    this.hud.add( this.gasText );

    // Іконки цілей рівня праворуч: листи по черзі й марка
    const iconsRight = w - m * 2 - bs * 2 - 12 * u;
    this.stampIcon = this.add.image( iconsRight - 30 * u, m + bs / 2, 'stamp' ).setScale( 1.15 * u );
    this.hud.add( this.stampIcon );
    this.letterIcons = lvl.targets.map( ( _tg, i ) =>
    {
      const img = this.add.image( iconsRight - 100 * u - i * 62 * u, m + bs / 2, 'letter' );
      img.setScale( 1.35 * u * baseScale( img ) );
      this.hud.add( img );
      return img;
    } ).reverse();

    const pw = 96 * u;
    const top = m * 2 + bs + 40 * u;
    const ph = Math.max( 220 * u, h - top - 40 * u );
    this.panelRect = { x: m, y: top, w: pw, h: Math.min( ph, 640 * u ) };
    if ( this.textures.exists( 'altscale' ) )
    {
      // Мальована смужка неба під шкалою висоти: темніє догори, тож сама підказує, де вище
      const pr = this.panelRect;
      this.altScale = this.add.image( pr.x + pr.w / 2, pr.y + pr.h / 2, 'altscale' ).setDisplaySize( pr.w + 8 * u, pr.h + 28 * u );
      this.hud.add( this.altScale );
    }
    this.windG = this.add.graphics();
    this.hud.add( this.windG );
    // Сила вітру числом під стрілкою кожного шару (з поривами змінюється наживо)
    this.windNums = lvl.layers.map( () =>
    {
      const tx = label( this, 0, 0, '', 20 * u, this.textures.exists( 'altscale' ) ? '#3b2f2a' : '#ffffff', !this.textures.exists( 'altscale' ) );
      this.hud.add( tx );
      return tx;
    } );
    this.windMarker = this.add.image( 0, 0, 'env:' + save().equip.envelope ).setScale( 0.32 * u );
    this.hud.add( this.windMarker );
    const pr = this.panelRect;
    lvl.targets.forEach( ( tg, i ) =>
    {
      const img = this.add.image( pr.x + pr.w + 18 * u, this.mapY( tg.y - MID_OFF ), 'mailbox' ).setScale( 0.16 * u );
      this.hud.add( img );
      if ( lvl.targets.length > 1 )
      {
        this.hud.add( label( this, img.x + 18 * u, img.y - 12 * u, String( i + 1 ), 18 * u ) );
      }
    } );
    this.hud.add( this.add.image( pr.x + pr.w + 18 * u, this.mapY( lvl.stamp.y ), 'stamp' ).setScale( 0.5 * u ).setAlpha( 0.9 ) );

    this.guideG = this.add.graphics();
    this.guideIcon = this.add.image( 0, 0, 'mailbox' ).setScale( 0.21 * u );
    this.guideNum = label( this, 0, 0, '', 22 * u );
    this.hud.add( [ this.guideG, this.guideIcon, this.guideNum ] );

    this.refreshIcons();
  }

  private mapY( worldY: number ): number
  {
    const pr = this.panelRect;
    const gy = groundY( this.gs.lvl );
    return pr.y + Phaser.Math.Clamp( worldY / gy, 0, 1 ) * pr.h;
  }

  private refreshIcons(): void
  {
    const s = this.gs.s;
    this.stampIcon?.setAlpha( s.stamp ? 1 : 0.35 ).setTint( s.stamp ? 0xffffff : 0x8090b0 );
    this.letterIcons.forEach( ( img, i ) =>
    {
      img.setAlpha( i < s.target ? 1 : 0.4 );
      if ( i < s.target )
      {
        img.clearTint();
      }
      else
      {
        img.setTint( 0x8090b0 );
      }
    } );
  }

  private drawWind(): void
  {
    const g = this.windG;
    const lvl = this.gs.lvl;
    const s = this.gs.s;
    const pr = this.panelRect;
    const u = this.u;
    g.clear();
    if ( !this.altScale )
    {
      g.fillStyle( COLORS.ink, 0.45 );
      g.fillRoundedRect( pr.x, pr.y - 10 * u, pr.w, pr.h + 20 * u, 18 * u );
    }
    if ( this.windPulse > 0 )
    {
      g.lineStyle( 6 * u, 0xffd23a, ( 0.5 + 0.5 * Math.sin( this.windPulse * 8 ) ) * Math.min( 1, this.windPulse ) );
      g.strokeRoundedRect( pr.x - 6 * u, pr.y - 16 * u, pr.w + 12 * u, pr.h + 32 * u, 22 * u );
    }
    const cur = layerIndexAt( lvl, s.y - MID_OFF );
    lvl.layers.forEach( ( l, i ) =>
    {
      const y0 = this.mapY( l.top );
      const y1 = this.mapY( layerBottom( lvl, i ) );
      if ( i === cur )
      {
        // На мальованому небі низ кремовий, і білі позначки там зникають: беремо сепію
        g.fillStyle( this.altScale ? 0xc98a3a : 0xffffff, this.altScale ? 0.28 : 0.22 );
        g.fillRect( pr.x + 4 * u, y0 + 2, pr.w - 8 * u, y1 - y0 - 4 );
      }
      if ( i > 0 )
      {
        g.fillStyle( this.altScale ? 0x3b2f2a : 0xffffff, 0.5 );
        g.fillRect( pr.x + 6 * u, y0 - 1, pr.w - 12 * u, 2 );
      }
      const wind = windAt( lvl, ( l.top + layerBottom( lvl, i ) ) / 2, s.t );
      const cy = ( y0 + y1 ) / 2;
      const cx = pr.x + pr.w / 2;
      const num = this.windNums[ i ];
      if ( num )
      {
        const th0 = Math.min( 12 * u, Math.max( 5 * u, ( y1 - y0 ) * 0.18 ) );
        num.setText( String( Math.round( Math.abs( wind ) ) ) ).setPosition( cx, cy + th0 * 1.4 + 13 * u );
      }
      if ( Math.abs( wind ) < 3 )
      {
        g.fillStyle( 0xd0d8e8, 1 );
        g.fillCircle( cx, cy, 7 * u );
        return;
      }
      // Стрілка завжди одного розміру: від сили залежала довжина, і слабкий вітер втрачав древко.
      // Колір — напрямок, силу показує лише прозорість
      const dir = Math.sign( wind );
      const th = Math.min( 12 * u, Math.max( 5 * u, ( y1 - y0 ) * 0.18 ) );
      const len = Math.min( pr.w - 26 * u, th * 6 );
      const a = Phaser.Math.Clamp( 0.55 + Math.abs( wind ) / 120, 0.55, 1 );
      const pts = [ -len / 2, -th / 2, len / 2 - th * 1.8, -th / 2, len / 2 - th * 1.8, -th * 1.4, len / 2, 0,
        len / 2 - th * 1.8, th * 1.4, len / 2 - th * 1.8, th / 2, -len / 2, th / 2 ];
      const poly = [];
      for ( let k = 0; k < pts.length; k += 2 )
      {
        poly.push( new Phaser.Math.Vector2( cx + dir * pts[ k ], cy + pts[ k + 1 ] ) );
      }
      g.fillStyle( dir > 0 ? 0xffb03a : 0x5ac8ff, a );
      g.fillPoints( poly, true );
      g.lineStyle( 2 * u, 0x24304a, a * 0.6 );
      g.strokePoints( poly, true );
    } );
    const by = this.mapY( s.y - MID_OFF );
    g.lineStyle( 3 * u, this.altScale ? 0x3b2f2a : 0xffffff, 0.9 );
    g.lineBetween( pr.x, by, pr.x + pr.w, by );
    this.windMarker.setPosition( pr.x + pr.w + 2 * u, by );
  }

  // Вказівник на поточну скриньку: над нею стрілка, а коли вона поза кадром — значок біля краю екрана
  private drawGuide( dt: number ): void
  {
    const g = this.guideG;
    const icon = this.guideIcon;
    const num = this.guideNum;
    if ( !g || !icon || !num )
    {
      return;
    }
    g.clear();
    const lvl = this.gs.lvl;
    const s = this.gs.s;
    const phase = this.gs.phase;
    // Навчання має свою стрілку, а на паузі й результатах вказівник лише заважає
    const show = s.target < lvl.targets.length && !this.overlay && !this.tut && ( phase === 'play' || phase === 'intro' );
    icon.setVisible( false );
    num.setVisible( false );
    if ( !show )
    {
      return;
    }
    this.guideT += dt;
    const u = this.u;
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.gs.cameras.main;
    const tg = lvl.targets[ s.target ];
    const px = ( tg.x + tg.w / 2 - 14 - cam.worldView.x ) * cam.zoom;
    const py = ( tg.y - 70 - cam.worldView.y ) * cam.zoom;
    const pr = this.panelRect;
    // Відступ із запасом на стрілку довкола значка, щоб вона не різалася краєм екрана
    const pad = 86 * u;
    const left = pr.x + pr.w + pad;
    const right = w - pad;
    const top = 22 * u + 84 * u + pad;
    const bottom = h - pad;
    if ( px > left - 40 * u && px < right + 40 * u && py > top - 80 * u && py < bottom + 60 * u )
    {
      const bob = Math.sin( this.guideT * 6 ) * 8 * u;
      this.arrowDown( g, px, py - 58 * u + bob, 30 * u );
      return;
    }
    const cx = Phaser.Math.Clamp( px, left, right );
    const cy = Phaser.Math.Clamp( py, top, bottom );
    const ang = Math.atan2( py - cy, px - cx );
    const r = 40 * u;
    const pulse = 1 + Math.sin( this.guideT * 5 ) * 0.06;
    g.fillStyle( 0x000000, 0.18 );
    g.fillCircle( cx + 3 * u, cy + 5 * u, r * pulse );
    g.fillStyle( 0xffd23a, 1 );
    g.fillCircle( cx, cy, r * pulse );
    g.lineStyle( 4 * u, COLORS.ink, 0.85 );
    g.strokeCircle( cx, cy, r * pulse );
    // Стрілка на ободі значка показує, куди летіти
    const tip = r * 1.75;
    const base = r * 1.05;
    const sp = 0.42;
    g.fillStyle( 0xffd23a, 1 );
    g.lineStyle( 4 * u, COLORS.ink, 0.85 );
    g.beginPath();
    g.moveTo( cx + Math.cos( ang ) * tip, cy + Math.sin( ang ) * tip );
    g.lineTo( cx + Math.cos( ang + sp ) * base, cy + Math.sin( ang + sp ) * base );
    g.lineTo( cx + Math.cos( ang - sp ) * base, cy + Math.sin( ang - sp ) * base );
    g.closePath();
    g.fillPath();
    g.strokePath();
    icon.setVisible( true ).setPosition( cx, cy + 2 * u );
    if ( lvl.targets.length > 1 )
    {
      num.setVisible( true ).setText( String( s.target + 1 ) ).setPosition( cx - r * 0.7, cy - r * 0.7 );
    }
  }

  private arrowDown( g: Phaser.GameObjects.Graphics, x: number, y: number, s: number ): void
  {
    g.fillStyle( 0x000000, 0.18 );
    g.fillTriangle( x - s + 4, y - s + 6, x + s + 4, y - s + 6, x + 4, y + s * 0.6 + 6 );
    g.fillStyle( 0xffd23a, 1 );
    g.fillTriangle( x - s, y - s, x + s, y - s, x, y + s * 0.6 );
    g.lineStyle( 4 * this.u, COLORS.ink, 0.8 );
    g.strokeTriangle( x - s, y - s, x + s, y - s, x, y + s * 0.6 );
  }

  private drawGas(): void
  {
    const g = this.gasG;
    const lvl = this.gs.lvl;
    const s = this.gs.s;
    const r = this.gasRect;
    const u = this.u;
    const tank = lvl.fuel !== undefined ? lvl.fuel + this.gs.bonusFuel : lvl.gasStar * 1.6;
    const k = Phaser.Math.Clamp( s.gas / tank, 0, 1 );
    const starK = Phaser.Math.Clamp( lvl.gasStar / tank, 0, 1 );
    g.clear();
    const over = s.gas > lvl.gasStar;
    const col = lvl.fuel !== undefined && k > 0.85 ? 0xff4a3a : over ? 0xffa53a : 0x5ad86a;
    if ( this.gasFill )
    {
      const f = this.gasFill.frame;
      this.gasFill.setCrop( 0, 0, f.width * k, f.height ).setTint( col ).setVisible( k > 0 );
    }
    else
    {
      g.fillStyle( COLORS.ink, 0.6 );
      g.fillRoundedRect( r.x - 4, r.y - 4, r.w + 8, r.h + 8, ( r.h + 8 ) / 2 );
    }
    if ( k > 0 && !this.gasFill )
    {
      g.fillStyle( col, 1 );
      g.fillRoundedRect( r.x, r.y, Math.max( r.h, r.w * k ), r.h, r.h / 2 );
      g.fillStyle( 0xffffff, 0.25 );
      g.fillRoundedRect( r.x + 4, r.y + 3, Math.max( r.h - 8, r.w * k - 8 ), r.h * 0.3, r.h * 0.15 );
    }
    const sx = r.x + r.w * starK;
    g.fillStyle( 0xffd23a, 1 );
    g.fillRect( sx - 2 * u, r.y - 8 * u, 4 * u, r.h + 16 * u );
    const left = lvl.fuel !== undefined ? `  ·  ${ t( 'tank', gasUnits( Math.max( 0, tank - s.gas ) ) ) }` : '';
    this.gasText.setText( `${ t( 'gas' ) } ${ gasUnits( s.gas ) } / ${ gasUnits( lvl.gasStar ) }★${ left }` );
    this.gasText.setColor( over ? '#ffc070' : '#ffffff' );
  }

  update( _time: number, delta: number ): void
  {
    if ( !this.gs?.lvl || !this.windG || !this.gs.sys.isActive() || !this.gs.cameras?.main )
    {
      return;
    }
    const dt = Math.min( 0.05, delta / 1000 );
    this.windPulse = Math.max( 0, this.windPulse - dt );
    if ( this.tut )
    {
      this.tut.update( this.gs, dt );
      this.tutStep = this.tut.step;
    }
    this.drawWind();
    this.drawGas();
    this.drawGuide( dt );
    const cam = this.gs.cameras.main;
    const viewW = cam.width / cam.zoom;
    const span = this.gs.lvl.width - viewW;
    const bg = this.scene.get( 'bg' ) as BgScene;
    bg.progress = span > 0 ? ( cam.midPoint.x - viewW / 2 ) / span : 0.5;
    bg.camX = cam.scrollX * cam.zoom;
    bg.camY = ( cam.scrollY - ( this.gs.lvl.height - cam.height / cam.zoom ) ) * cam.zoom;
    if ( this.gs.lvl.biomes )
    {
      const k = biomeBlend( this.gs.lvl, cam.midPoint.x );
      bg.setBlend( k.a, k.b, k.mix );
    }
  }

  // ---------- Картка рівня ----------

  private buildCard(): void
  {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    const lvl = this.gs.lvl;
    const c = this.add.container( w / 2, h * 0.42 );
    this.card = c;
    this.layer.add( c );
    const cw = 660 * u;
    const ch = 420 * u;
    c.add( panel( this, cw, ch ) );
    // Внутрішні поля пергаменту: вміст не заходить на рамку
    const inner = cw - 120 * u;
    let tankW = 0;
    if ( lvl.fuel !== undefined )
    {
      const tank = fitText( label( this, cw / 2 - 60 * u, -ch / 2 + 50 * u, t( 'tank', gasUnits( lvl.fuel + this.gs.bonusFuel ) ), 24 * u, '#c85a10', false ).setOrigin( 1, 0.5 ), inner * 0.3 );
      c.add( tank );
      tankW = tank.width + 16 * u;
    }
    // Назва по центру, але не налазить на напис про бак праворуч
    c.add( fitText( label( this, 0, -ch / 2 + 50 * u, lvl.id + '  ' + tn( lvl.name ), 40 * u, inkHex(), false ), inner - tankW * 2 ) );
    const rec = record( lvl.id );
    const rows: [ boolean, string ][] = [
      [ rec.done, lvl.targets.length > 1 ? t( 'condDeliverN', lvl.targets.length ) : t( 'condDeliver' ) ],
      [ rec.gas, t( 'condGas', gasUnits( lvl.gasStar ) ) ],
      [ rec.stamp, t( 'condStamp' ) ]
    ];
    // Умови — блок рядків «зірка + текст», вирівняних ліворуч, а сам блок стоїть по центру картки
    const star = 46 * u;
    const gap = 14 * u;
    const texts = rows.map( ( [ , text ] ) => fitText( label( this, 0, 0, text, 28 * u, inkHex(), false ).setOrigin( 0, 0.5 ), inner - star - gap ) );
    const blockW = star + gap + Math.max( ...texts.map( ( tx ) => tx.width ) );
    const x0 = -blockW / 2;
    // Під назвою — попередження про складність тими ж кольорами, що й вузол на карті; умови зсуваються нижче
    let shift = 0;
    if ( lvl.difficulty )
    {
      const txt = lvl.difficulty === 'super' ? t( 'superLevel' ) : t( 'hardLevel' );
      c.add( fitText( label( this, 0, -ch / 2 + 92 * u, txt, 26 * u, lvl.difficulty === 'super' ? '#34406e' : '#7a3a82', false ), inner ) );
      shift = 18 * u;
    }
    rows.forEach( ( [ got ], i ) =>
    {
      const y = -ch / 2 + 120 * u + shift + i * 56 * u;
      c.add( this.add.image( x0 + star / 2, y, got ? 'star' : 'starEmpty' ).setDisplaySize( star, star ) );
      c.add( texts[ i ].setPosition( x0 + star + gap, y ) );
    } );
    // Нижня рамка пергаменту товста, тож кнопки стоять над нею, а не на ній
    const by = ch / 2 - 98 * u;
    const fails = save().fails[ lvl.id ] ?? 0;
    const free = fails >= FREE_AFTER;
    const btns: Button[] = [];
    // Одразу після midgame лишаємо тільки безкоштовні винагороди
    const offer = free || !this.afterMidgame;
    if ( offer && lvl.hint && !this.gs.hint )
    {
      btns.push( this.rewardButton( 'card_route', t( 'showRoute' ), 'i-route', free, fails, () =>
      {
        this.gs.showHint();
        this.rebuild();
      } ) );
    }
    if ( offer && lvl.fuel !== undefined && this.gs.bonusFuel === 0 )
    {
      btns.push( this.rewardButton( 'card_gas', t( 'plusGas' ), 'gas', free, fails, () =>
      {
        this.gs.bonusFuel = lvl.fuel! * 0.5;
        this.rebuild();
      } ) );
    }
    btns.forEach( ( b, i ) =>
    {
      b.setPosition( ( i - ( btns.length - 1 ) / 2 ) * 266 * u, by );
      c.add( b );
    } );
    const hold = fitText( label( this, 0, ch / 2 + 54 * u, '▲ ' + t( 'hold' ) + ' ▲', 38 * u ), cw );
    c.add( hold );
    this.tweens.add( { targets: hold, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
    if ( lvl.tip === 'hold' )
    {
      c.add( fitText( label( this, 0, ch / 2 + 110 * u, t( 'holdHint' ), 24 * u ), cw ) );
    }
    // На низьких екранах картка стискається між верхньою панеллю й низом, щоб не закривати газ
    const top = this.gasRect.y + this.gasRect.h + 50 * u;
    const need = ch + ( lvl.tip === 'hold' ? 170 : 100 ) * u;
    const k = Math.min( 1, ( h - top - 10 * u ) / need );
    c.setScale( k );
    c.y = k < 1 ? top + ( ch / 2 ) * k : Math.max( h * 0.42, top + ch / 2 );
    if ( this.pop )
    {
      popIn( this, c );
    }
  }

  // Кнопка винагороди: реклама, якщо доступна; інакше безрекламна альтернатива — безкоштовно після кількох спроб
  // Показ кнопки винагороди — раз на спробу й місце (кнопки перемальовуються при rebuild і resize).

  // placement — назва місця кнопки для аналітики
  private rewardButton( placement: string, text: string, icon: string, free: boolean, fails: number, grant: () => void ): Button
  {
    const u = this.u;
    const adsOk = platform.rewardedAvailable();
    // Довгі підписи йдуть у два рядки, щоб влізти в кнопку без дрібного шрифту
    const caption = free ? text + '\n' + t( 'free' ) : adsOk ? text : t( 'freeAfter', FREE_AFTER - fails );
    const b = button( this, 0, 0, {
      w: 250 * u, h: 76 * u, text: caption, icon: free || !adsOk ? icon : 'tv', size: ( adsOk && !free ? 26 : 20 ) * u,
      color: COLORS.green, dark: COLORS.greenDark,
      onClick: async () =>
      {
        if ( this.busy )
        {
          return;
        }
        if ( free )
        {
          track( 'reward', { placement, via: 'free', level: this.gs.levelId } );
          grant();
          return;
        }
        if ( !adsOk )
        {
          return;
        }
        this.busy = true;
        const ok = await platform.rewarded( placement );
        this.busy = false;
        if ( ok )
        {
          track( 'reward', { placement, via: 'ad', level: this.gs.levelId } );
          grant();
        }
        else
        {
          // Портал сказав, що реклами немає: перемальовуємо, щоб кнопка показала безрекламну альтернативу.
          // І пояснюємо, чому нагороди не буде, а то здається, що кнопка просто зникла й гравця обдурили
          if ( !platform.rewardedAvailable() )
          {
            this.rebuild();
          }
          this.showTip( t( 'noAd' ), true );
        }
      }
    } );
    if ( !free && !adsOk )
    {
      b.setEnabled( false );
    }
    return b;
  }

  private onPlay(): void
  {
    this.afterMidgame = false;
    if ( this.card )
    {
      const c = this.card;
      this.card = undefined;
      this.tweens.add( { targets: c, alpha: 0, y: c.y - 40, duration: 240, ease: 'Sine.in', onComplete: () => c.destroy() } );
    }
    const lvl = this.gs.lvl;
    if ( lvl.tip && !save().seenTips.includes( lvl.tip ) )
    {
      const key = 'tip_' + lvl.tip;
      if ( hasText( key ) && this.tutStep === 'done' )
      {
        this.showTip( t( key ) );
        if ( lvl.tip === 'layers' )
        {
          this.windPulse = 6.5;
        }
      }
      save().seenTips.push( lvl.tip );
      persist();
    }
  }

  // bottom — біля нижнього краю, щоб не закрити вікно результату чи картку рівня
  private showTip( text: string, bottom = false ): void
  {
    const u = this.u;
    const w = this.scale.width;
    const h = this.scale.height;
    this.tip?.destroy();
    // Як і бульбашка навчання: сепія на пергаменті, без обведення
    const tx = label( this, 0, 0, text, 32 * u, inkHex(), false );
    tx.setWordWrapWidth( Math.min( w * 0.7, 900 * u ) );
    const ph = Math.max( 140 * u, tx.height + 76 * u );
    const c = this.add.container( w / 2, bottom ? h - ph / 2 - 24 * u : h * 0.24 );
    c.add( hintPanel( this, tx.width + 110 * u, ph ) );
    c.add( tx );
    c.setAlpha( 0 ).setScale( 0.85 );
    this.layer.add( c );
    this.tip = c;
    this.tweens.add( { targets: c, alpha: 1, scale: 1, duration: 320, ease: 'Back.out' } );
    this.time.delayedCall( 6500, () => this.hideTip( c ) );
  }

  private hideTip( c = this.tip ): void
  {
    if ( !c || c !== this.tip )
    {
      return;
    }
    this.tip = undefined;
    this.tweens.killTweensOf( c );
    this.tweens.add( { targets: c, alpha: 0, y: c.y - 30 * this.u, duration: 300, ease: 'Sine.in', onComplete: () => c.destroy() } );
  }

  // ---------- Пауза ----------

  private togglePause(): void
  {
    const g = this.gs;
    if ( this.overlay === 'pause' )
    {
      this.overlay = '';
      g.resume();
      this.rebuild();
      return;
    }
    if ( this.overlay || ( g.phase !== 'play' && g.phase !== 'intro' ) )
    {
      return;
    }
    g.pause();
    this.overlay = 'pause';
    this.pointers.clear();
    this.pop = true;
    this.rebuild();
    this.pop = false;
  }

  private modal( cw: number, ch: number, title: string ): Phaser.GameObjects.Container
  {
    const w = this.scale.width;
    const h = this.scale.height;
    const dim = this.add.rectangle( 0, 0, w, h, 0x101830, 0.55 ).setOrigin( 0 ).setInteractive();
    this.layer.add( dim );
    const c = this.add.container( w / 2, h / 2 );
    this.layer.add( c );
    c.add( panel( this, cw, ch ) );
    c.add( fitText( label( this, 0, -ch / 2 + 62 * this.u, title, 54 * this.u, inkHex(), false ), cw - 120 * this.u ) );
    if ( this.pop )
    {
      fadeIn( this, dim );
      popIn( this, c );
    }
    return c;
  }

  private buildPause(): void
  {
    const u = this.u;
    const c = this.modal( 600 * u, 520 * u, t( 'paused' ) );
    const bw = 400 * u;
    const bh = 86 * u;
    // Три ряди кнопок рівно між заголовком і нижньою рамкою, з однаковими проміжками
    c.add( button( this, 0, -75 * u, { w: bw, h: bh, text: t( 'resume' ), icon: 'i-play', color: COLORS.green, dark: COLORS.greenDark, onClick: () => this.togglePause() } ) );
    c.add( button( this, 0, 28 * u, { w: bw, h: bh, text: t( 'restart' ), icon: 'i-retry', onClick: () => this.restart() } ) );
    c.add( button( this, 0, 131 * u, { w: bw, h: bh, text: t( 'map' ), icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
  }

  // ---------- Програш ----------

  private onFail(): void
  {
    addFail( this.gs.levelId );
    this.overlay = 'fail';
    this.tutStep = 'done';
    this.pointers.clear();
    this.pop = true;
    this.rebuild();
    this.pop = false;
  }

  private buildFail(): void
  {
    const u = this.u;
    const g = this.gs;
    const title = g.fail === 'water' ? t( 'splash' ) : g.fail === 'gas' ? t( 'outOfGas' ) : t( 'popped' );
    const resume = g.canResume();
    const c = this.modal( ( resume ? 720 : 640 ) * u, 440 * u, title );
    const fails = save().fails[ g.levelId ] ?? 0;
    const lvl = g.lvl;
    if ( resume )
    {
      // Довгий рівень і вже є доставлені листи: «Продовжити» від останньої скриньки або «Спочатку».
      // «Маршрут» теж продовжує з тієї ж скриньки з тим самим газом, лише з примарною лінією
      const cp = g.checkpoint!;
      c.add( label( this, 0, -95 * u, t( 'cpNote', cp.target, lvl.targets.length ), 24 * u, inkHex(), false ) );
      c.add( button( this, 0, -5 * u, { w: 420 * u, h: 100 * u, text: t( 'cpContinue' ), icon: 'i-play', color: COLORS.green, dark: COLORS.greenDark, size: 40 * u, onClick: () => this.continueCheckpoint() } ) );
      const route = lvl.hint && !g.hint;
      // Ряд: карта (100), «Спочатку» (240), «Маршрут» (250) з проміжками 16
      const restartW = route ? 240 : 270;
      const x0 = -( 100 + restartW + ( route ? 250 + 32 : 16 ) ) / 2 * u;
      c.add( button( this, x0 + 50 * u, 120 * u, { w: 100 * u, h: 76 * u, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
      c.add( button( this, x0 + ( 116 + restartW / 2 ) * u, 120 * u, {
        w: restartW * u, h: 76 * u, text: t( 'cpRestart' ), icon: 'i-retry', size: 26 * u, color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.restart()
      } ) );
      if ( route )
      {
        const rb = this.rewardButton( 'fail_route', t( 'showRoute' ), 'i-route', fails >= FREE_AFTER, fails, () =>
        {
          g.hint = true;
          this.continueCheckpoint();
        } );
        rb.setPosition( x0 + ( 116 + restartW + 16 + 125 ) * u, 120 * u );
        c.add( rb );
      }
      return;
    }
    c.add( button( this, 0, -20 * u, { w: 420 * u, h: 100 * u, text: t( 'retry' ), icon: 'i-retry', color: COLORS.green, dark: COLORS.greenDark, size: 40 * u, onClick: () => this.restart() } ) );
    if ( lvl.hint && !g.hint )
    {
      const rb = this.rewardButton( 'fail_route', t( 'showRoute' ), 'i-route', fails >= FREE_AFTER, fails, () =>
      {
        g.hint = true;
        this.restart();
      } );
      rb.setPosition( 70 * u, 115 * u );
      c.add( rb );
      c.add( button( this, -135 * u, 115 * u, { w: 120 * u, h: 76 * u, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
    }
    else
    {
      c.add( button( this, 0, 115 * u, { w: 270 * u, h: 76 * u, text: t( 'map' ), icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
    }
  }

  // ---------- Перемога ----------

  private onWon(): void
  {
    const g = this.gs;
    const lvl = g.lvl;
    const before = totalStars();
    const prevStars = starsOf( lvl.id );
    const gasOk = g.s.gas <= lvl.gasStar + 1e-6;
    const stampOk = g.s.stamp;
    const res = applyResult( lvl.id, gasOk, stampOk, g.s.gas, lvl.difficulty, g.stats() );
    if ( this.tutStep !== 'done' || lvl.id === '1-1' )
    {
      this.tutStep = 'done';
      if ( !save().seenTips.includes( 'tutorial' ) )
      {
        save().seenTips.push( 'tutorial' );
        persist();
      }
    }
    const info: ResultInfo = { delivered: true, gasOk, stampOk, gas: g.s.gas, gained: res.gained, coins: res.coins, parts: res.parts, prevStars };
    const f = findLevel( lvl.id )!;
    const special = SKINS.find( ( s ) => s.world === f.world.id );
    if ( special && !save().owned.includes( special.id ) && worldPerfect( f.world.id ) )
    {
      save().owned.push( special.id );
      persist();
      info.newSkin = special.id;
    }
    const after = totalStars();
    WORLD_UNLOCK.forEach( ( need, i ) =>
    {
      if ( i > 0 && before < need && after >= need )
      {
        info.newWorld = i + 1;
      }
    } );
    if ( info.newWorld )
    {
      milestone( 'm_world' + info.newWorld, { stars: after } );
    }
    if ( info.newSkin || info.newWorld || ( prevStars < 3 && starsOf( lvl.id ) === 3 ) )
    {
      platform.happytime();
    }
    const done = allLevels().filter( ( l ) => record( l.id ).done ).length;
    platform.progress( ( done / allLevels().length ) * 100 );
    save().levelsSinceAd++;
    persist();
    this.result = info;
    this.overlay = 'result';
    this.pointers.clear();
    this.hud.removeAll( true );
    this.layer.removeAll( true );
    this.buildHud();
    this.pop = true;
    this.buildResult( info, true );
    this.pop = false;
  }

  private buildResult( info: ResultInfo, animate: boolean ): void
  {
    const u = this.u;
    const lvl = this.gs.lvl;
    // Новий світ і нова куля разом — два рядки над кнопками: вікно трохи вище, щоб кнопки їх не підпирали
    const both = info.newWorld && info.newSkin ? 60 * u : 0;
    const c = this.modal( 720 * u, 680 * u + both, t( 'delivered' ) );
    const flags = [ info.delivered, info.gasOk, info.stampOk ];
    const stars = starsRow( this, 0, -165 * u, 0, 100 * u, 1.15 );
    stars.forEach( ( s, i ) =>
    {
      c.add( s );
      if ( flags[ i ] )
      {
        if ( animate )
        {
          s.setScale( 0 );
          this.time.delayedCall( 350 + i * 330, () =>
          {
            if ( !s.scene )
            {
              return;
            }
            s.setTexture( 'star' ).setDisplaySize( 100 * u, 100 * u );
            const sx = s.scaleX;
            s.setScale( 0 );
            this.tweens.add( { targets: s, scale: sx, duration: 320, ease: 'Back.out' } );
            audio.star( i );
          } );
        }
        else
        {
          s.setTexture( 'star' ).setDisplaySize( 100 * u, 100 * u );
        }
      }
    } );
    const rows = [
      t( 'condGas', gasUnits( lvl.gasStar ) ) + `  (${ gasUnits( info.gas ) })`,
      t( 'condStamp' )
    ];
    rows.forEach( ( r, i ) =>
    {
      const ok = i === 0 ? info.gasOk : info.stampOk;
      c.add( fitText( label( this, 0, -85 * u + i * 36 * u, ( ok ? '✔ ' : '✖ ' ) + r, 24 * u, ok ? '#24804a' : '#a05050', false ), 600 * u ) );
    } );
    let extraY = 150 * u;
    const late: Phaser.GameObjects.GameObject[] = [];
    // Гаманець угорі праворуч, поруч зі звуком: туди летять монети за рівень
    const wallet = this.walletBadge();
    const gainNow = info.coins * ( info.doubled ? 2 : 1 );
    // Перший показ — гаманець ще без нагороди; щойно подвоїли — без другої порції; інакше вже повний
    const from = animate ? save().coins - gainNow : this.popGain ? save().coins - info.coins : save().coins;
    wallet.num.setText( String( from ) );
    let totalAt: { x: number; y: number } | undefined;
    if ( info.coins > 0 )
    {
      // Розбивка сепією: за що саме дали монети, потім підсумок з монетою
      const p = info.parts;
      const parts: string[] = [];
      if ( p.first > 0 )
      {
        parts.push( t( 'coinsFirst', p.first ) );
      }
      if ( p.replay > 0 )
      {
        parts.push( t( 'coinsReplay', p.replay ) );
      }
      if ( p.stars > 0 )
      {
        parts.push( t( 'coinsStars', p.stars ) );
      }
      if ( p.mult > 1 )
      {
        parts.push( ( lvl.difficulty === 'super' ? t( 'superLevel' ) : t( 'hardLevel' ) ) + ' ×' + p.mult );
      }
      if ( info.doubled )
      {
        parts.push( t( 'coinsAd' ) );
      }
      // Рядки центруємо в смузі між умовами зірок і підсумком
      const rowY = 20 * u - ( parts.length - 1 ) * 14 * u;
      parts.forEach( ( txt, i ) =>
      {
        const row = fitText( label( this, 0, rowY + i * 28 * u, txt, 22 * u, inkHex(), false ), 560 * u );
        c.add( row );
        late.push( row );
      } );

      // Поруч із підсумком — реклама з винагородою «×2»: ще стільки ж монет у гаманець.
      // Кнопку показуємо, лише коли реклама справді можлива, і ховаємо після подвоєння
      const offer = !info.doubled && platform.rewardedAvailable();
      const totalY = 96 * u;
      const gained = this.add.container( offer ? -95 * u : 0, totalY );
      const num = label( this, 0, 0, t( 'coinsTotal', gainNow ), 36 * u, inkHex(), false );
      const coin = this.add.image( 0, 0, 'coin' ).setScale( 56 * u / 256 );
      const total = num.width + 8 * u + coin.displayWidth;
      num.x = -total / 2 + num.width / 2;
      coin.x = total / 2 - coin.displayWidth / 2;
      gained.add( [ num, coin ] );
      c.add( gained );
      late.push( gained );
      totalAt = { x: c.x + gained.x + coin.x, y: c.y + totalY };
      if ( this.popGain )
      {
        // Щойно подвоїли: підсумок помітно «підстрибує», щоб винагороду було видно
        gained.setScale( 1.6 );
        this.tweens.add( { targets: gained, scale: 1, duration: 420, ease: 'Back.out' } );
      }
      if ( offer )
      {
        const b = button( this, 125 * u, totalY, {
          w: 150 * u, h: 60 * u, text: '×2', icon: 'tv', size: 30 * u, color: COLORS.green, dark: COLORS.greenDark,
          onClick: () => void this.doubleCoins( info )
        } );
        c.add( b );
        late.push( b );
      }
    }
    if ( info.newWorld )
    {
      late.push( c.add( label( this, 0, extraY, t( 'worldOpen', info.newWorld ), 30 * u, '#3a8ee8', false ) ).last! );
      extraY += 42 * u;
    }
    if ( info.newSkin )
    {
      // Мініатюра кулі й «Нова куля: …», щоб гравець бачив, що саме отримав і що це шукати в магазині
      const sk = SKINS.find( ( s ) => s.id === info.newSkin );
      const row = this.add.container( 0, extraY );
      const tx = label( this, 0, 0, t( 'newBalloon', tn( sk?.name ?? info.newSkin ) ), 30 * u, '#b05ad8', false );
      row.add( tx );
      if ( this.textures.exists( 'env:' + info.newSkin ) )
      {
        const ic = this.add.image( 0, 0, 'env:' + info.newSkin );
        ic.setScale( 46 * u / ic.height );
        const gap = 10 * u;
        const left = -( ic.displayWidth + gap + tx.width ) / 2;
        ic.x = left + ic.displayWidth / 2;
        tx.x = left + ic.displayWidth + gap + tx.width / 2;
        row.add( ic );
      }
      late.push( c.add( row ).last! );
    }
    // Свято: перші ★★★ — хлопавки з листів, щойно стала третя зірка; новий світ — дощ із листів, коли вискакує «Світ N»
    if ( animate && info.prevStars < 3 && starsOf( lvl.id ) === 3 )
    {
      this.time.delayedCall( 350 + 2 * 330 + 120, () => this.confetti( false ) );
    }
    if ( animate && info.newWorld )
    {
      this.time.delayedCall( 1500, () => this.confetti( true ) );
    }
    // Нагороди вискакують по черзі, коли зірки вже стали на місце
    if ( animate )
    {
      late.forEach( ( o, i ) =>
      {
        const t0 = o as unknown as Phaser.GameObjects.Components.Transform;
        t0.setScale( 0 );
        this.tweens.add( { targets: o, scale: 1, duration: 320, delay: 1400 + i * 160, ease: 'Back.out' } );
      } );
    }
    if ( totalAt && from < save().coins )
    {
      // Монети летять з підсумку в гаманець, коли розбивка вже з'явилась
      const delay = animate ? 1400 + late.length * 160 + 250 : this.popGain ? 350 : 0;
      this.flyCoins( totalAt, wallet, from, save().coins, delay );
    }
    this.popGain = false;
    // Ряд кнопок уміщається у внутрішню частину пергаменту: 150 + 150 + 230 і проміжки по 20
    const by = 240 * u + both / 2;
    c.add( button( this, -210 * u, by, { w: 150 * u, h: 86 * u, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
    c.add( button( this, -40 * u, by, { w: 150 * u, h: 86 * u, icon: 'i-retry', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.restart( false ) } ) );
    c.add( button( this, 170 * u, by, { w: 230 * u, h: 86 * u, text: t( 'next' ), icon: 'i-next', color: COLORS.green, dark: COLORS.greenDark, size: 34 * u, onClick: () => this.goNext() } ) );
  }

  // Конфеті з мальованих конвертиків і зірочок. Хлопавки (rain = false) стріляють із верхніх кутів до центру,
  // дощ (rain = true) сиплеться з усієї ширини верху. Частинки гальмують, а тоді повільно падають, гойдаючись і крутячись
  private confetti( rain: boolean ): void
  {
    const u = this.u;
    const w = this.scale.width;
    const letter = this.textures.exists( 'p-letter' ) ? 'p-letter' : 'dot';
    const star = this.textures.exists( 'p-star' ) ? 'p-star' : letter;
    type P = Phaser.GameObjects.Particles.Particle;
    const spray = ( tex: string, size: number, tint: number[], n: number, x: number | { min: number; max: number },
      y: number | { min: number; max: number }, speedX: { min: number; max: number }, speedY: { min: number; max: number } ) =>
    {
      const k = size * u / ( this.textures.get( tex ).getSourceImage().width || size );
      const em = this.add.particles( 0, 0, tex, {
        x, y, speedX, speedY,
        // Опір повітря гасить розгін, тож частинка падає не швидше ~160 px/с; синус гойдає її з боку в бік
        accelerationX: { onEmit: () => 0, onUpdate: ( p: P, _k: string, t: number ) => -p.velocityX * 1.1 + Math.sin( t * 14 + p.angle * 0.05 ) * 160 * u },
        accelerationY: { onEmit: () => 0, onUpdate: ( p: P ) => 380 * u - p.velocityY * 2.4 },
        rotate: { onEmit: () => Math.random() * 360, onUpdate: ( _p: P, _k: string, _t: number, v: number ) => v + 3 },
        lifespan: { min: 2400, max: 3300 }, scale: { min: 0.8 * k, max: 1.15 * k }, alpha: { start: 1, end: 0, ease: 'Cubic.in' },
        tint, emitting: false
      } ).setDepth( 20 );
      em.explode( n );
      this.time.delayedCall( 3500, () => em.destroy() );
    };
    const letters = [ 0xfff6e6, 0xffe2b0, 0xffc4ae, 0xcfe0f4 ];
    const gold = [ 0xffe07a, 0xfff0b0 ];
    if ( rain )
    {
      const x = { min: 0, max: w };
      const y = { min: -260 * u, max: -30 * u };
      spray( letter, 46, letters, 55, x, y, { min: -80 * u, max: 80 * u }, { min: 0, max: 160 * u } );
      spray( star, 30, gold, 15, x, y, { min: -80 * u, max: 80 * u }, { min: 0, max: 160 * u } );
      return;
    }
    for ( const side of [ -1, 1 ] )
    {
      const x0 = side < 0 ? w * 0.03 : w * 0.97;
      const x = { min: x0 - 20 * u, max: x0 + 20 * u };
      const y = this.scale.height * 0.1;
      const sx = side < 0 ? { min: 500 * u, max: 1500 * u } : { min: -1500 * u, max: -500 * u };
      spray( letter, 46, letters, 16, x, y, sx, { min: -420 * u, max: 80 * u } );
      spray( star, 30, gold, 4, x, y, sx, { min: -420 * u, max: 80 * u } );
    }
  }

  // Лічильник монет на пергаментній плашці, угорі праворуч поруч зі звуком
  private walletBadge(): Wallet
  {
    const u = this.u;
    const w = this.scale.width;
    const m = 22 * u;
    const bs = 84 * u;
    const bw = 190 * u;
    const bh = 70 * u;
    const cx = w - m - bs * 2 - 12 * u - 24 * u - bw / 2;
    const cy = m + bs / 2;
    const box = this.add.container( cx, cy );
    box.add( panel( this, bw, bh ) );
    const coin = this.add.image( -bw / 2 + 44 * u, 0, 'coin' ).setScale( 48 * u / 256 );
    const num = label( this, -bw / 2 + 80 * u, 0, '0', 34 * u, inkHex(), false ).setOrigin( 0, 0.5 );
    box.add( [ coin, num ] );
    this.layer.add( box );
    return { num, at: { x: cx + coin.x, y: cy } };
  }

  // Кілька монет летять дугою в гаманець; кожна долетіла — лічильник докручується, монета дзенькає
  private flyCoins( from: { x: number; y: number }, wallet: Wallet, start: number, end: number, delay: number ): void
  {
    const u = this.u;
    const n = Phaser.Math.Clamp( Math.round( ( end - start ) / 4 ), 4, 8 );
    for ( let i = 0; i < n; i++ )
    {
      const img = this.add.image( from.x, from.y, 'coin' ).setScale( 40 * u / 256 ).setAlpha( 0 );
      this.layer.add( img );
      const mx = ( from.x + wallet.at.x ) / 2 + Phaser.Math.Between( -60, 60 ) * u;
      const my = Math.min( from.y, wallet.at.y ) - Phaser.Math.Between( 40, 120 ) * u;
      const path = new Phaser.Curves.QuadraticBezier( new Phaser.Math.Vector2( from.x, from.y ), new Phaser.Math.Vector2( mx, my ), new Phaser.Math.Vector2( wallet.at.x, wallet.at.y ) );
      const st = { t: 0 };
      this.tweens.add( {
        targets: st, t: 1, duration: 620, delay: delay + i * 80, ease: 'Sine.In',
        onStart: () => img.setAlpha( 1 ),
        onUpdate: () =>
        {
          const pt = path.getPoint( st.t );
          img.setPosition( pt.x, pt.y ).setScale( ( 40 - st.t * 12 ) * u / 256 );
        },
        onComplete: () =>
        {
          img.destroy();
          // Саме цей гаманець: поки монети летіли, екран могли перебудувати («Далі», «×2») — старий уже знищено,
          // а новий показує правильну суму сам
          const num = wallet.num;
          if ( !num.scene )
          {
            return;
          }
          num.setText( String( Math.round( start + ( end - start ) * ( i + 1 ) / n ) ) );
          this.tweens.add( { targets: num, scale: { from: 1.25, to: 1 }, duration: 160 } );
          audio.coin( i );
        }
      } );
    }
  }

  private async doubleCoins( info: ResultInfo ): Promise<void>
  {
    if ( this.busy || info.doubled )
    {
      return;
    }
    this.busy = true;
    const ok = await platform.rewarded( 'result_x2' );
    this.busy = false;
    if ( ok )
    {
      track( 'reward', { placement: 'result_x2', via: 'ad', level: this.gs.levelId, coins: info.coins } );
      info.doubled = true;
      save().coins += info.coins;
      persist();
      audio.buy();
      this.popGain = true;
    }
    // Після реклами (або відмови порталу) перемальовуємо: кнопка зникає, а число монет оновлюється з поштовхом
    if ( this.overlay === 'result' )
    {
      this.layer.removeAll( true );
      this.buildResult( info, false );
      if ( !ok )
      {
        this.showTip( t( 'noAd' ), true );
      }
    }
  }

  // ---------- Фінал ----------

  // Після останнього рівня гри: підсумок замість мовчазного повернення на карту
  private showFinal(): void
  {
    this.overlay = 'final';
    this.pointers.clear();
    setPlace( 'final' );
    milestone( 'm_game_complete', { stars: totalStars() } );
    platform.happytime();
    this.layer.removeAll( true );
    this.pop = true;
    this.buildFinal();
    this.pop = false;
  }

  private buildFinal(): void
  {
    const u = this.u;
    const c = this.modal( 720 * u, 660 * u, t( 'finalTitle' ) );
    // Куля гравця в його скінах, як у магазині (BalloonView стоїть низом кошика в точці y)
    const pv = new BalloonView( this, 0, 20 * u );
    pv.setScale( 2.3 * u );
    c.add( pv );
    this.tweens.add( { targets: pv, y: pv.y - 10 * u, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
    c.add( fitText( label( this, 0, 50 * u, t( 'finalStars', totalStars(), maxStars() ), 34 * u, inkHex(), false ), 600 * u ) );
    c.add( fitText( label( this, 0, 100 * u, t( 'finalThanks' ), 26 * u, inkHex(), false ), 600 * u ) );
    c.add( fitText( label( this, 0, 142 * u, t( 'finalSoon' ), 26 * u, '#24804a', false ), 600 * u ) );
    c.add( button( this, 0, 235 * u, { w: 300 * u, h: 86 * u, text: t( 'map' ), icon: 'i-map', color: COLORS.green, dark: COLORS.greenDark, size: 34 * u, onClick: () => this.toMap() } ) );
  }

  // ---------- Навігація ----------

  // Після програшу — з останньої доставленої скриньки
  private continueCheckpoint(): void
  {
    if ( this.busy )
    {
      return;
    }
    this.overlay = '';
    this.gs.resumeFromCheckpoint();
  }

  private restart( keep = true ): void
  {
    if ( this.busy )
    {
      return;
    }
    this.trackQuit( 'restart' );
    this.overlay = '';
    this.gs.restartLevel( this.gs.levelId, keep );
  }

  private async goNext(): Promise<void>
  {
    if ( this.busy )
    {
      return;
    }
    const next = nextLevelId( this.gs.levelId );
    // Реклама між рівнями — лише на природній паузі після перемоги й не частіше, ніж раз на кілька рівнів.
    // Якщо гравець щойно дивився «×2», midgame переноситься на наступний рівень (правило CrazyGames: не обидві між тими самими рівнями)
    if ( save().levelsSinceAd >= AD_EVERY && !this.result?.doubled )
    {
      save().levelsSinceAd = 0;
      persist();
      this.busy = true;
      this.afterMidgame = await platform.midgame();
      this.busy = false;
    }
    this.overlay = '';
    if ( !next )
    {
      this.showFinal();
    }
    else if ( levelUnlocked( next ) )
    {
      this.gs.restartLevel( next, false );
    }
    else
    {
      const f = next ? findLevel( next ) : undefined;
      this.toMap( f && !worldUnlocked( f.world.id ) ? f.world.id - 1 : undefined );
    }
  }

  // Гравець кинув незавершену спробу: перезапуск посеред польоту або вихід на карту.
  // Після програшу спробу вже закрив level_fail, а без польоту (картка рівня) спроби не було
  private trackQuit( action: 'restart' | 'map' ): void
  {
    const p = this.gs?.phase;
    if ( !p || p === 'won' || p === 'dead' || p === 'editor' || !this.gs.attempt )
    {
      return;
    }
    track( 'level_quit', { ...this.gs.stats(), action, phase: p } );
  }

  private toMap( world?: number ): void
  {
    if ( this.busy )
    {
      return;
    }
    this.trackQuit( 'map' );
    this.overlay = '';
    this.afterMidgame = false;
    platform.gameplayStop();
    const f = findLevel( this.gs.levelId );
    this.scene.stop( 'game' );
    // Живий фон пакета лишається під картою; старий статичний фон карта малює сама
    if ( !pack )
    {
      this.scene.stop( 'bg' );
    }
    this.scene.start( 'map', { world: world ?? f?.world.id ?? 1 } );
  }
}
