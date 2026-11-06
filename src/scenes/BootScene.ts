import Phaser from 'phaser';
import { makeCommon, makeSkins } from '../core/art.ts';
import { platform } from '../platform/platform.ts';
import { save } from '../core/save.ts';
import { pack, packLayers } from '../ui/pack.ts';

export class BootScene extends Phaser.Scene
{
  constructor()
  {
    super( 'boot' );
  }

  preload(): void
  {
    if ( !pack )
    {
      for ( const k of [ 'meadow', 'sea', 'mountain' ] )
      {
        this.load.image( 'bg-' + k, 'assets/bg-' + k + '.png' );
      }
      return;
    }
    for ( const k of [ ...packLayers(), 'cloud0', 'cloud1', 'cloud2', 'panel', 'button' ] )
    {
      this.load.image( 'pk-' + k, 'assets/packs/' + pack.id + '/' + k + '.png' );
    }
  }

  create(): void
  {
    makeCommon( this );
    makeSkins( this );
    if ( pack )
    {
      this.makePaintedButton();
    }
    platform.loadingStop();
    document.getElementById( 'loading' )?.remove();
    // Гра одразу стартує з рівня, без меню: новачок — з 1-1, інші — з останнього
    this.scene.launch( 'bg' );
    this.scene.start( 'game', { levelId: save().lastLevel } );
  }

  // Згенерована кнопка помаранчева; знебарвлюємо її, щоб тонувати під будь-який колір і зберегти мазки
  private makePaintedButton(): void
  {
    const src = this.textures.get( 'pk-button' ).getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas( 'pk-btn', src.width, src.height )!;
    const ctx = tex.getContext();
    ctx.drawImage( src, 0, 0 );
    const id = ctx.getImageData( 0, 0, src.width, src.height );
    const d = id.data;
    let sum = 0;
    let n = 0;
    for ( let i = 0; i < d.length; i += 4 )
    {
      const lum = d[ i ] * 0.3 + d[ i + 1 ] * 0.59 + d[ i + 2 ] * 0.11;
      if ( d[ i + 3 ] > 200 && lum > 90 )
      {
        sum += lum;
        n++;
      }
    }
    const mean = n ? sum / n : 180;
    for ( let i = 0; i < d.length; i += 4 )
    {
      const lum = d[ i ] * 0.3 + d[ i + 1 ] * 0.59 + d[ i + 2 ] * 0.11;
      // Середній тон тіла кнопки стає майже білим: тоді тінт дає чистий колір, а мазки й контур лишаються
      const v = Math.min( 255, ( lum / mean ) * 232 );
      d[ i ] = d[ i + 1 ] = d[ i + 2 ] = v;
    }
    ctx.putImageData( id, 0, 0 );
    tex.refresh();
  }
}
