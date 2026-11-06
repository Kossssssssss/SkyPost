import { solve, applySolve, describe } from '../core/solver.ts';
import type { LevelData } from '../core/level.ts';

self.onmessage = ( e: MessageEvent<LevelData> ) =>
{
  const lvl = e.data;
  const r = solve( lvl );
  const ok = applySolve( lvl, r );
  ( self as unknown as Worker ).postMessage( { ok, text: describe( lvl, r ), level: lvl } );
};
