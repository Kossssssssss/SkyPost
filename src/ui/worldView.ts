import Phaser from 'phaser';
import { groundY, layerBottom, windAt, type LevelData, type Theme } from '../core/level.ts';
import { hazardPos } from '../core/sim.ts';
import { LIGHTHOUSE_ART, isLighthouse, lighthouseLayout } from '../core/shapes.ts';
import { RES } from '../core/art.ts';
import { FONT, inkHex } from './widgets.ts';
import { pack } from './pack.ts';

// Смуги ground_<тема>.webp і water_<тема>.webp у рівні: висота в одиницях рівня і де на картинці (частка висоти)
// трава переходить у землю (у води — гребені в суцільну воду). Ця межа стає на лінію ґрунту, трава стирчить над нею.
// Під лінією ґрунту має лишатися не менше GROUND_H (40) одиниць смуги, бо камера бачить до низу рівня
const GROUND_ART: Record<string, { height: number; surface: number }> = {
  meadow: { height: 90, surface: 0.44 },
  sea: { height: 80, surface: 0.29 },
  mountain: { height: 85, surface: 0.42 },
  storm: { height: 85, surface: 0.4 },
  // Бруківка: предмети стоять на її верхній площині, а не під нею
  night: { height: 90, surface: 0.12 },
  water: { height: 90, surface: 0.2 }
};

// Намальовані блоки (block_<тема>.webp) як NineSlice: кути й краї (трава, сніг, бурульки) не тягнуться.
// Відступи — у пікселях текстури; lift — скільки текстури (трава/сніг) стирчить над верхом блока.
// il / ir — прозорі поля текстури зліва й справа від тіла блока (медіана по рядках): на них малюнок розширюємо,
// щоб видима стіна стояла рівно на межі колайдера, а не на 4–12 px усередині (куля «билась об повітря»)
const BLOCK_ART: Record<string, { left: number; right: number; top: number; bottom: number; lift: number; il: number; ir: number }> = {
  meadow: { left: 30, right: 30, top: 80, bottom: 30, lift: 60, il: 14, ir: 11 },
  sea: { left: 30, right: 30, top: 90, bottom: 30, lift: 70, il: 8, ir: 20 },
  mountain: { left: 30, right: 30, top: 150, bottom: 70, lift: 10, il: 14, ir: 12 },
  storm: { left: 30, right: 30, top: 80, bottom: 50, lift: 55, il: 15, ir: 24 },
  // Цегляна стіна під черепицею: дах звисає з боків, кам'яна основа знизу. lift < 30 — черепиця не лізе поперед кулі.
  // Поля менші за відступ стіни (21 / 24): компроміс, щоб і стіна, і звис даху були близько до межі
  night: { left: 45, right: 45, top: 90, bottom: 60, lift: 28, il: 15, ir: 17 }
};
// Уночі денна цегла надто тепла й світла — притінюємо її в тон шарів фону
const BLOCK_TINT: Partial<Record<Theme, number>> = { night: 0xb8c0dc };
// Блок нормального розміру показуємо в половину текстури; дрібні — дрібніше, щоб кути не налазили один на одного
const BLOCK_SCALE = 0.5;
// Передній шар трави: над кулею (10) і шлейфом, але під пилом і вибухами (11+)
const FRONT_DEPTH = 10.5;
// Світло зони посадки: над передньою травою (10.5), дощем (10.6) і кулею (10), нижче за ефекти доставки (20+)
const PAD_DEPTH = 15;
// Скільки одиниць рівня трави над поверхнею стоїть перед кулею (кошик — 18): решта стебел лишається позаду
const FRONT_GRASS = 12;

export interface ThemeStyle
{
  skyTop: number;
  skyBottom: number;
  ground: number;
  groundTop: number;
  body: number;
  bodyDark: number;
  top: number;
  far: string;
}

export const THEMES: Record<Theme, ThemeStyle> = {
  meadow: { skyTop: 0x5cb8f8, skyBottom: 0xd4f1ff, ground: 0x8a5a32, groundTop: 0x6cc04a, body: 0x9a6a3e, bodyDark: 0x7a5030, top: 0x74c850, far: 'bg-meadow' },
  sea: { skyTop: 0x4aa0e8, skyBottom: 0xe6f6ff, ground: 0x1f78c0, groundTop: 0x4ab0e8, body: 0xb08e66, bodyDark: 0x8a6e4e, top: 0xf2dca0, far: 'bg-sea' },
  mountain: { skyTop: 0x7a9ee0, skyBottom: 0xf4e8f0, ground: 0x5e5a70, groundTop: 0x8a8aa0, body: 0x8a88a0, bodyDark: 0x625f78, top: 0xffffff, far: 'bg-mountain' },
  storm: { skyTop: 0x3a4060, skyBottom: 0x8a90a8, ground: 0x3a3a48, groundTop: 0x5a6a50, body: 0x5a5a6a, bodyDark: 0x404050, top: 0x6a8a5a, far: 'bg-mountain' },
  night: { skyTop: 0x0a1030, skyBottom: 0x2a3060, ground: 0x202030, groundTop: 0x303048, body: 0x303048, bodyDark: 0x202030, top: 0x404060, far: 'bg-meadow' }
};

// Межа шарів вітру — тонкий білий пунктир
const DASH_STEP = 30;
const DASH_LEN = 16;
const DASH_H = 2;
const DASH_ALPHA = 0.45;

// Листок, пір'їнка чи сніжинка, яку несе вітер свого шару: видно, куди й як сильно дме
interface Drifter
{
  img: Phaser.GameObjects.Image;
  layer: number;
  speedK: number;
  baseY: number;
  phase: number;
  amp: number;
  spin: number;
}

// Що несе вітер у кожній темі (мальовані партикли шлейфу)
const DRIFT_TEX: Partial<Record<Theme, string[]>> = {
  meadow: [ 'p-leaf', 'p-leaf', 'p-flower' ],
  sea: [ 'p-feather' ],
  mountain: [ 'p-snow' ],
  storm: [ 'p-leaf' ],
  night: [ 'p-leaf' ]
};


// 0.8 / RES — старий розмір 96x128, ×1.7 — більша скринька, ×0.5 — нова текстура вдвічі вища
export const MAILBOX_SCALE = 0.8 / RES * 1.7 * 0.5;

export class WorldView
{
  private scene: Phaser.Scene;
  private lvl: LevelData;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private drifters: Drifter[] = [];
  private hazards: Phaser.GameObjects.Image[] = [];
  // Перешкоди, у які врізалась куля: їх веде твін відльоту, а не маршрут
  private knocked = new Set<number>();
  private motes: Phaser.GameObjects.Image[] = [];
  // Погода теми (п. 47): бризки біля води на морі, легкий сніг у горах
  private spray?: Phaser.GameObjects.Particles.ParticleEmitter;
  private sprayIn = 0;
  private weatherT = 0;
  private water?: Phaser.GameObjects.Graphics;
  // Намальована вода: копії смуги, що повільно гойдаються
  private waterImgs: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  mailboxes: Phaser.GameObjects.Image[] = [];
  markers: Phaser.GameObjects.Graphics[] = [];
  stamp: Phaser.GameObjects.Image;
  stampGlow: Phaser.GameObjects.Image;
  // Місце посадки поточного листа: стовп світла, ореол над майданчиком і іскри, що підіймаються з нього
  private padBeam!: Phaser.GameObjects.Image;
  private padEdgeL!: Phaser.GameObjects.Image;
  private padEdgeR!: Phaser.GameObjects.Image;
  private padSparks?: Phaser.GameObjects.Particles.ParticleEmitter;
  private padZone = new Phaser.Geom.Rectangle( 0, 0, 1, 1 );

  constructor( scene: Phaser.Scene, lvl: LevelData )
  {
    this.scene = scene;
    this.lvl = lvl;
    const th = THEMES[ lvl.theme ];
    this.buildLayers();
    this.buildWeather();
    this.buildUpdrafts();

    // Будинок стоїть на лінії ґрунту (лише трохи нижче, щоб не висів) і малюється поверх ґрунту (depth 5);
    // його низ і так ховає передня трава. Глибше не садимо: інакше над травою видно лише дах.
    // Якщо старт на блоці, будинок цілком стоїть на ньому: ліворуч від кулі, а як не влазить — праворуч чи біля блока
    // Нерухомі будинок і скриньки — позаду всієї трави (смуги землі й блоків), а не лише її нижньої смуги, як куля:
    // інакше верхівки стебел на їхньому тлі обриваються рівною лінією
    const behindGrass = lvl.water ? 3.89 : 4.94;
    const office = this.add( scene.add.image( lvl.start.x - 70, lvl.start.y, 'office' ).setOrigin( 0.5, 1 ).setScale( 0.75 / RES ).setDepth( behindGrass ) );
    const op = this.officePos( office.displayWidth * 0.85 );
    office.setPosition( op.x, op.y + 3 );

    const g = this.add( scene.add.graphics().setDepth( 5 ) );
    this.drawGround( g, th );
    for ( const b of lvl.blocks )
    {
      this.drawBlock( g, b.x, b.y, b.w, b.h, th );
    }

    lvl.targets.forEach( ( tg, i ) =>
    {
      const m = this.add( scene.add.graphics().setDepth( 6 ) );
      this.markers.push( m );
      // Скринька в 1.7 раза більша за стару (текстура 168x256 замість 96x128), низ стовпчика ховається в траві
      const mb = this.add( scene.add.image( tg.x + tg.w / 2 - 8, tg.y + 2, 'mailbox' ).setOrigin( 0.5, 1 ).setScale( MAILBOX_SCALE ).setDepth( behindGrass ) );
      this.mailboxes.push( mb );
      if ( lvl.targets.length > 1 )
      {
        const n = this.add( scene.add.text( mb.x, mb.y - mb.displayHeight - 16, String( i + 1 ), {
          fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: inkHex(), strokeThickness: 5
        } ).setOrigin( 0.5 ).setDepth( 7 ) );
        void n;
      }
    } );
    // Світло зони посадки — поверх усього у світі (трави, погоди, кулі), щоб межі майданчика було чітко видно.
    // Колона: вузький вертикальний зріз верхньої половини 'soft' (2 px через центр), розтягнутий на ширину майданчика, —
    // по ширині яскравість рівна, тож боки чіткі; угору тане, а низ обрізано рівно по поверхні майданчика.
    // Боки ще позначено тонкими світлішими смугами з того самого зрізу
    const padSlice = ( tint: number, d: number ) =>
      this.add( scene.add.image( 0, 0, 'soft' ).setCrop( 31, 0, 2, 32 ).setTint( tint ).setDepth( PAD_DEPTH + d ).setBlendMode( Phaser.BlendModes.ADD ) );
    this.padBeam = padSlice( 0xffd870, 0 );
    this.padEdgeL = padSlice( 0xfff0b0, 0.01 );
    this.padEdgeR = padSlice( 0xfff0b0, 0.01 );
    const spark = scene.textures.exists( 'p-star' ) ? 'p-star' : 'spark';
    if ( scene.textures.exists( spark ) )
    {
      const sz = scene.textures.getFrame( spark ).width;
      this.padSparks = this.add( scene.add.particles( 0, 0, spark, {
        emitZone: { type: 'random', source: this.padZone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        speedY: { min: -45, max: -20 }, speedX: { min: -8, max: 8 }, lifespan: { min: 900, max: 1400 },
        frequency: 150, scale: { start: 12 / sz, end: 5 / sz }, alpha: { start: 0.9, end: 0, ease: 'Cubic.in' },
        rotate: { min: 0, max: 360 }, tint: [ 0xffd23a, 0xffe9a0, 0xffffff ]
      } ).setDepth( PAD_DEPTH + 0.03 ) );
    }
    this.setActiveTarget( 0 );

    this.stampGlow = this.add( scene.add.image( lvl.stamp.x, lvl.stamp.y, 'soft' ).setTint( 0xffe07a ).setScale( 1.6 ).setAlpha( 0.6 ).setDepth( 8 ).setBlendMode( Phaser.BlendModes.ADD ) );
    this.stamp = this.add( scene.add.image( lvl.stamp.x, lvl.stamp.y, 'stamp' ).setDepth( 9 ) );

    lvl.hazards.forEach( ( h ) =>
    {
      const key = h.kind === 'gull' ? 'gull0' : h.kind === 'spike' || h.kind === 'storm' ? 'spike' : 'bird0';
      const img = this.add( scene.add.image( h.x, h.y, key ).setDepth( 9 ) );
      if ( h.kind === 'bird' )
      {
        // Намальована ластівка вища за кодову (крила вгору й вниз), тож тримаємо пропорції малюнка
        img.setScale( ( h.r * 2.8 ) / img.width );
      }
      else
      {
        img.setDisplaySize( h.r * 2.6, h.kind === 'spike' || h.kind === 'storm' ? h.r * 2.6 : h.r * 1.9 );
      }
      this.hazards.push( img );
    } );
  }

  private add<T extends Phaser.GameObjects.GameObject>( o: T ): T
  {
    this.objects.push( o );
    return o;
  }

  private buildLayers(): void
  {
    const lvl = this.lvl;
    const dashes = this.add( this.scene.add.graphics().setDepth( 0.5 ) );
    dashes.fillStyle( 0xffffff, DASH_ALPHA );
    lvl.layers.forEach( ( l, i ) =>
    {
      const y0 = l.top;
      const y1 = layerBottom( lvl, i );
      const area = lvl.width * ( y1 - y0 );
      const windy = Math.abs( l.wind ) >= 1 || !!l.gust;
      if ( i > 0 )
      {
        for ( let x = -400; x < lvl.width + 400; x += DASH_STEP )
        {
          dashes.fillRect( x, y0 - DASH_H / 2, DASH_LEN, DASH_H );
        }
      }
      const drift = ( DRIFT_TEX[ lvl.theme ] ?? [ 'p-leaf' ] ).filter( ( k ) => this.scene.textures.exists( k ) );
      // У горах падає ще й сніг, тож пухнастих сніжинок, що летять із вітром, менше
      const dk = lvl.theme === 'mountain' ? 0.6 : 1;
      const nd = !windy || !drift.length ? 0 : Math.max( lvl.theme === 'mountain' ? 1 : 2, Math.round( area * dk / 145000 ) );
      for ( let k = 0; k < nd; k++ )
      {
        const baseY = Phaser.Math.Between( y0 + 20, y1 - 20 );
        const img = this.add( this.scene.add.image( Math.random() * lvl.width, baseY, Phaser.Utils.Array.GetRandom( drift ) )
          .setScale( 0.24 + Math.random() * 0.08 ).setAlpha( 0.5 ).setRotation( Math.random() * Math.PI * 2 ).setDepth( 1.1 ) );
        this.drifters.push( { img, layer: i, baseY, speedK: 0.85 + Math.random() * 0.35, phase: Math.random() * Math.PI * 2,
          amp: 6 + Math.random() * 10, spin: ( Math.random() < 0.5 ? -1 : 1 ) * ( 0.6 + Math.random() ) } );
      }
      if ( !windy )
      {
        for ( let k = 0; k < Math.round( area / 40000 ); k++ )
        {
          const m = this.add( this.scene.add.image( Math.random() * lvl.width, Phaser.Math.Between( y0 + 10, y1 - 10 ), 'dot' )
            .setScale( 0.12 ).setAlpha( 0.3 ).setDepth( 1 ) );
          this.motes.push( m );
        }
      }
    } );
  }

  private buildUpdrafts(): void
  {
    for ( const u of this.lvl.updrafts )
    {
      const g = this.add( this.scene.add.graphics().setDepth( 1 ) );
      g.fillGradientStyle( 0xfff0c0, 0xfff0c0, 0xffb060, 0xffb060, 0.0, 0.0, 0.25, 0.25 );
      g.fillRect( u.x, u.y, u.w, u.h );
      const em = this.add( this.scene.add.particles( 0, 0, 'dot', {
        x: { min: u.x + 10, max: u.x + u.w - 10 },
        y: u.y + u.h,
        speedY: { min: -140, max: -80 },
        lifespan: ( u.h / 110 ) * 1000,
        scale: { start: 0.25, end: 0.05 },
        alpha: { start: 0.7, end: 0 },
        tint: 0xffe0a0,
        frequency: 120
      } ).setDepth( 2 ) );
      void em;
    }
  }

  // Де поставити будинок шириною foot (низ стін): точка на поверхні (y — лінія трави), щоб він не звисав із краю блока.
  // На блоці старту — ліворуч або праворуч від кулі; блок завузький — на землю поруч із ним (на воді — по центру блока)
  private officePos( foot: number ): { x: number; y: number }
  {
    const lvl = this.lvl;
    const { start, blocks } = lvl;
    const prefer = start.x - 70;
    const b = blocks.find( ( k ) => start.x >= k.x && start.x <= k.x + k.w && Math.abs( k.y - start.y ) < 40 );
    if ( !b )
    {
      return { x: prefer, y: start.y };
    }
    // Будинок не має налазити на кулю: між ними щонайменше половина будинку й кошик
    const gap = foot / 2 + 24;
    const lo = b.x + foot / 2 + 6;
    const hi = b.x + b.w - foot / 2 - 6;
    for ( const x of [ prefer, start.x + 70, start.x - gap, start.x + gap ] )
    {
      if ( x >= lo && x <= hi && Math.abs( x - start.x ) >= gap )
      {
        return { x, y: b.y };
      }
    }
    if ( !lvl.water && b.y + b.h >= groundY( lvl ) - 1 )
    {
      // Блок стоїть на землі: будинок — біля його підніжжя, з того боку, де більше місця в рівні
      const left = b.x - foot / 2 - 10;
      return { x: left - foot / 2 > 0 ? left : b.x + b.w + foot / 2 + 10, y: groundY( lvl ) };
    }
    return { x: Phaser.Math.Clamp( prefer, lo, Math.max( lo, hi ) ), y: b.y };
  }

  private drawGround( g: Phaser.GameObjects.Graphics, th: ThemeStyle ): void
  {
    const lvl = this.lvl;
    const gy = groundY( lvl );
    // Намальована смуга (трава й земля або вода); без малюнка для теми — стара заливка кодом
    const key = lvl.water ? 'pk-water_' + lvl.theme : 'pk-ground_' + lvl.theme;
    const art = GROUND_ART[ lvl.water ? 'water' : lvl.theme ];
    if ( pack && art && this.scene.textures.exists( key ) )
    {
      const src = this.scene.textures.get( key ).getSourceImage();
      const k = art.height / src.height;
      const tw = src.width * k;
      const y = gy - art.surface * art.height;
      // Копії через одну віддзеркалені, тож шов між ними не видно; 1 px перекриття проти щілин.
      // Вода ширша з обох боків: вона гойдається вбік
      const pad = lvl.water ? 460 : 400;
      // На високих екранах камера бачить нижче за смугу: туди тягнемо вниз її нижні 15 % (та сама вода чи земля)
      const fillFrom = src.height * 0.85;
      const fillK = 440 / ( src.height * 0.15 );
      const fillY = y + art.height - 2 - fillFrom * fillK;
      for ( let x = -pad, i = 0; x < lvl.width + pad; x += tw - 1, i++ )
      {
        const depth = lvl.water ? 4 : 5;
        const img = this.add( this.scene.add.image( x, y, key ).setOrigin( 0, 0 ).setScale( k ).setFlipX( i % 2 === 1 ).setDepth( depth ) );
        const fill = this.add( this.scene.add.image( x, fillY, key ).setOrigin( 0, 0 ).setScale( k, fillK ).setFlipX( i % 2 === 1 ).setDepth( depth - 0.01 ) );
        fill.setCrop( 0, fillFrom, src.width, src.height - fillFrom );
        if ( lvl.water )
        {
          this.waterImgs.push( { img, x, y }, { img: fill, x, y: fillY } );
        }
        else
        {
          // Псевдо-3D: стебла трави над лінією ґрунту ще раз, але перед кулею, будинком і скриньками —
          // те, що стоїть на траві, ховає низ у ній
          // Спереду лише нижня частина стебел: верхівки лишаються позаду, і кошик виглядає з трави, а не зникає в ній
          const cut = Math.max( 0, src.height * art.surface - FRONT_GRASS / k );
          const front = this.add( this.scene.add.image( x, y, key ).setOrigin( 0, 0 ).setScale( k ).setFlipX( i % 2 === 1 ).setDepth( FRONT_DEPTH ) );
          front.setCrop( 0, cut, src.width, src.height * art.surface + 4 - cut );
        }
      }
      return;
    }
    if ( lvl.water )
    {
      this.water = this.add( this.scene.add.graphics().setDepth( 4 ) );
      return;
    }
    g.fillStyle( th.ground, 1 );
    g.fillRect( -400, gy, lvl.width + 800, lvl.height - gy + 400 );
    g.fillStyle( th.groundTop, 1 );
    g.fillRect( -400, gy, lvl.width + 800, 12 );
    g.fillStyle( Phaser.Display.Color.ValueToColor( th.groundTop ).darken( 15 ).color, 1 );
    for ( let x = -400; x < lvl.width + 400; x += 22 )
    {
      g.fillTriangle( x, gy + 12, x + 11, gy + 20, x + 22, gy + 12 );
    }
  }

  private drawBlock( g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, th: ThemeStyle ): void
  {
    const onGround = y + h >= groundY( this.lvl ) - 1;
    if ( isLighthouse( this.lvl, { x, y, w, h } ) )
    {
      this.drawLighthouse( g, x, y, w, h );
      return;
    }
    // На морі блоки стоять у воді: вода (depth 4) накриває їхню основу; на суші основу ховає смуга землі (depth 5)
    const depth = this.lvl.water ? 3.9 : 4.95;
    const art = BLOCK_ART[ this.lvl.theme ];
    const key = 'pk-block_' + this.lvl.theme;
    if ( pack && art && this.scene.textures.exists( key ) )
    {
      const hh = onGround ? h + 60 : h;
      const s = Math.min( BLOCK_SCALE, ( w * 0.9 ) / ( art.left + art.right ), ( hh * 0.9 ) / ( art.top + art.bottom ) );
      const top = y - art.lift * s;
      // Малюнок ширший за блок на прозорі поля текстури: видима стіна — рівно по межі колайдера
      const ax = x - art.il * s;
      const aw = w / s + art.il + art.ir;
      // Кадр '__BASE' явно: без нього Phaser бере «перший кадр» текстури, а ним після першого блока стає смуга трави front-*
      this.add( this.scene.add.nineslice( ax, top, key, '__BASE', aw, ( y + hh - top ) / s, art.left, art.right, art.top, art.bottom )
        .setOrigin( 0, 0 ).setScale( s ).setDepth( depth ).setTint( BLOCK_TINT[ this.lvl.theme ] ?? 0xffffff ) );
      // Трава, що стирчить над блоком, — ще й перед кулею (смуга лише з верхнього краю текстури, без тягнутої середини).
      // Сніговій шапці гір (lift 10) це не потрібно
      if ( art.lift >= 30 )
      {
        // Окремий кадр текстури — рядки від середини стебел до лінії верху блока; з нього NineSlice без тягнутої середини
        const cut = Math.max( 0, Math.round( art.lift - FRONT_GRASS / s ) );
        const band = art.lift + 6 - cut;
        const frame = 'front-' + cut;
        const tex = this.scene.textures.get( key );
        if ( !tex.has( frame ) )
        {
          tex.add( frame, 0, 0, cut, tex.getSourceImage().width, band );
        }
        this.add( this.scene.add.nineslice( ax, top + cut * s, key, frame, aw, band, art.left, art.right, band, 0 )
          .setOrigin( 0, 0 ).setScale( s ).setDepth( FRONT_DEPTH ) );
      }
      return;
    }
    const r = Math.min( 18, w / 3, h / 3 );
    const bottomR = onGround ? 0 : r;
    const hh = onGround ? h + 60 : h;
    g.fillStyle( th.bodyDark, 1 );
    g.fillRoundedRect( x, y, w, hh, { tl: r, tr: r, bl: bottomR, br: bottomR } );
    g.fillStyle( th.body, 1 );
    g.fillRoundedRect( x + 6, y, w - 12, hh - ( onGround ? 0 : 6 ), { tl: r, tr: r, bl: bottomR, br: bottomR } );
    g.fillStyle( th.bodyDark, 0.5 );
    const rand = new Phaser.Math.RandomDataGenerator( [ String( x * 31 + y ) ] );
    for ( let i = 0; i < ( w * h ) / 2500; i++ )
    {
      g.fillCircle( x + 12 + rand.frac() * ( w - 24 ), y + 24 + rand.frac() * Math.max( 1, h - 36 ), 3 + rand.frac() * 5 );
    }
    g.fillStyle( th.top, 1 );
    g.fillRoundedRect( x - 3, y - 3, w + 6, 14, { tl: r, tr: r, bl: 4, br: 4 } );
    for ( let px = x; px < x + w - 4; px += 16 )
    {
      g.fillTriangle( px, y + 10, px + 8, y + 18, px + 16, y + 10 );
    }
    if ( !onGround && this.lvl.theme === 'mountain' )
    {
      g.fillStyle( 0xdff4ff, 0.9 );
      for ( let px = x + 10; px < x + w - 10; px += 26 )
      {
        g.fillTriangle( px, y + h - 2, px + 10, y + h - 2, px + 5, y + h + 12 );
      }
    }
  }

  private drawLighthouse( g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number ): void
  {
    if ( pack && this.scene.textures.exists( 'pk-lighthouse' ) )
    {
      // Масштаб — середнє між «тіло в ширину блока» і «весь маяк у висоту блока»: інакше блок низький для такої
      // ширини, ліхтар виходить величезним, а смуги стиснутими. Вежа трохи занурена у воду
      // Той самий розклад, що й у колайдера (core/shapes.ts), щоб куля торкалась саме намальованого силуету
      const a = LIGHTHOUSE_ART;
      const { s, cx, texH } = lighthouseLayout( { x, y, w, h } );
      this.add( this.scene.add.nineslice( cx, y, 'pk-lighthouse', undefined, a.w, texH, 0, 0, a.top, a.bottom )
        .setOrigin( 0.5, 0 ).setScale( s ).setDepth( 3.9 ) );
      return;
    }
    const base = y + h + 60;
    g.fillStyle( 0x8a6e4e, 1 );
    g.fillRoundedRect( x - 30, y + h - 30, w + 60, 90, 20 );
    const bands = 6;
    const bh = ( h - 50 ) / bands;
    for ( let i = 0; i < bands; i++ )
    {
      g.fillStyle( i % 2 ? 0xffffff : 0xd8332a, 1 );
      g.fillRect( x + 4, y + 50 + i * bh, w - 8, bh + 1 );
    }
    g.fillStyle( 0x24304a, 1 );
    g.fillRect( x - 6, y + 40, w + 12, 12 );
    g.fillStyle( 0xffe07a, 1 );
    g.fillRect( x + 10, y + 14, w - 20, 26 );
    g.fillStyle( 0xd8332a, 1 );
    g.fillTriangle( x - 4, y + 14, x + w + 4, y + 14, x + w / 2, y - 6 );
    g.fillStyle( 0x000000, 0.12 );
    g.fillRect( x + w * 0.6, y + 50, w * 0.4 - 4, h - 50 );
    void base;
  }

  setActiveTarget( idx: number ): void
  {
    this.lvl.targets.forEach( ( tg, i ) =>
    {
      const m = this.markers[ i ];
      m.clear();
      const done = i < idx;
      const active = i === idx;
      const col = done ? 0x3fb56a : active ? 0xffd23a : 0xffffff;
      m.fillStyle( col, active ? 0.9 : 0.45 );
      for ( let x = tg.x - tg.w / 2; x < tg.x + tg.w / 2 - 2; x += 18 )
      {
        m.fillRect( x, tg.y - 3, 11, 5 );
      }
      if ( !active )
      {
        m.fillStyle( col, 0.06 );
        m.fillRect( tg.x - tg.w / 2, tg.y - 80, tg.w, 77 );
      }
      this.mailboxes[ i ].setTexture( done ? 'mailboxDone' : 'mailbox' );
    } );
    const tg = this.lvl.targets[ idx ];
    this.padBeam.setVisible( !!tg );
    this.padEdgeL.setVisible( !!tg );
    this.padEdgeR.setVisible( !!tg );
    this.padSparks?.setVisible( !!tg );
    if ( !tg )
    {
      this.padSparks?.stop();
      return;
    }
    // Центр 'soft' (низ зрізу) — на поверхні майданчика; висота зрізу 32 px, ширина 2 px
    // Опущено на 6 px: низ стоїть на видимій землі під травою, а не на лінії майданчика
    const by = tg.y + 6;
    this.padBeam.setPosition( tg.x, by ).setScale( tg.w / 2, 75 / 32 );
    this.padEdgeL.setPosition( tg.x - tg.w / 2 + 1.5, by ).setScale( 1.5, 60 / 32 );
    this.padEdgeR.setPosition( tg.x + tg.w / 2 - 1.5, by ).setScale( 1.5, 60 / 32 );
    if ( this.padSparks )
    {
      this.padZone.setTo( tg.x - tg.w / 2 + 6, tg.y - 8, tg.w - 12, 6 );
      this.padSparks.start();
    }
  }

  // Декор, що вилетів за край, переносимо на протилежний край за межами того, що бачить камера,
  // інакше на широкому екрані видно, як він з'являється й зникає біля країв рівня
  private wrapX( img: Phaser.GameObjects.Image, left: number, right: number ): void
  {
    const half = img.displayWidth / 2 + 10;
    if ( img.x - half > right )
    {
      img.x = left - half;
    }
    else if ( img.x + half < left )
    {
      img.x = right + half;
    }
  }

  // Погода на весь рівень. Частинки народжуються в тій частині світу, яку зараз бачить камера (worldView — живий прямокутник)
  private buildWeather(): void
  {
    const lvl = this.lvl;
    const view = this.scene.cameras.main.worldView;
    type P = Phaser.GameObjects.Particles.Particle;
    if ( lvl.theme === 'mountain' && this.scene.textures.exists( 'p-snow' ) )
    {
      // Дрібні рідкі сніжинки повільно падають і зносяться вітром свого шару; з'являються й гаснуть м'яко, без різкого краю
      this.add( this.scene.add.particles( 0, 0, 'p-snow', {
        x: { onEmit: () => view.x + Math.random() * view.width },
        y: { onEmit: () => view.y + Math.random() * view.height },
        speedY: { min: 18, max: 42 }, speedX: { min: -8, max: 8 },
        accelerationX: { onEmit: () => 0, onUpdate: ( p: P ) => ( windAt( lvl, p.y, this.weatherT ) * 0.5 - p.velocityX ) * 1.5 },
        rotate: { min: 0, max: 360 }, scale: { min: 9 / 64, max: 16 / 64 },
        alpha: { onEmit: () => 0, onUpdate: ( _p: P, _k: string, t: number ) => Math.sin( t * Math.PI ) * 0.75 },
        lifespan: { min: 3500, max: 5500 }, frequency: 80
      } ).setDepth( 1.2 ) );
    }
    if ( lvl.theme === 'storm' && this.scene.textures.exists( 'p-rain' ) )
    {
      // Косий дощ: краплі падають швидко й зносяться вітром свого шару; кожна повернута вздовж свого руху.
      // На p-rain голова краплі внизу ліворуч, тобто текстура «летить» під кутом ~121°
      this.add( this.scene.add.particles( 0, 0, 'p-rain', {
        x: { onEmit: () => view.x - 100 + Math.random() * ( view.width + 200 ) },
        y: { onEmit: () => view.y - 40 + Math.random() * view.height * 0.5 },
        speedY: { min: 520, max: 680 }, speedX: { min: -150, max: -110 },
        accelerationX: { onEmit: () => 0, onUpdate: ( p: P ) => ( windAt( lvl, p.y, this.weatherT ) * 2 - 130 - p.velocityX ) * 2 },
        rotate: { onEmit: () => 0, onUpdate: ( p: P ) => Phaser.Math.RadToDeg( Math.atan2( p.velocityY, p.velocityX ) ) - 121 },
        scale: { min: 26 / 64, max: 34 / 64 },
        alpha: { onEmit: () => 0, onUpdate: ( _p: P, _k: string, t: number ) => Math.min( 1, t * 6, ( 1 - t ) * 6 ) * 0.75 },
        lifespan: { min: 900, max: 1300 }, frequency: 14
      } ).setDepth( 1.2 ) );
    }
    if ( lvl.theme === 'night' && this.scene.textures.exists( 'p-firefly' ) )
    {
      // Світлячки повільно блукають над землею й то спалахують, то гаснуть
      const gy = groundY( lvl );
      this.add( this.scene.add.particles( 0, 0, 'p-firefly', {
        x: { onEmit: () => view.x + Math.random() * view.width },
        y: { onEmit: () => gy - 20 - Math.random() * 160 },
        speedX: { min: -14, max: 14 }, speedY: { min: -8, max: 8 },
        scale: { min: 28 / 96, max: 36 / 96 },
        alpha: { onEmit: () => 0, onUpdate: ( p: P, _k: string, t: number ) => Math.min( 1, Math.sin( t * Math.PI ) * 2 ) * ( 0.7 + 0.3 * Math.sin( t * 18 + p.x ) ) },
        lifespan: { min: 4000, max: 7000 }, frequency: 300
      } ).setDepth( 1.2 ) );
    }
    if ( lvl.water && this.scene.textures.exists( 'p-blob' ) )
    {
      const k = 1 / 64;
      this.spray = this.add( this.scene.add.particles( 0, 0, 'p-blob', {
        speedX: { min: -55, max: 55 }, speedY: { min: -230, max: -100 }, gravityY: 420,
        scale: { start: 16 * k, end: 7 * k }, alpha: { start: 0.9, end: 0 }, lifespan: { min: 500, max: 800 },
        tint: [ 0xffffff, 0xe6f4ff, 0xcfe6f2 ], emitting: false
      } ).setDepth( FRONT_DEPTH + 0.1 ) );
    }
  }

  // Бризки хвиль: раз на 0.5–1.4 с маленький сплеск у випадковому місці води в кадрі (не на острові)
  private updateSpray( dt: number, view: Phaser.Geom.Rectangle ): void
  {
    if ( !this.spray )
    {
      return;
    }
    this.sprayIn -= dt;
    if ( this.sprayIn > 0 )
    {
      return;
    }
    this.sprayIn = 0.5 + Math.random() * 0.9;
    const gy = groundY( this.lvl );
    const x = view.x + Math.random() * view.width;
    if ( this.lvl.blocks.some( ( b ) => x >= b.x - 10 && x <= b.x + b.w + 10 && b.y + b.h >= gy - 1 ) )
    {
      return;
    }
    // Гребінь намальованої хвилі трохи вище лінії води
    this.spray.explode( 6 + Math.floor( Math.random() * 5 ), x, gy - 18 );
  }

  update( t: number, dt: number ): void
  {
    this.weatherT = t;
    const lvl = this.lvl;
    const view = this.scene.cameras.main.worldView;
    const left = Math.min( 0, view.x );
    const right = Math.max( lvl.width, view.right );
    this.updateSpray( dt, view );
    // Предмети летять зі швидкістю вітру, гойдаються вгору-вниз і крутяться тим швидше, чим сильніше дме
    for ( const d of this.drifters )
    {
      const l = lvl.layers[ d.layer ];
      const w = windAt( lvl, ( l.top + layerBottom( lvl, d.layer ) ) / 2, t );
      d.img.x += w * d.speedK * dt;
      d.img.y = d.baseY + Math.sin( t * 1.4 + d.phase ) * d.amp;
      d.img.rotation += ( 0.3 + Math.abs( w ) / 60 ) * d.spin * dt;
      this.wrapX( d.img, left, right );
    }
    for ( let i = 0; i < this.motes.length; i++ )
    {
      const m = this.motes[ i ];
      m.y += Math.sin( t * 0.8 + i ) * 6 * dt;
      m.x += Math.cos( t * 0.5 + i * 1.7 ) * 5 * dt;
    }
    lvl.hazards.forEach( ( h, i ) =>
    {
      if ( this.knocked.has( i ) )
      {
        return;
      }
      const p = hazardPos( lvl, i, t );
      const img = this.hazards[ i ];
      const prevX = img.x;
      img.setPosition( p.x, p.y );
      if ( h.kind === 'bird' || h.kind === 'gull' )
      {
        const f = Math.floor( t * 6 + i ) % 2;
        const key = h.kind + f;
        if ( img.texture.key !== key )
        {
          img.setTexture( key );
        }
        if ( Math.abs( p.x - prevX ) > 0.05 )
        {
          img.flipX = p.x < prevX;
        }
      }
      else
      {
        img.rotation = t * 1.5;
      }
    } );
    if ( this.stamp.visible )
    {
      this.stamp.y = lvl.stamp.y + Math.sin( t * 2.2 ) * 5;
      this.stamp.rotation = Math.sin( t * 1.7 ) * 0.15;
      this.stampGlow.y = this.stamp.y;
      this.stampGlow.setScale( 1.5 + Math.sin( t * 3 ) * 0.15 );
    }
    // Світло на місці посадки дихає, щоб око знаходило його навіть у русі
    const pulse = Math.sin( t * 2.4 );
    this.padBeam.setAlpha( 0.2 + pulse * 0.04 );
    this.padEdgeL.setAlpha( 0.5 + pulse * 0.08 );
    this.padEdgeR.setAlpha( 0.5 + pulse * 0.08 );
    // Вода повільно хитається вбік і ледь підіймається: хвилі живі, але лінія води лишається на місці
    for ( const w of this.waterImgs )
    {
      w.img.setPosition( w.x + Math.sin( t * 0.6 ) * 30, w.y + Math.sin( t * 1.3 ) * 3 );
    }
    if ( this.water )
    {
      const gy = groundY( lvl );
      const g = this.water;
      const th = THEMES[ lvl.theme ];
      g.clear();
      g.fillStyle( th.ground, 1 );
      g.fillRect( -400, gy + 8, lvl.width + 800, lvl.height - gy + 400 );
      g.fillStyle( th.groundTop, 1 );
      g.beginPath();
      g.moveTo( -400, gy + 30 );
      for ( let x = -400; x <= lvl.width + 400; x += 20 )
      {
        g.lineTo( x, gy + 6 + Math.sin( x / 40 + t * 2 ) * 4 );
      }
      g.lineTo( lvl.width + 400, gy + 30 );
      g.closePath();
      g.fillPath();
      g.fillStyle( 0xffffff, 0.5 );
      for ( let x = -400; x <= lvl.width + 400; x += 90 )
      {
        g.fillRect( x + ( ( t * 20 ) % 90 ), gy + 14 + Math.sin( x ) * 3, 26, 3 );
      }
    }
  }

  hideStamp(): void
  {
    this.stamp.setVisible( false );
    this.stampGlow.setVisible( false );
  }

  // Птах, у якого врізалась куля, перекидається й відлітає геть від неї (dir — убік від кулі: -1 чи 1)
  knockHazard( i: number, dir: number ): void
  {
    const img = this.hazards[ i ];
    if ( !img || this.knocked.has( i ) )
    {
      return;
    }
    this.knocked.add( i );
    const tw = this.scene.tweens;
    tw.add( { targets: img, x: img.x + dir * 190, duration: 900, ease: 'Quad.out' } );
    tw.chain( { targets: img, tweens: [
      { y: '-=70', duration: 300, ease: 'Quad.out' },
      { y: '+=330', duration: 700, ease: 'Quad.in' }
    ] } );
    tw.add( { targets: img, angle: dir * 540, duration: 1100, ease: 'Quad.out' } );
    tw.add( { targets: img, alpha: 0, delay: 600, duration: 500 } );
  }

  destroy(): void
  {
    for ( const o of this.objects )
    {
      o.destroy();
    }
    this.objects = [];
    this.drifters = [];
    this.hazards = [];
    this.knocked.clear();
    this.motes = [];
    this.mailboxes = [];
    this.markers = [];
  }
}
