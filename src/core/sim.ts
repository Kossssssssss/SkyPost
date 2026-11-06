import { groundY, moverOffset, windAt, type LevelData, type Rect } from './level.ts';

export const DT = 1 / 60;

export const HEAT_UP = 0.55;
export const COOL = 0.22;
export const NEUTRAL = 0.45;
export const LIFT = 230;
export const V_DRAG = 0.9;
export const WIND_FOLLOW = 1.1;
export const GROUND_FRICTION = 6;

// Геометрія кулі: позиція (x, y) — низ кошика
export const ENV_R = 32;
export const ENV_OFF = 66;
export const BASKET_HW = 13;
export const BASKET_H = 18;
export const MID_OFF = 50;
export const TOP_OFF = ENV_OFF + ENV_R;

export const EV_LAND = 1;
export const EV_DELIVER = 2;
export const EV_STAMP = 4;
export const EV_DEAD = 8;
export const EV_WIN = 16;
export const EV_BUMP = 32;
export const EV_LIFTOFF = 64;

const SETTLE_TIME = 0.35;

export interface SimState
{
  x: number;
  y: number;
  vx: number;
  vy: number;
  heat: number;
  gas: number;
  t: number;
  grounded: boolean;
  settle: number;
  target: number;
  stamp: boolean;
  dead: '' | 'water' | 'hazard';
  won: boolean;
}

export function createState( lvl: LevelData ): SimState
{
  return {
    x: lvl.start.x,
    y: lvl.start.y,
    vx: 0,
    vy: 0,
    heat: 0.3,
    gas: 0,
    t: 0,
    grounded: true,
    settle: 0,
    target: 0,
    stamp: false,
    dead: '',
    won: false
  };
}

export function cloneState( s: SimState ): SimState
{
  return { ...s };
}

export function canBurn( lvl: LevelData, s: SimState, bonusFuel = 0 ): boolean
{
  return lvl.fuel === undefined || s.gas < lvl.fuel + bonusFuel;
}

export function hazardPos( lvl: LevelData, i: number, t: number ): { x: number; y: number }
{
  const h = lvl.hazards[ i ];
  const o = moverOffset( h.move, t );
  return { x: h.x + o.x, y: h.y + o.y };
}

function circleHitsBox( cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number ): boolean
{
  const px = Math.max( x0, Math.min( cx, x1 ) );
  const py = Math.max( y0, Math.min( cy, y1 ) );
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

function hitsBalloon( s: SimState, cx: number, cy: number, r: number ): boolean
{
  const ex = cx - s.x;
  const ey = cy - ( s.y - ENV_OFF );
  const rr = r + ENV_R * 0.85;
  if ( ex * ex + ey * ey < rr * rr )
  {
    return true;
  }
  return circleHitsBox( cx, cy, r, s.x - BASKET_HW, s.y - BASKET_H, s.x + BASKET_HW, s.y );
}

function resolveBasket( s: SimState, b: Rect ): number
{
  const x0 = s.x - BASKET_HW;
  const x1 = s.x + BASKET_HW;
  const y0 = s.y - BASKET_H;
  const y1 = s.y;
  // Дотик дном рівно до верху блоку теж опора, інакше куля на даху «тремтить» між станами
  if ( x1 <= b.x || x0 >= b.x + b.w || y1 < b.y || y0 >= b.y + b.h )
  {
    return 0;
  }
  const pushUp = y1 - b.y;
  const pushDown = b.y + b.h - y0;
  const pushLeft = x1 - b.x;
  const pushRight = b.x + b.w - x0;
  const m = Math.min( pushUp, pushDown, pushLeft, pushRight );
  let ev = 0;
  if ( m === pushUp )
  {
    s.y -= pushUp;
    if ( s.vy > 0 )
    {
      if ( s.vy > 150 )
      {
        ev |= EV_BUMP;
      }
      s.vy = 0;
    }
    s.grounded = true;
  }
  else if ( m === pushDown )
  {
    s.y += pushDown;
    s.vy = Math.max( s.vy, 0 );
  }
  else if ( m === pushLeft )
  {
    s.x -= pushLeft;
    s.vx = Math.min( s.vx, 0 );
  }
  else
  {
    s.x += pushRight;
    s.vx = Math.max( s.vx, 0 );
  }
  return ev;
}

function resolveEnvelope( s: SimState, b: Rect ): number
{
  const cx = s.x;
  const cy = s.y - ENV_OFF;
  const px = Math.max( b.x, Math.min( cx, b.x + b.w ) );
  const py = Math.max( b.y, Math.min( cy, b.y + b.h ) );
  let dx = cx - px;
  let dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if ( d2 >= ENV_R * ENV_R )
  {
    return 0;
  }
  let d = Math.sqrt( d2 );
  if ( d < 0.001 )
  {
    // Центр усередині блоку — штовхаємо вниз, бо оболонка найчастіше впирається в нависання знизу
    dx = 0;
    dy = 1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const pen = ENV_R - Math.sqrt( d2 );
  s.x += nx * pen;
  s.y += ny * pen;
  const vn = s.vx * nx + s.vy * ny;
  if ( vn < 0 )
  {
    s.vx -= vn * nx;
    s.vy -= vn * ny;
  }
  return Math.abs( vn ) > 60 ? EV_BUMP : 0;
}

export function onTarget( lvl: LevelData, s: SimState ): boolean
{
  const tg = lvl.targets[ s.target ];
  if ( !tg || !s.grounded )
  {
    return false;
  }
  return Math.abs( s.x - tg.x ) <= tg.w / 2 && Math.abs( s.y - tg.y ) < 4;
}

export function step( lvl: LevelData, s: SimState, burn: boolean, bonusFuel = 0 ): number
{
  if ( s.dead || s.won )
  {
    return 0;
  }
  const dt = DT;
  let ev = 0;
  const wasGrounded = s.grounded;

  if ( burn && canBurn( lvl, s, bonusFuel ) )
  {
    s.heat = Math.min( 1, s.heat + HEAT_UP * dt );
    s.gas += dt;
  }
  else
  {
    s.heat = Math.max( 0, s.heat - COOL * dt );
  }

  let ay = -( s.heat - NEUTRAL ) * LIFT;
  const midY = s.y - MID_OFF;
  for ( const u of lvl.updrafts )
  {
    if ( s.x > u.x && s.x < u.x + u.w && midY > u.y && midY < u.y + u.h )
    {
      ay -= u.force;
    }
  }

  if ( wasGrounded && ay >= 0 )
  {
    s.vy = 0;
  }
  else
  {
    s.vy += ay * dt;
    s.vy *= Math.exp( -V_DRAG * dt );
  }

  if ( wasGrounded )
  {
    s.vx *= Math.exp( -GROUND_FRICTION * dt );
    if ( Math.abs( s.vx ) < 1 )
    {
      s.vx = 0;
    }
  }
  else
  {
    const w = windAt( lvl, midY, s.t );
    s.vx += ( w - s.vx ) * ( 1 - Math.exp( -WIND_FOLLOW * dt ) );
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.t += dt;
  s.grounded = false;

  for ( const b of lvl.blocks )
  {
    ev |= resolveEnvelope( s, b );
    ev |= resolveBasket( s, b );
  }

  const gy = groundY( lvl );
  if ( s.y >= gy )
  {
    if ( lvl.water )
    {
      s.dead = 'water';
      return ev | EV_DEAD;
    }
    if ( s.vy > 150 )
    {
      ev |= EV_BUMP;
    }
    s.y = gy;
    s.vy = Math.min( s.vy, 0 );
    s.grounded = true;
  }

  if ( s.y - TOP_OFF < 0 )
  {
    s.y = TOP_OFF;
    s.vy = Math.max( s.vy, 0 );
  }
  if ( s.x < ENV_R + 2 )
  {
    s.x = ENV_R + 2;
    s.vx = Math.max( s.vx, 0 );
  }
  else if ( s.x > lvl.width - ENV_R - 2 )
  {
    s.x = lvl.width - ENV_R - 2;
    s.vx = Math.min( s.vx, 0 );
  }

  if ( s.grounded && !wasGrounded )
  {
    ev |= EV_LAND;
  }
  else if ( !s.grounded && wasGrounded )
  {
    ev |= EV_LIFTOFF;
  }

  for ( let i = 0; i < lvl.hazards.length; i++ )
  {
    const p = hazardPos( lvl, i, s.t );
    if ( hitsBalloon( s, p.x, p.y, lvl.hazards[ i ].r ) )
    {
      s.dead = 'hazard';
      return ev | EV_DEAD;
    }
  }

  if ( !s.stamp && hitsBalloon( s, lvl.stamp.x, lvl.stamp.y, 24 ) )
  {
    s.stamp = true;
    ev |= EV_STAMP;
  }

  if ( onTarget( lvl, s ) && Math.abs( s.vx ) < 8 )
  {
    s.settle += dt;
    if ( s.settle >= SETTLE_TIME )
    {
      s.settle = 0;
      s.target++;
      ev |= EV_DELIVER;
      if ( s.target >= lvl.targets.length )
      {
        s.won = true;
        ev |= EV_WIN;
      }
    }
  }
  else
  {
    s.settle = 0;
  }
  return ev;
}
