import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene.ts';
import { groundY, layerBottom, type LevelData, type Rect } from '../core/level.ts';
import { findLevel, WORLDS } from '../levels/index.ts';
import { formatWorld } from '../core/levelJson.ts';
import { t } from '../core/i18n.ts';
import { TOP_OFF } from '../core/sim.ts';

// Редактор рівнів лише для розробки: у продакшн-збірку не потрапляє (динамічний імпорт під import.meta.env.DEV)

type Tool = 'select' | 'block' | 'target' | 'stamp' | 'start' | 'bird' | 'updraft' | 'layer';

type Pick =
  | { kind: 'block' | 'updraft'; i: number }
  | { kind: 'hazard' | 'target' | 'layer'; i: number }
  | { kind: 'stamp' | 'start' };

const TOOLS: Record<string, Tool> = { ZERO: 'select', ONE: 'block', TWO: 'target', THREE: 'stamp', FOUR: 'start', FIVE: 'bird', SIX: 'updraft', SEVEN: 'layer' };

const MOVES = [ undefined, { dx: 0, dy: 80, period: 4 }, { dx: 120, dy: 0, period: 5 }, { dx: 60, dy: 60, period: 3.5 } ];

const snap = ( v: number ) => Math.round( v / 10 ) * 10;

class Editor
{
  private gs: GameScene;
  private g: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private tool: Tool = 'select';
  private sel?: Pick;
  private drag?: { x: number; y: number; ox: number; oy: number; mode: 'move' | 'create' | 'resize' | 'pan'; sx: number; sy: number };
  private status = '';
  private worker?: Worker;
  private disposers: ( () => void )[] = [];

  constructor( gs: GameScene )
  {
    this.gs = gs;
    gs.phase = 'editor';
    gs.scene.sleep( 'ui' );
    const cam = gs.cameras.main;
    cam.removeBounds();
    this.g = gs.add.graphics().setDepth( 100 );
    this.info = gs.add.text( 10, 10, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 8, y: 6 } } )
      .setScrollFactor( 0 ).setDepth( 101 );
    this.bindInput();
    this.reload();
  }

  private get lvl(): LevelData
  {
    return findLevel( this.gs.levelId )!.level;
  }

  private bindInput(): void
  {
    const gs = this.gs;
    const input = gs.input;
    input.mouse?.disableContextMenu();
    const down = ( p: Phaser.Input.Pointer ) => this.onDown( p );
    const move = ( p: Phaser.Input.Pointer ) => this.onMove( p );
    const up = () => this.onUp();
    const wheel = ( _p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number ) => this.onWheel( dy );
    input.on( 'pointerdown', down );
    input.on( 'pointermove', move );
    input.on( 'pointerup', up );
    input.on( 'wheel', wheel );
    const kb = gs.input.keyboard!;
    const key = ( e: KeyboardEvent ) => this.onKey( e );
    kb.on( 'keydown', key );
    this.disposers.push( () =>
    {
      input.off( 'pointerdown', down );
      input.off( 'pointermove', move );
      input.off( 'pointerup', up );
      input.off( 'wheel', wheel );
      kb.off( 'keydown', key );
    } );
  }

  private world( p: Phaser.Input.Pointer ): { x: number; y: number }
  {
    const v = this.gs.cameras.main.getWorldPoint( p.x, p.y );
    return { x: v.x, y: v.y };
  }

  private surfaceBelow( x: number, y: number ): number
  {
    let best = groundY( this.lvl );
    for ( const b of this.lvl.blocks )
    {
      if ( x >= b.x && x <= b.x + b.w && b.y >= y - 20 && b.y < best )
      {
        best = b.y;
      }
    }
    return best;
  }

  private pick( x: number, y: number ): Pick | undefined
  {
    const l = this.lvl;
    if ( Math.hypot( x - l.stamp.x, y - l.stamp.y ) < 30 )
    {
      return { kind: 'stamp' };
    }
    if ( Math.abs( x - l.start.x ) < 20 && y > l.start.y - TOP_OFF && y < l.start.y + 5 )
    {
      return { kind: 'start' };
    }
    for ( let i = 0; i < l.hazards.length; i++ )
    {
      if ( Math.hypot( x - l.hazards[ i ].x, y - l.hazards[ i ].y ) < l.hazards[ i ].r + 8 )
      {
        return { kind: 'hazard', i };
      }
    }
    for ( let i = 0; i < l.targets.length; i++ )
    {
      const tg = l.targets[ i ];
      if ( Math.abs( x - tg.x ) < tg.w / 2 && y > tg.y - 60 && y < tg.y + 10 )
      {
        return { kind: 'target', i };
      }
    }
    for ( let i = l.updrafts.length - 1; i >= 0; i-- )
    {
      if ( inRect( x, y, l.updrafts[ i ] ) )
      {
        return { kind: 'updraft', i };
      }
    }
    for ( let i = l.blocks.length - 1; i >= 0; i-- )
    {
      if ( inRect( x, y, l.blocks[ i ] ) )
      {
        return { kind: 'block', i };
      }
    }
    for ( let i = 1; i < l.layers.length; i++ )
    {
      if ( Math.abs( y - l.layers[ i ].top ) < 8 )
      {
        return { kind: 'layer', i };
      }
    }
    for ( let i = l.layers.length - 1; i >= 0; i-- )
    {
      if ( y >= l.layers[ i ].top && y < layerBottom( l, i ) )
      {
        return { kind: 'layer', i };
      }
    }
    return undefined;
  }

  private onDown( p: Phaser.Input.Pointer ): void
  {
    const { x, y } = this.world( p );
    const l = this.lvl;
    const cam = this.gs.cameras.main;
    if ( p.rightButtonDown() || p.middleButtonDown() )
    {
      this.drag = { x, y, ox: cam.scrollX, oy: cam.scrollY, mode: 'pan', sx: p.x, sy: p.y };
      return;
    }
    switch ( this.tool )
    {
      case 'select':
      {
        this.sel = this.pick( x, y );
        const r = this.selRect();
        const shift = p.event.shiftKey;
        this.drag = { x, y, ox: 0, oy: 0, mode: shift && r ? 'resize' : 'move', sx: x, sy: y };
        break;
      }
      case 'block':
      case 'updraft':
      {
        const r = { x: snap( x ), y: snap( y ), w: 10, h: 10 };
        if ( this.tool === 'block' )
        {
          l.blocks.push( r );
          this.sel = { kind: 'block', i: l.blocks.length - 1 };
        }
        else
        {
          l.updrafts.push( { ...r, force: 160 } );
          this.sel = { kind: 'updraft', i: l.updrafts.length - 1 };
        }
        this.drag = { x, y, ox: r.x, oy: r.y, mode: 'create', sx: x, sy: y };
        break;
      }
      case 'target':
        l.targets.push( { x: snap( x ), y: this.surfaceBelow( x, y ), w: 160 } );
        this.sel = { kind: 'target', i: l.targets.length - 1 };
        break;
      case 'stamp':
        l.stamp = { x: snap( x ), y: snap( y ) };
        break;
      case 'start':
        l.start = { x: snap( x ), y: this.surfaceBelow( x, y ) };
        break;
      case 'bird':
        l.hazards.push( { kind: l.theme === 'sea' ? 'gull' : 'bird', x: snap( x ), y: snap( y ), r: 20 } );
        this.sel = { kind: 'hazard', i: l.hazards.length - 1 };
        break;
      case 'layer':
      {
        const top = snap( y );
        const idx = l.layers.findIndex( ( ly ) => ly.top > top );
        const prev = l.layers[ ( idx < 0 ? l.layers.length : idx ) - 1 ];
        l.layers.splice( idx < 0 ? l.layers.length : idx, 0, { top, wind: -( prev?.wind ?? 40 ) } );
        break;
      }
    }
    this.changed();
  }

  private onMove( p: Phaser.Input.Pointer ): void
  {
    const d = this.drag;
    if ( !d || !p.isDown )
    {
      return;
    }
    const cam = this.gs.cameras.main;
    if ( d.mode === 'pan' )
    {
      cam.scrollX = d.ox - ( p.x - d.sx ) / cam.zoom;
      cam.scrollY = d.oy - ( p.y - d.sy ) / cam.zoom;
      return;
    }
    const { x, y } = this.world( p );
    const l = this.lvl;
    const s = this.sel;
    if ( d.mode === 'create' || d.mode === 'resize' )
    {
      const r = this.selRect();
      if ( r )
      {
        r.w = Math.max( 10, snap( x ) - r.x );
        r.h = Math.max( 10, snap( y ) - r.y );
        this.changed( false );
      }
      return;
    }
    if ( !s )
    {
      return;
    }
    const dx = snap( x - d.sx );
    const dy = snap( y - d.sy );
    if ( dx === 0 && dy === 0 )
    {
      return;
    }
    d.sx += dx;
    d.sy += dy;
    switch ( s.kind )
    {
      case 'block':
        l.blocks[ s.i ].x += dx;
        l.blocks[ s.i ].y += dy;
        break;
      case 'updraft':
        l.updrafts[ s.i ].x += dx;
        l.updrafts[ s.i ].y += dy;
        break;
      case 'hazard':
        l.hazards[ s.i ].x += dx;
        l.hazards[ s.i ].y += dy;
        break;
      case 'target':
        l.targets[ s.i ].x += dx;
        l.targets[ s.i ].y = this.surfaceBelow( l.targets[ s.i ].x, l.targets[ s.i ].y + dy - 1 );
        break;
      case 'stamp':
        l.stamp.x += dx;
        l.stamp.y += dy;
        break;
      case 'start':
        l.start.x += dx;
        l.start.y = this.surfaceBelow( l.start.x, l.start.y + dy - 1 );
        break;
      case 'layer':
        if ( s.i > 0 )
        {
          l.layers[ s.i ].top += dy;
        }
        break;
    }
    this.changed( false );
  }

  private onUp(): void
  {
    if ( this.drag && this.drag.mode !== 'pan' )
    {
      this.changed();
    }
    this.drag = undefined;
  }

  private onWheel( dy: number ): void
  {
    const s = this.sel;
    const l = this.lvl;
    const k = dy > 0 ? -1 : 1;
    if ( !s )
    {
      return;
    }
    switch ( s.kind )
    {
      case 'layer':
        l.layers[ s.i ].wind += k * 5;
        break;
      case 'target':
        l.targets[ s.i ].w = Math.max( 60, l.targets[ s.i ].w + k * 10 );
        break;
      case 'hazard':
        l.hazards[ s.i ].r = Math.max( 10, l.hazards[ s.i ].r + k * 2 );
        break;
      case 'updraft':
        l.updrafts[ s.i ].force = Math.max( 20, l.updrafts[ s.i ].force + k * 10 );
        break;
      default:
        return;
    }
    this.changed();
  }

  private onKey( e: KeyboardEvent ): void
  {
    const l = this.lvl;
    const cam = this.gs.cameras.main;
    const name = Object.keys( TOOLS ).find( ( k ) => Phaser.Input.Keyboard.KeyCodes[ k as keyof typeof Phaser.Input.Keyboard.KeyCodes ] === e.keyCode );
    if ( name )
    {
      this.tool = TOOLS[ name ];
      this.status = 'tool: ' + this.tool;
      this.drawOverlay();
      return;
    }
    switch ( e.code )
    {
      case 'Delete':
      case 'Backspace':
        this.removeSel();
        break;
      case 'KeyM':
        if ( this.sel?.kind === 'hazard' )
        {
          const h = l.hazards[ this.sel.i ];
          const idx = MOVES.findIndex( ( m ) => JSON.stringify( m ) === JSON.stringify( h.move ) );
          const next = MOVES[ ( idx + 1 ) % MOVES.length ];
          if ( next )
          {
            h.move = { ...next };
          }
          else
          {
            delete h.move;
          }
          this.changed();
        }
        break;
      case 'KeyG':
        if ( this.sel?.kind === 'layer' )
        {
          const ly = l.layers[ this.sel.i ];
          if ( ly.gust )
          {
            delete ly.gust;
            delete ly.period;
          }
          else
          {
            ly.gust = Math.max( 20, Math.abs( ly.wind ) * 0.6 );
            ly.period = 6;
          }
          this.changed();
        }
        break;
      case 'KeyF':
        l.fuel = l.fuel === undefined ? Math.max( 5, Math.ceil( ( l.best?.gas ?? 10 ) * 1.6 ) ) : undefined;
        this.changed();
        break;
      case 'Minus':
        cam.setZoom( Math.max( 0.2, cam.zoom / 1.2 ) );
        break;
      case 'Equal':
        cam.setZoom( Math.min( 3, cam.zoom * 1.2 ) );
        break;
      case 'ArrowLeft':
        cam.scrollX -= 200 / cam.zoom;
        break;
      case 'ArrowRight':
        cam.scrollX += 200 / cam.zoom;
        break;
      case 'ArrowUp':
        cam.scrollY -= 150 / cam.zoom;
        break;
      case 'ArrowDown':
        cam.scrollY += 150 / cam.zoom;
        break;
      case 'BracketLeft':
      case 'BracketRight':
        this.switchLevel( e.code === 'BracketLeft' ? -1 : 1 );
        break;
      case 'KeyN':
        this.newLevel();
        break;
      case 'KeyW':
        l.width = Math.max( 1280, l.width + ( e.shiftKey ? -200 : 200 ) );
        this.changed();
        break;
      case 'KeyH':
        l.height = Math.max( 720, l.height + ( e.shiftKey ? -120 : 120 ) );
        this.changed();
        break;
      case 'KeyS':
        void this.saveWorld();
        break;
      case 'KeyV':
        this.verify();
        break;
      case 'KeyP':
      case 'KeyE':
        this.exit();
        break;
    }
    this.drawOverlay();
  }

  private removeSel(): void
  {
    const s = this.sel;
    const l = this.lvl;
    if ( !s )
    {
      return;
    }
    if ( s.kind === 'block' )
    {
      l.blocks.splice( s.i, 1 );
    }
    else if ( s.kind === 'updraft' )
    {
      l.updrafts.splice( s.i, 1 );
    }
    else if ( s.kind === 'hazard' )
    {
      l.hazards.splice( s.i, 1 );
    }
    else if ( s.kind === 'target' && l.targets.length > 1 )
    {
      l.targets.splice( s.i, 1 );
    }
    else if ( s.kind === 'layer' && s.i > 0 )
    {
      l.layers.splice( s.i, 1 );
    }
    this.sel = undefined;
    this.changed();
  }

  private selRect(): Rect | undefined
  {
    const s = this.sel;
    if ( s?.kind === 'block' )
    {
      return this.lvl.blocks[ s.i ];
    }
    if ( s?.kind === 'updraft' )
    {
      return this.lvl.updrafts[ s.i ];
    }
    return undefined;
  }

  private switchLevel( d: number ): void
  {
    const f = findLevel( this.gs.levelId )!;
    const lv = f.world.levels[ f.index + d ];
    if ( lv )
    {
      this.gs.levelId = lv.id;
      this.sel = undefined;
      this.reload();
    }
  }

  private newLevel(): void
  {
    const f = findLevel( this.gs.levelId )!;
    const copy: LevelData = structuredClone( f.level );
    copy.id = f.world.id + '-' + ( f.world.levels.length + 1 );
    copy.name = 'New Level';
    delete copy.hint;
    delete copy.best;
    f.world.levels.push( copy );
    this.gs.levelId = copy.id;
    this.reload();
  }

  private async saveWorld(): Promise<void>
  {
    const f = findLevel( this.gs.levelId )!;
    const res = await fetch( '/__save-level?file=world' + f.world.id, { method: 'POST', body: formatWorld( f.world ) } );
    this.status = res.ok ? 'saved world' + f.world.id + '.json' : 'SAVE FAILED';
    this.drawOverlay();
  }

  private verify(): void
  {
    this.worker?.terminate();
    this.worker = new Worker( new URL( './solveWorker.ts', import.meta.url ), { type: 'module' } );
    const id = this.gs.levelId;
    this.status = 'solving ' + id + '…';
    this.worker.onmessage = ( e: MessageEvent<{ ok: boolean; text: string; level: LevelData }> ) =>
    {
      this.status = e.data.text;
      if ( e.data.ok )
      {
        const lvl = findLevel( id )!.level;
        lvl.gasStar = e.data.level.gasStar;
        lvl.best = e.data.level.best;
        lvl.hint = e.data.level.hint;
        if ( this.gs.levelId === id )
        {
          this.reload();
        }
      }
      this.drawOverlay();
      console.log( e.data.text );
    };
    this.worker.postMessage( structuredClone( this.lvl ) );
    this.drawOverlay();
  }

  private changed( full = true ): void
  {
    const l = this.lvl;
    l.layers.sort( ( a, b ) => a.top - b.top );
    l.layers[ 0 ].top = 0;
    if ( full )
    {
      // Після правки рівня старий маршрут-підказка й найкращий газ уже недійсні
      delete l.hint;
      delete l.best;
      this.reload( false );
    }
    else
    {
      this.drawOverlay();
    }
  }

  private reload( moveCam = true ): void
  {
    const gs = this.gs;
    gs.lvl = structuredClone( this.lvl );
    gs.hint = !!gs.lvl.hint;
    gs.buildWorld();
    if ( moveCam )
    {
      const cam = gs.cameras.main;
      cam.removeBounds();
      cam.centerOn( gs.lvl.width / 2, gs.lvl.height / 2 );
      cam.setZoom( Math.min( cam.width / ( gs.lvl.width + 100 ), cam.height / ( gs.lvl.height + 100 ) ) );
    }
    this.gs.cameras.main.removeBounds();
    this.drawOverlay();
  }

  private drawOverlay(): void
  {
    const g = this.g;
    const l = this.lvl;
    const s = this.sel;
    g.clear();
    for ( const tx of this.labels )
    {
      tx.destroy();
    }
    this.labels = [];
    const txt = ( x: number, y: number, str: string, col = '#ffffff' ) =>
    {
      this.labels.push( this.gs.add.text( x, y, str, { fontFamily: 'monospace', fontSize: '16px', color: col, backgroundColor: '#00000088' } ).setDepth( 101 ) );
    };
    g.lineStyle( 3, 0xff00ff, 1 );
    g.strokeRect( 0, 0, l.width, l.height );
    l.layers.forEach( ( ly, i ) =>
    {
      const sel = s?.kind === 'layer' && s.i === i;
      g.lineStyle( sel ? 4 : 2, sel ? 0xffff00 : 0xffffff, 0.8 );
      g.lineBetween( 0, ly.top, l.width, ly.top );
      txt( 20, ly.top + 6, `L${ i } wind ${ ly.wind }${ ly.gust ? ` gust±${ ly.gust }/${ ly.period }s` : '' }`, sel ? '#ffff00' : '#ffffff' );
      void layerBottom;
    } );
    l.blocks.forEach( ( b, i ) =>
    {
      const sel = s?.kind === 'block' && s.i === i;
      g.lineStyle( sel ? 4 : 2, sel ? 0xffff00 : 0x000000, 1 );
      g.strokeRect( b.x, b.y, b.w, b.h );
    } );
    l.updrafts.forEach( ( u, i ) =>
    {
      const sel = s?.kind === 'updraft' && s.i === i;
      g.lineStyle( sel ? 4 : 2, sel ? 0xffff00 : 0xff8800, 1 );
      g.strokeRect( u.x, u.y, u.w, u.h );
      txt( u.x + 4, u.y + 4, 'up ' + u.force, '#ffaa44' );
    } );
    l.hazards.forEach( ( h, i ) =>
    {
      const sel = s?.kind === 'hazard' && s.i === i;
      g.lineStyle( sel ? 4 : 2, sel ? 0xffff00 : 0xff0000, 1 );
      g.strokeCircle( h.x, h.y, h.r );
      if ( h.move )
      {
        g.lineStyle( 1, 0xff0000, 0.7 );
        g.lineBetween( h.x - h.move.dx, h.y - h.move.dy, h.x + h.move.dx, h.y + h.move.dy );
      }
    } );
    l.targets.forEach( ( tg, i ) =>
    {
      const sel = s?.kind === 'target' && s.i === i;
      g.lineStyle( sel ? 4 : 2, sel ? 0xffff00 : 0x00ff00, 1 );
      g.strokeRect( tg.x - tg.w / 2, tg.y - 60, tg.w, 60 );
      txt( tg.x - tg.w / 2 + 4, tg.y - 80, `T${ i + 1 } w${ tg.w }`, '#88ff88' );
    } );
    g.lineStyle( 2, s?.kind === 'stamp' ? 0xffff00 : 0x00ffff, 1 );
    g.strokeCircle( l.stamp.x, l.stamp.y, 24 );
    g.lineStyle( 2, s?.kind === 'start' ? 0xffff00 : 0x00ffff, 1 );
    g.strokeRect( l.start.x - 16, l.start.y - TOP_OFF, 32, TOP_OFF );
    const f = findLevel( this.gs.levelId )!;
    this.info.setText( [
      t( 'editorHelp' ),
      '0 select (Shift+drag resize)  M bird move  G gust  F fuel  W/H size (Shift −)  N new level  V verify  -/= zoom  RMB pan',
      `world${ f.world.id } level ${ l.id} "${ l.name }" ${ l.width }x${ l.height }  gasStar ${ l.gasStar }${ l.fuel !== undefined ? ' fuel ' + l.fuel : '' }  best ${ l.best ? l.best.gas + '/' + ( l.best.stampGas ?? '-' ) : '?' }  hint ${ l.hint ? 'yes' : 'no' }`,
      `tool: ${ this.tool }   selected: ${ s ? s.kind + ( 'i' in s ? ' #' + s.i : '' ) : '—' }   ${ this.status }`,
      'worlds: ' + WORLDS.map( ( w ) => w.id + ':' + w.levels.length ).join( ' ' )
    ] );
  }

  update(): void {}

  exit(): void
  {
    for ( const d of this.disposers )
    {
      d();
    }
    this.worker?.terminate();
    this.g.destroy();
    this.info.destroy();
    for ( const tx of this.labels )
    {
      tx.destroy();
    }
    this.gs.editorHook = undefined;
    current = undefined;
    this.gs.scene.wake( 'ui' );
    this.gs.restartLevel( this.gs.levelId, false );
  }
}

function inRect( x: number, y: number, r: Rect ): boolean
{
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

let current: Editor | undefined;

export function installEditor( game: Phaser.Game ): void
{
  window.addEventListener( 'keydown', ( e ) =>
  {
    if ( e.code !== 'KeyE' || current )
    {
      return;
    }
    const gs = game.scene.getScene( 'game' ) as GameScene | null;
    if ( !gs || !gs.scene.isActive() )
    {
      return;
    }
    // Клавіша E, що відкриває редактор, не має тут же його закрити
    setTimeout( () =>
    {
      current = new Editor( gs );
      gs.editorHook = current;
    }, 0 );
  } );
}
