import Phaser from 'phaser';
import type { Theme } from '../core/level.ts';
import { THEMES } from '../ui/worldView.ts';
import { pack, themeArt, type LayerSpec } from '../ui/pack.ts';

interface Layer
{
  name: 'far' | 'mid' | 'near';
  spec: LayerSpec;
  key: string;
  imgs: Phaser.GameObjects.Image[];
}

interface SkyCloud
{
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  depth: number;
}

interface Bird { x: number; y: number; s: number; ph: number }

const CLOUD_SPEED = [ 0.05, 0.12 ];
const CLOUD_SIZE = [ 0.11, 0.17 ];
// Серпанок кольору неба поверх пейзажу на рівні: фон блякне й відступає, тож куля, перешкоди й пошта читаються першими
const HAZE = 0.38;
// Далека блискавка в грозу: раз на 7–16 с за дальніми пагорбами, з коротким мерехтінням і світлішим небом
const BOLT_GAP = [ 7, 16 ];
const BOLT_LIFE = 0.6;

// Окрема сцена під грою: небо й далекий план не залежать від зуму ігрової камери
export class BgScene extends Phaser.Scene
{
  private sky!: Phaser.GameObjects.Graphics;
  private haze!: Phaser.GameObjects.Graphics;
  private far?: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Image;
  // Намальовані промені окремим кільцем під диском: повільно обертаються й ледь дихають
  private sunRays?: Phaser.GameObjects.Image;
  private raysK = 1;
  private sunK = 1;
  private layers: Layer[] = [];
  private clouds: SkyCloud[] = [];
  private birds: Bird[] = [];
  private fx?: Phaser.GameObjects.Graphics;
  private bolt?: Phaser.GameObjects.Image;
  private flash?: Phaser.GameObjects.Graphics;
  private boltIn = 3;
  private boltT = BOLT_LIFE;
  private theme: Theme = 'meadow';
  private w = 0;
  private h = 0;
  private t = 0;
  // 0..1 — наскільки камера просунулась по рівню; далекий план зсувається на свій запас ширини
  progress = 0;
  // Зсув ігрової камери в екранних пікселях: шари пакета повторюють його кожен своєю часткою
  camX = 0;
  camY = 0;
  // У меню під шарами немає землі гри, тож опускаємо їх, ховаючи залиту смугу під нижнім шаром
  private menuDrop = 0;

  constructor()
  {
    super( 'bg' );
  }

  create(): void
  {
    this.sky = this.add.graphics();
    this.haze = this.add.graphics().setAlpha( this.scene.isActive( 'game' ) ? HAZE : 0 );
    // Намальоване акварельне сонце: без променів і світіння, приглушена охра. Без пака лишається м'яка пляма
    this.sunRays = pack && this.textures.exists( 'pk-sun_rays' ) ? this.add.image( 0, 0, 'pk-sun_rays' ).setAlpha( 0.9 ) : undefined;
    this.sun = pack && this.textures.exists( 'pk-sun' )
      ? this.add.image( 0, 0, 'pk-sun' ).setAlpha( 0.9 )
      : this.add.image( 0, 0, 'soft' ).setTint( 0xfff4c0 ).setAlpha( 0.7 ).setBlendMode( Phaser.BlendModes.ADD );
    this.far = undefined;
    this.layers = [];
    this.clouds = [];
    if ( pack )
    {
      this.buildPack();
    }
    const onResize = ( s: Phaser.Structs.Size ) => this.layout( s.width, s.height );
    this.scale.on( 'resize', onResize );
    this.events.once( 'shutdown', () =>
    {
      this.scale.off( 'resize', onResize );
      this.scene.stop( 'fg' );
    } );
    this.scene.launch( 'fg' );
    this.paintPage();
    this.layout( this.scale.width, this.scale.height );
  }

  private buildPack(): void
  {
    const cloud = ( depth: number ) =>
    {
      for ( let i = 0; i < 3; i++ )
      {
        const img = this.add.image( 0, 0, 'pk-cloud' + ( ( i + depth ) % 3 ) ).setOrigin( 0, 0.5 ).setAlpha( depth ? 0.92 : 0.7 );
        this.clouds.push( { img, x: Math.random(), y: 0.08 + Math.random() * 0.4, depth } );
      }
    };
    const layer = ( name: Layer[ 'name' ] ) =>
    {
      this.layers.push( { name, spec: themeArt( this.theme )[ name ], key: '', imgs: [] } );
    };
    this.flash = this.add.graphics().setAlpha( 0 );
    cloud( 0 );
    if ( this.textures.exists( 'pk-lightning' ) )
    {
      this.bolt = this.add.image( 0, 0, 'pk-lightning' ).setOrigin( 0.5, 0 ).setAlpha( 0 );
    }
    layer( 'far' );
    cloud( 1 );
    layer( 'mid' );
    this.fx = this.add.graphics();
    layer( 'near' );
    this.applyThemeArt();
    for ( let i = 0; i < 6; i++ )
    {
      this.birds.push( { x: Math.random(), y: 0.12 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.6, ph: Math.random() * 6 } );
    }
  }

  // Кожна тема має свої шари пейзажу; копії шарів перестворюємо під нову текстуру
  private applyThemeArt(): void
  {
    const art = themeArt( this.theme );
    for ( const l of this.layers )
    {
      const key = 'pk-' + art.prefix + l.name;
      if ( key === l.key )
      {
        continue;
      }
      l.key = key;
      l.spec = art[ l.name ];
      l.imgs.forEach( ( img ) => img.destroy() );
      l.imgs = [];
    }
    for ( const c of this.clouds )
    {
      c.img.setTint( art.cloudTint ?? 0xffffff );
    }
    // Світило теми: сонце, місяць або нічого (гроза); промені — лише в сонця
    const sunKey = art.sun ?? 'pk-sun';
    const shown = sunKey !== '' && this.textures.exists( sunKey );
    if ( shown && this.sun.texture.key !== sunKey )
    {
      this.sun.setTexture( sunKey );
    }
    this.sun.setVisible( shown );
    this.sunRays?.setVisible( shown && sunKey === 'pk-sun' );
    this.boltT = BOLT_LIFE;
    this.bolt?.setAlpha( 0 );
    this.flash?.setAlpha( 0 );
  }

  // Chrome на Android фарбує системну панель навігації під грою кольором фону сторінки,
  // тож тримаємо його в тон землі, а не голубим, як на екрані завантаження
  private paintPage(): void
  {
    const col = '#' + THEMES[ this.theme ].ground.toString( 16 ).padStart( 6, '0' );
    document.documentElement.style.backgroundColor = col;
    document.body.style.backgroundColor = col;
  }

  setTheme( theme: Theme ): void
  {
    this.theme = theme;
    this.paintPage();
    if ( pack )
    {
      this.applyThemeArt();
      this.layout( this.w || this.scale.width, this.h || this.scale.height );
      return;
    }
    if ( this.far?.texture.key === THEMES[ theme ].far )
    {
      return;
    }
    this.far?.destroy();
    this.far = undefined;
    const key = THEMES[ theme ].far;
    if ( this.textures.exists( key ) )
    {
      this.far = this.add.image( 0, 0, key ).setOrigin( 0, 1 ).setAlpha( 0.6 );
    }
    this.layout( this.w || this.scale.width, this.h || this.scale.height );
  }

  layout( w: number, h: number ): void
  {
    this.w = w;
    this.h = h;
    this.cameras.main.setSize( w, h );
    this.sky.clear();
    this.haze.clear();
    if ( pack )
    {
      // Кілька зупинок градієнта: двоколірний fillGradient не дає заходу сонця
      const st = themeArt( this.theme ).sky ?? pack.sky;
      for ( let i = 0; i < st.length - 1; i++ )
      {
        const y0 = ( h * i ) / ( st.length - 1 );
        for ( const g of [ this.sky, this.haze ] )
        {
          g.fillGradientStyle( st[ i ], st[ i ], st[ i + 1 ], st[ i + 1 ], 1 );
          g.fillRect( 0, y0, w, h / ( st.length - 1 ) + 1 );
        }
      }
    }
    else
    {
      const th = THEMES[ this.theme ];
      this.sky.fillGradientStyle( th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1 );
      this.sky.fillRect( 0, 0, w, h );
    }
    // Діаметр сонця — 13% меншої сторони екрана (м'яку пляму без пака лишаємо як була)
    const painted = this.sun.texture.key.startsWith( 'pk-' );
    const sunK = painted ? ( Math.min( w, h ) * 0.13 ) / this.sun.width : Math.min( w, h ) / 220;
    this.sunK = sunK;
    this.sun.setPosition( w * 0.8, h * ( painted ? 0.22 : 0.16 ) ).setScale( sunK );
    // Спалах блискавки — бліде небо поверх градієнта, під хмарами й пагорбами
    this.flash?.clear().fillStyle( 0xeef0f6, 1 ).fillRect( 0, 0, w, h );
    // Радіус диска: 112 px на sun.webp і 155 px на sun_rays.webp, тож промені точно облягають наш диск
    this.raysK = sunK * 112 / 155;
    this.sunRays?.setPosition( this.sun.x, this.sun.y ).setScale( this.raysK );
    for ( const l of this.layers )
    {
      const tex = this.textures.get( l.key ).getSourceImage();
      const k = ( h * l.spec.height ) / tex.height;
      const n = Math.ceil( w / ( tex.width * k ) ) + 2;
      while ( l.imgs.length < n )
      {
        const img = this.add.image( 0, 0, l.key ).setOrigin( 0, 1 ).setAlpha( l.spec.alpha ).setTint( themeArt( this.theme ).layerTint ?? 0xffffff );
        img.setDepth( 0 );
        l.imgs.push( img );
      }
      // Порядок відображення тримаємо за порядком створення шарів
      for ( const img of l.imgs )
      {
        img.setScale( k );
      }
    }
    this.sortLayers();
    if ( this.far )
    {
      const k = Math.max( ( h * 0.62 ) / this.far.height, ( w * 1.15 ) / this.far.width );
      this.far.setScale( k );
      this.far.y = h;
    }
  }

  // Нові копії шарів додаються в кінець списку, тож повертаємо кожну під свій наступний шар
  private sortLayers(): void
  {
    let d = 1;
    this.sky.setDepth( 0 );
    const order: ( Phaser.GameObjects.Image | Phaser.GameObjects.Graphics )[] = [];
    if ( this.flash )
    {
      order.push( this.flash );
    }
    for ( const c of this.clouds.filter( ( c ) => c.depth === 0 ) )
    {
      order.push( c.img );
    }
    if ( this.bolt )
    {
      order.push( this.bolt );
    }
    order.push( ...this.layers[ 0 ]?.imgs ?? [] );
    for ( const c of this.clouds.filter( ( c ) => c.depth === 1 ) )
    {
      order.push( c.img );
    }
    order.push( ...this.layers[ 1 ]?.imgs ?? [] );
    if ( this.fx )
    {
      order.push( this.fx );
    }
    order.push( ...this.layers[ 2 ]?.imgs ?? [] );
    order.push( this.haze );
    // Сонце над серпанком, бо під ним охра сіріє; на рівні його натомість приглушує власна прозорість
    order.push( ...( this.sunRays ? [ this.sunRays ] : [] ), this.sun );
    for ( const o of order )
    {
      o.setDepth( d++ );
    }
  }

  update( _time: number, delta: number ): void
  {
    const dt = Math.min( 0.05, delta / 1000 );
    this.t += dt;
    if ( this.far )
    {
      this.far.x = -( this.far.displayWidth - this.w ) * Phaser.Math.Clamp( this.progress, 0, 1 );
    }
    if ( !pack )
    {
      return;
    }
    // Поза грою (карта, магазин) фон сам повільно пливе, щоб меню теж здавалося польотом
    const menu = !this.scene.isActive( 'game' );
    if ( menu )
    {
      this.camX += dt * 60;
      this.camY *= 1 - Math.min( 1, dt * 2 );
    }
    this.menuDrop += ( ( menu ? 0.07 : 0 ) - this.menuDrop ) * Math.min( 1, dt * 3 );
    this.haze.alpha += ( ( menu ? 0 : HAZE ) - this.haze.alpha ) * Math.min( 1, dt * 3 );
    const sunA = 0.9 - this.haze.alpha;
    this.sun.setAlpha( sunA );
    this.sunRays?.setAlpha( sunA * 0.8 );
    // Повний оберт приблизно за 5 хвилин і подих ±3%: небо живе, але не мерехтить
    // На рівні сонце менше й блідіше: воно не має тягнути погляд від кулі
    const sunS = 1 - this.haze.alpha * 0.65;
    this.sun.setScale( this.sunK * sunS );
    this.sunRays?.setRotation( this.t * 0.02 ).setScale( this.raysK * sunS * ( 1 + Math.sin( this.t * 0.8 ) * 0.03 ) );
    for ( const l of this.layers )
    {
      this.placeLayer( l );
    }
    for ( const c of this.clouds )
    {
      this.placeCloud( c );
      // Хмари світлі й під серпанком лишаються яскравими плямами, тож на рівні ще й прозоріші
      c.img.setAlpha( ( c.depth ? 0.92 : 0.7 ) * ( 1 - this.haze.alpha ) );
    }
    const fx = this.fx!;
    fx.clear();
    // Декоративних рисок вітру тут немає: вони летіли завжди справа наліво й плутали з реальним вітром
    // Уночі птахи сплять
    if ( this.theme !== 'night' )
    {
      this.drawBirds( fx, dt );
    }
    this.updateBolt( dt );
  }

  // Удар: яскраво, мить темніше, ще раз яскраво й повільне згасання
  private updateBolt( dt: number ): void
  {
    if ( !this.bolt || this.theme !== 'storm' )
    {
      return;
    }
    this.boltIn -= dt;
    if ( this.boltIn <= 0 )
    {
      this.boltIn = Phaser.Math.FloatBetween( BOLT_GAP[ 0 ], BOLT_GAP[ 1 ] );
      this.boltT = 0;
      const far = this.layers[ 0 ];
      const top = far?.imgs[ 0 ] ? far.imgs[ 0 ].y - far.imgs[ 0 ].displayHeight * 0.6 : this.h * 0.6;
      this.bolt.setPosition( this.w * Phaser.Math.FloatBetween( 0.1, 0.9 ), this.h * 0.1 ).setFlipX( Math.random() < 0.5 );
      this.bolt.setScale( Math.max( 0.1, top - this.bolt.y ) / this.bolt.height );
    }
    this.boltT += dt;
    const t = this.boltT;
    const a = t < 0.06 ? 0.9 : t < 0.12 ? 0.25 : t < 0.18 ? 0.8 : Math.max( 0, 0.8 * ( 1 - ( t - 0.18 ) / ( BOLT_LIFE - 0.18 ) ) );
    this.bolt.setAlpha( a );
    this.flash!.setAlpha( a * 0.3 );
  }

  // Дзеркальне тайлінгування: кожна друга копія віддзеркалена, тож шов між копіями не видно
  private placeLayer( l: Layer ): void
  {
    const img0 = l.imgs[ 0 ];
    const tw = img0.displayWidth;
    const scroll = this.camX * l.spec.scroll;
    let idx = Math.floor( scroll / tw );
    let x = idx * tw - scroll;
    // Камера вгору — земля опускається, але дальні пласти майже стоять
    const y = this.h * ( l.spec.bottom + this.menuDrop * ( 0.3 + l.spec.scroll * 2 ) ) - this.camY * l.spec.scroll * 0.5;
    for ( const img of l.imgs )
    {
      img.setFlipX( ( ( idx % 2 ) + 2 ) % 2 === 1 );
      img.setPosition( x, y );
      x += tw;
      idx++;
    }
  }

  private placeCloud( c: SkyCloud ): void
  {
    const { w, h } = this;
    const k = ( h * CLOUD_SIZE[ c.depth ] ) / c.img.height;
    c.img.setScale( k );
    const cw = c.img.displayWidth;
    const span = w + cw * 2 + 300;
    // Хмари і пливуть за вітром, і зсуваються від руху камери: дві швидкості дають глибину
    const sp = CLOUD_SPEED[ c.depth ];
    const raw = c.x * span - this.camX * sp - this.t * 40 * sp * 4;
    c.img.x = ( ( raw % span ) + span ) % span - cw;
    c.img.y = h * c.y - this.camY * sp;
  }

  private drawBirds( g: Phaser.GameObjects.Graphics, dt: number ): void
  {
    const { w, h } = this;
    g.lineStyle( Math.max( 2, h * 0.003 ), pack!.ink, 0.5 );
    for ( const b of this.birds )
    {
      b.x -= dt * 0.025 * b.s;
      if ( b.x < -0.05 )
      {
        b.x = 1.05;
        b.y = 0.12 + Math.random() * 0.3;
      }
      const flap = Math.sin( this.t * 9 * b.s + b.ph ) * h * 0.007 * b.s;
      const x = b.x * w - this.camX * 0.1;
      const xx = ( ( x % ( w * 1.1 ) ) + w * 1.1 ) % ( w * 1.1 ) - w * 0.05;
      const y = b.y * h - this.camY * 0.1;
      const s = h * 0.01 * b.s;
      g.beginPath();
      g.moveTo( xx - s, y - flap );
      g.lineTo( xx - s * 0.35, y - s * 0.15 );
      g.lineTo( xx, y );
      g.lineTo( xx + s * 0.35, y - s * 0.15 );
      g.lineTo( xx + s, y - flap );
      g.strokePath();
    }
  }
}
