import Phaser from 'phaser';
import { pack } from '../ui/pack.ts';

interface FrontCloud
{
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
}

// Передній план поверх гри: великі хмари пролітають перед кулею — головне відчуття польоту в референсі
export class FgScene extends Phaser.Scene
{
  private clouds: FrontCloud[] = [];
  private grain?: Phaser.GameObjects.TileSprite;
  private t = 0;

  constructor()
  {
    super( 'fg' );
  }

  create(): void
  {
    this.clouds = [];
    this.grain = undefined;
    if ( !pack )
    {
      return;
    }
    for ( let i = 0; i < 2; i++ )
    {
      const img = this.add.image( 0, 0, 'pk-cloud' + ( i % 3 ) ).setOrigin( 0, 0.5 ).setAlpha( 0.42 );
      this.clouds.push( { img, x: i * 0.5 + Math.random() * 0.1, y: 0.02 + i * 0.04 } );
    }
    if ( pack.grain )
    {
      this.makeGrain();
      this.grain = this.add.tileSprite( 0, 0, this.scale.width, this.scale.height, 'pk-grain' ).setOrigin( 0 ).setAlpha( 0.5 );
    }
    const onResize = ( s: Phaser.Structs.Size ) =>
    {
      this.cameras.main.setSize( s.width, s.height );
      this.grain?.setSize( s.width, s.height );
    };
    this.scale.on( 'resize', onResize );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', onResize ) );
  }

  private makeGrain(): void
  {
    if ( this.textures.exists( 'pk-grain' ) )
    {
      return;
    }
    const tex = this.textures.createCanvas( 'pk-grain', 256, 256 )!;
    const ctx = tex.getContext();
    const id = ctx.createImageData( 256, 256 );
    for ( let i = 0; i < id.data.length; i += 4 )
    {
      const v = 128 + ( Math.random() - 0.5 ) * 70;
      id.data[ i ] = id.data[ i + 1 ] = id.data[ i + 2 ] = v;
      id.data[ i + 3 ] = 22;
    }
    ctx.putImageData( id, 0, 0 );
    tex.refresh();
  }

  update( _time: number, delta: number ): void
  {
    if ( !pack )
    {
      return;
    }
    const dt = Math.min( 0.05, delta / 1000 );
    this.t += dt;
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.scene.get( 'bg' ) as unknown as { camX: number; camY: number };
    // На карті й у магазині передні хмари закривали б кнопки
    const show = this.scene.isActive( 'game' );
    for ( const c of this.clouds )
    {
      c.img.setVisible( show );
      const k = ( h * 0.26 ) / c.img.height;
      c.img.setScale( k );
      const cw = c.img.displayWidth;
      const span = w + cw * 2 + 600;
      const raw = c.x * span - bg.camX * 1.25 - this.t * 70;
      c.img.x = ( ( raw % span ) + span ) % span - cw;
      c.img.y = h * c.y - bg.camY * 1.25 - c.img.displayHeight * 0.25;
    }
  }
}
