import Phaser from 'phaser';
import { makeCommon, makeSkins } from '../core/art.ts';
import { platform } from '../platform/platform.ts';
import { save } from '../core/save.ts';
import { pack, packLayers } from '../ui/pack.ts';
import { langChosen } from '../core/i18n.ts';

const ICONS = [ 'pause', 'play', 'retry', 'map', 'next', 'back', 'fwd', 'sound', 'mute', 'music', 'shop', 'route' ];
// Скіни, вже перемальовані в акварельному стилі: текстури того ж розміру, що й намальовані кодом.
// Префікс id (env-, bas-) збігається з префіксом ключа текстури (env:, bas:)
const PAINTED_SKINS = [ 'env-classic', 'bas-wicker' ];
// Перемальовані об'єкти світу. Будинок: ширина та сама, що в намальованого кодом, висота за пропорціями малюнка.
// Скринька: той самий розмір текстури 96x128, малюнок вписаний і притиснутий донизу
// Птах: два кадри (крила вгору / вниз) на однаковому полотні, вирівняні по дзьобу.
// Полум'я: три кадри однакового розміру, притиснуті донизу (flame1 і flame2 є лише намальовані)
const PAINTED_WORLD = [ 'office', 'mailbox', 'mailboxDone', 'bird0', 'bird1', 'flame', 'flame1', 'flame2', 'letter', 'gas', 'gauge', 'gaugefill' ];
// Хмари пака замінюємо перемальованими: довга смуга, кругла купа й тонке пасмо
const PAINTED_CLOUDS = [ 'cloud_bank', 'cloud_puff', 'cloud_wisp' ];

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
    for ( const k of [ ...packLayers(), 'cloud0', 'cloud1', 'cloud2', 'panel', 'button', ...ICONS.map( ( i ) => 'i-' + i ) ] )
    {
      this.load.image( 'pk-' + k, 'assets/packs/' + pack.id + '/' + k + '.png' );
    }
    for ( const id of PAINTED_SKINS )
    {
      this.load.image( 'pk-' + id, 'assets/balloon/' + id + '.png' );
    }
    for ( const id of PAINTED_WORLD )
    {
      this.load.image( 'pk-' + id, 'assets/world/' + id + '.png' );
    }
    for ( const id of new Set( PAINTED_CLOUDS ) )
    {
      this.load.image( 'pw-' + id, 'assets/world/' + id + '.png' );
    }
  }

  create(): void
  {
    makeCommon( this );
    makeSkins( this );
    // Намальовані кодом іконки й скіни замінюємо згенерованими під тими самими ключами
    const swap = ( key: string, from: string ) =>
    {
      if ( this.textures.exists( from ) )
      {
        if ( this.textures.exists( key ) )
        {
          this.textures.remove( key );
        }
        this.textures.addImage( key, this.textures.get( from ).getSourceImage() as HTMLImageElement );
      }
    };
    for ( const k of ICONS )
    {
      swap( 'i-' + k, 'pk-i-' + k );
    }
    for ( const id of PAINTED_SKINS )
    {
      swap( id.slice( 0, 3 ) + ':' + id, 'pk-' + id );
    }
    for ( const id of PAINTED_WORLD )
    {
      swap( id, 'pk-' + id );
    }
    PAINTED_CLOUDS.forEach( ( id, i ) => swap( 'pk-cloud' + i, 'pw-' + id ) );
    if ( pack )
    {
      this.whiten( 'pk-button', 'pk-btn' );
    }
    // Заливка шкали газу міняє колір за станом (норма, перевитрата, бак майже порожній), тож теж тонується
    if ( this.textures.exists( 'gaugefill' ) )
    {
      this.whiten( 'gaugefill', 'gaugefill-w' );
    }
    platform.loadingStop();
    document.getElementById( 'loading' )?.remove();
    // Гра одразу стартує з рівня, без меню: новачок — з 1-1, інші — з останнього
    this.scene.launch( 'bg' );
    // Перший запуск: спершу мова, бо далі одразу йде навчання з текстом
    if ( !langChosen() )
    {
      this.scene.start( 'lang' );
      return;
    }
    this.scene.start( 'game', { levelId: save().lastLevel } );
  }

  // Згенеровані кнопка й заливка кольорові; знебарвлюємо їх, щоб тонувати під будь-який колір і зберегти мазки
  private whiten( from: string, key: string ): void
  {
    const src = this.textures.get( from ).getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas( key, src.width, src.height )!;
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
