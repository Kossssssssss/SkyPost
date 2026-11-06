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

// Окрема сцена під грою: небо й далекий план не залежать від зуму ігрової камери
export class BgScene extends Phaser.Scene
{
  private sky!: Phaser.GameObjects.Graphics;
  private far?: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Image;
  private rays?: Phaser.GameObjects.Graphics;
  private layers: Layer[] = [];
  private clouds: SkyCloud[] = [];
  private birds: Bird[] = [];
  private fx?: Phaser.GameObjects.Graphics;
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
    this.sun = this.add.image( 0, 0, 'soft' ).setTint( pack?.sun ?? 0xfff4c0 ).setAlpha( 0.7 ).setBlendMode( Phaser.BlendModes.ADD );
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
    this.rays = this.add.graphics().setBlendMode( Phaser.BlendModes.ADD );
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
    cloud( 0 );
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
    if ( pack )
    {
      // Кілька зупинок градієнта: двоколірний fillGradient не дає заходу сонця
      const st = pack.sky;
      for ( let i = 0; i < st.length - 1; i++ )
      {
        const y0 = ( h * i ) / ( st.length - 1 );
        this.sky.fillGradientStyle( st[ i ], st[ i ], st[ i + 1 ], st[ i + 1 ], 1 );
        this.sky.fillRect( 0, y0, w, h / ( st.length - 1 ) + 1 );
      }
    }
    else
    {
      const th = THEMES[ this.theme ];
      this.sky.fillGradientStyle( th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1 );
      this.sky.fillRect( 0, 0, w, h );
    }
    this.sun.setPosition( w * 0.8, h * 0.16 ).setScale( Math.min( w, h ) / 220 );
    for ( const l of this.layers )
    {
      const tex = this.textures.get( l.key ).getSourceImage();
      const k = ( h * l.spec.height ) / tex.height;
      const n = Math.ceil( w / ( tex.width * k ) ) + 2;
      while ( l.imgs.length < n )
      {
        const img = this.add.image( 0, 0, l.key ).setOrigin( 0, 1 ).setAlpha( l.spec.alpha );
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
    this.sun.setDepth( d++ );
    this.rays?.setDepth( d++ );
    const order: ( Phaser.GameObjects.Image | Phaser.GameObjects.Graphics )[] = [];
    for ( const c of this.clouds.filter( ( c ) => c.depth === 0 ) )
    {
      order.push( c.img );
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
    this.drawRays();
    for ( const l of this.layers )
    {
      this.placeLayer( l );
    }
    for ( const c of this.clouds )
    {
      this.placeCloud( c );
    }
    const fx = this.fx!;
    fx.clear();
    // Декоративних рисок вітру тут немає: вони летіли завжди справа наліво й плутали з реальним вітром
    this.drawBirds( fx, dt );
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

  private drawRays(): void
  {
    const g = this.rays!;
    const r = Math.max( this.w, this.h ) * 0.9;
    g.clear();
    g.fillStyle( 0xffffff, 0.06 );
    const cx = this.sun.x;
    const cy = this.sun.y;
    // Промені повільно обертаються — небо здається живим, навіть коли куля стоїть
    for ( let i = 0; i < 10; i++ )
    {
      const a = this.t * 0.03 + ( i * Math.PI ) / 5;
      g.fillTriangle( cx, cy, cx + Math.cos( a - 0.07 ) * r, cy + Math.sin( a - 0.07 ) * r, cx + Math.cos( a + 0.07 ) * r, cy + Math.sin( a + 0.07 ) * r );
    }
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
