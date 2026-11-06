import { setFont } from './widgets.ts';

// Rubik Bold лежить у файлах гри (ліцензія OFL у public/fonts), щоб реліз не ходив на сторонні сервери.
// Шрифт розбитий на піднабори: браузер вантажить лише ті, чиї літери трапляються в тексті
const FACES: [ string, string ][] = [
  [ 'rubik-700-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' ],
  [ 'rubik-700-latin-ext.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' ],
  [ 'rubik-700-cyrillic.woff2', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' ]
];

export async function loadGameFont(): Promise<void>
{
  try
  {
    const faces = FACES.map( ( [ file, range ] ) =>
      new FontFace( 'Rubik', `url(${ import.meta.env.BASE_URL }fonts/${ file })`, { weight: '700', unicodeRange: range } ) );
    // Phaser малює текст на канвасі одразу, тож чекаємо файли до старту; повільна мережа не має блокувати гру
    const loaded = Promise.all( faces.map( ( f ) => f.load() ) );
    const timeout = new Promise<never>( ( _res, rej ) => setTimeout( () => rej( new Error( 'timeout' ) ), 4000 ) );
    for ( const f of await Promise.race( [ loaded, timeout ] ) )
    {
      document.fonts.add( f );
    }
    setFont( 'Rubik' );
  }
  catch
  {
    // Без файлів шрифту лишається системний запасний
  }
}
