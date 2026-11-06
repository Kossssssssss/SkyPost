// Чистка згенерованих ассетів у браузері: генератор вирізає хромакей грубо,
// лишаючи кольорову облямівку, тіні з відтінком тла й сміття внизу аркуша

export type Kind = 'layer' | 'sheet' | 'sprite';

export function loadImage( url: string ): Promise<HTMLImageElement>
{
  return new Promise( ( res, rej ) =>
  {
    const img = new Image();
    img.onload = () => res( img );
    img.onerror = () => rej( new Error( url ) );
    img.src = url;
  } );
}

function toCanvas( img: HTMLImageElement ): HTMLCanvasElement
{
  const c = document.createElement( 'canvas' );
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext( '2d' )!.drawImage( img, 0, 0 );
  return c;
}

function smooth( a: number, b: number, x: number ): number
{
  const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
  return t * t * ( 3 - 2 * t );
}

// Визначаємо, яким кольором був хромакей, за залишками у напівпрозорих пікселях
function detectKey( d: Uint8ClampedArray ): 'magenta' | 'green'
{
  let m = 0;
  let g = 0;
  for ( let i = 0; i < d.length; i += 16 )
  {
    const r = d[ i ];
    const gg = d[ i + 1 ];
    const b = d[ i + 2 ];
    // Залишки ключа живуть на напівпрозорих краях; суцільний пурпурний чи зелений — це вміст
    if ( d[ i + 3 ] === 0 || d[ i + 3 ] > 245 )
    {
      continue;
    }
    if ( Math.min( r, b ) - gg > 60 )
    {
      m++;
    }
    else if ( gg - Math.max( r, b ) > 60 )
    {
      g++;
    }
  }
  return g > m ? 'green' : 'magenta';
}

function despill( d: Uint8ClampedArray, key: 'magenta' | 'green' ): void
{
  for ( let i = 0; i < d.length; i += 4 )
  {
    if ( d[ i + 3 ] === 0 )
    {
      continue;
    }
    const r = d[ i ];
    const g = d[ i + 1 ];
    const b = d[ i + 2 ];
    const mx = Math.max( r, g, b ) + 1;
    const k = key === 'magenta' ? Math.min( r, b ) - g : g - Math.max( r, b );
    if ( k <= 0 )
    {
      continue;
    }
    // Що ближчий відтінок до ключа відносно яскравості, то прозоріший піксель
    const s = smooth( 0.32, 0.65, k / mx );
    // Яскравий ключ — це тло, воно зникає; темний ключ — це тінь на тлі, вона лишається сірою напівпрозорою
    const lum = key === 'magenta' ? g : ( r + b ) / 2;
    const shadow = Math.max( 0, 1 - mx / 190 ) * 0.6;
    const nr = key === 'magenta' ? r - k * 0.5 : r;
    const ng = key === 'magenta' ? g : g - k * 0.5;
    const nb = key === 'magenta' ? b - k * 0.5 : b;
    d[ i ] = nr + ( lum * 0.6 - nr ) * s;
    d[ i + 1 ] = ng + ( lum * 0.6 - ng ) * s;
    d[ i + 2 ] = nb + ( lum * 0.6 - nb ) * s;
    d[ i + 3 ] = d[ i + 3 ] * ( ( 1 - s ) + s * shadow );
  }
}

// Крайові пікселі перефарбовуємо кольором сусідньої «середини», щоб прибрати темну обвідку
function defringe( d: Uint8ClampedArray, w: number, h: number ): void
{
  const dist = new Uint8Array( w * h ).fill( 255 );
  const q: number[] = [];
  for ( let p = 0; p < w * h; p++ )
  {
    if ( d[ p * 4 + 3 ] < 24 )
    {
      dist[ p ] = 0;
      q.push( p );
    }
  }
  for ( let qi = 0; qi < q.length; qi++ )
  {
    const p = q[ qi ];
    const nd = dist[ p ] + 1;
    if ( nd > 4 )
    {
      continue;
    }
    const x = p % w;
    const y = ( p / w ) | 0;
    const nb = [ x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1 ];
    for ( const n of nb )
    {
      if ( n >= 0 && dist[ n ] > nd )
      {
        dist[ n ] = nd;
        q.push( n );
      }
    }
  }
  const src = d.slice();
  for ( let p = 0; p < w * h; p++ )
  {
    const dp = dist[ p ];
    if ( dp === 0 || dp > 2 )
    {
      continue;
    }
    const x = p % w;
    const y = ( p / w ) | 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for ( let dy = -4; dy <= 4; dy++ )
    {
      for ( let dx = -4; dx <= 4; dx++ )
      {
        const xx = x + dx;
        const yy = y + dy;
        if ( xx < 0 || yy < 0 || xx >= w || yy >= h )
        {
          continue;
        }
        const pp = yy * w + xx;
        if ( dist[ pp ] >= 4 )
        {
          r += src[ pp * 4 ];
          g += src[ pp * 4 + 1 ];
          b += src[ pp * 4 + 2 ];
          n++;
        }
      }
    }
    if ( n > 0 )
    {
      d[ p * 4 ] = r / n;
      d[ p * 4 + 1 ] = g / n;
      d[ p * 4 + 2 ] = b / n;
    }
    d[ p * 4 + 3 ] = src[ p * 4 + 3 ] * ( dp === 1 ? 0.55 : 0.9 );
  }
}

// Шар фону має бути суцільним донизу: заливаємо дірки й прозорий низ кольором над ними
function fillDown( d: Uint8ClampedArray, w: number, h: number ): number
{
  // Вершина колонки — перший піксель, під яким іде суцільна ділянка, а не поодинокий шум
  const RUN = 12;
  const tops = new Int32Array( w ).fill( -1 );
  for ( let x = 0; x < w; x++ )
  {
    let run = 0;
    for ( let y = 0; y < h; y++ )
    {
      run = d[ ( y * w + x ) * 4 + 3 ] > 200 ? run + 1 : 0;
      if ( run >= RUN )
      {
        tops[ x ] = y - RUN + 1;
        break;
      }
    }
  }
  // Лінія пагорба — найнижча вершина у вікні: вітряки й дерева над нею не повинні тягнути заливку вгору
  const WIN = 48;
  const raw = tops.slice();
  for ( let x = 0; x < w; x++ )
  {
    let m = -1;
    for ( let k = Math.max( 0, x - WIN ); k <= Math.min( w - 1, x + WIN ); k++ )
    {
      m = Math.max( m, raw[ k ] );
    }
    tops[ x ] = m;
  }
  // Колір заливки — середнє нижньої половини вмісту: рівна смуга не дає вертикальних патьоків
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for ( let x = 0; x < w; x += 3 )
  {
    if ( tops[ x ] < 0 )
    {
      continue;
    }
    for ( let y = ( tops[ x ] + h ) >> 1; y < h; y += 3 )
    {
      const i = ( y * w + x ) * 4;
      if ( d[ i + 3 ] > 240 )
      {
        r += d[ i ];
        g += d[ i + 1 ];
        b += d[ i + 2 ];
        n++;
      }
    }
  }
  const fr = n ? r / n : 128;
  const fg = n ? g / n : 128;
  const fb = n ? b / n : 128;
  let minTop = h;
  for ( let x = 0; x < w; x++ )
  {
    // Колонка без вмісту бере вершину сусідів, інакше в шарі лишиться прозора щілина
    let top = tops[ x ];
    if ( top < 0 )
    {
      for ( let k = 1; k < 40 && top < 0; k++ )
      {
        top = Math.max( x - k >= 0 ? tops[ x - k ] : -1, x + k < w ? tops[ x + k ] : -1 );
      }
      if ( top < 0 )
      {
        continue;
      }
    }
    for ( let y = top; y < h; y++ )
    {
      const i = ( y * w + x ) * 4;
      const a = d[ i + 3 ] / 255;
      if ( a < 0.95 )
      {
        d[ i ] = d[ i ] * a + fr * ( 1 - a );
        d[ i + 1 ] = d[ i + 1 ] * a + fg * ( 1 - a );
        d[ i + 2 ] = d[ i + 2 ] * a + fb * ( 1 - a );
        d[ i + 3 ] = 255;
      }
    }
  }
  // Обрізаємо зверху за справжніми вершинами (з деревами й вітряками), із запасом на тонкі деталі
  for ( let x = 0; x < w; x++ )
  {
    if ( raw[ x ] >= 0 )
    {
      minTop = Math.min( minTop, raw[ x ] - 30 );
    }
  }
  return Math.max( 0, minTop );
}

function crop( c: HTMLCanvasElement, x: number, y: number, w: number, h: number ): HTMLCanvasElement
{
  const o = document.createElement( 'canvas' );
  o.width = Math.max( 1, w );
  o.height = Math.max( 1, h );
  o.getContext( '2d' )!.drawImage( c, x, y, w, h, 0, 0, w, h );
  return o;
}

function alphaBox( d: Uint8ClampedArray, w: number, h: number ): { x: number; y: number; w: number; h: number }
{
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for ( let y = 0; y < h; y++ )
  {
    for ( let x = 0; x < w; x++ )
    {
      if ( d[ ( y * w + x ) * 4 + 3 ] > 20 )
      {
        x0 = Math.min( x0, x );
        y0 = Math.min( y0, y );
        x1 = Math.max( x1, x );
        y1 = Math.max( y1, y );
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Розрізаємо аркуш на окремі спрайти за зв'язними плямами; смуги на всю ширину — сміття
function slice( c: HTMLCanvasElement, d: Uint8ClampedArray ): HTMLCanvasElement[]
{
  const w = c.width;
  const h = c.height;
  const cell = 4;
  const gw = Math.ceil( w / cell );
  const gh = Math.ceil( h / cell );
  const grid = new Int32Array( gw * gh );
  for ( let gy = 0; gy < gh; gy++ )
  {
    for ( let gx = 0; gx < gw; gx++ )
    {
      const x = Math.min( w - 1, gx * cell + 2 );
      const y = Math.min( h - 1, gy * cell + 2 );
      grid[ gy * gw + gx ] = d[ ( y * w + x ) * 4 + 3 ] > 60 ? -1 : 0;
    }
  }
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number; id: number }[] = [];
  let id = 0;
  for ( let s = 0; s < grid.length; s++ )
  {
    if ( grid[ s ] !== -1 )
    {
      continue;
    }
    id++;
    const box = { x0: gw, y0: gh, x1: 0, y1: 0, n: 0, id };
    const st = [ s ];
    grid[ s ] = id;
    while ( st.length )
    {
      const p = st.pop()!;
      const x = p % gw;
      const y = ( p / gw ) | 0;
      box.x0 = Math.min( box.x0, x );
      box.y0 = Math.min( box.y0, y );
      box.x1 = Math.max( box.x1, x );
      box.y1 = Math.max( box.y1, y );
      box.n++;
      for ( const n of [ x > 0 ? p - 1 : -1, x < gw - 1 ? p + 1 : -1, y > 0 ? p - gw : -1, y < gh - 1 ? p + gw : -1 ] )
      {
        if ( n >= 0 && grid[ n ] === -1 )
        {
          grid[ n ] = id;
          st.push( n );
        }
      }
    }
    boxes.push( box );
  }
  const keep = boxes.filter( ( b ) => b.n > grid.length * 0.006 && ( b.x1 - b.x0 ) < gw * 0.6 ).sort( ( a, b ) => a.x0 - b.x0 );
  return keep.map( ( b ) =>
  {
    const pad = 6;
    const x = Math.max( 0, b.x0 * cell - pad );
    const y = Math.max( 0, b.y0 * cell - pad );
    const cw = Math.min( w, ( b.x1 + 1 ) * cell + pad ) - x;
    const ch = Math.min( h, ( b.y1 + 1 ) * cell + pad ) - y;
    const o = crop( c, x, y, cw, ch );
    const ctx = o.getContext( '2d' )!;
    const od = ctx.getImageData( 0, 0, cw, ch );
    // Пікселі інших плям, що потрапили в рамку, стираємо
    for ( let yy = 0; yy < ch; yy++ )
    {
      for ( let xx = 0; xx < cw; xx++ )
      {
        const g = grid[ Math.min( gh - 1, ( ( y + yy ) / cell ) | 0 ) * gw + Math.min( gw - 1, ( ( x + xx ) / cell ) | 0 ) ];
        if ( g > 0 && g !== b.id )
        {
          od.data[ ( yy * cw + xx ) * 4 + 3 ] = 0;
        }
      }
    }
    ctx.putImageData( od, 0, 0 );
    return o;
  } );
}

export type Key = 'magenta' | 'green';

export async function clean( url: string, kind: Kind, key?: Key ): Promise<HTMLCanvasElement[]>
{
  const c = toCanvas( await loadImage( url ) );
  const ctx = c.getContext( '2d', { willReadFrequently: true } )!;
  const id = ctx.getImageData( 0, 0, c.width, c.height );
  const d = id.data;
  despill( d, key ?? detectKey( d ) );
  defringe( d, c.width, c.height );
  if ( kind === 'layer' )
  {
    const top = fillDown( d, c.width, c.height );
    ctx.putImageData( id, 0, 0 );
    return [ crop( c, 0, Math.max( 0, top - 4 ), c.width, c.height - Math.max( 0, top - 4 ) ) ];
  }
  ctx.putImageData( id, 0, 0 );
  if ( kind === 'sheet' )
  {
    return slice( c, d );
  }
  const b = alphaBox( d, c.width, c.height );
  return [ crop( c, b.x, b.y, b.w, b.h ) ];
}

// Рівна заливка під шаром видна крізь щілини переднього шару; замість неї ліс плавно тоне в тумані
export function mistBand( c: HTMLCanvasElement, mist: [ number, number, number ] ): void
{
  const g = c.getContext( '2d' )!;
  const w = c.width;
  const h = c.height;
  const id = g.getImageData( 0, 0, w, h );
  const d = id.data;
  const at = ( x: number, y: number ) => ( y * w + x ) * 4;
  const reddish = ( i: number ) => d[ i ] > d[ i + 1 ] + 40 && d[ i ] > d[ i + 2 ] + 30;
  const tops = new Int32Array( w );
  const base = new Float32Array( w * 3 );
  for ( let x = 0; x < w; x++ )
  {
    const b = at( x, h - 1 );
    let top = h - 1;
    while ( top > 0 )
    {
      const i = at( x, top - 1 );
      const dist = Math.abs( d[ i ] - d[ b ] ) + Math.abs( d[ i + 1 ] - d[ b + 1 ] ) + Math.abs( d[ i + 2 ] - d[ b + 2 ] );
      if ( dist > 18 || d[ i + 3 ] < 250 )
      {
        break;
      }
      top--;
    }
    tops[ x ] = top;
    // Колір беремо трохи вище заливки: на самій межі бруд від хромакею
    let r = 0;
    let gg = 0;
    let bb = 0;
    let n = 0;
    for ( let y = Math.max( 0, top - 30 ); y < top - 6; y += 2 )
    {
      const i = at( x, y );
      if ( d[ i + 3 ] > 200 && !reddish( i ) )
      {
        r += d[ i ];
        gg += d[ i + 1 ];
        bb += d[ i + 2 ];
        n++;
      }
    }
    base[ x * 3 ] = n ? r / n : mist[ 0 ];
    base[ x * 3 + 1 ] = n ? gg / n : mist[ 1 ];
    base[ x * 3 + 2 ] = n ? bb / n : mist[ 2 ];
  }
  // Широке згладжування по горизонталі прибирає вертикальні патьоки від окремих стовбурів
  const R = 40;
  const soft = new Float32Array( w * 3 );
  for ( let x = 0; x < w; x++ )
  {
    for ( let ch = 0; ch < 3; ch++ )
    {
      let sum = 0;
      let n = 0;
      for ( let k = Math.max( 0, x - R ); k <= Math.min( w - 1, x + R ); k++ )
      {
        sum += base[ k * 3 + ch ];
        n++;
      }
      soft[ x * 3 + ch ] = sum / n;
    }
  }
  for ( let x = 0; x < w; x++ )
  {
    const top = tops[ x ];
    for ( let y = Math.max( 0, top - 8 ); y < h; y++ )
    {
      const i = at( x, y );
      if ( y < top && !reddish( i ) )
      {
        continue;
      }
      const tt = Math.min( 1, Math.max( 0, ( y - top ) / ( ( h - top ) * 0.7 ) ) );
      const k = tt * tt * ( 3 - 2 * tt );
      for ( let ch = 0; ch < 3; ch++ )
      {
        d[ i + ch ] = soft[ x * 3 + ch ] + ( mist[ ch ] - soft[ x * 3 + ch ] ) * k;
      }
      d[ i + 3 ] = 255;
    }
  }
  g.putImageData( id, 0, 0 );
}
