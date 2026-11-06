import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene.ts';
import { ENV_OFF } from '../core/sim.ts';
import { t, type TextKey } from '../core/i18n.ts';
import { inkHex, label, panel } from './widgets.ts';

// Навчання на першому рівні: по одному короткому кроку, кожен із маркером у світі гри
export type TutStep = 'hold' | 'release' | 'stamp' | 'land' | 'done';

const TEXT: Record<Exclude<TutStep, 'done'>, TextKey> = {
  hold: 'tut_hold',
  release: 'tut_release',
  stamp: 'tut_stamp',
  land: 'tut_land'
};

export class Tutorial
{
  step: TutStep;
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;
  private u: number;
  private bubble?: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private t = 0;
  private airborne = 0;
  private calm = 0;

  constructor( scene: Phaser.Scene, layer: Phaser.GameObjects.Container, u: number, step: TutStep )
  {
    this.scene = scene;
    this.layer = layer;
    this.u = u;
    this.step = step;
    this.g = scene.add.graphics();
    layer.add( this.g );
    this.showText();
  }

  destroy(): void
  {
    this.g.destroy();
    this.bubble?.destroy();
  }

  private go( step: TutStep ): void
  {
    this.step = step;
    this.showText();
  }

  private showText(): void
  {
    this.bubble?.destroy();
    this.bubble = undefined;
    if ( this.step === 'done' )
    {
      return;
    }
    const u = this.u;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    // Панель світла, тож текст темний і без обведення — так він читається на пергаменті
    const tx = label( this.scene, 0, 0, t( TEXT[ this.step ] ), 36 * u, inkHex(), false );
    tx.setWordWrapWidth( Math.min( w * 0.7, 900 * u ) );
    const c = this.scene.add.container( w / 2, h * 0.27 );
    // Пергамент нижчий за свої кути виглядає рваною смужкою, тож тримаємо мінімальну висоту
    c.add( panel( this.scene, tx.width + 110 * u, Math.max( 150 * u, tx.height + 80 * u ) ) );
    c.add( tx );
    c.setAlpha( 0 );
    this.layer.add( c );
    this.scene.tweens.add( { targets: c, alpha: 1, y: c.y - 10 * u, duration: 260 } );
    this.bubble = c;
  }

  update( gs: GameScene, dt: number ): void
  {
    this.t += dt;
    const s = gs.s;
    const lvl = gs.lvl;
    if ( gs.phase === 'play' || gs.phase === 'intro' )
    {
      this.airborne = s.grounded ? 0 : this.airborne + dt;
      this.calm = gs.burning ? 0 : this.calm + dt;
      switch ( this.step )
      {
        case 'hold':
          if ( this.airborne > 0.6 && s.y < lvl.start.y - 120 )
          {
            this.go( 'release' );
          }
          break;
        case 'release':
          // Чекаємо, поки гравець справді відпустить, — так він відчує, що куля сповільнюється сама
          if ( this.calm > 0.8 && this.airborne > 0 )
          {
            this.go( !s.stamp && s.x < lvl.stamp.x ? 'stamp' : 'land' );
          }
          break;
        case 'stamp':
          if ( s.stamp || s.x > lvl.stamp.x + 60 )
          {
            this.go( 'land' );
          }
          break;
        case 'land':
          if ( s.target >= lvl.targets.length )
          {
            this.go( 'done' );
          }
          break;
      }
    }
    this.draw( gs );
  }

  private draw( gs: GameScene ): void
  {
    const g = this.g;
    const u = this.u;
    g.clear();
    const cam = gs.cameras.main;
    const toScreen = ( x: number, y: number ) => ( { x: ( x - cam.worldView.x ) * cam.zoom, y: ( y - cam.worldView.y ) * cam.zoom } );
    const s = gs.s;
    const lvl = gs.lvl;
    if ( this.step === 'hold' )
    {
      // Кола, що розходяться від кулі, — універсальний знак «натисни й тримай»
      const p = toScreen( s.x, s.y - ENV_OFF );
      for ( let i = 0; i < 2; i++ )
      {
        const k = ( this.t * 0.8 + i * 0.5 ) % 1;
        g.lineStyle( 5 * u, 0xffffff, ( 1 - k ) * 0.9 );
        g.strokeCircle( p.x, p.y, ( 40 + k * 70 ) * u * cam.zoom * 0.7 );
      }
    }
    else if ( this.step === 'stamp' )
    {
      const p = toScreen( lvl.stamp.x, lvl.stamp.y );
      this.arrow( p.x, p.y - 50 * u * cam.zoom * 0.7 );
    }
    else if ( this.step === 'land' )
    {
      const tg = lvl.targets[ Math.min( s.target, lvl.targets.length - 1 ) ];
      const p = toScreen( tg.x, tg.y - 90 );
      this.arrow( p.x, p.y );
    }
  }

  // Стрілка, що підстрибує над ціллю
  private arrow( x: number, y: number ): void
  {
    const g = this.g;
    const u = this.u;
    const bob = Math.sin( this.t * 6 ) * 10 * u;
    const s = 26 * u;
    g.fillStyle( 0x000000, 0.18 );
    g.fillTriangle( x - s + 4 * u, y - s + bob + 6 * u, x + s + 4 * u, y - s + bob + 6 * u, x + 4 * u, y + s * 0.6 + bob + 6 * u );
    g.fillStyle( 0xffd23a, 1 );
    g.fillTriangle( x - s, y - s + bob, x + s, y - s + bob, x, y + s * 0.6 + bob );
    g.lineStyle( 4 * u, 0x24304a, 0.8 );
    g.strokeTriangle( x - s, y - s + bob, x + s, y - s + bob, x, y + s * 0.6 + bob );
  }
}
