import Phaser from 'phaser';
import { save } from '../core/save.ts';
import { RES } from '../core/art.ts';
import { TOP_OFF } from '../core/sim.ts';

export class BalloonView extends Phaser.GameObjects.Container
{
  private env: Phaser.GameObjects.Image;
  private basket: Phaser.GameObjects.Image;
  private pilot: Phaser.GameObjects.Image;
  private flame: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private flick = 0;

  constructor( scene: Phaser.Scene, x: number, y: number )
  {
    super( scene, x, y );
    const k = 1 / RES;
    this.glow = scene.add.image( 0, -30, 'soft' ).setTint( 0xffa040 ).setAlpha( 0 ).setScale( 1.4 ).setBlendMode( Phaser.BlendModes.ADD );
    this.env = scene.add.image( 0, -TOP_OFF, 'env:env-classic' ).setOrigin( 0.5, 0 ).setScale( k );
    this.pilot = scene.add.image( 0, -12, 'plt:plt-fox' ).setOrigin( 0.5, 1 ).setScale( k * 0.9 );
    this.basket = scene.add.image( 0, 0, 'bas:bas-wicker' ).setOrigin( 0.5, 1 ).setScale( k );
    this.flame = scene.add.image( 0, -19, 'flame' ).setOrigin( 0.5, 1 ).setScale( 0.5 ).setBlendMode( Phaser.BlendModes.ADD ).setAlpha( 0 );
    this.add( [ this.glow, this.env, this.pilot, this.flame, this.basket ] );
    this.applySkins();
    scene.add.existing( this );
  }

  applySkins( equip = save().equip ): void
  {
    this.env.setTexture( 'env:' + equip.envelope );
    this.basket.setTexture( 'bas:' + equip.basket );
    this.pilot.setTexture( 'plt:' + equip.pilot );
  }

  pose( burning: boolean, heat: number, tilt: number, dt: number ): void
  {
    this.flick += dt * 30;
    const f = burning ? 0.8 + Math.sin( this.flick ) * 0.15 + Math.random() * 0.1 : 0;
    this.flame.setAlpha( Phaser.Math.Linear( this.flame.alpha, f, 0.5 ) );
    this.flame.setScale( 0.42 + f * 0.18, 0.45 + f * 0.35 );
    this.glow.setAlpha( Phaser.Math.Linear( this.glow.alpha, burning ? 0.35 : heat * 0.1, 0.2 ) );
    this.rotation = Phaser.Math.Linear( this.rotation, tilt, 0.08 );
    // Оболонка трохи «дихає» від жару — ледь помітна віддача на керування
    const breathe = 1 + heat * 0.035;
    this.env.setScale( ( 1 / RES ) * breathe, 1 / RES );
  }
}
