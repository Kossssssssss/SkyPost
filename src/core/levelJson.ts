import type { WorldData } from './level.ts';

// Числові масиви й дрібні об'єкти — в один рядок, щоб diff рівнів читався
export function formatWorld( world: WorldData ): string
{
  let s = JSON.stringify( world, null, 2 );
  s = s.replace( /\[\s*([-\d.,\s]+?)\s*\]/g, ( _m, body: string ) => '[ ' + body.split( /,\s*/ ).join( ', ' ) + ' ]' );
  s = s.replace( /\{\s*([^{}\[\]]*?)\s*\}/g, ( _m, body: string ) => '{ ' + body.split( /,\s*\n\s*/ ).join( ', ' ) + ' }' );
  return s + '\n';
}
