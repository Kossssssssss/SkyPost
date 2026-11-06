import { setFont } from './widgets.ts';

// Лише для вибору шрифту в дев-режимі: ?font=Nunito підвантажує його з Google Fonts просто в браузері.
// Обраний шрифт потім кладемо у файли гри, щоб реліз не ходив на сторонні сервери
export async function previewFont(): Promise<void>
{
  const family = new URLSearchParams( location.search ).get( 'font' );
  if ( !family )
  {
    return;
  }
  const css = ( q: string ) => new Promise<boolean>( ( res ) =>
  {
    const link = document.createElement( 'link' );
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${ encodeURIComponent( family ) }${ q }&display=block`;
    link.onload = () => res( true );
    link.onerror = () => res( false );
    document.head.appendChild( link );
  } );
  // Частина рукописних шрифтів має лише звичайну вагу, і тоді запит із жирною повертає помилку
  if ( !( await css( ':wght@400;700' ) ) )
  {
    await css( '' );
  }
  // Кирилиця лежить в окремому піднаборі, тож просимо саме її, інакше канвас намалює запасним шрифтом
  await Promise.all( [
    document.fonts.load( `700 32px "${ family }"`, 'Доставити Їжак Ab' ),
    document.fonts.load( `400 32px "${ family }"`, 'Доставити Їжак Ab' )
  ] ).catch( () => [] );
  setFont( family );
}
