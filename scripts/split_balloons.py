"""Ріже рядок куль (сирий PNG на зеленому) на окремі оболонки під геометрію env-classic.

py scripts/split_balloons.py <рядок.png> <id1,id2,...>

Для id з префіксом plt- ріже пілотів: ширина 48 px, низ на краю текстури 52 px завширшки;
вищі (вуха кролика) просто нарощують текстуру вгору, щоб голови були одного розміру.
Для id з префіксом p- ріже частинки шлейфу: вписує в квадрат 64x64 у public/assets/trail/
(p-blob ще й знебарвлює, бо його тонують у кольори веселки).
Для id з префіксом bas- ріже кошики під геометрію bas-wicker: 60x40, ширина 48–54, низ на y=38.

Ключ — за «зеленістю» G - max(R, B), а не за відстанню до кольору фону: пильно-блакитні
й бірюзові ділянки близькі до фону за відстанню, і звичайний ключ вигризав їх по краях.
Масштаб такий, щоб від верху оболонки до кошика було 166 px, як у класики:
тоді стропи завжди доходять до окремого кошика. Кошик і все нижче відрізаємо.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

W, H, TOP, CX = 136, 168, 2, 67

src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
ids = sys.argv[2].split(',')
r, g, b = src[..., 0], src[..., 1], src[..., 2]
gr = g - np.maximum(r, b)
edge = np.concatenate([gr[:4].ravel(), gr[-4:].ravel(), gr[:, :4].ravel(), gr[:, -4:].ravel()])
bg = np.median(edge)
hi, lo = bg * 0.55, bg * 0.25
key = np.clip((gr - lo) / (hi - lo), 0, 1)
# Ключуємо лише фон, зв'язаний із краєм кадру: зелені плями всередині кулі лишаються
m = Image.fromarray(np.where(key > 0.5, 255, 0).astype(np.uint8))
pad = Image.new('L', (m.width + 2, m.height + 2), 255)
pad.paste(m, (1, 1))
ImageDraw.floodfill(pad, (0, 0), 128)
outside = np.asarray(pad)[1:-1, 1:-1] == 128
grow = np.asarray(Image.fromarray(outside.astype(np.uint8) * 255).filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(5))) > 0
# Замкнені ділянки фону (між стропами й кошиком) флуд не дістає: прибираємо лише дуже зелені
hole = np.clip((gr - bg * 0.45) / (bg * 0.25), 0, 1)
alpha = np.where(outside, 0, np.where(grow, 1 - key, 1)) * (1 - hole)
grow = grow | (hole > 0)
# Despill на краю: зелений не вище за max(R, B)
g2 = np.where(grow, np.minimum(g, np.maximum(r, b)), g)
rgba = np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)
img = Image.fromarray(rgba)
a = alpha > 0.5

cols = a.sum(0) > 0
runs, x = [], 0
while x < len(cols):
    if cols[x]:
        s = x
        while x < len(cols) and cols[x]:
            x += 1
        if x - s > 50:
            runs.append((s, x))
    x += 1
assert len(runs) == len(ids), f'знайдено {len(runs)} куль, а id {len(ids)}'


def longest_run(row):
    best = cur = 0
    for v in row:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


for (x0, x1), id_ in zip(runs, ids):
    if id_.startswith('plt-'):
        pa = a[:, x0:x1]
        ys = np.nonzero(pa.any(1))[0]
        xs = np.nonzero(pa.any(0))[0]
        part = img.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))
        k = 48 / part.width
        part = part.resize((48, round(part.height * k)), Image.LANCZOS)
        out = Image.new('RGBA', (52, max(52, part.height)))
        out.paste(part, (2, out.height - part.height))
        out.save(f'public/assets/balloon/{id_}.webp', quality=90, method=6, alpha_quality=100)
        print(id_, out.size)
        continue
    if id_.startswith('p-'):
        pa = a[:, x0:x1]
        ys = np.nonzero(pa.any(1))[0]
        xs = np.nonzero(pa.any(0))[0]
        part = img.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))
        k = 60 / max(part.size)
        part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.LANCZOS)
        out = Image.new('RGBA', (64, 64))
        out.paste(part, ((64 - part.width) // 2, (64 - part.height) // 2))
        if id_ == 'p-blob':
            q = np.asarray(out).astype(float)
            lum = q[..., 0] * 0.3 + q[..., 1] * 0.59 + q[..., 2] * 0.11
            v = np.clip(lum / np.median(lum[q[..., 3] > 200]) * 235, 0, 255)
            out = Image.fromarray(np.dstack([v, v, v, q[..., 3]]).astype(np.uint8))
        out.save(f'public/assets/trail/{id_}.webp', quality=90, method=6, alpha_quality=100)
        print(id_, part.size)
        continue
    if id_.startswith('bas-'):
        pa = a[:, x0:x1]
        ys = np.nonzero(pa.any(1))[0]
        xs = np.nonzero(pa.any(0))[0]
        part = img.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))
        # Стропи кулі сходяться на ~44 px; вужчий кошик розтягуємо по ширині, вищий за 38 px не робимо
        k = min(54 / part.width, 38 / part.height)
        part = part.resize((max(48, round(part.width * k)), round(part.height * k)), Image.LANCZOS)
        out = Image.new('RGBA', (60, 40))
        out.paste(part, (30 - part.width // 2, 39 - part.height))
        out.save(f'public/assets/balloon/{id_}.webp', quality=90, method=6, alpha_quality=100)
        print(id_, part.size)
        continue
    pa = a[:, x0:x1]
    ys = np.nonzero(pa.any(1))[0]
    top, bot = ys.min(), ys.max()
    envw = pa[top: top + int((bot - top) * 0.6)].sum(1).max()
    # Кошик — суцільний широкий блок знизу; стропи над ним тонкі
    thr = envw * 0.18
    y = bot
    # Спершу вузьке заокруглене дно кошика, далі його широке тіло
    while y > bot - (bot - top) * 0.1 and longest_run(pa[y]) <= thr:
        y -= 1
    while y > top and longest_run(pa[y]) > thr:
        y -= 1
    basket_top = y
    k = (H - TOP) / (basket_top - top)
    widths = pa[top: top + int((bot - top) * 0.6)].sum(1)
    yrow = top + int(np.argmax(widths))
    row = np.nonzero(pa[yrow])[0]
    cx = (row.min() + row.max()) / 2
    part = img.crop((x0, 0, x1, basket_top + 1))
    big = part.resize((round(part.width * k), round(part.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', (W, H))
    out.paste(big, (round(CX - cx * k), round(TOP - top * k)))
    out.save(f'public/assets/balloon/{id_}.webp', quality=90, method=6, alpha_quality=100)
    print(id_, 'k=%.3f' % k, 'env width %d px' % round(envw * k))
