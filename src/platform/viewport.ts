// Chrome на Android рахує висоту CSS-блоків по-різному залежно від адресного рядка,
// тож розмір контейнера гри задаємо з видимої області, яку бачить користувач
export function fitViewport(): void
{
  const el = document.getElementById( 'game' );
  if ( !el )
  {
    return;
  }
  const debug = new URLSearchParams( location.search ).has( 'debug' );
  const info = debug ? document.createElement( 'div' ) : undefined;
  if ( info )
  {
    info.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:10;font:12px monospace;color:#fff;background:#000a;padding:4px 6px;pointer-events:none;white-space:pre';
    document.body.appendChild( info );
  }

  const apply = () =>
  {
    const vv = window.visualViewport;
    const w = Math.round( vv ? vv.width : window.innerWidth );
    const h = Math.round( vv ? vv.height : window.innerHeight );
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    if ( info )
    {
      const r = el.getBoundingClientRect();
      const c = el.querySelector( 'canvas' )?.getBoundingClientRect();
      const de = document.documentElement;
      info.textContent = [
        'inner ' + window.innerWidth + 'x' + window.innerHeight,
        'vv ' + ( vv ? vv.width.toFixed( 1 ) + 'x' + vv.height.toFixed( 1 ) + ' top ' + vv.offsetTop.toFixed( 1 ) + ' s ' + vv.scale.toFixed( 2 ) : '-' ),
        'doc ' + de.clientWidth + 'x' + de.clientHeight,
        'game ' + r.width.toFixed( 1 ) + 'x' + r.height.toFixed( 1 ) + ' @' + r.top.toFixed( 1 ),
        'canvas ' + ( c ? c.width.toFixed( 1 ) + 'x' + c.height.toFixed( 1 ) + ' @' + c.top.toFixed( 1 ) : '-' ),
        'screen ' + screen.width + 'x' + screen.height + ' dpr ' + devicePixelRatio.toFixed( 2 )
      ].join( '\n' );
    }
  };

  apply();
  window.addEventListener( 'resize', apply );
  window.visualViewport?.addEventListener( 'resize', apply );
  // Після повороту телефона розміри встигають оновитися не одразу, тож ще й перевіряємо періодично
  window.setInterval( apply, 500 );
}
