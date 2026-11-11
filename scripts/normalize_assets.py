"""Постобробка згенерованих асетів Sky Post.

python scripts/normalize_assets.py <вхід> <вихід> [--size 512] [--palette assets/ref/palette.json]
                                    [--palette-blend 0.35] [--no-key]

1. Хромакей: чисто-зелене тло стає прозорим, перехід м'який.
2. Despill: на краях G = min(G, max(R, B)), щоб не було зеленої облямівки.
3. Alpha: erode 1 px, потім feather 1 px — без ореолу.
4. Crop по непрозорому з відступом 4 px.
5. (опційно) м'яко підтягнути кольори до палітри, blend 30–40 %.
6. Resize до --size по довшій стороні.
7. WebP quality 90.

--no-key — для текстур без зеленого тла (паперовий оверлей): лише resize і збереження.
Потрібні Pillow і numpy.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Консоль Windows інакше показує кирилицю кракозябрами
sys.stdout.reconfigure(encoding="utf-8")

PAD = 4


# Відстань до кольору тла в RGB: ближче KEY_LO — повністю прозоре, далі KEY_HI — непрозоре.
# Запас на зернистість паперу, яку модель малює і на тлі
KEY_LO = 22
KEY_HI = 48


def border_color(rgb: np.ndarray) -> np.ndarray:
    edge = np.concatenate([rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3), rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def connected_to_border(mask: np.ndarray) -> np.ndarray:
    # Заливка від рамки кадру: прозорим стає лише тло, а схожі кольори всередині об'єкта (листя, шавлієві плями) лишаються
    h, w = mask.shape
    img = Image.new("L", (w + 2, h + 2), 255)
    img.paste(Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)), (1, 1))
    ImageDraw.floodfill(img, (0, 0), 128)
    return np.asarray(img)[1:-1, 1:-1] == 128


def chroma_key(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    # Модель дає то чисто-зелене, то приглушене шавлієве тло, тож колір тла беремо з країв кадру
    bg = border_color(rgb)
    if bg[1] - max(bg[0], bg[2]) < 12:
        print(f"Попередження: краї кадру не зелені (RGB {bg.astype(int).tolist()}), хромакей пропущено")
        return alpha
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    k = np.clip((KEY_HI - d) / (KEY_HI - KEY_LO), 0, 1)
    k = np.where(connected_to_border(d < KEY_HI), k, 0)
    # Тло, замкнене всередині об'єкта (між стропами, у ручках), з краєм не з'єднане: його беремо лише за дуже близьким кольором
    hole = np.clip((KEY_LO + 6 - d) / 12, 0, 1)
    return alpha * (1 - np.maximum(k, hole))


def edge_band(alpha: np.ndarray, radius: int = 3) -> np.ndarray:
    # Пікселі об'єкта, біля яких у межах radius є прозорість — саме там лишається зелений відблиск тла
    a = Image.fromarray((alpha * 255).astype(np.uint8))
    near = np.asarray(a.filter(ImageFilter.MinFilter(radius * 2 + 1))) < 250
    return near & (alpha > 0)


def despill(rgb: np.ndarray, mask: np.ndarray) -> None:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    capped = np.minimum(g, np.maximum(r, b))
    rgb[..., 1] = np.where(mask, capped, g)


def erode_feather(alpha: np.ndarray) -> np.ndarray:
    a = Image.fromarray((alpha * 255).astype(np.uint8))
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(a).astype(np.float32) / 255


def crop_box(alpha: np.ndarray):
    ys, xs = np.nonzero(alpha > 8 / 255)
    if len(xs) == 0:
        raise SystemExit("Після хромакею нічого не лишилось: перевірте, чи тло справді зелене")
    h, w = alpha.shape
    return (max(0, xs.min() - PAD), max(0, ys.min() - PAD), min(w, xs.max() + 1 + PAD), min(h, ys.max() + 1 + PAD))


def pull_to_palette(rgb: np.ndarray, palette_path: Path, blend: float) -> np.ndarray:
    data = json.loads(palette_path.read_text(encoding="utf-8"))
    pal = np.array([[int(c["hex"][i:i + 2], 16) for i in (1, 3, 5)] for c in data["colors"]], dtype=np.float32)
    flat = rgb.reshape(-1, 3)
    # Найближчий колір палітри для кожного пікселя; змішуємо, а не замінюємо, щоб акварель лишалась живою
    d = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
    nearest = pal[d.argmin(1)]
    return (flat * (1 - blend) + nearest * blend).reshape(rgb.shape)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--size", type=int, default=512, help="довша сторона, px (для іконок 128)")
    ap.add_argument("--palette", type=Path, help="palette.json для м'якого підтягування кольорів")
    ap.add_argument("--palette-blend", type=float, default=0.35)
    ap.add_argument("--no-key", action="store_true", help="без хромакею (текстури, оверлеї)")
    args = ap.parse_args()

    img = Image.open(args.input).convert("RGBA")
    arr = np.asarray(img).astype(np.float32)
    rgb = arr[..., :3].copy()
    alpha = arr[..., 3] / 255

    if not args.no_key:
        alpha = chroma_key(rgb, alpha)
        despill(rgb, edge_band(alpha))
        alpha = erode_feather(alpha)
        x0, y0, x1, y1 = crop_box(alpha)
        rgb = rgb[y0:y1, x0:x1]
        alpha = alpha[y0:y1, x0:x1]

    if args.palette:
        rgb = pull_to_palette(rgb, args.palette, args.palette_blend)

    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    res = Image.fromarray(out, "RGBA")
    k = args.size / max(res.size)
    if k != 1:
        res = res.resize((max(1, round(res.width * k)), max(1, round(res.height * k))), Image.LANCZOS)

    dst = Path(args.output).with_suffix(".webp")
    dst.parent.mkdir(parents=True, exist_ok=True)
    res.save(dst, "WEBP", quality=90, method=6)
    print(f"{dst} {res.width}x{res.height}")


if __name__ == "__main__":
    main()
