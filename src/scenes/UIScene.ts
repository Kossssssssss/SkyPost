import Phaser from 'phaser';
import { GameScene } from './GameScene.ts';
import { BgScene } from './BgScene.ts';
import { t, hasText } from '../core/i18n.ts';
import { groundY, layerBottom, layerIndexAt, windAt } from '../core/level.ts';
import { MID_OFF } from '../core/sim.ts';
import { save, persist, applyResult, addFail, record, starsOf, totalStars } from '../core/save.ts';
import { audio } from '../core/audio.ts';
import { platform } from '../platform/platform.ts';
import { findLevel, nextLevelId, levelUnlocked, worldPerfect, allLevels, WORLD_UNLOCK, worldUnlocked } from '../levels/index.ts';
import { SKINS } from '../core/skins.ts';
import { button, label, panel, starsRow, uiScale, COLORS, inkHex, type Button } from '../ui/widgets.ts';
import { pack } from '../ui/pack.ts';
import { Tutorial, type TutStep } from '../ui/tutorial.ts';

type Overlay = '' | 'pause' | 'fail' | 'result';

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
  prevStars: number;
  newSkin?: string;
  newWorld?: number;
}

export class UIScene extends Phaser.Scene
{
  private game2?: GameScene;
  private hud!: Phaser.GameObjects.Container;
  private layer!: Phaser.GameObjects.Container;
  private windG!: Phaser.GameObjects.Graphics;
  private windMarker!: Phaser.GameObjects.Image;
  private gasG!: Phaser.GameObjects.Graphics;
  private gasText!: Phaser.GameObjects.Text;
  private stampIcon!: Phaser.GameObjects.Image;
  private letterIcons: Phaser.GameObjects.Image[] = [];
  private card?: Phaser.GameObjects.Container;
  private tipText?: Phaser.GameObjects.Text;
  private overlay: Overlay = '';
  private result?: ResultInfo;
  private pointers = new Set<number>();
  private u = 1;
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };
  private gasRect = { x: 0, y: 0, w: 0, h: 0 };
  private busy = false;
  private tut?: Tutorial;
  private tutStep: TutStep = 'done';
  // Скільки секунд ще блимає панель вітру, коли підказка вперше пояснює шари
  private windPulse = 0;

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
    kb.on( 'keydown-ESC', () => this.togglePause() );
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
      else if ( this.overlay === 'fail' )
      {
        this.restart();
      }
    } );

    const ev = this.game.events;
    const onReady = ( g: GameScene ) => this.bind( g );
    const onWon = () => this.onWon();
    const onFail = () => this.onFail();
    const onPlay = () => this.onPlay();
    const onDeliver = () => this.refreshIcons();
    const onStamp = () => this.refreshIcons();
    // Телефон повернули вертикально посеред польоту — ставимо на паузу, щоб куля не летіла наосліп
    const onForcePause = () =>
    {
      if ( !this.overlay && this.gs?.phase === 'play' )
      {
        this.togglePause();
      }
    };
    ev.on( 'force-pause', onForcePause );
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
      ev.off( 'force-pause', onForcePause );
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
    this.rebuild();
  }

  private rebuild(): void
  {
    if ( !this.gs?.lvl )
    {
      return;
    }
    this.u = uiScale();
    this.hud.removeAll( true );
    this.layer.removeAll( true );
    this.card = undefined;
    this.tipText = undefined;
    this.tut = undefined;
    this.buildHud();
    // Під час навчання картка рівня не потрібна: перший крок сам пояснює, що робити
    if ( this.tutStep !== 'done' && !this.overlay )
    {
      this.tut = new Tutorial( this, this.layer, this.u, this.tutStep );
    }
    else if ( this.gs.phase === 'intro' )
    {
      this.buildCard();
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
    const name = label( this, m * 2 + bs, m + bs / 2 - 3, lvl.id + '  ' + lvl.name, 34 * u ).setOrigin( 0, 0.5 );
    this.hud.add( name );

    const muteBtn = button( this, w - m - bs / 2, m + bs / 2, {
      w: bs, h: bs, icon: audio.muted ? 'i-mute' : 'i-sound', color: COLORS.blue, dark: COLORS.blueDark,
      onClick: () =>
      {
        audio.toggleMute();
        muteBtn.ico?.setTexture( audio.muted ? 'i-mute' : 'i-sound' );
      }
    } );
    this.hud.add( muteBtn );

    const gh = 30 * u;
    // Смуга газу по центру, але не налазить на назву рівня ліворуч і на іконки праворуч
    const minX = name.x + name.width + 60 * u;
    const maxX = w - m * 2 - bs - 70 * u - lvl.targets.length * 62 * u - 40 * u;
    const gw = Math.max( 160 * u, Math.min( 520 * u, w * 0.34, ( maxX - minX ) ) );
    const gx = Phaser.Math.Clamp( w / 2 - gw / 2, minX, Math.max( minX, maxX - gw ) );
    this.gasRect = { x: gx, y: m + 22 * u, w: gw, h: gh };
    this.gasG = this.add.graphics();
    this.hud.add( this.gasG );
    this.hud.add( this.add.image( this.gasRect.x - 24 * u, this.gasRect.y + gh / 2, 'gas' ).setScale( 1.5 * u ) );
    this.gasText = label( this, gx + gw / 2, this.gasRect.y + gh + 24 * u, '', 26 * u );
    this.hud.add( this.gasText );

    // Іконки цілей рівня праворуч: листи по черзі й марка
    const iconsRight = w - m * 2 - bs;
    this.stampIcon = this.add.image( iconsRight - 30 * u, m + bs / 2, 'stamp' ).setScale( 1.15 * u );
    this.hud.add( this.stampIcon );
    this.letterIcons = lvl.targets.map( ( _tg, i ) =>
    {
      const img = this.add.image( iconsRight - 100 * u - i * 62 * u, m + bs / 2, 'letter' ).setScale( 1.35 * u );
      this.hud.add( img );
      return img;
    } ).reverse();

    const pw = 96 * u;
    const top = m * 2 + bs + 40 * u;
    const ph = Math.max( 220 * u, h - top - 40 * u );
    this.panelRect = { x: m, y: top, w: pw, h: Math.min( ph, 640 * u ) };
    this.windG = this.add.graphics();
    this.hud.add( this.windG );
    this.windMarker = this.add.image( 0, 0, 'env:' + save().equip.envelope ).setScale( 0.32 * u );
    this.hud.add( this.windMarker );
    const pr = this.panelRect;
    lvl.targets.forEach( ( tg, i ) =>
    {
      const img = this.add.image( pr.x + pr.w + 18 * u, this.mapY( tg.y - MID_OFF ), 'mailbox' ).setScale( 0.32 * u );
      this.hud.add( img );
      if ( lvl.targets.length > 1 )
      {
        this.hud.add( label( this, img.x + 18 * u, img.y - 12 * u, String( i + 1 ), 18 * u ) );
      }
    } );
    this.hud.add( this.add.image( pr.x + pr.w + 18 * u, this.mapY( lvl.stamp.y ), 'stamp' ).setScale( 0.5 * u ).setAlpha( 0.9 ) );

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
    g.fillStyle( COLORS.ink, 0.45 );
    g.fillRoundedRect( pr.x, pr.y - 10 * u, pr.w, pr.h + 20 * u, 18 * u );
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
        g.fillStyle( 0xffffff, 0.22 );
        g.fillRect( pr.x + 4 * u, y0 + 2, pr.w - 8 * u, y1 - y0 - 4 );
      }
      if ( i > 0 )
      {
        g.fillStyle( 0xffffff, 0.5 );
        g.fillRect( pr.x + 6 * u, y0 - 1, pr.w - 12 * u, 2 );
      }
      const wind = windAt( lvl, ( l.top + layerBottom( lvl, i ) ) / 2, s.t );
      const cy = ( y0 + y1 ) / 2;
      const cx = pr.x + pr.w / 2;
      if ( Math.abs( wind ) < 3 )
      {
        g.fillStyle( 0xd0d8e8, 1 );
        g.fillCircle( cx, cy, 7 * u );
        return;
      }
      const dir = Math.sign( wind );
      const len = Phaser.Math.Clamp( Math.abs( wind ) / 90, 0.25, 1 ) * ( pr.w - 26 * u );
      const col = dir > 0 ? 0xffb03a : 0x5ac8ff;
      const th = Math.min( 12 * u, Math.max( 5 * u, ( y1 - y0 ) * 0.18 ) );
      g.fillStyle( col, 1 );
      const tipX = cx + dir * len / 2;
      const baseX = tipX - dir * th * 2;
      if ( dir > 0 )
      {
        g.fillRect( cx - len / 2, cy - th / 2, len - th * 1.6, th );
      }
      else
      {
        g.fillRect( cx - len / 2 + th * 1.6, cy - th / 2, len - th * 1.6, th );
      }
      g.fillTriangle( tipX, cy, baseX, cy - th * 1.4, baseX, cy + th * 1.4 );
    } );
    const by = this.mapY( s.y - MID_OFF );
    g.lineStyle( 3 * u, 0xffffff, 0.9 );
    g.lineBetween( pr.x, by, pr.x + pr.w, by );
    this.windMarker.setPosition( pr.x + pr.w + 2 * u, by );
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
    g.fillStyle( COLORS.ink, 0.6 );
    g.fillRoundedRect( r.x - 4, r.y - 4, r.w + 8, r.h + 8, ( r.h + 8 ) / 2 );
    const over = s.gas > lvl.gasStar;
    const col = lvl.fuel !== undefined && k > 0.85 ? 0xff4a3a : over ? 0xffa53a : 0x5ad86a;
    if ( k > 0 )
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
    const cam = this.gs.cameras.main;
    const viewW = cam.width / cam.zoom;
    const span = this.gs.lvl.width - viewW;
    const bg = this.scene.get( 'bg' ) as BgScene;
    bg.progress = span > 0 ? ( cam.midPoint.x - viewW / 2 ) / span : 0.5;
    bg.camX = cam.scrollX * cam.zoom;
    bg.camY = ( cam.scrollY - ( this.gs.lvl.height - cam.height / cam.zoom ) ) * cam.zoom;
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
    const ch = 400 * u;
    c.add( panel( this, cw, ch ) );
    c.add( label( this, 0, -ch / 2 + 50 * u, lvl.id + '  ' + lvl.name, 40 * u, inkHex(), false ) );
    const rec = record( lvl.id );
    const rows: [ boolean, string ][] = [
      [ rec.done, lvl.targets.length > 1 ? t( 'condDeliverN', lvl.targets.length ) : t( 'condDeliver' ) ],
      [ rec.gas, t( 'condGas', gasUnits( lvl.gasStar ) ) ],
      [ rec.stamp, t( 'condStamp' ) ]
    ];
    rows.forEach( ( [ got, text ], i ) =>
    {
      const y = -ch / 2 + 120 * u + i * 56 * u;
      c.add( this.add.image( -cw / 2 + 70 * u, y, got ? 'star' : 'starEmpty' ).setDisplaySize( 46 * u, 46 * u ) );
      c.add( label( this, -cw / 2 + 110 * u, y, text, 28 * u, inkHex(), false ).setOrigin( 0, 0.5 ) );
    } );
    if ( lvl.fuel !== undefined )
    {
      c.add( label( this, cw / 2 - 40 * u, -ch / 2 + 50 * u, t( 'tank', gasUnits( lvl.fuel + this.gs.bonusFuel ) ), 24 * u, '#c85a10', false ).setOrigin( 1, 0.5 ) );
    }
    const by = ch / 2 - 62 * u;
    const fails = save().fails[ lvl.id ] ?? 0;
    const free = fails >= FREE_AFTER;
    const btns: Button[] = [];
    if ( lvl.hint && !this.gs.hint )
    {
      btns.push( this.rewardButton( t( 'showRoute' ), 'i-route', free, fails, () =>
      {
        this.gs.showHint();
        this.rebuild();
      } ) );
    }
    if ( lvl.fuel !== undefined && this.gs.bonusFuel === 0 )
    {
      btns.push( this.rewardButton( t( 'plusGas' ), 'gas', free, fails, () =>
      {
        this.gs.bonusFuel = lvl.fuel! * 0.5;
        this.rebuild();
      } ) );
    }
    btns.forEach( ( b, i ) =>
    {
      b.setPosition( ( i - ( btns.length - 1 ) / 2 ) * 290 * u, by );
      c.add( b );
    } );
    const hold = label( this, 0, ch / 2 + 54 * u, '▲ ' + t( 'hold' ) + ' ▲', 38 * u );
    c.add( hold );
    this.tweens.add( { targets: hold, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
    if ( lvl.tip === 'hold' )
    {
      c.add( label( this, 0, ch / 2 + 110 * u, t( 'holdHint' ), 24 * u ) );
    }
    // На низьких екранах картка стискається між верхньою панеллю й низом, щоб не закривати газ
    const top = this.gasRect.y + this.gasRect.h + 50 * u;
    const need = ch + ( lvl.tip === 'hold' ? 170 : 100 ) * u;
    const k = Math.min( 1, ( h - top - 10 * u ) / need );
    c.setScale( k );
    c.y = k < 1 ? top + ( ch / 2 ) * k : Math.max( h * 0.42, top + ch / 2 );
  }

  // Кнопка винагороди: реклама, якщо доступна; інакше безрекламна альтернатива — безкоштовно після кількох спроб
  private rewardButton( text: string, icon: string, free: boolean, fails: number, grant: () => void ): Button
  {
    const u = this.u;
    const adsOk = platform.rewardedAvailable();
    const caption = free ? text + ' · ' + t( 'free' ) : adsOk ? text : t( 'freeAfter', FREE_AFTER - fails );
    const b = button( this, 0, 0, {
      w: 270 * u, h: 76 * u, text: caption, icon: free || !adsOk ? icon : 'tv', size: ( free || adsOk ? 24 : 18 ) * u,
      color: COLORS.green, dark: COLORS.greenDark,
      onClick: async () =>
      {
        if ( this.busy )
        {
          return;
        }
        if ( free )
        {
          grant();
          return;
        }
        if ( !adsOk )
        {
          return;
        }
        this.busy = true;
        const ok = await platform.rewarded();
        this.busy = false;
        if ( ok )
        {
          grant();
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
    if ( this.card )
    {
      const c = this.card;
      this.card = undefined;
      this.tweens.add( { targets: c, alpha: 0, y: c.y - 40, duration: 220, onComplete: () => c.destroy() } );
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

  private showTip( text: string ): void
  {
    const w = this.scale.width;
    const h = this.scale.height;
    this.tipText?.destroy();
    const tx = label( this, w / 2, h * 0.24, text, 32 * this.u );
    this.tipText = tx;
    this.layer.add( tx );
    tx.setAlpha( 0 );
    this.tweens.add( { targets: tx, alpha: 1, duration: 300 } );
    this.tweens.add( { targets: tx, alpha: 0, delay: 6500, duration: 600, onComplete: () => tx.destroy() } );
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
    const wasIntro = g.phase === 'intro';
    g.pause();
    if ( wasIntro )
    {
      // Пауза з картки повертає на картку, а не в політ
      g.phase = 'paused';
    }
    this.overlay = 'pause';
    this.pointers.clear();
    this.rebuild();
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
    c.add( label( this, 0, -ch / 2 + 62 * this.u, title, 54 * this.u, inkHex(), false ) );
    return c;
  }

  private buildPause(): void
  {
    const u = this.u;
    const c = this.modal( 600 * u, 470 * u, t( 'paused' ) );
    const bw = 400 * u;
    const bh = 86 * u;
    c.add( button( this, 0, -60 * u, { w: bw, h: bh, text: t( 'resume' ), icon: 'i-play', color: COLORS.green, dark: COLORS.greenDark, onClick: () => this.togglePause() } ) );
    c.add( button( this, 0, 45 * u, { w: bw, h: bh, text: t( 'restart' ), icon: 'i-retry', onClick: () => this.restart() } ) );
    c.add( button( this, -100 * u, 150 * u, { w: 190 * u, h: bh, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
    const mus = button( this, 100 * u, 150 * u, {
      w: 190 * u, h: bh, icon: 'i-music', color: save().music ? COLORS.blue : COLORS.grey, dark: save().music ? COLORS.blueDark : COLORS.greyDark,
      onClick: () =>
      {
        audio.toggleMusic();
        mus.setColor( save().music ? COLORS.blue : COLORS.grey, save().music ? COLORS.blueDark : COLORS.greyDark );
      }
    } );
    c.add( mus );
  }

  // ---------- Програш ----------

  private onFail(): void
  {
    addFail( this.gs.levelId );
    this.overlay = 'fail';
    this.tutStep = 'done';
    this.pointers.clear();
    this.rebuild();
  }

  private buildFail(): void
  {
    const u = this.u;
    const g = this.gs;
    const title = g.fail === 'water' ? t( 'splash' ) : g.fail === 'gas' ? t( 'outOfGas' ) : t( 'popped' );
    const c = this.modal( 640 * u, 440 * u, title );
    c.add( button( this, 0, -20 * u, { w: 420 * u, h: 100 * u, text: t( 'retry' ), icon: 'i-retry', color: COLORS.green, dark: COLORS.greenDark, size: 40 * u, onClick: () => this.restart() } ) );
    const fails = save().fails[ g.levelId ] ?? 0;
    const lvl = g.lvl;
    if ( lvl.hint && !g.hint )
    {
      const rb = this.rewardButton( t( 'showRoute' ), 'i-route', fails >= FREE_AFTER, fails, () =>
      {
        g.hint = true;
        this.restart();
      } );
      rb.setPosition( 70 * u, 115 * u );
      c.add( rb );
      c.add( button( this, -205 * u, 115 * u, { w: 120 * u, h: 76 * u, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
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
    const res = applyResult( lvl.id, gasOk, stampOk, g.s.gas );
    if ( this.tutStep !== 'done' || lvl.id === '1-1' )
    {
      this.tutStep = 'done';
      if ( !save().seenTips.includes( 'tutorial' ) )
      {
        save().seenTips.push( 'tutorial' );
        persist();
      }
    }
    const info: ResultInfo = { delivered: true, gasOk, stampOk, gas: g.s.gas, gained: res.gained, prevStars };
    const f = findLevel( lvl.id )!;
    const special = SKINS.find( ( s ) => s.world === f.world.id );
    if ( special && !save().owned.includes( special.id ) && worldPerfect( f.world.id ) )
    {
      save().owned.push( special.id );
      persist();
      info.newSkin = special.name;
    }
    const after = totalStars();
    WORLD_UNLOCK.forEach( ( need, i ) =>
    {
      if ( i > 0 && before < need && after >= need && i < 3 )
      {
        info.newWorld = i + 1;
      }
    } );
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
    this.buildResult( info, true );
  }

  private buildResult( info: ResultInfo, animate: boolean ): void
  {
    const u = this.u;
    const lvl = this.gs.lvl;
    const c = this.modal( 720 * u, 640 * u, t( 'delivered' ) );
    const flags = [ info.delivered, info.gasOk, info.stampOk ];
    const stars = starsRow( this, 0, -140 * u, 0, 120 * u, 1.15 );
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
            s.setTexture( 'star' ).setDisplaySize( 120 * u, 120 * u );
            const sx = s.scaleX;
            s.setScale( 0 );
            this.tweens.add( { targets: s, scale: sx, duration: 320, ease: 'Back.out' } );
            audio.star( i );
          } );
        }
        else
        {
          s.setTexture( 'star' ).setDisplaySize( 120 * u, 120 * u );
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
      c.add( label( this, 0, -30 * u + i * 44 * u, ( ok ? '✔ ' : '✖ ' ) + r, 26 * u, ok ? '#24804a' : '#a05050', false ) );
    } );
    let extraY = 70 * u;
    if ( info.gained > 0 )
    {
      c.add( label( this, 0, extraY, t( 'newStars', info.gained ), 36 * u, '#ffd23a' ) );
      extraY += 46 * u;
    }
    if ( info.newWorld )
    {
      c.add( label( this, 0, extraY, t( 'world', info.newWorld ) + ' ✔', 30 * u, '#3a8ee8', false ) );
      extraY += 40 * u;
    }
    if ( info.newSkin )
    {
      c.add( label( this, 0, extraY, info.newSkin + ' ✔', 30 * u, '#b05ad8', false ) );
    }
    const by = 245 * u;
    c.add( button( this, -230 * u, by, { w: 190 * u, h: 90 * u, icon: 'i-map', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.toMap() } ) );
    c.add( button( this, -30 * u, by, { w: 170 * u, h: 90 * u, icon: 'i-retry', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.restart( false ) } ) );
    c.add( button( this, 190 * u, by, { w: 230 * u, h: 90 * u, text: t( 'next' ), icon: 'i-next', color: COLORS.green, dark: COLORS.greenDark, size: 34 * u, onClick: () => this.goNext() } ) );
  }

  // ---------- Навігація ----------

  private restart( keep = true ): void
  {
    if ( this.busy )
    {
      return;
    }
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
    // Реклама між рівнями — лише на природній паузі після перемоги й не частіше, ніж раз на кілька рівнів
    if ( save().levelsSinceAd >= AD_EVERY )
    {
      save().levelsSinceAd = 0;
      persist();
      this.busy = true;
      await platform.midgame();
      this.busy = false;
    }
    this.overlay = '';
    if ( next && levelUnlocked( next ) )
    {
      this.gs.restartLevel( next, false );
    }
    else
    {
      const f = next ? findLevel( next ) : undefined;
      this.toMap( f && !worldUnlocked( f.world.id ) ? f.world.id - 1 : undefined );
    }
  }

  private toMap( world?: number ): void
  {
    if ( this.busy )
    {
      return;
    }
    this.overlay = '';
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
