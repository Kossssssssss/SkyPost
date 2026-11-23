import Phaser from 'phaser';
import { pack } from '../ui/pack.ts';

// Передній план поверх гри: зерно паперу
export class FgScene extends Phaser.Scene
{
  private grain?: Phaser.GameObjects.TileSprite;

  constructor()
  {
    super( 'fg' );
  }

  create(): void
  {
    this.grain = undefined;
    if ( !pack )
    {
      return;
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
}
