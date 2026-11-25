import Phaser from 'phaser';
import type { LevelData } from '../core/level.ts';
import { findLevel } from '../levels/index.ts';
import {
  createState, step, canBurn, hazardPos, DT, NEUTRAL, MID_OFF, ENV_OFF,
  EV_BUMP, EV_DEAD, EV_DELIVER, EV_LAND, EV_LIFTOFF, EV_STAMP, EV_WIN, type SimState
} from '../core/sim.ts';
import { WorldView, MAILBOX_SCALE } from '../ui/worldView.ts';
import { baseScale } from '../core/art.ts';
import { BalloonView } from '../ui/balloonView.ts';
import { save, persist } from '../core/save.ts';
import { skin, trailLook } from '../core/skins.ts';
import { audio } from '../core/audio.ts';
import { platform } from '../platform/platform.ts';
import { milestone, nextAttempt, setPlace, track, type Params } from '../platform/analytics.ts';

export type Phase = 'intro' | 'play' | 'paused' | 'dead' | 'won' | 'editor';
export type FailReason = '' | 'water' | 'hazard' | 'gas';

export interface GameInit
{
  levelId?: string;
  hint?: boolean;
  bonus?: number;
}

export const VIEW_H = 720;

// Мальовані частинки (з assets/trail) замість кодових: p-blob знебарвлений, тож тонується в будь-який колір
const PAINTED_PARTICLE: Record<string, string> = { dot: 'p-blob', spark: 'p-star' };

// Удар об перешкоду: світ на мить сповільнюється до SLOW_K, тримається так, а за останні SLOW_RAMP с плавно повертається
const SLOW_TIME = 0.4;
const SLOW_RAMP = 0.25;
const SLOW_K = 0.5;
// Пір'я з птаха: коричнювате в ластівки, біле в чайки
const FEATHER_TINT: Record<string, number[]> = {
  bird: [ 0xffe8cc, 0xf4d4ac, 0xfff6ea ],
  gull: [ 0xffffff, 0xf0f0f0, 0xdfe4e8 ]
};

export class GameScene extends Phaser.Scene
{
  lvl!: LevelData;
  levelId = '1-1';
  s!: SimState;
  phase: Phase = 'intro';
  fail: FailReason = '';
  hint = false;
  bonusFuel = 0;
  view!: WorldView;
  balloon!: BalloonView;
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  private squashTween?: Phaser.Tweens.Tween;
  private ghost?: Phaser.GameObjects.Graphics;
  private ghostBalloon?: Phaser.GameObjects.Image;
  private acc = 0;
  private slowT = 0;
  private slowEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private pointerBurn = false;
  private keyBurn = false;
  private stuck = 0;
  private camX = 0;
  private camY = 0;
  private ghostT = 0;
  burning = false;
  // Номер спроби на цьому рівні за весь час гри; 0 — політ ще не почався
  attempt = 0;
  editorHook?: { update( dt: number ): void };

  constructor()
  {
    super( 'game' );
  }

  init( data: GameInit ): void
  {
    this.levelId = data.levelId ?? save().lastLevel ?? '1-1';
    if ( !findLevel( this.levelId ) )
    {
      this.levelId = '1-1';
    }
    this.hint = !!data.hint;
    this.bonusFuel = data.bonus ?? 0;
    this.phase = 'intro';
    this.fail = '';
    this.acc = 0;
    this.slowT = 0;
    this.slowEmitters = [];
    this.stuck = 0;
    this.pointerBurn = false;
    this.keyBurn = false;
    this.burning = false;
    this.attempt = 0;
  }

  create(): void
  {
    const found = findLevel( this.levelId )!;
    // Копія, щоб редактор і рестарти не псували дані модуля
    this.lvl = structuredClone( found.level );
    save().lastLevel = this.levelId;
    // Годинник і твіни сцени живуть між рестартами, тож скидаємо сповільнення після удару
    this.setSlow( 1 );
    persist();
    setPlace( 'level', () => ( { ...this.stats(), phase: this.phase } ) );

    this.buildWorld();
    this.cameras.main.setBackgroundColor( 'rgba(0,0,0,0)' );

    const kb = this.input.keyboard!;
    kb.on( 'keydown', ( e: KeyboardEvent ) =>
    {
      const code = e.code;
      if ( code === 'Space' || code === 'ArrowUp' || code === 'KeyW' )
      {
        if ( !this.keyBurn )
        {
          this.keyBurn = true;
          this.press();
        }
      }
    } );
    kb.on( 'keyup', ( e: KeyboardEvent ) =>
    {
      const code = e.code;
      if ( code === 'Space' || code === 'ArrowUp' || code === 'KeyW' )
      {
        this.keyBurn = false;
      }
    } );
    kb.addCapture( 'SPACE,UP' );

    this.scale.on( 'resize', this.onResize, this );
    this.events.once( 'shutdown', () =>
    {
      this.scale.off( 'resize', this.onResize, this );
      audio.burner( false );
      platform.gameplayStop();
    } );
    this.layout( this.scale.width, this.scale.height );
    this.snapCamera();

    if ( !this.scene.isActive( 'ui' ) )
    {
      this.scene.launch( 'ui' );
    }
    this.game.events.emit( 'level-ready', this );
  }

  buildWorld(): void
  {
    this.view?.destroy();
    this.balloon?.destroy();
    this.trail?.destroy();
    this.ghost?.destroy();
    this.ghostBalloon?.destroy();
    this.trail = undefined;

    this.s = createState( this.lvl );
    this.view = new WorldView( this, this.lvl );
    this.balloon = new BalloonView( this, this.s.x, this.s.y ).setDepth( 10 );
    this.makeTrail();
    this.applyBounds();
    if ( this.hint )
    {
      this.showHint();
    }
  }

  private makeTrail(): void
  {
    const id = save().equip.trail;
    const look = trailLook( this, skin( id ) );
    if ( !look )
    {
      return;
    }
    const base = { follow: this.balloon, followOffset: { x: 0, y: -8 }, emitting: false };
    // Масштаби розраховані на кодові текстури 32 px (хмарки — 64 px); k перераховує під мальовані 64 px
    const k = look.k;
    const sc = ( start: number, end: number ) => ( { start: start * k, end: end * k } );
    const fall = { speedY: { min: 10, max: 35 }, speedX: { min: -18, max: 18 } };
    let cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
    switch ( id )
    {
      case 'trl-puff':
        cfg = { lifespan: 1300, frequency: 80, scale: look.painted ? sc( 0.5, 1.1 ) : sc( 0.5, 1.5 ), alpha: { start: 0.55, end: 0 }, speed: { min: 5, max: 20 } };
        break;
      case 'trl-spark':
        // Мальована зірка при додаванні кольорів вицвітає до плями, тож ADD лише для кодової
        cfg = { lifespan: 900, frequency: 45, scale: sc( 0.5, 0 ), alpha: { start: 1, end: 0.2 }, speed: { min: 10, max: 40 }, rotate: { min: 0, max: 180 }, blendMode: look.painted ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD };
        break;
      case 'trl-heart':
        cfg = { lifespan: 1200, frequency: 140, scale: sc( 0.55, 0.25 ), alpha: { start: 0.9, end: 0 }, speedY: { min: -30, max: -10 }, speedX: { min: -10, max: 10 } };
        break;
      case 'trl-rainbow':
        cfg = { lifespan: 1000, frequency: 22, scale: sc( 0.4, 0.1 ), alpha: { start: 0.9, end: 0 }, speed: { min: 0, max: 8 } };
        break;
      case 'trl-flower':
        cfg = { lifespan: 1300, frequency: 120, scale: sc( 0.6, 0.25 ), alpha: { start: 0.95, end: 0 }, speedY: { min: -25, max: -5 }, speedX: { min: -12, max: 12 }, rotate: { min: 0, max: 360 } };
        break;
      case 'trl-snow':
        cfg = { lifespan: 1400, frequency: 90, scale: sc( 0.45, 0.15 ), alpha: { start: 1, end: 0 }, ...fall, rotate: { min: 0, max: 360 } };
        break;
      default:
        // Листи, листя й пір'я плавно падають і трохи хитаються
        cfg = { lifespan: 1500, frequency: 150, scale: sc( 0.65, 0.42 ), alpha: { start: 0.95, end: 0 }, ...fall, rotate: { min: -40, max: 40 } };
    }
    if ( look.tint )
    {
      cfg.tint = look.tint;
    }
    this.trail = this.add.particles( 0, 0, look.tex, { ...cfg, ...base } ).setDepth( 9 );
  }

  showHint(): void
  {
    this.hint = true;
    const pts = this.lvl.hint;
    if ( !pts || pts.length < 4 )
    {
      return;
    }
    this.ghost?.destroy();
    const g = this.add.graphics().setDepth( 3 );
    for ( let i = 2; i < pts.length; i += 2 )
    {
      if ( ( i / 2 ) % 2 === 0 )
      {
        continue;
      }
      g.lineStyle( 6, 0xffffff, 0.55 );
      g.lineBetween( pts[ i - 2 ], pts[ i - 1 ] - MID_OFF, pts[ i ], pts[ i + 1 ] - MID_OFF );
    }
    this.ghost = g;
    this.ghostBalloon = this.add.image( pts[ 0 ], pts[ 1 ], 'env:' + save().equip.envelope ).setScale( 0.32 ).setAlpha( 0.45 ).setDepth( 3 );
    this.ghostT = 0;
  }

  // Подія від UI або клавіатури: перший жар знімає картку рівня й запускає політ
  press(): void
  {
    audio.unlock();
    if ( this.phase === 'intro' )
    {
      this.phase = 'play';
      platform.gameplayStart();
      this.attempt = nextAttempt( this.levelId );
      track( 'level_start', { level: this.levelId, world: this.levelId.split( '-' )[ 0 ], attempt: this.attempt, hint: this.hint, bonus_gas: this.bonusFuel > 0 } );
      milestone( 'f03_first_burn', { level: this.levelId } );
      this.game.events.emit( 'play-started' );
    }
  }

  setPointerBurn( on: boolean ): void
  {
    this.pointerBurn = on;
    if ( on )
    {
      this.press();
    }
  }

  pause(): void
  {
    if ( this.phase === 'play' || this.phase === 'intro' )
    {
      this.phase = 'paused';
      audio.burner( false );
      platform.gameplayStop();
    }
  }

  resume(): void
  {
    if ( this.phase === 'paused' )
    {
      this.phase = 'play';
      this.pointerBurn = false;
      this.keyBurn = false;
      platform.gameplayStart();
    }
  }

  // Подробиці поточної спроби для аналітики: час польоту, пройдена частина маршруту до останньої скриньки, доставлені листи
  stats(): Params
  {
    const lvl = this.lvl;
    const s = this.s;
    const end = Math.max( ...lvl.targets.map( ( t ) => t.x + t.w / 2 ) );
    const progress = Phaser.Math.Clamp( ( s.x - lvl.start.x ) / Math.max( 1, end - lvl.start.x ), 0, 1 );
    return {
      level: this.levelId,
      world: this.levelId.split( '-' )[ 0 ],
      attempt: this.attempt,
      sec: Math.round( s.t ),
      progress: Math.round( progress * 100 ),
      letters: s.target + '/' + lvl.targets.length,
      gas: Math.round( s.gas * 10 ) / 10
    };
  }

  restartLevel( levelId = this.levelId, keep = true ): void
  {
    this.scene.restart( { levelId, hint: keep && levelId === this.levelId && this.hint, bonus: keep && levelId === this.levelId ? this.bonusFuel : 0 } as GameInit );
  }

  wantsBurn(): boolean
  {
    return this.pointerBurn || this.keyBurn;
  }

  fuelLeft(): number
  {
    return this.lvl.fuel === undefined ? Infinity : this.lvl.fuel + this.bonusFuel - this.s.gas;
  }

  update( _time: number, delta: number ): void
  {
    const dt = Math.min( delta, 100 ) / 1000;
    if ( this.slowT > 0 )
    {
      this.slowT = Math.max( 0, this.slowT - dt );
      this.setSlow( this.slowT > SLOW_RAMP ? SLOW_K : Phaser.Math.Linear( 1, SLOW_K, this.slowT / SLOW_RAMP ) );
    }
    if ( this.phase === 'editor' )
    {
      this.editorHook?.update( dt );
      this.view.update( this.s.t, dt );
      return;
    }
    if ( this.phase === 'paused' )
    {
      return;
    }
    if ( this.phase === 'play' )
    {
      this.acc += dt;
      let ev = 0;
      while ( this.acc >= DT )
      {
        this.acc -= DT;
        ev |= step( this.lvl, this.s, this.wantsBurn(), this.bonusFuel );
        if ( this.s.dead || this.s.won )
        {
          break;
        }
      }
      this.handleEvents( ev );
      this.checkStuck( dt );
    }
    this.burning = this.phase === 'play' && this.wantsBurn() && canBurn( this.lvl, this.s, this.bonusFuel );
    audio.burner( this.burning );

    this.view.update( this.s.t, dt );
    if ( !this.s.dead )
    {
      this.balloon.setPosition( this.s.x, this.s.y );
      const tilt = this.s.grounded ? 0 : Phaser.Math.Clamp( this.s.vx * 0.0025, -0.12, 0.12 ) + Math.sin( this.time.now / 700 ) * 0.02;
      this.balloon.pose( this.burning, this.s.heat, tilt, dt );
    }
    if ( this.trail )
    {
      this.trail.emitting = this.phase === 'play' && !this.s.grounded;
    }
    this.updateGhost( dt );
    this.followCamera( dt );
  }

  private updateGhost( dt: number ): void
  {
    const pts = this.lvl.hint;
    if ( !this.ghostBalloon || !pts )
    {
      return;
    }
    // Підказка програє маршрут у реальному часі (точки через 0.25 с), а потім починає знову
    this.ghostT += dt / 0.25;
    const n = pts.length / 2;
    if ( this.ghostT >= n - 1 )
    {
      this.ghostT = 0;
    }
    const i = Math.floor( this.ghostT );
    const f = this.ghostT - i;
    const x = Phaser.Math.Linear( pts[ i * 2 ], pts[ i * 2 + 2 ], f );
    const y = Phaser.Math.Linear( pts[ i * 2 + 1 ], pts[ i * 2 + 3 ], f );
    this.ghostBalloon.setPosition( x, y - ENV_OFF );
  }

  private checkStuck( dt: number ): void
  {
    if ( this.phase !== 'play' || this.lvl.fuel === undefined )
    {
      return;
    }
    if ( this.fuelLeft() <= 0 && this.s.grounded && this.s.heat < NEUTRAL )
    {
      this.stuck += dt;
      if ( this.stuck > 1.6 )
      {
        this.die( 'gas' );
      }
    }
    else
    {
      this.stuck = 0;
    }
  }

  private handleEvents( ev: number ): void
  {
    if ( !ev )
    {
      return;
    }
    if ( ev & EV_LAND )
    {
      audio.land( !!( ev & EV_BUMP ) );
      this.dust( this.s.x, this.s.y, ev & EV_BUMP ? 14 : 7 );
      this.squash( ev & EV_BUMP ? 0.86 : 0.93 );
      if ( ev & EV_BUMP )
      {
        this.cameras.main.shake( 120, 0.004 );
      }
    }
    else if ( ev & EV_LIFTOFF )
    {
      // Відрив від землі: невеликий клубок пилу з-під кошика
      this.dust( this.s.x, this.s.y, 5 );
    }
    else if ( ev & EV_BUMP )
    {
      audio.bump();
    }
    if ( ev & EV_STAMP )
    {
      audio.stamp();
      this.view.hideStamp();
      const st = this.add.image( this.lvl.stamp.x, this.lvl.stamp.y, 'stamp' ).setDepth( 20 );
      this.tweens.add( { targets: st, scale: 2.2, alpha: 0, duration: 500, ease: 'Quad.out', onComplete: () => st.destroy() } );
      this.burst( this.lvl.stamp.x, this.lvl.stamp.y, 'spark', [ 0xffe07a, 0xffffff ], 16 );
      this.game.events.emit( 'stamp' );
    }
    if ( ev & EV_DELIVER )
    {
      const i = this.s.target - 1;
      const mb = this.view.mailboxes[ i ];
      // Середина скриньки над стовпчиком — туди влітає лист
      const boxY = mb.displayHeight * 0.75;
      audio.deliver();
      const letter = this.add.image( this.s.x, this.s.y - 30, 'letter' ).setDepth( 20 );
      const lk = baseScale( letter );
      letter.setScale( lk );
      this.tweens.add( {
        targets: letter, x: mb.x, y: mb.y - boxY, scale: 0.6 * lk, duration: 380, ease: 'Quad.inOut',
        onComplete: () =>
        {
          letter.destroy();
          // Лист у скриньці: прапорець опускається, скринька підстрибує
          mb.setTexture( 'mailboxDone' );
          this.burst( mb.x, mb.y - boxY, 'spark', [ 0xffd23a, 0xffffff ], 12 );
          this.tweens.add( { targets: mb, scaleY: MAILBOX_SCALE * 1.14, scaleX: MAILBOX_SCALE * 0.94, duration: 110, yoyo: true, ease: 'Sine.out' } );
        }
      } );
      this.view.setActiveTarget( this.s.target );
      // Поки лист летить, скринька ще чекає — прапорець опуститься, коли лист долетить
      mb.setTexture( 'mailbox' );
      this.game.events.emit( 'deliver', this.s.target );
      milestone( 'f04_first_letter', { level: this.levelId } );
    }
    if ( ev & EV_WIN )
    {
      this.phase = 'won';
      platform.gameplayStop();
      audio.burner( false );
      this.time.delayedCall( 500, () =>
      {
        audio.win();
        // Конфеті в кольорах акварельної палітри, а з ним — кілька листів: пошту доставлено
        this.burst( this.s.x, this.s.y - 60, 'dot', [ 0xc8574a, 0xe0b04a, 0x8fae7a, 0x7a9cc0, 0xb88aa8 ], 34 );
        if ( this.textures.exists( 'p-letter' ) )
        {
          this.burst( this.s.x, this.s.y - 60, 'p-letter', [ 0xffffff ], 8, 300, 80 );
        }
        // Куля радісно підстрибує на місці
        this.tweens.add( { targets: this.balloon, y: this.balloon.y - 26, duration: 220, ease: 'Quad.out', yoyo: true } );
      } );
      this.time.delayedCall( 1300, () => this.game.events.emit( 'level-won', this ) );
    }
    if ( ev & EV_DEAD )
    {
      this.die( this.s.dead === 'water' ? 'water' : 'hazard' );
    }
  }

  private die( reason: FailReason ): void
  {
    if ( this.phase !== 'play' )
    {
      return;
    }
    this.phase = 'dead';
    this.fail = reason;
    platform.gameplayStop();
    track( 'level_fail', { ...this.stats(), reason } );
    audio.burner( false );
    const env = skin( save().equip.envelope );
    if ( reason === 'water' )
    {
      audio.splash();
      this.burst( this.s.x, this.s.y, 'dot', [ 0x8ad0ff, 0xffffff ], 26, -260 );
      this.tweens.add( { targets: this.balloon, y: this.balloon.y + 70, alpha: 0, duration: 900, ease: 'Quad.in' } );
    }
    else if ( reason === 'hazard' )
    {
      audio.pop();
      this.cameras.main.shake( 220, 0.008 );
      this.hazardHit( env.colors.slice( 0, 3 ) );
      this.tweens.add( { targets: this.balloon, y: this.balloon.y + 120, angle: 40, alpha: 0, duration: 800, ease: 'Quad.in' } );
    }
    this.time.delayedCall( reason === 'gas' ? 200 : 900, () => this.game.events.emit( 'level-failed', this ) );
  }

  // Удар об перешкоду: спалах у точці зіткнення, клаптики оболонки, пір'я з птаха, птах відлітає, світ на мить сповільнюється
  private hazardHit( envColors: number[] ): void
  {
    const ex = this.s.x;
    const ey = this.s.y - ENV_OFF;
    // Симуляція не каже, у що саме врізались, тож беремо найближчу перешкоду
    let hit = -1;
    let best = Infinity;
    let hp = { x: ex, y: ey };
    this.lvl.hazards.forEach( ( _h, i ) =>
    {
      const p = hazardPos( this.lvl, i, this.s.t );
      const d = ( p.x - ex ) ** 2 + ( p.y - ey ) ** 2;
      if ( d < best )
      {
        best = d;
        hit = i;
        hp = p;
      }
    } );
    const kind = hit >= 0 ? this.lvl.hazards[ hit ].kind : '';
    const cx = ( ex + hp.x ) / 2;
    const cy = ( ey + hp.y ) / 2;
    const flash = this.add.image( cx, cy, 'soft' ).setTint( 0xfff4dc ).setBlendMode( Phaser.BlendModes.ADD ).setDepth( 22 ).setScale( 0.6 ).setAlpha( 0.6 );
    this.tweens.add( { targets: flash, scale: 1.6, alpha: 0, duration: 220, ease: 'Quad.out', onComplete: () => flash.destroy() } );
    this.slowEmitters.push( this.burst( ex, ey, 'dot', envColors, 30 ) );
    if ( FEATHER_TINT[ kind ] )
    {
      this.slowEmitters.push( this.feathers( cx, cy, FEATHER_TINT[ kind ] ) );
      this.view.knockHazard( hit, hp.x >= ex ? 1 : -1 );
    }
    this.slowT = SLOW_TIME;
    this.setSlow( SLOW_K );
  }

  // Пір'їнки розлітаються вбік, а тоді повільно опускаються, гойдаючись і крутячись
  private feathers( x: number, y: number, tint: number[] ): Phaser.GameObjects.Particles.ParticleEmitter
  {
    const tex = this.textures.exists( 'p-feather' ) ? 'p-feather' : 'dot';
    const k = 22 / ( this.textures.get( tex ).getSourceImage().width || 22 );
    const em = this.add.particles( x, y, tex, {
      speedX: { min: -170, max: 170 }, speedY: { min: -80, max: 30 }, gravityY: 140, maxVelocityY: 75,
      accelerationX: { onEmit: () => 0, onUpdate: ( p: Phaser.GameObjects.Particles.Particle, _k: string, t: number ) => Math.sin( t * 16 + p.angle * 0.05 ) * 240 },
      rotate: { onEmit: () => Math.random() * 360, onUpdate: ( _p: Phaser.GameObjects.Particles.Particle, _k: string, _t: number, v: number ) => v + 3 },
      lifespan: { min: 1300, max: 1900 }, scale: { min: 0.8 * k, max: 1.15 * k }, alpha: { start: 0.95, end: 0, ease: 'Cubic.in' },
      tint, emitting: false
    } ).setDepth( 21 );
    em.explode( 12 );
    this.time.delayedCall( 2100, () => em.destroy() );
    return em;
  }

  // Сповільнення світу: годинник сцени, твіни й частинки удару
  private setSlow( k: number ): void
  {
    this.time.timeScale = k;
    this.tweens.timeScale = k;
    for ( const em of this.slowEmitters )
    {
      if ( em.active )
      {
        em.timeScale = k;
      }
    }
    if ( k === 1 )
    {
      this.slowEmitters = [];
    }
  }

  private dust( x: number, y: number, n: number ): void
  {
    // Мальований клубок із тих самих частинок, що й шлейф «Puffs»; кодовий 'soft' — лише запасний
    const em = this.add.particles( x, y, this.textures.exists( 'p-puff' ) ? 'p-puff' : 'soft', {
      speedX: { min: -120, max: 120 }, speedY: { min: -40, max: -5 }, lifespan: 600,
      scale: { start: 0.35, end: 0.1 }, alpha: { start: 0.6, end: 0 }, tint: 0xe8dcc0, emitting: false
    } ).setDepth( 11 );
    em.explode( n );
    this.time.delayedCall( 800, () => em.destroy() );
  }

  // Посадка: кошик на мить присідає, оболонка трохи розходиться вшир (точка опори — низ кошика)
  private squash( k: number ): void
  {
    this.squashTween?.stop();
    this.balloon.setScale( 1 );
    this.squashTween = this.tweens.add( { targets: this.balloon, scaleY: k, scaleX: 1 + ( 1 - k ) * 0.5, duration: 90, ease: 'Quad.out', yoyo: true } );
  }

  // size — номінальний розмір частинки (як у кодової текстури 32 px), тож мальовані 64 px не виходять удвічі більшими
  burst( x: number, y: number, tex: string, tint: number[], n: number, gravity = 300, size = 32 ): Phaser.GameObjects.Particles.ParticleEmitter
  {
    // Кодові кружечки й іскри підміняємо мальованими частинками шлейфу, якщо вони завантажені
    tex = PAINTED_PARTICLE[ tex ] && this.textures.exists( PAINTED_PARTICLE[ tex ] ) ? PAINTED_PARTICLE[ tex ] : tex;
    const k = size / ( this.textures.get( tex ).getSourceImage().width || size );
    const em = this.add.particles( x, y, tex, {
      speed: { min: 80, max: 320 }, lifespan: 900, gravityY: gravity, rotate: { min: 0, max: 360 },
      scale: { start: 0.45 * k, end: 0.1 * k }, alpha: { start: 1, end: 0 }, tint, emitting: false
    } ).setDepth( 21 );
    em.explode( n );
    this.time.delayedCall( 1100, () => em.destroy() );
    return em;
  }

  private targetCam(): { x: number; y: number }
  {
    const look = Phaser.Math.Clamp( this.s.vx * 0.9, -220, 220 );
    return { x: this.s.x + look, y: this.s.y - MID_OFF };
  }

  snapCamera(): void
  {
    const t = this.targetCam();
    this.camX = t.x;
    this.camY = t.y;
    this.cameras.main.centerOn( this.camX, this.camY );
  }

  private followCamera( dt: number ): void
  {
    if ( this.phase === 'editor' )
    {
      return;
    }
    const t = this.targetCam();
    const k = 1 - Math.exp( -2.2 * dt );
    this.camX += ( t.x - this.camX ) * k;
    this.camY += ( t.y - this.camY ) * k;
    this.cameras.main.centerOn( this.camX, this.camY );
  }

  private onResize( size: Phaser.Structs.Size ): void
  {
    this.layout( size.width, size.height );
  }

  // Запас ліворуч і праворуч, щоб панель вітру не закривала кулю біля краю рівня;
  // якщо кадр вищий за рівень, зайве місце йде на небо, а земля лишається внизу
  applyBounds(): void
  {
    if ( !this.lvl || this.phase === 'editor' )
    {
      return;
    }
    const cam = this.cameras.main;
    const viewH = cam.height / cam.zoom;
    const pad = 220;
    const top = Math.min( 0, this.lvl.height - viewH );
    cam.setBounds( -pad, top, this.lvl.width + pad * 2, this.lvl.height - top );
  }

  layout( w: number, h: number ): void
  {
    const cam = this.cameras.main;
    cam.setSize( w, h );
    // Висота рівня 720 завжди влазить у кадр; на вузьких екранах обмежує ширина, щоб бачити хоч 960 по горизонталі
    cam.setZoom( Math.min( h / VIEW_H, w / 960 ) );
    this.applyBounds();
    cam.centerOn( this.camX, this.camY );
  }
}
