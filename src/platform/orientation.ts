import type Phaser from 'phaser';
import { t } from '../core/i18n.ts';

// Гра альбомна: на вертикальному телефоні не видно, куди сідати, тож просимо повернути пристрій
export function setupOrientation( game: Phaser.Game ): void
{
  const el = document.createElement( 'div' );
  el.id = 'rotate';
  const phone = document.createElement( 'div' );
  phone.className = 'phone';
  const text = document.createElement( 'p' );
  text.textContent = t( 'rotate' );
  el.append( phone, text );
  document.body.appendChild( el );

  const portrait = window.matchMedia( '(orientation: portrait) and (pointer: coarse)' );
  const apply = () =>
  {
    el.classList.toggle( 'on', portrait.matches );
    if ( portrait.matches )
    {
      game.events.emit( 'force-pause' );
    }
  };
  portrait.addEventListener( 'change', apply );
  apply();

  // Там, де браузер дозволяє (Android у повноекранному режимі порталу), фіксуємо альбомну орієнтацію самі
  const lock = () =>
  {
    const o = screen.orientation as ScreenOrientation & { lock?: ( o: string ) => Promise<void> };
    o?.lock?.( 'landscape' ).catch( () => undefined );
  };
  window.addEventListener( 'pointerdown', lock );
}
