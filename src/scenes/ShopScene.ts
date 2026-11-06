import Phaser from 'phaser';
import { t, tn } from '../core/i18n.ts';
import { save, persist, type SkinSlot } from '../core/save.ts';
import { skinsOf, skin, type Skin } from '../core/skins.ts';
import { audio } from '../core/audio.ts';
import { BalloonView } from '../ui/balloonView.ts';
import { button, label, panel, uiScale, COLORS, inkHex } from '../ui/widgets.ts';
import { worldPerfect } from '../levels/index.ts';
import { pack } from '../ui/pack.ts';

const SLOTS: SkinSlot[] = [ 'envelope', 'basket', 'trail', 'pilot' ];

const TRAIL_TEX: Record<string, string> = { 'trl-puff': 'soft', 'trl-spark': 'spark', 'trl-heart': 'heart', 'trl-rainbow': 'dot' };

export class ShopScene extends Phaser.Scene
{
  private slot: SkinSlot = 'envelope';
  private backWorld = 1;
  private root!: Phaser.GameObjects.Container;
  private preview?: BalloonView;
  private trail?: Phaser.GameObjects.Particles.ParticleEmitter;
  private hovered?: Skin;

  constructor()
  {
    super( 'shop' );
  }

  init( data: { world?: number } ): void
  {
    this.backWorld = data.world ?? 1;
  }

  create(): void
  {
    this.root = this.add.container( 0, 0 );
    this.scale.on( 'resize', this.build, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.build, this ) );
    this.input.keyboard!.on( 'keydown-ESC', () => this.back() );
    this.build();
  }

  private back(): void
  {
    this.scene.start( 'map', { world: this.backWorld } );
  }

  private build(): void
  {
    this.root.removeAll( true );
    this.trail?.destroy();
    this.trail = undefined;
    this.preview = undefined;
    const w = this.scale.width;
    const h = this.scale.height;
    const u = uiScale();
    this.cameras.main.setSize( w, h );
    // З пакетом під магазином летить живий фон із карти
    if ( !pack )
    {
      const sky = this.add.graphics();
      sky.fillGradientStyle( 0x6ab8f0, 0x6ab8f0, 0xffe8d0, 0xffe8d0, 1 );
      sky.fillRect( 0, 0, w, h );
      this.root.add( sky );
    }

    const m = 22 * u;
    const bs = 84 * u;
    this.root.add( button( this, m + bs / 2, m + bs / 2, { w: bs, h: bs, icon: 'i-back', color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.back() } ) );
    this.root.add( label( this, m * 2 + bs, m + bs / 2, t( 'shop' ), 50 * u ).setOrigin( 0, 0.5 ) );
    this.root.add( this.add.image( w - m - 230 * u, m + bs / 2, 'star' ).setDisplaySize( 60 * u, 60 * u ) );
    this.root.add( label( this, w - m - 190 * u, m + bs / 2, String( save().wallet ), 44 * u ).setOrigin( 0, 0.5 ) );
    this.root.add( label( this, w - m - 230 * u, m + bs + 16 * u, t( 'wallet' ), 20 * u ) );

    const leftW = Math.min( w * 0.32, 560 * u );
    const pc = this.add.container( m + leftW / 2, h * 0.56 );
    this.root.add( pc );
    pc.add( panel( this, leftW - 20 * u, h * 0.7 ) );
    const eq = { ...save().equip };
    if ( this.hovered )
    {
      eq[ this.hovered.slot ] = this.hovered.id;
    }
    const pv = new BalloonView( this, m + leftW / 2, h * 0.56 + 150 * u );
    pv.applySkins( eq );
    pv.setScale( 3 * u );
    this.root.add( pv );
    this.preview = pv;
    this.tweens.add( { targets: pv, y: pv.y - 20 * u, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' } );
    this.makeTrail( eq.trail, pv, u );

    const tabsX = m + leftW + 20 * u;
    const areaW = w - tabsX - m;
    const tabW = Math.min( 250 * u, ( areaW - 30 * u ) / 4 );
    SLOTS.forEach( ( s, i ) =>
    {
      const active = s === this.slot;
      this.root.add( button( this, tabsX + tabW / 2 + i * ( tabW + 10 * u ), m + bs + 70 * u, {
        w: tabW, h: 74 * u, text: t( s ), size: 26 * u,
        color: active ? COLORS.primary : COLORS.grey, dark: active ? COLORS.primaryDark : COLORS.greyDark,
        onClick: () =>
        {
          this.slot = s;
          this.hovered = undefined;
          this.build();
        }
      } ) );
    } );

    const items = skinsOf( this.slot );
    const gridTop = m + bs + 140 * u;
    // Кількість колонок підбираємо так, щоб картки вийшли найбільшими й при цьому влізли у висоту
    const gap = 16 * u;
    const availH = h - gridTop - m;
    let best = { cols: 2, k: 0 };
    for ( let cols = 2; cols <= 6; cols++ )
    {
      const rows = Math.ceil( items.length / cols );
      const k = Math.min( 1, ( areaW - ( cols - 1 ) * gap ) / cols / ( 260 * u ), ( availH - ( rows - 1 ) * gap ) / rows / ( 300 * u ) );
      if ( k > best.k + 0.01 )
      {
        best = { cols, k };
      }
    }
    const cols = best.cols;
    const cw = 260 * u * best.k;
    const ch = 300 * u * best.k;
    items.forEach( ( sk, i ) =>
    {
      const cx = tabsX + cw / 2 + ( i % cols ) * ( cw + gap );
      const cy = gridTop + ch / 2 + Math.floor( i / cols ) * ( ch + gap );
      this.card( sk, cx, cy, cw, ch, u );
    } );
  }

  private makeTrail( id: string, target: Phaser.GameObjects.Container, u: number ): void
  {
    const tex = TRAIL_TEX[ id ];
    if ( !tex )
    {
      return;
    }
    const sk = skin( id );
    // Шлейф тягнеться ліворуч, імітуючи політ кулі
    this.trail = this.add.particles( 0, 0, tex, {
      follow: target, followOffset: { x: 0, y: -10 * u },
      speedX: { min: -260 * u, max: -180 * u }, speedY: { min: -20, max: 20 },
      lifespan: 1300, frequency: id === 'trl-rainbow' ? 25 : 70,
      scale: { start: 0.6 * u, end: 0.15 * u }, alpha: { start: 0.9, end: 0 }, tint: sk.colors
    } );
    this.root.addAt( this.trail, 2 );
  }

  private card( sk: Skin, x: number, y: number, fitW: number, fitH: number, u: number ): void
  {
    const sv = save();
    const owned = sv.owned.includes( sk.id );
    const equipped = sv.equip[ sk.slot ] === sk.id;
    const c = this.add.container( x, y );
    this.root.add( c );
    // Картка верстається в номінальному розмірі й масштабується цілком, щоб на низьких екранах вміст не налазив
    const cw = 260 * u;
    const ch = 330 * u;
    c.setScale( Math.min( fitW / cw, fitH / ch ) );
    const g = this.add.graphics();
    if ( pack )
    {
      // Картка — той самий акварельний пергамент; вдягнений скін підсвічуємо теплим тоном
      const p = panel( this, cw, ch ) as Phaser.GameObjects.Container;
      if ( equipped )
      {
        ( p.list[ 1 ] as Phaser.GameObjects.NineSlice ).setTint( 0xffe2a0 );
      }
      c.add( p );
    }
    else
    {
      g.fillStyle( 0x000000, 0.18 );
      g.fillRoundedRect( -cw / 2, -ch / 2 + 6 * u, cw, ch, 22 * u );
      g.fillStyle( equipped ? 0xfff0b0 : 0xfff8ec, 1 );
      g.fillRoundedRect( -cw / 2, -ch / 2, cw, ch, 22 * u );
    }
    if ( equipped && !pack )
    {
      g.lineStyle( 6 * u, 0xffb03a, 1 );
      g.strokeRoundedRect( -cw / 2, -ch / 2, cw, ch, 22 * u );
    }
    c.add( g );
    const iy = -ch / 2 + ch * 0.31;
    if ( sk.slot === 'envelope' )
    {
      c.add( this.add.image( 0, iy, 'env:' + sk.id ).setScale( 0.7 * u ) );
    }
    else if ( sk.slot === 'basket' )
    {
      c.add( this.add.image( 0, iy, 'bas:' + sk.id ).setScale( 1.6 * u ) );
    }
    else if ( sk.slot === 'pilot' )
    {
      c.add( this.add.image( 0, iy, 'plt:' + sk.id ).setScale( 1.5 * u ) );
    }
    else
    {
      const tex = TRAIL_TEX[ sk.id ];
      if ( tex )
      {
        for ( let k = 0; k < 5; k++ )
        {
          const img = this.add.image( -60 * u + k * 30 * u, iy + Math.sin( k ) * 12 * u, tex ).setScale( ( 0.5 + k * 0.12 ) * u );
          const col = sk.colors[ k % sk.colors.length ];
          // Білий шлейф на кремовій картці не видно, тож іконку трохи затемнюємо
          img.setTint( col === 0xffffff ? 0xa8bcd8 : col );
          c.add( img );
        }
      }
      else
      {
        c.add( label( this, 0, iy, '—', 50 * u, '#8090b0', false ) );
      }
    }
    c.add( label( this, 0, ch / 2 - 138 * u, tn( sk.name ), 26 * u, inkHex(), false ) );

    // Нижня рамка пергаменту товста, тож кнопка й напис стоять вище за неї, а не на ній
    const bw = cw - 70 * u;
    const by = ch / 2 - 84 * u;
    if ( equipped )
    {
      c.add( label( this, 0, by, '✔ ' + t( 'equipped' ), 24 * u, '#2f8a4e', false ) );
    }
    else if ( owned )
    {
      c.add( button( this, 0, by, { w: bw, h: 56 * u, text: t( 'equip' ), size: 24 * u, color: COLORS.blue, dark: COLORS.blueDark, onClick: () => this.equip( sk ) } ) );
    }
    else if ( sk.world )
    {
      const can = worldPerfect( sk.world );
      if ( can )
      {
        sv.owned.push( sk.id );
        persist();
      }
      c.add( label( this, 0, by, t( 'special', sk.world ), 17 * u, '#7a50a0', false ).setWordWrapWidth( bw ) );
    }
    else
    {
      const afford = sv.wallet >= sk.price;
      const b = button( this, 0, by, {
        w: bw, h: 56 * u, text: `${ sk.price } ★`, size: 28 * u,
        color: afford ? COLORS.green : COLORS.grey, dark: afford ? COLORS.greenDark : COLORS.greyDark,
        onClick: () => this.buy( sk )
      } );
      b.setEnabled( afford );
      c.add( b );
    }
    const hit = this.add.zone( 0, -ch * 0.12, cw, ch * 0.7 ).setInteractive();
    hit.on( 'pointerover', () =>
    {
      if ( this.hovered?.id !== sk.id )
      {
        this.hovered = sk;
        this.preview?.applySkins( { ...save().equip, [ sk.slot ]: sk.id } );
      }
    } );
    hit.on( 'pointerup', () =>
    {
      if ( owned && !equipped )
      {
        this.equip( sk );
      }
    } );
    c.add( hit );
  }

  private equip( sk: Skin ): void
  {
    save().equip[ sk.slot ] = sk.id;
    persist();
    this.hovered = undefined;
    this.build();
  }

  private buy( sk: Skin ): void
  {
    const sv = save();
    if ( sv.wallet < sk.price || sv.owned.includes( sk.id ) )
    {
      return;
    }
    sv.wallet -= sk.price;
    sv.owned.push( sk.id );
    sv.equip[ sk.slot ] = sk.id;
    persist();
    audio.buy();
    this.hovered = undefined;
    this.build();
  }
}
