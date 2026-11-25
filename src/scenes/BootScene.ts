import Phaser from 'phaser';
import { makeCommon, makeSkins } from '../core/art.ts';
import { platform } from '../platform/platform.ts';
import { milestone, track } from '../platform/analytics.ts';
import { save } from '../core/save.ts';
import { pack, packLayers } from '../ui/pack.ts';
import { TRAIL_PARTICLES } from '../core/skins.ts';
import { findLevel } from '../levels/index.ts';

const ICONS = [ 'pause', 'play', 'retry', 'map', 'next', 'back', 'sound', 'mute', 'music', 'musicoff', 'shop', 'route', 'ret' ];
// Скіни, вже перемальовані в акварельному стилі: текстури того ж розміру, що й намальовані кодом.
// Префікс id (env-, bas-) збігається з префіксом ключа текстури (env:, bas:)
const PAINTED_SKINS = [ 'env-classic', 'env-sky', 'env-sunset', 'env-polka', 'env-checker', 'env-patch', 'env-bloom', 'env-light', 'env-aurora', 'env-thunder', 'env-starry', 'env-airmail',
  'bas-wicker', 'bas-blue', 'bas-crate', 'bas-flower', 'bas-gold', 'bas-barrel', 'bas-airmail', 'bas-picnic', 'bas-tin', 'bas-quilt',
  'plt-fox', 'plt-cat', 'plt-owl', 'plt-frog', 'plt-bunny', 'plt-hedgehog', 'plt-bear', 'plt-raccoon', 'plt-mouse', 'plt-penguin' ];
// Перемальовані об'єкти світу. Будинок: ширина та сама, що в намальованого кодом, висота за пропорціями малюнка.
// Скринька: той самий розмір текстури 96x128, малюнок вписаний і притиснутий донизу
// Птах: два кадри (крила вгору / вниз) на однаковому полотні, вирівняні по дзьобу.
// Полум'я: три кадри однакового розміру, притиснуті донизу (flame1 і flame2 є лише намальовані)
const PAINTED_WORLD = [ 'office', 'mailbox', 'mailboxDone', 'bird0', 'bird1', 'flame', 'flame1', 'flame2', 'letter', 'gas', 'gauge', 'gaugefill', 'altscale', 'sun', 'sun_rays' ];
// Хмари пака замінюємо перемальованими: довга смуга, кругла купа й тонке пасмо
const PAINTED_CLOUDS = [ 'cloud_bank', 'cloud_puff', 'cloud_wisp' ];
// Намальовані смуги землі й води, блоки й маяк для worldView
// Місяць (замість сонця вночі) і далека блискавка (гроза) — теж тут: беруться як pk-moon і pk-lightning
const GROUND_FILES = [ 'ground_meadow', 'ground_sea', 'ground_mountain', 'water_sea', 'block_meadow', 'block_sea', 'block_mountain', 'lighthouse',
  'ground_storm', 'water_storm', 'block_storm', 'ground_night', 'water_night', 'block_night', 'moon', 'lightning' ];
// Погода тем: косий дощ (гроза) і світлячки (ніч)
const WEATHER_PARTICLES = [ 'p-rain', 'p-firefly' ];
// Усі малюнки гри лежать у WebP: важать у 4–5 разів менше за PNG
export const worldUrl = ( id: string ): string => 'assets/world/' + id + '.webp';

// Черга файлів гри. Ключі, які екран завантаження вже взяв для себе (полум'я, птах, хмари), не вантажимо вдруге
export function queueGameAssets( scene: Phaser.Scene ): void
{
  const load = ( key: string, url: string ) =>
  {
    if ( !scene.textures.exists( key ) )
    {
      scene.load.image( key, url );
    }
  };
  if ( !pack )
  {
    return;
  }
  for ( const k of [ ...packLayers(), 'panel', 'button', ...ICONS.map( ( i ) => 'i-' + i ) ] )
  {
    load( 'pk-' + k, 'assets/packs/' + pack.id + '/' + k + '.webp' );
  }
  for ( const f of GROUND_FILES )
  {
    load( 'pk-' + f, 'assets/world/' + f + '.webp' );
  }
  for ( const id of PAINTED_SKINS )
  {
    load( 'pk-' + id, 'assets/balloon/' + id + '.webp' );
  }
  for ( const id of [ ...TRAIL_PARTICLES, ...WEATHER_PARTICLES ] )
  {
    load( id, 'assets/trail/' + id + '.webp' );
  }
  for ( const id of PAINTED_WORLD )
  {
    load( 'pk-' + id, worldUrl( id ) );
  }
  for ( const id of new Set( PAINTED_CLOUDS ) )
  {
    load( 'pw-' + id, worldUrl( id ) );
  }
  // Значки на карті: печатки складності й знак нової механіки (scripts/split_marks.py)
  for ( const id of [ 'mk-hard', 'mk-super', 'mk-new' ] )
  {
    load( id, 'assets/world/' + id + '.webp' );
  }
  // Монета — валюта покупок (зірки лишились тільки для відкриття світів)
  load( 'coin', 'assets/world/coin.webp' );
  // Печатка «!» на кнопці магазину, коли вистачає монет на покупку
  load( 'badge', 'assets/world/badge.webp' );
  // Кружок рівня на мапі — поштовий штемпель; знебарвлюється в create і тонується за станом рівня
  load( 'node-src', 'assets/world/node.webp' );
}

export class BootScene extends Phaser.Scene
{
  constructor()
  {
    super( 'boot' );
  }

  // Усе вантажить екран завантаження (LoadScene) через queueGameAssets, тут лише обробка текстур
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
    if ( this.textures.exists( 'node-src' ) )
    {
      this.whiten( 'node-src', 'node' );
    }
    // Заливка шкали газу міняє колір за станом (норма, перевитрата, бак майже порожній), тож теж тонується
    if ( this.textures.exists( 'gaugefill' ) )
    {
      this.whiten( 'gaugefill', 'gaugefill-w' );
    }
    platform.loadingStop();
    // Від відкриття сторінки до готової гри: на довгому завантаженні гравці йдуть ще до першого кліку
    const loadSec = Math.round( performance.now() / 100 ) / 10;
    track( 'load_done', { sec: loadSec } );
    milestone( 'f02_load_done', { load_sec: loadSec } );
    document.getElementById( 'loading' )?.remove();
    // Перший запуск: одразу в перший рівень, без мапи й вибору мови (CrazyGames: новий гравець має потрапити в гру
    // щонайбільше за 1 клік). Мову вгадано з порталу чи браузера, змінити її можна кнопкою на мапі
    if ( Object.keys( save().levels ).length === 0 )
    {
      this.scene.launch( 'bg' );
      this.scene.start( 'game', { levelId: '1-1' } );
      return;
    }
    // Гра відкривається меню-картою на світі останнього рівня; живий фон карта запускає сама
    this.scene.start( 'map', { world: findLevel( save().lastLevel )?.world.id ?? 1 } );
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
