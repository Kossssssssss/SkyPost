"""Вирізає пурпурове небо з широких шарів пейзажу (пагорби, земля).

Зелені пагорби генеруємо на пурпуровому тлі, а не на зеленому: інакше хромакей з'їв би траву.
normalize_assets.py визначає тло за краями картинки, а шари йдуть від краю до краю, тож тут свій кеїнг:

1. «Пурпуровість» m = min(R, B) - G: тло ≈ 60–90, трава, земля, дахи й квіти — нижче 25.
2. Despill: на перехідних пікселях R і B зменшуються на частку m, щоб не було рожевої облямівки.
3. Alpha: erode 1 px, feather 1 px.
4. Кремові смуги паперу по лівому/правому краю (і знизу з --trim-bottom) обрізаються:
   модель часто малює аркуш з полями.
5. Обрізка зверху по першому непрозорому рядку, WebP.

python scripts/key_layer.py <вхід> <вихід.webp> [--trim-bottom] [--width 2048]
python scripts/key_layer.py <вхід> <вихід.webp> --object [--size 512]   (окремий об'єкт: обрізка з усіх боків)
"""

import argparse
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")

OPAQUE_BELOW = 25
CLEAR_ABOVE = 50


def cream_mask(rgb: np.ndarray) -> np.ndarray:
    return (rgb.min(-1) > 185) & (rgb.max(-1) - rgb.min(-1) < 45)


def trim_edges(rgb: np.ndarray, alpha: np.ndarray, bottom: bool) -> tuple[int, int, int]:
    """Межі без паперових полів. Поле збоку — стовпчик, де в рядках неба (майже весь рядок пурпуровий) пурпурового нема:
    блідо-кремові пагорби так не сплутати з папером. Знизу — рядки, де переважає кремовий папір."""
    cream = cream_mask(rgb) & (alpha > 0.5)
    solid = alpha > 0.5
    h, w = alpha.shape
    sky_rows = (alpha < 0.5).mean(1) > 0.8
    if sky_rows.any():
        frac_col = solid[sky_rows].mean(0)
    else:
        frac_col = np.zeros(w)
    x0 = 0
    while x0 < w // 4 and frac_col[x0] > 0.5:
        x0 += 1
    x1 = w
    while x1 > w * 3 // 4 and frac_col[x1 - 1] > 0.5:
        x1 -= 1
    y1 = h
    if bottom:
        frac_row = cream.sum(1) / np.maximum(1, solid.sum(1))
        while y1 > h // 2 and frac_row[y1 - 1] > 0.6:
            y1 -= 1
        # У смуги землі поля паперу бувають і з боків, лише нижче трави: там вони видні як шов між копіями
        low = slice(h // 2, y1)
        frac_low = cream[low].sum(0) / np.maximum(1, solid[low].sum(0))
        while x0 < w // 4 and frac_low[x0] > 0.3:
            x0 += 1
        while x1 > w * 3 // 4 and frac_low[x1 - 1] > 0.3:
            x1 -= 1
    # Запас у кілька пікселів: край аркуша розмитий
    return min(x0 + 6, w // 4) if x0 else 0, max(x1 - 6, w * 3 // 4) if x1 < w else w, max(y1 - 6, h // 2) if y1 < h else h


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--trim-bottom", action="store_true", help="обрізати кремовий папір знизу (смуга землі)")
    ap.add_argument("--width", type=int, default=2048)
    ap.add_argument("--object", action="store_true", help="окремий об'єкт на тлі: обрізати по ньому з усіх боків")
    ap.add_argument("--size", type=int, default=512, help="з --object: довша сторона, px")
    a = ap.parse_args()

    rgb = np.array(Image.open(a.input).convert("RGB")).astype(float)
    m = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    alpha = np.clip((CLEAR_ABOVE - m) / (CLEAR_ABOVE - OPAQUE_BELOW), 0, 1)

    spill = np.clip(m, 0, None)[..., None] * 0.6
    edge = (alpha < 1)[..., None]
    rgb[..., [0, 2]] = np.where(edge, rgb[..., [0, 2]] - spill, rgb[..., [0, 2]])
    rgb = np.clip(rgb, 0, 255)

    am = Image.fromarray((alpha * 255).astype("uint8")).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    alpha = np.array(am).astype(float) / 255

    if a.object:
        # Поодинокі пікселі зерна не рахуємо: рядок/стовпчик непорожній, коли в ньому хоч 8 непрозорих точок
        solid = alpha > 0.05
        rows = np.nonzero(solid.sum(1) > 8)[0]
        cols = np.nonzero(solid.sum(0) > 8)[0]
        y0, y1 = max(0, int(rows[0]) - 4), min(alpha.shape[0], int(rows[-1]) + 5)
        x0, x1 = max(0, int(cols[0]) - 4), min(alpha.shape[1], int(cols[-1]) + 5)
        img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype("uint8")[y0:y1, x0:x1], "RGBA")
        k = a.size / max(img.size)
        img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
        img.save(a.output, "WEBP", quality=88, method=6, alpha_quality=90)
        print(f"{a.output} {img.width}x{img.height} (об'єкт x {x0}..{x1}, y {y0}..{y1})")
        return

    x0, x1, y1 = trim_edges(rgb, alpha, a.trim_bottom)
    # Поодинокі пікселі (зерно паперу) не рахуємо: рядок непорожній, коли в ньому хоч 8 непрозорих точок
    rows = np.nonzero((alpha[:y1, x0:x1] > 0.05).sum(1) > 8)[0]
    y0 = max(0, int(rows[0]) - 4) if len(rows) else 0

    out = np.dstack([rgb, alpha * 255]).astype("uint8")[y0:y1, x0:x1]
    img = Image.fromarray(out, "RGBA")
    if img.width != a.width:
        img = img.resize((a.width, round(img.height * a.width / img.width)), Image.LANCZOS)
    img.save(a.output, "WEBP", quality=88, method=6, alpha_quality=90)
    print(f"{a.output} {img.width}x{img.height} (обрізано x {x0}..{x1}, y {y0}..{y1})")


if __name__ == "__main__":
    main()
