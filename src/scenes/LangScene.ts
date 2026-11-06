import Phaser from 'phaser';
import { LANGS, LANG_NAMES, currentLang, setLang, type Lang } from '../core/i18n.ts';
import { save } from '../core/save.ts';
import { audio } from '../core/audio.ts';
import { button, label, panel, uiScale, COLORS, inkHex } from '../ui/widgets.ts';

const COLS: Record<Lang, [ number, number ]> = {
  uk: [ COLORS.green, COLORS.greenDark ],
  ru: [ COLORS.blue, COLORS.blueDark ],
  en: [ COLORS.primary, COLORS.primaryDark ]
};

// Вибір мови: при першому запуску перед першим рівнем, а потім із карти
export class LangScene extends Phaser.Scene
{
  private back?: { world: number };
  private root!: Phaser.GameObjects.Container;

  constructor()
  {
    super( 'lang' );
  }

  init( data: { world?: number } ): void
  {
    this.back = data.world ? { world: data.world } : undefined;
  }

  create(): void
  {
    this.root = this.add.container( 0, 0 );
    this.scale.on( 'resize', this.build, this );
    this.events.once( 'shutdown', () => this.scale.off( 'resize', this.build, this ) );
    this.input.on( 'pointerdown', () => audio.unlock() );
    this.build();
  }

  private build(): void
  {
    this.root.removeAll( true );
    const w = this.scale.width;
    const h = this.scale.height;
    const u = uiScale();
    this.cameras.main.setSize( w, h );
    this.root.add( this.add.rectangle( 0, 0, w, h, 0x101830, 0.35 ).setOrigin( 0 ) );
    const cw = 620 * u;
    const ch = 540 * u;
    const c = this.add.container( w / 2, h / 2 );
    this.root.add( c );
    c.add( panel( this, cw, ch ) );
    // Заголовок усіма трьома мовами: гравець ще не вибрав, якою читати
    c.add( label( this, 0, -ch / 2 + 70 * u, 'Мова · Язык · Language', 40 * u, inkHex(), false ) );
    LANGS.forEach( ( l, i ) =>
    {
      const [ col, dark ] = COLS[ l ];
      const b = button( this, 0, -90 * u + i * 110 * u, {
        w: 420 * u, h: 86 * u, text: LANG_NAMES[ l ], size: 36 * u, color: col, dark,
        onClick: () => this.pick( l )
      } );
      // Поточну мову трохи виділяємо, коли гравець прийшов змінити її з карти
      if ( this.back && l !== currentLang() )
      {
        b.setAlpha( 0.75 );
      }
      c.add( b );
    } );
  }

  private pick( l: Lang ): void
  {
    setLang( l );
    if ( this.back )
    {
      this.scene.start( 'map', this.back );
    }
    else
    {
      this.scene.start( 'game', { levelId: save().lastLevel } );
    }
  }
}
