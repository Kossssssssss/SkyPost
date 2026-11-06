// Chrome на Android не ховає адресний рядок і нижню смугу над панеллю жестів, бо сторінка гри
// не прокручується; повний екран прибирає обидва. У порталі гра в iframe, і цим керує сам портал
export function fullscreenOnFirstTap(): void
{
  const touch = window.matchMedia( '(pointer: coarse)' ).matches;
  if ( window.self !== window.top || !touch || !document.fullscreenEnabled )
  {
    return;
  }
  // Браузер дозволяє повний екран лише у відповідь на дотик; після першого успіху більше не нав'язуємо,
  // щоб гравець, який сам вийшов із повного екрана, міг лишитися з адресним рядком
  const tap = () =>
  {
    if ( document.fullscreenElement )
    {
      return;
    }
    document.documentElement.requestFullscreen( { navigationUI: 'hide' } )
      .then( () => window.removeEventListener( 'pointerup', tap ) )
      .catch( () => {} );
  };
  window.addEventListener( 'pointerup', tap );
}
