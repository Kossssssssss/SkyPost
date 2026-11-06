import Phaser from 'phaser';
import type { LevelData } from '../core/level.ts';
import { findLevel } from '../levels/index.ts';
import {
  createState, step, canBurn, DT, NEUTRAL, MID_OFF, ENV_OFF,
  EV_BUMP, EV_DEAD, EV_DELIVER, EV_LAND, EV_STAMP, EV_WIN, type SimState
} from '../core/sim.ts';
import { WorldView } from '../ui/worldView.ts';
import { BalloonView } from '../ui/balloonView.ts';
import { save, persist } from '../core/save.ts';
import { skin } from '../core/skins.ts';
import { audio } from '../core/audio.ts';
import { platform } from '../platform/platform.ts';

export type Phase = 'intro' | 'play' | 'paused' | 'dead' | 'won' | 'editor';
export type FailReason = '' | 'water' | 'hazard' | 'gas';

export interface GameInit
{
  levelId?: string;
  hint?: boolean;
  bonus?: number;
}

export const VIEW_H = 720;

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
  private ghost?: Phaser.GameObjects.Graphics;
  private ghostBalloon?: Phaser.GameObjects.Image;
  private acc = 0;
  private pointerBurn = false;
  private keyBurn = false;
  private stuck = 0;
  private camX = 0;
  private camY = 0;
  private ghostT = 0;
  burning = false;
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
    this.stuck = 0;
    this.pointerBurn = false;
    this.keyBurn = false;
    this.burning = false;
  }

  create(): void
  {
    const found = findLevel( this.levelId )!;
    // Копія, щоб редактор і рестарти не псували дані модуля
    this.lvl = structuredClone( found.level );
    save().lastLevel = this.levelId;
    persist();

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
    const sk = skin( id );
    const base = { follow: this.balloon, followOffset: { x: 0, y: -8 }, emitting: false };
    let cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig | undefined;
    let tex = 'soft';
    switch ( id )
    {
      case 'trl-puff':
        cfg = { lifespan: 1300, frequency: 80, scale: { start: 0.25, end: 0.75 }, alpha: { start: 0.55, end: 0 }, speed: { min: 5, max: 20 }, tint: sk.colors };
        break;
      case 'trl-spark':
        tex = 'spark';
        cfg = { lifespan: 900, frequency: 45, scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0.2 }, speed: { min: 10, max: 40 }, rotate: { min: 0, max: 180 }, tint: sk.colors, blendMode: Phaser.BlendModes.ADD };
        break;
      case 'trl-heart':
        tex = 'heart';
        cfg = { lifespan: 1200, frequency: 140, scale: { start: 0.55, end: 0.25 }, alpha: { start: 0.9, end: 0 }, speedY: { min: -30, max: -10 }, speedX: { min: -10, max: 10 }, tint: sk.colors };
        break;
      case 'trl-rainbow':
        tex = 'dot';
        cfg = { lifespan: 1000, frequency: 22, scale: { start: 0.4, end: 0.1 }, alpha: { start: 0.9, end: 0 }, speed: { min: 0, max: 8 }, tint: sk.colors };
        break;
    }
    if ( cfg )
    {
      this.trail = this.add.particles( 0, 0, tex, { ...cfg, ...base } ).setDepth( 9 );
    }
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
      if ( ev & EV_BUMP )
      {
        this.cameras.main.shake( 120, 0.004 );
      }
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
      audio.deliver();
      const letter = this.add.image( this.s.x, this.s.y - 30, 'letter' ).setDepth( 20 );
      this.tweens.add( {
        targets: letter, x: mb.x, y: mb.y - 46, scale: 0.6, duration: 380, ease: 'Quad.inOut',
        onComplete: () =>
        {
          letter.destroy();
          this.burst( mb.x, mb.y - 46, 'spark', [ 0xffd23a, 0xffffff ], 12 );
          this.tweens.add( { targets: mb, scaleY: mb.scaleY * 1.15, duration: 90, yoyo: true } );
        }
      } );
      this.view.setActiveTarget( this.s.target );
      this.game.events.emit( 'deliver', this.s.target );
    }
    if ( ev & EV_WIN )
    {
      this.phase = 'won';
      platform.gameplayStop();
      audio.burner( false );
      this.time.delayedCall( 500, () =>
      {
        audio.win();
        this.burst( this.s.x, this.s.y - 60, 'dot', [ 0xff4a4a, 0xffd23a, 0x4ad86a, 0x4aa8ff, 0xa66aff ], 40 );
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
      this.burst( this.s.x, this.s.y - ENV_OFF, 'dot', env.colors.slice( 0, 3 ), 30 );
      this.tweens.add( { targets: this.balloon, y: this.balloon.y + 120, angle: 40, alpha: 0, duration: 800, ease: 'Quad.in' } );
    }
    this.time.delayedCall( reason === 'gas' ? 200 : 900, () => this.game.events.emit( 'level-failed', this ) );
  }

  private dust( x: number, y: number, n: number ): void
  {
    const em = this.add.particles( x, y, 'soft', {
      speedX: { min: -120, max: 120 }, speedY: { min: -40, max: -5 }, lifespan: 600,
      scale: { start: 0.35, end: 0.1 }, alpha: { start: 0.6, end: 0 }, tint: 0xe8dcc0, emitting: false
    } ).setDepth( 11 );
    em.explode( n );
    this.time.delayedCall( 800, () => em.destroy() );
  }

  burst( x: number, y: number, tex: string, tint: number[], n: number, gravity = 300 ): void
  {
    const em = this.add.particles( x, y, tex, {
      speed: { min: 80, max: 320 }, lifespan: 900, gravityY: gravity, rotate: { min: 0, max: 360 },
      scale: { start: 0.45, end: 0.1 }, alpha: { start: 1, end: 0 }, tint, emitting: false
    } ).setDepth( 21 );
    em.explode( n );
    this.time.delayedCall( 1100, () => em.destroy() );
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
