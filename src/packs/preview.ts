import { clean, mistBand, type Key } from './clean.ts';

// Сторінка вибору арт-пакета: кожен пакет показано живою паралакс-сценою польоту

interface PackDef
{
  id: string;
  title: string;
  note: string;
  sky: string[];
  sun: string;
  streak: string;
  balloon: [ string, string ];
  ink: string;
  grain?: boolean;
  // Колір хромакею кожного файлу: генератор обирав його сам, автодетект плутає з вмістом
  keys: Record<string, Key>;
  // Файли, де генератор зіпсував вирізання, беремо з суцільним тлом і кеїмо самі
  ext?: Record<string, string>;
  // Додаткові шари для інших тем (море, гори), чистяться так само, як основні
  extra?: string[];
}

const M: Key = 'magenta';
const G: Key = 'green';

const PACKS: PackDef[] = [
  { id: 'a-pastel', title: 'A · Пастельні силуети', note: 'як у референсі: пласкі шари, повітряна перспектива', sky: [ '#68BDF0', '#B9E3FA', '#EEF8FF' ], sun: '#FFFBE6', streak: 'rgba(255,255,255,0.7)', balloon: [ '#E8443A', '#FFF3E0' ], ink: '#2B4A6B', keys: { far: M, mid: G, near: M, front: M, clouds: M, panel: M, button: M } },
  { id: 'b-sunset', title: 'B · Золота година', note: 'теплий захід сонця, силуети з підсвіткою', sky: [ '#6E5DB8', '#C978A8', '#F7A47E', '#FFE2A6' ], sun: '#FFF0C2', streak: 'rgba(255,236,200,0.65)', balloon: [ '#2E9C8E', '#FFF1D6' ], ink: '#4A2A50', keys: { far: G, mid: G, near: G, front: G, clouds: G, panel: G, button: G } },
  { id: 'c-paper', title: 'C · Паперовий колаж', note: 'вирізаний папір, тіні між шарами, текстура', sky: [ '#86CDEC', '#C7E9F4', '#F4F0E2' ], sun: '#FFFFF0', streak: 'rgba(255,255,255,0.75)', balloon: [ '#F07A2A', '#FFF8EC' ], ink: '#2F5A3C', grain: true, keys: { far: M, mid: M, near: M, front: M, clouds: G, panel: M, button: M } },
  { id: 'd-watercolor', title: 'D · Акварель', note: 'казкова книжка, м\'які розмиви, квіти', sky: [ '#93C6E8', '#D4EAF3', '#FBF2E0' ], sun: '#FFF8E0', streak: 'rgba(255,255,255,0.6)', balloon: [ '#E8604A', '#FFF6E6' ], ink: '#3A4E3A', grain: true, keys: { far: G, mid: M, near: M, front: G, clouds: M, panel: M, button: M }, ext: { front: 'jpg' }, extra: [ 'sea-far', 'sea-mid', 'sea-near', 'mountain-far', 'mountain-mid', 'mountain-near' ] }
];

interface PackArt
{
  def: PackDef;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
  front: HTMLCanvasElement;
  clouds: HTMLCanvasElement[];
  panel: HTMLCanvasElement;
  button: HTMLCanvasElement;
}

async function loadPack( def: PackDef ): Promise<PackArt>
{
  const base = '/art/packs/' + def.id + '/';
  // Параметр проти кешу: після перегенерації браузер інакше показує старий файл
  const bust = '?v=' + Date.now();
  const get = ( name: string, kind: 'layer' | 'sheet' | 'sprite' ) => clean( base + name + '.' + ( def.ext?.[ name ] ?? 'png' ) + bust, kind, def.keys[ name ] );
  const [ far, mid, near, front, clouds, panel, button ] = await Promise.all( [
    get( 'far', 'layer' ), get( 'mid', 'layer' ), get( 'near', 'layer' ), get( 'front', 'layer' ),
    get( 'clouds', 'sheet' ), get( 'panel', 'sprite' ), get( 'button', 'sprite' )
  ] );
  return { def, far: far[ 0 ], mid: mid[ 0 ], near: near[ 0 ], front: front[ 0 ], clouds, panel: panel[ 0 ], button: button[ 0 ] };
}

async function saveCanvas( c: HTMLCanvasElement, path: string ): Promise<void>
{
  const blob = await new Promise<Blob | null>( ( r ) => c.toBlob( r, 'image/png' ) );
  if ( blob )
  {
    await fetch( '/__save-asset?path=' + encodeURIComponent( path ), { method: 'POST', body: blob } );
  }
}

async function saveAll( packs: PackArt[] ): Promise<void>
{
  for ( const p of packs )
  {
    const dir = 'packs/' + p.def.id + '/';
    await Promise.all( [
      saveCanvas( p.far, dir + 'far.png' ), saveCanvas( p.mid, dir + 'mid.png' ), saveCanvas( p.near, dir + 'near.png' ),
      saveCanvas( p.front, dir + 'front.png' ), saveCanvas( p.panel, dir + 'panel.png' ), saveCanvas( p.button, dir + 'button.png' ),
      ...p.clouds.map( ( c, i ) => saveCanvas( c, dir + 'cloud' + i + '.png' ) )
    ] );
    for ( const name of p.def.extra ?? [] )
    {
      const [ c ] = await clean( '/art/packs/' + p.def.id + '/' + name + '.png?v=' + Date.now(), 'layer', p.def.keys[ name ] ?? 'magenta' );
      if ( name === 'mountain-mid' )
      {
        mistBand( c, [ 200, 212, 222 ] );
      }
      await saveCanvas( c, dir + name + '.png' );
    }
  }
}

// Дзеркальне тайлінгування: кожна друга копія віддзеркалена, тому шов між копіями не видно
function drawLayer( g: CanvasRenderingContext2D, img: HTMLCanvasElement, scroll: number, bottom: number, height: number, w: number ): void
{
  const k = height / img.height;
  const tw = img.width * k;
  let idx = Math.floor( scroll / tw );
  let x = idx * tw - scroll;
  while ( x < w )
  {
    g.save();
    if ( ( ( idx % 2 ) + 2 ) % 2 === 1 )
    {
      g.translate( x + tw, bottom - height );
      g.scale( -1, 1 );
      g.drawImage( img, 0, 0, tw, height );
    }
    else
    {
      g.drawImage( img, x, bottom - height, tw, height );
    }
    g.restore();
    x += tw;
    idx++;
  }
}

function drawNine( g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number, cut: number, dst: number ): void
{
  const sw = img.width;
  const sh = img.height;
  const xs = [ 0, cut, sw - cut, sw ];
  const ys = [ 0, cut, sh - cut, sh ];
  const xd = [ x, x + dst, x + w - dst, x + w ];
  const yd = [ y, y + dst, y + h - dst, y + h ];
  for ( let i = 0; i < 3; i++ )
  {
    for ( let j = 0; j < 3; j++ )
    {
      g.drawImage( img, xs[ i ], ys[ j ], xs[ i + 1 ] - xs[ i ], ys[ j + 1 ] - ys[ j ], xd[ i ], yd[ j ], xd[ i + 1 ] - xd[ i ], yd[ j + 1 ] - yd[ j ] );
    }
  }
}

function drawBalloon( g: CanvasRenderingContext2D, x: number, y: number, r: number, cols: [ string, string ], heat: number ): void
{
  g.save();
  g.translate( x, y );
  g.strokeStyle = '#5a3a22';
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.moveTo( -r * 0.45, r * 0.95 );
  g.lineTo( -r * 0.32, r * 1.55 );
  g.moveTo( r * 0.45, r * 0.95 );
  g.lineTo( r * 0.32, r * 1.55 );
  g.stroke();
  g.fillStyle = '#a8723a';
  g.beginPath();
  g.roundRect( -r * 0.36, r * 1.5, r * 0.72, r * 0.45, r * 0.08 );
  g.fill();
  if ( heat > 0 )
  {
    const fg = g.createRadialGradient( 0, r * 1.2, 0, 0, r * 1.2, r * 0.5 );
    fg.addColorStop( 0, `rgba(255,220,120,${ 0.9 * heat })` );
    fg.addColorStop( 1, 'rgba(255,120,40,0)' );
    g.fillStyle = fg;
    g.fillRect( -r * 0.5, r * 0.7, r, r );
  }
  g.beginPath();
  g.arc( 0, 0, r, Math.PI * 0.8, Math.PI * 2.2 );
  g.quadraticCurveTo( r * 0.7, r * 0.75, r * 0.22, r * 1.05 );
  g.lineTo( -r * 0.22, r * 1.05 );
  g.quadraticCurveTo( -r * 0.7, r * 0.75, Math.cos( Math.PI * 0.8 ) * r, Math.sin( Math.PI * 0.8 ) * r );
  g.save();
  g.clip();
  for ( let i = 0; i < 8; i++ )
  {
    const a0 = Math.sin( -Math.PI / 2 + ( Math.PI * i ) / 8 ) * r;
    const a1 = Math.sin( -Math.PI / 2 + ( Math.PI * ( i + 1 ) ) / 8 ) * r;
    g.fillStyle = cols[ i % 2 ];
    g.fillRect( a0, -r, a1 - a0 + 1, r * 2.2 );
  }
  const sh = g.createRadialGradient( -r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.3 );
  sh.addColorStop( 0, 'rgba(255,255,255,.45)' );
  sh.addColorStop( 0.5, 'rgba(255,255,255,0)' );
  sh.addColorStop( 1, 'rgba(0,0,30,.35)' );
  g.fillStyle = sh;
  g.fillRect( -r * 1.2, -r * 1.2, r * 2.4, r * 2.4 );
  g.restore();
  g.restore();
}

interface Bird { x: number; y: number; s: number; ph: number }
interface Streak { x: number; y: number; len: number; life: number }
interface Puff { x: number; y: number; vx: number; vy: number; life: number; s: number }

class Scene
{
  art: PackArt;
  t = 0;
  cam = 0;
  birds: Bird[] = [];
  streaks: Streak[] = [];
  puffs: Puff[] = [];
  skyClouds: { x: number; y: number; s: number; speed: number; i: number; a: number }[] = [];

  constructor( art: PackArt )
  {
    this.art = art;
    for ( let i = 0; i < 5; i++ )
    {
      this.birds.push( { x: Math.random(), y: 0.15 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.6, ph: Math.random() * 6 } );
    }
    for ( let i = 0; i < 9; i++ )
    {
      const depth = i % 3;
      this.skyClouds.push( {
        x: Math.random() * 3000, y: 0.08 + Math.random() * 0.45, s: [ 0.18, 0.3, 0.45 ][ depth ],
        speed: [ 0.12, 0.3, 0.6 ][ depth ], i: i % Math.max( 1, art.clouds.length ), a: [ 0.65, 0.85, 1 ][ depth ]
      } );
    }
  }

  draw( g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, dt: number, full: boolean ): void
  {
    const a = this.art;
    const d = a.def;
    this.t += dt;
    // Швидкість «польоту» в пікселях найближчого шару; кадр плавно гойдається за кулею
    const speed = h * 0.22;
    this.cam += speed * dt;
    const bob = Math.sin( this.t * 0.55 ) * h * 0.06;
    const heat = Math.max( 0, Math.sin( this.t * 0.55 + 1.2 ) );
    g.save();
    g.beginPath();
    g.rect( x0, y0, w, h );
    g.clip();
    g.translate( x0, y0 );

    const sky = g.createLinearGradient( 0, 0, 0, h );
    d.sky.forEach( ( c, i ) => sky.addColorStop( i / ( d.sky.length - 1 ), c ) );
    g.fillStyle = sky;
    g.fillRect( 0, 0, w, h );

    const sx = w * 0.78;
    const sy = h * 0.2 - bob * 0.05;
    const sun = g.createRadialGradient( sx, sy, 0, sx, sy, h * 0.45 );
    sun.addColorStop( 0, d.sun );
    sun.addColorStop( 0.08, d.sun );
    sun.addColorStop( 0.1, 'rgba(255,255,240,.55)' );
    sun.addColorStop( 1, 'rgba(255,255,240,0)' );
    g.fillStyle = sun;
    g.fillRect( 0, 0, w, h );
    // Промені сонця повільно обертаються — дає відчуття живого неба
    g.save();
    g.translate( sx, sy );
    g.rotate( this.t * 0.03 );
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for ( let i = 0; i < 10; i++ )
    {
      g.rotate( Math.PI / 5 );
      g.beginPath();
      g.moveTo( 0, 0 );
      g.lineTo( h * 0.9, -h * 0.06 );
      g.lineTo( h * 0.9, h * 0.06 );
      g.fill();
    }
    g.restore();

    const sc = ( k: number ) => this.cam * k;
    for ( const c of this.skyClouds.filter( ( c ) => c.speed < 0.2 ) )
    {
      this.drawSkyCloud( g, c, w, h, bob );
    }
    drawLayer( g, a.far, sc( 0.08 ), h * 0.8 - bob * 0.15, h * 0.34, w );
    for ( const c of this.skyClouds.filter( ( c ) => c.speed >= 0.2 && c.speed < 0.5 ) )
    {
      this.drawSkyCloud( g, c, w, h, bob );
    }
    this.drawBirds( g, w, h, dt, bob );
    drawLayer( g, a.mid, sc( 0.22 ), h * 0.9 - bob * 0.3, h * 0.32, w );
    drawLayer( g, a.near, sc( 0.5 ), h * 1.05 - bob * 0.5, h * 0.36, w );

    this.drawStreaks( g, w, h, dt );
    const bx = w * 0.36;
    const by = h * 0.36 + bob;
    this.drawPuffs( g, bx, by + h * 0.12, dt, h );
    drawBalloon( g, bx, by, h * 0.085, d.balloon, heat );

    for ( const c of this.skyClouds.filter( ( c ) => c.speed >= 0.5 ) )
    {
      this.drawSkyCloud( g, c, w, h, bob );
    }
    drawLayer( g, a.front, sc( 1.1 ), h * 1.08 - bob * 0.9, h * 0.22, w );

    if ( d.grain )
    {
      this.grain( g, w, h );
    }
    this.drawUi( g, w, h, full );
    g.restore();
  }

  private drawSkyCloud( g: CanvasRenderingContext2D, c: { x: number; y: number; s: number; speed: number; i: number; a: number }, w: number, h: number, bob: number ): void
  {
    const img = this.art.clouds[ c.i ];
    if ( !img )
    {
      return;
    }
    const k = ( h * c.s ) / img.height * 0.6;
    const cw = img.width * k;
    const span = w + cw * 2 + 400;
    // Хмари і пливуть за вітром, і зсуваються від руху камери — дві швидкості дають глибину
    const x = ( ( ( c.x - this.cam * c.speed - this.t * 12 * c.speed ) % span ) + span ) % span - cw;
    g.globalAlpha = c.a;
    g.drawImage( img, x, h * c.y - bob * c.speed * 0.6, cw, img.height * k );
    g.globalAlpha = 1;
  }

  private drawBirds( g: CanvasRenderingContext2D, w: number, h: number, dt: number, bob: number ): void
  {
    g.strokeStyle = this.art.def.ink;
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max( 1.5, h * 0.004 );
    for ( const b of this.birds )
    {
      b.x -= dt * 0.03 * b.s;
      if ( b.x < -0.05 )
      {
        b.x = 1.05;
        b.y = 0.12 + Math.random() * 0.3;
      }
      const flap = Math.sin( this.t * 9 * b.s + b.ph ) * h * 0.008 * b.s;
      const x = b.x * w;
      const y = b.y * h - bob * 0.2;
      const s = h * 0.012 * b.s;
      g.beginPath();
      g.moveTo( x - s, y - flap );
      g.quadraticCurveTo( x - s * 0.4, y - s * 0.2, x, y );
      g.quadraticCurveTo( x + s * 0.4, y - s * 0.2, x + s, y - flap );
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private drawStreaks( g: CanvasRenderingContext2D, w: number, h: number, dt: number ): void
  {
    if ( Math.random() < dt * 9 )
    {
      this.streaks.push( { x: w + 20, y: Math.random() * h * 0.75, len: h * ( 0.08 + Math.random() * 0.15 ), life: 1 } );
    }
    g.strokeStyle = this.art.def.streak;
    g.lineCap = 'round';
    for ( const s of this.streaks )
    {
      s.x -= h * 1.4 * dt;
      s.life -= dt * 0.6;
      g.globalAlpha = Math.max( 0, Math.min( 1, s.life * 2 ) ) * 0.8;
      g.lineWidth = Math.max( 1, h * 0.004 );
      g.beginPath();
      g.moveTo( s.x, s.y );
      g.quadraticCurveTo( s.x + s.len * 0.5, s.y - h * 0.01, s.x + s.len, s.y );
      g.stroke();
    }
    g.globalAlpha = 1;
    this.streaks = this.streaks.filter( ( s ) => s.life > 0 && s.x > -s.len );
  }

  private drawPuffs( g: CanvasRenderingContext2D, x: number, y: number, dt: number, h: number ): void
  {
    if ( Math.random() < dt * 14 )
    {
      this.puffs.push( { x, y, vx: -h * ( 0.3 + Math.random() * 0.15 ), vy: ( Math.random() - 0.5 ) * h * 0.05, life: 1, s: h * 0.012 } );
    }
    for ( const p of this.puffs )
    {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.9;
      p.s += h * 0.02 * dt;
      g.fillStyle = `rgba(255,255,255,${ Math.max( 0, p.life ) * 0.55 })`;
      g.beginPath();
      g.arc( p.x, p.y, p.s, 0, Math.PI * 2 );
      g.fill();
    }
    this.puffs = this.puffs.filter( ( p ) => p.life > 0 );
  }

  private grainCanvas?: HTMLCanvasElement;

  private grain( g: CanvasRenderingContext2D, w: number, h: number ): void
  {
    if ( !this.grainCanvas )
    {
      const c = document.createElement( 'canvas' );
      c.width = c.height = 256;
      const x = c.getContext( '2d' )!;
      const id = x.createImageData( 256, 256 );
      for ( let i = 0; i < id.data.length; i += 4 )
      {
        const v = 128 + ( Math.random() - 0.5 ) * 60;
        id.data[ i ] = id.data[ i + 1 ] = id.data[ i + 2 ] = v;
        id.data[ i + 3 ] = 14;
      }
      x.putImageData( id, 0, 0 );
      this.grainCanvas = c;
    }
    const p = g.createPattern( this.grainCanvas, 'repeat' )!;
    g.fillStyle = p;
    g.fillRect( 0, 0, w, h );
  }

  private drawUi( g: CanvasRenderingContext2D, w: number, h: number, full: boolean ): void
  {
    const a = this.art;
    const u = h / 720;
    // Макет HUD: смуга газу й картка рівня, щоб оцінити UI-елементи пакета на тлі
    const bw = w * 0.3;
    const bx = w / 2 - bw / 2;
    g.fillStyle = 'rgba(30,40,70,.35)';
    g.beginPath();
    g.roundRect( bx, 22 * u, bw, 26 * u, 13 * u );
    g.fill();
    g.fillStyle = '#7ED86A';
    g.beginPath();
    g.roundRect( bx + 3 * u, 25 * u, bw * ( 0.35 + 0.1 * Math.sin( this.t ) ), 20 * u, 10 * u );
    g.fill();
    if ( !full )
    {
      return;
    }
    const pw = Math.min( w * 0.44, 560 * u );
    const ph = pw * 0.62;
    const px = w - pw - 30 * u;
    const py = h * 0.3;
    drawNine( g, a.panel, px, py, pw, ph, Math.min( a.panel.width, a.panel.height ) * 0.22, 60 * u );
    g.fillStyle = a.def.ink;
    g.font = `bold ${ 34 * u }px "Trebuchet MS", sans-serif`;
    g.textAlign = 'center';
    g.fillText( '1-3  Way Back', px + pw / 2, py + ph * 0.28 );
    g.font = `${ Math.min( 22 * u, pw / 24 ) }px "Trebuchet MS", sans-serif`;
    g.fillText( '★ Доставити пошту   ★ ≤ 80 газу   ★ Марка', px + pw / 2, py + ph * 0.48 );
    const btw = pw * 0.5;
    const bth = btw * 0.32;
    drawNine( g, a.button, px + pw / 2 - btw / 2, py + ph * 0.6, btw, bth, Math.min( a.button.width, a.button.height ) * 0.45, bth * 0.5 );
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.lineWidth = 5 * u;
    g.font = `bold ${ 30 * u }px "Trebuchet MS", sans-serif`;
    g.strokeText( 'Грати', px + pw / 2, py + ph * 0.6 + bth * 0.62 );
    g.fillText( 'Грати', px + pw / 2, py + ph * 0.6 + bth * 0.62 );
  }
}

async function main(): Promise<void>
{
  const status = document.getElementById( 'status' )!;
  const cv = document.getElementById( 'cv' ) as HTMLCanvasElement;
  const g = cv.getContext( '2d' )!;
  status.textContent = 'Чищу й завантажую ассети…';
  const arts = await Promise.all( PACKS.map( loadPack ) );
  const scenes = arts.map( ( a ) => new Scene( a ) );
  // Запис у public перезавантажує dev-сторінку, тож зберігаємо лише на явний запит
  if ( new URLSearchParams( location.search ).has( 'save' ) )
  {
    status.textContent = 'Зберігаю очищені PNG…';
    await saveAll( arts );
    history.replaceState( null, '', location.pathname );
  }
  status.textContent = '';

  let focus = -1;
  const tabs = document.getElementById( 'tabs' )!;
  const mkTab = ( label: string, i: number ) =>
  {
    const b = document.createElement( 'button' );
    b.textContent = label;
    b.onclick = () => { focus = i; render(); };
    tabs.appendChild( b );
  };
  mkTab( 'Усі 4', -1 );
  PACKS.forEach( ( p, i ) => mkTab( p.title, i ) );
  const note = document.getElementById( 'note' )!;
  const render = () =>
  {
    [ ...tabs.children ].forEach( ( b, i ) => b.classList.toggle( 'on', i - 1 === focus ) );
    note.textContent = focus >= 0 ? PACKS[ focus ].note : 'Клік по сцені — на весь екран. Клавіші 1–4, 0 — усі.';
  };
  render();
  window.addEventListener( 'keydown', ( e ) =>
  {
    const n = Number( e.key );
    if ( n >= 0 && n <= 4 )
    {
      focus = n - 1;
      render();
    }
  } );
  cv.addEventListener( 'click', ( e ) =>
  {
    if ( focus >= 0 )
    {
      return;
    }
    const r = cv.getBoundingClientRect();
    const col = e.clientX - r.left > r.width / 2 ? 1 : 0;
    const row = e.clientY - r.top > r.height / 2 ? 1 : 0;
    focus = row * 2 + col;
    render();
  } );

  let last = performance.now();
  const frame = ( now: number ) =>
  {
    const dt = Math.min( 0.05, ( now - last ) / 1000 );
    last = now;
    const dpr = Math.min( 2, window.devicePixelRatio || 1 );
    const W = Math.round( cv.clientWidth * dpr );
    const H = Math.round( cv.clientHeight * dpr );
    if ( cv.width !== W || cv.height !== H )
    {
      cv.width = W;
      cv.height = H;
    }
    if ( focus >= 0 )
    {
      scenes[ focus ].draw( g, 0, 0, W, H, dt, true );
    }
    else
    {
      const hw = W / 2;
      const hh = H / 2;
      scenes.forEach( ( s, i ) =>
      {
        s.draw( g, ( i % 2 ) * hw, ( ( i / 2 ) | 0 ) * hh, hw - 2, hh - 2, dt, false );
        g.fillStyle = 'rgba(20,28,48,.65)';
        g.fillRect( ( i % 2 ) * hw, ( ( i / 2 ) | 0 ) * hh, Math.min( hw, 420 * dpr ), 44 * dpr );
        g.fillStyle = '#fff';
        g.font = `bold ${ 22 * dpr }px "Trebuchet MS", sans-serif`;
        g.textAlign = 'left';
        g.fillText( PACKS[ i ].title, ( i % 2 ) * hw + 14 * dpr, ( ( i / 2 ) | 0 ) * hh + 30 * dpr );
      } );
    }
    requestAnimationFrame( frame );
  };
  requestAnimationFrame( frame );
  ( window as unknown as { __packs: { scenes: Scene[]; draw: ( f: number ) => void } } ).__packs = {
    scenes,
    draw: ( f: number ) => { focus = f; render(); }
  };
}

void main();
