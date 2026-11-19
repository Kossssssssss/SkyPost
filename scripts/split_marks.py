"""Ріже рядок із трьох значків карти (сирий PNG на зеленому) на окремі WebP у public/assets/world/.

py scripts/split_marks.py <рядок.png> mk-hard,mk-super,mk-new [--size 160]

Значки знаходимо за порожніми проміжками між ними; іскри біля зірки приєднуються до неї.
Ключ — за «зеленістю» G - max(R, B) відносно фону з країв кадру, як у split_balloons.py;
на краях зелений притискаємо до max(R, B), щоб не лишалось зеленої облямівки.
"""
import sys
import numpy as np
from PIL import Image

src_path, ids = sys.argv[1], sys.argv[2].split(',')
size = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 160

src = np.asarray(Image.open(src_path).convert('RGB')).astype(float)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
gr = g - np.maximum(r, b)
edge = np.concatenate([gr[:4].ravel(), gr[-4:].ravel(), gr[:, :4].ravel(), gr[:, -4:].ravel()])
bg = np.median(edge)
hi, lo = bg * 0.6, bg * 0.25
alpha = 1 - np.clip((gr - lo) / (hi - lo), 0, 1)
# Розмиті тіні під печатками зеленкуваті: усе з помітним надлишком зеленого — фон
alpha = np.where(gr > bg * 0.35, 0, alpha)
alpha = np.where(alpha < 0.08, 0, alpha)
g2 = np.where(alpha < 1, np.minimum(g, np.maximum(r, b)), g)
rgba = np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)


# Значки шукаємо за порожніми проміжками між стовпцями; дрібні шматки (іскри) приєднуємо до найближчого значка
cols = (rgba[..., 3] > 20).sum(0) > 0
runs, x = [], 0
while x < len(cols):
    if cols[x]:
        s = x
        while x < len(cols) and cols[x]:
            x += 1
        runs.append([s, x])
    x += 1
big = [r_ for r_ in runs if r_[1] - r_[0] > 60]
for s, e in runs:
    if e - s <= 60:
        near = min(big, key=lambda r_: min(abs(s - r_[1]), abs(r_[0] - e)))
        near[0], near[1] = min(near[0], s), max(near[1], e)
assert len(big) == len(ids), f'знайдено {len(big)} значків, а id {len(ids)}'

for (x0, x1), id_ in zip(big, ids):
    part = rgba[:, x0:x1]
    # Рамка за рядками й стовпцями, де щонайменше 3 щільні пікселі: поодинокі крапки текстури паперу не рахуються
    solid = part[..., 3] > 128
    ys = np.nonzero(solid.sum(1) >= 3)[0]
    xs = np.nonzero(solid.sum(0) >= 3)[0]
    crop = Image.fromarray(part[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    k = size / max(crop.width, crop.height)
    crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    out.save(f'public/assets/world/{id_}.webp', quality=90)
    print(id_, crop.size)
