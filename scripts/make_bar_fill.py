"""Заливка смуги завантаження точно за формою каналу на bar.webp.

Канал обведений тонкою лінією туші. Знаходимо її за локальним контрастом (акварельні плями ширші й
світліші, тож їх не чіпаємо), заливаємо простір усередині від центру і кладемо туди текстуру gaugefill.
Результат має той самий розмір, що й bar.webp, тож у грі ставиться прямо поверх смуги.

python scripts/make_bar_fill.py
"""
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

BAR = 'public/assets/loading/bar.webp'
FILL = 'public/assets/world/gaugefill.webp'
OUT = 'public/assets/loading/bar_fill.webp'
SEED = (57, 509)  # (y, x) точка всередині каналу
INK_CONTRAST = 25  # наскільки піксель туші темніший за медіану навколо
FILL_MARGIN = 6  # власна рамка gaugefill, її відрізаємо


def channel_mask( bar: Image.Image ) -> Image.Image:
  g = bar.convert( 'L' )
  lum = np.array( g ).astype( int )
  med = np.array( g.filter( ImageFilter.MedianFilter( 9 ) ) ).astype( int )
  ink = Image.fromarray( ( ( ( lum < med - INK_CONTRAST ) | ( lum < 140 ) ) * 255 ).astype( 'uint8' ) )
  wall = np.array( ink.filter( ImageFilter.MaxFilter( 3 ) ) ) > 127
  h, w = lum.shape
  m = np.zeros( ( h, w ), bool )
  m[ SEED ] = True
  q = deque( [ SEED ] )
  while q:
    y, x = q.popleft()
    for dy, dx in ( ( 1, 0 ), ( -1, 0 ), ( 0, 1 ), ( 0, -1 ) ):
      ny, nx = y + dy, x + dx
      if 0 <= ny < h and 0 <= nx < w and not m[ ny, nx ] and not wall[ ny, nx ]:
        m[ ny, nx ] = True
        q.append( ( ny, nx ) )
  # Дірки від крапель усередині: усе, що не досяжне ззовні, теж канал
  outside = np.zeros( ( h, w ), bool )
  q = deque( ( y, x ) for y in range( h ) for x in ( 0, w - 1 ) )
  for y, x in q:
    outside[ y, x ] = True
  while q:
    y, x = q.popleft()
    for dy, dx in ( ( 1, 0 ), ( -1, 0 ), ( 0, 1 ), ( 0, -1 ) ):
      ny, nx = y + dy, x + dx
      if 0 <= ny < h and 0 <= nx < w and not outside[ ny, nx ] and not m[ ny, nx ]:
        outside[ ny, nx ] = True
        q.append( ( ny, nx ) )
  m = ~outside
  mask = Image.fromarray( ( m * 255 ).astype( 'uint8' ) )
  # Закриваємо дрібні дірки від крапель усередині й лишаємо лінію туші видимою, м'який край
  mask = mask.filter( ImageFilter.MaxFilter( 5 ) ).filter( ImageFilter.MinFilter( 5 ) )
  return mask.filter( ImageFilter.GaussianBlur( 0.7 ) )


def main() -> None:
  bar = Image.open( BAR ).convert( 'RGBA' )
  mask = channel_mask( bar )
  x0, y0, x1, y1 = mask.point( lambda v: 255 if v > 127 else 0 ).getbbox()
  print( 'channel', x0, x1, y0, y1 )
  src = Image.open( FILL ).convert( 'RGBA' )
  src = src.crop( ( FILL_MARGIN, FILL_MARGIN, src.width - FILL_MARGIN, src.height - FILL_MARGIN ) )
  out = Image.new( 'RGBA', bar.size, ( 0, 0, 0, 0 ) )
  out.paste( src.resize( ( x1 - x0, y1 - y0 ), Image.LANCZOS ).convert( 'RGB' ), ( x0, y0 ) )
  out.putalpha( mask )
  out.save( OUT, 'WEBP', quality=88, method=6, alpha_quality=90 )


if __name__ == '__main__':
  main()
